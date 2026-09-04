'use client';

import { useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  useInboxNotifications,
  useInboxNotificationsRealtime,
  useMarkThreadRead,
  useMuteThread,
  useSendMessage,
  useThreadMessages,
  useThreadRealtime,
  useThreads,
} from '@patina/supabase';

import { useAuth } from '@/hooks/use-auth';
import { clientEvents } from '@/lib/analytics/events';
import {
  letterMoments,
  pickProjectThread,
  toLetters,
  toNotices,
  type CorrespondenceLetter,
  type NoticeReceipt,
} from '@/lib/threshold/correspondence';

/* ── THE HOUSE'S POST ───────────────────────────────────────────────────────
   What `/messages` and `/inbox` read, gathered behind one hook so the page
   asks for the correspondence once and prints it in three places: the reply
   under the note, the letters and notices in Previously, and the mute act on
   the mat. ────────────────────────────────────────────────────────────────── */

export interface ProjectCorrespondence {
  /** Null when this house has no thread; there is then nothing to write to. */
  threadId: string | null;
  muted: boolean;
  letters: CorrespondenceLetter[];
  notices: NoticeReceipt[];
  /** True when the thread holds letters older than the page has read. */
  hasEarlierLetters: boolean;
  /** Reads one more page of letters, oldest-ward. */
  readEarlierLetters: () => void;
  isReadingEarlierLetters: boolean;
  /** The notices this house shows that the reader has not yet been marked on. */
  unreadNoticeIds: string[];
  /** Every letter's moment, for `deriveThreshold`'s changed rule. */
  sentAts: string[];
  /**
   * True until the threads, this thread's letters AND the notices have
   * answered. The page folds this into its settle gate: `changed` feeds the
   * doorstep's count, and a count that ticks upward a beat after the page
   * settles is the one thing this surface may not do.
   */
  isPending: boolean;
}

export function useProjectCorrespondence(projectId: string): ProjectCorrespondence {
  const { user } = useAuth();
  const readerId = user?.id ?? null;

  const threadsQuery = useThreads({ projectId });
  const thread = useMemo(
    () => pickProjectThread(threadsQuery.data, projectId),
    [threadsQuery.data, projectId],
  );
  const threadId = thread?.id ?? null;

  const messagesQuery = useThreadMessages(threadId ?? undefined);
  useThreadRealtime(threadId ?? undefined);
  const noticesQuery = useInboxNotifications({ limit: 50 });
  useInboxNotificationsRealtime();

  const messages = useMemo(
    () => (messagesQuery.data?.pages ?? []).flat(),
    [messagesQuery.data],
  );

  const letters = useMemo(() => toLetters(messages, readerId), [messages, readerId]);
  const notices = useMemo(
    () => toNotices(noticesQuery.data, projectId),
    [noticesQuery.data, projectId],
  );
  const sentAts = useMemo(() => letterMoments(messages, readerId), [messages, readerId]);
  const unreadNoticeIds = useMemo(
    () => notices.filter((notice) => notice.unread).map((notice) => notice.id),
    [notices],
  );

  const { fetchNextPage } = messagesQuery;
  const readEarlierLetters = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);

  return {
    threadId,
    muted: !!thread?.my_participant?.muted_at,
    letters,
    notices,
    hasEarlierLetters: threadId !== null && !!messagesQuery.hasNextPage,
    readEarlierLetters,
    isReadingEarlierLetters: !!messagesQuery.isFetchingNextPage,
    unreadNoticeIds,
    sentAts,
    isPending:
      threadsQuery.isPending ||
      (threadId !== null && messagesQuery.isPending) ||
      noticesQuery.isPending,
  };
}

export interface WriteBack {
  send: (input: { threadId: string; body: string }) => Promise<void>;
  isPending: boolean;
}

export function useWriteBack(): WriteBack {
  const send = useSendMessage();
  return {
    send: async ({ threadId, body }) => {
      await send.mutateAsync({ threadId, body });
      clientEvents.messageSend(threadId);
    },
    isPending: send.isPending,
  };
}

export interface MuteLetters {
  toggle: (input: { threadId: string; muted: boolean }) => Promise<void>;
  isPending: boolean;
}

export function useMuteLetters(): MuteLetters {
  const queryClient = useQueryClient();
  const mute = useMuteThread();
  return {
    toggle: async ({ threadId, muted }) => {
      await mute.mutateAsync({ threadId, muted });
      // `useMuteThread` invalidates the thread detail; the mat reads its state
      // off the THREAD LIST, so without this the word on the act does not turn
      // until the list goes stale on its own and the client is told nothing.
      await queryClient.invalidateQueries({ queryKey: ['comms', 'threads'] });
    },
    isPending: mute.isPending,
  };
}

/**
 * `/messages`' own mark-read, fired by the Threshold's reading mark.
 *
 * The letters are read here now, so `comms_thread_participants.last_read_at`
 * has to advance here too — otherwise every unread count on every other
 * surface goes on counting letters she has already read.
 */
export function useMarkLettersRead(): (threadId: string) => void {
  const { mutate } = useMarkThreadRead();
  return useCallback((threadId: string) => mutate(threadId), [mutate]);
}

/**
 * `/inbox`'s mark-read, fired by the Threshold's reading mark.
 *
 * The route is the one `/inbox` posted to, and the ids are the ids of the
 * notices THIS house shows: `'all'` would stamp every notice the reader has in
 * every project, emptying the counts on surfaces this page never displayed.
 */
export function useMarkNoticesRead(): (ids: string[]) => void {
  const queryClient = useQueryClient();
  const { mutate } = useMutation({
    mutationFn: async (ids: string[]) => {
      await fetch('/api/inbox/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['inbox'] });
    },
  });
  return useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      mutate(ids);
    },
    [mutate],
  );
}
