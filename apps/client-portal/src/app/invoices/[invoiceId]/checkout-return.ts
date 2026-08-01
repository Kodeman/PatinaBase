import type { InvoicePayment } from '@patina/supabase';

export type ReturnedCheckoutState = 'waiting' | 'processing' | 'confirmed' | 'failed';

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
  sessionId: string | null,
): ReturnedCheckoutPayment {
  if (!sessionId) return { payment: null, state: 'waiting' };

  const payment =
    payments?.find((candidate) => candidate.stripe_checkout_session_id === sessionId) ?? null;

  if (!payment) return { payment: null, state: 'waiting' };
  if (payment.status === 'succeeded') return { payment, state: 'confirmed' };
  if (payment.status === 'failed' || payment.status === 'refunded') {
    return { payment, state: 'failed' };
  }
  if (payment.status === 'pending' && payment.stripe_payment_intent_id) {
    return { payment, state: 'processing' };
  }

  return { payment, state: 'waiting' };
}
