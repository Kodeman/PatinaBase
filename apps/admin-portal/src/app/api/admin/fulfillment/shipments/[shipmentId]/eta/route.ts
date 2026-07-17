import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, badRequest, notFound, serverError } from '@/lib/supabase-admin';
import { loadShipmentForGate } from '@/lib/fulfillment-shipments';

// POST /api/admin/fulfillment/shipments/[shipmentId]/eta — record an
// operator-observed ETA change (R4.5, BOH-DECISIONS). Body:
// { currentEta: 'YYYY-MM-DD', reason: string } — BOTH required; reason must
// be non-empty (it's the only thing that makes eta_history worth reading
// later).
//
// RPC: public.fulfillment_update_shipment_eta(p_shipment_id uuid,
// p_current_eta date, p_reason text, p_actor text) — shipped in 00363 (S6)
// but left API-only (I11, the same "wave F integration gap" family as the
// appointment route): no operator caller existed for it, so current_eta
// could never move in production and the board's SlipFigure/formatSlip
// rendering (shipment-row.tsx) was dead weight — nothing could ever produce
// a slipped ETA outside a fixture's GUC side door. This route is the FIRST
// production caller; get the argument names/order wrong and this 404s the
// same way appointment's I11 regression did (PGRST202 with no honest
// fallback then), so the jest suite in __tests__/route.test.ts pins the
// exact 4-arg shape.
//
// The RPC itself sets current_eta, appends {at, from, to, reason} to
// eta_history, and writes shipment.eta_changed — see 00363's header for the
// full body.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shipmentId: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient as any;
  const { shipmentId } = await params;
  const actor = auth.user.email ?? auth.user.id;

  let body: { currentEta?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be JSON with { currentEta, reason }');
  }

  const currentEta = body.currentEta;
  const reason = (body.reason ?? '').trim();

  if (!currentEta || !/^\d{4}-\d{2}-\d{2}$/.test(currentEta) || Number.isNaN(new Date(currentEta).getTime())) {
    return badRequest('currentEta must be a valid YYYY-MM-DD date');
  }
  if (reason === '') {
    return badRequest('reason is required');
  }

  try {
    const shipment = await loadShipmentForGate(db, shipmentId);
    if (!shipment) return notFound('Shipment not found');

    const { error } = await db.rpc('fulfillment_update_shipment_eta', {
      p_shipment_id: shipmentId,
      p_current_eta: currentEta,
      p_reason: reason,
      p_actor: actor,
    });
    if (error) {
      // Unreachable in normal operation — the pre-check above already 404s a
      // missing shipment — but the RPC also RAISEs on one, so this is a
      // defensive backstop against a TOCTOU delete between the two calls.
      if (/shipment .* not found/i.test(error.message ?? '')) return notFound('Shipment not found');
      throw error;
    }

    return NextResponse.json({ data: { ok: true, currentEta } });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to record the ETA change');
  }
}
