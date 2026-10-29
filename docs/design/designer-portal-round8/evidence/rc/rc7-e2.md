# RC-7 lane e2 — service acceptance, completion and care journeys (A20–A23)

## Header

- Worktree `/Users/kody/Code/patina-r8-rc7-e2`, branch `r8-rc7-e2`. Counted runs c1/c2 tested tip `47d500f1e` (base `3cf79663c` + lane commits `56bbb23cf`, `7ca21c5dc`, `28f3bf3e9`, `47d500f1e`); their stack receipts record head `47d500f1e`.
- Review fixes (Opus cross-provider review, fix-then-accept) land after `037952e6b`: `5912de176`, `9b7be17fe`, then `86c8f482a` (DEFECT RC7-e2-2 repro). Second review fixes (Codex, fix-then-accept): `1221598e1` (JSON-report probe classifier, required `--workdir`, production Sanity blocked in the browser, backend-state diagnostic) and the doc commit after it. No browser run has tested `1221598e1` yet; the two defect probes re-run on it once that is cleared. The review-fix counted runs r2 and r3 tested tip `86c8f482a`; their receipts record that head. Development runs r1 (at `9b7be17fe`) and r1b (at `86c8f482a`) failed and are recorded under Commands.
- Owned stack: `project_id` `patina-rc7-e2`; API 57121, DB 57122, shadow 57120, pooler 57129, inspector 57183. Designer portal 3110, client portal 3112. `edge-runtime` kept; `EMAIL_DEV_MODE=dry_run`.
- Counted-run stacks: one fresh stack per run, started and stopped by the runner (receipts under Commands).
- Migration head applied: numbered head `00899` (`00899_round8_service_acceptance_offline_presentation`). Proven by query in every review-fix receipt: `numberedHead: "00899"`, `migration00899: "00899 round8_service_acceptance_offline_presentation"`. The ledger also holds `20260910152111_create_contact_messages`, and `max(version)` sorts as text, so the c1/c2 receipts' `ledgerMax 20260910152111` is not the head. From the review-fix runs on, `rc7-e2-run.mjs` writes `numberedHead` (`SELECT max(version) FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]{5}$'`) and `migration00899` (`SELECT version || ' ' || name … WHERE version = '00899'`) into the receipt.
- `cron.launch_active_jobs = off` on the owned DB (receipt `cronLaunchActiveJobs: off`). No step needed a scheduled job.
- Date: 2026-10-29.

## Files

- `apps/designer-portal/e2e/round8/rc7-e2-consumer-journey.journey.ts`: three legs with 7 tests, a file-level `test.afterAll` cleanup, and two repros outside the counted legs:
  - `@rc7-e2-defect-1` (DEFECT RC7-e2-1);
  - `@rc7-e2-defect-2` (DEFECT RC7-e2-2).
  - Each is `test.fixme(process.env.RC7_E2_DEFECT_PROBE !== '<n>', …)`: fixme unless `rc7-e2-run.mjs --defect-probe <n>` lifts it.
- `apps/designer-portal/e2e/round8/rc7-e2-consumer-journey.spec.ts`: lane entry for `playwright.round8.config.ts` (projects `chromium`, `webkit-iphone`). It registers the journey only when `RC7_E2_ROUND8=1`. `--list` shows 14 tests with the flag and 0 without.
- `apps/designer-portal/e2e/round8/rc7-e2-fixture.sql`:
  - `\ir consumer-journey-fixture.sql` (job A for the RC-2 household)
  - jobs P (paper), F (full service) and D (design only)
  - extra household members
  - drawing evidence behind uploaded files
  - manifests `rc7-sa-1`
- `apps/designer-portal/e2e/round8/rc7-e2-cleanup.sql` (new):
  - Runs from the journey's `test.afterAll`, on the owned cluster only. It checks the connection first, with the same guard as `consumer-journey-fixture.sql`: `owned_port` is given, the host is loopback, the port is not 54321/54322, and the port equals `owned_port`. Then it checks the system id and server address.
  - Deletes the lane's fictional jobs: every project of the F01 designer whose client is an RC2/RC7 fictional actor, plus every row that references them transitively by foreign key. Deletion is transaction-local in replica mode, the pattern `cabinetry-cp01.spec.ts` and `accounts-paper.spec.ts` already use.
  - Unseats the RC2 studio member (`-07`) from the F01 studio; the fixture seats it again on the next application.
  - Refuses if the walk would reach an account, profile, organization, card or household row.
  - Why it exists: the round-8 `global-teardown.ts` deletes the F01 auth users. Without this cleanup, that cascade is refused, first by `guard_proposal_copy_immutability` (00390: "non-draft proposals are immutable editions and cannot be deleted") and then by `last_owner_protected`. The run would exit 1 with "1 error was not a part of any test".
  - Each run read back `{"tables": 52, "rows": 305, "projects": 4, "f01NonDraftProposals": 0}` per project.
- `apps/designer-portal/e2e/round8/rc7-e2-run.mjs` and `rc7-e2-run.unit.mjs` (lane-local runner, new in the review fixes):
  - Derived from the RC-2 runner. It runs only the rc7-e2 legs: no RC-2 legs, and no refusal-check mode.
  - One round-8 invocation per run (`--project chromium --project webkit-iphone --workers=1`), expecting 14 passed.
  - `--defect-probe <1|2>` runs only `@rc7-e2-defect-<n>` on chromium with `RC7_E2_DEFECT_PROBE=<n>`.
    - At `86c8f482a` it passed on exit 1 with exactly `1 failed` when the log carried the defect's text anywhere. Codex showed that can report a false green: the source excerpt of a failure at another line quotes probe 1's step, and probe 2's timeout text is logged before a later assertion can fail.
    - Since `1221598e1` it adds `--reporter=list,json` (`PLAYWRIGHT_JSON_OUTPUT_FILE`) and `classifyProbe` judges the JSON report. It requires exit 1, no error outside the test, `stats` exactly 1 unexpected and 0 expected, flaky or skipped, and exactly one test (the probe's title, on chromium). That test must have one result, status `failed`, exactly one error, and first error location `rc7-e2-consumer-journey.journey.ts:<step line>`.
    - The assertion's own message (not the excerpt) must carry the actual value. For 1 that is `Expected: 0` / `Received: 1`. For 2 it is `+ "code": undefined` and `+ "message": "The upstream server is timing out"`.
    - A unit drift guard checks that each step line is the defect assertion in the journey.
  - `--workdir` is required: an existing directory, not `/`, home or the checkout or anything inside it, and not a checkout. The `os.tmpdir()` default is gone.
  - It copies every `[RC7 e2 review-and-send]` tap line into the run log.
  - Disk floor of 20 GiB.
  - Awaited client-portal stop: SIGTERM, then SIGKILL; the run fails on any process or port residue. The run also fails if 3110 is still listening afterwards.
  - It makes no read of the shared stack.
  - The receipt carries `numberedHead` and `migration00899`.
- `apps/designer-portal/e2e/round8/run-consumer-journey.mjs` and `.unit.mjs` (the shared RC-2 runner, SQ-2337): the lane had edited both, which made the RC-2 legs opt-in and moved the RC-2 project and ports. The review fixes restored both to base `3cf79663c` (`git diff 3cf79663c` is empty for both). Counted runs c1/c2 ran the edited version; its e2 path is what `rc7-e2-run.mjs` now carries.

## Criteria

Before = the R3b rating (`evidence/rc/rc6-reviews/r3b-evidence-full.md` rows A20–A23, all **weak**). Now uses only **covered**, **weak** or **defect**.

- A clause is **covered** only when its spec passed on both round-8 projects, `chromium` and `webkit-iphone`, in both counted runs.
- Spec = `rc7-e2-consumer-journey.journey.ts` at the test's line, run through `rc7-e2-consumer-journey.spec.ts` under `playwright.round8.config.ts`.
- Transitions with no UI control go over HTTP with the real actor's own session: `actAs`/`rpcAs` call `/rest/v1/rpc/*` (or REST) with that actor's password-grant JWT.
- psql as `postgres` only applies fixtures, reads back, records the GC's cabinetry delivery on job F (an act outside the studio's), and runs the cleanup.
- Every transition is followed by a DB readback.

Runs:
- c1 and c2: the counted runs at `47d500f1e`, before the review fixes.
- r2 and r3: the review-fix counted runs at `86c8f482a` (`rc7-e2-run.mjs`).
- Each of the four is `14 passed`, 7 on `chromium` and 7 on `webkit-iphone`, with runner exit 0.
- The failed development runs r1 and r1b are under Commands.

Lines below are at `86c8f482a`. At `1221598e1` the journey's lines shift: +3 from :339, +9 from :344, +10 from :611, +17 after :1282. The probe steps move from :1232 to :1242 and from :1286 to :1303; the probe titles move from :1218 to :1228 and from :1250 to :1260.

| ID / clause | Before | Now | Spec | Asserted | Readback | Runs |
|---|---|---|---|---|---|---|
| A20 agreed scope edition + required signer policy | weak | covered | R1 :620, R2 :653, R3 :726, paper :812 | client sees `What you’re accepting` for the active edition; evidence buttons disabled until loaded; issued PDF bytes fetched from the popup's signed URL equal `plan_prints.sha256` | `service_acceptance_requests` edition / `scope_content_hash` / `evidence_manifest_hash` / `signer_policy_revision`; `service_acceptance_evidence_snapshots` members | c1 ✓✓, c2 ✓✓; r2 ✓✓, r3 ✓✓ |
| A20 one required accepted, another pending = incomplete | weak | covered | R2 :653, R3 :726 | partner accepts in their own context; the card still reads waiting | request `sent / pending`, one `service_acceptance_responses` row | c1 ✓✓, c2 ✓✓; r2 ✓✓, r3 ✓✓ |
| A20 rejection requires new evidence | weak | **weak** | R1 :620 → R2 :653 | Client returns with a reason. The returned request stays `closed/returned`, and request 2 freezes its own snapshot.<br>Request 2 binds a different manifest (`rc2-sa-2`) only because the journey chose it. The product does not require it: `create_service_acceptance_request` (00889:446, 00891:47) has no check against a returned request's manifest. A draft on the returned `rc2-sa-1` would be accepted, so no refusal branch exists to assert (RC7-E2-OBS-2). | R1 `closed/returned`, response `return` with reason; R2 `evidenceHash ≠` R1's; R2 frozen members = revised drawing set only | c1 ✓✓, c2 ✓✓, r2 ✓✓, r3 ✓✓ (positive path only) |
| A20 signer replacement requires new evidence | weak | defect | R3 :726; repro :1218 | The card's Replace form cannot offer the household (DEFECT RC7-e2-1), so the designer's own session calls `replace_service_acceptance_signer`. The card shows `was replaced` and the new signer `Waiting`.<br>The old signer gets no form. Their REST respond is refused with exactly `{status 500, code 55000, message signer_not_active}` (:787; RC7-E2-OBS-3).<br>The replacement gets their own V22 notice and accepts with a condition. | signer row `replaced`, with reason, `replaced_by` = designer, revision 2; successor card active and required; request revision 2; R3 `closed/accepted_with_conditions` with 2 responses | c1 ✓✓, c2 ✓✓ (RPC path); UI path: `--defect-probe 1` failed at the defect step :1232 (`86c8f482a`) |
| A20 superseded scope requires new evidence | weak | covered | R2 :653, R3 :726 | While R2 is pending, the real actors execute an amendment over HTTP.<br>Designer: `create_service_addendum`, `copy_agreement_parts_from_authority`, `upsert_agreement_parts`, `send_commercial_document`. Client: `sign_design_services_agreement`. Designer: `countersign_design_services_agreement`.<br>The card reads `Replaced` / `the agreed scope changed`. The client's respond is refused with exactly `{500, 55000, request_not_open}` (:694). The old evidence stays readable, with no answer offered.<br>**New:** the designer's `create_service_acceptance_request` on the superseded edition is refused with exactly `{500, 55000, scope_edition_not_active}`, and the request count is unchanged (:722).<br>R3 binds edition 2. Its manifest hash equals R2's (same `rc2-sa-2`, asserted at :737). What is new is the scope edition and request 3's own send-time freeze. | R2 `superseded`, `scope_edition_superseded`; edition 1 `superseded`, edition 2 active; frozen snapshot unchanged; refused draft writes no request; R3 edition = edition 2, `scopeHash ≠` R2's | c1 ✓✓, c2 ✓✓ (without the refused draft); r2 ✓✓, r3 ✓✓ |
| A20 designer request follows V22 | weak | covered | `sendNotices` :431 (R1–R3, F, D) | `Review and send` sheet; each notice checked by recipient; `Send the N checked`; the row reads `Sent` or leaves the sheet.<br>**New:** the tap count goes in a `review-and-send-taps` annotation and a `taps=N` log line. A send that needed the one allowed retap fails the test (`expect.soft(taps).toBe(1)`, :456; RC7-E2-OBS-1). It did so once, in development run r1b (WebKit, R1).<br>**New:** exact notice counts per request, which is row-count integrity only. After a send, `sent` = sent before + the N checked, and the total rows are unchanged. The harness clicks `Send` once per sheet, so it never exercises a duplicate or retried send, and duplicate-send protection is not tested here. | `outbound_drafts.status sent`, `delivery_message_id ~ ^dryrun_\d+$`; request `sent`; per-request `{sent, total}` | c1 ✓✓, c2 ✓✓ (0 retaps); r2 ✓✓, r3 ✓✓ (`taps=1` on all 12 sends in each); r1b ✘ on WebKit (`taps=2`) |
| A20 authenticated client-portal response | weak | covered | R1–R3, F :1011, D :1102 | each signer answers in their own browser context on 3112, with the project's device (Desktop Chrome / iPhone 14) | `responses.method portal_authenticated`, `responder` = signer profile | c1 ✓✓, c2 ✓✓; r2 ✓✓, r3 ✓✓ |
| A20 iOS response | weak | weak | — | not run (no simulator or device in this lane; `webkit-iphone` is a browser emulation, not the iOS app) | — | — |
| A20 permitted paper intake → same scoped truth | weak | covered | paper :812 | All-paper household: the notices are address-less holds (00891). The studio marks the request presented on paper (00899). Paper is uploaded per slot (`Record paper for <Slot>`), stamped, and confirmed by a second admin. The client sees `Reviewed paper response` and has no answer of their own.<br>**New (:879–:895):** the recorder (the designer; their `organization_members` role on the recorded studio reads `owner`/`admin`) calls `review_service_acceptance_paper_intake` `confirmed` on their own stamped intake. It is refused with HTTP 403, code `42501`, message `insufficient_privilege` (r2, r3). The intake stays `pending_review` with no reviewer, and there are 0 responses. | request `sent` via offline presentation, 0 sent drafts; intakes `pending_review` → `confirmed` with stored sha, `reviewed_by` = the second admin; responses `paper_intake`, `responder NULL`, same edition / scope / evidence hashes; `closed/accepted` | c1 ✓✓, c2 ✓✓ (without the self-review refusal); r2 ✓✓, r3 ✓✓ |
| A20 paper with a mismatched scope / evidence code refused | weak | defect | repro :1250 (`@rc7-e2-defect-2`) | The database refuses the designer's `record_service_acceptance_paper_intake` with a mismatched scope code at once: `ERROR: stale_scope`, 37 ms, as `authenticated` in a rolled-back transaction.<br>The same call through the API gets HTTP 504 `The upstream server is timing out` after 60 004 ms (DEFECT RC7-e2-2). What the database does after the 504 is not established. | 0 intakes written | r1 ✘✘ (in the paper journey at `9b7be17fe`; moved out); `--defect-probe 2` failed at the defect step :1286 |
| A21 full-service obligations | weak | covered | job F :1011 | blockers `studio_line_open`, `studio_installation_open`, `agreed_phase_open` shown; excluded `Cabinetry` is informational; Complete is disabled. After `record_project_ffe_installed` and `advance_project_phase` (designer session), Complete is enabled, then completed | `_derive_studio_service_obligations()` before and after; `studio_service_completions` `completed` | c1 ✓✓, c2 ✓✓; r2 ✓✓, r3 ✓✓ |
| A21 design-only obligations | weak | covered | job D :1102 | phases, then acceptance only; complete; care `pkg.design` | blockers `acceptance_not_accepted:-` → none; completion `completed` | c1 ✓✓, c2 ✓✓; r2 ✓✓, r3 ✓✓ |
| A21 client-buy obligations | weak | covered | job A :933 | the client-bought `pkg.living` line and the external fulfilment are informational (`Outside work still in progress`) | info `external_fulfilment_open:pkg.living` | c1 ✓✓, c2 ✓✓; r2 ✓✓, r3 ✓✓ |
| A21 service / financial closeout / closure distinct | weak | covered | job F :1011 (:1048–:1099); service ≠ closure also job A :974/:986, job D :1161 | Only job F asserts the financial line. `[data-financial-hold]` reads `holds project closure, not service completion` while Complete is enabled (:1048), and completing the service leaves closure unchanged (:1056). Job F, step by step:<br>1. `close_project` → 400 `1 FF&E item(s) are not installed` (cabinetry run).<br>2. GC delivery recorded (fixture; see GC delivery below), then `record_project_ffe_installed` (designer); 0 lines not installed.<br>3. `close_project` → 400 `contract total is not fully collected`.<br>4. Separate step: `compose_project_invoice`, `issue_invoice`, `record_invoice_payment` (cheque).<br>5. `close_project` → 200.<br>Jobs A and D assert only that completing the service leaves closure unchanged (A), and that closing leaves the completion unchanged (D). They show no financial line. | `projects.status`, `closure_checklist` and `portfolio_snapshot` identical through completion and both refusals. `_service_completion_financial_hold()` `{0, 0, 500000}` → issued `{1, 500000, …}` → paid `{0, 0, 0}`. F ends `completed`; the completion row is unchanged throughout | c1 ✓✓, c2 ✓✓; r2 ✓✓, r3 ✓✓ |
| A21 GC trade acceptance distinct | weak | weak | — | not run (no trade-scope fixture in the composed jobs) | — | — |
| A21 close_project semantics preserved | weak | covered | job F :1011, job D :1102 | F: refused on the uninstalled cabinetry line, then on the uncollected fee, then closes.<br>**New (:1142–:1151):** D's `close_project` with the walkthrough unticked is refused with exactly `{400, 23514, project closeout checklist must include every required item as completed}`.<br>D then closes with a portfolio snapshot. | Each refusal leaves closure state unchanged. The incomplete-checklist refusal also leaves the completion unchanged.<br>D: `status completed`, `closure_checklist` = the six required items completed, `portfolio_snapshot` = the snapshot sent (`[RC7 e2 D closed]`). | c1 ✓✓, c2 ✓✓ (without the checklist refusal); r2 ✓✓, r3 ✓✓ |
| A21 close freezes the closeout | weak | covered | job D :1102 (:1164–:1184) | after close: the designer's REST PATCH of `closure_checklist` → 400 `project closeout evidence may only change through close_project`; the client's `create_client_scope_change_request` → 400 `create_client_scope_change_request: completed_project` | closure state and ledger (invoices, requests, scope changes, completions) unchanged | c1 ✓✓, c2 ✓✓; r2 ✓✓, r3 ✓✓ |
| A22 delivery / opening / reading evidence record nothing | weak | covered | R1 :620 | checked after send, after the client opens the request, and after reading the evidence and opening its file | 0 responses at each step; request `sent/pending` | c1 ✓✓, c2 ✓✓; r2 ✓✓, r3 ✓✓ |
| A22 silence / walkthrough record nothing | weak | covered | job D :1102 | Design and Final walkthrough phases completed (designer session); the client is silent | 0 responses; `sent/pending`; blocker `acceptance_not_accepted:-`; Complete disabled | c1 ✓✓, c2 ✓✓; r2 ✓✓, r3 ✓✓ |
| A22 conditional + unresolved included obligation visibly held | weak | covered | job A :933 | `[data-blocker="agreed_phase_open"]` on `Living room`, the open condition text shown, Complete disabled; after phases → `completed_with_conditions`; condition resolved → `completed` | blockers `agreed_phase_open:pkg.living` → none; completion `completed_with_conditions` → `completed`, `revoked null` | c1 ✓✓, c2 ✓✓; r2 ✓✓, r3 ✓✓ |
| A22 informational external punch item not a blocker | weak | covered | job A :933 | `upsert_install_punch_item` (designer session) → `Open install punch items` is informational; Complete is enabled while it is open | info `punch_item_open:-`, blockers `[]` | c1 ✓✓, c2 ✓✓; r2 ✓✓, r3 ✓✓ |
| A23 care retains the accepted edition + responsible party | weak | covered | job A :933, F :1011, D :1102 | `scope edition N, in force from`, `accepted on request N`; `{label}: bought by …, installed by …`; the excluded package is absent | edition id = the accepted request's edition | c1 ✓✓, c2 ✓✓; r2 ✓✓, r3 ✓✓ |
| A23 purchase / warranty records on care | weak | weak | — | not run (no purchase or warranty records on the composed jobs) | — | — |
| A23 deep reference returns to closeout | weak | covered | job A :933 | `?unfold=pieces` on `/doc/<id>`; focus lands inside the unfold; on close the opener is focused | — (UI focus) | c1 ✓✓, c2 ✓✓; r2 ✓✓, r3 ✓✓ |
| A23 later care question does not reopen or bill | weak | covered | job D :1102 | the client posts on the project thread (REST, own JWT) after close; the client sees `The studio’s service is complete` and `Care questions are still welcome.` | `comms_messages` +1 from the client; invoices, requests, scope changes and completions unchanged; project `completed` | c1 ✓✓, c2 ✓✓; r2 ✓✓, r3 ✓✓ |
| A23 controlled post-close edition behavior | weak | weak | job D :1102 | after close the active edition is still the accepted one and care reads it; a client scope change is refused. No studio post-close edit (amendment) is exercised, so the clause is only partly run | edition id = request edition | c1 ✓✓, c2 ✓✓, r2 ✓✓, r3 ✓✓ (partial) |

✓✓ = passed on `chromium` and on `webkit-iphone` in that run.

### Observations (not defects)

**RC7-E2-OBS-1: the WebKit `Review and send` first tap sometimes misses.** Confidence that this is a product defect: low to medium.

- Development run `r8dev1`, R2 on `webkit-iphone`: the iPhone-emulated tap focused the button (`[active]` in the snapshot) but opened no sheet within 30 s. The run failed.
- Development run `dev2`: one WebKit send opened only on a second tap (`[RC7 e2 review-and-send] webkit-iphone: sheet opened on tap 2`).
- Counted runs c1 and c2: the first tap opened the sheet in every send on both projects, with 0 retap lines in either log. Those runs used an unbounded retap loop that absorbed misses without failing.
- Cause not established before r1b. The button's handler is a plain `onClick` (`service-acceptance-section.tsx:323-325`). `DocSheet` has a backdrop button with `onClick={onClose}` (`overlays/doc-sheet.tsx:425-431`). A touch ghost click landing on the fresh backdrop is one candidate; it is not demonstrated.
- Development run r1b (`86c8f482a`), R1 on `webkit-iphone`: the first tap opened nothing within 20 s and the retap opened the sheet (`taps=2`). The new check failed the test, so the leg stopped: 7 passed, 1 failed, 6 did not run.
  - The missed tap left `{"backdrops":0,"dialogs":0,"active":"(self.__next_s=self.__next_s||[]).push(["}`. No sheet or backdrop was open, and the focused element was not the button: its text is Next's inline bootstrap script, so it was the document body.
  - That fits a tap landing before the card hydrated (a server-rendered button with no handler yet) better than a ghost click on a backdrop. It is not demonstrated.
  - Log: `/Users/kody/.claude/rc7-evidence/e2/review-r8/r1b/run1/e2-rc7.log` (lines 84-85).
- Counted runs r2 and r3 (`86c8f482a`): `taps=1` on all 12 sends in each run, on both projects.
- Since the review fixes (`sendNotices` :431), the journey makes one tap and waits 20 s. On a miss it logs what the tap left behind (backdrops, dialogs, focused element) and retaps once. It records `taps=N` as a log line and a `review-and-send-taps` annotation, then fails the test through `expect.soft(taps).toBe(1)`. A missed first tap is now a visible failure, not absorbed.

**RC7-E2-OBS-2: a returned request's evidence can be re-requested unchanged.** Severity: low to medium, pending a ruling. Confidence: high (read from source; not run).

- `create_service_acceptance_request` (latest body `00891_round8_service_acceptance_signer_drafts.sql:47`, same checks as `00889:446`) checks only that the manifest belongs to the project, has purpose `service_acceptance` and has readable member kinds.
- After a `closed/returned` request, nothing refuses a new draft on the same manifest. The new request gets only its own send-time freeze.
- Whether A20's "rejection … requires the correct new evidence" means a different manifest or a fresh freeze is a spec ruling. The clause stays **weak** until it is ruled. If it means a different manifest, this is a defect and the refusal branch can then be added.

**RC7-E2-OBS-3: `signer_not_active` (and every `55000` refusal) reaches the client as HTTP 500.** Severity: low; a product smell. Confidence: high.

- PostgREST maps SQLSTATE class 55 to 500. The old signer's refused respond, the superseded request's `request_not_open`, and the superseded-edition draft's `scope_edition_not_active` all read 500, though each is an expected refusal and not a server fault.
- The journey now asserts the exact `{status, code, message}` for these refusals, so a change in the mapping shows up.

### GC delivery on job F: why fixture SQL, not the 00861 receiving path

- `record_project_ffe_receipt_batch` (its `_00446_impl` body is in `00861:9`, wrapper repaired in `00862:585`) needs exactly one of `p_purchase_order_id` or `p_studio_purchase_id`. It refuses otherwise with `exactly one purchase order or studio purchase is required` (00861:69-70).
  - A PO receipt needs a studio purchase order the designer can access, in `confirmed`/`in_production`/`shipped`/`delivered`, with line vendors matching the PO (00861:72-78, :129, :201).
  - A studio-purchase receipt needs a `studio_purchases` row in `recorded`/`billed` and `can_buy_for_project`, and it refuses a line that carries a PO (00861:81-87, :202).
- `complete_receiving_inspection` (latest body `00865:97`) completes an inspection row that a receipt batch created. It resolves the same PO or studio purchase.
- Job F's `RC7 kitchen run` is `pkg.cabinetry`, excluded from the studio's service: purchasing by the client, fabrication contract and installation by the GC. It has neither a PO nor a studio purchase. Reaching either RPC would mean inventing a studio purchase for goods the studio did not buy, which misstates who is responsible. So neither 00861 RPC applies to a GC-installed line, and the delivery stays fixture SQL (`status 'ordered' → 'delivered'`, :1070). The install that follows goes through the real `record_project_ffe_installed`.
- Product path not used: round 8's outside-work rail (`create_external_fulfilment`, `set_ffe_item_external_fulfilment`, `record_external_fulfilment_event` and `verify_external_fulfilment_event`; 00875/00876) is how outside work is recorded. A verified `installed` event sets the bound lines `installed` (00876:512-517).
  - Using it would rebind job F's cabinetry line to an external fulfilment. That adds `external_fulfilment_open:pkg.cabinetry` to job F's informational obligations and changes the fixture and the expectations.
  - It is recorded here as the stronger path; it is not done in this lane.

## Commands

Every command ran with `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:57122/postgres` exported and asserted first. `sysctl vm.swapusage` and `df` were recorded before each counted run (`final-r8/run{1,2}.pre.txt`).

Counted runs c1/c2 at `47d500f1e`. They used the lane's then-edited shared runner, now restored; its e2 path is `rc7-e2-run.mjs`. Each run gets its own fresh owned stack:

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

Both receipts: CLI 2.120.0, head `47d500f1e`, `EMAIL_DEV_MODE=dry_run`, provider key names `[]`, `cronLaunchActiveJobs: off`, ledger max `20260910152111` (a text sort; not the numbered head, see Header). No run was infra-interrupted. Logs: `/Users/kody/.claude/rc7-evidence/e2/final-r8/c{1,2}.log` and `final-r8/c{1,2}/run1/e2-rc7.log`.

Readbacks printed in each run, once per project (identical in c1 and c2):

```
[RC7 e2 F close: outside line] 400 {"code":"23514",…,"message":"project cannot close: 1 FF&E item(s) are not installed"}
[RC7 e2 F close: financial] 400 {"code":"23514",…,"message":"project cannot close: contract total is not fully collected"}
[RC7 e2 D closed] {"status":"completed","checklist":[{"key":"walkthrough","completed":true},…],"snapshot":{…}}
[RC7 e2 D post-close checklist rewrite] 400 {"code":"23514",…,"message":"project closeout evidence may only change through close_project"}
[RC7 e2 D post-close scope change] 400 {"code":"23514",…,"message":"create_client_scope_change_request: completed_project"}
[RC7 e2 cleanup] {"tables" : 52, "rows" : 305, "projects" : 4, "f01NonDraftProposals" : 0}
```

Review-fix runs. One fresh owned stack per invocation; `sysctl vm.swapusage` and `df` were recorded before each (`review-r8/<label>.pre.txt`), and swap free never fell below 500 MB, so there was no wait. The sequence script is `/private/tmp/claude-501/-Users-kody-Code-patina-merged/1460bfe7-3b74-49b1-b90e-b7c7dd33fdc9/scratchpad/e2-phase2.sh`.

```
W=/private/tmp/claude-501/-Users-kody-Code-patina-merged/1460bfe7-3b74-49b1-b90e-b7c7dd33fdc9/scratchpad
E=/Users/kody/.claude/rc7-evidence/e2/review-r8
node apps/designer-portal/e2e/round8/rc7-e2-run.mjs --evidence $E/<r1|r1b|r2|r3> --runs 1 --workdir $W
node apps/designer-portal/e2e/round8/rc7-e2-run.mjs --evidence $E/probe1 --runs 1 --workdir $W --defect-probe 1
node apps/designer-portal/e2e/round8/rc7-e2-run.mjs --evidence $E/probe2 --runs 1 --workdir $W --defect-probe 2
# a counted run executes:
RC7_E2_ROUND8=1 playwright test --config playwright.round8.config.ts e2e/round8/rc7-e2-consumer-journey.spec.ts \
  --grep '@rc7-e2-acceptance|@rc7-e2-paper|@rc7-e2-completion' --project chromium --project webkit-iphone --workers=1
# a probe executes (RC7_E2_DEFECT_PROBE=<n>):
RC7_E2_ROUND8=1 playwright test … --grep '@rc7-e2-defect-<n> ' --project chromium --workers=1
```

| Run | Head | Pre-run (UTC, swap used / total, disk free) | Stack receipt (system id, server) | Result | Runner |
|---|---|---|---|---|---|
| r1 (dev) | `9b7be17fe` | 17:35:41Z, 17903.75M / 19456.00M, 294 GiB | `7702144851786608682`, 172.24.0.2 | `6 passed, 2 failed, 6 did not run (7.9m)`. Paper failed on both projects: the mismatch call got 504 `The upstream server is timing out` (→ DEFECT RC7-e2-2; the branch moved to a repro) | `RESULT: FAILED`, exit 1; client stop clean; containers 0, volumes 0 |
| r1b (dev) | `86c8f482a` | 17:47:41Z, 17040.06M / 18432.00M, 295 GiB | `7702147940398026795`, 172.24.0.2 | `7 passed, 1 failed, 6 did not run (7.5m)`. WebKit R1 `taps=2` (RC7-E2-OBS-1) | `RESULT: FAILED`, exit 1; client stop clean; containers 0, volumes 0 |
| **r2** | `86c8f482a` | 17:56:03Z, 21999.19M / 23552.00M, 290 GiB | `7702150098791886889`, 172.24.0.2 | **`14 passed (10.8m)`**, exit 0; 0 failed, 0 flaky, 0 skipped; `taps=1` × 12 | `RESULT: PASSED`; SIGTERM, process group gone, port 3112 free; `supabase stop --no-backup exit=0; containers left 0; volumes left 0` |
| **r3** | `86c8f482a` | 18:13:01Z, 19386.38M / 20480.00M, 293 GiB | `7702154467906760746`, 172.24.0.2 | **`14 passed (11.4m)`**, exit 0; 0 failed, 0 flaky, 0 skipped; `taps=1` × 12 | `RESULT: PASSED`; same stop and teardown lines |
| probe1 | `86c8f482a` | 18:07:45Z, 19690.38M / 20480.00M, 293 GiB | `7702153111913160746`, 172.24.0.2 | `1 failed` at :1232 (`Expected: 0 Received: 1`), as required | `RESULT: PASSED`; clean stop and teardown |
| probe2 | `86c8f482a` | 18:09:40Z, 19626.38M / 20480.00M, 293 GiB | `7702153607434137642`, 172.24.0.2 | `1 failed` at :1286: direct `ERROR: stale_scope` in 37 ms; API 504 after 60004 ms. A bare `pg_stat_activity` count read 1 matching row afterwards (`state` not read; not evidence of a running call) | `RESULT: PASSED`; clean stop and teardown |

All review-fix receipts (`<label>/stack-receipt.json`): `cronLaunchActiveJobs: off`, `numberedHead: 00899`, `migration00899: 00899 round8_service_acceptance_offline_presentation`, `ledgerMax 20260910152111`. No run was infra-interrupted: there was no exit 2 and no PGRST002. Logs are under `/Users/kody/.claude/rc7-evidence/e2/review-r8/<label>.log` and `<label>/run1/e2-*.log`.

The probe1 and probe2 verdicts above came from the log-text check that Codex later showed can report a false green (see Files). Read by hand, each log has exactly one error, at :1232 (probe1, `Expected: 0 Received: 1`) and at :1286 (probe2, the 504 diff). The two probes have not yet been re-run on the JSON classifier at `1221598e1`.

New readbacks in r2 and r3, once per project:

```
[RC7 e2 R2 draft on the superseded edition] 500 {"code":"55000",…,"message":"scope_edition_not_active"}
[RC7 e2 old signer refusal] 500 {"code":"55000",…,"message":"signer_not_active"}
[RC7 e2 paper own review] 403 {"code":"42501",…,"message":"insufficient_privilege"}
[RC7 e2 D close: incomplete checklist] 400 {"code":"23514",…,"message":"project closeout checklist must include every required item as completed"}
[RC7 e2 cleanup] {"tables" : 52, "rows" : 305, "projects" : 4, "f01NonDraftProposals" : 0}
```

DEFECT RC7-e2-1 confirmation at `47d500f1e` (before the repro was extended): one chromium run of the defect test with `test.fixme(` changed locally to `test(`, on the kept development stack. The change was restored with `sed`; `git diff` shows no change on that line.

```
RC7_E2_ROUND8=1 playwright test --config playwright.round8.config.ts e2e/round8/rc7-e2-consumer-journey.spec.ts \
  --grep '@rc7-e2-defect' --project chromium --workers=1
# 1 failed, at the defect step:
#   > 1133 | await expect(replace.getByText('No other household member is on file for this job.')).toHaveCount(0);
#   Expected: 0  Received: 1
```

The same run also showed the second teardown refusal (`last_owner_protected`), which led to the `-07` unseat in `rc7-e2-cleanup.sql`. Log: `/Users/kody/.claude/rc7-evidence/e2/r8dev/fixme-forced.log`.

Gates at `1221598e1`:

```
node --test apps/designer-portal/e2e/round8/rc7-e2-run.unit.mjs             # 44 pass, 0 fail (classifier: true defect ×2, both false greens, global error, extra error, retry, timeout, other test, no JSON, exit 0; drift guard; workdir required/missing/file/inside repo)
node --test apps/designer-portal/e2e/round8/run-consumer-journey.unit.mjs   # 15 pass, 0 fail (still identical to base 3cf79663c)
pnpm --filter @patina/designer-portal type-check                            # exit 0
tsc --noEmit -p <temp tsconfig extending apps/designer-portal/tsconfig.json, files = the lane .spec.ts and .journey.ts, types node>  # exit 0
```

Gates at `86c8f482a`:

```
node --test apps/designer-portal/e2e/round8/rc7-e2-run.unit.mjs             # 27 pass, 0 fail
node --test apps/designer-portal/e2e/round8/run-consumer-journey.unit.mjs   # 15 pass, 0 fail (restored to base 3cf79663c)
pnpm --filter @patina/designer-portal type-check                            # exit 0 (its program includes rc7-e2-consumer-journey.journey.ts)
tsc --noEmit -p <temp tsconfig extending apps/designer-portal/tsconfig.json, including the lane .spec.ts and .journey.ts>  # exit 0
```

Gates at `47d500f1e`:

```
node --test apps/designer-portal/e2e/round8/run-consumer-journey.unit.mjs   # 25 pass, 0 fail (the lane-edited version)
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
  - The test is `@rc7-e2-defect-1 the Replace form offers the job household's other members and replaces the signer` in `rc7-e2-consumer-journey.journey.ts:1218`, in describe `RC-7 e2 defects`, outside the counted legs.
  - It is `test.fixme(process.env.RC7_E2_DEFECT_PROBE !== '1', 'DEFECT RC7-e2-1')`. `rc7-e2-run.mjs --defect-probe 1` lifts it, and nothing else does.
  - Steps:
    1. Job A: draft request `rc2-sa-1`, then click `Replace this person` on `(Client)`.
    2. The defect step (:1232): the form must not say `No other household member is on file for this job.`, and must offer the third household card.
    3. Past the offer, the designer chooses the third card in `New person`, gives a reason, and submits `Replace`.
    4. The card shows `was replaced` and the active `RC7 Fictional Third`.
    5. `replacementAudit()` reads back the replaced row: reason, `replaced_by` = designer, revision + 1, and the successor card active and required.
  - Result on this base: the form shows `No other household member is on file for this job.` (`service-acceptance-section.tsx:434`) instead of offering the third household card. The test fails at step 2.
  - Confirmed failing at that step: at `47d500f1e` (Commands), and again with the extended repro at `86c8f482a` (probe1: `1 failed` at :1232, `Expected: 0 Received: 1`).
- Root cause:
  - `packages/supabase/src/hooks/use-households.ts:303-322` (`useProjectHousehold`) reads `projects.client_profile_id` and matches it to `designer_clients.client_id`.
  - `client_profile_id` is FK'd to `client_profiles(id)`, a disjoint uuid space (`supabase/migrations/00555_*.sql:523-528` says so). It is NULL on every local project (58/58).
  - Composed jobs carry no `project_parties` client seats, so the seat fallback (:325-330) is empty too. No household means no cards.
- Proposed fix: at :305 / :311, select `projects.client_id` (the auth uid that `designer_clients.client_id` holds) instead of `client_profile_id`. Codex review confirmed the root cause; per the orchestrator, the fix lane fixed it in `1028ea50c`. The fixme stays here until that lands on this base.

### DEFECT RC7-e2-2 — a `40001` refusal hangs through the API instead of reaching the caller

- Severity: medium to high.
  - Every refusal raised with `ERRCODE = 'serialization_failure'` is affected. That is 19 raises across 00886–00899 (by grep):
    - `stale_signer_policy` ×7 and `stale_scope` ×6;
    - `paper_document_changed` ×2;
    - `scope_edition_stale`, `scope_execution_document_moved`, `stale_obligations` and `service_completion_requires_read_committed` ×1 each.
  - They cover the client respond, paper record and review, signer replacement and service completion paths. Only `stale_scope` on paper record was exercised; the others are inferred from the same raise.
  - The intended stale-page message never arrives. The caller waits 60 s for a gateway 504.
  - Confidence: high on the symptom (r1 on both projects, probe2). The mechanism below is an unverified hypothesis; a separate fix lane is establishing it.
- Repro:
  - `@rc7-e2-defect-2 a paper with a mismatched scope code is refused promptly with stale_scope through the API`, `rc7-e2-consumer-journey.journey.ts:1250`, fixme unless `--defect-probe 2`.
  - Steps: job P; draft `rc7-sa-1` in the UI; the designer's `present_service_acceptance_offline`; then `record_service_acceptance_paper_intake` with the scope hash's last digit changed.
  - The database refuses at once as the designer (`authenticated`, rolled back): `ERROR: stale_scope`, 37 ms.
  - The same call through `/rest/v1/rpc` as the designer returns HTTP 504 `The upstream server is timing out` after 60 004 ms. 0 intakes are written.
  - A bare count of `pg_stat_activity` rows whose query text matched read 1 after the 504. It did not read `state`, and an idle pooled connection keeps its last query, so it does not show a running call. Since `1221598e1` the repro logs each matching backend's `state`, `application_name`, query and transaction age, and wait event instead.
  - Probe2 failed at :1286, as required.
- Hypothesis (unverified; not traced in PostgREST source and not shown by the database; a separate fix lane is establishing the mechanism):
  - The RPCs raise a deterministic refusal with SQLSTATE `40001` (for example `00886_round8_service_acceptance.sql:900`, inside `record_service_acceptance_paper_intake` (:856): `RAISE EXCEPTION 'stale_scope' USING ERRCODE = 'serialization_failure'`).
  - PostgREST's transaction layer treats `40001` as a transient serialization failure and retries the transaction. The refusal would recur on every retry, so the call would run until Kong's 60 s upstream timeout.
- Proposed fix, if the hypothesis holds: raise these refusals with a non-retryable SQLSTATE that PostgREST maps to a client error. Examples are `check_violation` (23514 → 400), or a custom `P0001` with the message kept. Keep the message strings (`stale_scope`, …) that the portal maps to copy. Then re-run this repro and expect `{code, message: 'stale_scope'}` within 10 s.
- Earlier review-fix tree: the same branch sat inside the paper journey at `9b7be17fe`. Run r1 failed there, which is how the defect was found; the branch was then moved to this repro.

## Harness debt (not fixed; not owned)

- Cross-lane: the portals' help-system hook reads production Sanity from the browser in every e2e run that does not block it. This lane blocks it per context since `1221598e1`. A shared fix (an env switch that turns the help-system's Sanity client off in local runs, or a shared route block in the e2e fixtures) belongs to the integration lead.
- `apps/designer-portal/e2e/helpers/psql.ts:21`, `e2e/round8/global-setup.ts:11` and `e2e/round8/global-teardown.ts:8` fall back to `127.0.0.1:54322` (the shared stack) when `SUPABASE_DB_URL` is unset. The runner always sets it to the owned 57122. The rc7-e2 journey's `owned()` refuses any DB URL but 57122.
- **Merged-gate debt: `e2e/round8/global-teardown.ts`** (not edited here; the integration lead owns the fix). It cannot purge the F01 accounts once any round-8 test leaves an executed agreement or a non-F01 member on the F01 studio.
  - `:72` (`DELETE FROM auth.users` for the F01 actors) cascades into the F01 designer's non-draft proposals. Guard `guard_proposal_copy_immutability` (00390) then refuses: "non-draft proposals are immutable editions and cannot be deleted".
  - `:61-70` keeps the F01 studio whenever it has a member outside the two F01 actors (here the RC2 studio member `-07`). The cascade then removes the F01 owner from a surviving studio, and `last_owner_protected` (00319) fires.
  - `:8` falls back to `127.0.0.1:54322` (the shared stack) when `SUPABASE_DB_URL` is unset.
  - Proposed fix: before :72, a scoped purge of the F01 designer's projects and proposals in replica mode. It would follow the transaction-local `session_replication_role = replica` pattern at :30-41, which already does this for the F01 job's filed plan evidence.
  - Until then, this lane cleans up its own jobs in `test.afterAll` (`rc7-e2-cleanup.sql`). Any other round-8 spec that executes agreements for F01 needs the same.
- `apps/designer-portal` ESLint ignores `e2e/`.

## Not verified, and why

- iOS response and the iOS paper and care surfaces: no simulator or device in this lane. `webkit-iphone` is Playwright WebKit with iPhone 14 emulation, not the app.
- Signer replacement through the designer UI: DEFECT RC7-e2-1.
- GC trade acceptance (`trade_scope_open`) as distinct from studio acceptance: no trade-scope fixture in the composed jobs.
- Purchase and warranty records on care: no such records on the composed jobs.
- Controlled post-close scope edits (an amendment after close): not exercised.
- The WebKit first-tap miss (RC7-E2-OBS-1): not root-caused. It now fails the test whenever it recurs.
- A20 rejection → new evidence: there is no product refusal to assert (RC7-E2-OBS-2); it needs a ruling.
- The GC's cabinetry delivery on job F: recorded by fixture SQL. The 00861 receiving RPCs need a studio PO or studio purchase, which a client-bought, GC-installed line does not have (see GC delivery). Only the install that follows goes through the real RPC.
- A paper with a mismatched code refused through the API: DEFECT RC7-e2-2. The database refusal is shown; the API path hangs.
- WebKit first-tap stability: the miss recurred in 1 of 3 review-fix journeys (r1b). r2 and r3 had none. Not root-caused (RC7-E2-OBS-1).
- Screen reader: no assistive-technology pass.
- Duplicate-send protection on `Review and send`: never exercised (one `Send` per sheet). The notice counts prove row-count integrity only.
- The RC7-e2-2 mechanism (PostgREST retrying `40001`): a hypothesis. A separate fix lane owns it.
- The JSON probe classifier on real Playwright output: unit tests only (real-shaped reports) until the two probes re-run at `1221598e1`.

## Teardown

- Each counted run (runner): client portal stopped with process group gone and port 3112 free. Then `supabase stop --no-backup exit=0; containers left 0; volumes left 0`, and the scratch workdir was removed.
- The kept development stack (`patina-rc2-journey-huY6f2`) was stopped with `supabase stop --workdir <kept> --no-backup` before the counted runs. Dev ports 3110/3112 were killed and the workdir removed.
- 2026-10-29T17:13:43Z: `lsof -iTCP:<p> -sTCP:LISTEN` shows 3110, 3112, 57120, 57121, 57122, 57129 and 57183 all free. `docker ps -a` / `docker volume ls` with label `com.supabase.cli.project=patina-rc7-e2`: 0 / 0.
- Review-fix runs (r1, r1b, r2, r3, probe1, probe2): each logged a clean client stop and `supabase stop --no-backup exit=0; containers left 0; volumes left 0`. Census at 2026-10-29T18:25:27Z: 3110, 3112, 57120, 57121, 57122, 57123, 57124, 57127, 57129 and 57183 all free; containers 0 and volumes 0 for label `patina-rc7-e2`.
- Shared stack:
  - No write to 54321/54322 and no connection to them.
  - Correction: the counted run at `56bbb23cf` did read the shared stack once per journey. The runner's identity proof ran `docker exec supabase_db_supabase psql … -c 'SELECT system_identifier FROM pg_control_system();'` inside the shared DB container. It was read-only and recorded `sharedSystemId` `7701004642274893866` in the receipt.
  - Since `28f3bf3e9` the runner no longer makes that read; the c1/c2 receipts carry no shared id.
- No `--linked`, Strata or PostHog.
- Correction: every run read production Sanity (`kv3qrinl.apicdn.sanity.io`, read-only help-CMS content). The help-system hook (`packages/help-system/src/hooks/useHelpContent.ts`) fetches it from the browser.
  - r2's log has 16 `[help-system] Sanity fetch failed` lines. All 16 are `[browser]`-forwarded from the designer portal, and all ended in a request error. The client portal's dev log has none, and no server-side fetch appears.
  - Since `1221598e1` every journey browser context aborts `*.sanity.io` requests (`context.route`), and `afterAll` logs `[RC7 e2 sanity requests blocked] N`. The browser still logs `Sanity fetch failed` for each aborted request.
  - App config is not edited. Other lanes' journeys still make these reads (Harness debt).
