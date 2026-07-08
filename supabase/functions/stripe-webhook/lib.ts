// Pure helpers for stripe-webhook — extracted so the event-shape parsing and
// the checkout.session.completed settle/stamp/no-op decision are testable
// without booting Deno.serve or touching Stripe/Supabase over the network.
// Run: deno test supabase/functions/stripe-webhook/lib.test.ts

import type Stripe from 'npm:stripe@17';

/** Pulls the three ids the payment-row resolution chain needs off a session. */
export function sessionIds(session: Stripe.Checkout.Session): {
  sessionId: string;
  paymentIntentId: string | null;
  invoiceId: string | null;
} {
  return {
    sessionId: session.id,
    paymentIntentId:
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id ?? null,
    invoiceId: session.metadata?.invoice_id ?? null,
  };
}

export type SessionCompletedAction =
  | { kind: 'settle' }
  | { kind: 'stamp_payment_intent' }
  | { kind: 'noop' };

/**
 * Decides what checkout.session.completed should do to the payment row.
 * Pure — no network calls.
 *
 * Card payments settle immediately (payment_status 'paid') → settle.
 * ACH payments come back 'unpaid' at completion time (the debit is still in
 * flight) → stamp the payment_intent id and leave the row pending; the
 * checkout.session.async_payment_succeeded/failed event settles it 3–5
 * business days later. This is the dedupe the async events rely on:
 * `completed` fires for ACH too, but only ever settles when payment_status
 * is 'paid' — never on the strength of `completed` alone for an ACH intent.
 *
 * `stamp_payment_intent` is skipped once the row already has one, so a
 * duplicate/retried `completed` delivery is a no-op (idempotent).
 */
export function decideSessionCompletedAction(
  paymentStatus: Stripe.Checkout.Session.PaymentStatus,
  paymentIntentId: string | null,
  rowHasPaymentIntentId: boolean
): SessionCompletedAction {
  if (paymentStatus === 'paid') return { kind: 'settle' };
  if (paymentIntentId && !rowHasPaymentIntentId) return { kind: 'stamp_payment_intent' };
  return { kind: 'noop' };
}
