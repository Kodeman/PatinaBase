# W2 — lane A (DB): the four views. Implementation report

**Branch** `hour-tracking/server` (worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`), cut from and merged with W1 at `70ef7136f`.
**Stack** this program's own isolated Supabase stack — API 54421, Postgres `127.0.0.1:54422`, `project_id "patina-hours"`. The shared 54321/54322 stack was never touched.
**Numbers** `00604`, `00605`, `00606`, `00607` — all four used, none left unused. Re-checked across **every** local and remote ref immediately before commit (`git ls-tree` per ref over `supabase/migrations/006(0[4-9]|1[0-9]|20)_`): the only other number in that band anywhere is lane D's `00614_time_nudges_cron.sql` on `hour-tracking/edge`. No collision.

---

## What shipped

### `00604_time_entry_ledger_view.sql`

- **`public.project_pricing_studio_id(p_project_id uuid) → uuid`** — STABLE, SECURITY DEFINER, `search_path` pinned, REVOKEd from `PUBLIC, anon`, GRANTed to `authenticated`. HT-3-a step 1 (`projects.studio_id`) then HT-3-b's two tiers over the **project designer's** own seats: EMPLOYER tier (`active`, non-`guest`, `role <> 'owner'`) — exactly one prices; only where she holds no employer seat at all, the OWNED tier — exactly one prices; any tier with more than one candidate is NULL. No rate-existence, seat-date, org-age, member-count or `created_by` key, no `ORDER BY`, and nothing about the member being priced.
- **`public.time_entry_ledger`** — `WITH (security_invoker = true)`, **LEFT JOIN** to both `public.profiles` and `public.projects`, `REVOKE ALL … FROM anon` + `GRANT SELECT … TO authenticated`. Columns: entry facts + `project_name` + `studio_id` (the helper) + `member_name` + `resolved_rate_cents` + `amount_cents` (prefers `rated_amount_cents`) + `rate_source` + `rate_role` + `is_running` + `day` / `iso_week` / `month` (UTC, matching 00599's date basis). **No `notes` column.**
- Postconditions: the outer joins, `security_invoker=true`, `notes` absent, `prosecdef`, both grant directions, and four structural pins on the pricing rule (employer-before-owned, `role <> 'owner'`, exactly two `organization_members` reads, no `ORDER BY`, no `studio_member_rates` key).

### `00605_time_entry_admin_write_and_trace.sql`

- `ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(id)`, stamped by `public.stamp_time_entry_updated_by()` on `zzz_stamp_time_entry_updated_by_trg` (BEFORE UPDATE, named to fire **last**, after 00412/00601's guard + classifier family; a postcondition reads `pg_trigger` and asserts it is last).
- `public.audit_time_entry_change()` — **SECURITY DEFINER** (§0.18: `audit_logs` has RLS with no INSERT policy), `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role`, on `zzzz_audit_time_entry_change_trg` AFTER UPDATE OR DELETE. One `audit_logs` row per edit: `action` `time_entry.updated` / `time_entry.deleted`, `resource_type='project_time_entries'`, `resource_id`, `old_values`, `new_values` (NULL on delete), `organization_id` = the **pricing** studio via 00604's helper, `user_id = auth.uid()`.
- `time_entries_owner_admin_update` (USING + WITH CHECK) and `time_entries_owner_admin_delete`, both the plan's predicate verbatim through `is_org_admin_or_owner`, never keyed on `projects.studio_id` (§0.13 — asserted).
- A postcondition refuses the file if `audit_logs` ever grows an INSERT policy (the DEFINER trigger's justification would have changed), and another asserts `guard_invoiced_time_entry` is still in place.

### `00606_time_entries_studio_read_narrow.sql` — the only change in its file (risk 5 stays revertible)

- `Team can view their project time entries` (00484-registered) dropped and re-created as `((user_id = auth.uid()) AND is_project_team_member(project_id))`.
- `time_entries_studio_read` (00316:237-240) dropped and re-created as `((user_id = auth.uid()) AND EXISTS (… is_studio_comember(p.designer_id)))` — **name kept**, so the revert is one statement.
- `time_entries_owner_admin_read` added (HT-10's replacement read).
- **The 00484 registration contract is followed, not voided.** The policy keeps its name, command, role set, permissive flag and postgres ownership — every property 00484 checks except the qual HT-10-a rules it must now carry — and the contract's live-state home, `supabase/tests/edge_api/public_rpc_authorization_contract_test.sql`, is **re-registered in the same commit** with the new qual, a comment naming HT-10-a/00606, and an instruction to carry the qual into 00484 if 00484 is ever re-derived. Postconditions assert the quartet's four names, the three write quals byte-identical, and that `Designers manage …` plus 00316's own-row write policies all survive.

### `00607_studio_hours_rollup.sql`

- **`public.studio_hours_rollup(p_studio_id uuid, p_from date, p_to date, p_group_by text DEFAULT 'member', p_user_id uuid DEFAULT NULL, p_project_id uuid DEFAULT NULL)`** — the plan's signature, asserted argument-for-argument by a postcondition. **SECURITY INVOKER** (HT-38). Returns `bucket_key, bucket_label, member_id, member_name, entry_count, total_minutes, billable_minutes, billable_cents, internal_minutes` — **no `notes`**, asserted on the TYPE. Running rows excluded (an unfinished hour is not money). `p_group_by` validated against the five literals and raises `invalid_parameter_value` otherwise, with **no dynamic SQL**. `internal_minutes` = `source = 'internal' OR project_id IS NULL`, so W4's project-less row needs no edit here.
- **`public.project_hours_total(p_project_id uuid)` → `(minutes, billable_minutes, amount_cents)`** — HT-10-a's repair. SECURITY DEFINER, the standing assert FIRST (`is_project_team_member`, else the project's designer, else an owner/admin of a studio the project's designer actively belongs to — each of whom can already sum the rows with a plain SELECT after 00606), `insufficient_privilege` otherwise. Reads the TABLE, not the security_invoker view, deliberately. Running rows excluded.
- Both REVOKEd from `PUBLIC, anon`, GRANTed to `authenticated`.

### Package / hooks (lane A's W2 items)

`packages/supabase/src/hooks/use-time-tracking.ts`:

- **DELETED `useStudioTimeReport`** and its types `StudioTimeEntry` / `StudioProjectRollup` / `StudioTimeReport`, and the `studioReport` query key (HT-37). Zero callers existed; `studioPeriodStartISO` / `StudioPeriod` are **kept** — `apps/designer-portal/src/lib/time-billing.ts:121` re-exports them.
- **Added** `useTimeEntryLedger(params)` (the 00604 view, four scopes by filter), `useStudioHoursRollup(params)` (the 00607 RPC, `enabled` on a studio), and `useProjectHoursTotal(projectId)` (HT-10-a's function, for lane B's project lens as a plain member) with the types `TimeEntryLedgerRow/Params`, `TimeHoursGroupBy`, `StudioHoursRollupRow/Params`, `ProjectHoursTotal`.
- Keys sit **under `timeKeys.all` (`['time', …]`)** — `['time','ledger',params]`, `['time','studio-rollup',params]`, `['time','project-total',projectId]` — so `invalidateProjectTime`'s existing blanket invalidation refreshes all three after every write. One canonical key per read; no second family.
- Re-exported from `packages/supabase/src/hooks/index.ts` (the package index is `export * from "./hooks"`).

### Generated files, committed with the migrations

- `supabase/seed/00-legacy-grants.sql` — regenerated (`python3 …/scripts/generate-legacy-grants.py`), +54 lines covering 00604's and 00607's GRANT/REVOKEs and 00605's REVOKE. The `grep -lE '^\s*(GRANT|REVOKE)' supabase/migrations/0060*.sql` rule (§0.20) names `00600, 00601, 00602, 00603, 00604, 00605, 00607` — `00606` has none.
- `packages/supabase/src/database.types.ts` — regenerated, +153 lines (`time_entry_ledger`, `project_hours_total`, `project_pricing_studio_id`, `studio_hours_rollup`, `updated_by`).

---

## Tests written (all through RLS, as the actor, per role)

| File | Cases |
|---|---|
| `supabase/tests/billing/time_entry_ledger_test.sql` | (a) shape — no `notes`, `security_invoker`, the columns the scopes read · (b) **the pricing studio is one rule**: on three project shapes the ledger's `studio_id` is the studio whose `studio_member_rates` row priced the hour (step 1 named; step 2 employer tier on a legacy NULL-studio project; ambiguous tier → `'none'` **and** NULL), plus direct probes of the helper · (c) one rate source (reconciliation sweep, the 0/0 rate-less row, the running row) · (d) **the LEFT JOIN payoff** — as the designer, a vendor's hour whose author profile she cannot read still appears, `member_name` NULL, with a precondition that the name really exists · (e) UTC buckets |
| `supabase/tests/rls/time_entry_admin_write_test.sql` | (a) admin adjusts + `updated_by` + **one** `audit_logs` row with both value sets and the right `organization_id` and actor — adjust and trace asserted together · (b)(c) plain member may not adjust or delete · (d) guest reads and writes nothing · (e) another studio's owner neither · (f) owner deletes, traced with NULL `new_values` · (g) **the invoiced lock untouched** — admin delete raises, admin and author both refused on a frozen column · (h) a server-side write keeps the last human in `updated_by` |
| `supabase/tests/rls/studio_hours_rollup_test.sql` | (a) no `notes` in either return type + INVOKER · (b) owner gets a bucket per member, each priced at **her own** rate, internal minutes separated · (c) a plain member aiming `p_user_id` at a colleague gets nothing, unscoped gets only her own bucket · (d) guest and cross-studio owner get nothing · (e) the five literals return, the sixth raises `22023`, and the unset activity prints "activity not set" (HT-24) · (f) **W1-R10-03's read half**: a plain co-member reads 0 rows of a studio-mate's hour on a non-rostered project and cannot reach his rate, with the 00598 control; **(f4)** the residue pinned (below) · (g) the 00484-registered read narrowed: own row yes, teammate's no · (i) a running timer is in no total |
| `supabase/tests/rls/project_hours_total_test.sql` | (a) **the payoff** — a rostered member reads 3 of 4 rows and still gets the whole 210-minute / 50 000-cent project total · (b) the plain-member designer · (c) owner and admin · (d) unrostered co-member, (e) guest, (f) another studio's owner all refused `42501` · (g) the return shape is exactly minutes / billable_minutes / amount_cents, DEFINER · (h) running excluded |

Also edited: `supabase/tests/edge_api/public_rpc_authorization_contract_test.sql` — one re-registered expected qual (above).

---

## Gate results (verbatim commands, on 54422, after a clean `supabase db reset`)

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean** — `Finished supabase db reset on branch main.` `pg_postmaster_start_time() = 2026-09-12 17:30:54.609594+00`. Object probe after the reset (never the ledger table): `time_entry_ledger`, `studio_hours_rollup(uuid,date,date,text,uuid,uuid)`, `project_hours_total(uuid)`, `project_pricing_studio_id(uuid)`, `audit_time_entry_change()` all resolve; `updated_by` present; the three SELECT policies carry the narrowed quals |
| `run-sql-tests.sh -d …/tests/billing -H 127.0.0.1 -p 54422` | **7 / 7 green** (incl. the new `time_entry_ledger_test.sql`, and W1's `time_rate_resolution_test.sql` unchanged) |
| `run-sql-tests.sh -d …/tests/commercial -H 127.0.0.1 -p 54422` | **10 green / 6 red — unchanged from W1's baseline.** All six abort inside `_countersign_design_services_agreement_impl` ("design services agreement … not found or access denied"), the pre-existing cause plan-v2 §2 and W1 round 10 both record. W2 touches no agreement path |
| `run-sql-tests.sh -d …/tests/rls -f time_entry -H 127.0.0.1 -p 54422` | **2 / 2 green** (`time_entry_admin_write_test.sql`, `time_entry_auto_roster_test.sql`) |
| `run-sql-tests.sh -d …/tests/rls -f hours -H 127.0.0.1 -p 54422` | **2 / 2 green** (`project_hours_total_test.sql`, `studio_hours_rollup_test.sql`) |
| `pnpm --filter @patina/supabase type-check` | clean |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/admin-portal build` | succeeds (pre-existing `ErrorBoundary` import warnings only) |
| `git diff --exit-code packages/supabase/src/database.types.ts` | clean after regen + commit |

Run beyond the named gates, because the narrowing is cross-cutting:

- whole `tests/rls` directory: **27 green / 2 red** — `design_requests_test.sql` (`FAIL 3b: expected no_scans`) and `studio_titles_test.sql` (`FAIL f: … last_owner_protected`), both **documented verbatim** in `supabase/tests/KNOWN_FAILURES.md:114-115` (the runner only read the rls-dir allowlist, so it printed them as unexpected). `00563_proposal_signing_multi_studio.test.sql`, `project_roster_test.sql` and `people_directory_scope_test.sql` all green.
- `tests/edge_api/public_rpc_authorization_contract_test.sql`: **RED, and not W2's** — see finding 1.

---

## Findings for the orchestrator

**1 · MAJOR, not W2's work: W1's `00602`/`00603` stamp violates the 00484→00511 contract, and the shipped contract test is now red.**
`supabase/tests/edge_api/public_rpc_authorization_contract_test.sql:171` asserts *"00511 must not auto-derive a studio for a non-designer lead"* — the 00484→00511 strengthening. `set_project_studio_id_owned` now stamps one anyway. Measured on the isolated stack, independent fixture, every value printed:

```
is_designer       = false
organization_members = one 'member' seat, active, in one active design_studio
INSERT INTO projects (id, name, designer_id, created_by)   -- studio_id NOT supplied
→ projects.studio_id = c6110000-0000-4000-8000-0000000000a1   (want NULL)
```

The failure is at line 171, in fixture setup, far above anything W2 touched; W2 adds no trigger on `projects`. The file is **not** in `supabase/tests/KNOWN_FAILURES.md`, so this is a new red introduced by W1, and it is a substantive question as well as a test: HT-3-b's employer tier deliberately stamps a studio for any lead designer with one employer seat, including one who holds no designer authority at all. Either the contract's expectation moves (a ruling: a non-designer lead may now be priced by her employer) or `00603` needs a `has_designer_domain_role`-style leg. Not fixed here — it is W1's file and W1's ruling.

**2 · The pricing rule now has THREE bodies, and I did not reduce it to one.** W2's brief asks the ledger's `studio_id` to resolve by HT-3-a/b and forbids a second copy. HT-3-a/b already had two bodies before W2, both W1's, and **neither is callable for a studio answer**: `resolve_time_rate_cents` (`00599:327-363`) computes it inline on its way to a rate, `set_project_studio_id_owned` (`00603:190-262`) inline on its way to a stamp. A view cannot call either, and it cannot compute the rule itself — `organization_members`' SELECT policies are own-row/org-admin only, so an INVOKER read returns a partial candidate set, which under HT-3-b turns an ambiguous tier into a confident wrong answer. So 00604 adds the one **callable** form and I deliberately did **not** redefine 00599 or 00603 from W2: both carry postconditions that read their own `prosrc`, and re-deriving the program's most contended function from a different wave for a refactor nobody asked for is the failure mode `patina-db-migrations` step 2 exists for. What replaces single-body-ness: four structural postconditions in 00604 mirroring 00599's own, plus case (b) of `time_entry_ledger_test.sql`, which asserts on three project shapes that the helper returns exactly the studio whose rate priced the hour (including agreeing on NULL/`'none'`). **If you want one body, it is a deliberate follow-up migration redefining 00599 + 00603 to call `project_pricing_studio_id`, gated on W1's whole rate suite.** Flagged, not hidden — it is also written into 00604's banner.

**3 · HT-10-a's narrowing does NOT close the leak for a project's own designer, and cannot without a ruling.** W1-R10-03's measured fixture used a plain-member **designer** reading a colleague's `15000 / studio_member` off a row on *her own* project. Her read comes from `Designers manage their project time entries` (`00177:136-137`) — an `ALL` policy on `projects.designer_id = auth.uid()` with no `user_id` leg — **not** from either of the two SELECT policies HT-10-a names, and plan-v2 §3 lists it as untouched. Narrowing it would also remove the designer's correction of a teammate's entry, which case `(ab4)` of `time_rate_resolution_test.sql` requires (W1-R1-05). RLS cannot hide one column from one actor; that is a column privilege, and the designer legitimately reads the same column on her own rows. So: the two named policies are narrowed (measured: a plain co-member now reads 0 rows and NULL rate), and the residue is **pinned as shipped behaviour** in `studio_hours_rollup_test.sql` case (f4), whose failure message names the ruling and the test to check. **An owed ruling if the confidential rate must be closed against a project's designer too.**

**4 · `project_hours_total` admits three legs, not one.** HT-10-a says "asserts `is_project_team_member` first". Built exactly that way — it is evaluated first — but the OR chain also admits the project's designer and an owner/admin of a studio its designer belongs to, because each can already sum those rows with a plain SELECT (`00177:136-137`, `time_entries_owner_admin_read`), so admitting them escalates nothing and avoids three near-identical total functions. An owner who is not rostered would otherwise be refused her own studio's project total. Stated as an architect choice.

**5 · The admin policy and the resolver's assert key on different studios, by §0.13's own requirement.** 00605's predicate is "admin/owner of **any** studio the project's designer actively belongs to" (the plan's, because §0.13 forbids keying RLS on `projects.studio_id`), while 00601's refusal and 00599's ASSERT 2 key on the **project's** studio (HT-3-a). For an admin whose standing comes from a studio that is not the project's pricing studio, an adjust that re-fires the classifier raises `insufficient_privilege` from the resolver instead of being denied by RLS — a loud refusal, not a silent wrong number. Recorded in 00605's banner; no test pins it (it needs a two-studio designer, which is HT-3-b's ambiguous shape).

**6 · Two fixture traps worth carrying into later waves.** (i) `handle_new_user` already inserts a `profiles` row for every `auth.users` insert with a **NULL `full_name`**, so a fixture using `ON CONFLICT (id) DO NOTHING` leaves every name NULL — which would have made the ledger's `member_name IS NULL` assert (case (d)) pass for the wrong reason. All three new fixtures use `DO UPDATE SET full_name = EXCLUDED.full_name` and case (d) now carries a precondition that the name exists. (ii) `studio_member_rates.effective_from` must cover the entry's `started_at` date; with fixed 2026-03 `started_at` literals a `CURRENT_DATE - 60` rate covers nothing and every case reads `'none'`.

**7 · Deliberate small deviations from plan-v2 §3's letter.** (a) `studio_hours_rollup` is `LANGUAGE plpgsql`, not `LANGUAGE sql`: the same section requires `p_group_by` to *raise* on a sixth value, which a SQL body cannot do. Signature, volatility, security and return shape are the plan's, asserted. (b) The ledger `LEFT JOIN`s `projects` as well as `profiles` (the plan names only `profiles`) — same `security_invoker` row-dropping hazard, and it is what lets W4's project-less internal time survive the view. (c) `notes` is absent from the **view** as well as the rollup; the plan's column list for 00604 never included it and HT-36's detail act reads the table.

**Not done, by scope:** nothing from lane B (the scope lens, `hours-ledger.tsx`, the HT-35 disclosure band and opt-out, the Desk card, `desk-doorway.tsx`, the copy deck, the Sanity article, `hours-ledger-scope.test.tsx`, `e2e/document/hours.spec.ts`). No deploy, no `db push`: nothing left this branch toward Strata, and **W1 must not reach Strata ahead of 00606** (W1-R10-03).
