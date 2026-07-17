import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, notFound, serverError } from '@/lib/supabase-admin';
import { gateForDelivery, loadShipmentForGate } from '@/lib/fulfillment-shipments';

// POST /api/admin/fulfillment/shipments/[shipmentId]/deliver — mark a
// shipment delivered WITHOUT photographic evidence (typically parcel, where a
// carrier tracking scan is the confirmation). Binds to the same RPC the
// "pod" route uses, fulfillment_record_delivery (00353) - see that route's
// header for the full quoted RPC body and the appointment-gate gap writeup
// (I10). This route calls it with p_pod_r2_key = null.
//
// The LTL/white_glove appointment gate applies here too (gateForDelivery) -
// package S5 accepts-when: "an LTL shipment cannot reach 'delivered' flow
// without a confirmed appointment," and both delivery paths lead to the same
// RPC call, so both must be gated identically.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shipmentId: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient as any;
  const { shipmentId } = await params;
  const actor = auth.user.email ?? auth.user.id;

  try {
    const shipment = await loadShipmentForGate(db, shipmentId);
    if (!shipment) return notFound('Shipment not found');

    const gate = gateForDelivery(shipment);
    if (!gate.allowed) {
      return NextResponse.json({ error: gate.message, code: gate.reason }, { status: 409 });
    }

    const { error } = await db.rpc('fulfillment_record_delivery', {
      p_shipment_id: shipmentId,
      p_pod_r2_key: null,
      p_actor: actor,
    });
    if (error) {
      if (/shipment .* not found/i.test(error.message ?? '')) return notFound('Shipment not found');
      throw error;
    }

    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to mark the shipment delivered');
  }
}
