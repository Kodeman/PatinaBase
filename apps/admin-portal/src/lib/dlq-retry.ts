import type { SupabaseClient } from '@supabase/supabase-js';

export type RetryOutcome =
  | { kind: 'success'; data: { provider_id: string | null; notification_id: string | null } }
  | { kind: 'dispatch_failed'; message: string }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string };

interface DispatchResult {
  success?: boolean;
  notification_id?: string;
  provider_id?: string;
  error?: string;
  reason?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function retryDlqEntry(
  supabase: SupabaseClient<any, any, any>,
  id: string,
  actorId: string,
  actorEmail: string | null,
): Promise<RetryOutcome> {
  const { data: row, error: loadError } = await supabase
    .from('notification_log')
    .select('id, user_id, type, channel, template_id, metadata, status')
    .eq('id', id)
    .maybeSingle();
  if (loadError) return { kind: 'error', message: loadError.message };
  if (!row) return { kind: 'not_found' };
  if (row.status !== 'failed') {
    return { kind: 'error', message: `entry status is ${row.status}, not failed` };
  }

  const metadata = ((row.metadata as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  const data = { ...metadata };
  delete data.replayed_at;
  delete data.replay_invocation_id;
  delete data.replay_provider_id;
  delete data.replay_actor;
  delete data.replay_attempts;
  delete data.replay_outcome;

  const { data: invokeData, error: invokeError } = await supabase.functions.invoke(
    'notification-dispatch',
    {
      body: {
        user_id: row.user_id,
        type: row.type,
        channel: row.channel,
        template_id: row.template_id,
        data,
        priority: 'high',
      },
    },
  );

  const dispatchResult = (invokeData ?? null) as DispatchResult | null;

  if (invokeError) {
    return { kind: 'dispatch_failed', message: invokeError.message };
  }

  const previousAttempts = Number(metadata.replay_attempts ?? 0);
  const patch: Record<string, unknown> = {
    ...metadata,
    replayed_at: new Date().toISOString(),
    replay_invocation_id: dispatchResult?.notification_id ?? null,
    replay_provider_id: dispatchResult?.provider_id ?? null,
    replay_actor: { id: actorId, email: actorEmail },
    replay_attempts: previousAttempts + 1,
    replay_outcome:
      dispatchResult?.success === false
        ? { ok: false, reason: dispatchResult.reason ?? dispatchResult.error ?? 'unknown' }
        : { ok: true },
  };

  const { error: updateError } = await supabase
    .from('notification_log')
    .update({ metadata: patch })
    .eq('id', id);
  if (updateError) return { kind: 'error', message: updateError.message };

  return {
    kind: 'success',
    data: {
      provider_id: dispatchResult?.provider_id ?? null,
      notification_id: dispatchResult?.notification_id ?? null,
    },
  };
}
