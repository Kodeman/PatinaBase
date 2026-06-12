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
