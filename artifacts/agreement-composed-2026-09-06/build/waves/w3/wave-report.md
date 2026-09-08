# Wave 3 — "The Agreement, Composed" · turnkey · wave report

Branch `agreement/w3-integration`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-integration`.
Five lanes merged at `16a75cd12` (backend, edge, designer, client, sub). The
integration steward stopped before the gates; this file is the close-out
agent's, and covers the close-out rulings and the re-gate only.

---

## Close-out fixes (R40–R47)

Date 2026-09-07. Every ruling in `rulings-2026-09-06.md` §"Wave 3 close-out
rulings" is implemented; one commit per ruling, explicit pathspecs, no push.
Both migrations are unapplied on Strata, so `00578` was edited **in place**.

| Ruling | Commit | What landed |
|---|---|---|
| R40 | `a44ed770a` `fix(agreements): R40 — one sentence, composed from what she reads` | `compose_agreement_consent` resolves the disclosure, runs the client-visible pricing basis through `_agreement_redact_client_payload`, prices from the projected `contractSumCents` and names the schedule of values off `scheduleOfValues` — no longer off `costLines`, a key the homeowner's copy does not carry. `consent-copy.ts` reads the same two keys, falling back to the authored shape only when no projection is present. `design_build_test` **T20** adds the two parity scenarios the wave lacked (closed-book projection with no cost lines; open-book projection) plus the plain `cost_plus` case, and asserts the composed sentence is the one frozen on the signature row (R36). Four jest parity cases beside them. |
| R41 | `d5070a98e` `fix(client): R41 — the closed-book door reads the projection` | `readPricingBasis` reads `contractSumCents` and `scheduleOfValues` off the payload the bundle actually sends; `scheduleOfValues()` returns the projected array in both disclosures and keeps the local derivation only as the no-projection fallback. The jest fixture is now the **production** shape (`pricingBasis()` = redacted, `authoredPricingBasis()` = the studio's row), and the open/closed disclosure test is re-pinned to match the keepsake's own assertion (T17: "the keepsake obeys the same disclosure the door did"). |
| R42 | `774d7a4d4` `fix(document): R42 — the lien waiver goes through the door the backend built` | `useRecordAgreementDrawLienWaiver` calls `record_agreement_draw_lien_waiver` with exactly its seven arguments instead of inserting into a table that carries SELECT and no INSERT grant or policy (42501 in production, green under a mocked client). `contactDisplayName` and `recordedBy` leave the input — the function snapshots the trade's name off `studio_contacts` and stamps `recorded_by` from `auth.uid()`. Result type is a literal copy of the RPC's key list; both specs pin the argument list. |
| R43 | `b3eda0212` `fix(agreements): R43 — closed book means studio-authored lines` | Under any disclosure that is not `open_book`, `_agreement_schedule_of_values` returns the studio's **authored** `scheduleOfValues`; `_validate_pricing_basis_payload` holds those lines to the contract sum to the cent at both doors; `send_commercial_document` refuses a closed book that carries none. Nothing on that table is derived from a cost line, which is RC-4's answer: the pro-rating was a uniform multiple and the allowance parts publish a (cost, line) pair by design. The composer gains the editor for the lines (a single "Construction" line is a complete answer, and the seed offers it). Types gain `DesignBuildScheduleOfValuesLine`, declared once and re-exported by `commercial.ts`. |
| R44 | *(verification only — no code change)* | The integration branch carries the designer lane's superset `packages/types/src/agreement.ts`. Verified mechanically, not asserted: all **37** exports of `main`'s 253-line file are present **byte-identical** in it, and **51 of 52** T0 exports are byte-identical — the one difference is `DesignBuildPricingBasisPayload`, the designer lane's deliberate widening (`PricingBasisKind \| null`, `costBasisCents`), which every lane's consumer compiles against. The file is 565 lines, not the ruling's 545: the designer lane's own round-2 fix commit `4d806d7df` is inside the merge. |
| R45 | `504cdf125` `fix(agreements): R45 — pin the search_path on the nine that lacked it` | `SET search_path = public, pg_temp` on `_agreement_is_int`, `_agreement_contract_sum_cents`, `_agreement_draw_rows`, `_agreement_schedule_of_values`, `_agreement_redact_client_payload` and the four `_validate_*` payload functions. Probed on the reset stack: **no** `public._agreement*` or `public._validate*` function has a null `proconfig`. |
| R46 | `c07eb728a` `fix(client): R46 — the sub lane executes` · `dc3a36dfb` `fix(client): R46 — /trade rendered a 500, so the lane could not execute` | (a) `mintTradeAgreement` minted at `state='void'` and then called `mint_trade_agreement_token`, which refuses anything but `sent`/`signed` — the fourth case threw in setup. It mints at `sent` and withdraws out of band afterwards, the path production takes. (b) **`/trade` answered 500 on every request**: `actions.ts` carries `'use server'` and exported `MIN_SIGNED_NAME_LENGTH` and the result union beside its action, which Next refuses outright. Both moved to `./types`. This is why the lane had never executed. (c) The re-open assertion is pinned to the horn 00579 takes (M2): `resolve_trade_agreement_link` admits `status='active' OR spent_at IS NOT NULL`, so a spent link reads back the settled receipt and never a second signable form, while an administratively revoked token resolves to nothing. Build-sheet §8 step 16 says that. (d) `/trade` joins the service worker's NetworkOnly list beside `/pay` and `/rfq`; the layout's guest-route comment updated with it. (e) Build-sheet §6 now names `test:coverage` as the command that enforces the floor — plain `test` prints no coverage table. |
| R47 | `89e15f067` `fix(client): R47 — a question from the origin door reaches the agreement's studio` | `renderDoor` handed **every** door the house currently being read and no designer, so a houseless paper's "Ask a question" filed into an unrelated project's thread. A houseless mark now passes `projectId={null}` and the paper's own `designerId`, so the act keys by studio (`rpc_start_direct_thread`); a project-bound door is unchanged. `DoorProposal` carries `designerId`; `threshold.test.tsx` pins both halves. |

Plus `4acf33d94` `test(client): R41 — E2E-2 asserts the schedule of values, and executes`: the SOV assertion opens the paper under "Read it in full" (the door's own act) before reading the section, and the e2e fixture gained the three Halvorsen allowances — without them the composed consent sentence stops one fragment short of `HALVORSEN_DESIGN_BUILD_CONSENT`, the pin both halves are asserted against. The spec had never run, so the gap had never been read.

### What did NOT change

- No production mutation of any kind. Nothing pushed.
- No edge-function source touched; no `_shared` file touched (so no importer needs redeploying for this pass).
- No Stripe call, key or webhook touched.
- No grant or revoke moved: `python3 scripts/generate-legacy-grants.py` re-ran to "baseline + 2568 replayed statements" and `git diff --stat supabase/seed/00-legacy-grants.sql` was **empty**.
- No pinned hash in `supabase/tests/edge_api/public_sd_hardening_contract_test.sql` needed re-pinning: none of the functions this pass redefined (`compose_agreement_consent`, `_agreement_schedule_of_values`, `_validate_pricing_basis_payload`, `send_commercial_document`, the nine `search_path` pins) appears in either expectation table, and the suite passes.
- `packages/supabase/src/database.types.ts` is unchanged — this pass altered function bodies, not schema.

---

## Gates — the re-gate, in order

Every command below was run in the integration worktree and its real output read.

| # | Gate | Result |
|---|---|---|
| 1 | `supabase db reset --workdir …/agent-agr-w3-integration` | **clean**; "Finished supabase db reset". Ledger head probed after: `00579, 00578, 00577`. Recorded in `stack-notice.md`. |
| 2 | `./scripts/run-sql-tests.sh` (post-reset) | **total 166 · green 145 · expected-fail 21 · unexpected-fail 0 · effective-green 166/166**. R31's "the four unexpected SQL failures must return to green" is met; `rls/project_notes_test.sql` PASSED on the post-reset run. |
| 3 | `psql -v ON_ERROR_STOP=1 -f` per suite | `commercial/design_build_test.sql` exit 0 · **19 PASS** · `commercial/trade_agreement_test.sql` exit 0 · 8 PASS · `commercial/agreement_parts_test.sql` exit 0 · 30 PASS · `commercial/agreement_library_test.sql` exit 0 · 14 PASS · `commercial/agreement_fee_schedules_test.sql` exit 0 · 11 PASS · `commercial/agreement_parts_projection_test.sql` exit 0 · 5 PASS · `commercial/multi_studio_signature_test.sql` exit 0 · 7 PASS · `billing/studio_invoice_test.sql` exit 0 · `edge_api/public_sd_hardening_contract_test.sql` exit 0 · `edge_api/public_rpc_authorization_contract_test.sql` exit 0 |
| 4 | `deno test --allow-all --config supabase/functions/deno.json` on `_shared`, `proposal-send`, `commercial-document-notify`, `trade-agreement-send` | **465 passed, 0 failed** |
| 5 | `deno check` on each of the three `index.ts` | exit 0 each; **no stray `deno.lock` at the repo root** |
| 6 | `SUPABASE_DB_URL=… pnpm db:generate` + `git diff --exit-code packages/supabase/src/database.types.ts` | file 1 165 638 bytes (not truncated); **diff exit 0 — in sync** |
| 7 | `pnpm exec turbo build --filter=@patina/types --force` | 1 successful, 1 total |
| 8 | `pnpm --filter @patina/types type-check` | clean |
| 9 | `pnpm --filter @patina/supabase type-check` · `test` | clean · **93 files, 1145 passed, 12 skipped** |
| 10 | `pnpm --filter @patina/designer-portal type-check` · FULL `test` | clean · **544 suites, 6662 tests, 12 snapshots — all passed** |
| 11 | `pnpm --filter @patina/client-portal type-check` · `test:coverage` | clean · **134 suites, 2233 tests passed**; coverage **75.17 / 70.70 / 75.23 / 77.51** against the 70/60/70/70 floor; exit 0 |
| 12 | `rm -rf apps/admin-portal/.next/types && pnpm --filter @patina/admin-portal build` | exit 0 |

### The two e2e runs the rulings name

Run against the reset stack with a client-portal dev server on :3002 and
`SUPABASE_SERVICE_ROLE_KEY` exported from `supabase status`.

- **E2E-3, sub lane** (R46) — `npx playwright test tests/trade-agreement-link.spec.ts --workers=1` → **4 passed (8.6s)**, the withdrawn-agreement case included. First execution in the program's life.
- **E2E-2, turnkey door** (R47) — `PATINA_W3_TURNKEY_GATE=1 npx playwright test tests/design-build-door.spec.ts --workers=1` → **2 passed (20.4s)**. The gate env var was set, so a silent skip would have been a failure.

**Advisory, and it cost an hour:** `pnpm --filter @patina/client-portal test:e2e -- <spec> --workers=1` **does not pass `--workers=1` through** — Playwright reports "Running N tests using N workers" and runs the file's cases in parallel, which breaks any spec whose second case depends on its first (E2E-2 exactly). Run `npx playwright test <spec> --workers=1` from `apps/client-portal` instead.

---

## Carried, not fixed (out of the R40–R47 scope)

Named so the next reader does not read silence as absence. None of these is a
close-out ruling; each is a lane review's minor or nit that no ruling adopted.

- Backend R3-6 (a spent-token receipt expires at 30 days and the two doors then disagree), R3-7 (the sub-disclosure mode is read off any clause part, unfiltered by `part_key`), R3-8 (the client redaction is a denylist), R3-9 (`'studio'` signature party never written), R3-10 (`FOR ALL` policy over a SELECT-only grant), R3-11/R3-14/R3-20 (banner citations, RC-10's answer), R3-12 (`materialize_agreement_template` clears rather than restores the lifecycle GUC), R3-13 (dead `service_role` grant on the draw ledger), R3-17/R3-18/R3-19 (the CA notice's class, int4 money on a construction class, a per-row disclosure lookup inside the bundle's aggregate).
- Designer D17 (the studio's live preview still prints "Recorded with your agreement." for `pricing_basis`/`draws`/`allowances`), D18 (R39's hide toggle can hide the pricing basis and nothing refuses it), D19 (the deposit draw cannot be billed from the studio surface), and the round-2 minors D10/D11/D13/D20/D21, m1–m13.
- Client M1–M9 and N-a…N-o, including M4 (a derived "Contract price" label on a `cost_plus` prime) and N-i (an unset draws part says "Recorded with your agreement." where R21 rules it says nothing) — both two-sided with the SQL keepsake and needing one ruling for both surfaces.
- Sub R3-8 (the e2e asserts one of the three guest-surface headers), R3-9 (the outcome allowlists are still pinned against invented shapes rather than 00579's literal answers), R3-11 to R3-15.
- Designer E2E-1 (`playwright.design-build.config.ts`) was **not** run in this pass; no close-out ruling names it.
- `env.md`'s scratch-DB recipe still prints the piped `pg_dump | psql` form, which silently produces a constraint-free clone under libpq 18.4 (backend R3-15). This pass used the corrected `pg_dump --no-owner -Fc` + serial `pg_restore` form and probed `pg_constraint` (818 public FKs) before believing anything.
