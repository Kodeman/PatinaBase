import { canDeliverShipment, type ShipmentDeliverGate } from '@patina/fulfillment';

// Shared server-side gate for the Shipment Board's "pod" and "deliver" routes
// (S5, spec §5.4). Both routes end up calling the SAME RPC
// (fulfillment_record_delivery, 00353) — a POD upload IS a delivery
// confirmation with evidence, a bare "deliver" is one without. Since that RPC
// does not itself check mode/appointment_confirmed_at (see the shipments/
// route.ts header for the full gap writeup, filed as I10 for S6), this
// APPLICATION-layer check is the only thing standing between an LTL/white_glove
// shipment and a premature "delivered" — every route that can reach
// fulfillment_record_delivery must call this first.

export interface ShipmentGateRow {
  id: string;
  poId: string;
  mode: string;
  appointmentConfirmedAt: string | null;
  deliveredAt: string | null;
  inspectionWindowDays: number | null;
}

/** Loads the shipment's gate-relevant columns, or null if it doesn't exist. */
export async function loadShipmentForGate(db: any, shipmentId: string): Promise<ShipmentGateRow | null> {
  const { data, error } = await db
    .from('fulfillment_shipments')
    .select('id, po_id, mode, appointment_confirmed_at, delivered_at, inspection_window_days')
    .eq('id', shipmentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    poId: data.po_id,
    mode: data.mode,
    appointmentConfirmedAt: data.appointment_confirmed_at ?? null,
    deliveredAt: data.delivered_at ?? null,
    inspectionWindowDays: data.inspection_window_days ?? null,
  };
}

/** Re-exported for route call sites that already have the row and just want
 *  the verdict (avoids a second DB round trip). */
export function gateForDelivery(row: {
  mode: string;
  appointmentConfirmedAt: string | null;
  deliveredAt: string | null;
}): ShipmentDeliverGate {
  return canDeliverShipment(row);
}
