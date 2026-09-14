/**
 * HT-13-a (RULED 2026-09-13, resolving W7-R3-02) — the day she named is the day
 * the ledger reports.
 *
 * An entry logged with a DATE and no time — the Hours add row, the ⌘K verb, the
 * Field sheet when backdated — is filed at 12:00 UTC of the named day, so
 * `(started_at AT TIME ZONE 'UTC')::date` (the ledger's `day`, and with it the
 * scope lens, the CSV and the statement) equals the day the member named in
 * every studio timezone between UTC−11 and UTC+11.
 *
 * The falsifier: the shape this replaced carried the member's LOCAL time of day
 * onto the day she named, so an hour named `2026-09-01` at 19:30 America/Chicago
 * was stored `2026-09-02T00:30Z` — her own Hours list said Sep 1 and every
 * studio-scoped read said Sep 2, for five hours every night. `next/jest` loads
 * the app's `.env`, which pins `TZ=America/Chicago`, so the local-clock cases
 * below would have caught exactly that.
 */

jest.mock('@patina/supabase', () => ({
  useMyRateRoles: () => ({ data: [] }),
}));
jest.mock('@/hooks/use-commercial-documents', () => ({
  useProjectBillingAuthority: () => ({ data: null, isLoading: false, isError: false }),
}));

import {
  isDayValue,
  isoDateValue,
  startedAtFromDateValue,
} from '../time-capture';

describe('startedAtFromDateValue (HT-13-a)', () => {
  it('files a named day at noon UTC, whatever the clock says', () => {
    // 19:30 local on the day AFTER the one she named — the exact instant the
    // old local-clock shape crossed UTC midnight and moved her hour a day on.
    const evening = new Date('2026-09-02T00:30:00.000Z');
    expect(startedAtFromDateValue('2026-09-01', evening)).toBe(
      '2026-09-01T12:00:00.000Z',
    );

    // …and the same answer from the other end of the day.
    const dawn = new Date('2026-09-01T06:15:00.000Z');
    expect(startedAtFromDateValue('2026-09-01', dawn)).toBe(
      '2026-09-01T12:00:00.000Z',
    );
  });

  it('reports the same calendar day at both edges of the ruled band', () => {
    const at = startedAtFromDateValue(
      '2026-09-01',
      new Date('2026-09-01T23:00:00.000Z'),
    );
    const instant = new Date(at);
    for (const timeZone of ['Pacific/Midway', 'Pacific/Noumea']) {
      // UTC−11 and UTC+11. Both must still read 2026-09-01.
      const local = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(instant);
      expect(local).toBe('2026-09-01');
    }
  });

  it('handles a leap day and a year boundary without drifting', () => {
    expect(startedAtFromDateValue('2028-02-29')).toBe('2028-02-29T12:00:00.000Z');
    expect(startedAtFromDateValue('2026-12-31')).toBe('2026-12-31T12:00:00.000Z');
    expect(startedAtFromDateValue('2027-01-01')).toBe('2027-01-01T12:00:00.000Z');
  });

  it('falls back to now for a value that is not a day, which the doors gate out first', () => {
    const now = new Date('2026-09-01T18:45:00.000Z');
    expect(isDayValue('')).toBe(false);
    expect(startedAtFromDateValue('', now)).toBe(now.toISOString());
  });
});

describe('isoDateValue', () => {
  it('reads the LOCAL calendar day, which is what a date field shows her', () => {
    // 07:00 America/Chicago on Sep 1 — the same instant is Sep 1 in UTC too,
    // so this pins the format rather than the zone.
    expect(isoDateValue(new Date('2026-09-01T12:00:00.000Z'))).toBe('2026-09-01');
  });
});
