import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, notFound, serverError } from '@/lib/supabase-admin';
import { circledIndex } from '@patina/fulfillment';
import type {
  FulfillmentOrderDetailDTO,
  FulfillmentWorkbenchLine,
  FulfillmentVendorOption,
  FulfillmentVendorPoDTO,
  TransmissionType,
  PaymentTerms,
  MappingState,
  LineState,
  PoState,
} from '@patina/fulfillment';

// GET /api/admin/fulfillment/orders/[orderId] — the Order Workbench's one
// round-trip (S2, spec §5.2). Composed from base tables (no dedicated view —
// the task prefers composing over new SQL): the order, its lines (with resolved
// vendor names + circled indexes), any existing PO drafts (post-confirm), the
// assignable vendor directory (vendor_profiles ⋈ vendors), and the three config
// numbers. Service-role reads via getAuthenticatedAdmin, matching S1's route
// idiom. All mutation goes through the sibling assign / move-line / confirm-
// split routes (each a single fulfillment_* RPC), never this GET.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  // Cast to any: the embedded `vendors!inner(...)` select confuses postgrest's
  // generic row inference (→ GenericStringError). Rows are mapped to explicit
  // @patina/fulfillment DTOs below, so the wire shape stays fully typed — same
  // pattern as the waitlist route.
  const db = auth.adminClient as any;
  const { orderId } = await params;

  try {
    const { data: order, error: orderErr } = await db
      .from('fulfillment_orders')
      .select(
        'id, order_no, stripe_payment_intent_id, client_name, client_email, ship_to, ' +
          'client_profile_id, designer_attribution, captured_total_cents, ' +
          'product_subtotal_cents, freight_charged_cents, tax_cents, intake_at',
      )
      .eq('id', orderId)
      .maybeSingle();

    if (orderErr) throw orderErr;
    if (!order) return notFound('Order not found');

    const { data: lineRows, error: lineErr } = await db
      .from('fulfillment_order_items')
      .select(
        'id, order_id, product_id, item_name, vendor_sku, qty, unit_price_cents, ' +
          'unit_cost_cents, vendor_id, mapping_state, line_state, line_index, po_line_id',
      )
      .eq('order_id', orderId)
      .order('line_index', { ascending: true });
    if (lineErr) throw lineErr;

    const { data: poRows, error: poErr } = await db
      .from('fulfillment_vendor_pos')
      .select('id, po_number, vendor_id, status, terms, side_mark, product_cost_cents')
      .eq('order_id', orderId)
      .order('po_number', { ascending: true });
    if (poErr) throw poErr;

    const poIds = (poRows ?? []).map((p: any) => p.id);
    const { data: poLineRows, error: poLineErr } = poIds.length
      ? await db
          .from('fulfillment_vendor_po_lines')
          .select('id, po_id, order_item_id')
          .in('po_id', poIds)
      : { data: [], error: null };
    if (poLineErr) throw poLineErr;

    // Vendor directory — every vendor with a profile can receive a PO (R1.6).
    const { data: profileRows, error: profErr } = await db
      .from('vendor_profiles')
      .select('vendor_id, transmission_type, commission_rate, vendors!inner(id, name)');
    if (profErr) throw profErr;

    // Config numbers (spec §10). Read the three keys the strip needs.
    const { data: cfgRows, error: cfgErr } = await db
      .from('fulfillment_config')
      .select('key, value')
      .in('key', ['margin_floor_warning', 'commission_rate_default', 'pledge_accrual']);
    if (cfgErr) throw cfgErr;

    // ─── Map to the DTO ──────────────────────────────────────────────────────
    const vendors: FulfillmentVendorOption[] = (profileRows ?? []).map((p: any) => ({
      vendorId: p.vendor_id,
      vendorName: p.vendors?.name ?? null,
      transmissionType: p.transmission_type as TransmissionType,
      commissionRate: p.commission_rate == null ? null : Number(p.commission_rate),
    }));
    const vendorNameById = new Map(vendors.map((v) => [v.vendorId, v.vendorName]));

    const lineToPo = new Map<string, { poId: string; poLineId: string }>();
    for (const pl of poLineRows ?? []) {
      lineToPo.set(pl.order_item_id, { poId: pl.po_id, poLineId: pl.id });
    }

    const lines: FulfillmentWorkbenchLine[] = (lineRows ?? []).map((l: any) => {
      const link = lineToPo.get(l.id);
      return {
        id: l.id,
        orderId: l.order_id,
        productId: l.product_id,
        itemName: l.item_name,
        vendorSku: l.vendor_sku,
        qty: l.qty,
        unitPriceCents: l.unit_price_cents,
        unitCostCents: l.unit_cost_cents,
        vendorId: l.vendor_id,
        vendorName: l.vendor_id ? vendorNameById.get(l.vendor_id) ?? null : null,
        mappingState: l.mapping_state as MappingState,
        lineState: l.line_state as LineState,
        lineIndex: l.line_index,
        circledIndex: circledIndex(l.line_index),
        poId: link?.poId ?? null,
        poLineId: link?.poLineId ?? l.po_line_id ?? null,
      };
    });

    // order_item ids per PO (thread the right side back to the left).
    const linesByPo = new Map<string, string[]>();
    for (const pl of poLineRows ?? []) {
      const arr = linesByPo.get(pl.po_id) ?? [];
      arr.push(pl.order_item_id);
      linesByPo.set(pl.po_id, arr);
    }
    const transmissionByVendor = new Map(
      vendors.map((v) => [v.vendorId, v.transmissionType]),
    );
    const pos: FulfillmentVendorPoDTO[] = (poRows ?? []).map((p: any) => ({
      id: p.id,
      poNumber: p.po_number,
      vendorId: p.vendor_id,
      vendorName: vendorNameById.get(p.vendor_id) ?? null,
      transmissionType: transmissionByVendor.get(p.vendor_id) ?? null,
      status: p.status as PoState,
      terms: (p.terms as PaymentTerms) ?? null,
      sideMark: p.side_mark,
      productCostCents: p.product_cost_cents,
      lineIds: linesByPo.get(p.id) ?? [],
    }));

    const cfg = new Map((cfgRows ?? []).map((r: any) => [r.key, r.value]));
    const config = {
      marginFloorPct: Number((cfg.get('margin_floor_warning') as any)?.pct ?? 0.25),
      pledgeRate: Number((cfg.get('pledge_accrual') as any)?.rate ?? 0.25),
      commissionRateDefault: Number((cfg.get('commission_rate_default') as any)?.rate ?? 0.16),
    };

    const detail: FulfillmentOrderDetailDTO = {
      order: {
        id: order.id,
        orderNo: order.order_no,
        stripePaymentIntentId: order.stripe_payment_intent_id,
        clientName: order.client_name,
        clientEmail: order.client_email,
        clientProfileId: order.client_profile_id,
        shipTo: (order.ship_to as Record<string, unknown> | null) ?? null,
        designerAttribution:
          (order.designer_attribution as Record<string, unknown> | null) ?? null,
        capturedTotalCents: order.captured_total_cents,
        productSubtotalCents: order.product_subtotal_cents,
        freightChargedCents: order.freight_charged_cents,
        taxCents: order.tax_cents,
        intakeAt: order.intake_at,
      },
      lines,
      pos,
      vendors,
      config,
      confirmed: pos.length > 0,
    };

    return NextResponse.json({ data: detail });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load the order');
  }
}
