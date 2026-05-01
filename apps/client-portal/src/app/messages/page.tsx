'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { MessageSquare, Search, ArrowLeft } from 'lucide-react';
import {
  Input,
  MessageComposer,
  MessageThread,
  Skeleton,
  type MessageAuthor,
  type ThreadMessage,
} from '@patina/design-system';
import {
  useThreads,
  useThread,
  useThreadMessages,
  useSendMessage,
  useMarkThreadRead,
  useTypingIndicator,
  useThreadRealtime,
  useInboxRealtime,
  type CommsMessage,
  type ThreadSummary,
} from '@patina/supabase';
import { formatRelativeTime, getInitials } from '@/lib/utils/format';
import { ReadReceipt } from '@/components/messages/ReadReceipt';
import { ThreadSettingsMenu } from '@/components/messages/ThreadSettingsMenu';
import { MessageAttachmentUploader } from '@/components/messages/MessageAttachmentUploader';
import type { CommsMessageAttachment } from '@patina/supabase';

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

const counterpartName = (thread: ThreadSummary, currentUserId: string): string => {
  const others = thread.participants.filter(
    (p) => p.profile_id !== currentUserId && !p.left_at
  );
  if (others.length === 0) return thread.title ?? 'Conversation';
  return others
    .map((p) => p.profile?.full_name ?? 'Unknown')
    .filter(Boolean)
    .join(', ');
};

const messageToThreadMessage = (
  msg: CommsMessage,
  currentUserId: string
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
    : msg.sender_id === currentUserId
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

export default function MessagesPage() {
  const { user } = useAuth();
  const currentUserId = user?.id ?? '';
  const [search, setSearch] = useState('');
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showMobileList, setShowMobileList] = useState(true);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<CommsMessageAttachment[]>([]);

  // Inbox-level realtime: keeps thread list and unread badges fresh.
  useInboxRealtime();

  const { data: threads = [], isLoading: threadsLoading } = useThreads({ search });
  const { data: activeThread, isLoading: threadLoading } = useThread(
    activeThreadId ?? undefined
  );
  const { data: messagesPages } = useThreadMessages(activeThreadId ?? undefined);
  useThreadRealtime(activeThreadId ?? undefined);
  const { typingUsers } = useTypingIndicator(activeThreadId ?? undefined);
  const sendMessage = useSendMessage();
  const markRead = useMarkThreadRead();

  // Auto-select first thread on load.
  useEffect(() => {
    if (!activeThreadId && threads.length > 0) {
      setActiveThreadId(threads[0].id);
    }
  }, [activeThreadId, threads]);

  // Mark active thread read when it changes or new messages arrive.
  useEffect(() => {
    if (activeThreadId) {
      markRead.mutate(activeThreadId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId, messagesPages?.pages[0]?.[0]?.id]);

  // Flatten paginated messages, oldest first for the thread renderer.
  const flatMessages = useMemo(() => {
    const all = (messagesPages?.pages ?? []).flat();
    return all
      .slice()
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
  }, [messagesPages]);

  const conversationMessages = useMemo(
    () => flatMessages.map((m) => messageToThreadMessage(m, currentUserId)),
    [flatMessages, currentUserId]
  );

  const lastOutboundMessageId = useMemo(() => {
    for (let i = flatMessages.length - 1; i >= 0; i--) {
      if (flatMessages[i].sender_id === currentUserId && !flatMessages[i].deleted_at) {
        return flatMessages[i].id;
      }
    }
    return null;
  }, [flatMessages, currentUserId]);

  const otherLastReadAt = useMemo(() => {
    if (!activeThread || !currentUserId) return null;
    const others = activeThread.participants.filter(
      (p) => p.profile_id !== currentUserId && !p.left_at
    );
    if (others.length === 0) return null;
    const latest = others
      .map((p) => p.last_read_at)
      .filter((t): t is string => !!t)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
    return latest ?? null;
  }, [activeThread, currentUserId]);

  const typingIndicators: MessageAuthor[] = typingUsers.map((u) => ({
    id: u.profile_id,
    name: u.full_name ?? 'Someone',
  }));

  const myParticipantInActiveThread = useMemo(() => {
    if (!activeThread || !currentUserId) return null;
    return (
      activeThread.participants.find((p) => p.profile_id === currentUserId) ?? null
    );
  }, [activeThread, currentUserId]);

  const filteredThreads = useMemo(() => {
    const archiveFiltered = threads.filter((t) => {
      const my = t.participants.find((p) => p.profile_id === currentUserId);
      const archived = !!my?.archived_at;
      return showArchived ? archived : !archived;
    });
    if (!search.trim()) return archiveFiltered;
    const q = search.toLowerCase();
    return archiveFiltered.filter((t) => {
      if (counterpartName(t, currentUserId).toLowerCase().includes(q)) return true;
      return t.title?.toLowerCase().includes(q) ?? false;
    });
  }, [threads, search, currentUserId, showArchived]);

  const handleSendMessage = async ({ body }: { body: string }) => {
    if (!activeThreadId) return;
    if (!body.trim() && pendingAttachments.length === 0) return;
    try {
      await sendMessage.mutateAsync({
        threadId: activeThreadId,
        body,
        attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined,
      });
      setPendingAttachments([]);
      setSendError(null);
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : 'Unable to send message.'
      );
      throw err;
    }
  };

  const handleSelectThread = (threadId: string) => {
    setActiveThreadId(threadId);
    setShowMobileList(false);
  };

  const threadTitle = activeThread
    ? counterpartName(activeThread, currentUserId)
    : 'Conversation';
  const lastUpdated = activeThread?.last_message_at ?? activeThread?.updated_at;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <h1 className="type-page-title">Messages</h1>
          <p className="type-body mt-1">Communicate with your design team</p>
        </div>

        <div className="grid gap-0 lg:grid-cols-[320px,1fr]">
          {/* Thread List */}
          <div
            className={cn(
              'h-[70vh] overflow-hidden border-r border-[var(--border-default)]',
              !showMobileList && 'hidden lg:block'
            )}
          >
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="type-meta">
                  {showArchived ? 'Archived' : 'Conversations'}
                </h2>
                <button
                  type="button"
                  onClick={() => setShowArchived((prev) => !prev)}
                  className="type-meta-small underline-offset-2 hover:underline"
                  data-testid="toggle-archived"
                >
                  {showArchived ? 'Active' : 'Show archived'}
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search conversations"
                  className="pl-10"
                />
              </div>
            </div>
            <div className="h-full overflow-y-auto">
              {threadsLoading ? (
                <div className="space-y-4 p-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : filteredThreads.length > 0 ? (
                <div className="divide-y divide-[var(--border-subtle)]">
                  {filteredThreads.map((thread) => {
                    const name = counterpartName(thread, currentUserId);
                    const isActive = thread.id === activeThreadId;
                    const unread = thread.unread_count > 0;
                    return (
                      <button
                        key={thread.id}
                        type="button"
                        onClick={() => handleSelectThread(thread.id)}
                        className={cn(
                          'w-full p-4 text-left transition-colors hover:bg-[rgba(196,165,123,0.04)]',
                          isActive && 'bg-[rgba(196,165,123,0.08)]'
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--border-default)] text-sm font-medium text-[var(--text-muted)]">
                              {getInitials(name)}
                            </div>
                            <div className="min-w-0">
                              <p
                                className={cn(
                                  'truncate text-sm text-[var(--text-primary)]',
                                  unread ? 'font-semibold' : 'font-medium'
                                )}
                              >
                                {name}
                              </p>
                              <p className="truncate type-meta-small mt-0.5">
                                {thread.kind === 'project'
                                  ? 'Project conversation'
                                  : 'Direct message'}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {unread && (
                              <span className="rounded-full bg-patina-clay px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                {thread.unread_count}
                              </span>
                            )}
                            <span className="type-meta-small">
                              {formatRelativeTime(thread.last_message_at)}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <MessageSquare className="h-8 w-8 text-[var(--text-muted)] opacity-50" />
                  <p className="type-body-small">No conversations yet</p>
                </div>
              )}
            </div>
          </div>

          {/* Active Thread */}
          <div className={cn('flex flex-col', showMobileList && 'hidden lg:flex')}>
            {activeThreadId && activeThread ? (
              <>
                <div className="flex items-center gap-4 border-b border-[var(--border-default)] px-6 py-4">
                  <button
                    type="button"
                    onClick={() => setShowMobileList(true)}
                    className="lg:hidden p-1 -ml-1 hover:opacity-70 transition-opacity"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <div className="flex-1">
                    <h2 className="type-item-name">{threadTitle}</h2>
                    <p className="type-meta-small mt-0.5">
                      Updated {formatRelativeTime(lastUpdated ?? new Date().toISOString())}
                    </p>
                  </div>
                  <ThreadSettingsMenu
                    threadId={activeThreadId}
                    myParticipant={myParticipantInActiveThread}
                    onArchived={() => {
                      setActiveThreadId(null);
                      setShowMobileList(true);
                    }}
                  />
                </div>

                <div className="h-[400px]">
                  {threadLoading ? (
                    <div className="space-y-4 p-6">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : (
                    <MessageThread
                      className="h-full rounded-none border-0"
                      messages={conversationMessages}
                      currentUserId={currentUserId}
                      typingIndicators={typingIndicators}
                      renderMessageActions={(message) => {
                        if (message.id !== lastOutboundMessageId) return null;
                        return (
                          <ReadReceipt
                            messageCreatedAt={message.timestamp.toISOString()}
                            otherLastReadAt={otherLastReadAt}
                          />
                        );
                      }}
                      emptyState={
                        <div className="text-center type-body-small py-8">
                          No messages in this thread yet.
                        </div>
                      }
                    />
                  )}
                </div>

                <div className="border-t border-[var(--border-default)] px-6 py-4 space-y-3">
                  <p className="type-meta">Reply</p>
                  {activeThreadId && (
                    <MessageAttachmentUploader
                      threadId={activeThreadId}
                      attachments={pendingAttachments}
                      onChange={setPendingAttachments}
                      disabled={sendMessage.isPending}
                    />
                  )}
                  <MessageComposer
                    disabled={!activeThreadId}
                    busy={sendMessage.isPending}
                    placeholder={
                      activeThreadId
                        ? 'Type your message...'
                        : 'Select a conversation first'
                    }
                    onSend={handleSendMessage}
                  />
                  {sendError && (
                    <p className="mt-2 type-meta text-patina-terracotta">{sendError}</p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-[460px] flex-col items-center justify-center gap-3 text-center">
                <MessageSquare className="h-8 w-8 text-[var(--text-muted)] opacity-50" />
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  Select a conversation
                </p>
                <p className="type-body-small">
                  Choose a conversation to view messages from your designer
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
