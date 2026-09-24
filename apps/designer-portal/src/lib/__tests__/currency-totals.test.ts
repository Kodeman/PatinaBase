import { fmtUsd } from '@/lib/document/format';
import {
  formatCurrencyTotal,
  formatMoney,
  mixedCurrenciesText,
  rowCurrency,
  sumByCurrency,
} from '../currency-totals';

describe('sumByCurrency', () => {
  it('sums one currency and reads a missing currency as USD', () => {
    const rows = [
      { currency: 'USD', cents: 120_000 },
      { currency: null, cents: 30_050 },
      { cents: 5 },
    ];
    expect(sumByCurrency(rows, (r) => r.cents)).toEqual({ currency: 'USD', cents: 150_055 });
  });

  it('refuses to add two currencies and lists them, sorted', () => {
    const rows = [
      { currency: 'USD', cents: 100 },
      { currency: 'eur', cents: 200 },
      { currency: 'GBP', cents: 300 },
    ];
    expect(sumByCurrency(rows, (r) => r.cents)).toEqual({ mixed: ['EUR', 'GBP', 'USD'] });
  });

  it('keeps a single non-USD currency as its own total', () => {
    const rows = [
      { currency: 'EUR', cents: 100 },
      { currency: 'EUR', cents: 250 },
    ];
    expect(sumByCurrency(rows, (r) => r.cents)).toEqual({ currency: 'EUR', cents: 350 });
  });

  it('skips a row with no amount, so it cannot make a total mixed', () => {
    const rows = [
      { currency: 'USD', cents: 100 as number | null },
      { currency: 'EUR', cents: null },
    ];
    expect(sumByCurrency(rows, (r) => r.cents)).toEqual({ currency: 'USD', cents: 100 });
  });

  it('sums nothing to USD 0', () => {
    expect(sumByCurrency([], () => 1)).toEqual({ currency: 'USD', cents: 0 });
  });
});

describe('formatting', () => {
  it('an all-USD figure prints exactly what fmtUsd printed', () => {
    for (const cents of [0, 1, 49, 50, 99, 12_345, 1_234_567_89, -42_000, 99_950]) {
      expect(formatMoney(cents, 'USD')).toBe(fmtUsd(cents));
      expect(formatCurrencyTotal(sumByCurrency([{ currency: 'USD', cents }], (r) => r.cents))).toBe(
        fmtUsd(cents),
      );
    }
  });

  it('prints a row in its own currency', () => {
    expect(formatMoney(184_000, 'EUR')).toBe('€1,840');
    expect(formatMoney(184_000, 'GBP')).toBe('£1,840');
  });

  it('prints the mixed-currency note in place of a sum', () => {
    const total = sumByCurrency(
      [
        { currency: 'USD', cents: 100_00 },
        { currency: 'EUR', cents: 200_00 },
      ],
      (r) => r.cents,
    );
    expect(formatCurrencyTotal(total)).toBe('Mixed currencies — total unavailable (EUR, USD)');
    expect(mixedCurrenciesText(['EUR', 'USD'])).toBe(formatCurrencyTotal(total));
  });

  it('rowCurrency normalises case and blanks', () => {
    expect(rowCurrency({ currency: ' eur ' })).toBe('EUR');
    expect(rowCurrency({ currency: '' })).toBe('USD');
    expect(rowCurrency(null)).toBe('USD');
  });
});
