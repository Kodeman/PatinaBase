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
  /**
   * WHAT THE STOP ACTUALLY COVERS (W4 r4 MAJOR-2).
   *
   * 'account' — one preference column on one Patina account, the kind of stop
   * the token's own `type` describes.
   * 'address' — the whole mailbox. An account-less recipient has no
   * preferences row, so her click marks every email-kind channel carrying her
   * address `unsubscribed`, across every card and every studio, and the send
   * gate then refuses EVERY category to it, invoices and purchase orders
   * included (D-4/D-6). The token still carries the letter's own narrow type
   * — `po_sent`, `invoice_sent` — and a reader that prints that type is
   * telling her something the record does not say, so the scope is what the
   * landing must speak from.
   */
  scope?: 'account' | 'address';
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
    scope: 'account',
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
 *
 * The token's `type` names the letter that carried the link and is NOT read
 * here: an address has no per-category preference to set, so the stop is the
 * whole mailbox. The outcome says so through `scope: 'address'` rather than
 * letting the narrow type stand as a description of the write.
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
    return { ok: false, status: 'error', message: readError.message, type, scope: 'address' };
  }
  if (!channel?.value) {
    // An unknown or deleted channel is an invalid token, not an error: the
    // one-click endpoint must not tell a guesser which it was.
    return { ok: false, status: 'invalid', type, scope: 'address' };
  }

  const { error: updateError } = await supabase
    .from('studio_contact_channels')
    .update({ status: 'unsubscribed', status_at: new Date().toISOString() })
    .eq('value', channel.value)
    .in('channel_kind', ['email', 'ap_email'])
    .in('status', ['active', 'bounced']);

  if (updateError) {
    return { ok: false, status: 'error', message: updateError.message, type, scope: 'address' };
  }

  // `type` rides along for the log and for the caller that wants to know which
  // letter was clicked; `scope` is what the write did, and the landing speaks
  // from the scope (W4 r4 MAJOR-2).
  return { ok: true, status: 'applied', type, scope: 'address', columnUpdated: 'status' };
}
