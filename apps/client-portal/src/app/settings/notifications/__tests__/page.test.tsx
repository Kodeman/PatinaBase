/**
 * Tests for the client Notification settings page (app/settings/notifications/page.tsx).
 *
 * F5 — invoice-reminders cadence classification (ruling: A/R invoice
 * reminders are deliberately exempt from `reminder_cadence` — they always
 * send immediately, never deferred into the daily-summary bundle). This
 * copy-only regression test locks down that the "Reminders" section's
 * helper text explicitly scopes what "Daily summary" bundles (proposal and
 * decision reminders) and explicitly calls out invoice reminders as always
 * immediate, so a client reading it can't come away thinking an overdue
 * balance notice could get silently delayed a day.
 */
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import type { NotificationPreferences } from '@patina/shared/types';
import { useMyThreadOverrides, useUpdateThreadNotificationPref, useMuteThread } from '@patina/supabase';

import NotificationsSettingsPage from '../page';

jest.mock('@patina/supabase', () => ({
  useMyThreadOverrides: jest.fn(),
  useUpdateThreadNotificationPref: jest.fn(),
  useMuteThread: jest.fn(),
}));

const mockUseMyThreadOverrides = useMyThreadOverrides as jest.Mock;
const mockUseUpdateThreadNotificationPref = useUpdateThreadNotificationPref as jest.Mock;
const mockUseMuteThread = useMuteThread as jest.Mock;

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

describe('NotificationsSettingsPage — Reminders section copy', () => {
  beforeEach(() => {
    mockUseMyThreadOverrides.mockReturnValue({ data: [], isLoading: false });
    mockUseUpdateThreadNotificationPref.mockReturnValue({ mutate: jest.fn() });
    mockUseMuteThread.mockReturnValue({ mutate: jest.fn() });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => makePrefs(),
    }) as unknown as typeof fetch;
  });

  it('explicitly scopes "Daily summary" bundling to proposal/decision reminders and calls out invoice reminders as always-immediate', async () => {
    render(<NotificationsSettingsPage />);

    await waitFor(() => expect(screen.getByText('Reminders')).toBeInTheDocument());

    // The bundling claim must name what it bundles — not a bare "reminders"
    // that a reader could take to include invoice/payment reminders.
    expect(
      screen.getByText(/bundles non-urgent proposal and decision reminders/i),
    ).toBeInTheDocument();

    // Invoice reminders must be named explicitly as always-immediate, not
    // left to an unscoped "time-sensitive messages" catch-all.
    expect(screen.getByText(/invoice reminder/i)).toBeInTheDocument();
  });
});
