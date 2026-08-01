import type { InvoicePayment } from '@patina/supabase';

export type ReturnedCheckoutState =
  | 'waiting'
  | 'processing'
  | 'confirmed'
  | 'failed'
  | 'refunded'
  | 'requires_refund';

export interface ReturnedCheckoutIdentity {
  sessionId: string | null;
  checkoutAttemptId: string | null;
  paymentId: string | null;
}

export interface ReturnedCheckoutPayment {
  payment: InvoicePayment | null;
  state: ReturnedCheckoutState;
}

/**
 * Resolve only the payment created for the Checkout session that returned to
 * this page. Invoice-level status is intentionally insufficient: another
 * manual or Stripe payment can settle the invoice while this session remains
 * unconfirmed.
 */
export function resolveReturnedCheckoutPayment(
  payments: InvoicePayment[] | undefined,
  identity: ReturnedCheckoutIdentity,
): ReturnedCheckoutPayment {
  const { sessionId, checkoutAttemptId, paymentId } = identity;
  if (!sessionId && !checkoutAttemptId && !paymentId) {
    return { payment: null, state: 'waiting' };
  }

  const payment =
    payments?.find(
      (candidate) =>
        (sessionId === null || candidate.stripe_checkout_session_id === sessionId) &&
        (checkoutAttemptId === null || candidate.checkout_attempt_id === checkoutAttemptId) &&
        (paymentId === null || candidate.id === paymentId),
    ) ?? null;

  if (!payment) return { payment: null, state: 'waiting' };
  if (payment.status === 'succeeded') return { payment, state: 'confirmed' };
  if (payment.status === 'refunded') return { payment, state: 'refunded' };
  if (payment.status === 'requires_refund') return { payment, state: 'requires_refund' };
  if (payment.status === 'failed') return { payment, state: 'failed' };
  if (payment.status === 'pending' && payment.stripe_payment_intent_id) {
    return { payment, state: 'processing' };
  }

  return { payment, state: 'waiting' };
}
