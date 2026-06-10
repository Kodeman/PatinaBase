// Supabase Edge Function: create-checkout-session
//
// Invoicing Stripe wave (Wave 3). Starts a Stripe Checkout session for an
// issued invoice's remaining balance and returns { url } for the client
// portal to redirect to. verify_jwt stays ON (default) — the gateway demands
// a valid JWT, and this function additionally proves the caller is a party to
// the invoice.
//
// Flow:
//   1. Auth: resolve the caller from the Authorization header.
//   2. Load the invoice (service role) + project/designer joins. The caller
//      must be the invoice's client (invoices.client_id or the project's
//      client_id) or its designer (designer self-pay is allowed for testing).
//      Not-found and not-a-party both collapse to 404.
//   3. Guards: status IN (sent, partially_paid) and amount_due
//      (total_cents − amount_paid_cents) > 0.
//   4. Lazy Stripe customer: if the paying profile has no stripe_customer_id,
//      create one (email/name/metadata.profile_id) and persist it.
//   5. Session reuse: if the invoice already has a stripe_checkout_session_id,
//      retrieve it. Open + amount matches amount_due → return its url.
//      Open + amount stale → expire it and fail its pending payment row.
//      Complete with a still-pending payment row (ACH processing) → 409.
//   6. Create the session: mode 'payment', card + us_bank_account, one line
//      item "Invoice {number} — {project}" at amount_due, metadata.invoice_id
//      on BOTH the session and the payment intent (webhook resolution).
//   7. Persist invoices.stripe_checkout_session_id + INSERT a pending
//      invoice_payments row (method stripe, amount_cents = amount_due).
//      The stripe-webhook function flips that row; the 00178 AFTER trigger
//      owns all invoice/milestone/earnings effects.
//
// Body:    { invoiceId: string }
// Returns: { url: string }
//
// Required env (supabase secrets set … in hosted/self-hosted prod):
//   STRIPE_SECRET_KEY   — sk_live_… / sk_test_…
//   CLIENT_PORTAL_URL   — absolute origin for success/cancel URLs
//                         (defaults to https://client.patina.cloud)
// Plus the standard SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const CLIENT_PORTAL_URL = Deno.env.get('CLIENT_PORTAL_URL') ?? 'https://client.patina.cloud';

// Pinned — bump deliberately alongside the npm:stripe major.
const STRIPE_API_VERSION = '2025-02-24.acacia';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  let invoiceId: string | undefined;
  try {
    const body = await req.json();
    invoiceId = body?.invoiceId;
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  if (!invoiceId) {
    return json({ error: 'invoiceId_required' }, 400);
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

  // ── Load + authorize ─────────────────────────────────────────────────────
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
    console.error('create-checkout-session: lookup failed', error);
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

  // ── Guards ───────────────────────────────────────────────────────────────
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

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });

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
    if (invoice.stripe_checkout_session_id) {
      let existing: Stripe.Checkout.Session | null = null;
      try {
        existing = await stripe.checkout.sessions.retrieve(invoice.stripe_checkout_session_id);
      } catch (err) {
        // Unknown/foreign session id (e.g. key rotated between test/live) —
        // treat as absent and let a fresh session replace it.
        console.warn('create-checkout-session: could not retrieve existing session', err);
      }

      if (existing?.status === 'open') {
        if (existing.amount_total === amountDue && existing.url) {
          return json({ url: existing.url });
        }
        // Amount drifted (e.g. a manual partial payment landed since the
        // session was created) — expire it and fail its pending row.
        try {
          await stripe.checkout.sessions.expire(existing.id);
        } catch (err) {
          console.warn('create-checkout-session: expire failed', err);
        }
        await admin
          .from('invoice_payments')
          .update({ status: 'failed', note: 'Superseded — checkout session expired (amount changed).' })
          .eq('stripe_checkout_session_id', existing.id)
          .eq('status', 'pending');
      } else if (existing?.status === 'complete') {
        // Completed session with a still-pending payment row = ACH debit in
        // flight. Don't open a second payment path for the same balance.
        const { data: pendingRows } = await admin
          .from('invoice_payments')
          .select('id')
          .eq('stripe_checkout_session_id', existing.id)
          .eq('status', 'pending')
          .limit(1);
        if ((pendingRows ?? []).length > 0) {
          return json(
            {
              error: 'payment_processing',
              detail:
                'A bank transfer for this invoice is already processing. Bank transfers take 3–5 business days to clear.',
            },
            409
          );
        }
      }
    }

    // ── Create the Checkout session ──────────────────────────────────────
    const label = `Invoice ${invoice.invoice_number ?? invoice.id.slice(0, 8)} — ${
      invoice.project?.name ?? 'Patina project'
    }`;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      payment_method_types: ['card', 'us_bank_account'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: (invoice.currency || 'USD').toLowerCase(),
            unit_amount: amountDue,
            product_data: { name: label },
          },
        },
      ],
      metadata: { invoice_id: invoice.id },
      payment_intent_data: { metadata: { invoice_id: invoice.id } },
      success_url: `${CLIENT_PORTAL_URL}/invoices/${invoice.id}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CLIENT_PORTAL_URL}/invoices/${invoice.id}?checkout=cancelled`,
    });

    if (!session.url) {
      console.error('create-checkout-session: session created without url', session.id);
      return json({ error: 'stripe_error', detail: 'Checkout session has no URL.' }, 502);
    }

    // ── Persist session pointer + pending payment row ────────────────────
    const { error: stampErr } = await admin
      .from('invoices')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', invoice.id);
    if (stampErr) {
      console.error('create-checkout-session: failed to stamp session id', stampErr);
    }

    const { error: paymentErr } = await admin.from('invoice_payments').insert({
      invoice_id: invoice.id,
      amount_cents: amountDue,
      method: 'stripe',
      status: 'pending',
      stripe_checkout_session_id: session.id,
      recorded_by: caller.id,
    });
    if (paymentErr) {
      // Non-fatal: the webhook recreates the row from metadata.invoice_id if
      // it's missing when the session completes.
      console.error('create-checkout-session: failed to insert pending payment row', paymentErr);
    }

    return json({ url: session.url });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown stripe error';
    console.error('create-checkout-session: stripe call failed', detail);
    return json({ error: 'stripe_error', detail }, 502);
  }
});
