'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowLeft, Send } from 'lucide-react';
import {
  useThreads,
  useThread,
  useThreadMessages,
  useSendMessage,
  useMarkThreadRead,
  useInboxRealtime,
  useThreadRealtime,
  useUser,
  type ThreadSummary,
  type CommsMessage,
} from '@patina/supabase';
import { useMessagesPanel } from '@/contexts/messages-panel-context';
import { IconButton, Input } from '@/components/ui/controls';
import { MessageBubble } from './message-bubble';

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
}

function counterpartName(thread: ThreadSummary, myId: string): string {
  const others = thread.participants.filter(
    (p) => p.profile_id !== myId && !p.left_at
  );
  if (others.length === 0) return thread.title ?? 'Conversation';
  return others
    .map((p) => p.profile?.full_name ?? 'Unknown')
    .filter(Boolean)
    .join(', ');
}

export function MessagesPanel() {
  const { isOpen, close } = useMessagesPanel();
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  // Inbox-level realtime keeps the thread list and unread badges fresh while
  // the panel is mounted, even when collapsed.
  useInboxRealtime();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/20"
            onClick={close}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-0 right-0 top-0 z-50 flex w-[400px] max-w-[90vw] flex-col border-l border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xl"
          >
            {activeThreadId ? (
              <ConversationView
                threadId={activeThreadId}
                onBack={() => setActiveThreadId(null)}
                onClose={close}
              />
            ) : (
              <ThreadListView
                onSelectThread={setActiveThreadId}
                onClose={close}
              />
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ThreadListView({
  onSelectThread,
  onClose,
}: {
  onSelectThread: (id: string) => void;
  onClose: () => void;
}) {
  const { user } = useUser();
  const myId = user?.id ?? '';
  const { data: threads = [], isLoading } = useThreads();

  const sorted = useMemo(() => {
    return [...threads].sort((a, b) => {
      // Unread first, then by activity desc.
      if (a.unread_count > 0 && b.unread_count === 0) return -1;
      if (a.unread_count === 0 && b.unread_count > 0) return 1;
      return (
        new Date(b.last_message_at).getTime() -
        new Date(a.last_message_at).getTime()
      );
    });
  }, [threads]);

  return (
    <>
      <div className="flex h-[52px] items-center justify-between border-b border-[var(--border-default)] px-4">
        <h2 className="font-heading text-sm font-medium text-[var(--text-primary)]">
          Messages
        </h2>
        <IconButton variant="ghost" size="sm" label="Close" onClick={onClose}>
          <X className="h-4 w-4" />
        </IconButton>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
            Loading...
          </div>
        ) : sorted.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
            No conversations yet
          </div>
        ) : (
          sorted.map((thread) => {
            const name = counterpartName(thread, myId);
            const unread = thread.unread_count;
            return (
              <button
                key={thread.id}
                onClick={() => onSelectThread(thread.id)}
                className="flex w-full items-center gap-3 border-b border-[rgba(229,226,221,0.4)] px-4 py-3 text-left transition-colors hover:bg-[var(--hover-bg,rgba(196,165,123,0.06))]"
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--border-default)]">
                  <span className="text-[0.55rem] font-medium text-[var(--text-muted)]">
                    {getInitials(name)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={`truncate text-[0.82rem] text-[var(--text-primary)] ${
                      unread > 0 ? 'font-semibold' : 'font-medium'
                    }`}
                  >
                    {name}
                  </div>
                  <div className="truncate font-mono text-[0.6rem] capitalize text-[var(--text-muted)]">
                    {thread.kind === 'project'
                      ? 'Project conversation'
                      : thread.kind === 'vendor_brief'
                        ? 'Vendor brief'
                        : 'Direct message'}
                  </div>
                </div>
                {unread > 0 && (
                  <span
                    className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold text-white"
                    style={{ background: 'var(--color-clay, #C4A57B)' }}
                  >
                    {unread}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

function ConversationView({
  threadId,
  onBack,
  onClose,
}: {
  threadId: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const { user } = useUser();
  const myId = user?.id ?? '';

  const { data: thread } = useThread(threadId);
  const { data: pages, isLoading } = useThreadMessages(threadId);
  useThreadRealtime(threadId);

  const sendMessage = useSendMessage();
  const markRead = useMarkThreadRead();
  const [draft, setDraft] = useState('');

  // Mark read on mount + on new message arrival.
  useEffect(() => {
    markRead.mutate(threadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, pages?.pages[0]?.[0]?.id]);

  const flat = useMemo<CommsMessage[]>(() => {
    const all = (pages?.pages ?? []).flat();
    return all
      .slice()
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
  }, [pages]);

  const title = thread ? counterpartName(thread, myId) : 'Conversation';

  const handleSend = () => {
    const body = draft.trim();
    if (!body) return;
    sendMessage.mutate({ threadId, body });
    setDraft('');
  };

  return (
    <>
      <div className="flex h-[52px] items-center gap-2 border-b border-[var(--border-default)] px-4">
        <IconButton variant="ghost" size="sm" label="Back" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </IconButton>
        <h2 className="flex-1 truncate font-heading text-sm font-medium text-[var(--text-primary)]">
          {title}
        </h2>
        <IconButton variant="ghost" size="sm" label="Close" onClick={onClose}>
          <X className="h-4 w-4" />
        </IconButton>
      </div>

      <div className="flex flex-1 flex-col-reverse gap-2 overflow-y-auto p-4">
        {isLoading ? (
          <div className="text-center text-sm text-[var(--text-muted)]">
            Loading...
          </div>
        ) : flat.length === 0 ? (
          <div className="text-center text-sm text-[var(--text-muted)]">
            No messages yet
          </div>
        ) : (
          [...flat].reverse().map((msg) => {
            const isFromMe = msg.sender_id === myId;
            return (
              <MessageBubble
                key={msg.id}
                direction={isFromMe ? 'out' : 'in'}
                message={msg.deleted_at ? '(message deleted)' : msg.body}
                timestamp={msg.created_at}
                senderName={msg.sender?.full_name ?? undefined}
              />
            );
          })
        )}
      </div>

      <div className="border-t border-[var(--border-default)] p-3">
        <div className="flex items-center gap-2">
          <Input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Type a message..."
            className="flex-1"
          />
          <IconButton
            variant="ghost"
            size="md"
            label="Send message"
            onClick={handleSend}
            disabled={!draft.trim() || sendMessage.isPending}
            className="bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)] hover:text-white"
          >
            <Send className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
    </>
  );
}
