# W1 — review round 1 fixes (lane A, `hour-tracking/server`)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`, branch `hour-tracking/server`.
Local stack: the program's own `patina-hours` project — Postgres `127.0.0.1:54422`. The shared 54322 stack was never touched.

Migrations were edited **in place** (unmerged, never pushed to Strata — the `db push` authorization does not exist in this session). No "fix" migration was added; no number moved.

---

## Disposition

| ID | Severity | Disposition | Where |
|---|---|---|---|
| **W1-R1-01** | blocker | **FIXED** | `supabase/migrations/00599_resolve_time_rate_cents.sql` — relationship ASSERT 1 at `:134-152`, RPC-boundary role validation ASSERT 3 at `:170-196`; postconditions `:334-346`. Tests: `time_rate_resolution_test.sql` case **(l)**. |
| **W1-R1-02** | blocker | **FIXED** | `00601_classifier_rate_resolver.sql` — the non-billable branch at `:185-202` preserves `OLD.hourly_rate_cents` / `OLD.rate_source` on a bound row; postcondition `:432-435`. Test: case **(j)**. |
| **W1-R1-03** | blocker | **FIXED** | `00601:123-132` — delta 1 validates only `TG_OP = 'INSERT' OR NEW.rate_role IS DISTINCT FROM OLD.rate_role`; postcondition `:436-439`. Test: case **(k)**. |
| **W1-R1-04** | major | **FIXED (option 2 — documented + asserted, ruling owed)** | `00601` banner `:35-50`; `plan-v2.md` §2 `00601` row + Done-when #4; new **owed ruling HT-6-b** in `rulings.md`. Test: case **(c4)/(c5)** assert the row is NOT promotable. |
| **W1-R1-05** | major | **FIXED (option a — the designer leg is admitted)** | `00599:154-168` ASSERT 2 gains `v_designer_id IS DISTINCT FROM auth.uid()`; banner `:56-70`. Test: case **(m)**, which also pins the narrowing that *does* stand. |
| **W1-R1-06** | major | **FIXED** | `00598_studio_member_rates.sql` — `close_prior_studio_member_rate` `:101-112` closes every row whose span contains the new start; postcondition. Test: `studio_member_rates_test.sql` case **(g)** + new **g5/g6**. |
| **W1-R1-07** | minor | **FIXED (fallback added, so the banner's claim is now true)** | `00599:246-265` — tier 1 carries the classifier's single-card fallback. Test: case **(j0b)** compares the resolver's answer to the stored row on a one-card authority. |
| **W1-R1-08** | minor | **FIXED (guard, not policy narrowing)** | `00598` — new `guard_studio_member_rate_history()` + `aaa_guard_studio_member_rate_history_trg`. A closed row is frozen outright; identity/authorship frozen on the open one. Test: new case **(h)**, per role. |
| **W1-R1-09** | minor | **FIXED** | `00598` — `studio_member_rates_admin_insert` WITH CHECK gains the `organization_members` EXISTS (active, non-guest). Test: new case **(i)**; case **(d)** rewritten. |
| **W1-R1-10** | minor | **FIXED** | `00600_time_entry_rate_provenance.sql` — the `aac_` comment and the `rate_role` column comment now both say the column is caller-suppliable on INSERT and immutable afterwards. |
| **W1-R1-11** | minor | **FIXED** | `00599` tier 2 — `(p_at AT TIME ZONE 'UTC')::date`, choice recorded in the banner; postcondition pins it. |
| **W1-R1-12** | note | **FIXED (ratified)** | `plan-v2.md` §0.7 now states the 2-refusals-2-discards shape outright, with `00412:283` as the reason `billing_state` cannot be refused. |
| **W1-R1-13** | note | **FIXED** | `rulings.md` HT-41's ruled text amended to name the `(rate_source, rate_role)` pair. |
| **W1-R1-14** | note | **ACCEPTED, NOT FIXABLE IN THIS LANE** | Recorded as a blockquote above `plan-v2.md` §2's portal-files table: W1 is not passable until lane B lands and Done-when #3/#5 are re-run with `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`. **Orchestrator action: dispatch lane B.** |
| **W1-R1-15** | note | **FIXED** | `plan-v2.md` §2's "existing, must stay green" row now says commercial green is **not** the classifier gate and names `time_rate_resolution_test.sql` as the sole one. That file grew from 9 to 14 cases. |
| **W1-R1-16** | note | **FIXED** | `time_unbilled_view_repair_test.sql` — the disabled-trigger arm is kept, and a sibling row is written through the **live** path by a studio member with a `studio_member_rates` row; new asserts `live0`, `live1`, `b5`, and `a2` now expects 3 rows. |
| **W1-R1-17** | note | **FIXED** | `00598` — `updated_at` column + `public.update_updated_at_column()` trigger (named to sort after the freeze guard, so a refused edit stamps nothing); postcondition. |

**Skipped / disputed: none.** Every finding was accepted. Two were fixed by the documentation arm the finding itself offered (W1-R1-04, W1-R1-12) and one is a dispatch item (W1-R1-14).

---

## Two decisions worth naming

**W1-R1-01 vs W1-R1-03 conflict, resolved.** W1-R1-01 asks the resolver to validate `p_rate_role` itself; W1-R1-03 says validating a recorded role on every fire freezes the row. Both cannot hold if the resolver validates unconditionally, because `00601` passes `NEW.rate_role` on **every** classifier fire. `current_user` cannot discriminate (the resolver is itself `SECURITY DEFINER` owned by `postgres`, so `current_user` is always `postgres` inside it), so the resolver validates only when `pg_catalog.pg_trigger_depth() = 0` — a direct RPC call. Inside a trigger, `00601` delta 1 owns validation and validates only a new pick. Both findings' measured bugs are closed, and both are pinned by tests.

**W1-R1-06 vs W1-R1-08 conflict, resolved.** The repaired close must UPDATE rows that are already closed; the new freeze refuses exactly that for non-`postgres` callers. `close_prior_studio_member_rate` is therefore now `SECURITY DEFINER` (bounded: it runs only from its own BEFORE INSERT trigger, touches only the `(studio_id, user_id)` pair the inserted row names, `EXECUTE` is revoked from every role, and if the INSERT then fails `WITH CHECK` the whole statement rolls back). The freeze uses the `00412:2354` `current_user = 'postgres'` idiom. The UPDATE **policy** was deliberately not narrowed to the open row: a silent zero-row no-op is a worse answer to an owner than a raise.

---

## Every new assert was proved to fail against the pre-fix code

Each probe ran the **committed (pre-fix)** function body from `git show HEAD:<migration>` inside a transaction, then the new test body, then rolled back.

| Assert | Pre-fix result |
|---|---|
| `studio_member_rates` **g5** | `ERROR: FAIL g5 (W1-R1-06): … must be re-closed at the new start - 1 (CURRENT_DATE - 11), got 2026-09-10` — the overlap. |
| `time_rate_resolution` **j1** | `ERROR: FAIL j1 (W1-R1-02): a non-billable toggle must not re-price a BOUND hour … got 20000 / authority` — the signed $300/h hour re-priced. |
| **k** (W1-R1-03) | `ERROR: rate_role vendor is not a role this member holds on the project` — the member's own duration correction refused after the seat was removed. |
| **l1** (W1-R1-01) | `ERROR: FAIL l1 … the call returned 25000` — the stranger pulled the signed `Lead designer` card out of the GRANTed resolver. |
| **m** (W1-R1-05) | `ERROR: resolve_time_rate_cents: only a studio owner or admin may resolve another member's rate` — the project designer's correction refused. |

---

## Gate output

```
supabase db reset                         → clean replay, all 00595–00601 applied, no errors
python3 scripts/generate-legacy-grants.py → baseline + 2609 replayed statements
                                            (00598's new REVOKE on guard_studio_member_rate_history)

scripts/run-sql-tests.sh -d supabase/tests/commercial -H 127.0.0.1 -p 54422 -k supabase/tests/KNOWN_FAILURES.md
  total 16 · green 10 · expected-fail 6 · unexpected-fail 0 · effective-green 16/16
scripts/run-sql-tests.sh -d supabase/tests/billing   …
  total  6 · green  6 · expected-fail 0 · unexpected-fail 0 · effective-green  6/6
scripts/run-sql-tests.sh -d supabase/tests/rls       …
  total 26 · green 24 · expected-fail 2 · unexpected-fail 0 · effective-green 26/26
scripts/run-sql-tests.sh -d supabase/tests/field     …
  total  6 · green  5 · expected-fail 1 · unexpected-fail 0 · effective-green  6/6

pnpm db:generate                          → packages/supabase/src/database.types.ts,
                                            only delta vs HEAD = studio_member_rates.updated_at
                                            (stable across two regens; committed)
pnpm --filter @patina/supabase type-check       → tsc --noEmit, clean
pnpm --filter @patina/designer-portal type-check → tsc --noEmit, clean
pnpm --filter @patina/designer-portal test      → 573 suites / 7260 tests passed
pnpm --filter @patina/designer-portal lint      → 0 errors, 201 warnings (all pre-existing)
pnpm --filter @patina/admin-portal build        → succeeded (the type gate after a packages/* edit)
```

KNOWN_FAILURES counts are **unchanged** (commercial 6, rls 2, field 1) — nothing was added to the allowlist.

`supabase/config.toml` was never staged, never edited.

---

## Owed to the orchestrator

1. **Dispatch W1 lane B** (W1-R1-14), then re-run Done-when #3 and #5 in live data mode.
2. **Rule HT-6-b** (W1-R1-04) — non-promotable as shipped, or a promotion arm inside the countersign ceremony.
3. The `plan-v2.md` and `rulings.md` edits live in the **main checkout's untracked `artifacts/` tree** (`/Users/kody/Code/patina-merged/artifacts/hour-tracking-2026-09-11/`), as the brief specified. No git command was run in the main checkout — committing that tree is the orchestrator's.
