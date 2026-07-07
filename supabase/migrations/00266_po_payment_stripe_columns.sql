-- ═══════════════════════════════════════════════════════════════════════════
-- 00266 — po_payments Stripe columns (payable_type dispatch, po_payment rail)
--
-- Phase 3 of the payment-rail consolidation. The create-checkout-session and
-- stripe-webhook edge functions are being generalized from invoice-only to a
-- payable_type dispatch, so a designer can pay Patina for an "Order via Patina"
-- catalog purchase order. The precise payable unit for a PO is a po_payments
-- row (a PO may split deposit/balance), so the Stripe pointers live on that
-- row — exactly mirroring invoice_payments (00178).
--
-- Adds, idempotently:
--   1. po_payments.stripe_checkout_session_id / .stripe_payment_intent_id
--      (TEXT, nullable) — the checkout session pointer (session reuse +
--      Pay-now-after-failure) and the settled PaymentIntent id. Same shape and
--      partial-unique index style as invoice_payments's stripe columns.
--   2. procurement_notification_kind += 'payment_received', 'payment_failed'
--      — the webhook's settle-success / async-failure in-app notifications for
--      the designer. The enum had only *_due / delivery / damage kinds; none
--      fit a completed payment, so two additive labels are the smallest honest
--      extension. ADD VALUE IF NOT EXISTS is transaction-safe on PG12+ because
--      the new labels are NOT referenced anywhere in this migration (the
--      webhook uses them at runtime, in a separate transaction).
--
-- NOTE ON STATE: po_payment_state stays pending|due|paid (00148). A failed ACH
-- does NOT flip state — the webhook clears the session pointer so Pay-now can
-- open a fresh session and leaves state untouched (there is no 'failed' state,
-- by design). Flipping a deposit to 'paid' fires 00184 Trigger D
-- (trg_deposit_paid_flips_balance) — the existing, correct downstream effect;
-- this migration adds no PO-status transition (purchase_orders.status has no
-- 'paid' member and the payment rail must not invent one).
--
-- Migration numbers collide across in-flight branches; the integrator
-- renumbers at merge. Re-run safe: ADD COLUMN IF NOT EXISTS, ADD VALUE IF NOT
-- EXISTS, CREATE UNIQUE INDEX IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── PART 1: po_payments Stripe pointer columns ─────────────────────────────

ALTER TABLE public.po_payments
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id   TEXT;

COMMENT ON COLUMN public.po_payments.stripe_checkout_session_id IS
  'Stripe Checkout Session id for this payment (set by create-checkout-session '
  'on the po_payment branch). Cleared to NULL by stripe-webhook on '
  'checkout.session.async_payment_failed so Pay-now opens a fresh session. '
  'Mirrors invoice_payments.stripe_checkout_session_id.';

COMMENT ON COLUMN public.po_payments.stripe_payment_intent_id IS
  'Stripe PaymentIntent id, stamped by stripe-webhook on '
  'checkout.session.completed (card = paid immediately; ACH = unpaid/initiated '
  'then settled via async_payment_succeeded). Mirrors '
  'invoice_payments.stripe_payment_intent_id.';

-- Stripe idempotency: one payment row per PaymentIntent / Checkout Session.
-- Same naming/style as uniq_invoice_payments_stripe_* (00178).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_po_payments_stripe_pi
  ON public.po_payments(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_po_payments_stripe_session
  ON public.po_payments(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- ─── PART 2: procurement notification kinds for payment settle / failure ────
--
-- 00151 defined the kinds as a real Postgres ENUM (not a CHECK), so extend it
-- with ALTER TYPE ... ADD VALUE. IF NOT EXISTS keeps re-runs safe. These labels
-- are consumed only by the stripe-webhook po_payment handlers at runtime.

ALTER TYPE public.procurement_notification_kind ADD VALUE IF NOT EXISTS 'payment_received';
ALTER TYPE public.procurement_notification_kind ADD VALUE IF NOT EXISTS 'payment_failed';

COMMENT ON TYPE public.procurement_notification_kind IS
  'In-app notification kinds for the procurement workspace. '
  'deposit_due / balance_due / milestone_due: fired when po_payments.state transitions to ''due'' from a non-due state '
  '(00184 lifecycle triggers, manual flips, or the daily po-payments-due-daily pg_cron job from 00189). '
  'delivery_this_week: produced by the delivery-this-week-weekly pg_cron job (00189). '
  'damage_claim_drafted: fired on INSERT into damage_claims with state = ''drafted''. '
  'payment_received / payment_failed: fired by the stripe-webhook po_payment branch (00266) when an '
  '"Order via Patina" purchase-order payment settles or its ACH transfer fails.';
