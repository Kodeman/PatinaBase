// Supabase Edge Function: invoice-link-checkout
//
// The Invoice, Standing Alone (00574): the guest checkout for /pay/<token>.
// A homeowner with the link — signed in or not, with a Patina profile or not —
// picks a rail and pays. The 64-hex link token IS the credential, checked
// inside resolve_invoice_link_for_checkout (SECURITY DEFINER, service_role
// only); verify_jwt = false (config.toml) so the gateway does not demand a
// caller JWT.
//
// Request:  POST { token: "<64 hex>", method: "card" | "us_bank_account" | "check" }
// Returns:
//   200 { url, … }                    — a hosted Checkout session to redirect to
//   200 { ok: true, alreadyNotified } — the check rail: the designer is told
//   403 forbidden_origin              — Origin present and ≠ CLIENT_PORTAL_URL
//   404 invoice_not_found             — malformed / unknown / revoked / closed
//                                       token, draft / void invoice, no balance
//   400 bad_payment_method | invalid_payment_method
//   409 invoice_not_payable | checkout_payer_mismatch |
//       payment_reconciliation_required | payment_processing
//   500 stripe_not_configured | lookup_failed | customer_persistence_failed |
//       notification_failed | invoice_link_not_found | checkout_claim_failed
//   502 stripe_error
//
// CORS is NOT wildcard (S3/S12). The browser reaches this only through the
// client portal's same-origin route, which sends no Origin; anything else must
// equal CLIENT_PORTAL_URL, and Access-Control-Allow-Origin echoes that, never
// `*`. iOS opens the page, not the function.
//
// Who pays (F5 ruling): the LINK, always. Whether or not the invoice has a
// household profile, the guest rail opens Checkout on the per-link Stripe
// customer — created with no email, so Checkout collects one — and claims
// through claim_invoice_link_checkout_attempt (payer_id NULL). The household's
// own email is never prefilled or locked into a Checkout opened by whoever
// holds the link; the signed-in rail (create-checkout-session) is the only one
// that pays as the household profile. One identity per rail keeps the F1/M3
// cross-actor rules simple, and receipts still reach the household because
// resolveRecipient reads the profile email first, then payer_email.
//
// S13: the token is never logged. Log lines carry link / invoice ids only.
//
// Required env: STRIPE_SECRET_KEY, CLIENT_PORTAL_URL (default
// https://client.patina.cloud), DESIGNER_PORTAL_URL (check-rail folio link),
// plus the standard SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';
import { INVOICE_LINK_TOKEN_PATTERN } from '../_shared/invoice-links.ts';
import { invoiceCheckoutReturnAddress } from '../_shared/invoice-checkout-core.ts';
import {
  checkoutCustomerFailureBody,
  ensureLinkStripeCustomer,
} from '../_shared/invoice-checkout-stripe.ts';
import { startInvoiceCheckout } from '../_shared/invoice-checkout-driver.ts';
import {
  CHECK_INTENT_INVOICE_SELECT,
  type CheckIntentInvoice,
  checkIntentDepsFor,
  runInvoiceCheckIntent,
} from '../_shared/invoice-check-intent-core.ts';
import { resolveStudioIdentity } from '../_shared/studio-identity.ts';
import { invoiceBrandingRef, invoiceSubjectName } from '../_shared/invoice-subject.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const CLIENT_PORTAL_URL = (Deno.env.get('CLIENT_PORTAL_URL') ?? 'https://client.patina.cloud').replace(
  /\/$/,
  ''
);
const DESIGNER_PORTAL_URL = Deno.env.get('DESIGNER_PORTAL_URL') ?? 'https://app.patina.cloud';

// Pinned — bump deliberately alongside the npm:stripe major.
const STRIPE_API_VERSION = '2025-02-24.acacia';

const corsHeaders = {
  'Access-Control-Allow-Origin': CLIENT_PORTAL_URL,
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}

/** Absent (the Worker's server-side call) or exactly the client portal. */
export function originAllowed(origin: string | null, clientPortalUrl: string): boolean {
  if (origin === null) return true;
  return origin.replace(/\/$/, '') === clientPortalUrl.replace(/\/$/, '');
}

type PaymentMethod = 'card' | 'us_bank_account' | 'check';

interface CheckoutTargetRow {
  invoice_id: string;
  link_id: string;
  /** Informational only (the household, when one exists) — never used to pick a customer (F5). */
  payer_id: string | null;
  link_stripe_customer_id: string | null;
  balance_cents: number;
  currency: string;
  card_surcharge_bps: number;
  /** The household profile's name, else the designer's single email-only roster name (F14). */
  client_display_name: string | null;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  if (!originAllowed(origin, CLIENT_PORTAL_URL)) {
    return json({ error: 'forbidden_origin' }, 403);
  }
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
  const token: unknown = body?.token;
  const rawMethod: unknown = body?.method ?? body?.payment_method ?? body?.paymentMethod;

  // The regex gate runs before any round trip; a malformed token is the same
  // 404 as an unknown one, so the endpoint never confirms what a token is.
  if (typeof token !== 'string' || !INVOICE_LINK_TOKEN_PATTERN.test(token)) {
    return json({ error: 'invoice_not_found' }, 404);
  }
  if (rawMethod !== 'card' && rawMethod !== 'us_bank_account' && rawMethod !== 'check') {
    return json({ error: 'bad_payment_method' }, 400);
  }
  const method = rawMethod as PaymentMethod;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: resolved, error: resolveErr } = await admin.rpc(
    'resolve_invoice_link_for_checkout',
    { p_token: token }
  );
  if (resolveErr) {
    console.error('invoice-link-checkout: resolve failed', resolveErr.message);
    return json({ error: 'lookup_failed' }, 500);
  }
  const target = (Array.isArray(resolved) ? resolved[0] : resolved) as CheckoutTargetRow | undefined;
  if (!target || !target.invoice_id || !target.link_id) {
    return json({ error: 'invoice_not_found' }, 404);
  }

  const { data: invoiceData, error: invoiceErr } = await admin
    .from('invoices')
    .select(CHECK_INTENT_INVOICE_SELECT)
    .eq('id', target.invoice_id)
    .maybeSingle();
  if (invoiceErr) {
    console.error('invoice-link-checkout: invoice lookup failed', target.invoice_id, invoiceErr.message);
    return json({ error: 'lookup_failed' }, 500);
  }
  const invoice = invoiceData as unknown as CheckIntentInvoice | null;
  if (!invoice) {
    return json({ error: 'invoice_not_found' }, 404);
  }

  // ── The check rail: no money moves, the designer is told ───────────────
  if (method === 'check') {
    const outcome = await runInvoiceCheckIntent(invoice, {
      designerPortalUrl: DESIGNER_PORTAL_URL,
      deps: checkIntentDepsFor(admin),
      clientDisplayName: target.client_display_name,
    });
    if (!outcome.ok) {
      return json({ error: outcome.error, detail: outcome.detail }, 500);
    }
    return json({ ok: true, alreadyNotified: outcome.alreadyNotified });
  }

  // ── The online rails ───────────────────────────────────────────────────
  if (!STRIPE_SECRET_KEY) {
    console.error('invoice-link-checkout: STRIPE_SECRET_KEY not configured');
    return json({ error: 'stripe_not_configured' }, 500);
  }
  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });

  // Human-readable line item — the same label the signed-in rail writes.
  const identity = await resolveStudioIdentity(admin, invoiceBrandingRef(invoice));
  const studioSuffix = identity?.name?.trim() ? ` · ${identity.name.trim()}` : '';
  const lineItemName = `Invoice ${invoice.invoice_number ?? invoice.id.slice(0, 8)} — ${
    invoiceSubjectName(invoice, 'Studio invoice')
  }${studioSuffix}`;

  // The link is the payer, always (F5): a per-link Stripe customer with no
  // email, named from the resolver's client_display_name (F14) — a name only.
  const customer = await ensureLinkStripeCustomer(
    admin,
    stripe,
    target.link_id,
    target.client_display_name ?? null
  );
  if (!customer.ok) {
    return json(checkoutCustomerFailureBody(customer), customer.status);
  }

  return startInvoiceCheckout({
    admin,
    stripe,
    json,
    logTag: 'invoice-link-checkout',
    actor: {
      kind: 'link',
      invoiceLinkId: target.link_id,
      stripeCustomerId: customer.customerId,
    },
    target: {
      invoiceId: invoice.id,
      lineItemName,
      // Every attempt claimed through 00574 carries a return nonce, so Stripe
      // returns the payer through /pay/return/<nonce>. The letterbox address
      // below can only be reached by a legacy attempt and is the M7 valve.
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
      nonceReturnOrigin: CLIENT_PORTAL_URL,
    },
    paymentMethod: method,
  });
});
