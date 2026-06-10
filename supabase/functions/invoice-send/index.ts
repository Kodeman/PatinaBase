// Supabase Edge Function: invoice-send
//
// Invoicing Wave 2. Invoked by useSendInvoice after issue_invoice (Issue &
// Send) or standalone (Resend). The caller must be the invoice's designer
// (verified against the JWT in the Authorization header — verify_jwt is on,
// but gateway verification alone doesn't prove ownership).
//
// Flow:
//   1. Auth: resolve the caller from the Authorization header.
//   2. Load the invoice (service role) + project / client / designer joins;
//      reject unless caller === designer_id and status is issued (not draft,
//      not void).
//   3. Resolve the recipient: invoice.client_id → project.client_id profile,
//      falling back to designer_clients.client_email for not-yet-signed-up
//      clients (mirrors decision-reminders).
//   4. Send the invoice_sent email through the shared sendCompliantEmail
//      chokepoint (category operational → suppression check, rate cap,
//      unsubscribe headers, notification_log).
//      ▸ In-app notification (v1 decision): the notification_log row written
//        by sendCompliantEmail IS the in-app notification — the client
//        portal's inbox surfaces non-transactional email-channel rows, and
//        metadata.subject / message / deep_link below drive its rendering +
//        click-through. No separate dispatch needed; a dedicated spine RPC
//        (decision-notifications style) can replace this in a later wave.
//   5. Stamp invoices.sent_at if null (issue_invoice normally stamps it; this
//      covers resend-after-anomaly paths).
//
// Body: { invoiceId: string, message?: string }  (message = personal note)
// Returns counts/ids JSON like sibling functions.

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendCompliantEmail } from '../_shared/send-email.ts';
import { buildInvoiceSentEmail } from '../_shared/invoice-emails.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLIENT_PORTAL_URL = Deno.env.get('CLIENT_PORTAL_URL') ?? 'https://client.patina.cloud';

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
  total_cents: number;
  currency: string;
  due_date: string | null;
  sent_at: string | null;
  project: { id: string; name: string; client_id: string | null } | null;
  client: { id: string; full_name: string | null; email: string | null } | null;
  designer: { id: string; full_name: string | null; business_name: string | null } | null;
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
  let personalMessage: string | undefined;
  try {
    const body = await req.json();
    invoiceId = body?.invoiceId;
    personalMessage = typeof body?.message === 'string' ? body.message : undefined;
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
      total_cents, currency, due_date, sent_at,
      project:projects!invoices_project_id_fkey(id, name, client_id),
      client:profiles!invoices_client_id_fkey(id, full_name, email),
      designer:profiles!invoices_designer_id_fkey(id, full_name, business_name)
    `
    )
    .eq('id', invoiceId)
    .maybeSingle();

  if (error) {
    console.error('invoice-send: lookup failed', error);
    return json({ error: 'lookup_failed', detail: error.message }, 500);
  }
  const invoice = data as unknown as InvoiceRow | null;
  // Not-found and not-owned collapse to 404 so the endpoint doesn't confirm
  // foreign invoice ids exist.
  if (!invoice || invoice.designer_id !== caller.id) {
    return json({ error: 'invoice_not_found' }, 404);
  }
  if (invoice.status === 'draft') {
    return json({ error: 'invoice_not_issued', detail: 'Issue the invoice before sending.' }, 409);
  }
  if (invoice.status === 'void') {
    return json({ error: 'invoice_void', detail: 'A voided invoice cannot be sent.' }, 409);
  }

  // ── Resolve recipient ──────────────────────────────────────────────────
  // Prefer the signed-up client profile (enables suppression / preferences /
  // in-app inbox); fall back to designer_clients.client_email for clients who
  // have not signed up yet (mirrors decision-reminders / expire-decisions).
  const clientUserId = invoice.client_id ?? invoice.project?.client_id ?? null;

  let recipientEmail: string | null = invoice.client?.email ?? null;
  let recipientName: string | null = invoice.client?.full_name ?? null;

  if (!recipientEmail && clientUserId && clientUserId !== invoice.client_id) {
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, email')
      .eq('id', clientUserId)
      .maybeSingle();
    recipientEmail = (profile as any)?.email ?? null;
    recipientName = (profile as any)?.full_name ?? recipientName;
  }

  if (!recipientEmail && clientUserId) {
    const { data: dc } = await admin
      .from('designer_clients')
      .select('client_email, client_name')
      .eq('designer_id', invoice.designer_id)
      .eq('client_id', clientUserId)
      .maybeSingle();
    recipientEmail = (dc as any)?.client_email ?? null;
    recipientName = recipientName ?? (dc as any)?.client_name ?? null;
  }

  if (!recipientEmail) {
    console.warn('invoice-send: no recipient email for invoice', invoiceId);
    return json({ error: 'no_recipient' }, 422);
  }

  // ── Build + send the email ─────────────────────────────────────────────
  const designerName =
    invoice.designer?.full_name?.trim() ||
    invoice.designer?.business_name?.trim() ||
    'Your designer';
  const projectName = invoice.project?.name ?? 'your project';
  const invoiceNumber = invoice.invoice_number ?? 'Invoice';
  const portalUrl = `${CLIENT_PORTAL_URL}/invoices/${invoice.id}`;

  const rendered = buildInvoiceSentEmail({
    invoiceNumber,
    projectName,
    designerName,
    clientName: recipientName,
    totalCents: invoice.total_cents,
    dueDate: invoice.due_date,
    portalUrl,
    personalMessage,
    currency: invoice.currency,
  });

  let sendResult;
  try {
    sendResult = await sendCompliantEmail(admin, {
      to: recipientEmail,
      subject: rendered.subject,
      html: rendered.html,
      userId: clientUserId ?? undefined,
      notificationType: 'invoice_sent',
      category: 'operational',
      templateId: 'invoice-sent',
      // subject/message/deep_link double as the in-app inbox rendering (the
      // client portal surfaces this notification_log row — see header note).
      metadata: {
        invoice_id: invoice.id,
        project_id: invoice.project_id,
        subject: rendered.subject,
        message: `${designerName} sent invoice ${invoiceNumber} for ${projectName}.`,
        deep_link: `/invoices/${invoice.id}`,
      },
    });
  } catch (err) {
    // e.g. RESEND_API_KEY missing and EMAIL_DEV_MODE not set locally.
    const detail = err instanceof Error ? err.message : 'unknown send error';
    console.error('invoice-send: send threw', detail);
    return json({ error: 'send_failed', detail }, 502);
  }

  if (!sendResult.success && !sendResult.suppressed) {
    console.error('invoice-send: send failed', sendResult.error);
    return json({ error: 'send_failed', detail: sendResult.error }, 502);
  }

  // ── Stamp sent_at if missing ───────────────────────────────────────────
  // issue_invoice stamps sent_at at issue time, so this is normally a no-op;
  // it backstops rows that reached an issued status without a stamp.
  let stampedSentAt = false;
  if (!invoice.sent_at) {
    const { error: stampErr } = await admin
      .from('invoices')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', invoice.id)
      .is('sent_at', null);
    if (stampErr) {
      console.error('invoice-send: failed to stamp sent_at', stampErr);
    } else {
      stampedSentAt = true;
    }
  }

  return json({
    ok: true,
    invoiceId: invoice.id,
    recipient: recipientEmail,
    emailSent: sendResult.success === true,
    suppressed: sendResult.suppressed === true,
    logId: sendResult.logId ?? null,
    providerId: sendResult.id ?? null,
    stampedSentAt,
  });
});
