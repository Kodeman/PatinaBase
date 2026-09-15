# W4 — fix round 1

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`, branch `hour-tracking/server`.
Local stack `patina-hours` (Postgres `127.0.0.1:54422`). One finding, applied.

---

## W4-R1-01 — the HT-23 trace went dark on every internal hour → **FIXED**

**Confirmed before fixing, against the code rather than the report:**

- `public.audit_time_entry_change()` has exactly one definition — `supabase/migrations/00605_time_entry_admin_write_and_trace.sql:216-271` (`grep -rln "CREATE OR REPLACE FUNCTION public.audit_time_entry_change" supabase/migrations/*.sql` → 00605, nothing else). The offending expression is `00605:242`, `v_org := public.project_pricing_studio_id(OLD.project_id);`.
- `public.project_pricing_studio_id` returns NULL for a NULL argument — `00604_time_entry_ledger_view.sql:100-102` (`IF p_project_id IS NULL THEN RETURN NULL; END IF;`).
- `audit_logs`' org read policy carries the `organization_id IS NOT NULL` leg — `00021_user_management_foundation.sql:426-435`; the only other SELECT policy is `"Users can view their audit logs"` (`:422-423`, `user_id = auth.uid()`), i.e. the actor alone.
- The reach is new with W4: `00612_internal_time_policies.sql:130-147` (`internal_time_owner_admin_update` / `_delete`) and `:95-119` (the own-row update/delete) are what let a `project_id IS NULL` row be edited at all.

**Fix — `supabase/migrations/00613_classifier_internal_short_circuit.sql`, new section (5) at `:969-1063`:**

- `public.audit_time_entry_change()` re-created from 00605's body **verbatim** — `diff` of the graft against `00605:216-271` shows exactly two hunks: the changed expression and the extended `COMMENT` string. Nothing else moved.
- The one expression (`:1028-1030`):
  ```sql
  v_org := CASE WHEN OLD.project_id IS NULL THEN OLD.studio_id
                ELSE public.project_pricing_studio_id(OLD.project_id)
           END;
  ```
  A CASE, not a COALESCE — mirroring the ledger CASE the same file already ships at section (3) (`:533-535`), so a project-bearing row's `organization_id` stays byte-identical to 00605's answer.
- 00605 is **not** touched (§0.4 redefine-forward; it is applied on no reachable stack). The trigger is **not** re-created: `CREATE OR REPLACE FUNCTION` leaves `zzzz_audit_time_entry_change_trg` (`00605:273-276`) bound to the same oid.
- `REVOKE ALL ON FUNCTION public.audit_time_entry_change() FROM PUBLIC, anon, authenticated, service_role;` restated with the redefinition → the ACL seed was regenerated (§0.20): `supabase/seed/00-legacy-grants.sql` gains that one statement under an `00613` comment (2639 replayed statements, up from 2633), produced by **the worktree's own** `python3 ./scripts/generate-legacy-grants.py`.

**Lineage, banner:** `00613:23-28` now records the second lineages in one place — `time_entry_ledger 00604 → HERE`, `margin_items 00543 → HERE`, and **`audit_time_entry_change 00605 → HERE`** — and `:30` reads "ONE SHORT-CIRCUIT, and **four** reads that had to learn about it" (was "three"). Delta **(5)** is described at `:108-117`.

**Postcondition (h)** — `00613:1219-1244`, inside the existing `$postcondition$` block (new `v_audit text` declaration at `:1075`):

- `prosrc LIKE '%OLD.studio_id%'` (the fix is present);
- `prosrc LIKE '%project_pricing_studio_id%'` (00605's intent survives in the ELSE leg);
- `zzzz_audit_time_entry_change_trg` exists on `public.project_time_entries`, `NOT tgisinternal`, **and `tgenabled = 'O'`** — enabled, not merely defined, because `00610:108` disables it by name mid-backfill and `:123` re-enables it.

**Test — `supabase/tests/rls/internal_time_test.sql`, new case (i)** (`:588-664`, header index at `:41-50`), the shape `time_entry_admin_write_test.sql` case (a) uses for the project case (§12 risk 4):

- the **ADMIN** (`…002`) adjusts the **AUTHOR**'s (`…003`) internal hour `…b1` from 45 → 30 minutes through `internal_time_owner_admin_update` — 1 row, `duration_minutes = 30`, `updated_by` = the admin (i1–i3: the row's own stamp was never the broken half);
- the **OWNER** (`…001`), assuming her own role so **RLS applies**, reads `audit_logs` for that `resource_id` and sees **exactly 1 row** whose `organization_id` is the studio `…a1`, `action = 'time_entry.updated'`, `user_id` = the admin, `old_values.duration_minutes = 45` and `new_values.duration_minutes = 30` (i4–i8).

**Negative check (the test bites).** With 00605's original one-line `v_org` restored inside a transaction and the suite replayed, case (i) fails exactly where it should and the rest still passes:

```
psql:supabase/tests/rls/internal_time_test.sql:666: ERROR:  FAIL i4 (HT-23, W4-R1-01): the studio's OWNER must read
exactly ONE trace for the edit her admin made. Zero means organization_id came back NULL and the org read policy's
`organization_id IS NOT NULL` leg hid the row from everyone but the actor …; got 0
```

Restored afterwards — `prosrc LIKE '%OLD.studio_id%'` → `t`, `tgenabled` → `O`.

---

## Gates

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **applied 00595→00620 clean**; 00613's `$postcondition$` block (now including (h)) raised nothing |
| `python3 ./scripts/generate-legacy-grants.py` (worktree copy) | `2639 replayed statements`; diff = the one new `REVOKE` under `-- 00613_…` |
| `scripts/run-sql-tests.sh -d supabase/tests/rls -H 127.0.0.1 -p 54422` | **29 green / 31**, 2 unexpected = `design_requests_test.sql`, `studio_titles_test.sql` — **pre-existing**, documented `supabase/tests/KNOWN_FAILURES.md:114-115`, identical to the W1/W2 baseline. `internal_time_test.sql` **PASS** (cases a–i), `time_entry_admin_write_test.sql` **PASS**, `time_entry_auto_roster_test.sql` **PASS**, `time_entry_studio_stamp_test.sql` **PASS**, `project_hours_total_test.sql` **PASS**, `studio_hours_rollup_test.sql` **PASS** |
| `scripts/run-sql-tests.sh -d supabase/tests/commercial …` | **10 green / 16**, 6 unexpected = the documented countersign/grant family (`authorized_schedule`, `design_services_authority`, `design_services_gap_hardening`, `executed_on_paper`, `trade_rfq`, `trade_scope`) — unchanged baseline |
| `scripts/run-sql-tests.sh -d supabase/tests/billing …` | **8 / 8 green** (incl. `time_entry_ledger_test`, `time_rate_resolution_test`, `time_claim_atomicity_test`, `time_unbilled_view_repair_test`) |
| `pnpm --dir … db:generate` → `git diff --exit-code packages/supabase/src/database.types.ts` | **clean** — no type surface moved (a function body and an ACL, no schema shape) |

**Not re-run, and why:** `deno test … supabase/functions/time-nudges/`, `pnpm --filter @patina/designer-portal type-check`, `… test`, `pnpm --filter @patina/admin-portal build`. This fix changes three SQL files and nothing else (`git status` ⇒ `00613`, `00-legacy-grants.sql`, `internal_time_test.sql`); no TypeScript, Deno or generated type is touched, and `database.types.ts` came back byte-identical.

**Hazard recorded for the orchestrator:** `pnpm db:generate` pipes `supabase gen types` through `>`, so when the CLI fails it **truncates `packages/supabase/src/database.types.ts` to zero bytes** before exiting 1. It failed once here under the Bash sandbox ("Docker Desktop is a prerequisite") and emptied the file; restored with `git checkout --`, then re-run outside the sandbox. Any lane that sees a 37k-line deletion in that file after a failed generate should restore rather than commit.

---

## Commit

`c627f3a25` on `hour-tracking/server`, pushed to `origin/hour-tracking/server` (`e06e775e0..c627f3a25`).
Three explicit pathspecs, `git show --stat` re-read: `00613_classifier_internal_short_circuit.sql` (+144/-1), `supabase/seed/00-legacy-grants.sql` (+6), `supabase/tests/rls/internal_time_test.sql` (+90).

The pre-push hook printed **"Affected verification has advisory failures."** — non-blocking (`patina-hooks.mjs:205-238` runs the affected plan with `strict: false`). Its plan is computed over the **whole branch diff against main**, i.e. every W1/W2/W3 portal and package file this branch already carries, and it names twelve node checks across four portals. This commit's own affected plan carries **zero** node checks: `node scripts/hooks/patina-hooks.mjs plan --base HEAD~1 --head HEAD` → `paths: [00613…sql, 00-legacy-grants.sql, internal_time_test.sql]`, `checks: []`, `node: false`, `database: true`. Nothing in this fix reaches a TypeScript or lint gate.
