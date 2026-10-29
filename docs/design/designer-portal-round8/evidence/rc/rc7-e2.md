# RC-7 lane e2 — service acceptance, completion and care journeys (A20–A23)

## Header

- Worktree `/Users/kody/Code/patina-r8-rc7-e2`, branch `r8-rc7-e2`, tested tip: `56bbb23cf` (base `3cf79663c` + the lane test commit; the counted run used this exact tree, uncommitted).
- Owned stack: `project_id` `patina-rc7-e2`; API 57121, DB 57122, shadow 57120, pooler 57129, inspector 57183. Designer portal 3110, client portal 3112. `edge-runtime` kept; `EMAIL_DEV_MODE=dry_run`.
- Counted-run stack: see Commands (fresh, started by the runner).
- Migration head applied: `00899_round8_service_acceptance_offline_presentation` (ledger max `20260910152111`, 825 rows).
- `cron.launch_active_jobs = off` on the owned DB (supabase_admin, `ALTER SYSTEM` + `pg_reload_conf()`, confirmed with `SHOW`). No step needed a scheduled job.
- Date: 2026-10-29.

## Files

- `apps/designer-portal/e2e/round8/rc7-e2-consumer-journey.journey.ts` — three legs, 7 tests, plus one `test.fixme` (`@rc7-e2-defect`, outside every runner leg) for DEFECT RC7-e2-1.
- `apps/designer-portal/e2e/round8/rc7-e2-fixture.sql` — `\ir consumer-journey-fixture.sql` (job A for the RC-2 household), then jobs P (paper), F (full service), D (design only), extra household members, drawing evidence behind uploaded files, manifests `rc7-sa-1`.
- `apps/designer-portal/e2e/round8/run-consumer-journey.mjs` / `.unit.mjs` — runner runs the three e2 legs by default inside one client-portal start/stop; `--with-rc2` adds the five RC-2 legs first; cron quieted after ownership proof. Both files are named as owned in the E2 brief; changed so the counted gate runs the new legs (each needs the client portal on 3112) and so cron stays off on the owned DB. Unit: e2 leg counts `[3, 1, 3]`.

## Criteria

Before = R3b rating (`evidence/rc/rc6-reviews/r3b-evidence-full.md` rows A20–A23, all **weak**). Spec = `rc7-e2-consumer-journey.journey.ts` (line of the test). Every transition is followed by a DB readback (psql as `postgres` on 57122, or the real actor's REST call); the readback column names it. Runs = counted runner passes (see Commands).

| ID / clause | Before | Now | Spec | Asserted | Readback | Runs |
|---|---|---|---|---|---|---|
| A20 agreed scope edition + required signer policy | weak | covered | R1 :513, R2 :546, R3 :612, paper :700 | client sees `What you’re accepting` for the active edition; evidence buttons disabled until loaded; issued PDF bytes fetched from the popup's signed URL equal `plan_prints.sha256` | `service_acceptance_requests` edition / `scope_content_hash` / `evidence_manifest_hash` / `signer_policy_revision`; `service_acceptance_evidence_snapshots` members | 2/2 |
| A20 one required accepted, another pending = incomplete | weak | covered | R2 :546, R3 :612 | partner accepts in their own context; the card still reads waiting | request `lifecycle sent / outcome pending`, one `service_acceptance_responses` row | 2/2 |
| A20 rejection requires new evidence | weak | covered | R1 :513 → R2 :546 | client returns with a reason; request 2 binds a new manifest (`rc2-sa-2`); nothing carried over | R1 `closed/returned`, response `return` with reason; R2 frozen members = revised drawing set only | 2/2 |
| A20 signer replacement requires new evidence | weak | **defect** (RPC covered) | R3 :612; fixme :1015 | designer replaces the client slot (RPC `replace_service_acceptance_signer` as the designer: the card's form cannot, DEFECT RC7-e2-1); card shows `was replaced` + new signer `Waiting`; old signer gets no form and REST respond → 500 `55000 signer_not_active`; replacement's own V22 notice; replacement accepts with a condition | signer row `replaced`, reason, `replaced_by` = designer, revision 2; successor card active + required; request revision 2; R3 `closed/accepted_with_conditions` with 2 responses | 2/2 |
| A20 superseded scope requires new evidence | weak | covered | R2 :546 | an executed amendment (edition 2) while R2 pending; card reads `Replaced` / `the agreed scope changed`; client RPC respond → `request_not_open`; old evidence still readable, no answer offered; next draft binds edition 2 | R2 `superseded`, `superseded_reason scope_edition_superseded`; frozen snapshot unchanged; R3 edition = edition 2 | 2/2 |
| A20 designer request follows V22 | weak | covered | `sendNotices` :360 (R1–R3, paper, F, D) | `Review and send` sheet; each notice checked by recipient; `Send the N checked` | `outbound_drafts.status sent`, `delivery_message_id ~ ^dryrun_\d+$`; request `sent` | 2/2 |
| A20 authenticated client-portal response | weak | covered | R1–R3, D :939 | each signer in their own browser context on 3112 | `responses.method portal_authenticated`, `responder` = signer profile | 2/2 |
| A20 iOS response | weak | not verified | — | — | — | — |
| A20 permitted paper intake → same scoped truth | weak | covered | paper :700 | all-paper household: notices are address-less holds (00891); studio marks presented offline (00899); paper per slot uploaded (`Record paper for <Slot>`), stamped, reviewed by a second admin; client sees `Reviewed paper response`, no answer of their own | request `sent` via offline presentation, 0 sent drafts; intakes `pending_review` → reviewed with stored sha; responses `paper_intake`, `responder NULL`, same edition / scope / evidence hashes; `closed/accepted` | 2/2 |
| A21 full-service obligations | weak | covered | job F :877 | blockers `studio_line_open`, `studio_installation_open`, `agreed_phase_open` shown; excluded `Cabinetry` informational; Complete disabled → install (`record_project_ffe_installed`) + phases → enabled → completed | `_derive_studio_service_obligations()` blockers/info before and after; `studio_service_completions` `completed` | 2/2 |
| A21 design-only obligations | weak | covered | job D :939 | phases then acceptance only; complete; care `pkg.design` | blockers `acceptance_not_accepted:-` → none; completion `completed` | 2/2 |
| A21 client-buy obligations | weak | covered | job A :800 | client-bought `pkg.living` line + external fulfilment informational (`Outside work still in progress`) | info `external_fulfilment_open:pkg.living` | 2/2 |
| A21 service / financial closeout / closure distinct | weak | covered | job A :800, job F :877, job D :939 | `[data-financial-hold]` `holds project closure, not service completion` while Complete is enabled; completing the service leaves closure unchanged | `projects.status|closure_checklist|portfolio_snapshot` identical before/after completion; F `uncollectedContractCents 500000` | 2/2 |
| A21 GC trade acceptance distinct | weak | not verified | — | — | — | — |
| A21 close_project semantics preserved | weak | covered | job F :877, job D :939 | F `close_project` refused `project cannot close: 1 FF&E item(s) are not installed` (the client's cabinetry line); D closes | F closure unchanged, completion unchanged; D `projects.status completed`, responses and completion unchanged by closing | 2/2 |
| A22 delivery / opening / reading evidence record nothing | weak | covered | R1 :513 | after send, after the client opens the request, after reading evidence and opening its file | 0 responses at each step; request `sent/pending` | 2/2 |
| A22 silence / walkthrough record nothing | weak | covered | job D :939 | Design + Final walkthrough phases complete, client silent | 0 responses; `sent/pending`; blocker `acceptance_not_accepted:-`; Complete disabled | 2/2 |
| A22 conditional + unresolved included obligation visibly held | weak | covered | job A :800 | `[data-blocker="agreed_phase_open"]` on `Living room`, open condition text shown, Complete disabled; after phases → `completed_with_conditions`; condition resolved → `completed` | blockers `agreed_phase_open:pkg.living` → none; completion `completed_with_conditions` → `completed`, `revoked null` | 2/2 |
| A22 informational external punch item not a blocker | weak | covered | job A :800 | `upsert_install_punch_item` (designer) → `Open install punch items` informational; Complete enabled with it open | info `punch_item_open:-`, blockers `[]` | 2/2 |
| A23 care retains edition + responsible party | weak | covered (edition, party); purchase/warranty records not verified | job A :800, F :877, D :939 | `scope edition N, in force from`, `accepted on request N`; `{label}: bought by …, installed by …`; excluded package absent | edition id = accepted request's edition | 2/2 |
| A23 deep reference returns to closeout | weak | covered | job A :800 | `?unfold=pieces` on `/doc/<id>`, focus inside the unfold, close → opener focused | — (UI focus) | 2/2 |
| A23 later care question does not reopen or bill | weak | covered | job D :939 | client posts on the project thread (REST, own JWT) after close; client sees `The studio’s service is complete` + `Care questions are still welcome.` | `comms_messages` +1 from the client; counts of invoices / requests / scope changes / completions unchanged; completion unchanged; project `completed` | 2/2 |
| A23 controlled post-close edition behavior | weak | weak | job D :939 | post-close the active edition is still the accepted one and care reads it | edition id = request edition | 2/2 |

## Commands

All with `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:57122/postgres` exported and asserted first.

Counted (the gate):

```
node apps/designer-portal/e2e/round8/run-consumer-journey.mjs --evidence /Users/kody/.claude/rc7-evidence/e2/final --runs 2 \
  --workdir /private/tmp/claude-501/-Users-kody-Code-patina-merged/1460bfe7-3b74-49b1-b90e-b7c7dd33fdc9/scratchpad
```

Fresh owned stack started by the runner (receipt `final/stack-receipt.json`, 2026-10-29T13:16:19Z): CLI 2.120.0, DB container system id `7702077839899824170` (shared stack `7701004642274893866` — different), server 172.25.0.2, `EMAIL_DEV_MODE=dry_run`, provider key names `[]`, `cron.launch_active_jobs off`, ledger max `20260910152111`. Tree under test: base `3cf79663c` plus this lane's files as committed (spec, fixture, runner and unit unchanged after the run).

| Run | @rc7-e2-acceptance | @rc7-e2-paper | @rc7-e2-completion | Journey |
|---|---|---|---|---|
| run1 | 3 passed (3.8m) | 1 passed (1.8m) | 3 passed (3.1m) | PASSED |
| run2 | 3 passed (3.7m) | 1 passed (1.9m) | 3 passed (3.3m) | PASSED |

`RESULT: PASSED` — 14/14 tests, 0 failed, 0 skipped, 0 flaky. Logs: `/Users/kody/.claude/rc7-evidence/e2/final-runner.log`, `final/run{1,2}/e2-@rc7-e2-*.log`.

Gates:

```
node --test apps/designer-portal/e2e/round8/run-consumer-journey.unit.mjs   # 18 pass, 0 fail
pnpm --filter @patina/designer-portal type-check                            # exit 0
pnpm --filter @patina/designer-portal lint                                  # exit 0; 0 errors, 250 warnings (pre-existing)
```

Development runs on the kept stack (harness iteration; not counted), `scratchpad/runleg.sh <tag> <label>` → `playwright test --config playwright.consumer-journey.config.ts --grep <tag> --workers=1`:

| Label | Result | Cause / fix |
|---|---|---|
| dev2/* | mixed | sign-in waits, popup `net::ERR_ABORTED`, phase successor order, aggregate ordering, paper address-less holds, F close reason; two runs infra-interrupted (VM-wide crash at 11:12:20 and 11:23:55 UTC) |
| dev3/acc1 | R3 failed | Replace form empty → DEFECT RC7-e2-1; R3 switched to the RPC as the designer |
| dev3/acc2 | R3 failed | last notice's row leaves the send sheet; `sendNotices` now polls the DB, then accepts `Sent` or row gone |
| dev3/acc3 | 3 passed | — |
| dev3/pap1 | 1 passed | — |
| dev3/cmp1 | 1 passed, 1 failed | `selection thread primary is inconsistent` on `record_project_ffe_installed`: fixture lines lacked `project_ffe_selection_threads` rows; added |
| dev3/cmp2 | failed at 326 ms | completion leg rerun alone on job A already completed (legs share one fixture); not a product signal |
| dev3/all1 | 7 passed (7.8m) | all three legs in order |

## Defects

### DEFECT RC7-e2-1 — the request card's Replace form finds no household on a composed job

- Severity: medium (A20 signer replacement is unreachable from the designer UI on composed jobs; the RPC and its audit are correct). Confidence: high.
- Repro: `test.fixme('@rc7-e2-defect the Replace form offers the job household's other members')` in `rc7-e2-consumer-journey.journey.ts` (describe `RC-7 e2 defects`, outside every runner leg). Job A, request `rc2-sa-1` drafted → `Replace this person` on `(Client)` → the form shows `No other household member is on file for this job.` (`service-acceptance-section.tsx:434`) instead of offering the third household card. Trace: `/Users/kody/.claude/rc7-evidence/e2/dev3/acc1/`.
- Root cause: `packages/supabase/src/hooks/use-households.ts:303-322` (`useProjectHousehold`) reads `projects.client_profile_id` and matches it to `designer_clients.client_id`. `client_profile_id` is FK'd to `client_profiles(id)`, a disjoint uuid space (`supabase/migrations/00555_*.sql:523-528` says so), and is NULL on every local project (58/58). Composed jobs also carry no `project_parties` client seats, so the seat fallback (:325-330) is empty too. No household → no cards.
- Proposed fix: select `projects.client_id` (the auth uid that `designer_clients.client_id` holds) in place of `client_profile_id` at :305 / :311.

## Harness debt (not fixed; not owned)

- `apps/designer-portal/e2e/helpers/psql.ts:21`, `e2e/round8/global-setup.ts:11`, `e2e/round8/global-teardown.ts:8` fall back to `127.0.0.1:54322` (the shared stack) when `SUPABASE_DB_URL` is unset. The rc7-e2 spec does not use them: its `owned()` refuses any DB URL other than 57122.
- Machine-wide Postgres exit-code-2 crashes (11:12:20 and 11:23:55 UTC) surfaced as GoTrue 504 / `Sign-in unsuccessful`; `signIn()` retries up to 3 rounds. Those runs were infra-interrupted and not counted.
- `apps/designer-portal` ESLint ignores `e2e/` — `lint` on these files reports only `File ignored`.

## Not verified, and why

- iOS response and iOS paper/care surfaces — no simulator/device in this lane.
- WebKit — `playwright.consumer-journey.config.ts` is chromium only (config not owned).
- Signer replacement through the designer UI — DEFECT RC7-e2-1.
- GC trade acceptance (`trade_scope_open`) as distinct from studio acceptance — no trade-scope fixture in the composed jobs.
- Purchase / warranty records on care — no such records on the composed jobs.
- Controlled post-close scope edits (an amendment after close) — not exercised.
- Screen reader — no assistive-technology pass.

## Teardown

- Runner: `teardown: supabase stop --no-backup exit=0; containers left 0; volumes left 0`; scratch workdir removed.
- Kept development stack stopped with `supabase stop --workdir <kept> --no-backup` before the counted run; its workdir removed.
- 2026-10-29T13:35:04Z: `lsof -iTCP:<p> -sTCP:LISTEN` free for 3110, 3112, 57120, 57121, 57122, 57129, 57183; `docker ps -a` / `docker volume ls` with label `com.supabase.cli.project=patina-rc7-e2`: 0 / 0.
- Shared stack (54321/54322) never touched; no `--linked`, Strata or PostHog.
