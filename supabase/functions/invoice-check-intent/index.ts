// Supabase Edge Function: invoice-check-intent
//
// "I'm mailing you a check." The client portal's third payment option (beside
// card and bank transfer) takes no money and books nothing — it only tells the
// designer to expect an envelope. When the check lands the designer records it
// through the existing record_invoice_payment path, exactly as they do for any
// offline payment.
//
// Deliberately NOT done here:
//   • no invoice_payments row — a stated intention is not money. Writing a
//     pending row would corrupt the balance, the A/R cadence, and earnings.
//   • no invoice status change — the invoice stays sent / partially_paid.
//   • no Stripe anything.
//
// verify_jwt stays ON (config.toml). The gateway proves the caller has a valid
// JWT; this function additionally proves the caller is THIS invoice's client.
// Anything else — missing invoice, a designer poking at it, a stranger — is a
// flat 404 so the endpoint never confirms an invoice exists.
//
// Body:  { invoiceId }  (`invoice_id` accepted as an alias)
// Returns:
//   200 { ok: true, invoiceId, alreadyNotified, emailSent, suppressed }
//   400 invalid_body / invoiceId_required
//   401 unauthorized
//   404 invoice_not_found          — absent, draft, or caller isn't the client
//   409 invoice_not_payable        — wrong status, or nothing left to pay
//   500 notification_failed        — the designer-facing row could not be written
//
// Idempotency: a designer notification_log row of type 'invoice_check_intent'
// for this invoice within the last 24h short-circuits to alreadyNotified. A
// double-clicked button, a refresh, or an honest second thought the same day
// costs the designer exactly one notice.
//
// This function is the JWT adapter; the body is _shared/invoice-check-intent-
// core.ts, shared with the account-less invoice-link-checkout (00574).

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  CHECK_INTENT_INVOICE_SELECT,
  type CheckIntentInvoice,
  checkIntentDepsFor,
  runInvoiceCheckIntent,
} from '../_shared/invoice-check-intent-core.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DESIGNER_PORTAL_URL = Deno.env.get('DESIGNER_PORTAL_URL') ?? 'https://app.patina.cloud';

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
    invoiceId = body?.invoiceId ?? body?.invoice_id;
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

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await admin
    .from('invoices')
    .select(CHECK_INTENT_INVOICE_SELECT)
    .eq('id', invoiceId)
    .maybeSingle();

  if (error) {
    console.error('invoice-check-intent: invoice lookup failed', error);
    return json({ error: 'lookup_failed', detail: error.message }, 500);
  }
  const invoice = data as unknown as CheckIntentInvoice | null;

  // The invoice belongs to its snapshotted client, falling back to the
  // project's client for legacy rows. Only that person can say a check is
  // coming; every other case collapses to 404 (mirrors create-checkout-session).
  const isClient = !!invoice && caller.id === (invoice.client_id ?? invoice.project?.client_id);
  if (!invoice || !isClient) {
    return json({ error: 'invoice_not_found' }, 404);
  }

  if (invoice.status !== 'sent' && invoice.status !== 'partially_paid') {
    return json(
      {
        error: 'invoice_not_payable',
        detail: `Invoice is ${invoice.status}; only sent or partially paid invoices can be paid.`,
      },
      409
    );
  }
  const balanceCents = (invoice.total_cents || 0) - (invoice.amount_paid_cents || 0);
  if (balanceCents <= 0) {
    return json(
      {
        error: 'nothing_due',
        detail: 'This invoice has no remaining balance.',
      },
      409
    );
  }

  // The body — idempotency, the in-app notice, the best-effort email — lives
  // in _shared/invoice-check-intent-core.ts so the guest rail
  // (invoice-link-checkout, 00574) shares it byte for byte.
  const outcome = await runInvoiceCheckIntent(invoice, {
    designerPortalUrl: DESIGNER_PORTAL_URL,
    deps: checkIntentDepsFor(admin),
  });
  if (!outcome.ok) {
    return json({ error: outcome.error, detail: outcome.detail }, 500);
  }
  return json(outcome);
});
