'use client';

/**
 * ThreadConversation (Track C) — the prototype's `.convo`: read the running
 * conversation and reply, in the People Room. This is the ONE shared `use-comms`
 * thread — the very same row that renders on the document margin (MessageBody)
 * and the client mirror. We read with `useThreadMessages`, reply with
 * `useSendMessage`, stay live with `useThreadRealtime`, and clear unread with
 * `useMarkThreadRead`. A reply lands once and shows on every surface (§5).
 *
 * Bubbles read as paper: mine in clay, theirs in pearl — typography-first, zero
 * shadows (D4). The Room beneath never unmounts.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useThread,
  useThreadMessages,
  useThreadRealtime,
  useSendMessage,
  useMarkThreadRead,
  type CommsMessage,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { DocumentAction } from '../../document-action';
import { Avatar } from '../person-bits';
import {
  threadCounterpart,
  scopeLabel,
  participantPartyRole,
} from './thread-bits';

function dayStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ThreadConversation({
  threadId,
  onBack,
  notify,
}: {
  threadId: string;
  onBack: () => void;
  notify: (message: string) => void;
}) {
  const { user } = useAuth();
  const { data: thread } = useThread(threadId);
  const { data: pages, isLoading } = useThreadMessages(threadId);
  const send = useSendMessage();
  const markRead = useMarkThreadRead();
  useThreadRealtime(threadId);

  const [body, setBody] = useState('');
  const markedRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Opening the conversation reads it (clears the margin/inbox 'unread' with it).
  useEffect(() => {
    if (markedRef.current === threadId) return;
    markedRef.current = threadId;
    markRead.mutate(threadId);
    // markRead is a stable mutation object; thread id is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  // Oldest → newest for the reading order (the query returns newest-first pages).
  const messages: CommsMessage[] = useMemo(() => {
    const flat = (pages?.pages ?? []).flat();
    return [...flat].reverse();
  }, [pages]);

  // Keep the latest message in view as the conversation grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const counterpart = useMemo(
    () => (thread ? threadCounterpart(thread, user?.id) : null),
    [thread, user?.id],
  );

  const senderRole = (m: CommsMessage) => {
    const p = thread?.participants.find((pp) => pp.profile_id === m.sender_id);
    return participantPartyRole(p?.role);
  };

  const reply = () => {
    const text = body.trim();
    if (!text) return;
    send.mutate(
      { threadId, body: text },
      {
        onSuccess: () => {
          setBody('');
          notify(
            'Sent. One conversation, every surface — it lives here and on their document.',
          );
        },
      },
    );
  };

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)] transition-colors hover:text-[var(--color-mocha)]"
      >
        ← Threads
      </button>

      <div className="overflow-hidden rounded-[10px] border border-[var(--color-pearl)] bg-white">
        {/* Conversation head — who + scope. */}
        <div className="flex items-center gap-2.5 border-b border-[var(--doc-ink-border)]/40 px-4 py-3">
          {counterpart && (
            <Avatar name={counterpart.name} role={counterpart.role} size={34} />
          )}
          <div className="min-w-0">
            <div className="truncate text-[0.88rem] font-semibold text-[var(--color-charcoal)]">
              {counterpart?.name ?? 'Conversation'}
            </div>
            {thread && (
              <div className="font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
                {scopeLabel(thread.kind)} thread
              </div>
            )}
          </div>
        </div>

        {/* Messages. */}
        <div
          ref={scrollRef}
          className="flex max-h-[360px] flex-col gap-3 overflow-y-auto px-4 py-4"
        >
          {isLoading ? (
            <p className="text-[0.74rem] italic text-[var(--text-muted)]">
              Reading the thread…
            </p>
          ) : messages.length === 0 ? (
            <p className="text-[0.74rem] italic text-[var(--text-muted)]">
              No messages yet — write the first below.
            </p>
          ) : (
            messages.map((m) => {
              const mine = !!user && m.sender_id === user.id;
              const name = mine
                ? 'You'
                : (m.sender?.full_name ?? counterpart?.name ?? 'Them');
              return (
                <div
                  key={m.id}
                  className={`flex max-w-[85%] gap-2.5 ${mine ? 'flex-row-reverse self-end' : 'self-start'}`}
                >
                  <Avatar
                    name={name}
                    role={mine ? 'team' : senderRole(m)}
                    size={26}
                  />
                  <div className={mine ? 'text-right' : ''}>
                    <span
                      className={`inline-block rounded-[10px] px-3 py-2 text-[0.78rem] leading-relaxed ${
                        mine
                          ? 'bg-[var(--color-clay)] text-white'
                          : 'bg-[var(--color-pearl)] text-[var(--color-mocha)]'
                      }`}
                    >
                      {m.deleted_at ? (
                        <span className="italic opacity-70">
                          Message removed.
                        </span>
                      ) : (
                        m.body
                      )}
                    </span>
                    <span className="mt-1 block font-mono text-[11px] uppercase tracking-[0.04em] text-[var(--color-aged-oak)]">
                      {dayStamp(m.created_at)}
                      {m.edited_at ? ' · edited' : ''}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Compose — Enter sends. */}
        <div className="flex items-center gap-2 border-t border-[var(--doc-ink-border)]/40 px-4 py-3">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                reply();
              }
            }}
            aria-label="Write a reply"
            placeholder="Write a reply…"
            className="flex-1 rounded-[20px] border border-[var(--color-pearl)] bg-white px-3.5 py-2 text-[0.78rem] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
          />
          <DocumentAction
            actionKey="send-thread-reply"
            surfaceKey="people"
            regionKey="thread-reply"
            variant="primary"
            onClick={reply}
            disabled={!body.trim() || send.isPending}
            loading={send.isPending}
            loadingLabel="Sending…"
          >
            Send
          </DocumentAction>
        </div>
      </div>
      {send.isError && (
        <p className="mt-2 text-[0.7rem] text-[#C77B6E]">
          {send.error instanceof Error
            ? send.error.message
            : 'Send failed — try again.'}
        </p>
      )}
    </div>
  );
}
