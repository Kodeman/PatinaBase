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
//   2. Access: can_send_purchase_order (00690) AS THE CALLER — true for the
//      project owner or a non-guest co-member of the owner's studio (C-07).
//      False, an RPC error, or a missing PO all collapse to 404 so foreign
//      ids aren't confirmed.
//   3. Load the PO (service role) + vendor / project joins, the linked
//      project_ffe_items (+ room names, spec row, product master), the
//      po_payments schedule, and the designer/client profiles. Reject a
//      'cancelled' PO, one with no linked items, and (mode 'send') one with
//      no ship_to — 422 ship_to_required (C-02, R-PB3). There is no site
//      address default; preview and mark_sent print "Ship-to not set".
//   4. Numbering: call assign_po_number (00188, widened in 00690) AS THE
//      CALLER so the SECURITY DEFINER RPC's auth.uid() check holds for the
//      owner and co-members alike. Idempotent + race-safe server-side.
//      R6: a preview of an unnumbered PO, or one not sendable (held for
//      release / po_is_sendable false), is a draft — no number ("Draft
//      order" prints), no sidemark write, stored at
//      {project_id}/po-preview-{po_id}.pdf, po_document_path untouched.
//   5. Defaults: persist sidemark (Order Assistant generator convention,
//      ported in ./lib.ts) when null, through apply_po_default_sidemark
//      (00723), which keeps a release that covered the paper.
//   5b. Spec snapshot (C-34, ./revision.ts): 'send' and 'mark_sent' call
//      snapshot_purchase_order_spec AS THE CALLER; the PDF prints
//      "PO-… · Revision N" when N > 1. Preview takes no snapshot.
//   6. Render the PDF (_shared/po-pdf.ts, spike W4-T1 approach) and upload
//      to project-documents/{project_id}/po-{po_number}.pdf (upsert);
//      persist po_document_path; sign a short-lived (600 s) URL.
//   7. Mode:
//        'preview'   → return without emailing or stamping sent_at; an
//                      out-of-sync PO or one with no ship-to previews fine
//                      but the response carries warnings ('po_out_of_sync',
//                      'ship_to_not_set').
//        'send'      → guarded (W4-T4): line-derived trade total and
//                      Σ po_payments must BOTH equal total_cents, else 422
//                      po_out_of_sync (pre-00186 client-price POs / item
//                      re-pricing drift) — then email the vendor
//                      (studio account orders_email_override, read as the
//                      caller → recipientEmail → orders_email →
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
import { checkPoReleaseGate, sentStampFailure } from './release-gate.ts';
import {
  buildFallbackSidemark,
  buildSchedulePoProposal,
  callerMaySendPurchaseOrder,
  checkPoRepricingGate,
  checkPoTotalsCoherence,
  comArrivingSeparately,
  DRAFT_PO_NUMBER_LABEL,
  isDraftPreview,
  numberPurchaseOrder,
  persistSidemarkDefault,
  PO_OUT_OF_SYNC_DETAIL,
  type SupplyingLine,
  type SupplyingPurchaseOrder,
  parsePoSendBody,
  paymentPatternLabel,
  paymentRowLabel,
  resolvePoShipTo,
  readStudioOrdersEmail,
  resolveVendorRecipient,
  storePoDocument,
  vendorConfigurationLines,
  type VendorConfigurationSpec,
  type VendorProductMaster,
  vendorSafeSpecNotes,
} from './lib.ts';
import { revisionedPoNumber, snapshotPurchaseOrderSpec, snapshotsSpecOnSend } from './revision.ts';

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
  needs_repricing: boolean;
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
    client_id: string | null;
  } | null;
}

interface FfeItemRow {
  id: string;
  name: string;
  quantity: number | null;
  /** What the quantity counts (00729): each, sq_ft, lin_ft, roll, yard, box, hour, lot. */
  unit: string | null;
  trade_price_cents: number | null;
  unit_price_cents: number | null;
  notes: string | null;
  ffe_category: string | null;
  /** 00729: distinguishes a labor line from goods (C-24 COM fallback). */
  line_kind?: string | null;
  /** project_ffe_items.link_kind: 'com' pairs a line to its piece (C-24). */
  link_kind?: string | null;
  room: { id: string; name: string } | null;
  /** project_ffe_specs embed (UNIQUE ffe_item_id → object, not array). */
  spec: VendorConfigurationSpec | null;
  /** products embed via product_id: the spec fields' fallback (C-06). */
  product: VendorProductMaster | null;
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
 * RLS / auth.uid() inside RPCs (can_send_purchase_order, assign_po_number)
 * see the sender — not service_role. Same client shape getCallerUser builds.
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

  // ── Access — as the caller: the owner or a studio co-member (C-07) ──────
  // Not-found, not-allowed, and a failed check all collapse to 404 so the
  // endpoint doesn't confirm foreign PO ids exist (invoice-send idiom).
  const userClient = callerScopedClient(req);
  if (!(await callerMaySendPurchaseOrder(userClient, purchaseOrderId))) {
    return json({ error: 'po_not_found' }, 404);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── Load the PO + joins ─────────────────────────────────────────────────
  const { data: poData, error: poError } = await admin
    .from('purchase_orders')
    .select(
      `
      id, designer_id, project_id, vendor_id, status, payment_pattern,
      total_cents, po_number, sidemark, ship_to, po_document_path, sent_at,
      notes, created_at, needs_repricing,
      vendor:vendors!purchase_orders_vendor_id_fkey(id, name, orders_email, contact_info, website),
      project:projects!purchase_orders_project_id_fkey(id, name, client_id)
    `,
    )
    .eq('id', purchaseOrderId)
    .maybeSingle();

  if (poError) {
    console.error('po-send: PO lookup failed', poError);
    return json({ error: 'lookup_failed', detail: poError.message }, 500);
  }
  const po = poData as unknown as PoRow | null;
  if (!po) {
    return json({ error: 'po_not_found' }, 404);
  }
  if (po.status === 'cancelled') {
    return json({ error: 'po_cancelled', detail: 'A cancelled purchase order cannot be sent.' }, 409);
  }
  const repricingGate = checkPoRepricingGate(poData, mode);
  if (!repricingGate.ok) {
    return json(
      { error: repricingGate.error, detail: repricingGate.detail },
      repricingGate.error === 'po_needs_repricing' ? 409 : 500,
    );
  }
  // C-32: a PO waiting for an owner/admin release does not go out (as the caller).
  // R1 F2: a sent PO goes again only as the paper its release covered.
  const resend = po.sent_at !== null;
  const releaseGate = await checkPoReleaseGate(userClient, purchaseOrderId, mode, resend);
  if (!releaseGate.ok) {
    return json({ error: releaseGate.error, detail: releaseGate.detail }, releaseGate.status);
  }

  // ── Linked items (the document's line table) ────────────────────────────
  const { data: itemsData, error: itemsError } = await admin
    .from('project_ffe_items')
    .select(
      `
      id, name, quantity, unit, trade_price_cents, unit_price_cents, notes,
      ffe_category, line_kind, link_kind,
      room:project_rooms!project_room_id(id, name),
      spec:project_ffe_specs!project_ffe_specs_ffe_item_id_fkey(
        configuration_id, configuration_snapshot,
        configuration_snapshot_hash, configuration_locked_at,
        sku, material, finish, color_fabric, selected_dimensions,
        na_declarations, com_spec
      ),
      product:products!product_id(sku, finish, materials, colors, dimensions)
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

  // ── COM arriving separately (C-24) ──────────────────────────────────────
  // Fabric POs that supply this one, and the pieces their lines feed. A
  // lookup failure only loses the note, never the send.
  let supplyingOrders: SupplyingPurchaseOrder[] = [];
  let supplyingLines: SupplyingLine[] = [];
  const { data: supplyingData, error: supplyingError } = await admin
    .from('purchase_orders')
    .select('id, po_number, vendor:vendors!purchase_orders_vendor_id_fkey(name)')
    .eq('supplies_purchase_order_id', po.id)
    .neq('status', 'cancelled');
  if (supplyingError) {
    console.warn('po-send: supplying orders lookup failed', supplyingError);
  } else if (supplyingData && supplyingData.length > 0) {
    supplyingOrders = supplyingData as unknown as SupplyingPurchaseOrder[];
    const { data: linesData, error: linesError } = await admin
      .from('project_ffe_items')
      .select('purchase_order_id, parent_ffe_item_id, link_kind')
      .in('purchase_order_id', supplyingOrders.map((order) => order.id))
      .is('removed_at', null);
    if (linesError) console.warn('po-send: supplying lines lookup failed', linesError);
    else supplyingLines = (linesData ?? []) as SupplyingLine[];
  }
  const comArriving = comArrivingSeparately(items, supplyingOrders, supplyingLines);

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

  // ── Ship-to guard (C-02, R-PB3) — also before any side effect ───────────
  const shipToResolution = resolvePoShipTo(po.ship_to, mode);
  if (!shipToResolution.ok) {
    return json({ error: shipToResolution.error, detail: shipToResolution.detail }, 422);
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

  // R6: a held or unnumbered preview is a draft — no number, no PO writes.
  const draft = isDraftPreview(mode, po, releaseGate.sendable);

  // ── Numbering — as the caller, so the RPC's studio check holds ──────────
  const numbering = await numberPurchaseOrder(userClient, po.id, draft);
  if (!numbering.ok) {
    return json(
      { error: 'numbering_failed', ...(numbering.detail ? { detail: numbering.detail } : {}) },
      500,
    );
  }
  const poNumber = numbering.poNumber;

  // ── Sidemark fallback (persisted when defaulted, unless a draft) ────────
  // ship_to has no fallback: it is set explicitly or printed as not set.
  let sidemark = po.sidemark?.trim() || null;
  if (!sidemark) {
    const generated = buildFallbackSidemark({
      studioName,
      clientName,
      projectName: po.project?.name ?? null,
    });
    if (generated) {
      sidemark = generated;
      await persistSidemarkDefault(admin, po.id, generated, draft);
    }
  }

  // ── Spec snapshot + revision (C-34) — send and mark_sent, after every
  //    refusal guard, before the render so the PDF prints the revision ────
  let revision: number | null = null;
  if (snapshotsSpecOnSend(mode)) {
    const snapshot = await snapshotPurchaseOrderSpec(userClient, po.id);
    if (!snapshot.ok) {
      console.error('po-send: spec snapshot failed', snapshot.detail);
      return json({ error: 'snapshot_failed', detail: snapshot.detail }, 500);
    }
    revision = snapshot.revision;
  }

  // ── Render the PDF ──────────────────────────────────────────────────────
  const lines = items.map((item) => {
    const quantity = item.quantity ?? 1;
    // TRADE pricing — same COALESCE the 00186 total uses.
    const unitTradeCents = item.trade_price_cents ?? item.unit_price_cents ?? 0;
    // The configured spec block (P0-1): what the designer actually specified,
    // vendor-safe (selections / components / dimensions / COM / config hash —
    // never retail or markup). Empty array for an unconfigured line with no
    // flat spec fields, which renders exactly as before.
    // Unconfigured lines resolve each flat field spec → product master (C-06).
    const configurationLines = [
      ...vendorConfigurationLines(item.spec, item.product),
      ...(comArriving.get(item.id) ?? []),
    ];
    return {
      name: item.name,
      room: item.room?.name ?? null,
      quantity,
      unit: item.unit,
      unitTradeCents,
      lineTotalCents: unitTradeCents * quantity,
      specNotes: vendorSafeSpecNotes(item.notes),
      category: item.ffe_category,
      configurationLines: configurationLines.length > 0 ? configurationLines : undefined,
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
    poNumber: poNumber ? revisionedPoNumber(poNumber, revision) : DRAFT_PO_NUMBER_LABEL,
    issuedAt: po.sent_at ?? new Date().toISOString(),
    studioName,
    studioLogoUrl,
    designerName,
    designerEmail,
    vendorName: po.vendor?.name ?? 'Vendor',
    vendorContactLines: vendorContactLines(po.vendor),
    projectName: po.project?.name ?? 'Project',
    sidemark,
    shipTo: shipToResolution.printed,
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

  // ── Store the document ({projectId}/po-{poNumber}.pdf, or the draft's
  //    {projectId}/po-preview-{poId}.pdf with no po_document_path write) ───
  const stored = await storePoDocument(admin, DOCUMENTS_BUCKET, po, poNumber, pdfBytes);
  if (!stored.ok) {
    return json({ error: 'upload_failed', detail: stored.detail }, 500);
  }
  const documentPath = stored.documentPath;

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
    const warnings = [
      ...(totals.coherent ? [] : ['po_out_of_sync']),
      ...(shipToResolution.shipTo ? [] : ['ship_to_not_set']),
    ];
    return json({
      ok: true,
      poId: po.id,
      poNumber: poNumber ?? po.po_number,
      documentPath,
      emailSent: false,
      signedUrl,
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  }

  // ── Mode: send — email the vendor with the PDF attached ─────────────────
  let recipient: string | null = null;
  let emailSent = false;
  if (mode === 'send') {
    // C-12: the studio's own orders inbox for this vendor wins. Read as the
    // caller so get_studio_vendor_accounts' membership check applies.
    const studioInbox = await readStudioOrdersEmail(
      userClient,
      identity?.studioId,
      po.vendor_id,
    );
    if (!studioInbox.ok) {
      console.error('po-send: studio vendor account read failed', studioInbox.detail);
      return json({ error: 'lookup_failed', detail: studioInbox.detail }, 500);
    }
    recipient = resolveVendorRecipient(po.vendor, recipientEmail, studioInbox.email);
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
      poNumber: poNumber!, // only a draft preview leaves it null
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

    // SQ-448 (R2): read the gate again after the render, right before the
    // email — a co-member's hold or a lowered threshold mid-send refuses here,
    // before anything goes to the vendor.
    const releaseRecheck = await checkPoReleaseGate(userClient, purchaseOrderId, mode, resend);
    if (!releaseRecheck.ok) {
      return json({ error: releaseRecheck.error, detail: releaseRecheck.detail }, releaseRecheck.status);
    }

    let sendResult;
    try {
      const attachmentBytes = new ArrayBuffer(pdfBytes.byteLength);
      new Uint8Array(attachmentBytes).set(pdfBytes);
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
        // The sending studio (W4 r1 B-2): a vendor's address can sit on
        // several studios' cards, and the out touch belongs to this one.
        organizationId: identity?.studioId ?? undefined,
        attachments: [
          { filename: `${poNumber}.pdf`, content: encodeBase64(attachmentBytes) },
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
    const sentAt = new Date().toISOString();
    const { error: stampError } = await admin
      .from('purchase_orders')
      .update({ sent_at: sentAt })
      .eq('id', po.id)
      .is('sent_at', null);
    if (stampError) {
      console.error('po-send: failed to stamp sent_at', stampError);
      const failure = sentStampFailure(stampError, emailSent);
      return json(failure.body, failure.status);
    } else {
      // R109 — a fact proposes. This function runs as service_role, which has
      // zero EXECUTE on _commit_schedule_edit_authorized, so the proposal row
      // is structurally the only schedule write it can make.
      const { data: threadPhase } = await admin
        .from('project_phases')
        .select('id, anchor_date')
        .eq('project_id', po.project_id)
        .eq('lane', 'thread')
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle();
      const phase = threadPhase as { id: string; anchor_date: string | null } | null;
      const proposal = buildSchedulePoProposal({
        projectId: po.project_id,
        purchaseOrderId: po.id,
        targetPhaseId: phase?.id ?? null,
        targetAnchorDate: phase?.anchor_date ?? null,
        sentAt,
      });
      if (proposal) {
        const { error: proposalError } = await admin
          .from('schedule_proposals')
          .insert(proposal);
        // A live proposal for this project/phase/event already exists (the
        // partial unique index refusing to stack a second nag) — not a failure.
        if (proposalError) {
          console.warn('po-send: schedule proposal not recorded', proposalError);
        }
      }
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
