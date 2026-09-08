/* ── One date, printed one way ───────────────────────────────────────────────
   The house prints two date idioms and no others (PP-2, R140):

     legalDate  "11 September 2026" — a day that is a term of a paper, or a day
                in another year, where the year has to be read off the page.
     dayMonth   "11 September"      — a day inside a sentence about this year.

   Both are en-GB, which is what puts the day first. Nothing on this surface
   composes its own `Intl.DateTimeFormat`: a page that says "due 11 September"
   one line above "due September 11" is telling a client two things.

   A site that spells the year out only when it is not this year composes the
   two — `today.getFullYear() !== due.getFullYear() ? legalDate(due) :
   dayMonth(due)` — rather than asking for a third idiom.

   Both return null for a date the surface cannot read, so an unparseable date
   is silence rather than "Invalid Date". ──────────────────────────────────── */

/** The shapes the surface passes around: a parsed date, or the source string. */
export type DateLike = Date | string | null | undefined;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Read a date the way the client's own calendar reads it.
 *
 * `new Date('2026-03-12')` is UTC midnight, which prints as 11 March anywhere
 * west of Greenwich — so a date-only string is built from its local parts
 * instead. Anything unparseable is null; the caller then omits the date.
 */
export function parseSourceDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const dateOnly = DATE_ONLY.exec(value);
  const parsed = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const LEGAL_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * The day-and-month formatter itself, for the handful of callers that hold one
 * and format many dates through it. `dayMonth` is the idiom; this is the tool
 * under it, and it is exported so no second one is ever constructed.
 */
export const DAY_MONTH_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
});

/**
 * A month standing alone — "September" — as a chapter's span speaks it. Not a
 * date idiom: no day, no year, nothing to be read as a deadline. Kept here so
 * the surface holds one locale and not two.
 */
export const MONTH_NAME_FORMAT = new Intl.DateTimeFormat('en-GB', { month: 'long' });

function toDate(value: DateLike): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  return parseSourceDate(value);
}

/** "11 September 2026". Null when the date cannot be read. */
export function legalDate(value: DateLike): string | null {
  const date = toDate(value);
  return date ? LEGAL_DATE.format(date) : null;
}

/** "11 September". Null when the date cannot be read. */
export function dayMonth(value: DateLike): string | null {
  const date = toDate(value);
  return date ? DAY_MONTH_FORMAT.format(date) : null;
}
