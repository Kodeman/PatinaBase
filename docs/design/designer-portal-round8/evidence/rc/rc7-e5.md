# RC-7 E5 — commerce and money evidence

Date: 2026-10-29. Worktree tip tested: `3cf79663c05d861863e636fee9f78db7567feded`. Owned stack `patina-rc7-e5`: API 55121, DB 55122; round-eight migration head `00899_round8_service_acceptance_offline_presentation` (a separate dated `20260910152111_create_contact_messages` sorts after numeric versions). Cron `off` as `supabase_admin`; `/rest/v1/` HTTP 200. No production connection.

| ID / clause | Before | Now | Spec / asserted transitions | DB readback | Runs |
|---|---|---|---|---|---|
| A10 client approves/returns exact editions | weak | weak | No actor transition run. | — | — |
| A10 material change requires renewed decision; old evidence remains readable | weak | weak | No edition-change sequence run. | — | — |
| A11 missing authority refuses release | weak | weak | No release attempt run. | — | — |
| A11 missing terms refuses release | weak | weak | No release attempt run. | — | — |
| A11 missing funding refuses release | weak | weak | No release attempt run. | — | — |
| A11 review comment is not authorization | weak | weak | No comment/authorization sequence run. | — | — |
| A11 differing maker acknowledgement is not confirmed ETA | weak | weak | No two-maker acknowledgement run. | — | — |
| A12 grouped maker orders, duplicate retry | weak | covered | `e5_order_retry.sql`: actor with `SET LOCAL ROLE authenticated` calls `create_purchase_order` for two maker-A lines, retries the same inputs, then orders maker-B line. | `project_ffe_items.purchase_order_id`: 2 on first PO; `purchase_orders.total_cents=28000`; retry specifically `P0001`/`already linked`, PO count 1; two distinct vendor PO IDs, sum `33000`. Rolled back. | Authenticated-role SQL 2/2 exit 0; exact-duplicate assertion final 1/1. |
| A12 partial receipt, damage, claim, replacement | weak | weak | Existing `receiving-paper.spec.ts` uses a different PO; not chained to these new orders. | — | — |
| A12 books exact POs/reconcile; external work excluded from payables | weak | weak | No exact-PO books/externally funded reconciliation journey. | — | — |
| A19 billable, nonbillable, dated and unresolved rates | weak | covered | `rc7-e5-hours-claim.spec.ts`: three native `Log time` actions. | `project_time_entries`: 17m `true|none|null|unclaimed`; 30m `true|studio_member|20000|10000`; 47m `false|unclaimed`. | Final Chromium 2/2, WebKit iPhone 2/2 passed (after one infra-interrupted Chromium setup). |
| A19 draft claim, concurrent winner/recoverable loser, void release | weak | covered | Two tabs submit `compose_project_invoice` together; one folio, one `Nothing was billed` with reload recovery; native Void. | One draft invoice (example ID `4df34b6f-3c24-4391-ba5d-963aead28607`); only rated 30m entry claimed, then `status=void` and claim released. | Final Chromium 2/2, WebKit iPhone 2/2 passed. |
| A19 drafts do not move issued/received/due balances | weak | covered | Same draft action; explicit balance SQL uses Accounts-book status filters. | `SELECT` filtered issued/received/due = `0|0|0`; no sent/partially-paid invoice on this job. | Final Chromium 2/2, WebKit iPhone 2/2 passed. |

## Prior suite triage

Nine red suite outcomes were classified by comparing their target SQL functions to `main` (no base-only stack replay):

| Suite | Classification | Evidence |
|---|---|---|
| `create_po_rpc_test.sql` | pre-existing on main (legacy assertion) | `create_purchase_order`/`ffe_ratchet_to_po_stage` unchanged by 00868–00899; expects INSERT-linked status `ordered`, observes `approved`. Round-8 `guard_project_ffe_purchase_authority` retains the explicit legacy-origin early return. |
| `phase1_accounts_locations_test.sql` | pre-existing on main (obsolete default) | expects claim window 3, observes NULL; no round-8 rewrite of `studio_vendor_claim_windows`; 00858 intentionally removed invented defaults before round 8. |
| `phase1_tracking_clocks_test.sql` | pre-existing on main (obsolete default) | expects 3/5 days, observes NULL; no round-8 rewrite of `procurement_claim_deadline`. |
| `phase2_ack_drafts_quotes_exceptions_test.sql` | pre-existing on main | expects carrier clock, observes NULL; no round-8 rewrite of `procurement_claim_deadline`. |
| `phase2_deposits_release_install_samples_test.sql` | pre-existing on main | purchase billing expects different amount, observes 33900; `add_invoice_billing_lines` unchanged by round 8 (00876 changes `record_studio_purchase` and FF&E-stage guard, not this asserted billed calculation). |
| `state_chain_test.sql` | pre-existing on main (legacy assertion) | expects INSERT-linked item `ordered`, observes `approved`; `ffe_ratchet_to_po_stage` unchanged by round 8. |
| `00858_claim_window_unknown.test.sql` | pre-existing/date-sensitive | late-October sweep expects approaching deadline notification; `sweep_procurement_clocks` and `procurement_claim_deadline` unchanged by round 8. |
| `00845_client_edition_rpcs.test.sql` | **new on round 8: historical test contract mismatch** | port-swapped copy fails only TAP #107 (6 envelopes differ versus expected 0). 00883 rewrites `_build_project_editorial` to include external presence, whereas #107 re-applies 00842 and insists the envelopes remain byte-identical except caption date. Not established as a product defect. |
| `00848_client_edition_installed_closeout.test.sql` | pre-existing harness port debt, not a product failure | original hard-coded dblink to 54322 led to seven TAP failures; port-swapped scratch copy exits 0. 00848 also embeds an unused 54321 storage URL; do not run the original. |

`time_rate_resolution_test.sql` was falsely counted as red by the prior summary's log parser: its tail prints `All time_rate_resolution assertions passed`, `ROLLBACK` and no `ERROR:`.


## Commands and outcomes

- `export SUPABASE_DB_URL=postgresql://postgres:…@127.0.0.1:55122/postgres; psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/round8_rc7/e5_order_retry.sql`: five runs exit 0 (last two with `SET LOCAL ROLE authenticated`; final run additionally requires `P0001`/`already linked`); two linked lines/28000, duplicate count 1, two maker POs/33000, `ROLLBACK`.
- `pnpm --dir /Users/kody/Code/patina-r8-rc7-e5/apps/designer-portal exec playwright test --config playwright.round8.config.ts e2e/round8/rc7-e5-hours-claim.spec.ts --project chromium|webkit-iphone` with owned Supabase URL/DB and port 3310: final version Chromium 2/2 passed, WebKit iPhone 2/2 passed. Four runs observed `[E5 A19]` with `arrived:2, claimed:1, invoices:1, voidReleased:1, issued:0, received:0, due:0`; Playwright each reported `1 passed`. The interrupted first Chromium run is excluded, replaced by a successful additional run.
- `pnpm --dir /Users/kody/Code/patina-r8-rc7-e5 --filter @patina/designer-portal type-check`: exit 0; `tsc --noEmit`.
- `pnpm --dir /Users/kody/Code/patina-r8-rc7-e5 --filter @patina/designer-portal lint`: exit 0; `250 problems (0 errors, 250 warnings)`; e2e files are excluded by the portal's ESLint config.
- Early A19 diagnostic (pre-refresh fixture): Chromium 1 failed before claim; composer said `This project couldn't be read`. The spec created its project after the authenticated page had loaded `useProjects`; reloading after fixture insertion fixed the stale test cache. Subsequent two Chromium and two WebKit runs passed on that earlier source version.
- A19 final-source first Chromium attempt: **infra-interrupted (VM-wide Postgres crash at 11:13:17 UTC)**, with no test collected. Global `F01` fixture setup/teardown saw `FATAL: the database system is in recovery mode`; Docker reported backend exit code 2, `OOM=false`, and cron remained `off`. Other lane Postgres containers crashed within seconds; host swap was 34.4/35.8 GB. After `/rest/v1/` recovered to HTTP 200, Chromium passed twice. Not a product assertion failure.
- No E5 product defect was established.


## Defects

None established by E5. `00845` is a historical byte-equality test incompatible with the 00883 external-presence reader; the F01 recovery failure is environmental. Neither has an E5 product-code fixme reproducer.

## Not verified

A10 exact-edition decisions and material-change rereview; A11 three distinct release holds, comment, and maker acknowledgment/ETA; A12 linked receipt, damage, claim, replacement, books reconciliation and externally funded exclusion. Existing red suites' `main` attribution is source-diff inference, not a base-only replay. No production run.

## Teardown

`supabase stop --workdir /private/tmp/claude-501/-Users-kody-Code-patina-merged/1460bfe7-3b74-49b1-b90e-b7c7dd33fdc9/scratchpad/rc7-e5-FPeCQi --no-backup` exited 0: `Stopped supabase local development setup` with project filter `patina-rc7-e5`. `lsof` returned no listeners on 3310, 55121 or 55122. Playwright-generated `apps/designer-portal/next-env.d.ts` was restored before commit.
