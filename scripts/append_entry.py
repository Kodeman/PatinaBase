#!/usr/bin/env python3
"""Append a new batch of entries to docs/design/the-document/DECISIONS.md.

This is the sanctioned way to append to DECISIONS.md — hand-numbering an
entry or hand-editing the integrity footer is forbidden by the log's own
append-only discipline. Pair with scripts/workstream_state.py, which tells
you what the next ids ARE before you draft a block for this script to
append.

Usage:
    python3 scripts/append_entry.py <repo_root> --block <FILE> [--check]
    python3 scripts/append_entry.py <repo_root> [--check] < block.md
    python3 scripts/append_entry.py --selftest

<FILE> (or stdin, if --block is omitted) is exactly the entries to add:
one or more `##`/`###` headings of the form `<PREFIX><n> · <title>`, each
already carrying its REAL id (get those from workstream_state.py — never
hand-number). Refusal order:

  1. leftover placeholders ({a}/{b}/{c}/{d}, or a literal R{/O{/I{)
  2. a heading line with no [ROI]<n> id to extract
  3. ids that are not exactly consecutive ascending per prefix, starting
     at (current file max for that prefix) + 1 — no gaps, no stale ids
  4. the file's last non-blank line is not a valid integrity footer (the
     corruption alarm — never append on top of a file in an unknown state)

On success: the block is appended verbatim (rstripped), followed by a
blank line and a freshly composed integrity footer. The existing footer —
and everything above it — is never touched; historical footers are
permanent trailers. The new footer is double-checked by re-scanning the
actual post-append content and comparing it against what the block claims
to have added; any mismatch aborts WITHOUT writing.

--check simulates the whole thing (including footer computation) without
writing to disk — prints the footer that WOULD be written, then exits
0/1 exactly as a real run would.
"""

from __future__ import annotations

import argparse
import re
import sys
import tempfile
from pathlib import Path

# workstream_state.py lives alongside this file — reuse its scanner rather
# than duplicating the regex (they must never drift apart).
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
import workstream_state as ws  # noqa: E402  (path shim must precede this)

PLACEHOLDER_RE = re.compile(r"\{[abcd]\}|[ROI]\{")
HEADING_ID_RE = re.compile(r"([ROI])(\d+)")


class Refusal(Exception):
    """Any refusal case. Message is printed to stderr; caller exits 1."""


def check_placeholders(block: str) -> None:
    match = PLACEHOLDER_RE.search(block)
    if match:
        raise Refusal(
            f"block contains a leftover placeholder ({match.group(0)!r}) — "
            "substitute real ids (from workstream_state.py) before appending"
        )


def extract_block_ids(block: str):
    """First (prefix, n) token on each heading line, in document order."""
    ids = []
    for line in block.splitlines():
        if not ws.HEADING_RE.match(line):
            continue
        match = HEADING_ID_RE.search(line)
        if not match:
            raise Refusal(f"heading line has no [ROI]<n> id to extract: {line!r}")
        ids.append((match.group(1), int(match.group(2))))
    if not ids:
        raise Refusal("block contains no ##/### heading lines — nothing to append")
    return ids


def check_consecutive(block_ids, file_maxima: dict) -> None:
    """Per prefix present in block_ids, ids must be exactly consecutive
    ascending starting at file_maxima[prefix] + 1 — no gaps, no stale ids,
    in the order they appear in the block."""
    by_prefix: dict = {}
    for prefix, n in block_ids:
        by_prefix.setdefault(prefix, []).append(n)
    for prefix, ns in by_prefix.items():
        start = file_maxima.get(prefix, 0) + 1
        expected = list(range(start, start + len(ns)))
        if ns != expected:
            raise Refusal(
                f"{prefix} ids in block are {ns}, expected exactly consecutive "
                f"ascending {expected} (file max is "
                f"{prefix}{file_maxima.get(prefix, 0)} -> next is {prefix}{start})"
            )


def compose_footer(block_ids) -> str:
    """*Entries add: <groups> · last id = <ID>* — consecutive same-prefix
    runs (in document order) collapse to an en-dash range; groups join
    with ' · '; last id is the batch's final entry in document order."""
    groups = []
    i = 0
    while i < len(block_ids):
        prefix, start = block_ids[i]
        j = i
        while (
            j + 1 < len(block_ids)
            and block_ids[j + 1][0] == prefix
            and block_ids[j + 1][1] == block_ids[j][1] + 1
        ):
            j += 1
        end = block_ids[j][1]
        groups.append(f"{prefix}{start}" if end == start else f"{prefix}{start}–{prefix}{end}")
        i = j + 1
    last_prefix, last_n = block_ids[-1]
    return f"*Entries add: {' · '.join(groups)} · last id = {last_prefix}{last_n}*"


def run(repo_root: Path, block: str, check: bool) -> int:
    try:
        check_placeholders(block)
        block_ids = extract_block_ids(block)

        path = ws.decisions_path(repo_root)
        if not path.is_file():
            raise Refusal(f"{path} not found")
        original = path.read_text()

        file_maxima = ws.scan_heading_ids(original)
        check_consecutive(block_ids, file_maxima)

        footer = ws.last_nonblank_line(original)
        if not footer or not ws.FOOTER_RE.match(footer):
            raise Refusal(
                "file's last non-blank line is not a valid integrity footer — "
                f"refusing to append to a possibly-corrupted file (got: {footer!r})"
            )

        new_footer = compose_footer(block_ids)

        block_clean = block.rstrip("\n")
        new_content = original.rstrip("\n") + "\n\n" + block_clean + "\n\n" + new_footer + "\n"

        # The corruption alarm: re-scan the actual post-append content and
        # confirm it agrees with what the block claims to have added. This
        # catches insertion bugs (bad splice point, mangled headings) that
        # the upstream checks above wouldn't see.
        post_maxima = ws.scan_heading_ids(new_content)
        expected_maxima = dict(file_maxima)
        for prefix, n in block_ids:
            expected_maxima[prefix] = max(expected_maxima.get(prefix, 0), n)
        mismatches = {
            prefix: (expected_maxima[prefix], post_maxima.get(prefix))
            for prefix in expected_maxima
            if post_maxima.get(prefix) != expected_maxima[prefix]
        }
        if mismatches:
            raise Refusal(
                "post-append re-scan does not match expected maxima "
                f"(prefix: (expected, actual)) = {mismatches} — aborting without writing"
            )

        if not check:
            path.write_text(new_content)

        print(new_footer)
        return 0
    except Refusal as exc:
        print(f"REFUSED: {exc}", file=sys.stderr)
        return 1


# ── selftest ──────────────────────────────────────────────────────────────


def _expect_refusal(fn, *args, **kwargs) -> bool:
    try:
        fn(*args, **kwargs)
        return False
    except Refusal:
        return True


def selftest() -> int:
    failures = []
    file_maxima = {"R": 98, "O": 7}

    # 1. Placeholder refusal (both brace styles named in the brief).
    if not _expect_refusal(check_placeholders, "### R{a} · title\n\nbody\n"):
        failures.append("placeholder R{a}: expected Refusal, got none")
    if not _expect_refusal(check_placeholders, "### O{d} · title\n\nbody\n"):
        failures.append("placeholder O{d}: expected Refusal, got none")

    # 2. Gap refusal: R99, R101 skips R100.
    if not _expect_refusal(check_consecutive, [("R", 99), ("R", 101)], file_maxima):
        failures.append("gap (R99,R101): expected Refusal, got none")

    # 3. Stale id refusal: R98 already exists in the file.
    if not _expect_refusal(check_consecutive, [("R", 98)], file_maxima):
        failures.append("stale id (R98): expected Refusal, got none")

    # A genuinely valid consecutive batch must NOT be refused.
    try:
        check_consecutive([("R", 99), ("R", 100), ("R", 101), ("O", 8)], file_maxima)
    except Refusal as exc:
        failures.append(f"valid consecutive batch unexpectedly refused: {exc}")

    # 4. Footer composition: R99,R100,R101,O8 -> "R99–R101 · O8", last id O8.
    footer = compose_footer([("R", 99), ("R", 100), ("R", 101), ("O", 8)])
    expected_footer = "*Entries add: R99–R101 · O8 · last id = O8*"
    if footer != expected_footer:
        failures.append(f"footer composition: expected {expected_footer!r}, got {footer!r}")

    # 5. End-to-end: missing/invalid footer refused via run(), file untouched.
    with tempfile.TemporaryDirectory() as tmp:
        tmp_root = Path(tmp)
        decisions_dir = tmp_root / "docs" / "design" / "the-document"
        decisions_dir.mkdir(parents=True)
        decisions_file = decisions_dir / "DECISIONS.md"
        no_footer_content = "# fixture\n\n### R98 · prior\n\nbody\n"  # no footer line
        decisions_file.write_text(no_footer_content)
        rc = run(tmp_root, "### R99 · new\n\nbody\n", check=True)
        if rc != 1:
            failures.append(f"missing-footer file: expected exit 1, got {rc}")
        if decisions_file.read_text() != no_footer_content:
            failures.append("missing-footer file: refused run() still wrote to disk")

    # 6. End-to-end: a valid --check run computes the right footer and
    # never writes; a valid non-check run writes exactly once.
    with tempfile.TemporaryDirectory() as tmp:
        tmp_root = Path(tmp)
        decisions_dir = tmp_root / "docs" / "design" / "the-document"
        decisions_dir.mkdir(parents=True)
        decisions_file = decisions_dir / "DECISIONS.md"
        base_content = (
            "# fixture\n\n### R98 · prior\n\nbody\n\n### O7 · prior\n\nbody\n\n"
            "*Entries add: R98 · O7 · last id = O7*\n"
        )
        decisions_file.write_text(base_content)
        block = "### R99 · new\n\nbody\n\n### O8 · new open\n\nbody\n"

        rc = run(tmp_root, block, check=True)
        if rc != 0:
            failures.append("valid --check batch was unexpectedly refused")
        if decisions_file.read_text() != base_content:
            failures.append("--check mode wrote to disk")

        rc = run(tmp_root, block, check=False)
        if rc != 0:
            failures.append("valid real-run batch was unexpectedly refused")
        final = decisions_file.read_text()
        expected_real_run_footer = "*Entries add: R99 · O8 · last id = O8*"
        if not final.rstrip("\n").endswith(expected_real_run_footer):
            failures.append(f"real run did not end with expected footer; got tail: {final[-80:]!r}")
        if "### R99 · new" not in final or "### O8 · new open" not in final:
            failures.append("real run did not append the block content")
        if not final.startswith(base_content.split("*Entries add")[0]):
            failures.append("real run altered content above the original footer")

    if failures:
        print("SELFTEST FAILED:")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print("SELFTEST OK")
    return 0


def main(argv) -> int:
    if "--selftest" in argv:
        return selftest()

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repo_root")
    parser.add_argument("--block", help="path to the block file (default: read stdin)")
    parser.add_argument("--check", action="store_true", help="simulate without writing")
    args = parser.parse_args(argv)

    block = Path(args.block).read_text() if args.block else sys.stdin.read()
    return run(Path(args.repo_root).resolve(), block, args.check)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
