# RC-7 E5 — commerce and money evidence

Date: 2026-10-29. Worktree tip tested before rework: `3cf79663c05d861863e636fee9f78db7567feded`; initial E5 tests commit `ccf11248d`, revised tests commit `5651eaaf4`. Owned stack `patina-rc7-e5`: API 55121, DB 55122; round-eight migration head `00899_round8_service_acceptance_offline_presentation` (a separate dated `20260910152111_create_contact_messages` sorts after numeric versions). Cron `off` as `supabase_admin`; `/rest/v1/` HTTP 200. No production connection. The reworked SQL and browser runs below supersede the initial-test counts.

| ID / clause | Before | Now | Spec / asserted transitions | DB readback | Runs |
|---|---|---|---|---|---|
| A10 client approves/returns exact editions | weak | weak | No actor transition run. | — | — |
| A10 material change requires renewed decision; old evidence remains readable | weak | weak | No edition-change sequence run. | — | — |
| A11 missing authority refuses release | weak | weak | No release attempt run. | — | — |
| A11 missing terms refuses release | weak | weak | No release attempt run. | — | — |
| A11 missing funding refuses release | weak | weak | No release attempt run. | — | — |
| A11 review comment is not authorization | weak | weak | No comment/authorization sequence run. | — | — |
| A11 differing maker acknowledgement is not confirmed ETA | weak | weak | No two-maker acknowledgement run. | — | — |
| A12 grouped maker orders, duplicate retry | weak | weak | `e5_order_retry.sql`: authenticated actor groups two maker-A lines, sequentially retries in one transaction, then orders maker-B line on a **legacy-origin** project (00876's purchase-authority guard takes its early return). This does not prove native authorisation or a concurrent retry. | 2 linked lines on first PO, total 28000; retry `P0001`/`already linked`, PO count 1; two vendor POs sum 33000. Rolled back. | Revised SQL 2/2 exited 0. |
| A12 partial receipt, damage, claim, replacement | weak | weak | Existing `receiving-paper.spec.ts` uses a different PO; not chained to these new orders. | — | — |
| A12 books exact POs/reconcile; external work excluded from payables | weak | weak | No exact-PO books/externally funded reconciliation journey. | — | — |
| A19 billable, nonbillable, dated and unresolved rates | weak | weak, partial native-path evidence | Revised `rc7-e5-hours-claim.spec.ts`: three native `Log time` actions; 12000 older, 20000 current and 50000 future studio rates test effective-date selection. | 17m `true|none|null|unclaimed`; 30m `true|studio_member|20000|10000`; 47m `false|unclaimed`. The future rate does not price the current entry. | Revised Chromium 2/2, WebKit iPhone 2/2. |
| A19 draft claim, concurrent winner/recoverable loser, void release | weak | partial | Two tabs submit `compose_project_invoice` together; one folio and specific claim-loss sentence, second draft-count read, reload recovery, native Void. | One draft invoice, only rated 30m entry claimed; after Void `status=void` and claim released. Cleanup checks six zero-residue row counts. | Revised Chromium 2/2, WebKit iPhone 2/2. |
| A19 drafts do not move issued/received/due balances | weak | partial | Seeds a sent invoice with a succeeded partial payment; reads the **product Accounts book UI** before and after draft creation. | Both readbacks: `$200.00 issued; $50.00 received; $150.00 due` (20000/5000/15000 cents), unchanged by draft. | Revised Chromium 2/2, WebKit iPhone 2/2. |

## Prior suite triage

Nine red suite outcomes were observed on the earlier stack. Five procurement suites were continued from scratch copies after neutralising identified legacy assertions (not committed). They do not substitute for a main-only replay, nor establish that every downstream failure is a round-eight regression:

| Suite | Classification | Evidence |
|---|---|---|
| `create_po_rpc_test.sql` | legacy status assertion in scratch continuation | Expects INSERT-linked `ordered`, observes `approved`; with that obsolete expectation relaxed, the scratch copy passed. The original remains red. |
| `phase1_accounts_locations_test.sql` | provisional pre-round-8 default | Expects claim window 3, observes NULL; 00858 removed invented defaults before round 8. Main-only replay not done. |
| `phase1_tracking_clocks_test.sql` | legacy first failure; unresolved downstream expectations | Expects 3/5 days, observes NULL; after neutralising that default in scratch, 7a expected `claim_window_closing` notices but observed zero, and after neutralising 7a, 7c expected account-window notices. No attribution for those later failures. |
| `phase2_ack_drafts_quotes_exceptions_test.sql` | legacy carrier-clock assertion in scratch continuation | Expects carrier clock, observes NULL; scratch copy passed after that obsolete assertion was neutralised. Original remains red. |
| `phase2_deposits_release_install_samples_test.sql` | obsolete public-metadata assertion in scratch continuation | First failure B5 had the expected amount 33900; `costCents` was absent from the public invoice line metadata. 00822 intentionally stores it in `invoice_line_item_internals.internal_metadata`. Scratch copy passed with only this privacy-obsolete assertion neutralised. Original remains red. |
| `state_chain_test.sql` | legacy first failures; unresolved downstream status expectation | INSERT-linked item observed `approved`, not `ordered`; after relaxing legacy 1a–1d in scratch, 11a again expects draft PO `ordered`. No further classification. |
| `00858_claim_window_unknown.test.sql` | provisional pre-round-8/date-sensitive | Late-October sweep expects approaching deadline notification; `sweep_procurement_clocks` and `procurement_claim_deadline` unchanged by round 8. No main-only replay. |
| `00845_client_edition_rpcs.test.sql` | **intended round-eight reader-contract change; stale historical equality assertion** | Port-swapped scratch probe still fails TAP #107: six envelopes differ, but stripping only new item fields makes all six equal (`changed_envelopes=6`, `still_different_after_stripping=0`). First item adds `responsibility` and `externalFulfilmentId` from 00883:1022-1023; 00845:1050 requires byte-equality to 00842 except the caption date. This is not an established product defect. Original remains red. |
| `00848_client_edition_installed_closeout.test.sql` | harness port debt | Original hard-coded dblink to 54322 led to seven TAP failures; port-swapped scratch copy exits 0. 00848 also embeds an unused 54321 storage URL; do not run the original. |

`time_rate_resolution_test.sql` was falsely counted as red by the prior summary's log parser: its tail prints `All time_rate_resolution assertions passed`, `ROLLBACK` and no `ERROR:`.


## Commands and outcomes

- Revised SQL: `export SUPABASE_DB_URL=postgresql://postgres:…@127.0.0.1:55122/postgres; psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/round8_rc7/e5_order_retry.sql`: 2/2 exit 0, authenticated `P0001` retry readback, `ROLLBACK`. Previous version also exited 0 on five runs, but does not replace this final count.
- Revised browser: `pnpm --dir /Users/kody/Code/patina-r8-rc7-e5/apps/designer-portal exec playwright test --config playwright.round8.config.ts e2e/round8/rc7-e5-hours-claim.spec.ts --project chromium|webkit-iphone --workers=1` with owned Supabase URL/DB and port 3310: **Chromium 2/2, WebKit iPhone 2/2**, one passed and exit 0 on each. Each run read 20000 issued, 5000 received and 15000 due before/after draft, claimed one entry and released it on Void. Expected loser-side `compose_project_invoice: claim_short` AppError appears in the browser log alongside the asserted recoverable refusal.
- `pnpm --dir /Users/kody/Code/patina-r8-rc7-e5 --filter @patina/designer-portal type-check`: exit 0 (`tsc --noEmit`).
- `pnpm --dir /Users/kody/Code/patina-r8-rc7-e5 --filter @patina/designer-portal lint`: exit 0 (`250 problems (0 errors, 250 warnings)`); e2e files are excluded by ESLint.
- Early A19 diagnostic (pre-refresh fixture): Chromium 1 failed before claim; composer said `This project couldn't be read`. The spec created its project after the authenticated page had loaded `useProjects`; reloading after fixture insertion fixed the stale test cache. Subsequent two Chromium and two WebKit runs passed on that earlier source version.
- A19 final-source first Chromium attempt: **infra-interrupted (VM-wide Postgres crash at 11:13:17 UTC)**, with no test collected. Global `F01` fixture setup/teardown saw `FATAL: the database system is in recovery mode`; Docker reported backend exit code 2, `OOM=false`, and cron remained `off`. Other lane Postgres containers crashed within seconds; host swap was 34.4/35.8 GB. After `/rest/v1/` recovered to HTTP 200, Chromium passed twice. Not a product assertion failure.
- No E5 product defect was established.


## Defects

No E5 product defect established. RC7-E5-1 is **closed as a stale historical test assertion**: 00845's byte-equality check does not account for the two intentionally added 00883 reader fields; all six envelopes match after those fields are stripped. The original test still needs a contract-aware assertion if it is to go green. The VM-wide F01 interruption was environmental, not an E5 product failure.

## Not verified

A10 exact-edition decisions and material-change rereview; A11 three distinct release holds, comment, and maker acknowledgment/ETA; A12 native-authorisation ordering, concurrent retry, linked receipt/damage/claim/replacement, books reconciliation and externally funded exclusion. Procurement tracking and state-chain scratch continuations have unresolved later expectations; no main-only replay or production run. A19 does not cover every billing branch or independent simultaneous users; its browser evidence is specific to the native path and two-tab same-account race.

## Teardown

`supabase stop --workdir /private/tmp/claude-501/-Users-kody-Code-patina-merged/1460bfe7-3b74-49b1-b90e-b7c7dd33fdc9/scratchpad/rc7-e5-FPeCQi --no-backup` exited 0 after the final runs: `Stopped supabase local development setup` with project filter `patina-rc7-e5`. `lsof` found no listeners on 3310, 55121 or 55122. Playwright-generated `apps/designer-portal/next-env.d.ts` was restored; only this evidence document remained modified before the final scoped commit.
