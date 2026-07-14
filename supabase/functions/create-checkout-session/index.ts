// Supabase Edge Function: create-checkout-session
//
// The single Stripe Checkout entry point for the payment rail. Dispatches on
// the requested payable type and starts a Stripe hosted Checkout session,
// returning { url } for the caller to redirect to. verify_jwt stays ON
// (default) — the gateway demands a valid JWT, and this function additionally
// proves the caller is a party to the thing being paid.
//
// Request body — exactly one of:
//   { invoiceId }        — an issued invoice's remaining balance (client pays).
//                          `invoice_id` is accepted as an alias.
//   { po_payment_id }    — an "Order via Patina" catalog PO payment row
//                          (designer pays Patina). `poPaymentId` alias.
//   { direct_order_id }  — a client "buy now" order for a Patina-managed
//                          product (client pays). `directOrderId` alias.
//
// Shared flow (per payable):
//   1. Auth: resolve the caller from the Authorization header.
//   2. Load + authorize the payable (service role). Type-specific:
//        invoice     — caller must be the invoice's client or designer; guards
//                      status IN (sent, partially_paid) and amount_due > 0.
//        po_payment  — caller must be the PO's designer AND the PO must be
//                      is_patina_catalog; guards state <> 'paid' and
//                      amount_cents > 0. Non-catalog POs are paid outside
//                      Patina and are rejected 422.
//   3. Lazy Stripe customer for the paying caller profile.
//   4. Session reuse / stale-session cleanup (mirrors per type).
//   5. Create the session: mode 'payment', card + us_bank_account, one line
//      item at the payable amount, metadata { payable_type, … } on BOTH the
//      session and the payment intent (webhook resolution).
//   6. Persist the session pointer (+ a pending invoice_payments row for
//      invoices). The stripe-webhook function settles state from the metadata.
//
// Returns: { url: string }
//
// Required env (supabase secrets set … in hosted/self-hosted prod):
//   STRIPE_SECRET_KEY   — sk_live_… / sk_test_…
//   CLIENT_PORTAL_URL   — invoice success/cancel origin (default client.patina.cloud)
//   DESIGNER_PORTAL_URL — po_payment success/cancel origin (default app.patina.cloud)
// Plus the standard SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.

// deno-lint-ignore-file no-explicit-any

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';
import { resolveStudioIdentity } from '../_shared/studio-identity.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const CLIENT_PORTAL_URL = Deno.env.get('CLIENT_PORTAL_URL') ?? 'https://client.patina.cloud';
const DESIGNER_PORTAL_URL = Deno.env.get('DESIGNER_PORTAL_URL') ?? 'https://app.patina.cloud';

// Pinned — bump deliberately alongside the npm:stripe major.
const STRIPE_API_VERSION = '2025-02-24.acacia';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function getCallerUser(req: Request) {
  const auth = req.headers.get('Authorization');
  if (!auth) return null;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

interface CallerUser {
  id: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payable — the normalized unit the shared driver knows how to charge. The
// type-specific loaders below encapsulate authz, guards, session-reuse cleanup,
// and persistence so the driver stays payable-agnostic. Adding a third payable
// (direct_order) is a third loader + one dispatch arm, nothing here changes.
// ─────────────────────────────────────────────────────────────────────────────

interface Payable {
  payableType: 'invoice' | 'po_payment' | 'direct_order';
  amountCents: number;
  /** ISO currency, already lowercased for Stripe. */
  currency: string;
  lineItemName: string;
  /**
   * Optional per-unit line-item shape. When set, the session bills
   * `lineItemQuantity × lineItemUnitAmountCents` (a real quantity on the
   * receipt) instead of one lump of `amountCents`. Both must multiply out to
   * `amountCents`. Unset (invoice / po_payment) ⇒ one line of `amountCents`,
   * exactly as before.
   */
  lineItemQuantity?: number;
  lineItemUnitAmountCents?: number;
  /**
   * Collect a shipping address at Checkout (physical goods). Unset ⇒ no
   * shipping collection, exactly as before for invoice / po_payment.
   */
  shippingAddressCollection?: Stripe.Checkout.SessionCreateParams.ShippingAddressCollection;
  existingSessionId: string | null;
  /** Copied onto the session AND payment_intent_data for webhook resolution. */
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  /** 409 detail when a completed session still has an in-flight (ACH) payment. */
  processingDetail: string;
  /** A still-open reused session whose amount no longer matches was expired. */
  onStaleSession(sessionId: string): Promise<void>;
  /** True when a completed session still has money in flight (block re-open). */
  hasInFlightPayment(sessionId: string): Promise<boolean>;
  /** Persist the new session pointer (+ any pending payment row). */
  onSessionCreated(sessionId: string): Promise<void>;
}

interface InvoiceRow {
  id: string;
  designer_id: string;
  client_id: string | null;
  project_id: string;
  invoice_number: string | null;
  status: string;
  currency: string;
  total_cents: number;
  amount_paid_cents: number;
  stripe_checkout_session_id: string | null;
  project: { id: string; name: string; client_id: string | null } | null;
}

/** Invoice payable — existing behavior, unchanged semantics. */
async function loadInvoicePayable(
  admin: SupabaseClient,
  caller: CallerUser,
  invoiceId: string
): Promise<Payable | Response> {
  const { data, error } = await admin
    .from('invoices')
    .select(
      `
      id, designer_id, client_id, project_id, invoice_number, status,
      currency, total_cents, amount_paid_cents, stripe_checkout_session_id,
      project:projects!invoices_project_id_fkey(id, name, client_id)
    `
    )
    .eq('id', invoiceId)
    .maybeSingle();

  if (error) {
    console.error('create-checkout-session: invoice lookup failed', error);
    return json({ error: 'lookup_failed', detail: error.message }, 500);
  }
  const invoice = data as unknown as InvoiceRow | null;

  // The payer is normally the project's client; the designer may also start a
  // checkout against their own invoice (test-mode walkthroughs). Anything
  // else — including a real-but-foreign invoice id — collapses to 404 so the
  // endpoint doesn't confirm foreign ids exist.
  const isClient =
    !!invoice &&
    (caller.id === invoice.client_id || caller.id === invoice.project?.client_id);
  const isDesigner = !!invoice && caller.id === invoice.designer_id;
  if (!invoice || (!isClient && !isDesigner)) {
    return json({ error: 'invoice_not_found' }, 404);
  }

  if (invoice.status !== 'sent' && invoice.status !== 'partially_paid') {
    return json(
      {
        error: 'invoice_not_payable',
        detail: `Invoice is ${invoice.status}; only sent or partially paid invoices can be paid online.`,
      },
      409
    );
  }
  const amountDue = invoice.total_cents - invoice.amount_paid_cents;
  if (amountDue <= 0) {
    return json({ error: 'nothing_due', detail: 'This invoice has no remaining balance.' }, 409);
  }

  // Human-readable line item — append the studio name (Designer Studios) when
  // the resolver returns one. This is TEXT ONLY: no Stripe Connect, and the
  // statement descriptor / merchant identity stay "Patina" (single platform
  // account). projectId path is deterministic for multi-studio designers.
  const identity = await resolveStudioIdentity(admin, { projectId: invoice.project_id });
  const studioSuffix = identity?.name?.trim() ? ` · ${identity.name.trim()}` : '';
  const label = `Invoice ${invoice.invoice_number ?? invoice.id.slice(0, 8)} — ${
    invoice.project?.name ?? 'Patina project'
  }${studioSuffix}`;

  return {
    payableType: 'invoice',
    amountCents: amountDue,
    currency: (invoice.currency || 'USD').toLowerCase(),
    lineItemName: label,
    existingSessionId: invoice.stripe_checkout_session_id,
    metadata: { payable_type: 'invoice', invoice_id: invoice.id },
    successUrl: `${CLIENT_PORTAL_URL}/invoices/${invoice.id}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${CLIENT_PORTAL_URL}/invoices/${invoice.id}?checkout=cancelled`,
    processingDetail:
      'A bank transfer for this invoice is already processing. Bank transfers take 3–5 business days to clear.',
    async onStaleSession(sessionId: string) {
      // Amount drifted (e.g. a manual partial payment landed since the session
      // was created) — fail its pending payment row.
      await admin
        .from('invoice_payments')
        .update({ status: 'failed', note: 'Superseded — checkout session expired (amount changed).' })
        .eq('stripe_checkout_session_id', sessionId)
        .eq('status', 'pending');
    },
    async hasInFlightPayment(sessionId: string) {
      // Completed session with a still-pending payment row = ACH debit in flight.
      const { data: pendingRows } = await admin
        .from('invoice_payments')
        .select('id')
        .eq('stripe_checkout_session_id', sessionId)
        .eq('status', 'pending')
        .limit(1);
      return (pendingRows ?? []).length > 0;
    },
    async onSessionCreated(sessionId: string) {
      const { error: stampErr } = await admin
        .from('invoices')
        .update({ stripe_checkout_session_id: sessionId })
        .eq('id', invoice.id);
      if (stampErr) {
        console.error('create-checkout-session: failed to stamp invoice session id', stampErr);
      }
      const { error: paymentErr } = await admin.from('invoice_payments').insert({
        invoice_id: invoice.id,
        amount_cents: amountDue,
        method: 'stripe',
        status: 'pending',
        stripe_checkout_session_id: sessionId,
        recorded_by: caller.id,
      });
      if (paymentErr) {
        // Non-fatal: the webhook recreates the row from metadata.invoice_id if
        // it's missing when the session completes.
        console.error('create-checkout-session: failed to insert pending payment row', paymentErr);
      }
    },
  };
}

interface PoPaymentRow {
  id: string;
  purchase_order_id: string;
  kind: string;
  amount_cents: number;
  state: string;
  label: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  purchase_order: {
    id: string;
    designer_id: string;
    is_patina_catalog: boolean;
    status: string;
    po_number: string | null;
    vendor: { id: string; name: string | null } | null;
  } | null;
}

// Terminal purchase-order statuses whose (possibly stale) pending payment rows
// must never open a fresh Checkout. Mirrors the purchase_orders.status CHECK
// vocabulary (migration 00148: draft/confirmed/in_production/shipped/delivered/
// cancelled) and 00184's cancel cascade — 'cancelled' is the only dead-terminal
// status; 'delivered' is a legitimate completed order that may still owe a
// balance and stays payable.
const PO_TERMINAL_DEAD_STATUSES = new Set<string>(['cancelled']);

const PO_PAYMENT_KIND_LABEL: Record<string, string> = {
  deposit: 'Deposit',
  balance: 'Balance',
  milestone: 'Milestone',
};

/** po_payment payable — a designer paying Patina for an "Order via Patina" PO. */
async function loadPoPaymentPayable(
  admin: SupabaseClient,
  caller: CallerUser,
  poPaymentId: string
): Promise<Payable | Response> {
  const { data, error } = await admin
    .from('po_payments')
    .select(
      `
      id, purchase_order_id, kind, amount_cents, state, label,
      stripe_checkout_session_id, stripe_payment_intent_id,
      purchase_order:purchase_orders!po_payments_purchase_order_id_fkey(
        id, designer_id, is_patina_catalog, status, po_number,
        vendor:vendors!purchase_orders_vendor_id_fkey(id, name)
      )
    `
    )
    .eq('id', poPaymentId)
    .maybeSingle();

  if (error) {
    console.error('create-checkout-session: po_payment lookup failed', error);
    return json({ error: 'lookup_failed', detail: error.message }, 500);
  }
  const payment = data as unknown as PoPaymentRow | null;
  const po = payment?.purchase_order ?? null;

  // Only the owning designer may pay. Not-found and not-owner both collapse to
  // 404 so the endpoint doesn't confirm foreign ids exist.
  if (!payment || !po || caller.id !== po.designer_id) {
    return json({ error: 'po_payment_not_found' }, 404);
  }

  // Non-catalog vendor POs are paid directly with the vendor, never through
  // Patina. Reject clearly rather than opening a checkout that shouldn't exist.
  if (!po.is_patina_catalog) {
    return json(
      {
        error: 'po_not_patina_catalog',
        detail: 'This purchase order is paid directly with the vendor, not through Patina.',
      },
      422
    );
  }

  // A cancelled (terminal-dead) PO is done — its cancel cascade (00184) rolls
  // in-flight items back and detaches them, but a stale 'pending' payment row
  // can survive. Refuse checkout before the per-payment guards so that stale
  // row can never open a fresh session and charge for a cancelled order. Name
  // the offending status in the body so the client can explain it.
  if (PO_TERMINAL_DEAD_STATUSES.has(po.status)) {
    return json(
      {
        error: 'po_cancelled',
        detail: `This purchase order is ${po.status} and can no longer be paid.`,
      },
      409
    );
  }

  if (payment.state === 'paid') {
    return json(
      { error: 'po_payment_already_paid', detail: 'This purchase-order payment has already been paid.' },
      409
    );
  }
  if (payment.amount_cents <= 0) {
    return json({ error: 'nothing_due', detail: 'This purchase-order payment has no balance due.' }, 409);
  }

  const poLabel = po.po_number ?? `PO ${po.id.slice(0, 8)}`;
  const vendorName = po.vendor?.name?.trim() || 'vendor';
  const kindLabel =
    payment.label?.trim() || PO_PAYMENT_KIND_LABEL[payment.kind] || 'Payment';
  const lineItemName = `${poLabel} — ${vendorName} · ${kindLabel}`;

  const returnBase = `${DESIGNER_PORTAL_URL}/portal/procurement/by-vendor?po=${po.id}`;

  return {
    payableType: 'po_payment',
    amountCents: payment.amount_cents,
    currency: 'usd',
    lineItemName,
    existingSessionId: payment.stripe_checkout_session_id,
    metadata: {
      payable_type: 'po_payment',
      po_payment_id: payment.id,
      purchase_order_id: po.id,
    },
    successUrl: `${returnBase}&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${returnBase}&checkout=cancelled`,
    processingDetail:
      'A bank transfer for this order is already processing. Bank transfers take 3–5 business days to clear.',
    // Nothing to fail — the pointer lives on this row and is overwritten when a
    // fresh session is created below.
    onStaleSession: async () => {},
    async hasInFlightPayment(_sessionId: string) {
      // A completed Checkout session still pointed-to by a not-yet-paid row = a
      // payment in flight (card just cleared and the webhook hasn't landed, or an
      // ACH debit settling). Do NOT require a stamped PaymentIntent: the PI is
      // only stamped once the webhook processes, so between the user finishing
      // Checkout and the webhook landing a second session would double-charge.
      // A failed ACH already clears this pointer, so a still-present pointer on a
      // completed session is authoritative.
      const { data: fresh } = await admin
        .from('po_payments')
        .select('state')
        .eq('id', payment.id)
        .maybeSingle();
      const row = fresh as { state: string } | null;
      return !!row && row.state !== 'paid';
    },
    async onSessionCreated(sessionId: string) {
      const { error: stampErr } = await admin
        .from('po_payments')
        .update({ stripe_checkout_session_id: sessionId })
        .eq('id', payment.id);
      if (stampErr) {
        console.error('create-checkout-session: failed to stamp po_payment session id', stampErr);
      }
    },
  };
}

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
}

/** direct_order payable — a client buying a Patina-managed product ("buy now"). */
async function loadDirectOrderPayable(
  admin: SupabaseClient,
  caller: CallerUser,
  directOrderId: string
): Promise<Payable | Response> {
  const { data, error } = await admin
    .from('direct_orders')
    .select(
      `
      id, client_id, product_name, quantity, unit_price_cents, amount_cents,
      currency, status, stripe_checkout_session_id, stripe_payment_intent_id
    `
    )
    .eq('id', directOrderId)
    .maybeSingle();

  if (error) {
    console.error('create-checkout-session: direct_order lookup failed', error);
    return json({ error: 'lookup_failed', detail: error.message }, 500);
  }
  const order = data as unknown as DirectOrderRow | null;

  // Only the owning client may pay. Not-found and not-owner both collapse to
  // 404 so the endpoint doesn't confirm foreign ids exist.
  if (!order || caller.id !== order.client_id) {
    return json({ error: 'direct_order_not_found' }, 404);
  }

  if (order.status === 'paid') {
    return json(
      { error: 'direct_order_already_paid', detail: 'This order has already been paid.' },
      409
    );
  }
  if (order.status === 'canceled') {
    return json(
      { error: 'direct_order_canceled', detail: 'This order was canceled and can no longer be paid.' },
      409
    );
  }
  // A refunded order (00277) is terminal-dead: minting a fresh session here would
  // let the client be charged again, and the settle would then be refused (money
  // taken, no ledger flip). Refuse before any Stripe call — no session pointer is
  // ever written. Product answer: place a new order.
  if (order.status === 'refunded') {
    return json(
      {
        error: 'direct_order_refunded',
        detail: 'This order was refunded and can no longer be paid. Please place a new order.',
      },
      409
    );
  }
  if (order.amount_cents <= 0) {
    return json({ error: 'nothing_due', detail: 'This order has no balance due.' }, 409);
  }

  return {
    payableType: 'direct_order',
    amountCents: order.amount_cents,
    currency: (order.currency || 'usd').toLowerCase(),
    lineItemName: order.product_name,
    // Bill quantity × unit price (a real quantity on the receipt), not one lump.
    lineItemQuantity: order.quantity,
    lineItemUnitAmountCents: order.unit_price_cents,
    shippingAddressCollection: { allowed_countries: ['US'] },
    existingSessionId: order.stripe_checkout_session_id,
    metadata: { payable_type: 'direct_order', direct_order_id: order.id },
    successUrl: `${CLIENT_PORTAL_URL}/orders?order=${order.id}&checkout=success`,
    cancelUrl: `${CLIENT_PORTAL_URL}/orders?order=${order.id}&checkout=cancelled`,
    processingDetail:
      'A bank transfer for this order is already processing. Bank transfers take 3–5 business days to clear.',
    // Nothing to fail — the pointer lives on this row and is overwritten when a
    // fresh session is created below.
    onStaleSession: async () => {},
    async hasInFlightPayment(_sessionId: string) {
      // A completed Checkout session still pointed-to by a not-yet-paid order =
      // a payment in flight (card just cleared and the webhook hasn't landed, or
      // an ACH debit settling). Do NOT require a stamped PaymentIntent — it's
      // only stamped once the webhook processes, so a second session opened in
      // that window would double-charge. A failed ACH already clears this
      // pointer (see stripe-webhook), so a still-present pointer on a completed
      // session is authoritative. Mirrors the fixed po_payment guard (f072ce2f).
      const { data: fresh } = await admin
        .from('direct_orders')
        .select('status')
        .eq('id', order.id)
        .maybeSingle();
      const row = fresh as { status: string } | null;
      return !!row && row.status !== 'paid';
    },
    async onSessionCreated(sessionId: string) {
      const { error: stampErr } = await admin
        .from('direct_orders')
        .update({ stripe_checkout_session_id: sessionId })
        .eq('id', order.id);
      if (stampErr) {
        console.error('create-checkout-session: failed to stamp direct_order session id', stampErr);
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared driver: ensure Stripe customer → session reuse → create → persist.
// ─────────────────────────────────────────────────────────────────────────────

async function startCheckout(
  admin: SupabaseClient,
  stripe: Stripe,
  caller: CallerUser,
  payable: Payable
): Promise<Response> {
  // ── Lazy Stripe customer for the paying profile ──────────────────────────
  const { data: payerProfile, error: payerErr } = await admin
    .from('profiles')
    .select('id, email, full_name, stripe_customer_id')
    .eq('id', caller.id)
    .maybeSingle();
  if (payerErr || !payerProfile) {
    console.error('create-checkout-session: payer profile lookup failed', payerErr);
    return json({ error: 'payer_profile_not_found' }, 500);
  }

  let customerId: string | null = (payerProfile as any).stripe_customer_id ?? null;
  try {
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: (payerProfile as any).email ?? undefined,
        name: (payerProfile as any).full_name ?? undefined,
        metadata: { profile_id: caller.id },
      });
      customerId = customer.id;
      const { error: persistErr } = await admin
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', caller.id)
        .is('stripe_customer_id', null);
      if (persistErr) {
        // Non-fatal — worst case we create another customer next time.
        console.error('create-checkout-session: failed to persist stripe_customer_id', persistErr);
      }
    }

    // ── Session reuse / stale-session cleanup ────────────────────────────
    if (payable.existingSessionId) {
      let existing: Stripe.Checkout.Session | null = null;
      try {
        existing = await stripe.checkout.sessions.retrieve(payable.existingSessionId);
      } catch (err) {
        // Unknown/foreign session id (e.g. key rotated between test/live) —
        // treat as absent and let a fresh session replace it.
        console.warn('create-checkout-session: could not retrieve existing session', err);
      }

      if (existing?.status === 'open') {
        if (existing.amount_total === payable.amountCents && existing.url) {
          return json({ url: existing.url });
        }
        try {
          await stripe.checkout.sessions.expire(existing.id);
        } catch (err) {
          console.warn('create-checkout-session: expire failed', err);
        }
        await payable.onStaleSession(existing.id);
      } else if (existing?.status === 'complete') {
        if (await payable.hasInFlightPayment(existing.id)) {
          return json({ error: 'payment_processing', detail: payable.processingDetail }, 409);
        }
      }
    }

    // ── Create the Checkout session ──────────────────────────────────────
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      payment_method_types: ['card', 'us_bank_account'],
      payment_method_options: {
        // verification_method 'automatic' lets Financial Connections attempt
        // instant bank-account verification before falling back to Stripe's
        // micro-deposit flow (ported from portal/client-hardening).
        us_bank_account: { verification_method: 'automatic' },
      },
      line_items: [
        {
          // Defaults preserve invoice / po_payment behavior (one lump of
          // amountCents); direct_order sets a real per-unit quantity.
          quantity: payable.lineItemQuantity ?? 1,
          price_data: {
            currency: payable.currency,
            unit_amount: payable.lineItemUnitAmountCents ?? payable.amountCents,
            product_data: { name: payable.lineItemName },
          },
        },
      ],
      ...(payable.shippingAddressCollection
        ? { shipping_address_collection: payable.shippingAddressCollection }
        : {}),
      metadata: payable.metadata,
      payment_intent_data: { metadata: payable.metadata },
      success_url: payable.successUrl,
      cancel_url: payable.cancelUrl,
    });

    if (!session.url) {
      console.error('create-checkout-session: session created without url', session.id);
      return json({ error: 'stripe_error', detail: 'Checkout session has no URL.' }, 502);
    }

    await payable.onSessionCreated(session.id);
    return json({ url: session.url });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown stripe error';
    console.error('create-checkout-session: stripe call failed', detail);
    return json({ error: 'stripe_error', detail }, 502);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  const invoiceId: string | undefined = body?.invoiceId ?? body?.invoice_id;
  const poPaymentId: string | undefined = body?.po_payment_id ?? body?.poPaymentId;
  const directOrderId: string | undefined = body?.direct_order_id ?? body?.directOrderId;
  if (!invoiceId && !poPaymentId && !directOrderId) {
    return json({ error: 'payable_id_required' }, 400);
  }

  const caller = await getCallerUser(req);
  if (!caller) {
    return json({ error: 'unauthorized' }, 401);
  }

  if (!STRIPE_SECRET_KEY) {
    console.error('create-checkout-session: STRIPE_SECRET_KEY not configured');
    return json({ error: 'stripe_not_configured' }, 500);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── Load + authorize the requested payable ───────────────────────────────
  const payableResult = poPaymentId
    ? await loadPoPaymentPayable(admin, caller, poPaymentId)
    : directOrderId
    ? await loadDirectOrderPayable(admin, caller, directOrderId)
    : await loadInvoicePayable(admin, caller, invoiceId as string);
  if (payableResult instanceof Response) {
    return payableResult;
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });

  return startCheckout(admin, stripe, caller, payableResult);
});
