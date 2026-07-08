// Supabase Edge Function: expire-po-session
//
// Closes any open Stripe hosted-Checkout session left behind on a cancelled
// "Order via Patina" purchase order. A cancelled PO's checkout guard already
// refuses to open a NEW session (create-checkout-session → 409 po_cancelled),
// but a session created BEFORE the cancel can still be sitting open on Stripe's
// side and be completed by the designer's browser — taking money for an order
// that no longer exists. The designer portal calls this after a PO cancel to
// expire those sessions and null their pointers. verify_jwt stays ON (default) —
// the gateway demands a valid JWT, and this function additionally proves the
// caller owns the PO.
//
// Flow:
//   1. Auth: resolve the caller from the Authorization header.
//   2. Load the PO (service role). The caller must be its designer, else 404
//      not_found (no existence leak for foreign ids).
//   3. Guard: the PO must be in a terminal-dead (cancelled) status — the SAME
//      set the create-checkout cancelled-PO guard uses. Otherwise 409
//      po_not_cancelled (nothing to expire on a live PO).
//   4. Effect: for each po_payments row of the PO with state <> 'paid' AND a
//      non-null stripe_checkout_session_id, attempt sessions.expire (swallowing
//      already-expired/completed errors), then null BOTH the session pointer
//      and the stale PaymentIntent id.
//   5. Return { expired } — the count of sessions expired / pointers cleared.
//
// Body:    { purchase_order_id: string }
// Returns: { expired: number }
//
// Required env (supabase secrets set … in hosted/self-hosted prod):
//   STRIPE_SECRET_KEY   — sk_live_… / sk_test_…
// Plus the standard SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');

// Pinned — bump deliberately alongside the npm:stripe major.
const STRIPE_API_VERSION = '2025-02-24.acacia';

// Terminal-dead purchase-order statuses whose open Checkout sessions must be
// torn down. Mirrors the create-checkout-session cancelled-PO guard
// (PO_TERMINAL_DEAD_STATUSES): 'cancelled' is the only dead-terminal status in
// the 00148 vocabulary + 00184 cancel cascade; 'delivered' is a legitimate
// completed order that may still owe a balance and stays payable.
const PO_TERMINAL_DEAD_STATUSES = new Set<string>(['cancelled']);

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

interface PoRow {
  id: string;
  designer_id: string;
  status: string;
}

interface PoPaymentPointerRow {
  id: string;
  stripe_checkout_session_id: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  let purchaseOrderId: string | undefined;
  try {
    const body = await req.json();
    purchaseOrderId = body?.purchase_order_id ?? body?.purchaseOrderId;
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  if (!purchaseOrderId) {
    return json({ error: 'purchase_order_id_required' }, 400);
  }

  const caller = await getCallerUser(req);
  if (!caller) {
    return json({ error: 'unauthorized' }, 401);
  }

  if (!STRIPE_SECRET_KEY) {
    console.error('expire-po-session: STRIPE_SECRET_KEY not configured');
    return json({ error: 'stripe_not_configured' }, 500);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── Load + authorize ─────────────────────────────────────────────────────
  const { data, error } = await admin
    .from('purchase_orders')
    .select('id, designer_id, status')
    .eq('id', purchaseOrderId)
    .maybeSingle();
  if (error) {
    console.error('expire-po-session: purchase_order lookup failed', error);
    return json({ error: 'lookup_failed', detail: error.message }, 500);
  }
  const po = data as unknown as PoRow | null;

  // Only the owning designer may expire. Not-found and not-owner both collapse
  // to 404 so the endpoint doesn't confirm foreign ids exist.
  if (!po || caller.id !== po.designer_id) {
    return json({ error: 'not_found' }, 404);
  }

  // Only a terminal-dead (cancelled) PO has orphaned sessions worth tearing
  // down. A live PO's open sessions are legitimate — refuse rather than expire.
  if (!PO_TERMINAL_DEAD_STATUSES.has(po.status)) {
    return json({ error: 'po_not_cancelled', status: po.status }, 409);
  }

  // ── Candidate payment rows: unpaid + still pointing at a Checkout session ──
  const { data: paymentsData, error: paymentsErr } = await admin
    .from('po_payments')
    .select('id, stripe_checkout_session_id')
    .eq('purchase_order_id', po.id)
    .neq('state', 'paid')
    .not('stripe_checkout_session_id', 'is', null);
  if (paymentsErr) {
    console.error('expire-po-session: po_payments lookup failed', paymentsErr);
    return json({ error: 'lookup_failed', detail: paymentsErr.message }, 500);
  }
  const candidates = (paymentsData ?? []) as PoPaymentPointerRow[];

  if (candidates.length === 0) {
    return json({ expired: 0 });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });

  let expired = 0;
  for (const row of candidates) {
    const sessionId = row.stripe_checkout_session_id;
    if (!sessionId) continue;

    // Best-effort expire. A session already expired/completed (or a foreign id
    // after a key rotation) throws — swallow it and still clear the local
    // pointers so the row can never open or replay that dead session.
    try {
      await stripe.checkout.sessions.expire(sessionId);
    } catch (err) {
      console.warn('expire-po-session: sessions.expire failed (already expired/completed?)', err);
    }

    const { error: clearErr } = await admin
      .from('po_payments')
      .update({ stripe_checkout_session_id: null, stripe_payment_intent_id: null })
      .eq('id', row.id)
      .eq('stripe_checkout_session_id', sessionId);
    if (clearErr) {
      console.error('expire-po-session: failed to clear pointers on po_payment', row.id, clearErr);
      continue;
    }
    expired += 1;
  }

  return json({ expired });
});
