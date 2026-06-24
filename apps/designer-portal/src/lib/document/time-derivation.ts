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

/**
 * Quiet running readout — the at-rest spine/mobile-bar clock. Minute
 * resolution so it does NOT re-count every second: a live mm:ss in the corner
 * pulled the eye off the text box being typed in. Matches the drawer's
 * "in hand today" granularity; the precise mm:ss survives only where the
 * timer is opened on purpose (the mobile timer sheet). "under a min" keeps a
 * freshly-held document from reading a dead "0 min".
 */
export function fmtElapsedQuiet(totalSeconds: number): string {
  const m = Math.floor(Math.max(0, totalSeconds) / 60);
  if (m < 1) return 'under a min';
  return fmtMinutes(m);
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
  /** D10 idle annotation: quiet seconds inside the entry — annotation only,
   *  NEVER subtracted from the logged number. 0 when nothing was idle. */
  idleSeconds: number;
}

/** D10: a visible note when the logged number left the raw truth behind. */
export function isAdjusted(offer: Pick<LogOffer, 'rawSeconds'>, loggedMinutes: number): boolean {
  return Math.abs(loggedMinutes * 60 - offer.rawSeconds) >= 60;
}

/**
 * D10 idle detection — provisional threshold (Session-02 async Q11). A gap
 * between activity pings longer than the threshold counts as idle; idle is
 * ANNOTATED on the offer, never trimmed from the number. The designer
 * decides whether the quiet minutes were work (sketching, a call) or not.
 */
// FINAL (L3 — Leah's number, honored literally). Watch item: if week-one
// annotations exceed ~⅓ of entries or go ignored, revisit with data.
export const IDLE_THRESHOLD_SECONDS = 1 * 60;

/** Sum the idle gaps in a sorted list of activity-ping timestamps (ms). */
export function idleSecondsFromPings(pingsMs: number[], thresholdSeconds = IDLE_THRESHOLD_SECONDS): number {
  if (pingsMs.length < 2) return 0;
  const sorted = [...pingsMs].sort((a, b) => a - b);
  let idle = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = (sorted[i] - sorted[i - 1]) / 1000;
    if (gap > thresholdSeconds) idle += gap;
  }
  return Math.round(idle);
}

/**
 * R64 — the runaway/abandonment bound. A SINGLE contiguous idle gap this long
 * means the timer was abandoned (a tab left open overnight, a session that
 * never closed) rather than sketched-through. Provisional 30 min — Leah-facing,
 * mirror the IDLE_THRESHOLD "watch with data" posture: revisit if it bites
 * normal long-but-active sessions (a single uninterrupted sketch).
 */
// ⚠ PROVISIONAL (Leah-facing, R64). Watch item: flag to design if a real
// abandonment slips under 30 min, or a genuine deep-work block trips it.
export const RUNAWAY_IDLE_SECONDS = 30 * 60;

/** The longest SINGLE contiguous idle gap (seconds) in a list of ping ms. */
export function longestIdleGapSeconds(pingsMs: number[]): number {
  if (pingsMs.length < 2) return 0;
  const sorted = [...pingsMs].sort((a, b) => a - b);
  let longest = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = (sorted[i] - sorted[i - 1]) / 1000;
    if (gap > longest) longest = gap;
  }
  return Math.round(longest);
}

/**
 * R64 — the proposed log duration with the abandonment guard.
 *
 * Normal entries (no single gap ≥ RUNAWAY_IDLE_SECONDS): keep the shipped D10
 * behavior — propose the full raw minutes, idle ANNOTATED, never trimmed. The
 * designer decides whether quiet minutes were work.
 *
 * Abandoned entries (a single contiguous idle gap ≥ RUNAWAY_IDLE_SECONDS):
 * the timer ran unattended, so proposing the full elapsed would be a lie.
 * Propose the ACTIVE duration (raw − idle); idle is still annotated, just not
 * summed into the suggested number. This is an EXTENSION of D10, not a reversal
 * (R64): only a runaway gap trips it. Min 1 minute.
 */
export function suggestedMinutes(args: {
  rawSeconds: number;
  idleSeconds: number;
  longestIdleGapSeconds: number;
}): number {
  const { rawSeconds, idleSeconds } = args;
  const abandoned = args.longestIdleGapSeconds >= RUNAWAY_IDLE_SECONDS;
  const seconds = abandoned ? Math.max(0, rawSeconds - idleSeconds) : rawSeconds;
  return Math.max(1, Math.round(seconds / 60));
}

/** The offer's idle annotation line, or null when nothing was idle. */
export function idleAnnotation(idleSeconds: number): string | null {
  if (idleSeconds < IDLE_THRESHOLD_SECONDS) return null;
  const mins = Math.round(idleSeconds / 60);
  return `includes ~${mins} quiet ${mins === 1 ? 'minute' : 'minutes'}`;
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
