# Wave 3 · Turnkey — build sheet

**Program**: The Agreement, Composed · **Wave**: 3 (P9–P14) · **Flag**: `design-build`, fail-closed
**Binding upstream**: `build/contract.md` (assume W1 + W2 shipped exactly as written), `build/rulings-2026-09-06.md`, `source/proposal.md` §8 §10 §11, `research/02-design-build-turnkey.md`, `research/04-codebase-today.md`.
**Author's note to every lane**: this sheet cites file:line as of the read on 2026-09-06 (main, migrations head `00574_invoice_links.sql`). W1 and W2 land *before* this wave and will have moved several of the function heads named here. **Every graft in this sheet must be re-anchored at branch time** with

```bash
grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" /Users/kody/Code/patina-merged/supabase/migrations/*.sql | sort | tail -1
```

and the body copied verbatim from that winner. A graft onto a remembered or older body silently reverts W1/W2 (the 00199-reverts-00185 class of defect; see `patina-db-migrations`).

---

## 1 · Scope, non-goals, rulings

### 1.1 What Wave 3 delivers

| # | Name | One line |
|---|---|---|
| **P9** | The turnkey class | A sixth `document_kind`, `design_build`, composed from parts: pricing basis (carrying the schedule of values), draws with retainage, allowances, sub disclosure, supervision-vs-markup, change orders. Each draw issues an invoice. |
| **P10** | Licensing attestation | `studio_license_attestations` — self-attested, never verified. The `patina.design_build` template is **not selectable** without a live row. |
| **P11** | Jurisdiction attachments | `agreement_jurisdiction_notices` seeded WI · MN · IL · CA · NY · MA, **all `enabled = false`**, super-admin-only to enable. No studio-facing UI to enable. |
| **P12** | Lien waivers per draw | An `attachment` part carries the *form*; a tracked row per draw records the *exchange* (conditional/unconditional × progress/final). |
| **P13** | Sign and pay in one step | After the client's signature the door **offers** the deposit draw's payment link. It never gates the signature. |
| **P14** | The subcontract | `studio_trade_agreements` — studio ↔ sub, carrying research 02 §7's eight essentials, signed by the sub on a token link with **no login**, on its own signature table. `commercial_document_signatures` keeps its two-party constraint untouched. |

### 1.2 Non-goals — do not build these

1. **No license verification.** Patina stores the attestation and never checks it against any registry, API, or state board. There is no "verified" badge, no expiry-check cron, no lookup. (R10)
2. **Jurisdiction notices ship disabled.** All six seeded rows carry `enabled = false`. There is **no studio-facing enable control**; only `public.user_has_role(auth.uid(), 'super_admin')` may flip one, and no admin-portal UI ships this wave. A disabled notice must not render on the client's copy, must not be attachable in the composer, and must not appear in the send readiness. (R11)
3. **The flow-down clause ships disabled.** The seeded flow-down clause body exists in the `patina.design_build` template with `enabled = false` semantics (same disabled posture as the notices) pending counsel. The Trade Agreement's `flow_down_clause_key` column exists and stays NULL. (R16)
4. **No PDF.** No `spec-pdf` change, no agreement PDF, no print artifact. What the client keeps is the W2 frozen HTML snapshot (R12).
5. **No new NestJS service, no orders-service Stripe.** The payments rail is edge functions + migrations (`patina-stripe-payments`). Wave 3 writes **zero new Stripe code** — see §1.4.
6. **No reopening of `commercial_document_signatures`.** The prime keeps `party_role CHECK IN ('client','studio')` + `UNIQUE (proposal_id, party_role)` (00412:101, :108). The sub signs on `studio_trade_agreement_signatures`.
7. **No unit-price or CM-agency pricing basis.** Four bases only: `fixed`, `cost_plus`, `cost_plus_gmp`, `tm_nte` (research 02 §2 rows 1, 2, 4, 5). Unit price and cost-plus-fixed-fee are out.
8. **No contingency line, no GMP savings split.** Research 02 §9 item 4 lists them as optional toggles; they are not in the ten-part template and not in this wave.
9. **No change-order execution rail.** The template carries a change-orders **clause**; the first-class change-order document that patches the schedule of values (research 02 §9 item 9) is a later wave. PRJ-04/05/06 remain unresolved.
10. **No mandated-contents checklist enforcement.** The CA §7159 / WI ATCP 110 item lists are seeded as notice bodies only; nothing blocks a send on them.

### 1.3 Rulings this wave implements

| Ruling | Adopted as | Where it lands in this sheet |
|---|---|---|
| **R10** | Licensing attestation: self-attested fields, Patina stores and never verifies, gates selection of the design-build template, carries the standing disclaimer. | §3 PART 3 · §4.2 (M7) · §5 SQL-T4 |
| **R11** | Jurisdiction notices seeded WI/MN/IL/CA/NY/MA with `enabled = false`; no UI to enable until counsel; admin-only per state. | §3 PART 4 · §4.1 (attachment rail) · §5 SQL-T9 |
| **R13** | Subs in the client's copy: identities yes, bid ledger never. | §3 PART 12 · §4.3 · §4.5 · §7 RC-4 |
| **R15** | Sign and pay: offer after signature, never gate. | §3 PART 10 · §4.4 · §7 RC-6 |
| **R16** | Subs sign inside Patina by token link, no login, on the Trade Agreement's own table; seeded flow-down wording ships disabled. | §3 migration 2 · §4.5 · §7 RC-1/RC-3 |
| R4 (carried) | The floor: parties, signature block, one typed money part for a class that bills. For `design_build` the typed money part is `pricing_basis`, and `draws` is additionally required. | §3 PART 11 |
| R5 (carried) | Prose never carries money — only `schedule` variants project. | §3 PART 6 |
| R9 (carried) | `pricing_basis`, `draws`, `allowances` are **record-only**; they create no billing authority. The only authority `design_build` writes is `billing_cadence = 'per_draw'` (+ `retainer`/`ceiling` if the studio adds those parts). | §3 PART 2, PART 9 |
| R7 (carried) | Names: Agreement · Part · Library · Template · Addendum. Never "clause library" / "contract builder" in the studio's face. Add: the sub's object is a **Trade Agreement**, never "subcontract" in UI copy (the word is fine in code and docs). | §4 throughout |

### 1.4 Two structural decisions this sheet makes (read before writing any code)

**D-W3-1 · Wave 3 writes no Stripe code, and mints no Checkout session.**
`00574_invoice_links.sql` already mints one permanent bearer link per invoice on issue — the trigger `invoice_link_mint_on_issue` (`supabase/migrations/00574_invoice_links.sql:143-149`) fires on any `UPDATE OF status` into `sent|partially_paid|paid`, and `issue_invoice` / `issue_invoice_for_actor` / the trade-draw path all go through that UPDATE. So P13's "pay" affordance is a **link to the already-shipped payer surface**: `apps/client-portal/src/app/pay/[token]/page.tsx`, which owns the card/ACH chooser (`pay/[token]/payment-method-chooser.tsx`), the Checkout call (`pay/[token]/checkout/route.ts`) and the Stripe return leg (`pay/return/[nonce]/route.ts`). **Do not** add a `create-checkout-session` call, a Stripe key, or a `stripe-webhook` branch anywhere in Wave 3.

**D-W3-2 · The deposit invoice is minted by a *separate call after* the signature commits — never inside the signature transaction.**
R15 says the offer must never gate the signature. Making that structural rather than careful: the client lane's sign route runs its `design_build` arm, gets `{ ok: true, commercialState: 'client_signed' }` back from `sign_design_services_agreement_with_trusted_ip`, and **then** makes a second, independently failable call to `issue_agreement_draw_invoice(proposalId, 'deposit')`. If that second call errors, the route still returns `ok: true` with `depositOffer: null` and logs server-side. A signature can never be rolled back by a billing failure. The *wrapper* `sign_design_services_agreement_with_trusted_ip` therefore needs no graft — but **its impl and its guard do**; see D-W3-3.

**D-W3-3 · The client's signature on a `design_build` prime does not work today, and three pinned functions are why.**
A sweep of head-resolved bodies turned up three refusals that would each silently break the walk, and all three are body-hash-pinned in `supabase/tests/edge_api/public_sd_hardening_contract_test.sql`:

1. `public._sign_design_services_agreement_authorized` — head `00412_design_services_commercial_authority.sql:801`:
   `IF v_proposal.document_kind NOT IN ('design_services','service_addendum') THEN RAISE 'proposal % is not a design services agreement or addendum'`. A `design_build` client signature raises here.
2. `public.guard_commercial_signature_insert` — head `00566_commercial_signature_studio_resolution.sql:213-222`: a **via × document_kind matrix**. `v_via IN ('sign_design_services_agreement','record_paper_client_signature')` is only paired with `document_kind IN ('design_services','service_addendum')`, so even if (1) were fixed, the signature row itself is refused by the trigger. **And** at `:151` the "unique origin actor" bootstrap leg reads `v_proposal.document_kind = 'design_services'` — without widening it, the very first design-build agreement for a brand-new client cannot be countersigned by its origin actor.
3. `app_private.issue_invoice_for_actor` — head `00511_public_sd_hardening.sql:3841-3900`: an exhaustive per-kind **invoice-line → commercial-document anchor** match, followed by `IF v_anchor_count <> 1 THEN RAISE 'issue_invoice: invoice not found or access denied'`. The `design_services_retainer` branch is scoped to `document_kind IN ('design_services','service_addendum')`, so a design-build agreement carrying a retainer part **fails at countersign**, with an error that reads like an access problem.

All three are grafted in migration 1 (PART 7b) and re-pinned. Item 3 is also the reason `issue_agreement_draw_invoice` calls **`public.issue_invoice(uuid,date)`** (head `00412:2694`, which delegates to `_issue_invoice_pre_00412` and carries *no* anchor logic) under the claim-adoption sandwich, exactly as `issue_trade_draw_invoice` does — **never** `app_private.issue_invoice_for_actor`. A draw invoice minted before countersign has no `project_commercial_documents` row to anchor against, so the anchor path could not work for it even widened.

---

## 2 · Lanes

Five lanes. **No file appears in two lanes.** Where a lane needs another lane's output, the interface is named in §2.6 and the producing lane ships it first.

### 2.1 Lane `backend` — migrations, RPCs, generated types

**Owns exactly these pathspecs:**
```
supabase/migrations/NNNNN_design_build_kind.sql          (new)
supabase/migrations/NNNNN+1_trade_agreements.sql          (new)
supabase/seed/00-legacy-grants.sql                        (REGENERATED, never hand-edited)
packages/supabase/src/database.types.ts                   (REGENERATED via pnpm db:generate)
supabase/tests/commercial/design_build_test.sql           (new)
supabase/tests/commercial/trade_agreement_test.sql        (new)
supabase/tests/edge_api/public_sd_hardening_contract_test.sql   (re-pin only)
supabase/tests/edge_api/platform_acl_compatibility_test.sql     (register new RPCs)
supabase/tests/edge_api/public_rpc_authorization_contract_test.sql (register new RPCs)
```

**Number minting.** Head today is `00574_invoice_links.sql`. W1 and W2 consume numbers before this wave. At branch time run `ls /Users/kody/Code/patina-merged/supabase/migrations/*.sql | sort | tail -1` and mint `head+1` and `head+2`. Re-check at every integration and **bump the undeployed side** on collision, renaming the file *and* the internal banner number (`patina-parallel-work`).

**Enum discipline.** Every value widened in this wave lives in a **`text` CHECK constraint**, not a Postgres `ENUM` type — verified for `proposals.document_kind` (00423:94-101), `project_commercial_documents.document_kind` (00423:126-133, originally inline at 00412:115-117), `proposal_service_terms.billing_cadence` (00412:77-78) and `project_billing_authorities.billing_cadence` (00412:148). **Therefore the "ADD VALUE in its own migration" rule does not apply here** — the widening and its first use may share one file. Say so in the banner so a reviewer does not flag it. If a lane discovers a real `ENUM` type in scope, that value moves to its own migration and the usage waits for the next.

### 2.2 Lane `edge` — Deno functions

**Owns exactly these pathspecs:**
```
supabase/functions/proposal-send/handler.ts
supabase/functions/proposal-send/handler.test.ts            (or the existing sibling test)
supabase/functions/commercial-document-notify/core.ts
supabase/functions/commercial-document-notify/policy.ts
supabase/functions/commercial-document-notify/lib.ts
supabase/functions/commercial-document-notify/index.ts
supabase/functions/commercial-document-notify/{core,policy,lib}.test.ts
supabase/functions/trade-agreement-send/index.ts            (new)
supabase/functions/trade-agreement-send/lib.ts              (new)
supabase/functions/trade-agreement-send/index.test.ts       (new)
supabase/functions/_shared/trade-agreement-emails.ts        (new)
supabase/functions/_shared/trade-agreement-emails.test.ts   (new)
supabase/config.toml                                         ([functions.trade-agreement-send])
```

**Shared-module rule.** `_shared/trade-agreement-emails.ts` is a **new** file — it has zero importers besides the new function, so it triggers **no** redeploy fan-out. **Do not edit `_shared/trade-rfq-emails.ts`** (imported by `trade-rfq-send/lib.ts` and its test); copy its shape into the new sibling. **Do not edit `_shared/send-email.ts`** — 20 `index.ts` files import it and every one would need redeploying (`patina-edge-functions`). If a lane believes it must touch a `_shared` file, stop and escalate: the deploy set in §9 changes.

**`verify_jwt`.** `trade-agreement-send` is studio-called from the designer portal → `verify_jwt = true`, exactly like `[functions.trade-rfq-send]` at `supabase/config.toml:633-634`. The sub's side never calls an edge function — the sub reaches the DB through the client-portal server action, exactly as `/rfq/[token]` does. **No function in this wave gets `verify_jwt = false`, so no `--no-verify-jwt` deploy flag is used.**

### 2.3 Lane `designer` — designer portal + shared packages

**Owns exactly these pathspecs:**
```
packages/types/src/agreement.ts                    (extend — W1 created it)
packages/types/src/commercial.ts
packages/types/src/index.ts
packages/supabase/src/hooks/use-agreement-parts.ts (extend — W1)
packages/supabase/src/hooks/use-design-build.ts    (new)
packages/supabase/src/hooks/use-trade-agreements.ts (new)
packages/supabase/src/hooks/use-studio-license-attestation.ts (new)
packages/supabase/src/hooks/index.ts
apps/designer-portal/src/components/document/rooms/drafting/agreement/turnkey/**   (new folder)
apps/designer-portal/src/components/document/rooms/drafting/agreement/part-editor.tsx  (extend — W1)
apps/designer-portal/src/components/document/rooms/drafting/agreement/add-part-sheet.tsx (extend — W2)
apps/designer-portal/src/components/document/rooms/drafting/agreement/readiness.ts (extend — W1)
apps/designer-portal/src/components/document/account/account-studio-page.tsx
apps/designer-portal/src/components/document/account/licensing-attestation-card.tsx (new)
apps/designer-portal/src/lib/document/design-build.ts               (new)
apps/designer-portal/src/lib/document/commercial-documents.ts
apps/designer-portal/src/lib/analytics/document-events.ts
apps/designer-portal/src/hooks/use-commercial-documents.ts
apps/designer-portal/src/components/document/commercial/trade-agreements/**  (new folder)
apps/designer-portal/e2e/document/design-build.spec.ts             (new)
apps/designer-portal/src/**/__tests__/** for the files above
```

**Explicitly NOT the designer lane's** (leave untouched): `apps/designer-portal/src/components/document/commercial/trade/*` (the *trade scope* instrument — a different object; reuse by **copying** patterns, never by editing), `apps/designer-portal/src/components/document/roster/*` (including `rolodex-picker.tsx`), `apps/designer-portal/src/components/document/rooms/drafting/service-agreement-drafting-room.tsx` (W1 already put the flag branch there; W3 only adds files under `agreement/`).

**Dist trap.** `@patina/types` is **dist-resolved** (`main → ./dist/...`). After editing `packages/types/src/*`, run `pnpm turbo build --filter=@patina/types` or both portals serve stale types. `@patina/supabase` is source-resolved (live edits). This is the mechanism that shipped `TypeError: proposalTierVisibility is not a function` to prod.

### 2.4 Lane `client` — the homeowner's door

**Owns exactly these pathspecs:**
```
apps/client-portal/src/app/api/proposals/[id]/sign/route.ts
apps/client-portal/src/app/api/proposals/[id]/notifications/replay/route.ts
apps/client-portal/src/components/commercial-document-shell.tsx
apps/client-portal/src/components/commercial/design-build-body.tsx   (new)
apps/client-portal/src/components/threshold/consent-copy.ts
apps/client-portal/src/components/threshold/door-gate.tsx
apps/client-portal/src/components/threshold/deposit-offer.tsx        (new)
apps/client-portal/src/components/threshold/wall-gate.tsx
apps/client-portal/src/lib/commercial-documents.ts
apps/client-portal/src/lib/threshold/derive.ts
apps/client-portal/src/lib/analytics/events.ts
apps/client-portal/src/components/threshold/__tests__/**            (consent-copy, door-gate, deposit-offer)
apps/client-portal/src/components/__tests__/commercial-document-shell*.test.tsx
apps/client-portal/tests/design-build-door.spec.ts                   (new e2e)
```

**Coverage floor.** `apps/client-portal` enforces jest coverage lines 70 / branches 60 / functions 70 / statements 70. **Every new file in this lane ships with its test in the same change** or the whole suite fails (`patina-testing`).

### 2.5 Lane `sub` — the token page the subcontractor opens

**Owns exactly these pathspecs:**
```
apps/client-portal/src/app/trade/[token]/page.tsx        (new)
apps/client-portal/src/app/trade/[token]/actions.ts      (new)
apps/client-portal/src/app/trade/[token]/types.ts        (new)
apps/client-portal/src/app/trade/[token]/trade-agreement-signature.tsx (new)
apps/client-portal/src/app/trade/[token]/__tests__/{page,actions,trade-agreement-signature}.test.tsx (new)
apps/client-portal/src/middleware.ts
apps/client-portal/src/components/layout/app-chrome.tsx
apps/client-portal/tests/trade-agreement-link.spec.ts    (new e2e)
```

**The pattern to copy, file for file**: `apps/client-portal/src/app/rfq/[token]/` — `page.tsx` (118 lines), `actions.ts` (84), `types.ts` (70), `rfq-response-form.tsx` (149) and its three `__tests__`. That directory is the proven login-less shape and it is what the contract means by "the closest existing token-page pattern". Copy its posture exactly:
- `export const dynamic = 'force-dynamic'` and `metadata = { robots: { index:false, follow:false }, referrer: 'no-referrer' }` (`rfq/[token]/page.tsx:39-47`).
- A cheap format gate before any DB round trip: `TRADE_AGREEMENT_TOKEN_PATTERN = /^[0-9a-f]{64}$/` in `types.ts`, its own literal, **not** an import from `rfq/[token]/types.ts` — a separate credential gets a separate literal (the reason is written out at `rfq/[token]/types.ts:5-10`).
- The page resolves through `createServiceClient()` + a single RPC (`resolve_trade_agreement_link`), and `notFound()` on any null. A dead link must be indistinguishable from one that never existed.
- The submit is a `'use server'` action calling the RPC **directly** with no pre-resolve, so the RPC can classify `already_signed` vs `void` vs `invalid` (the rationale is at `rfq/[token]/actions.ts:5-18`).

**Middleware.** `src/middleware.ts` already carries six bearer prefixes; add `/trade/` in the same three places `/rfq/` appears: the `isRfqPage`-style const near `:115`, the no-store/noindex header set at `:161`, and the `isPublicPage` disjunction at `:169-181`. Add `/trade` to `PUBLIC_PREFIXES` in `components/layout/app-chrome.tsx:10` so the page renders chrome-less (the `/pay` S-10 lesson at `middleware.ts:132-135`).

**Route-shape ruling.** `apps/client-portal/README.md` and R135/V8 say the *authenticated* client surface is one page and new acts become in-place instruments, never new route trees. `/trade/[token]` is **not** an authenticated client surface — it is a seventh bearer-token guest prefix beside `/share`, `/field`, `/rfq`, `/evidence`, `/plans`, `/pay`, and it is exempt for the same reason those six are. State this in the PR body so a reviewer does not read it as an R135 violation.

### 2.6 Cross-lane interfaces (ship in this order)

| # | Producer | Artifact | Consumers | Contract |
|---|---|---|---|---|
| I-1 | `designer` (day 1, before anything else) | `packages/types/src/commercial.ts`: `'design_build'` appended to `COMMERCIAL_DOCUMENT_KINDS`; new `DesignBuildAgreement extends CommercialDocumentSummary` with `{ kind:'design_build'; pricingBasis; scheduleOfValues; draws; allowances; attachments; signatures }`. `packages/types/src/agreement.ts`: `DesignBuildPayloads`. Then `pnpm turbo build --filter=@patina/types`. | `client`, `sub`, `designer` | `client`'s sign route derives its allowlist from `COMMERCIAL_DOCUMENT_KINDS` (`sign/route.ts:3-6`) — it gets `design_build` for free the moment this lands, and **not before**. |
| I-2 | `backend` (day 1–2) | Migration 1 applied locally + `pnpm db:generate` committed. | all | Every other lane's RPC calls type-check only after this. |
| I-3 | `backend` | RPC signature freeze, published as a one-page note in the wave channel before any caller is written: `issue_agreement_draw_invoice(p_proposal_id uuid, p_draw_key text) RETURNS jsonb` → `{ drawKey, label, amountCents, retainageCents, netCents, invoiceId, invoiceStatus, payToken }`. | `client`, `designer` | `payToken` is the `invoice_links.token`; the client lane builds `/pay/<payToken>` from it and calls nothing else. |
| I-4 | `backend` | `resolve_trade_agreement_link(p_token text) RETURNS jsonb` DTO frozen (§4.5 lists the exact keys and, more importantly, the exact absences). | `sub` | The `sub` lane renders **exactly** these keys and asserts in `page.test.tsx` that a DTO carrying extra fields renders none of them (copy `rfq/[token]/__tests__/page.test.tsx`'s assertion). |
| I-5 | `backend` | Migration 2 applied + types regenerated. | `edge`, `designer`, `sub` | `trade-agreement-send` and the composer both wait on it. |
| I-6 | `client` | The sign route's `design_build` response body gains `depositOffer: { invoiceId, amountCents, label, payPath } \| null`. | `designer` (nothing), `client` only | Named here so the `client` lane does not invent a second shape mid-wave. |
| I-7 | `edge` | `CommercialTransition` gains `'agreement_draw_ready'` in `commercial-document-notify/core.ts:13-23`. | `designer` (calls it after issuing draw 2+) | The designer lane invokes `commercial-document-notify` with `{ documentId, transition:'agreement_draw_ready', eventId:<draw ledger row id> }`. |

---

## 3 · Migration outlines

### 3.1 Migration 1 — `NNNNN_design_build_kind.sql`

**Banner** (mandatory shape, `patina-db-migrations`):

```
-- ═══════════════════════════════════════════════════════════════════════════
-- NNNNN — Turnkey: the design-build class (Agreement, Composed · Wave 3)
--
-- Rulings implemented: R10 (attestation gate), R11 (notices seeded disabled),
--   R13 (identities yes, bid ledger never), R15 (offer, never gate), R9
--   (pricing_basis/draws/allowances are record-only).
--
-- Lineage of every function redefined here (RE-ANCHOR AT BRANCH TIME —
-- W1/W2 may have moved these):
--   upsert_design_services_draft ............... 00422 → <W1?> → NNNNN
--   materialize_agreement_template ............. <W2>  → NNNNN
--   upsert_agreement_parts ..................... <W1>  → NNNNN
--   send_commercial_document ................... 00412 → 00423 → <W1> → NNNNN
--   get_client_commercial_document_bundle ...... 00412 → 00425 → <W1> → NNNNN
--   _sign_design_services_agreement_authorized . 00412 → NNNNN            [PINNED]
--   guard_commercial_signature_insert .......... 00412 → 00566 → NNNNN    [PINNED]
--   _countersign_design_services_agreement_impl  00412 → … → 00566 → <W2> → NNNNN  [PINNED]
--   app_private.issue_invoice_for_actor ........ 00412 → 00511 → NNNNN    [PINNED]
--   _is_design_services_project ................ 00412 → NNNNN
--   classify_project_time_entry_authority ...... 00412 → NNNNN
--   guard_project_ffe_purchase_authority ....... 00423 → NNNNN
--   _create_furnishings_authorization_from_schedule_impl  00423 → NNNNN
--   create_trade_scope ......................... 00423 → NNNNN
--   publish_budget_checkpoint .................. 00423 → NNNNN
--   get_client_project_threshold ............... 00565 → NNNNN
--   _execute_furnishings_authorization_authorized 00511 → NNNNN           [PINNED]
--   _execute_trade_scope_authorized ............ 00511 → NNNNN            [PINNED]
--   _execute_furnishings_authorization_on_paper_authorized 00511 → NNNNN  [PINNED]
--   _execute_trade_scope_on_paper_authorized ... 00511 → NNNNN            [PINNED]
--   create_draft_invoice ....................... 00511 → NNNNN            [PINNED]
--
-- NOT redefined, deliberately:
--   sign_design_services_agreement_with_trusted_ip (a thin wrapper; the impl
--     it calls IS grafted — D-W3-2/D-W3-3)
--   _commercial_document_fingerprint (W1's parts fold already covers this
--     class — argued in PART 5, verified by RC-8/SQL-T11)
--   _issue_design_services_agreement_on_paper (00477:275) and
--     _record_paper_client_signature_impl (00425:443) — paper execution of a
--     turnkey prime is OUT OF SCOPE this wave; both stay closed to
--     'design_build' on purpose, and the walk never exercises them.
--   public.issue_invoice(uuid,date) — no anchor logic, deliberately the one
--     the draw rail calls.
--
-- Every value widened below is a TEXT CHECK, not a Postgres ENUM type, so the
-- widening and its first use legally share one transaction.
--
-- Adds GRANT/REVOKE -> regenerate seed/00-legacy-grants.sql after this file.
-- Re-pins _countersign_design_services_agreement_impl in
--   supabase/tests/edge_api/public_sd_hardening_contract_test.sql.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
```

---

**PART 1 · Vocabulary — the sixth kind**

`proposals_document_kind_check` was named explicitly by 00412 and re-added by name at 00423:93-101 → drop by name, re-add with six values:
`'legacy','design_services','furnishings_authorization','service_addendum','trade_scope','design_build'`.

`project_commercial_documents.document_kind`'s CHECK was written **inline** (00412:115-117) so the server named it; 00423:110-133 handles this by discovery-by-definition. **Copy that DO block verbatim** (adjusting nothing but the final value list) — do not assume the 00423-assigned name survived a schema rebuild:

```sql
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.project_commercial_documents'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%document_kind%'
      AND pg_get_constraintdef(oid) ILIKE '%design_services%'
  LOOP
    EXECUTE format('ALTER TABLE public.project_commercial_documents DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE public.project_commercial_documents
  ADD CONSTRAINT project_commercial_documents_document_kind_check CHECK (
    document_kind IN ('design_services','furnishings_authorization',
                      'service_addendum','trade_scope','design_build'));
```

**PART 2 · `per_draw` cadence, and the nullable ceiling**

Both cadence CHECKs are inline and unnamed (`proposal_service_terms` 00412:77-78, `project_billing_authorities` 00412:148) → same discovery-by-definition DO block, matched on `'%billing_cadence%'` AND `'%biweekly%'`, per table. Re-add each as a named constraint with `('monthly','biweekly','milestone','per_draw')`.

Then, guarded (W1 was supposed to relax the proposal-side ceiling; the authority side may still be `NOT NULL`):

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='project_billing_authorities'
               AND column_name='billing_ceiling_cents' AND is_nullable='NO') THEN
    ALTER TABLE public.project_billing_authorities
      ALTER COLUMN billing_ceiling_cents DROP NOT NULL;
  END IF;
END $$;
```

Rationale for the banner: a `design_build` agreement carries no rate card, so under W1's relaxed rule it carries no ceiling; the authority row snapshotted at countersign must be able to hold NULL. If W1 already dropped it, this block is a no-op.

**PART 3 · `public.studio_license_attestations` (P10, R10)**

```
studio_id       uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE
credential_type text NOT NULL CHECK (char_length(btrim(credential_type)) > 0)
credential_number text NOT NULL CHECK (char_length(btrim(credential_number)) > 0)
state           text NOT NULL CHECK (state ~ '^[A-Z]{2}$')
expires_on      date NOT NULL
attested_by     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT
attested_at     timestamptz NOT NULL DEFAULT now()
created_at, updated_at timestamptz NOT NULL DEFAULT now()
```

`credential_type` is **free text, no CHECK** — the vocabulary is code-resident in `packages/types/src/agreement.ts` (`LICENSE_CREDENTIAL_TYPES`), the `studio_contacts.contact_kind` doctrine (00417:87, comment :130-135). Add the same comment here so the next reader knows it is deliberate.

RLS — mirror `studio_billing_settings` (00428:65-81) exactly:
```sql
ALTER TABLE public.studio_license_attestations ENABLE ROW LEVEL SECURITY;
CREATE POLICY studio_license_attestations_member_select ON public.studio_license_attestations
  FOR SELECT TO authenticated USING (public.is_active_studio_member(studio_id));
CREATE POLICY studio_license_attestations_admin_insert ON public.studio_license_attestations
  FOR INSERT TO authenticated WITH CHECK (public.is_org_admin_or_owner(studio_id, auth.uid()));
CREATE POLICY studio_license_attestations_admin_update ON public.studio_license_attestations
  FOR UPDATE TO authenticated USING (public.is_org_admin_or_owner(studio_id, auth.uid()))
                              WITH CHECK (public.is_org_admin_or_owner(studio_id, auth.uid()));
```
No DELETE policy and no DELETE grant (the `studio_contacts` posture, 00417:275 — an attestation is a record of a statement, not a draft). `REVOKE ALL ... FROM PUBLIC, anon, authenticated;` then `GRANT SELECT, INSERT, UPDATE ... TO authenticated; GRANT ALL ... TO service_role;`.

Helper, used by three later parts:
```sql
CREATE OR REPLACE FUNCTION public.studio_has_live_license_attestation(p_studio_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM public.studio_license_attestations a
                     WHERE a.studio_id = p_studio_id AND a.expires_on > current_date) $$;
REVOKE ALL ON FUNCTION public.studio_has_live_license_attestation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studio_has_live_license_attestation(uuid) TO authenticated, service_role;
```

**PART 4 · `public.agreement_jurisdiction_notices` (P11, R11)**

```
state    text PRIMARY KEY CHECK (state ~ '^[A-Z]{2}$')
kind     text NOT NULL          -- 'cancellation_notice' | 'mandated_contents' (code-resident vocab)
title    text NOT NULL
body     text NOT NULL
citation text NOT NULL          -- 'Wis. Admin. Code ATCP 110', 'Cal. Bus. & Prof. Code §7159', …
enabled  boolean NOT NULL DEFAULT false
updated_at timestamptz NOT NULL DEFAULT now()
```

Seed six rows (`ON CONFLICT (state) DO NOTHING` — never overwrite an enabled row), all `enabled = false`, bodies from research 02 §6:

| state | citation | title |
|---|---|---|
| `WI` | Wis. Admin. Code ATCP 110 | Notice of Cancellation (Wisconsin) — 3 business days; refund within 10 days |
| `MN` | Minn. Stat. 325G.07 | Notice of Cancellation (Minnesota) — until midnight of the 3rd business day; two copies required |
| `IL` | Home Repair and Remodeling Act | Notice of Cancellation (Illinois) — 3-day cooling-off; Know Your Consumer Rights pamphlet |
| `CA` | Cal. Bus. & Prof. Code §7159 | Notice of Cancellation (California) — 3 days, 5 for seniors; refund within 10 days |
| `NY` | NYC DCA / local HIC rules | Notice of Cancellation (New York) — 3 business days; refund within 10 business days |
| `MA` | M.G.L. c. 142A | Notice of Cancellation (Massachusetts) — 3 days; separate-page notice required |

The MA body must carry the research lane's own caveat inline: *"Source page returned 403 on re-fetch; summary carried from the seed brief and not independently re-verified."* Do not launder an unverified claim into a seeded legal notice.

RLS: read to every authenticated **only where `enabled`** (a disabled draft is counsel's, not a studio's); write only to super-admin.
```sql
CREATE POLICY agreement_jurisdiction_notices_enabled_select ON public.agreement_jurisdiction_notices
  FOR SELECT TO authenticated USING (enabled);
CREATE POLICY agreement_jurisdiction_notices_admin_all ON public.agreement_jurisdiction_notices
  FOR ALL TO authenticated
  USING (public.user_has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.user_has_role(auth.uid(), 'super_admin'));
```
(`user_has_role` is the 00021 helper; the precedent for this exact super-admin policy pair is 00244:196-198.)

**PART 5 · The two machine-owned draw ledgers (P9, P12)**

The draws themselves live in the `schedule`/`draws` part payload — authored, frozen at send, already covered by W1's `parts` fold in `_commercial_document_fingerprint`. **Nothing in this wave changes the fingerprint** (see §7 RC-8). What is *not* authored is the billing and waiver state, so it gets its own tables, machine-owned:

```sql
CREATE TABLE IF NOT EXISTS public.agreement_draw_invoices (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  draw_key text NOT NULL CHECK (char_length(btrim(draw_key)) > 0),
  sort_order integer NOT NULL,
  label text NOT NULL,
  gross_cents integer NOT NULL CHECK (gross_cents > 0),
  retainage_cents integer NOT NULL DEFAULT 0 CHECK (retainage_cents >= 0),
  net_cents integer NOT NULL CHECK (net_cents > 0),
  is_retainage_release boolean NOT NULL DEFAULT false,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agreement_draw_invoices_net CHECK (net_cents = gross_cents - retainage_cents)
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_agreement_draw_key
  ON public.agreement_draw_invoices(proposal_id, draw_key);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_agreement_draw_sort
  ON public.agreement_draw_invoices(proposal_id, sort_order);
```
Rows are **materialized at send**, by `send_commercial_document`'s new `design_build` arm (PART 11), from the frozen draws payload — never by the composer, never by a client. `agreement_draw_invoices` is deliberately **not** attached to `guard_commercial_authored_child`: it is machine state, and the guard's rule is "immutable once the proposal leaves draft", which is the opposite of what a billing ledger needs. Instead write a dedicated `guard_agreement_draw_ledger` refusing any UPDATE of a column other than `invoice_id`/`issued_at`/`updated_at`, and any INSERT/DELETE outside a definer RPC (`current_user = 'postgres'`) — the shape is `trade_scope_draws`' `invoice_id` guard (00423, table comment at :281-285).

```sql
CREATE TABLE IF NOT EXISTS public.agreement_draw_lien_waivers (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  draw_id uuid NOT NULL REFERENCES public.agreement_draw_invoices(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.studio_contacts(id) ON DELETE SET NULL,
  contact_display_name text,                       -- snapshot; the record outlives the roster row
  waiver_type text NOT NULL,                       -- 'conditional_progress' | 'unconditional_progress'
                                                   -- | 'conditional_final' | 'unconditional_final'
  through_date date,
  amount_cents integer CHECK (amount_cents IS NULL OR amount_cents >= 0),
  storage_path text,                               -- media bucket path; NULL = recorded, not filed
  received_at timestamptz,
  recorded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
```
`waiver_type` free text, code-resident vocab (`LIEN_WAIVER_TYPES` in `packages/types/src/agreement.ts`), same 00417 doctrine.

RLS for both: studio read/write through `public.is_studio_comember(<owning proposal's designer_id>)`, the shape `proposal_agreement_parts` uses (contract §2). The **client** reads neither table directly — only the bundle projection in PART 12.

**PART 6 · Payload validation (R5, R9, research 02 §9 item 6)**

Four `IMMUTABLE`/`STABLE` SQL functions, each returning `text` (NULL = valid, else the studio-facing sentence — so one message serves the DB refusal, the composer, and the test):

| Function | Enforces |
|---|---|
| `_validate_pricing_basis_payload(jsonb)` | `basis IN ('fixed','cost_plus','cost_plus_gmp','tm_nte')`; `costLines` a non-empty array of `{id,label,category IN ('sub','general_conditions','allowance'),basisCents>0}`; `feeBps` present and `0 <= feeBps <= 5000` for the two cost-plus bases and **absent** for `fixed`; `gmpCents` present for `cost_plus_gmp`; `nteCents` present for `tm_nte`; `scheduleOfValues` derivable — Σ(`basisCents`) = `costBasisCents`, and `costBasisCents + round(costBasisCents*feeBps/10000) = gmpCents` to the cent; `subDisclosure IN ('open_book','closed_book')` present exactly once per contract (research 02 §9 item 5). |
| `_validate_draws_payload(jsonb)` | ≥ 2 draws; every `key` unique and non-empty; Σ`pct` = 100 exactly (integer basis-point comparison, never float equality); `retainageBps` 0…1000 (research 02 §3: 5–10%, trending 5%); `retainageApplies` boolean per draw; the first draw (lowest `sortOrder`) has `retainageApplies = false` **and** `key = 'deposit'`; a computed final retainage-release row exists iff Σ retainage > 0; **gross amounts derived last-row-takes-the-remainder** so the schedule sums to the contract sum to the penny — the identical rule `computeDrawAmounts` uses at `apps/designer-portal/src/lib/document/project-commerce.ts:997-1009`. |
| `_validate_allowances_payload(jsonb)` | array of `{id,label,amountCents>0,overageRule IN ('change_order','client_credit'),underageRule IN ('credit','retain')}`; every allowance `id` must also appear as a `costLines` entry with `category='allowance'` and the same `basisCents` (the allowance and its SOV line are one number said twice). |
| `_validate_no_double_count(p_parts jsonb)` | **The no-double-count rule (research 02 §3, §9 item 6).** Refuses when the part set carries BOTH a non-zero `supervisionFeeCents`/`supervisionFeeBps` on the supervision clause AND a non-zero `subMarkupBps` on `pricing_basis`. Message: *"Supervision is paid once. Either bill supervision as a line, or take a markup on the trades — not both."* |

These are called from **two** places: `upsert_agreement_parts` (W1's RPC — graft its head, add the `design_build` dispatch) so the composer refuses to save an invalid payload, and `send_commercial_document` (PART 11) so nothing reaches the client that skipped the composer.

**PART 7 · `upsert_design_services_draft` — one value wider**

Head today `00422_authorized_schedule_phase1.sql:1707`. Its kind allowlist at **00422:1738-1741** reads `NOT IN ('legacy','design_services','service_addendum')` → add `'design_build'`. The `CASE WHEN document_kind = 'legacy' THEN 'design_services' ELSE document_kind END` at 00422:1745 already preserves a non-legacy kind, so nothing else moves. **Copy the whole body from the branch-time head verbatim; change only that one IN-list.**

**PART 7b · The signature path (D-W3-3) — three pinned grafts, one delta each**

| Function (head today) | The exact delta |
|---|---|
| `_sign_design_services_agreement_authorized` (`00412:801`) | `NOT IN ('design_services','service_addendum')` → `NOT IN ('design_services','service_addendum','design_build')`. Nothing else. Its `commercial_state NOT IN ('sent','client_signed')` gate at `:805` already admits the design-build flow. |
| `guard_commercial_signature_insert` (`00566:151`, `:213-222`) | Two deltas. (a) `:151` — the unique-origin-actor leg: `v_proposal.document_kind = 'design_services'` → `v_proposal.document_kind IN ('design_services','design_build')`. (b) `:218-222` — the via × kind matrix: the `v_via IN ('sign_design_services_agreement','record_paper_client_signature')` arm's kind list gains `'design_build'`. **Do not touch** the outer `v_via NOT IN (…six names…)` allowlist at `:204-213` — design_build reuses `sign_design_services_agreement` and `countersign_design_services_agreement`, so no new via name enters the system. Note in the banner that widening (b) also technically permits a paper client signature on a design-build prime *at the guard*, and that the actual paper RPC (`_record_paper_client_signature_impl`, `00425:443`) still refuses the kind — the door stays shut at the RPC, deliberately. |
| `app_private.issue_invoice_for_actor` (`00511:3846`, `:3883`) | The `design_services_retainer` anchor branch appears **twice** in the body (the `anchors` CTE and the document lookup below it). Both: `document.document_kind IN ('design_services','service_addendum')` → `IN ('design_services','service_addendum','design_build')`. Miss one and `v_anchor_count <> 1` raises `'issue_invoice: invoice not found or access denied'` at countersign — an error that reads like a permission bug and is not one. |

Re-pin all three body hashes in `supabase/tests/edge_api/public_sd_hardening_contract_test.sql`.

**PART 7c · The "design-services origin" motif — ten functions**

Every one of these asks *"does this project have an executed commercial origin?"* by testing `document_kind = 'design_services'`. A turnkey project originates on a `design_build` prime, so each must read `IN ('design_services','design_build')`. Head-resolved on 2026-09-06 — **re-resolve each at branch time**; several live inside 3000-line monoliths and each needs its own verbatim graft.

| Function | Head file | Line(s) in that head |
|---|---|---|
| `_is_design_services_project` | `00412_design_services_commercial_authority.sql` | 2336 |
| `classify_project_time_entry_authority` | `00412_design_services_commercial_authority.sql` | 2441 |
| `guard_project_ffe_purchase_authority` | `00423_trade_scope_instrument.sql` | 697 |
| `_create_furnishings_authorization_from_schedule_impl` (body in 00423, **renamed** by 00462 — grep the rename, not just `CREATE OR REPLACE`) | `00423_trade_scope_instrument.sql` | 958, 1102 |
| `create_trade_scope` | `00423_trade_scope_instrument.sql` | 1319, 1329 |
| `publish_budget_checkpoint` | `00423_trade_scope_instrument.sql` | 3303 |
| `get_client_project_threshold` | `00565_the_client_page.sql` | 480 |
| `_execute_furnishings_authorization_authorized` **[PINNED]** | `00511_public_sd_hardening.sql` | 5552 |
| `_execute_trade_scope_authorized` **[PINNED]** | `00511_public_sd_hardening.sql` | 5948 |
| `_execute_furnishings_authorization_on_paper_authorized` **[PINNED]** | `00511_public_sd_hardening.sql` | 4839 |
| `_execute_trade_scope_on_paper_authorized` **[PINNED]** | `00511_public_sd_hardening.sql` | 5221 |
| `create_draft_invoice` **[PINNED]** | `00511_public_sd_hardening.sql` | 3846 (its own origin/anchor leg) |
| `create_service_addendum`'s origin lookup | `00422_authorized_schedule_phase1.sql` | 1863, 1888 — **decide and record**: an addendum to a design-build prime is out of scope this wave; leave closed and say so |

Reproduce the enumeration before writing, and reconcile against this table — a head that moved under W1/W2 will show a different file:

```bash
cd /Users/kody/Code/patina-merged && python3 - <<'PY'
import re,glob,os,collections
files=sorted(glob.glob('supabase/migrations/*.sql'))
fnre=re.compile(r'CREATE OR REPLACE FUNCTION\s+(?:public\.|app_private\.)?([a-z0-9_]+)\s*\(',re.I)
head={}
for f in files:
    for m in fnre.finditer(open(f,encoding='utf8',errors='replace').read()):
        head[m.group(1)]=f
hits=collections.defaultdict(list)
for f in files:
    cur=None
    for i,l in enumerate(open(f,encoding='utf8',errors='replace'),1):
        m=fnre.search(l)
        if m: cur=m.group(1)
        if "document_kind = 'design_services'" in l or "document_kind IN ('design_services'" in l \
           or "document_kind NOT IN ('design_services'" in l or "document_kind NOT IN ('legacy', 'design_services'" in l:
            hits[(cur,f)].append(i)
for (fn,f),ls in sorted(hits.items()):
    if fn and head.get(fn)==f:
        print(f"{fn:<56} {os.path.basename(f):<52} {ls}")
PY
```

Any function this prints that is **not** in PART 7b, PART 7c or §3.3 is a finding: classify it as required or deliberately-single-kind, and record which, in the migration banner.

**PART 8 · `materialize_agreement_template` — the class→kind map and the gate (R10)**

W2 owns the head. Graft two things:
1. When the template's `class = 'design_build'`, set `proposals.document_kind = 'design_build'` in the same transaction that writes the parts (under `set_config('app.commercial_document_id', …, true)`, the lifecycle-GUC discipline at 00477:134-139 / research 04 constraint 4).
2. **The gate**: before anything is written, if `class = 'design_build'` and `NOT public.studio_has_live_license_attestation(<studio of the proposal's designer>)`, raise
   `'the design-build template needs a current licensing attestation on file'` with `ERRCODE = 'check_violation'`.
   Resolve the studio with `public.resolve_studio_identity` (head `00571_studio_invoices.sql:1318`) rather than re-deriving a studio from `organization_members`.

**PART 9 · `_countersign_design_services_agreement_impl` — pass the kind through**

Head today `00566_commercial_signature_studio_resolution.sql`. The origin-document INSERT at **00566:702-707** hardcodes `'design_services'`:
```sql
INSERT INTO public.project_commercial_documents (
  project_id, proposal_id, document_kind, is_origin, executed_at, created_by
) VALUES (v_project_id, p_proposal_id, 'design_services', true, …);
```
Graft → `v_proposal.document_kind`. Guard the ELSE branch too: the addendum lookup at 00566:731-733 filters `document_kind = 'service_addendum'` and stays as-is (a `design_build` proposal is always an origin, never an addendum, this wave).

The authority INSERT at 00566:786-797 already reads `v_terms.billing_cadence`, so `'per_draw'` flows through once PART 2 widens the CHECK. **This function is body-hash pinned** — re-pin it in `supabase/tests/edge_api/public_sd_hardening_contract_test.sql` (the 00563/00566/00571 precedent).

**PART 10 · `issue_agreement_draw_invoice` (P9, P13)**

```sql
CREATE OR REPLACE FUNCTION public.issue_agreement_draw_invoice(
  p_proposal_id uuid, p_draw_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ … $$;
REVOKE ALL ON FUNCTION public.issue_agreement_draw_invoice(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_agreement_draw_invoice(uuid, text) TO authenticated;
```

Body outline — **read `public.issue_trade_draw_invoice` (00423:2488-2641) side by side and reuse its every guard**:
1. `SELECT … FOR UPDATE` the draw ledger row by `(proposal_id, draw_key)`; not found → `insufficient_privilege` with the same message for missing-or-denied (never confirm existence).
2. Lock the proposal; require `document_kind = 'design_build'` and `public._can_author_proposal(v_proposal.designer_id)`. **Exception for the deposit**: when `p_draw_key = 'deposit'` and the caller is `service_role` (the client-portal sign route's service client), skip the authorship check — the client's own signature is the authority for their own deposit. Everything else requires the studio.
3. **State gate.** `deposit` requires `commercial_state IN ('client_signed','executed')`. Every other draw requires `commercial_state = 'executed'` **and** a live `project_billing_authorities` row. Rationale for the banner: the client's obligation to fund the deposit arises from the client's own signature; the studio countersigning is what starts the work. Flagged for review as RC-7.
4. **Already billed?** `invoice_id IS NOT NULL AND EXISTS (… status <> 'void')` → refuse. A voided invoice frees the draw (00423:2530-2538, verbatim rule).
5. **Every lower draw issued and paid in full** — copy 00423:2540-2556's `LEFT JOIN invoices … status IS DISTINCT FROM 'paid' OR amount_paid_cents < total_cents` count.
6. **Retainage release** (`is_retainage_release = true`) additionally requires every non-release draw paid, i.e. the count above run without the `sort_order <` filter.
7. INSERT `invoices` with `total_cents = net_cents` (retainage is withheld, not billed), `title = <draw label>` (00571 PART 1 added `title`), `studio_id` left to `set_invoice_studio_id` (the 00571 gate — **do not** set it by hand), plus one `invoice_line_items` row `kind='adhoc'` with metadata `{agreementProposalId, commercialDocumentId, drawKey, kind:'agreement_draw', grossCents, retainageCents}`.
8. Adopt the owner for issuance and restore — the `set_config('request.jwt.claims', …, true)` / `PERFORM public.issue_invoice(…)` / restore sandwich at 00423:2582-2589, **including the `EXCEPTION WHEN OTHERS` tail that restores both GUCs and re-raises**.
9. Stamp `invoice_id`, `issued_at` on the ledger row under the write GUC; when the draw is the deposit, also point `project_commercial_documents.deposit_invoice_id` at it (the reasoning is spelled out at 00423:2596-2615 — skipping it strands the pointer on a voided invoice).
10. Return the I-3 payload, reading `payToken` from `public.invoice_links` (the `invoice_link_mint_on_issue` trigger, 00574:143-149, has already fired inside this transaction because `issue_invoice` UPDATEs `status`); if no link row exists, return `payToken: null` rather than raising — a missing link is recoverable via `ensure_invoice_link`, an aborted issuance is not (00574:132-135's own reasoning).

**PART 11 · `send_commercial_document` — the design-build arm**

Head today 00423 (W1 will have moved it). Add a `v_proposal.document_kind = 'design_build'` branch beside the trade arm at 00423:1630-1670, refusing on:
- no `pricing_basis` part, or `_validate_pricing_basis_payload` returns non-NULL;
- no `draws` part, or `_validate_draws_payload` returns non-NULL;
- `_validate_allowances_payload` non-NULL when an `allowances` part exists;
- `_validate_no_double_count` non-NULL;
- `NOT public.studio_has_live_license_attestation(<studio>)` — the gate holds at send too, not only at template selection (an attestation can expire between compose and send);
- any `attachment` part whose `payload->>'jurisdiction'` names a notice row with `enabled = false` (R11: a disabled notice must not reach a client);
- Σ draw `gross_cents` ≠ the pricing basis' contract sum (`gmpCents` / `nteCents` / `fixedCents`) — the trade arm's "must agree to the cent" rule (00423:1656-1658), applied to the new class.

On success, **materialize `agreement_draw_invoices`** from the now-frozen draws payload inside the same transaction (this is the only writer of those rows).

**PART 12 · `get_client_commercial_document_bundle` — the client's draw ledger (R13)**

Head today `00425_executed_on_paper.sql` (the return object begins ~:1276 and appends `|| CASE WHEN v_document.document_kind = 'trade_scope' THEN … END` at :1375). Add a parallel `design_build` arm:

```
'designBuild', jsonb_build_object(
  'draws', [ {drawKey, label, grossCents, retainageCents, netCents, isRetainageRelease,
              invoiceStatus, paidAt, lienWaiver: {type, receivedAt} | null } ordered by sortOrder ],
  'retainageHeldCents', <sum of retainage on issued-or-paid draws>,
  'subs', [ {displayName, companyName, trade, awardedPriceCents | null } ]   -- see below
)
```

**R13 is enforced here and nowhere else matters.** `subs` projects **identities always**; `awardedPriceCents` is populated **only** when the agreement's sub-disclosure clause reads `open_book`, and is `NULL` under `closed_book`. The multi-bid comparison — `trade_scope_bids` (00423:213, studio-only by construction) and any Trade Agreement the studio holds — is **never** projected, in either mode, at any state. Write that as a comment in the function body the way 00424:576-600 writes out its DTO's absences, so a future widener has to argue with it.

**PART 13 · Seed `patina.design_build` into `agreement_templates` (W2's table)**

`kind='seeded'`, `studio_id=NULL`, `created_by=NULL`, `template_key='patina.design_build'`, `class='design_build'`, `title='Design-build turnkey'`. Ten ordered parts, matching M6's rail exactly:

| # | `part_key` | kind / variant | required | client_visible | note |
|---|---|---|---|---|---|
| 1 | `patina.pricing_basis` | schedule / `pricing_basis` | ✔ | ✔ | carries the schedule of values — **no separate SOV part** (§4's merge) |
| 2 | `patina.draws` | schedule / `draws` | ✔ | ✔ | retainage % + release rule live here |
| 3 | `patina.allowances` | schedule / `allowances` | ✖ | ✔ | overage / underage rule |
| 4 | `patina.sub_disclosure` | clause | ✔ | ✔ | open-book *or* closed-book, one per contract |
| 5 | `patina.supervision_fee` | clause | ✔ | ✔ | the no-double-count rule is enforced by the template, not by drafting |
| 6 | `patina.change_orders` | clause | ✔ | ✔ | |
| 7 | `patina.termination` | clause | ✔ | ✔ | |
| 8 | `patina.terms` | clause | ✔ | ✔ | |
| 9 | `patina.notice_of_cancellation` | attachment | ✖ | ✔ | jurisdiction-triggered; **ships disabled** (R11) |
| 10 | `patina.lien_waiver_form` | attachment | ✖ | ✔ | conditional / unconditional × progress / final (P12) |

Plus the gate, which is a studio-level record rather than a rail row: `patina.licensing_attestation` (kind `attestation`, `client_visible = false`) is materialized from `studio_license_attestations` at compose time and is **never editable in the rail** — §8's table marks it "gate", and its "Client sees" cell is **no**.

Seeded rows must be immutable except under the maintenance GUC `app.allow_patina_template_mutation` — reuse W2's guard, which reuses `board_templates`' (00408:80-86).

**PART 14 · Grants, ACL hygiene, close**

Every new function: `REVOKE ALL ... FROM PUBLIC, anon` **and** the roles it does not need, then an explicit `GRANT`. **Strata predates the 2026-05-30 grant-default flip and auto-grants `anon` EXECUTE at creation** — this is not theoretical; `platform_acl_compatibility_test.sql:819-848` exists because of it. Every new function must therefore be asserted anon-denied by name in that test (§5 SQL-T12). Schema-qualify `extensions.gen_random_uuid()` / `extensions.digest()` / `extensions.gen_random_bytes()` — a bare call passes locally and fails on Strata with 42883 (the 00282 incident). `COMMIT;` then, outside the file, `python3 scripts/generate-legacy-grants.py`.

---

### 3.2 Migration 2 — `NNNNN+1_trade_agreements.sql` (P14, R16)

**Banner**: lineage `none (new objects)`; note explicitly that `commercial_document_signatures` is **not touched** and that the sub's signature lives on its own table for exactly that reason (research 04 constraint 7).

**`public.studio_trade_agreements`**
```
id uuid PK DEFAULT extensions.gen_random_uuid()
project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE
studio_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT
source_proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL  -- the prime it flows down from
contact_id uuid REFERENCES public.studio_contacts(id) ON DELETE SET NULL
contact_display_name text NOT NULL      -- snapshot, survives roster deletion (trade_scope_terms' rule, 00423:139-143)
contact_company_name text
contact_email text
trade text
title text NOT NULL CHECK (char_length(btrim(title)) > 0)
scope text NOT NULL CHECK (char_length(btrim(scope)) > 0)
price_cents integer NOT NULL CHECK (price_cents > 0)
currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$')
schedule jsonb NOT NULL DEFAULT '{}'::jsonb    -- {startOn, durationDays, sequencing}
retainage_bps integer NOT NULL DEFAULT 0 CHECK (retainage_bps BETWEEN 0 AND 1000)
pay_when_paid_days integer CHECK (pay_when_paid_days IS NULL OR pay_when_paid_days BETWEEN 0 AND 60)
insurance_certificate_required boolean NOT NULL DEFAULT true
lien_waiver_policy text NOT NULL DEFAULT 'conditional_then_unconditional'
flow_down_clause_key text NULL          -- stays NULL this wave (R16, counsel-gated)
sov_line_ids text[] NOT NULL DEFAULT '{}'  -- which SOV lines this sub's price maps to (02 §7 "Price")
state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','sent','signed','void'))
sent_at, signed_at, voided_at timestamptz
created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT
created_at, updated_at timestamptz NOT NULL DEFAULT now()
```
The eight essentials of research 02 §7 map: flow-down → `flow_down_clause_key` (disabled), scope → `scope`, price → `price_cents` + `sov_line_ids`, schedule → `schedule`, retainage → `retainage_bps`, pay-when-paid → `pay_when_paid_days` (AIA A401's 7 days is the default the composer offers), insurance → `insurance_certificate_required`, lien waivers → `lien_waiver_policy`. **All eight present; none optional.** Write that mapping as a table comment.

**`public.studio_trade_agreement_signatures`**
```
id uuid PK
agreement_id uuid NOT NULL REFERENCES public.studio_trade_agreements(id) ON DELETE RESTRICT
party text NOT NULL CHECK (party IN ('studio','sub'))
signer_user_id uuid NULL REFERENCES public.profiles(id) ON DELETE RESTRICT  -- NULL for the sub: no account
signed_name text NOT NULL CHECK (char_length(btrim(signed_name)) >= 2)
signed_ip text
evidence_fingerprint text NOT NULL CHECK (char_length(evidence_fingerprint) = 64)
signed_at timestamptz NOT NULL DEFAULT now()
metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object')
UNIQUE (agreement_id, party)
```
Rows are **append-only**: no UPDATE or DELETE policy, no UPDATE/DELETE grant, plus a `guard_trade_agreement_signature_immutable` trigger raising on either. `evidence_fingerprint` = `sha256` over a stable projection of the agreement (scope, price, schedule, retainage, pay-when-paid, insurance, lien-waiver policy, sov_line_ids) — its own small `_trade_agreement_fingerprint(uuid)` function; **do not** reach into `_commercial_document_fingerprint`.

**`public.studio_trade_agreement_tokens`** — `trade_rfq_tokens`' shape verbatim (00424:124-147):
```
id uuid PK
agreement_id uuid NOT NULL REFERENCES public.studio_trade_agreements(id) ON DELETE CASCADE
contact_id uuid NOT NULL REFERENCES public.studio_contacts(id) ON DELETE CASCADE
token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$')
status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked'))
expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
last_used_at timestamptz
created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
created_at, updated_at timestamptz
```
Partial index on `(agreement_id) WHERE status = 'active'`. **Only `sha256(token)` is stored**; the raw token exists once, returned by the mint RPC to `service_role` and never again (00424:149-153's comment is the standard to meet).

**RLS.** All three tables: studio read/write via `public.is_active_org_member(studio_id)` (agreements) or through a join to the agreement (signatures, tokens); `REVOKE ALL … FROM PUBLIC, anon, authenticated` on the token table with **no** authenticated grant at all — every touch goes through a definer RPC, the `invoice_links` posture (00574:98-101, "RLS on with zero policies"). The **sub has no role and no policy**: their entire access is `resolve_trade_agreement_link` + `sign_trade_agreement_by_token`, both `service_role`-only, called from the client-portal server action.

**RPCs**

| RPC | Grant | Outline |
|---|---|---|
| `create_trade_agreement(p_project_id, p_contact_id, p_payload jsonb) → uuid` | `authenticated` | Authorize with `public.is_active_studio_member(<studio of project>)`; snapshot the contact's name/company/email/trade from `studio_contacts`; validate the eight essentials present; insert `state='draft'`. Refuses when the studio has no live attestation (a studio that cannot hold the prime should not be holding subs under it). |
| `send_trade_agreement(p_agreement_id) → jsonb` | `authenticated` | Authorize as above; require `state IN ('draft','sent')`; freeze (a `guard_trade_agreement_authored` trigger refuses content UPDATEs once `state <> 'draft'` — **column-scoped, see below**); stamp `state='sent'`, `sent_at`. Returns the row for the edge function; **does not mint the token** (minting is `service_role`, exactly as 00424 splits it). |
| `mint_trade_agreement_token(p_agreement_id) → TABLE(id uuid, token text)` | `service_role` only | `auth.role() = 'service_role'` or raise; revoke-then-mint so at most one live link; `encode(extensions.gen_random_bytes(32),'hex')` raw, `encode(extensions.digest(raw,'sha256'),'hex')` stored. Verbatim from 00424:447-494. |
| `resolve_trade_agreement_link(p_token) → jsonb` | `service_role` only | Returns **NULL on every miss** — bad hash, revoked, expired, agreement voided, agreement not in `('sent','signed')`. Bumps `last_used_at`. DTO in §4.5. |
| `sign_trade_agreement_by_token(p_token, p_signed_name, p_signed_ip) → jsonb` | `service_role` only | Re-resolves the token itself (no pre-resolve — 00424's `submit_trade_rfq_response` reasoning). Classifies: `invalid_link` / `already_signed` (idempotent replay returns the existing signature, does not raise) / `agreement_void`. On success: insert the `sub` signature with the fingerprint computed **inside** the transaction, set `state='signed'`, `signed_at`, and **revoke the token in the same transaction** (a signed agreement's link is spent). |
| `void_trade_agreement(p_agreement_id, p_reason)` | `authenticated` | Studio only; `state='void'`, `voided_at`; revoke every live token. Refuses when `state='signed'` — a signed agreement is superseded by a new one, never voided. |
| `list_trade_agreements(p_project_id) → jsonb` | `authenticated` | Studio-side read for the designer surface. |

Every definer RPC: `SECURITY DEFINER SET search_path = public, extensions, pg_temp`, `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role` then the single `GRANT` above.

**`guard_trade_agreement_authored` is column-scoped, and must be** (amended 2026-09-07, edge round-2 F16). `send_trade_agreement` accepts `state IN ('draft','sent')` and stamps `state`/`sent_at` — so on a **resend** the RPC issues an UPDATE against a row whose `state` is already `'sent'`, and a `SECURITY DEFINER` RPC does not bypass its table's own trigger. A guard written over the whole row therefore aborts inside the RPC and every resend fails permanently — `502 commit_failed` at the edge, forever. The guard compares **only the content columns**: `project_id`, `studio_id`, `source_proposal_id`, `contact_id`, `contact_display_name`, `contact_company_name`, `contact_email`, `trade`, `title`, `scope`, `price_cents`, `currency`, `schedule`, `retainage_bps`, `pay_when_paid_days`, `insurance_certificate_required`, `lien_waiver_policy`, `flow_down_clause_key`, `sov_line_ids`, `created_by`, `created_at`. The state machine's own columns — `state`, `sent_at`, `signed_at`, `voided_at`, `void_reason`, `updated_at` — are **exempt** and still move after `'sent'`.

Two further shapes the edge lane depends on, pinned here because reading them wrong fails silently rather than loudly:

- `send_trade_agreement` `RETURNS jsonb` — a single **object with camelCase keys** (`state`, `sentAt`, …), never a row set and never the table's snake_case column names.
- `mint_trade_agreement_token` `RETURNS TABLE (id uuid, token text)` — PostgREST hands back an **array**; the raw token is `data[0].token` and is emitted exactly once.

### 3.3 The exact list of closed `document_kind` sites that must learn `design_build`

Verified by direct read on 2026-09-06. Each row is a **required** edit unless the last column says otherwise. Lane in brackets.

**SQL — CHECK constraints (2)**

| Site | What it is |
|---|---|
| `supabase/migrations/00423_trade_scope_instrument.sql:93-101` → re-added in migration 1 PART 1 | `proposals_document_kind_check`, 5 values → 6 [backend] |
| `supabase/migrations/00423_trade_scope_instrument.sql:110-133` (originally `00412:115-117`) → re-added in migration 1 PART 1 | `project_commercial_documents_document_kind_check`, 4 values → 5 [backend] |

**SQL — function heads that branch on kind** (anchor each with the grep in the preamble; line numbers are the head file as of today)

| Head file:line | Function | Change |
|---|---|---|
| `00422_authorized_schedule_phase1.sql:1738-1745` | `upsert_design_services_draft` | add `'design_build'` to the IN-list [backend, PART 7] |
| `00412_design_services_commercial_authority.sql:801` | `_sign_design_services_agreement_authorized` | the kind refusal blocks a design-build client signature [backend, **PART 7b**]; **PINNED → re-pin** |
| `00566_commercial_signature_studio_resolution.sql:151`, `:213-222` | `guard_commercial_signature_insert` | the via × kind matrix rejects the signature row even after the RPC allows it; and the origin-actor bootstrap leg is design-services-only [backend, **PART 7b**]; **PINNED → re-pin** |
| `00511_public_sd_hardening.sql:3846`, `:3883` | `app_private.issue_invoice_for_actor` | the retainer anchor is scoped to two kinds → a design-build retainer fails at countersign with an access-shaped error [backend, **PART 7b**]; **PINNED → re-pin** |
| `00566_commercial_signature_studio_resolution.sql:347`, `:522`, `:692`, `:702-707` | `_countersign_design_services_agreement_impl` | three `IN ('design_services','service_addendum')` scopes plus the hardcoded `'design_services'` literal in the origin INSERT → `v_proposal.document_kind` [backend, PART 9]; **PINNED → re-pin** |
| `00423_trade_scope_instrument.sql:1610-1614`, `:1617`, `:1631`, `:1754` | `send_commercial_document` | four kind-scoped legs: the services terms+rates refusal (must **not** fire for `design_build` — it has no rate card), the furnishings checkpoint leg, the trade arm, and the `total_amount` rewrite at send. Add the design-build arm and give it a `total_amount` (the contract sum) [backend, PART 11] |
| `00425_executed_on_paper.sql:1243-1420` | `get_client_commercial_document_bundle` | the `(legacy AND draft) OR (non-legacy AND …)` readability gate plus the two additive `CASE` payload arms → add a third [backend, PART 12] |
| **PART 7c's ten origin-motif functions** (table above) | — | "does this project have an executed commercial origin?" Miss one and a turnkey project silently has no origin, so FF&E, time billing, budget checkpoints, the client threshold or invoicing refuse. Highest-risk group in the wave. |
| `00423_trade_scope_instrument.sql:1214-1275` | `_commercial_document_fingerprint` | **NO CHANGE, argued.** Every authored design-build payload lives in `proposal_agreement_parts`, which W1 folds in. The parallel sweep flagged this as *possibly* needing a third `CASE` arm the way `trade_scope` has one — it does not, because `trade_scope` needed one only for its own child tables (`trade_scope_terms/sections/draws`), and this class has none. **SQL-T11 and RC-8 exist to falsify that claim; if either fails, add the arm.** |
| `00425_executed_on_paper.sql:443` (`_record_paper_client_signature_impl`, renamed by 00462) and `00477_design_services_paper_issue.sql:275` (`_issue_design_services_agreement_on_paper`) | the paper client-signature and paper-issue gates | **NOT required — deliberately left closed.** Paper execution of a turnkey prime is out of scope (§1.2). Record the decision in the banner so the next reader sees a choice, not an oversight. |
| `00422:689`, `:1153`; `00425:599`, `:882`, `:1120`; `00423:1394`, `:1464`, `:2248`, `:2301`, `:3114`; `00424:1169`; `00422:2129`; `00462:1510` | `void_furnishings_authorization`, `void_trade_scope`, `set_trade_scope_party`, `select_trade_bid`, `mark_trade_scope_in_progress`, `record_trade_scope_substantial_completion`, `list_trade_scopes`, `list_furnishings_authorizations`, `guard_furnishing_authorization_item_insert`, `issue_trade_draw_invoice` | **NOT required** — single-kind instruments by design |
| `00477:141-199` (`guard_commercial_proposal_authority`), `00435:921` (`activate_proposal_as_project`), `00414:314` (`send_proposal`), `00412:3071` (`supersede_unsigned_legacy_proposals`), `00412:1426` (`get_commercial_document_send_snapshot`), `00422:2327` (`list_client_proposals`) | `<> 'legacy'` / `= 'legacy'` generic guards, or a passthrough projection | **NOT required** — they already admit any non-legacy kind |

**Edge functions (Deno)**

| Site | Change |
|---|---|
| `supabase/functions/proposal-send/handler.ts:47-52` | the `documentKind` union gains `'design_build'` [edge] |
| `supabase/functions/proposal-send/handler.ts:240-259` (and the ternary chains through `:300`) | five ternary chains — `documentLabel`, `subject`/`description`, `eyebrow`, `heading`, `ctaButton` label — each gains a `design_build` arm: label `design-build agreement`, eyebrow `Design-build`, heading `Your design-build agreement is ready`, CTA `Review agreement`, description naming the pricing basis, the schedule of values, the draw schedule and retainage [edge] |
| `supabase/functions/commercial-document-notify/core.ts:13-23` | `CommercialTransition` gains `'agreement_draw_ready'` [edge] |
| `supabase/functions/commercial-document-notify/policy.ts:69` | `SERVICES_KINDS = new Set(["design_services","service_addendum"])` → add `"design_build"` [edge] |
| `supabase/functions/commercial-document-notify/policy.ts:82-92` | add `AGREEMENT_DRAW_TRANSITIONS = new Set(["agreement_draw_ready"])` beside the trade-scope set [edge] |
| `supabase/functions/commercial-document-notify/policy.ts:106-138` (`documentKindCanNotify`) | route `agreement_draw_ready` → `documentKind === "design_build"`. **Do NOT add `design_build` to the `deposit_ready` branch (`:118-123`)** — the design-build deposit reaches the client on the door, in the same act, and an email would be a second, contradictory notice [edge] |
| `supabase/functions/commercial-document-notify/policy.ts:88-94` (`EVENT_SCOPED_TRANSITIONS`) | add `"agreement_draw_ready"` — keyed on the `agreement_draw_invoices` row id [edge] |
| `supabase/functions/commercial-document-notify/policy.ts:182-249` (`assessCommercialTransition`) | add the `agreement_draw_ready` case: `commercialState = 'executed'`, bound design-build evidence, an issued invoice on the named draw [edge] |
| `supabase/functions/commercial-document-notify/index.ts:256-282` | the evidence loader's `trade_draw_ready` block gains a sibling reading `agreement_draw_invoices` by `eventId` [edge] |
| `supabase/functions/commercial-document-notify/lib.ts` | the email body for the new transition [edge] |

**Packages**

| Site | Change |
|---|---|
| `packages/types/src/commercial.ts:9-15` | `COMMERCIAL_DOCUMENT_KINDS` → append `'design_build'`. **This one line is I-1 and unblocks the client lane's sign route allowlist for free.** [designer] |
| `packages/types/src/commercial.ts:90-95` | `DesignServicesAgreement.kind` stays `'design_services' \| 'service_addendum'`; add a **new** `DesignBuildAgreement` interface rather than widening it [designer] |
| `packages/types/src/commercial.ts:270-275` | `ClientCommercialDocumentBundle.document` is a discriminated union (`DesignServicesAgreement \| FurnishingsAuthorization \| TradeScopeAuthorization \| CommercialDocumentSummary`). Add `DesignBuildAgreement` as a member — without it a design-build document is only representable as the generic summary fallback, and the client body cannot narrow to it [designer] |
| `packages/types/src/agreement.ts` (W1) | `AGREEMENT_TEMPLATE_CLASSES` already carries `'design_build'` per contract §1 — verify, don't re-add. Add `PRICING_BASIS_KINDS`, `LIEN_WAIVER_TYPES`, `LICENSE_CREDENTIAL_TYPES`, `SUB_DISCLOSURE_MODES`, and the `PricingBasisPayload` / `DrawsPayload` / `AllowancesPayload` shapes [designer] |
| `packages/supabase/src/hooks/use-proposals.ts:250` | `document_kind?: 'legacy'\|'design_services'\|'furnishings_authorization'\|'service_addendum'` — **already missing `'trade_scope'`** (pre-existing drift). Fix both in one edit [designer] |
| `packages/supabase/src/database.types.ts` | regenerated, never hand-edited [backend] |

**Designer portal**

| Site | Change |
|---|---|
| `apps/designer-portal/src/lib/document/commercial-documents.ts:12-18` | a **local duplicate** `COMMERCIAL_DOCUMENT_KINDS` missing `'trade_scope'` already. Contract P0 collapses this onto `@patina/types`; if W1 did not finish that, W3 does it here [designer] |
| `apps/designer-portal/src/lib/document/commercial-documents.ts:135-152` | `commercialDocumentExperience` — the high-leverage choke point. Add `case 'design_build': return 'design_services'` (the Contract Room experience). Its nine downstream consumers (`proposal-blocks-readonly.tsx:99`, `proposal-instruments.tsx:73,95`, `proposal-preview.tsx:28,59`, `worktable/finalize-head.tsx:86`, `worktable/offer-facets.tsx:63,70`, `rooms/drafting/drafting-room.tsx:146,195`, `app/(document)/doc/[id]/page.tsx:1539,2348`) all inherit the decision and need **no** edit — but the walk must exercise each. Note the pre-existing bug this reveals: `trade_scope` falls through the `default` to `'legacy'` today [designer] |
| `apps/designer-portal/src/lib/document/commercial-documents.ts:451-456` | `asCommercialDocumentKind(value)` — anything absent from the (already stale) local array is **silently coerced to `'legacy'`**. Called from `app/(document)/doc/[id]/page.tsx:1539`. Fixing the array above fixes this; verify by loading a design-build doc and asserting the kind is not `'legacy'` [designer] |
| `apps/designer-portal/src/components/document/commercial/record-on-paper-sheet.tsx:43-91,117-122,158-164` | `RecordOnPaperKind` plus three **compiler-total** `Record<RecordOnPaperKind, …>` maps. **NOT required** — paper execution is out of scope (§1.2). Because the union is local and not derived from `CommercialDocumentKind`, adding the new kind does **not** break this file's compile; that silence is expected, not a missed edit [designer, verify only] |
| `apps/designer-portal/src/lib/document/commercial-documents.ts:176-182` | `assessServiceAgreementReadiness`'s kind refusal — W1 replaced this with `assessAgreementReadiness`; W3 extends the new one, and leaves the old flag-off function alone [designer] |
| `apps/designer-portal/src/components/document/commercial/service-agreement-instruments.tsx:62` | `movesTheSchedule = documentKind === 'design_services'` → include `'design_build'` (a turnkey prime anchors the engagement-start phase exactly as 00566:712-726 does) [designer] |
| `apps/designer-portal/src/components/document/client-note-composer.tsx:135` | the design-services filter for note targets [designer] |
| `apps/designer-portal/src/lib/document/document-guide.ts:524`, `:667`; `document-guide-inputs.ts:73` | `documentKind === 'design_services'` guide branches [designer] |
| `apps/designer-portal/src/lib/document/drafting-editability.ts:37`; `rooms/drafting/drafting-room.tsx:195`; `proposal-blocks-readonly.tsx:100`; `proposal-instruments.tsx:95`; `proposal-preview.tsx:59` | all branch on `experience === 'design_services'`, which the mapping above already satisfies → **no edit needed**, but each must be exercised in the walk |
| `apps/designer-portal/src/components/document/rooms/drafting/draft-proposal-opener.tsx:104` | hardcodes `document_kind: 'design_services'` on create — **leave as-is**; the kind flips at template materialization (PART 8), not at draft creation [designer, verify only] |

**Client portal**

| Site | Change |
|---|---|
| `apps/client-portal/src/app/api/proposals/[id]/sign/route.ts:6` | derives its set from `COMMERCIAL_DOCUMENT_KINDS` → free via I-1 [client, verify] |
| `apps/client-portal/src/app/api/proposals/[id]/sign/route.ts:96-111` | the retry/`not_signable` preflight: `design_build` behaves as a services kind (`isClientSignedServicesRetry` at `:102-105` excludes furnishings and trade_scope by name, so it already admits `design_build` — **verify, don't edit**) [client] |
| `apps/client-portal/src/app/api/proposals/[id]/sign/route.ts:222-260` | the services fall-through calls `sign_design_services_agreement_with_trusted_ip`. `design_build` takes this same path, then makes the **separate** deposit call (D-W3-2) and returns `depositOffer` [client] |
| `apps/client-portal/src/app/api/proposals/[id]/decline/route.ts:5,37` | uses the same shared set → free via I-1 [client, verify] |
| `apps/client-portal/src/app/api/proposals/[id]/notifications/replay/route.ts:11` | `SERVICES_KINDS = new Set(['design_services','service_addendum'])` → add `'design_build'` [client] |
| `apps/client-portal/src/components/commercial-document-shell.tsx:25-30` | `KIND_LABEL: Record<Exclude<CommercialDocumentKind,'legacy'>, string>` — a **compiler-total** map, so the moment I-1 lands this file stops type-checking until `design_build: 'Design-build agreement'` is added. This is the wave's single cleanest forcing function; if `pnpm --filter @patina/client-portal type-check` does **not** fail here after I-1, I-1 did not actually land (a stale `@patina/types` dist) [client] |
| `apps/client-portal/src/app/api/proposals/[id]/sign/route.ts:96-111`, `:222-260` | **The one site that actively does the wrong thing rather than merely omitting the right thing.** The allowlist at `:79` is derived from `COMMERCIAL_DOCUMENT_KINDS`, so I-1 *auto-admits* `design_build` — but the routing below is a `furnishings → trade_scope → else` chain, so a design-build sign request would fall into the `else` and be signed as a plain design-services agreement, with no deposit and no design-build validation. **Fail-open misroute. Fix this before or in the same change as I-1**, never after [client] |
| `apps/client-portal/src/components/commercial-document-shell.tsx:159-167` | body dispatch → new `{document.kind === 'design_build' && <DesignBuildBody …/>}` branch [client] |
| `apps/client-portal/src/components/commercial-document-shell.tsx:632` | `bundle.document.kind !== 'trade_scope' &&` — read it and decide; if it gates the signature ledger's services copy, `design_build` belongs on the services side [client] |
| `apps/client-portal/src/components/threshold/consent-copy.ts:30-36` | `consentLineFor` — W2 made this a composer; W3 adds the design-build money parts. The `design_services \|\| service_addendum` branch at `:33` must **not** silently swallow `design_build` [client] |
| `apps/client-portal/src/components/threshold/consent-copy.ts:39-43` | `signLabelFor` → `design_build` returns `'Sign and accept'` (it is countersigned, so not "Sign and authorize") [client] |
| `apps/client-portal/src/components/threshold/consent-copy.ts:51-60` | `summaryLineFor` → a design-build sentence naming the pricing basis, the schedule of values, the draw schedule, retainage, and the countersignature condition [client] |
| `apps/client-portal/src/components/threshold/consent-copy.ts:68-74` | `KIND_LABEL` → `design_build: 'Design-build agreement'` [client] |
| `apps/client-portal/src/components/threshold/door-gate.tsx:218` | `kind: kind === 'legacy' ? 'design_services' : kind` → passes through; verify the analytics union accepts it [client] |
| `apps/client-portal/src/components/threshold/wall-gate.tsx:242` | `kindLabel={KIND_LABEL.trade_scope ?? null}` — a per-kind lookup site; add the design-build peer [client] |
| `apps/client-portal/src/components/threshold/threshold.tsx:807` | `enclosure.kind === "trade_scope"` — read and decide [client] |
| `apps/client-portal/src/lib/commercial-documents.ts:451-455` | the nested-payload mapper (`tradeScope` / kind-is-source) gains a `designBuild` arm [client] |
| `apps/client-portal/src/lib/threshold/derive.ts:63` | `kind: 'proposal' \| 'trade_scope' \| 'invoice'` — a *threshold* vocabulary, not `document_kind`. A design-build prime is a `'proposal'` here → **no edit**, verify only [client] |
| `apps/client-portal/src/lib/analytics/events.ts:106-111` | `MakingGateKind` → add `'design_build'` [client] |
| `packages/supabase/src/hooks/use-project-notes.ts:14` | `kind: 'proposal' \| 'trade_scope' \| 'invoice'` — same threshold vocabulary, **no edit** [verify] |

**Tests that pin a kind list**

| Site | Change |
|---|---|
| `apps/client-portal/src/components/threshold/__tests__/consent-copy.test.ts` | the drift guard reads `sign/route.ts` off disk and pins every branch; it must learn the design-build branch **in the same change** as `consent-copy.ts` (research 04 constraint 8) [client] |
| `supabase/tests/edge_api/public_sd_hardening_contract_test.sql` | re-pin `_countersign_design_services_agreement_impl`'s body hash [backend] |
| `supabase/tests/edge_api/platform_acl_compatibility_test.sql:389-420` and `:819-860` | register every new RPC with its grantee, and assert `anon` holds EXECUTE on none of them [backend] |
| `supabase/tests/edge_api/public_rpc_authorization_contract_test.sql:2315-2345` | register the new service-only RPCs [backend] |

> This table merges a hand read with an independent exhaustive sweep; the two disagreed in three places and every disagreement was resolved by reading the head body (they became D-W3-3). **It is still not proof of completeness.** Before writing code, each lane re-runs its own sweep over its own pathspecs — the SQL one is scripted in PART 7c; for TS:
> `grep -rn "trade_scope" <lane pathspecs> | grep -v "trade_scope_\|\.test\." ` — anywhere `trade_scope` appears as a *list member*, `design_build` probably belongs beside it. Treat any site found this way but absent from this table as a finding, classify it required / deliberately-single-kind, and report which.
>
> **Two shapes of failure, and only one of them is loud.** A *closed set* that omits the new kind fails **closed** (a notification never sends, a body never renders) — annoying, discoverable in the walk. A *double-negative default* (`kind !== 'furnishings_authorization' && kind !== 'trade_scope'`) fails **open** — the new kind silently takes the design-services path. The sign route at `:96-111` is exactly this, and it is why the walk's step 12 must assert *which* RPC ran, not merely that the signature landed.

---

## 4 · Designer / client / sub UI

### 4.1 Designer — the turnkey composer

Flag gate at the top of the Contract Room's agreement branch (W1 put a `useFeatureFlag` branch in `service-agreement-drafting-room.tsx`); W3 adds a **second, nested** gate so `design-build` is independent of `agreement-parts`:

```
useFeatureFlag('design-build')  →  { value, isLoading }
isLoading || !value  →  the turnkey template is absent from the picker, the
                        turnkey editors never mount, and a design_build
                        proposal (impossible to create with the flag off)
                        renders read-only prose.
```
There is **no central flag registry** in this repo — flags are bare string literals at the call site. `design-build` is created in PostHog by Kody; until then the feature is dark. For local dev and e2e: `NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true,agreement-library:true,design-build:true`, and the same string added to `apps/designer-portal/playwright.config.ts:104` and `apps/client-portal/playwright.config.ts:23` `webServer.env` (the pinned value beats `.env.local` — Trap 3, `patina-testing`).

**Component tree** — new folder `.../rooms/drafting/agreement/turnkey/`:

```
turnkey/
  pricing-basis-editor.tsx      basis radio (Fixed · Cost-plus · Cost-plus with GMP · T&M with NTE)
                                → fee % field (hidden for Fixed) → sub-markup % field
                                → the cost-lines table (label · category · basis $)
                                → derived, read-only: Cost basis · Fee · GMP/NTE
                                → header chips, exactly M6's: `Cost basis $71,300` ·
                                  `Fee 18% · $12,834` · `GMP $84,134`
  schedule-of-values.tsx        derived from cost lines, NOT separately authored (§4's merge).
                                Two display modes bound to the sub-disclosure clause:
                                  closed_book → pro-rated lines (fee spread across every line)
                                  open_book   → at-cost lines + the fee as its own line
                                The mode selector lives on the sub-disclosure clause, and this
                                component reads it. See RC-4.
  draws-editor.tsx              COPY draw-schedule-editor.tsx's arithmetic, do not import it.
                                Reuse by re-implementing in lib/document/design-build.ts:
                                  computeDrawGross()   ← computeDrawAmounts (project-commerce.ts:997)
                                  computeRetainage()   ← new
                                  validateDrawSet()    ← validateDrawSchedule (:1053)
                                Columns: Draw · % · Gross · Retainage held · Net paid, plus a
                                pinned, uneditable final row `Final · retainage release`.
                                Retainage % field, and a per-draw `retainage applies` toggle
                                defaulted OFF for the first (deposit) row.
  allowances-editor.tsx         label · amount · overage rule · underage rule; writes the
                                matching category='allowance' cost line in the same act.
  sub-disclosure-clause.tsx     open-book / closed-book radio, one per contract, plus the
                                identities table (from the project's Trade Agreements).
  supervision-clause.tsx        supervision fee (flat or %) — and the no-double-count guard
  lien-waiver-attachments.tsx   per-draw waiver strip (see 4.2)
  jurisdiction-attachments.tsx  reads agreement_jurisdiction_notices; renders enabled rows as
                                attachable leaves and disabled rows as a greyed, non-attachable
                                line reading "Held for counsel review". No enable control.
  sub-picker.tsx                studio_contacts picker for the Trade Agreement composer.
                                Modeled on roster/rolodex-picker.tsx's list section — COPY, do
                                not edit that file (it is not this lane's).
```

Plus `apps/designer-portal/src/components/document/commercial/trade-agreements/` — `trade-agreement-composer.tsx`, `trade-agreement-row.tsx`, `trade-agreement-status.tsx` — mounted in the **Money room**, in `authorizations-ledger.tsx`'s pattern (that file itself is *not* this lane's; mount the new ledger as a sibling section in a new file the lane owns, and add the single import line to the Money room's own section file only if the wave's file-ownership review approves it — otherwise ship the Trade Agreements strip inside the turnkey composer's right rail, which needs no shared-file edit and matches M6's "three sub cards, `studio only`").

**Which parts the template *requires*** (drives readiness, per R4 + P2): `pricing_basis`, `draws`, `sub_disclosure`, `supervision_fee`, `change_orders`, `termination`, `terms`. Optional and removable: `allowances`, both attachments. The licensing attestation is not a rail part — it is the gate.

**Analytics** go in `src/lib/analytics/document-events.ts` as a namespaced module, fired from the composer's container, never inline `posthog.capture` in a leaf.

### 4.2 Designer — the licensing gate (M7) and the flow through it

**Where it lives**: a new card in `account-studio-page.tsx`, inserted between the Billing card (ends ~`:919`) and the Members card (starts `:925`), as another `<div className="mb-6 border-t border-[var(--color-pearl)] pt-5">` block. **Do not restyle Billing.** Follow Billing's save pattern exactly: a `handleSaveAttestation` sibling to `handleSaveBilling` (`:324`), an `attestationDirty` predicate sibling to `billingDirty` (`:477-480`), and a save button `disabled={!attestationDirty || …isPending}` (`:879-882`). The card body lives in the lane's own `licensing-attestation-card.tsx`; `account-studio-page.tsx` gains the import, the state, the handler and the mount — four small edits, per the file's existing conventions.

**The gate flow, end to end:**

1. Studio has no attestation. In the W2 template picker, **Design-build turnkey** renders present but **disabled**, with one line beneath it: *"Add your licensing attestation in Account → Studio before using this template."* and a link. It is never hidden — a studio must be able to see the door before it can be told it is locked.
2. The link lands on the M7 sheet (620px), which reads, in this order:
   - eyebrow: `Before this studio can use the design-build template`
   - **Credential type** — a select over `LICENSE_CREDENTIAL_TYPES`: `WI Dwelling Contractor` · `MN Residential Building Contractor` · `CA CSLB` · `Other` (free text when Other)
   - **Number** · **State** (2-letter) · **Expiry** (date)
   - checkbox: *"I attest this credential is current and covers the work in this agreement."*
   - the standing disclaimer, verbatim, from `research/03-software-patterns-and-esign.md` §5:
     > "Patina helps you assemble and send agreements from parts you write and own. It is not a law firm and does not give legal advice — have an attorney review your templates before first use."
   - `Save attestation`
   - the annotation the mockup carries, as real UI microcopy: **"Patina stores this. Patina does not verify it."**
3. Save writes `studio_license_attestations` (admin/owner only — the card is read-only for a non-admin member, showing the attestation on file with no edit affordance).
4. The template becomes selectable **immediately** (the picker's disabled state is derived from the same `useStudioLicenseAttestation` hook, so the mutation's invalidation re-enables it).
5. **The gate holds at three depths**: the picker (UI), `materialize_agreement_template` (PART 8), and `send_commercial_document` (PART 11). Only the last two are load-bearing; the first is courtesy.
6. Expiry: an attestation whose `expires_on <= current_date` fails `studio_has_live_license_attestation`, so the template locks again and an in-flight draft **cannot be sent**. The composer surfaces this as a readiness blocker, not a silent failure.

**Wording discrepancy, resolved:** R10 and proposal §8/M7 both say "the 34-word disclaimer"; `research/03` §5 labels its own sentence "32 words". Counted, the sentence above is 34 words — the research lane's label is the error, not the sentence. **Ship the sentence verbatim and never render a word count in any UI** (§8's own instruction: "do not state a count"). Flagging this so no lane "fixes" the sentence to match a number.

### 4.3 Designer — the no-double-count rule as a validation

Enforced at the template level, not left to drafting (research 02 §9 item 6). Three layers, one message:

- **Composer**: the moment both a supervision fee and a sub markup are non-zero, the supervision clause and the pricing-basis markup field both go into an error state and readiness turns red.
- **`upsert_agreement_parts`**: refuses the save.
- **`send_commercial_document`**: refuses the send.

The exact copy, used identically in all three (the DB validator returns it, so the UI can render the DB's own sentence here — this is the one place that is safe, because the sentence is authored by us, not by Postgres):

> **Supervision is paid once.** You have a supervision fee *and* a markup on the trades. Bill supervision as its own line, fold it into overhead, or take it in the trade markup — one of the three, not two.

With a quiet secondary line: *"Studios that do both are, in effect, charging twice for the same oversight."*

### 4.4 Client — the door, the render, and the offer (P13, R15)

**Render.** `commercial-document-shell.tsx` gains a `design_build` branch (`:159-167`) mounting `DesignBuildBody`, which renders, in the designer's part order:

```
PRICING BASIS      basis sentence · Cost basis · Fee · GMP (or NTE / fixed sum)
SCHEDULE OF VALUES the table, in the disclosure mode the clause elected
DRAWS              Draw · % · Gross · Retainage held · Net paid, plus the final
                   retainage-release row, and — once executed — a status column
                   (Not yet billed · Sent · Paid) from the bundle's draw ledger
ALLOWANCES         label · amount · what happens if it runs over/under
WHO IS DOING THE WORK   identities, and awarded prices only under open-book (R13)
…clauses in order…
ATTACHMENT A/B     separate leaves below the paper, each with its own rule and an
                   "I received this" acknowledgment recorded in signature metadata (W2)
```

**The offer.** In `door-gate.tsx`'s `onSign()` (`:207-254`), the successful response now carries `depositOffer`. After the swing completes and the receipt inks (`:250-256`), render `<DepositOffer />` in the post-signature receipt region:

> **Your deposit is ready — $8,413.40**
> Draw 1 of 5 · due on signing. You can pay now, or your studio will send it.
> `[ Pay the deposit ]`   ← a plain link to `/pay/<payToken>`

Three rules the reviewer will check (RC-6):
1. It is rendered **after** `setSignedAt(...)` and **after** `onSigned?.()` — the signature is complete and visible before the money is mentioned.
2. `depositOffer === null` (the second call failed, or the agreement has no deposit draw) renders **nothing** — no error, no retry prompt, no "payment unavailable". The signature stands alone.
3. Nothing about the offer is in the sign button's disabled logic, the `ready` predicate (`:204-206`), or any preflight. Grep the diff for it.

**Consent.** W2's composer gains the design-build money parts, so the sentence assembles from what is actually present. The `signLabelFor` word is `Sign and accept` — a turnkey prime is countersigned, so the client's signature does not itself authorize work, and the summary line must say so.

### 4.5 Sub — the token page

`/trade/<64-hex>`, no login, no chrome, no index.

**The DTO `resolve_trade_agreement_link` returns — and its absences, which are the point:**

```jsonc
{
  "studioName":        "Middle West Studio",     // who they are working for
  "agreementTitle":    "Cabinetry & millwork",
  "contactDisplayName":"…",
  "scope":             "…prose…",
  "priceCents":        3800000,                  // THEIR price. Never the client's.
  "currency":          "USD",
  "schedule":          { "startOn": "…", "durationDays": 21, "sequencing": "…" },
  "retainageBps":      500,
  "payWhenPaidDays":   7,
  "insuranceCertificateRequired": true,
  "lienWaiverPolicy":  "conditional_then_unconditional",
  "state":             "sent" | "signed",
  "existingSignature": { "signedName": "…", "signedAt": "…" } | null
}
```

**Never present, at any state, for any reason:**
- the client's price, the GMP, the contract sum, the schedule of values, or any draw amount;
- any other sub's price, or a count of how many subs exist;
- the bid ledger (`trade_scope_bids`) in any form;
- the client's name, the household, or **the project name** — studios name projects after the people who live in them, so the project name hands the sub the client's surname under an innocent key (00424:576-600 says exactly this; the same reasoning applies verbatim here);
- the prime agreement, its parts, or its attachments;
- the flow-down clause (NULL this wave, R16).

**Page structure** (mobile-first, `max-w-lg`, the `/rfq/[token]` layout):

```
header      {studioName} · Trade Agreement
            {agreementTitle}
            {contactDisplayName}
terms       Scope (prose) · Price · Schedule · Retainage · Payment ·
            Insurance · Lien waivers  — each a labelled line, no table
signature   <TradeAgreementSignature />
              typed full name + "Your typed name acts as your electronic signature."
              a press-and-hold or explicit checkbox affirmation
              [ Sign this agreement ]
            already signed → the settled receipt: name, date, and nothing to press
```

**Outcomes the action must distinguish** (each its own sentence, none of them a raw DB message):
`saved` · `already_signed` (idempotent — show the existing receipt, never an error) · `agreement_void` ("This agreement was withdrawn. Your studio can send a new one.") · `invalid` ("This link is no longer active.").

---

## 5 · Tests

### SQL — `supabase/tests/commercial/design_build_test.sql` (new)

Plain `psql` with asserts, `ON_ERROR_STOP=1`, everything rolled back. Model the fixture-building on `supabase/tests/commercial/trade_scope_test.sql`.

| id | Assertion |
|---|---|
| SQL-T1 | The kind widening landed: `'design_build'` is accepted by both CHECKs, and a sixth junk value is still refused. Probe the constraint, not the ledger. |
| SQL-T2 | **Origin-agreement readers learn the kind.** Build an executed `design_build` project, then assert every widened `d.document_kind = 'design_services' AND commercial_state='executed'` reader now answers for it — call each affected RPC and assert a non-empty answer. This is the test that catches a missed occurrence in §3.3's high-risk group. |
| SQL-T3 | `billing_cadence = 'per_draw'` is accepted on `proposal_service_terms` **and** on `project_billing_authorities`, and a countersigned design-build agreement produces an authority row carrying it. |
| SQL-T4 | **The template is not selectable without an attestation.** `materialize_agreement_template(p, 'patina.design_build')` raises `check_violation` with no attestation row; raises with an attestation whose `expires_on = current_date - 1`; succeeds with `expires_on = current_date + 1` and flips `proposals.document_kind` to `'design_build'`. |
| SQL-T5 | **Draws sum to the contract sum.** Send refuses when Σ gross ≠ GMP by one cent; succeeds at exact equality. |
| SQL-T6 | **Retainage arithmetic, against research 02 §8 and `source/fixtures.json`.** Load the Halvorsen figures and assert to the cent: cost basis `7130000`; fee `1283400`; GMP `8413400`; SOV lines `4484000 / 1121000 / 849600 / 743400 / 472000 / 413000 / 330400` summing to `8413400`; draw gross `841340 / 2524020 / 3365360 / 1682680` summing to `8413400`; retainage held `0 / 126201 / 168268 / 84134`; cumulative `126201 / 294469 / 378603`; net `841340 / 2397819 / 3197092 / 1598546`; final release `378603`; **and the closing identity `841340+2397819+3197092+1598546+378603 = 8413400`**. Assert integer equality on cents — never a float comparison. |
| SQL-T7 | **Draw ordering.** `issue_agreement_draw_invoice` refuses draw 2 while draw 1 is unpaid; refuses the retainage release while any work draw is unpaid; refuses a re-issue over a live invoice; **allows** a re-issue after the invoice is voided. |
| SQL-T8 | **P13's state gate.** The deposit draw issues at `client_signed`; every other draw refuses at `client_signed` and succeeds at `executed`. |
| SQL-T9 | **Notices stay dark.** All six seeded rows are `enabled = false`; an `authenticated` non-super-admin SELECT returns zero rows; an UPDATE attempt is refused; `send_commercial_document` refuses an agreement attaching a disabled notice. |
| SQL-T10 | **No double count.** A part set with both a supervision fee and a sub markup is refused by `upsert_agreement_parts` and by `send_commercial_document`, with the same message. |
| SQL-T11 | **The fingerprint still covers everything the client reads.** Compute `_commercial_document_fingerprint` for a sent design-build agreement; mutate one draw amount inside the part payload out of band; recompute; assert the hash moved. (Proves W1's `parts` fold carries the new class — RC-8.) |
| SQL-T12 | **ACL.** `anon` holds EXECUTE on none of the wave's new functions; each new RPC's grantee tuple matches exactly one expected row (copy the `aclexplode` assertion at `00571_studio_invoices.sql:1050-1080`). |
| SQL-T13 | **The signature path end to end (D-W3-3).** Drive a real design-build client signature through `sign_design_services_agreement_with_trusted_ip` and assert: the RPC does not raise; a `commercial_document_signatures` row lands with `party_role='client'` and `metadata->>'via' = 'sign_design_services_agreement'`; `commercial_state='client_signed'`. Then countersign and assert the studio row lands. **Before the graft this test must fail at the guard, not at the RPC** — run it against the pre-graft schema once and record which of the three refusals fires first, so the fix is proven to be the fix. |
| SQL-T14 | **The retainer anchor.** Countersign a design-build agreement whose part set carries a non-zero `retainer` part. Assert the retainer invoice is issued and does **not** raise `'issue_invoice: invoice not found or access denied'` (the `v_anchor_count <> 1` path). Assert `v_anchor_count` resolves to exactly 1 — not 0 (unwidened) and not 2 (a branch widened so loosely that a draw line also matches the retainer branch). |
| SQL-T15 | **The origin motif, one assertion per function.** For an executed design-build project, call/trigger each of PART 7c's functions and assert it treats the project as having an origin: `_is_design_services_project` true; `classify_project_time_entry_authority` returns an hourly-billable classification; a furnishings authorization can be created from the schedule; a trade scope can be created; a budget checkpoint publishes; `get_client_project_threshold` returns `origin='commercial'`, not `'legacy'`; an FF&E purchase passes `guard_project_ffe_purchase_authority`. **Ten separate asserts, not one smoke call** — this is the group where a single missed graft hides. |

### SQL — `supabase/tests/commercial/trade_agreement_test.sql` (new)

| id | Assertion |
|---|---|
| SQL-A1 | **Token sign flow, happy path.** create → send → mint (as `service_role`) → resolve (DTO shape exact) → sign → `state='signed'`, one `sub` signature row, token `status='revoked'` in the same transaction. |
| SQL-A2 | **Replay is idempotent, not an error.** Signing the same token twice returns `already_signed` with the original `signed_at`; no second signature row; the fingerprint is unchanged. |
| SQL-A3 | **Dead links are indistinguishable.** `resolve_trade_agreement_link` returns NULL for: garbage, a valid-format-but-unknown hash, a revoked token, an expired token, a token on a `draft` agreement, a token on a `void` agreement. Six NULLs, no error, no leak. |
| SQL-A4 | **RLS: a sub token reads only its agreement.** Mint tokens for two agreements on the same project. Resolving token A returns agreement A's fields and nothing of B — assert on the returned JSON keys and on `priceCents`. Then assert `anon` and a foreign `authenticated` user can SELECT **zero rows** from all three tables directly. |
| SQL-A5 | **The sub cannot see the bid ledger or the client's money.** Assert the resolve DTO's key set equals the frozen list in §4.5 exactly (`SELECT jsonb_object_keys(...) EXCEPT ...` both ways, so an added key fails). Assert none of `clientPriceCents`, `gmp`, `scheduleOfValues`, `projectName`, `bids` appears at any nesting depth (`jsonb_path_query` over `$..*`). |
| SQL-A6 | **Signature immutability.** UPDATE and DELETE on `studio_trade_agreement_signatures` both raise. |
| SQL-A7 | **Content freeze at send.** An UPDATE of `scope`/`price_cents` on a `sent` agreement raises; on a `draft` one succeeds. |
| SQL-A8 | **`void` refuses on a signed agreement**; succeeds on a sent one and revokes its tokens. |
| SQL-A9 | **The prime's signature table is untouched.** Assert `commercial_document_signatures`' `party_role` CHECK and its `UNIQUE (proposal_id, party_role)` are byte-identical to their pre-wave definitions (`pg_get_constraintdef`). |
| SQL-A10 | **A resend of a `sent` agreement survives its own freeze** (added 2026-09-07, edge round-2 F16). Send an agreement, then call `send_trade_agreement` on it a **second** time. Assert: the second call does **not** raise — in particular not `check_violation` from `guard_trade_agreement_authored`, which is the failure a whole-row guard produces and which reaches the studio as a permanent `502 commit_failed`; `state` is still `'sent'`; `sent_at` is **unchanged** from the first send (the RPC's `COALESCE(sent_at, now())`, so the instrument keeps the date the sub was first asked); the returned jsonb carries the camelCase keys `state` and `sentAt`. Then assert the freeze itself is intact on the same row: a direct UPDATE of `scope` or `price_cents` still raises. Finally mint a second token and assert the first is `status='revoked'` — one live link, per §3.2. |

### Deno

| id | File | Assertion |
|---|---|---|
| DENO-1 | `commercial-document-notify/policy.test.ts` | `documentKindCanNotify('design_build', 'client_signed'\|'executed'\|'budget_published')` is true; `('design_build','deposit_ready')` is **false**; `('design_build','agreement_draw_ready')` is true; `('trade_scope','agreement_draw_ready')` is false; `('design_services','agreement_draw_ready')` is false. |
| DENO-2 | `commercial-document-notify/policy.test.ts` | `assessCommercialTransition` for `agreement_draw_ready` allows only with `commercialState='executed'` + bound design-build document + an issued invoice on the named draw; each missing piece produces `transition_not_committed`. |
| DENO-3 | `proposal-send/handler.test.ts` | A `design_build` dispatch renders subject `… sent you a design-build agreement: "…"`, eyebrow `Design-build`, heading `Your design-build agreement is ready`, CTA `Review agreement`; and the four existing kinds' rendered output is **unchanged** (snapshot the other four before touching the ternaries). |
| DENO-4 | `trade-agreement-send/index.test.ts` | Full DI harness on `lib.ts`, copying `trade-rfq-send/index.test.ts` (502 lines): body parsing errors (`invalid_body`, `agreementId_required`, `invalid_mode`, `invalid_recipient`); a non-comember gets the **same 404** as a missing row; no contact email → `422 no_recipient`; `preview` composes without minting or stamping; `send` mints exactly once, emails through the injected chokepoint, and stamps `sent_at` on first send only; a resend of a `signed` agreement never downgrades `state`. |
| DENO-5 | `_shared/trade-agreement-emails.test.ts` | The rendered email contains the sub's price and the `/trade/<token>` link, and contains **none** of: the client's name, the project name, the GMP, or any other party's number. Assert by absence, on the rendered HTML string. |

Run with `deno test --allow-all --config supabase/functions/deno.json <path>`. If a `deno.lock` appears at the repo root, delete it.

### Jest / e2e touchpoints

| id | Where | What |
|---|---|---|
| J-1 | `apps/client-portal/src/components/threshold/__tests__/consent-copy.test.ts` | The drift guard learns the design-build branch; it reads `sign/route.ts` off disk, so route and copy must move together. Add: every `CommercialDocumentKind` has a `consentLineFor` that is not the fallback sentence (this is the assertion that would have caught a silently-swallowed new kind). |
| J-2 | `apps/client-portal/src/components/threshold/__tests__/deposit-offer.test.tsx` (new) | Offer renders with a `depositOffer`; renders **nothing** with `null`; the href is exactly `/pay/<token>`; the component takes no part in any disabled state. |
| J-3 | `apps/client-portal/src/components/__tests__/commercial-document-shell-design-build.test.tsx` (new) | The body renders draws/SOV/allowances in part order; **closed-book renders pro-rated SOV lines and no per-sub price**; open-book renders awarded prices; neither renders a bid. |
| J-4 | `apps/client-portal/src/app/trade/[token]/__tests__/page.test.tsx` (new) | Copy `rfq/[token]/__tests__/page.test.tsx`'s DTO-carried-extra-fields assertion: hand the page a DTO with `clientPriceCents` and `projectName` bolted on and assert neither string reaches the DOM. |
| J-5 | `apps/designer-portal/src/**/__tests__/design-build-arithmetic.test.ts` (new) | The Halvorsen fixture through `lib/document/design-build.ts` — same cent-for-cent table as SQL-T6, so the DB and the browser cannot drift. Import the numbers from `source/fixtures.json`'s figures rather than retyping them. |
| J-6 | `apps/designer-portal/src/**/__tests__/no-double-count.test.tsx` (new) | The validation fires, the copy matches §4.3 verbatim, readiness goes red. |
| J-7 | **Flag-off byte-identity** (the W1 gate, re-run) | With `design-build:false`, the Contract Room and the client body snapshots are unchanged from main. A design-build kind cannot be created, so nothing else can change. |
| E2E-1 | `apps/designer-portal/e2e/document/design-build.spec.ts` (new) | Attestation → compose → send. Chromium-pinned (`test.skip(({browserName}) => browserName !== 'chromium', …)`) — it mutates one seeded studio's attestation row and the three browser projects would race it. Waits via `WaitHelpers` or web-first `expect`, never `page.waitForTimeout`; DB assertions via `expect.poll` through `e2e/helpers/supabase-admin.ts`, never a post-`networkidle` read. |
| E2E-2 | `apps/client-portal/tests/design-build-door.spec.ts` (new) | Sign → the offer appears → the offer is not required. Chromium-only (that config has one project). |
| E2E-3 | `apps/client-portal/tests/trade-agreement-link.spec.ts` (new) | Copy `tests/field-link.spec.ts` / `pay-link.spec.ts`. A fresh `BrowserContext` for the sub — never the primary auth fixture's cookies. Asserts the dead-link 404 and the signed receipt. |

---

## 6 · Gates

Run per `patina-verification`; nothing merges until all of these are green **on a clean checkout**.

**Backend**
```bash
pnpm supabase:reset                                   # full replay + the 15 seeded SQL files
python3 scripts/generate-legacy-grants.py             # AFTER any GRANT/REVOKE; never hand-edit the seed
pnpm supabase:reset                                   # again, to prove the regenerated seed applies
pnpm db:generate && git diff --exit-code packages/supabase/src/database.types.ts   # expect: no output
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/commercial/design_build_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/commercial/trade_agreement_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/commercial/trade_scope_test.sql        # regression
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/commercial/design_services_authority_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/commercial/multi_studio_signature_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/billing/studio_invoice_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/billing/invoice_links_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/edge_api/public_sd_hardening_contract_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/edge_api/platform_acl_compatibility_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/edge_api/public_rpc_authorization_contract_test.sql
```

**Edge**
```bash
deno test --allow-all --config supabase/functions/deno.json supabase/functions/trade-agreement-send/
deno test --allow-all --config supabase/functions/deno.json supabase/functions/commercial-document-notify/
deno test --allow-all --config supabase/functions/deno.json supabase/functions/proposal-send/
deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/trade-agreement-emails.test.ts
git status --porcelain deno.lock     # must be empty; delete a root deno.lock if one appeared
```

**Designer (types are the gate here, not the build — `next.config.js` sets `ignoreBuildErrors: true`)**
```bash
pnpm turbo build --filter=@patina/types          # dist-resolved: skip this and the portals serve stale types
pnpm --filter @patina/supabase type-check
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/designer-portal test       # FULL jest on a clean checkout — the memory lesson
pnpm --filter @patina/designer-portal lint       # the one working ESLint config in the repo
pnpm --filter @patina/admin-portal build         # the repo's strictest gate; catches shared-package type breaks
```

**Client + sub**
```bash
pnpm --filter @patina/client-portal type-check
pnpm --filter @patina/client-portal test         # jest only — NO coverage table
pnpm --filter @patina/client-portal test:coverage  # R46: THIS is the gate that
                                                   # enforces 70/60/70/70; the
                                                   # floor lives in jest.config.js
                                                   # and applies only under --coverage
pnpm --filter @patina/client-portal test:e2e -- tests/design-build-door.spec.ts --workers=1
pnpm --filter @patina/client-portal test:e2e -- tests/trade-agreement-link.spec.ts --workers=1
pnpm --filter @patina/designer-portal test:e2e -- e2e/document/design-build.spec.ts
```

**Docs**
- Append one `### R<N>` entry to `docs/design/the-document/DECISIONS.md` (append-only; head is `R137` today, W1/W2 will have consumed numbers — take the next free one) recording R10, R11, R13, R15, R16 as ruled, and recording the two structural decisions D-W3-1 and D-W3-2.

**Not a gate, and must not be treated as one**: any root `pnpm test` / `pnpm type-check` sweep (turbo silently skips workspaces without the script), any lint result outside designer-portal, any CI badge, any migrations-ledger row, and `/api/version`.

---

## 7 · Review criteria (adversarial; a separate context, never the implementer)

Report **every** finding with confidence and severity — no severity filter.

| id | What to prove |
|---|---|
| **RC-1 · Token replay** | Sign the same token twice: does the second call raise, create a second signature row, or move `signed_at`? It must do none of those — it returns the original receipt. Then: is the token revoked in the **same transaction** as the signature, or in a follow-up statement that a crash could skip? Is `token_hash` the only stored form (no raw token column, no raw token in a log line, no raw token in the email's stored copy)? Does a revoked token resolve to NULL rather than a "this link was used" page? |
| **RC-2 · Guest surface leakage** | Diff the `resolve_trade_agreement_link` DTO against §4.5's frozen list. Any extra key is a finding. Then check the page: does it render anything not in the DTO? Does `middleware.ts` set `Cache-Control: private, no-store` and `X-Robots-Tag: noindex, nofollow` for `/trade/`? Is `robots`/`referrer` set in the page metadata? Would a Next.js error boundary leak a DB message? |
| **RC-3 · Signature evidence** | Is `evidence_fingerprint` computed **inside** the signing transaction, over the agreement as it stands at that instant — not over a snapshot passed in by the caller? Does it cover all eight essentials (scope, price, schedule, retainage, pay-when-paid, insurance, lien waivers, and the flow-down key even though it is NULL)? Is the signature row genuinely append-only at both the policy and trigger level? Does a content UPDATE after `sent` raise? |
| **RC-4 · The sub cannot see the bid ledger** | Trace every path from a sub's token to `trade_scope_bids`, `studio_trade_agreements` other than their own, `proposal_agreement_parts`, `agreement_draw_invoices`, and the prime's price. There must be no path — no RLS policy, no join in a definer RPC, no key in a DTO. Separately, on the **client's** side: under `closed_book`, does the SOV render pro-rated so a sub's bid cannot be backed out of `line ÷ (1 + fee)`? Under `open_book`, are the disclosed numbers the *awarded* prices only, never the losing bids? |
| **RC-5 · `per_draw` reaches authority** | Countersign a design-build agreement and SELECT the `project_billing_authorities` row. Is `billing_cadence = 'per_draw'`? Is exactly one active authority per project (the partial unique index at 00412:161-163 still holds)? Is `billing_ceiling_cents` NULL and is every downstream reader NULL-safe (00414:911-913 treats NULL as uncapped — confirm, don't assume)? Is the `project_commercial_documents` row's `document_kind` `'design_build'` and `is_origin = true`? |
| **RC-6 · Stripe offer never blocks the signature** | Read `door-gate.tsx`'s diff. Is any part of the offer inside `ready`, the button's `disabled`, or a preflight? Then force the failure: make `issue_agreement_draw_invoice` raise, sign, and confirm the signature lands, the receipt inks, and no error is shown. Then confirm the sign route's `design_build` arm does the deposit call **after** the signature RPC returned, in a separate call, with its own try/catch. Confirm no `create-checkout-session` call, no Stripe key, and no `stripe-webhook` change entered the wave. |
| **RC-7 · Billing before countersignature** | The deposit draw is billable at `client_signed`, before the studio countersigns (§3.1 PART 10 step 3). Argue the other side: is it defensible that the client is asked for money before the agreement is fully executed? Is the door's copy honest that the studio has not yet signed? If the reviewer thinks this should move to `executed`-only, say so with the consequence (P13 stops being "one step"). |
| **RC-8 · The fingerprint still covers what the client reads** | Research 04 constraint 1 and rigidity #12: a client-read payload outside the hash produces signatures attesting to less than the document shows. Confirm every design-build thing the client can read lives either in `proposal_agreement_parts` (inside W1's fold) or is post-execution machine state (invoice status, waiver receipt) that is legitimately outside it. Any authored content in `agreement_draw_invoices` is a finding. |
| **RC-9 · Grafts did not revert W1/W2** | For **every** function redefined in migration 1 — the banner lists them — diff the shipped body against the branch-time head and confirm the **only** differences are this wave's delta. Name the head file each was grafted from. A body matching 00422/00566/00511 rather than the W1/W2 head is a revert. Then check the inverse: every function in PART 7b/7c's tables actually appears in the migration. A head-resolved function listed and not grafted is the same defect as a graft from the wrong body. |
| **RC-13 · Fail-open vs fail-closed** | Walk the diff for double-negative kind tests (`kind !== X && kind !== Y`). Each one silently admits `design_build` — for each, decide whether that is the intended behavior and say so. Specifically: the sign route's `isClientSignedServicesRetry` (`:102-105`) and `commercial-document-shell.tsx:632`. Then confirm the sign route's `design_build` branch is reached — assert on **which RPC ran**, from the DB (`commercial_document_signatures.metadata->>'via'` plus the presence of a deposit draw), never from the HTTP 200. |
| **RC-14 · The pins are honest** | Every function this wave redefined that appears in `public_sd_hardening_contract_test.sql`'s pin list must have a **recomputed** hash, not a deleted assertion. Grep the diff for removed `ASSERT` blocks in that file; a pin that vanished rather than moved is a finding. |
| **RC-10 · The gate cannot be walked around** | With no attestation: can a `design_build` proposal be created by any route — the picker, a direct `materialize_agreement_template` call, a hand-written `upsert_agreement_parts`, a direct table UPDATE of `proposals.document_kind` under RLS? Then: expire the attestation mid-draft and confirm the send refuses. |
| **RC-11 · Notices and flow-down are actually dark** | Are all six notice rows `enabled = false` after a reset? Does an `authenticated` non-super-admin SELECT return zero rows? Is there any UI path — including an admin portal, a debug route, or a hook — that can flip one? Is `flow_down_clause_key` NULL everywhere and unreachable from the composer? |
| **RC-12 · Arithmetic** | Recompute the Halvorsen table independently from `source/fixtures.json` and compare to the DB, the designer's browser, and the client's door. Any float, any `toFixed`, any rounding that is not "last row takes the remainder" is a finding. Confirm retainage is **withheld, not billed** (the invoice is `net_cents`, not `gross_cents`) and that the release draw sums the withheld amounts exactly. |

---

## 8 · Walk script — the Halvorsen kitchen and mudroom (16 steps)

Run signed in, in a real browser, against a seeded local stack first and then production after the flag is live. Record cents at every money step and compare to `source/fixtures.json`.

| # | Act | What must be true |
|---|---|---|
| 1 | Sign in as the studio owner of **Middle West Studio**. Open the Contract Room and start a new agreement. Open the template picker. | **Design-build turnkey** is listed, **disabled**, with the one-line reason and a link to Account → Studio. Nothing about the flag is visible. |
| 2 | Follow the link. Account → Studio shows the new **Licensing** card between Billing and Members. Read it. | Billing is visually unchanged. The M7 fields are present in order. The 34-word disclaimer reads verbatim. The annotation says Patina stores and does not verify. No word count appears anywhere. |
| 3 | Save the attestation: `WI Dwelling Contractor` · number `1234567` · `WI` · expiry `2027-03-31`, affirmation ticked. | Saves. Re-render shows it on file. As a non-admin member (second browser profile), the card is read-only with no edit affordance. |
| 4 | Back to the picker. Select **Design-build turnkey**. | Now enabled. Materializing flips the proposal to `document_kind='design_build'` (verify by SELECT, not by the UI) and lays out **ten** parts in the rail, in M6's order. |
| 5 | Pricing basis: **Cost-plus with GMP**, fee **18%**. Enter the seven cost lines: Cabinetry & millwork `$38,000` · Electrical `$9,500` · Plumbing `$7,200` · General conditions / site `$6,300` · Tile allowance `$4,000` · Plumbing fixtures allowance `$3,500` · Lighting allowance `$2,800`. | Header chips read `Cost basis $71,300` · `Fee 18% · $12,834` · `GMP $84,134`. The SOV table computes `$44,840 / $11,210 / $8,496 / $7,434 / $4,720 / $4,130 / $3,304`, total **$84,134**. |
| 6 | Draws: `Deposit at signing 10%` (retainage off) · `Rough-in 30%` · `Cabinets set 40%` · `Substantial completion 20%`. Retainage **5%**. | The table reproduces M6 to the cent, including the pinned `Final · retainage release ($3,786.03)` row and cumulative retainage `$1,262.01 → $2,944.69 → $3,786.03`. Net column `$8,413.40 / $23,978.19 / $31,970.92 / $15,985.46`. |
| 7 | Allowances: tile `$4,000`, plumbing fixtures `$3,500`, lighting `$2,800`; overage rule = change order. | Each allowance's SOV line already exists from step 5 and is not duplicated. |
| 8 | Sub disclosure: **closed-book**. Supervision clause: set a supervision fee **and** a 15% sub markup. | The no-double-count validation fires with §4.3's copy on both fields; readiness turns red; the send button is unavailable. Clear the markup → green. |
| 9 | Open the attachments strip. | **Attachment A · Notice of cancellation (Wisconsin)** is listed, greyed, non-attachable, reading "Held for counsel review". **Attachment B · Lien waiver form** is attachable. Attach B. |
| 10 | Send. | Refuses if anything in step 8 is unresolved. On success the parts freeze; the client email subject reads *"… sent you a design-build agreement: …"* with eyebrow **Design-build**; `agreement_draw_invoices` now holds five rows (four draws + the release). |
| 11 | As the client, open the door and read the whole paper. | Parts render in the designer's order. The SOV renders **pro-rated** (closed-book). Sub identities appear; no sub prices, no bids. Attachment B is a separate leaf with an "I received this" line. |
| 12 | Tick the acknowledgment, type the client's name, sign. | The consent sentence names the pricing basis, the schedule of values, the draws, retainage and the countersignature condition — **not** the generic "I agree to the scope and investment in this proposal" fallback, which is what a missed `consent-copy.ts` branch looks like. The receipt inks. Then SELECT: `commercial_state='client_signed'`, one `commercial_document_signatures` row with `party_role='client'` and `metadata->>'via' = 'sign_design_services_agreement'`. **Assert which RPC ran, not that the request returned 200** — the sign route's fail-open misroute (§3.3) produces an identical 200. |
| 13 | Read the post-signature region. | **"Your deposit is ready — $8,413.40 · Draw 1 of 5 · due on signing"** with a `Pay the deposit` link to `/pay/<token>`. Ignore it, reload the door: the signature still stands, the offer is still there, nothing is blocked. Then check: `invoices` has one row, `total_cents = 841340`, `title` = the draw label, `studio_id` stamped. |
| 14 | Follow the offer. Pay with the Stripe test card on `/pay/<token>`. | Card/ACH chooser renders. Payment settles. The invoice reaches `paid`. `apply_invoice_payment_effects` produced the rollup and a design_fee earning — verify by SELECT, not by the UI. |
| 15 | As the studio, countersign. | `project_commercial_documents` has one row, `document_kind='design_build'`, `is_origin=true`. `project_billing_authorities` has exactly one active row with `billing_cadence='per_draw'` and a NULL ceiling. The engagement-start phase anchored to today. Then issue **Rough-in**: an invoice for **$23,978.19** (net, not $25,240.20 — retainage is withheld), and `agreement_draw_ready` notifies the client. |
| 16 | Money room → Trade Agreements → **New**. Pick **Cabinetry & millwork** from the studio rolodex; scope, price `$38,000`, start date, duration 21 days, retainage 5%, pay-when-paid 7 days, insurance required, lien waivers conditional-then-unconditional. Send. Open the emailed `/trade/<token>` link **in a clean browser profile with no Patina session**. Sign as the sub. Then, back in the studio, record a **conditional progress lien waiver** from Cabinetry against **draw 2 (Rough-in)**. | The sub's page loads with no login, shows *their* price and nothing else — **no client name, no project name, no GMP, no schedule of values, no other sub, no bid**. Signing returns a receipt; the link is now SPENT (R46, corrected from round 3: `sign_trade_agreement_by_token` revokes the token in the signing transaction and `resolve_trade_agreement_link` requires `status = 'active'`, so a fresh load of the same URL is the not-found page — never a second signable form. A RE-SENT link is what shows the settled receipt). Back in the studio, draw 2 shows the waiver attached, and the client's door now shows draw 2 as billed with its waiver received. Finally: confirm `commercial_document_signatures` for the prime still holds exactly two rows, client and studio. |

---

## 9 · Deploy set

Prod mutations require an explicit in-session ship request. The chain is strictly ordered; nothing skips a step.

**1 · Migrations (Strata)**
```bash
supabase db push          # linked to bkvcixdmuyejfzcijpdg
```
Both files, in number order. Then **probe the objects, not the ledger**: `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='proposals_document_kind_check'` shows six values; `to_regprocedure('public.issue_agreement_draw_invoice(uuid,text)')` is non-NULL; `SELECT count(*) FROM agreement_jurisdiction_notices WHERE enabled` is `0`.
⚠ Strata has migrations deliberately pending from earlier programs (memory: 00555/00557 and the First Flight set were held). **Never a plain `db push` without first reconciling `supabase migration list` against the local tree** and confirming with Kody which pending numbers are intended to go.

**2 · Edge functions (Strata)** — three, each by name:
```bash
supabase functions deploy proposal-send
supabase functions deploy commercial-document-notify
supabase functions deploy trade-agreement-send
```
No `--no-verify-jwt` on any of them: every function in this wave is `verify_jwt = true` (`trade-agreement-send` follows `[functions.trade-rfq-send]`). **The `stripe-webhook` `--no-verify-jwt` rule does not apply — this wave does not touch `stripe-webhook`.** If a lane ever does, its deploy is `supabase functions deploy stripe-webhook --no-verify-jwt`, and the `whsec_` in use must be the dashboard-endpoint signing secret, never `stripe listen`'s.

**`_shared` fan-out**: this wave adds `_shared/trade-agreement-emails.ts` (new, one importer) and **edits no existing `_shared` file**, so the redeploy set is exactly the three functions above. If review finds that any of `_shared/send-email.ts`, `_shared/studio-identity.ts` or `_shared/trade-rfq-emails.ts` was modified, **stop**: `send-email.ts` alone has 20 importing functions and every one must be redeployed —
```bash
cd /Users/kody/Code/patina-merged/supabase/functions && grep -rl "_shared/send-email" . | sort
```

**3 · Services** — none. No NestJS service changes in this wave.

**4 · Portals** — from the **main checkout**, never a worktree, never a raw `opennextjs-cloudflare build`:
```bash
./infra/deploy-portal.sh designer
./infra/deploy-portal.sh client
```
`admin` is not deployed (no admin surface this wave) but **is** built locally as a gate. The script rebuilds workspace-package dists first — this matters here because `@patina/types` changed and is dist-resolved.

**5 · Verify**
```bash
npx wrangler deployments list      # oldest-first: read the BOTTOM row
```
Then behavior probes, not version strings (`/version` returns static defaults on the live path):
- grep the served designer chunk for a string unique to the turnkey composer;
- load `/trade/<a-known-bad-64-hex>` on client.patina.cloud → 404, with `X-Robots-Tag: noindex, nofollow` and `Cache-Control: private, no-store` on the response;
- with the flag off, load the Contract Room and confirm it is byte-identical to before.

**6 · Flag** — `design-build` is created by **Kody** in PostHog. Verify it against `/flags` **with a real-browser UA before enabling** (the `threshold` flag matched everyone on 2026-09-04 because this step was skipped). The instant fail-closed lever is `NEXT_PUBLIC_FLAG_OVERRIDES=design-build:false`. **The feature is dark until Kody creates and widens the flag** — say so in the ship report rather than claiming the feature is live.

**Owed to Kody after the ship** (put these in the wave's closing report, do not silently assume them done): create the `design-build` PostHog flag; a signed-in two-studio production walk of steps 1–16; a real sub signing a real Trade Agreement from a real email on a phone; and counsel's review of the six jurisdiction notices and the flow-down clause before either is enabled.
