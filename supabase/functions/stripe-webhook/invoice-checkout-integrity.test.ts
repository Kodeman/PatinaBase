import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  ClaimedCheckoutIntegrityError,
  type ClaimedCheckoutReader,
  type ClaimedCheckoutEvidence,
  type ClaimedCheckoutAttempt,
  type ClaimedInvoicePayment,
  persistSignedSessionEvidence,
  resolveExactClaimedPayment,
} from './invoice-checkout-integrity.ts';

const attempt: ClaimedCheckoutAttempt = {
  id: 'attempt-1',
  invoice_id: 'invoice-1',
  payer_id: 'client-1',
  stripe_customer_id: 'cus_client_1',
  amount_cents: 10_000,
  currency: 'usd',
  state: 'session_created',
  stripe_checkout_session_id: 'cs_attempt_1',
  stripe_payment_intent_id: null,
};

const payment: ClaimedInvoicePayment = {
  id: 'payment-1',
  invoice_id: 'invoice-1',
  amount_cents: 10_000,
  method: 'stripe',
  status: 'pending',
  checkout_attempt_id: 'attempt-1',
  recorded_by: 'client-1',
  stripe_checkout_session_id: 'cs_attempt_1',
  stripe_payment_intent_id: null,
};

const evidence: ClaimedCheckoutEvidence = {
  attemptId: 'attempt-1',
  invoiceId: 'invoice-1',
  payerId: 'client-1',
  sessionId: 'cs_attempt_1',
  paymentIntentId: 'pi_attempt_1',
  customerId: 'cus_client_1',
  amountCents: 10_000,
  currency: 'usd',
};

function reader(
  attemptValue: ClaimedCheckoutAttempt | null = attempt,
  paymentValue: ClaimedInvoicePayment | null = payment
): ClaimedCheckoutReader {
  return {
    loadAttempt: async () => attemptValue,
    loadPayment: async () => paymentValue,
  };
}

Deno.test(
  'claimed webhook: exact attempt/payment/session/payer/customer/money tuple resolves',
  async () => {
    assertEquals(await resolveExactClaimedPayment(reader(), evidence), payment);
  }
);

Deno.test('claimed webhook: missing attempt and persistence-race payment fail closed', async () => {
  await assertRejects(
    () => resolveExactClaimedPayment(reader(null, payment), evidence),
    ClaimedCheckoutIntegrityError,
    'attempt attempt-1 is missing'
  );
  await assertRejects(
    () => resolveExactClaimedPayment(reader(attempt, null), evidence),
    ClaimedCheckoutIntegrityError,
    'has no persisted payment row'
  );
});

Deno.test(
  'claimed webhook: signed exact session may recover an unfinalized pointer race',
  async () => {
    const unfinalizedAttempt = {
      ...attempt,
      state: 'claimed',
      stripe_checkout_session_id: null,
    };
    const unfinalizedPayment = {
      ...payment,
      stripe_checkout_session_id: null,
    };
    assertEquals(
      await resolveExactClaimedPayment(reader(unfinalizedAttempt, unfinalizedPayment), evidence),
      unfinalizedPayment
    );
  }
);

Deno.test(
  'claimed webhook: tampered metadata cannot fall through to another pending row',
  async () => {
    for (const changed of [
      { attemptId: 'attempt-foreign' },
      { invoiceId: 'invoice-foreign' },
      { payerId: 'client-foreign' },
      { customerId: 'cus_foreign' },
      { sessionId: 'cs_foreign' },
      { amountCents: 9_999 },
      { currency: 'eur' },
    ] satisfies Array<Partial<ClaimedCheckoutEvidence>>) {
      const exactAttemptReader: ClaimedCheckoutReader = {
        loadAttempt: async (attemptId) => (attemptId === attempt.id ? attempt : null),
        // This deliberately contains no invoice-latest lookup API. Even though a
        // hypothetical other pending row exists, it is unreachable by design.
        loadPayment: async (attemptId) => (attemptId === attempt.id ? payment : null),
      };
      await assertRejects(
        () => resolveExactClaimedPayment(exactAttemptReader, { ...evidence, ...changed }),
        ClaimedCheckoutIntegrityError
      );
    }
  }
);

Deno.test('claimed webhook: payment-row identity tampering is rejected', async () => {
  for (const changed of [
    { checkout_attempt_id: 'attempt-foreign' },
    { invoice_id: 'invoice-foreign' },
    { recorded_by: 'client-foreign' },
    { amount_cents: 9_999 },
    { method: 'check' },
    { stripe_checkout_session_id: null },
    { stripe_checkout_session_id: 'cs_foreign' },
  ] satisfies Array<Partial<ClaimedInvoicePayment>>) {
    await assertRejects(
      () => resolveExactClaimedPayment(reader(attempt, { ...payment, ...changed }), evidence),
      ClaimedCheckoutIntegrityError,
      'identity mismatch'
    );
  }
});

Deno.test(
  'claimed webhook: PI-first event may stamp an empty PI but cannot replace a different PI',
  async () => {
    assertEquals(await resolveExactClaimedPayment(reader(), evidence), payment);
    await assertRejects(
      () =>
        resolveExactClaimedPayment(
          reader({ ...attempt, stripe_payment_intent_id: 'pi_other' }, payment),
          evidence
        ),
      ClaimedCheckoutIntegrityError,
      'identity mismatch'
    );
  }
);

Deno.test(
  'claimed webhook: signed session falls back to terminal evidence recovery without exposing it',
  async () => {
    const unfinalizedPayment = { ...payment, status: 'failed', stripe_checkout_session_id: null };
    const calls: string[] = [];
    const result = await persistSignedSessionEvidence(unfinalizedPayment, evidence, {
      async finalizeActive() {
        calls.push('finalize_active');
        throw new Error('invoice_checkout_attempt_not_active:failed');
      },
      async recoverTerminal() {
        calls.push('recover_terminal');
      },
    });

    assertEquals(result, 'recovered_terminal');
    assertEquals(calls, ['finalize_active', 'recover_terminal']);
    assertEquals(unfinalizedPayment.status, 'failed');
    assertEquals(unfinalizedPayment.stripe_checkout_session_id, 'cs_attempt_1');
  }
);

Deno.test('claimed webhook: PI-only evidence cannot invent a missing session pointer', async () => {
  await assertRejects(
    () =>
      persistSignedSessionEvidence(
        { ...payment, stripe_checkout_session_id: null },
        { ...evidence, sessionId: null },
        {
          finalizeActive: async () => {},
          recoverTerminal: async () => {},
        }
      ),
    ClaimedCheckoutIntegrityError,
    'is not finalized'
  );
});
