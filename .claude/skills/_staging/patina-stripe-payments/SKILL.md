---
name: patina-stripe-payments
description: Use when working on Patina payments — Stripe Checkout sessions, stripe-webhook, invoices, PO/deposit payments, refunds, payment migrations (00274+), webhook signature failures (400 invalid_signature), Stripe keys/secrets in any environment, or when payment features look broken, dormant, or unconfigured (e.g. the orders service returns stripe_not_configured).
---
# Patina Stripe Payments

Last verified: 2026-07-08 (main @ 593876c1, migrations head 00284). Re-verify load-bearing claims if the repo has moved.

## Use when / Don't use when
Use when: touching Checkout, `stripe-webhook`, invoices, PO/deposit/direct-order payments, refunds, payment migrations, Stripe keys/secrets, or a `400 invalid_signature`; or when payments look dormant/unconfigured.
Don't use when: deploying the payment code to prod (that chain is patina-deploy), diagnosing non-payment prod issues (patina-prod-ops), or writing generic edge-function/migration mechanics (patina-edge-functions, patina-db-migrations — cross-ref for the shared rules).

## RAIL REALITY (the headline — internalize before touching anything)
The ONE live payments rail is **hosted Stripe Checkout implemented in EDGE FUNCTIONS + Supabase tables/RPCs**, NOT the NestJS orders service.
- `services/orders`' Stripe module is **intentionally dormant**: `STRIPE_CLIENT` resolves to `null` when `STRIPE_SECRET_KEY` is unset, and `assertStripeConfigured()` throws a 503 with body `stripe_not_configured` (`services/orders/src/config/stripe.module.ts`, comment: "payments rail parked … consolidates payments on a different rail").
- **DO NOT** set orders' Stripe env to "make payments work." A `stripe_not_configured` 503 from orders is expected. All payment work happens in `supabase/functions/*` + `supabase/migrations/*`.

## Procedure
1. **Confirm the rail.** Payment work lives in `supabase/functions/*` + `supabase/migrations/*`. If someone points at `services/orders`, redirect — its Stripe module is parked (below).
2. **Find the exact code.** Webhook = `stripe-webhook/index.ts`; session creation = `create-checkout-session`; sends = `invoice-send`/`invoice-reminders`/`po-send`. Money RPCs: find the live head body via `grep -l | sort | tail` (below).
3. **New webhook behavior** → replicate the claim → verify → guarded-transition → release-on-error pattern (below). Never add an ungated status write.
4. **Test locally** with the signer script (Commands) before any deploy.
5. **Ship** only under an in-session ask, following the order in patina-deploy (migrations → functions → verify). Set secrets via `supabase secrets set` (names-only in reports).

## Components (verified)
Edge functions: `create-checkout-session`, `stripe-webhook`, `invoice-send`, `invoice-reminders`, `po-send`, `expire-po-session`, `qbo-export` (+ related decision/proposal senders).
Tables: `stripe_webhook_events` (idempotency) and `invoice_payments` were created in **`00178_invoices_v1.sql`**; `po_payments` in **`00148_procurement_workspace_v1.sql`**. The **`00274`–`00280`** migrations are the Checkout-rail ADDITIONS on top: `00274` deposit-autodraft-on-signing, `00275` po_payment stripe columns, `00276` direct_orders, `00277` refund reconciliation, `00278` client reminder cadence, `00279` ffe pricing reconciliation, `00280` deposit draft notification. (So "the payment tables" are older than 00274 — don't assume they live in the 00274 range.)

## How the two sides interlock (verified)
`create-checkout-session` writes the **pending** payable row (`invoice_payments` / `po_payments`) with `status='pending'` + `stripe_checkout_session_id`, and stamps `metadata { payable_type, invoice_id|… }` on **both** the session and the PaymentIntent. `stripe-webhook` then settles that row, resolving it by **session id → PI id → `metadata.invoice_id` latest-pending**. On an amount-changed supersede, the session-creator marks the stale row `status='failed'` (note "Superseded"). If the pending row is missing, the webhook can recreate it from `metadata` — so metadata is load-bearing; never drop it when adding a payable type.

## Webhook anatomy (`supabase/functions/stripe-webhook/index.ts`, ~1720 lines — money-critical)
Follow this shape exactly; every new handler must too:
1. **Raw body first**: `const raw = await req.text();` (signature is over the exact bytes) — never parse JSON before verifying.
2. **Verify**: `stripe.webhooks.constructEventAsync(raw, sig, secret, undefined, cryptoProvider)` with `Stripe.createSubtleCryptoProvider()`. **400 is returned ONLY on signature failure** (`{ error: 'invalid_signature' }`). Do not 400 for anything else.
3. **Idempotency claim**: `upsert` into `stripe_webhook_events` with `{ onConflict: 'id', ignoreDuplicates: true }`. Already claimed → return `{ received:true, duplicate:true }` (200) immediately.
4. **Handler error → release the claim**: `admin.from('stripe_webhook_events').delete().eq('id', event.id)` then 500 so Stripe **retries**. Retries are safe only because every state transition is **guarded** (`.eq('status','pending')`, `.eq('status','pending_payment')`, etc.) — a re-delivery flips nothing already flipped.
5. Success → `{ received:true }` (200).
- The webhook **only flips `invoice_payments` rows**. The `00178` AFTER trigger `apply_invoice_payment_effects` owns the invoice rollup/status, milestone paid-through, and `designer_earnings`. Don't duplicate that accounting in the handler.
- `verify_jwt=false` for `stripe-webhook` (config.toml) — authenticity is the Stripe signature. The in-file `?apikey=<ANON_KEY>` note is **legacy self-hosted Kong**; on Strata (Supabase Cloud) the function is reachable directly, no apikey query param.
- STRIPE_API_VERSION is pinned in-file — bump deliberately with the `npm:stripe` major.

## Events handled (verified in-file header)
Payment rows resolve by **checkout session id → payment intent id → `metadata.invoice_id` latest-pending** fallback.
| Event | Effect (all guarded) |
|---|---|
| `checkout.session.completed` | stamp PI id; `payment_status='paid'` → succeeded (+receipt email); `'unpaid'` (ACH initiated) stays pending |
| `checkout.session.async_payment_succeeded` | → succeeded (+receipt) |
| `checkout.session.async_payment_failed` | → failed; clear invoice's session pointer; email client + notify designer |
| `payment_intent.succeeded` / `payment_intent.payment_failed` | belt-and-suspenders by PI id; only flips still-pending rows |
| `charge.refunded` | refund reconciliation v1 (00277): resolve payable by `charge.payment_intent` across invoice_payments → po_payments → direct_orders. FULL refund flips state (00277 trigger reverses invoice/earnings/milestone). PARTIAL only logs+notifies (v2 pending). Unmatched PI → log + 200 |
| everything else | acknowledged 200, no-op |
On a flip to succeeded: receipt email to client via the `sendCompliantEmail` chokepoint + an `in_app` `notification_log` row for the designer. Email/notification failures are logged, never fail the webhook.

## SECRET SOURCING (the classic 400 invalid_signature)
`STRIPE_WEBHOOK_SECRET` MUST be the `whsec_…` from the **Stripe dashboard endpoint page** (Developers → Webhooks → your endpoint → Signing secret). It is **NOT** the `whsec_…` that `stripe listen` prints — that one is valid only for that CLI session. Using the CLI secret in prod = **every real delivery returns 400 invalid_signature**. Recover by fixing the secret and using the dashboard's **Resend** on failed events. Set it (gated): `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_…` (names only in reports).

## Environment state
Sandbox webhook endpoint exists and is live; **LIVE keys are OWED** — treat live mode as **unarmed** until the user says otherwise. Before assuming anything is configured, check names only: `supabase secrets list` (Strata) or the local `.env`. Never echo secret values.

## Commands (local testing)
```bash
supabase functions serve stripe-webhook --no-verify-jwt
# sign + POST a test event (scripts/dev/sign-stripe-event.mjs):
node scripts/dev/sign-stripe-event.mjs \
  --secret whsec_localdev \
  --url http://127.0.0.1:54321/functions/v1/stripe-webhook \
  payload.json                       # expect: {"received":true}
# tamper test — should 400:
node scripts/dev/sign-stripe-event.mjs --secret whsec_localdev --corrupt --url <same> payload.json
```
Then confirm the `invoice_payments` / `po_payments` row flipped to the expected guarded status. The script reads `STRIPE_WEBHOOK_SECRET` from env if `--secret` is omitted.

## Money-path RPC discipline
`activate_proposal_as_project` (redefined ~19×; live head body **`00279_ffe_pricing_reconciliation.sql`** as of this writing — NOT the `00262` that `supabase/CLAUDE.md` claims) and `apply_invoice_payment_effects` (`00178` → `00277`) are monolithic `CREATE OR REPLACE` functions. Before editing either, find the TRUE head body with the anchored grep: `grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" supabase/migrations/*.sql | sort | tail -1` (a loose `grep 'FUNCTION .*<name>'` false-positives on REVOKE/GRANT/COMMENT lines), then read that file. Rebasing onto an older copy silently reverts later fixes. Full rule in patina-db-migrations.

## Money conventions
- **Integer cents everywhere**. No floats.
- Invoice "total" falls back: `total_amount_cents ?? budget_cents` (pre-00139 rows; see `supabase/CLAUDE.md`).
- **Refunded payments are excluded from coming-due rollups** (fix `816c6282`: the `refunded` state from 00277 must not be bucketed as "coming due" — it's neither held nor owed; that fix was in `procurement/by-status/page.tsx`, portal-side). Any new money summary must special-case `refunded`.

## Concurrency (real double-charge bugs)
Checkout / PO payment UI **must busy-gate**. Double-submit and queue-advance races have caused real defects — `f072ce2f` closed a **PO checkout double-charge window** + PI reconciliation gaps; `2bbf1f64` fixed queue busy-gating + stale async continuations. Rules for any new payment UI:
- Disable / queue the action while a Checkout session is in flight; don't let a second click open a second session.
- After any `await`, **re-derive state** — the row may have changed under you (stale-continuation hazard); don't act on a pre-await snapshot.

## KNOWN OPEN HOLE — po_payments self-mark-paid RLS
The policy "Designers manage payments on their purchase orders" (`00148`) is `FOR ALL TO authenticated` where the PO's `designer_id = auth.uid()`. `FOR ALL` includes UPDATE of `state` — so a **designer's own authenticated browser session can flip `po_payments.state` to `paid` client-side, with no Stripe payment**. Do NOT treat `po_payments.state='paid'` as proof of funds, and don't build new logic that assumes PO payment state only advances via the verified Stripe/webhook path. **Flag this in any report** touching PO payments.

## Quality bar
- New webhook handlers replicate claim → verify → guarded-transition → release-on-error exactly; no ungated status writes.
- No attempt to revive orders' Stripe module; all work in edge functions + migrations.
- Secrets sourced correctly (dashboard-endpoint `whsec_`), set via `supabase secrets set`, names-only in reports; live mode treated as unarmed unless told.
- Money stays integer cents; `refunded` handled; UI busy-gated + state re-derived after awaits.
- Edits to `activate_proposal_as_project` / `apply_invoice_payment_effects` target the verified head body.

## Verification checklist
- [ ] Received event created a `stripe_webhook_events` row; a re-POST of the same event id returns `{duplicate:true}` and flips nothing.
- [ ] The target `invoice_payments` / `po_payments` row moved to the expected status via a guarded transition (not an unconditional write).
- [ ] `apply_invoice_payment_effects` produced the rollup (invoice status / milestone / earnings) — you didn't hand-roll it in the handler.
- [ ] Cron-driven sends (invoice-reminders, po-send): confirm delivery via `net._http_response` (see patina-prod-ops), not just `cron.job_run_details`.
- [ ] Signature path: a tampered body returns 400; a valid one returns 200. Correct `whsec_` in use.
- [ ] Cross-checked the Stripe **sandbox** dashboard for the other side of the transaction.

## Common mistakes
| Situation | Wrong move | Right move |
|---|---|---|
| Payments "not working"; orders 503 `stripe_not_configured` | Set `STRIPE_SECRET_KEY` on orders | Expected; the rail is edge fns + migrations, not orders |
| Every real webhook 400s | Blame the code / redeploy | Wrong `STRIPE_WEBHOOK_SECRET` — use the dashboard-endpoint `whsec_`, not `stripe listen`'s |
| New webhook event type | Parse JSON, then update rows | Raw body → verify → claim → **guarded** `.eq('status',…)` update → release-on-error |
| Retry double-applied a payment | Add a dedupe flag ad hoc | Use the `stripe_webhook_events` claim + guarded transitions already there |
| Reading "invoice total" | `total_amount_cents` only | `total_amount_cents ?? budget_cents` |
| Editing activate_proposal_as_project | Edit an old copy, or trust a doc's "latest body" claim | Anchored grep → edit the head (00279 today; grep, don't trust docs) |
| New "coming due" summary | Bucket every non-paid row | Exclude `refunded` (00277) explicitly |
| PO shows `state='paid'` | Trust it as funds received | RLS lets the designer self-mark; verify via Stripe/webhook |
| New checkout button | Fire on every click | Busy-gate; re-derive state after awaits |
| Confirm live payments | Assume LIVE keys set | LIVE keys OWED — `supabase secrets list` (names); sandbox only |

## Report back
State what you changed (function / migration / UI), and confirm you stayed on the edge-fn+migration rail (did not touch orders' Stripe env). Give evidence: the `stripe_webhook_events` row + duplicate-suppression result, the guarded row transition, the signature 400/200 test, and any `net._http_response` delivery check. Name (never value) any secret involved and whether it was set under an in-session ask. **Always flag the `po_payments` self-mark-paid RLS hole** if your change is near PO payments, and note whether live mode is still unarmed.
