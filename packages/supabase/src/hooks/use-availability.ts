'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createBrowserClient } from '../client';
import { getSessionUserId, useSessionUserId } from '../auth/session-user';

const getSupabase = () => createBrowserClient();

/**
 * Declared availability status persisted on profiles.availability_status
 * (migration 00183). This is the status the user *chose*, not live
 * connection presence — a connected-presence channel layered on top is a
 * documented follow-up (effective status = connected ? declared : offline).
 */
export type AvailabilityStatus = 'online' | 'away' | 'busy' | 'offline';

export const AVAILABILITY_STATUSES: AvailabilityStatus[] = [
  'online',
  'away',
  'busy',
  'offline',
];

const isAvailabilityStatus = (value: unknown): value is AvailabilityStatus =>
  typeof value === 'string' &&
  (AVAILABILITY_STATUSES as string[]).includes(value);

export const availabilityKeys = {
  status: (userId?: string) => ['availability', userId ?? 'me'] as const,
};

/**
 * Declared status for a user. Defaults to the signed-in user when no id is
 * given. Profiles are world-readable (00013 RLS), so other surfaces (e.g.
 * client portal chat) can read a designer's availability with their id.
 */
export function useAvailability(userId?: string) {
  return useQuery({
    queryKey: availabilityKeys.status(userId),
    queryFn: async (): Promise<AvailabilityStatus> => {
      const supabase = getSupabase();
      const id = userId ?? (await getSessionUserId());
      if (!id) return 'offline';

      const { data, error } = await supabase
        .from('profiles')
        .select('availability_status')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      const status = data?.availability_status;
      return isAvailabilityStatus(status) ? status : 'online';
    },
    staleTime: 30_000,
  });
}

/** Update the signed-in user's declared status (optimistic). */
export function useSetAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (status: AvailabilityStatus) => {
      const supabase = getSupabase();
      const userId = await getSessionUserId();
      if (!userId) throw new Error('Not signed in');

      const { error } = await supabase
        .from('profiles')
        .update({
          availability_status: status,
          availability_changed_at: new Date().toISOString(),
        })
        .eq('id', userId);
      if (error) throw error;
    },
    onMutate: async (status) => {
      const key = availabilityKeys.status();
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<AvailabilityStatus>(key);
      qc.setQueryData<AvailabilityStatus>(key, status);
      return { previous };
    },
    onError: (_err, _status, context) => {
      if (context?.previous) {
        qc.setQueryData(availabilityKeys.status(), context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: availabilityKeys.status() });
    },
  });
}

/**
 * Realtime sync of a user's declared status. Subscribes to profile UPDATEs
 * for that user (or the signed-in user) and invalidates the availability
 * query — keeps status consistent across tabs/devices. Follows the
 * postgres_changes template from useUnreadInboxCount.
 */
export function useAvailabilityRealtime(userId?: string) {
  const qc = useQueryClient();
  const sessionUserId = useSessionUserId();
  const id = userId ?? sessionUserId;

  useEffect(() => {
    if (!id) return;
    const supabase = getSupabase();
    const channel: RealtimeChannel = supabase
      .channel(`availability:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          // Fires on any column update for this profile row; the handler
          // only invalidates one tiny query, so that's acceptable churn.
          filter: `id=eq.${id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: availabilityKeys.status(userId) });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, id, userId]);
}
