# RC-7 lane e2 — service acceptance, completion and care journeys (A20–A23)

## Header

- Worktree `/Users/kody/Code/patina-r8-rc7-e2`, branch `r8-rc7-e2`. Tested tip: `47d500f1e` (base `3cf79663c` + lane commits `56bbb23cf`, `7ca21c5dc`, `28f3bf3e9`, `47d500f1e`). Both counted runs ran this committed tree; the stack receipts record head `47d500f1e`.
- Owned stack: `project_id` `patina-rc7-e2`; API 57121, DB 57122, shadow 57120, pooler 57129, inspector 57183. Designer portal 3110, client portal 3112. `edge-runtime` kept; `EMAIL_DEV_MODE=dry_run`.
- Counted-run stacks: one fresh stack per run, started and stopped by the runner (receipts under Commands).
- Migration head applied: `00899_round8_service_acceptance_offline_presentation` (ledger max `20260910152111`).
- `cron.launch_active_jobs = off` on the owned DB (receipt `cronLaunchActiveJobs: off`). No step needed a scheduled job.
- Date: 2026-10-29.

## Files

- `apps/designer-portal/e2e/round8/rc7-e2-consumer-journey.journey.ts`: three legs with 7 tests, a file-level `test.afterAll` cleanup, and one `test.fixme` (`@rc7-e2-defect`, outside every runner leg) for DEFECT RC7-e2-1.
- `apps/designer-portal/e2e/round8/rc7-e2-consumer-journey.spec.ts`: lane entry for `playwright.round8.config.ts` (projects `chromium`, `webkit-iphone`). It registers the journey only when `RC7_E2_ROUND8=1`. `--list` shows 14 tests with the flag and 0 without.
- `apps/designer-portal/e2e/round8/rc7-e2-fixture.sql`:
  - `\ir consumer-journey-fixture.sql` (job A for the RC-2 household)
  - jobs P (paper), F (full service) and D (design only)
  - extra household members
  - drawing evidence behind uploaded files
  - manifests `rc7-sa-1`
- `apps/designer-portal/e2e/round8/rc7-e2-cleanup.sql` (new):
  - Runs from the journey's `test.afterAll`, on the owned cluster only (system id and server address checked).
  - Deletes the lane's fictional jobs: every project of the F01 designer whose client is an RC2/RC7 fictional actor, plus every row that references them transitively by foreign key. Deletion is transaction-local in replica mode, the pattern `cabinetry-cp01.spec.ts` and `accounts-paper.spec.ts` already use.
  - Unseats the RC2 studio member (`-07`) from the F01 studio; the fixture seats it again on the next application.
  - Refuses if the walk would reach an account, profile, organization, card or household row.
  - Why it exists: the round-8 `global-teardown.ts` deletes the F01 auth users. Without this cleanup, that cascade is refused, first by `guard_proposal_copy_immutability` (00390: "non-draft proposals are immutable editions and cannot be deleted") and then by `last_owner_protected`. The run would exit 1 with "1 error was not a part of any test".
  - Each run read back `{"tables": 52, "rows": 305, "projects": 4, "f01NonDraftProposals": 0}` per project.
- `apps/designer-portal/e2e/round8/run-consumer-journey.mjs` and `.unit.mjs`:
  - One round-8 invocation per run (`--project chromium --project webkit-iphone --workers=1`), expecting 14.
  - Disk floor of 20 GiB.
  - Awaited client-portal stop: SIGTERM, then SIGKILL, and the run fails on any process or port residue.
  - The run fails if 3110 is still listening after the run.
  - No read of the shared stack.

## Criteria

Before = the R3b rating (`evidence/rc/rc6-reviews/r3b-evidence-full.md` rows A20–A23, all **weak**). Now uses only **covered**, **weak** or **defect**.

- A clause is **covered** only when its spec passed on both round-8 projects, `chromium` and `webkit-iphone`, in both counted runs.
- Spec = `rc7-e2-consumer-journey.journey.ts` at the test's line, run through `rc7-e2-consumer-journey.spec.ts` under `playwright.round8.config.ts`.
- Transitions with no UI control go over HTTP with the real actor's own session: `actAs`/`rpcAs` call `/rest/v1/rpc/*` (or REST) with that actor's password-grant JWT.
- psql as `postgres` only applies fixtures, reads back, records the GC's cabinetry delivery on job F (an act outside the studio's), and runs the cleanup.
- Every transition is followed by a DB readback.

Runs: c1 = counted run 1, c2 = counted run 2. Each is `14 passed`, 7 on `chromium` and 7 on `webkit-iphone`, with runner exit 0.

| ID / clause | Before | Now | Spec | Asserted | Readback | Runs |
|---|---|---|---|---|---|---|
| A20 agreed scope edition + required signer policy | weak | covered | R1 :568, R2 :601, R3 :667, paper :756 | client sees `What you’re accepting` for the active edition; evidence buttons disabled until loaded; issued PDF bytes fetched from the popup's signed URL equal `plan_prints.sha256` | `service_acceptance_requests` edition / `scope_content_hash` / `evidence_manifest_hash` / `signer_policy_revision`; `service_acceptance_evidence_snapshots` members | c1 ✓✓, c2 ✓✓ |
| A20 one required accepted, another pending = incomplete | weak | covered | R2 :601, R3 :667 | partner accepts in their own context; the card still reads waiting | request `sent / pending`, one `service_acceptance_responses` row | c1 ✓✓, c2 ✓✓ |
| A20 rejection requires new evidence | weak | covered | R1 :568 → R2 :601 | client returns with a reason; request 2 binds a new manifest (`rc2-sa-2`); nothing carried over | R1 `closed/returned`, response `return` with reason; R2 frozen members = revised drawing set only | c1 ✓✓, c2 ✓✓ |
| A20 signer replacement requires new evidence | weak | defect | R3 :667; fixme :1131 | the card's Replace form cannot offer the household (DEFECT RC7-e2-1). The designer's own session calls `replace_service_acceptance_signer`. Card shows `was replaced` and the new signer `Waiting`. The old signer gets no form; their REST respond → 500 `55000 signer_not_active`. The replacement gets their own V22 notice and accepts with a condition | signer row `replaced`, with reason, `replaced_by` = designer, revision 2; successor card active and required; request revision 2; R3 `closed/accepted_with_conditions` with 2 responses | c1 ✓✓, c2 ✓✓ (RPC path); UI path fails (fixme) |
| A20 superseded scope requires new evidence | weak | covered | R2 :601 | while R2 is pending, the real actors execute an amendment over HTTP. Designer: `create_service_addendum`, `copy_agreement_parts_from_authority`, `upsert_agreement_parts`, `send_commercial_document`. Client: `sign_design_services_agreement`. Designer: `countersign_design_services_agreement`. The card reads `Replaced` / `the agreed scope changed`; client respond → `request_not_open`; the old evidence stays readable, with no answer offered | R2 `superseded`, `scope_edition_superseded`; edition 1 `superseded`, edition 2 active; frozen snapshot unchanged; R3 edition = edition 2 | c1 ✓✓, c2 ✓✓ |
| A20 designer request follows V22 | weak | covered | `sendNotices` :382 (R1–R3, paper, F, D) | `Review and send` sheet; each notice checked by recipient; `Send the N checked`; the row reads `Sent` or leaves the sheet. On WebKit the first tap opened the sheet in every counted send: 0 retap lines in c1 and c2 (see Observations) | `outbound_drafts.status sent`, `delivery_message_id ~ ^dryrun_\d+$`; request `sent` | c1 ✓✓, c2 ✓✓ |
| A20 authenticated client-portal response | weak | covered | R1–R3, F :934, D :1025 | each signer answers in their own browser context on 3112, with the project's device (Desktop Chrome / iPhone 14) | `responses.method portal_authenticated`, `responder` = signer profile | c1 ✓✓, c2 ✓✓ |
| A20 iOS response | weak | weak | — | not run (no simulator or device in this lane; `webkit-iphone` is a browser emulation, not the iOS app) | — | — |
| A20 permitted paper intake → same scoped truth | weak | covered | paper :756 | all-paper household: notices are address-less holds (00891); the studio marks it presented on paper (00899); paper is uploaded per slot (`Record paper for <Slot>`), stamped, and confirmed by a second admin; the client sees `Reviewed paper response` and has no answer of their own | request `sent` via offline presentation, 0 sent drafts; intakes `pending_review` → `confirmed` with stored sha; responses `paper_intake`, `responder NULL`, same edition / scope / evidence hashes; `closed/accepted` | c1 ✓✓, c2 ✓✓ |
| A21 full-service obligations | weak | covered | job F :934 | blockers `studio_line_open`, `studio_installation_open`, `agreed_phase_open` shown; excluded `Cabinetry` is informational; Complete is disabled. After `record_project_ffe_installed` and `advance_project_phase` (designer session), Complete is enabled, then completed | `_derive_studio_service_obligations()` before and after; `studio_service_completions` `completed` | c1 ✓✓, c2 ✓✓ |
| A21 design-only obligations | weak | covered | job D :1025 | phases, then acceptance only; complete; care `pkg.design` | blockers `acceptance_not_accepted:-` → none; completion `completed` | c1 ✓✓, c2 ✓✓ |
| A21 client-buy obligations | weak | covered | job A :856 | the client-bought `pkg.living` line and the external fulfilment are informational (`Outside work still in progress`) | info `external_fulfilment_open:pkg.living` | c1 ✓✓, c2 ✓✓ |
| A21 service / financial closeout / closure distinct | weak | covered | job A :856, job F :934 (:983–:1022), job D :1025 | `[data-financial-hold]` reads `holds project closure, not service completion` while Complete is enabled; completing the service leaves closure unchanged. Job F, step by step:<br>1. `close_project` → 400 `1 FF&E item(s) are not installed` (cabinetry run).<br>2. GC delivery recorded (fixture), then `record_project_ffe_installed` (designer); 0 lines not installed.<br>3. `close_project` → 400 `contract total is not fully collected`.<br>4. Separate step: `compose_project_invoice`, `issue_invoice`, `record_invoice_payment` (cheque).<br>5. `close_project` → 200 | `projects.status`, `closure_checklist` and `portfolio_snapshot` identical through completion and both refusals. `_service_completion_financial_hold()` `{0, 0, 500000}` → issued `{1, 500000, …}` → paid `{0, 0, 0}`. F ends `completed`; the completion row is unchanged throughout | c1 ✓✓, c2 ✓✓ |
| A21 GC trade acceptance distinct | weak | weak | — | not run (no trade-scope fixture in the composed jobs) | — | — |
| A21 close_project semantics preserved | weak | covered | job F :934, job D :1025 | F: refused on the uninstalled cabinetry line, then on the uncollected fee, then closes. D: closes with a portfolio snapshot | each refusal leaves closure state unchanged. D: `status completed`, `closure_checklist` = the six required items completed, `portfolio_snapshot` = the snapshot sent (`[RC7 e2 D closed]`) | c1 ✓✓, c2 ✓✓ |
| A21 close freezes the closeout | weak | covered | job D :1025 (:1077–:1097) | after close: the designer's REST PATCH of `closure_checklist` → 400 `project closeout evidence may only change through close_project`; the client's `create_client_scope_change_request` → 400 `create_client_scope_change_request: completed_project` | closure state and ledger (invoices, requests, scope changes, completions) unchanged | c1 ✓✓, c2 ✓✓ |
| A22 delivery / opening / reading evidence record nothing | weak | covered | R1 :568 | checked after send, after the client opens the request, and after reading the evidence and opening its file | 0 responses at each step; request `sent/pending` | c1 ✓✓, c2 ✓✓ |
| A22 silence / walkthrough record nothing | weak | covered | job D :1025 | Design and Final walkthrough phases completed (designer session); the client is silent | 0 responses; `sent/pending`; blocker `acceptance_not_accepted:-`; Complete disabled | c1 ✓✓, c2 ✓✓ |
| A22 conditional + unresolved included obligation visibly held | weak | covered | job A :856 | `[data-blocker="agreed_phase_open"]` on `Living room`, the open condition text shown, Complete disabled; after phases → `completed_with_conditions`; condition resolved → `completed` | blockers `agreed_phase_open:pkg.living` → none; completion `completed_with_conditions` → `completed`, `revoked null` | c1 ✓✓, c2 ✓✓ |
| A22 informational external punch item not a blocker | weak | covered | job A :856 | `upsert_install_punch_item` (designer session) → `Open install punch items` is informational; Complete is enabled while it is open | info `punch_item_open:-`, blockers `[]` | c1 ✓✓, c2 ✓✓ |
| A23 care retains the accepted edition + responsible party | weak | covered | job A :856, F :934, D :1025 | `scope edition N, in force from`, `accepted on request N`; `{label}: bought by …, installed by …`; the excluded package is absent | edition id = the accepted request's edition | c1 ✓✓, c2 ✓✓ |
| A23 purchase / warranty records on care | weak | weak | — | not run (no purchase or warranty records on the composed jobs) | — | — |
| A23 deep reference returns to closeout | weak | covered | job A :856 | `?unfold=pieces` on `/doc/<id>`; focus lands inside the unfold; on close the opener is focused | — (UI focus) | c1 ✓✓, c2 ✓✓ |
| A23 later care question does not reopen or bill | weak | covered | job D :1025 | the client posts on the project thread (REST, own JWT) after close; the client sees `The studio’s service is complete` and `Care questions are still welcome.` | `comms_messages` +1 from the client; invoices, requests, scope changes and completions unchanged; project `completed` | c1 ✓✓, c2 ✓✓ |
| A23 controlled post-close edition behavior | weak | weak | job D :1025 | after close the active edition is still the accepted one and care reads it; a client scope change is refused. No studio post-close edit (amendment) is exercised, so the clause is only partly run | edition id = request edition | c1 ✓✓, c2 ✓✓ (partial) |

✓✓ = passed on `chromium` and on `webkit-iphone` in that run.

### Observations (not defects)

- In development run `r8dev1`, the iPhone-emulated `Review and send` tap focused the button (`[active]` in the snapshot) but opened no sheet within 30 s; that was R2 on `webkit-iphone`. In development run `dev2`, one WebKit send opened only on a second tap; it is logged as `[RC7 e2 review-and-send] webkit-iphone: sheet opened on tap 2`.
- `sendNotices` now taps again when the sheet is not up. It logs the retap and what the missed tap left behind (backdrops, dialogs, focused element).
- In the counted runs c1 and c2, the first tap opened the sheet in every send on both projects: 0 retap lines in either log.
- Cause not established. The button's handler is a plain `onClick` (`service-acceptance-section.tsx:323-325`), and `DocSheet` has a backdrop button with `onClick={onClose}` (`overlays/doc-sheet.tsx:425-431`). A touch ghost click landing on the fresh backdrop is one candidate; it is not demonstrated.
- Confidence that this is a product defect: low.
## Commands

Every command ran with `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:57122/postgres` exported and asserted first. `sysctl vm.swapusage` and `df` were recorded before each counted run (`final-r8/run{1,2}.pre.txt`).

Counted runs at `47d500f1e`. Each run gets its own fresh owned stack:

```
node apps/designer-portal/e2e/round8/run-consumer-journey.mjs --evidence /Users/kody/.claude/rc7-evidence/e2/final-r8/c1 --runs 1 \
  --workdir /private/tmp/claude-501/-Users-kody-Code-patina-merged/1460bfe7-3b74-49b1-b90e-b7c7dd33fdc9/scratchpad
node apps/designer-portal/e2e/round8/run-consumer-journey.mjs --evidence /Users/kody/.claude/rc7-evidence/e2/final-r8/c2 --runs 1 \
  --workdir /private/tmp/claude-501/-Users-kody-Code-patina-merged/1460bfe7-3b74-49b1-b90e-b7c7dd33fdc9/scratchpad
# each run executes:
RC7_E2_ROUND8=1 playwright test --config playwright.round8.config.ts e2e/round8/rc7-e2-consumer-journey.spec.ts \
  --grep '@rc7-e2-acceptance|@rc7-e2-paper|@rc7-e2-completion' --project chromium --project webkit-iphone --workers=1
```

| Run | Pre-run (UTC, swap used / total, disk free) | Stack receipt (system id, server) | Result | Runner |
|---|---|---|---|---|
| c1 | 16:47:54Z, 30953.81M / 31744.00M, 282 GiB | 16:48:39Z, `7702132561271894058`, 172.24.0.2 | `14 passed (12.1m)`, exit 0; 0 failed, 0 flaky, 0 skipped, no global-teardown error | `RESULT: PASSED`; client portal stop: SIGTERM, process group gone, port 3112 free; `teardown: supabase stop --no-backup exit=0; containers left 0; volumes left 0` |
| c2 | 17:01:05Z, 35457.69M / 36864.00M, 277 GiB | 17:01:51Z, `7702135960526000169`, 172.24.0.2 | `14 passed (11.5m)`, exit 0; 0 failed, 0 flaky, 0 skipped, no global-teardown error | `RESULT: PASSED`; same stop and teardown lines |

Both receipts: CLI 2.120.0, head `47d500f1e`, `EMAIL_DEV_MODE=dry_run`, provider key names `[]`, `cronLaunchActiveJobs: off`, ledger max `20260910152111`. No run was infra-interrupted. Logs: `/Users/kody/.claude/rc7-evidence/e2/final-r8/c{1,2}.log` and `final-r8/c{1,2}/run1/e2-rc7.log`.

Readbacks printed in each run, once per project (identical in c1 and c2):

```
[RC7 e2 F close: outside line] 400 {"code":"23514",…,"message":"project cannot close: 1 FF&E item(s) are not installed"}
[RC7 e2 F close: financial] 400 {"code":"23514",…,"message":"project cannot close: contract total is not fully collected"}
[RC7 e2 D closed] {"status":"completed","checklist":[{"key":"walkthrough","completed":true},…],"snapshot":{…}}
[RC7 e2 D post-close checklist rewrite] 400 {"code":"23514",…,"message":"project closeout evidence may only change through close_project"}
[RC7 e2 D post-close scope change] 400 {"code":"23514",…,"message":"create_client_scope_change_request: completed_project"}
[RC7 e2 cleanup] {"tables" : 52, "rows" : 305, "projects" : 4, "f01NonDraftProposals" : 0}
```

DEFECT RC7-e2-1 confirmation: one chromium run of the defect test with `test.fixme(` changed locally to `test(`, on the kept development stack. The change was restored with `sed`; `git diff` shows no change on that line.

```
RC7_E2_ROUND8=1 playwright test --config playwright.round8.config.ts e2e/round8/rc7-e2-consumer-journey.spec.ts \
  --grep '@rc7-e2-defect' --project chromium --workers=1
# 1 failed, at the defect step:
#   > 1133 | await expect(replace.getByText('No other household member is on file for this job.')).toHaveCount(0);
#   Expected: 0  Received: 1
```

The same run also showed the second teardown refusal (`last_owner_protected`), which led to the `-07` unseat in `rc7-e2-cleanup.sql`. Log: `/Users/kody/.claude/rc7-evidence/e2/r8dev/fixme-forced.log`.

Gates at `47d500f1e`:

```
node --test apps/designer-portal/e2e/round8/run-consumer-journey.unit.mjs   # 25 pass, 0 fail
pnpm --filter @patina/designer-portal type-check                            # exit 0 (its program includes rc7-e2-consumer-journey.journey.ts)
pnpm --filter @patina/designer-portal lint                                  # exit 0; 0 errors, 250 warnings (pre-existing); e2e/ is ignored by its ESLint config
```

Development runs (not counted):

| Label | Result | Cause / fix |
|---|---|---|
| r8dev1 (runner, `--keep-stack`) | 6 passed, 2 failed, 6 did not run, 1 error outside tests | (1) chromium F: `record_project_ffe_installed` refused `only delivered lines can be marked installed: RC7 kitchen run (ordered)`, fixed by recording the GC's delivery first. (2) webkit R2: `ready-to-send-sheet` not visible after the tap (Observations). (3) global teardown refused by `guard_proposal_copy_immutability`, fixed by `rc7-e2-cleanup.sql` |
| r8dev/fixme-forced | 1 failed (expected, at :1133) | teardown then refused with `last_owner_protected`; the cleanup now unseats `-07`; a rolled-back replay of the teardown SQL then passed |
| r8dev/dev2 (kept stack, both projects) | `14 passed (11.9m)`, exit 0 | one WebKit send opened on tap 2 |

The earlier chromium-only counted runs at `56bbb23cf` (`playwright.consumer-journey.config.ts`, 2/2, 7/7 each) predate the review edits and count toward no rating here.

## Defects

### DEFECT RC7-e2-1 — the request card's Replace form finds no household on a composed job

- Severity: medium. A20 signer replacement cannot be reached from the designer UI on composed jobs; the RPC and its audit are correct. Confidence: high.
- Repro:
  - The test is `test.fixme('@rc7-e2-defect the Replace form offers the job household's other members')` in `rc7-e2-consumer-journey.journey.ts:1131`, in describe `RC-7 e2 defects`, outside every runner leg.
  - Steps: job A, request `rc2-sa-1` drafted, then `Replace this person` on `(Client)`.
  - Result: the form shows `No other household member is on file for this job.` (`service-acceptance-section.tsx:434`) instead of offering the third household card.
  - Confirmed failing at that step on 2026-10-29 (Commands).
- Root cause:
  - `packages/supabase/src/hooks/use-households.ts:303-322` (`useProjectHousehold`) reads `projects.client_profile_id` and matches it to `designer_clients.client_id`.
  - `client_profile_id` is FK'd to `client_profiles(id)`, a disjoint uuid space (`supabase/migrations/00555_*.sql:523-528` says so). It is NULL on every local project (58/58).
  - Composed jobs carry no `project_parties` client seats, so the seat fallback (:325-330) is empty too. No household means no cards.
- Proposed fix: at :305 / :311, select `projects.client_id` (the auth uid that `designer_clients.client_id` holds) instead of `client_profile_id`. Codex review confirmed the root cause; per the orchestrator, the fix lane fixed it in `1028ea50c`. The fixme stays here until that lands on this base.

## Harness debt (not fixed; not owned)

- `apps/designer-portal/e2e/helpers/psql.ts:21`, `e2e/round8/global-setup.ts:11` and `e2e/round8/global-teardown.ts:8` fall back to `127.0.0.1:54322` (the shared stack) when `SUPABASE_DB_URL` is unset. The runner always sets it to the owned 57122. The rc7-e2 journey's `owned()` refuses any DB URL but 57122.
- `e2e/round8/global-teardown.ts` cannot purge the F01 accounts once any round-8 test leaves an executed agreement or a non-F01 member on the F01 studio. Guards 00390 and `last_owner_protected` refuse, and they are right to. This lane cleans up its own jobs in `test.afterAll`. Any other round-8 spec that executes agreements for F01 needs the same.
- `apps/designer-portal` ESLint ignores `e2e/`.

## Not verified, and why

- iOS response and the iOS paper and care surfaces: no simulator or device in this lane. `webkit-iphone` is Playwright WebKit with iPhone 14 emulation, not the app.
- Signer replacement through the designer UI: DEFECT RC7-e2-1.
- GC trade acceptance (`trade_scope_open`) as distinct from studio acceptance: no trade-scope fixture in the composed jobs.
- Purchase and warranty records on care: no such records on the composed jobs.
- Controlled post-close scope edits (an amendment after close): not exercised.
- The WebKit first-tap miss (Observations): not root-caused.
- The GC's cabinetry delivery on job F: recorded by fixture SQL, because it is an act outside the studio's and no studio RPC exists for it. Only the install that follows goes through the real RPC.
- Screen reader: no assistive-technology pass.

## Teardown

- Each counted run (runner): client portal stopped with process group gone and port 3112 free. Then `supabase stop --no-backup exit=0; containers left 0; volumes left 0`, and the scratch workdir was removed.
- The kept development stack (`patina-rc2-journey-huY6f2`) was stopped with `supabase stop --workdir <kept> --no-backup` before the counted runs. Dev ports 3110/3112 were killed and the workdir removed.
- 2026-10-29T17:13:43Z: `lsof -iTCP:<p> -sTCP:LISTEN` shows 3110, 3112, 57120, 57121, 57122, 57129 and 57183 all free. `docker ps -a` / `docker volume ls` with label `com.supabase.cli.project=patina-rc7-e2`: 0 / 0.
- Shared stack:
  - No write to 54321/54322 and no connection to them.
  - Correction: the counted run at `56bbb23cf` did read the shared stack once per journey. The runner's identity proof ran `docker exec supabase_db_supabase psql … -c 'SELECT system_identifier FROM pg_control_system();'` inside the shared DB container. It was read-only and recorded `sharedSystemId` `7701004642274893866` in the receipt.
  - Since `28f3bf3e9` the runner no longer makes that read; the c1/c2 receipts carry no shared id.
- No `--linked`, Strata or PostHog.
