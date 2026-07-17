import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, notFound, serverError } from '@/lib/supabase-admin';
import {
  computeVendorScorecard,
  emptyVendorScorecard,
  type PaymentTerms,
  type TransmissionType,
  type VendorProfileDTO,
} from '@patina/fulfillment';

const SCORECARD_WINDOW_DAYS = 90;

// GET /api/admin/fulfillment/vendors/[vendorId] — the vendor's protocol sheet
// (spec §7, R1.6 fields) + a trailing-90d scorecard computed from
// fulfillment_vendor_pos/_shipments/_exceptions/_order_items (read-only
// aggregate; computeVendorScorecard in @patina/fulfillment does the actual
// math, unit-tested there — see its file header for why this stayed a route-
// layer computation instead of a new view/RPC).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ vendorId: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;
  const { vendorId } = await params;

  try {
    const { data: vendor, error: vendorErr } = await db
      .from('vendors')
      .select('id, name')
      .eq('id', vendorId)
      .maybeSingle();
    if (vendorErr) throw vendorErr;
    if (!vendor) return notFound('Vendor not found');

    const { data: profileRow, error: profileErr } = await db
      .from('vendor_profiles')
      .select('*')
      .eq('vendor_id', vendorId)
      .maybeSingle();
    if (profileErr) throw profileErr;

    const profile: VendorProfileDTO | null = profileRow
      ? {
          vendorId: vendor.id as string,
          vendorName: vendor.name as string,
          transmissionType: profileRow.transmission_type as TransmissionType,
          contacts: (profileRow.contacts as Array<Record<string, unknown>>) ?? [],
          poEmail: (profileRow.po_email as string | null) ?? null,
          portalUrl: (profileRow.portal_url as string | null) ?? null,
          csvColumnSpec: (profileRow.csv_column_spec as Record<string, unknown> | null) ?? null,
          paymentTerms: profileRow.payment_terms as PaymentTerms,
          depositPct: (profileRow.deposit_pct as number | null) ?? null,
          leadTimeDays: (profileRow.lead_time_days as number | null) ?? null,
          changeWindowDays: (profileRow.change_window_days as number | null) ?? null,
          blindShip: !!profileRow.blind_ship,
          claimsWindowDays: (profileRow.claims_window_days as number | null) ?? null,
          inspectionWindowDays:
            (profileRow.inspection_window_days as VendorProfileDTO['inspectionWindowDays']) ?? null,
          freightArrangement: (profileRow.freight_arrangement as string | null) ?? null,
          commissionRate: (profileRow.commission_rate as number | null) ?? null,
        }
      : null;

    const windowStart = new Date(Date.now() - SCORECARD_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: pos, error: posErr } = await db
      .from('fulfillment_vendor_pos')
      .select('id, transmitted_at, acked_at, committed_ship')
      .eq('vendor_id', vendorId)
      .gte('created_at', windowStart);
    if (posErr) throw posErr;
    const poIds = (pos ?? []).map((p: { id: string }) => p.id);

    let shipments: Array<{ po_id: string; shipped_at: string | null }> = [];
    let exceptions: Array<{ po_id: string | null; type: string; cause_code: string | null }> = [];
    if (poIds.length > 0) {
      const [{ data: shipData, error: shipErr }, { data: excData, error: excErr }] = await Promise.all([
        db.from('fulfillment_shipments').select('po_id, shipped_at').in('po_id', poIds),
        db.from('fulfillment_exceptions').select('po_id, type, cause_code').in('po_id', poIds),
      ]);
      if (shipErr) throw shipErr;
      if (excErr) throw excErr;
      shipments = shipData ?? [];
      exceptions = excData ?? [];
    }

    const { count: orderItemCount, error: itemErr } = await db
      .from('fulfillment_order_items')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_id', vendorId)
      .gte('created_at', windowStart);
    if (itemErr) throw itemErr;

    const scorecard =
      (pos ?? []).length === 0
        ? emptyVendorScorecard(vendorId, SCORECARD_WINDOW_DAYS)
        : computeVendorScorecard(vendorId, SCORECARD_WINDOW_DAYS, {
            pos: pos ?? [],
            shipments,
            exceptions,
            orderItemCount: orderItemCount ?? 0,
          });

    return NextResponse.json({
      data: { vendorId: vendor.id as string, vendorName: vendor.name as string, profile, scorecard },
    });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load vendor');
  }
}
