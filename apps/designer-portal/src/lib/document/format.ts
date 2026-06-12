/** Tiny shared formatters for Document surfaces. */

/** DATE columns arrive as bare `YYYY-MM-DD`; parse them as LOCAL midnight so
 *  the rendered day never slips backwards in negative-offset timezones. */
const asLocalDate = (iso: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso);

export const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(asLocalDate(iso));

export const fmtMonthYear = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(asLocalDate(iso));

export const fmtUsd = (cents: number) =>
  (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
