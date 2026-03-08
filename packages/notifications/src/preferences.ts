import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  NotificationPreferences,
  NotificationType,
} from './types';
import {
  NOTIFICATION_TYPE_TO_PREFERENCE,
  TRANSACTIONAL_TYPES,
} from './types';

/** Default preferences for new users (matches DB defaults). */
export const DEFAULT_PREFERENCES: Omit<NotificationPreferences, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
  channels_email: true,
  channels_push: true,
  channels_in_app: true,
  channels_sms: false,

  type_new_lead: true,
  type_lead_expiring: true,
  type_lead_response: true,
  type_client_message: true,
  type_project_milestone: true,
  type_commission_earned: true,
  type_new_products: true,
  type_teaching_reminder: true,
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

  digest_frequency: 'weekly',

  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00',
  timezone: 'America/New_York',
};

/**
 * Fetch user's notification preferences.
 * Falls back to defaults if no row exists (e.g. legacy user without migration).
 */
export async function getUserPreferences(
  supabase: SupabaseClient,
  userId: string
): Promise<NotificationPreferences> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error?.code === 'PGRST116' || !data) {
    // No row — return defaults with user context
    return {
      id: '',
      user_id: userId,
      ...DEFAULT_PREFERENCES,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  if (error) throw error;
  return data as NotificationPreferences;
}

/**
 * Check if a specific notification type is enabled for a user.
 * Transactional types (security, order confirmation, etc.) always return true.
 */
export function isTypeEnabled(
  preferences: NotificationPreferences,
  type: NotificationType
): boolean {
  if (TRANSACTIONAL_TYPES.includes(type)) return true;

  const prefKey = NOTIFICATION_TYPE_TO_PREFERENCE[type];
  if (!prefKey) return true; // Unknown types default to enabled

  return preferences[prefKey] as boolean;
}

/**
 * Check if a specific channel is enabled for a user.
 */
export function isChannelEnabled(
  preferences: NotificationPreferences,
  channel: 'email' | 'push' | 'in_app' | 'sms'
): boolean {
  const channelMap = {
    email: 'channels_email',
    push: 'channels_push',
    in_app: 'channels_in_app',
    sms: 'channels_sms',
  } as const;

  return preferences[channelMap[channel]];
}

/**
 * Check if the current time falls within the user's quiet hours.
 * Returns false if quiet hours are disabled.
 */
export function isQuietHours(preferences: NotificationPreferences, now?: Date): boolean {
  if (!preferences.quiet_hours_enabled) return false;

  const currentTime = now ?? new Date();

  // Convert current time to user's timezone
  const userTime = new Intl.DateTimeFormat('en-US', {
    timeZone: preferences.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(currentTime);

  const [startH, startM] = preferences.quiet_hours_start.split(':').map(Number);
  const [endH, endM] = preferences.quiet_hours_end.split(':').map(Number);
  const [nowH, nowM] = userTime.split(':').map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const nowMinutes = nowH * 60 + nowM;

  // Handle overnight quiet hours (e.g. 22:00 - 08:00)
  if (startMinutes > endMinutes) {
    return nowMinutes >= startMinutes || nowMinutes < endMinutes;
  }

  // Same-day quiet hours (e.g. 13:00 - 15:00)
  return nowMinutes >= startMinutes && nowMinutes < endMinutes;
}
