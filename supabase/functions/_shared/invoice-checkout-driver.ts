/**
 * The invoice Checkout driver: claim → run the state machine → map errors.
 *
 * Lifted from create-checkout-session/index.ts (startInvoiceCheckout,
 * mapInvoiceAttempt, stripeSessionView, invoiceAttemptFields) and
 * parameterised on the ACTOR — a signed-in payer or an invoice link (00574).
 * The two rails differ only in which claim RPC runs and which identity key the
 * Stripe metadata carries; every guard, the idempotency key, the surcharge
 * line and the return-URL discipline are shared so they cannot drift.
 *
 * Metadata (M6), on the Session AND the PaymentIntent, is load-bearing: the
 * webhook resolves by session id → PI id → metadata.invoice_id, and asserts
 * the identity terms. Exactly one identity key is present — `payer_id` or
 * `invoice_link_id` — never the string "null".
 */

// deno-lint-ignore-file no-explicit-any

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type Stripe from 'npm:stripe@17';
import {
  type InvoiceCheckoutAttempt,
  InvoiceCheckoutIntegrityError,
  type InvoiceCheckoutPaymentMethod,
  type InvoiceCheckoutSession,
  invoiceCheckoutReturnUrl,
  invoiceLinkReturnAddress,
  runInvoiceCheckout,
} from './invoice-checkout-core.ts';

export type JsonResponder = (body: unknown, status?: number) => Response;

/** Who is paying: the household (or a test-mode designer), or the link itself. */
export type InvoiceCheckoutActor =
  | {
      kind: 'payer';
      payerId: string;
      stripeCustomerId: string;
      allowDesignerTest: boolean;
    }
  | {
      kind: 'link';
      invoiceLinkId: string;
      stripeCustomerId: string;
    };

export interface InvoiceCheckoutTarget {
  invoiceId: string;
  lineItemName: string;
  /**
   * Today's letterbox / front-door return addresses. The M7 safety valve: used
   * whenever a nonce address cannot be built — no `nonceReturnOrigin`, or a
   * reused attempt claimed before 00574 that carries no nonce.
   */
  successUrl: string;
  cancelUrl: string;
  /** 409 detail when a completed session still has an in-flight (ACH) payment. */
  processingDetail: string;
  /**
   * CLIENT_PORTAL_URL when the invoice has a live link (ensureInvoiceLinkUrl
   * returned one), so Stripe returns the payer through /pay/return/<nonce>
   * (S10). Null ⇒ fall back to successUrl / cancelUrl.
   */
  nonceReturnOrigin: string | null;
}

export interface StartInvoiceCheckoutInput {
  admin: SupabaseClient;
  stripe: Stripe;
  json: JsonResponder;
  /** Prefix for log lines, e.g. the function name. */
  logTag: string;
  actor: InvoiceCheckoutActor;
  target: InvoiceCheckoutTarget;
  paymentMethod: InvoiceCheckoutPaymentMethod | null;
}

export function stripeSessionView(session: Stripe.Checkout.Session): InvoiceCheckoutSession {
  const customerId =
    typeof session.customer === 'string'
      ? session.customer
      : session.customer && !('deleted' in session.customer)
        ? session.customer.id
        : null;
  return {
    id: session.id,
    status: session.status,
    paymentStatus: session.payment_status,
    url: session.url,
    amountTotal: session.amount_total,
    currency: session.currency,
    customerId,
    metadata: Object.fromEntries(
      Object.entries(session.metadata ?? {}).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    ),
  };
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * The DB claim echo, validated. Exactly one of payer_id / invoice_link_id
 * must be present — the same discriminated union the 00574 CHECK enforces —
 * so a link claim (payer_id NULL) is as valid as a payer claim.
 */
export function mapInvoiceAttempt(data: any): InvoiceCheckoutAttempt {
  const hasPayer = nonEmptyString(data?.payer_id);
  const hasLink = nonEmptyString(data?.invoice_link_id);
  if (
    !data?.attempt_id ||
    !data?.payment_id ||
    !data?.invoice_id ||
    hasPayer === hasLink ||
    !data?.stripe_customer_id ||
    !Number.isInteger(data?.amount_cents) ||
    // The fee is money: a non-integer here would silently mis-charge, so it is
    // as load-bearing as the balance. The claim RPC always returns it (0 for a
    // legacy/no-method attempt).
    !Number.isInteger(data?.surcharge_cents) ||
    !data?.currency ||
    !data?.stripe_idempotency_key
  ) {
    throw new Error('Database returned an invalid invoice Checkout claim.');
  }
  return {
    attemptId: data.attempt_id,
    paymentId: data.payment_id,
    invoiceId: data.invoice_id,
    payerId: hasPayer ? data.payer_id : null,
    invoiceLinkId: hasLink ? data.invoice_link_id : null,
    returnNonce: nonEmptyString(data.return_nonce) ? data.return_nonce : null,
    stripeCustomerId: data.stripe_customer_id,
    amountCents: data.amount_cents,
    surchargeCents: data.surcharge_cents,
    // The DB CHECK already constrains this to card | us_bank_account | NULL;
    // `?? null` normalizes the JSON-null the reused-attempt branch returns.
    paymentMethod: (data.payment_method ?? null) as InvoiceCheckoutPaymentMethod | null,
    currency: data.currency,
    state: data.state,
    stripeIdempotencyKey: data.stripe_idempotency_key,
    stripeCheckoutSessionId: data.stripe_checkout_session_id ?? null,
    supersededSessionId: data.superseded_session_id ?? null,
  };
}

/** Fee line-item label per rail. Mirrors the client portal's totals rows. */
const SURCHARGE_LINE_LABEL: Record<InvoiceCheckoutPaymentMethod, string> = {
  card: 'Card processing fee',
  us_bank_account: 'Bank transfer fee',
};

export function invoiceAttemptFields(attempt: InvoiceCheckoutAttempt, sessionId?: string | null) {
  return {
    amount_cents: attempt.amountCents,
    // Additive: existing clients ignore unknown keys, the client portal reads
    // them to reconcile what was actually charged.
    surcharge_cents: attempt.surchargeCents,
    payment_method: attempt.paymentMethod,
    currency: attempt.currency,
    checkout_attempt_id: attempt.attemptId,
    payment_id: attempt.paymentId,
    session_id: sessionId ?? attempt.stripeCheckoutSessionId,
  };
}

/**
 * The exact metadata key set per rail (M6). Payer rail: today's set,
 * unchanged. Link rail: payable_type, invoice_id, checkout_attempt_id,
 * invoice_link_id, payment_method. A legacy (null-rail) payer attempt stamps
 * no rail keys, so its session stays byte-identical to the pre-surcharge one.
 */
export function invoiceSessionMetadata(attempt: InvoiceCheckoutAttempt): Record<string, string> {
  return {
    payable_type: 'invoice',
    invoice_id: attempt.invoiceId,
    checkout_attempt_id: attempt.attemptId,
    ...(attempt.payerId !== null ? { payer_id: attempt.payerId } : {}),
    ...(attempt.invoiceLinkId !== null ? { invoice_link_id: attempt.invoiceLinkId } : {}),
    ...(attempt.paymentMethod
      ? {
          payment_method: attempt.paymentMethod,
          ...(attempt.payerId !== null
            ? { surcharge_cents: String(attempt.surchargeCents) }
            : {}),
        }
      : {}),
  };
}

/** Where Stripe sends the payer back: the nonce address when it can be built, else the fallback. */
export function invoiceCheckoutReturnBase(
  attempt: InvoiceCheckoutAttempt,
  target: InvoiceCheckoutTarget,
  checkout: 'success' | 'cancelled'
): string {
  if (attempt.returnNonce && target.nonceReturnOrigin) {
    return invoiceLinkReturnAddress(target.nonceReturnOrigin, attempt.returnNonce, checkout);
  }
  return checkout === 'success' ? target.successUrl : target.cancelUrl;
}

/** The claim-error table, shared by both rails. */
export function invoiceCheckoutErrorResponse(
  error: unknown,
  json: JsonResponder,
  logTag: string,
  lastAttempt: InvoiceCheckoutAttempt | null,
  processingDetail = 'A payment for this invoice is already processing.'
): Response {
  const detail = error instanceof Error ? error.message : 'Invoice Checkout failed.';
  const dbMessage = (error as any)?.message ?? '';
  const fields = lastAttempt ? invoiceAttemptFields(lastAttempt) : {};

  // Review F1: a different actor met money in flight (a processing attempt).
  // The same state the driver reports for a completed session with a pending
  // debit, so the page renders the one "processing" sheet either way.
  if (dbMessage.includes('invoice_checkout_in_progress')) {
    return json({ error: 'payment_processing', detail: processingDetail, ...fields }, 409);
  }

  if (
    dbMessage.includes('invoice_checkout_payer_not_allowed') ||
    // The link claim collapses every identity failure to the page's own error.
    dbMessage.includes('invoice_not_found')
  ) {
    return json({ error: 'invoice_not_found' }, 404);
  }
  // Colon-suffixed (`…bad_payment_method:<value>`) like the other 00397 error
  // idioms — match by prefix, never equality. Only reachable if the DB
  // vocabulary drifts ahead of this function's validation.
  if (dbMessage.includes('invoice_checkout_bad_payment_method')) {
    return json({ error: 'invalid_payment_method', detail, ...fields }, 400);
  }
  if (dbMessage.includes('invoice_checkout_reconciliation_required')) {
    return json(
      {
        error: 'payment_reconciliation_required',
        detail,
        ...fields,
      },
      409
    );
  }
  if (
    dbMessage.includes('invoice_checkout_attempt_payer_mismatch') ||
    dbMessage.includes('invoice_checkout_customer_mismatch')
  ) {
    return json({ error: 'checkout_payer_mismatch', detail, ...fields }, 409);
  }
  if (
    dbMessage.includes('invoice_checkout_not_payable') ||
    dbMessage.includes('invoice_checkout_nothing_due') ||
    dbMessage.includes('invoice_checkout_attempt_terminal')
  ) {
    return json({ error: 'invoice_not_payable', detail, ...fields }, 409);
  }
  if (error instanceof InvoiceCheckoutIntegrityError) {
    const status = error.code === 'checkout_persistence_failed' ? 500 : 502;
    return json({ error: error.code, detail: error.message, ...fields }, status);
  }
  console.error(`${logTag}: invoice claim failed`, error);
  return json({ error: 'checkout_claim_failed', detail, ...fields }, 500);
}

export async function startInvoiceCheckout(input: StartInvoiceCheckoutInput): Promise<Response> {
  const { admin, stripe, json, logTag, actor, target, paymentMethod } = input;
  const invoiceId = target.invoiceId;
  const payerId = actor.kind === 'payer' ? actor.payerId : null;
  const invoiceLinkId = actor.kind === 'link' ? actor.invoiceLinkId : null;

  let lastAttempt: InvoiceCheckoutAttempt | null = null;
  try {
    const result = await runInvoiceCheckout({
      async claim() {
        const { data, error } =
          actor.kind === 'payer'
            ? await admin.rpc('claim_invoice_checkout_attempt', {
                p_invoice_id: invoiceId,
                p_payer_id: actor.payerId,
                p_stripe_customer_id: actor.stripeCustomerId,
                p_allow_designer_test: actor.allowDesignerTest,
                p_payment_method: paymentMethod,
              })
            : await admin.rpc('claim_invoice_link_checkout_attempt', {
                p_invoice_id: invoiceId,
                p_invoice_link_id: actor.invoiceLinkId,
                p_stripe_customer_id: actor.stripeCustomerId,
                p_payment_method: paymentMethod,
              });
        if (error) throw error;
        const claimed = mapInvoiceAttempt(data);
        lastAttempt = claimed;
        // The claim superseded a live session — the other rail, the old fee, a
        // changed balance, or (00574) a different actor. Close it so nobody
        // wanders back and pays the wrong amount. Best-effort only — the DB
        // already failed that attempt, so a Stripe hiccup here must not break
        // the fresh checkout (mirrors the stale-session expire in startCheckout).
        if (claimed.supersededSessionId) {
          try {
            await stripe.checkout.sessions.expire(claimed.supersededSessionId);
          } catch (err) {
            console.warn(`${logTag}: superseded session expire failed`, err);
          }
        }
        return claimed;
      },
      async retrieveSession(sessionId) {
        return stripeSessionView(await stripe.checkout.sessions.retrieve(sessionId));
      },
      async createSession(attempt) {
        // A legacy (null-rail) attempt must produce the pre-surcharge session
        // byte for byte: both rails, no fee line, no extra metadata keys.
        const rails: Array<'card' | 'us_bank_account'> = attempt.paymentMethod
          ? [attempt.paymentMethod]
          : ['card', 'us_bank_account'];
        const offersAch = rails.includes('us_bank_account');
        const metadata = invoiceSessionMetadata(attempt);
        const session = await stripe.checkout.sessions.create(
          {
            mode: 'payment',
            customer: attempt.stripeCustomerId,
            payment_method_types: rails,
            ...(offersAch
              ? {
                  payment_method_options: {
                    us_bank_account: { verification_method: 'automatic' as const },
                  },
                }
              : {}),
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: attempt.currency,
                  unit_amount: attempt.amountCents,
                  product_data: { name: target.lineItemName },
                },
              },
              // Stripe "Pattern A": the fee is its own line, so amount_total is
              // exactly balance + fee (no tax/shipping on this session config)
              // and the client sees what they're paying for.
              ...(attempt.surchargeCents > 0 && attempt.paymentMethod
                ? [
                    {
                      quantity: 1,
                      price_data: {
                        currency: attempt.currency,
                        unit_amount: attempt.surchargeCents,
                        product_data: {
                          name: SURCHARGE_LINE_LABEL[attempt.paymentMethod],
                        },
                      },
                    },
                  ]
                : []),
            ],
            metadata,
            payment_intent_data: { metadata },
            // Return the local claim identity on both paths. A cancellation has
            // no reliable Checkout session placeholder, so analytics and UI
            // reconciliation use the exact attempt/payment IDs instead of the
            // invoice's mutable outstanding balance.
            success_url: invoiceCheckoutReturnUrl(
              invoiceCheckoutReturnBase(attempt, target, 'success'),
              attempt
            ),
            cancel_url: invoiceCheckoutReturnUrl(
              invoiceCheckoutReturnBase(attempt, target, 'cancelled'),
              attempt
            ),
          },
          { idempotencyKey: attempt.stripeIdempotencyKey }
        );
        return stripeSessionView(session);
      },
      async finalize(attempt, sessionId) {
        const { data, error } = await admin.rpc('finalize_invoice_checkout_attempt', {
          p_attempt_id: attempt.attemptId,
          p_payer_id: payerId,
          p_stripe_customer_id: actor.stripeCustomerId,
          p_stripe_checkout_session_id: sessionId,
          p_invoice_link_id: invoiceLinkId,
        });
        if (error) throw error;
        lastAttempt = mapInvoiceAttempt(data);
        return lastAttempt;
      },
      async failExpired(attempt, sessionId) {
        const { error } = await admin.rpc('fail_invoice_checkout_attempt', {
          p_attempt_id: attempt.attemptId,
          p_stripe_checkout_session_id: sessionId,
          p_reason: 'checkout_session_expired',
        });
        if (error) throw error;
      },
    });

    if (result.kind === 'processing') {
      return json(
        {
          error: 'payment_processing',
          detail: target.processingDetail,
          ...invoiceAttemptFields(result.attempt, result.session.id),
        },
        409
      );
    }
    return json({
      url: result.url,
      ...invoiceAttemptFields(result.attempt, result.session.id),
      reused: result.reused,
    });
  } catch (error) {
    return invoiceCheckoutErrorResponse(error, json, logTag, lastAttempt, target.processingDetail);
  }
}
