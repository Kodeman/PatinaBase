import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, badRequest, notFound, serverError } from '@/lib/supabase-admin';
import { loadShipmentForGate } from '@/lib/fulfillment-shipments';

// POST /api/admin/fulfillment/shipments/[shipmentId]/appointment — confirm the
// LTL/white_glove delivery appointment (S5, spec §5.4: "LTL/WG require
// appointment confirmation"). Body: { confirmedAt?: 'YYYY-MM-DDTHH:mm:ssZ' }
// (defaults to now(); validated but NOT forwarded to the RPC — see below).
//
// RPC: public.fulfillment_confirm_appointment(p_shipment_id uuid, p_actor
// text) — shipped in 00363 (S6). It always stamps appointment_confirmed_at =
// now() server-side and takes exactly those two arguments; there is no
// p_confirmed_at parameter. Every fulfillment_* table is writer-guarded
// (fulfillment_writer_guard, 00350) - a write is denied unless
// app.fulfillment_writer is 'rpc' (set inside an RPC's own transaction) or
// 'migration' (the seed/fixture side door), so this route MUST go through the
// RPC rather than `.update()`.
//
// I11 (Wave F integration gap): the original S5 call site here guessed at a
// 3-arg signature (…, p_confirmed_at, p_actor) that never shipped — 00363
// landed with 2 args. Calling with the extra arg produced PGRST202
// ("Could not find the function ...") at runtime, a 500 that only the 42883
// branch below was catching. Fixed by matching the call to the real
// signature; the 42883/PGRST202 catch stays as a defensive safety net (not
// the primary path anymore) in case this RPC is ever renamed or dropped
// again — Postgres's "function does not exist" (42883) and PostgREST's
// schema-cache miss for the same condition (PGRST202) both turn into a
// clean, honest 501 rather than a raw stack trace.

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
      p_actor: actor,
    });
    if (error) {
      // 42883 = undefined_function (Postgres); PGRST202 = PostgREST's
      // schema-cache miss for the same underlying condition ("function does
      // not exist as far as this request could tell"). Both mean the RPC
      // isn't reachable — see the safety-net note above.
      if (
        error.code === '42883' ||
        error.code === 'PGRST202' ||
        /function .*fulfillment_confirm_appointment.* does not exist/i.test(error.message ?? '') ||
        /could not find the function .*fulfillment_confirm_appointment/i.test(error.message ?? '')
      ) {
        return NextResponse.json(
          {
            error:
              'appointment confirmation is not yet implemented at the RPC layer (schema gap - see BOH-DECISIONS I10/I11)',
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
