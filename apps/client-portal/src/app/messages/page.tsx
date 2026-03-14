'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { MessageSquare, Search, ArrowLeft } from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
  useSendMessage,
  useMarkRead,
  useTypingIndicator,
} from '@/hooks/use-comms';
import { formatRelativeTime, getInitials } from '@/lib/utils/format';

type AttachmentLike = {
  id?: string;
  filename?: string;
  name?: string;
  url?: string;
  size?: number;
  mimeType?: string;
  type?: string;
};

type ThreadMessageLike = {
  id?: string;
  authorId?: string;
  authorName?: string;
  authorRole?: string;
  authorAvatar?: string;
  body?: string;
  bodyText?: string;
  text?: string;
  createdAt?: string;
  status?: string;
  attachments?: AttachmentLike[];
  richAttachments?: AttachmentLike[];
  isSystem?: boolean;
  metadata?: Record<string, unknown>;
};

type ThreadLike = {
  id?: string;
  title?: string;
  status?: string;
  lastMessageAt?: string;
  updatedAt?: string;
  projectId?: string;
  participants?: unknown;
  metadata?: Record<string, unknown>;
  messages?: ThreadMessageLike[];
};

interface ParticipantSummary {
  id: string;
  name: string;
  avatar?: string;
  role?: string;
}

const normalizeThreads = (raw: unknown): ThreadLike[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as ThreadLike[];
  if (Array.isArray((raw as Record<string, unknown>)?.threads)) {
    return (raw as { threads: ThreadLike[] }).threads;
  }
  if (Array.isArray((raw as Record<string, unknown>)?.data)) {
    return (raw as { data: ThreadLike[] }).data;
  }
  return [];
};

const extractParticipants = (source: ThreadLike | undefined): ParticipantSummary[] => {
  if (!source) return [];
  let participants = source.participants ?? source.metadata?.participants ?? [];

  if (typeof participants === 'string') {
    try {
      participants = JSON.parse(participants);
    } catch {
      participants = [];
    }
  }

  if (!Array.isArray(participants)) return [];

  return participants.map((participant) => {
    if (typeof participant === 'string') {
      return { id: participant, name: participant };
    }

    const typedParticipant = participant as Record<string, unknown>;
    const id =
      (typedParticipant.id as string) ||
      (typedParticipant.userId as string) ||
      (typedParticipant.email as string) ||
      (typedParticipant.name as string) ||
      'participant';

    return {
      id,
      name:
        (typedParticipant.name as string) ||
        (typedParticipant.displayName as string) ||
        (typedParticipant.email as string) ||
        id,
      avatar: (typedParticipant.avatar as string) || (typedParticipant.avatarUrl as string),
      role: (typedParticipant.role as string) || (typedParticipant.title as string),
    };
  });
};

const mapAttachment = (attachment: AttachmentLike, fallbackId: string) => ({
  id: attachment.id || fallbackId,
  name: attachment.name || attachment.filename || 'Attachment',
  url: attachment.url,
  size: attachment.size ? `${Math.round(attachment.size / 1024)} KB` : undefined,
  type: (attachment.mimeType || attachment.type) as any,
});

const mapThreadMessages = (messages: ThreadMessageLike[], currentUserId: string): ThreadMessage[] => {
  return messages
    .slice()
    .sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime())
    .map((message, index) => {
      const attachments: ThreadMessage['attachments'] = [];

      if (Array.isArray(message.richAttachments)) {
        message.richAttachments.forEach((attachment) => {
          attachments.push(mapAttachment(attachment, `${message.id ?? 'message'}-rich-${attachment.id ?? index}`));
        });
      } else if (Array.isArray(message.attachments)) {
        message.attachments.forEach((attachment, attachmentIndex: number) => {
          attachments.push(mapAttachment(attachment, `${message.id ?? 'message'}-legacy-${attachmentIndex}`));
        });
      }

      return {
        id: message.id || `message-${index}`,
        author: {
          id: message.authorId || 'unknown',
          name: message.authorName || (message.metadata?.authorName as string) || message.authorId || 'Unknown',
          avatarUrl: message.authorAvatar || (message.metadata?.authorAvatar as string),
          role: (message.authorRole || (message.metadata?.authorRole as string)) as MessageAuthor['role'],
        } satisfies MessageAuthor,
        timestamp: new Date(message.createdAt!),
        body: message.bodyText || message.text || message.body || '',
        attachments,
        status: message.status as ThreadMessage['status'],
        variant: message.isSystem
          ? 'system'
          : message.authorId && currentUserId && message.authorId === currentUserId
            ? 'outgoing'
            : 'incoming',
      };
    });
};

const buildThreadTitle = (participants: ParticipantSummary[], currentUserId: string) => {
  const names = participants
    .filter((participant) => participant.id !== currentUserId)
    .map((participant) => participant.name);

  return names.length > 0 ? names.join(', ') : 'Conversation';
};

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export default function MessagesPage() {
  const { user } = useAuth();
  const currentUserId = user?.id ?? '';
  const [search, setSearch] = useState('');
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showMobileList, setShowMobileList] = useState(true);

  const { data: threadsResponse, isLoading: threadsLoading } = useThreads();
  const threads = normalizeThreads(threadsResponse);
  const { data: threadDetailRaw, isLoading: threadLoading } = useThread(activeThreadId);
  const threadDetail = threadDetailRaw as ThreadLike | undefined;
  const { typingUsers } = useTypingIndicator(activeThreadId);
  const sendMessage = useSendMessage();
  const markRead = useMarkRead();

  useEffect(() => {
    if (!activeThreadId && threads.length > 0) {
      setActiveThreadId(threads[0].id!);
    }
  }, [activeThreadId, threads]);

  useEffect(() => {
    if (!activeThreadId || !threadDetail?.messages?.length) return;
    const latestMessage = threadDetail.messages[0];
    if (!latestMessage.id) return;
    markRead.mutate({
      threadId: activeThreadId,
      lastReadMessageId: latestMessage.id,
    });
  }, [activeThreadId, threadDetail?.messages, markRead]);

  const filteredThreads = useMemo(() => {
    if (!search.trim()) return threads;
    const query = search.toLowerCase();
    return threads.filter((thread) => {
      const participants = extractParticipants(thread);
      const names = participants.map((participant) => participant.name?.toLowerCase());
      return (
        thread.title?.toLowerCase().includes(query) ||
        names.some((name) => name?.includes(query)) ||
        (thread.projectId?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [threads, search]);

  const selectedParticipants = extractParticipants(threadDetail);
  const participantLookup = useMemo(() => {
    return selectedParticipants.reduce<Record<string, ParticipantSummary>>((acc, participant) => {
      acc[participant.id] = participant;
      return acc;
    }, {});
  }, [selectedParticipants]);

  const typingIndicators = typingUsers
    .map((userId) => participantLookup[userId])
    .filter(Boolean)
    .map((participant) => ({ id: participant!.id, name: participant!.name }));

  const conversationMessages = useMemo(
    () => mapThreadMessages(threadDetail?.messages ?? [], currentUserId),
    [threadDetail?.messages, currentUserId]
  );

  const handleSendMessage = async ({ body }: { body: string }) => {
    if (!activeThreadId) return;
    try {
      await sendMessage.mutateAsync({
        threadId: activeThreadId,
        data: { bodyText: body },
      });
      setSendError(null);
    } catch (error) {
      const message = 'Unable to send message. Please try again.';
      setSendError(message);
      throw error;
    }
  };

  const handleSelectThread = (threadId: string) => {
    setActiveThreadId(threadId);
    setShowMobileList(false);
  };

  const threadTitle = threadDetail?.title || buildThreadTitle(selectedParticipants, currentUserId);
  const lastUpdated = threadDetail?.lastMessageAt || threadDetail?.updatedAt;

  return (
    <div className="min-h-screen bg-[var(--color-canvas)] p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <h1 className="font-[var(--font-playfair)] text-3xl text-[var(--color-text)]">
            Messages
          </h1>
          <p className="mt-1 text-[var(--color-muted)]">
            Communicate with your design team
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
          {/* Thread List */}
          <Card className={cn(
            'h-[70vh] overflow-hidden',
            !showMobileList && 'hidden lg:block'
          )}>
            <CardHeader className="space-y-4">
              <CardTitle className="text-lg">Conversations</CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search conversations"
                  className="pl-10"
                />
              </div>
            </CardHeader>
            <CardContent className="h-full overflow-y-auto p-0">
              {threadsLoading ? (
                <div className="space-y-4 p-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : filteredThreads.length > 0 ? (
                <div className="divide-y divide-[var(--color-border)]">
                  {filteredThreads.map((thread) => {
                    const participants = extractParticipants(thread);
                    const name = buildThreadTitle(participants, currentUserId);
                    const preview = thread.messages?.[0]?.text || thread.messages?.[0]?.bodyText || 'No messages yet';
                    const isActive = thread.id === activeThreadId;

                    return (
                      <button
                        key={thread.id}
                        type="button"
                        onClick={() => handleSelectThread(thread.id!)}
                        className={cn(
                          'w-full p-4 text-left transition-colors hover:bg-[var(--color-accent)]/5',
                          isActive && 'bg-[var(--color-accent)]/10'
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-accent)]/10 text-sm font-semibold text-[var(--color-accent)]">
                              {getInitials(name)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[var(--color-text)]">{name}</p>
                              <p className="truncate text-xs text-[var(--color-muted)]">{preview}</p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {thread.status && (
                              <Badge variant="outline" className="text-[10px] uppercase">
                                {thread.status}
                              </Badge>
                            )}
                            <span className="text-xs text-[var(--color-muted)]">
                              {formatRelativeTime(thread.lastMessageAt || thread.updatedAt)}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <MessageSquare className="h-10 w-10 text-[var(--color-muted)]" />
                  <p className="text-sm text-[var(--color-muted)]">
                    No conversations yet
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Message Thread */}
          <div className={cn(
            'flex flex-col gap-4',
            showMobileList && 'hidden lg:flex'
          )}>
            <Card className="flex-1 overflow-hidden">
              {activeThreadId && threadDetail ? (
                <>
                  <CardHeader className="flex flex-row items-center gap-4 border-b bg-[var(--color-accent)]/5">
                    <button
                      type="button"
                      onClick={() => setShowMobileList(true)}
                      className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-[var(--color-accent)]/10"
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{threadTitle}</CardTitle>
                        {threadDetail.status && (
                          <Badge variant="subtle" color="neutral" className="text-[10px] uppercase">
                            {threadDetail.status}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-[var(--color-muted)]">
                        Updated {formatRelativeTime(lastUpdated || new Date().toISOString())}
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent className="h-[400px] p-0">
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
                        emptyState={
                          <div className="text-center text-sm text-[var(--color-muted)]">
                            No messages in this thread yet.
                          </div>
                        }
                      />
                    )}
                  </CardContent>
                </>
              ) : (
                <div className="flex h-[460px] flex-col items-center justify-center gap-3 text-center">
                  <MessageSquare className="h-10 w-10 text-[var(--color-muted)]" />
                  <p className="text-sm font-medium text-[var(--color-text)]">
                    Select a conversation
                  </p>
                  <p className="text-xs text-[var(--color-muted)]">
                    Choose a conversation to view messages from your designer
                  </p>
                </div>
              )}
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Reply</CardTitle>
              </CardHeader>
              <CardContent>
                <MessageComposer
                  disabled={!activeThreadId}
                  busy={sendMessage.isPending}
                  placeholder={activeThreadId ? 'Type your message...' : 'Select a conversation first'}
                  onSend={handleSendMessage}
                />
                {sendError && <p className="mt-2 text-sm text-red-600">{sendError}</p>}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
