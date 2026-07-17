import { NextRequest, NextResponse } from 'next/server';
import { badRequest, getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';
import { CLIENT_NOTIFICATION_TRANSITIONS, type ClientNotificationTransition } from '@patina/fulfillment';

// POST /api/admin/fulfillment/notifications/draft — render + persist a
// drafted client note (S4, spec §6). Body: { orderId, transition }.
//
// THIS ROUTE, not the edge function, is where vendor/PO/cost data gets
// redacted to a client-safe context — it has full admin access (order items,
// PO committed-ship dates, shipment ETAs/modes) and is responsible for
// stripping everything except item names/qty, an ETA, a shipping mode, and
// (for eta_change) a pre-approved vendor-free note before calling
// fulfillment-notify. See supabase/functions/_shared/fulfillment-templates.ts's
// header for why the edge function itself can't leak this even if this route
// got it wrong — ClientSafeOrderProjection has no field to carry it. S3's PO
// composer/ack-drafting flow is meant to point here once this lands (S4 brief).
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;
  const actor = auth.user.email ?? auth.user.id;

  let body: { orderId?: string; transition?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }
  const { orderId } = body;
  const transition = body.transition as ClientNotificationTransition | undefined;
  if (!orderId) return badRequest('orderId is required');
  if (!transition || !CLIENT_NOTIFICATION_TRANSITIONS.includes(transition)) {
    return badRequest(`transition must be one of: ${CLIENT_NOTIFICATION_TRANSITIONS.join(', ')}`);
  }

  try {
    // ── item names/qty (client-safe: what they bought, not what it cost or
    // who supplies it) ──────────────────────────────────────────────────────
    const { data: items, error: itemsErr } = await db
      .from('fulfillment_order_items')
      .select('item_name, qty, line_state')
      .eq('order_id', orderId)
      .neq('line_state', 'cancelled');
    if (itemsErr) throw itemsErr;

    // ── ETA + shipping mode, composed from PO/shipment dates — dates and a
    // mode enum are client-safe; the PO/vendor rows themselves never leave
    // this route ─────────────────────────────────────────────────────────────
    const { data: pos, error: posErr } = await db
      .from('fulfillment_vendor_pos')
      .select('id, committed_ship')
      .eq('order_id', orderId);
    if (posErr) throw posErr;
    const poIds = (pos ?? []).map((p: { id: string }) => p.id);

    let shipments: Array<{ mode: string; current_eta: string | null; eta_history: unknown }> = [];
    if (poIds.length > 0) {
      const { data, error: shipErr } = await db
        .from('fulfillment_shipments')
        .select('mode, current_eta, eta_history')
        .in('po_id', poIds);
      if (shipErr) throw shipErr;
      shipments = data ?? [];
    }

    const committedShipDates = (pos ?? [])
      .map((p: { committed_ship: string | null }) => p.committed_ship)
      .filter((d: string | null): d is string => !!d)
      .sort();
    const shipmentEtas = shipments
      .map((s) => s.current_eta)
      .filter((d): d is string => !!d)
      .sort();
    const freightModes = shipments.map((s) => s.mode);
    const shippingMode: 'parcel' | 'ltl' | 'white_glove' | null =
      freightModes.length === 0
        ? null
        : (freightModes.find((m) => m === 'ltl' || m === 'white_glove') as 'ltl' | 'white_glove' | undefined) ??
          'parcel';

    let eta: string | null = null;
    let previousEta: string | null = null;
    let exceptionNote: string | null = null;
    if (transition === 'in_production') {
      eta = committedShipDates[0] ?? null;
    } else if (transition === 'shipped' || transition === 'delivered') {
      eta = shipmentEtas[0] ?? null;
    } else if (transition === 'eta_change') {
      eta = shipmentEtas[0] ?? committedShipDates[0] ?? null;
      // Pull the most recent PRIOR estimate from eta_history (client-safe:
      // it's just a list of dates this order previously carried) rather than
      // any raw exception evidence, which may name a vendor.
      const historyDates = shipments
        .flatMap((s) => (Array.isArray(s.eta_history) ? (s.eta_history as unknown[]) : []))
        .filter((d): d is string => typeof d === 'string')
        .sort();
      previousEta = historyDates.length > 0 ? historyDates[historyDates.length - 1] : null;
      exceptionNote =
        "We're working through a delay on part of your order and will update you as soon as we have a firm new date.";
    }

    const invokeArgs = {
      action: 'draft',
      order_id: orderId,
      transition,
      context: {
        items: (items ?? []).map((i: { item_name: string; qty: number }) => ({ name: i.item_name, qty: i.qty })),
        eta,
        previousEta,
        shippingMode,
        exceptionNote,
      },
      actor,
    };

    const { data, error } = await db.functions.invoke('fulfillment-notify', { body: invokeArgs });
    if (error) throw error;
    if (data && (data as { success?: boolean }).success === false) {
      throw new Error((data as { error?: string }).error ?? 'fulfillment-notify draft failed');
    }

    return NextResponse.json({ data });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to draft client note');
  }
}
