/**
 * The room's own date words, so two surfaces cannot spell one date two ways.
 *
 * Short form — "12 Oct 2026" — is `formatSeatDate`, on the seat line, where a
 * window has to sit inside a row. Long form — "13 August 2027" — is for a
 * sentence a studio reads rather than scans: a grant's end date, a lapse, a
 * warranty term.
 *
 * Both parse a DATE column by parts, never through `new Date(string)`: a date
 * parsed as a timestamp lands a day early west of UTC.
 */

import { touchInstantIsoDay } from "@patina/supabase";

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** `2027-08-13` → `13 August 2027`. */
export function formatLongDate(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const monthName = MONTHS_LONG[Number(month) - 1];
  if (!monthName) return null;
  return `${Number(day)} ${monthName} ${year}`;
}

/**
 * THE LAST DAY A DOOR IS OPEN, from the instant it carries (QA-R8-1, W4 r3
 * MAJOR-1).
 *
 * Two RPCs store a whole-day window as an EXCLUSIVE boundary — midnight at the
 * head of the following day, so the token works "through the end of that day":
 * `create_field_link` (`max(on_site_to, warranty_until) + interval '1 day'`,
 * 00627:578-585) and `mint_paperwork_link` (`v_window_end::timestamptz +
 * interval '1 day'`, 00637:470-475). Printing `expires_at.slice(0, 10)` for
 * either therefore named the day AFTER the job — the mint band offered "Ends
 * with the job — 8 February 2027" and the very next sentence, plus the durable
 * Access grants row, said "Ends 9 February 2027" for the same press.
 *
 * Backing the boundary off by an instant answers every branch with one rule
 * rather than a blanket minus-one-day: an exclusive midnight lands back on the
 * window's last day, while a caller-supplied `…T23:59:59Z` and a mid-afternoon
 * stamp both stay on their own day. Scoped to the two tiers that store such a
 * boundary — a document share or an invoice pay link simply dies at the
 * instant it carries.
 */
export function lastOpenDay(expiresAt: string): string | null {
  const at = Date.parse(expiresAt);
  if (!Number.isFinite(at)) return expiresAt.slice(0, 10) || null;
  // `expires_at` is a timestamptz; the backed-off instant is then named on the
  // STUDIO's calendar, not UTC's, so a boundary that lands in the studio's
  // evening cannot print tomorrow's date (R-CB, W4 r10 M-1).
  return touchInstantIsoDay(new Date(at - 1000).toISOString());
}

/** Dollars from integer cents, whole where whole: `250000` → `$2,500`. */
export function formatMoneyFromCents(
  cents: number | null | undefined,
): string | null {
  if (cents == null || !Number.isFinite(cents)) return null;
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: dollars % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** "site access, payment and the draw" — an Oxford-free list in the studio's
 *  voice, used wherever a document says what it holds up. */
export function joinWords(words: readonly string[]): string {
  const list = words.filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** Sentence-case the first letter of a list that opens a sentence. */
export function capitalise(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
