import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  NotificationType,
  NotificationChannel,
  NotificationPriority,
  NotifyOptions,
  NotificationResult,
} from './types';
import { TRANSACTIONAL_TYPES } from './types';
import { getUserPreferences, isTypeEnabled, isChannelEnabled, isQuietHours } from './preferences';
import type { NotificationQueue } from './queue';
import { createEdgeFunctionQueue } from './queue';

/** Map notification types to their default email template. */
const TYPE_TO_TEMPLATE: Partial<Record<NotificationType, string>> = {
  account_verification: 'welcome-verification',
  password_reset: 'password-reset',
  security_alert: 'security-alert',
  new_lead_designer: 'new-lead-designer',
  lead_expiring: 'lead-expiring',
  client_confirmation: 'client-confirmation',
  order_confirmation: 'order-confirmation',
  payment_receipt: 'payment-receipt',
  price_drop: 'price-drop',
  back_in_stock: 'back-in-stock',
  weekly_inspiration: 'weekly-inspiration',
  founding_circle_update: 'founding-circle-update',
  product_launch: 'campaign-product-launch',
  seasonal_campaign: 'campaign-seasonal',
  maker_spotlight: 'campaign-maker-spotlight',
  reengagement: 'campaign-reengagement',
};

/** Default channels per notification type. */
const DEFAULT_CHANNELS: Record<string, NotificationChannel[]> = {
  // Transactional — email only
  account_verification: ['email'],
  password_reset: ['email'],
  security_alert: ['email', 'push'],
  order_confirmation: ['email'],
  payment_receipt: ['email'],
  // Designer alerts — email + push + in_app
  new_lead_designer: ['email', 'push', 'in_app'],
  lead_expiring: ['email', 'push'],
  lead_response: ['email', 'in_app'],
  // Client communication
  client_confirmation: ['email'],
  client_message: ['email', 'push', 'in_app'],
  project_milestone: ['email', 'in_app'],
  commission_earned: ['email', 'push'],
  // Catalog
  new_products: ['email'],
  teaching_reminder: ['in_app'],
  // Consumer
  price_drop: ['email', 'push'],
  back_in_stock: ['email', 'push'],
  wishlist_update: ['email'],
  // Marketing
  weekly_inspiration: ['email'],
  founding_circle_update: ['email'],
  product_launch: ['email'],
  seasonal_campaign: ['email'],
  maker_spotlight: ['email'],
  reengagement: ['email'],
  // Sequences
  welcome_series: ['email'],
  designer_onboarding: ['email'],
};

interface NotifyContext {
  supabase: SupabaseClient;
  queue?: NotificationQueue;
}

/**
 * Central notification dispatch function.
 *
 * 1. Fetches user preferences
 * 2. Checks type opt-out
 * 3. Checks quiet hours (defers non-critical)
 * 4. For each enabled channel, enqueues a delivery job
 *
 * @returns Array of results per channel attempted.
 */
export async function notify(
  ctx: NotifyContext,
  userId: string,
  type: NotificationType,
  data: Record<string, unknown>,
  options?: NotifyOptions
): Promise<NotificationResult[]> {
  const { supabase } = ctx;
  const queue = ctx.queue ?? createEdgeFunctionQueue(supabase);
  const priority: NotificationPriority = options?.priority ?? 'normal';
  const results: NotificationResult[] = [];

  // 1. Fetch preferences
  const preferences = await getUserPreferences(supabase, userId);

  // 2. Check type preference
  if (!isTypeEnabled(preferences, type)) {
    return [{
      success: false,
      channel: 'email',
      error: `User opted out of ${type} notifications`,
    }];
  }

  // 3. Check quiet hours (transactional and critical bypass)
  const isTransactional = TRANSACTIONAL_TYPES.includes(type);
  const isCritical = priority === 'critical';

  if (!isTransactional && !isCritical && isQuietHours(preferences)) {
    // For now, skip. Future: defer to end of quiet hours.
    return [{
      success: false,
      channel: 'email',
      error: 'Deferred due to quiet hours',
    }];
  }

  // 4. Determine channels
  const requestedChannels = options?.channels ?? DEFAULT_CHANNELS[type] ?? ['email'];
  const templateId = TYPE_TO_TEMPLATE[type] ?? type;

  // 5. Enqueue per enabled channel
  for (const channel of requestedChannels) {
    if (!isChannelEnabled(preferences, channel)) {
      results.push({
        success: false,
        channel,
        error: `Channel ${channel} disabled by user`,
      });
      continue;
    }

    try {
      await queue.enqueue({
        user_id: userId,
        type,
        channel,
        template_id: templateId,
        data,
        priority,
      });

      results.push({ success: true, channel });
    } catch (err) {
      results.push({
        success: false,
        channel,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return results;
}
