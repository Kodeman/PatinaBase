'use client';

import { use, useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  useClient,
  useClientMessages,
  useSendClientMessage,
  useClientDecisions,
} from '@patina/supabase';
import type { DesignerClient, ClientMessage, ClientDecision } from '@patina/supabase';
import { MessageBubble } from '@/components/portal/message-bubble';
import { QuickReplyBar } from '@/components/portal/quick-reply-bar';
import { DateDivider } from '@/components/portal/date-divider';
import { DecisionCard } from '@/components/portal/decision-card';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { PortalButton } from '@/components/portal/button';

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
}

function formatMessageDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function groupMessagesByDate(messages: ClientMessage[]): { date: string; messages: ClientMessage[] }[] {
  const groups: Record<string, ClientMessage[]> = {};
  for (const msg of messages) {
    const dateKey = new Date(msg.created_at).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(msg);
  }
  return Object.entries(groups).map(([date, msgs]) => ({ date, messages: msgs }));
}

export default function ClientMessagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: client, isLoading: clientLoading } = useClient(id) as {
    data: DesignerClient | undefined;
    isLoading: boolean;
  };
  const { data: rawMessages, isLoading: msgsLoading } = useClientMessages(id);
  const { data: decisions } = useClientDecisions(id);
  const sendMessage = useSendClientMessage();

  const messages = (rawMessages ?? []) as ClientMessage[];
  const allDecisions = (decisions ?? []).filter(
    (d: ClientDecision) => d.status !== 'draft'
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (clientLoading || msgsLoading) return <LoadingStrata />;
  if (!client) {
    return (
      <p className="type-body py-16 text-center text-[var(--text-muted)]">
        Client not found.
      </p>
    );
  }

  const name =
    client.client?.full_name ||
    client.client_name ||
    client.client_email ||
    'Unknown Client';

  const handleSend = () => {
    if (!newMessage.trim()) return;
    sendMessage.mutate(
      { designerClientId: id, message: newMessage.trim() },
      { onSuccess: () => setNewMessage('') }
    );
  };

  const handleQuickReply = (template: string) => {
    setNewMessage(template);
  };

  const messageGroups = groupMessagesByDate(messages);

  return (
    <div className="flex h-full flex-col pt-8">
      {/* Breadcrumb */}
      <div className="type-meta mb-6">
        <Link
          href="/portal/clients"
          className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]"
        >
          Clients
        </Link>
        <span className="mx-2">&rarr;</span>
        <Link
          href={`/portal/clients/${id}`}
          className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]"
        >
          {name}
        </Link>
        <span className="mx-2">&rarr;</span>
        <span>Messages</span>
      </div>

      {/* Thread header */}
      <div
        className="mb-6 flex items-center justify-between pb-4"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center gap-4">
          <div
            className="flex h-[44px] w-[44px] items-center justify-center rounded-full"
            style={{
              background: 'rgba(122, 155, 118, 0.12)',
              color: 'var(--color-sage)',
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
              fontSize: '0.82rem',
            }}
          >
            {getInitials(name)}
          </div>
          <div>
            <div className="type-label">{name}</div>
            <div className="type-label-secondary">
              {client.status ? `${client.status} client` : ''}
              {client.notes ? ` \u00B7 ${client.notes.split('\n')[0]?.slice(0, 40)}` : ''}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/portal/clients/${id}`}>
            <PortalButton variant="secondary">View Profile</PortalButton>
          </Link>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4" style={{ maxWidth: '600px', margin: '0 auto', width: '100%' }}>
        {messageGroups.length > 0 ? (
          messageGroups.map((group) => (
            <div key={group.date}>
              <DateDivider date={group.date} />
              {group.messages.map((msg) => {
                const isOwn = msg.sender_id !== client.client_id;
                return (
                  <MessageBubble
                    key={msg.id}
                    direction={isOwn ? 'out' : 'in'}
                    message={msg.message}
                    timestamp={formatMessageDate(msg.created_at)}
                    senderName={!isOwn ? msg.sender?.full_name || name : undefined}
                  />
                );
              })}
            </div>
          ))
        ) : (
          <p className="type-body py-16 text-center italic text-[var(--text-muted)]">
            No messages yet. Start the conversation below.
          </p>
        )}

        {/* Inline decision cards */}
        {allDecisions.map((d: ClientDecision) => {
          const selectedOption = d.options?.find((o) => o.selected);
          return (
            <div
              key={d.id}
              className="my-4"
              style={{
                maxWidth: '85%',
                marginLeft: d.status === 'responded' ? '0' : 'auto',
              }}
            >
              <DecisionCard
                id={d.id}
                title={d.status === 'responded' && selectedOption
                  ? `${d.title} \u2192 ${selectedOption.name}`
                  : d.title}
                dueDate={
                  d.due_date
                    ? new Date(d.due_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })
                    : undefined
                }
                isOverdue={d.due_date && d.status === 'pending' ? new Date(d.due_date) < new Date() : false}
                description={d.context || undefined}
                optionCount={d.options?.length}
                status={d.status}
                decisionType={d.decision_type}
                blockingStatus={d.blocking_status}
                href={`/portal/decisions/${d.id}`}
              />
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick reply templates */}
      <div className="px-4">
        <QuickReplyBar onSelect={handleQuickReply} />
      </div>

      {/* Compose bar */}
      <div
        className="flex gap-2 rounded-b-lg p-3"
        style={{
          background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Type a message\u2026"
          className="flex-1 rounded-full border border-[var(--border-default)] bg-[var(--bg-primary)] px-4 py-2.5 outline-none focus:border-[var(--accent-primary)]"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            color: 'var(--text-primary)',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!newMessage.trim() || sendMessage.isPending}
          className="cursor-pointer rounded-full border-0 px-5 py-2.5 text-white disabled:opacity-50"
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: '0.72rem',
            background: 'var(--accent-primary)',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
