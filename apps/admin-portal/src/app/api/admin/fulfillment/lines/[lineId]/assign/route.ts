import { NextRequest, NextResponse } from 'next/server';
import { badRequest, getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

// POST /api/admin/fulfillment/lines/[lineId]/assign — assign (or reassign) a
// line's vendor + unit cost (S2, spec §5.2 / R1.7). Wraps the
// fulfillment_assign_line_vendor RPC (00353), which flips mapping_state to
// 'mapped', stamps the cost, and logs a line.vendor_assigned event. This is
// the ONLY path that clears an Unmapped line (unblocking confirm) and also the
// persistence behind a pre-confirm drag between proposed vendor groups (the
// destination group IS a vendor). Body: { vendorId, unitCostCents }.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lineId: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;
  const actor = auth.user.email ?? auth.user.id;
  const { lineId } = await params;

  let body: { vendorId?: string; unitCostCents?: number };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const { vendorId, unitCostCents } = body;
  if (!vendorId) return badRequest('vendorId is required');
  if (typeof unitCostCents !== 'number' || !Number.isFinite(unitCostCents) || unitCostCents < 0) {
    return badRequest('unitCostCents must be a non-negative number');
  }

  try {
    const { error } = await db.rpc('fulfillment_assign_line_vendor', {
      p_item_id: lineId,
      p_vendor_id: vendorId,
      p_unit_cost_cents: Math.round(unitCostCents),
      p_actor: actor,
    });
    if (error) throw error;
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to assign vendor');
  }
}
