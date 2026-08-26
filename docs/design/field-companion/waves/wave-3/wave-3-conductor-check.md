# Wave 3 — conductor's SQL check (evidence of record)

Run by the Wave 3 conductor directly, read-only against the local stack, to settle a
disagreement in the record between an earlier conductor diagnosis ("zero SQL evidence")
and the Task 32 implementer's report ("128/128 from the worktree").

**The implementer's numbers are correct. The conductor's diagnosis was wrong.**

## Provenance

- Run from the **worktree**: `/Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w3`
- Branch `feat/field-companion-w3`, HEAD `3e915c016`
- Under the atomic DB lock (`mkdir /tmp/patina-local-supabase-db.lock.d`, left empty, `rmdir` after)
- Local stack only — `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Nothing touched Strata.

## 00532 is applied locally

```
select version from supabase_migrations.schema_migrations where version like '00532%';
 -> 00532

-- visit + suggestion columns on field_captures
 -> 7   (visit_id, visit_kind, visit_kit, suggested_project_id,
         suggested_project_room_id, suggestion_basis, suggestion_confidence)

select tgname from pg_trigger where tgname='trg_field_captures_visit_projection';
 -> trg_field_captures_visit_projection
```

## Filtered run — `scripts/run-sql-tests.sh -f field_capture_visit`

```
total:             1
green:             1
expected-fail:     0
unexpected-fail:   0
effective-green:   1 / 1
```
Exit 0. The filter matches `supabase/tests/field/field_capture_visit_test.sql` — the wave's own
test — and it passes.

## Full run — `scripts/run-sql-tests.sh`

```
total:             128
green:             106
expected-fail:     22   (documented in supabase/tests/KNOWN_FAILURES.md)
unexpected-fail:   0
effective-green:   128 / 128
```
Exit 0.

## Reconciliation against main's 127

128 = 127 + 1. The one extra file is `field_capture_visit_test.sql`, which exists **only on this
branch**. 106 = 105 + 1 (the new test is green, not one of the 22 known failures). The documented
expected-fail set is unchanged at 22, and unexpected-fail is 0 in both trees. The delta is fully
explained.

## ⚠ Superuser caveat

`run-sql-tests.sh` connects as **`postgres` (superuser)**. A green run proves the SQL **logic** —
RPCs, triggers, constraints. It does **not** test RLS, which a superuser connection bypasses
entirely. Nothing here may be read as "row-level security was verified."

## What the earlier disagreement actually was

The Task 32 implementer's *first* SQL run was executed from the **main checkout**
(`/Users/kody/Code/patina-merged`, HEAD `75658944b`), which contains neither migration 00532 nor
`field_capture_visit_test.sql`. That run reported `-f field_capture_visit` matching 0 files and a
full total of 127 — both correct *for that tree*, and both meaningless as wave-3 evidence.

The implementer caught this itself and re-ran from the worktree, getting 128. The conductor read the
stale section, ledgered "zero SQL evidence" (R257), and did not notice the self-correction had
already landed. This file is the single authoritative result.
