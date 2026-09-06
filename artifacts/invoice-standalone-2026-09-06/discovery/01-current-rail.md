# Current invoice rail — factual survey (2026-09-06, read-only)

## 1. Invoice data model

### Core tables — `supabase/migrations/00178_invoices_v1.sql`
- **`public.invoices`** (`:29-63`). Key columns: `project_id`, `designer_id`, `client_id`, `invoice_number`, `status TEXT CHECK IN ('draft','sent','partially_paid','paid','void')` (`:36-37` — a CHECK, **not** a PG enum), `issue_date`, `due_date`, `payment_terms_days`, `currency`, `subtotal_cents`, `tax_rate NUMERIC(6,4)`, `tax_cents`, `total_cents`, `amount_paid_cents`, `memo`, `internal_notes`, `stripe_checkout_session_id`, `sent_at/paid_at/voided_at/void_reason`, `reminder_count`, `last_reminder_at`, `ar_flagged_at`. **No token / public-access column exists anywhere on invoices.**
- **`invoice_line_items`** (`:82-100`) — `kind CHECK IN ('milestone','time','adhoc')` (extended to include `'ffe'` by 00187), `quantity`, `unit_amount_cents`, `amount_cents`, `metadata jsonb`, `sort_order`.
- **`invoice_payments`** (`:124-141`) — `amount_cents`, `method CHECK IN ('stripe','check','wire','ach_manual','cash','other')`, `status CHECK IN ('pending','succeeded','failed','refunded')`, `stripe_checkout_session_id`, `stripe_payment_intent_id`, `stripe_event_id`, `reference`, `recorded_by`, `received_at`.
- **`invoice_counters`** (`:159`) and **`stripe_webhook_events`** (`:166`) — RLS on, **zero policies** (service-role only).
- RPCs: `issue_invoice` (`:363`), `record_invoice_payment` (`:465`), `void_invoice` (`:521`), `apply_invoice_payment_effects` (`:590`), trigger `trg_invoice_payments_apply_effects` (`:695`).

### RLS on invoice tables (00178 `:232-352`)
All policies are effectively `authenticated` (`auth.uid()`-keyed). **No `anon` policy exists on any invoice table.**
- `"Designers can view their invoices"` `:239` — `designer_id = auth.uid()`.
- `"Clients can view issued invoices on their projects"` `:257` — `status <> 'draft' AND projects.client_id = auth.uid()`.
- Line items: designer view `:268`, client view `:318`. Payments: designer `:333`, client `:342`.

### 00571 — studio invoices (`supabase/migrations/00571_studio_invoices.sql`)
- `invoices.project_id` **dropped NOT NULL** (`:47`), `ADD COLUMN title text` (`:50`), `CONSTRAINT chk_invoices_anchor` (`:53`) — `project_id IS NOT NULL OR (client_id IS NOT NULL AND studio_id IS NOT NULL)`.
- `set_invoice_studio_id()` rewritten (`:77`) — identity columns immutable on UPDATE.
- `create_draft_studio_invoice(...)` (`:772`, GRANT `:1006`).
- `apply_invoice_payment_effects` re-headed (`:1094`, service_role only `:1241`).
- **Household read path** (`:1268-1303`): `invoices_household_select`, `invoice_line_items_household_select`, `invoice_payments_household_select` — all `TO authenticated`, `client_id = auth.uid() AND status <> 'draft'`. New index `idx_invoices_client` `:1264`.
- `resolve_studio_identity(uuid,uuid,uuid)` (`:1318`) — **the one invoice-adjacent function granted to `anon`** (`:1414`).

### 00397 — checkout integrity (`supabase/migrations/00397_billing_checkout_integrity.sql`)
- **`invoice_checkout_attempts`** (`:31-56`): `invoice_id`, `payer_id`, `stripe_customer_id`, `amount_cents`, `currency`, `state CHECK IN ('claimed','session_created','processing','succeeded','failed','expired','superseded','requires_refund','refunded')`, `stripe_idempotency_key UNIQUE`, `stripe_checkout_session_id UNIQUE`, `stripe_payment_intent_id UNIQUE`, `failure_reason`, `finalized_at`. Partial unique index `uniq_invoice_checkout_active_attempt` `:58` (one live attempt per invoice). **RLS on, REVOKE from anon+authenticated, service_role only** (`:77-79`).
- `invoice_payments.status` gains `'requires_refund'` (`:25-29`); `invoice_payments.checkout_attempt_id` FK (`:65`).
- RPCs: `claim_invoice_checkout_attempt` `:1484`, `finalize_invoice_checkout_attempt` `:1660`, `fail_invoice_checkout_attempt` `:1747`, `recover_invoice_checkout_session_evidence` `:1806`, `guard_invoice_payment_overpayment` `:1894`, `sync_invoice_checkout_attempt` `:1958`, `settle_invoice_checkout_payment` `:2058`. All granted **service_role only**.

### 00428 — payment-method chooser + surcharge (`supabase/migrations/00428_invoice_payment_method_surcharge.sql`)
- **`studio_billing_settings`** (`:42-52`): `studio_id PK → organizations(id)`, `card_surcharge_bps int DEFAULT 300 CHECK 0..300`, `check_remit_to text`. RLS `:59`; policies `studio_billing_settings_member_select` `:65`, `_admin_insert` `:72`, `_admin_update` `:79` — all `TO authenticated`. `REVOKE ALL … FROM PUBLIC, anon` `:88`.
- `invoice_checkout_attempts` + `payment_method text CHECK IN ('card','us_bank_account')` and `surcharge_cents int DEFAULT 0` (`:98-112`).
- `invoice_payments` + `surcharge_cents`, `stripe_payment_method_type CHECK IN ('card','us_bank_account')` (`:120-134`). Note `:136-137`: `method` stays `'stripe'`; the rail lives in `stripe_payment_method_type`.
- `get_invoice_payment_options(uuid)` (`:720`) — SECURITY DEFINER, returns `{card_surcharge_bps, check_remit_to}`, readable by the invoice's client / designer / active studio member; **`REVOKE … FROM PUBLIC, anon` at `:765`, GRANT to `authenticated` only `:766`**. Every denial raises `invoice_not_found`.

### Other invoice migrations
`00181` reminders cron · `00182` void/draft fix · `00187` FF&E lines + `get_ffe_invoice_coverage` · `00209` `chase_invoice` · `00274/00275/00276/00277/00279/00280` payment/PO/refund wave · `00304` stripe-event-processor cron · `00318` studio invoice numbering (`studio_invoice_counters`) · `00513` numbering uniqueness · `00361/00362` fulfillment Stripe recon.

---

## 2. Invoice edge functions (`supabase/functions/`)

| Function | Purpose | verify_jwt |
|---|---|---|
| `create-checkout-session/index.ts` (1455 ln) | The single Stripe Checkout entry point; dispatches `invoice` / `po_payment` / `direct_order` | **true** (no `config.toml` section → platform default; asserted in header comment `:5-7`) |
| `stripe-webhook/index.ts` (2196 ln) | Settles invoice payments from Stripe events | **false** — `config.toml:330-331`; authenticity via `STRIPE_WEBHOOK_SECRET` |
| `invoice-send/index.ts` (389 ln) | Sends the invoice email (Resend) | true (default) |
| `invoice-reminders/index.ts` (469 ln) | Cron cadence: upcoming / overdue / 2nd / final notice | true (default) |
| `invoice-check-intent/index.ts` (297 ln) | "I'm mailing a check" designer notification; **no ledger row, no money** | **true**, explicitly — `config.toml:636-637` with a comment stating it is deliberately *not* a `verify_jwt=false` candidate |
| `stripe-event-processor` | Cron replay of stored Stripe events | true, `config.toml:418` |
| `fulfillment-stripe-recon` | Recon cron | true, `config.toml:549` |

**No invoice edge function accepts a public token.** The only `verify_jwt = false` functions are `stripe-webhook`, `resend-webhook`, `sms-inbound`, `sms-status`, `comms-mute`, `test-account-login`, `fulfillment-po`, `fulfillment-evidence`, `site-request-guest` (`supabase/config.toml:330,334,340,345,349,359,513,538,556`).

### create-checkout-session, invoice path
- Header contract `index.ts:9-51`. Body accepts `{ invoiceId | invoice_id }` + optional `{ payment_method | paymentMethod }` = `'card' | 'us_bank_account'`; anything else → 400 `invalid_payment_method` (`:1399-1408`).
- Caller resolved from `Authorization` header via `supabase.auth.getUser()` (`:113-118`). Caller must be `invoice.client_id ?? invoice.project.client_id` (`:239`); a test-key-only designer override at `:240-241`. Status must be `sent | partially_paid` (`:246`), balance = `total_cents - amount_paid_cents` (`:255`).
- Claims a DB attempt **before** Stripe via `claim_invoice_checkout_attempt` (`:1068-1074`, passing `p_payment_method`).
- Session build `:1095-1160`: `payment_method_types` = the single chosen rail or `['card','us_bank_account']` when null; **surcharge is a second Stripe line item** (`:1138-1151`, "Pattern A") so `amount_total === balance + fee`; metadata `{payable_type:'invoice', invoice_id, checkout_attempt_id, payer_id, payment_method, surcharge_cents}` on both session and payment_intent.
- Return URLs built by `invoiceCheckoutReturnAddress` / `invoiceCheckoutReturnUrl` in `create-checkout-session/invoice-checkout-core.ts:105-149` → `CLIENT_PORTAL_URL` + `clientProjectLink(..., 'letterbox', {invoice, checkout})` + `checkout_attempt_id` / `payment_id` / `session_id`.
- Response: `{ url, amount_cents, currency, checkout_attempt_id, payment_id, session_id, reused, surcharge_cents, payment_method }`.
- State machine `runInvoiceCheckout` + `assertInvoiceSessionIdentity` in `invoice-checkout-core.ts:151-181, 213-266` — asserts `session.amountTotal === attempt.amountCents + attempt.surchargeCents`.

### stripe-webhook, invoice settlement (the "internal tables are truth" rule)
- Header `index.ts:18-21`: "The webhook ONLY flips `invoice_payments` rows; the 00178 AFTER trigger (`apply_invoice_payment_effects`) owns the invoice rollup/status."
- Exact-claim resolution before any legacy fallback: `index.ts:185-249` (via `resolveExactClaimedPayment` in `stripe-webhook/invoice-checkout-integrity.ts:74`), fallback chain session id → PI id → latest pending row (`:251-286`).
- Settlement goes through the DB money boundary `settle_invoice_checkout_payment` (`index.ts:380`), which locks the invoice and verifies **gross** = `amount_cents + surcharge_cents` against Stripe's reported amount (00428 `:599-711`); mismatch → `requires_refund` + an `awaiting_review` `payment_discrepancy` agent task (00428 `:840-870`).
- `usedPaymentMethodType` (`invoice-checkout-integrity.ts:159`) stamps the rail actually used.
- Receipt / failure emails and notifications `index.ts:403-575`; portal URL is `${CLIENT_PORTAL_URL}/invoices/${invoice.id}` (`:418`, `:517`), deep link `/invoices/<id>` (`:465`), designer deep link `/desk?book=accounts&page=ledger&invoiceId=<id>` (`:496`).

---

## 3. Surcharge / fee math

Two lockstep twins, explicitly documented as such:

**SQL:** `public.invoice_payment_surcharge_cents(p_amount_cents, p_method, p_card_bps)` — `00428:148-171`, `IMMUTABLE`, granted `authenticated, service_role` (`:175`). Formula: ACH → `LEAST(((cents*80 + 5000)/10000), 500)`; card → `((cents * COALESCE(p_card_bps,300) + 5000)/10000)`; anything else (incl. NULL) → 0. Comment at `:178-179` names the TS twin.

**TypeScript:** `packages/shared/src/invoice/index.ts:169-223`
- `ACH_SURCHARGE_BPS = 80` (`:180`), `ACH_SURCHARGE_CAP_CENTS = 500` (`:183`), `DEFAULT_CARD_SURCHARGE_BPS = 300` (`:186`), `CHECK_REMIT_FALLBACK` (`:189`).
- `surchargeFormula` (`:192`), `achSurchargeCents` (`:197`), `cardSurchargeCents` (`:206`), `onlineSurchargeCents(method, amountCents, cardBps)` (`:216`).
- Also `invoiceBalanceCents` (`:160`), `computeInvoiceTotals` (`:70`), `formatCurrency` (`:85`), `formatInvoiceDate` (`:97`), `invoicePaymentMethodLabel` (`:~240`).

**Per-studio rate source:** `studio_billing_settings.card_surcharge_bps`, read publicly-to-parties via `get_invoice_payment_options`. ACH is a platform constant, not per-studio.

**Surfaces showing it today:**
1. `apps/client-portal/src/components/threshold/payment-method-chooser.tsx` — three options with live fee labels (`:79-92`), `feeLabel` `:61-64`.
2. `apps/client-portal/src/components/threshold/settlement.tsx:71-93` — computes `surcharge` and `chargeTotal = balanceCents + surcharge` live on toggle; `cardSurchargeBps` is `null` while the RPC is in flight (renders "—"; never quotes the default early), `:75-84`.
3. `apps/client-portal/src/app/invoices/[invoiceId]/print/page.tsx:39-40, 333-337` — check remit-to on the printable invoice.
4. `apps/designer-portal/src/components/document/account/account-studio-page.tsx:66, 136, 207-208, 479-480, 910-916` — the studio's card-fee (%) and remit-to editor.
5. Server: the Stripe surcharge line item in `create-checkout-session/index.ts:1138-1151`.

---

## 4. Client-facing invoice rendering (apps/client-portal, post-cutover)

**Auth is required for every invoice surface.** `apps/client-portal/src/middleware.ts:100-163` enumerates the public pages: `/auth/invite`, `/quiz`, `/share/*`, `/field/*`, `/rfq/*`, `/evidence/*`, `/plans/*`, `/piece/*`, `/preferences/unsubscribe`. `/` is explicitly **not** public (`:148-152`). No invoice path is in that list.

**Routes**
- `/` → `apps/client-portal/src/app/page.tsx` — the client page ("Threshold"); reads `?invoice=<id>` (`:39`) to name which letter is open.
- `/invoices/<id>` → **308-redirected** by middleware to `/?invoice=<id>#letterbox` (`middleware.ts:264-290`; mapping in `apps/client-portal/src/lib/retired-routes.ts:63, 145-152`). The path survives only because the iOS app claims `applinks:/invoices/*`.
- `/invoices/[invoiceId]/print` → `apps/client-portal/src/app/invoices/[invoiceId]/print/page.tsx` — the one real invoice route left; uses `useInvoice`, `useInvoicePaymentOptions`, `useStudioIdentity` (`:6, 26, 33-40`). Still session-gated.

**Components** (`apps/client-portal/src/components/threshold/`)
- `threshold.tsx` — orchestrator; `useProjectInvoices(projectId)` `:274` + `useClientInvoices()` `:300`, merged `:310`, passed to the letterbox `:899`.
- `letterbox.tsx` — the envelope; picks the named or soonest-due invoice (`:117-131`), renders `Settlement` `:305`, `EarlierInvoices` `:334`, print link `/invoices/<id>/print` `:285`.
- `settlement.tsx` — the pay surface: `useInvoicePaymentOptions` / `useStartCheckout` / `useNotifyCheckIntent` (`:9-11, 71-73`), live surcharge math `:80-93`, `handleSettle` `:104-145` → `window.location.href = receipt.url`.
- `payment-method-chooser.tsx` — the three-way selector (ACH / Card / Check) + check panel.
- Supporting: `house-ledger.tsx`, `earlier-invoices.tsx`, `letter-payee.ts`, `details-sheet.tsx`, `instruments/spine-toll.tsx`.
- Libs: `lib/threshold/invoice-rollup.ts`, `lib/threshold/derive.ts` (`InvoiceModel`), `lib/threshold/checkout-return.ts` (reads and strikes `?checkout / session_id / checkout_attempt_id / payment_id / invoice / order`).

**Designer portal (apps/designer-portal)** — no dedicated invoice route; everything is inside `/desk` via overlay/drawer:
- `src/app/(document)/desk/page.tsx` → `components/document/studio-drawer.tsx:38, 572` renders `AccountsBook`.
- `components/document/accounts/accounts-book.tsx:44-60` — pages `ledger | receivables | earnings`; `useInvoices()`, `useArAging()`, `useEarningsStats()` (`:59-66`); `highlightInvoiceId` from `?invoiceId=` (`:181`).
- `accounts-ledger-page.tsx`, `accounts-receivables-page.tsx` (uses `useSendInvoice`, `useChaseInvoice` `:97-98`), `invoice-composer.tsx`, `invoice-folio.tsx` (detail + self-print: `useInvoice/useIssueInvoice/useSendInvoice/useRecordPayment/useVoidInvoice` `:20-24, 91-95`; `window.print()` `:610`), `invoice-overlays.tsx` (`openInvoiceFolio` `:38`, `openInvoiceComposer` `:45`).
- Settings: `components/document/account/account-studio-page.tsx` (card fee %, remit-to).
- Deep link from webhook/emails: `/desk?book=accounts&page=ledger&invoiceId=<id>`.

---

## 5. Hooks in packages/supabase

**`packages/supabase/src/hooks/use-invoices.ts`**

| Export | Line | Query |
|---|---|---|
| `useInvoices(filters?)` | 403 | `from('invoices').select('*, project(...), client(...), payments:invoice_payments(*)')`, key `['invoices','list',filters]` |
| `useInvoice(id)` | 433 | `invoices` + `project(+client)`, `client`, `designer`, `line_items`, `payments`; key `['invoices', id]` |
| `useProjectInvoices(projectId)` | 474 | `invoices` + `line_items`, `.eq('project_id', …)` |
| `useClientInvoices()` | 497 | `invoices` + `line_items`, **unscoped — RLS decides** (needed for studio invoices with no project) |
| `useFfeInvoiceCoverage` | 557 | rpc `get_ffe_invoice_coverage` |
| `useArAging` / `computeArAging` / `invoiceDaysOverdue` | 675 / 636 / 619 | client-side derivation |
| `useCreateDraftInvoice` / `useCreateDraftStudioInvoice` | 692 / 774 | inserts; the latter rpc `create_draft_studio_invoice` |
| `useUpdateDraftInvoice`, `useUpsertLineItems`, `useDeleteLineItem`, `useDeleteDraftInvoice` | 829, 856, 908, 943 | direct table DML on drafts |
| `useIssueInvoice` | 972 | rpc `issue_invoice` |
| `useRecordPayment` | 1005 | rpc `record_invoice_payment` |
| `useSendInvoice` | 1058 | `functions.invoke('invoice-send')` |
| `useChaseInvoice` | 1114 | rpc `chase_invoice` |
| **`useStartCheckout`** | **1154** | `functions.invoke('create-checkout-session', { body: { invoiceId, payment_method } })`; parses `InvoiceCheckoutReceipt`, throws typed `InvoiceCheckoutError` |
| **`useInvoicePaymentOptions`** | **1221** | rpc `get_invoice_payment_options`; **any failure falls back to `{300, null}`** — never blocks the pay path |
| **`useNotifyCheckIntent`** | **1268** | `functions.invoke('invoice-check-intent')` |
| `useVoidInvoice` | 1307 | rpc `void_invoice` |

Types: `InvoiceCheckoutReceipt` `:82`, `InvoiceCheckoutError` `:111`, `parseInvoiceCheckoutReceipt` `:146`, `Invoice` `:196`, `InvoicePaymentOptions` `:1202`.

**`packages/supabase/src/hooks/use-studio-billing.ts`** — `useStudioBillingSettings(studioId)` `:44` and `useUpdateStudioBillingSettings()` `:68`, both direct `from('studio_billing_settings')` (member/admin RLS).

---

## 6. Invoice emails

**`supabase/functions/_shared/invoice-emails.ts`** — builders, all taking a `portalUrl: string` and rendering a CTA button + a "copy this link" fallback (`:139-166`):
`buildInvoiceSentEmail` `:168`, `buildInvoiceUpcomingReminderEmail` `:254`, `buildInvoiceOverdueNoticeEmail` `:286`, `buildInvoiceSecondNoticeEmail` `:320`, `buildInvoiceFinalNoticeEmail` `:356`, `buildInvoiceArEscalationEmail` `:411` (designer A/R), `buildPaymentReceiptEmail` `:468`, `buildPaymentRefundedEmail` `:646`, `buildPaymentFailedEmail` `:708`, `buildCheckIntentEmail`. `studioInvoiceFooterLinks()` `:92`.

**URLs — no token anywhere:**
- `invoice-send/index.ts:259` → `portalUrl = ${CLIENT_PORTAL_URL}/invoices/${invoice.id}`; in-app `deep_link: /invoices/<id>` (`:315`).
- `invoice-reminders/index.ts:353` → same shape; `deep_link` `:376`.
- `stripe-webhook/index.ts:418, 517` → same shape for receipts / ACH-failure notices.
- `CLIENT_PORTAL_URL` defaults to `https://client.patina.cloud` in all three.
- These `/invoices/<id>` links land on the **auth-gated** portal and are 308'd to `/?invoice=<id>#letterbox` (see §4). A recipient without a session is bounced to `/auth/signin?callbackUrl=…`.
- Delivery goes through `_shared/send-email.ts` `sendCompliantEmail` (Resend + suppression, rate cap, unsubscribe headers, `notification_log`).
- `_shared/client-portal-links.ts:12-19` states explicitly that `/invoices/<id>` is *not* routed through the link builder because the iOS app claims it, and lists the existing **token surfaces** that bypass auth: `/field/<t>`, `/rfq/<t>`, `/share/<t>`, `/plans/<t>`, `/evidence/<t>`, `/auth/invite/<t>`, `/piece/<id>`.

**Existing login-less token precedents**: `resolve_document_share` (`00266:181`, re-headed `00390:1428`), `resolve_field_link` (`00283:182`), `resolve_trade_rfq_link` (`00424:522`), `resolve_plan_transmittal` (`00429:1787`), `fulfillment_evidence_token_context` (`00364:473`, service_role only). All the `resolve_*` RPCs are granted to `authenticated` only and are called **server-side** from a Next.js route with the service client; the corresponding pages are exempted in `apps/client-portal/src/middleware.ts:100-163`, and `/plans/*` additionally sets `Cache-Control: private, no-store` + `X-Robots-Tag: noindex` (`:143-147`).
