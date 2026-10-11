import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calendarDaysPast } from '../calendar-days';

describe('calendarDaysPast', () => {
  const originalTimezone = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/Chicago';
  });
  afterAll(() => {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  });

  it('counts bare dates by the viewer’s local calendar day', () => {
    expect(calendarDaysPast('2026-09-28', new Date('2026-10-10T00:50:00Z'))).toBe(11);
    expect(calendarDaysPast('2026-09-28', new Date('2026-10-10T05:30:00Z'))).toBe(12);
  });
});

describe('calendarDaysPast — timestamps read as the local day (SQ-751 F10)', () => {
  const originalTimezone = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/Los_Angeles';
  });
  afterAll(() => {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  });

  it('the review probe: a UTC-tomorrow timestamp on the same Los Angeles day is today, not tomorrow', () => {
    const now = new Date('2026-10-10T18:00:00-07:00');
    expect(calendarDaysPast('2026-10-11T01:00:00Z', now)).toBe(0);
  });

  it('a bare DATE keeps its day: 2026-10-11 is tomorrow in Los Angeles that evening', () => {
    expect(calendarDaysPast('2026-10-11', new Date('2026-10-10T18:00:00-07:00'))).toBe(-1);
  });
});
