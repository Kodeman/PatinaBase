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

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** `2027-08-13` → `13 August 2027`. */
export function formatLongDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const monthName = MONTHS_LONG[Number(month) - 1];
  if (!monthName) return null;
  return `${Number(day)} ${monthName} ${year}`;
}

/** Dollars from integer cents, whole where whole: `250000` → `$2,500`. */
export function formatMoneyFromCents(cents: number | null | undefined): string | null {
  if (cents == null || !Number.isFinite(cents)) return null;
  const dollars = cents / 100;
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: dollars % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** "site access, payment and the draw" — an Oxford-free list in the studio's
 *  voice, used wherever a document says what it holds up. */
export function joinWords(words: readonly string[]): string {
  const list = words.filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/** Sentence-case the first letter of a list that opens a sentence. */
export function capitalise(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
