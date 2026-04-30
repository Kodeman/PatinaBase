'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, BellOff, Archive, MoreHorizontal } from 'lucide-react';
import {
  useThread,
  useThreadMessages,
  useSendMessage,
  useMarkThreadRead,
  useThreadRealtime,
  useTypingIndicator,
  useArchiveThread,
  useMuteThread,
  type CommsMessage,
  type ThreadSummary,
} from '@patina/supabase';
import {
  MessageThread,
  MessageComposer,
  Skeleton,
  type MessageAuthor,
  type ThreadMessage,
} from '@patina/design-system';
import { useAuth } from '@/hooks/use-auth';
import { LoadingStrata } from '@/components/portal/loading-strata';

const counterpartName = (thread: ThreadSummary, myId: string): string => {
  const others = thread.participants.filter(
    (p) => p.profile_id !== myId && !p.left_at
  );
  if (others.length === 0) return thread.title ?? 'Conversation';
  return others.map((p) => p.profile?.full_name ?? 'Unknown').join(', ');
};

const messageToThreadMessage = (
  msg: CommsMessage,
  myId: string
): ThreadMessage => ({
  id: msg.id,
  author: {
    id: msg.sender_id ?? 'system',
    name: msg.sender?.full_name ?? (msg.system ? 'System' : 'Unknown'),
    avatarUrl: msg.sender?.avatar_url ?? undefined,
  } satisfies MessageAuthor,
  timestamp: new Date(msg.created_at),
  body: msg.deleted_at ? '_(message deleted)_' : msg.body,
  variant: msg.system
    ? 'system'
    : msg.sender_id === myId
      ? 'outgoing'
      : 'incoming',
  attachments: msg.attachments.map((a, i) => ({
    id: `${msg.id}-att-${i}`,
    name: a.filename ?? a.storage_path.split('/').pop() ?? 'Attachment',
    url: a.storage_path,
    size: a.size ? `${Math.round(a.size / 1024)} KB` : undefined,
    type: a.mime?.startsWith('image/') ? 'image' : 'file',
  })),
});

export default function ThreadDetailPage() {
  const router = useRouter();
  const params = useParams<{ threadId: string }>();
  const threadId = params?.threadId;
  const { user } = useAuth();
  const myId = user?.id ?? '';
  const [sendError, setSendError] = useState<string | null>(null);

  const { data: thread, isLoading: threadLoading } = useThread(threadId);
  const { data: pages, isLoading: messagesLoading } = useThreadMessages(threadId);
  useThreadRealtime(threadId);
  const { typingUsers } = useTypingIndicator(threadId);

  const sendMessage = useSendMessage();
  const markRead = useMarkThreadRead();
  const archiveThread = useArchiveThread();
  const muteThread = useMuteThread();

  // Mark read on mount and on new message arrival.
  useEffect(() => {
    if (threadId) markRead.mutate(threadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, pages?.pages[0]?.[0]?.id]);

  const conversationMessages = useMemo<ThreadMessage[]>(() => {
    const all = (pages?.pages ?? []).flat();
    return all
      .slice()
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
      .map((m) => messageToThreadMessage(m, myId));
  }, [pages, myId]);

  const typingIndicators: MessageAuthor[] = typingUsers.map((u) => ({
    id: u.profile_id,
    name: u.full_name ?? 'Someone',
  }));

  const handleSend = async ({ body }: { body: string }) => {
    if (!threadId || !body.trim()) return;
    try {
      await sendMessage.mutateAsync({ threadId, body });
      setSendError(null);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send');
      throw err;
    }
  };

  if (threadLoading || !thread) {
    return <LoadingStrata />;
  }

  const title = counterpartName(thread, myId);
  const muted = !!thread.my_participant?.muted_at;
  const archived = !!thread.my_participant?.archived_at;

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex max-w-4xl flex-col h-[calc(100vh-80px)] py-4">
        <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] pb-4">
          <button
            type="button"
            onClick={() => router.push('/portal/messages')}
            className="rounded p-1 hover:bg-[rgba(196,165,123,0.08)]"
            aria-label="Back to inbox"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="type-item-name">{title}</h1>
            <p className="type-meta-small">
              {thread.kind === 'project'
                ? 'Project conversation'
                : thread.kind === 'vendor_brief'
                  ? 'Vendor brief'
                  : 'Direct message'}
              {muted && ' · muted'}
              {archived && ' · archived'}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              muteThread.mutate({ threadId: thread.id, muted: !muted })
            }
            className="rounded p-2 hover:bg-[rgba(196,165,123,0.08)]"
            aria-label={muted ? 'Unmute' : 'Mute'}
            title={muted ? 'Unmute thread' : 'Mute thread'}
          >
            <BellOff
              className={`h-4 w-4 ${muted ? 'text-patina-clay' : 'text-[var(--text-muted)]'}`}
            />
          </button>
          <button
            type="button"
            onClick={() =>
              archiveThread.mutate({ threadId: thread.id, archived: !archived })
            }
            className="rounded p-2 hover:bg-[rgba(196,165,123,0.08)]"
            aria-label={archived ? 'Unarchive' : 'Archive'}
            title={archived ? 'Unarchive thread' : 'Archive thread'}
          >
            <Archive
              className={`h-4 w-4 ${archived ? 'text-patina-clay' : 'text-[var(--text-muted)]'}`}
            />
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          {messagesLoading && conversationMessages.length === 0 ? (
            <div className="space-y-4 p-6">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <MessageThread
              className="h-full rounded-none border-0"
              messages={conversationMessages}
              currentUserId={myId}
              typingIndicators={typingIndicators}
              emptyState={
                <div className="text-center type-body-small py-8">
                  No messages yet. Send the first one below.
                </div>
              }
            />
          )}
        </div>

        <div className="border-t border-[var(--border-subtle)] pt-4">
          <MessageComposer
            busy={sendMessage.isPending}
            placeholder="Type your message..."
            onSend={handleSend}
          />
          {sendError && (
            <p className="mt-2 type-meta text-patina-terracotta">{sendError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
