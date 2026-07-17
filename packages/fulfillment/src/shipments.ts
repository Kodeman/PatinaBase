// @patina/fulfillment — Shipment Board vocabulary (S5, spec §5.4).
//
// fulfillment_shipments (00350) rows ARE the board's rows — mode
// parcel|ltl|white_glove, manual tracking entry in v1 (schema webhook-ready),
// LTL/white_glove requiring a confirmed delivery appointment before the
// deliver flow, and an inspection-window countdown opened at POD time from the
// carrier/vendor profile's inspection_window_days (00353
// fulfillment_record_delivery: inspection_closes_at = now() +
// make_interval(days => window)).
//
// ⚠ RPC-layer gap (I10, reported for S6 — never worked around here):
// fulfillment_record_delivery (00353) does NOT check mode/appointment_confirmed_at
// before marking a shipment delivered — the LTL/white_glove appointment gate
// below is enforced at the APPLICATION layer only (this module +
// apps/admin-portal's shipment routes), not at the database layer. A direct
// RPC call from another server-side actor (a future edge function, a psql
// session) would bypass it. canDeliverShipment() is the single source of
// truth for that application-layer gate — every call site (the route, the
// row's disabled-button reason, the e2e negative assertion) reads from it so
// the gate can't drift between "why is Deliver disabled" and "why did the API
// 409". See apps/admin-portal/src/app/api/admin/fulfillment/shipments/ route
// headers for the full gap writeup and the RPC lines quoted.

import { fmtShipDate } from './transmission-log';

export type ShipmentMode = 'parcel' | 'ltl' | 'white_glove';

export const MODE_LABELS: Record<ShipmentMode, string> = {
  parcel: 'Parcel',
  ltl: 'LTL',
  white_glove: 'White Glove',
};

/** Display label for a shipment mode chip. Unknown modes echo back verbatim
 *  (defensive — the board never throws on a mode value the CHECK constraint
 *  hasn't caught up to). */
export function modeLabel(mode: ShipmentMode | string): string {
  return (MODE_LABELS as Record<string, string>)[mode] ?? mode;
}

/** True for the two freight modes that require an appointment before delivery
 *  (spec §5.4 "LTL/WG require appointment confirmation"). */
export function requiresAppointment(mode: ShipmentMode | string): boolean {
  return mode === 'ltl' || mode === 'white_glove';
}

// ─── Shipment Board row DTO (composed route, camelCase — S2/S3 idiom) ──────
// GET /api/admin/fulfillment/shipments composes this from fulfillment_shipments
// ⋈ fulfillment_vendor_pos ⋈ fulfillment_orders ⋈ vendors ⋈ fulfillment_vendor_po_lines
// ⋈ fulfillment_order_items — no dedicated view (S2's "composed, not migrated"
// precedent; avoids a migration this wave, which S6 owns per the wave brief).

export interface FulfillmentShipmentRow {
  id: string;
  poId: string;
  poNumber: string | null;
  orderId: string;
  orderNo: number;
  clientName: string;
  vendorId: string;
  vendorName: string | null;
  mode: ShipmentMode;
  carrier: string | null;
  tracking: string | null;
  appointmentConfirmedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  podR2Key: string | null;
  inspectionWindowDays: number | null;
  inspectionClosesAt: string | null;
  /** date 'YYYY-MM-DD' — the shipment's current expected arrival. NULL until an
   *  operator records a carrier update (no RPC exists yet to set this post-
   *  creation — see the gap note in the route header). */
  currentEta: string | null;
  /** date 'YYYY-MM-DD' — the "promised" ETA, sourced from the PO's
   *  committed_ship (the client-ETA basis set at ack time, per S3 I6). */
  committedShip: string | null;
  etaHistory: Array<Record<string, unknown>>;
  itemNames: string[];
}

/** A PO eligible to become a new shipment (status='acknowledged', the state
 *  fulfillment_record_shipment expects) — powers the board's "Add shipment"
 *  (manual tracking entry, v1) affordance. */
export interface FulfillmentShipmentEligiblePo {
  poId: string;
  poNumber: string | null;
  orderId: string;
  orderNo: number;
  clientName: string;
  vendorId: string;
  vendorName: string | null;
}

export interface FulfillmentShipmentsBoardDTO {
  shipments: FulfillmentShipmentRow[];
  eligiblePos: FulfillmentShipmentEligiblePo[];
}

// ─── Date-only ('YYYY-MM-DD') helpers ───────────────────────────────────────

function parseDateOnlyMs(value: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// ─── Slip (promised vs current ETA) ─────────────────────────────────────────

export interface ShipmentSlip {
  /** Mono display string — "SEP 10" on-time/unknown, "SEP 10 · +7" late,
   *  "SEP 10 · -2" early (spec/presentation §07 "promised vs current ETA in
   *  mono w/ terracotta slip delta"). */
  display: string;
  /** current − promised in days; null when either date is missing/unparsable. */
  deltaDays: number | null;
  /** True only when deltaDays > 0 — renders the delta terracotta. */
  slipped: boolean;
}

/**
 * The Shipment Board's promised-vs-current ETA figure. `promised` is the PO's
 * committed_ship; `current` is the shipment's current_eta. Mirrors the
 * presentation's worked example: formatSlip('2026-09-03', '2026-09-10') →
 * "SEP 10 · +7".
 */
export function formatSlip(promised: string | null, current: string | null): ShipmentSlip {
  if (!current) {
    return { display: promised ? fmtShipDate(promised) : '—', deltaDays: null, slipped: false };
  }
  const currentLabel = fmtShipDate(current);
  if (!promised) return { display: currentLabel, deltaDays: null, slipped: false };

  const p = parseDateOnlyMs(promised);
  const c = parseDateOnlyMs(current);
  if (Number.isNaN(p) || Number.isNaN(c)) {
    return { display: currentLabel, deltaDays: null, slipped: false };
  }
  const deltaDays = Math.round((c - p) / 86_400_000);
  if (deltaDays === 0) return { display: currentLabel, deltaDays: 0, slipped: false };
  const sign = deltaDays > 0 ? '+' : '';
  return { display: `${currentLabel} · ${sign}${deltaDays}`, deltaDays, slipped: deltaDays > 0 };
}

// ─── Inspection-window countdown (the DeadlineClock's data) ────────────────

export interface InspectionCountdown {
  isOpen: boolean;
  /** Whole days remaining, ceiling-rounded (a window closing in 6 hours reads
   *  "1 DAY", not "0 DAYS" — never understate urgency). ≤0 once closed. */
  daysRemaining: number;
  /** "3 DAYS" / "1 DAY" / "CLOSED" — the DeadlineClock's loud mono text. */
  label: string;
  /** I5: the DeadlineClock's terracotta threshold — open AND ≤2 days left. */
  terracotta: boolean;
}

export function inspectionCountdown(closesAt: string | null, nowMs: number): InspectionCountdown | null {
  if (!closesAt) return null;
  const closesMs = new Date(closesAt).getTime();
  if (Number.isNaN(closesMs)) return null;
  const daysRemaining = Math.ceil((closesMs - nowMs) / 86_400_000);
  const isOpen = daysRemaining > 0;
  const label = !isOpen ? 'CLOSED' : daysRemaining === 1 ? '1 DAY' : `${daysRemaining} DAYS`;
  return { isOpen, daysRemaining, label, terracotta: isOpen && daysRemaining <= 2 };
}

/** True only for a shipment with a recorded delivery AND a still-open
 *  inspection window — the board's pin-to-top condition. */
export function hasOpenInspectionWindow(
  row: { deliveredAt: string | null; inspectionClosesAt: string | null },
  nowMs: number,
): boolean {
  if (!row.deliveredAt || !row.inspectionClosesAt) return false;
  const c = inspectionCountdown(row.inspectionClosesAt, nowMs);
  return !!c && c.isOpen;
}

// ─── Deliver gate (LTL/white_glove appointment requirement) ────────────────

export interface ShipmentDeliverGate {
  allowed: boolean;
  reason: 'already_delivered' | 'appointment_required' | null;
  message: string | null;
}

/**
 * The single source of truth for "can this shipment be marked delivered
 * (with or without a POD)". Spec §5.4 + package S5 accepts-when: "an LTL
 * shipment cannot reach 'delivered' flow without a confirmed appointment."
 * Enforced here (application layer) because fulfillment_record_delivery
 * (00353) does not check this itself — see the module header gap note.
 */
export function canDeliverShipment(shipment: {
  mode: ShipmentMode | string;
  appointmentConfirmedAt: string | null;
  deliveredAt: string | null;
}): ShipmentDeliverGate {
  if (shipment.deliveredAt) {
    return {
      allowed: false,
      reason: 'already_delivered',
      message: 'This shipment is already marked delivered.',
    };
  }
  if (requiresAppointment(shipment.mode) && !shipment.appointmentConfirmedAt) {
    return {
      allowed: false,
      reason: 'appointment_required',
      message: `${modeLabel(shipment.mode)} shipments require a confirmed delivery appointment before they can be marked delivered.`,
    };
  }
  return { allowed: true, reason: null, message: null };
}

// ─── Status sentence ─────────────────────────────────────────────────────────

export function describeShipmentStatus(
  row: {
    mode: ShipmentMode | string;
    carrier: string | null;
    deliveredAt: string | null;
    appointmentConfirmedAt: string | null;
    inspectionClosesAt: string | null;
  },
  nowMs: number,
): string {
  if (row.deliveredAt) {
    const win = inspectionCountdown(row.inspectionClosesAt, nowMs);
    if (win && win.isOpen) {
      const left = win.daysRemaining === 1 ? '1 day' : `${win.daysRemaining} days`;
      return `Delivered — inspection window open, ${left} left`;
    }
    if (row.inspectionClosesAt) return 'Delivered — inspection window closed';
    return 'Delivered';
  }
  if (requiresAppointment(row.mode) && !row.appointmentConfirmedAt) {
    return 'In transit — awaiting delivery appointment';
  }
  return row.carrier ? `In transit via ${row.carrier}` : 'In transit';
}

// ─── Board sort (spec: open inspection windows first, then by current ETA) ──

/**
 * The Shipment Board's row order (package S5 scope: "sorted open inspection
 * windows first (countdown rows pinned top), then by current ETA"). Pure and
 * `nowMs`-parameterized for determinism in tests; callers pass `Date.now()`.
 */
export function sortShipmentBoard<
  T extends {
    deliveredAt: string | null;
    inspectionClosesAt: string | null;
    currentEta: string | null;
    committedShip: string | null;
  },
>(rows: T[], nowMs: number): T[] {
  const withMeta = rows.map((row) => {
    const closesMs = row.inspectionClosesAt ? new Date(row.inspectionClosesAt).getTime() : Infinity;
    const etaSource = row.currentEta ?? row.committedShip;
    const etaMs = etaSource
      ? ((): number => {
          const p = parseDateOnlyMs(etaSource);
          return Number.isNaN(p) ? Infinity : p;
        })()
      : Infinity;
    return { row, open: hasOpenInspectionWindow(row, nowMs), closesMs, etaMs };
  });

  const openRows = withMeta.filter((m) => m.open).sort((a, b) => a.closesMs - b.closesMs);
  const restRows = withMeta.filter((m) => !m.open).sort((a, b) => a.etaMs - b.etaMs);
  return [...openRows, ...restRows].map((m) => m.row);
}

// ─── Item summary (row's "client/item/PO refs" segment) ────────────────────

export function formatItemSummary(itemNames: string[]): string {
  if (itemNames.length === 0) return 'No items';
  if (itemNames.length === 1) return itemNames[0];
  return `${itemNames[0]} +${itemNames.length - 1} more`;
}
