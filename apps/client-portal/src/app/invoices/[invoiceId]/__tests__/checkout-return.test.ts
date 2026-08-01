import type { InvoicePayment } from '@patina/supabase';
import { resolveReturnedCheckoutPayment } from '../checkout-return';

function payment(overrides: Partial<InvoicePayment> = {}): InvoicePayment {
  return {
    id: 'payment-1',
    invoice_id: 'invoice-1',
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
  it('does not borrow success from a different checkout session', () => {
    const result = resolveReturnedCheckoutPayment(
      [
        payment({
          id: 'other',
          status: 'succeeded',
          stripe_checkout_session_id: 'cs_other',
        }),
      ],
      'cs_returned',
    );

    expect(result).toEqual({ payment: null, state: 'waiting' });
  });

  it('reports completion only from the exact succeeded payment', () => {
    const exact = payment({ status: 'succeeded' });

    expect(resolveReturnedCheckoutPayment([exact], 'cs_returned')).toEqual({
      payment: exact,
      state: 'confirmed',
    });
  });

  it('distinguishes provider processing from a webhook that has not arrived', () => {
    expect(
      resolveReturnedCheckoutPayment(
        [payment({ stripe_payment_intent_id: 'pi_processing' })],
        'cs_returned',
      ).state,
    ).toBe('processing');
    expect(resolveReturnedCheckoutPayment([payment()], 'cs_returned').state).toBe('waiting');
  });

  it.each(['failed', 'refunded'] as const)(
    'does not present a %s payment as completed',
    (status) => {
      expect(resolveReturnedCheckoutPayment([payment({ status })], 'cs_returned').state).toBe(
        'failed',
      );
    },
  );
});
