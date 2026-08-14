/**
 * Date Instruments · calendar — weekday math, workday stepping, and a
 * fixed-shape month grid, all built on the resolver's own epoch-day core.
 *
 * Every date computation here goes through `epochDayFromISO` /
 * `isoFromEpochDay` (see `./schedule.ts`) — the ONE date-math implementation
 * in this package (R100). This file adds no second one: it never touches
 * `Date`, never reimplements days-in-month, and reads no clock. Every
 * exported function is pure and total — malformed 'YYYY-MM-DD' input
 * degrades to `null` (never a throw), exactly like `epochDayFromISO` itself.
 *
 * Epoch-day 0 is 1970-01-01, a Thursday — `weekdayFromEpochDay(0) === 4`.
 * Weekdays are numbered the JS `Date#getDay()` way: 0 = Sunday … 6 = Saturday.
 */

import { epochDayFromISO, isoFromEpochDay } from './schedule';

// ─────────────────────────────────────────────────────────────────────────────
// Weekday + workday
// ─────────────────────────────────────────────────────────────────────────────

/** Epoch-day 0 (1970-01-01) is a Thursday. */
const EPOCH0_WEEKDAY = 4;

/** The weekday of an epoch day: 0 = Sunday … 6 = Saturday. Pure, total. */
export function weekdayFromEpochDay(epoch: number): number {
  const mod7 = ((epoch % 7) + 7) % 7; // JS `%` can be negative; normalize first
  return (mod7 + EPOCH0_WEEKDAY) % 7;
}

/** True for Monday–Friday. */
export function isWorkday(epoch: number): boolean {
  const wd = weekdayFromEpochDay(epoch);
  return wd >= 1 && wd <= 5;
}

/**
 * The first workday STRICTLY AFTER `epoch` — never `epoch` itself, even when
 * `epoch` is already a workday. Fri → Mon, Sat → Mon, Sun → Mon.
 */
export function nextWorkday(epoch: number): number {
  let e = epoch + 1;
  while (!isWorkday(e)) e++;
  return e;
}

/**
 * Inclusive count of workdays in `[startEpoch, endEpoch]`; 0 when the range
 * is reversed (`startEpoch > endEpoch`) or empty. Closed-form, not a day-by-day
 * loop: any run of 7 consecutive calendar days contains exactly 5 workdays
 * regardless of phase, so the range decomposes into full 7-day blocks (×5
 * each) plus a short remainder walked by weekday.
 */
export function workdaysBetween(startEpoch: number, endEpoch: number): number {
  if (startEpoch > endEpoch) return 0;
  const totalDays = endEpoch - startEpoch + 1;
  const fullWeeks = Math.floor(totalDays / 7);
  const remainder = totalDays % 7;
  let count = fullWeeks * 5;
  let wd = weekdayFromEpochDay(startEpoch + fullWeeks * 7);
  for (let i = 0; i < remainder; i++) {
    if (wd >= 1 && wd <= 5) count++;
    wd = (wd + 1) % 7;
  }
  return count;
}

// ─────────────────────────────────────────────────────────────────────────────
// ISO-string workday helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `n` workday steps forward from `iso`, where the step sequence anchors on a
 * workday first: if `iso` itself is a workday it is step 0; otherwise step 0
 * is `nextWorkday(iso)`. Each further step advances by `nextWorkday` again, so
 * `n=0` returns `iso` when `iso` is a workday, or the next workday when it
 * isn't (e.g. a Saturday `iso` with `n=0` lands on the following Monday).
 * `n` is expected to be a non-negative integer; non-finite, fractional, or
 * negative values are floored to 0 additional steps so the function stays
 * total. Returns `null` when `iso` doesn't parse as a strict 'YYYY-MM-DD'.
 */
export function addWorkdaysISO(iso: string, n: number): string | null {
  const epoch = epochDayFromISO(iso);
  if (epoch == null) return null;
  const steps = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  let cur = isWorkday(epoch) ? epoch : nextWorkday(epoch);
  for (let i = 0; i < steps; i++) cur = nextWorkday(cur);
  return isoFromEpochDay(cur);
}

/**
 * Inclusive workday count between two 'YYYY-MM-DD' strings (order-agnostic
 * about which is earlier only in the sense that `workdaysBetween` itself
 * returns 0 for a reversed range — this never returns 0 as an error signal).
 * `null` only when `a` or `b` fails to parse.
 */
export function workdaysBetweenISO(a: string, b: string): number | null {
  const epochA = epochDayFromISO(a);
  const epochB = epochDayFromISO(b);
  if (epochA == null || epochB == null) return null;
  return workdaysBetween(epochA, epochB);
}

// ─────────────────────────────────────────────────────────────────────────────
// Month grid
// ─────────────────────────────────────────────────────────────────────────────

export interface MonthGridCell {
  iso: string;
  epoch: number;
  inMonth: boolean;
  weekday: number;
}

export interface MonthGrid {
  year: number;
  month: number; // 1..12
  weeks: MonthGridCell[][]; // always 6 rows × 7 cols
}

function pad(n: number, width: number): string {
  let s = String(n);
  while (s.length < width) s = '0' + s;
  return s;
}

/**
 * A calendar month laid out as a fixed 6×7 grid (42 cells), the shape every
 * month-view renderer wants so it never has to branch on how many weeks a
 * given month actually spans. `month` is 1-indexed (1 = January) and expected
 * in range 1..12 — like the rest of this file's contract, callers own valid
 * input (see `addMonths` to normalize a rolled-over month before calling
 * this). The grid starts on the week containing the 1st that begins on
 * `weekStartsOn` (0 = Sunday, default; 1 = Monday) and always runs 6 weeks,
 * so trailing cells from the following month(s) are included as needed.
 * `inMonth` is a month-component comparison against `month` — safe because a
 * 42-day window can only ever touch the target month and its immediate
 * neighbors, which never share its month number.
 */
export function monthGrid(year: number, month: number, weekStartsOn: 0 | 1 = 0): MonthGrid {
  const firstIso = `${pad(year, 4)}-${pad(month, 2)}-01`;
  const firstEpoch = epochDayFromISO(firstIso)!; // '...-01' is always a valid day for month 1..12
  const firstWeekday = weekdayFromEpochDay(firstEpoch);
  const leadingDays = (firstWeekday - weekStartsOn + 7) % 7;
  const gridStartEpoch = firstEpoch - leadingDays;

  const weeks: MonthGridCell[][] = [];
  let epoch = gridStartEpoch;
  for (let w = 0; w < 6; w++) {
    const row: MonthGridCell[] = [];
    for (let d = 0; d < 7; d++) {
      const iso = isoFromEpochDay(epoch)!;
      const info = monthOf(iso)!;
      row.push({ iso, epoch, inMonth: info.month === month, weekday: weekdayFromEpochDay(epoch) });
      epoch++;
    }
    weeks.push(row);
  }

  return { year, month, weeks };
}

/**
 * The `{ year, month }` a 'YYYY-MM-DD' string falls in, or `null` on
 * anything that doesn't round-trip as a strict ISO date (garbage, impossible
 * calendar dates, non-strings). Total. Reads the year/month straight off the
 * input string rather than re-deriving them from the epoch day: `iso` is only
 * non-null-epoch when `epochDayFromISO` confirms it is exactly
 * 'YYYY-MM-DD', so slicing it is exact, not an approximation.
 */
export function monthOf(iso: string): { year: number; month: number } | null {
  const epoch = epochDayFromISO(iso);
  if (epoch == null) return null;
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) };
}

/**
 * Add `delta` months to `{ year, month }`, rolling the year over in either
 * direction (month is always normalized back to 1..12). Pure integer
 * arithmetic — no epoch-day round trip needed since this never touches a
 * day-of-month.
 */
export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  const newYear = Math.floor(total / 12);
  const newMonth = ((total % 12) + 12) % 12 + 1;
  return { year: newYear, month: newMonth };
}
