import {
  deriveCeremonyScheduleState,
  offeredSlotsAreFresh,
  firstNameOf,
  fmtCeremonySlot,
  type CeremonyScheduleInput,
} from '../ceremony-schedule';

const NOW = new Date('2026-07-16T12:00:00Z');

const slot = (id: string, iso: string) => ({ id, starts_at: iso, duration_minutes: 45 });

describe('offeredSlotsAreFresh', () => {
  it('is false for an empty slot list', () => {
    expect(offeredSlotsAreFresh([], NOW)).toBe(false);
    expect(offeredSlotsAreFresh(null, NOW)).toBe(false);
    expect(offeredSlotsAreFresh(undefined, NOW)).toBe(false);
  });

  it('is true when at least one slot is still in the future', () => {
    const slots = [slot('a', '2026-07-10T14:00:00Z'), slot('b', '2026-07-20T14:00:00Z')];
    expect(offeredSlotsAreFresh(slots, NOW)).toBe(true);
  });

  it('is false when every slot has passed', () => {
    const slots = [slot('a', '2026-07-10T14:00:00Z'), slot('b', '2026-07-14T14:00:00Z')];
    expect(offeredSlotsAreFresh(slots, NOW)).toBe(false);
  });

  it('treats a slot exactly at `now` as past (strict future)', () => {
    expect(offeredSlotsAreFresh([slot('a', NOW.toISOString())], NOW)).toBe(false);
  });
});

describe('deriveCeremonyScheduleState', () => {
  it('is "none" when there is no ceremony', () => {
    expect(deriveCeremonyScheduleState(null, NOW)).toEqual({ kind: 'none' });
    expect(deriveCeremonyScheduleState(undefined, NOW)).toEqual({ kind: 'none' });
  });

  it('is "none" for a draft (never sent) ceremony', () => {
    const ceremony: CeremonyScheduleInput = {
      state: 'draft',
      offered_slots: [slot('a', '2026-07-20T14:00:00Z')],
      picked_slot_starts_at: null,
    };
    expect(deriveCeremonyScheduleState(ceremony, NOW)).toEqual({ kind: 'none' });
  });

  it('is "picked" with the booked time when state is picked', () => {
    const ceremony: CeremonyScheduleInput = {
      state: 'picked',
      offered_slots: [slot('a', '2026-07-20T14:00:00Z'), slot('b', '2026-07-21T14:00:00Z')],
      picked_slot_starts_at: '2026-07-21T14:00:00Z',
    };
    expect(deriveCeremonyScheduleState(ceremony, NOW)).toEqual({
      kind: 'picked',
      startsAt: '2026-07-21T14:00:00Z',
    });
  });

  it('degrades a "picked" ceremony with no stamped time to "none" defensively', () => {
    const ceremony: CeremonyScheduleInput = {
      state: 'picked',
      offered_slots: [],
      picked_slot_starts_at: null,
    };
    expect(deriveCeremonyScheduleState(ceremony, NOW)).toEqual({ kind: 'none' });
  });

  it('is "offered-fresh" when sent with a future slot', () => {
    const slots = [slot('a', '2026-07-20T14:00:00Z'), slot('b', '2026-07-21T10:30:00Z')];
    const ceremony: CeremonyScheduleInput = {
      state: 'sent',
      offered_slots: slots,
      picked_slot_starts_at: null,
    };
    expect(deriveCeremonyScheduleState(ceremony, NOW)).toEqual({ kind: 'offered-fresh', slots });
  });

  it('is "offered-stale" when sent but every slot has passed', () => {
    const slots = [slot('a', '2026-07-01T14:00:00Z'), slot('b', '2026-07-02T10:30:00Z')];
    const ceremony: CeremonyScheduleInput = {
      state: 'sent',
      offered_slots: slots,
      picked_slot_starts_at: null,
    };
    expect(deriveCeremonyScheduleState(ceremony, NOW)).toEqual({ kind: 'offered-stale', slots });
  });

  it('is "none" when sent with an empty offer (nothing to render either state honestly)', () => {
    const ceremony: CeremonyScheduleInput = {
      state: 'sent',
      offered_slots: [],
      picked_slot_starts_at: null,
    };
    expect(deriveCeremonyScheduleState(ceremony, NOW)).toEqual({ kind: 'none' });
  });
});

describe('firstNameOf', () => {
  it('takes the first token of a full name', () => {
    expect(firstNameOf('Elena Vasquez')).toBe('Elena');
  });

  it('handles a single-token name', () => {
    expect(firstNameOf('Elena')).toBe('Elena');
  });

  it('falls back to "them" for empty/null/whitespace-only names', () => {
    expect(firstNameOf(null)).toBe('them');
    expect(firstNameOf(undefined)).toBe('them');
    expect(firstNameOf('   ')).toBe('them');
    expect(firstNameOf('')).toBe('them');
  });
});

describe('fmtCeremonySlot', () => {
  it('formats "Day, Mon DD · H:MM AM" in the given timezone', () => {
    // 19:00 UTC = 2:00 PM in America/Chicago (UTC-5, July = CDT).
    expect(fmtCeremonySlot('2026-07-23T19:00:00Z', 'America/Chicago')).toBe('Thu, Jul 23 · 2:00 PM');
  });

  it('shifts the calendar day across a timezone boundary', () => {
    // 02:00 UTC on the 24th = 7:00 PM on the 23rd in Chicago.
    expect(fmtCeremonySlot('2026-07-24T02:00:00Z', 'America/Chicago')).toBe('Thu, Jul 23 · 9:00 PM');
  });

  it('falls back gracefully on an invalid timestamp', () => {
    expect(fmtCeremonySlot('not-a-date', 'America/Chicago')).toBe('');
  });

  it('does not throw on a null/empty timezone (defensive fallback)', () => {
    expect(() => fmtCeremonySlot('2026-07-23T19:00:00Z', null)).not.toThrow();
    expect(() => fmtCeremonySlot('2026-07-23T19:00:00Z', '')).not.toThrow();
  });
});
