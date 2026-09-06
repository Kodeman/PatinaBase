import { describe, it, expect } from 'vitest';
import {
  getReminderCadence,
  isReminderDigestUser,
  DEFAULT_PREFERENCES,
} from '../preferences';
import type { NotificationPreferences } from '../types';

function makePreferences(
  overrides: Partial<NotificationPreferences> = {}
): NotificationPreferences {
  return {
    id: 'test-id',
    user_id: 'test-user',
    ...DEFAULT_PREFERENCES,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('getReminderCadence', () => {
  it('defaults to daily when unset — the quietest cadence that still answers on time', () => {
    expect(getReminderCadence(makePreferences())).toBe('daily');
  });

  it('returns each of the three named cadences', () => {
    expect(
      getReminderCadence(makePreferences({ reminder_cadence: 'right_away' }))
    ).toBe('right_away');
    expect(
      getReminderCadence(makePreferences({ reminder_cadence: 'daily' }))
    ).toBe('daily');
    expect(
      getReminderCadence(makePreferences({ reminder_cadence: 'weekly_sunday' }))
    ).toBe('weekly_sunday');
  });

  it('maps the two retired spellings forward, so an older client still reads right', () => {
    expect(getReminderCadence({ reminder_cadence: 'immediate' } as never)).toBe(
      'right_away'
    );
    expect(
      getReminderCadence({ reminder_cadence: 'daily_digest' } as never)
    ).toBe('daily');
  });

  it('falls back to daily for missing or invalid values', () => {
    expect(getReminderCadence({ reminder_cadence: undefined } as never)).toBe('daily');
    expect(getReminderCadence({ reminder_cadence: null } as never)).toBe('daily');
    expect(getReminderCadence({ reminder_cadence: 'weekly' } as never)).toBe('daily');
    expect(getReminderCadence({} as never)).toBe('daily');
  });
});

describe('isReminderDigestUser', () => {
  it('is true by default, because the default cadence batches', () => {
    expect(isReminderDigestUser(makePreferences())).toBe(true);
  });

  it('is true for both batching cadences', () => {
    expect(
      isReminderDigestUser(makePreferences({ reminder_cadence: 'daily' }))
    ).toBe(true);
    expect(
      isReminderDigestUser(makePreferences({ reminder_cadence: 'weekly_sunday' }))
    ).toBe(true);
  });

  it('is false only when she asked to be told right away', () => {
    expect(
      isReminderDigestUser(makePreferences({ reminder_cadence: 'right_away' }))
    ).toBe(false);
  });
});

describe('DEFAULT_PREFERENCES', () => {
  it('defaults reminder_cadence to daily (matches the DB default, 00572)', () => {
    expect(DEFAULT_PREFERENCES.reminder_cadence).toBe('daily');
  });
});
