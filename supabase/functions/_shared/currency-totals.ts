/**
 * Per-currency money for edge-rendered documents (SQ-212; ruling 2026-09-24).
 *
 * The Deno twin of apps/designer-portal/src/lib/currency-totals.ts (SQ-207):
 * same contract, same wording. `project_ffe_items.currency` (00661) is
 * ISO-4217 and defaults to USD. A total never adds rows in two currencies:
 * `sumByCurrency` returns one currency's sum or the sorted list of
 * currencies, and the document prints "Mixed currencies — total unavailable
 * (EUR, USD)" in place of the figure.
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

/** "Mixed currencies — total unavailable (EUR, USD)". */
export function mixedCurrenciesText(currencies: readonly string[]): string {
  return `${MIXED_CURRENCIES_LABEL} (${currencies.join(', ')})`;
}

const formatters = new Map<string, Intl.NumberFormat>();

/**
 * Minor units → a two-decimal figure in a non-USD `currency` ("€1,240.00").
 * Each renderer keeps its own legacy USD formatter so all-USD output does not
 * change by a byte; this is the path for every other currency.
 */
export function formatMinorUnits(cents: number, currency: string): string {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formatters.set(currency, formatter);
  }
  return formatter.format(cents / 100);
}
