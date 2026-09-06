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
//   { invoiceId, reconcile_session_id }
//                          Authenticated fallback for an exact pending invoice
//                          session when webhook delivery has not settled it.
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
//      item at the payable amount, metadata { payable_type, … } on the session
//      (webhook resolution) and on the payment intent. DIRECT ORDER (00540):
//      the PaymentIntent's metadata is widened to the fulfillment-intake
//      contract, a second "Delivery" line carries the freight already folded
//      into amount_cents, and automatic_tax / shipping_options are added ONLY
//      when fulfillment_config direct_orders.tax_shipping_enabled says so.
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
import { invoiceBrandingRef, invoiceSubjectName } from '../_shared/invoice-subject.ts';
import { clientProjectLink } from '../_shared/client-portal-links.ts';
import {
  type InvoiceCheckoutAttempt,
  InvoiceCheckoutIntegrityError,
  type InvoiceCheckoutPaymentMethod,
  invoiceCheckoutReturnAddress,
  reconcileInvoiceCheckoutSession,
} from '../_shared/invoice-checkout-core.ts';
import {
  checkoutCustomerFailureBody,
  ensureStripeCustomer,
} from '../_shared/invoice-checkout-stripe.ts';
import {
  invoiceAttemptFields,
  startInvoiceCheckout,
  stripeSessionView,
} from '../_shared/invoice-checkout-driver.ts';
import { ensureInvoiceLinkUrl } from '../_shared/invoice-links.ts';
import {
  TAX_SHIPPING_CONFIG_KEY,
  buildDirectOrderIntakeMetadata,
  directOrderSessionExtras,
  parseTaxShippingConfig,
  type TaxShippingConfig,
} from './direct-order.ts';

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
  /**
   * Extra Checkout lines beyond the one built from lineItem* above — the
   * direct-order rail's flat freight, so a buyer sees what she is paying for
   * instead of one silently inflated piece price. Their amounts are already
   * inside `amountCents`.
   */
  additionalLineItems?: Stripe.Checkout.SessionCreateParams.LineItem[];
  /**
   * Stripe Tax / shipping rates, added only when the server says so
   * (fulfillment_config direct_orders.tax_shipping_enabled). When either is
   * present the session's amount_total exceeds `amountCents`, so reuse
   * compares against amount_subtotal instead — see startCheckout.
   */
  automaticTax?: Stripe.Checkout.SessionCreateParams.AutomaticTax;
  shippingOptions?: Stripe.Checkout.SessionCreateParams.ShippingOption[];
  existingSessionId: string | null;
  /**
   * Copied onto the session for webhook resolution. Keep it to the two keys
   * the dispatch actually reads — Stripe caps metadata at 50 keys / 500 chars
   * per value, and the wide payload belongs on the PaymentIntent.
   */
  metadata: Record<string, string>;
  /**
   * The PaymentIntent's metadata. Defaults to `metadata`. The direct-order rail
   * widens this to the fulfillment-intake contract (fulfillment-intake/core.ts
   * normalizeIntakePayload reads pi.metadata and nothing else).
   */
  paymentIntentMetadata?: Record<string, string>;
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
  // NULL on a studio invoice — an invoice drawn for a household with no house.
  project_id: string | null;
  studio_id: string | null;
  title: string | null;
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
      id, designer_id, client_id, project_id, studio_id, title, invoice_number, status,
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
  // account). The invoice's own studio_id is deterministic for multi-studio
  // designers and is the only anchor a studio invoice has.
  const identity = await resolveStudioIdentity(admin, invoiceBrandingRef(invoice));
  const studioSuffix = identity?.name?.trim() ? ` · ${identity.name.trim()}` : '';
  const label = `Invoice ${invoice.invoice_number ?? invoice.id.slice(0, 8)} — ${
    invoiceSubjectName(invoice, 'Studio invoice')
  }${studioSuffix}`;

  return {
    payableType: 'invoice',
    amountCents: amountDue,
    currency: (invoice.currency || 'USD').toLowerCase(),
    lineItemName: label,
    existingSessionId: invoice.stripe_checkout_session_id,
    metadata: { payable_type: 'invoice', invoice_id: invoice.id },
    // Back to the page the client pays from — the letterbox reads ?checkout=
    // there and states the outcome in place. `invoice` names which one settled,
    // and `#letterbox` puts the receipt on screen at first paint instead of
    // after hydration rewrites the hash. A studio invoice has no house, so it
    // returns to the front door. The fragment survives the attempt params:
    // invoiceCheckoutReturnUrl splits it off and re-appends it last
    // (invoice-checkout-core.ts).
    //
    // ⚠ DEPLOY ORDER — this function must NOT ship before the flagless client
    // portal. `/projects/[projectId]` on the currently-deployed worker reads no
    // `?checkout=` at all, so a return landing there gets no receipt and no
    // cancellation notice. Ship order is: portal first, probe it, THEN these
    // functions (2026-09-04 review, finding 2).
    //
    // A studio invoice (`project_id IS NULL`) is reachable: the client portal's
    // houseless door and the merged client-invoice read ship in the SAME
    // release as this function. Delivered order is migration → these functions
    // → designer portal → client portal, so a studio invoice can only be drawn
    // once the whole chain stands.
    successUrl: invoiceCheckoutReturnAddress(
      CLIENT_PORTAL_URL,
      invoice.project_id,
      invoice.id,
      'success'
    ),
    cancelUrl: invoiceCheckoutReturnAddress(
      CLIENT_PORTAL_URL,
      invoice.project_id,
      invoice.id,
      'cancelled'
    ),
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
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
  currency: string;
  status: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  designer_id: string | null;
  project_id: string | null;
}

/**
 * Where Checkout hands a direct-order buyer back: the road of her project,
 * else the road of whichever house the front door opens.
 *
 * `/orders` is retired — a return sent there costs the buyer a 308 hop, and a
 * full sign-in round trip whenever the session cookie is not sent back on the
 * Stripe return. `clientProjectLink` is the same helper stripe-webhook's own
 * order mail uses, so both addresses now agree.
 *
 * ⚠ Same deploy gate as the invoice successUrl above: the portal ships first.
 * stripe-webhook's own emails still link `/invoices/<id>` on purpose — that
 * address is claimed by the iOS app and folds correctly for everyone else.
 */
function directOrderReturn(
  order: DirectOrderRow,
  checkout: 'success' | 'cancelled',
): string {
  return clientProjectLink(CLIENT_PORTAL_URL, order.project_id, 'road', {
    order: order.id,
    checkout,
  });
}

/**
 * Read fulfillment_config direct_orders.tax_shipping_enabled (00540). The I/O
 * half; parseTaxShippingConfig owns the shape and the fail-closed rule.
 */
async function loadTaxShippingConfig(admin: SupabaseClient): Promise<TaxShippingConfig> {
  const { data, error } = await admin
    .from('fulfillment_config')
    .select('value')
    .eq('key', TAX_SHIPPING_CONFIG_KEY)
    .maybeSingle();
  if (error) {
    console.error('create-checkout-session: tax_shipping_enabled lookup failed', error);
    return { enabled: false, shippingRateIds: [] };
  }
  return parseTaxShippingConfig((data as { value?: unknown } | null)?.value);
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
      id, client_id, product_id, product_name, quantity, unit_price_cents, amount_cents,
      currency, status, stripe_checkout_session_id, stripe_payment_intent_id,
      designer_id, project_id
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

  const currency = (order.currency || 'usd').toLowerCase();
  const taxShipping = await loadTaxShippingConfig(admin);
  const extras = directOrderSessionExtras({ order, currency, taxShipping });

  // Buyer identity for the intake contract. A missing profile is not fatal —
  // normalizeIntakePayload defaults the name — so this never blocks a payment.
  const { data: buyer } = await admin
    .from('profiles')
    .select('full_name, email')
    .eq('id', order.client_id)
    .maybeSingle();

  // The roster row linking this designer to this buyer, when there is one.
  // fulfillment_orders.designer_client_id FKs to it; absent is fine.
  let designerClientId: string | null = null;
  if (order.designer_id) {
    const { data: roster } = await admin
      .from('designer_clients')
      .select('id')
      .eq('designer_id', order.designer_id)
      .eq('client_id', order.client_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    designerClientId = (roster as { id?: string } | null)?.id ?? null;
  }

  return {
    payableType: 'direct_order',
    amountCents: order.amount_cents,
    currency,
    lineItemName: order.product_name,
    // Bill quantity × unit price (a real quantity on the receipt), not one lump.
    lineItemQuantity: order.quantity,
    lineItemUnitAmountCents: order.unit_price_cents,
    ...(extras.additionalLineItems
      ? {
          additionalLineItems:
            extras.additionalLineItems as unknown as Stripe.Checkout.SessionCreateParams.LineItem[],
        }
      : {}),
    ...(extras.automaticTax ? { automaticTax: extras.automaticTax } : {}),
    ...(extras.shippingOptions
      ? {
          shippingOptions:
            extras.shippingOptions as unknown as Stripe.Checkout.SessionCreateParams.ShippingOption[],
        }
      : {}),
    shippingAddressCollection: { allowed_countries: ['US'] },
    existingSessionId: order.stripe_checkout_session_id,
    metadata: { payable_type: 'direct_order', direct_order_id: order.id },
    paymentIntentMetadata: buildDirectOrderIntakeMetadata({
      order,
      clientName: (buyer as { full_name?: string | null } | null)?.full_name ?? null,
      clientEmail: (buyer as { email?: string | null } | null)?.email ?? null,
      designerClientId,
    }),
    // The road on the order's own project page reads ?checkout= there. An
    // order raised without a project has no house to return to and keeps the
    // orders list.
    successUrl: directOrderReturn(order, 'success'),
    cancelUrl: directOrderReturn(order, 'cancelled'),
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

async function reconcileStoredInvoiceCheckout(
  admin: SupabaseClient,
  stripe: Stripe,
  caller: CallerUser,
  invoiceId: string,
  sessionId: string,
): Promise<Response> {
  const { data: attemptData, error: attemptError } = await admin
    .from('invoice_checkout_attempts')
    .select(
      'id, invoice_id, payer_id, invoice_link_id, return_nonce, stripe_customer_id, amount_cents, surcharge_cents, payment_method, currency, state, stripe_idempotency_key, stripe_checkout_session_id',
    )
    .eq('invoice_id', invoiceId)
    .eq('stripe_checkout_session_id', sessionId)
    .maybeSingle();
  if (attemptError) {
    console.error('create-checkout-session: reconciliation attempt lookup failed', attemptError);
    return json({ error: 'lookup_failed', detail: attemptError.message }, 500);
  }
  if (!attemptData) return json({ error: 'invoice_not_found' }, 404);

  const [invoiceResult, paymentResult] = await Promise.all([
    admin.from('invoices').select('designer_id').eq('id', invoiceId).maybeSingle(),
    admin
      .from('invoice_payments')
      .select('id, stripe_event_id, stripe_checkout_session_id')
      .eq('checkout_attempt_id', attemptData.id)
      .maybeSingle(),
  ]);
  if (invoiceResult.error || paymentResult.error) {
    const detail = invoiceResult.error?.message ?? paymentResult.error?.message ?? 'lookup failed';
    console.error('create-checkout-session: reconciliation payment lookup failed', detail);
    return json({ error: 'lookup_failed', detail }, 500);
  }

  const invoice = invoiceResult.data as { designer_id: string } | null;
  const payment = paymentResult.data as {
    id: string;
    stripe_event_id: string | null;
    stripe_checkout_session_id: string | null;
  } | null;
  if (
    !invoice ||
    (caller.id !== attemptData.payer_id && caller.id !== invoice.designer_id)
  ) {
    return json({ error: 'invoice_not_found' }, 404);
  }
  if (!payment || payment.stripe_checkout_session_id !== sessionId) {
    return json(
      {
        error: 'payment_reconciliation_required',
        detail: 'The exact pending Checkout payment could not be resolved.',
      },
      409,
    );
  }

  const activeState =
    attemptData.state === 'claimed' ||
    attemptData.state === 'session_created' ||
    attemptData.state === 'processing';
  const knownMethod =
    attemptData.payment_method === null ||
    attemptData.payment_method === 'card' ||
    attemptData.payment_method === 'us_bank_account';
  if (
    !activeState ||
    !knownMethod ||
    !attemptData.id ||
    // Exactly one of payer_id / invoice_link_id — the 00574 discriminated union.
    (typeof attemptData.payer_id === 'string' && attemptData.payer_id.length > 0) ===
      (typeof attemptData.invoice_link_id === 'string' && attemptData.invoice_link_id.length > 0) ||
    !attemptData.stripe_customer_id ||
    !Number.isInteger(attemptData.amount_cents) ||
    !Number.isInteger(attemptData.surcharge_cents) ||
    !attemptData.currency ||
    !attemptData.stripe_idempotency_key
  ) {
    return json(
      {
        error: 'payment_reconciliation_required',
        detail: 'The Checkout attempt is not active or complete enough to reconcile.',
      },
      409,
    );
  }

  const attempt: InvoiceCheckoutAttempt = {
    attemptId: attemptData.id,
    paymentId: payment.id,
    invoiceId: attemptData.invoice_id,
    payerId: attemptData.payer_id ?? null,
    invoiceLinkId: attemptData.invoice_link_id ?? null,
    returnNonce: attemptData.return_nonce ?? null,
    stripeCustomerId: attemptData.stripe_customer_id,
    amountCents: attemptData.amount_cents,
    surchargeCents: attemptData.surcharge_cents,
    paymentMethod: attemptData.payment_method as InvoiceCheckoutPaymentMethod | null,
    currency: attemptData.currency,
    state: attemptData.state as InvoiceCheckoutAttempt['state'],
    stripeIdempotencyKey: attemptData.stripe_idempotency_key,
    stripeCheckoutSessionId: sessionId,
    supersededSessionId: null,
  };

  let stripeSession: Stripe.Checkout.Session;
  try {
    stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Stripe session unavailable.';
    return json({ error: 'checkout_session_unavailable', detail }, 502);
  }

  const session = stripeSessionView(stripeSession);
  try {
    const result = await reconcileInvoiceCheckoutSession(attempt, session, async () => {
      const paymentIntentId =
        typeof stripeSession.payment_intent === 'string'
          ? stripeSession.payment_intent
          : (stripeSession.payment_intent?.id ?? null);
      const { data, error } = await admin.rpc('settle_invoice_checkout_payment', {
        p_payment_id: payment.id,
        p_stripe_event_id: payment.stripe_event_id ?? `checkout-session:${sessionId}`,
        p_stripe_payment_intent_id: paymentIntentId,
        p_reported_amount_cents: stripeSession.amount_total,
        p_stripe_payment_method_type:
          attempt.paymentMethod ?? (stripeSession.payment_status === 'paid' ? 'card' : null),
      });
      if (error) throw new Error(`failed to settle payment ${payment.id}: ${error.message}`);
      const outcome = (data as { outcome?: string } | null)?.outcome;
      if (
        outcome !== 'succeeded' &&
        outcome !== 'requires_refund' &&
        outcome !== 'refunded' &&
        outcome !== 'failed' &&
        outcome !== 'pending'
      ) {
        throw new Error(`settlement returned an invalid outcome for payment ${payment.id}`);
      }
      return outcome;
    });
    return json({ status: result.kind, ...invoiceAttemptFields(attempt, sessionId) });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Checkout reconciliation failed.';
    if (error instanceof InvoiceCheckoutIntegrityError) {
      return json({ error: 'payment_reconciliation_required', detail }, 409);
    }
    console.error('create-checkout-session: reconciliation failed', error);
    return json({ error: 'checkout_reconciliation_failed', detail }, 500);
  }
}

/**
 * The signed-in invoice rail: the caller's own Stripe customer, then the shared
 * driver on the payer identity. Return addresses move onto the
 * /pay/return/<nonce> form (00574, S10) whenever the invoice has a live link;
 * ensureInvoiceLinkUrl returning null — the M7 safety valve — keeps today's
 * letterbox address so a session is never created with a broken return.
 */
async function startSignedInInvoiceCheckout(
  admin: SupabaseClient,
  stripe: Stripe,
  caller: CallerUser,
  payable: Payable,
  paymentMethod: InvoiceCheckoutPaymentMethod | null
): Promise<Response> {
  const customer = await ensureStripeCustomer(admin, stripe, caller.id);
  if (!customer.ok) return json(checkoutCustomerFailureBody(customer), customer.status);
  const invoiceId = payable.metadata.invoice_id;
  const linkUrl = await ensureInvoiceLinkUrl(admin, CLIENT_PORTAL_URL, invoiceId);
  return startInvoiceCheckout({
    admin,
    stripe,
    json,
    logTag: 'create-checkout-session',
    actor: {
      kind: 'payer',
      payerId: caller.id,
      stripeCustomerId: customer.customerId,
      allowDesignerTest: INVOICE_CHECKOUT_DESIGNER_TEST_MODE,
    },
    target: {
      invoiceId,
      lineItemName: payable.lineItemName,
      successUrl: payable.successUrl,
      cancelUrl: payable.cancelUrl,
      processingDetail: payable.processingDetail,
      nonceReturnOrigin: linkUrl ? CLIENT_PORTAL_URL : null,
    },
    paymentMethod,
  });
}

async function startCheckout(
  admin: SupabaseClient,
  stripe: Stripe,
  caller: CallerUser,
  payable: Payable
): Promise<Response> {
  // ── Lazy Stripe customer for the paying profile ──────────────────────────
  const customer = await ensureStripeCustomer(admin, stripe, caller.id);
  if (!customer.ok) return json(checkoutCustomerFailureBody(customer), customer.status);
  const customerId = customer.customerId;
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
        // With automatic_tax or a shipping rate on the session, amount_total is
        // our amount plus whatever Stripe added — comparing against it would
        // expire and re-mint a perfectly good session on every tap. amount_
        // subtotal is the line-item sum, which IS payable.amountCents.
        const reusableAmount =
          payable.automaticTax?.enabled || payable.shippingOptions?.length
            ? (existing.amount_subtotal ?? existing.amount_total)
            : existing.amount_total;
        if (reusableAmount === payable.amountCents && existing.url) {
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
        ...(payable.additionalLineItems ?? []),
      ],
      ...(payable.shippingAddressCollection
        ? { shipping_address_collection: payable.shippingAddressCollection }
        : {}),
      ...(payable.automaticTax
        ? {
            automatic_tax: payable.automaticTax,
            // Stripe Tax needs an address on the Customer to compute against;
            // 'auto' copies the one collected at Checkout onto it.
            customer_update: { address: 'auto' as const, shipping: 'auto' as const },
          }
        : {}),
      ...(payable.shippingOptions?.length ? { shipping_options: payable.shippingOptions } : {}),
      metadata: payable.metadata,
      payment_intent_data: { metadata: payable.paymentIntentMetadata ?? payable.metadata },
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
  const reconcileSessionId: string | undefined =
    body?.reconcile_session_id ?? body?.reconcileSessionId;
  if (!invoiceId && !poPaymentId && !directOrderId) {
    return json({ error: 'payable_id_required' }, 400);
  }
  if (
    reconcileSessionId &&
    (!invoiceId || poPaymentId || directOrderId || !reconcileSessionId.startsWith('cs_'))
  ) {
    return json({ error: 'invalid_reconciliation_target' }, 400);
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
  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });

  if (reconcileSessionId) {
    return reconcileStoredInvoiceCheckout(
      admin,
      stripe,
      caller,
      invoiceId as string,
      reconcileSessionId,
    );
  }

  // ── Load + authorize the requested payable ───────────────────────────────
  const payableResult = poPaymentId
    ? await loadPoPaymentPayable(admin, caller, poPaymentId)
    : directOrderId
      ? await loadDirectOrderPayable(admin, caller, directOrderId)
      : await loadInvoicePayable(admin, caller, invoiceId as string);
  if (payableResult instanceof Response) {
    return payableResult;
  }

  // paymentMethod is deliberately dropped for po_payment / direct_order — those
  // rails carry no surcharge model and keep offering card + ACH together.
  return payableResult.payableType === 'invoice'
    ? startSignedInInvoiceCheckout(admin, stripe, caller, payableResult, paymentMethod)
    : startCheckout(admin, stripe, caller, payableResult);
});
