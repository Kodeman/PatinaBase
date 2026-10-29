# RC-7 lane e2 — service acceptance, completion and care journeys (A20–A23)

## Header

- Worktree `/Users/kody/Code/patina-r8-rc7-e2`, branch `r8-rc7-e2`. Counted runs c1/c2 tested tip `47d500f1e` (base `3cf79663c` + lane commits `56bbb23cf`, `7ca21c5dc`, `28f3bf3e9`, `47d500f1e`); their stack receipts record head `47d500f1e`.
- Review fixes (Opus cross-provider review, fix-then-accept) land after `037952e6b`. Their counted runs r1/r2 are under Commands → Review-fix runs; until those pass, every row's Runs column shows only c1/c2, which predate the fixes.
- Owned stack: `project_id` `patina-rc7-e2`; API 57121, DB 57122, shadow 57120, pooler 57129, inspector 57183. Designer portal 3110, client portal 3112. `edge-runtime` kept; `EMAIL_DEV_MODE=dry_run`.
- Counted-run stacks: one fresh stack per run, started and stopped by the runner (receipts under Commands).
- Migration head applied: numbered head `00899` (`00899_round8_service_acceptance_offline_presentation`). The ledger also holds `20260910152111_create_contact_messages`, and `max(version)` sorts as text, so the c1/c2 receipts' `ledgerMax 20260910152111` is not the head. From the review-fix runs on, `rc7-e2-run.mjs` writes `numberedHead` (`SELECT max(version) FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]{5}$'`) and `migration00899` (`SELECT version || ' ' || name … WHERE version = '00899'`) into the receipt.
- `cron.launch_active_jobs = off` on the owned DB (receipt `cronLaunchActiveJobs: off`). No step needed a scheduled job.
- Date: 2026-10-29.

## Files

- `apps/designer-portal/e2e/round8/rc7-e2-consumer-journey.journey.ts`: three legs with 7 tests, a file-level `test.afterAll` cleanup, and one repro (`@rc7-e2-defect`, outside the counted legs) for DEFECT RC7-e2-1. The repro is `test.fixme(process.env.RC7_E2_DEFECT_PROBE !== '1', …)`: fixme unless `rc7-e2-run.mjs --defect-probe` lifts it.
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
  - `--defect-probe` runs only `@rc7-e2-defect` on chromium with `RC7_E2_DEFECT_PROBE=1`. It passes only on exit 1 with exactly `1 failed`, and only when the log carries the defect-step text `No other household member is on file for this job.`
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

Runs: c1 = counted run 1, c2 = counted run 2, both at `47d500f1e`, before the review fixes. Each is `14 passed`, 7 on `chromium` and 7 on `webkit-iphone`, with runner exit 0. r1 and r2 are the review-fix runs (`rc7-e2-run.mjs`), still pending.

A clause marked **covered (re-run pending)** has a negative branch that the review fixes added. It counts as covered only once r1 and r2 pass. Lines below are in the review-fix tree.

| ID / clause | Before | Now | Spec | Asserted | Readback | Runs |
|---|---|---|---|---|---|---|
| A20 agreed scope edition + required signer policy | weak | covered | R1 :594, R2 :627, R3 :700, paper :786 | client sees `What you’re accepting` for the active edition; evidence buttons disabled until loaded; issued PDF bytes fetched from the popup's signed URL equal `plan_prints.sha256` | `service_acceptance_requests` edition / `scope_content_hash` / `evidence_manifest_hash` / `signer_policy_revision`; `service_acceptance_evidence_snapshots` members | c1 ✓✓, c2 ✓✓; r1/r2 pending |
| A20 one required accepted, another pending = incomplete | weak | covered | R2 :627, R3 :700 | partner accepts in their own context; the card still reads waiting | request `sent / pending`, one `service_acceptance_responses` row | c1 ✓✓, c2 ✓✓; r1/r2 pending |
| A20 rejection requires new evidence | weak | **weak** | R1 :594 → R2 :627 | Client returns with a reason. The returned request stays `closed/returned`, and request 2 freezes its own snapshot.<br>Request 2 binds a different manifest (`rc2-sa-2`) only because the journey chose it. The product does not require it: `create_service_acceptance_request` (00889:446, 00891:47) has no check against a returned request's manifest. A draft on the returned `rc2-sa-1` would be accepted, so no refusal branch exists to assert (RC7-E2-OBS-2). | R1 `closed/returned`, response `return` with reason; R2 `evidenceHash ≠` R1's; R2 frozen members = revised drawing set only | c1 ✓✓, c2 ✓✓ (positive path only) |
| A20 signer replacement requires new evidence | weak | defect | R3 :700; repro :1209 | The card's Replace form cannot offer the household (DEFECT RC7-e2-1), so the designer's own session calls `replace_service_acceptance_signer`. The card shows `was replaced` and the new signer `Waiting`.<br>The old signer gets no form. Their REST respond is refused with exactly `{status 500, code 55000, message signer_not_active}` (:761; RC7-E2-OBS-3).<br>The replacement gets their own V22 notice and accepts with a condition. | signer row `replaced`, with reason, `replaced_by` = designer, revision 2; successor card active and required; request revision 2; R3 `closed/accepted_with_conditions` with 2 responses | c1 ✓✓, c2 ✓✓ (RPC path); UI path: repro fails at the defect step |
| A20 superseded scope requires new evidence | weak | covered (re-run pending) | R2 :627, R3 :700 | While R2 is pending, the real actors execute an amendment over HTTP.<br>Designer: `create_service_addendum`, `copy_agreement_parts_from_authority`, `upsert_agreement_parts`, `send_commercial_document`. Client: `sign_design_services_agreement`. Designer: `countersign_design_services_agreement`.<br>The card reads `Replaced` / `the agreed scope changed`. The client's respond is refused with exactly `{500, 55000, request_not_open}` (:668). The old evidence stays readable, with no answer offered.<br>**New:** the designer's `create_service_acceptance_request` on the superseded edition is refused with exactly `{500, 55000, scope_edition_not_active}`, and the request count is unchanged (:696).<br>R3 binds edition 2. Its manifest hash equals R2's (same `rc2-sa-2`, asserted at :711). What is new is the scope edition and request 3's own send-time freeze. | R2 `superseded`, `scope_edition_superseded`; edition 1 `superseded`, edition 2 active; frozen snapshot unchanged; refused draft writes no request; R3 edition = edition 2, `scopeHash ≠` R2's | c1 ✓✓, c2 ✓✓ (without the refused draft); r1/r2 pending |
| A20 designer request follows V22 | weak | covered (re-run pending) | `sendNotices` :405 (R1–R3, F, D) | `Review and send` sheet; each notice checked by recipient; `Send the N checked`; the row reads `Sent` or leaves the sheet.<br>**New:** the tap count goes in a `review-and-send-taps` annotation and a `taps=N` log line. A send that needed the one allowed retap fails the test (`expect.soft(taps).toBe(1)`, :430; RC7-E2-OBS-1).<br>**New:** exact notice counts per request. After a send, `sent` = sent before + the N checked, and the total rows are unchanged, so a duplicate send or a duplicate draft fails. | `outbound_drafts.status sent`, `delivery_message_id ~ ^dryrun_\d+$`; request `sent`; per-request `{sent, total}` | c1 ✓✓, c2 ✓✓ (0 retaps); r1/r2 pending |
| A20 authenticated client-portal response | weak | covered | R1–R3, F :1002, D :1093 | each signer answers in their own browser context on 3112, with the project's device (Desktop Chrome / iPhone 14) | `responses.method portal_authenticated`, `responder` = signer profile | c1 ✓✓, c2 ✓✓; r1/r2 pending |
| A20 iOS response | weak | weak | — | not run (no simulator or device in this lane; `webkit-iphone` is a browser emulation, not the iOS app) | — | — |
| A20 permitted paper intake → same scoped truth | weak | covered (re-run pending) | paper :786 | All-paper household: the notices are address-less holds (00891). The studio marks the request presented on paper (00899). Paper is uploaded per slot (`Record paper for <Slot>`), stamped, and confirmed by a second admin. The client sees `Reviewed paper response` and has no answer of their own.<br>**New (:821–:835):** the designer's `record_service_acceptance_paper_intake` with a mismatched scope code, then with a mismatched evidence code, is refused each time with code `40001` and message `stale_scope`. 0 intakes are written.<br>**New (:870–:888):** the recorder (the designer; their `organization_members` role on the recorded studio reads `owner`/`admin`) calls `review_service_acceptance_paper_intake` `confirmed` on their own stamped intake. It is refused with code `42501` and message `insufficient_privilege`. The intake stays `pending_review` with no reviewer, and there are 0 responses. | request `sent` via offline presentation, 0 sent drafts; intakes `pending_review` → `confirmed` with stored sha, `reviewed_by` = the second admin; responses `paper_intake`, `responder NULL`, same edition / scope / evidence hashes; `closed/accepted` | c1 ✓✓, c2 ✓✓ (without the refusals); r1/r2 pending |
| A21 full-service obligations | weak | covered | job F :1002 | blockers `studio_line_open`, `studio_installation_open`, `agreed_phase_open` shown; excluded `Cabinetry` is informational; Complete is disabled. After `record_project_ffe_installed` and `advance_project_phase` (designer session), Complete is enabled, then completed | `_derive_studio_service_obligations()` before and after; `studio_service_completions` `completed` | c1 ✓✓, c2 ✓✓; r1/r2 pending |
| A21 design-only obligations | weak | covered | job D :1093 | phases, then acceptance only; complete; care `pkg.design` | blockers `acceptance_not_accepted:-` → none; completion `completed` | c1 ✓✓, c2 ✓✓; r1/r2 pending |
| A21 client-buy obligations | weak | covered | job A :924 | the client-bought `pkg.living` line and the external fulfilment are informational (`Outside work still in progress`) | info `external_fulfilment_open:pkg.living` | c1 ✓✓, c2 ✓✓; r1/r2 pending |
| A21 service / financial closeout / closure distinct | weak | covered | job F :1002 (:1039–:1090); service ≠ closure also job A :965/:977, job D :1152 | Only job F asserts the financial line. `[data-financial-hold]` reads `holds project closure, not service completion` while Complete is enabled (:1039), and completing the service leaves closure unchanged (:1047). Job F, step by step:<br>1. `close_project` → 400 `1 FF&E item(s) are not installed` (cabinetry run).<br>2. GC delivery recorded (fixture; see GC delivery below), then `record_project_ffe_installed` (designer); 0 lines not installed.<br>3. `close_project` → 400 `contract total is not fully collected`.<br>4. Separate step: `compose_project_invoice`, `issue_invoice`, `record_invoice_payment` (cheque).<br>5. `close_project` → 200.<br>Jobs A and D assert only that completing the service leaves closure unchanged (A), and that closing leaves the completion unchanged (D). They show no financial line. | `projects.status`, `closure_checklist` and `portfolio_snapshot` identical through completion and both refusals. `_service_completion_financial_hold()` `{0, 0, 500000}` → issued `{1, 500000, …}` → paid `{0, 0, 0}`. F ends `completed`; the completion row is unchanged throughout | c1 ✓✓, c2 ✓✓; r1/r2 pending |
| A21 GC trade acceptance distinct | weak | weak | — | not run (no trade-scope fixture in the composed jobs) | — | — |
| A21 close_project semantics preserved | weak | covered (re-run pending) | job F :1002, job D :1093 | F: refused on the uninstalled cabinetry line, then on the uncollected fee, then closes.<br>**New (:1133–:1142):** D's `close_project` with the walkthrough unticked is refused with exactly `{400, 23514, project closeout checklist must include every required item as completed}`.<br>D then closes with a portfolio snapshot. | Each refusal leaves closure state unchanged. The incomplete-checklist refusal also leaves the completion unchanged.<br>D: `status completed`, `closure_checklist` = the six required items completed, `portfolio_snapshot` = the snapshot sent (`[RC7 e2 D closed]`). | c1 ✓✓, c2 ✓✓ (without the checklist refusal); r1/r2 pending |
| A21 close freezes the closeout | weak | covered | job D :1093 (:1155–:1175) | after close: the designer's REST PATCH of `closure_checklist` → 400 `project closeout evidence may only change through close_project`; the client's `create_client_scope_change_request` → 400 `create_client_scope_change_request: completed_project` | closure state and ledger (invoices, requests, scope changes, completions) unchanged | c1 ✓✓, c2 ✓✓; r1/r2 pending |
| A22 delivery / opening / reading evidence record nothing | weak | covered | R1 :594 | checked after send, after the client opens the request, and after reading the evidence and opening its file | 0 responses at each step; request `sent/pending` | c1 ✓✓, c2 ✓✓; r1/r2 pending |
| A22 silence / walkthrough record nothing | weak | covered | job D :1093 | Design and Final walkthrough phases completed (designer session); the client is silent | 0 responses; `sent/pending`; blocker `acceptance_not_accepted:-`; Complete disabled | c1 ✓✓, c2 ✓✓; r1/r2 pending |
| A22 conditional + unresolved included obligation visibly held | weak | covered | job A :924 | `[data-blocker="agreed_phase_open"]` on `Living room`, the open condition text shown, Complete disabled; after phases → `completed_with_conditions`; condition resolved → `completed` | blockers `agreed_phase_open:pkg.living` → none; completion `completed_with_conditions` → `completed`, `revoked null` | c1 ✓✓, c2 ✓✓; r1/r2 pending |
| A22 informational external punch item not a blocker | weak | covered | job A :924 | `upsert_install_punch_item` (designer session) → `Open install punch items` is informational; Complete is enabled while it is open | info `punch_item_open:-`, blockers `[]` | c1 ✓✓, c2 ✓✓; r1/r2 pending |
| A23 care retains the accepted edition + responsible party | weak | covered | job A :924, F :1002, D :1093 | `scope edition N, in force from`, `accepted on request N`; `{label}: bought by …, installed by …`; the excluded package is absent | edition id = the accepted request's edition | c1 ✓✓, c2 ✓✓; r1/r2 pending |
| A23 purchase / warranty records on care | weak | weak | — | not run (no purchase or warranty records on the composed jobs) | — | — |
| A23 deep reference returns to closeout | weak | covered | job A :924 | `?unfold=pieces` on `/doc/<id>`; focus lands inside the unfold; on close the opener is focused | — (UI focus) | c1 ✓✓, c2 ✓✓; r1/r2 pending |
| A23 later care question does not reopen or bill | weak | covered | job D :1093 | the client posts on the project thread (REST, own JWT) after close; the client sees `The studio’s service is complete` and `Care questions are still welcome.` | `comms_messages` +1 from the client; invoices, requests, scope changes and completions unchanged; project `completed` | c1 ✓✓, c2 ✓✓; r1/r2 pending |
| A23 controlled post-close edition behavior | weak | weak | job D :1093 | after close the active edition is still the accepted one and care reads it; a client scope change is refused. No studio post-close edit (amendment) is exercised, so the clause is only partly run | edition id = request edition | c1 ✓✓, c2 ✓✓ (partial) |

✓✓ = passed on `chromium` and on `webkit-iphone` in that run.

### Observations (not defects)

**RC7-E2-OBS-1: the WebKit `Review and send` first tap missed in development runs.** Confidence that this is a product defect: low.

- Development run `r8dev1`, R2 on `webkit-iphone`: the iPhone-emulated tap focused the button (`[active]` in the snapshot) but opened no sheet within 30 s. The run failed.
- Development run `dev2`: one WebKit send opened only on a second tap (`[RC7 e2 review-and-send] webkit-iphone: sheet opened on tap 2`).
- Counted runs c1 and c2: the first tap opened the sheet in every send on both projects, with 0 retap lines in either log. Those runs used an unbounded retap loop that absorbed misses without failing.
- Cause not established. The button's handler is a plain `onClick` (`service-acceptance-section.tsx:323-325`). `DocSheet` has a backdrop button with `onClick={onClose}` (`overlays/doc-sheet.tsx:425-431`). A touch ghost click landing on the fresh backdrop is one candidate; it is not demonstrated.
- Since the review fixes (`sendNotices` :405), the journey makes one tap and waits 20 s. On a miss it logs what the tap left behind (backdrops, dialogs, focused element) and retaps once. It records `taps=N` as a log line and a `review-and-send-taps` annotation, then fails the test through `expect.soft(taps).toBe(1)`. A missed first tap is now a visible failure, not absorbed.

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
- Job F's `RC7 kitchen run` is `pkg.cabinetry`, excluded from the studio's service: purchasing by the client, fabrication contract and installation by the GC. It has neither a PO nor a studio purchase. Reaching either RPC would mean inventing a studio purchase for goods the studio did not buy, which misstates who is responsible. So neither 00861 RPC applies to a GC-installed line, and the delivery stays fixture SQL (`status 'ordered' → 'delivered'`, :1061). The install that follows goes through the real `record_project_ffe_installed`.
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

Review-fix runs (pending). Commands, one fresh owned stack per invocation:

```
node apps/designer-portal/e2e/round8/rc7-e2-run.mjs --evidence /Users/kody/.claude/rc7-evidence/e2/review-r8/r1 --runs 1 \
  --workdir /private/tmp/claude-501/-Users-kody-Code-patina-merged/1460bfe7-3b74-49b1-b90e-b7c7dd33fdc9/scratchpad
node apps/designer-portal/e2e/round8/rc7-e2-run.mjs --evidence /Users/kody/.claude/rc7-evidence/e2/review-r8/r2 --runs 1 \
  --workdir /private/tmp/claude-501/-Users-kody-Code-patina-merged/1460bfe7-3b74-49b1-b90e-b7c7dd33fdc9/scratchpad
node apps/designer-portal/e2e/round8/rc7-e2-run.mjs --evidence /Users/kody/.claude/rc7-evidence/e2/review-r8/probe --runs 1 \
  --defect-probe --workdir /private/tmp/claude-501/-Users-kody-Code-patina-merged/1460bfe7-3b74-49b1-b90e-b7c7dd33fdc9/scratchpad
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

Gates for the review fixes (edit-only phase):

```
node --test apps/designer-portal/e2e/round8/rc7-e2-run.unit.mjs             # 26 pass, 0 fail
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
  - The test is `@rc7-e2-defect the Replace form offers the job household's other members and replaces the signer` in `rc7-e2-consumer-journey.journey.ts:1209`, in describe `RC-7 e2 defects`, outside the counted legs.
  - It is `test.fixme(process.env.RC7_E2_DEFECT_PROBE !== '1', 'DEFECT RC7-e2-1')`. `rc7-e2-run.mjs --defect-probe` lifts it, and nothing else does.
  - Steps:
    1. Job A: draft request `rc2-sa-1`, then click `Replace this person` on `(Client)`.
    2. The defect step (:1223): the form must not say `No other household member is on file for this job.`, and must offer the third household card.
    3. Past the offer, the designer chooses the third card in `New person`, gives a reason, and submits `Replace`.
    4. The card shows `was replaced` and the active `RC7 Fictional Third`.
    5. `replacementAudit()` reads back the replaced row: reason, `replaced_by` = designer, revision + 1, and the successor card active and required.
  - Result on this base: the form shows `No other household member is on file for this job.` (`service-acceptance-section.tsx:434`) instead of offering the third household card. The test fails at step 2.
  - Confirmed failing at that step on 2026-10-29 at `47d500f1e` (Commands). The extended repro's probe run is pending; it must fail at :1223.
- Root cause:
  - `packages/supabase/src/hooks/use-households.ts:303-322` (`useProjectHousehold`) reads `projects.client_profile_id` and matches it to `designer_clients.client_id`.
  - `client_profile_id` is FK'd to `client_profiles(id)`, a disjoint uuid space (`supabase/migrations/00555_*.sql:523-528` says so). It is NULL on every local project (58/58).
  - Composed jobs carry no `project_parties` client seats, so the seat fallback (:325-330) is empty too. No household means no cards.
- Proposed fix: at :305 / :311, select `projects.client_id` (the auth uid that `designer_clients.client_id` holds) instead of `client_profile_id`. Codex review confirmed the root cause; per the orchestrator, the fix lane fixed it in `1028ea50c`. The fixme stays here until that lands on this base.

## Harness debt (not fixed; not owned)

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
- The review-fix negative branches (superseded-edition draft, paper mismatch, self-review, incomplete checklist, tap count, notice counts) are written but not yet run. r1/r2 are pending.
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
