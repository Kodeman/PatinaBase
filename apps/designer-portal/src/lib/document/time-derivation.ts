/**
 * Time derivation — spec v1.2 §9, rulings R4/D10/D11.
 *
 * Pure logic for the document time system: elapsed formatting, the
 * source-following close-out rule, the log-offer payload, and the
 * "in hand today" aggregation. Dependency-free (the Jest ESM trap).
 */

export type TimeSource = 'timer_auto' | 'timer_manual' | 'manual_entry';

/** R4 v1 activity vocabulary — the ONE attribution the designer is asked. */
export const ACTIVITIES: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'design', label: 'Design' },
  { key: 'sourcing', label: 'Sourcing' },
  { key: 'client', label: 'Client' },
  { key: 'site_visit', label: 'Site visit' },
  { key: 'admin', label: 'Admin' },
];

export function activityLabel(key: string | null | undefined): string {
  return ACTIVITIES.find((a) => a.key === key)?.label ?? '—';
}

/** Spine clock: mm:ss under an hour, h:mm:ss past it. */
export function fmtElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const two = (n: number) => String(n).padStart(2, '0');
  if (s < 3600) return `${two(Math.floor(s / 60))}:${two(s % 60)}`;
  return `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
}

/** Human duration for offers and readouts: "47 min", "2h 05m". */
export function fmtMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export type CloseOut =
  | { action: 'discard_silently' }
  | { action: 'offer'; durationMinutes: number };

/**
 * R4 — the sub-60s rule follows start mode: `timer_auto` (the document
 * picked up the pen by itself, D11) discards silently; `timer_manual`
 * (the designer pressed start) keeps the shipped round-up-to-1-minute.
 */
export function closeOutTimer(source: TimeSource, elapsedSeconds: number): CloseOut {
  if (source === 'timer_auto' && elapsedSeconds < 60) return { action: 'discard_silently' };
  return { action: 'offer', durationMinutes: Math.max(1, Math.round(elapsedSeconds / 60)) };
}

/** A stopped timer waiting in the log strip (rides across navigation). */
export interface LogOffer {
  entryId: string;
  projectId: string;
  projectName: string;
  /** Truth at stop — persisted to raw_seconds whatever the adjustment. */
  rawSeconds: number;
  /** Pre-filled, designer-adjustable up or down (D10). */
  suggestedMinutes: number;
  /** Auto-filled from the document's current phase at stop (R4). */
  phaseKey: string | null;
  source: TimeSource;
}

/** D10: a visible note when the logged number left the raw truth behind. */
export function isAdjusted(offer: Pick<LogOffer, 'rawSeconds'>, loggedMinutes: number): boolean {
  return Math.abs(loggedMinutes * 60 - offer.rawSeconds) >= 60;
}

/** "In hand today" — completed minutes today plus the live timer's elapsed. */
export function inHandTodayMinutes(
  todaysCompletedMinutes: number,
  runningStartedAt: string | null,
  now: Date,
): number {
  const running = runningStartedAt
    ? Math.max(0, (now.getTime() - new Date(runningStartedAt).getTime()) / 60_000)
    : 0;
  return Math.round(todaysCompletedMinutes + running);
}

/** Local-midnight ISO bound for "today" queries. */
export function todayStartISO(now: Date): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
