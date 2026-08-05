/** Exact claimed-invoice payment identity, isolated for Stripe-free tests. */

export interface ClaimedCheckoutAttempt {
  id: string;
  invoice_id: string;
  payer_id: string;
  stripe_customer_id: string;
  /** NET claimed balance. Stripe charged this PLUS surcharge_cents. */
  amount_cents: number;
  /** Rail fee charged on top. 0 for legacy/no-method attempts. */
  surcharge_cents: number;
  /** 'card' | 'us_bank_account' | null (legacy — both rails were offered). */
  payment_method: string | null;
  currency: string;
  state: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
}

export interface ClaimedInvoicePayment {
  id: string;
  invoice_id: string;
  amount_cents: number;
  /** Must equal the attempt's fee — the claim writes both in one transaction. */
  surcharge_cents: number;
  method: string;
  status: string;
  checkout_attempt_id: string | null;
  recorded_by: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_payment_method_type?: string | null;
}

export interface ClaimedCheckoutEvidence {
  attemptId: string;
  invoiceId: string | null;
  payerId: string | null;
  sessionId: string | null;
  paymentIntentId: string | null;
  customerId: string | null;
  amountCents: number | null;
  currency: string | null;
}

export interface ClaimedCheckoutReader {
  loadAttempt(attemptId: string): Promise<ClaimedCheckoutAttempt | null>;
  loadPayment(attemptId: string): Promise<ClaimedInvoicePayment | null>;
}

export interface ClaimedSessionEvidenceWriter {
  finalizeActive(): Promise<void>;
  recoverTerminal(): Promise<void>;
}

export class ClaimedCheckoutIntegrityError extends Error {
  constructor(
    public readonly code:
      | 'attempt_missing'
      | 'payment_missing'
      | 'identity_mismatch'
      | 'session_persistence_failed',
    message: string
  ) {
    super(message);
    this.name = 'ClaimedCheckoutIntegrityError';
  }
}

/**
 * There is deliberately no invoice-latest fallback in this API. Once Stripe
 * metadata names an attempt, only that attempt and its one payment may settle.
 */
export async function resolveExactClaimedPayment(
  reader: ClaimedCheckoutReader,
  input: ClaimedCheckoutEvidence
): Promise<ClaimedInvoicePayment> {
  const attempt = await reader.loadAttempt(input.attemptId);
  if (!attempt) {
    throw new ClaimedCheckoutIntegrityError(
      'attempt_missing',
      `claimed Checkout attempt ${input.attemptId} is missing`
    );
  }
  const payment = await reader.loadPayment(input.attemptId);
  if (!payment) {
    throw new ClaimedCheckoutIntegrityError(
      'payment_missing',
      `claimed Checkout attempt ${input.attemptId} has no persisted payment row`
    );
  }

  // Stripe reports the GROSS it charged: the claimed balance plus the rail fee.
  // A legacy attempt has surcharge_cents = 0, so this is the old assertion
  // exactly. The two rows' fees must also agree — the claim wrote them in one
  // transaction, so a divergence means someone edited money out of band.
  const expectedGrossCents = attempt.amount_cents + attempt.surcharge_cents;

  const mismatch =
    input.invoiceId !== attempt.invoice_id ||
    input.payerId !== attempt.payer_id ||
    input.customerId !== attempt.stripe_customer_id ||
    input.amountCents !== expectedGrossCents ||
    input.currency?.toLowerCase() !== attempt.currency.toLowerCase() ||
    payment.checkout_attempt_id !== attempt.id ||
    payment.invoice_id !== attempt.invoice_id ||
    payment.recorded_by !== attempt.payer_id ||
    payment.amount_cents !== attempt.amount_cents ||
    payment.surcharge_cents !== attempt.surcharge_cents ||
    payment.method !== 'stripe' ||
    payment.stripe_checkout_session_id !== attempt.stripe_checkout_session_id ||
    (payment.stripe_payment_intent_id !== null &&
      attempt.stripe_payment_intent_id !== null &&
      payment.stripe_payment_intent_id !== attempt.stripe_payment_intent_id) ||
    (input.sessionId !== null &&
      ((attempt.stripe_checkout_session_id !== null &&
        attempt.stripe_checkout_session_id !== input.sessionId) ||
        (payment.stripe_checkout_session_id !== null &&
          payment.stripe_checkout_session_id !== input.sessionId))) ||
    (input.paymentIntentId !== null &&
      attempt.stripe_payment_intent_id !== null &&
      attempt.stripe_payment_intent_id !== input.paymentIntentId) ||
    (input.paymentIntentId !== null &&
      payment.stripe_payment_intent_id !== null &&
      payment.stripe_payment_intent_id !== input.paymentIntentId);

  if (mismatch) {
    throw new ClaimedCheckoutIntegrityError(
      'identity_mismatch',
      `Checkout attempt identity mismatch for ${input.attemptId}`
    );
  }
  return payment;
}

/** The subset of a Checkout Session / PaymentIntent this inference reads. */
export interface UsedPaymentMethodEvidence {
  payment_method_types?: string[] | null;
  payment_status?: string | null;
}

/**
 * Which rail actually took the money, inferred from the signed Stripe object.
 *
 * Deliberately conservative: it returns null rather than guessing, and null
 * makes `settle_invoice_checkout_payment` fall back to the rail the attempt
 * claimed. Order matters — a rail-restricted session states its answer
 * outright, so that is read first; only an unrestricted (legacy) session needs
 * the event type as a tiebreaker.
 *
 *  - exactly one entry in payment_method_types  → that rail (restricted session)
 *  - checkout.session.async_payment_succeeded/failed → us_bank_account
 *    (only a delayed-notification method produces those events)
 *  - checkout.session.completed with payment_status 'paid' → card
 *    (an ACH debit completes 'unpaid' and settles later, so an immediately-paid
 *    completion on a card+ACH session was a card)
 *  - anything else → null
 */
export function usedPaymentMethodType(
  session: UsedPaymentMethodEvidence,
  eventType: string
): string | null {
  const types = session.payment_method_types ?? [];
  if (types.length === 1) return types[0];
  if (eventType.startsWith('checkout.session.async_payment_')) return 'us_bank_account';
  if (eventType === 'checkout.session.completed' && session.payment_status === 'paid') {
    return 'card';
  }
  return null;
}

/** The subset of a Stripe Charge that refund classification reads. */
export interface RefundChargeShape {
  /** Stripe's own "fully refunded" boolean. */
  refunded: boolean;
  /** Running total refunded across every refund on the charge. */
  amountRefundedCents: number;
  /**
   * What Stripe actually captured. For an invoice payment that is the GROSS —
   * the net applied to the invoice PLUS the rail surcharge line.
   */
  amountCapturedCents: number;
}

/**
 * Full-refund test for payables whose captured amount IS the payable amount:
 * po_payments and direct_orders. No surcharge exists on those rails, so
 * captured == amount and this is the original 00277 rule verbatim.
 */
export function isFullCapturedRefund(charge: RefundChargeShape): boolean {
  if (charge.refunded === true) return true;
  return charge.amountCapturedCents > 0 && charge.amountRefundedCents >= charge.amountCapturedCents;
}

/**
 * Full-refund test for an INVOICE payment, classified against the NET applied
 * amount rather than the gross Stripe captured.
 *
 * Why net: `invoice_payments.amount_cents` is the invoice-applied money and the
 * surcharge rides beside it (00428 invariant #1). The refunded-state flip
 * reverses only that net accounting — the 00277 contra reopens the invoice and
 * reverses earnings for `amount_cents`; the surcharge never entered the rollup
 * or earnings at all. So a designer who refunds the NET (the only number any
 * Patina surface shows them) has fully undone everything Patina booked, and the
 * books stay exact. A gross refund is >= net, so it still classifies full.
 *
 * Refunding ONLY the fee ($30 of a $1,030 charge) is correctly partial: the
 * invoice's money is untouched.
 *
 * Legacy/no-method payments carry surcharge_cents = 0, so captured == net and
 * this reduces to `isFullCapturedRefund` exactly.
 */
export function isFullInvoiceRefund(
  charge: RefundChargeShape,
  netAppliedCents: number
): boolean {
  if (charge.refunded === true) return true;
  // A non-positive net can't be "fully refunded" by amount; fall back to the
  // captured rule so the zero-captured edge behaves exactly as it always did.
  if (netAppliedCents <= 0) return isFullCapturedRefund(charge);
  return charge.amountRefundedCents >= netAppliedCents;
}

/**
 * Persist exact signed-session evidence before settlement. Active attempts use
 * normal finalization. If local state was already closed, the service-only
 * fallback may stamp the same exact evidence for reconciliation without
 * reopening the attempt. A PI-only event can never invent a session pointer.
 */
export async function persistSignedSessionEvidence(
  payment: ClaimedInvoicePayment,
  input: ClaimedCheckoutEvidence,
  writer: ClaimedSessionEvidenceWriter
): Promise<'unchanged' | 'finalized_active' | 'recovered_terminal'> {
  if (payment.stripe_checkout_session_id !== null) return 'unchanged';
  if (input.sessionId === null) {
    throw new ClaimedCheckoutIntegrityError(
      'session_persistence_failed',
      `claimed Checkout attempt ${input.attemptId} is not finalized`
    );
  }

  try {
    await writer.finalizeActive();
    payment.stripe_checkout_session_id = input.sessionId;
    return 'finalized_active';
  } catch (finalizeError) {
    try {
      await writer.recoverTerminal();
      payment.stripe_checkout_session_id = input.sessionId;
      return 'recovered_terminal';
    } catch (recoveryError) {
      const finalizeDetail =
        finalizeError instanceof Error ? finalizeError.message : 'active finalization failed';
      const recoveryDetail =
        recoveryError instanceof Error ? recoveryError.message : 'terminal recovery failed';
      throw new ClaimedCheckoutIntegrityError(
        'session_persistence_failed',
        `could not persist exact session evidence for ${input.attemptId}: ${finalizeDetail}; ${recoveryDetail}`
      );
    }
  }
}
