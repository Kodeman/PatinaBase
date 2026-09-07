#!/usr/bin/env python3
"""Regenerate supabase/seed/00-legacy-grants.sql.

Supabase flipped platform defaults on 2026-05-30: new local stacks no longer
auto-grant table/function privileges to anon/authenticated at object creation,
which breaks every migration written under the legacy defaults (42501s all
over). Worse, the migrations' deliberate `REVOKE`s are creation-order no-ops
under the new defaults, so the final ACL state cannot be reconstructed from
the database alone — the migration TEXT is the only source of truth.

This script emits a seed that (1) restores the legacy blanket baseline on all
existing public objects, then (2) replays every top-level GRANT/REVOKE
statement from supabase/migrations/*.sql in order, so every deliberate
narrowing lands exactly as the migration author wrote it.

Run it whenever migrations add new GRANT/REVOKEs (or just before debugging a
fresh-stack permission failure):

    python3 scripts/generate-legacy-grants.py

The seed runs first in [db.seed] sql_paths on every local `supabase db reset`
and never executes on prod.
"""

from __future__ import annotations

import glob
import re
from collections.abc import Iterator
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "supabase" / "seed" / "00-legacy-grants.sql"

# Postgres' own tag rule: an identifier, or nothing at all for `$$`. Spelling
# it `[A-Za-z_]*` (as this script did) misses `$steps2$` and friends, leaving
# those bodies unstripped for anything they might one day contain.
DOLLAR_OPEN = re.compile(r"\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$")
# A replayable ACL statement must begin a SQL statement. Without the boundary,
# the matcher splits `ALTER DEFAULT PRIVILEGES ... REVOKE ...` at its nested
# REVOKE subcommand and emits an invalid standalone statement into the seed.
# IGNORECASE because SQL is: migrations that spell the keyword `grant` are as
# real as the ones that shout it, and matching only the shouted form silently
# dropped 49 statements across 24 migrations.
STMT = re.compile(
    r"(?:(?<=;)|\A)\s*(?:GRANT|REVOKE)\s[^;]*;",
    re.DOTALL | re.IGNORECASE,
)
DROP_FN = re.compile(
    r"DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?([A-Za-z_.\"]+\s*\([^)]*\))", re.IGNORECASE
)
ON_FN = re.compile(r"ON\s+FUNCTION\s+([A-Za-z_.\"]+\s*\([^)]*\))", re.IGNORECASE)
ON_FN_HEAD = re.compile(r"\bON\s+FUNCTION\s+", re.IGNORECASE)
# The characters Postgres allows inside an unquoted identifier. The target-list
# scanner needs both edges of the FROM/TO terminator, not just the trailing one:
# `public.find_products_similar_to(uuid, integer)` ends in `to` immediately
# before `(`, so a trailing-only `\b` matches mid-identifier and the scan
# truncates the target list. Every function whose name ends in `to` or `from`
# would silently keep its whole multi-function statement.
IDENT_CHARS = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$")
TERMINATOR = re.compile(r"(?:FROM|TO)\b", re.IGNORECASE)


def scan_function_targets(stmt: str) -> tuple[str, list[str], str] | None:
    """Read `… ON FUNCTION a(…), b(…) FROM …;` into `(head, targets, tail)`.

    Returns None only when there is no readable target list at all (a table
    grant, or a statement whose FROM/TO terminator this scanner never finds).
    A target is returned exactly as written — including the bare `f` form
    Postgres allows when a name is unambiguous — so callers that only need to
    COUNT the functions a statement names do not have to be able to rewrite it.
    """
    head_match = ON_FN_HEAD.search(stmt)
    if head_match is None:
        return None
    head = stmt[: head_match.end()]
    rest = stmt[head_match.end() :]

    targets: list[str] = []
    current: list[str] = []
    depth = 0
    i, n = 0, len(rest)
    tail = None
    while i < n:
        ch = rest[i]
        if ch == '"':
            j = i + 1
            while j < n and rest[j] != '"':
                j += 1
            current.append(rest[i : j + 1])
            i = j + 1
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif depth == 0:
            if ch == ",":
                targets.append("".join(current))
                current = []
                i += 1
                continue
            after_identifier = i > 0 and rest[i - 1] in IDENT_CHARS
            keyword = None if after_identifier else TERMINATOR.match(rest, i)
            # A keyword only ends the target list once a complete target has
            # been read — `FROM` cannot appear inside `public.f(uuid)` — and
            # only when it starts an identifier rather than ending one.
            if keyword and "".join(current).strip():
                tail = rest[i:]
                break
        current.append(ch)
        i += 1

    if tail is None:
        return None
    targets.append("".join(current))
    cleaned = [" ".join(t.split()) for t in targets]
    if not all(cleaned):
        return None
    return head, cleaned, " ".join(tail.split())


def split_function_targets(stmt: str) -> list[tuple[str, str]] | None:
    """Split `… ON FUNCTION a(…), b(…) FROM …;` into one statement per function.

    Returns `[(signature_text, statement), …]`, or None when the statement does
    not name a function list this scanner can rewrite safely (a table grant, a
    target written without its argument list) — in which case the caller keeps
    the statement whole, which is the safe direction.

    R31. A migration that names seventeen functions in one REVOKE is one
    statement in the seed, wrapped in a guard that swallows undefined_function;
    the day a LATER migration drops any one of the seventeen, the whole
    statement raises and the guard silently un-hardens the other sixteen. That
    is what happened to 00511's hardening when Wave 2 widened
    sign_design_services_agreement_with_trusted_ip. One function per statement
    means a missing function can only ever cost itself.
    """
    scanned = scan_function_targets(stmt)
    if scanned is None:
        return None
    head, targets, tail = scanned
    if not all("(" in t and t.endswith(")") for t in targets):
        return None
    return [(t, f"{head}{t} {tail}") for t in targets]


def signature(text: str) -> str:
    """Normalize `public.f( uuid , TEXT )` to `public.f(uuid,text)`.

    Deliberately literal: only a signature written the same way in both the
    DROP and the GRANT/REVOKE compares equal. A near-miss keeps the statement,
    which is the safe direction — a replayed statement for a live object is
    correct, while dropping a live one would silently change an ACL.
    """
    name, _, args = text.partition("(")
    args = args.rsplit(")", 1)[0]
    parts = [" ".join(a.split()).lower() for a in args.split(",")] if args.strip() else []
    return f"{' '.join(name.split()).lower()}({','.join(parts)})"


def clean(raw: str) -> str:
    """Drop comments and dollar-quoted bodies in one left-to-right pass.

    Both must go — GRANT text inside a plpgsql body must not replay, and prose
    that merely mentions REVOKE is not a statement — but neither ORDER is safe
    when each is a separate regex sweep. Bodies-then-comments lets a dollar tag
    written in PROSE pair with the real block hundreds of lines below and
    swallow every statement between them (this is what cost 00543 and 00292
    their grants). Comments-then-bodies lets a `--` or `/* */` sitting inside a
    body or a string literal cut the text at a point that is not a comment.
    A scanner that always knows which construct it is inside has no order to
    get wrong.
    """
    out: list[str] = []
    i, n = 0, len(raw)
    while i < n:
        ch = raw[i]

        if raw.startswith("--", i):
            end = raw.find("\n", i)
            if end == -1:
                break
            i = end  # leave the newline: it still separates two statements
            continue

        if raw.startswith("/*", i):
            depth, i = 1, i + 2  # block comments nest in Postgres
            while i < n and depth:
                if raw.startswith("/*", i):
                    depth, i = depth + 1, i + 2
                elif raw.startswith("*/", i):
                    depth, i = depth - 1, i + 2
                else:
                    i += 1
            continue

        if ch == "$":
            opener = DOLLAR_OPEN.match(raw, i)
            if opener:
                close = raw.find(opener.group(0), opener.end())
                i = n if close == -1 else close + len(opener.group(0))
                continue

        if ch == "'":
            # Kept verbatim: a string literal is part of the statement around
            # it. `''` doubles in every string; a backslash escapes only in an
            # E'…' one.
            backslash = i > 0 and raw[i - 1] in "Ee" and (
                i == 1 or not (raw[i - 2].isalnum() or raw[i - 2] == "_")
            )
            j = i + 1
            while j < n:
                if backslash and raw[j] == "\\":
                    j += 2
                elif raw[j] == "'":
                    if raw.startswith("''", j):
                        j += 2
                    else:
                        j += 1
                        break
                else:
                    j += 1
            out.append(raw[i:j])
            i = j
            continue

        if ch == '"':
            j = i + 1
            while j < n:
                if raw[j] == '"':
                    if raw.startswith('""', j):
                        j += 2
                    else:
                        j += 1
                        break
                else:
                    j += 1
            out.append(raw[i:j])
            i = j
            continue

        out.append(ch)
        i += 1
    return "".join(out)


def iter_top_level_acl_statements(
    cleaned_sql: str,
) -> Iterator[tuple[int, str]]:
    """Yield `(position, normalized SQL)` for statement-start GRANT/REVOKE."""
    for match in STMT.finditer(cleaned_sql):
        yield match.start(), " ".join(match.group(0).split())


def extract_statements() -> list[tuple[str, str]]:
    paths = sorted(glob.glob(str(ROOT / "supabase" / "migrations" / "*.sql")))
    cleaned = {path: clean(Path(path).read_text()) for path in paths}

    # A GRANT/REVOKE for a function signature a LATER migration DROPs is dead:
    # by the time this seed replays, the object it names no longer exists.
    # Recording the last position each signature is dropped at lets those
    # statements be omitted rather than emitted as guarded no-ops.
    last_drop: dict[str, tuple[int, int]] = {}
    for index, path in enumerate(paths):
        for m in DROP_FN.finditer(cleaned[path]):
            sig = signature(m.group(1))
            here = (index, m.start())
            if last_drop.get(sig, (-1, -1)) < here:
                last_drop[sig] = here

    out: list[tuple[str, str]] = []
    for index, path in enumerate(paths):
        for position, stmt in iter_top_level_acl_statements(cleaned[path]):
            # Only statements that start with the keyword survive (defensive).
            # Compared upper-cased, since STMT now matches either casing; the
            # statement itself is emitted as its migration wrote it.
            if not stmt.upper().startswith(("GRANT ", "REVOKE ")):
                continue
            pieces = split_function_targets(stmt)
            if pieces is None:
                target = ON_FN.search(stmt)
                if target and last_drop.get(signature(target.group(1)), (-1, -1)) > (
                    index,
                    position,
                ):
                    continue
                out.append((Path(path).name, stmt))
                continue
            for target_text, piece in pieces:
                if last_drop.get(signature(target_text), (-1, -1)) > (index, position):
                    continue
                out.append((Path(path).name, piece))
    return out


def assert_one_function_per_statement(stmts: list[tuple[str, str]]) -> None:
    """R31's invariant, checked on the statements about to be written.

    The split degrades silently — an unreadable target list returns None and
    the caller keeps the whole statement, which replays correctly today and
    un-hardens every neighbour the day one of the named functions is dropped.
    Nothing downstream notices. So the generator refuses to write a seed that
    still carries a multi-function block.
    """
    offenders: list[tuple[str, str]] = []
    for fname, stmt in stmts:
        if ON_FN_HEAD.search(stmt) is None:
            continue
        scanned = scan_function_targets(stmt)
        count = "unreadable" if scanned is None else str(len(scanned[1]))
        if count != "1":
            offenders.append((fname, f"{count} functions: {stmt[:160]}"))
    if offenders:
        detail = "\n  ".join(f"{fname}: {why}" for fname, why in offenders)
        raise AssertionError(
            f"{len(offenders)} statement(s) name more than one function "
            f"(R31 requires one guarded block per function):\n  {detail}"
        )


def main() -> None:
    stmts = extract_statements()
    assert_one_function_per_statement(stmts)
    lines: list[str] = []
    lines.append(
        """-- ═══════════════════════════════════════════════════════════════════════════
-- 00-legacy-grants — GENERATED by scripts/generate-legacy-grants.py. Do not
-- hand-edit; regenerate after adding migrations with GRANT/REVOKE statements.
--
-- Supabase's 2026-05-30 platform-default flip leaves fresh local stacks
-- without the creation-time grants every migration up to the flip relied on
-- (and makes the migrations' deliberate REVOKEs creation-order no-ops). This
-- seed restores the legacy blanket baseline, then replays the migrations'
-- entire top-level GRANT/REVOKE history in order — the final ACL state
-- matches what the old stack (and prod) converged to. Local-only: seeds never
-- run on prod. RLS remains the enforcement layer throughout.
-- ═══════════════════════════════════════════════════════════════════════════

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Legacy creation-time baseline on everything that exists locally.
DO $baseline$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS obj
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  LOOP
    EXECUTE format('GRANT ALL ON TABLE %s TO anon, authenticated, service_role', r.obj);
  END LOOP;
  FOR r IN
    SELECT c.oid::regclass AS obj
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
  LOOP
    EXECUTE format('GRANT USAGE, SELECT, UPDATE ON SEQUENCE %s TO anon, authenticated, service_role', r.obj);
  END LOOP;
  FOR r IN
    SELECT p.oid::regprocedure AS obj, p.prokind
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
  LOOP
    EXECUTE format(
      'GRANT EXECUTE ON %s %s TO anon, authenticated, service_role',
      CASE WHEN r.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END, r.obj);
  END LOOP;
END $baseline$;

-- Legacy defaults for anything created interactively after this seed.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- ── Replay of every top-level GRANT/REVOKE across supabase/migrations/ ──────
-- Statements naming a function signature a later migration DROPs are omitted
-- entirely — the object they address no longer exists by the time this runs.
-- The rest are guarded, so an object dropped some other way is skipped too.
-- A statement naming several functions is emitted ONE FUNCTION PER GUARDED
-- BLOCK (R31): a single missing function inside a shared block raises, and the
-- guard would then swallow the hardening of every other function named beside
-- it.
"""
    )
    for fname, stmt in stmts:
        assert "$g$" not in stmt, f"dollar-tag collision in {fname}: {stmt}"
        lines.append(f"-- {fname}")
        lines.append("DO $g$ BEGIN")
        lines.append(f"  {stmt}")
        lines.append(
            "EXCEPTION WHEN undefined_function OR undefined_table OR undefined_object OR undefined_column THEN NULL;"
        )
        lines.append("END $g$;")
        lines.append("")
    OUT.write_text("\n".join(lines))
    print(f"wrote {OUT} — baseline + {len(stmts)} replayed statements")


if __name__ == "__main__":
    main()
