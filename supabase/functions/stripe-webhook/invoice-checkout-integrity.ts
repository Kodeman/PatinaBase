/** Exact claimed-invoice payment identity, isolated for Stripe-free tests. */

export interface ClaimedCheckoutAttempt {
  id: string;
  invoice_id: string;
  payer_id: string;
  stripe_customer_id: string;
  amount_cents: number;
  currency: string;
  state: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
}

export interface ClaimedInvoicePayment {
  id: string;
  invoice_id: string;
  amount_cents: number;
  method: string;
  status: string;
  checkout_attempt_id: string | null;
  recorded_by: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
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

  const mismatch =
    input.invoiceId !== attempt.invoice_id ||
    input.payerId !== attempt.payer_id ||
    input.customerId !== attempt.stripe_customer_id ||
    input.amountCents !== attempt.amount_cents ||
    input.currency?.toLowerCase() !== attempt.currency.toLowerCase() ||
    payment.checkout_attempt_id !== attempt.id ||
    payment.invoice_id !== attempt.invoice_id ||
    payment.recorded_by !== attempt.payer_id ||
    payment.amount_cents !== attempt.amount_cents ||
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
