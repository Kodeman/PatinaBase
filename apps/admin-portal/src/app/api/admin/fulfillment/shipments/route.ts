import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, badRequest, notFound, serverError } from '@/lib/supabase-admin';
import type {
  FulfillmentShipmentRow,
  FulfillmentShipmentEligiblePo,
  FulfillmentShipmentsBoardDTO,
  ShipmentMode,
} from '@patina/fulfillment';

// GET /api/admin/fulfillment/shipments — the Shipment Board's one round-trip
// (S5, spec §5.4). Composed from base tables (S2/S3 idiom — "composed, not
// migrated"; no dedicated view, so this slice needs zero migrations, which
// matters this wave: S6 is the sole migration writer per the wave brief).
// Fetches split into separate queries + joined in JS (the pos/[poId] route's
// established workaround for the po_lines/order_items two-FK embed ambiguity,
// PGRST201).
//
// POST /api/admin/fulfillment/shipments — "tracking (manual entry v1)":
// creates a shipment for an acknowledged PO. Binds verbatim to
// fulfillment_record_shipment (00353):
//
//   CREATE OR REPLACE FUNCTION public.fulfillment_record_shipment(
//     p_po_id uuid, p_mode text, p_carrier text, p_tracking text, p_actor text)
//   ...
//   INSERT INTO public.fulfillment_shipments (po_id, mode, carrier, tracking, shipped_at, inspection_window_days)
//   VALUES (p_po_id, p_mode, p_carrier, p_tracking, now(), v_window)
//   ...
//   UPDATE public.fulfillment_vendor_pos SET status = 'in_production' WHERE id = p_po_id AND status = 'acknowledged';
//   UPDATE public.fulfillment_vendor_pos SET status = 'shipped'       WHERE id = p_po_id AND status = 'in_production';
//
// This is the ONLY RPC that touches fulfillment_shipments.mode/carrier/tracking
// — it both creates the row AND steps the PO/lines to shipped in one call, so
// "recording tracking" and "the PO has shipped" are the same operator action
// in v1 (matches the Shipment Board's framing: "rows are shipments").
//
// ⚠ SCHEMA GAP (I10, reported for S6 — not worked around here): there is no
// RPC to UPDATE a shipment's tracking/carrier or its current_eta/eta_history
// after creation. fulfillment_shipments.current_eta and .eta_history exist in
// 00350 but nothing in 00353 ever writes them — "manual tracking entry,
// schema webhook-ready" (spec §5.4) reads as create-only against the current
// RPC surface; an operator has no way to record a carrier ETA update once a
// shipment exists. The board still renders currentEta/the slip figure (it
// will populate once S6 or a later slice adds the RPC); scripts/seed-
// fulfillment-shipment-fixtures.sql documents the fixture-only workaround
// (the sanctioned app.fulfillment_writer='migration' GUC) it needed to
// produce a non-null current_eta for the slip screenshot.

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient as any;

  try {
    const { data: shipments, error: shipErr } = await db
      .from('fulfillment_shipments')
      .select(
        'id, po_id, mode, carrier, tracking, appointment_confirmed_at, shipped_at, delivered_at, ' +
          'pod_r2_key, inspection_window_days, inspection_closes_at, current_eta, eta_history',
      );
    if (shipErr) throw shipErr;

    const poIds = Array.from(new Set((shipments ?? []).map((s: any) => s.po_id)));
    const { data: pos, error: posErr } = poIds.length
      ? await db
          .from('fulfillment_vendor_pos')
          .select('id, order_id, vendor_id, po_number, committed_ship, status')
          .in('id', poIds)
      : { data: [], error: null };
    if (posErr) throw posErr;
    const poById = new Map<string, any>((pos ?? []).map((p: any): [string, any] => [p.id, p]));

    const orderIds = Array.from(new Set((pos ?? []).map((p: any) => p.order_id)));
    const { data: orders, error: ordersErr } = orderIds.length
      ? await db.from('fulfillment_orders').select('id, order_no, client_name').in('id', orderIds)
      : { data: [], error: null };
    if (ordersErr) throw ordersErr;
    const orderById = new Map<string, any>((orders ?? []).map((o: any): [string, any] => [o.id, o]));

    const vendorIds = Array.from(new Set((pos ?? []).map((p: any) => p.vendor_id)));
    const { data: vendors, error: vendorsErr } = vendorIds.length
      ? await db.from('vendors').select('id, name').in('id', vendorIds)
      : { data: [], error: null };
    if (vendorsErr) throw vendorsErr;
    const vendorById = new Map<string, any>((vendors ?? []).map((v: any): [string, any] => [v.id, v]));

    // Item names per PO (for the row's "client/item/PO refs" segment) — the
    // same two-step join-in-JS the composer route uses to avoid PGRST201.
    const { data: poLines, error: plErr } = poIds.length
      ? await db.from('fulfillment_vendor_po_lines').select('po_id, order_item_id').in('po_id', poIds)
      : { data: [], error: null };
    if (plErr) throw plErr;
    const itemIds = Array.from(new Set((poLines ?? []).map((l: any) => l.order_item_id)));
    const { data: items, error: itemErr } = itemIds.length
      ? await db.from('fulfillment_order_items').select('id, item_name').in('id', itemIds)
      : { data: [], error: null };
    if (itemErr) throw itemErr;
    const itemNameById = new Map<string, string>(
      (items ?? []).map((i: any): [string, string] => [i.id, i.item_name]),
    );
    const itemNamesByPo = new Map<string, string[]>();
    for (const l of poLines ?? []) {
      const name = itemNameById.get(l.order_item_id);
      if (!name) continue;
      const list = itemNamesByPo.get(l.po_id) ?? [];
      list.push(name);
      itemNamesByPo.set(l.po_id, list);
    }

    const rows: FulfillmentShipmentRow[] = (shipments ?? [])
      .map((s: any): FulfillmentShipmentRow | null => {
        const po: any = poById.get(s.po_id);
        if (!po) return null; // orphaned shipment (should not happen) — drop rather than crash the board
        const order: any = orderById.get(po.order_id) ?? {};
        const vendor: any = vendorById.get(po.vendor_id) ?? {};
        return {
          id: s.id,
          poId: s.po_id,
          poNumber: po.po_number ?? null,
          orderId: po.order_id,
          orderNo: order.order_no ?? 0,
          clientName: order.client_name ?? 'Unknown client',
          vendorId: po.vendor_id,
          vendorName: vendor.name ?? null,
          mode: s.mode as ShipmentMode,
          carrier: s.carrier ?? null,
          tracking: s.tracking ?? null,
          appointmentConfirmedAt: s.appointment_confirmed_at ?? null,
          shippedAt: s.shipped_at ?? null,
          deliveredAt: s.delivered_at ?? null,
          podR2Key: s.pod_r2_key ?? null,
          inspectionWindowDays: s.inspection_window_days ?? null,
          inspectionClosesAt: s.inspection_closes_at ?? null,
          currentEta: s.current_eta ?? null,
          committedShip: po.committed_ship ?? null,
          etaHistory: Array.isArray(s.eta_history) ? s.eta_history : [],
          itemNames: itemNamesByPo.get(s.po_id) ?? [],
        };
      })
      .filter((r: FulfillmentShipmentRow | null): r is FulfillmentShipmentRow => r !== null);

    // Eligible POs: acknowledged, no shipment recorded yet — the "Add
    // shipment" (tracking manual entry) affordance's picker list.
    const poIdsWithShipment = new Set((shipments ?? []).map((s: any) => s.po_id));
    const eligiblePos: FulfillmentShipmentEligiblePo[] = (pos ?? [])
      .filter((p: any) => p.status === 'acknowledged' && !poIdsWithShipment.has(p.id))
      .map((p: any) => {
        const order: any = orderById.get(p.order_id) ?? {};
        const vendor: any = vendorById.get(p.vendor_id) ?? {};
        return {
          poId: p.id,
          poNumber: p.po_number ?? null,
          orderId: p.order_id,
          orderNo: order.order_no ?? 0,
          clientName: order.client_name ?? 'Unknown client',
          vendorId: p.vendor_id,
          vendorName: vendor.name ?? null,
        };
      });

    const dto: FulfillmentShipmentsBoardDTO = { shipments: rows, eligiblePos };
    return NextResponse.json({ data: dto });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load the Shipment Board');
  }
}

const VALID_MODES = new Set(['parcel', 'ltl', 'white_glove']);

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient as any;
  const actor = auth.user.email ?? auth.user.id;

  let body: { poId?: string; mode?: string; carrier?: string; tracking?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('invalid body');
  }
  const { poId, mode, carrier, tracking } = body;
  if (!poId) return badRequest('poId is required');
  if (!mode || !VALID_MODES.has(mode)) return badRequest("mode must be one of 'parcel' | 'ltl' | 'white_glove'");
  if (!carrier || !carrier.trim()) return badRequest('carrier is required');
  if (!tracking || !tracking.trim()) return badRequest('tracking is required');

  try {
    const { data: shipmentId, error } = await db.rpc('fulfillment_record_shipment', {
      p_po_id: poId,
      p_mode: mode,
      p_carrier: carrier.trim(),
      p_tracking: tracking.trim(),
      p_actor: actor,
    });
    if (error) {
      if (/po .* not found/i.test(error.message ?? '')) return notFound('PO not found');
      throw error;
    }
    return NextResponse.json({ data: { shipmentId } });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to record the shipment');
  }
}
