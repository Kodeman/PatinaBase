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
import { parseUnsubscribeSubject, verifyUnsubscribeToken } from './tokens';

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

  const { sub, type } = result.payload;
  const subject = parseUnsubscribeSubject(sub);

  // CRM-12: a recipient with no Patina account has no notification_preferences
  // row to clear. Her opt-out lands on the ADDRESS — every typed email channel
  // carrying it, across every card, because one mailbox is one person saying
  // stop. The studio's own send gate reads that status before every letter and
  // the Directory row prints it.
  if (subject.kind === 'channel') {
    return applyChannelUnsubscribe(supabase, subject.id, type);
  }

  const userId = subject.id;

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


/**
 * Mark an address unsubscribed from its channel id.
 *
 * The id names ONE row; the opt-out is applied to every email-kind row sharing
 * that row's value, which is the same rule resend-webhook's bounce write uses
 * (a mailbox's verdict is the mailbox's, not one card's). A row already dead is
 * left alone: 'dead' is the worse fact and this must not walk it back.
 */
async function applyChannelUnsubscribe(
  supabase: SupabaseClient,
  channelId: string,
  type: NotificationType | 'all_marketing'
): Promise<UnsubscribeOutcome> {
  const { data: channel, error: readError } = await supabase
    .from('studio_contact_channels')
    .select('id, value')
    .eq('id', channelId)
    .maybeSingle();

  if (readError) {
    return { ok: false, status: 'error', message: readError.message, type };
  }
  if (!channel?.value) {
    // An unknown or deleted channel is an invalid token, not an error: the
    // one-click endpoint must not tell a guesser which it was.
    return { ok: false, status: 'invalid', type };
  }

  const { error: updateError } = await supabase
    .from('studio_contact_channels')
    .update({ status: 'unsubscribed', status_at: new Date().toISOString() })
    .eq('value', channel.value)
    .in('channel_kind', ['email', 'ap_email'])
    .in('status', ['active', 'bounced']);

  if (updateError) {
    return { ok: false, status: 'error', message: updateError.message, type };
  }

  return { ok: true, status: 'applied', type, columnUpdated: 'status' };
}
