import type { InvoicePayment } from '@patina/supabase';
import { resolveReturnedCheckoutPayment } from '../checkout-return';

function payment(overrides: Partial<InvoicePayment> = {}): InvoicePayment {
  return {
    id: 'payment-1',
    invoice_id: 'invoice-1',
    checkout_attempt_id: 'attempt-1',
    amount_cents: 12_345,
    method: 'stripe',
    status: 'pending',
    stripe_checkout_session_id: 'cs_returned',
    stripe_payment_intent_id: null,
    stripe_event_id: null,
    reference: null,
    note: null,
    recorded_by: null,
    received_at: null,
    created_at: '2026-07-31T12:00:00.000Z',
    updated_at: '2026-07-31T12:00:00.000Z',
    ...overrides,
  };
}

describe('resolveReturnedCheckoutPayment', () => {
  const identity = {
    sessionId: 'cs_returned',
    checkoutAttemptId: 'attempt-1',
    paymentId: 'payment-1',
  };

  it('does not borrow success from a different checkout session', () => {
    const result = resolveReturnedCheckoutPayment(
      [
        payment({
          id: 'other',
          status: 'succeeded',
          stripe_checkout_session_id: 'cs_other',
        }),
      ],
      identity,
    );

    expect(result).toEqual({ payment: null, state: 'waiting' });
  });

  it('reports completion only from the exact succeeded payment', () => {
    const exact = payment({ status: 'succeeded' });

    expect(resolveReturnedCheckoutPayment([exact], identity)).toEqual({
      payment: exact,
      state: 'confirmed',
    });
  });

  it('distinguishes provider processing from a webhook that has not arrived', () => {
    expect(
      resolveReturnedCheckoutPayment(
        [payment({ stripe_payment_intent_id: 'pi_processing' })],
        identity,
      ).state,
    ).toBe('processing');
    expect(resolveReturnedCheckoutPayment([payment()], identity).state).toBe('waiting');
  });

  it('distinguishes failed, refunded, and refund-reconciliation states', () => {
    expect(resolveReturnedCheckoutPayment([payment({ status: 'failed' })], identity).state).toBe(
      'failed',
    );
    expect(resolveReturnedCheckoutPayment([payment({ status: 'refunded' })], identity).state).toBe(
      'refunded',
    );
    expect(
      resolveReturnedCheckoutPayment([payment({ status: 'requires_refund' })], identity).state,
    ).toBe('requires_refund');
  });

  it('resolves a cancellation by exact attempt/payment identity without a session id', () => {
    const exact = payment({ stripe_checkout_session_id: null });
    expect(
      resolveReturnedCheckoutPayment([exact], {
        sessionId: null,
        checkoutAttemptId: 'attempt-1',
        paymentId: 'payment-1',
      }).payment,
    ).toBe(exact);
  });

  it('fails closed when any supplied identity field disagrees', () => {
    expect(
      resolveReturnedCheckoutPayment([payment()], {
        ...identity,
        checkoutAttemptId: 'attempt-foreign',
      }),
    ).toEqual({ payment: null, state: 'waiting' });
  });
});
