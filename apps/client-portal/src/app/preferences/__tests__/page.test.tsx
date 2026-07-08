/**
 * Tests for the client Preferences page (app/preferences/page.tsx).
 *
 * F5 — invoice-reminders cadence classification (ruling: A/R invoice
 * reminders are deliberately exempt from `reminder_cadence` — they always
 * send immediately, never deferred into the daily-summary bundle). Same
 * copy-precision regression as the settings/notifications page test: the
 * "Reminders" section here must explicitly name invoice reminders as
 * always-immediate rather than relying on an unscoped "time-sensitive
 * messages" catch-all a reader could read either way.
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { NotificationPreferences } from '@patina/shared/types';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';

import PreferencesPage from '../page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@patina/supabase', () => ({
  useNotificationPreferences: jest.fn(),
  useUpdateNotificationPreferences: jest.fn(),
}));

const mockUseAuth = useAuth as jest.Mock;
const mockUseNotificationPreferences = useNotificationPreferences as jest.Mock;
const mockUseUpdateNotificationPreferences = useUpdateNotificationPreferences as jest.Mock;

function makePrefs(overrides: Partial<NotificationPreferences> = {}): NotificationPreferences {
  return {
    id: 'pref-1',
    user_id: 'user-1',
    channels_email: true,
    channels_push: true,
    channels_in_app: true,
    channels_sms: false,
    type_new_lead: false,
    type_lead_expiring: false,
    type_lead_response: false,
    type_client_message: true,
    type_project_milestone: true,
    type_commission_earned: false,
    type_new_products: false,
    type_teaching_reminder: false,
    type_price_drop: true,
    type_back_in_stock: true,
    type_wishlist_update: true,
    type_account_security: true,
    type_order_confirmation: true,
    type_payment_receipt: true,
    type_weekly_inspiration: true,
    type_founding_circle: true,
    type_product_launch: true,
    type_seasonal_campaign: true,
    type_reengagement: true,
    digest_frequency: 'never',
    reminder_cadence: 'immediate',
    quiet_hours_enabled: false,
    quiet_hours_start: '21:00',
    quiet_hours_end: '08:00',
    timezone: 'America/New_York',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as NotificationPreferences;
}

describe('PreferencesPage — Reminders section copy', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    mockUseNotificationPreferences.mockReturnValue({
      data: makePrefs(),
      isLoading: false,
      error: null,
    });
    mockUseUpdateNotificationPreferences.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
      error: null,
    });
  });

  it('names invoice reminders explicitly as always-immediate, not just an unscoped "time-sensitive" claim', () => {
    render(<PreferencesPage />);

    expect(screen.getByText('Reminders')).toBeInTheDocument();
    expect(screen.getByText(/invoice reminders/i)).toBeInTheDocument();
    expect(
      screen.getByText(/always arrive right away, regardless of this setting/i),
    ).toBeInTheDocument();
  });
});
