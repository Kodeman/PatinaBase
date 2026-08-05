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
// Optional (INVOICES ONLY, ignored for po_payment / direct_order):
//   { payment_method }   — 'card' | 'us_bank_account'. `paymentMethod` alias.
//                          Restricts Checkout to that one rail and applies the
//                          rail's processing fee as a SECOND line item on top of
//                          the invoice balance. Omitted (the iOS client, and any
//                          legacy caller) ⇒ NULL claim ⇒ both rails, no fee, a
//                          byte-identical session to before. Any other value is
//                          rejected 400 invalid_payment_method.
//
// Shared flow (per payable):
//   1. Auth: resolve the caller from the Authorization header.
//   2. Load + authorize the payable (service role). Type-specific:
//        invoice     — caller must be the invoice's client. An explicit
//                      test-only designer override is honored only with a
//                      Stripe test key; guards status / balance in the DB claim.
//        po_payment  — caller must be the PO's designer AND the PO must be
//                      is_patina_catalog; guards state <> 'paid' and
//                      amount_cents > 0. Non-catalog POs are paid outside
//                      Patina and are rejected 422.
//   3. Lazy Stripe customer for the paying caller profile.
//   4. Invoice only: atomically claim one payer-bound DB attempt + pending
//      payment before Stripe, then reuse one stable Stripe idempotency key.
//      PO/direct-order keep their existing pointer flow.
//   5. Create the session: mode 'payment', card + us_bank_account, one line
//      item at the payable amount, metadata { payable_type, … } on BOTH the
//      session and the payment intent (webhook resolution).
//   6. Persist the session pointer (+ a pending invoice_payments row for
//      invoices). The stripe-webhook function settles state from the metadata.
//
// Invoice ready returns:
//   { url, amount_cents, currency, checkout_attempt_id, payment_id,
//     session_id, reused }
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
import {
  type InvoiceCheckoutAttempt,
  InvoiceCheckoutIntegrityError,
  type InvoiceCheckoutPaymentMethod,
  type InvoiceCheckoutSession,
  invoiceCheckoutReturnUrl,
  runInvoiceCheckout,
} from './invoice-checkout-core.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const CLIENT_PORTAL_URL = Deno.env.get('CLIENT_PORTAL_URL') ?? 'https://client.patina.cloud';
const DESIGNER_PORTAL_URL = Deno.env.get('DESIGNER_PORTAL_URL') ?? 'https://app.patina.cloud';
const INVOICE_CHECKOUT_DESIGNER_TEST_MODE =
  Deno.env.get('INVOICE_CHECKOUT_DESIGNER_TEST_MODE') === 'true' &&
  STRIPE_SECRET_KEY?.startsWith('sk_test_') === true;

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

/** Invoice payable — client-only, except an explicit Stripe-test-mode override. */
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

  // A payable invoice belongs to its snapshotted client (falling back to the
  // project's client for legacy rows). Designers cannot become the payer by
  // merely owning the invoice. The sole override is explicit AND test-key-only.
  // Foreign ids collapse to 404 so this endpoint never confirms existence.
  const isClient = !!invoice && caller.id === (invoice.client_id ?? invoice.project?.client_id);
  const isDesignerTest =
    !!invoice && INVOICE_CHECKOUT_DESIGNER_TEST_MODE && caller.id === invoice.designer_id;
  if (!invoice || (!isClient && !isDesignerTest)) {
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
    return json(
      {
        error: 'nothing_due',
        detail: 'This invoice has no remaining balance.',
      },
      409
    );
  }

  // Human-readable line item — append the studio name (Designer Studios) when
  // the resolver returns one. This is TEXT ONLY: no Stripe Connect, and the
  // statement descriptor / merchant identity stay "Patina" (single platform
  // account). projectId path is deterministic for multi-studio designers.
  const identity = await resolveStudioIdentity(admin, {
    projectId: invoice.project_id,
  });
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
        .update({
          status: 'failed',
          note: 'Superseded — checkout session expired (amount changed).',
        })
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
      {
        error: 'po_payment_already_paid',
        detail: 'This purchase-order payment has already been paid.',
      },
      409
    );
  }
  if (payment.amount_cents <= 0) {
    return json(
      {
        error: 'nothing_due',
        detail: 'This purchase-order payment has no balance due.',
      },
      409
    );
  }

  const poLabel = po.po_number ?? `PO ${po.id.slice(0, 8)}`;
  const vendorName = po.vendor?.name?.trim() || 'vendor';
  const kindLabel = payment.label?.trim() || PO_PAYMENT_KIND_LABEL[payment.kind] || 'Payment';
  const lineItemName = `${poLabel} — ${vendorName} · ${kindLabel}`;

  const returnBase = `${DESIGNER_PORTAL_URL}/desk?book=orders&po=${po.id}`;

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
      {
        error: 'direct_order_already_paid',
        detail: 'This order has already been paid.',
      },
      409
    );
  }
  if (order.status === 'canceled') {
    return json(
      {
        error: 'direct_order_canceled',
        detail: 'This order was canceled and can no longer be paid.',
      },
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
    return json(
      {
        error: 'nothing_due',
        detail: 'This order has no balance due.',
      },
      409
    );
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

async function ensureStripeCustomer(
  admin: SupabaseClient,
  stripe: Stripe,
  caller: CallerUser
): Promise<string | Response> {
  const { data: payerProfile, error: payerErr } = await admin
    .from('profiles')
    .select('id, email, full_name, stripe_customer_id')
    .eq('id', caller.id)
    .maybeSingle();
  if (payerErr || !payerProfile) {
    console.error('create-checkout-session: payer profile lookup failed', payerErr);
    return json({ error: 'payer_profile_not_found' }, 500);
  }

  let candidate = (payerProfile as any).stripe_customer_id as string | null;
  try {
    if (!candidate) {
      const customer = await stripe.customers.create(
        {
          email: (payerProfile as any).email ?? undefined,
          name: (payerProfile as any).full_name ?? undefined,
          metadata: { profile_id: caller.id },
        },
        { idempotencyKey: `patina-profile-customer:${caller.id}` }
      );
      candidate = customer.id;
      const { error: persistErr } = await admin
        .from('profiles')
        .update({ stripe_customer_id: candidate })
        .eq('id', caller.id)
        .is('stripe_customer_id', null);
      if (persistErr) {
        console.error('create-checkout-session: failed to persist stripe_customer_id', persistErr);
        return json(
          {
            error: 'customer_persistence_failed',
            detail: 'Checkout was not opened.',
          },
          500
        );
      }
    }

    // Use the compare-and-set winner, never an unpersisted candidate customer.
    const { data: canonical, error: canonicalErr } = await admin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', caller.id)
      .maybeSingle();
    const customerId = (canonical as any)?.stripe_customer_id as string | null;
    if (canonicalErr || !customerId) {
      console.error('create-checkout-session: canonical customer read failed', canonicalErr);
      return json(
        {
          error: 'customer_persistence_failed',
          detail: 'Checkout was not opened.',
        },
        500
      );
    }
    return customerId;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Stripe customer unavailable.';
    console.error('create-checkout-session: customer creation failed', detail);
    return json({ error: 'stripe_error', detail }, 502);
  }
}

function stripeSessionView(session: Stripe.Checkout.Session): InvoiceCheckoutSession {
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

function mapInvoiceAttempt(data: any): InvoiceCheckoutAttempt {
  if (
    !data?.attempt_id ||
    !data?.payment_id ||
    !data?.invoice_id ||
    !data?.payer_id ||
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
    payerId: data.payer_id,
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

function invoiceAttemptFields(attempt: InvoiceCheckoutAttempt, sessionId?: string | null) {
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

async function startInvoiceCheckout(
  admin: SupabaseClient,
  stripe: Stripe,
  caller: CallerUser,
  payable: Payable,
  paymentMethod: InvoiceCheckoutPaymentMethod | null
): Promise<Response> {
  const customerResult = await ensureStripeCustomer(admin, stripe, caller);
  if (customerResult instanceof Response) return customerResult;
  const customerId = customerResult;
  const invoiceId = payable.metadata.invoice_id;

  let lastAttempt: InvoiceCheckoutAttempt | null = null;
  try {
    const result = await runInvoiceCheckout({
      async claim() {
        const { data, error } = await admin.rpc('claim_invoice_checkout_attempt', {
          p_invoice_id: invoiceId,
          p_payer_id: caller.id,
          p_stripe_customer_id: customerId,
          p_allow_designer_test: INVOICE_CHECKOUT_DESIGNER_TEST_MODE,
          p_payment_method: paymentMethod,
        });
        if (error) throw error;
        const claimed = mapInvoiceAttempt(data);
        lastAttempt = claimed;
        // The claim superseded a live session on the other rail (or at the old
        // fee). Close it so the client can't wander back and pay the wrong
        // amount. Best-effort only — the DB already failed that attempt, so a
        // Stripe hiccup here must not break the fresh checkout (mirrors the
        // stale-session expire in startCheckout).
        if (claimed.supersededSessionId) {
          try {
            await stripe.checkout.sessions.expire(claimed.supersededSessionId);
          } catch (err) {
            console.warn('create-checkout-session: superseded session expire failed', err);
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
        const metadata = {
          payable_type: 'invoice',
          invoice_id: attempt.invoiceId,
          checkout_attempt_id: attempt.attemptId,
          payer_id: attempt.payerId,
          ...(attempt.paymentMethod
            ? {
                payment_method: attempt.paymentMethod,
                surcharge_cents: String(attempt.surchargeCents),
              }
            : {}),
        };
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
                  product_data: { name: payable.lineItemName },
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
            success_url: invoiceCheckoutReturnUrl(payable.successUrl, attempt),
            cancel_url: invoiceCheckoutReturnUrl(payable.cancelUrl, attempt),
          },
          { idempotencyKey: attempt.stripeIdempotencyKey }
        );
        return stripeSessionView(session);
      },
      async finalize(attempt, sessionId) {
        const { data, error } = await admin.rpc('finalize_invoice_checkout_attempt', {
          p_attempt_id: attempt.attemptId,
          p_payer_id: caller.id,
          p_stripe_customer_id: customerId,
          p_stripe_checkout_session_id: sessionId,
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
          detail: payable.processingDetail,
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
    const detail = error instanceof Error ? error.message : 'Invoice Checkout failed.';
    const dbMessage = (error as any)?.message ?? '';
    const fields = lastAttempt ? invoiceAttemptFields(lastAttempt) : {};

    if (dbMessage.includes('invoice_checkout_payer_not_allowed')) {
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
    console.error('create-checkout-session: invoice claim failed', error);
    return json({ error: 'checkout_claim_failed', detail, ...fields }, 500);
  }
}

async function startCheckout(
  admin: SupabaseClient,
  stripe: Stripe,
  caller: CallerUser,
  payable: Payable
): Promise<Response> {
  // ── Lazy Stripe customer for the paying profile ──────────────────────────
  const customerResult = await ensureStripeCustomer(admin, stripe, caller);
  if (customerResult instanceof Response) return customerResult;
  const customerId = customerResult;
  try {
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
          return json(
            {
              error: 'payment_processing',
              detail: payable.processingDetail,
            },
            409
          );
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
      return json(
        {
          error: 'stripe_error',
          detail: 'Checkout session has no URL.',
        },
        502
      );
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

  // Rail choice — invoices only. Absent/null ⇒ legacy path (both rails, no fee).
  // An unrecognized value is refused rather than silently downgraded to legacy,
  // so a client bug can never charge the wrong amount.
  const rawPaymentMethod = body?.payment_method ?? body?.paymentMethod;
  let paymentMethod: InvoiceCheckoutPaymentMethod | null = null;
  if (rawPaymentMethod !== undefined && rawPaymentMethod !== null) {
    if (rawPaymentMethod !== 'card' && rawPaymentMethod !== 'us_bank_account') {
      return json(
        {
          error: 'invalid_payment_method',
          detail: "payment_method must be 'card' or 'us_bank_account'.",
        },
        400
      );
    }
    paymentMethod = rawPaymentMethod;
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

  // paymentMethod is deliberately dropped for po_payment / direct_order — those
  // rails carry no surcharge model and keep offering card + ACH together.
  return payableResult.payableType === 'invoice'
    ? startInvoiceCheckout(admin, stripe, caller, payableResult, paymentMethod)
    : startCheckout(admin, stripe, caller, payableResult);
});
