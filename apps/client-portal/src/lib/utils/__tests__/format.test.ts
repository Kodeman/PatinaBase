import { formatCalendarDate, formatDate } from '../format';

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
 * The suite therefore runs in a NEGATIVE-OFFSET zone, because in UTC the bug
 * is invisible and every implementation passes.
 */
describe('formatCalendarDate', () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/Los_Angeles';
  });

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('holds a bare calendar date on its own day', () => {
    expect(formatCalendarDate('2026-02-10')).toBe('February 10, 2026');
  });

  it('holds a midnight-UTC timestamp on its own day', () => {
    expect(formatCalendarDate('2026-02-10T00:00:00Z')).toBe('February 10, 2026');
  });

  it('is exactly the day formatDate loses — the off-by-one, stated', () => {
    // The timezone-aware sibling is not wrong for a MOMENT; it is wrong for a
    // DAY, and this is the proof the two are not interchangeable.
    expect(formatDate('2026-02-10T00:00:00Z')).toBe('Feb 9, 2026');
    expect(formatCalendarDate('2026-02-10T00:00:00Z')).toBe('February 10, 2026');
  });

  it('survives a DST boundary in both directions', () => {
    // 2026 US transitions: 8 March (spring forward), 1 November (fall back).
    expect(formatCalendarDate('2026-03-08')).toBe('March 8, 2026');
    expect(formatCalendarDate('2026-11-01')).toBe('November 1, 2026');
  });

  it('answers undefined for nothing, rather than inventing a day', () => {
    expect(formatCalendarDate(undefined)).toBeUndefined();
    expect(formatCalendarDate(null)).toBeUndefined();
    expect(formatCalendarDate('')).toBeUndefined();
    expect(formatCalendarDate('not a date')).toBeUndefined();
  });
});
