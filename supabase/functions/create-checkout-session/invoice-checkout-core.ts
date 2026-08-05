/**
 * Stripe-free invoice Checkout coordinator.
 *
 * The index.ts adapter supplies a database + Stripe gateway. Keeping this
 * state machine free of SDK/network imports lets us exercise concurrent tabs,
 * idempotent creation, payer isolation, stale sessions, and fail-closed
 * persistence entirely with deterministic fakes.
 */

/** The two online rails a client may be steered onto. NULL = legacy (both). */
export type InvoiceCheckoutPaymentMethod = 'card' | 'us_bank_account';

export interface InvoiceCheckoutAttempt {
  attemptId: string;
  paymentId: string;
  invoiceId: string;
  payerId: string;
  stripeCustomerId: string;
  /** The authoritative claimed invoice balance — NET, never including the fee. */
  amountCents: number;
  /**
   * Processing fee charged ON TOP of amountCents. Stripe's amount_total must
   * equal amountCents + surchargeCents. Legacy/no-method attempts carry 0, so
   * every assertion below reduces to its pre-surcharge form byte for byte.
   */
  surchargeCents: number;
  /** null = legacy attempt: both rails offered, no fee, no metadata key. */
  paymentMethod: InvoiceCheckoutPaymentMethod | null;
  currency: string;
  state: 'claimed' | 'session_created' | 'processing';
  stripeIdempotencyKey: string;
  stripeCheckoutSessionId: string | null;
  /**
   * The Stripe session id of an attempt this claim just superseded (rail or fee
   * changed). Best-effort expiry only — never load-bearing.
   */
  supersededSessionId: string | null;
}

export interface InvoiceCheckoutSession {
  id: string;
  status: 'open' | 'complete' | 'expired' | null;
  paymentStatus?: 'paid' | 'unpaid' | 'no_payment_required' | null;
  url: string | null;
  amountTotal: number | null;
  currency: string | null;
  customerId: string | null;
  metadata: Record<string, string>;
}

export interface InvoiceCheckoutGateway {
  claim(): Promise<InvoiceCheckoutAttempt>;
  retrieveSession(sessionId: string): Promise<InvoiceCheckoutSession>;
  createSession(attempt: InvoiceCheckoutAttempt): Promise<InvoiceCheckoutSession>;
  finalize(attempt: InvoiceCheckoutAttempt, sessionId: string): Promise<InvoiceCheckoutAttempt>;
  failExpired(attempt: InvoiceCheckoutAttempt, sessionId: string): Promise<void>;
}

export type InvoiceCheckoutResult =
  | {
      kind: 'ready';
      url: string;
      attempt: InvoiceCheckoutAttempt;
      session: InvoiceCheckoutSession;
      reused: boolean;
    }
  | {
      kind: 'processing';
      attempt: InvoiceCheckoutAttempt;
      session: InvoiceCheckoutSession;
    };

export class InvoiceCheckoutIntegrityError extends Error {
  constructor(
    public readonly code:
      | 'checkout_session_identity_mismatch'
      | 'checkout_session_amount_mismatch'
      | 'checkout_session_unavailable'
      | 'checkout_persistence_failed',
    message: string
  ) {
    super(message);
    this.name = 'InvoiceCheckoutIntegrityError';
  }
}

/** Attach the exact local claim to either Checkout return path. */
export function invoiceCheckoutReturnUrl(
  baseUrl: string,
  attempt: Pick<InvoiceCheckoutAttempt, 'attemptId' | 'paymentId'>
): string {
  const separator = baseUrl.includes('?') ? '&' : '?';
  return (
    `${baseUrl}${separator}checkout_attempt_id=${encodeURIComponent(attempt.attemptId)}` +
    `&payment_id=${encodeURIComponent(attempt.paymentId)}`
  );
}

export function assertInvoiceSessionIdentity(
  attempt: InvoiceCheckoutAttempt,
  session: InvoiceCheckoutSession
): void {
  const metadata = session.metadata ?? {};
  if (
    session.customerId !== attempt.stripeCustomerId ||
    metadata.payable_type !== 'invoice' ||
    metadata.invoice_id !== attempt.invoiceId ||
    metadata.checkout_attempt_id !== attempt.attemptId ||
    metadata.payer_id !== attempt.payerId ||
    // A rail-bound attempt must meet a session stamped with the same rail. A
    // legacy attempt (null) stamps no key and this term drops out entirely.
    (attempt.paymentMethod !== null && metadata.payment_method !== attempt.paymentMethod)
  ) {
    throw new InvoiceCheckoutIntegrityError(
      'checkout_session_identity_mismatch',
      'The hosted Checkout session does not belong to this invoice, attempt, payer, and Stripe customer.'
    );
  }

  // Stripe charges the gross: the claimed balance plus the rail's fee.
  if (
    session.amountTotal !== attempt.amountCents + attempt.surchargeCents ||
    session.currency?.toLowerCase() !== attempt.currency.toLowerCase()
  ) {
    throw new InvoiceCheckoutIntegrityError(
      'checkout_session_amount_mismatch',
      'The hosted Checkout amount does not match the authoritative claimed invoice balance.'
    );
  }
}

/**
 * Claim first, then retrieve/create with the claim's stable idempotency key.
 * A finalize failure is surfaced without returning the Stripe URL: retrying
 * recovers the same session because the database claim and key remain stable.
 */
export async function runInvoiceCheckout(
  gateway: InvoiceCheckoutGateway
): Promise<InvoiceCheckoutResult> {
  let attempt = await gateway.claim();

  // One replacement is enough for an expired prior session. A second expired
  // result indicates stale/corrupt external state and fails closed.
  for (let generation = 0; generation < 2; generation += 1) {
    const reused = attempt.stripeCheckoutSessionId !== null;
    let session: InvoiceCheckoutSession;
    try {
      session = reused
        ? await gateway.retrieveSession(attempt.stripeCheckoutSessionId!)
        : await gateway.createSession(attempt);
    } catch (error) {
      if (error instanceof InvoiceCheckoutIntegrityError) throw error;
      throw new InvoiceCheckoutIntegrityError(
        'checkout_session_unavailable',
        error instanceof Error ? error.message : 'Stripe Checkout session unavailable.'
      );
    }

    assertInvoiceSessionIdentity(attempt, session);

    // Persist every newly-created Stripe identity before branching on its
    // status. This also makes an immediate complete/expired response safely
    // recoverable; no path can expose/process a session that the DB never saw.
    if (!reused) {
      try {
        attempt = await gateway.finalize(attempt, session.id);
      } catch (error) {
        throw new InvoiceCheckoutIntegrityError(
          'checkout_persistence_failed',
          error instanceof Error ? error.message : 'The Checkout session could not be persisted.'
        );
      }
    }

    if (session.status === 'expired') {
      await gateway.failExpired(attempt, session.id);
      if (generation === 1) {
        throw new InvoiceCheckoutIntegrityError(
          'checkout_session_unavailable',
          'The replacement Checkout session is already expired.'
        );
      }
      attempt = await gateway.claim();
      continue;
    }

    if (session.status === 'complete') {
      return { kind: 'processing', attempt, session };
    }
    if (session.status !== 'open' || !session.url) {
      throw new InvoiceCheckoutIntegrityError(
        'checkout_session_unavailable',
        'Stripe Checkout did not return an open session URL.'
      );
    }

    return { kind: 'ready', url: session.url, attempt, session, reused };
  }

  throw new InvoiceCheckoutIntegrityError(
    'checkout_session_unavailable',
    'Unable to establish an active Checkout session.'
  );
}
