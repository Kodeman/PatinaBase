// Supabase Edge Function: po-send
//
// Procurement Wave 4 (W4-T3). Makes purchase orders real outbound documents:
// assigns OUR PO number, renders the PO PDF, stores it in project-documents,
// and (mode 'send') emails it to the vendor with the PDF attached. Invoked
// by useSendPurchaseOrder (packages/supabase/src/hooks/use-procurement.ts).
//
// Flow:
//   1. Auth: resolve the caller from the Authorization header (verify_jwt is
//      on at the gateway, but gateway verification alone doesn't prove
//      ownership).
//   2. Load the PO (service role) + vendor / project joins, the linked
//      project_ffe_items (+ room names), the po_payments schedule, and the
//      designer/client profiles. Reject unless caller === designer_id
//      (404-collapse so foreign ids aren't confirmed), status not
//      'cancelled', and at least one item is linked.
//   3. Numbering: call assign_po_number (00188) AS THE CALLER — a client
//      carrying the caller's Authorization header — so the SECURITY DEFINER
//      RPC's auth.uid() owner check holds. Idempotent + race-safe server-side.
//   4. Defaults: persist sidemark (Order Assistant generator convention,
//      ported in ./lib.ts) and ship_to (projects.site_address) when null.
//   5. Render the PDF (_shared/po-pdf.ts, spike W4-T1 approach) and upload
//      to project-documents/{project_id}/po-{po_number}.pdf (upsert);
//      persist po_document_path; sign a short-lived (600 s) URL.
//   6. Mode:
//        'preview'   → return without emailing or stamping sent_at; an
//                      out-of-sync PO previews fine but the response carries
//                      warnings: ['po_out_of_sync'].
//        'send'      → guarded (W4-T4): line-derived trade total and
//                      Σ po_payments must BOTH equal total_cents, else 422
//                      po_out_of_sync (pre-00186 client-price POs / item
//                      re-pricing drift) — then email the vendor
//                      (recipientEmail → orders_email →
//                      contact_info->>'email'; 422 no_recipient) through
//                      sendCompliantEmail with the PDF attached, cc the
//                      designer when ccDesigner; stamp sent_at if null,
//                      else append a "[YYYY-MM-DD PO resent]" audit line to
//                      notes (useUpdatePurchaseOrderETA idiom).
//        'mark_sent' → render + store the document (so it exists) and stamp
//                      sent_at; no email — for orders placed outside Patina.
//
// Body: { purchaseOrderId: string, mode?: 'preview' | 'send' | 'mark_sent',
//         recipientEmail?: string, message?: string, ccDesigner?: boolean }
// Returns { ok, poId, poNumber, recipient?, documentPath, emailSent,
//           signedUrl? }; errors as the invoice-send idiom (status + {error}).

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encode as encodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts';
import { sendCompliantEmail } from '../_shared/send-email.ts';
import { buildPoPdf, type PoPdfData } from '../_shared/po-pdf.ts';
import { buildPoSentEmail } from '../_shared/po-emails.ts';
import { resolveStudioIdentity, studioDisplayName } from '../_shared/studio-identity.ts';
import {
  buildFallbackSidemark,
  checkPoTotalsCoherence,
  PO_OUT_OF_SYNC_DETAIL,
  parsePoSendBody,
  paymentPatternLabel,
  paymentRowLabel,
  resolveVendorRecipient,
  vendorSafeSpecNotes,
} from './lib.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// The runtime's SUPABASE_URL is the container-internal Kong address
// (http://kong:8000 — both `supabase functions serve` and the prod compose
// inject it), so signed URLs come back unreachable from a browser. Rewrite
// them onto the public API host (CLIENT_PORTAL_URL idiom from invoice-send;
// set PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 in supabase/.env.local —
// the name must NOT start with SUPABASE_, the CLI skips those in env files).
const PUBLIC_SUPABASE_URL =
  Deno.env.get('PUBLIC_SUPABASE_URL') ?? 'https://api.patina.cloud';

const DOCUMENTS_BUCKET = 'project-documents';
const SIGNED_URL_TTL_SECONDS = 600;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PoRow {
  id: string;
  designer_id: string;
  project_id: string;
  vendor_id: string;
  status: string;
  payment_pattern: string;
  total_cents: number;
  po_number: string | null;
  sidemark: string | null;
  ship_to: string | null;
  po_document_path: string | null;
  sent_at: string | null;
  notes: string | null;
  created_at: string;
  vendor: {
    id: string;
    name: string;
    orders_email: string | null;
    contact_info: Record<string, unknown> | null;
    website: string | null;
  } | null;
  project: {
    id: string;
    name: string;
    site_address: string | null;
    client_id: string | null;
  } | null;
}

interface FfeItemRow {
  id: string;
  name: string;
  quantity: number | null;
  trade_price_cents: number | null;
  unit_price_cents: number | null;
  notes: string | null;
  ffe_category: string | null;
  room: { id: string; name: string } | null;
}

interface PoPaymentRow {
  kind: string;
  label: string | null;
  amount_cents: number;
  due_date: string | null;
  state: string;
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

/**
 * A PostgREST client that acts AS THE CALLER: the service-role key rides as
 * the gateway apikey, but the caller's JWT is the Authorization header, so
 * RLS / auth.uid() inside RPCs (assign_po_number's owner check) see the
 * designer — not service_role. Same client shape getCallerUser builds.
 */
function callerScopedClient(req: Request) {
  const auth = req.headers.get('Authorization')!;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: auth } },
  });
}

/** Extract address-ish vendor contact lines for the PDF's vendor block. */
function vendorContactLines(vendor: PoRow['vendor']): string[] {
  const lines: string[] = [];
  const info = vendor?.contact_info ?? {};
  for (const key of ['email', 'phone', 'address']) {
    const value = (info as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.trim()) lines.push(value.trim());
  }
  if (vendor?.orders_email?.trim() && !lines.includes(vendor.orders_email.trim())) {
    lines.unshift(vendor.orders_email.trim());
  }
  if (vendor?.website?.trim()) lines.push(vendor.website.trim());
  return lines;
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
  const parsed = parsePoSendBody(rawBody);
  if (!parsed.ok) {
    return json({ error: parsed.error }, 400);
  }
  const { purchaseOrderId, mode, recipientEmail, message, ccDesigner } = parsed.payload;

  const caller = await getCallerUser(req);
  if (!caller) {
    return json({ error: 'unauthorized' }, 401);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── Load the PO + joins ─────────────────────────────────────────────────
  const { data: poData, error: poError } = await admin
    .from('purchase_orders')
    .select(
      `
      id, designer_id, project_id, vendor_id, status, payment_pattern,
      total_cents, po_number, sidemark, ship_to, po_document_path, sent_at,
      notes, created_at,
      vendor:vendors!purchase_orders_vendor_id_fkey(id, name, orders_email, contact_info, website),
      project:projects!purchase_orders_project_id_fkey(id, name, site_address, client_id)
    `,
    )
    .eq('id', purchaseOrderId)
    .maybeSingle();

  if (poError) {
    console.error('po-send: PO lookup failed', poError);
    return json({ error: 'lookup_failed', detail: poError.message }, 500);
  }
  const po = poData as unknown as PoRow | null;
  // Not-found and not-owned collapse to 404 so the endpoint doesn't confirm
  // foreign PO ids exist (invoice-send idiom).
  if (!po || po.designer_id !== caller.id) {
    return json({ error: 'po_not_found' }, 404);
  }
  if (po.status === 'cancelled') {
    return json({ error: 'po_cancelled', detail: 'A cancelled purchase order cannot be sent.' }, 409);
  }

  // ── Linked items (the document's line table) ────────────────────────────
  const { data: itemsData, error: itemsError } = await admin
    .from('project_ffe_items')
    .select(
      `
      id, name, quantity, trade_price_cents, unit_price_cents, notes,
      ffe_category,
      room:project_rooms!project_room_id(id, name)
    `,
    )
    .eq('purchase_order_id', po.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (itemsError) {
    console.error('po-send: items lookup failed', itemsError);
    return json({ error: 'lookup_failed', detail: itemsError.message }, 500);
  }
  const items = (itemsData ?? []) as unknown as FfeItemRow[];
  if (items.length === 0) {
    return json(
      { error: 'no_items', detail: 'This purchase order has no linked FF&E items.' },
      422,
    );
  }

  // ── Payment schedule ────────────────────────────────────────────────────
  const { data: paymentsData, error: paymentsError } = await admin
    .from('po_payments')
    .select('kind, label, amount_cents, due_date, state')
    .eq('purchase_order_id', po.id)
    .order('sort_order', { ascending: true });

  if (paymentsError) {
    console.error('po-send: payments lookup failed', paymentsError);
    return json({ error: 'lookup_failed', detail: paymentsError.message }, 500);
  }
  const payments = (paymentsData ?? []) as PoPaymentRow[];

  // ── Send-time consistency guard (W4-T4) ─────────────────────────────────
  // The document is only coherent when the line-derived trade total (the sum
  // the PDF prints), purchase_orders.total_cents, and Σ po_payments all
  // agree. Pre-00186 POs carry CLIENT-price total_cents and a schedule
  // derived from it — emailing one would pair a payment schedule with a line
  // total it doesn't sum to AND leak client pricing via deposit amounts.
  // Refuse 'send' BEFORE numbering / rendering / any side effect; 'preview'
  // stays unguarded (the response carries warnings instead) and 'mark_sent'
  // is the escape hatch for orders the designer placed outside Patina.
  const totals = checkPoTotalsCoherence(po.total_cents, payments, items);
  if (mode === 'send' && !totals.coherent) {
    return json(
      {
        error: 'po_out_of_sync',
        detail: PO_OUT_OF_SYNC_DETAIL,
        poTotalCents: totals.poTotalCents,
        tradeTotalCents: totals.tradeTotalCents,
        paymentsTotalCents: totals.paymentsTotalCents,
      },
      422,
    );
  }

  // ── Designer + client profiles ──────────────────────────────────────────
  // purchase_orders.designer_id references auth.users (00148), so there is
  // no PostgREST FK join to profiles — load it directly.
  const { data: designerProfile } = await admin
    .from('profiles')
    .select('full_name, business_name, email')
    .eq('id', po.designer_id)
    .maybeSingle();

  let clientName: string | null = null;
  if (po.project?.client_id) {
    const { data: clientProfile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', po.project.client_id)
      .maybeSingle();
    clientName = (clientProfile as any)?.full_name ?? null;
  }

  // Studio identity via the canonical resolver (Designer Studios). projectId
  // path so a studio-owned project's PO shows the STUDIO, not the designer's
  // personal business_name. The profile fields stay the fallback (resolver
  // returned no name); logoUrl is non-null only for a real studio org.
  const identity = await resolveStudioIdentity(admin, { projectId: po.project_id });
  const studioName = studioDisplayName(
    identity,
    (designerProfile as any)?.business_name?.trim() ||
      (designerProfile as any)?.full_name?.trim() ||
      'Patina Designer',
  );
  const studioLogoUrl = identity?.logoUrl ?? undefined;
  const designerName = (designerProfile as any)?.full_name?.trim() || studioName;
  const designerEmail: string | null = (designerProfile as any)?.email ?? null;

  // ── Numbering — as the caller, so the RPC's owner check holds ───────────
  const userClient = callerScopedClient(req);
  const { data: numbered, error: numberError } = await userClient.rpc(
    'assign_po_number',
    { p_po_id: po.id },
  );
  if (numberError) {
    console.error('po-send: assign_po_number failed', numberError);
    return json({ error: 'numbering_failed', detail: numberError.message }, 500);
  }
  const poNumber: string | null = (numbered as any)?.po_number ?? null;
  if (!poNumber) {
    console.error('po-send: assign_po_number returned no po_number', numbered);
    return json({ error: 'numbering_failed' }, 500);
  }

  // ── Sidemark / ship_to fallbacks (persisted when defaulted) ─────────────
  let sidemark = po.sidemark?.trim() || null;
  let shipTo = po.ship_to?.trim() || null;
  const defaults: Record<string, unknown> = {};
  if (!sidemark) {
    const generated = buildFallbackSidemark({
      studioName,
      clientName,
      projectName: po.project?.name ?? null,
    });
    if (generated) {
      sidemark = generated;
      defaults.sidemark = generated;
    }
  }
  if (!shipTo && po.project?.site_address?.trim()) {
    shipTo = po.project.site_address.trim();
    defaults.ship_to = shipTo;
  }
  if (Object.keys(defaults).length > 0) {
    const { error: defaultsError } = await admin
      .from('purchase_orders')
      .update(defaults)
      .eq('id', po.id);
    if (defaultsError) {
      // Non-fatal: the rendered document already uses the local values.
      console.warn('po-send: failed to persist sidemark/ship_to defaults', defaultsError);
    }
  }

  // ── Render the PDF ──────────────────────────────────────────────────────
  const lines = items.map((item) => {
    const quantity = item.quantity ?? 1;
    // TRADE pricing — same COALESCE the 00186 total uses.
    const unitTradeCents = item.trade_price_cents ?? item.unit_price_cents ?? 0;
    return {
      name: item.name,
      room: item.room?.name ?? null,
      quantity,
      unitTradeCents,
      lineTotalCents: unitTradeCents * quantity,
      specNotes: vendorSafeSpecNotes(item.notes),
      category: item.ffe_category,
    };
  });
  const tradeTotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
  const patternLabel = paymentPatternLabel(po.payment_pattern);
  const paymentRows = payments.map((p) => ({
    label: paymentRowLabel(p),
    amountCents: p.amount_cents,
    dueDate: p.due_date,
  }));

  const pdfData: PoPdfData = {
    poNumber,
    issuedAt: po.sent_at ?? new Date().toISOString(),
    studioName,
    studioLogoUrl,
    designerName,
    designerEmail,
    vendorName: po.vendor?.name ?? 'Vendor',
    vendorContactLines: vendorContactLines(po.vendor),
    projectName: po.project?.name ?? 'Project',
    sidemark,
    shipTo,
    paymentPatternLabel: patternLabel,
    payments: paymentRows,
    lines,
    tradeTotalCents,
  };

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await buildPoPdf(pdfData);
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error('po-send: PDF render failed', detail);
    return json({ error: 'render_failed', detail }, 500);
  }

  // ── Store the document (path scheme: {projectId}/po-{poNumber}.pdf) ─────
  const documentPath = `${po.project_id}/po-${poNumber}.pdf`;
  const { error: uploadError } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(documentPath, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true,
    });
  if (uploadError) {
    console.error('po-send: PDF upload failed', uploadError);
    return json({ error: 'upload_failed', detail: uploadError.message }, 500);
  }

  if (po.po_document_path !== documentPath) {
    const { error: pathError } = await admin
      .from('purchase_orders')
      .update({ po_document_path: documentPath })
      .eq('id', po.id);
    if (pathError) {
      // Non-fatal: the object exists at a deterministic path and the
      // response carries it; the next send re-persists.
      console.warn('po-send: failed to persist po_document_path', pathError);
    }
  }

  let signedUrl: string | null = null;
  const { data: signed, error: signError } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(documentPath, SIGNED_URL_TTL_SECONDS);
  if (signError) {
    console.warn('po-send: failed to sign document URL', signError);
  } else if (signed?.signedUrl) {
    // The token is a JWT over the object path — host-independent, so the
    // public-host rewrite is safe.
    signedUrl = signed.signedUrl.replace(SUPABASE_URL, PUBLIC_SUPABASE_URL);
  }

  // ── Mode: preview — document only, no email, no sent_at ─────────────────
  // Preview is never blocked by the consistency guard (the designer can
  // always look), but an incoherent PO is flagged so the UI can warn before
  // a send is even attempted.
  if (mode === 'preview') {
    return json({
      ok: true,
      poId: po.id,
      poNumber,
      documentPath,
      emailSent: false,
      signedUrl,
      ...(totals.coherent ? {} : { warnings: ['po_out_of_sync'] }),
    });
  }

  // ── Mode: send — email the vendor with the PDF attached ─────────────────
  let recipient: string | null = null;
  let emailSent = false;
  if (mode === 'send') {
    recipient = resolveVendorRecipient(po.vendor, recipientEmail);
    if (!recipient) {
      console.warn('po-send: no recipient email for PO', po.id);
      return json(
        {
          error: 'no_recipient',
          detail:
            'No vendor email on file — set vendors.orders_email or pass recipientEmail.',
        },
        422,
      );
    }

    const rendered = buildPoSentEmail({
      poNumber,
      sidemark,
      vendorName: po.vendor?.name ?? 'there',
      studioName,
      studioLogoUrl,
      designerName,
      personalMessage: message,
      paymentPatternLabel: patternLabel,
      payments: paymentRows,
      tradeTotalCents,
    });

    let sendResult;
    try {
      sendResult = await sendCompliantEmail(admin, {
        to: recipient,
        subject: rendered.subject,
        html: rendered.html,
        cc: ccDesigner && designerEmail ? designerEmail : undefined,
        replyTo: designerEmail ?? undefined,
        // The vendor is not a platform user — no userId, so no suppression
        // check / unsubscribe headers / notification_log row. Operational:
        // tied to the designer↔vendor business relationship.
        category: 'operational',
        notificationType: 'po_sent',
        templateId: 'po-sent',
        attachments: [
          { filename: `${poNumber}.pdf`, content: encodeBase64(pdfBytes) },
        ],
        metadata: {
          purchase_order_id: po.id,
          project_id: po.project_id,
          po_number: poNumber,
        },
      });
    } catch (err) {
      // e.g. RESEND_API_KEY missing and EMAIL_DEV_MODE not set locally.
      const detail = err instanceof Error ? err.message : 'unknown send error';
      console.error('po-send: send threw', detail);
      return json({ error: 'send_failed', detail }, 502);
    }
    if (!sendResult.success && !sendResult.suppressed) {
      console.error('po-send: send failed', sendResult.error);
      return json({ error: 'send_failed', detail: sendResult.error }, 502);
    }
    emailSent = sendResult.success === true;
  }

  // ── Stamp sent_at (first send) / audit-trail the resend ─────────────────
  if (!po.sent_at) {
    const { error: stampError } = await admin
      .from('purchase_orders')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', po.id)
      .is('sent_at', null);
    if (stampError) {
      console.error('po-send: failed to stamp sent_at', stampError);
    }
  } else if (mode === 'send') {
    // Resend: keep the original sent_at, append an audit line to notes
    // (the useUpdatePurchaseOrderETA "[YYYY-MM-DD ETA update]:" idiom).
    const today = new Date().toISOString().slice(0, 10);
    const auditLine = `[${today} PO resent]: sent to ${recipient}`;
    const appended = po.notes ? `${po.notes}\n${auditLine}` : auditLine;
    const { error: notesError } = await admin
      .from('purchase_orders')
      .update({ notes: appended })
      .eq('id', po.id);
    if (notesError) {
      console.warn('po-send: failed to append resend audit note', notesError);
    }
  }

  return json({
    ok: true,
    poId: po.id,
    poNumber,
    ...(mode === 'send' ? { recipient } : {}),
    documentPath,
    emailSent,
    signedUrl,
  });
});
