/**
 * The Document · Schedule — entry grammar parser (R101/Slice 03 §2).
 *
 * `parseScheduleEntry` turns one free-text field into either a chain
 * DURATION (an authored day count — what `resolveSchedule` calls
 * `durationDays`, or a signed relative offset for a milestone) or a hard
 * ANCHOR date ('YYYY-MM-DD', what the resolver calls `anchorDate`). It is
 * the one grammar every compose surface (ghost-add duration field, milestone
 * offset-or-date field, "Edit dates") feeds into — nothing else in the app
 * free-parses a schedule string.
 *
 * Pure, dependency-free, TOTAL (never throws — every malformed input
 * degrades to `{kind:'invalid', reason}`), and clock-injected (`today` is a
 * parameter; there is no `Date.now()` anywhere in this file) — the same
 * conventions `resolveSchedule` itself follows in `./schedule.ts`. Calendar
 * validity (impossible dates, e.g. 2026-02-30) is delegated to that file's
 * exported `epochDayFromISO` — this module never reimplements civil-date
 * math, it only builds candidate 'YYYY-MM-DD' strings and asks the
 * resolver's own day-math whether they round-trip.
 *
 * ─── Grammar ──────────────────────────────────────────────────────────────
 * DURATION — optional sign, a number, optional unit:
 *   unsigned:  3w · 10d · 18 days · 4 weeks · 2 w · 1.5w
 *   signed:    +5d · -3d · +2w · +0d          (offsets — feed milestones)
 *   bare number, no unit (e.g. "10"): governed by `opts.bareNumberUnit`
 *     ('days' | 'weeks' | 'reject', default 'reject' — a bare number is
 *     ambiguous and refused unless a surface opts into a default unit).
 *   Units: d/day/days → whole days only (a fractional day count is invalid).
 *          w/week/weeks → may be fractional; the day count is
 *          `Math.round(value * 7)`.
 *   An UNSIGNED duration must be a positive number of DAYS after rounding —
 *   "0d" is invalid, and so is "0.05w" (rounds to 0); a SIGNED one may be
 *   zero or negative — "+0d" and "-3d" are valid.
 *
 * ANCHOR — a calendar date, in any of:
 *   'Sep 21' / 'September 21' / 'Sept 21' / '21 Sep'   (month name ± day,
 *                                                        either order)
 *   'Sep 21 2026' / 'September 21, 2026'                (+ an explicit year)
 *   '9/21' / '09/21/2026'                                (US M/D[/YYYY])
 *   '2026-09-21'                                          (ISO)
 *   Case-insensitive, comma-tolerant, extra-whitespace-tolerant.
 *   When the year is omitted, it is INFERRED as the next occurrence of that
 *   month/day on-or-after `today` (today's own month/day counts as a match —
 *   the boundary is inclusive). An impossible calendar date (Feb 30, month
 *   13, day 32, …) is invalid at every year — validated purely via
 *   `epochDayFromISO`'s round-trip, never a bespoke days-in-month table.
 *
 * Anything matching neither grammar — including a recognized-looking but
 * unsupported unit ('3m') — is `{kind:'invalid', reason}` with a
 * human-readable reason naming the offending input.
 */

import { epochDayFromISO } from './schedule';

export type ParsedEntry =
  | { kind: 'duration'; days: number }
  | { kind: 'anchor'; date: string }
  | { kind: 'invalid'; reason: string };

// ─────────────────────────────────────────────────────────────────────────────
// Month name table — full names, standard abbreviations, and the "Sept" alias.
// ─────────────────────────────────────────────────────────────────────────────

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

// ─────────────────────────────────────────────────────────────────────────────
// Grammar patterns (matched against a lowercased, comma-stripped,
// whitespace-collapsed working copy of the input — see `parseScheduleEntry`).
// ─────────────────────────────────────────────────────────────────────────────

const DURATION_RE = /^([+-])?(\d+(?:\.\d+)?)(?:\s*(d|day|days|w|week|weeks))?$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLASH_YEAR_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const SLASH_RE = /^(\d{1,2})\/(\d{1,2})$/;
const MONTH_DAY_RE = /^([a-z]+)\.?\s(\d{1,2})(?:\s(\d{4}))?$/;
const DAY_MONTH_RE = /^(\d{1,2})\s([a-z]+)\.?(?:\s(\d{4}))?$/;

export interface ParseScheduleEntryOptions {
  bareNumberUnit?: 'days' | 'weeks' | 'reject';
}

function invalid(reason: string): ParsedEntry {
  return { kind: 'invalid', reason };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

/** `today`'s own epoch day + calendar year, or null when `today` isn't a valid 'YYYY-MM-DD'. */
function todayContext(today: string): { epoch: number; year: number } | null {
  const t = typeof today === 'string' ? today.trim() : '';
  const epoch = epochDayFromISO(t);
  if (epoch == null) return null;
  return { epoch, year: Number(t.slice(0, 4)) };
}

/**
 * The next calendar year (starting at `fromYear`) in which `month`/`day`
 * forms a real date on-or-after `todayEpoch`. Bounded to a small forward
 * window so this stays total (never loops forever) even for a month/day that
 * is impossible at every year (e.g. Feb 30) — such input simply yields null.
 */
function inferYear(month: number, day: number, fromYear: number, todayEpoch: number): number | null {
  for (let offset = 0; offset <= 8; offset++) {
    const year = fromYear + offset;
    const epoch = epochDayFromISO(`${pad4(year)}-${pad2(month)}-${pad2(day)}`);
    if (epoch != null && epoch >= todayEpoch) return year;
  }
  return null;
}

/** Resolve a month/day pair with no explicit year via `inferYear`, or invalid. */
function resolveInferredAnchor(month: number, day: number, cleaned: string, today: string): ParsedEntry {
  const ctx = todayContext(today);
  if (ctx == null) {
    return invalid(`can't infer a year for "${cleaned}" — "${today}" is not a valid clock date`);
  }
  const year = inferYear(month, day, ctx.year, ctx.epoch);
  if (year == null) {
    return invalid(`"${cleaned}" is not a real calendar date`);
  }
  return { kind: 'anchor', date: `${pad4(year)}-${pad2(month)}-${pad2(day)}` };
}

/** Validate + emit an explicit-year anchor, or invalid if the calendar date is impossible. */
function explicitYearAnchor(year: number, month: number, day: number, cleaned: string): ParsedEntry {
  const iso = `${pad4(year)}-${pad2(month)}-${pad2(day)}`;
  const epoch = epochDayFromISO(iso);
  if (epoch == null) return invalid(`"${cleaned}" is not a real calendar date`);
  return { kind: 'anchor', date: iso };
}

// ─────────────────────────────────────────────────────────────────────────────
// Duration branch
// ─────────────────────────────────────────────────────────────────────────────

function tryDuration(cleaned: string, opts: ParseScheduleEntryOptions | undefined): ParsedEntry | null {
  const m = DURATION_RE.exec(cleaned);
  if (!m) return null;

  const isSigned = m[1] != null;
  const sign = m[1] === '-' ? -1 : 1;
  const rawNum = Number(m[2]);
  let unit = m[3];

  if (unit == null) {
    const mode = opts?.bareNumberUnit ?? 'reject';
    if (mode === 'reject') {
      return invalid(`"${cleaned}" needs a unit ('10d' or '3w') — bare numbers are rejected here`);
    }
    unit = mode === 'weeks' ? 'w' : 'd';
  }

  const isWeek = unit.charAt(0) === 'w';
  if (!isWeek && !Number.isInteger(rawNum)) {
    return invalid(`day counts must be a whole number — "${cleaned}" is not`);
  }
  if (!isSigned && rawNum <= 0) {
    return invalid(`a duration must be a positive number of days or weeks — sign "${cleaned}" to allow zero or negative`);
  }

  // `|| 0` normalizes a signed-zero result (e.g. "-0d") to a plain 0 — -0 and
  // 0 are numerically equal but distinguishable in JS, and callers comparing
  // ParsedEntry by value should never have to special-case a negative zero.
  const days = sign * (isWeek ? Math.round(rawNum * 7) : rawNum) || 0;

  // Post-round zero guard: a tiny unsigned fractional week ("0.05w") passes
  // the raw > 0 check above but rounds to 0 days — an unsigned duration must
  // still be a positive DAY count after rounding. Signed zero stays legal.
  if (!isSigned && days === 0) {
    return invalid(`"${cleaned}" rounds to zero days — a duration must be at least one day`);
  }

  return { kind: 'duration', days };
}

// ─────────────────────────────────────────────────────────────────────────────
// Anchor branch
// ─────────────────────────────────────────────────────────────────────────────

function tryAnchor(cleaned: string, today: string): ParsedEntry | null {
  if (ISO_RE.test(cleaned)) {
    const epoch = epochDayFromISO(cleaned);
    if (epoch == null) return invalid(`"${cleaned}" is not a real calendar date`);
    return { kind: 'anchor', date: cleaned };
  }

  const slashYear = SLASH_YEAR_RE.exec(cleaned);
  if (slashYear) {
    return explicitYearAnchor(Number(slashYear[3]), Number(slashYear[1]), Number(slashYear[2]), cleaned);
  }

  const slash = SLASH_RE.exec(cleaned);
  if (slash) {
    return resolveInferredAnchor(Number(slash[1]), Number(slash[2]), cleaned, today);
  }

  const monthDay = MONTH_DAY_RE.exec(cleaned);
  if (monthDay) {
    const month = MONTHS[monthDay[1]];
    if (month == null) return invalid(`"${monthDay[1]}" is not a recognized month`);
    const day = Number(monthDay[2]);
    if (monthDay[3] != null) return explicitYearAnchor(Number(monthDay[3]), month, day, cleaned);
    return resolveInferredAnchor(month, day, cleaned, today);
  }

  const dayMonth = DAY_MONTH_RE.exec(cleaned);
  if (dayMonth) {
    const month = MONTHS[dayMonth[2]];
    if (month == null) return invalid(`"${dayMonth[2]}" is not a recognized month`);
    const day = Number(dayMonth[1]);
    if (dayMonth[3] != null) return explicitYearAnchor(Number(dayMonth[3]), month, day, cleaned);
    return resolveInferredAnchor(month, day, cleaned, today);
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

export function parseScheduleEntry(input: string, today: string, opts?: ParseScheduleEntryOptions): ParsedEntry {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (raw === '') return invalid('empty input');

  // Case-insensitive, comma-tolerant, extra-whitespace-tolerant working copy.
  const cleaned = raw
    .toLowerCase()
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const duration = tryDuration(cleaned, opts);
  if (duration) return duration;

  const anchor = tryAnchor(cleaned, today);
  if (anchor) return anchor;

  return invalid(`could not parse "${raw}" as a duration or a date`);
}
