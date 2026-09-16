# W4 — internal and admin time, lane A DB (00610–00613)

**Branch** `hour-tracking/server` · **worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`
**Built on** `origin/hour-tracking/integration` @ `a9841c8de` (*"chore(time): merge W2 — the four views (lane A DB), HT-3-g"*). `git fetch && git merge --ff-only` reported **Already up to date** — the lane branch tip and the integration tip were the identical commit, so no merge commit and no conflicts.
**Commits** `bb68a542b` (migrations + generated files) · `e06e775e0` (the SQL suite)
**Local stack** `patina-hours` — API `http://127.0.0.1:54421`, Postgres `127.0.0.1:54422`, Studio `54423`. This stage owned the reset.

Ruled inputs delivered: **HT-15** (shape settled, reprice owed), under **P-5** (no flags anywhere — there is none in this wave), **P-4** (no re-rating of history), §0.13, §0.8, §0.12, §0.14, §0.17, §0.20.

---

## Files

| File | Status | What |
|---|---|---|
| `supabase/migrations/00610_time_entry_nullable_project.sql` | new, 195 lines | `project_id DROP NOT NULL`; `studio_id uuid REFERENCES organizations(id)`; `project_time_entries_internal_scope_ck`; the studio_id stamp on existing rows |
| `supabase/migrations/00611_time_entry_studio_id_guard.sql` | new, 148 lines | `guard_time_entry_studio_id()` + `aaa1_time_entry_studio_id_guard_trg` — the anti-aiming guard, 00317:31-47 replicated |
| `supabase/migrations/00612_internal_time_policies.sql` | new, 249 lines | seven project-less RLS policies |
| `supabase/migrations/00613_classifier_internal_short_circuit.sql` | new, 1108 lines | the classifier short-circuit grafted from 00601; the `aac_` column list; `time_entry_ledger`; `margin_items` |
| `supabase/tests/rls/internal_time_test.sql` | new, 578 lines | eight cases, per role, every write through RLS |
| `supabase/seed/00-legacy-grants.sql` | regenerated | +36 lines (00611's REVOKE; 00613's function REVOKE and the two views' grants). Generated with the **worktree's own** `python3 ./scripts/generate-legacy-grants.py` per §0.20 — 2638 replayed statements |
| `packages/supabase/src/database.types.ts` | regenerated | `project_id: string \| null`, `studio_id` added, the organizations FK rows. Nothing else moved (27 insertions / 3 deletions) |

No portal file, no `packages/supabase/src/hooks/**`, no edge function, no iOS file was touched. `supabase/config.toml` was never staged.

---

## Migrations, in detail

### 00610 — the hour without a project

- `ALTER COLUMN project_id DROP NOT NULL` (it is `00177:15`'s NOT NULL that made admin time illegal).
- `ADD COLUMN IF NOT EXISTS studio_id uuid REFERENCES public.organizations(id)` — the hour's **own** column, never `projects.studio_id` (§0.13).
- `project_time_entries_internal_scope_ck CHECK (project_id IS NOT NULL OR (studio_id IS NOT NULL AND billable = false))`. It is a CHECK and not only a policy because service_role and postgres bypass RLS and cannot bypass a constraint — case (e) of the suite asserts exactly that, with RLS out of the way.
- COMMENTs on both `project_id` and `studio_id` stating the NULL semantics and that the column is a policy key only because 00611 exists.

**The studio_id stamp, and the one deviation in this wave.** plan-v2 §5's 00610 row asks for `studio_id` to be stamped from the project's studio on existing rows. It is written as specified, but with `zzzz_audit_time_entry_change_trg` (00605) and `set_project_time_entries_updated_at` (00177) **DISABLEd for the single UPDATE and re-ENABLEd immediately**, because without that the stamp would (a) write one `'time_entry.updated'` `audit_logs` row per existing hour — a forged HT-23 trace claiming somebody edited every hour in every studio, on precisely the rows no real edit touched — and (b) move `updated_at` on every row, so the whole ledger would read as just-edited. The file **proves** the first: it counts `audit_logs` rows for `resource_type = 'project_time_entries'` before and after and asserts equality, and the postcondition asserts no trigger on the table is left disabled. No guard is suspended (`aab_` does not watch `studio_id`, and `aac_` does not until 00613, so the stamp is not a classified write either way). This is a hygiene measure forced by the 00605 × 00610 interaction; it is reported here rather than buried because it is the one place this wave disables a trigger. It is not P-4's forbidden backfill: no rate, amount, `billing_state` or provenance is touched, and the column is read by nothing on a project-bearing row (every 00612 policy, the CHECK and 00613's ledger CASE all gate on `project_id IS NULL`).

### 00611 — the anti-aiming guard

`public.guard_time_entry_studio_id()` — `BEFORE INSERT OR UPDATE OF studio_id`, SECURITY DEFINER, `SET search_path = public, pg_temp`, `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role`. The body replicates **00317:31-47** statement for statement: validated only when `NEW.studio_id IS NOT NULL`; `(select auth.uid()) IS NOT NULL` and `auth.jwt() ->> 'role' <> 'service_role'` as the two bypasses (00317:38-39); the membership test written **inline** as `status = 'active'` on `organization_members` rather than through a helper. Raise: `time_entry_studio_id_not_member`, `ERRCODE = 'insufficient_privilege'`.

Two differences from 00317, both stated in the banner:

1. 00317 tests the **project lead designer's** seat (a project is aimed at a studio on her behalf); an hour is aimed by whoever writes it, so the seat tested here is **`auth.uid()`'s**.
2. The narrower `role <> 'guest'` leg is **not** duplicated — it lives in 00612's policies through `is_active_studio_member`. Case (d3) of the suite measures that division of labour: a guest of the row's own studio passes the guard's status-only test and is refused by RLS with `42501`.

**Trigger name `aaa1_…`.** Two orderings are already asserted on this table — 00597's postcondition requires `aaa0_time_entry_auto_roster_trg` to fire **first** on INSERT and 00605's requires `zzz_stamp_time_entry_updated_by_trg` to fire **last** among the BEFORE UPDATE triggers. `aaa1_` sits between `aaa0_` and `aaa_guard_`; 00611's postcondition **re-measures both orderings** against `pg_trigger` rather than reasoning about collation. Measured live order: `aaa0_time_entry_auto_roster_trg, aaa1_time_entry_studio_id_guard_trg, aaa_guard_time_entry_invoice_insert_trg, aab_…, aac_…, aad_…, ae_…, guard_invoiced_time_entry, set_project_time_entries_updated_at, zzz_…, zzzz_…`.

### 00612 — the seven project-less policies

plan-v2 §12 risk 2 is the whole reason this file exists: all nine existing policies resolve through `project_id`, so a NULL makes every one false and internal time would be written and then invisible. The banner enumerates the three shapes (five through `projects p WHERE p.id = project_time_entries.project_id`; four through `is_project_team_member(project_id)`; plus 00605/00606's three through `project_pricing_studio_id(project_id)`, which returns NULL for a NULL project at 00604:100-102) and records that the ninth — `00177:136`'s `FOR ALL` for the project's own `designer_id` — gets **no** project-less counterpart, deliberately: an internal hour has no project designer.

The own-row four share **one** predicate, written identically on every `USING` and every `WITH CHECK`:

```
project_id IS NULL AND user_id = auth.uid()
AND billable = false AND public.is_active_studio_member(studio_id)
```

`billable = false` appears on the read and delete arms too: 00610's CHECK makes a billable project-less row impossible, so the leg can never hide a row from its author, and one predicate that reads the same everywhere is worth more than four subtly different ones.

The owner/admin three are `internal_time_owner_admin_read` and — since a single Postgres policy cannot cover UPDATE and DELETE — `internal_time_owner_admin_update` + `internal_time_owner_admin_delete`, which are plan-v2 §5's single `internal_time_owner_admin_write` row. All three are `project_id IS NULL AND public.is_org_admin_or_owner(studio_id)` (§0.14's only helper; `user_is_org_member` gets no new call site). **No owner/admin INSERT policy** — the same reason 00605 gives for the project case.

**§0.13, read rather than recited.** §0.13 forbids `projects.studio_id` as a policy key because a legacy NULL there *widens* visibility (00317:15-18). These seven key on `project_time_entries.studio_id`, a different column, on the row itself, whose anti-aiming guard 00611 replicates 00317:31-47 for — the exact condition §0.13 names. And the failure direction is **closed**: the postcondition impersonates a real actor and measures `is_active_studio_member(NULL)` and `is_org_admin_or_owner(NULL)` both FALSE.

Postconditions: seven permissive `TO authenticated` policies; every expression (qual and with-check, per policy) carries `project_id IS NULL` and mentions `projects` nowhere; the four own-row carry `auth.uid()` and `billable = false`; the three owner/admin carry `is_org_admin_or_owner`; the 00484-registered quartet still exists unreshaped (§0.17).

### 00613 — the classifier, the ledger and the margins

**The graft.** `grep -rln "CREATE OR REPLACE FUNCTION[^(]*classify_project_time_entry_authority" supabase/migrations/*.sql | sort | tail -1` → **`00601`**. The briefing named 00615 as the current head body; measured, **00615 redefines `resolve_time_rate_cents`, not the classifier** (it is the other name in that file's `CREATE OR REPLACE` list), so the graft source is 00601 and — important for replay order — nothing numbered after 00613 re-plants an older classifier body. Lineage banner: `00412 → 00575 → 00578 → 00601 → 00613`.

The body is `00601:154-519` **verbatim**; a `difflib` comparison of the two shows exactly one hunk, the inserted block:

```sql
  IF NEW.project_id IS NULL THEN
    NEW.billing_authority_id := NULL;
    NEW.authority_rate_id    := NULL;
    NEW.billing_state        := 'nonbillable';
    NEW.hourly_rate_cents    := NULL;
    NEW.rated_amount_cents   := 0;
    NEW.rate_source          := 'none';
    NEW.rate_role            := NULL;
    RETURN NEW;
  END IF;
```

It sits immediately after 00601's authority-id nulling and above **four** reads of `NEW.project_id`, not one. plan-v2 §5 names the `project_commercial_documents` lookup; the other three matter as much, and each is asserted by a `position()` postcondition:

- **delta 1** would `RAISE 'rate_role … is not a role this member holds'` for a caller-supplied `rate_role`, instead of discarding it the way the rate is discarded.
- **delta 1a** (W1-R9-01) would refuse an owner/admin repointing an internal row's `user_id`, because its standing leg reads `is_org_admin_or_owner(projects.studio_id)` through a project that does not exist. Nothing is lost: the INSERT half is carried by `internal_time_own_insert`'s `user_id = auth.uid()` WITH CHECK, the UPDATE half by `internal_time_own_update`'s same leg on **both** its USING and its WITH CHECK, and only 00612's owner/admin pair can repoint — which is the authority delta 1a exists to name. An internal row also carries no rate, so the confidential number W1-R9-01 was about is not on it.
- **delta 2** would ask the resolver to price an hour that is never billed.

`rated_amount_cents = 0` is plan-v2 §5's literal, on a running internal row as well as a finished one (the non-billable *project* branch writes NULL for a running row because that hour may yet be invoiced; this one may not).

**Stated, not discovered:** a member may convert her **own uninvoiced** project hour into internal time — the UPDATE passes `Team can update their own time entries`' USING on the old row and `internal_time_own_update`'s WITH CHECK on the new one, and `aab_` does not watch `billable`, which she must also set false for 00610's CHECK. The rate snapshot goes with the project. That is an explicit act on her own unbilled hour, not a silent re-rating, and the case that matters is closed: `guard_invoiced_time_entry` freezes `project_id` once `invoice_id` is set, so an **invoiced** hour can never become internal time. No machinery was added for it.

**Every 00578/00601 invariant is re-asserted** by postcondition rather than trusted (twelve asserts: both 00578 raises, the `FOR UPDATE` lock's exact regex shape, 00575's F-2 nullable ceiling, W1-R1-02, W1-R1-03, W1-R2-05, W1-R3-02, W1-R5-03's role-ladder regex, and both halves of W1-R9-01).

**`aac_` column list.** `studio_id` appended to 00600's list, column for column (§0.8). Named consequence: an UPDATE of `studio_id` on a project-bearing row now re-fires the classifier, which re-resolves that row's rate under delta 5's preservation rules.

**`time_entry_ledger` (00604:178-221, `CREATE OR REPLACE`, one expression changed).** This is the edit **00607's own banner hands to W4 by name** ("W4 MUST edit this function (and the `scoped` CTE, with an OR leg on the row's own studio_id column) when `project_time_entries.studio_id` lands"). The view's `studio_id` was `project_pricing_studio_id(te.project_id)`, which is NULL for a NULL project — so an internal hour would have survived the view (both joins are already LEFT, and 00604's own postcondition says the projects join is outer "so that W4's project-less internal time survives this view") and then been invisible to every studio-scoped read of it, `studio_hours_rollup` included. It is now:

```sql
  CASE WHEN te.project_id IS NULL THEN te.studio_id
       ELSE public.project_pricing_studio_id(te.project_id)
  END                                           AS studio_id,
```

A **CASE, not a COALESCE**, so a project-bearing row's answer is byte-identical to 00604's — no widening at all — and done in the view rather than in the rollup's CTE so that every reader (the rollup, lane B's studio scope, W5's export) gets the internal hour without each one learning a second column. `CREATE OR REPLACE`, not `DROP`, because 00607's rollup depends on the view. `studio_hours_rollup` is therefore **not redefined**: its `internal_minutes` FILTER already carries the `project_id IS NULL` leg 00607 left as a fail-safe, and postcondition (e) proves the rollup still scopes on `ledger.studio_id`, still carries that leg, and is still SECURITY INVOKER (HT-38, §0.9). `time_entry_ledger_test.sql`'s b2c/b3b asserts — "where the resolver says 'none' the ledger must say NULL" — stay green, because those are project-bearing rows.

**`margin_items` (00543:92-454, `create or replace`, one predicate added).** `and pte.project_id is not null` in the time sub-select; a `difflib` comparison against 00543 shows that one inserted line and nothing else. Postcondition asserts the predicate, that the view still carries exactly 11 columns, and that it is still `security_invoker`.

---

## Gate outputs, verbatim

### `supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-server`

```
Applying migration 00607_studio_hours_rollup.sql...
Applying migration 00610_time_entry_nullable_project.sql...
Applying migration 00611_time_entry_studio_id_guard.sql...
Applying migration 00612_internal_time_policies.sql...
Applying migration 00613_classifier_internal_short_circuit.sql...
Applying migration 00615_self_authored_rate_requires_ownership.sql...
Applying migration 00620_legacy_project_studio_stamp.sql...
Applying migration 20260910152111_create_contact_messages.sql...
Seeding data from supabase/seed/00-legacy-grants.sql...
[… 26 further seed files …]
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```

Clean — every `DO $postcondition$` block in 00610–00613 ran without raising (a failure there aborts the replay). Note that 00610–00613 replay **before** 00615/00620, which is correct: neither touches the classifier.

### `scripts/run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422`

```
PASS  supabase/tests/billing/invoice_checkout_integrity_test.sql    0s
PASS  supabase/tests/billing/invoice_links_test.sql                 1s
PASS  supabase/tests/billing/legacy_project_studio_stamp_test.sql   0s
PASS  supabase/tests/billing/studio_invoice_test.sql                0s
PASS  supabase/tests/billing/time_claim_atomicity_test.sql          0s
PASS  supabase/tests/billing/time_entry_ledger_test.sql             0s
PASS  supabase/tests/billing/time_rate_resolution_test.sql          1s
PASS  supabase/tests/billing/time_unbilled_view_repair_test.sql     0s

================ summary ================
total:             8
green:              8
expected-fail:      0
unexpected-fail:    0
effective-green:    8 / 8  (green + expected-fail)
===========================================
```

### `scripts/run-sql-tests.sh -d …/supabase/tests/commercial -H 127.0.0.1 -p 54422`

```
================ summary ================
total:             16
green:             10
expected-fail:      0
unexpected-fail:    6
effective-green:    10 / 16  (green + expected-fail)
===========================================

unexpected failures:
  - supabase/tests/commercial/authorized_schedule_test.sql
  - supabase/tests/commercial/design_services_authority_test.sql
  - supabase/tests/commercial/design_services_gap_hardening_test.sql
  - supabase/tests/commercial/executed_on_paper_test.sql
  - supabase/tests/commercial/trade_rfq_test.sql
  - supabase/tests/commercial/trade_scope_test.sql
```

**Documented failures, unchanged from W1's and W2's baseline (`W2-impl.md:72` records the identical "10 green / 6 red").** Five abort inside `_countersign_design_services_agreement_impl` with *"design services agreement … not found or access denied"* (`supabase/tests/KNOWN_FAILURES.md` Group 3, "Failure points re-measured 2026-09-11"); `trade_rfq_test.sql` is the Group 2 `mint_trade_rfq_token` EXECUTE-grant gap. W4 touches no agreement, countersign or RFQ path. The runner printed them as *unexpected* only because it is invoked from the main checkout, so it resolves its default allowlist to `<dir>/KNOWN_FAILURES.md` and normalises paths against the main repo root — the real allowlist is at `supabase/tests/KNOWN_FAILURES.md`, whose entries are repo-relative and therefore never match a worktree path. Same mechanism W2 recorded for the rls directory.

**Also re-measured, because this wave touches the ceiling path's own classifier:** `design_services_authority_test.sql` aborts at `:177`, 44 lines before its three `project_unbilled_time` asserts, so **commercial green is not coverage of the authority rate path** (`KNOWN_FAILURES.md` says so in terms). The authority path's live coverage is `supabase/tests/billing/time_rate_resolution_test.sql` (green) and `supabase/tests/rls/time_entry_admin_write_test.sql` (green).

### `scripts/run-sql-tests.sh -d …/supabase/tests/rls -H 127.0.0.1 -p 54422`

```
PASS  supabase/tests/rls/00555_ios_round_one_security.test.sql          0s
PASS  supabase/tests/rls/00557_increment_scan_upload_attempt.test.sql   0s
PASS  supabase/tests/rls/00559_first_document_opened_test.sql           0s
PASS  supabase/tests/rls/00562_notification_log_owner_opened.test.sql   0s
PASS  supabase/tests/rls/00563_proposal_signing_multi_studio.test.sql   1s
PASS  supabase/tests/rls/00564_client_signoff_approval.test.sql         0s
PASS  supabase/tests/rls/00582_client_discovery_studio_rls.test.sql     0s
PASS  supabase/tests/rls/00584_studio_comember_rls_sweep.test.sql       0s
PASS  supabase/tests/rls/admin_studio_management_test.sql               0s
PASS  supabase/tests/rls/anon_table_grant_narrowing_test.sql            0s
FAIL  supabase/tests/rls/design_requests_test.sql                       0s
PASS  supabase/tests/rls/designer_clients_client_read_test.sql          0s
PASS  supabase/tests/rls/field_parties_test.sql                         0s
PASS  supabase/tests/rls/fulfillment_client_read_test.sql               0s
PASS  supabase/tests/rls/internal_time_test.sql                         1s
PASS  supabase/tests/rls/people_directory_scope_test.sql                0s
PASS  supabase/tests/rls/products_three_layer_test.sql                  0s
PASS  supabase/tests/rls/project_hours_total_test.sql                   0s
PASS  supabase/tests/rls/project_notes_test.sql                         0s
PASS  supabase/tests/rls/project_roster_test.sql                        0s
PASS  supabase/tests/rls/room_concept_render_test.sql                   0s
PASS  supabase/tests/rls/saved_items_snapshot_test.sql                  0s
PASS  supabase/tests/rls/sms_tables_test.sql                            0s
PASS  supabase/tests/rls/studio_contacts_backfill_test.sql              1s
PASS  supabase/tests/rls/studio_contacts_test.sql                       0s
PASS  supabase/tests/rls/studio_hours_rollup_test.sql                   0s
PASS  supabase/tests/rls/studio_member_rates_test.sql                   0s
FAIL  supabase/tests/rls/studio_titles_test.sql                         0s
PASS  supabase/tests/rls/time_entry_admin_write_test.sql                0s
PASS  supabase/tests/rls/time_entry_auto_roster_test.sql                0s
PASS  supabase/tests/rls/time_entry_studio_stamp_test.sql               0s

================ summary ================
total:             31
green:             29
expected-fail:      0
unexpected-fail:    2
effective-green:    29 / 31  (green + expected-fail)
===========================================
```

**The two red are the documented pair**, `supabase/tests/KNOWN_FAILURES.md:114-115`, verbatim the same assertions W2 recorded: `design_requests_test.sql` *"FAIL 3b: expected no_scans, got &lt;none&gt;"* and `studio_titles_test.sql` *"FAIL f: demoting the sole active owner should raise last_owner_protected"*. Neither touches `project_time_entries`. W2's baseline was 27 green / 2 red over 29 files; the two added files are this wave's `internal_time_test.sql` and W2's own `time_entry_studio_stamp_test.sql`, so **29 green / 2 red is the baseline plus two green**.

### `pnpm --filter @patina/supabase type-check`

```
> @patina/supabase@0.0.1 type-check
> tsc --noEmit
```
(no diagnostics)

### `pnpm --filter @patina/designer-portal type-check`

```
> @patina/designer-portal@0.1.0 type-check
> tsc --noEmit
```
(no diagnostics) — notable, because `project_id` becoming `string | null` in `database.types.ts` is exactly the kind of change that breaks a portal read. It does not: nothing in the portal assigns a time entry's `project_id` to a non-nullable `string`.

### `pnpm --filter @patina/admin-portal build`

Completed — full route table rendered, `○ (Static) / ƒ (Dynamic)` legend printed, exit 0. This is the mandatory gate after any `packages/*` edit (the only portal whose build enforces types).

### `pnpm db:generate` + `python3 ./scripts/generate-legacy-grants.py`

`database.types.ts`: 27 insertions / 3 deletions — `project_id: string | null` in Row/Insert/Update, `studio_id: string | null` in all three, and the three `project_time_entries_studio_id_fkey` relationship rows (`organizations` plus the two views that expose it). `time_entry_ledger`'s generated `studio_id` was already `string | null`, so the view change moves no type.
ACL seed: +36 lines, 2638 replayed statements, regenerated from the **worktree's own** copy of the script (§0.20's W2-R10-06 hazard).

### Extra probes, beyond the named gates

| Probe | Result |
|---|---|
| `tests/document/margin_items_note_field_capture_test.sql` | **PASS** — the suite that pins `margin_items`' 11-column shape and exercises its `time` arm end to end |
| `tests/field` (6 files) | 5 green, 1 red — `field_capture_note_routing_test.sql`, documented (`field_captures` carries 9 policies where the assert expects 5, since 00584) |
| object probe, before and after every run | `pg_postmaster_start_time()` `2026-09-13 07:10:30Z` (this stage's own reset) and unmoved afterwards — no foreign reset crossed these gates. `project_id` `attnotnull = f`; `project_time_entries_internal_scope_ck` present; 7 `internal_time_%` policies; classifier `prosrc` carries the short-circuit; `aac_` triggerdef carries `studio_id`; `time_entry_ledger` viewdef carries `te.studio_id`; `margin_items` viewdef carries `pte.project_id IS NOT NULL`; `guard_time_entry_studio_id()` exists |

---

## Done-when (plan-v2 §5), measured

| Done-when | Where it is asserted |
|---|---|
| An internal entry appears in the author's own scope | `internal_time_test.sql` (a2) — 1 row through `internal_time_own_read` |
| … and in the studio scope's internal group | (f5)–(f8) — `studio_hours_rollup(studio, NULL, NULL, 'project')` returns bucket `internal` / label `Internal`, 45 total minutes, 45 internal minutes, **0 cents** |
| … is absent from every project scope | (f1) `project_unbilled_time`, (f2) `margin_items`, (f9) the rollup's project scope, (f10) `project_hours_total` = 60 (the project hour only) |
| … cannot be invoiced | (g1) `aad_` raises *"not authorized for invoicing"*, (g2) `invoice_id` still NULL, (g3) `claim_time_entries` returns 0 ids |
| … cannot be written against another studio's id | (d1) INSERT raises `time_entry_studio_id_not_member`, (d3) the UPDATE repoint raises it too, (d4) the hour still belongs to its own studio |
| each asserted by the RLS suite, **not** by a UI render | no portal was started; every claim above is a `SELECT` or a caught `SQLSTATE` |
| `grep -rn "weekly_hours_reminder_opt_in" apps packages` returns nothing | lane D's (00614) Done-when, not this lane's |
| `SELECT count(*) FROM cron.job WHERE jobname LIKE 'time-nudges%'` = 1 | lane D's (00614) |

---

## Deferred / not done, with reasons

| Item | Why |
|---|---|
| `00614_time_nudges_cron.sql`, `supabase/functions/time-nudges/**`, `weekly_hours_reminder_opt_in` | **lane D** (plan-v2 §5 assigns 00614 and the edge function to D, and merge order step 4 puts it after 00610–00613). It already exists on lane D's branch — `git log --all --name-only -- 'supabase/migrations/0061*'` shows `00614_time_nudges_cron.sql` on another ref, so no number collides with mine |
| `hours-ledger.tsx` `addValid`, `command-bar.tsx`'s project-less "Log time", `use-time-tracking.ts` (`projectId` optional, `studioId`, `billable` forced false, `source` widened with `'internal'`) | **lane B follow-commits, stage 4** — plan-v2 §11's shared-file rule gives `hours-ledger.tsx` to W2/lane B and `command-bar.tsx` to W3 then W4-as-follow-commit. The brief forbids this lane touching portal files. **Note for lane B:** `CreateTimeEntryInput.source` must gain `'internal'` or no TS caller can send it — the DB vocabulary was bought in 00595 and the `source` CHECK already admits it (verified live) |
| `document-events.ts` / PostHog | owned by lane B in this phase (brief), and §5 says no new events — `time_entry_logged` simply carries `source='internal'` |
| A partial index on `(studio_id)` or `(user_id) WHERE project_id IS NULL` | not in the plan; no unrequested additions |
| `studio_hours_rollup` redefinition | **not needed, and deliberately not done** — postcondition (e) of 00613 proves the rollup's `scoped` filter and `internal_minutes` FILTER both already do the right thing once the view answers. 00607's banner asked for "the `scoped` CTE, with an OR leg"; the view CASE delivers the same behaviour without a second code path, and without touching a function three SQL suites assert against |
| Prod `supabase db push` | **not run.** P-3: one ship at the end, after W7 and a clean final review. No Strata object was touched by this wave |

## Open items a reviewer should weigh

1. **The trigger suspension in 00610** (detailed above) is the one deviation from a literal reading of plan-v2 §5. If the orchestrator would rather have the audit rows than the clean trace, deleting the two `ALTER TABLE … DISABLE/ENABLE TRIGGER` pairs and the `v_audits_after = v_audits_before` assert is the whole change.
2. **`studio_id` is NOT stamped on new project-bearing rows** — only on the rows that existed when 00610 replayed. Nothing reads it for such a row (the ledger CASE, all seven policies and the CHECK gate on `project_id IS NULL`), so this is consistent rather than a gap; but it means the column is *not* a reliable "which studio" answer for project hours, and `project_pricing_studio_id(project_id)` remains the only one. The column COMMENT says so.
3. **Adding `studio_id` to the `aac_` list** means an UPDATE of `studio_id` on a project-bearing row re-fires the classifier and re-resolves that row's rate (under delta 5's preservation rules). That is plan-v2 §5's instruction; it is a new, small re-price surface and is named in 00613's banner.
4. **A member can convert her own uninvoiced project hour into internal time** and the rate snapshot goes with the project (mechanism in 00613's banner). Invoiced hours cannot be converted. If that act should be refused rather than allowed, it is a ruling.
