/**
 * PP-2 — one date style, now on the Desk too.
 *
 * The same pair H6 gave the client's threshold, in the same shapes and the same
 * locale, so a designer and her client read a deadline the same way.
 */

import {
  DAY_MONTH_FORMAT,
  MONTH_NAME_FORMAT,
  WEEKDAY_FORMAT,
  dayMonth,
  legalDate,
  parseSourceDate,
} from '../dates';

describe('legalDate — the day a paper is dated by', () => {
  it('prints day, month, year', () => {
    expect(legalDate(new Date(2026, 8, 11))).toBe('11 September 2026');
  });

  it('reads a date-only string in the studio’s own calendar', () => {
    // UTC midnight would print as 10 September anywhere west of Greenwich.
    expect(legalDate('2026-09-11')).toBe('11 September 2026');
  });

  it('reads a full timestamp', () => {
    expect(legalDate(new Date(2026, 0, 1, 9, 30).toISOString())).toBe(
      '1 January 2026',
    );
  });

  it('holds the first of the month and the last of the year', () => {
    expect(legalDate('2026-01-01')).toBe('1 January 2026');
    expect(legalDate('2026-12-31')).toBe('31 December 2026');
  });

  it('is silent on null, undefined and an unreadable date', () => {
    expect(legalDate(null)).toBeNull();
    expect(legalDate(undefined)).toBeNull();
    expect(legalDate('')).toBeNull();
    expect(legalDate('not a date')).toBeNull();
    expect(legalDate(new Date(Number.NaN))).toBeNull();
  });
});

describe('dayMonth — the day inside a sentence', () => {
  it('prints day and month, and no year', () => {
    expect(dayMonth(new Date(2026, 8, 11))).toBe('11 September');
  });

  it('reads a date-only string in the studio’s own calendar', () => {
    expect(dayMonth('2026-09-11')).toBe('11 September');
  });

  it('holds a month boundary', () => {
    expect(dayMonth('2026-03-01')).toBe('1 March');
    expect(dayMonth('2026-02-28')).toBe('28 February');
  });

  it('is silent on null, undefined and an unreadable date', () => {
    expect(dayMonth(null)).toBeNull();
    expect(dayMonth(undefined)).toBeNull();
    expect(dayMonth('not a date')).toBeNull();
    expect(dayMonth(new Date(Number.NaN))).toBeNull();
  });
});

describe('the Desk prints one date style', () => {
  it('never prints the month before the day', () => {
    for (const printed of [legalDate('2026-09-11'), dayMonth('2026-09-11')]) {
      expect(printed).not.toBeNull();
      expect(printed as string).toMatch(/^11 September/);
    }
  });

  it('formats through the same day-and-month tool the helper uses', () => {
    expect(DAY_MONTH_FORMAT.format(new Date(2026, 8, 11))).toBe('11 September');
  });

  it('spells a month standing alone without a day or a year', () => {
    expect(MONTH_NAME_FORMAT.format(new Date(2026, 8, 11))).toBe('September');
  });

  it('spells the weekday the greeting says', () => {
    expect(WEEKDAY_FORMAT.format(new Date(2026, 8, 11))).toBe('Friday');
  });
});

describe('parseSourceDate', () => {
  it('builds a date-only string from its local parts', () => {
    const parsed = parseSourceDate('2026-09-11');
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(8);
    expect(parsed?.getDate()).toBe(11);
  });

  it('is null on nothing and on an unreadable string', () => {
    expect(parseSourceDate(null)).toBeNull();
    expect(parseSourceDate(undefined)).toBeNull();
    expect(parseSourceDate('')).toBeNull();
    expect(parseSourceDate('nope')).toBeNull();
  });
});
