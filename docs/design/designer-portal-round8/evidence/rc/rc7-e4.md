# RC-7 E4 cabinetry evidence

- Date: 2026-10-29
- Tested tip: `1028ea50c` (branch `r8-rc7-fix`, the RC-7 fix lane carrying 00900/00901). The first E4 delivery tested `3cf79663c05d861863e636fee9f78db7567feded` on `r8-rc7-e4`.
- Isolated Supabase project `patina-rc7-fix`, API 62126 (62121 is held by Tailscale on this host), DB 62122, shadow 62120, pooler 62129; designer 3710. The spec refuses ports 54321/54322; the fixture's own activation creates the marker schema `rc7_e4_activation`, and teardown refuses to run without it.
- Applied migration head: `00901_round8_client_threshold_external_field.sql`. No shared-stack reset.

Ratings are covered, weak or defect.

| ID / clause | Before | Now | Spec | Asserted transition | DB readback | Runs |
|---|---|---|---|---|---|---|
| A16 designer intent, maker development, sample, interfaces, site verification, commercial scope and exact contents | weak | weak | `rc7-e4-cabinetry.spec.ts:181`, test `RC-7 E4 GC cabinetry transitions › A17/A18: GC path records each act; substitution holds only affected units`, lines 181–297 | Native quote/contract events, studio-admin verification, issue, bound/approved drawing, frozen two-member instruction. Sample, appliance and field-measure facts are opaque reported JSON, not individually enforced workflow acts. | `project_external_fulfilment_events` ordered sequence: `quote_reported`, `contract_reported` verified by the studio admin, `package_issued`, `hold`, `fabrication_instruction` with `amount_cents=2840000`, `affected_units={k-1,k-2}`. Readback: quote `:229` (the `event()` helper at `:30–35` reads `event_kind, evidence_level`), contract `verified_by` `:63–67` via `:232`, `package_issued` `:238`, hold `:252`, instruction `:258`. | Run 1 and run 2: pass on chromium and webkit-iphone; pairs (a) and (b): pass on webkit-iphone (GC-path test). |
| A16 alternate designer-detail route with maker verification | weak | weak | `rc7-e4-cabinetry.spec.ts:181`, test `RC-7 E4 GC cabinetry transitions › A17/A18: GC path records each act; substitution holds only affected units`, designer-detail block at lines 298–322. It runs inside that test after the GC package is installed, so there is no separate test. | Native `gc_cabinetry` fulfilment with configuration; contract verified by the studio admin, exact issue, preapproval evidence binding, approved revision, three-member manifest created by the designer, independent instruction. Maker's own authenticated verification of design details is not recorded; approval is by designer. | `project_external_fulfilment_evidence_bindings.covers_plan_issue_id` equals current issue and `covers_configuration_snapshot_hash` equals current configuration; instruction `evidence_route=shop_drawing`, `amount_cents=900000`, units `{p-1}`. UI `[data-route=detail-verification]` visible. Readback: contract verified `:305`, issue `:307`, binding `:309–310`, approved revision `:312`, three manifest members `:316`, instruction `:318`, zero POs `:320`, UI `:322`. | Run 1 and run 2: pass on chromium and webkit-iphone; pairs (a) and (b): pass on webkit-iphone (GC-path test). |
| A17 GC external lifecycle, no studio PO or studio purchase | weak | covered | `rc7-e4-cabinetry.spec.ts:181`, test `RC-7 E4 GC cabinetry transitions › A17/A18: GC path records each act; substitution holds only affected units`, lines 181–297 | Native create → quote → contract → verification → issue → K1/K2 instruction → receipt → refused install (hold open) → approved substitution releases K3/K4 → refused install (K3/K4 uninstructed) → K3/K4 instruction → installed report → studio-admin verification. The verifier is a separate studio admin seeded for the purpose, not the GC. Native `record_studio_purchase` refuses the converted line with `23514 external_presence_studio_purchase_refused`; native `create_purchase_order` with its vendor refuses with `23514 external_presence_purchase_order_refused`. | `project_external_fulfilments.status` (event count) after each act: planned (0), planned (1), contracted (2), issued (3), issued (4, hold), instructed (5), received (6), received (7, release), received (8, K3/K4 instruction), received (9, installed report), installed (9, verified). At every state: `purchase_orders=0`, `studio_purchases=0`, `invoices=0`, sum invoice line `amount_cents=0`. Readback: `state()` at `:72–82` (status and event count, PO/studio-purchase/invoice counts and invoice-line sum, `line_total_cents`, readiness), called at `:208, 227, 231, 233, 239, 245, 254, 256, 260, 263, 265, 278, 282, 284, 287`; refusals `:222–226`. | Run 1 and run 2: pass on chromium and webkit-iphone; pairs (a) and (b): pass on webkit-iphone (GC-path test). |
| A17 furnishing estimate, procurement readiness/release, payable and paid closeout | weak | weak | `rc7-e4-cabinetry.spec.ts:181`, test `RC-7 E4 GC cabinetry transitions › A17/A18: GC path records each act; substitution holds only affected units` | Before conversion the selected, vendor-bound line reads ready with no missing fields and rolls into the derived budget. `set_ffe_item_external_fulfilment` converts it; the conversion receipt keeps its 2,840,000-cent pricing snapshot. After conversion the readiness reader returns external/not-ready, and the derived budget drops the cabinetry line while the priced studio lighting control line stays. Budgets are derived inside `BEGIN … ROLLBACK`. No studio procurement release, payable, paid closeout or native external estimate acceptance is enacted. | Budget `lines` before: Cabinetry 2,840,000 and Lighting 450,000 in E4 Kitchen; after: Lighting 450,000 only. Draft `version.targetTotalCents` is 0 both times (draft totals are only written at publish). `externalSelections` before `[]`, after the converted line with null client prices. Receipt `pricing_snapshot` `line_total_cents`/`unit_price_cents` 2,840,000. No budget version persists. Readback: readiness `:188`; `derivedBudget()` at `:86–91` (`derive_working_budget_draft` inside `BEGIN … ROLLBACK`) read at `:190` and `:211`; lines `:193`, `:214`; `externalSelections` `:197`, `:215`; receipt `:204`; budget versions `:219`. | Run 1 and run 2: pass on chromium and webkit-iphone; pairs (a) and (b): pass on webkit-iphone (GC-path test). |
| A18 impact proposal and per-unit holds | weak | weak | `rc7-e4-cabinetry.spec.ts:181`, test `RC-7 E4 GC cabinetry transitions › A17/A18: GC path records each act; substitution holds only affected units` | Reported hold names K3/K4 and records proposed +38,000 cents, +7 days, re-drilling, pending approval, and GC/maker/studio recipients as opaque JSON. Native instruction of K3 refused `fabrication_hold_open`; K1/K2 separately instructed. The substitution submittal, bound to K3/K4 and approved by the designer, releases the hold. No authenticated recipient acknowledgement. | Hold affected `{k-3,k-4}`, `evidence.drilling=Re-bore K3/K4 pulls`, `priceDeltaCents=38000`, `delayDays=7`; first instruction only `{k-1,k-2}`; `release_hold.releases_event_id` equals the hold; second instruction `{k-3,k-4}`. Browser while held: K1 instructed, K3 held, held units `k-3, k-4`; after installation: hold released, K1 and K3 instructed. Readback: hold `:252`, refused K3 `:255`, first instruction `:258`, release `:277`, second instruction `:281`; UI `:270–272`, `:292–296`. | Run 1 and run 2: pass on chromium and webkit-iphone; pairs (a) and (b): pass on webkit-iphone (GC-path test). |
| A18 readiness ≠ instruction, receipt ≠ acceptance | weak | covered | `rc7-e4-cabinetry.spec.ts:181`, test `RC-7 E4 GC cabinetry transitions › A17/A18: GC path records each act; substitution holds only affected units` | Approved revision leaves status issued and event count unchanged; receipt remains reported and is not an acceptance event. | Before instruction status issued with three events; after approval still issued with three; receipt `evidence_level=reported`; installed only after a separate verifier RPC. Readback: approval with status unchanged `:244–245`, receipt `:262`, verifier then `installed` `:285–287`. | Run 1 and run 2: pass on chromium and webkit-iphone; pairs (a) and (b): pass on webkit-iphone (GC-path test). |
| RC7-E4-1 installation with an open hold or uninstructed unit | defect | covered | `rc7-e4-cabinetry.spec.ts:327`, test `RC-7 E4 GC cabinetry transitions › RC7-E4-1: installation cannot close a package while held units remain` (self-contained) | Own fulfilment K1–K4 on `pkg.e4`; hardware decision 602 bound to all units, K3/K4 held on 602. Install refused `55000 fulfilment_hold_open` before and after K1/K2 instruction; K3 instruction refused `fabrication_hold_open`; release on approved 602 succeeds; install refused `fulfilment_units_uninstructed` until K3/K4 are instructed; install then records. A hold opened after the report makes the studio admin's verification fail `fulfilment_hold_open`; after its release verification closes the package. | No `installed` event while held; after the late hold the installed event stays `reported` with no verification receipt and status `instructed`; finally status `installed` with zero open holds. Readback: issue `:333`, held installs refused `:336`, `:343`, held instruction refused `:342`, zero `installed` events `:344`, uninstructed install refused `:348`, late-hold verification refused `:355`, unverified installed event `:357`, closing verification `:361`, final status and open holds `:362`. | Run 1 and run 2: pass on chromium and webkit-iphone; pairs (a) and (b): pass on webkit-iphone. |

## Activation, exact SQL

The fixture runs only on a stack its owner has marked. Before the spec runs, the stack owner provisions the marker as `supabase_admin`, and the spec is handed the same name in `RC7_E4_STACK` (after it refuses ports 54321/54322):

```sql
-- docker exec -e PGPASSWORD=postgres supabase_db_patina-rc7-fix psql -h 127.0.0.1 -U supabase_admin -d postgres
CREATE SCHEMA rc7_owned;
CREATE TABLE rc7_owned.stack(project_id text PRIMARY KEY);
INSERT INTO rc7_owned.stack VALUES ('patina-rc7-fix');
REVOKE ALL ON SCHEMA rc7_owned FROM PUBLIC;
GRANT USAGE ON SCHEMA rc7_owned TO postgres;
GRANT SELECT ON rc7_owned.stack TO postgres;
```

The fixture refuses unless `rc7_owned.stack` exists, is owned by `supabase_admin`, and holds the row the spec named. On the owned stack, a rolled-back run without the marker refused, a run naming another stack refused, and a run naming `patina-rc7-fix` proceeded. The marker is not E4 residue; it goes with the stack at teardown.

The fixture activates in its own transaction and records what it changed:
- creates schema `rc7_e4_activation` with table `prior(capability_enabled, granted regprocedure[])`;
- grants EXECUTE to `authenticated` on each of these that `authenticated` could not already execute:
  - C5: `create_external_fulfilment`, `record_external_fulfilment_event`, `verify_external_fulfilment_event`, `bind_fulfilment_evidence`, `record_fabrication_instruction`, `set_ffe_item_external_fulfilment`;
  - C3 activation table: `grant_fabrication_authority`, `revoke_fabrication_authority`, and C1 `create_evidence_manifest`;
  - C2: `apply_service_arrangement`, `assign_ffe_items_to_scope_package`, `reconcile_scope_edition`;
- records the prior `scope_editions` value and sets it to true.

Every act, including the fabrication-authority grant and evidence-manifest creation, runs `SET LOCAL ROLE authenticated` with the real actor JWT; nothing runs as `service_role`. Teardown requires the marker, revokes exactly the recorded grants, restores the capability, deletes rows in replica mode (including `decision_notifications`, `notification_log` and `audit_logs`, which replica-mode deletes would otherwise orphan), drops the marker, and asserts zero E4 rows across projects, FF&E items, fulfilments, manifests, authority, plan issues, budget versions, decisions, notifications, audit logs, vendors, memberships, auth users and the marker schema.

## Commands / results

The env file (mode 600, outside the worktree) exports `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:62126`, the anon and service-role keys from `supabase status -o env`, `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:62122/postgres`, `PLAYWRIGHT_DESIGNER_PORT=3710` and `RC7_E4_STACK=patina-rc7-fix`. `@patina/supabase` is consumed from source, so there is no dist to rebuild. Every run used `--workers=1`, one run at a time. The config's own web server is `next dev --webpack -p 3710`. Swap is `sysctl vm.swapusage` at the start of each run (28,672 MB total).

Verbatim commands follow. `$SP` is the session scratch directory, `$WT` is `/Users/kody/Code/patina-r8-rc7-fix/apps/designer-portal`, and every command starts with `cd $WT && source $SP/rc7fix-browser.env`. The round-8 config's default projects are `chromium` and `webkit-iphone`. Each run also exported `PLAYWRIGHT_OUTPUT_DIR=$SP/<log name>` and wrapped the run as `{ echo "SWAP $(sysctl -n vm.swapusage)"; <command>; echo EXIT=$?; } > $SP/<log name>.log 2>&1`. Run 1 had no `SWAP` line.

```sh
# Runs 1 and 2: E4 + C03, both projects
pnpm exec playwright test --config playwright.round8.config.ts --workers=1 \
  e2e/round8/rc7-e4-cabinetry.spec.ts e2e/round8/phone-line-editor.spec.ts

# C03 reruns A/B and baseline A/B: the two failing C03 tests, both projects
pnpm exec playwright test --config playwright.round8.config.ts --workers=1 \
  -g "recovers the draft and focused alert|touch/keyboard fit" e2e/round8/phone-line-editor.spec.ts

# Baseline substitution, run from the worktree root before baseline A/B and pair (b), restored after each
P="apps/designer-portal/src/components/document/pieces/spec-fields-pane.tsx packages/supabase/src/hooks/use-spec-books.ts packages/supabase/src/hooks/index.ts apps/designer-portal/e2e/round8/phone-line-editor.spec.ts"
for f in $P; do git show 0e6dc6e53:$f > $f; done
git checkout HEAD -- $P apps/designer-portal/next-env.d.ts; git status --short   # empty after each

# Pairs (a) at HEAD and (b) with the baseline substitution: webkit-iphone, E4 then C03
pnpm exec playwright test --config $SP/pair/playwright.pair.config.ts --workers=1

# E6 copies A/B: both projects
pnpm exec playwright test --config $SP/e6copy/apps/designer-portal/playwright.e6copy.config.ts --workers=1 \
  -g "order entry|A02|A06"
```

Temporary scratch config for the pairs, `$SP/pair/playwright.pair.config.ts` (not committed):

```ts
import round8 from '$WT/playwright.round8.config.ts';
const webkit = (round8.projects ?? []).find((p) => p.name === 'webkit-iphone')!;
export default {
  ...round8,
  testDir: '$WT/e2e/round8',
  globalSetup: '$WT/e2e/round8/global-setup.ts',
  globalTeardown: '$WT/e2e/round8/global-teardown.ts',
  webServer: { ...(round8.webServer as object), cwd: '$WT' },
  projects: [
    { ...webkit, name: 'webkit-e4', testMatch: /rc7-e4-cabinetry\.spec\.ts/ },
    { ...webkit, name: 'webkit-c03', testMatch: /phone-line-editor\.spec\.ts/, dependencies: ['webkit-e4'] },
  ],
};
```

Temporary E6 copies (not committed). Each file in `$SP/e6copy/apps/designer-portal/e2e/round8/` is `git show a764932cf:apps/designer-portal/e2e/round8/<file>`. `e2e/fixtures` and `e2e/helpers` are symlinks to `$WT/e2e/…`. The runner is `$SP/e6copy/apps/designer-portal/playwright.e6copy.config.ts`, which has the same shape as the pair config but no `projects` override and `testDir: '$SP/e6copy/apps/designer-portal/e2e/round8'`. The full diff against `a764932cf`, where `rc7-e6-entry-fixture.sql` is unchanged:

```diff
--- a764932cf:rc7-e6-entry.spec.ts
+++ scratch:rc7-e6-entry.spec.ts
@@ -39,4 +39,4 @@
-    expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).port).toBe('61121');
-    expect(new URL(process.env.SUPABASE_DB_URL!).port).toBe('61122');
-    expect(psqlScalar(`SELECT current_setting('rc7.e6_stack', true);`)).toBe('patina-rc7-e6');
-    psqlRun(readFileSync(path.join(__dirname, 'rc7-e6-entry-fixture.sql'), 'utf8'));
+    expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).port).toBe('62126');
+    expect(new URL(process.env.SUPABASE_DB_URL!).port).toBe('62122');
+    expect(psqlScalar(`SELECT project_id FROM rc7_owned.stack;`)).toBe('patina-rc7-fix');
+    psqlRun(`SELECT set_config('rc7.e6_stack', 'patina-rc7-e6', false);\n` + readFileSync(path.join(__dirname, 'rc7-e6-entry-fixture.sql'), 'utf8'));
@@ -48 +48,2 @@
-    psqlRun(`BEGIN; DO $$ BEGIN
+    psqlRun(`SELECT set_config('rc7.e6_stack', 'patina-rc7-e6', false);
+BEGIN; DO $$ BEGIN
@@ -110 +111 @@
-  test.fixme('order entry returns to the exact order row, scroll and focus without replay', async ({ authenticatedPage: page }) => {
+  test('order entry returns to the exact order row, scroll and focus without replay', async ({ authenticatedPage: page }) => {
--- a764932cf:rc7-e6-nested.spec.ts
+++ scratch:rc7-e6-nested.spec.ts
@@ -35,2 +35,2 @@
-  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).port).toBe('61121');
-  expect(new URL(process.env.SUPABASE_DB_URL!).port).toBe('61122');
+  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).port).toBe('62126');
+  expect(new URL(process.env.SUPABASE_DB_URL!).port).toBe('62122');
--- a764932cf:rc7-e6-ffe.spec.ts
+++ scratch:rc7-e6-ffe.spec.ts
@@ -33 +33 @@
-test.fixme('A06 stale FF&E save refetches the peer, retains the typed draft and retries once', async ({ authenticatedPage: page, browser }) => {
+test('A06 stale FF&E save refetches the peer, retains the typed draft and retries once', async ({ authenticatedPage: page, browser }) => {
@@ -35,2 +35,2 @@
-  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).port).toBe('61121');
-  expect(new URL(process.env.SUPABASE_DB_URL!).port).toBe('61122');
+  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).port).toBe('62126');
+  expect(new URL(process.env.SUPABASE_DB_URL!).port).toBe('62122');
@@ -75 +75 @@
-  await expect(alert).toContainText(/Finish changed in another session to "E6 peer finish"\. Save again to replace it\./);
+  await expect(alert).toContainText(/Finish changed in another session to ["“]E6 peer finish["”]\. Save again to replace it\./);
```

| Run | Tip | Scope | Result | Swap used |
|---|---|---|---|---|
| 1 | `1028ea50c` | E4 + C03, both projects | 17/22. E4 4/4. C03 failed: chromium 390 touch (:386); webkit 320 and 390 late refusal (:158); webkit 320 touch (:381); webkit 390 touch (:386) | not recorded |
| C03 rerun A | `1028ea50c` | C03 late-refusal + touch tests, both projects | 7/8; chromium 320 touch (:386) | 27,664 MB |
| C03 rerun B | `1028ea50c` | same | 8/8 | 27,584 MB |
| Baseline A | `0e6dc6e53` pane, hook, hooks index and C03 spec over `1028ea50c` | same | 8/8 | 27,504 MB |
| Baseline B | same | same | 8/8 | 27,432 MB |
| 2 | `1028ea50c` | E4 + C03, both projects | 21/22. E4 4/4. C03 failed: webkit 320 late refusal (:158) | 27,120 MB |
| Pair (a) | `1028ea50c` | webkit-iphone, E4 then C03 (C03 depends on E4) | 11/11 | 27,767 MB |
| Pair (b) | `0e6dc6e53` pane, hook, hooks index and C03 spec, E4 at `1028ea50c` | same | 11/11 | 27,503 MB |
| E6 copy A | `1028ea50c` | E6 reproducers, both projects | 4/6; A06 failed on both | 27,983 MB |
| E6 copy B | same | same | 4/6; A06 failed on both | 27,903 MB |

The baseline files were swapped in with `git show 0e6dc6e53:<path>` and restored with `git checkout HEAD -- <paths>`; `git status --short` was empty after each. No Postgres `exit code 2` or `PGRST002` appeared in any run, so no run is infra-interrupted.

After run 2 and again after the pairs, the owned stack held no E4 residue: no `rc7_e4_activation` schema, `scope_editions` off, `authenticated` without EXECUTE on `record_fabrication_instruction`, zero external fulfilments and events, zero E4 auth users.

**C03 is intermittent; regression status unresolved.**
- The candidate (`1028ea50c`) passed 54 of 61 C03 executions: run 1 13/18, rerun A 7/8, rerun B 8/8, run 2 17/18, pair (a) 9/9.
- The baseline passed 25 of 25: baseline A 8/8, baseline B 8/8, pair (b) 9/9. The baseline did not check out `0e6dc6e53`. It swapped the old pane, hook, hooks index and C03 spec over the candidate tree, as shown above. Its sample is smaller, and it never ran the full E4 + C03 set on chromium.
- Every candidate failure is an element not found within Playwright's default 5 s wait just after a navigation: `phone-line-editor.spec.ts:158` and `:381` (the Finish textbox after `page.reload`) and `:386` (`[data-spec-line-missing]` after `page.goto`).
- The chromium `:386` snapshot showed the document still loading ("Picking up the document…"). The other post-navigation waits at `:44`, `:94`, `:132`, `:169` and `:263` already pass `{ timeout: 60_000 }`, and none of them failed.
- Recorded swap was 27.1–28.0 GB used of 28.7 GB; run 1 has no swap reading. Resource pressure slowing the first paint is a hypothesis, not a finding. Nothing here separates it from a candidate-only slowdown.
- Resolution plan: at merge, the integration lead raises the waits at `:158`, `:381` and `:386` to `{ timeout: 60_000 }`, then runs C03 twice on both projects in the merged gate. If C03 still fails after that, it is treated as a regression.

**E6 reproducers.** These were copies in a scratch directory, not committed. They were made from `a764932cf` with the fixme removed, ports set to 62126/62122, and the stack marker checked. `rc7-e6-entry-fixture.sql` was unchanged. RC7-E6-2 (Orders entry/order) and nested A02 passed on both projects in both runs. A06 failed on both projects in both runs: the spec encodes the 409 path, and the user contract held on chromium. On chromium the alert, the kept draft and the retry all held; the spec failed at `rc7-e6-ffe.spec.ts:83`, counting `writes` 1 where it expects 2. That is because the pane catches the conflict at commit, without sending a PATCH that returns 409. On webkit there was no alert and Finish showed the draft, because the peer's value was already shown before typing. E6 owns that spec change.

The E2 reproducer for RC7-e2-1 (fixed in `1028ea50c`) stays in E2's lane: `r8-rc7-e2` at `7ca21c5dc`, `apps/designer-portal/e2e/round8/rc7-e2-consumer-journey.journey.ts:1017` (`test.fixme('@rc7-e2-defect …')`). It was not run here.

## Defects / not verified

**RC7-E4-1 — fixed by `00900_round8_external_install_hold_guard.sql`.** The defect: with K3/K4 held and K1/K2 instructed, a verified installation set the whole fulfilment `installed`, and `installed` is terminal, so the hold could never be released. 00900 refuses an `installed` event in `record_external_fulfilment_event` and in `verify_external_fulfilment_event` while any hold is unreleased, or while a unit of a fulfilment with a fabrication contract (`contracting_party_kind <> 'none'`) has no fabrication instruction. `_external_refresh_status` never derives `installed` in either case. The `RC7-E4-1` test, formerly `test.fixme`, is enabled and passes in every browser run below; SQL coverage is `supabase/tests/round8/external_install_hold_guard_test.sql`.

A16 sample, hardware/appliance interface and site verification are reported facts, not individually protected transitions. Maker verification identity of designer detail is not proven. A17 external estimate acceptance, procurement release and paid closeout remain unverified; zero payable is inferred from absent invoices, not a payable-total reader. A18 substitution recipient acknowledgement and price/time approval are not enacted; the release is the designer's approval of the bound submittal.

Known debt (RC7-E6-3 fix lane): the Spec pane now answers a stale `row_version` save with the peer's row, keeps the draft and saves again. The spec-book workbench (`spec-book-workspace.tsx`), which also uses `useUpdateProjectFfeSpec`, still shows `This selection changed in another session. Refresh before saving.` and is not refetched on conflict, because it reseeds its open form from a refetched row and would drop the draft.

Known debt (RC7-E6-3 fix lane): a chosen image that conflicts with another session stays in the Spec pane preview as a kept draft. Enter on the empty link field saves it again, and the alert says so. There is no control to clear it; it leaves only when it is saved, replaced by another choice, or the pane closes. It does not hold the sheet open.

Harness debt: `e2e/helpers/psql.ts:21`, `e2e/round8/global-setup.ts:11`, `global-teardown.ts:8` fall back to `127.0.0.1:54322`. The E4 spec refuses 54321/54322 in `beforeAll`, and every invocation exports and asserts `SUPABASE_DB_URL` for 62122.

Harness debt (C03): `phone-line-editor.spec.ts:158`, `:381` and `:386` wait the default 5 s after `page.reload`/`page.goto`; the proposal is `{ timeout: 60_000 }` to match `:263`. No spec edit in this lane. The integration lead applies this at merge, as in the C03 resolution plan above.

## Teardown

`supabase stop --workdir <scratch>/rc7fix.36AB --no-backup` reported `project_id_filter: patina-rc7-fix`, with the marker going with the stack. Afterwards there were no listeners on 62120, 62122, 62123, 62124, 62126, 62127, 62129, 62183 or 3710; no `next dev` on 3710; and zero containers or volumes named `patina-rc7-fix`. The shared stack (54321/54322) was not touched.
