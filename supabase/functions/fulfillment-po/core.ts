// fulfillment-po core (S3, spec §5.3) — the PO Composer's render/transmit
// engine, kept pure + injectable so the Deno test drives it without the HTTP
// shell (index.ts). Three modes:
//   preview          → render the PO paper, return the PDF bytes (no mutation)
//   send             → render → archive to project-documents → email the vendor
//                      from orders@patina.cloud (base64 attach) →
//                      fulfillment_record_transmission(method='email', resend id)
//   mark_transmitted → render → archive → fulfillment_record_transmission with
//                      the operator's method (portal|csv) + reference; NO email
//
// Every state write goes through the fulfillment_record_transmission RPC (00353)
// — the writer-guard + append-only fulfillment_events log are the review gate
// (§11); this function never touches lifecycle tables directly. The append-only
// log IS the transmission log the composer renders; a re-send simply appends
// another po.transmitted event (corrections append, spec §5.3).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encode as encodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts';
import { buildFulfillmentPoPdf, type FulfillmentPoPdfData } from '../_shared/fulfillment-po-pdf.ts';
import { sendCompliantEmail, type ComplianceSendResult } from '../_shared/send-email.ts';

export const PO_BUCKET = 'project-documents';
export const PO_FROM = 'Patina Orders <orders@patina.cloud>';
const SIGNED_URL_TTL_SECONDS = 600;

export type FulfillmentPoMode = 'preview' | 'send' | 'mark_transmitted';

export interface FulfillmentPoRequest {
  po_id: string;
  mode: FulfillmentPoMode;
  /** mark_transmitted: transmission channel actually used ('portal' | 'csv'). */
  method?: string;
  /** mark_transmitted: operator-entered reference (portal confirmation / CSV batch id). */
  reference?: string;
  actor?: string;
}

export interface FulfillmentPoDeps {
  supabase: SupabaseClient; // service-role
  /** Injectable for tests; defaults to sendCompliantEmail in index.ts. */
  sendEmail: typeof sendCompliantEmail;
  now: () => Date;
  /** Public host for signed URLs (Kong-internal → browser-reachable rewrite). */
  publicSupabaseUrl?: string;
  internalSupabaseUrl?: string;
}

export type FulfillmentPoResult =
  | { kind: 'pdf'; bytes: Uint8Array; poNumber: string }
  | {
      kind: 'json';
      body: {
        ok: true;
        poId: string;
        poNumber: string;
        r2Key: string;
        method: string;
        reference: string | null;
        emailSent: boolean;
        recipient?: string | null;
        resendMessageId?: string | null;
        signedUrl: string | null;
      };
    };

// ─── Term / address formatting ───────────────────────────────────────────────
export function paymentTermsLabel(terms: string | null): string | null {
  switch (terms) {
    case 'prepay':
      return 'Prepay';
    case 'fifty_fifty':
      return '50% deposit, 50% balance';
    case 'net_30':
      return 'Net 30';
    default:
      return null;
  }
}

export function formatShipTo(shipTo: Record<string, unknown> | null): string | null {
  if (!shipTo) return null;
  const s = shipTo as Record<string, string | undefined>;
  const l1 = [s.line1, s.line2].filter(Boolean).join(', ');
  const l2 = [s.city, [s.state, s.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [l1, l2].filter(Boolean).join('\n') || null;
}

// ─── PO context loader ───────────────────────────────────────────────────────

export interface PoContext {
  poId: string;
  poNumber: string;
  orderNo: number;
  clientName: string;
  vendorId: string;
  vendorName: string;
  vendorContactLines: string[];
  shipTo: Record<string, unknown> | null;
  requestedShip: string | null;
  sideMark: string | null;
  terms: string | null;
  productCostCents: number;
  transmissionType: string | null;
  poEmail: string | null;
  portalUrl: string | null;
  csvColumnSpec: unknown;
  blindShip: boolean;
  changeWindowDays: number | null;
  claimsWindowDays: number | null;
  paymentTerms: string | null;
  leadTimeDays: number | null;
  lines: Array<{
    lineLabel: string;
    vendorSku: string | null;
    description: string;
    qty: number;
    unitCostCents: number;
    lineTotalCents: number;
  }>;
}

/** Load everything the PO paper + transmit panel need. Throws (message maps to a
 *  4xx in index.ts) when the PO does not exist. */
export async function loadPoContext(supabase: SupabaseClient, poId: string): Promise<PoContext> {
  const db = supabase as unknown as {
    from: (t: string) => any;
  };

  const { data: po, error: poErr } = await db
    .from('fulfillment_vendor_pos')
    .select(
      'id, order_id, vendor_id, po_number, status, terms, side_mark, requested_ship, product_cost_cents, pdf_r2_key',
    )
    .eq('id', poId)
    .maybeSingle();
  if (poErr) throw new Error(`po_lookup_failed: ${poErr.message}`);
  if (!po) throw new Error('po_not_found');

  const { data: order, error: orderErr } = await db
    .from('fulfillment_orders')
    .select('order_no, client_name, ship_to')
    .eq('id', po.order_id)
    .maybeSingle();
  if (orderErr) throw new Error(`order_lookup_failed: ${orderErr.message}`);
  if (!order) throw new Error('order_not_found');

  const { data: vendor, error: vendorErr } = await db
    .from('vendors')
    .select('name, contact_info, website, orders_email')
    .eq('id', po.vendor_id)
    .maybeSingle();
  if (vendorErr) throw new Error(`vendor_lookup_failed: ${vendorErr.message}`);

  const { data: profile, error: profErr } = await db
    .from('vendor_profiles')
    .select(
      'transmission_type, po_email, portal_url, csv_column_spec, blind_ship, ' +
        'change_window_days, claims_window_days, payment_terms, lead_time_days',
    )
    .eq('vendor_id', po.vendor_id)
    .maybeSingle();
  if (profErr) throw new Error(`profile_lookup_failed: ${profErr.message}`);

  // Disambiguate the embed: there are TWO FKs between these tables
  // (po_lines.order_item_id → items.id AND items.po_line_id → po_lines.id), so a
  // bare embed is PGRST201-ambiguous. Hint the order_item_id FK explicitly.
  const { data: lineRows, error: lineErr } = await db
    .from('fulfillment_vendor_po_lines')
    .select('qty, unit_cost_cents, fulfillment_order_items!order_item_id(item_name, vendor_sku, line_index)')
    .eq('po_id', poId);
  if (lineErr) throw new Error(`lines_lookup_failed: ${lineErr.message}`);

  const contactLines: string[] = [];
  const info = (vendor?.contact_info ?? {}) as Record<string, unknown>;
  if (typeof profile?.po_email === 'string' && profile.po_email.trim()) {
    contactLines.push(profile.po_email.trim());
  } else if (typeof vendor?.orders_email === 'string' && vendor.orders_email.trim()) {
    contactLines.push(vendor.orders_email.trim());
  }
  for (const key of ['phone', 'address']) {
    const v = info[key];
    if (typeof v === 'string' && v.trim()) contactLines.push(v.trim());
  }

  const lines = (lineRows ?? [])
    .map((l: any) => {
      const item = l.fulfillment_order_items;
      const qty = l.qty ?? 1;
      const unit = l.unit_cost_cents ?? 0;
      return {
        lineIndex: item?.line_index ?? 0,
        lineLabel: String(item?.line_index ?? ''),
        vendorSku: item?.vendor_sku ?? null,
        description: item?.item_name ?? 'Item',
        qty,
        unitCostCents: unit,
        lineTotalCents: unit * qty,
      };
    })
    .sort((a: any, b: any) => a.lineIndex - b.lineIndex)
    .map(({ lineIndex: _drop, ...rest }: any) => rest);

  return {
    poId: po.id,
    poNumber: po.po_number ?? '(unassigned)',
    orderNo: order.order_no,
    clientName: order.client_name,
    vendorId: po.vendor_id,
    vendorName: vendor?.name ?? 'Vendor',
    vendorContactLines: contactLines,
    shipTo: (order.ship_to as Record<string, unknown> | null) ?? null,
    requestedShip: po.requested_ship ?? null,
    sideMark: po.side_mark ?? null,
    terms: po.terms ?? null,
    productCostCents: po.product_cost_cents ?? 0,
    transmissionType: profile?.transmission_type ?? null,
    poEmail: profile?.po_email ?? vendor?.orders_email ?? null,
    portalUrl: profile?.portal_url ?? null,
    csvColumnSpec: profile?.csv_column_spec ?? null,
    blindShip: profile?.blind_ship ?? false,
    changeWindowDays: profile?.change_window_days ?? null,
    claimsWindowDays: profile?.claims_window_days ?? null,
    paymentTerms: profile?.payment_terms ?? null,
    leadTimeDays: profile?.lead_time_days ?? null,
    lines,
  };
}

/** Map the loaded context to the PDF builder's data contract. `issuedAt` is the
 *  caller's clock so tests are deterministic. */
export function buildPoPdfData(ctx: PoContext, issuedAt: string): FulfillmentPoPdfData {
  // Requested ship: the PO's own value if set, else a lead-time-derived default
  // (issued + lead_time_days) so the vendor always sees a target date.
  let requestedShip = ctx.requestedShip;
  if (!requestedShip && ctx.leadTimeDays != null) {
    const d = new Date(issuedAt);
    d.setUTCDate(d.getUTCDate() + ctx.leadTimeDays);
    requestedShip = d.toISOString().slice(0, 10);
  }
  return {
    poNumber: ctx.poNumber,
    issuedAt,
    sideMark: ctx.sideMark,
    vendorName: ctx.vendorName,
    vendorContactLines: ctx.vendorContactLines,
    shipTo: formatShipTo(ctx.shipTo),
    requestedShip,
    blindShip: ctx.blindShip,
    paymentTermsLabel: paymentTermsLabel(ctx.terms ?? ctx.paymentTerms),
    changeWindowDays: ctx.changeWindowDays,
    claimsWindowDays: ctx.claimsWindowDays,
    lines: ctx.lines,
    productCostCents: ctx.productCostCents,
  };
}

// ─── Archive helper ──────────────────────────────────────────────────────────
async function archivePdf(
  deps: FulfillmentPoDeps,
  poNumber: string,
  bytes: Uint8Array,
): Promise<{ r2Key: string; signedUrl: string | null }> {
  const r2Key = `fulfillment/po/${poNumber}.pdf`;
  const { error: upErr } = await deps.supabase.storage
    .from(PO_BUCKET)
    .upload(r2Key, bytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) throw new Error(`archive_failed: ${upErr.message}`);

  let signedUrl: string | null = null;
  const { data: signed } = await deps.supabase.storage
    .from(PO_BUCKET)
    .createSignedUrl(r2Key, SIGNED_URL_TTL_SECONDS);
  if (signed?.signedUrl) {
    signedUrl = signed.signedUrl;
    if (deps.internalSupabaseUrl && deps.publicSupabaseUrl) {
      signedUrl = signedUrl.replace(deps.internalSupabaseUrl, deps.publicSupabaseUrl);
    }
  }
  return { r2Key, signedUrl };
}

// ─── The three modes ─────────────────────────────────────────────────────────
export async function runFulfillmentPo(
  deps: FulfillmentPoDeps,
  req: FulfillmentPoRequest,
): Promise<FulfillmentPoResult> {
  const actor = req.actor ?? 'operator';
  const ctx = await loadPoContext(deps.supabase, req.po_id);
  const issuedAt = deps.now().toISOString();
  const pdfData = buildPoPdfData(ctx, issuedAt);
  const bytes = await buildFulfillmentPoPdf(pdfData);

  if (req.mode === 'preview') {
    return { kind: 'pdf', bytes, poNumber: ctx.poNumber };
  }

  // send + mark_transmitted both archive the paper first.
  const { r2Key, signedUrl } = await archivePdf(deps, ctx.poNumber, bytes);

  if (req.mode === 'send') {
    const recipient = ctx.poEmail;
    if (!recipient) throw new Error('no_recipient');
    let sendResult: ComplianceSendResult;
    try {
      sendResult = await deps.sendEmail(deps.supabase, {
        to: recipient,
        from: PO_FROM,
        subject: `Purchase Order ${ctx.poNumber} · ${ctx.sideMark ?? ctx.clientName}`,
        html: buildPoEmailHtml(ctx),
        // The vendor is not a platform user — no userId (no suppression/log).
        category: 'operational',
        notificationType: 'fulfillment_po_sent',
        templateId: 'fulfillment-po',
        attachments: [{ filename: `${ctx.poNumber}.pdf`, content: encodeBase64(bytes) }],
        metadata: { po_id: ctx.poId, po_number: ctx.poNumber },
      });
    } catch (err) {
      throw new Error(`send_failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!sendResult.success) {
      throw new Error(`send_failed: ${sendResult.error ?? 'unknown'}`);
    }
    const resendMessageId = sendResult.id ?? null;
    await recordTransmission(deps, ctx.poId, 'email', resendMessageId, r2Key, actor);
    return {
      kind: 'json',
      body: {
        ok: true,
        poId: ctx.poId,
        poNumber: ctx.poNumber,
        r2Key,
        method: 'email',
        reference: resendMessageId,
        emailSent: true,
        recipient,
        resendMessageId,
        signedUrl,
      },
    };
  }

  // mark_transmitted (portal / csv) — no email; operator-entered reference.
  const method = req.method ?? ctx.transmissionType ?? 'portal';
  const reference = req.reference ?? null;
  await recordTransmission(deps, ctx.poId, method, reference, r2Key, actor);
  return {
    kind: 'json',
    body: {
      ok: true,
      poId: ctx.poId,
      poNumber: ctx.poNumber,
      r2Key,
      method,
      reference,
      emailSent: false,
      signedUrl,
    },
  };
}

async function recordTransmission(
  deps: FulfillmentPoDeps,
  poId: string,
  method: string,
  reference: string | null,
  r2Key: string,
  actor: string,
): Promise<void> {
  const { error } = await (deps.supabase as any).rpc('fulfillment_record_transmission', {
    p_po_id: poId,
    p_method: method,
    p_ref: reference,
    p_pdf_r2_key: r2Key,
    p_actor: actor,
  });
  if (error) throw new Error(`record_transmission_failed: ${error.message}`);
}

/** A short vendor-facing email body. Client-safe: names the PO + side-mark, not
 *  the full client relationship or the other vendors in the order. */
export function buildPoEmailHtml(ctx: PoContext): string {
  return [
    `<p>Hello ${escapeHtml(ctx.vendorName)},</p>`,
    `<p>Please find attached Purchase Order <strong>${escapeHtml(ctx.poNumber)}</strong>`,
    ctx.sideMark ? ` (side-mark <strong>${escapeHtml(ctx.sideMark)}</strong>)` : '',
    `. Kindly confirm receipt and your committed ship date.</p>`,
    `<p>Thank you,<br/>Patina Orders</p>`,
  ].join('');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}
