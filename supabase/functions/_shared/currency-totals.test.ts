// deno-lint-ignore-file no-import-prefix
// Contract parity with apps/designer-portal/src/lib/currency-totals.ts (SQ-207).

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  formatMinorUnits,
  isMixed,
  MIXED_CURRENCIES_LABEL,
  mixedCurrenciesText,
  rowCurrency,
  sumByCurrency,
} from './currency-totals.ts';

type Row = { currency?: string | null; cents: number | null };
const cents = (row: Row) => row.cents;

Deno.test('rowCurrency — missing, blank, or lowercase reads as the ISO code (USD default)', () => {
  assertEquals(rowCurrency(null), 'USD');
  assertEquals(rowCurrency({}), 'USD');
  assertEquals(rowCurrency({ currency: null }), 'USD');
  assertEquals(rowCurrency({ currency: '  ' }), 'USD');
  assertEquals(rowCurrency({ currency: ' eur ' }), 'EUR');
});

Deno.test('sumByCurrency — one currency sums; no rows sum to USD 0', () => {
  assertEquals(sumByCurrency<Row>([], cents), { currency: 'USD', cents: 0 });
  assertEquals(
    sumByCurrency<Row>([{ cents: 100 }, { currency: 'USD', cents: 250 }], cents),
    { currency: 'USD', cents: 350 },
  );
  assertEquals(
    sumByCurrency<Row>([{ currency: 'EUR', cents: 100 }, { currency: 'eur', cents: 5 }], cents),
    { currency: 'EUR', cents: 105 },
  );
});

Deno.test('sumByCurrency — mixed currencies refuse the sum and list the codes sorted', () => {
  const total = sumByCurrency<Row>(
    [{ currency: 'USD', cents: 1 }, { currency: 'GBP', cents: 2 }, { cents: 3 }, { currency: 'EUR', cents: 4 }],
    cents,
  );
  assertEquals(total, { mixed: ['EUR', 'GBP', 'USD'] });
  assertEquals(isMixed(total), true);
});

Deno.test('sumByCurrency — a null amount adds nothing and names no currency', () => {
  assertEquals(
    sumByCurrency<Row>([{ currency: 'EUR', cents: null }, { cents: 700 }], cents),
    { currency: 'USD', cents: 700 },
  );
  assertEquals(
    sumByCurrency<Row>([{ currency: 'EUR', cents: null }], cents),
    { currency: 'USD', cents: 0 },
  );
});

Deno.test('mixedCurrenciesText — wording matches the portal helper exactly', () => {
  assertEquals(MIXED_CURRENCIES_LABEL, 'Mixed currencies — total unavailable');
  assertEquals(
    mixedCurrenciesText(['EUR', 'USD']),
    'Mixed currencies — total unavailable (EUR, USD)',
  );
});

Deno.test('formatMinorUnits — two-decimal figure in the given currency', () => {
  assertEquals(formatMinorUnits(124000, 'EUR'), '€1,240.00');
  assertEquals(formatMinorUnits(12345, 'GBP'), '£123.45');
});
