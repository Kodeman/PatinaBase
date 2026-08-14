/**
 * Date Instruments · calendar contract. Pins the weekday numbering (epoch 0
 * is Thursday), workday stepping (Mon–Fri, Fri/Sat/Sun all land on the
 * following Monday), the inclusive workday-count formula, and the
 * fixed-shape 6×7 month grid — so a future edit to the epoch-day core
 * (`./schedule.ts`) or to this file can't silently reshape what a month view
 * or a "N business days" computation renders.
 *
 * ISO test dates are anchored to a single verified reference point (given by
 * the program: 2026-08-14 is a Friday) and walked forward/backward with
 * `epochDayFromISO`, the same building block `calendar.ts` itself is built
 * on — this file never hardcodes a second, unverified day-of-week table.
 */

import {
  weekdayFromEpochDay,
  isWorkday,
  nextWorkday,
  workdaysBetween,
  addWorkdaysISO,
  workdaysBetweenISO,
  monthGrid,
  monthOf,
  addMonths,
} from './calendar';
import { epochDayFromISO } from './schedule';

function epoch(iso: string): number {
  const e = epochDayFromISO(iso);
  if (e == null) throw new Error(`test setup: "${iso}" is not a valid ISO date`);
  return e;
}

// ═══════════════════════════════════════════════════════════════════════════
// weekdayFromEpochDay
// ═══════════════════════════════════════════════════════════════════════════

describe('weekdayFromEpochDay', () => {
  it('epoch 0 (1970-01-01) is a Thursday', () => {
    expect(weekdayFromEpochDay(0)).toBe(4);
  });

  it('2026-08-14 is a Friday', () => {
    expect(weekdayFromEpochDay(epoch('2026-08-14'))).toBe(5);
  });

  it('is stable across the Fri/Sat/Sun/Mon run anchoring the rest of this file', () => {
    expect(weekdayFromEpochDay(epoch('2026-08-15'))).toBe(6); // Sat
    expect(weekdayFromEpochDay(epoch('2026-08-16'))).toBe(0); // Sun
    expect(weekdayFromEpochDay(epoch('2026-08-17'))).toBe(1); // Mon
  });

  it('handles a negative epoch day (before 1970-01-01) via the normalized modulo', () => {
    // epoch -1 = 1969-12-31, a Wednesday.
    expect(weekdayFromEpochDay(-1)).toBe(3);
  });

  it('throws RangeError on non-finite input', () => {
    expect(() => weekdayFromEpochDay(-Infinity)).toThrow(RangeError);
    expect(() => weekdayFromEpochDay(Infinity)).toThrow(RangeError);
    expect(() => weekdayFromEpochDay(NaN)).toThrow(RangeError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// isWorkday
// ═══════════════════════════════════════════════════════════════════════════

describe('isWorkday', () => {
  it('Monday through Friday are workdays', () => {
    expect(isWorkday(epoch('2026-08-17'))).toBe(true); // Mon
    expect(isWorkday(epoch('2026-08-21'))).toBe(true); // Fri
  });

  it('Saturday and Sunday are not', () => {
    expect(isWorkday(epoch('2026-08-15'))).toBe(false); // Sat
    expect(isWorkday(epoch('2026-08-16'))).toBe(false); // Sun
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// nextWorkday
// ═══════════════════════════════════════════════════════════════════════════

describe('nextWorkday', () => {
  it('from Friday → the following Monday', () => {
    expect(nextWorkday(epoch('2026-08-14'))).toBe(epoch('2026-08-17'));
  });

  it('from Saturday → the following Monday', () => {
    expect(nextWorkday(epoch('2026-08-15'))).toBe(epoch('2026-08-17'));
  });

  it('from Sunday → the following Monday', () => {
    expect(nextWorkday(epoch('2026-08-16'))).toBe(epoch('2026-08-17'));
  });

  it('from Monday → Tuesday, strictly after even though Monday is itself a workday', () => {
    expect(nextWorkday(epoch('2026-08-17'))).toBe(epoch('2026-08-18'));
  });

  it('throws RangeError on non-finite input instead of looping forever', () => {
    expect(() => nextWorkday(NaN)).toThrow(RangeError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// workdaysBetween
// ═══════════════════════════════════════════════════════════════════════════

describe('workdaysBetween', () => {
  it('inclusive Mon–Fri span → 5', () => {
    expect(workdaysBetween(epoch('2026-08-17'), epoch('2026-08-21'))).toBe(5);
  });

  it('reversed range → 0', () => {
    expect(workdaysBetween(epoch('2026-08-21'), epoch('2026-08-17'))).toBe(0);
  });

  it('same-day workday → 1', () => {
    expect(workdaysBetween(epoch('2026-08-17'), epoch('2026-08-17'))).toBe(1);
  });

  it('same-day weekend → 0', () => {
    expect(workdaysBetween(epoch('2026-08-15'), epoch('2026-08-15'))).toBe(0);
  });

  it('pure weekend span (Sat–Sun) → 0', () => {
    expect(workdaysBetween(epoch('2026-08-15'), epoch('2026-08-16'))).toBe(0);
  });

  it('a multi-week span still lands on the closed-form full-week count', () => {
    // Mon 2026-08-17 .. Fri 2026-08-28: two full weeks (Mon–Fri each) inclusive.
    expect(workdaysBetween(epoch('2026-08-17'), epoch('2026-08-28'))).toBe(10);
  });

  it('throws RangeError on non-finite input', () => {
    expect(() => workdaysBetween(NaN, epoch('2026-08-21'))).toThrow(RangeError);
    expect(() => workdaysBetween(epoch('2026-08-17'), NaN)).toThrow(RangeError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// addWorkdaysISO
// ═══════════════════════════════════════════════════════════════════════════

describe('addWorkdaysISO', () => {
  it('n=0 on a workday → the same date', () => {
    expect(addWorkdaysISO('2026-08-17', 0)).toBe('2026-08-17'); // Mon
  });

  it('n=0 on a Saturday → the next workday (Monday)', () => {
    expect(addWorkdaysISO('2026-08-15', 0)).toBe('2026-08-17');
  });

  it('crosses a weekend: Friday + 1 workday step → the following Monday', () => {
    expect(addWorkdaysISO('2026-08-14', 1)).toBe('2026-08-17');
  });

  it('crosses two weekends over a longer run', () => {
    // Fri 08-14 is step 0; +1..+5 walks Mon 17 .. Fri 21.
    expect(addWorkdaysISO('2026-08-14', 5)).toBe('2026-08-21');
  });

  it('non-workday start with n>0: Saturday anchors to Monday (step 0), then steps further', () => {
    // Sat 08-15 → step0 Mon 17 → step1 Tue 18 → step2 Wed 19.
    expect(addWorkdaysISO('2026-08-15', 2)).toBe('2026-08-19');
  });

  it('non-workday start (Sunday) with n>0 crossing another weekend', () => {
    // Sun 08-16 → step0 Mon 17 → 1..4 Tue..Fri → 5 crosses the weekend to Mon 24.
    expect(addWorkdaysISO('2026-08-16', 5)).toBe('2026-08-24');
  });

  it('negative n does not step backward — floored to 0 additional steps', () => {
    expect(addWorkdaysISO('2026-08-17', -3)).toBe('2026-08-17'); // Mon, already a workday
  });

  it('malformed iso → null', () => {
    expect(addWorkdaysISO('not-a-date', 3)).toBeNull();
    expect(addWorkdaysISO('2026-13-01', 1)).toBeNull(); // month 13
    expect(addWorkdaysISO('2026-02-30', 0)).toBeNull(); // impossible calendar date
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// workdaysBetweenISO
// ═══════════════════════════════════════════════════════════════════════════

describe('workdaysBetweenISO', () => {
  it('inclusive workday count between two ISO dates', () => {
    expect(workdaysBetweenISO('2026-08-17', '2026-08-21')).toBe(5);
  });

  it('malformed a or b → null', () => {
    expect(workdaysBetweenISO('bad', '2026-08-21')).toBeNull();
    expect(workdaysBetweenISO('2026-08-17', 'bad')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// monthGrid
// ═══════════════════════════════════════════════════════════════════════════

describe('monthGrid', () => {
  it('a leap February (2028-02, 29 days) places every day of the month, all inMonth', () => {
    const grid = monthGrid(2028, 2);
    const febCells = grid.weeks.flat().filter((c) => c.iso.startsWith('2028-02'));
    expect(febCells).toHaveLength(29);
    expect(febCells.every((c) => c.inMonth)).toBe(true);
  });

  it('is always 6 rows × 7 cols across a spread of months, including a 28-day Feb that starts exactly on the week start', () => {
    // 2026-02-01 is a Sunday (28-day, non-leap Feb) — with the default
    // weekStartsOn=0 the grid's first cell IS the 1st, no leading days.
    const months: Array<[number, number]> = [
      [2026, 1],
      [2026, 2],
      [2026, 8],
      [2027, 12],
      [2028, 2],
    ];
    for (const [year, month] of months) {
      const grid = monthGrid(year, month);
      expect(grid.weeks).toHaveLength(6);
      for (const row of grid.weeks) expect(row).toHaveLength(7);
    }

    const feb2026 = monthGrid(2026, 2);
    expect(feb2026.weeks[0][0].iso).toBe('2026-02-01');
    expect(feb2026.weeks[0][0].weekday).toBe(0);
    const febCells = feb2026.weeks.flat().filter((c) => c.iso.startsWith('2026-02'));
    expect(febCells).toHaveLength(28);
    expect(febCells.every((c) => c.inMonth)).toBe(true);
  });

  it('weekStartsOn=1 shifts the grid to start on Monday, with leading out-of-month cells', () => {
    // Same 2026-02 (1st is a Sunday): a Monday-start grid leads with the
    // preceding Mon–Sat (2026-01-26 .. 2026-01-31), not the 1st itself.
    const grid = monthGrid(2026, 2, 1);
    expect(grid.weeks[0][0].iso).toBe('2026-01-26');
    expect(grid.weeks[0][0].weekday).toBe(1);
    expect(grid.weeks[0][0].inMonth).toBe(false);
    const febCells = grid.weeks.flat().filter((c) => c.iso.startsWith('2026-02'));
    expect(febCells).toHaveLength(28);
    expect(febCells.every((c) => c.inMonth)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// monthOf
// ═══════════════════════════════════════════════════════════════════════════

describe('monthOf', () => {
  it('reads year and month off a valid ISO date', () => {
    expect(monthOf('2026-08-14')).toEqual({ year: 2026, month: 8 });
  });

  it('is total: garbage input → null', () => {
    expect(monthOf('not-a-date')).toBeNull();
    expect(monthOf('')).toBeNull();
    expect(monthOf('2026-13-01')).toBeNull(); // month 13
    expect(monthOf('2026-02-30')).toBeNull(); // impossible calendar date
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// addMonths
// ═══════════════════════════════════════════════════════════════════════════

describe('addMonths', () => {
  it('rolls backward across a year boundary', () => {
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it('rolls forward across a year boundary', () => {
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });

  it('delta 0 is a no-op', () => {
    expect(addMonths(2026, 5, 0)).toEqual({ year: 2026, month: 5 });
  });

  it('a multi-month delta that stays within the year does not roll', () => {
    expect(addMonths(2026, 3, 4)).toEqual({ year: 2026, month: 7 });
  });
});
