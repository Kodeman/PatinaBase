# RC-7 E4 cabinetry evidence

- Date: 2026-10-29
- Tested worktree base: `3cf79663c05d861863e636fee9f78db7567feded` (commit SHA recorded at delivery); branch `r8-rc7-e4`.
- Isolated Supabase project `patina-rc7-e4`, API 60121, DB 60122, shadow 60120, pooler 60129; designer 3510. Database system identifier `7702030541241491498`.
- Applied migration head: `00899_round8_service_acceptance_offline_presentation.sql`; timestamped migration `20260910152111_create_contact_messages.sql` also applied. No shared-stack reset.

| ID / clause | Before | Now | Spec | Asserted transition | DB readback | Runs |
|---|---|---|---|---|---|---|
| A16 designer intent, maker development, sample, interfaces, site verification, commercial scope and exact contents | weak | weak | `rc7-e4-cabinetry.spec.ts`, GC path | Native quote/contract events, verification, issue, bound/approved drawing, frozen two-member instruction. Sample, appliance and field-measure facts are opaque reported JSON, not individually enforced workflow acts. | `project_external_fulfilment_events` ordered sequence: `quote_reported`, `contract_reported` verified by GC, `package_issued`, `hold`, `fabrication_instruction` with `amount_cents=2840000`, `affected_units={k-1,k-2}`. | chromium 2/2; webkit-iphone 2/2 |
| A16 alternate designer-detail route with maker verification | weak | weak | same spec, detail route | Native `gc_cabinetry` fulfilment with configuration; verified contract, exact issue, preapproval evidence binding, approved revision, three-member manifest, independent instruction. Maker's own authenticated verification of design details is not recorded; approval is by designer. | `project_external_fulfilment_evidence_bindings.covers_plan_issue_id` equals current issue and `covers_configuration_snapshot_hash` equals current configuration; instruction `evidence_route=shop_drawing`, `amount_cents=900000`, units `{p-1}`. UI `[data-route=detail-verification]` visible. | chromium 2/2; webkit-iphone 2/2 |
| A17 GC external lifecycle, no studio PO or studio purchase | weak | covered (external state and commerce absence) | same spec, GC path | Native create → quote → contract → verification → issue → instruction → receipt → installed report → verified installation. | `project_external_fulfilments.status` read after each act: planned, planned, contracted, contracted, issued, issued, instructed, received, received, installed. At every state: `purchase_orders=0`, `studio_purchases=0`, `invoices=0`, sum invoice line `amount_cents=0`. | chromium 2/2; webkit-iphone 2/2 |
| A17 furnishing estimate, procurement readiness/release, payable and paid closeout | weak | partial | same spec | Converts an ordinary priced FF&E selection through `set_ffe_item_external_fulfilment`, then derives a working budget draft inside `BEGIN … ROLLBACK` so no version persists. The native singleton readiness reader returns external/not-ready with no missing studio fields. No studio procurement release, payable, paid closeout or native external estimate acceptance is enacted. | Original 2,840,000-cent line becomes externally bound with `line_total_cents=0`; budget `externalSelections` retains its identity and reports null client prices, with zero studio target. FF&E live line total, studio PO/purchase, invoice rows and invoice-line totals remain zero at each lifecycle state. | chromium 2/2; webkit-iphone 2/2 |
| A18 impact proposal and per-unit holds | weak | weak | same spec | Reported hold names K3/K4 and records proposed +38,000 cents, +7 days, re-drilling, pending approval, and GC/maker/studio recipients as opaque JSON. Native instruction of K3 rejected `fabrication_hold_open`; K1/K2 separately instructed. No authenticated substitution approval/recipient acknowledgement. | `project_external_fulfilment_events`: hold affected `{k-3,k-4}`, `evidence.drilling=Re-bore K3/K4 pulls`, `priceDeltaCents=38000`, `delayDays=7`; instruction only `{k-1,k-2}`. Browser K1 instructed, K3 held. | chromium 2/2; webkit-iphone 2/2 |
| A18 readiness ≠ instruction, receipt ≠ acceptance | weak | covered (specified state distinction) | same spec | Approved revision leaves status issued and event count unchanged; receipt remains reported and is not an acceptance event. | Before instruction status issued with three events; after approval still issued with three; receipt `evidence_level=reported`; installed only after a separate verifier RPC. | chromium 2/2; webkit-iphone 2/2 |

## Activation, exact SQL

Guarded against `pg_control_system().system_identifier = 7702030541241491498` on DB 60122, then:
```sql
BEGIN;
DO $$ BEGIN IF (SELECT system_identifier FROM pg_control_system()) <> 7702030541241491498 THEN RAISE EXCEPTION 'E4 owned stack required'; END IF; END $$;
UPDATE public.server_capabilities SET enabled=true WHERE key='scope_editions';
GRANT EXECUTE ON FUNCTION public.apply_service_arrangement(uuid,text,uuid), public.assign_ffe_items_to_scope_package(uuid,uuid[],text,text), public.reconcile_scope_edition(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_external_fulfilment(uuid,uuid,text,text,text[],uuid,uuid,text), public.record_external_fulfilment_event(uuid,text,jsonb,text[],text), public.verify_external_fulfilment_event(uuid,text), public.bind_fulfilment_evidence(uuid,uuid,text[],text), public.record_fabrication_instruction(uuid,uuid,uuid,text[],jsonb,uuid), public.set_ffe_item_external_fulfilment(uuid,uuid,bigint,text) TO authenticated;
COMMIT;
```
Fabrication-authority grant and evidence-manifest creation retain their shipped `service_role` ACL; tests set the real designer's JWT identity when calling these product RPCs as service_role. Other C5 acts run `SET LOCAL ROLE authenticated` with real actor JWT identities.

Cron: `postgres` could not `ALTER SYSTEM` (`permission denied to set parameter cron.launch_active_jobs`); owned `supabase_admin` ran `ALTER SYSTEM SET cron.launch_active_jobs = off; SELECT pg_reload_conf();`. A subsequent connection observed `SHOW cron.launch_active_jobs = off`; `NOTIFY pgrst, 'reload schema'`, `/rest/v1/` returned 200.

## Commands / results

- `pnpm --dir /Users/kody/Code/patina-r8-rc7-e4 install --frozen-lockfile --offline`: exit 0.
- `pnpm --dir /Users/kody/Code/patina-r8-rc7-e4 exec turbo run build '--filter=@patina/designer-portal^...' '--filter=@patina/client-portal^...'`: 8 successful / 8 cached.
- `pnpm --dir /Users/kody/Code/patina-r8-rc7-e4 --filter @patina/designer-portal type-check`: exit 0, `tsc --noEmit`.
- `pnpm --dir /Users/kody/Code/patina-r8-rc7-e4 --filter @patina/designer-portal lint`: exit 0; 250 problems (0 errors, 250 warnings).
- `pnpm --dir /Users/kody/Code/patina-r8-rc7-e4/apps/designer-portal exec playwright test e2e/round8/rc7-e4-cabinetry.spec.ts --config playwright.round8.config.ts --project chromium --workers=1`: final spec twice; each 1 passed, 1 skipped (`test.fixme`), 4.9m and 1.7m.
- Same command with `--project webkit-iphone`: final spec twice; each 1 passed, 1 skipped (`test.fixme`), 1.7m and 1.0m.
- Final `pnpm --dir /Users/kody/Code/patina-r8-rc7-e4 --filter @patina/designer-portal type-check`: exit 0 (`tsc --noEmit`); final lint: exit 0, 0 errors and 250 pre-existing warnings.
- Infra-interrupted attempts were not counted: owned Postgres backend exit code 2 / VM-wide recovery at 11:14 and 11:27 UTC interrupted F01 warmup/fixture setup. One later F01 `/desk` authenticated warmup timed out at 120s before the E4 body, with REST still 200; retry completed. Earlier spec revisions exposed a missing selection-thread primary in the fixture and the product conversion's zero (not null) studio-price result; both test expectations were corrected before the four counted passes.

## Defects / not verified

**RC7-E4-1 — installed with an open unit hold (high severity, high confidence).** With K3/K4 held and K1/K2 independently instructed, report installation and have the GC verify the installation event. `_external_refresh_status` in `00875_round8_external_fulfilment.sql:199` sets the whole fulfilment `installed` from any verified installation; it does not inspect unreleased hold events or the reported installed units. The same migration's event writer rejects further acts on `installed` as `fulfilment_terminal` (around line 263), so K3/K4 cannot be released through the normal event path. The main journey observes this state and the accompanying `test.fixme` encodes the desired `received`-with-open-hold expectation (enable it to see the failure). Product fix, outside E4 ownership: refuse both installation recording and verification while any scoped hold remains open; leave the fulfilment nonterminal so a release can proceed.

A16 sample, hardware/appliance interface and site verification are reported facts, not individually protected transitions. Maker verification identity of designer detail is not proven. A17 external estimate acceptance, procurement release and paid closeout remain unverified; zero payable is inferred from absent invoices, not a payable-total reader. A18 substitution recipient acknowledgement, price/time approval and re-drilling release are not enacted. The browser invoked a help-system Sanity read that failed; no production mutation was attempted.

Harness debt: `e2e/helpers/psql.ts:21`, `e2e/round8/global-setup.ts:11`, `global-teardown.ts:8` have fallback `127.0.0.1:54322`; every Playwright invocation explicitly exported `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:60122/postgres` and asserted it. `grep -nE '5432[12]'` found no match in the two E4-owned files.

## Teardown

E4 `afterAll` deleted its fixture and asserted the E4 project absent; F01 global teardown removed its studio/project. Final SQL found zero E4/F01 projects. `supabase stop --workdir <owned E4 scratch stack> --no-backup` returned `Stopped supabase local development setup` with `backup=false`; no `patina-rc7-e4` containers remain. Ports 3510, 60120, 60121, 60122 and 60129 had no listeners after shutdown. The shared stack was untouched.
