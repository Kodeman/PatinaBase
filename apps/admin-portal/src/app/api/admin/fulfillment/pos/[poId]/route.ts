import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, notFound, serverError } from '@/lib/supabase-admin';
import type {
  FulfillmentComposerDTO,
  FulfillmentComposerLine,
  FulfillmentComposerEvent,
  TransmissionType,
  PaymentTerms,
  PoState,
} from '@patina/fulfillment';

// GET /api/admin/fulfillment/pos/[poId] — the PO Composer's one round-trip (S3,
// spec §5.3). Composed from base tables (workbench-route idiom, no dedicated
// view): the PO + its order + vendor + vendor_profile (the transmission
// protocol) + its lines + the append-only transmission log (fulfillment_events
// for this PO, plus the order's notification.* events — the "NOTE" lines). All
// mutation goes through the sibling transmit / ack / csv routes.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ poId: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient as any;
  const { poId } = await params;

  try {
    const { data: po, error: poErr } = await db
      .from('fulfillment_vendor_pos')
      .select(
        'id, order_id, vendor_id, po_number, status, terms, side_mark, requested_ship, ' +
          'committed_ship, ack_method, ack_ref, product_cost_cents, transmitted_at, acked_at, pdf_r2_key',
      )
      .eq('id', poId)
      .maybeSingle();
    if (poErr) throw poErr;
    if (!po) return notFound('PO not found');

    const { data: order, error: orderErr } = await db
      .from('fulfillment_orders')
      .select('order_no, client_name, ship_to')
      .eq('id', po.order_id)
      .maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) return notFound('Order not found');

    const { data: vendor, error: vendorErr } = await db
      .from('vendors')
      .select('name')
      .eq('id', po.vendor_id)
      .maybeSingle();
    if (vendorErr) throw vendorErr;

    const { data: profile, error: profErr } = await db
      .from('vendor_profiles')
      .select(
        'transmission_type, po_email, portal_url, csv_column_spec, blind_ship, ' +
          'change_window_days, claims_window_days, payment_terms',
      )
      .eq('vendor_id', po.vendor_id)
      .maybeSingle();
    if (profErr) throw profErr;

    // Lines: fetch po_lines + items separately and join in JS (avoids the
    // two-FK embed ambiguity between po_lines and order_items — PGRST201).
    const { data: poLines, error: plErr } = await db
      .from('fulfillment_vendor_po_lines')
      .select('id, order_item_id, qty, unit_cost_cents')
      .eq('po_id', poId);
    if (plErr) throw plErr;

    const itemIds = (poLines ?? []).map((l: any) => l.order_item_id);
    const { data: items, error: itemErr } = itemIds.length
      ? await db
          .from('fulfillment_order_items')
          .select('id, item_name, vendor_sku, line_index')
          .in('id', itemIds)
      : { data: [], error: null };
    if (itemErr) throw itemErr;
    const itemById = new Map((items ?? []).map((i: any) => [i.id, i]));

    const lines: FulfillmentComposerLine[] = (poLines ?? [])
      .map((l: any) => {
        const item: any = itemById.get(l.order_item_id) ?? {};
        const qty = l.qty ?? 1;
        const unit = l.unit_cost_cents ?? 0;
        return {
          id: l.id,
          orderItemId: l.order_item_id,
          lineIndex: item.line_index ?? 0,
          itemName: item.item_name ?? 'Item',
          vendorSku: item.vendor_sku ?? null,
          qty,
          unitCostCents: unit,
          lineTotalCents: unit * qty,
        };
      })
      .sort((a: FulfillmentComposerLine, b: FulfillmentComposerLine) => a.lineIndex - b.lineIndex);

    // Transmission log = this PO's events + the order's notification.* events.
    const { data: poEvents, error: peErr } = await db
      .from('fulfillment_events')
      .select('id, event_type, actor, refs, payload, created_at')
      .eq('po_id', poId);
    if (peErr) throw peErr;
    const { data: noteEvents, error: neErr } = await db
      .from('fulfillment_events')
      .select('id, event_type, actor, refs, payload, created_at')
      .eq('order_id', po.order_id)
      .like('event_type', 'notification.%');
    if (neErr) throw neErr;

    const events: FulfillmentComposerEvent[] = [...(poEvents ?? []), ...(noteEvents ?? [])].sort(
      (a: any, b: any) => a.id - b.id,
    );

    const dto: FulfillmentComposerDTO = {
      po: {
        id: po.id,
        poNumber: po.po_number,
        orderId: po.order_id,
        orderNo: order.order_no,
        clientName: order.client_name,
        vendorId: po.vendor_id,
        vendorName: vendor?.name ?? null,
        status: po.status as PoState,
        terms: (po.terms as PaymentTerms) ?? null,
        sideMark: po.side_mark,
        requestedShip: po.requested_ship,
        committedShip: po.committed_ship,
        ackMethod: po.ack_method,
        ackRef: po.ack_ref,
        productCostCents: po.product_cost_cents,
        transmittedAt: po.transmitted_at,
        ackedAt: po.acked_at,
        pdfR2Key: po.pdf_r2_key,
        shipTo: (order.ship_to as Record<string, unknown> | null) ?? null,
      },
      vendorProfile: {
        transmissionType: (profile?.transmission_type as TransmissionType) ?? null,
        poEmail: profile?.po_email ?? null,
        portalUrl: profile?.portal_url ?? null,
        csvColumnSpec: profile?.csv_column_spec ?? null,
        blindShip: profile?.blind_ship ?? false,
        changeWindowDays: profile?.change_window_days ?? null,
        claimsWindowDays: profile?.claims_window_days ?? null,
        paymentTerms: (profile?.payment_terms as PaymentTerms) ?? null,
      },
      lines,
      events,
    };

    return NextResponse.json({ data: dto });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load the PO');
  }
}
