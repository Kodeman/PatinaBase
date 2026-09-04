'use client';

import { useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  useInboxNotifications,
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
  /** Every letter's moment, for `deriveThreshold`'s changed rule. */
  sentAts: string[];
  /**
   * True until the threads AND this thread's letters have answered. The page
   * folds this into its settle gate: `changed` feeds the doorstep's count, and
   * a count that ticks upward a beat after the page settles is the one thing
   * this surface may not do.
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

  const messages = useMemo(
    () => (messagesQuery.data?.pages ?? []).flat(),
    [messagesQuery.data],
  );

  return {
    threadId,
    muted: !!thread?.my_participant?.muted_at,
    letters: useMemo(() => toLetters(messages, readerId), [messages, readerId]),
    notices: useMemo(() => toNotices(noticesQuery.data), [noticesQuery.data]),
    sentAts: useMemo(() => letterMoments(messages), [messages]),
    isPending: threadsQuery.isPending || (threadId !== null && messagesQuery.isPending),
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
  const mute = useMuteThread();
  return {
    toggle: async ({ threadId, muted }) => {
      await mute.mutateAsync({ threadId, muted });
    },
    isPending: mute.isPending,
  };
}

/**
 * `/inbox`'s "Mark all read", fired by the Threshold's reading mark.
 *
 * The route is the one `/inbox` posted to; the ids are `'all'` for the same
 * reason that page offered one control for the lot — `notification_log` rows
 * are the reader's own, and the Threshold shows them as receipts of what was
 * sent rather than as a queue she has to clear.
 */
export function useMarkNoticesRead(): () => void {
  const queryClient = useQueryClient();
  const { mutate } = useMutation({
    mutationFn: async () => {
      await fetch('/api/inbox/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: 'all' }),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['inbox'] });
    },
  });
  return useCallback(() => mutate(undefined), [mutate]);
}
