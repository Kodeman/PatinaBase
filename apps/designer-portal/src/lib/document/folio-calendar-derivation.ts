/**
 * The Calendar Folio — derivation (Date Instruments, lane A2).
 *
 * The Folio's whole brain: what a click does to the draft, what the grid
 * shades, whether SET may fire, and the sentence the footer reads back. The
 * components carry no date math (house rule) — every day here is an epoch day
 * from `@patina/utils`, never a `Date`, and nothing reads a clock.
 *
 * A DRAFT is the uncommitted working state. Nothing in this file commits;
 * `folioCommittable` only says whether the draft is whole enough for SET.
 */

import { epochDayFromISO, weekdayFromEpochDay } from '@patina/utils';

/** What the Folio hands back on SET — a due day, or a working window. */
export type FolioSelection =
  | { kind: 'day'; date: string }
  | { kind: 'span'; start: string; end: string };

/** The uncommitted working state. A span's `anchor`/`end` are always ordered
 *  low→high once both are set (`folioClickDay` normalizes on the second click). */
export type FolioDraft =
  | { mode: 'day'; date: string | null }
  | { mode: 'span'; anchor: string | null; end: string | null };

export interface FolioReadoutLabels {
  day: string;
  span: string;
}

/** Sunday-first, matching `monthGrid`'s default and `weekdayFromEpochDay`. */
export const FOLIO_WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export const FOLIO_MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export const FOLIO_MONTH_NAME = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** The placeholder an incomplete draft reads as. */
const EM_DASH = '—';

/** Month + day off a valid ISO day: "Aug 25". */
function monthDay(iso: string): string | null {
  if (epochDayFromISO(iso) == null) return null;
  const month = FOLIO_MONTH_ABBR[Number(iso.slice(5, 7)) - 1];
  return month ? `${month} ${Number(iso.slice(8, 10))}` : null;
}

/** Weekday + month + day: "Thu, Aug 20". */
function weekdayMonthDay(iso: string): string | null {
  const epoch = epochDayFromISO(iso);
  if (epoch == null) return null;
  const rest = monthDay(iso);
  return rest ? `${FOLIO_WEEKDAY_ABBR[weekdayFromEpochDay(epoch)]}, ${rest}` : null;
}

/** Low→high ordering of two ISO days, or null if either fails to parse. */
function ordered(a: string, b: string): { start: string; end: string } | null {
  const epochA = epochDayFromISO(a);
  const epochB = epochDayFromISO(b);
  if (epochA == null || epochB == null) return null;
  return epochA <= epochB ? { start: a, end: b } : { start: b, end: a };
}

/**
 * Open a draft off the committed value. A null value opens empty in
 * `fallbackMode`; a value normally opens in ITS own mode, whatever the fallback
 * says (a committed span may not be reinterpreted as a day behind the user).
 *
 * `modes` is the surface's allowed shapes. A value whose kind the surface does
 * NOT offer is coerced rather than dropped — a span-only surface holding a day
 * opens that day as an unclosed anchor, a day-only surface holding a span opens
 * on its start. Coercion never commits: the user still has to press SET, so the
 * stored value is untouched until they agree to the reshaping.
 */
export function folioDraftFromValue(
  value: FolioSelection | null,
  fallbackMode: 'day' | 'span',
  modes?: Array<'day' | 'span'>,
): FolioDraft {
  if (value == null) {
    return fallbackMode === 'span'
      ? { mode: 'span', anchor: null, end: null }
      : { mode: 'day', date: null };
  }
  const offered = modes == null || modes.includes(value.kind === 'day' ? 'day' : 'span');
  if (value.kind === 'day') {
    return offered ? { mode: 'day', date: value.date } : { mode: 'span', anchor: value.date, end: null };
  }
  return offered
    ? { mode: 'span', anchor: value.start, end: value.end }
    : { mode: 'day', date: value.start };
}

/**
 * A day cell click.
 *
 * Day mode: the click IS the draft — a second click replaces the first.
 * Span mode: first click sets the anchor, second click closes the span
 * (normalized low→high, so clicking before the anchor is a legal way to build
 * a backwards range), and a click on a closed span restarts from that day.
 */
export function folioClickDay(draft: FolioDraft, iso: string): FolioDraft {
  if (epochDayFromISO(iso) == null) return draft;
  if (draft.mode === 'day') return { mode: 'day', date: iso };
  if (draft.anchor == null || draft.end != null) {
    return { mode: 'span', anchor: iso, end: null };
  }
  const range = ordered(draft.anchor, iso);
  if (range == null) return { mode: 'span', anchor: iso, end: null };
  return { mode: 'span', anchor: range.start, end: range.end };
}

/**
 * The inclusive day range the grid washes: a closed span, or — while an anchor
 * waits for its second click — the live preview between anchor and cursor.
 * Null in day mode, with no anchor, or with an open anchor and no hover.
 */
export function folioShadeRange(
  draft: FolioDraft,
  hoverIso: string | null,
): { start: string; end: string } | null {
  if (draft.mode === 'day' || draft.anchor == null) return null;
  if (draft.end != null) return ordered(draft.anchor, draft.end);
  if (hoverIso == null) return null;
  return ordered(draft.anchor, hoverIso);
}

/** The selection SET would commit, or null while the draft is incomplete. */
export function folioCommittable(draft: FolioDraft): FolioSelection | null {
  if (draft.mode === 'day') {
    return draft.date == null ? null : { kind: 'day', date: draft.date };
  }
  if (draft.anchor == null || draft.end == null) return null;
  const range = ordered(draft.anchor, draft.end);
  return range == null ? null : { kind: 'span', start: range.start, end: range.end };
}

/**
 * The micro-label a draft reads under. The ONE place the mode→label choice is
 * made: `folioReadout` prefixes with it and the footer typesets it, so the
 * announced sentence and the printed one can never name different things.
 */
export function folioReadoutLabel(draft: FolioDraft, labels: FolioReadoutLabels): string {
  return draft.mode === 'day' ? labels.day : labels.span;
}

/**
 * The footer sentence, label included: "DUE Thu, Aug 20",
 * "WORKING WINDOW Aug 25 — Aug 28 · 4 days". An incomplete draft reads as the
 * label plus an em dash. The label lives in the string (not just beside it) so
 * the aria-live announcement and the typeset footer are the same sentence.
 *
 * `hoverIso` is the CURSOR day in the broad sense — the pointer's day while
 * hovering, otherwise the keyboard's roving day (R102: the span preview is not
 * a hover-only affordance).
 */
export function folioReadout(
  draft: FolioDraft,
  hoverIso: string | null,
  labels: FolioReadoutLabels,
): string {
  const label = folioReadoutLabel(draft, labels);
  if (draft.mode === 'day') {
    const day = draft.date == null ? null : weekdayMonthDay(draft.date);
    return `${label} ${day ?? EM_DASH}`;
  }
  const range = folioShadeRange(draft, hoverIso);
  if (range == null) return `${label} ${EM_DASH}`;
  const start = monthDay(range.start);
  const end = monthDay(range.end);
  if (start == null || end == null) return `${label} ${EM_DASH}`;
  const days = (epochDayFromISO(range.end) as number) - (epochDayFromISO(range.start) as number) + 1;
  return `${label} ${start} ${EM_DASH} ${end} · ${days} ${days === 1 ? 'day' : 'days'}`;
}
