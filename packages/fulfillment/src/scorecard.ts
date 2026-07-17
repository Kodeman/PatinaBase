// @patina/fulfillment — vendor scorecard computation (S4, spec §7).
//
// Pure aggregation over already-fetched rows — the API route
// (apps/admin-portal/.../vendors/[vendorId]/route.ts) is a service-role
// client, so it fetches the vendor's fulfillment_vendor_pos/_shipments/
// _exceptions/_order_items rows directly (all writer-guarded BOH tables grant
// service_role ALL, 00350/00351) and hands them here. No new view or RPC —
// per the S4 brief, a genuine schema need STOPS and hands off to S3; this
// stayed a route-layer computation the whole way.
//
// "n shown" (spec §7) is the PO count in the trailing window — every rate
// below is null (not 0, not NaN) when its own denominator is empty, so the UI
// can render "—" / an EmptyState instead of a misleadingly precise 0%.

import type { VendorScorecard } from './types';

export interface ScorecardPoRow {
  id: string;
  transmitted_at: string | null;
  acked_at: string | null;
  committed_ship: string | null;
}
export interface ScorecardShipmentRow {
  po_id: string;
  shipped_at: string | null;
}
export interface ScorecardExceptionRow {
  po_id: string | null;
  type: string;
  cause_code: string | null;
}
export interface ScorecardInputs {
  pos: ScorecardPoRow[];
  shipments: ScorecardShipmentRow[];
  exceptions: ScorecardExceptionRow[];
  /** Count of this vendor's order line items in the window (fill-rate denominator). */
  orderItemCount: number;
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function computeVendorScorecard(
  vendorId: string,
  windowDays: number,
  data: ScorecardInputs,
): VendorScorecard {
  const n = data.pos.length;

  // Median ack time (transmitted -> acked), hours.
  const ackHours = data.pos
    .filter((p) => p.transmitted_at && p.acked_at)
    .map((p) => (new Date(p.acked_at as string).getTime() - new Date(p.transmitted_at as string).getTime()) / 3_600_000)
    .filter((h) => h >= 0)
    .sort((a, b) => a - b);
  const medianAckHours = ackHours.length > 0 ? Math.round(median(ackHours) * 100) / 100 : null;

  // On-time ship rate: shipped_at date <= committed_ship date, among POs with both.
  const shippedAtByPo = new Map<string, string>();
  for (const s of data.shipments) {
    if (s.shipped_at) shippedAtByPo.set(s.po_id, s.shipped_at);
  }
  const withBoth = data.pos.filter((p) => p.committed_ship && shippedAtByPo.has(p.id));
  const onTime = withBoth.filter((p) => {
    const shippedAt = new Date(shippedAtByPo.get(p.id) as string);
    const committedByEndOfDay = new Date(`${p.committed_ship}T23:59:59Z`);
    return shippedAt.getTime() <= committedByEndOfDay.getTime();
  });
  const onTimeShipRate = withBoth.length > 0 ? Math.round((onTime.length / withBoth.length) * 1000) / 1000 : null;

  // Damage rate: damage-type exceptions per PO.
  const damageCount = data.exceptions.filter((e) => e.type === 'damage').length;
  const damageRate = n > 0 ? Math.round((damageCount / n) * 1000) / 1000 : null;

  // Fill rate: 1 - (backorder/substitution exceptions per order item).
  const fillIssueCount = data.exceptions.filter((e) => e.type === 'backorder' || e.type === 'substitution').length;
  const fillRate =
    data.orderItemCount > 0
      ? Math.round(Math.max(0, 1 - fillIssueCount / data.orderItemCount) * 1000) / 1000
      : null;

  // Exception rate by cause (cause_code, falling back to the exception type
  // when no cause_code has been recorded yet — e.g. a still-open exception).
  const exceptionRateByCause: Record<string, number> = {};
  if (n > 0) {
    for (const e of data.exceptions) {
      const cause = e.cause_code ?? e.type;
      exceptionRateByCause[cause] = Math.round(((exceptionRateByCause[cause] ?? 0) + 1 / n) * 1000) / 1000;
    }
  }

  return {
    vendorId,
    windowDays,
    n,
    medianAckHours,
    onTimeShipRate,
    damageRate,
    fillRate,
    exceptionRateByCause,
  };
}

export function emptyVendorScorecard(vendorId: string, windowDays: number): VendorScorecard {
  return {
    vendorId,
    windowDays,
    n: 0,
    medianAckHours: null,
    onTimeShipRate: null,
    damageRate: null,
    fillRate: null,
    exceptionRateByCause: {},
  };
}
