'use client';

import { useState, useEffect, useRef } from 'react';
import { useCompanionConversation, useCompanionHistory, useSendCompanionMessage, useCompanionQuickActions } from '@patina/supabase';
import { PortalButton } from '@/components/portal/button';
import { LoadingStrata } from '@/components/portal/loading-strata';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function CompanionPage() {
  const { data: conversation } = useCompanionConversation() as { data: Any };
  const conversationId = conversation?.id;
  const { data: rawHistory, isLoading } = useCompanionHistory(conversationId) as { data: Any; isLoading: boolean };
  const sendMessage = useSendCompanionMessage();
  const { data: rawQuickActions } = useCompanionQuickActions({ screen: 'home' }) as { data: Any };

  const messages = Array.isArray(rawHistory) ? rawHistory : rawHistory?.messages || [];
  const quickActions = Array.isArray(rawQuickActions) ? rawQuickActions : rawQuickActions?.actions || [
    'Find products for a modern living room',
    'Style recommendations for small spaces',
    'Help me prepare for a client meeting',
    'Market trends in sustainable furniture',
  ];

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage.mutate(
      { message: input.trim(), conversationId },
      { onSuccess: () => setInput('') }
    );
    setInput('');
  };

  if (isLoading) return <LoadingStrata />;

  return (
    <div className="flex h-[calc(100vh-200px)] flex-col pt-8">
      <h1 className="type-section-head mb-6">Design Companion</h1>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div className="flex items-start">
            <div className="max-w-[75%] rounded-sm bg-[var(--bg-hover)] px-4 py-3">
              <span className="type-meta mb-1 block">Companion</span>
              <p className="type-body">
                Hello! I&apos;m your design companion. I can help you find products, get style recommendations, prepare for client meetings, or explore market trends. How can I help today?
              </p>
            </div>
          </div>
        )}
        {messages.map((msg: Any) => {
          const isUser = msg.role === 'user' || msg.sender === 'user';
          return (
            <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[75%] ${isUser ? '' : 'rounded-sm bg-[var(--bg-hover)] px-4 py-3'}`}>
                {!isUser && <span className="type-meta mb-1 block">Companion</span>}
                <p className="type-body">{msg.content || msg.message || msg.text || ''}</p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      {messages.length === 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {(Array.isArray(quickActions) ? quickActions : []).map((action: Any) => {
            const label = typeof action === 'string' ? action : action.label || action.text || '';
            return (
              <button
                key={label}
                onClick={() => setInput(label)}
                className="type-btn-text cursor-pointer rounded-sm border border-[var(--border-default)] bg-transparent px-3 py-1.5 text-[var(--text-body)] transition-colors hover:bg-[var(--bg-hover)]"
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-3 border-t border-[var(--border-default)] pt-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask your design companion..."
          className="type-body flex-1 border-0 bg-transparent py-2 outline-none placeholder:text-[var(--text-subtle)]"
        />
        <PortalButton variant="ghost" onClick={handleSend} disabled={!input.trim() || sendMessage.isPending}>
          {sendMessage.isPending ? '...' : 'Send'}
        </PortalButton>
      </div>
    </div>
  );
}
