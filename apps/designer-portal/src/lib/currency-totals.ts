/**
 * Per-currency money for FF&E display (SQ-207; ruling 2026-09-24).
 *
 * `project_ffe_items.currency` (00661) is ISO-4217 and defaults to USD. A
 * display total never adds rows in two currencies. `sumByCurrency` returns
 * either one currency's sum or the list of currencies, and the surface prints
 * "Mixed currencies — total unavailable" in place of the figure.
 *
 * Every price row is formatted in its own currency. An all-USD input prints
 * exactly what `fmtUsd` printed before this module existed.
 */

export const DEFAULT_CURRENCY = 'USD';

export const MIXED_CURRENCIES_LABEL = 'Mixed currencies — total unavailable';

export type CurrencyTotal = { currency: string; cents: number } | { mixed: string[] };

/** A row's currency. A missing value reads as the column default, USD. */
export function rowCurrency(row: { currency?: string | null } | null | undefined): string {
  const code = row?.currency?.trim().toUpperCase();
  return code ? code : DEFAULT_CURRENCY;
}

/**
 * Sum `cents(row)` across rows that share one currency. A row whose amount is
 * null or undefined adds nothing and does not count toward the currencies.
 * No rows sum to USD 0.
 */
export function sumByCurrency<T extends { currency?: string | null }>(
  rows: readonly T[],
  cents: (row: T) => number | null | undefined,
): CurrencyTotal {
  const currencies = new Set<string>();
  let total = 0;
  for (const row of rows) {
    const amount = cents(row);
    if (amount === null || amount === undefined) continue;
    currencies.add(rowCurrency(row));
    total += amount;
  }
  if (currencies.size > 1) return { mixed: [...currencies].sort() };
  const [currency = DEFAULT_CURRENCY] = currencies;
  return { currency, cents: total };
}

export function isMixed(total: CurrencyTotal): total is { mixed: string[] } {
  return 'mixed' in total;
}

/** The currencies a total spans, one or several. */
export function totalCurrencies(total: CurrencyTotal): string[] {
  return isMixed(total) ? total.mixed : [total.currency];
}

const formatters = new Map<string, Intl.NumberFormat>();

/** Minor units → a whole-unit figure in `currency` ("$1,240", "€1,240"). */
export function formatMoney(cents: number, currency: string = DEFAULT_CURRENCY): string {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    });
    formatters.set(currency, formatter);
  }
  return formatter.format(cents / 100);
}

/** "Mixed currencies — total unavailable (EUR, USD)". */
export function mixedCurrenciesText(currencies: readonly string[]): string {
  return `${MIXED_CURRENCIES_LABEL} (${currencies.join(', ')})`;
}

/** A total as the surface prints it: the figure, or the mixed-currency note. */
export function formatCurrencyTotal(
  total: CurrencyTotal,
  format: (cents: number, currency: string) => string = formatMoney,
): string {
  return isMixed(total) ? mixedCurrenciesText(total.mixed) : format(total.cents, total.currency);
}
