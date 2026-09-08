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

---

## Walk fixes

Date 2026-09-08. Round 1 of the web walk (`walk-web-r1.md`) returned one
blocker and seven majors. All eight are answered below — seven by code, one
(W3R1-07) by three regression tests plus an honest finding that the defect is
not in the component. One commit per finding, explicit pathspecs, no push, no
production mutation of any kind.

Base for this pass: `d72b14949` (one docs commit past the round's stated
`82f034a56`). Head after: `4b7c1ac7a`.

| Finding | Commit | What landed |
|---|---|---|
| **W3R1-01** (blocker) | `331c3be81` `fix(agreements): W3R1-01 — the turnkey prime keeps its room, and its ledger` | `draftingEditability` gains a fourth posture, `ledger`: a `design_build` document in `sent` / `client_signed` / `executed` stays admitted to the Contract Room, because the draw ledger, the lien-waiver exchange and the Trade Agreements strip are mounted there and nowhere else, and none of the three exists before send. `drafting-room.tsx` no longer evicts that posture; the composer's own `document.state !== 'draft'` already renders it read-only, so the parts stay frozen (R6). `service-agreement-drafting-room.tsx` gains the matching refusal — with `agreement-parts` off, a non-draft never opens seven editable facets over a paper the client has read; it gets a sentence naming the room instead. And `service-agreement-instruments.tsx` grows the DOOR: "Open the Contract Room" is now offered whenever the Room's own rule says it is open, so the studio reaches draw two, a Trade Agreement and a lien waiver from the agreement's own document. `superseded` / `declined` / `expired` keep the old eviction. Tests: 6 cases in `drafting-editability.test.ts`, 6 in `service-agreement-instruments.test.tsx`, 1 in `service-agreement-drafting-room.test.tsx`. |
| **W3R1-02** | `5e90b5784` | `instrumentReceipts` in `threshold.tsx` reads the same houseless rule `signatureGates` does. At `client_signed` an origin paper leaves `pending` for `accepted`, and the project-scoped filter dropped a project-less signed prime from every house she owns — the walk signed, reloaded, and met empty doors over her own signature. It now stands as its receipt on every house until countersign files it under one. `service_addendum` and another house's paper stay out, as before. The date is `executedAt`, null through this whole window by design (R30 round-2), which sorts the receipt last in Previously and states nothing untrue. |
| **W3R1-03** | `1e73bb304` | `allowances-editor.tsx`: an allowance with no cost line of its own now ADOPTS the unclaimed `category: 'allowance'` line carrying its name — id and money both — instead of appending a second line for the same figure. The blank row `+ Add an allowance` mints no longer writes a cost line at all, so nothing claims an id before the designer has typed the name that adopts. Naming "Tile allowance" against the seven-line fixture leaves seven lines at `$71,300`; an allowance whose name matches nothing still gets its own eighth line. Tests: 2 cases in `turnkey-editors.test.tsx`, both driving the walk's own sequence. |
| **W3R1-04** | `8b1a32a99` | Two halves. (a) `packages/types/src/agreement-copy.ts` gains `DESIGN_BUILD_PAPER_COPY`, `DESIGN_BUILD_BASIS_SENTENCE`, `DESIGN_BUILD_CONTRACT_SUM_LABEL`, `DESIGN_BUILD_DRAW_STATE_LABEL`, the allowance-rule composer and `designBuildMoney` — the homeowner's `design-build-body.tsx` and the client shell's kind label now read them rather than carrying their own copies, and `moneyToTheCent` is a re-export of the shared formatter. (b) The designer's `agreement-parts-body.tsx` grows the three turnkey leaves it was missing: the pricing basis (its sentence, the cost basis, the fee row and the contract sum under its own label), the schedule of values hung off it with its total, the authored draws, and the allowances with their over/under rule — all from `@/lib/document/design-build`, whose arithmetic `_agreement_schedule_of_values` mirrors. `service-agreement-preview.tsx` names a `design_build` paper "Design-build agreement" and closes it with the turnkey boundary instead of "…outside this design services agreement." Class-scoped: a services agreement renders byte-for-byte as before, pinned by a case. Tests: 4 cases in `agreement-parts-body.test.tsx` against the Halvorsen fixture (`$84,134` GMP printed twice — the contract sum and the schedule's total — which is the invariant). |
| **W3R1-05** | `5e90b5784` | `PapersUnread` — the sentence and the retry R30 · N2 already ruled and `letterbox-door.tsx` already draws — is exported and mounted on the house too. `proposalsQuery.isError` withholds the doorstep's claim entirely, so "Nothing waits for your name." can never print over papers the page could not read, and the notice below offers the read again. One component, both doors. Tests: 2 cases in `threshold.test.tsx` (the sentence and the retry actually calling `refetch`). |
| **W3R1-06** | `70d26eaa1` | `00578` edited in place. The seeded `patina.notice_of_cancellation` leaf ships `clientVisible: false`: its body is counsel's and is empty (R11), and it was reaching the homeowner as `ATTACHMENT A · NOTICE OF CANCELLATION` over blank paper with a required "I received this" that her signature row then recorded. It stays on the rail — the template still lays out ten parts — and the real notice is a separate part the jurisdiction panel attaches, with that state's wording and its own `clientVisible: true`. Beside it, `send_commercial_document` refuses ANY client-visible attachment that asks to be acknowledged and carries no wording. SQL: `design_build_test.sql` **T21**, four assertions. |
| **W3R1-07** | `4b7c1ac7a` (tests only) | **Not reproducible in the component.** `invoice-sheet.tsx`'s `handleAct` already throws on `!response.ok`, falls through `checkoutRefusalSentence` to `refusalSentence`, sets `refusal`, and renders it as a `role="alert"` beside the button, which `finally` re-enables. Three cases now pin exactly that, including the walk's own shape — `503` with `{"message":"name resolution failed"}` and **no `error` key at all**, which none of the existing J4 cases covered — plus a body that is not JSON and a `fetch` that rejects outright. All three pass against unmodified `invoice-sheet.tsx`. The likeliest reading of the walk is that the page text was compared before React re-rendered; the finding is recorded as an advisory below rather than silently dropped. |
| **W3R1-08** | `88d3dc40d` | Three things. The `readOnly` notice says "This is a design-build agreement, and it does not open for you yet. Its parts are shown as they stand." when the freeze is the flag rather than the send — the old sentence claimed a never-sent draft had left the studio. `UnsupportedPartCard` names the part by its `title`; it printed `{kind} · {variant}` through an `uppercase` class, which put "SCHEDULE · PRICING_BASIS" — a database key — in the studio's face, and `PartEditor`'s own header above it already says what kind of part it is in words. And "Review & send" is disabled on any read-only room (`reviewAndSend` returns early too), so a room that can be neither edited nor completed no longer offers to send. Tests: 3 cases in `agreement-composer-turnkey.test.tsx`, 1 rewritten in `agreement-composer.test.tsx`, 4 snapshots updated (the diff is the eyebrow only). |

### Gates — every command run in the integration worktree, output read

| # | Gate | Result |
|---|---|---|
| 1 | `supabase db reset --workdir …/agent-agr-w3-integration` (after the 00578 edit) | **clean**. Ledger head probed after: `00579, 00578, 00577`. |
| 2 | `psql -v ON_ERROR_STOP=1 -f supabase/tests/commercial/design_build_test.sql` | exit 0 · **20 PASS** (19 + the new T21) |
| 3 | The other Wave 3 SQL suites, one by one | `trade_agreement_test` exit 0 · 8 PASS · `agreement_parts_test` exit 0 · 30 PASS · `agreement_library_test` exit 0 · 14 PASS · `agreement_fee_schedules_test` exit 0 · 11 PASS · `agreement_parts_projection_test` exit 0 · 5 PASS · `multi_studio_signature_test` exit 0 · 7 PASS · `billing/studio_invoice_test` exit 0 · `edge_api/public_sd_hardening_contract_test` exit 0 · `edge_api/public_rpc_authorization_contract_test` exit 0 |
| 4 | `./scripts/run-sql-tests.sh` | **total 166 · green 145 · expected-fail 21 · unexpected-fail 0 · effective-green 166/166** — identical to the re-gate's baseline |
| 5 | `python3 scripts/generate-legacy-grants.py` | "baseline + 2568 replayed statements"; `git diff --stat supabase/seed/00-legacy-grants.sql` **empty** — no grant moved |
| 6 | `SUPABASE_DB_URL=… pnpm db:generate` + `git diff --exit-code packages/supabase/src/database.types.ts` | file 1.2 MB (not truncated); **diff exit 0 — in sync** |
| 7 | `pnpm exec turbo build --filter=@patina/types --force` | 1 successful, 1 total (run twice — the first client type-check failed on a stale dist, which is the R44/T0 hazard exactly) |
| 8 | `pnpm --filter @patina/types type-check` | clean |
| 9 | `pnpm --filter @patina/supabase type-check` · `test` | clean · **93 files, 1145 passed, 12 skipped** |
| 10 | `pnpm --filter @patina/designer-portal type-check` · FULL `test` | clean · **544 suites, 6680 tests, 12 snapshots — all passed** (was 6662; +18 from this pass) |
| 11 | `pnpm --filter @patina/client-portal type-check` · `test:coverage` | clean · **134 suites, 2241 tests passed** (was 2233; +8); coverage **75.18 / 70.76 / 75.27 / 77.52** against the 70/60/70/70 floor; exit 0 |
| 12 | `rm -rf apps/admin-portal/.next/types && pnpm --filter @patina/admin-portal build` | exit 0 |
| 13 | `supabase db reset` again, then probes | clean; head `00579`; `studio_trade_agreements` 0, `design_build` proposals 0; the seeded template carries `notice_of_cancellation` with `clientVisible: false` (probed by jsonb containment, not by reading the file) |

**The two e2e specs the close-out rulings name**, re-run against the reset stack
with a client dev server on :3002 and all three flags overridden on:

- **E2E-2, turnkey door** — `PATINA_W3_TURNKEY_GATE=1 npx playwright test tests/design-build-door.spec.ts --workers=1` → **2 passed (36.1s)**. The gate env var was set, so a silent skip would have failed.
- **E2E-3, sub lane** — `npx playwright test tests/trade-agreement-link.spec.ts --workers=1` → **4 passed (13.0s)**.

No deno test was run and none was owed: **no file under `supabase/functions/` was touched** in this pass, so no importer of any `_shared` module needs redeploying.

### What did NOT change

- No production mutation of any kind. Nothing pushed. No Stripe call, key or webhook touched.
- No edge-function source, no `_shared` file, no `config.toml`.
- No grant or revoke moved (gate 5).
- `packages/supabase/src/database.types.ts` is unchanged — this pass altered function bodies and one seeded template row, not schema.
- No pinned hash in `public_sd_hardening_contract_test.sql` needed re-pinning: `send_commercial_document` is the only hardened body this pass redefined and it is absent from both expectation tables; the suite passes.
- Designer E2E-1 (`playwright.design-build.config.ts`) was **not** run — no finding names it, and the round's own close-out did not run it either.
- Prettier reports formatting drift on the files this pass touched. It is advisory locally, and it is **pre-existing**: `threshold.tsx` and `apps/client-portal/src/components/agreement-parts-body.tsx` fail `prettier --check` on this branch untouched. Nothing was reformatted, so no diff is noise.

### Advisories from this pass — no ruling, not blocking

- **W3R1-07 is not in the component.** See the table. Three regression cases now stand where the walk found silence; if a round-2 walk sees it again, the next thing to check is the walk harness's read timing, not `handleAct`.
- **THE PAPERS still holds nothing for a houseless signed prime.** W3R1-02's ruling is about the doorstep's receipt, and that is what landed. `papers-sheet.tsx`'s third register ("What you have signed") reads `useProjectDocuments(projectId)`, which is project-scoped at the RPC — a project-less paper cannot appear there without widening a server read, which no ruling asks for. The paper is reachable from every house's Previously; the sheet is the gap.
- **The designer's turnkey preview shows AUTHORED draws, not the ledger's cents.** The preview is of the paper being sent, and pre-send there is no ledger to read; the homeowner's copy shows the same authored rows until `send_commercial_document` materializes one. After send the two differ in precision (percent versus net cents), which is honest but is a second place the same schedule is stated. Unifying them means plumbing `useAgreementDraws` into the preview.
- **Two body implementations remain.** `DESIGN_BUILD_PAPER_COPY` closes the copy drift and `designBuildMoney` closes the formatting drift, but the designer's `agreement-parts-body.tsx` and the client's `design-build-body.tsx` are still two renderers of one spec (and the SQL keepsake is a third). That was already Wave 2's carried advisory; this pass narrowed it rather than closing it.
- **A studio-side blank leaf now sits on the rail.** `patina.notice_of_cancellation` composes with no body and no client visibility, so the studio sees a part it cannot fill until counsel enables a state. That is R11's posture said out loud; if Leah finds it confusing, the alternative is `enabled: false` (the flow-down clause's shape), which drops the rail to nine parts and moves the build sheet's own count.
