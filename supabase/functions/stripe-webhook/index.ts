// Supabase Edge Function: stripe-webhook
//
// Invoicing Stripe wave (Wave 3). Receives Stripe webhook events for invoice
// Checkout payments. verify_jwt = false (config.toml) — Stripe cannot send a
// Supabase JWT; authenticity comes from the Stripe signature instead.
// NOTE (self-hosted prod): Kong's /functions/v1/ route has key-auth, so the
// Stripe dashboard endpoint URL must carry the anon key as a query param:
//   https://api.patina.cloud/functions/v1/stripe-webhook?apikey=<ANON_KEY>
//
// Pipeline:
//   1. Read the RAW body first (signature is over the exact bytes), then
//      verify with constructEventAsync + SubtleCryptoProvider. 400 ONLY on
//      signature failure.
//   2. Idempotency: claim the event id in stripe_webhook_events
//      (ON CONFLICT DO NOTHING via upsert/ignoreDuplicates). Already claimed
//      → 200 immediately. A handler error releases the claim and returns 500
//      so Stripe retries (all row flips are guarded → retries are safe).
//   3. The webhook ONLY flips invoice_payments rows; the 00178 AFTER trigger
//      (apply_invoice_payment_effects) owns the invoice rollup/status,
//      milestone paid-through, and designer_earnings.
//
// Events handled (payment rows resolved by checkout session id → payment
// intent id → metadata.invoice_id latest-pending fallback):
//   checkout.session.completed          stamp PI id; payment_status 'paid'
//                                       → succeeded (+receipt); 'unpaid'
//                                       (ACH initiated) → stays pending.
//   checkout.session.async_payment_succeeded  → succeeded (+receipt).
//   checkout.session.async_payment_failed     → failed; clear the invoice's
//                                       session pointer; email the client +
//                                       notify the designer.
//   payment_intent.succeeded / payment_intent.payment_failed
//                                       belt-and-suspenders by PI id — only
//                                       flips rows still pending.
//   charge.refunded                     refund reconciliation v1 (00277).
//                                       Resolve the payable by charge.payment_intent
//                                       across invoice_payments → po_payments →
//                                       direct_orders. FULL refund flips state
//                                       (guarded) and the 00277 trigger reverses
//                                       invoice/earnings/milestone accounting;
//                                       PARTIAL refund changes no row, only
//                                       logs + notifies (partial accounting is
//                                       still v2). Unmatched PI → log + 200.
//   everything else                     acknowledged 200, no-op.
//
// On a flip to succeeded: receipt email to the client via the
// sendCompliantEmail chokepoint (operational) + an in_app notification_log
// row for the designer ("INV-x paid — $y"). Email/notification failures are
// logged, never fail the webhook.
//
// Required env (supabase secrets set …):
//   STRIPE_WEBHOOK_SECRET — whsec_… from the Stripe dashboard endpoint
//   STRIPE_SECRET_KEY     — only used to construct the SDK instance
//   CLIENT_PORTAL_URL     — absolute origin for receipt links
//                           (defaults to https://client.patina.cloud)
// Plus the standard SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, and the email
// env consumed by _shared/send-email.ts (RESEND_API_KEY or EMAIL_DEV_MODE).

// deno-lint-ignore-file no-explicit-any

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';
import { sendCompliantEmail } from '../_shared/send-email.ts';
import {
  buildDirectOrderPaymentFailedEmail,
  buildDirectOrderReceiptEmail,
  buildPaymentFailedEmail,
  buildPaymentReceiptEmail,
  buildPaymentRefundedEmail,
  formatInvoiceCurrency,
} from '../_shared/invoice-emails.ts';
import { resolveStudioIdentity, studioCobrand } from '../_shared/studio-identity.ts';
// Agent OS (WP-2.1) — reconciliation emission onto the agent_tasks queue.
// Additive: the constants + enqueue helper live in ./reconcile-emit.ts (kept out
// of this Deno.serve module so they unit-test offline, per the repo's core/index
// split); used only from ONE new call site after the money-path switch below.
import {
  enqueueStripeEventTask,
  MONEY_PATH_TYPES,
  RECONCILE_EVENT_TYPES,
} from './reconcile-emit.ts';
import {
  type ClaimedCheckoutAttempt,
  isFullCapturedRefund,
  isFullInvoiceRefund,
  persistSignedSessionEvidence,
  type RefundChargeShape,
  resolveExactClaimedPayment,
  usedPaymentMethodType,
} from './invoice-checkout-integrity.ts';
// BOH fulfillment intake emission (S0) — additive, one new call site below.
import { enqueueAgentTask, type RpcClient } from '../_shared/agent-queue.ts';
// Direct-order settle side effects (00540 / W5): the earnings credit + project
// notice, and the intake enqueue that gives the client a "where is it".
import {
  runDirectOrderSettleEffects,
  type SettleRpcClient,
} from './direct-order-settle.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLIENT_PORTAL_URL = Deno.env.get('CLIENT_PORTAL_URL') ?? 'https://client.patina.cloud';
// Designer-facing links (refund notices go to the designer's portal invoice).
const DESIGNER_PORTAL_URL = Deno.env.get('DESIGNER_PORTAL_URL') ?? 'https://app.patina.cloud';

// Pinned — bump deliberately alongside the npm:stripe major.
const STRIPE_API_VERSION = '2025-02-24.acacia';

// The key is irrelevant for signature verification; a placeholder keeps the
// constructor happy if only STRIPE_WEBHOOK_SECRET is configured.
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? 'sk_placeholder_webhook_verify', {
  apiVersion: STRIPE_API_VERSION,
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface PaymentRow {
  id: string;
  invoice_id: string;
  /** NET — the amount applied to the invoice. Stripe charged this + surcharge. */
  amount_cents: number;
  /** Rail processing fee charged on top. 0 for legacy/no-method payments. */
  surcharge_cents: number;
  method: string;
  status: string;
  checkout_attempt_id: string | null;
  recorded_by: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_payment_method_type: string | null;
}

interface InvoiceJoined {
  id: string;
  designer_id: string;
  client_id: string | null;
  project_id: string;
  invoice_number: string | null;
  status: string;
  currency: string;
  total_cents: number;
  amount_paid_cents: number;
  project: { id: string; name: string; client_id: string | null } | null;
  client: { id: string; full_name: string | null; email: string | null } | null;
  designer: {
    id: string;
    full_name: string | null;
    business_name: string | null;
  } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lookups
// ─────────────────────────────────────────────────────────────────────────────

const PAYMENT_COLS =
  'id, invoice_id, amount_cents, surcharge_cents, method, status, checkout_attempt_id, recorded_by, stripe_checkout_session_id, stripe_payment_intent_id, stripe_payment_method_type';

function stripeObjectId(value: string | { id: string } | null): string | null {
  return typeof value === 'string' ? value : (value?.id ?? null);
}

/**
 * New invoice sessions resolve by their exact attempt before any legacy
 * session/PI/invoice fallback. Every identity and money field must agree.
 */
async function resolveClaimedPaymentRow(
  admin: SupabaseClient,
  input: {
    attemptId: string;
    invoiceId: string | null;
    payerId: string | null;
    sessionId: string | null;
    paymentIntentId: string | null;
    customerId: string | null;
    amountCents: number | null;
    currency: string | null;
  }
): Promise<PaymentRow> {
  const payment = (await resolveExactClaimedPayment(
    {
      async loadAttempt(attemptId) {
        const { data, error } = await admin
          .from('invoice_checkout_attempts')
          .select(
            'id, invoice_id, payer_id, stripe_customer_id, amount_cents, surcharge_cents, payment_method, currency, state, stripe_checkout_session_id, stripe_payment_intent_id'
          )
          .eq('id', attemptId)
          .maybeSingle();
        if (error) throw new Error(`failed to load Checkout attempt: ${error.message}`);
        return data as ClaimedCheckoutAttempt | null;
      },
      async loadPayment(attemptId) {
        const { data, error } = await admin
          .from('invoice_payments')
          .select(PAYMENT_COLS)
          .eq('checkout_attempt_id', attemptId)
          .maybeSingle();
        if (error) throw new Error(`failed to load claimed payment: ${error.message}`);
        return data as PaymentRow | null;
      },
    },
    input
  )) as PaymentRow;

  await persistSignedSessionEvidence(payment, input, {
    async finalizeActive() {
      const { error } = await admin.rpc('finalize_invoice_checkout_attempt', {
        p_attempt_id: input.attemptId,
        p_payer_id: input.payerId,
        p_stripe_customer_id: input.customerId,
        p_stripe_checkout_session_id: input.sessionId,
      });
      if (error) throw new Error(`active finalization failed: ${error.message}`);
    },
    async recoverTerminal() {
      const { error } = await admin.rpc('recover_invoice_checkout_session_evidence', {
        p_attempt_id: input.attemptId,
        p_payer_id: input.payerId,
        p_stripe_customer_id: input.customerId,
        p_stripe_checkout_session_id: input.sessionId,
      });
      if (error) throw new Error(`terminal evidence recovery failed: ${error.message}`);
    },
  });

  return payment;
}

/** Resolve the invoice_payments row: session id → PI id → latest pending stripe row on the invoice. */
async function resolvePaymentRow(
  admin: SupabaseClient,
  sessionId: string | null,
  paymentIntentId: string | null,
  invoiceId: string | null
): Promise<PaymentRow | null> {
  if (sessionId) {
    const { data } = await admin
      .from('invoice_payments')
      .select(PAYMENT_COLS)
      .eq('stripe_checkout_session_id', sessionId)
      .maybeSingle();
    if (data) return data as PaymentRow;
  }
  if (paymentIntentId) {
    const { data } = await admin
      .from('invoice_payments')
      .select(PAYMENT_COLS)
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle();
    if (data) return data as PaymentRow;
  }
  if (invoiceId) {
    const { data } = await admin
      .from('invoice_payments')
      .select(PAYMENT_COLS)
      .eq('invoice_id', invoiceId)
      .eq('method', 'stripe')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);
    if (data && data.length > 0) return data[0] as PaymentRow;
  }
  return null;
}

async function loadInvoiceJoined(
  admin: SupabaseClient,
  invoiceId: string
): Promise<InvoiceJoined | null> {
  const { data } = await admin
    .from('invoices')
    .select(
      `
      id, designer_id, client_id, project_id, invoice_number, status,
      currency, total_cents, amount_paid_cents,
      project:projects!invoices_project_id_fkey(id, name, client_id),
      client:profiles!invoices_client_id_fkey(id, full_name, email),
      designer:profiles!invoices_designer_id_fkey(id, full_name, business_name)
    `
    )
    .eq('id', invoiceId)
    .maybeSingle();
  return (data as unknown as InvoiceJoined) ?? null;
}

/**
 * Resolve the client recipient the way invoice-send does: invoice.client
 * profile → project.client_id profile → designer_clients.client_email for
 * not-yet-signed-up clients.
 */
async function resolveRecipient(
  admin: SupabaseClient,
  invoice: InvoiceJoined
): Promise<{ email: string | null; name: string | null; userId: string | null }> {
  const clientUserId = invoice.client_id ?? invoice.project?.client_id ?? null;
  let email: string | null = invoice.client?.email ?? null;
  let name: string | null = invoice.client?.full_name ?? null;

  if (!email && clientUserId && clientUserId !== invoice.client_id) {
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, email')
      .eq('id', clientUserId)
      .maybeSingle();
    email = (profile as any)?.email ?? null;
    name = (profile as any)?.full_name ?? name;
  }

  if (!email && clientUserId) {
    const { data: dc } = await admin
      .from('designer_clients')
      .select('client_email, client_name')
      .eq('designer_id', invoice.designer_id)
      .eq('client_id', clientUserId)
      .maybeSingle();
    email = (dc as any)?.client_email ?? null;
    name = name ?? (dc as any)?.client_name ?? null;
  }

  return { email, name, userId: clientUserId };
}

function designerDisplayName(invoice: InvoiceJoined): string {
  return (
    invoice.designer?.full_name?.trim() ||
    invoice.designer?.business_name?.trim() ||
    'Your designer'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// State flips + side effects
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Settle through the DB money boundary. It locks the invoice, verifies the
 * Stripe-reported GROSS amount (claimed balance + rail fee), and returns
 * requires_refund rather than applying an overpayment. Side effects fire only
 * for a fresh, safely-applied success.
 *
 * `paymentMethodType` is the rail Stripe actually used; null lets the RPC fall
 * back to the rail the attempt claimed.
 */
async function markSucceeded(
  admin: SupabaseClient,
  row: PaymentRow,
  eventId: string,
  paymentIntentId: string | null,
  reportedAmountCents: number | null,
  paymentMethodType: string | null
): Promise<'succeeded' | 'requires_refund' | 'unchanged'> {
  const { data, error } = await admin.rpc('settle_invoice_checkout_payment', {
    p_payment_id: row.id,
    p_stripe_event_id: eventId,
    p_stripe_payment_intent_id: paymentIntentId,
    p_reported_amount_cents: reportedAmountCents,
    p_stripe_payment_method_type: paymentMethodType,
  });
  if (error) {
    throw new Error(`failed to settle payment ${row.id}: ${error.message}`);
  }
  const result = data as { outcome?: string; changed?: boolean } | null;
  if (result?.outcome === 'requires_refund') return 'requires_refund';
  if (result?.outcome === 'succeeded' && result.changed === true) {
    return 'succeeded';
  }
  return 'unchanged';
}

/** Receipt email + designer in_app notification after a successful flip. Never throws. */
async function sendSuccessSideEffects(admin: SupabaseClient, row: PaymentRow): Promise<void> {
  try {
    // Reload AFTER the flip — the 00178 trigger already rolled up
    // amount_paid_cents/status, so balance here is post-payment truth.
    const invoice = await loadInvoiceJoined(admin, row.invoice_id);
    if (!invoice) return;

    const invoiceNumber = invoice.invoice_number ?? 'Invoice';
    const projectName = invoice.project?.name ?? 'your project';
    const designerName = designerDisplayName(invoice);
    const balanceCents = invoice.total_cents - invoice.amount_paid_cents;
    const portalUrl = `${CLIENT_PORTAL_URL}/invoices/${invoice.id}`;
    // Two amounts, deliberately: the client is told what their card/bank was
    // actually charged (balance + rail fee), the designer is told what landed
    // on the invoice (net). A legacy payment has no fee and the two coincide.
    const amountLabel = formatInvoiceCurrency(row.amount_cents, invoice.currency);
    const chargedCents = row.amount_cents + (row.surcharge_cents ?? 0);
    const chargedLabel = formatInvoiceCurrency(chargedCents, invoice.currency);

    // Receipt to the client (operational → suppression check, rate cap,
    // notification_log row that doubles as their in-app inbox entry).
    const recipient = await resolveRecipient(admin, invoice);
    if (recipient.email) {
      // Studio co-brand (Designer Studios): the invoice's project resolves brand.
      const cobrand = studioCobrand(
        await resolveStudioIdentity(admin, {
          projectId: invoice.project_id,
          designerId: invoice.designer_id,
        })
      );
      const rendered = buildPaymentReceiptEmail({
        invoiceNumber,
        projectName,
        designerName,
        clientName: recipient.name,
        amountPaidCents: chargedCents,
        balanceCents,
        portalUrl,
        currency: invoice.currency,
        studioName: cobrand.studioName,
        studioLogoUrl: cobrand.studioLogoUrl,
      });
      const sendResult = await sendCompliantEmail(admin, {
        to: recipient.email,
        subject: rendered.subject,
        html: rendered.html,
        userId: recipient.userId ?? undefined,
        notificationType: 'invoice_payment_received',
        category: 'operational',
        templateId: 'invoice-payment-receipt',
        metadata: {
          invoice_id: invoice.id,
          project_id: invoice.project_id,
          invoice_payment_id: row.id,
          amount_cents: chargedCents,
          surcharge_cents: row.surcharge_cents ?? 0,
          subject: rendered.subject,
          message: `Your payment of ${chargedLabel} toward ${invoiceNumber} was received.`,
          deep_link: `/invoices/${invoice.id}`,
        },
      });
      if (!sendResult.success && !sendResult.suppressed) {
        console.error('stripe-webhook: receipt email failed', sendResult.error);
      }
    } else {
      console.warn('stripe-webhook: no receipt recipient for invoice', invoice.id);
    }

    // Designer-facing in-app notification ("INV-0001 paid — $3,456.00").
    const paidInFull = invoice.status === 'paid';
    const subject = paidInFull
      ? `${invoiceNumber} paid — ${amountLabel}`
      : `Payment received on ${invoiceNumber} — ${amountLabel}`;
    const { error: notifyErr } = await admin.from('notification_log').insert({
      user_id: invoice.designer_id,
      type: 'invoice_paid',
      channel: 'in_app',
      status: 'delivered',
      template_id: 'invoice-paid',
      metadata: {
        invoice_id: invoice.id,
        project_id: invoice.project_id,
        invoice_payment_id: row.id,
        amount_cents: row.amount_cents,
        paid_in_full: paidInFull,
        subject,
        message: `${projectName}: ${subject.toLowerCase()}${
          paidInFull ? '' : ` (balance ${formatInvoiceCurrency(balanceCents, invoice.currency)})`
        }.`,
        deep_link: `/desk?book=accounts&page=ledger&invoiceId=${invoice.id}`,
      },
    });
    if (notifyErr) {
      console.error('stripe-webhook: designer notification insert failed', notifyErr);
    }
  } catch (err) {
    console.error('stripe-webhook: success side effects failed', err);
  }
}

/** Failure email to the client + designer in_app notification. Never throws. */
async function sendFailureSideEffects(admin: SupabaseClient, row: PaymentRow): Promise<void> {
  try {
    const invoice = await loadInvoiceJoined(admin, row.invoice_id);
    if (!invoice) return;

    const invoiceNumber = invoice.invoice_number ?? 'Invoice';
    const projectName = invoice.project?.name ?? 'your project';
    const designerName = designerDisplayName(invoice);
    const portalUrl = `${CLIENT_PORTAL_URL}/invoices/${invoice.id}`;
    const amountLabel = formatInvoiceCurrency(row.amount_cents, invoice.currency);

    const recipient = await resolveRecipient(admin, invoice);
    if (recipient.email) {
      // Studio co-brand (Designer Studios): the invoice's project resolves brand.
      const cobrand = studioCobrand(
        await resolveStudioIdentity(admin, {
          projectId: invoice.project_id,
          designerId: invoice.designer_id,
        })
      );
      const rendered = buildPaymentFailedEmail({
        invoiceNumber,
        projectName,
        designerName,
        clientName: recipient.name,
        amountCents: row.amount_cents,
        portalUrl,
        currency: invoice.currency,
        studioName: cobrand.studioName,
        studioLogoUrl: cobrand.studioLogoUrl,
      });
      const sendResult = await sendCompliantEmail(admin, {
        to: recipient.email,
        subject: rendered.subject,
        html: rendered.html,
        userId: recipient.userId ?? undefined,
        notificationType: 'invoice_payment_failed',
        category: 'operational',
        templateId: 'invoice-payment-failed',
        metadata: {
          invoice_id: invoice.id,
          project_id: invoice.project_id,
          invoice_payment_id: row.id,
          amount_cents: row.amount_cents,
          subject: rendered.subject,
          message: `Your bank transfer of ${amountLabel} toward ${invoiceNumber} didn't go through. No money was taken — please try again.`,
          deep_link: `/invoices/${invoice.id}`,
        },
      });
      if (!sendResult.success && !sendResult.suppressed) {
        console.error('stripe-webhook: failure email failed', sendResult.error);
      }
    }

    const subject = `Payment failed on ${invoiceNumber} — ${amountLabel}`;
    const { error: notifyErr } = await admin.from('notification_log').insert({
      user_id: invoice.designer_id,
      type: 'invoice_payment_failed',
      channel: 'in_app',
      status: 'delivered',
      template_id: 'invoice-payment-failed-designer',
      metadata: {
        invoice_id: invoice.id,
        project_id: invoice.project_id,
        invoice_payment_id: row.id,
        amount_cents: row.amount_cents,
        subject,
        message: `${projectName}: the client's bank transfer of ${amountLabel} on ${invoiceNumber} failed. They've been asked to try again.`,
        deep_link: `/desk?book=accounts&page=ledger&invoiceId=${invoice.id}`,
      },
    });
    if (notifyErr) {
      console.error('stripe-webhook: designer failure notification insert failed', notifyErr);
    }
  } catch (err) {
    console.error('stripe-webhook: failure side effects failed', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Event handlers
// ─────────────────────────────────────────────────────────────────────────────

function sessionIds(session: Stripe.Checkout.Session): {
  sessionId: string;
  paymentIntentId: string | null;
  invoiceId: string | null;
} {
  return {
    sessionId: session.id,
    paymentIntentId:
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null),
    invoiceId: session.metadata?.invoice_id ?? null,
  };
}

async function handleSessionCompleted(admin: SupabaseClient, event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  if (payableTypeOf(session) === 'po_payment') {
    return handlePoSessionCompleted(admin, event, session);
  }
  if (payableTypeOf(session) === 'direct_order') {
    return handleDirectOrderSessionCompleted(admin, event, session);
  }
  const { sessionId, paymentIntentId, invoiceId } = sessionIds(session);
  const checkoutAttemptId = session.metadata?.checkout_attempt_id ?? null;

  let row = checkoutAttemptId
    ? await resolveClaimedPaymentRow(admin, {
        attemptId: checkoutAttemptId,
        invoiceId,
        payerId: session.metadata?.payer_id ?? null,
        sessionId,
        paymentIntentId,
        customerId: stripeObjectId(session.customer),
        amountCents: session.amount_total,
        currency: session.currency,
      })
    : await resolvePaymentRow(admin, sessionId, paymentIntentId, invoiceId);

  // Legacy sessions predate atomic claims, so preserve their exact-session
  // fallback. A claimed session must already have its payment row; recreating
  // it from loose invoice metadata would defeat payer/attempt isolation.
  if (!row && invoiceId && session.amount_total) {
    const { data, error } = await admin
      .from('invoice_payments')
      .insert({
        invoice_id: invoiceId,
        amount_cents: session.amount_total,
        method: 'stripe',
        status: 'pending',
        stripe_checkout_session_id: sessionId,
        stripe_payment_intent_id: paymentIntentId,
      })
      .select(PAYMENT_COLS)
      .maybeSingle();
    if (error) {
      throw new Error(`failed to recreate payment row for session ${sessionId}: ${error.message}`);
    }
    row = data as PaymentRow;
  }
  if (!row) {
    console.warn('stripe-webhook: no payment row resolvable for session', sessionId);
    return;
  }

  if (session.payment_status === 'paid') {
    const outcome = await markSucceeded(
      admin,
      row,
      event.id,
      paymentIntentId,
      session.amount_total,
      usedPaymentMethodType(session, event.type)
    );
    if (outcome === 'succeeded') await sendSuccessSideEffects(admin, row);
  } else if (paymentIntentId && !row.stripe_payment_intent_id) {
    // ACH initiated ('unpaid'): stamp the PI id, leave the row pending. The
    // async_payment_succeeded/failed event settles it in 3–5 business days.
    const { error } = await admin
      .from('invoice_payments')
      .update({ stripe_payment_intent_id: paymentIntentId })
      .eq('id', row.id)
      .is('stripe_payment_intent_id', null);
    if (error) {
      throw new Error(`failed to stamp PI on payment ${row.id}: ${error.message}`);
    }
  }
}

async function handleAsyncPaymentSucceeded(
  admin: SupabaseClient,
  event: Stripe.Event
): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  if (payableTypeOf(session) === 'po_payment') {
    return handlePoAsyncPaymentSucceeded(admin, event, session);
  }
  if (payableTypeOf(session) === 'direct_order') {
    return handleDirectOrderAsyncPaymentSucceeded(admin, event, session);
  }
  const { sessionId, paymentIntentId, invoiceId } = sessionIds(session);
  const checkoutAttemptId = session.metadata?.checkout_attempt_id ?? null;
  const row = checkoutAttemptId
    ? await resolveClaimedPaymentRow(admin, {
        attemptId: checkoutAttemptId,
        invoiceId,
        payerId: session.metadata?.payer_id ?? null,
        sessionId,
        paymentIntentId,
        customerId: stripeObjectId(session.customer),
        amountCents: session.amount_total,
        currency: session.currency,
      })
    : await resolvePaymentRow(admin, sessionId, paymentIntentId, invoiceId);
  if (!row) {
    console.warn('stripe-webhook: async_payment_succeeded with no payment row', sessionId);
    return;
  }
  const outcome = await markSucceeded(
    admin,
    row,
    event.id,
    paymentIntentId,
    session.amount_total,
    usedPaymentMethodType(session, event.type)
  );
  if (outcome === 'succeeded') await sendSuccessSideEffects(admin, row);
}

async function handleAsyncPaymentFailed(admin: SupabaseClient, event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  if (payableTypeOf(session) === 'po_payment') {
    return handlePoAsyncPaymentFailed(admin, event, session);
  }
  if (payableTypeOf(session) === 'direct_order') {
    return handleDirectOrderAsyncPaymentFailed(admin, event, session);
  }
  const { sessionId, paymentIntentId, invoiceId } = sessionIds(session);
  const checkoutAttemptId = session.metadata?.checkout_attempt_id ?? null;
  const row = checkoutAttemptId
    ? await resolveClaimedPaymentRow(admin, {
        attemptId: checkoutAttemptId,
        invoiceId,
        payerId: session.metadata?.payer_id ?? null,
        sessionId,
        paymentIntentId,
        customerId: stripeObjectId(session.customer),
        amountCents: session.amount_total,
        currency: session.currency,
      })
    : await resolvePaymentRow(admin, sessionId, paymentIntentId, invoiceId);
  if (!row) {
    console.warn('stripe-webhook: async_payment_failed with no payment row', sessionId);
    return;
  }

  const { data: flippedRows, error } = await admin
    .from('invoice_payments')
    .update({
      status: 'failed',
      stripe_event_id: event.id,
      ...(paymentIntentId && !row.stripe_payment_intent_id
        ? { stripe_payment_intent_id: paymentIntentId }
        : {}),
    })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('id');
  if (error) {
    throw new Error(`failed to mark payment ${row.id} failed: ${error.message}`);
  }

  // Clear the invoice's session pointer so the Pay button creates a fresh
  // session instead of replaying the dead one.
  const { error: clearErr } = await admin
    .from('invoices')
    .update({ stripe_checkout_session_id: null })
    .eq('id', row.invoice_id)
    .eq('stripe_checkout_session_id', sessionId);
  if (clearErr) {
    throw new Error(
      `failed to clear session pointer on invoice ${row.invoice_id}: ${clearErr.message}`
    );
  }

  if ((flippedRows ?? []).length > 0) {
    await sendFailureSideEffects(admin, row);
  }
}

/** Belt-and-suspenders PI handlers: only touch rows still pending, by PI id only. */
async function handlePaymentIntentSettled(
  admin: SupabaseClient,
  event: Stripe.Event,
  outcome: 'succeeded' | 'failed'
): Promise<void> {
  const pi = event.data.object as Stripe.PaymentIntent;
  if (payableTypeOf(pi) === 'po_payment') {
    return handlePoPaymentIntentSettled(admin, event, pi, outcome);
  }
  if (payableTypeOf(pi) === 'direct_order') {
    return handleDirectOrderPaymentIntentSettled(admin, event, pi, outcome);
  }
  const checkoutAttemptId = pi.metadata?.checkout_attempt_id ?? null;
  const row = checkoutAttemptId
    ? await resolveClaimedPaymentRow(admin, {
        attemptId: checkoutAttemptId,
        invoiceId: pi.metadata?.invoice_id ?? null,
        payerId: pi.metadata?.payer_id ?? null,
        sessionId: null,
        paymentIntentId: pi.id,
        customerId: stripeObjectId(pi.customer),
        amountCents: pi.amount_received || pi.amount,
        currency: pi.currency,
      })
    : await resolvePaymentRow(admin, null, pi.id, null);
  if (!row || row.status !== 'pending') return;

  if (outcome === 'succeeded') {
    const settlement = await markSucceeded(
      admin,
      row,
      event.id,
      pi.id,
      pi.amount_received || pi.amount,
      // A PaymentIntent carries payment_method_types but no payment_status, so
      // only the single-entry rule can fire here — never the completed+paid
      // card guess. Anything ambiguous stays null and the RPC uses the attempt.
      usedPaymentMethodType({ payment_method_types: pi.payment_method_types }, event.type)
    );
    if (settlement === 'succeeded') await sendSuccessSideEffects(admin, row);
  } else {
    const { error } = await admin
      .from('invoice_payments')
      .update({ status: 'failed', stripe_event_id: event.id })
      .eq('id', row.id)
      .eq('status', 'pending');
    if (error) {
      throw new Error(`failed to mark payment ${row.id} failed (PI): ${error.message}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// po_payment settle branch — "Order via Patina" catalog PO payments.
//
// The payable unit is a po_payments row (00148). state is pending|due|paid;
// there is NO 'failed' state — a failed ACH clears the session pointer and
// leaves state untouched. Flipping a deposit to 'paid' fires 00184 Trigger D
// (deposit_paid_flips_balance) automatically; the webhook never touches
// purchase_orders.status (no 'paid' member; the payment rail invents no
// transition). Settle/failure notify the designer via procurement_notifications
// (kinds added in 00275). All writes are service-role; the same guard-then-flip
// contract as the invoice handlers keeps Stripe retries safe.
// ─────────────────────────────────────────────────────────────────────────────

/** Which payable a session / payment intent belongs to. Absent = invoice (back-compat). */
function payableTypeOf(obj: {
  metadata?: Stripe.Metadata | null;
}): 'invoice' | 'po_payment' | 'direct_order' {
  const t = obj.metadata?.payable_type;
  if (t === 'po_payment') return 'po_payment';
  if (t === 'direct_order') return 'direct_order';
  return 'invoice';
}

interface PoPaymentRow {
  id: string;
  purchase_order_id: string;
  kind: string;
  amount_cents: number;
  state: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
}

const PO_PAYMENT_COLS =
  'id, purchase_order_id, kind, amount_cents, state, stripe_checkout_session_id, stripe_payment_intent_id';

function poSessionIds(session: Stripe.Checkout.Session): {
  sessionId: string;
  paymentIntentId: string | null;
  poPaymentId: string | null;
} {
  return {
    sessionId: session.id,
    paymentIntentId:
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null),
    poPaymentId: session.metadata?.po_payment_id ?? null,
  };
}

/** Resolve the po_payments row: session id → PI id → metadata po_payment_id. */
async function resolvePoPayment(
  admin: SupabaseClient,
  sessionId: string | null,
  paymentIntentId: string | null,
  poPaymentId: string | null
): Promise<PoPaymentRow | null> {
  if (sessionId) {
    const { data } = await admin
      .from('po_payments')
      .select(PO_PAYMENT_COLS)
      .eq('stripe_checkout_session_id', sessionId)
      .maybeSingle();
    if (data) return data as PoPaymentRow;
  }
  if (paymentIntentId) {
    const { data } = await admin
      .from('po_payments')
      .select(PO_PAYMENT_COLS)
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle();
    if (data) return data as PoPaymentRow;
  }
  if (poPaymentId) {
    const { data } = await admin
      .from('po_payments')
      .select(PO_PAYMENT_COLS)
      .eq('id', poPaymentId)
      .maybeSingle();
    if (data) return data as PoPaymentRow;
  }
  return null;
}

/**
 * Flip a not-yet-paid row to paid (concurrency-safe via the state guard).
 * Returns true only when THIS call performed the flip — the designer
 * notification keys off that so it fires exactly once. CHECK
 * chk_paid_date_required_when_paid demands paid_date alongside state.
 */
async function markPoPaid(
  admin: SupabaseClient,
  row: PoPaymentRow,
  paymentIntentId: string | null
): Promise<boolean> {
  const patch: Record<string, unknown> = {
    state: 'paid',
    paid_date: new Date().toISOString().slice(0, 10),
  };
  // Overwrite (not only-if-null): the settling event's PaymentIntent is the one
  // that actually succeeded. A prior attempt (e.g. a failed-then-retried ACH)
  // may have left a stale PI stamped; the recorded PI must reference the
  // successful attempt.
  if (paymentIntentId) {
    patch.stripe_payment_intent_id = paymentIntentId;
  }
  const { data, error } = await admin
    .from('po_payments')
    .update(patch)
    .eq('id', row.id)
    .neq('state', 'paid')
    .select('id');
  if (error) {
    throw new Error(`failed to mark po_payment ${row.id} paid: ${error.message}`);
  }
  return (data ?? []).length > 0;
}

/** Insert a procurement notification for the PO's owning designer. Never throws. */
async function notifyPoPayment(
  admin: SupabaseClient,
  row: PoPaymentRow,
  kind: 'payment_received' | 'payment_failed' | 'payment_refunded'
): Promise<void> {
  try {
    const { data: po } = await admin
      .from('purchase_orders')
      .select('id, designer_id')
      .eq('id', row.purchase_order_id)
      .maybeSingle();
    const designerId = (po as { designer_id: string } | null)?.designer_id ?? null;
    if (!designerId) {
      console.warn('stripe-webhook: no designer for po_payment notification', row.id);
      return;
    }
    const { error } = await admin.from('procurement_notifications').insert({
      user_id: designerId,
      kind,
      subject_purchase_order_id: row.purchase_order_id,
      subject_payment_id: row.id,
    });
    if (error) {
      console.error('stripe-webhook: po_payment notification insert failed', error);
    }
  } catch (err) {
    console.error('stripe-webhook: po_payment notification side effect failed', err);
  }
}

async function handlePoSessionCompleted(
  admin: SupabaseClient,
  event: Stripe.Event,
  session: Stripe.Checkout.Session
): Promise<void> {
  const { sessionId, paymentIntentId, poPaymentId } = poSessionIds(session);
  const row = await resolvePoPayment(admin, sessionId, paymentIntentId, poPaymentId);
  if (!row) {
    console.warn('stripe-webhook: no po_payment resolvable for session', sessionId);
    return;
  }

  if (session.payment_status === 'paid') {
    const flipped = await markPoPaid(admin, row, paymentIntentId);
    if (flipped) await notifyPoPayment(admin, row, 'payment_received');
  } else if (paymentIntentId && !row.stripe_payment_intent_id) {
    // ACH initiated ('unpaid'): stamp the PI id, leave state. The
    // async_payment_succeeded/failed event settles it in 3–5 business days.
    const { error } = await admin
      .from('po_payments')
      .update({ stripe_payment_intent_id: paymentIntentId })
      .eq('id', row.id)
      .is('stripe_payment_intent_id', null);
    if (error) {
      throw new Error(`failed to stamp PI on po_payment ${row.id}: ${error.message}`);
    }
  }
}

async function handlePoAsyncPaymentSucceeded(
  admin: SupabaseClient,
  event: Stripe.Event,
  session: Stripe.Checkout.Session
): Promise<void> {
  const { sessionId, paymentIntentId, poPaymentId } = poSessionIds(session);
  const row = await resolvePoPayment(admin, sessionId, paymentIntentId, poPaymentId);
  if (!row) {
    console.warn('stripe-webhook: po async_payment_succeeded with no row', sessionId);
    return;
  }
  const flipped = await markPoPaid(admin, row, paymentIntentId);
  if (flipped) await notifyPoPayment(admin, row, 'payment_received');
}

async function handlePoAsyncPaymentFailed(
  admin: SupabaseClient,
  event: Stripe.Event,
  session: Stripe.Checkout.Session
): Promise<void> {
  const { sessionId, paymentIntentId, poPaymentId } = poSessionIds(session);
  const row = await resolvePoPayment(admin, sessionId, paymentIntentId, poPaymentId);
  if (!row) {
    console.warn('stripe-webhook: po async_payment_failed with no row', sessionId);
    return;
  }

  // Already settled: a late/duplicate async_payment_failed for a superseded
  // attempt on a row that was paid by a later attempt. Do not clear the pointer
  // (would strip a live session) and do not send a spurious failure notice.
  if (row.state === 'paid') {
    return;
  }

  // Clear the session pointer AND the stale PaymentIntent so Pay-now opens a
  // fresh session and the row carries no reference to the failed attempt. Leave
  // state at its prior value (there is no 'failed' po_payment state). Guard on
  // the session id so a newer session's pointer is never clobbered.
  const { data: cleared, error } = await admin
    .from('po_payments')
    .update({
      stripe_checkout_session_id: null,
      stripe_payment_intent_id: null,
    })
    .eq('id', row.id)
    .eq('stripe_checkout_session_id', sessionId)
    .select('id');
  if (error) {
    throw new Error(`failed to clear session pointer on po_payment ${row.id}: ${error.message}`);
  }

  if ((cleared ?? []).length > 0) {
    await notifyPoPayment(admin, row, 'payment_failed');
  }
}

/** Belt-and-suspenders PI handler: only settle-success touches not-yet-paid rows. */
async function handlePoPaymentIntentSettled(
  admin: SupabaseClient,
  event: Stripe.Event,
  pi: Stripe.PaymentIntent,
  outcome: 'succeeded' | 'failed'
): Promise<void> {
  const poPaymentId = pi.metadata?.po_payment_id ?? null;
  const row = await resolvePoPayment(admin, null, pi.id, poPaymentId);
  if (!row || row.state === 'paid') return;

  if (outcome === 'succeeded') {
    const flipped = await markPoPaid(admin, row, pi.id);
    if (flipped) await notifyPoPayment(admin, row, 'payment_received');
  }
  // outcome 'failed': po_payment has no 'failed' state. A Checkout card decline
  // leaves the session open for retry; a failed ACH is handled authoritatively
  // by checkout.session.async_payment_failed (clears pointer + notifies). Nothing
  // to do here — leave state untouched.
}

// ─────────────────────────────────────────────────────────────────────────────
// direct_order settle branch — client "buy now" orders (00276).
//
// The payable unit is a direct_orders row. status is pending_payment|paid|
// canceled. Settle flips pending_payment → paid (guarded), stamps the
// PaymentIntent unconditionally, and persists the Checkout shipping details +
// customer email into the shipping jsonb. A failed ACH clears the session
// pointer + PI (like po_payment) and leaves status untouched — there is no
// 'failed' status; Pay-now opens a fresh session. On a paid settle the client
// gets a receipt and ops gets a heads-up, both via sendCompliantEmail; email
// failures never fail the settle. All writes are service-role; the guard-then-
// flip contract keeps Stripe retries safe.
//
// 00540 (W5) hangs two more effects off that same guarded flip — the earnings
// credit + project-thread notice, and the fulfillment_intake enqueue. See
// runDirectOrderSettleEffects. Like the emails, they can fail without failing
// the settle: the money is already taken, and a retry would re-run an event
// whose payable state has already moved.
// ─────────────────────────────────────────────────────────────────────────────

interface DirectOrderRow {
  id: string;
  client_id: string;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
  currency: string;
  status: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  shipping: Record<string, unknown> | null;
}

const DIRECT_ORDER_COLS =
  'id, client_id, product_name, quantity, unit_price_cents, amount_cents, currency, status, stripe_checkout_session_id, stripe_payment_intent_id, shipping';

function directOrderSessionIds(session: Stripe.Checkout.Session): {
  sessionId: string;
  paymentIntentId: string | null;
  directOrderId: string | null;
} {
  return {
    sessionId: session.id,
    paymentIntentId:
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null),
    directOrderId: session.metadata?.direct_order_id ?? null,
  };
}

/** Resolve the direct_orders row: session id → PI id → metadata direct_order_id. */
async function resolveDirectOrder(
  admin: SupabaseClient,
  sessionId: string | null,
  paymentIntentId: string | null,
  directOrderId: string | null
): Promise<DirectOrderRow | null> {
  if (sessionId) {
    const { data } = await admin
      .from('direct_orders')
      .select(DIRECT_ORDER_COLS)
      .eq('stripe_checkout_session_id', sessionId)
      .maybeSingle();
    if (data) return data as DirectOrderRow;
  }
  if (paymentIntentId) {
    const { data } = await admin
      .from('direct_orders')
      .select(DIRECT_ORDER_COLS)
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle();
    if (data) return data as DirectOrderRow;
  }
  if (directOrderId) {
    const { data } = await admin
      .from('direct_orders')
      .select(DIRECT_ORDER_COLS)
      .eq('id', directOrderId)
      .maybeSingle();
    if (data) return data as DirectOrderRow;
  }
  return null;
}

/**
 * The full Checkout shipping object + customer email, for the shipping jsonb.
 * The pinned API version (2025-02-24.acacia) exposes both the top-level
 * session.shipping_details and session.collected_information.shipping_details
 * (same shape: address/name/phone/carrier/tracking_number) — prefer the former,
 * fall back to the latter. Returns null when nothing was collected.
 */
function extractDirectOrderShipping(
  session: Stripe.Checkout.Session
): Record<string, unknown> | null {
  const details = (session.shipping_details ??
    session.collected_information?.shipping_details ??
    null) as Record<string, unknown> | null;
  const email = session.customer_details?.email ?? null;
  if (!details && !email) return null;
  return { ...(details ?? {}), ...(email ? { email } : {}) };
}

/**
 * Flip a pending_payment order to paid (concurrency-safe via the status guard).
 * Returns true only when THIS call performed the flip — the receipt/ops emails
 * key off that so they fire exactly once. The guard is `.eq('status',
 * 'pending_payment')`: it subsumes `.neq('status','paid')` (idempotent on
 * replay) AND refuses to settle a 'canceled' order. The PaymentIntent is
 * stamped unconditionally (the settling event's PI is the authoritative one,
 * overwriting any stale PI from a failed-then-retried ACH). shipping is written
 * only when provided (a session-backed settle), never overwritten with null by
 * a PI-only belt-and-suspenders settle.
 */
async function markDirectOrderPaid(
  admin: SupabaseClient,
  row: DirectOrderRow,
  paymentIntentId: string | null,
  shipping: Record<string, unknown> | null | undefined
): Promise<boolean> {
  const patch: Record<string, unknown> = {
    status: 'paid',
    paid_at: new Date().toISOString(),
  };
  if (paymentIntentId) {
    patch.stripe_payment_intent_id = paymentIntentId;
  }
  if (shipping !== undefined) {
    patch.shipping = shipping;
  }
  const { data, error } = await admin
    .from('direct_orders')
    .update(patch)
    .eq('id', row.id)
    .eq('status', 'pending_payment')
    .select('id');
  if (error) {
    throw new Error(`failed to mark direct_order ${row.id} paid: ${error.message}`);
  }
  return (data ?? []).length > 0;
}

/**
 * The settle's non-email side effects (00540): the earnings credit + project
 * notice, and the fulfillment_intake enqueue. Logic and failure discipline live
 * in direct-order-settle.ts; this is the logging wrapper. It never throws, so a
 * missed effect can never make Stripe redeliver an event whose money is already
 * settled — see that module's banner.
 */
async function logDirectOrderSettleEffects(
  admin: SupabaseClient,
  orderId: string,
  paymentIntentId: string | null
): Promise<void> {
  const outcome = await runDirectOrderSettleEffects(
    admin as unknown as SettleRpcClient,
    orderId,
    paymentIntentId
  );
  for (const problem of outcome.problems) {
    console.error('stripe-webhook: direct_order settle effect —', orderId, problem);
  }
  if (outcome.problems.length === 0) {
    console.log(
      'stripe-webhook: direct_order settle effects done',
      orderId,
      outcome.attribution,
      `intake_enqueued=${outcome.intakeEnqueued}`
    );
  }
}

/** One-line shipping summary (name + address) for the receipt/ops emails. */
function summarizeDirectOrderShipping(shipping: Record<string, unknown> | null): string | null {
  if (!shipping || typeof shipping !== 'object') return null;
  const addr = (shipping.address ?? {}) as Record<string, unknown>;
  const cityState = [addr.city, addr.state].filter((p) => p && String(p).trim()).join(', ');
  const parts = [shipping.name, addr.line1, addr.line2, cityState, addr.postal_code, addr.country]
    .map((p) => (p == null ? '' : String(p).trim()))
    .filter((p) => p.length > 0);
  return parts.length ? parts.join(', ') : null;
}

/**
 * Receipt to the client + ops heads-up after a paid settle. Never throws — a
 * dead email must not fail (and thus retry) the settle. Reloads the order AFTER
 * the flip so shipping/paid_at reflect post-settle truth.
 */
async function sendDirectOrderPaidEmails(admin: SupabaseClient, orderId: string): Promise<void> {
  try {
    const order = await resolveDirectOrder(admin, null, null, orderId);
    if (!order) return;

    const amountLabel = formatInvoiceCurrency(order.amount_cents, order.currency);
    const shippingSummary = summarizeDirectOrderShipping(order.shipping);

    // Buyer profile → receipt recipient. Fall back to the Checkout email.
    const { data: client } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', order.client_id)
      .maybeSingle();
    const clientEmail =
      (client as { email?: string | null } | null)?.email ??
      (order.shipping?.email as string | undefined) ??
      null;

    if (clientEmail) {
      const rendered = buildDirectOrderReceiptEmail({
        orderName: order.product_name,
        quantity: order.quantity,
        amountCents: order.amount_cents,
        currency: order.currency,
        clientName: (client as { full_name?: string | null } | null)?.full_name ?? null,
        shippingSummary,
        portalUrl: `${CLIENT_PORTAL_URL}/orders?order=${order.id}`,
      });
      const sendResult = await sendCompliantEmail(admin, {
        to: clientEmail,
        subject: rendered.subject,
        html: rendered.html,
        userId: order.client_id,
        notificationType: 'direct_order_receipt',
        category: 'operational',
        templateId: 'direct-order-receipt',
        metadata: {
          direct_order_id: order.id,
          amount_cents: order.amount_cents,
          subject: rendered.subject,
          message: `Your order for ${order.product_name} is confirmed — ${amountLabel} received.`,
          deep_link: `/orders?order=${order.id}`,
        },
      });
      if (!sendResult.success && !sendResult.suppressed) {
        console.error('stripe-webhook: direct_order receipt email failed', sendResult.error);
      }
    } else {
      console.warn('stripe-webhook: no receipt recipient for direct_order', order.id);
    }

    // Ops heads-up (a real order needs fulfillment). No personal address is
    // ever hardcoded: if OPS_NOTIFY_EMAIL is unset, warn and skip.
    const opsEmail = Deno.env.get('OPS_NOTIFY_EMAIL');
    if (opsEmail) {
      const opsHtml = `
        <div style="font-family:Inter,Arial,sans-serif;max-width:560px;color:#2c2926;line-height:1.55">
          <p>A direct order was just paid and needs fulfillment.</p>
          <p style="margin:0 0 8px"><strong>Order:</strong> ${escapeHtmlSafe(order.id)}</p>
          <p style="margin:0 0 8px"><strong>Product:</strong> ${escapeHtmlSafe(
            order.product_name
          )}</p>
          <p style="margin:0 0 8px"><strong>Quantity:</strong> ${escapeHtmlSafe(
            String(order.quantity)
          )}</p>
          <p style="margin:0 0 8px"><strong>Amount:</strong> ${escapeHtmlSafe(amountLabel)}</p>
          <p style="margin:0 0 8px"><strong>Buyer:</strong> ${escapeHtmlSafe(
            clientEmail ?? 'unknown'
          )}</p>
          <p style="margin:0 0 8px"><strong>Ship to:</strong> ${escapeHtmlSafe(
            shippingSummary ?? 'not collected'
          )}</p>
        </div>`;
      const opsResult = await sendCompliantEmail(admin, {
        to: opsEmail,
        subject: `New direct order paid — ${order.product_name} (${amountLabel})`,
        html: opsHtml,
        category: 'operational',
        templateId: 'direct-order-ops',
      });
      if (!opsResult.success && !opsResult.suppressed) {
        console.error('stripe-webhook: direct_order ops email failed', opsResult.error);
      }
    } else {
      console.warn(
        'stripe-webhook: OPS_NOTIFY_EMAIL unset — skipping ops notification for direct_order',
        order.id
      );
    }
  } catch (err) {
    console.error('stripe-webhook: direct_order paid side effects failed', err);
  }
}

/**
 * Failure notice to the client + a client-facing in_app notification after a
 * direct-order ACH bank debit fails. Never throws — a dead email/notification
 * must not fail (and thus retry) the webhook. Mirrors sendFailureSideEffects
 * (invoice) structurally, retargeted to the buyer since a direct order has no
 * designer party. Reloads the order AFTER the pointer clear (status is still
 * pending_payment truth). All interpolated email values are escaped.
 */
async function sendDirectOrderFailureSideEffects(
  admin: SupabaseClient,
  orderId: string
): Promise<void> {
  try {
    const order = await resolveDirectOrder(admin, null, null, orderId);
    if (!order) return;

    const amountLabel = formatInvoiceCurrency(order.amount_cents, order.currency);
    const portalUrl = `${CLIENT_PORTAL_URL}/orders`;
    const deepLink = `/orders?order=${order.id}`;

    // Ops heads-up: a client's bank transfer bounced and the order reopened.
    console.warn(
      `stripe-webhook: direct_order ACH payment failed — order ${order.id} (${order.product_name}, ${amountLabel}) returned to pending_payment; client notified.`
    );

    // Buyer profile → failure recipient. Fall back to the Checkout email captured
    // on the (now-failed) attempt's shipping snapshot, mirroring the receipt path.
    const { data: client } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', order.client_id)
      .maybeSingle();
    const clientName = (client as { full_name?: string | null } | null)?.full_name ?? null;
    const clientEmail =
      (client as { email?: string | null } | null)?.email ??
      (order.shipping?.email as string | undefined) ??
      null;

    if (clientEmail) {
      const rendered = buildDirectOrderPaymentFailedEmail({
        orderName: order.product_name,
        quantity: order.quantity,
        amountCents: order.amount_cents,
        currency: order.currency,
        clientName,
        portalUrl,
      });
      const sendResult = await sendCompliantEmail(admin, {
        to: clientEmail,
        subject: rendered.subject,
        html: rendered.html,
        userId: order.client_id,
        notificationType: 'direct_order_payment_failed',
        category: 'operational',
        templateId: 'direct-order-payment-failed',
        metadata: {
          direct_order_id: order.id,
          amount_cents: order.amount_cents,
          subject: rendered.subject,
          message: `Your bank transfer of ${amountLabel} for ${order.product_name} didn't complete. No money was taken — you can retry from your orders page.`,
          deep_link: deepLink,
        },
      });
      if (!sendResult.success && !sendResult.suppressed) {
        console.error('stripe-webhook: direct_order failure email failed', sendResult.error);
      }
    } else {
      console.warn('stripe-webhook: no failure recipient for direct_order', order.id);
    }

    // Client-facing in_app notification (mirrors the invoice failure path's
    // notification_log insert; retargeted to the buyer).
    const subject = `Payment didn't go through — ${order.product_name}`;
    const { error: notifyErr } = await admin.from('notification_log').insert({
      user_id: order.client_id,
      type: 'direct_order_payment_failed',
      channel: 'in_app',
      status: 'delivered',
      template_id: 'direct-order-payment-failed',
      metadata: {
        direct_order_id: order.id,
        amount_cents: order.amount_cents,
        subject,
        message: `Your bank transfer of ${amountLabel} for ${order.product_name} didn't complete. No money was taken — you can retry from your orders page.`,
        deep_link: deepLink,
      },
    });
    if (notifyErr) {
      console.error('stripe-webhook: direct_order failure notification insert failed', notifyErr);
    }
  } catch (err) {
    console.error('stripe-webhook: direct_order failure side effects failed', err);
  }
}

async function handleDirectOrderSessionCompleted(
  admin: SupabaseClient,
  event: Stripe.Event,
  session: Stripe.Checkout.Session
): Promise<void> {
  const { sessionId, paymentIntentId, directOrderId } = directOrderSessionIds(session);
  const row = await resolveDirectOrder(admin, sessionId, paymentIntentId, directOrderId);
  if (!row) {
    console.warn('stripe-webhook: no direct_order resolvable for session', sessionId);
    return;
  }

  if (session.payment_status === 'paid') {
    const shipping = extractDirectOrderShipping(session);
    const flipped = await markDirectOrderPaid(admin, row, paymentIntentId, shipping);
    if (flipped) {
      await sendDirectOrderPaidEmails(admin, row.id);
      await logDirectOrderSettleEffects(
        admin,
        row.id,
        paymentIntentId ?? row.stripe_payment_intent_id
      );
    }
  } else if (paymentIntentId && !row.stripe_payment_intent_id) {
    // ACH initiated ('unpaid'): stamp the PI id, leave status pending. The
    // async_payment_succeeded/failed event settles it in 3–5 business days.
    const { error } = await admin
      .from('direct_orders')
      .update({ stripe_payment_intent_id: paymentIntentId })
      .eq('id', row.id)
      .is('stripe_payment_intent_id', null);
    if (error) {
      throw new Error(`failed to stamp PI on direct_order ${row.id}: ${error.message}`);
    }
  }
}

async function handleDirectOrderAsyncPaymentSucceeded(
  admin: SupabaseClient,
  event: Stripe.Event,
  session: Stripe.Checkout.Session
): Promise<void> {
  const { sessionId, paymentIntentId, directOrderId } = directOrderSessionIds(session);
  const row = await resolveDirectOrder(admin, sessionId, paymentIntentId, directOrderId);
  if (!row) {
    console.warn('stripe-webhook: direct_order async_payment_succeeded with no row', sessionId);
    return;
  }
  const shipping = extractDirectOrderShipping(session);
  const flipped = await markDirectOrderPaid(admin, row, paymentIntentId, shipping);
  if (flipped) {
    await sendDirectOrderPaidEmails(admin, row.id);
    await logDirectOrderSettleEffects(
      admin,
      row.id,
      paymentIntentId ?? row.stripe_payment_intent_id
    );
  }
}

async function handleDirectOrderAsyncPaymentFailed(
  admin: SupabaseClient,
  event: Stripe.Event,
  session: Stripe.Checkout.Session
): Promise<void> {
  const { sessionId, paymentIntentId, directOrderId } = directOrderSessionIds(session);
  const row = await resolveDirectOrder(admin, sessionId, paymentIntentId, directOrderId);
  if (!row) {
    console.warn('stripe-webhook: direct_order async_payment_failed with no row', sessionId);
    return;
  }

  // Already settled: a late/duplicate failure for a superseded attempt on an
  // order paid by a later attempt. Do not clear the pointer (would strip a live
  // session) and leave status paid.
  if (row.status === 'paid') {
    return;
  }

  // Clear the session pointer AND the stale PaymentIntent so Pay-now opens a
  // fresh session and the order carries no reference to the failed attempt.
  // Leave status at pending_payment (there is no 'failed' status). Guard on the
  // session id so a newer session's pointer is never clobbered.
  const { data: clearedRows, error } = await admin
    .from('direct_orders')
    .update({
      stripe_checkout_session_id: null,
      stripe_payment_intent_id: null,
    })
    .eq('id', row.id)
    .eq('stripe_checkout_session_id', sessionId)
    .select('id');
  if (error) {
    throw new Error(`failed to clear session pointer on direct_order ${row.id}: ${error.message}`);
  }

  // Notify the client their bank transfer failed — only on the attempt we
  // actually cleared, so a late/duplicate failure (or one superseded by a newer
  // session) doesn't re-notify. Side effects are wrapped to never throw, so a
  // dead email/notification can never fail (and thus retry) the webhook.
  if ((clearedRows ?? []).length > 0) {
    await sendDirectOrderFailureSideEffects(admin, row.id);
  }
}

/** Belt-and-suspenders PI handler: only settle-success touches not-yet-paid orders. */
async function handleDirectOrderPaymentIntentSettled(
  admin: SupabaseClient,
  event: Stripe.Event,
  pi: Stripe.PaymentIntent,
  outcome: 'succeeded' | 'failed'
): Promise<void> {
  const directOrderId = pi.metadata?.direct_order_id ?? null;
  const row = await resolveDirectOrder(admin, null, pi.id, directOrderId);
  if (!row || row.status === 'paid') return;

  if (outcome === 'succeeded') {
    // No session on a PI event → no shipping to persist here (pass undefined so
    // a prior session-backed shipping write is never clobbered with null).
    const flipped = await markDirectOrderPaid(admin, row, pi.id, undefined);
    if (flipped) {
      await sendDirectOrderPaidEmails(admin, row.id);
      await logDirectOrderSettleEffects(admin, row.id, pi.id);
    }
  }
  // outcome 'failed': a card decline leaves the Checkout session open for retry;
  // a failed ACH is handled authoritatively by async_payment_failed (clears the
  // pointer). Nothing to do here — leave status untouched.
}

// ─────────────────────────────────────────────────────────────────────────────
// charge.refunded — refund reconciliation v1 (00277).
//
// A dashboard-initiated refund arrives as charge.refunded on the Charge object.
// We resolve the payable by charge.payment_intent across the three tables in
// order (invoice_payments → po_payments → direct_orders). FULL refunds flip the
// payable's state guarded on its settled value — the 00277 trigger owns invoice
// rollup/status/earnings-reversal/milestone-unpay for invoices; po/direct_order
// carry their own state column. "Full" is measured against the money Patina
// actually booked: the NET applied amount for an invoice payment (00428 put the
// surcharge beside it, so Stripe's captured is gross), and the captured amount
// for po/direct_order, where no surcharge exists. PARTIAL refunds flip NO row (partial accounting
// is still v2) — they only log + notify. Unmatched PI → log + 200 (a refund for
// a charge Patina never recorded must not error-loop Stripe's retries).
//
// Idempotency: the event-id claim dedups exact replays; the state guards dedup
// distinct-event replays of the SAME full refund (the second event finds the
// row already non-settled and the guarded UPDATE no-ops → no double side effect).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The pinned API version's Charge reduced to the three numbers refund
 * classification needs. Classification itself lives in
 * invoice-checkout-integrity.ts (Stripe-free, unit-tested): an invoice payment
 * classifies against its NET applied amount, po/direct_order against captured.
 */
function chargeRefundShape(charge: Stripe.Charge): RefundChargeShape {
  return {
    // Stripe's own "fully refunded" boolean.
    refunded: charge.refunded === true,
    // Running total refunded across all refunds on the charge.
    amountRefundedCents: charge.amount_refunded ?? 0,
    // amount_captured is the actually-charged amount (== amount for a fully
    // captured charge); fall back to amount if absent.
    amountCapturedCents: charge.amount_captured ?? charge.amount ?? 0,
  };
}

/** Designer email + in_app notification after an invoice payment refund. Never throws. */
async function sendInvoiceRefundSideEffects(
  admin: SupabaseClient,
  row: PaymentRow,
  opts: { partial: boolean; refundedAmount: number }
): Promise<void> {
  try {
    // Reload AFTER any flip — the 00277 trigger has already reopened the
    // invoice / cleared paid_at (full refund), so this reads post-refund truth.
    const invoice = await loadInvoiceJoined(admin, row.invoice_id);
    if (!invoice) return;

    const invoiceNumber = invoice.invoice_number ?? 'Invoice';
    const projectName = invoice.project?.name ?? 'your project';
    const designerName = designerDisplayName(invoice);
    const portalUrl = `${DESIGNER_PORTAL_URL}/desk?book=accounts&page=ledger&invoiceId=${invoice.id}`;
    const refundLabel = formatInvoiceCurrency(opts.refundedAmount, invoice.currency);

    // Designer-facing email (this is the designer's money, not the client's).
    const { data: designerProfile } = await admin
      .from('profiles')
      .select('email, full_name')
      .eq('id', invoice.designer_id)
      .maybeSingle();
    const designerEmail = (designerProfile as { email?: string | null } | null)?.email ?? null;

    if (designerEmail) {
      const rendered = buildPaymentRefundedEmail({
        invoiceNumber,
        projectName,
        designerName,
        refundedAmountCents: opts.refundedAmount,
        paymentAmountCents: row.amount_cents,
        partial: opts.partial,
        portalUrl,
        currency: invoice.currency,
      });
      const sendResult = await sendCompliantEmail(admin, {
        to: designerEmail,
        subject: rendered.subject,
        html: rendered.html,
        userId: invoice.designer_id,
        notificationType: 'invoice_payment_refunded',
        category: 'operational',
        templateId: 'invoice-payment-refunded',
        metadata: {
          invoice_id: invoice.id,
          project_id: invoice.project_id,
          invoice_payment_id: row.id,
          refunded_cents: opts.refundedAmount,
          partial: opts.partial,
          subject: rendered.subject,
          message: `${refundLabel} refunded on ${invoiceNumber}.`,
          deep_link: `/desk?book=accounts&page=ledger&invoiceId=${invoice.id}`,
        },
      });
      if (!sendResult.success && !sendResult.suppressed) {
        console.error('stripe-webhook: refund email failed', sendResult.error);
      }
    } else {
      console.warn('stripe-webhook: no designer email for refund notice on invoice', invoice.id);
    }

    // Designer in-app notification (mirrors the failure path's notification_log).
    const subject = opts.partial
      ? `Partial refund on ${invoiceNumber} — ${refundLabel}`
      : `Refund processed on ${invoiceNumber} — ${refundLabel}`;
    const { error: notifyErr } = await admin.from('notification_log').insert({
      user_id: invoice.designer_id,
      type: 'invoice_payment_refunded',
      channel: 'in_app',
      status: 'delivered',
      template_id: 'invoice-payment-refunded-designer',
      metadata: {
        invoice_id: invoice.id,
        project_id: invoice.project_id,
        invoice_payment_id: row.id,
        refunded_cents: opts.refundedAmount,
        partial: opts.partial,
        subject,
        message: opts.partial
          ? `${projectName}: partial refund of ${refundLabel} on ${invoiceNumber} — reconcile in Stripe (balance unchanged).`
          : `${projectName}: ${refundLabel} refunded on ${invoiceNumber} — the invoice has been reopened and earnings reversed.`,
        deep_link: `/desk?book=accounts&page=ledger&invoiceId=${invoice.id}`,
      },
    });
    if (notifyErr) {
      console.error('stripe-webhook: designer refund notification insert failed', notifyErr);
    }
  } catch (err) {
    console.error('stripe-webhook: invoice refund side effects failed', err);
  }
}

async function handleInvoiceRefund(
  admin: SupabaseClient,
  row: PaymentRow,
  full: boolean,
  refundedAmount: number,
  capturedAmount: number
): Promise<void> {
  if (!full) {
    // PARTIAL: change no row (partial accounting is v2). Log + notify.
    // "Partial" here means the refund did not cover the NET applied amount —
    // e.g. a fee-only refund on a surcharged charge.
    console.log(
      `stripe-webhook: partial refund ${refundedAmount} on invoice_payment ${row.id} (net applied ${row.amount_cents}, captured ${capturedAmount}) — no state change (v2)`
    );
    await sendInvoiceRefundSideEffects(admin, row, {
      partial: true,
      refundedAmount,
    });
    return;
  }
  // FULL: flip applied or overpayment-blocked money → refunded. The latter
  // closes the explicit requires_refund contract without ever crediting the
  // invoice/earnings. Guard makes distinct-event replay a no-op.
  const { data: flipped, error } = await admin
    .from('invoice_payments')
    .update({ status: 'refunded' })
    .eq('id', row.id)
    .in('status', ['succeeded', 'requires_refund'])
    .select('id');
  if (error) {
    throw new Error(`failed to mark invoice_payment ${row.id} refunded: ${error.message}`);
  }
  if ((flipped ?? []).length > 0) {
    await sendInvoiceRefundSideEffects(admin, row, {
      partial: false,
      refundedAmount,
    });
  }
}

async function handlePoRefund(
  admin: SupabaseClient,
  row: PoPaymentRow,
  full: boolean,
  refundedAmount: number,
  capturedAmount: number
): Promise<void> {
  if (!full) {
    // PARTIAL: no state flip. Log + informational notification (procurement_
    // notifications has no free-form detail column, so the amounts live in the
    // structured log; the row just signals "a refund happened, review Stripe").
    console.log(
      `stripe-webhook: partial refund ${refundedAmount} on po_payment ${row.id} (captured ${capturedAmount}) — state kept (v2)`
    );
    await notifyPoPayment(admin, row, 'payment_refunded');
    return;
  }
  // FULL: paid → refunded, keeping paid_date (historical fact). Guard on 'paid'
  // so a distinct-event replay no-ops.
  const { data: flipped, error } = await admin
    .from('po_payments')
    .update({ state: 'refunded', stripe_checkout_session_id: null })
    .eq('id', row.id)
    .eq('state', 'paid')
    .select('id');
  if (error) {
    throw new Error(`failed to mark po_payment ${row.id} refunded: ${error.message}`);
  }
  if ((flipped ?? []).length > 0) {
    await notifyPoPayment(admin, row, 'payment_refunded');
  }
}

async function handleDirectOrderRefund(
  admin: SupabaseClient,
  row: DirectOrderRow,
  full: boolean,
  refundedAmount: number,
  capturedAmount: number
): Promise<void> {
  if (!full) {
    console.log(
      `stripe-webhook: partial refund ${refundedAmount} on direct_order ${row.id} (captured ${capturedAmount}) — status kept (v2)`
    );
    await sendDirectOrderRefundOpsEmail(admin, row.id, {
      partial: true,
      refundedAmount,
    });
    return;
  }
  // FULL: paid → refunded (guard on 'paid' → distinct-event replay no-ops).
  const { data: flipped, error } = await admin
    .from('direct_orders')
    .update({ status: 'refunded', stripe_checkout_session_id: null })
    .eq('id', row.id)
    .eq('status', 'paid')
    .select('id');
  if (error) {
    throw new Error(`failed to mark direct_order ${row.id} refunded: ${error.message}`);
  }
  if ((flipped ?? []).length > 0) {
    await sendDirectOrderRefundOpsEmail(admin, row.id, {
      partial: false,
      refundedAmount,
    });
  }
}

/** Ops heads-up that a direct order was refunded (needs fulfillment reversal). Never throws. */
async function sendDirectOrderRefundOpsEmail(
  admin: SupabaseClient,
  orderId: string,
  opts: { partial: boolean; refundedAmount: number }
): Promise<void> {
  try {
    const order = await resolveDirectOrder(admin, null, null, orderId);
    if (!order) return;
    const opsEmail = Deno.env.get('OPS_NOTIFY_EMAIL');
    if (!opsEmail) {
      console.warn(
        'stripe-webhook: OPS_NOTIFY_EMAIL unset — skipping refund ops notice for direct_order',
        order.id
      );
      return;
    }
    const refundLabel = formatInvoiceCurrency(opts.refundedAmount, order.currency);
    const amountLabel = formatInvoiceCurrency(order.amount_cents, order.currency);
    const kind = opts.partial ? 'Partial refund' : 'Refund';
    // Escape every interpolated value (product_name is user-influenced snapshot).
    const opsHtml = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;color:#2c2926;line-height:1.55">
        <p>${escapeHtmlSafe(kind)} processed on a direct order${
          opts.partial ? ' (no status change)' : ''
        }.</p>
        <p style="margin:0 0 8px"><strong>Order:</strong> ${escapeHtmlSafe(order.id)}</p>
        <p style="margin:0 0 8px"><strong>Product:</strong> ${escapeHtmlSafe(
          order.product_name
        )}</p>
        <p style="margin:0 0 8px"><strong>Refunded:</strong> ${escapeHtmlSafe(refundLabel)} of ${escapeHtmlSafe(
          amountLabel
        )}</p>
        <p style="margin:0 0 8px"><strong>Status:</strong> ${escapeHtmlSafe(order.status)}</p>
      </div>`;
    const opsResult = await sendCompliantEmail(admin, {
      to: opsEmail,
      subject: `${kind} — direct order ${order.product_name} (${refundLabel})`,
      html: opsHtml,
      category: 'operational',
      templateId: 'direct-order-refund-ops',
    });
    if (!opsResult.success && !opsResult.suppressed) {
      console.error('stripe-webhook: direct_order refund ops email failed', opsResult.error);
    }
  } catch (err) {
    console.error('stripe-webhook: direct_order refund ops side effect failed', err);
  }
}

/** Minimal HTML escape for interpolated ops-email values (matches _shared/invoice-emails). */
function escapeHtmlSafe(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function handleChargeRefunded(admin: SupabaseClient, event: Stripe.Event): Promise<void> {
  const charge = event.data.object as Stripe.Charge;
  const paymentIntentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : (charge.payment_intent?.id ?? null);
  if (!paymentIntentId) {
    console.warn('stripe-webhook: charge.refunded without a payment_intent', event.id);
    return;
  }

  const shape = chargeRefundShape(charge);
  const refunded = shape.amountRefundedCents;
  const captured = shape.amountCapturedCents;

  // Resolve across the three payable tables in order.
  const { data: invPay, error: invPayError } = await admin
    .from('invoice_payments')
    .select(PAYMENT_COLS)
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle();
  if (invPayError) {
    throw new Error(
      `failed to look up invoice_payments for PI ${paymentIntentId}: ${invPayError.message}`
    );
  }
  if (invPay) {
    const invoiceRow = invPay as PaymentRow;
    // NET-based for an APPLIED payment: refunding the invoice-applied amount
    // (the only figure Patina shows a designer) fully reverses everything
    // Patina booked. See isFullInvoiceRefund.
    //
    // EXCEPT for a requires_refund row: that money was never applied to the
    // invoice, so Patina booked nothing to reverse and the client is owed the
    // whole GROSS Stripe captured — net AND surcharge. Classifying it against
    // net would mark a net-only refund "full" while the client is still short
    // the fee, so a requires_refund row is measured against captured.
    return handleInvoiceRefund(
      admin,
      invoiceRow,
      isFullInvoiceRefund(
        shape,
        invoiceRow.status === 'requires_refund' ? shape.amountCapturedCents : invoiceRow.amount_cents
      ),
      refunded,
      captured
    );
  }

  const { data: poPay, error: poPayError } = await admin
    .from('po_payments')
    .select(PO_PAYMENT_COLS)
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle();
  if (poPayError) {
    throw new Error(
      `failed to look up po_payments for PI ${paymentIntentId}: ${poPayError.message}`
    );
  }
  if (poPay) {
    // Captured == the payable amount on this rail (no surcharge exists) —
    // unchanged 00277 behavior.
    return handlePoRefund(
      admin,
      poPay as PoPaymentRow,
      isFullCapturedRefund(shape),
      refunded,
      captured
    );
  }

  const { data: directOrd, error: directOrdError } = await admin
    .from('direct_orders')
    .select(DIRECT_ORDER_COLS)
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle();
  if (directOrdError) {
    throw new Error(
      `failed to look up direct_orders for PI ${paymentIntentId}: ${directOrdError.message}`
    );
  }
  if (directOrd) {
    // Same as po_payments: captured == the payable amount.
    return handleDirectOrderRefund(
      admin,
      directOrd as DirectOrderRow,
      isFullCapturedRefund(shape),
      refunded,
      captured
    );
  }

  // Unmatched refund (e.g. a charge Patina never recorded) — acknowledge, don't loop.
  console.warn(
    'stripe-webhook: charge.refunded — no payable row for PI',
    paymentIntentId,
    event.id
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  // Raw body FIRST — the signature covers the exact bytes on the wire.
  const raw = await req.text();
  const sig = req.headers.get('stripe-signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!webhookSecret) {
    console.error('stripe-webhook: STRIPE_WEBHOOK_SECRET not configured');
    return json({ error: 'webhook_not_configured' }, 500);
  }
  if (!sig) {
    return json({ error: 'missing_signature' }, 400);
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      raw,
      sig,
      webhookSecret,
      undefined,
      cryptoProvider
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'signature verification failed';
    console.warn('stripe-webhook: signature verification failed:', detail);
    return json({ error: 'invalid_signature' }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── Idempotency claim: INSERT … ON CONFLICT (id) DO NOTHING ─────────────
  const { data: claimed, error: claimErr } = await admin
    .from('stripe_webhook_events')
    .upsert(
      {
        id: event.id,
        type: event.type,
        payload: event as unknown as Record<string, unknown>,
      },
      { onConflict: 'id', ignoreDuplicates: true }
    )
    .select('id');
  if (claimErr) {
    console.error('stripe-webhook: idempotency claim failed', claimErr);
    return json({ error: 'idempotency_claim_failed' }, 500); // Stripe retries
  }
  if (!claimed || claimed.length === 0) {
    return json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleSessionCompleted(admin, event);
        break;
      case 'checkout.session.async_payment_succeeded':
        await handleAsyncPaymentSucceeded(admin, event);
        break;
      case 'checkout.session.async_payment_failed':
        await handleAsyncPaymentFailed(admin, event);
        break;
      case 'payment_intent.succeeded':
        await handlePaymentIntentSettled(admin, event, 'succeeded');
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentIntentSettled(admin, event, 'failed');
        break;
      case 'charge.refunded':
        await handleChargeRefunded(admin, event);
        break;
      default:
        // Unsubscribed/uninteresting event — acknowledged, ledgered, ignored.
        break;
    }

    // ── Agent OS reconciliation emission (WP-2.1) — ADDITIVE call site ──────
    // Fan reconcile-worthy events onto the agent_tasks queue AFTER the money
    // path settled. FAILURE SEMANTICS SPLIT on whether this event also drove a
    // payable flip in the switch above:
    //   • money-path type → the flip (and maybe a receipt) already committed;
    //     a reconcile-enqueue failure must NOT release the idempotency claim
    //     and replay the event, so wrap it and log-and-swallow — the reconcile
    //     task is best-effort here.
    //   • reconcile-ONLY type → the queue task is the event's entire purpose,
    //     so let an enqueue failure THROW: the outer catch releases the claim
    //     and returns 500, and Stripe redelivers (idempotent on the event id).
    if (RECONCILE_EVENT_TYPES.has(event.type)) {
      if (MONEY_PATH_TYPES.has(event.type)) {
        try {
          await enqueueStripeEventTask(admin, event);
        } catch (emitErr) {
          console.error(
            `stripe-webhook: reconcile emit for money-path ${event.type} failed (swallowed)`,
            emitErr
          );
        }
      } else {
        await enqueueStripeEventTask(admin, event);
      }
    }

    // ── BOH fulfillment intake emission — ADDITIVE (S0) ────────────────────
    // A BOH order's payment_intent.succeeded (metadata.patina_order='boh_v1')
    // mints a first-class fulfillment_intake task. The money-path handler above
    // already no-oped for this PI (no invoice/po/direct-order payable). Log-and-
    // swallow like the money-path reconcile emit — the capture already settled.
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent;
      if (pi.metadata?.patina_order === 'boh_v1') {
        try {
          await enqueueAgentTask(admin as unknown as RpcClient, {
            taskType: 'fulfillment_intake',
            idempotencyKey: pi.id,
            onConflict: 'ignore',
            source: 'stripe-webhook',
            actor: 'stripe-webhook',
            summary: `boh intake ${pi.id}`,
            priority: 2,
            payload: { payment_intent_id: pi.id, livemode: event.livemode }, // identifiers only
          });
        } catch (bohErr) {
          console.error(
            'stripe-webhook: BOH fulfillment_intake enqueue failed (swallowed)',
            bohErr
          );
        }
      }
    }
  } catch (err) {
    // Release the idempotency claim so Stripe's retry re-processes the event;
    // every state flip above is guarded, so partial progress + retry is safe.
    console.error(`stripe-webhook: handler for ${event.type} failed`, err);
    await admin.from('stripe_webhook_events').delete().eq('id', event.id);
    return json({ error: 'handler_failed' }, 500);
  }

  return json({ received: true });
});
