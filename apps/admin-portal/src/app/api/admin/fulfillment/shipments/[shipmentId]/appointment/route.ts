import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, badRequest, notFound, serverError } from '@/lib/supabase-admin';
import { loadShipmentForGate } from '@/lib/fulfillment-shipments';

// POST /api/admin/fulfillment/shipments/[shipmentId]/appointment — confirm the
// LTL/white_glove delivery appointment (S5, spec §5.4: "LTL/WG require
// appointment confirmation"). Body: { confirmedAt?: 'YYYY-MM-DDTHH:mm:ssZ' }
// (defaults to now()).
//
// SCHEMA GAP (I10, reported for S6 - never worked around here): no RPC in
// 00353 writes fulfillment_shipments.appointment_confirmed_at. Every
// fulfillment_* table is writer-guarded (fulfillment_writer_guard, 00350) - a
// write is denied unless app.fulfillment_writer is 'rpc' (set inside an RPC's
// own transaction) or 'migration' (the seed/fixture side door). PostgREST's
// `.update()` runs as its own transaction with no way to `set_config(...)`
// first, so there is LITERALLY NO PATH for this route to write that column
// today short of a new SECURITY DEFINER RPC - the guard is doing exactly what
// section 11 says it should ("nothing mutates outside it... a review gate").
// This route calls the RPC the naming convention implies SHOULD exist:
//
//   fulfillment_confirm_appointment(p_shipment_id uuid, p_confirmed_at timestamptz, p_actor text)
//
// and turns Postgres's "function does not exist" (42883) into a clean, honest
// 501 rather than a raw stack trace. Once S6 (or whichever slice owns the
// next migration) adds that RPC with this exact name/signature, this route
// starts working with ZERO further changes on this side.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shipmentId: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient as any;
  const { shipmentId } = await params;
  const actor = auth.user.email ?? auth.user.id;

  let body: { confirmedAt?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const confirmedAt = body.confirmedAt ?? new Date().toISOString();
  if (Number.isNaN(new Date(confirmedAt).getTime())) {
    return badRequest('confirmedAt must be a valid ISO timestamp');
  }

  try {
    const shipment = await loadShipmentForGate(db, shipmentId);
    if (!shipment) return notFound('Shipment not found');

    const { error } = await db.rpc('fulfillment_confirm_appointment', {
      p_shipment_id: shipmentId,
      p_confirmed_at: confirmedAt,
      p_actor: actor,
    });
    if (error) {
      // 42883 = undefined_function - the schema gap documented above.
      if (
        error.code === '42883' ||
        /function .*fulfillment_confirm_appointment.* does not exist/i.test(error.message ?? '')
      ) {
        return NextResponse.json(
          {
            error:
              'appointment confirmation is not yet implemented at the RPC layer (schema gap - see BOH-DECISIONS I10, filed for S6)',
            code: 'not_implemented',
          },
          { status: 501 },
        );
      }
      throw error;
    }

    return NextResponse.json({ data: { ok: true, appointmentConfirmedAt: confirmedAt } });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to confirm the appointment');
  }
}
