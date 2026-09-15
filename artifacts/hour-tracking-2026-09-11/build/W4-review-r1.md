# W4 review — round 1, adversarial (lane A, `00610–00613`)

**clean = false** — 1 major, 0 blockers. Everything else is minor/note.

Reviewer context: separate from the implementer. Branch `hour-tracking/server` @ `e06e775e0`, diffed against `origin/hour-tracking/integration` (`a9841c8de`). Every gate below was re-run by me, not read from `W4-impl.md`. Local stack `patina-hours` (API `54421`, Postgres `54422`) — `pg_postmaster_start_time()` `2026-09-13 07:27Z` after **my own** reset, and unmoved across every run below, so no foreign reset crossed these gates.

---

## Gates I ran

| Gate | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean.** `00610 → 00611 → 00612 → 00613` applied in order (then `00615`, `00620`, the timestamped import), 27 seed files loaded, `Finished supabase db reset`. Every `DO $postcondition$` block in the four files ran without raising. `00614` is absent — it lives on `hour-tracking/edge` (lane D), correct per §11 step 4 |
| `run-sql-tests.sh -d …/supabase/tests/billing` | **8 / 8 green** |
| `run-sql-tests.sh -d …/supabase/tests/commercial` | **10 green / 6 red — baseline unchanged.** All six are in `supabase/tests/KNOWN_FAILURES.md` (five abort inside `_countersign_design_services_agreement_impl` with *"design services agreement … not found or access denied"*, Group 3 lines 97–101; `trade_rfq_test.sql` is the Group 2 `mint_trade_rfq_token` EXECUTE gap, line 69). Counted as unexpected only because the runner resolves its allowlist relative to the invoked directory, not the worktree — same mechanism W2 recorded. I verified each of the six against `KNOWN_FAILURES.md` by name |
| `run-sql-tests.sh -d …/supabase/tests/rls` | **29 green / 2 red.** The two are the documented pair at `KNOWN_FAILURES.md:115-116` (`design_requests_test.sql`, `studio_titles_test.sql`). `internal_time_test.sql` **PASS**; `studio_hours_rollup_test.sql`, `time_entry_admin_write_test.sql`, `time_entry_auto_roster_test.sql`, `time_entry_studio_stamp_test.sql`, `project_hours_total_test.sql`, `project_roster_test.sql`, `people_directory_scope_test.sql` all **PASS** |
| `pnpm --filter @patina/supabase type-check` | pass, no diagnostics |
| `pnpm --filter @patina/designer-portal type-check` | pass, no diagnostics |
| `pnpm --filter @patina/admin-portal build` | pass, exit 0, full route table rendered (the repo's only type-enforcing portal build) |
| `pnpm db:generate` then `git diff --exit-code packages/supabase/src/database.types.ts` | **clean — types in sync** (I regenerated against `54422` myself) |
| `python3 ./scripts/generate-legacy-grants.py` (**the worktree's own copy**, §0.20) then `git diff --exit-code supabase/seed/00-legacy-grants.sql` | **clean — seed in sync**, 2638 replayed statements, matching the report. `grep -lE '^\s*(GRANT\|REVOKE)' supabase/migrations/0061*.sql` → `00611`, `00613` only; the seed carries both under their own comments (`:15789`, `:15795+`) |

**Commit hygiene — clean.** Two commits, Conventional types (`feat(time):`, `test(time):`), 7 files total. `git diff --name-only origin/hour-tracking/integration..hour-tracking/server | grep -Ei 'config.toml|\.env|artifacts/|\.DS_Store'` → nothing. `git ls-files -v | grep '^S'` → `supabase/config.toml` is skip-worktree and unstaged. No stray path, no generated file hand-edited.

**Migration numbers — clean.** `git fetch --all --prune` then `git ls-tree` per ref across **every** ref: `00610–00613` exist on `hour-tracking/server` alone; `00614` on `hour-tracking/edge`; `00615`/`00620` already on integration (W2); the peer program holds `00621–00627`. `00608`/`00609` exist on **no** ref yet (W3 has not minted). Nothing collides.

---

## What I tried to refute, and could not

**The graft is verbatim.** `difflib` of `00601:154`'s function body against `00613:108`'s: 366 → 381 lines, **exactly one hunk**, the nine-line `IF NEW.project_id IS NULL THEN … RETURN NEW;` block. `grep -rln "CREATE OR REPLACE FUNCTION[^(]*classify_project_time_entry_authority"` returns `00412, 00575, 00578, 00601` and nothing after `00613` — the implementer's correction of the brief (`00615` redefines `resolve_time_rate_cents`, not the classifier) is right, verified by reading `00615`. Same check on the other two edits: `time_entry_ledger` against `00604:178` is byte-identical except the `CASE` (and `CREATE VIEW` → `CREATE OR REPLACE VIEW`); `margin_items` against `00543` is byte-identical except `and pte.project_id is not null` plus the view COMMENT. The `aac_` list is `00600:191-192`'s nine columns plus `studio_id`.

**The short-circuit beats a live rate card — measured, because the suite does not prove it (see W4-R1-04).** With a real `studio_member_rates` row (15000¢, author's own, owner-authored), `resolve_time_rate_cents(project, author, now, NULL)` returns `15000 / studio_member`, a billable project hour stores `authorized / 15000 / 15000 / studio_member` — and the internal hour logged by the same member in the same transaction stores `nonbillable / NULL rate / 0 / none / rate_role NULL`. The short-circuit is real, not an artefact of a rate-less fixture.

**Every NOT NULL-assuming consumer still works.** I enumerated all 13 `public` functions whose body mentions `project_time_entries` and probed the live ones with an internal hour present:
- `claim_time_entries(invoice, ARRAY[internal_id, project_id])` → returns **only** the project hour's id; the internal row's `invoice_id` stays NULL.
- `issue_invoice` → runs past both of its `project_time_entries` checks and fails only on `has no line items` (P0001, unrelated).
- `project_unbilled_time` → 0 rows for the project; the internal hour never appears (it is `nonbillable`, and the view filters `billing_state='authorized'`).
- `project_hours_total(project)` → `60 / 60 / 0` — the project hour only.
- `get_project_authority_summary(project)` → returns without error.
- `time_entry_ledger` → the internal hour survives with `project_id NULL`, `project_name NULL`, `studio_id` = its own studio, `amount_cents 0`, `resolved_rate_cents 0`, `is_running t` for a running one. **No `notes` column** (HT-36), `security_invoker` intact.
- `studio_hours_rollup` → I called all five legal scopes (`member`, `project`, `day`, `iso_week`, `activity`); each returns the internal hour's 45 minutes in both `total_minutes` and `internal_minutes`, `billable_cents 0`, and the `project` scope buckets it as `internal` / `Internal`. Still SECURITY INVOKER, still not redefined.
- `margin_items` → 11 columns, `security_invoker`, the internal hour excluded from the `time` branch.
- `_countersign_design_services_agreement_impl`'s two ceiling sums and `get_project_authority_summary`'s aggregate are all `WHERE entry.project_id = <uuid>`, i.e. NULL-safe by construction (read, not probed — the five agreement tests abort before those lines for the documented Group 3 reason).
- `audit_time_entry_change` is **not** NULL-safe in the sense that matters → **W4-R1-01**.
- `time_entry_auto_roster` already early-exits on `NEW.project_id IS NULL` (00597 anticipated it); suite case (h) pins it.
- The two `ae_hours_logged*` dispatch triggers call `record_activation_event(NEW.user_id, 'hours_logged', …)` and touch no project — no error, no phantom notification.

**A project-less row is readable only by its author and the studio's owner/admin — measured, beyond the suite.** A total stranger (no org seat anywhere) sees `0` rows on the table and `0` on the ledger. A studio owner attempting to **INSERT** an internal row *for* a member is refused `42501` (no owner/admin INSERT policy — as plan §5 specifies). The author cannot repoint her own internal row's `user_id` to the owner (`42501`); the owner can (1 row) — which is the authority 00612's pair exists to name. All seven new policies are permissive, `TO authenticated`, and every qual/with-check expression carries `project_id IS NULL` and mentions `projects` nowhere (asserted per policy in 00612's own postcondition and re-read by me in `pg_policy`). Total policy count on the table is 19 = 12 pre-existing + 7 new; the 00484 quartet is present and unreshaped (§0.17), `guard_invoiced_time_entry` present (§0.12).

**It can never be billable while it is project-less.** `project_time_entries_internal_scope_ck` is a CHECK, not a policy, so `service_role` cannot bypass it (suite case (e), SQLSTATE `23514`). The 00611 guard replicates `00317:31-47` accurately — I read both side by side: same `NEW.studio_id IS NOT NULL` gate, same two bypasses (`auth.uid() IS NULL`, `auth.jwt()->>'role' = 'service_role'`), same inline `status='active'` test on `organization_members`; the two stated differences (the seat tested is `auth.uid()`'s not the project designer's; the `role <> 'guest'` leg lives in 00612) are real and correct. Trigger ordering re-measured: `aaa0_ → aaa1_ → aaa_guard_ → aab_ → aac_ → aad_ → ae_ → guard_invoiced_time_entry → set_…_updated_at → zzz_ → zzzz_`, so 00597's "auto-roster first on INSERT" and 00605's "updated_by stamp last on BEFORE UPDATE" both still hold.

**Rulings in force.** No flag of any kind in the diff (P-5). No dashboard, tab, badge, red/green, per-second motion, daily nudge — the diff touches **no** `.tsx`/`.ts` except the generated `database.types.ts`, so R69, HT-26, HT-36, HT-11, HT-41, HT-35, the house sheet §A, accessibility (labels/focus/keyboard), `@patina/design-system`/`ui/controls`, ad-hoc `fetch`, and the `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` mock-fallback question are all **not exercised by this branch** — nothing to pass or fail, and nothing was snuck in. HT-36 is positively pinned: `time_entry_ledger` still has no `notes` column (00613 postcondition (d), re-read in `information_schema`). HT-38/§0.9: the rollup is still INVOKER. §0.22: the in-document zero-tap payload is untouched. P-4: no historical rate, amount, `billing_state` or provenance is written anywhere in the four files; the only `UPDATE` of existing rows is the `studio_id` column stamp.

**The trigger suspension in 00610 is safe.** `DISABLE`/`ENABLE` sit inside the file's `BEGIN … COMMIT`, and DDL is transactional in Postgres, so an abort mid-stamp restores both triggers; the postcondition additionally asserts no trigger on the table is left at `tgenabled <> 'O'` (I re-measured: all 12 at `'O'`) and that `audit_logs` for `resource_type='project_time_entries'` is unchanged across the file. I agree with the deviation: writing one forged `time_entry.updated` row per existing hour in every studio would be a worse HT-23 outcome than the clean trace. Keep it.

---

## Findings

### W4-R1-01 — **major** · confidence **high** (measured)
**An owner/admin edit or delete of an internal hour writes an `audit_logs` row with `organization_id = NULL`, which no owner or admin of the studio can read.**

*Location:* `public.audit_time_entry_change()` — sole definition `supabase/migrations/00605_time_entry_admin_write_and_trace.sql:216`, the offending line `:242`:
```sql
v_org := public.project_pricing_studio_id(OLD.project_id);
```
reached for the first time ever by the new project-less write paths in `supabase/migrations/00612_internal_time_policies.sql` (`internal_time_own_update` / `_delete`, `internal_time_owner_admin_update` / `_delete`).

*Finding.* `project_pricing_studio_id(NULL)` is NULL (`00604:100-102`), so every edit and delete of an internal hour files its trace with no organization. `audit_logs`' read policies are exactly two, and the org one carries an explicit `organization_id IS NOT NULL` leg:
```
Org admins can view org audit logs | SELECT | ((organization_id IS NOT NULL) AND EXISTS (… om.organization_id = audit_logs.organization_id … role IN (owner,admin) … status='active'))
Users can view their audit logs    | SELECT | (user_id = auth.uid())
```
So the trace is visible only to the actor who made the edit. 00605's own function comment states the intent this breaks: *"The organization on the trace is the studio that PRICES the work … so an owner reading 'Org admins can view org audit logs' sees the edits to her own studio's hours."* After W4, internal hours **are** her studio's hours and their edits are invisible to her unless she made them; a second admin's adjust of a member's internal hour leaves a trace nobody but that admin can read, and the author cannot see that her hour was changed at all.

*Failure scenario, measured.* Owner `e111…001` and member `e111…002` in one studio. The member logs a 60-minute internal hour. The owner runs `UPDATE project_time_entries SET duration_minutes = 30`. Result: 1 `audit_logs` row, `action='time_entry.updated'`, `organization_id = NULL`, `user_id = owner`. Re-reading as the **author**: `count(*) = 0`. (`updated_by` / `updated_at` on the row itself do stamp correctly — the row-level trace survives; it is the `audit_logs` ledger HT-23 rests on that does not.)

*Exact fix.* In `00613_classifier_internal_short_circuit.sql`, add a fifth section that redefines the trigger function from its grep-winner body **verbatim** (`00605:216-254`) with one expression changed, mirroring the ledger `CASE` the same file already ships:
```sql
-- (5) the trace: an internal hour's studio is its own column (HT-23 × HT-15)
-- Lineage: 00605 → HERE. Body verbatim from 00605:216, one expression changed.
CREATE OR REPLACE FUNCTION public.audit_time_entry_change()
… unchanged …
  v_org := CASE WHEN OLD.project_id IS NULL THEN OLD.studio_id
                ELSE public.project_pricing_studio_id(OLD.project_id)
           END;
… unchanged …
```
Update the banner's delta list to four reads + the trace, add a postcondition (`prosrc LIKE '%OLD.studio_id%'`, and the trigger `zzzz_audit_time_entry_change_trg` still present and enabled), and add a case to `supabase/tests/rls/internal_time_test.sql`: the **admin** adjusts the author's internal hour, then the **owner** reads `audit_logs` for that `resource_id` and sees 1 row with `organization_id` = the studio — asserted per role, the way `time_entry_admin_write_test.sql` does it for the project case (§12 risk 4's shape). Editing `00613` in place is correct remediation here: it is unapplied anywhere that matters (`patina-db-migrations` step 8), the number stays inside W4's reserved range, and `00605` must not be touched.

---

### W4-R1-02 — minor · confidence high
**`00610`'s own `project_id` COMMENT says "six project-less policies"; seven shipped.**

*Location:* `supabase/migrations/00610_time_entry_nullable_project.sql`, `COMMENT ON COLUMN public.project_time_entries.project_id` — *"reachable ONLY through 00612's **six** project-less policies."* `00612` creates seven (four own-row + `owner_admin_read` + `owner_admin_update` + `owner_admin_delete`), and its own postcondition asserts `7`. The "six" is plan §5's RLS table count, which collapses the update/delete pair into one row.

*Failure scenario.* A later hand reads the live column comment, counts six, goes looking for the missing policy — or worse, concludes one was dropped and re-creates a seventh with a different predicate.

*Fix.* Change `six` to `seven` in that COMMENT string. (00612's banner already says "FOUR OWN-ROW POLICIES + THREE OWNER/ADMIN STANDS" and explains the naming — only 00610 disagrees.)

---

### W4-R1-03 — minor · confidence high
**`internal_time_test.sql` case (d5) cannot distinguish an RLS refusal from the 00611 guard, so the division of labour it claims to measure is not pinned.**

*Location:* `supabase/tests/rls/internal_time_test.sql:366-369` — `ASSERT v_guest_state = '42501'`, with the message *"a GUEST must be refused by RLS … 00611 deliberately replicates 00317's status-only test and does not duplicate that leg"*.

*Finding.* `00611`'s raise uses `USING ERRCODE = 'insufficient_privilege'`, which **is** `42501` — the same SQLSTATE a policy refusal returns. If someone later added the `role <> 'guest'` leg to the guard (the exact regression the assert exists to catch), `v_guest_state` would still be `'42501'` and (d5) would still pass.

*Failure scenario.* A future hand "hardens" 00611 by duplicating the guest leg; the authorization now lives in two places with no test objecting, and the next narrowing of `is_active_studio_member` silently stops applying.

*Fix.* Capture `SQLERRM` alongside `SQLSTATE` in (d3)'s `EXCEPTION` block and assert both directions:
```sql
ASSERT v_guest_state = '42501'
   AND v_guest_msg NOT LIKE '%time_entry_studio_id_not_member%',
  'FAIL d5: the guest must be refused by RLS, not by 00611''s guard …';
```

---

### W4-R1-04 — minor · confidence high
**Two of case (a)'s asserts are vacuous: the fixture carries no `studio_member_rates` row, so the resolver answers `none` with or without `00613`'s short-circuit.**

*Location:* `supabase/tests/rls/internal_time_test.sql:193-205` (`ASSERT v_rate IS NULL`, `ASSERT v_source = 'none'`) against the fixture block at `:77-112`, which creates orgs, members, a project, a roster seat and an invoice — but **no** rate card.

*Finding.* `resolve_time_rate_cents` returns `NULL / 'none'` for a studio with no live card, so those two asserts pass even if the short-circuit is deleted. Only `ASSERT v_amount = 0` (`:199`) discriminates (the project non-billable branch would write NULL, not 0). I verified the code is nonetheless correct by adding a live card myself — see "What I tried to refute" — so this is a coverage gap, not a defect.

*Failure scenario.* Someone later reorders the short-circuit below `resolve_time_rate_cents` (or deletes it while refactoring deltas 1/1a/2); the suite stays green on two of its three pricing asserts, and a studio with a rate card starts pricing its owner's admin hours at her billable rate.

*Fix.* Add to the fixtures:
```sql
INSERT INTO studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by, original_created_by)
VALUES ('c6130000-…-0000000000a1', 'c6130000-…-000000000003', 15000, CURRENT_DATE - 30,
        'c6130000-…-000000000001', 'c6130000-…-000000000001');  -- owner-authored, HT-3-e(2)
```
and one assert proving the card is live (`resolve_time_rate_cents(project, author, …)` returns `15000 / 'studio_member'`) immediately before (a)'s three pricing asserts.

---

### W4-R1-05 — note — **ruling owed** · confidence high (measured)
**The project-less ↔ project conversion is open in both directions; 00613's banner documents only one, and the undocumented direction turns a member's non-billable internal hour into billable, invoiceable client time.**

*Location:* `supabase/migrations/00613_classifier_internal_short_circuit.sql` banner, *"STATED, NOT DISCOVERED — a member may convert her OWN uninvoiced project hour into internal time"*; `W4-impl.md` open item 4 says the same. Neither names the reverse, nor the owner-side act.

*Finding, measured.* Owner + member in one studio with a live 15000¢ card. The member logs a 45-minute internal hour (`nonbillable / 0 / none`). The owner then runs `UPDATE project_time_entries SET project_id = <project>, billable = true WHERE id = <internal hour>`: **1 row updated**. `internal_time_owner_admin_update`'s USING passes on the OLD (project-less) row; `time_entries_owner_admin_update`'s WITH CHECK passes on the NEW (project-bearing) row — permissive WITH CHECK arms are OR'd independently of USING, so no single policy has to be true of both. `aab_` does not object (`OLD.billing_authority_id` is NULL, so its "bound commercial time entries cannot change projects" leg does not fire, and the derived columns are unchanged *as submitted*). The classifier then re-prices correctly: `authorized / 15000 / 15000 / studio_member`, and `claim_time_entries` will attach it to an invoice. So HT-15's "internal time is never billed" is true **per row-state**, not per hour.

Two secondary facts worth recording with it: (a) for a **bound** hour, `aab_`'s `'bound commercial time entries cannot change projects'` already refuses the project→internal direction, so the member-side conversion the banner documents is narrower than the banner implies — only unbound hours convert; (b) the short-circuit sits **below** 00578's authority/rate immutability raise and nulls `billing_authority_id` / `authority_rate_id` itself, so were that `aab_` leg ever relaxed, the classifier would silently erase signed provenance. It is not relaxed today.

*Fix.* This is a ruling, not a code choice. If the conversion should be refused, RLS cannot do it (per the OR semantics above) — it needs a trigger leg, most naturally in `guard_commercial_time_entry_derived_fields`:
```sql
IF OLD.project_id IS NULL AND NEW.project_id IS NOT NULL THEN
  RAISE EXCEPTION 'internal time cannot be moved onto a project' USING ERRCODE = 'check_violation';
END IF;
```
If it should be allowed, add two sentences to 00613's banner naming **both** directions and the owner-side actor, and a suite case asserting the re-price (`15000 / studio_member`) so the behaviour is pinned rather than incidental. Either way, record the ruling id.

---

### W4-R1-06 — note (hand-off to lane B) · confidence medium
**An internal hour carries `rate_source = 'none'` — the same value phase 1 made mean "rate pending" and HT-26 hangs a doorway on.**

*Location:* `00613`'s short-circuit (`NEW.rate_source := 'none'`), surfaced through `time_entry_ledger.rate_source`.

*Finding.* If lane B keys the HT-26 affordance ("rate pending" + the `stamp_project_pricing_studio` door per HT-26/HT-3-g) on `rate_source = 'none'` alone, every internal hour grows a rate-pending label and a stamp offer for a rate it must never have. HT-26's "never a blank where a rate is pending" and "an internal hour has no rate" are different statements about the same column value. plan §5 already asks for the right *outcome* ("internal rows render in their own `— internal —` group with no project column and **no rate**"); the hazard is that the distinguishing signal is `project_id IS NULL`, not `rate_source`.

*Fix.* No change in this branch. Carry one line into W4's hand-off: the rate-pending predicate is `project_id IS NOT NULL AND rate_source = 'none'`, and lane B's `hours-ledger` spec should assert an internal row renders neither a rate nor a stamp door.

---

### W4-R1-07 — note (coordination; **not** counted against `clean`) · confidence high
**plan §5's three W4 portal/hook items are absent from the branch, and `W4-impl.md` attributes two of them to a lane plan §11 does not.**

*Verified absent:* `packages/supabase/src/hooks/use-time-tracking.ts` still declares `CreateTimeEntryInput.projectId: string` (required), has no `studioId`, does not force `billable` false, and its `source` union is still `'timer_auto' | 'timer_manual' | 'manual_entry'` — no `'internal'`. `hours-ledger.tsx`'s `addValid` and `command-bar.tsx`'s "Log time" verb are untouched.

*Finding.* plan §11's shared-file table gives `command-bar.tsx` to *"W3 (B), then **W4 (A)** as a follow-commit"* and `use-time-tracking.ts` to *"lane A in W0, then **whichever wave owns the change**"* — which for W4 is lane A, since plan §5's Lane row gives lane D only `00614` + the edge function + the event list. `W4-impl.md`'s deferral table calls all three "lane B follow-commits, stage 4"; only `hours-ledger.tsx` is lane B's by §11. If nobody is assigned, **no caller can create an internal entry** and W4's user-facing half never ships, with a green DB suite the whole way.

*Why not major.* The review brief scopes this round to lane-A items and the implementer's brief forbade portal files; penalising the lane for obeying it would be wrong. Recording it so it cannot vanish at integration.

*Fix.* Orchestrator assigns the three items explicitly — a lane-A follow-commit per §11, or a recorded re-assignment — and the W4 merge checklist gains a line: `CreateTimeEntryInput` carries `studioId`, `projectId` optional, `billable` forced false when absent, `source` widened with `'internal'`.

---

### W4-R1-08 — note · confidence high (measured)
**`00610`'s `studio_id` stamp necessarily misses exactly the rows W2's `00620` exists to repair, because `00620` replays after it.**

*Location:* `00610` section (4) vs `supabase/migrations/00620_legacy_project_studio_stamp.sql` (HT-3-g(2), already on integration).

*Finding.* The stamp reads `projects.studio_id`, and `00620` is what fills `projects.studio_id` for legacy projects — at a higher number, so later in every replay and in the prod push. Measured on this stack after a full reset: **5 of 6** seeded projects still carry `studio_id IS NULL`, and `project_time_entries` is empty, so the stamp was a literal no-op locally. On prod it will stamp only the hours of projects that already named a studio. Harmless — nothing reads the column on a project-bearing row (`W4-impl.md` open item 2, and the column COMMENT says so) — but the banner's framing ("stamped on % existing row(s)") reads as completeness it cannot have.

*Fix.* One line in `00610`'s banner: *"the stamp necessarily misses the legacy projects `00620` repairs, because `00620` replays later; nothing reads `studio_id` on a project-bearing row, so this is consistent rather than a gap."* No code change, no renumber (moving the stamp past `00620` would leave W4's reserved range).

---

### W4-R1-09 — note (ship note) · confidence high
**`00610` takes `ACCESS EXCLUSIVE` on `project_time_entries` for the length of the stamp.**

*Location:* `00610` section (4), the two `ALTER TABLE … DISABLE TRIGGER` statements.

*Finding.* `ALTER TABLE … DISABLE TRIGGER` requires `ACCESS EXCLUSIVE`, so from the first `DISABLE` to the transaction's `COMMIT` every read and write of the hours table blocks. At Patina's row counts this is sub-second; it is nonetheless the one migration in this program that locks the hours table, and `00610` also carries `DROP NOT NULL` + `ADD COLUMN` + `ADD CONSTRAINT … CHECK` (the CHECK validates the whole table) in the same transaction.

*Fix.* None required. Name it in the P-3 ship note so the prod push is not run mid-walk, per `patina-deploy`.

---

### W4-R1-10 — note · confidence high
**`00611` raises `42501`, the same SQLSTATE an RLS refusal returns; `00317`'s own raise is `P0001`.**

*Location:* `00611_time_entry_studio_id_guard.sql`, `RAISE EXCEPTION 'time_entry_studio_id_not_member' USING ERRCODE = 'insufficient_privilege'` vs `00317:47`'s bare `RAISE EXCEPTION 'studio_id_not_designer_studio'`.

*Finding.* No caller can tell "you aimed this hour at a studio you don't belong to" from "a policy said no" by SQLSTATE alone. It also weakens one test assert (W4-R1-03). `42501` is arguably the *better* code; the point is that the choice is undocumented and the consumer has to match on the message.

*Fix.* Keep `42501` and say so in the banner ("the message, not the code, distinguishes this from an RLS refusal — `00317` raises `P0001`"), and tell lane B to match `time_entry_studio_id_not_member` in the message when it turns this into copy.

---

### W4-R1-11 — note · confidence high
**A member whose seat goes inactive or is demoted to `guest` loses read of her own already-logged internal hours, while the owner's rollup keeps counting those minutes.**

*Location:* all four own-row policies in `00612` carry `public.is_active_studio_member(studio_id)`, whose body is `status = 'active' AND role <> 'guest'`.

*Finding.* The studio's total then includes minutes the author can no longer see or correct, and the owner/admin stands keep the record. This is the same shape project hours already have (`is_project_team_member`), so it is consistent rather than novel — recorded because HT-25-a (does a removal stick?) is already an owed ruling in this exact area (plan §12 risk 5b).

*Fix.* None in code. Fold the case into HT-25-a's ruling text when Kody rules on removal.

---

### W4-R1-12 — note · confidence high
**plan §0.16 and plan §5's `00611` row conflict; `00611` followed §5, which is correct.**

§0.16 requires every new SECURITY DEFINER function to carry *"an explicit `GRANT EXECUTE … TO authenticated`"*; plan §5's `00611` row requires *"`REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role`"*. `00611` did the latter, with the in-program precedent (`00597`, `00603`, `00605`) and the right reason: Postgres checks `EXECUTE` on a trigger function at `CREATE TRIGGER`, not at fire time, so a trigger function needs no grant and granting one only widens it.

*Fix.* None. Recorded so the final two-lens integration review does not read this as a §0.16 breach; optionally amend §0.16 to carve out trigger functions.

---

### W4-R1-13 — note · confidence high
**No index on `project_time_entries.studio_id`.**

Every studio-scope read of internal time evaluates `project_id IS NULL AND is_org_admin_or_owner(studio_id)` over the hours table. Deliberately omitted ("not in the plan; no unrequested additions") and right for today's row counts.

*Fix.* None now. If the Hours sheet's studio scope slows, the one-liner is `CREATE INDEX … ON public.project_time_entries(studio_id) WHERE project_id IS NULL`, in a later wave's reserved number — never squeezed into W4's range at merge time.

---

### W4-R1-14 — note (merge checklist) · confidence high (measured)
**W3's `00608` will replay before `00610`, and `log_time`'s reserved `p_studio_id` is still unwritten anywhere.**

`00608`/`00609` exist on **no** ref (enumerated across every remote and local ref). plan §4's signature already carries `p_studio_id uuid DEFAULT NULL -- reserved for W4's internal time`, and also specifies `p_billable = NULL` **raises**. So at merge the integration owner must confirm (a) `log_time` actually inserts `p_studio_id` into the new column, and (b) the internal path sends `billable => false` explicitly rather than relying on a default — the `00610` CHECK refuses otherwise, with `23514`. Function creation order is not a hazard (plpgsql resolves columns at runtime, by which point `00610` has applied).

*Fix.* Nothing for lane A. Add both lines to the W4 merge checklist.

---

## What I did not verify

- **Prod.** Nothing was pushed to Strata; `00610–00613` are unapplied there. The stamp's real row count and lock duration are therefore unmeasured.
- **The five `commercial` agreement tests' `project_unbilled_time` asserts** (`design_services_authority_test.sql:221,349,362`) never run — the file aborts at `:177` for the documented Group 3 reason, so "commercial green is unchanged" is **not** coverage of the authority rate path under a nullable `project_id`. The live coverage there is `billing/time_rate_resolution_test.sql` and `rls/time_entry_admin_write_test.sql` (both green), plus my own probes above.
- **Lane D's `00614`, the `time-nudges` function, and `weekly_hours_reminder_opt_in`** — a different branch and out of this round's scope. `grep -rn weekly_hours_reminder_opt_in apps packages` returns nothing on this branch, as expected.
- **Any UI behaviour.** No portal was started; no `DATA_MODE=live` render check was run, because the diff contains no portal code. Accessibility, focus order, keyboard paths, house sheet §A conformance and the mock-fallback question are all untested here for that reason, not because they passed.
- **`pnpm lint`** anywhere — per `patina-verification`, only designer-portal's config resolves, and nothing in this diff is lint-reachable.
- **Concurrency.** `start_timer`'s two-concurrent-callers case is W3's (`time_log_rpc_test.sql`), not built yet; I did not test an internal running timer racing a project timer against `uniq_project_time_entries_running_timer`, only that an internal running row can exist and prices at 0.
