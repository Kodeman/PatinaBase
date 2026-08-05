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

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendCompliantEmail } from '../_shared/send-email.ts';
import { buildCheckIntentEmail } from '../_shared/invoice-emails.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DESIGNER_PORTAL_URL = Deno.env.get('DESIGNER_PORTAL_URL') ?? 'https://app.patina.cloud';

/** How long one stated intent suppresses a repeat notice. */
const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

const NOTIFICATION_TYPE = 'invoice_check_intent';

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
  project: { id: string; name: string; client_id: string | null } | null;
  client: { id: string; full_name: string | null; email: string | null } | null;
  designer: {
    id: string;
    full_name: string | null;
    business_name: string | null;
    email: string | null;
  } | null;
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
    .select(
      `
      id, designer_id, client_id, project_id, invoice_number, status,
      currency, total_cents, amount_paid_cents,
      project:projects!invoices_project_id_fkey(id, name, client_id),
      client:profiles!invoices_client_id_fkey(id, full_name, email),
      designer:profiles!invoices_designer_id_fkey(id, full_name, business_name, email)
    `
    )
    .eq('id', invoiceId)
    .maybeSingle();

  if (error) {
    console.error('invoice-check-intent: invoice lookup failed', error);
    return json({ error: 'lookup_failed', detail: error.message }, 500);
  }
  const invoice = data as unknown as InvoiceRow | null;

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

  const invoiceNumber = invoice.invoice_number ?? 'Invoice';
  const projectName = invoice.project?.name ?? 'your project';
  const clientName = invoice.client?.full_name?.trim() || 'Your client';
  const designerName =
    invoice.designer?.full_name?.trim() || invoice.designer?.business_name?.trim() || null;
  const folioUrl = `${DESIGNER_PORTAL_URL}/desk?book=accounts&page=ledger&invoiceId=${invoice.id}`;

  // ── Idempotency ────────────────────────────────────────────────────────
  // Anchored on the designer's own notification history rather than a new
  // table: the notice IS the artifact, so its existence is the fact worth
  // checking. Both the in_app row below and the email row sendCompliantEmail
  // writes carry this type, so either one closes the window.
  const since = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS).toISOString();
  const { data: priorRows, error: priorErr } = await admin
    .from('notification_log')
    .select('id')
    .eq('user_id', invoice.designer_id)
    .eq('type', NOTIFICATION_TYPE)
    .gte('created_at', since)
    .filter('metadata->>invoice_id', 'eq', invoice.id)
    .limit(1);
  if (priorErr) {
    // Read failure must not double-notify OR block the client: fall through and
    // send. A duplicate notice is a smaller harm than a silent dead end.
    console.error('invoice-check-intent: idempotency read failed', priorErr);
  }
  if ((priorRows ?? []).length > 0) {
    return json({
      ok: true,
      invoiceId: invoice.id,
      alreadyNotified: true,
      emailSent: false,
      suppressed: false,
    });
  }

  // ── The in-app notice (the artifact the designer actually sees) ────────
  // Written FIRST and fail-closed: if this row doesn't land, the client is told
  // the message didn't get through and can try again. The email below is the
  // nicety, not the record.
  const subject = `A check is on the way — ${invoiceNumber}`;
  const balanceLabel = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: invoice.currency || 'USD',
  }).format(balanceCents / 100);

  const { error: notifyErr } = await admin.from('notification_log').insert({
    user_id: invoice.designer_id,
    type: NOTIFICATION_TYPE,
    channel: 'in_app',
    status: 'delivered',
    template_id: 'invoice-check-intent',
    metadata: {
      invoice_id: invoice.id,
      project_id: invoice.project_id,
      amount_cents: balanceCents,
      subject,
      message: `${projectName}: ${clientName} is mailing a check for ${balanceLabel} toward ${invoiceNumber}. Record it when it arrives.`,
      deep_link: `/desk?book=accounts&page=ledger&invoiceId=${invoice.id}`,
    },
  });
  if (notifyErr) {
    console.error('invoice-check-intent: notification insert failed', notifyErr);
    return json({ error: 'notification_failed', detail: notifyErr.message }, 500);
  }

  // ── The email (best effort) ────────────────────────────────────────────
  // A missing designer email, a suppressed address, or a Resend outage must not
  // turn into an error for the client, who has already been told their designer
  // knows — the in_app row above makes that true.
  let emailSent = false;
  let suppressed = false;
  const designerEmail = invoice.designer?.email ?? null;
  if (designerEmail) {
    try {
      const rendered = buildCheckIntentEmail({
        invoiceNumber,
        projectName,
        designerName,
        clientName: invoice.client?.full_name ?? null,
        balanceCents,
        portalUrl: folioUrl,
        currency: invoice.currency,
      });
      const sendResult = await sendCompliantEmail(admin, {
        to: designerEmail,
        subject: rendered.subject,
        html: rendered.html,
        userId: invoice.designer_id,
        notificationType: NOTIFICATION_TYPE,
        category: 'operational',
        templateId: 'invoice-check-intent',
        metadata: {
          invoice_id: invoice.id,
          project_id: invoice.project_id,
          amount_cents: balanceCents,
          subject: rendered.subject,
          message: `${clientName} is mailing a check for ${balanceLabel} toward ${invoiceNumber}.`,
          deep_link: `/desk?book=accounts&page=ledger&invoiceId=${invoice.id}`,
        },
      });
      emailSent = sendResult.success === true;
      suppressed = sendResult.suppressed === true;
      if (!emailSent && !suppressed) {
        console.error('invoice-check-intent: designer email failed', sendResult.error);
      }
    } catch (err) {
      // e.g. RESEND_API_KEY missing locally without EMAIL_DEV_MODE.
      console.error(
        'invoice-check-intent: designer email threw',
        err instanceof Error ? err.message : err
      );
    }
  } else {
    console.warn('invoice-check-intent: designer has no email', invoice.designer_id);
  }

  return json({
    ok: true,
    invoiceId: invoice.id,
    alreadyNotified: false,
    emailSent,
    suppressed,
  });
});
