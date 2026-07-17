import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, notFound, serverError } from '@/lib/supabase-admin';
import type { ExceptionCaseFileDTO, ExceptionEvidence } from '@patina/fulfillment';

// S7 case file (spec §5.5) — the single detail round-trip: exception + order/PO/
// line/shipment refs, evidence as signed download URLs (project-documents,
// fulfillment/evidence/* prefix), and the Leah review status while pending.

const EVIDENCE_BUCKET = 'project-documents';
const SIGNED_TTL = 60 * 30; // 30 min

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ exceptionId: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;
  const { exceptionId } = await params;

  try {
    const { data: exc, error } = await db
      .from('fulfillment_exceptions')
      .select('*')
      .eq('id', exceptionId)
      .maybeSingle();
    if (error) throw error;
    if (!exc) return notFound();

    const [order, item, po, shipment, leah] = await Promise.all([
      exc.order_id
        ? db.from('fulfillment_orders').select('order_no, client_name').eq('id', exc.order_id).maybeSingle()
        : Promise.resolve({ data: null }),
      exc.order_item_id
        ? db.from('fulfillment_order_items').select('item_name, line_index').eq('id', exc.order_item_id).maybeSingle()
        : Promise.resolve({ data: null }),
      exc.po_id
        ? db.from('fulfillment_vendor_pos').select('po_number, side_mark').eq('id', exc.po_id).maybeSingle()
        : Promise.resolve({ data: null }),
      exc.shipment_id
        ? db.from('fulfillment_shipments').select('mode').eq('id', exc.shipment_id).maybeSingle()
        : Promise.resolve({ data: null }),
      db
        .from('leah_reviews')
        .select('status')
        .eq('exception_id', exceptionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // signed download URLs for the evidence grid (a missing object just 404s on
    // <img>, which the grid renders as a labelled placeholder tile)
    const keys: string[] = exc.evidence_r2_keys ?? [];
    let evidence: ExceptionEvidence[] = keys.map((key) => ({ key, url: null }));
    if (keys.length) {
      const { data: signed } = await db.storage.from(EVIDENCE_BUCKET).createSignedUrls(keys, SIGNED_TTL);
      if (signed) {
        const map = new Map(signed.map((s) => [s.path, s.signedUrl]));
        evidence = keys.map((key) => ({ key, url: map.get(key) ?? null }));
      }
    }

    const dto: ExceptionCaseFileDTO = {
      id: exc.id,
      type: exc.type as ExceptionCaseFileDTO['type'],
      status: exc.status as ExceptionCaseFileDTO['status'],
      openedAt: exc.opened_at,
      resolvedAt: exc.resolved_at,
      clockDueAt: exc.clock_due_at,
      orderId: exc.order_id,
      orderNo: order.data?.order_no ?? null,
      clientName: order.data?.client_name ?? null,
      poId: exc.po_id,
      poNumber: po.data?.po_number ?? null,
      sideMark: po.data?.side_mark ?? null,
      orderItemId: exc.order_item_id,
      itemName: item.data?.item_name ?? null,
      itemIndex: item.data?.line_index ?? null,
      shipmentId: exc.shipment_id,
      shipmentMode: shipment.data?.mode ?? null,
      evidence,
      causeCode: exc.cause_code,
      resolutionPath: exc.resolution_path,
      outcomeMemo: exc.outcome_memo,
      financialOutcomeEntryId: exc.financial_outcome_entry_id,
      leahReviewStatus: (leah.data?.status as ExceptionCaseFileDTO['leahReviewStatus']) ?? null,
    };

    return NextResponse.json({ data: dto });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load case file');
  }
}
