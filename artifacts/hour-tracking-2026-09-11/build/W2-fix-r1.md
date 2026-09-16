# W2 — lane A (DB) fix round 1

**Finding applied: B1 (blocker), the only blocker/major in `W2-review-r1.md`.** Nothing else in that file was touched — m1–m7 and n1–n6 are minor/note and were left for the orchestrator to rule or schedule.

**Where.** `supabase/migrations/00605_time_entry_admin_write_and_trace.sql`, `supabase/migrations/00606_time_entries_studio_read_narrow.sql`, `supabase/tests/rls/time_entry_admin_write_test.sql`. Edited **in place** (the brief's instruction, and the skill's rule: these four migrations are unapplied on Strata and replay on every `db reset`, and W2's reserved numbers `00604–00607` are all spent — a new file would have had to borrow W3's `00608`). The fix is recorded in both banners, so the amendment is legible without this report.

## What changed

All three new owner/admin policies now key on the studio that **owns the work**:

```sql
USING (public.is_org_admin_or_owner(
         public.project_pricing_studio_id(project_time_entries.project_id)))
```

— `time_entries_owner_admin_update` (USING **and** WITH CHECK), `time_entries_owner_admin_delete`, `time_entries_owner_admin_read`. The plan's predicate ("owner/admin of ANY studio the project's designer actively belongs to") is gone from all four places. Probed live on 54422:

```
 time_entries_owner_admin_delete | d | is_org_admin_or_owner(project_pricing_studio_id(project_id)) |
 time_entries_owner_admin_read   | r | is_org_admin_or_owner(project_pricing_studio_id(project_id)) |
 time_entries_owner_admin_update | w | is_org_admin_or_owner(project_pricing_studio_id(project_id)) | <same>
```

Also changed, because the fix required it:

- **The `NOT LIKE '%studio_id%'` postconditions in both files would have failed** on the new qual — `project_pricing_studio_id` contains the substring. They now assert the thing §0.13 actually forbids: `regexp_replace(qual,'project_pricing_studio_id','','g') NOT LIKE '%studio_id%'` (no **column** key), plus a positive `LIKE '%project_pricing_studio_id%'` so a later hand cannot quietly key it back on the designer's membership set. 00605's loop now also reads `polwithcheck`, which it never did.
- **00605 carries a measured fail-closed assert**: it impersonates a random real `sub` (so `is_org_admin_or_owner`'s `auth.uid() IS NOT NULL` conjunct is not what answers) and asserts `is_org_admin_or_owner(NULL)` is false. That is the property §0.13's reasoning turns on, and without the impersonation the assert would have been a no-op of the kind review finding n1 describes.
- **Both banners** state the two things the finding asked for: (i) §0.13 forbids the `projects.studio_id` **column** because a legacy NULL **widens**, whereas `is_org_admin_or_owner(NULL)` = false and so fails **closed**; (ii) the trade — an owner of a legacy NULL-studio project with an ambiguous designer tier loses her studio read until she stamps the project, which is the repair HT-3-a step 3 already asks of her. 00605's old "ONE INTERACTION, STATED" paragraph (the RLS-vs-resolver divergence) is **deleted**: RLS and the resolver now key on the same studio, which dissolves W2-impl finding 5 and review note n3's second half.
- **New test case (i)** in `time_entry_admin_write_test.sql` (+ an eighth user, an `AW Attacker` studio, her owner seat). It asserts the attacker's seat INSERT **succeeds** (i2 — that is her one move, and if it ever stops succeeding the case is measuring nothing), then that she still reads **0 rows** (i3), cannot UPDATE (i4), cannot DELETE (i5), the hour survives (i6), **no audit row** is written by the refused writes (i7 — so no permanently-readable `old_values` copy of the notes and rate), and that `project_pricing_studio_id` still answers `AW Studio` (i8).

## Evidence: reproduced, then closed

Against the **unfixed** branch DB, the new case failed exactly where the finding says:

```
ERROR: FAIL i3 (B1, the leak this case exists for): ... rows = 1
```

(i4 passed even unfixed — the attacker's UPDATE raised from 00601's resolver rather than being allowed, which is precisely the "loud refusal" the old banner described. The **read** was the open door.)

After the edit and a clean `supabase db reset`, every case green:

```
case (a) passed — the adjust and its trace together.
cases (b) and (c) passed.   cases (d) and (e) passed.
case (f) passed.            case (g) passed — the lock is where it was.
case (h) passed.            case (i) passed — the self-grant buys nothing.
```

## Two measured facts the orchestrator should see (neither is a code change)

**1. A residue survives, and it is W1's, not a second surface.** On a **legacy `projects.studio_id IS NULL`** project whose designer holds **no employer seat anywhere** (a sole proprietor — she only *owns* her studio), the attacker's seat becomes that designer's single EMPLOYER-tier candidate and therefore the pricing studio, so she gains the read after all. Measured on 54422 (fixture: sole-proprietor designer, project stamped then cleared to NULL as postgres):

```
RESIDUE legacy-NULL sole-proprietor: attacker rows before=0 after=1 ; pricing studio now=<attacker's org>
```

This is **coextensive with the W1 pricing residue** already pinned in 00599's banner and `time_rate_resolution_test.sql` cases (ad-i)/(ad-ii)/(af) — after the fix the read/write half is no longer a *second*, W2-only capability. Closing it outright means keying on **step 1 alone** (`projects.studio_id`), which costs **every** legacy NULL-studio owner her studio read until she stamps the project — a wider version of the trade the banner already accepts. That is a ruling, not a fix, so it is flagged here and stated in 00605's banner rather than decided. I did **not** add a test asserting the leak as expected behaviour.

**2. The fail-closed direction is real, and it is an availability cost.** Where the designer *does* hold an employer seat, the attacker's INSERT makes the tier ambiguous, so the pricing studio becomes NULL and **everyone** loses the studio read — including the legitimate employer-studio owner. Measured:

```
FAIL-CLOSED legacy-NULL employer-seated: employer owner before=1 after=0 ; attacker after=0 ; pricing=NULL
```

Confidentiality is never widened (the point of the fix), but one stranger's INSERT can blind a real owner to a legacy unstamped project's hours until she stamps it. Worth a ruling on whether `organization_members` INSERT deserves a consent gate of its own — which is outside this program and, per the finding, not available as W2's fix (that policy is 00484-registered).

## Gates re-run (all on this program's stack: API 54421, Postgres 127.0.0.1:54422)

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean** — `Finished supabase db reset on branch main.`; every `DO $postcondition$` passed, including the new asserts |
| `run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **7 / 7 green** |
| `run-sql-tests.sh -d …/supabase/tests/commercial -H 127.0.0.1 -p 54422` | **10 green / 16**, 6 unexpected-fail — **identical to W1's and the reviewer's baseline**; spot-checked `trade_scope_test.sql`, which still aborts on `design services agreement … not found or access denied`. Unchanged by this fix |
| `run-sql-tests.sh -d …/supabase/tests/rls -f time_entry -H 127.0.0.1 -p 54422` | **2 / 2 green** (incl. the new case (i)) |
| `run-sql-tests.sh -d …/supabase/tests/rls -f hours -H 127.0.0.1 -p 54422` | **2 / 2 green** |
| `python3 scripts/generate-legacy-grants.py` | re-run; `supabase/seed/00-legacy-grants.sql` **byte-identical** (no GRANT/REVOKE changed — policies only) |
| `db:generate` + `git diff --exit-code packages/supabase/src/database.types.ts` | **clean** (no column, type or function signature moved) |
| `pnpm --filter @patina/supabase type-check` | clean |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/admin-portal build` | **succeeds** (the repo's strictest gate) |

Program-rule re-check on the diff: no flag; no DML, so no backfill; no rate-writing path; `project_time_entries` untouched as a table; no index touched (the one running-timer slot stands); `guard_invoiced_time_entry` untouched and case (g) still proves it raises for the admin; no `notes` anywhere near a rollup return; the 00484 quartet's four names, commands, role sets and three write quals unchanged (00606's own postconditions (b)/(c) still pass), so the contract row at `public_rpc_authorization_contract_test.sql:533-548` needs no edit — only the three **new** names moved, and none of them is registered.

## Not done / not verified

- **Only B1.** m1 (`updated_by` forgeable on INSERT), m2 (no caller assert on `project_pricing_studio_id`), m3, m4 (the unindexable studio scope — the new policy now calls the same per-row DEFINER function, so m4's cost note applies to the policy too and is worth the orchestrator's attention alongside W4's own `studio_id` column), m5, m6, m7, n1–n6 are untouched.
- No prod anything. Nothing reached Strata; every command ran against 54422. W1's constraint stands: W1 must not reach Strata ahead of 00606.
- Lane B (the scope lens and the rest of §3's portal work) is phase 2 and was not touched; `pnpm --filter @patina/designer-portal test` / `lint` / the live-mode e2e line were outside this fix's gate list.
- `supabase/config.toml` stays skip-worktree'd and is not in the commit.
