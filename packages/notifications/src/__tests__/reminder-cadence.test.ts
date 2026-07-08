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
  it('defaults to immediate when unset', () => {
    expect(getReminderCadence(makePreferences())).toBe('immediate');
  });

  it('returns daily_digest when explicitly set', () => {
    expect(
      getReminderCadence(makePreferences({ reminder_cadence: 'daily_digest' }))
    ).toBe('daily_digest');
  });

  it('falls back to immediate for missing or invalid values', () => {
    expect(getReminderCadence({ reminder_cadence: undefined } as never)).toBe('immediate');
    expect(getReminderCadence({ reminder_cadence: null } as never)).toBe('immediate');
    expect(getReminderCadence({ reminder_cadence: 'weekly' } as never)).toBe('immediate');
    expect(getReminderCadence({} as never)).toBe('immediate');
  });
});

describe('isReminderDigestUser', () => {
  it('is false by default (immediate)', () => {
    expect(isReminderDigestUser(makePreferences())).toBe(false);
  });

  it('is true when cadence is daily_digest', () => {
    expect(
      isReminderDigestUser(makePreferences({ reminder_cadence: 'daily_digest' }))
    ).toBe(true);
  });
});

describe('DEFAULT_PREFERENCES', () => {
  it('defaults reminder_cadence to immediate (matches DB default)', () => {
    expect(DEFAULT_PREFERENCES.reminder_cadence).toBe('immediate');
  });
});
