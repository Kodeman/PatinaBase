'use client';

import { useEffect } from 'react';
import {
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createBrowserClient } from '../client';
import type { Database } from '../database.types';

const getSupabase = () => createBrowserClient();

export type InboxNotificationStatus = Database['public']['Enums']['notification_status'];
export type InboxNotificationChannel = Database['public']['Enums']['notification_channel'];

export interface InboxNotificationMetadata {
  read_at?: string | null;
  subject?: string;
  headline?: string;
  message?: string;
  preview?: string;
  body?: string;
  title?: string;
  deep_link?: string;
  url?: string;
  [key: string]: unknown;
}

export interface InboxNotification {
  id: string;
  user_id: string;
  type: string;
  channel: InboxNotificationChannel;
  status: InboxNotificationStatus;
  template_id: string | null;
  metadata: InboxNotificationMetadata;
  opened_at: string | null;
  clicked_at: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface InboxNotificationFilters {
  limit?: number;
  unreadOnly?: boolean;
}

export interface InboxMessage {
  id: string;
  thread_id: string;
  sender_id: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  system: boolean;
  thread: {
    id: string;
    kind: 'direct' | 'project' | 'vendor_brief' | 'support';
    title: string | null;
    project_id: string | null;
    last_message_at: string;
  } | null;
  sender: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
  is_unread: boolean;
}

const TRANSACTIONAL_TYPES = new Set<string>([
  'verification',
  'email_verification',
  'password_reset',
  'magic_link',
  'invitation',
  'invite',
]);

export const inboxKeys = {
  all: ['inbox'] as const,
  notifications: (filters?: InboxNotificationFilters) =>
    ['inbox', 'notifications', filters ?? {}] as const,
  messages: () => ['inbox', 'messages'] as const,
  unreadCount: () => ['inbox', 'unread-count'] as const,
};

export function useInboxNotifications(filters: InboxNotificationFilters = {}) {
  const limit = filters.limit ?? 50;

  return useQuery({
    queryKey: inboxKeys.notifications(filters),
    queryFn: async (): Promise<InboxNotification[]> => {
      const supabase = getSupabase();
      const { data: userResp } = await supabase.auth.getUser();
      const userId = userResp.user?.id;
      if (!userId) return [];

      const { data, error } = await supabase
        .from('notification_log')
        .select(
          'id, user_id, type, channel, status, template_id, metadata, opened_at, clicked_at, sent_at, created_at'
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      const rows = (data ?? []) as unknown as InboxNotification[];

      const filtered = rows.filter((row) => {
        if (row.channel === 'in_app') return true;
        if (row.channel === 'email') {
          return !TRANSACTIONAL_TYPES.has(row.type);
        }
        return false;
      });

      if (filters.unreadOnly) {
        return filtered.filter((row) => !(row.metadata?.read_at));
      }
      return filtered;
    },
    staleTime: 15_000,
  });
}

export function useInboxMessages(limit = 50) {
  return useQuery({
    queryKey: inboxKeys.messages(),
    queryFn: async (): Promise<InboxMessage[]> => {
      const supabase = getSupabase();
      const { data: userResp } = await supabase.auth.getUser();
      const userId = userResp.user?.id;
      if (!userId) return [];

      const { data: participantRows, error: participantErr } = await supabase
        .from('comms_thread_participants')
        .select('thread_id, last_read_at, archived_at, left_at')
        .eq('profile_id', userId);
      if (participantErr) throw participantErr;

      const active = (participantRows ?? []).filter(
        (p) => !p.left_at && !p.archived_at
      );
      if (active.length === 0) return [];

      const threadIds = active.map((p) => p.thread_id);
      const lastReadByThread = new Map<string, string>(
        active.map((p) => [p.thread_id, p.last_read_at ?? '1970-01-01T00:00:00Z'])
      );

      const { data, error } = await supabase
        .from('comms_messages')
        .select(
          `id, thread_id, sender_id, body, created_at, edited_at, deleted_at, system,
           thread:comms_threads(id, kind, title, project_id, last_message_at),
           sender:profiles!comms_messages_sender_id_fkey(id, full_name, avatar_url)`
        )
        .in('thread_id', threadIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).map((row): InboxMessage => {
        const lastReadAt = lastReadByThread.get(row.thread_id);
        const isUnread =
          row.sender_id !== userId &&
          (!lastReadAt || new Date(row.created_at) > new Date(lastReadAt));
        return {
          id: row.id,
          thread_id: row.thread_id,
          sender_id: row.sender_id ?? null,
          body: row.body ?? '',
          created_at: row.created_at,
          edited_at: row.edited_at ?? null,
          deleted_at: row.deleted_at ?? null,
          system: !!row.system,
          thread: row.thread
            ? {
                id: row.thread.id,
                kind: row.thread.kind,
                title: row.thread.title ?? null,
                project_id: row.thread.project_id ?? null,
                last_message_at: row.thread.last_message_at,
              }
            : null,
          sender: row.sender
            ? {
                id: row.sender.id,
                full_name: row.sender.full_name ?? null,
                avatar_url: row.sender.avatar_url ?? null,
              }
            : null,
          is_unread: isUnread,
        };
      });
    },
    staleTime: 15_000,
  });
}

export function useUnreadInboxCount() {
  const qc = useQueryClient();

  useEffect(() => {
    const supabase = getSupabase();
    let channel: RealtimeChannel | undefined;
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId || cancelled) return;
      const queryKeys: QueryKey[] = [
        inboxKeys.unreadCount(),
        ['inbox', 'notifications'],
      ];
      channel = supabase
        .channel(`notification_log:${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notification_log',
            filter: `user_id=eq.${userId}`,
          },
          () => {
            for (const key of queryKeys) {
              qc.invalidateQueries({ queryKey: key });
            }
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [qc]);

  return useQuery({
    queryKey: inboxKeys.unreadCount(),
    queryFn: async (): Promise<number> => {
      const supabase = getSupabase();
      const { data: userResp } = await supabase.auth.getUser();
      const userId = userResp.user?.id;
      if (!userId) return 0;

      const { data, error } = await supabase
        .from('notification_log')
        .select('id, channel, type, metadata')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;

      const rows = (data ?? []) as Array<{
        channel: InboxNotificationChannel;
        type: string;
        metadata: InboxNotificationMetadata | null;
      }>;
      return rows.filter((r) => {
        const eligible =
          r.channel === 'in_app' ||
          (r.channel === 'email' && !TRANSACTIONAL_TYPES.has(r.type));
        if (!eligible) return false;
        return !(r.metadata && r.metadata.read_at);
      }).length;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useInboxNotificationsRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    const supabase = getSupabase();
    let channel: RealtimeChannel | undefined;
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId || cancelled) return;
      channel = supabase
        .channel(`notification_log_inbox:${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notification_log',
            filter: `user_id=eq.${userId}`,
          },
          () => {
            qc.invalidateQueries({ queryKey: ['inbox', 'notifications'] });
            qc.invalidateQueries({ queryKey: inboxKeys.unreadCount() });
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [qc]);
}
