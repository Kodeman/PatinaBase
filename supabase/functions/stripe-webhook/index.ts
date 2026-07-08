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
//   charge.refunded                     recorded in the events ledger only
//                                       (refund state machine is v2).
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
  buildPaymentFailedEmail,
  buildPaymentReceiptEmail,
  formatInvoiceCurrency,
} from '../_shared/invoice-emails.ts';
import { decideSessionCompletedAction, sessionIds } from './lib.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLIENT_PORTAL_URL = Deno.env.get('CLIENT_PORTAL_URL') ?? 'https://client.patina.cloud';

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
  amount_cents: number;
  method: string;
  status: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
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
  designer: { id: string; full_name: string | null; business_name: string | null } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lookups
// ─────────────────────────────────────────────────────────────────────────────

const PAYMENT_COLS =
  'id, invoice_id, amount_cents, method, status, stripe_checkout_session_id, stripe_payment_intent_id';

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
 * Flip a pending row to succeeded (concurrency-safe via the status guard).
 * Returns true only when THIS call performed the flip — side effects (receipt
 * email + designer notification) key off that so they fire exactly once.
 */
async function markSucceeded(
  admin: SupabaseClient,
  row: PaymentRow,
  eventId: string,
  paymentIntentId: string | null
): Promise<boolean> {
  const patch: Record<string, unknown> = {
    status: 'succeeded',
    received_at: new Date().toISOString(),
    stripe_event_id: eventId,
  };
  if (paymentIntentId && !row.stripe_payment_intent_id) {
    patch.stripe_payment_intent_id = paymentIntentId;
  }
  const { data, error } = await admin
    .from('invoice_payments')
    .update(patch)
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('id');
  if (error) {
    throw new Error(`failed to mark payment ${row.id} succeeded: ${error.message}`);
  }
  return (data ?? []).length > 0;
}

/** Receipt email + designer in_app notification after a successful flip. Never throws. */
async function sendSuccessSideEffects(
  admin: SupabaseClient,
  row: PaymentRow
): Promise<void> {
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
    const amountLabel = formatInvoiceCurrency(row.amount_cents, invoice.currency);

    // Receipt to the client (operational → suppression check, rate cap,
    // notification_log row that doubles as their in-app inbox entry).
    const recipient = await resolveRecipient(admin, invoice);
    if (recipient.email) {
      const rendered = buildPaymentReceiptEmail({
        invoiceNumber,
        projectName,
        designerName,
        clientName: recipient.name,
        amountPaidCents: row.amount_cents,
        balanceCents,
        portalUrl,
        currency: invoice.currency,
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
          amount_cents: row.amount_cents,
          subject: rendered.subject,
          message: `Your payment of ${amountLabel} toward ${invoiceNumber} was received.`,
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
        message: `${projectName}: ${subject.toLowerCase()}${paidInFull ? '' : ` (balance ${formatInvoiceCurrency(balanceCents, invoice.currency)})`}.`,
        deep_link: `/portal/billing/invoices/${invoice.id}`,
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
async function sendFailureSideEffects(
  admin: SupabaseClient,
  row: PaymentRow
): Promise<void> {
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
      const rendered = buildPaymentFailedEmail({
        invoiceNumber,
        projectName,
        designerName,
        clientName: recipient.name,
        amountCents: row.amount_cents,
        portalUrl,
        currency: invoice.currency,
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
        deep_link: `/portal/billing/invoices/${invoice.id}`,
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

async function handleSessionCompleted(
  admin: SupabaseClient,
  event: Stripe.Event
): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  const { sessionId, paymentIntentId, invoiceId } = sessionIds(session);

  let row = await resolvePaymentRow(admin, sessionId, paymentIntentId, invoiceId);

  // Belt-and-suspenders: if create-checkout-session failed to insert the
  // pending row, recreate it from the session itself.
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

  const action = decideSessionCompletedAction(
    session.payment_status,
    paymentIntentId,
    !!row.stripe_payment_intent_id
  );
  if (action.kind === 'settle') {
    const flipped = await markSucceeded(admin, row, event.id, paymentIntentId);
    if (flipped) await sendSuccessSideEffects(admin, row);
  } else if (action.kind === 'stamp_payment_intent') {
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
  const { sessionId, paymentIntentId, invoiceId } = sessionIds(session);
  const row = await resolvePaymentRow(admin, sessionId, paymentIntentId, invoiceId);
  if (!row) {
    console.warn('stripe-webhook: async_payment_succeeded with no payment row', sessionId);
    return;
  }
  const flipped = await markSucceeded(admin, row, event.id, paymentIntentId);
  if (flipped) await sendSuccessSideEffects(admin, row);
}

async function handleAsyncPaymentFailed(
  admin: SupabaseClient,
  event: Stripe.Event
): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  const { sessionId, paymentIntentId, invoiceId } = sessionIds(session);
  const row = await resolvePaymentRow(admin, sessionId, paymentIntentId, invoiceId);
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
    throw new Error(`failed to clear session pointer on invoice ${row.invoice_id}: ${clearErr.message}`);
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
  const row = await resolvePaymentRow(admin, null, pi.id, null);
  if (!row || row.status !== 'pending') return;

  if (outcome === 'succeeded') {
    const flipped = await markSucceeded(admin, row, event.id, pi.id);
    if (flipped) await sendSuccessSideEffects(admin, row);
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
      { id: event.id, type: event.type, payload: event as unknown as Record<string, unknown> },
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
        // v2 territory: record only (payload already in stripe_webhook_events).
        console.log('stripe-webhook: charge.refunded recorded (no state change, v2)', event.id);
        break;
      default:
        // Unsubscribed/uninteresting event — acknowledged, ledgered, ignored.
        break;
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
