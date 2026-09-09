/** Tiny shared formatters for Document surfaces.
 *
 * PP-2 / R140 — every date word here goes through `dates.ts`, so the folio
 * cards, the margin and the document guide print the same idiom the Desk's
 * day's line and roster rows print. Nothing in this file composes its own
 * `Intl.DateTimeFormat` for a date. */

import { DAY_MONTH_FORMAT, MONTH_NAME_FORMAT, legalDate } from './dates';

/** DATE columns arrive as bare `YYYY-MM-DD`; parse them as LOCAL midnight so
 *  the rendered day never slips backwards in negative-offset timezones. */
const asLocalDate = (iso: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso);

/** "11 September" — the house's day-and-month idiom. */
export const fmtDay = (iso: string) => DAY_MONTH_FORMAT.format(asLocalDate(iso));

/** Month alone (R107) — the precision a band-register date may be stated at. */
export const fmtMonth = (iso: string) => MONTH_NAME_FORMAT.format(asLocalDate(iso));

export const fmtMonthYear = (iso: string) => {
  const day = asLocalDate(iso);
  return `${MONTH_NAME_FORMAT.format(day)} ${day.getFullYear()}`;
};

/**
 * Format a CALENDAR DATE — a day somebody wrote on a page — without letting a
 * timezone move it.
 *
 * Two shapes arrive here and both mean "a day", not "a moment":
 *
 *   '2026-01-15'             a bare date, as the paper rails store the day the
 *                            client signed (metadata.paperSignedOn)
 *   '2026-01-15T00:00:00Z'   a date cast to timestamptz at midnight UTC, as
 *                            record_paper_trade_acceptance stores acceptance
 *                            (accepted_at = p_paper_signed_on::timestamptz)
 *
 * Fed to a timezone-aware formatter west of UTC BOTH render the day before, so
 * a studio in Chicago reads back a signing date one day earlier than the one it
 * typed. The date component is therefore taken literally: a bare date is split
 * and rebuilt at local noon (immune to DST either way — this is what asLocalDate
 * above does, kept separate because that one is deliberately lenient about its
 * input), and a timestamp is formatted in UTC, the zone its day was written in.
 *
 * Use this ONLY for days. A real moment (signed_at, engaged_at) still belongs in
 * the reader's own timezone — see `when` in project-commerce.ts.
 */
export const formatCalendarDate = (value?: string | null) => {
  if (!value) return null;

  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (bare) {
    const [, year, month, day] = bare;
    return legalDate(new Date(Number(year), Number(month) - 1, Number(day), 12));
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  // The day is read off the timestamp in UTC — the zone it was written in —
  // then printed through the one idiom.
  return legalDate(
    new Date(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth(),
      parsed.getUTCDate(),
      12,
    ),
  );
};

/** Money, not a date: `en-US` is what prints a bare "$" — `en-GB` with
 *  `currency: 'USD'` prints "US$". PP-2 rules date idioms, not currency. */
export const fmtUsd = (cents: number) =>
  (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

/** Local-timezone `YYYY-MM-DD` for prefilling date inputs with today. */
export const todayYmd = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Local-timezone next calendar day for actions that must move a deadline. */
export const tomorrowYmd = (d = new Date()) => {
  const tomorrow = new Date(d);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return todayYmd(tomorrow);
};
