'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowLeft, Send } from 'lucide-react';
import { useClients, useClientMessages, useSendClientMessage, useUser } from '@patina/supabase';
import type { DesignerClient } from '@patina/supabase';
import { useMessagesPanel } from '@/contexts/messages-panel-context';
import { MessageBubble } from './message-bubble';

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
}

export function MessagesPanel() {
  const { isOpen, close } = useMessagesPanel();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/20"
            onClick={close}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-0 right-0 top-0 z-50 flex w-[400px] max-w-[90vw] flex-col border-l border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xl"
          >
            {selectedClientId ? (
              <ConversationView
                clientId={selectedClientId}
                onBack={() => setSelectedClientId(null)}
                onClose={close}
              />
            ) : (
              <ClientListView
                onSelectClient={setSelectedClientId}
                onClose={close}
              />
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ClientListView({
  onSelectClient,
  onClose,
}: {
  onSelectClient: (id: string) => void;
  onClose: () => void;
}) {
  const { data: rawClients, isLoading } = useClients();
  const clients = (Array.isArray(rawClients) ? rawClients : []) as DesignerClient[];

  const sorted = [...clients].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  return (
    <>
      {/* Header */}
      <div className="flex h-[52px] items-center justify-between border-b border-[var(--border-default)] px-4">
        <h2 className="font-heading text-sm font-medium text-[var(--text-primary)]">
          Messages
        </h2>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--hover-bg,rgba(196,165,123,0.06))] hover:text-[var(--text-primary)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Client list */}
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
          sorted.map((client) => {
            const name = client.client?.full_name || client.client_name || 'Unknown';
            return (
              <button
                key={client.id}
                onClick={() => onSelectClient(client.id)}
                className="flex w-full items-center gap-3 border-b border-[rgba(229,226,221,0.4)] px-4 py-3 text-left transition-colors hover:bg-[var(--hover-bg,rgba(196,165,123,0.06))]"
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--border-default)]">
                  <span className="text-[0.55rem] font-medium text-[var(--text-muted)]">
                    {getInitials(name)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[0.82rem] font-medium text-[var(--text-primary)]">
                    {name}
                  </div>
                  <div className="truncate font-mono text-[0.6rem] capitalize text-[var(--text-muted)]">
                    {client.status || 'client'}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

function ConversationView({
  clientId,
  onBack,
  onClose,
}: {
  clientId: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const { data: messages, isLoading } = useClientMessages(clientId);
  const { mutate: sendMessage } = useSendClientMessage();
  const { user: currentUser } = useUser();
  const [draft, setDraft] = useState('');

  const handleSend = () => {
    if (!draft.trim()) return;
    sendMessage({ designerClientId: clientId, message: draft.trim() });
    setDraft('');
  };

  return (
    <>
      {/* Header */}
      <div className="flex h-[52px] items-center gap-2 border-b border-[var(--border-default)] px-4">
        <button
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--hover-bg,rgba(196,165,123,0.06))] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="flex-1 truncate font-heading text-sm font-medium text-[var(--text-primary)]">
          Conversation
        </h2>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--hover-bg,rgba(196,165,123,0.06))] hover:text-[var(--text-primary)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex flex-1 flex-col-reverse gap-2 overflow-y-auto p-4">
        {isLoading ? (
          <div className="text-center text-sm text-[var(--text-muted)]">Loading...</div>
        ) : !messages || messages.length === 0 ? (
          <div className="text-center text-sm text-[var(--text-muted)]">No messages yet</div>
        ) : (
          [...messages].reverse().map((msg) => {
            const isFromMe = currentUser?.id === msg.sender_id;
            return (
              <MessageBubble
                key={msg.id}
                direction={isFromMe ? 'out' : 'in'}
                message={msg.message}
                timestamp={msg.created_at}
                senderName={msg.sender?.full_name || undefined}
              />
            );
          })
        )}
      </div>

      {/* Compose */}
      <div className="border-t border-[var(--border-default)] p-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Type a message..."
            className="flex-1 rounded-md border border-[var(--border-default)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!draft.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--accent-primary)] text-white transition-opacity disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}
