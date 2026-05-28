'use client';

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';

interface UnreadCounts {
  notifications: number;
  messages: number;
}

const EMPTY: UnreadCounts = { notifications: 0, messages: 0 };

/**
 * Returns unread notification and message counts for the nav badges.
 *
 * Messages: counts comms threads the current user participates in whose
 * `last_message_at` is newer than the participant's `last_read_at` (the
 * canonical read-state model — see `comms_thread_participants`). RLS scopes
 * participant rows to the current user.
 *
 * Notifications: there is no in-app notifications table — `notification_log`
 * is an email/SMS delivery log, and the bell panel renders no items — so the
 * badge stays 0 to avoid contradicting the (empty) panel. Wire this up when a
 * real in-app notification feed exists.
 */
export function useUnreadCounts(): UnreadCounts {
  const { data } = useQuery({
    queryKey: ['unread-counts'],
    queryFn: async (): Promise<UnreadCounts> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createBrowserClient() as any;
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return EMPTY;

      const { data: parts, error } = await supabase
        .from('comms_thread_participants')
        .select('last_read_at, thread:comms_threads(last_message_at)')
        .eq('profile_id', uid)
        .is('left_at', null);

      if (error) return EMPTY;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages = (parts ?? []).filter((p: any) => {
        const lastMessageAt = p.thread?.last_message_at;
        if (!lastMessageAt) return false;
        return !p.last_read_at || new Date(lastMessageAt) > new Date(p.last_read_at);
      }).length;

      return { notifications: 0, messages };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return data ?? EMPTY;
}
