/**
 * Apply an unsubscribe action from a verified token. Sets the corresponding
 * preference column to false (or channels_email=false for all_marketing).
 *
 * Expected to be called from server-side API routes or server components
 * using a Supabase service-role client so RLS doesn't block the UPDATE.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotificationType } from '@patina/shared/types';
import { NOTIFICATION_TYPE_TO_PREFERENCE } from '@patina/shared/types';
import { verifyUnsubscribeToken } from './tokens';

export interface UnsubscribeOutcome {
  ok: boolean;
  status: 'applied' | 'invalid' | 'expired' | 'malformed' | 'error';
  userId?: string;
  type?: NotificationType | 'all_marketing';
  columnUpdated?: string;
  message?: string;
}

/**
 * Resolve a signed unsubscribe token and apply the matching opt-out to
 * notification_preferences. Idempotent: re-applying the same token returns
 * the same outcome.
 */
export async function applyUnsubscribeToken(
  supabase: SupabaseClient,
  token: string
): Promise<UnsubscribeOutcome> {
  const result = await verifyUnsubscribeToken(token);

  if (!result.valid || !result.payload) {
    return {
      ok: false,
      status: (result.error ?? 'invalid') as UnsubscribeOutcome['status'],
    };
  }

  const { sub: userId, type } = result.payload;

  // Look up the existing row; create if missing so we have a target to update.
  const { data: existing } = await supabase
    .from('notification_preferences')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing) {
    // Seed a row with defaults; the UPDATE below will then apply the opt-out.
    const { error: insertError } = await supabase
      .from('notification_preferences')
      .insert({ user_id: userId });
    if (insertError) {
      return {
        ok: false,
        status: 'error',
        message: insertError.message,
        userId,
        type,
      };
    }
  }

  // Choose column to clear.
  let columnUpdated: string;
  const update: Record<string, boolean> = {};

  if (type === 'all_marketing') {
    columnUpdated = 'channels_email';
    update.channels_email = false;
  } else {
    const prefColumn = NOTIFICATION_TYPE_TO_PREFERENCE[type];
    if (!prefColumn) {
      // Non-marketing / transactional type — fall back to channels_email
      columnUpdated = 'channels_email';
      update.channels_email = false;
    } else {
      columnUpdated = prefColumn as string;
      update[columnUpdated] = false;
    }
  }

  const { error: updateError } = await supabase
    .from('notification_preferences')
    .update(update)
    .eq('user_id', userId);

  if (updateError) {
    return {
      ok: false,
      status: 'error',
      message: updateError.message,
      userId,
      type,
    };
  }

  return {
    ok: true,
    status: 'applied',
    userId,
    type,
    columnUpdated,
  };
}
