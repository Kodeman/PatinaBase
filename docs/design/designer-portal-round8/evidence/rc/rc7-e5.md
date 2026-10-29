# RC-7 E5 — commerce and money evidence

Date: 2026-10-29. Worktree tip tested before rework: `3cf79663c05d861863e636fee9f78db7567feded`; initial E5 tests commit `ccf11248d`. Owned stack `patina-rc7-e5`: API 55121, DB 55122; round-eight migration head `00899_round8_service_acceptance_offline_presentation` (a separate dated `20260910152111_create_contact_messages` sorts after numeric versions). Cron `off` as `supabase_admin`; `/rest/v1/` HTTP 200. No production connection. The reworked tests below await a fresh gate in the allocated browser slot; prior pass counts apply only to the first version.

| ID / clause | Before | Now | Spec / asserted transitions | DB readback | Runs |
|---|---|---|---|---|---|
| A10 client approves/returns exact editions | weak | weak | No actor transition run. | — | — |
| A10 material change requires renewed decision; old evidence remains readable | weak | weak | No edition-change sequence run. | — | — |
| A11 missing authority refuses release | weak | weak | No release attempt run. | — | — |
| A11 missing terms refuses release | weak | weak | No release attempt run. | — | — |
| A11 missing funding refuses release | weak | weak | No release attempt run. | — | — |
| A11 review comment is not authorization | weak | weak | No comment/authorization sequence run. | — | — |
| A11 differing maker acknowledgement is not confirmed ETA | weak | weak | No two-maker acknowledgement run. | — | — |
| A12 grouped maker orders, duplicate retry | weak | weak | `e5_order_retry.sql`: authenticated actor groups two maker-A lines, sequentially retries in one transaction, then orders maker-B line on a **legacy-origin** project (00876's purchase-authority guard takes its early return). This does not prove native authorisation or a concurrent retry. | Earlier version: 2 linked lines on first PO, total 28000; retry `P0001`/`already linked`, PO count 1; two vendor POs sum 33000. Rolled back. | Prior SQL exited 0; revised null-safe refusal requires two clean runs. |
| A12 partial receipt, damage, claim, replacement | weak | weak | Existing `receiving-paper.spec.ts` uses a different PO; not chained to these new orders. | — | — |
| A12 books exact POs/reconcile; external work excluded from payables | weak | weak | No exact-PO books/externally funded reconciliation journey. | — | — |
| A19 billable, nonbillable, dated and unresolved rates | weak | weak pending re-run | Revised `rc7-e5-hours-claim.spec.ts`: three native `Log time` actions; 12000 older, 20000 current and 50000 future studio rates test effective-date selection. | Previous version: 17m `true|none|null|unclaimed`; 30m `true|studio_member|20000|10000`; 47m `false|unclaimed`. New three-rate assertion unrun. | Previous version Chromium 2/2, WebKit iPhone 2/2; revised version unrun. |
| A19 draft claim, concurrent winner/recoverable loser, void release | weak | weak pending re-run | Two tabs submit `compose_project_invoice` together; one folio and specific claim-loss sentence, second draft-count read, reload recovery, native Void. | Previous version: one draft invoice, only rated 30m entry claimed, then `status=void` and claim released. | Previous version Chromium 2/2, WebKit iPhone 2/2; revised version unrun. |
| A19 drafts do not move issued/received/due balances | weak | weak pending re-run | Revised version seeds a sent invoice with a succeeded partial payment; reads the **product Accounts book UI** before and after draft creation, expecting nonzero `$200 issued; $50 received; $150 due`. | Earlier zero-only SQL assertion removed as tautological; revised product readback unrun. | Revised version unrun. |

## Prior suite triage

Nine red suite outcomes were observed on the earlier stack. First-failure source comparisons alone cannot establish whether additional round-eight regressions follow; the five procurement suites below need scratch-copy reruns after neutralising each legacy assertion (phase 2). No base-only stack replay has been done:

| Suite | Classification | Evidence |
|---|---|---|
| `create_po_rpc_test.sql` | provisional legacy first failure; full classification pending | Expects INSERT-linked status `ordered`, observes `approved`. Round-8 00876 rewrites the authority guard; after neutralising this assertion, rerun to find subsequent failures. |
| `phase1_accounts_locations_test.sql` | provisional pre-round-8 default | Expects claim window 3, observes NULL; 00858 removed invented defaults before round 8. Main-only replay not done. |
| `phase1_tracking_clocks_test.sql` | provisional legacy first failure; full classification pending | Expects 3/5 days, observes NULL; rerun a scratch copy past this assertion. |
| `phase2_ack_drafts_quotes_exceptions_test.sql` | provisional legacy first failure; full classification pending | Expects carrier clock, observes NULL; rerun a scratch copy past this assertion. |
| `phase2_deposits_release_install_samples_test.sql` | **unclassified** first failure; full classification pending | Earlier note said observed amount 33900 contradicted the expectation, but this test explicitly expects 33900 at `supabase/tests/procurement/phase2_deposits_release_install_samples_test.sql:1005`. Recover actual first failure from original log, then neutralise only an established legacy assertion and rerun. |
| `state_chain_test.sql` | provisional legacy first failure; full classification pending | Expects INSERT-linked item `ordered`, observes `approved`; rerun a scratch copy past this assertion. |
| `00858_claim_window_unknown.test.sql` | provisional pre-round-8/date-sensitive | Late-October sweep expects approaching deadline notification; `sweep_procurement_clocks` and `procurement_claim_deadline` unchanged by round 8. No main-only replay. |
| `00845_client_edition_rpcs.test.sql` | round-8 historical-envelope mismatch; defect determination pending | Port-swapped copy fails TAP #107 (six envelopes differ). `supabase/migrations/00883_round8_external_reader_parity.sql:1022-1023` adds responsibility/external fulfilment to each item; `supabase/tests/00845_client_edition_rpcs.test.sql:1050` requires byte-equality with replayed 00842 except caption date. Exact JSON diff and intended-contract versus regression decision await phase 2. |
| `00848_client_edition_installed_closeout.test.sql` | harness port debt | Original hard-coded dblink to 54322 led to seven TAP failures; port-swapped scratch copy exits 0. 00848 also embeds an unused 54321 storage URL; do not run the original. |

`time_rate_resolution_test.sql` was falsely counted as red by the prior summary's log parser: its tail prints `All time_rate_resolution assertions passed`, `ROLLBACK` and no `ERROR:`.


## Commands and outcomes

- Previous SQL version: `export SUPABASE_DB_URL=postgresql://postgres:…@127.0.0.1:55122/postgres; psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/round8_rc7/e5_order_retry.sql`: five runs exited 0 (last two as authenticated; last one checked `P0001`/`already linked`). The revised null-safe SQL has not run.
- Previous browser version: `pnpm --dir /Users/kody/Code/patina-r8-rc7-e5/apps/designer-portal exec playwright test --config playwright.round8.config.ts e2e/round8/rc7-e5-hours-claim.spec.ts --project chromium|webkit-iphone` with owned Supabase URL/DB and port 3310: Chromium 2/2 and WebKit iPhone 2/2 passed. Those runs had only one studio rate and zero pre-existing issued balances; they do **not** verify the revised assertions.
- Previous version: `pnpm --dir /Users/kody/Code/patina-r8-rc7-e5 --filter @patina/designer-portal type-check` exited 0 (`tsc --noEmit`). Type-check of the revision pending.
- Previous version: `pnpm --dir /Users/kody/Code/patina-r8-rc7-e5 --filter @patina/designer-portal lint` exited 0: `250 problems (0 errors, 250 warnings)`; e2e files are excluded by ESLint. Lint of the revision pending.
- Early A19 diagnostic (pre-refresh fixture): Chromium 1 failed before claim; composer said `This project couldn't be read`. The spec created its project after the authenticated page had loaded `useProjects`; reloading after fixture insertion fixed the stale test cache. Subsequent two Chromium and two WebKit runs passed on that earlier source version.
- A19 final-source first Chromium attempt: **infra-interrupted (VM-wide Postgres crash at 11:13:17 UTC)**, with no test collected. Global `F01` fixture setup/teardown saw `FATAL: the database system is in recovery mode`; Docker reported backend exit code 2, `OOM=false`, and cron remained `off`. Other lane Postgres containers crashed within seconds; host swap was 34.4/35.8 GB. After `/rest/v1/` recovered to HTTP 200, Chromium passed twice. Not a product assertion failure.
- No E5 product defect was established.


## Defects

**Open RC7-E5-1 (classification pending):** `00845_client_edition_rpcs.test.sql:1050` reports six historical envelope differences after the 00883 reader added `responsibility` and `externalFulfilmentId` at `00883_round8_external_reader_parity.sql:1022-1023`. Phase 2 must inspect the exact JSON differences and determine intended contract change (stale equality assertion) versus product regression. The VM-wide F01 interruption is environmental, not an E5 product defect.

## Not verified

A10 exact-edition decisions and material-change rereview; A11 three distinct release holds, comment, and maker acknowledgment/ETA; A12 native-authorisation ordering, concurrent retry, linked receipt/damage/claim/replacement, books reconciliation and externally funded exclusion. The revised A19 browser and SQL suites await the allocated test slot; first-version passes are not revision evidence. Five procurement suites require scratch-copy follow-through past their first legacy failure; 00845 requires exact JSON diff and a contract/regression decision. No production run.

## Teardown

`supabase stop --workdir /private/tmp/claude-501/-Users-kody-Code-patina-merged/1460bfe7-3b74-49b1-b90e-b7c7dd33fdc9/scratchpad/rc7-e5-FPeCQi --no-backup` exited 0 after the earlier run: `Stopped supabase local development setup` with project filter `patina-rc7-e5`. `lsof` returned no listeners on 3310, 55121 or 55122. Playwright-generated `apps/designer-portal/next-env.d.ts` was restored before the initial commit. The rework phase did not restart the stack or browser.
