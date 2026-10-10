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
