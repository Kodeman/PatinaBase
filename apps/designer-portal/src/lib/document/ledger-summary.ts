/**
 * Ledger front-matter (R5: "Insights distributes as each ledger's
 * front-matter summary page · Orders: procurement throughput · Hours:
 * utilization. No dashboard book."). Pure aggregations over the rows the
 * ledger already holds — the opening summary of the book, not a dashboard.
 * Dependency-free (the Jest ESM trap).
 */

const DAY_MS = 86_400_000;

export interface ThroughputStat {
  label: string;
  value: string;
}

interface POForThroughput {
  status: string;
  confirmed_eta: string | null;
  sent_at: string | null;
  acknowledged_at: string | null;
}

const SETTLED_PO = new Set(['delivered', 'cancelled']);

/** Orders front-matter: procurement throughput across every engagement. */
export function ordersThroughput(
  pos: POForThroughput[],
  now: Date = new Date(),
): ThroughputStat[] {
  const live = pos.filter((p) => !SETTLED_PO.has(p.status));
  const weekEnd = now.getTime() + 7 * DAY_MS;
  const arriving = live.filter((p) => {
    if (!p.confirmed_eta) return false;
    const eta = new Date(`${p.confirmed_eta}T00:00:00`).getTime();
    return eta >= now.getTime() && eta <= weekEnd;
  }).length;
  const unsent = pos.filter((p) => p.status === 'draft' && !p.sent_at).length;
  const unacked = live.filter((p) => p.sent_at && !p.acknowledged_at).length;

  const stats: ThroughputStat[] = [{ label: 'Open', value: String(live.length) }];
  if (arriving > 0) stats.push({ label: 'Arriving this week', value: String(arriving) });
  if (unsent > 0) stats.push({ label: 'Unsent', value: String(unsent) });
  if (unacked > 0) stats.push({ label: 'No ack', value: String(unacked) });
  return stats;
}

interface POForReceiving {
  id: string;
  status: string;
  confirmed_eta: string | null;
}

interface InspectionForReceiving {
  purchase_order_id: string;
  outcome: string;
}

/** Receiving front-matter (R28, the I23 precedent): arriving · awaiting
 *  log · claims · 30-day pass rate. Pure aggregation over rows the book
 *  already holds; inspections are expected pre-filtered to the 30-day
 *  window (the page's query owns the date math). */
export function receivingFrontMatter(
  pos: POForReceiving[],
  inspections: InspectionForReceiving[],
  openClaimCount: number,
  now: Date = new Date(),
): ThroughputStat[] {
  const weekEnd = now.getTime() + 7 * DAY_MS;
  const arriving = pos.filter((p) => {
    if (!p.confirmed_eta) return false;
    if (p.status !== 'in_production' && p.status !== 'shipped') return false;
    const eta = new Date(`${p.confirmed_eta.slice(0, 10)}T00:00:00`).getTime();
    return eta >= now.getTime() - DAY_MS && eta <= weekEnd;
  }).length;

  const inspectedPoIds = new Set(inspections.map((i) => i.purchase_order_id));
  const awaitingLog = pos.filter(
    (p) => p.status === 'delivered' && !inspectedPoIds.has(p.id),
  ).length;

  const passRate =
    inspections.length > 0
      ? Math.round(
          (inspections.filter((i) => i.outcome === 'clean').length / inspections.length) * 100,
        )
      : null;

  const stats: ThroughputStat[] = [
    { label: 'Arriving', value: String(arriving) },
    { label: 'Awaiting log', value: String(awaitingLog) },
    { label: 'Claims', value: String(openClaimCount) },
  ];
  if (passRate !== null) stats.push({ label: '30-day pass', value: `${passRate}%` });
  return stats;
}

interface EntryForUtilization {
  duration_minutes: number | null;
  billable?: boolean | null;
}

export interface Utilization {
  totalMinutes: number;
  billableMinutes: number;
  /** Billable share, 0–100; null when nothing is logged. */
  billablePct: number | null;
}

/** Hours front-matter: utilization — logged time and its billable share. */
export function hoursUtilization(entries: EntryForUtilization[]): Utilization {
  let total = 0;
  let billable = 0;
  for (const e of entries) {
    const m = e.duration_minutes ?? 0;
    total += m;
    if (e.billable !== false) billable += m; // default-billable, like the entry default
  }
  return {
    totalMinutes: total,
    billableMinutes: billable,
    billablePct: total > 0 ? Math.round((billable / total) * 100) : null,
  };
}
