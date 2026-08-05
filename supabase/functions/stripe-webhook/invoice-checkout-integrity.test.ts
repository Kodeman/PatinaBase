import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  ClaimedCheckoutIntegrityError,
  type ClaimedCheckoutReader,
  type ClaimedCheckoutEvidence,
  type ClaimedCheckoutAttempt,
  type ClaimedInvoicePayment,
  isFullCapturedRefund,
  isFullInvoiceRefund,
  persistSignedSessionEvidence,
  type RefundChargeShape,
  resolveExactClaimedPayment,
  usedPaymentMethodType,
} from './invoice-checkout-integrity.ts';

// Baseline fixtures are LEGACY (no rail, no fee) so every pre-surcharge
// assertion in this file still describes the exact behavior it always did.
const attempt: ClaimedCheckoutAttempt = {
  id: 'attempt-1',
  invoice_id: 'invoice-1',
  payer_id: 'client-1',
  stripe_customer_id: 'cus_client_1',
  amount_cents: 10_000,
  surcharge_cents: 0,
  payment_method: null,
  currency: 'usd',
  state: 'session_created',
  stripe_checkout_session_id: 'cs_attempt_1',
  stripe_payment_intent_id: null,
};

const payment: ClaimedInvoicePayment = {
  id: 'payment-1',
  invoice_id: 'invoice-1',
  amount_cents: 10_000,
  surcharge_cents: 0,
  method: 'stripe',
  status: 'pending',
  checkout_attempt_id: 'attempt-1',
  recorded_by: 'client-1',
  stripe_checkout_session_id: 'cs_attempt_1',
  stripe_payment_intent_id: null,
  stripe_payment_method_type: null,
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

// ── Surcharge (00428) ───────────────────────────────────────────────────────

Deno.test('claimed webhook: Stripe must report the GROSS charge, not the balance', async () => {
  // $100.00 balance + $3.00 card fee → Stripe charged $103.00.
  const surcharged = { ...attempt, surcharge_cents: 300, payment_method: 'card' };
  const surchargedPayment = { ...payment, surcharge_cents: 300 };
  const grossReader = reader(surcharged, surchargedPayment);

  assertEquals(
    await resolveExactClaimedPayment(grossReader, { ...evidence, amountCents: 10_300 }),
    surchargedPayment
  );

  for (const amountCents of [
    10_000, // the fee never reached Stripe — the invoice would settle short
    10_600, // charged the fee twice
    null, // Stripe reported nothing usable
  ]) {
    await assertRejects(
      () => resolveExactClaimedPayment(grossReader, { ...evidence, amountCents }),
      ClaimedCheckoutIntegrityError,
      'identity mismatch'
    );
  }
});

Deno.test('claimed webhook: attempt and payment must agree on the fee', async () => {
  // The claim writes both rows in one transaction, so a divergence means money
  // moved out of band. Either direction of drift is refused.
  for (const [attemptFee, paymentFee] of [
    [300, 0],
    [0, 300],
    [300, 250],
  ]) {
    await assertRejects(
      () =>
        resolveExactClaimedPayment(
          reader(
            { ...attempt, surcharge_cents: attemptFee },
            { ...payment, surcharge_cents: paymentFee }
          ),
          { ...evidence, amountCents: 10_000 + attemptFee }
        ),
      ClaimedCheckoutIntegrityError,
      'identity mismatch'
    );
  }
});

Deno.test('claimed webhook: the settled rail is inferred only when Stripe is unambiguous', () => {
  // A rail-restricted session states its answer outright.
  assertEquals(
    usedPaymentMethodType(
      { payment_method_types: ['us_bank_account'], payment_status: 'unpaid' },
      'checkout.session.completed'
    ),
    'us_bank_account'
  );
  assertEquals(
    usedPaymentMethodType(
      { payment_method_types: ['card'], payment_status: 'paid' },
      'checkout.session.completed'
    ),
    'card'
  );
  // Legacy card+ACH session: only a delayed-notification method produces an
  // async_payment_* event, and only a card completes already-paid.
  const bothRails = ['card', 'us_bank_account'];
  assertEquals(
    usedPaymentMethodType(
      { payment_method_types: bothRails, payment_status: 'unpaid' },
      'checkout.session.async_payment_succeeded'
    ),
    'us_bank_account'
  );
  assertEquals(
    usedPaymentMethodType(
      { payment_method_types: bothRails, payment_status: 'unpaid' },
      'checkout.session.async_payment_failed'
    ),
    'us_bank_account'
  );
  assertEquals(
    usedPaymentMethodType(
      { payment_method_types: bothRails, payment_status: 'paid' },
      'checkout.session.completed'
    ),
    'card'
  );
  // Everything ambiguous stays null so the settle RPC uses the claimed rail
  // rather than a guess.
  assertEquals(
    usedPaymentMethodType(
      { payment_method_types: bothRails, payment_status: 'unpaid' },
      'checkout.session.completed'
    ),
    null
  );
  assertEquals(usedPaymentMethodType({}, 'payment_intent.succeeded'), null);
  assertEquals(
    usedPaymentMethodType({ payment_method_types: null }, 'checkout.session.completed'),
    null
  );
});

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

// ─────────────────────────────────────────────────────────────────────────────
// Refund classification (00428). invoice_payments.amount_cents is NET; Stripe
// captured the GROSS (net + surcharge). Classifying an invoice refund against
// captured would call a net refund "partial" — the invoice would stay 'paid'
// and earnings would never reverse. These fix that boundary.
// ─────────────────────────────────────────────────────────────────────────────

/** $1,000.00 invoice paid on card at 3% → Stripe captured $1,030.00. */
const surchargedCharge = (refundedCents: number, fullyRefunded = false): RefundChargeShape => ({
  refunded: fullyRefunded,
  amountRefundedCents: refundedCents,
  amountCapturedCents: 103_000,
});

Deno.test('refund classification: refunding the NET invoice amount is FULL', () => {
  // The designer refunds $1,000.00 — the only figure any Patina surface shows
  // them. Everything Patina booked is undone, so the invoice must reopen.
  assertEquals(isFullInvoiceRefund(surchargedCharge(100_000), 100_000), true);
});

Deno.test('refund classification: a fee-only refund is PARTIAL', () => {
  // $30.00 of a $1,030.00 charge — the invoice's money is untouched.
  assertEquals(isFullInvoiceRefund(surchargedCharge(3_000), 100_000), false);
  // One cent short of net is still partial.
  assertEquals(isFullInvoiceRefund(surchargedCharge(99_999), 100_000), false);
});

Deno.test('refund classification: the GROSS refund is FULL', () => {
  assertEquals(isFullInvoiceRefund(surchargedCharge(103_000, true), 100_000), true);
  // …and still full when Stripe's own boolean is somehow absent.
  assertEquals(isFullInvoiceRefund(surchargedCharge(103_000), 100_000), true);
});

Deno.test('refund classification: anything between NET and GROSS is FULL', () => {
  // Net plus part of the fee: the booked money is fully reversed.
  assertEquals(isFullInvoiceRefund(surchargedCharge(101_500), 100_000), true);
  assertEquals(isFullInvoiceRefund(surchargedCharge(100_001), 100_000), true);
});

Deno.test('refund classification: legacy zero-surcharge behavior is unchanged', () => {
  // captured == net on a legacy payment, so net-based and captured-based
  // classification agree case for case.
  const legacy = (refundedCents: number, fullyRefunded = false): RefundChargeShape => ({
    refunded: fullyRefunded,
    amountRefundedCents: refundedCents,
    amountCapturedCents: 100_000,
  });
  for (const [refundedCents, fullyRefunded] of [
    [0, false],
    [1, false],
    [50_000, false],
    [99_999, false],
    [100_000, false],
    [100_000, true],
  ] as Array<[number, boolean]>) {
    assertEquals(
      isFullInvoiceRefund(legacy(refundedCents, fullyRefunded), 100_000),
      isFullCapturedRefund(legacy(refundedCents, fullyRefunded)),
      `legacy divergence at refunded=${refundedCents} refunded_flag=${fullyRefunded}`
    );
  }
  // The zero-captured edge: no amount can make it full, only Stripe's boolean.
  const zero = { refunded: false, amountRefundedCents: 0, amountCapturedCents: 0 };
  assertEquals(isFullInvoiceRefund(zero, 0), false);
  assertEquals(isFullCapturedRefund(zero), false);
  assertEquals(isFullInvoiceRefund({ ...zero, refunded: true }, 0), true);
});

Deno.test('refund classification: a requires_refund row is measured against CAPTURED', () => {
  // A requires_refund payment was NEVER applied to the invoice — Patina booked
  // nothing, so there is no net accounting to reverse and the client is owed
  // the whole gross Stripe took. $1,000.00 on card at 2.5% → captured
  // $1,025.00, with amount_cents still carrying the net $1,000.00.
  //
  // `isFullInvoiceRefund` only ever sees numbers; index.ts picks WHICH number
  // by row status (`status === 'requires_refund' ? shape.amountCapturedCents :
  // invoiceRow.amount_cents`), so the status branch lives at the call site and
  // these cases assert the two thresholds it chooses between.
  const unapplied = (refundedCents: number, fullyRefunded = false): RefundChargeShape => ({
    refunded: fullyRefunded,
    amountRefundedCents: refundedCents,
    amountCapturedCents: 102_500,
  });
  const netAppliedCents = 100_000;

  // Refunding only the net leaves the client $25.00 short of whole. Measured
  // against captured — the threshold a requires_refund row gets — that is
  // correctly PARTIAL.
  assertEquals(isFullInvoiceRefund(unapplied(100_000), 102_500), false);
  // The gross refund makes the client whole: FULL.
  assertEquals(isFullInvoiceRefund(unapplied(102_500), 102_500), true);
  // One cent short of gross is still partial; Stripe's own boolean still wins.
  assertEquals(isFullInvoiceRefund(unapplied(102_499), 102_500), false);
  assertEquals(isFullInvoiceRefund(unapplied(100_000, true), 102_500), true);

  // The hole this closes: the same net-only refund on the NET threshold (what
  // an applied payment correctly uses) classifies FULL. Applying that to an
  // unapplied row would call the client whole while they are still owed the fee.
  assertEquals(isFullInvoiceRefund(unapplied(100_000), netAppliedCents), true);
});

Deno.test('refund classification: po/direct_order still measure against captured', () => {
  // No surcharge exists on those rails — captured IS the payable amount.
  assertEquals(isFullCapturedRefund(surchargedCharge(100_000)), false);
  assertEquals(isFullCapturedRefund(surchargedCharge(103_000)), true);
  assertEquals(isFullCapturedRefund(surchargedCharge(3_000, true)), true);
});
