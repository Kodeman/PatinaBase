import { fmtDay, todayYmd, tomorrowYmd } from '../format';

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
