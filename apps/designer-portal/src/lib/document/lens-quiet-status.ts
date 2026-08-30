/**
 * What a quiet stop's head SAYS — W4-R1, the design lead's print contract.
 *
 * A quiet stop prints its `RegionHead` and nothing else: the name, its own
 * status line, one leader act, and one sr-only line. The status line IS the
 * count line — there is no second paragraph and no uppercase count strip. So
 * the six builders here are the six status strings a `RegionHead` takes through
 * its existing `status` prop while the lens has not reached the region, and
 * `quietStateSentence` is the sr-only line that stands under it.
 *
 * They live here rather than in each region because the same sentence must not
 * be spelled six times, and rather than in `lens-ladder-derivation.ts` because
 * the rail prints a DIFFERENT register of the same facts at a different tier
 * (OD-14: the rail's schedule line keeps the weekday, `Install Tue Sep 15`;
 * the paper's drops it, `Install Sep 19 · 3 weeks out`). Two printings, two
 * contracts, one set of facts — which the callers supply.
 *
 * The missing-fact rule, from W4-R1: a segment whose fact is absent is dropped
 * WITH its separator; when no fact exists at all the line is `Nothing yet`, or
 * `Not known yet` where the fact is unknowable on this spread. Never a
 * placeholder, never a dash, and a number never softens.
 */

import { LENS_COUNT_MAX_CHARS } from './lens-constants';

export const QUIET_NOTHING_YET = 'Nothing yet';
export const QUIET_NOT_KNOWN_YET = 'Not known yet';

/**
 * Join the segments that have a fact behind them, inside OD-3's cap.
 *
 * W4-C23: the cap is a length, not a cut. `slice(0, 40)` can land inside a word
 * or leave a trailing `·`, which is not a shorter sentence but a broken one, so
 * whole `·`-separated segments come off the end instead. A single segment that
 * is over on its own is kept whole — a truncated fact is a wrong fact.
 */
function statusLine(
  parts: readonly (string | null | false)[],
  fallback: string = QUIET_NOTHING_YET,
): string {
  const kept = parts.filter(Boolean) as string[];
  if (kept.length === 0) return fallback;
  while (kept.length > 1 && kept.join(' · ').length > LENS_COUNT_MAX_CHARS) {
    kept.pop();
  }
  return kept.join(' · ');
}

export interface ApprovalsQuietFacts {
  /** Unsettled and NOT overdue — the two counts are disjoint, as the rail's own
   *  facts are (`page.tsx` passes `unsettled − overdue`). */
  awaiting: number;
  overdue: number;
  /** Days the OLDEST overdue item has stood. */
  overdueDays: number | null;
}

export function approvalsQuietStatus({
  awaiting,
  overdue,
  overdueDays,
}: ApprovalsQuietFacts): string {
  // W4-R1: the day-count prints when exactly ONE item is overdue and drops
  // when the count is plural — `1 overdue 6d`, but `2 overdue`.
  const overdueWords =
    overdue === 1 && overdueDays != null && overdueDays > 0
      ? `1 overdue ${overdueDays}d`
      : overdue > 0
        ? `${overdue} overdue`
        : null;
  return statusLine([
    awaiting > 0 ? `${awaiting} awaiting the client` : null,
    overdueWords,
  ]);
}

export interface ScheduleQuietFacts {
  /** The install phase's start, ISO. Phases never print on this line (W4-R1). */
  installStart: string | null;
  now?: Date;
}

/** Bare DATE columns parse as LOCAL midnight or the printed day slips back one
 *  in a negative-offset timezone. */
const asLocalDate = (iso: string) =>
  new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso);

const DAY_MS = 86_400_000;

function calendarDaysUntil(then: Date, now: Date): number {
  const midnight = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((midnight(then) - midnight(now)) / DAY_MS);
}

export function scheduleQuietStatus({
  installStart,
  now = new Date(),
}: ScheduleQuietFacts): string {
  if (!installStart) return QUIET_NOTHING_YET;
  const day = asLocalDate(installStart);
  if (Number.isNaN(day.getTime())) return QUIET_NOT_KNOWN_YET;
  // W4-R1 drops the weekday the rail's count line keeps: the paper prints one
  // date form, `Install Sep 19`.
  const printed = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(day);
  const days = calendarDaysUntil(day, now);
  if (days < 0) return `Installed ${printed}`;
  const tail =
    days === 0
      ? 'today'
      : days === 1
        ? 'tomorrow'
        : days < 14
          ? `${days} days out`
          : `${Math.round(days / 7)} ${Math.round(days / 7) === 1 ? 'week' : 'weeks'} out`;
  return statusLine([`Install ${printed}`, tail]);
}

export interface PiecesQuietFacts {
  total: number;
  rooms: number;
  damaged: number;
}

export function piecesQuietStatus({
  total,
  rooms,
  damaged,
}: PiecesQuietFacts): string {
  if (total === 0) return QUIET_NOTHING_YET;
  return statusLine([
    `${total} ${total === 1 ? 'line' : 'lines'}`,
    rooms > 0 ? `${rooms} ${rooms === 1 ? 'room' : 'rooms'}` : null,
    damaged > 0 ? `${damaged} damaged` : null,
  ]);
}

export interface MoneyQuietFacts {
  outCents: number | null;
  notDrawnCents: number | null;
  /** `money()` from `project-commerce` — passed in so this module stays free of
   *  the commerce layer. */
  money: (cents: number) => string;
}

export function moneyQuietStatus({
  outCents,
  notDrawnCents,
  money,
}: MoneyQuietFacts): string {
  const out = outCents ?? 0;
  const notDrawn = notDrawnCents ?? 0;
  return statusLine([
    out > 0 ? `${money(out)} out` : null,
    notDrawn > 0 ? `${money(notDrawn)} not drawn` : null,
  ]);
}

export interface CareQuietFacts {
  closed: number;
  total: number;
}

export function careQuietStatus({ closed, total }: CareQuietFacts): string {
  if (total === 0) return QUIET_NOTHING_YET;
  return `${closed} of ${total} closed out`;
}

export function recordQuietStatus({ complete }: { complete: number }): string {
  if (complete === 0) return QUIET_NOTHING_YET;
  return `${complete} complete`;
}

/**
 * The sr-only line under a quiet head — W4-R1's fixed form:
 * `<the status line's FIRST segment> · not yet on the paper · press <Name> on
 * the index to open`. The first segment, never the whole status line: the
 * status line has already been read out. When the status line is `Nothing yet`
 * (or `Not known yet`) there is nothing to press toward and the line is that
 * phrase alone.
 */
export function quietStateSentence(status: string, name: string): string {
  if (status === QUIET_NOTHING_YET || status === QUIET_NOT_KNOWN_YET) {
    return status;
  }
  const first = status.split(' · ')[0] ?? status;
  return `${first} · not yet on the paper · press ${name} on the index to open`;
}

/**
 * NF4-01 — which act stands as the approvals head's leader while the stop is
 * quiet.
 *
 * W4-R1 column 3 describes it as "the head's leader as it prints today: the
 * ranked need's act when the need names approvals, else `New approval`". The
 * head printed no need-elected leader, so this is the election the ruling
 * describes, in the shape `ffe-leader.ts` already uses for Pieces: the needs
 * arrive ALREADY RANKED (`rankOperationalNeeds`), so the first one whose kind
 * names this region is the sharpest, and there is no second ordering here.
 *
 * Generic over the row rather than typed to `NeedLine`, because the page hands
 * it the red-letter rows — which carry each need's kind beside the act the
 * guide would have offered, so the elected leader presses exactly where the
 * band's line 2 presses and no second act table exists.
 */
export const APPROVALS_LEADER_KINDS: readonly string[] = ['overdue_decision'];

export function namesApprovals(kind: string): boolean {
  return APPROVALS_LEADER_KINDS.includes(kind);
}

export function approvalsQuietLeader<T extends { kind: string }>(
  rows: readonly T[] | null | undefined,
): T | null {
  return rows?.find((row) => namesApprovals(row.kind)) ?? null;
}
