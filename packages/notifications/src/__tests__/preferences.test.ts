import { describe, it, expect } from 'vitest';
import {
  isTypeEnabled,
  isChannelEnabled,
  isQuietHours,
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

describe('isTypeEnabled', () => {
  it('returns true for transactional types regardless of preferences', () => {
    const prefs = makePreferences({ type_account_security: false });
    expect(isTypeEnabled(prefs, 'account_verification')).toBe(true);
    expect(isTypeEnabled(prefs, 'password_reset')).toBe(true);
    expect(isTypeEnabled(prefs, 'security_alert')).toBe(true);
    expect(isTypeEnabled(prefs, 'order_confirmation')).toBe(true);
    expect(isTypeEnabled(prefs, 'payment_receipt')).toBe(true);
  });

  it('returns true when type preference is enabled', () => {
    const prefs = makePreferences({ type_new_lead: true });
    expect(isTypeEnabled(prefs, 'new_lead_designer')).toBe(true);
  });

  it('returns false when type preference is disabled', () => {
    const prefs = makePreferences({ type_new_lead: false });
    expect(isTypeEnabled(prefs, 'new_lead_designer')).toBe(false);
  });

  it('returns false when price_drop is disabled', () => {
    const prefs = makePreferences({ type_price_drop: false });
    expect(isTypeEnabled(prefs, 'price_drop')).toBe(false);
  });

  it('returns true for unknown types (defaults to enabled)', () => {
    const prefs = makePreferences();
    // @ts-expect-error Testing unknown type
    expect(isTypeEnabled(prefs, 'some_future_type')).toBe(true);
  });
});

describe('isChannelEnabled', () => {
  it('returns true when channel is enabled', () => {
    const prefs = makePreferences({ channels_email: true });
    expect(isChannelEnabled(prefs, 'email')).toBe(true);
  });

  it('returns false when channel is disabled', () => {
    const prefs = makePreferences({ channels_push: false });
    expect(isChannelEnabled(prefs, 'push')).toBe(false);
  });

  it('sms defaults to disabled', () => {
    const prefs = makePreferences();
    expect(isChannelEnabled(prefs, 'sms')).toBe(false);
  });
});

describe('isQuietHours', () => {
  it('returns false when quiet hours are disabled', () => {
    const prefs = makePreferences({ quiet_hours_enabled: false });
    expect(isQuietHours(prefs)).toBe(false);
  });

  it('returns true during overnight quiet hours (22:00-08:00)', () => {
    const prefs = makePreferences({
      quiet_hours_enabled: true,
      quiet_hours_start: '22:00',
      quiet_hours_end: '08:00',
      timezone: 'UTC',
    });

    // 23:00 UTC — within quiet hours
    const lateNight = new Date('2026-03-03T23:00:00Z');
    expect(isQuietHours(prefs, lateNight)).toBe(true);

    // 02:00 UTC — within quiet hours
    const earlyMorning = new Date('2026-03-03T02:00:00Z');
    expect(isQuietHours(prefs, earlyMorning)).toBe(true);
  });

  it('returns false outside overnight quiet hours', () => {
    const prefs = makePreferences({
      quiet_hours_enabled: true,
      quiet_hours_start: '22:00',
      quiet_hours_end: '08:00',
      timezone: 'UTC',
    });

    // 12:00 UTC — outside quiet hours
    const midday = new Date('2026-03-03T12:00:00Z');
    expect(isQuietHours(prefs, midday)).toBe(false);
  });

  it('handles same-day quiet hours (e.g. 13:00-15:00)', () => {
    const prefs = makePreferences({
      quiet_hours_enabled: true,
      quiet_hours_start: '13:00',
      quiet_hours_end: '15:00',
      timezone: 'UTC',
    });

    const during = new Date('2026-03-03T14:00:00Z');
    expect(isQuietHours(prefs, during)).toBe(true);

    const before = new Date('2026-03-03T12:00:00Z');
    expect(isQuietHours(prefs, before)).toBe(false);

    const after = new Date('2026-03-03T16:00:00Z');
    expect(isQuietHours(prefs, after)).toBe(false);
  });
});
