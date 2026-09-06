# Guest-link surfaces, anon grants, Stripe, email links, design tokens (2026-09-06)

# 1. Public, account-less token-in-URL pages

All live in **apps/client-portal** (Next 15 App Router, deployed to Cloudflare Workers via OpenNext). One uniform pattern.

## The shared shape (every one of them)

- Route: `apps/client-portal/src/app/<surface>/[token]/page.tsx`
- `export const dynamic = 'force-dynamic'` (token resolution bumps view stats; never static)
- Cheap **regex format gate** before any DB round-trip (no existence signal)
- `createServiceClient()` from `@patina/supabase/server` — **service_role key, server-side only**, defined at `packages/supabase/src/server.ts:54-67` (`persistSession:false, autoRefreshToken:false`, throws if `SUPABASE_SERVICE_ROLE_KEY` unset)
- A **single SECURITY DEFINER RPC** taking `p_token TEXT` — the *only* guest read path. Returns empty/NULL on invalid **or** revoked **or** expired, indistinguishably
- `notFound()` or a calm "dead link" component; never leaks whether a link existed
- Middleware allowlist entry (see below)
- `metadata: { robots: { index:false, follow:false }, referrer:'no-referrer' }` on the newer ones

## Inventory

| Surface | Route file | Resolver RPC | Migration |
|---|---|---|---|
| Proposal share (+ mood-board/board share) | `apps/client-portal/src/app/share/[token]/page.tsx` (243 ln) | `resolve_board_share(p_token)` tried first, then `resolve_document_share(p_token)` | `00266_document_shares.sql`, `00406_mood_board_storage_and_shares.sql`, `00548_project_board_share_links.sql`, `00549_guest_board_share_reactions.sql` |
| Field/contractor | `apps/client-portal/src/app/field/[token]/page.tsx` (108 ln) | `resolve_field_link(p_token)`; site-request tokens fall through to the `site-request-guest` edge fn | `00283_field_links.sql`, `00374_field_site_request_loop.sql` |
| Trade RFQ | `apps/client-portal/src/app/rfq/[token]/page.tsx` (118 ln) | `resolve_trade_rfq_link(p_token)`; writes via `submit_trade_rfq_response` in `./actions.ts` | `00424_trade_rfq_rail.sql` |
| Evidence upload | `apps/client-portal/src/app/evidence/[token]/page.tsx` (80 ln) | `fulfillment_evidence_token_context(p_token)`; uploads POST to `fulfillment-evidence` edge fn with the **anon key** | `00364_fulfillment_exceptions.sql` |
| Plan transmittal | `apps/client-portal/src/app/plans/[token]/page.tsx` (155 ln) + `./plan-transmittal.ts` | `resolve_plan_transmittal(p_token)` | `00429_plan_room_foundation.sql:1908-1911` |
| Spec book | `apps/client-portal/src/app/field/spec-book/[token]/page.tsx` + `./spec-book-share.ts` | `resolve_spec_book_share(p_token)` | `00380_spec_books_foundation.sql:1902, 2010` |
| Client invite | `apps/client-portal/src/app/auth/invite/[token]/page.tsx` | direct table read via `createAdminClient()` (older pattern) | — |
| `/piece/[id]` | public product page | **anon RLS policy** `products_catalog_select_anon` (`00152:298`) — the one non-RPC anon read path | `00152` |

## Token format / expiry / revocation

- **Mint:** `encode(extensions.gen_random_bytes(32), 'hex')` → 64 lowercase hex chars. Raw token returned **exactly once**; only `encode(digest(token,'sha256'),'hex')` is persisted in a `token_hash TEXT NOT NULL UNIQUE` column. Hashing never happens in JS — see the note at `packages/utils/src/document-share.ts:1-10`.
- **Format gate:** `SHARE_TOKEN_PATTERN = /^[0-9a-f]{64}$/` — `packages/utils/src/document-share.ts:13-22`, plus `shareLinkPath()` / absolute-URL helper at `:24-30`. Local twins: `apps/client-portal/src/app/field/[token]/types.ts:13`, `apps/client-portal/src/app/rfq/[token]/types.ts:15`, `apps/client-portal/src/app/evidence/[token]/page.tsx:31`. Site Request uses a namespaced base64url form (`sr_*`) — `apps/client-portal/src/app/field/[token]/site-request-types.ts:95`.
- **Expiry:** `document_shares.expires_at TIMESTAMPTZ` nullable (no default). `field_link_tokens.expires_at NOT NULL DEFAULT now() + interval '90 days'` (`00283:33`). `plan_transmittal_tokens.expires_at NOT NULL DEFAULT now() + interval '90 days'` (`00429:313`, with `CHECK (token_hash ~ '^[0-9a-f]{64}$')` at `:310`).
- **Revocation:** `status TEXT DEFAULT 'active' CHECK (status IN ('active','revoked'))` + `revoke_document_share(p_share_id)` / `revoke_field_link()`. "Regenerate" in the UI = revoke + create.
- **Stats:** `view_count`, `last_viewed_at` (shares) / `last_used_at` (field links) bumped inside the resolver.
- **Resolver miss policy:** `RETURN;` (empty set) — comment at `00266:203-206`: *"invalid / revoked / expired → dead link (no leak)"*.

## Middleware exemption

`apps/client-portal/src/middleware.ts:95-165` — the `isPublicPage` allowlist: `isInviteLanding || isQuizPage || isSharePage || isFieldPage || isRfqPage || isEvidencePage || isPlansPage || isPiecePage || isUnsubscribeOutcomePage`. `/plans/*` additionally sets `Cache-Control: private, no-store, max-age=0` and `X-Robots-Tag: noindex, nofollow` (`:140-144`) — the only surface that does.

## Rate limiting — status

**Nothing exists.** No Cloudflare `ratelimit` binding in any `wrangler.jsonc`, no rate-limit code in `apps/client-portal/src/middleware.ts` or `open-next.config.ts`, no `RATE_LIMIT` env anywhere in the portal. The only in-repo mentions are `docs/specs/_active/patina-user-management-spec.md:124` (aspirational) and the email-send policy limiter inside `supabase/functions/_shared/send-email.ts`.

---

# 2. Migration patterns for anon-accessible RPCs

## The rule

From `.agents/skills/patina-db-migrations/SKILL.md:62` and `docs/design/field-companion/field-companion-plan.md:32` (constraint C7):

> Prod default privileges auto-grant `anon` EXECUTE on new `public.` functions. `REVOKE ... FROM PUBLIC` alone is insufficient — every revoke must read `FROM PUBLIC, anon`. "This has bitten twice."

Canonical idiom to copy: `supabase/migrations/00437_ffe_service_boundaries.sql:516-529` —
`REVOKE ALL ON FUNCTION public.f(args) FROM PUBLIC, anon, authenticated, service_role;` then `GRANT EXECUTE ... TO <exactly the role>`.

Enforced by a gate: `supabase/tests/edge_api/public_acl_exception_registry.sql` and `public_rpc_authorization_contract_test.sql`.

Also: Supabase flipped platform defaults 2026-05-30 so **fresh local stacks** no longer auto-grant, and replayed REVOKEs become creation-order no-ops → local ACLs are reconstructed by the generated seed `supabase/seed/00-legacy-grants.sql` (regenerate with `python3 scripts/generate-legacy-grants.py`). See `docs/design/the-document/DECISIONS.md:2931`.

## The only three `TO anon` grants in the whole migration tree

1. **`supabase/migrations/00548_project_board_share_links.sql:157-167`** — the reference example.
   ```sql
   REVOKE ALL ON FUNCTION public.resolve_board_share(text) FROM PUBLIC, anon;
   GRANT EXECUTE ON FUNCTION public.resolve_board_share(text) TO authenticated, service_role;
   -- Share links work unauthenticated (2026-08-12 ruling); the function fails
   -- closed on a bad, expired, revoked, or tampered token.
   GRANT EXECUTE ON FUNCTION public.resolve_board_share(text) TO anon;
   ```
2. **`supabase/migrations/00549_guest_board_share_reactions.sql:910-917`** — same shape for a **write**: `submit_board_share_reaction(text, uuid, text, text)` granted `TO anon` after `REVOKE ALL ... FROM PUBLIC`.
3. **`supabase/migrations/00557_increment_scan_upload_attempt.sql:135`** — `GRANT EXECUTE ... TO anon, authenticated;`

## Representative explicit REVOKE-from-anon examples

- `supabase/migrations/00266_document_shares.sql:255-261` — all three functions revoked `FROM PUBLIC, anon`, then `resolve_document_share` granted only `TO authenticated`, with the comment: *"resolve is called ONLY by the guest route's service client. No anon grant — least privilege: nothing anonymous calls PostgREST directly today, and the grant would open a direct token-probe endpoint for no caller."*
- `supabase/migrations/00283_field_links.sql:311-316` — identical posture for `create_/revoke_/resolve_field_link`.
- `supabase/migrations/00429_plan_room_foundation.sql:1908-1911` — `REVOKE ALL ... FROM PUBLIC, anon, authenticated, service_role;` then `GRANT ... TO authenticated, service_role;` (the strictest form).
- `supabase/migrations/00556_admin_studio_management.sql:245, 273` — even `service_role` revoked for internal helpers.

Known debt flagged in the skill: 00255's feedback RPCs grant to `authenticated` but never revoke from PUBLIC/anon — *"don't copy that shape."*

---

# 3. Stripe

## Checkout session creation

Single entry point: **`supabase/functions/create-checkout-session/index.ts`** (1455 ln), with a Stripe-free state machine at `supabase/functions/create-checkout-session/invoice-checkout-core.ts` (287 ln) and direct-order extras at `./direct-order.ts` (211 ln).

- `verify_jwt` stays **ON** (platform default; no `[functions.create-checkout-session]` block in config.toml). It additionally proves the caller is a party to the payable.
- Dispatches on exactly one of `{ invoiceId }` | `{ po_payment_id }` | `{ direct_order_id }` (each with a camelCase alias).
- Stripe SDK: `npm:stripe@17`, `STRIPE_API_VERSION = '2025-02-24.acacia'` (pinned, `index.ts:100`).
- Callers: `packages/supabase/src/hooks/use-invoices.ts:1164`, `use-procurement.ts:918`, `use-direct-orders.ts:185`, `apps/designer-portal/src/hooks/use-invoice-checkout-reconciliation.ts:25`.

### payment_method_types

`index.ts:1098-1125` (invoice rail):
```ts
const rails = attempt.paymentMethod ? [attempt.paymentMethod] : ['card', 'us_bank_account'];
const offersAch = rails.includes('us_bank_account');
...
payment_method_types: rails,
...(offersAch ? { payment_method_options: { us_bank_account: { verification_method: 'automatic' } } } : {}),
```
`index.ts:1303-1312` (PO / direct-order rail): always `['card','us_bank_account']`.

Optional request field `payment_method: 'card' | 'us_bank_account'` is **invoices only**; any other value → 400 `invalid_payment_method` (`index.ts:1402-1406`). Omitting it (iOS, legacy callers) yields a NULL claim → both rails, no fee.

### Surcharge line item

`index.ts:1126-1152` — Stripe **"Pattern A"**: the fee is a **second line item**, so `amount_total == balance + fee`. Labels at `index.ts:886-887`:
```ts
const SURCHARGE_LINE_LABEL = { card: 'Card processing fee', us_bank_account: 'Bank transfer fee' };
```
Only emitted when `attempt.surchargeCents > 0 && attempt.paymentMethod`.

### Metadata

Invoice (`index.ts:1102-1113`), set on **both** `metadata` and `payment_intent_data.metadata`:
```
payable_type: 'invoice', invoice_id, checkout_attempt_id, payer_id
+ (rail-bound only) payment_method, surcharge_cents
```
Identity is re-asserted server-side: `assertInvoiceSessionIdentity` at `invoice-checkout-core.ts:156-175` compares `customerId`, `payable_type`, `invoice_id`, `checkout_attempt_id`, `payer_id`, and the rail.

### success / cancel URLs

`invoice-checkout-core.ts:138-154` (`invoiceCheckoutReturnAddress`) builds off `clientProjectLink(CLIENT_PORTAL_URL, projectId, 'letterbox', { invoice, checkout })`, appends `session_id={CHECKOUT_SESSION_ID}` on success only, then `invoiceCheckoutReturnUrl` (`:100-120`) appends `checkout_attempt_id=…&payment_id=…` **before** the `#letterbox` fragment.

There is a **deploy-order warning** at `index.ts:288-300`: the flagless client portal must ship before this function or a return lands with no receipt.

### Idempotency / concurrency

`claim_invoice_checkout_attempt` RPC atomically claims one payer-bound attempt + a pending `invoice_payments` row *before* Stripe; one stable `stripeIdempotencyKey` reused; a superseded session is `stripe.checkout.sessions.expire()`d best-effort (`index.ts:1075-1090`). Stripe customer is lazily created with `idempotencyKey: patina-profile-customer:<id>` (`index.ts:780`). Integrity errors are typed: `checkout_session_identity_mismatch | checkout_session_amount_mismatch | checkout_session_unavailable | checkout_persistence_failed` (`invoice-checkout-core.ts:85-95`).

## Webhook → Patina tables

**`supabase/functions/stripe-webhook/index.ts`** (2196 ln), `verify_jwt = false` (`supabase/config.toml:330-331`).

- Raw body read first, then `constructEventAsync` + `SubtleCryptoProvider`. **400 only** on signature failure.
- Idempotency: claim `event.id` in **`stripe_webhook_events`** (`:2091`) via upsert `ignoreDuplicates`; already claimed → 200. Handler error → release claim (`:2191` delete) + 500 so Stripe retries.
- **The webhook only flips `invoice_payments` rows.** The 00178 AFTER trigger `apply_invoice_payment_effects` owns invoice rollup/status, milestone paid-through, and `designer_earnings`.
- Row resolution order: checkout session id → payment intent id → `metadata.invoice_id` latest-pending fallback (`:251-290`).
- Events: `checkout.session.completed` (paid → succeeded + receipt; `unpaid` = ACH initiated → stays pending), `checkout.session.async_payment_succeeded/failed`, `payment_intent.succeeded/payment_failed`, `charge.refunded`.

## Stripe key config

Env vars (read via `Deno.env.get`, set with `supabase secrets set`): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CLIENT_PORTAL_URL` (default `https://client.patina.cloud`), `DESIGNER_PORTAL_URL` (default `https://app.patina.cloud`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INVOICE_CHECKOUT_DESIGNER_TEST_MODE` (only honored when the key is `sk_test_`).

## docs/ops/stripe-rail-verification.md — 5-line summary

1. Two Stripe accounts have touched prod: **Middle West Studio `acct_1T6KiLJmCVe1Jxdu`** (ruled canonical) and sandbox **`acct_1T6KiaJomPTxIV9m`**.
2. `STRIPE_WEBHOOK_SECRET` was realigned to Middle West on 2026-08-18; `STRIPE_SECRET_KEY` has not been touched since 2026-07-08.
3. **Verdict: MISMATCH (high confidence, inferred)** — `STRIPE_SECRET_KEY` almost certainly still holds the *sandbox* key.
4. Consequence: a real checkout would 400 at the webhook signature check.
5. Fix: pull the key from the Middle West dashboard, `supabase secrets set STRIPE_SECRET_KEY --project-ref bkvcixdmuyejfzcijpdg`, redeploy all six functions that reference it, run the §3 e2e proof.

---

# 4. Email link conventions

`CLIENT_PORTAL_URL` / `DESIGNER_PORTAL_URL` centralized in `supabase/functions/_shared/branded-email.ts:74-94` (`portalBaseFor(audience)`). Deep-link builder **`supabase/functions/_shared/client-portal-links.ts`**: `clientProjectLink(baseUrl, projectId, anchor, params)` → `{origin}/projects/{id}?{query}#{anchor}`; `ThresholdAnchor` = `doorstep | door | letterbox | ledger | mat-papers | road | note | mat | approval-<id>`; header comment (`:17-19`) lists the two families that bypass this module: iOS-claimed `/invoices/<id>`, `/proposals/<id>`, `/decisions/<id>`; and token surfaces. Resend chokepoint **`supabase/functions/_shared/send-email.ts`** — `sendCompliantEmail(...)` `:366`, `prepareCompliantEmail` `:201` / `sendPreparedResendRequest` `:304`, `ComplianceSendOptions.category: 'transactional'|'operational'|'engagement'|'marketing'`. Templating: `_shared/branded-email.ts` (`renderBrandedShell()`), per-domain `_shared/invoice-emails.ts`.

---

# 5. Design system — paper/print document look

`packages/patina-design-system/src/tokens/colors.ts`: brandColors patinaOffWhite `rgb(237 233 228)`, clayBeige `rgb(163 146 124)`, mochaBrown `rgb(101 91 82)`, charcoal `rgb(63 59 55)`; functional success `rgb(122 139 112)`, warning `rgb(200 159 93)`, error `rgb(184 121 104)`, info `rgb(139 156 173)`.
`packages/patina-design-system/src/tokens/typography.ts:4-9`: heading `"Playfair Display", serif`; body `"Inter", system-ui`; mono `"JetBrains Mono"`; monoDisplay `"DM Mono"`.
`packages/patina-design-system/src/styles/typography.css` — `.type-page-title`, `.type-body`, `.type-body-small`, `.type-label`, `.type-label-secondary`, `.type-meta`, `.type-meta-small`; vars `--font-display`, `--font-body`, `--font-meta` mapped per portal (`apps/client-portal/src/app/globals.css:660-666`: Playfair / Inter / DM Mono).

**`apps/client-portal/src/app/globals.css:7-100`** — Vision palette:
```
--color-off-white:#FAF7F2  --color-pearl:#E5E2DD   --color-clay:#C4A57B
--color-aged-oak:#8B7355   --color-oak-ink:#4E4339 --color-mocha:#5C4A3C
--color-charcoal:#2C2926   --color-sage:#A8B5A0    --color-dusty-blue:#8B9CAD
--color-terracotta:#D4A090 --color-gold:#E8C547
--color-clay-ink:#7C5E30   --color-terracotta-ink:#9C5340 --color-golden-hour-ink:#79651E
Semantic: --bg-primary:var(--color-off-white)  --bg-surface:#FFFFFF
          --text-primary:var(--color-charcoal) --text-body:var(--color-mocha)
          --text-muted:var(--color-oak-ink)    --border-default:var(--color-pearl)
          --border-subtle:rgba(229,226,221,0.6) --accent-primary:var(--color-clay)
```

**`apps/designer-portal/src/app/globals.css:48-110`** — The Document paper stock (spec v1.1 §10, ruling D4: depth from values + flat stacked edges, never shadows):
```
--doc-paper:#FCFAF6  --doc-rail-stock:#E8E3DB  --doc-sheet-2:#EFE9DD  --doc-sheet-3:#E2DACA
--doc-ink-border:rgba(44,41,38,0.18)  --doc-sheet-front:#F7F2EB  --doc-sheet-back:#F1EBE2
--text-muted:#4E4339  --text-subtle:#5A4E43  --text-faint:#65594E
--type-metadata-min:12px  --type-body-min:14px  --type-control-min:16px  --doc-region-gap:24px
```
State tints (`:139-143`): `--fill-ordered-tint:#EFE6DA`, `--fill-decision-tint:#F5E7B9`, `--fill-damaged-tint:#F3E5DF`, `--fill-delivered-tint:#E6E8E0`, `--fill-anchor-tint:#E7E8E8`. Ink variants clear ~5.4:1 on paper: `--color-clay-ink:#7C5E30`, `--color-terracotta-ink:#9C5340`, `--color-golden-hour-ink:#79651E`, `--color-sage-ink:#5F6B57`. Chapter openers use a printer's double rule: 2px charcoal band, 3px paper gap, hairline (`:1017-1018`).

**Print** — `apps/client-portal/src/app/globals.css:668-690`: `@media print { body * {visibility:hidden} .proposal-print-area, .proposal-print-area * {visibility:visible} … @page { size: letter; margin: 0.5in } }`. Reference chromeless printable document: `apps/client-portal/src/app/invoices/[invoiceId]/print/page.tsx` (391 ln).

**Email palette** (separate): `_shared/branded-email.ts:11-31` — paper `#F5F0E6`, card `#FCF9F2`, line `#E6DDCC`, ink `#1F1B16`, verd `#4E7A66`, brass `#B08A46`, rust `#A24E2E`; fonts Fraunces / Hanken Grotesk / IBM Plex Mono.

**Vision** (`docs/vision/VISION.md` §4–§6): to the studio "you won't notice Patina"; to the homeowner "you're engaged every day, and you and your designer are looking at the same agreed direction — the decision record is the relationship"; pricing one page, no hidden fees. §5 "One living document per engagement. No dashboards, no task manager, no tab bars." §6 saying no to: tab/zone/dashboard UI, shadows, red/green status, badges, the "AI" label.
