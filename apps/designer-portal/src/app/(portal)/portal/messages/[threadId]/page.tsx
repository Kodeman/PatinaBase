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
  createBrowserClient,
  type CommsMessage,
  type ThreadSummary,
} from '@patina/supabase';
import { useQuery } from '@tanstack/react-query';
import {
  MessageThread,
  MessageComposer,
  Skeleton,
  type MessageAuthor,
  type ThreadMessage,
} from '@patina/design-system';
import { useAuth } from '@/hooks/use-auth';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';
import { IconButton } from '@/components/ui/controls';

const counterpartName = (thread: ThreadSummary, myId: string): string => {
  const others = thread.participants.filter(
    (p) => p.profile_id !== myId && !p.left_at
  );
  if (others.length === 0) return thread.title ?? 'Conversation';
  return others.map((p) => p.profile?.full_name ?? 'Unknown').join(', ');
};

const ATTACHMENTS_BUCKET = 'comms-attachments';
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

const messageToThreadMessage = (
  msg: CommsMessage,
  myId: string,
  signedUrls: Record<string, string>
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
    url: signedUrls[a.storage_path] ?? a.storage_path,
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
  const hydrated = useHydrated();
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

  // Attachments live in the private `comms-attachments` bucket, so their
  // raw storage_path isn't a usable URL — resolve short-lived signed URLs
  // (mirrors useSignedCommsAttachmentUrl) and feed them into the renderer.
  const attachmentPaths = useMemo(() => {
    const paths = (pages?.pages ?? [])
      .flat()
      .flatMap((m) => m.attachments.map((a) => a.storage_path))
      .filter(Boolean);
    return Array.from(new Set(paths));
  }, [pages]);

  const { data: signedUrls = {} } = useQuery({
    queryKey: ['comms-attachment-urls', threadId, attachmentPaths],
    enabled: attachmentPaths.length > 0,
    staleTime: (SIGNED_URL_TTL_SECONDS - 60) * 1000,
    queryFn: async (): Promise<Record<string, string>> => {
      const supabase = createBrowserClient();
      const { data, error } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .createSignedUrls(attachmentPaths, SIGNED_URL_TTL_SECONDS);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data ?? []) {
        if (row.path && row.signedUrl) map[row.path] = row.signedUrl;
      }
      return map;
    },
  });

  const conversationMessages = useMemo<ThreadMessage[]>(() => {
    const all = (pages?.pages ?? []).flat();
    return all
      .slice()
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
      .map((m) => messageToThreadMessage(m, myId, signedUrls));
  }, [pages, myId, signedUrls]);

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

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || threadLoading || !thread) {
    return <LoadingStrata />;
  }

  const title = counterpartName(thread, myId);
  const muted = !!thread.my_participant?.muted_at;
  const archived = !!thread.my_participant?.archived_at;

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex max-w-4xl flex-col h-[calc(100vh-80px)] py-4">
        <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] pb-4">
          <IconButton
            label="Back to inbox"
            onClick={() => router.push('/portal/messages')}
          >
            <ArrowLeft className="h-5 w-5" />
          </IconButton>
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
          <IconButton
            label={muted ? 'Unmute thread' : 'Mute thread'}
            onClick={() =>
              muteThread.mutate({ threadId: thread.id, muted: !muted })
            }
          >
            <BellOff
              className={`h-4 w-4 ${muted ? 'text-patina-clay' : 'text-[var(--text-muted)]'}`}
            />
          </IconButton>
          <IconButton
            label={archived ? 'Unarchive thread' : 'Archive thread'}
            onClick={() =>
              archiveThread.mutate({ threadId: thread.id, archived: !archived })
            }
          >
            <Archive
              className={`h-4 w-4 ${archived ? 'text-patina-clay' : 'text-[var(--text-muted)]'}`}
            />
          </IconButton>
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
