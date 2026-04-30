import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ThreadKind = 'direct' | 'project' | 'vendor_brief' | 'support';
export type ParticipantRole = 'designer' | 'client' | 'vendor' | 'admin';
export type NotificationPref = 'all' | 'mentions' | 'none';

export interface CommsThread {
  id: string;
  kind: ThreadKind;
  project_id: string | null;
  proposal_id: string | null;
  title: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  metadata: Record<string, unknown>;
}

export interface CommsParticipant {
  thread_id: string;
  profile_id: string;
  role: ParticipantRole;
  joined_at: string;
  left_at: string | null;
  last_read_at: string;
  archived_at: string | null;
  muted_at: string | null;
  notification_pref: NotificationPref;
  // joined profile data (when loaded with select)
  profile?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

export interface CommsMessageAttachment {
  storage_path: string;
  mime: string;
  size: number;
  width?: number;
  height?: number;
  filename?: string;
}

export interface CommsMessage {
  id: string;
  thread_id: string;
  sender_id: string | null;
  body: string;
  attachments: CommsMessageAttachment[];
  reply_to_message_id: string | null;
  decision_id: string | null;
  mentions: string[];
  system: boolean;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  sender?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

export interface ThreadSummary extends CommsThread {
  participants: CommsParticipant[];
  last_message: CommsMessage | null;
  unread_count: number;
  my_participant: CommsParticipant | null;
}

export interface UnreadSummaryRow {
  thread_id: string;
  kind: ThreadKind;
  project_id: string | null;
  last_message_at: string;
  unread_count: number;
}

export interface QuickReply {
  id: string;
  profile_id: string;
  label: string;
  body: string;
  position: number;
  created_at: string;
  updated_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY KEYS
// ═══════════════════════════════════════════════════════════════════════════

export const commsKeys = {
  all: ['comms'] as const,
  threads: (params?: Record<string, unknown>) =>
    ['comms', 'threads', params ?? {}] as const,
  thread: (id: string) => ['comms', 'thread', id] as const,
  messages: (threadId: string) => ['comms', 'messages', threadId] as const,
  participants: (threadId: string) => ['comms', 'participants', threadId] as const,
  unread: () => ['comms', 'unread'] as const,
  quickReplies: () => ['comms', 'quick-replies'] as const,
};

// ═══════════════════════════════════════════════════════════════════════════
// THREADS — list & detail
// ═══════════════════════════════════════════════════════════════════════════

export interface UseThreadsParams {
  scope?: 'inbox' | 'direct' | 'project' | 'vendor_brief' | 'archived';
  projectId?: string;
  search?: string;
}

export function useThreads(params: UseThreadsParams = {}) {
  return useQuery({
    queryKey: commsKeys.threads(params as Record<string, unknown>),
    queryFn: async (): Promise<ThreadSummary[]> => {
      const supabase = getSupabase();
      const { data: userResp } = await supabase.auth.getUser();
      const userId = userResp.user?.id;
      if (!userId) return [];

      // Pull threads I participate in, plus my participant row, plus all participants.
      let query = supabase
        .from('comms_threads')
        .select(
          `*,
           participants:comms_thread_participants!inner(
             *, profile:profiles(id, full_name, avatar_url)
           )`
        )
        .order('last_message_at', { ascending: false });

      if (params.projectId) query = query.eq('project_id', params.projectId);
      if (params.scope === 'direct') query = query.eq('kind', 'direct');
      if (params.scope === 'project') query = query.eq('kind', 'project');
      if (params.scope === 'vendor_brief') query = query.eq('kind', 'vendor_brief');

      const { data, error } = await query;
      if (error) throw error;

      // Pull unread summary in parallel and merge.
      const { data: unreadRows } = await supabase.rpc('rpc_unread_summary');
      const unreadMap = new Map<string, number>(
        ((unreadRows ?? []) as unknown as UnreadSummaryRow[]).map((r) => [
          r.thread_id,
          r.unread_count,
        ])
      );

      const threads = (data ?? []).map((row): ThreadSummary => {
        const allParticipants = (row.participants ?? []) as CommsParticipant[];
        const my = allParticipants.find((p) => p.profile_id === userId) ?? null;
        return {
          ...(row as CommsThread),
          participants: allParticipants,
          last_message: null, // loaded by useThread() detail when active
          unread_count: unreadMap.get(row.id) ?? 0,
          my_participant: my,
        };
      });

      // Filter inbox/archived client-side from participant state.
      const visible = threads.filter((t) => {
        const my = t.my_participant;
        if (!my) return false;
        if (my.left_at) return false;
        if (params.scope === 'archived') return !!my.archived_at;
        // inbox / direct / project / vendor_brief: hide archived
        return !my.archived_at;
      });

      // Search: client-side filter by title / participant name.
      if (params.search) {
        const q = params.search.toLowerCase();
        return visible.filter((t) => {
          if (t.title?.toLowerCase().includes(q)) return true;
          return t.participants.some((p) =>
            p.profile?.full_name?.toLowerCase().includes(q)
          );
        });
      }

      return visible;
    },
    staleTime: 10_000,
  });
}

export function useThread(threadId: string | undefined) {
  return useQuery({
    queryKey: threadId ? commsKeys.thread(threadId) : ['comms', 'thread', null],
    enabled: !!threadId,
    queryFn: async (): Promise<ThreadSummary | null> => {
      if (!threadId) return null;
      const supabase = getSupabase();
      const { data: userResp } = await supabase.auth.getUser();
      const userId = userResp.user?.id;

      const { data, error } = await supabase
        .from('comms_threads')
        .select(
          `*,
           participants:comms_thread_participants(
             *, profile:profiles(id, full_name, avatar_url)
           )`
        )
        .eq('id', threadId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const allParticipants = (data.participants ?? []) as CommsParticipant[];
      const my = userId
        ? allParticipants.find((p) => p.profile_id === userId) ?? null
        : null;

      return {
        ...(data as CommsThread),
        participants: allParticipants,
        last_message: null,
        unread_count: 0, // available via useUnreadCount
        my_participant: my,
      };
    },
    staleTime: 5_000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGES — paginated, infinite scroll up
// ═══════════════════════════════════════════════════════════════════════════

const MESSAGES_PAGE_SIZE = 50;

export function useThreadMessages(threadId: string | undefined) {
  return useInfiniteQuery({
    queryKey: threadId ? commsKeys.messages(threadId) : ['comms', 'messages', null],
    enabled: !!threadId,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: CommsMessage[]) =>
      lastPage.length === MESSAGES_PAGE_SIZE
        ? lastPage[lastPage.length - 1]?.created_at
        : undefined,
    queryFn: async ({ pageParam }): Promise<CommsMessage[]> => {
      if (!threadId) return [];
      const supabase = getSupabase();
      let q = supabase
        .from('comms_messages')
        .select('*, sender:profiles!sender_id(id, full_name, avatar_url)')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: false })
        .limit(MESSAGES_PAGE_SIZE);
      if (pageParam) q = q.lt('created_at', pageParam);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as CommsMessage[];
    },
    staleTime: 0,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SEND / EDIT / DELETE
// ═══════════════════════════════════════════════════════════════════════════

export interface SendMessageInput {
  threadId: string;
  body: string;
  attachments?: CommsMessageAttachment[];
  replyToMessageId?: string;
  decisionId?: string;
  mentions?: string[];
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SendMessageInput): Promise<CommsMessage> => {
      const supabase = getSupabase();
      const { data: userResp } = await supabase.auth.getUser();
      const userId = userResp.user?.id;
      if (!userId) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('comms_messages')
        .insert({
          thread_id: input.threadId,
          sender_id: userId,
          body: input.body,
          attachments: (input.attachments ?? []) as unknown as never,
          reply_to_message_id: input.replyToMessageId ?? null,
          decision_id: input.decisionId ?? null,
          mentions: input.mentions ?? [],
        })
        .select('*, sender:profiles!sender_id(id, full_name, avatar_url)')
        .single();
      if (error) throw error;
      return data as unknown as CommsMessage;
    },
    onSuccess: (msg) => {
      qc.invalidateQueries({ queryKey: commsKeys.messages(msg.thread_id) });
      qc.invalidateQueries({ queryKey: commsKeys.thread(msg.thread_id) });
      qc.invalidateQueries({ queryKey: ['comms', 'threads'] });
    },
  });
}

export function useEditMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { messageId: string; body: string }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('comms_messages')
        .update({ body: input.body, edited_at: new Date().toISOString() })
        .eq('id', input.messageId)
        .select('thread_id')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data?.thread_id) {
        qc.invalidateQueries({ queryKey: commsKeys.messages(data.thread_id) });
      }
    },
  });
}

export function useDeleteMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { messageId: string; threadId: string }) => {
      const supabase = getSupabase();
      const { error } = await supabase.rpc('rpc_soft_delete_message', {
        p_message_id: input.messageId,
      });
      if (error) throw error;
      return input;
    },
    onSuccess: (input) => {
      qc.invalidateQueries({ queryKey: commsKeys.messages(input.threadId) });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PARTICIPANT STATE — read, archive, mute
// ═══════════════════════════════════════════════════════════════════════════

export function useMarkThreadRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (threadId: string) => {
      const supabase = getSupabase();
      const { error } = await supabase.rpc('rpc_mark_thread_read', {
        p_thread_id: threadId,
      });
      if (error) throw error;
      return threadId;
    },
    onSuccess: (threadId) => {
      qc.invalidateQueries({ queryKey: commsKeys.unread() });
      qc.invalidateQueries({ queryKey: commsKeys.thread(threadId) });
      qc.invalidateQueries({ queryKey: ['comms', 'threads'] });
    },
  });
}

export function useArchiveThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { threadId: string; archived: boolean }) => {
      const supabase = getSupabase();
      const { data: userResp } = await supabase.auth.getUser();
      const userId = userResp.user?.id;
      if (!userId) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('comms_thread_participants')
        .update({ archived_at: input.archived ? new Date().toISOString() : null })
        .eq('thread_id', input.threadId)
        .eq('profile_id', userId);
      if (error) throw error;
      return input;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comms', 'threads'] });
    },
  });
}

export function useMuteThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { threadId: string; muted: boolean }) => {
      const supabase = getSupabase();
      const { data: userResp } = await supabase.auth.getUser();
      const userId = userResp.user?.id;
      if (!userId) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('comms_thread_participants')
        .update({ muted_at: input.muted ? new Date().toISOString() : null })
        .eq('thread_id', input.threadId)
        .eq('profile_id', userId);
      if (error) throw error;
      return input;
    },
    onSuccess: (input) => {
      qc.invalidateQueries({ queryKey: commsKeys.thread(input.threadId) });
    },
  });
}

export function useThreadParticipants(threadId: string | undefined) {
  return useQuery({
    queryKey: threadId ? commsKeys.participants(threadId) : ['comms', 'participants', null],
    enabled: !!threadId,
    queryFn: async () => {
      if (!threadId) return [];
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('comms_thread_participants')
        .select('*, profile:profiles(id, full_name, avatar_url)')
        .eq('thread_id', threadId);
      if (error) throw error;
      return (data ?? []) as CommsParticipant[];
    },
  });
}

export function useAddParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      threadId: string;
      profileId: string;
      role: ParticipantRole;
    }) => {
      const supabase = getSupabase();
      const { error } = await supabase.from('comms_thread_participants').insert({
        thread_id: input.threadId,
        profile_id: input.profileId,
        role: input.role,
      });
      if (error) throw error;
      return input;
    },
    onSuccess: (input) => {
      qc.invalidateQueries({ queryKey: commsKeys.participants(input.threadId) });
      qc.invalidateQueries({ queryKey: commsKeys.thread(input.threadId) });
    },
  });
}

export function useRemoveParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { threadId: string; profileId: string }) => {
      const supabase = getSupabase();
      const { error } = await supabase
        .from('comms_thread_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('thread_id', input.threadId)
        .eq('profile_id', input.profileId);
      if (error) throw error;
      return input;
    },
    onSuccess: (input) => {
      qc.invalidateQueries({ queryKey: commsKeys.participants(input.threadId) });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// UNREAD SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

export function useUnreadCount() {
  return useQuery({
    queryKey: commsKeys.unread(),
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('rpc_unread_summary');
      if (error) throw error;
      const rows = (data ?? []) as unknown as UnreadSummaryRow[];
      const total = rows.reduce((sum, r) => sum + r.unread_count, 0);
      const byThread: Record<string, number> = {};
      for (const r of rows) byThread[r.thread_id] = r.unread_count;
      return { total, byThread, rows };
    },
    staleTime: 5_000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// REALTIME — thread channel + inbox
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Subscribes to live INSERT/UPDATE on comms_messages for the given thread.
 * Updates the React Query cache in place so the UI re-renders without refetch.
 */
export function useThreadRealtime(threadId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!threadId) return;
    const supabase = getSupabase();
    const channel: RealtimeChannel = supabase
      .channel(`thread:${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comms_messages',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const newMsg = payload.new as CommsMessage;
          qc.setQueryData<InfiniteData<CommsMessage[]> | undefined>(
            commsKeys.messages(threadId),
            (old) => {
              if (!old) return old;
              const exists = old.pages.some((p) => p.some((m) => m.id === newMsg.id));
              if (exists) return old;
              const pages = [...old.pages];
              pages[0] = [newMsg, ...(pages[0] ?? [])];
              return { ...old, pages };
            }
          );
          qc.invalidateQueries({ queryKey: commsKeys.unread() });
          qc.invalidateQueries({ queryKey: ['comms', 'threads'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'comms_messages',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const updated = payload.new as CommsMessage;
          qc.setQueryData<InfiniteData<CommsMessage[]> | undefined>(
            commsKeys.messages(threadId),
            (old) => {
              if (!old) return old;
              const pages = old.pages.map((page) =>
                page.map((m) => (m.id === updated.id ? updated : m))
              );
              return { ...old, pages };
            }
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, qc]);
}

/**
 * Subscribes to live INSERT on any comms_messages so the inbox can refresh
 * unread badges without per-thread subscriptions. Lighter than thread-level.
 */
export function useInboxRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const supabase = getSupabase();
    let userId: string | undefined;
    let channel: RealtimeChannel | undefined;

    (async () => {
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id;
      if (!userId) return;
      channel = supabase
        .channel(`inbox:${userId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'comms_messages' },
          () => {
            qc.invalidateQueries({ queryKey: commsKeys.unread() });
            qc.invalidateQueries({ queryKey: ['comms', 'threads'] });
          }
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [qc]);
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPING INDICATOR — Supabase Presence
// ═══════════════════════════════════════════════════════════════════════════

export interface TypingUser {
  profile_id: string;
  full_name: string | null;
}

export function useTypingIndicator(threadId: string | undefined) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const meRef = useRef<{ id: string; full_name: string | null } | null>(null);

  useEffect(() => {
    if (!threadId) return;
    const supabase = getSupabase();
    let cancelled = false;

    (async () => {
      const { data: userResp } = await supabase.auth.getUser();
      const userId = userResp.user?.id;
      if (!userId) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('id', userId)
        .maybeSingle();
      if (cancelled) return;
      meRef.current = profile
        ? { id: profile.id, full_name: profile.full_name }
        : { id: userId, full_name: null };

      const channel = supabase.channel(`typing:${threadId}`, {
        config: { presence: { key: userId } },
      });
      channelRef.current = channel;

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState() as Record<
            string,
            Array<{ profile_id: string; full_name: string | null; is_typing: boolean }>
          >;
          const users: TypingUser[] = [];
          for (const [pid, metas] of Object.entries(state)) {
            if (pid === userId) continue;
            const latest = metas[metas.length - 1];
            if (latest?.is_typing) {
              users.push({ profile_id: pid, full_name: latest.full_name });
            }
          }
          setTypingUsers(users);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({
              profile_id: userId,
              full_name: meRef.current?.full_name ?? null,
              is_typing: false,
            });
          }
        });
    })();

    return () => {
      cancelled = true;
      if (channelRef.current) {
        getSupabase().removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [threadId]);

  const setTyping = useCallback(
    (isTyping: boolean) => {
      const channel = channelRef.current;
      const me = meRef.current;
      if (!channel || !me) return;
      channel.track({
        profile_id: me.id,
        full_name: me.full_name,
        is_typing: isTyping,
      });
    },
    []
  );

  return { typingUsers, setTyping };
}

// ═══════════════════════════════════════════════════════════════════════════
// QUICK REPLIES
// ═══════════════════════════════════════════════════════════════════════════

export function useQuickReplies() {
  return useQuery({
    queryKey: commsKeys.quickReplies(),
    queryFn: async (): Promise<QuickReply[]> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('comms_quick_replies')
        .select('*')
        .order('position', { ascending: true });
      if (error) throw error;
      return (data ?? []) as QuickReply[];
    },
  });
}

export function useUpsertQuickReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      label: string;
      body: string;
      position?: number;
    }) => {
      const supabase = getSupabase();
      const { data: userResp } = await supabase.auth.getUser();
      const userId = userResp.user?.id;
      if (!userId) throw new Error('Not authenticated');

      if (input.id) {
        const { data, error } = await supabase
          .from('comms_quick_replies')
          .update({
            label: input.label,
            body: input.body,
            position: input.position ?? 0,
          })
          .eq('id', input.id)
          .select('*')
          .single();
        if (error) throw error;
        return data as QuickReply;
      }
      const { data, error } = await supabase
        .from('comms_quick_replies')
        .insert({
          profile_id: userId,
          label: input.label,
          body: input.body,
          position: input.position ?? 0,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as QuickReply;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commsKeys.quickReplies() });
    },
  });
}

export function useDeleteQuickReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = getSupabase();
      const { error } = await supabase
        .from('comms_quick_replies')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commsKeys.quickReplies() });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// THREAD STARTERS — RPC wrappers
// ═══════════════════════════════════════════════════════════════════════════

export function useStartDirectThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (counterpartProfileId: string): Promise<string> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('rpc_start_direct_thread', {
        counterpart: counterpartProfileId,
      });
      if (error) throw error;
      if (!data) throw new Error('RPC returned no thread id');
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comms', 'threads'] });
    },
  });
}

export function useStartProjectThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string): Promise<string> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('rpc_start_project_thread', {
        p_project_id: projectId,
      });
      if (error) throw error;
      if (!data) throw new Error('RPC returned no thread id');
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comms', 'threads'] });
    },
  });
}

/**
 * Returns the current user's participant rows that deviate from defaults —
 * threads they have muted or set a custom notification_pref on. Powers the
 * "Messages" section of notification settings.
 */
export interface ThreadOverride {
  thread_id: string;
  thread_kind: ThreadKind;
  thread_title: string | null;
  project_id: string | null;
  muted_at: string | null;
  notification_pref: NotificationPref;
  counterpart_names: string[];
}

export function useMyThreadOverrides() {
  return useQuery({
    queryKey: ['comms', 'my-overrides'] as const,
    queryFn: async (): Promise<ThreadOverride[]> => {
      const supabase = getSupabase();
      const { data: userResp } = await supabase.auth.getUser();
      const userId = userResp.user?.id;
      if (!userId) return [];

      const { data, error } = await supabase
        .from('comms_thread_participants')
        .select(
          `thread_id, muted_at, notification_pref,
           thread:comms_threads(id, kind, title, project_id,
             other_participants:comms_thread_participants(
               profile_id, profile:profiles(id, full_name)
             )
           )`
        )
        .eq('profile_id', userId)
        .is('left_at', null)
        .or('muted_at.not.is.null,notification_pref.neq.all');
      if (error) throw error;

      type Row = {
        thread_id: string;
        muted_at: string | null;
        notification_pref: NotificationPref;
        thread: {
          id: string;
          kind: ThreadKind;
          title: string | null;
          project_id: string | null;
          other_participants: Array<{
            profile_id: string;
            profile: { id: string; full_name: string | null } | null;
          }>;
        } | null;
      };
      return ((data ?? []) as unknown as Row[])
        .filter((r) => r.thread)
        .map<ThreadOverride>((r) => ({
          thread_id: r.thread_id,
          thread_kind: r.thread!.kind,
          thread_title: r.thread!.title,
          project_id: r.thread!.project_id,
          muted_at: r.muted_at,
          notification_pref: r.notification_pref,
          counterpart_names: r
            .thread!.other_participants.filter((p) => p.profile_id !== userId)
            .map((p) => p.profile?.full_name ?? 'Unknown'),
        }));
    },
    staleTime: 30_000,
  });
}

export function useUpdateThreadNotificationPref() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      threadId: string;
      pref: NotificationPref;
    }) => {
      const supabase = getSupabase();
      const { data: userResp } = await supabase.auth.getUser();
      const userId = userResp.user?.id;
      if (!userId) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('comms_thread_participants')
        .update({ notification_pref: input.pref })
        .eq('thread_id', input.threadId)
        .eq('profile_id', userId);
      if (error) throw error;
      return input;
    },
    onSuccess: (input) => {
      qc.invalidateQueries({ queryKey: ['comms', 'my-overrides'] });
      qc.invalidateQueries({ queryKey: commsKeys.thread(input.threadId) });
    },
  });
}

/**
 * Lists vendor profiles available for the brief picker. Returns rows from
 * `profiles` with role='vendor'. The vendor must already have a profile —
 * the pending-placeholder creation flow is a separate sub-feature.
 */
export function useVendorProfiles() {
  return useQuery({
    queryKey: ['comms', 'vendor-profiles'] as const,
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .eq('role', 'vendor')
        .order('full_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        full_name: string | null;
        avatar_url: string | null;
      }>;
    },
    staleTime: 60_000,
  });
}

export function useStartVendorBrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      vendorProfileId: string;
      projectId?: string;
      initialMessage: string;
    }): Promise<string> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('rpc_start_vendor_brief', {
        p_vendor_id: input.vendorProfileId,
        p_project_id: (input.projectId ?? null) as unknown as string,
        p_body: input.initialMessage,
      });
      if (error) throw error;
      if (!data) throw new Error('RPC returned no thread id');
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comms', 'threads'] });
    },
  });
}
