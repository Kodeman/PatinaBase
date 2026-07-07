// Supabase Edge Function: quote-request-send
//
// Schedule & Boards Wave 0B. Delivers the vendor RFQ email that migration
// 00162's comment deferred to a "downstream job" that never existed. Modeled
// structurally on po-send: a *-send function that is the single send
// authority — it loads the row (service role), re-checks ownership, composes
// the email through the _shared conventions, sends via the sendCompliantEmail
// chokepoint, and stamps the sent state. Invoked server-side by the
// POST /api/vendors/[id]/quote-request route immediately after it inserts the
// vendor_quote_requests draft (the create + send are one user act, unlike a
// PO whose send is a separate later act).
//
// Flow:
//   1. Auth: resolve the caller from the Authorization header (verify_jwt is
//      on at the gateway; gateway verification alone doesn't prove ownership).
//   2. Load the request (service role) + vendor join. Reject unless
//      caller === designer_id (404-collapse so foreign ids aren't confirmed).
//   3. Recipient = vendors.orders_email → contact_info->>'email' (or an
//      explicit override). No usable email → 422 no_recipient (never a silent
//      success).
//   4. Mode:
//        'preview' → compose subject/html and return them; no send, no stamp
//                    (recipient may be null — you can preview without an email).
//        'send'    → email the vendor through sendCompliantEmail (operational,
//                    reply-to the designer, no attachment); on success set
//                    status='sent' + stamp sent_at (first send only).
//
// Body: { quoteRequestId: string, mode?: 'preview' | 'send', recipientEmail?: string }
// Returns { ok, quoteRequestId, mode, recipient?, subject?, html?, emailSent?,
//           sentAt? }; errors as { error, detail? } with the po-send status idiom.

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendCompliantEmail } from '../_shared/send-email.ts';
import { buildQuoteRequestEmail } from '../_shared/quote-request-emails.ts';
import { parseQuoteRequestSendBody, resolveVendorRecipient } from './lib.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QuoteRequestRow {
  id: string;
  designer_id: string;
  vendor_id: string;
  scope: string | null;
  timeline: string | null;
  message: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
  vendor: {
    id: string;
    name: string;
    orders_email: string | null;
    contact_info: Record<string, unknown> | null;
  } | null;
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

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  const parsed = parseQuoteRequestSendBody(rawBody);
  if (!parsed.ok) {
    return json({ error: parsed.error }, 400);
  }
  const { quoteRequestId, mode, recipientEmail } = parsed.payload;

  const caller = await getCallerUser(req);
  if (!caller) {
    return json({ error: 'unauthorized' }, 401);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── Load the request + vendor ───────────────────────────────────────────
  const { data: reqData, error: reqError } = await admin
    .from('vendor_quote_requests')
    .select(
      `
      id, designer_id, vendor_id, scope, timeline, message, status, sent_at,
      created_at,
      vendor:vendors!vendor_id(id, name, orders_email, contact_info)
    `,
    )
    .eq('id', quoteRequestId)
    .maybeSingle();

  if (reqError) {
    console.error('quote-request-send: lookup failed', reqError);
    return json({ error: 'lookup_failed', detail: reqError.message }, 500);
  }
  const request = reqData as unknown as QuoteRequestRow | null;
  // Not-found and not-owned collapse to 404 (po-send idiom) so the endpoint
  // doesn't confirm foreign request ids exist.
  if (!request || request.designer_id !== caller.id) {
    return json({ error: 'quote_request_not_found' }, 404);
  }

  // ── Designer identity (designer_id references auth.users — load directly) ─
  const { data: designerProfile } = await admin
    .from('profiles')
    .select('full_name, business_name, email')
    .eq('id', request.designer_id)
    .maybeSingle();

  const studioName =
    (designerProfile as any)?.business_name?.trim() ||
    (designerProfile as any)?.full_name?.trim() ||
    'Patina Designer';
  const designerName = (designerProfile as any)?.full_name?.trim() || studioName;
  const designerEmail: string | null = (designerProfile as any)?.email ?? null;

  const recipient = resolveVendorRecipient(request.vendor, recipientEmail);

  const rendered = buildQuoteRequestEmail({
    vendorName: request.vendor?.name ?? 'there',
    studioName,
    designerName,
    designerEmail,
    scope: request.scope,
    timeline: request.timeline,
    message: request.message ?? '',
  });

  // ── Mode: preview — compose only, no send, no stamp ─────────────────────
  if (mode === 'preview') {
    return json({
      ok: true,
      mode: 'preview',
      quoteRequestId: request.id,
      recipient,
      subject: rendered.subject,
      html: rendered.html,
    });
  }

  // ── Mode: send — email the vendor ───────────────────────────────────────
  if (!recipient) {
    console.warn('quote-request-send: no recipient email for request', request.id);
    return json(
      {
        error: 'no_recipient',
        detail:
          'No vendor email on file — set the vendor orders email and try again.',
      },
      422,
    );
  }

  let sendResult;
  try {
    sendResult = await sendCompliantEmail(admin, {
      to: recipient,
      subject: rendered.subject,
      html: rendered.html,
      replyTo: designerEmail ?? undefined,
      // The vendor is not a platform user — no userId, so no suppression check
      // / unsubscribe headers / notification_log row. Operational: tied to the
      // designer↔vendor business relationship (po-send precedent).
      category: 'operational',
      notificationType: 'quote_request',
      templateId: 'quote-request',
      metadata: { quote_request_id: request.id, vendor_id: request.vendor_id },
    });
  } catch (err) {
    // e.g. RESEND_API_KEY missing and EMAIL_DEV_MODE not set locally.
    const detail = err instanceof Error ? err.message : 'unknown send error';
    console.error('quote-request-send: send threw', detail);
    return json({ error: 'send_failed', detail }, 502);
  }
  if (!sendResult.success && !sendResult.suppressed) {
    console.error('quote-request-send: send failed', sendResult.error);
    return json({ error: 'send_failed', detail: sendResult.error }, 502);
  }

  // ── Stamp status='sent' + sent_at (first send only) ─────────────────────
  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = { status: 'sent' };
  if (!request.sent_at) patch.sent_at = nowIso;
  const { error: stampError } = await admin
    .from('vendor_quote_requests')
    .update(patch)
    .eq('id', request.id);
  if (stampError) {
    // The email already went out; surface the write failure rather than
    // claiming a clean send (the row may still read 'draft').
    console.error('quote-request-send: failed to stamp sent state', stampError);
    return json({ error: 'stamp_failed', detail: stampError.message }, 500);
  }

  return json({
    ok: true,
    mode: 'send',
    quoteRequestId: request.id,
    recipient,
    emailSent: sendResult.success === true,
    sentAt: request.sent_at ?? nowIso,
  });
});
