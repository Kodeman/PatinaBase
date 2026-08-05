import { fmtDay, formatCalendarDate, todayYmd, tomorrowYmd } from '../format';

describe('Document date-only formatting', () => {
  it('keeps an install hard date on the selected calendar day', () => {
    expect(fmtDay('2026-11-15')).toBe('Nov 15');
  });

  it('derives today from local calendar parts rather than UTC', () => {
    // 8:00 PM Jul 31 in America/Chicago, but already Aug 1 in UTC.
    expect(todayYmd(new Date('2026-08-01T01:00:00.000Z'))).toBe('2026-07-31');
  });

  it('prefills deadline extensions with the next local calendar day', () => {
    expect(tomorrowYmd(new Date('2026-08-01T01:00:00.000Z'))).toBe('2026-08-01');
  });
});

/**
 * formatCalendarDate exists for ONE class of value: a day somebody wrote on a
 * page. Those reach the portal in two shapes and a timezone-aware formatter
 * moves both of them west of UTC:
 *
 *   '2026-02-10'            bare date  — metadata.paperSignedOn (00425)
 *   '2026-02-10T00:00:00Z'  midnight   — trade_scope_terms.accepted_at, which
 *                                        record_paper_trade_acceptance writes
 *                                        as `p_paper_signed_on::timestamptz`
 *
 * The suite runs in a NEGATIVE-OFFSET zone on purpose: in UTC the bug is
 * invisible and every implementation passes.
 */
describe('formatCalendarDate', () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/Chicago';
  });

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('holds a bare calendar date on its own day', () => {
    expect(formatCalendarDate('2026-02-10')).toBe('Feb 10, 2026');
  });

  it('holds a midnight-UTC timestamp on its own day', () => {
    expect(formatCalendarDate('2026-02-10T00:00:00Z')).toBe('Feb 10, 2026');
  });

  it('is exactly the day a timezone-aware read loses', () => {
    // What `when` in project-commerce.ts does with the same value — correct for
    // a MOMENT, wrong for a DAY. The two are not interchangeable.
    expect(
      new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date('2026-02-10T00:00:00Z')),
    ).toBe('Feb 9, 2026');
    expect(formatCalendarDate('2026-02-10T00:00:00Z')).toBe('Feb 10, 2026');
  });

  it('survives a DST boundary in both directions', () => {
    // 2026 US transitions: 8 March (spring forward), 1 November (fall back).
    expect(formatCalendarDate('2026-03-08')).toBe('Mar 8, 2026');
    expect(formatCalendarDate('2026-11-01')).toBe('Nov 1, 2026');
  });

  it('answers null for nothing, rather than inventing a day', () => {
    expect(formatCalendarDate(undefined)).toBeNull();
    expect(formatCalendarDate(null)).toBeNull();
    expect(formatCalendarDate('')).toBeNull();
    expect(formatCalendarDate('not a date')).toBeNull();
  });
});
