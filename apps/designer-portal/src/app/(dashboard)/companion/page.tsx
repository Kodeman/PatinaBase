'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Input, Badge, Skeleton } from '@patina/design-system';
import {
  useCompanionConversation,
  useCompanionHistory,
  useSendCompanionMessage,
  useCompanionQuickActions,
  type CompanionMessage,
  type QuickAction,
} from '@patina/supabase';
import { Sparkles, Send, Bot, User, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════════════════
// TYPING INDICATOR
// ═══════════════════════════════════════════════════════════════════════════

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-patina-clay-beige/30">
        <Bot className="h-4 w-4 text-patina-mocha-brown" />
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-patina-off-white px-4 py-3">
        <div className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-patina-mocha-brown/50 [animation-delay:0ms]" />
          <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-patina-mocha-brown/50 [animation-delay:150ms]" />
          <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-patina-mocha-brown/50 [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE BUBBLE
// ═══════════════════════════════════════════════════════════════════════════

function MessageBubble({ message }: { message: CompanionMessage }) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-2',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser
            ? 'bg-patina-mocha-brown text-white'
            : 'bg-patina-clay-beige/30 text-patina-mocha-brown'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'rounded-tr-sm bg-patina-mocha-brown text-white'
            : 'rounded-tl-sm bg-patina-off-white text-patina-charcoal'
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>

        {/* Source badges for companion messages */}
        {!isUser && message.quick_replies && message.quick_replies.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.quick_replies.map((reply: string, i: number) => (
              <Badge key={i} variant="outline" className="text-[10px]">
                {reply}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// QUICK ACTION CHIP
// ═══════════════════════════════════════════════════════════════════════════

function QuickActionChip({
  action,
  onClick,
}: {
  action: QuickAction;
  onClick: (action: QuickAction) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(action)}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-patina-clay-beige/40 bg-white px-3 py-1.5 text-xs font-medium text-patina-charcoal transition-colors hover:border-patina-mocha-brown/40 hover:bg-patina-off-white"
    >
      <span>{action.icon}</span>
      <span>{action.label}</span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EMPTY STATE
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_SUGGESTIONS: QuickAction[] = [
  {
    id: 'suggest-products',
    icon: '\u{1F50D}',
    label: 'Find products for a project',
    action_type: 'prompt',
    payload: { prompt: 'Help me find products for my current project' },
    priority: 1,
  },
  {
    id: 'style-advice',
    icon: '\u{1F3A8}',
    label: 'Get style recommendations',
    action_type: 'prompt',
    payload: { prompt: 'Give me style recommendations based on my recent work' },
    priority: 2,
  },
  {
    id: 'client-prep',
    icon: '\u{1F4CB}',
    label: 'Prepare for a client meeting',
    action_type: 'prompt',
    payload: { prompt: 'Help me prepare for my next client meeting' },
    priority: 3,
  },
  {
    id: 'market-trends',
    icon: '\u{1F4C8}',
    label: 'Explore market trends',
    action_type: 'prompt',
    payload: { prompt: 'What are the latest interior design trends?' },
    priority: 4,
  },
];

function EmptyState({ onQuickAction }: { onQuickAction: (action: QuickAction) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-patina-clay-beige/40 to-patina-mocha-brown/20">
        <Sparkles className="h-8 w-8 text-patina-mocha-brown" />
      </div>
      <h2 className="mb-2 text-xl font-serif text-patina-charcoal">
        Welcome to your AI Companion
      </h2>
      <p className="mb-8 max-w-md text-center text-sm text-patina-mocha-brown">
        I can help with product sourcing, style recommendations, client prep, and more.
        Ask me anything or try a suggestion below.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {DEFAULT_SUGGESTIONS.map((suggestion) => (
          <QuickActionChip
            key={suggestion.id}
            action={suggestion}
            onClick={onQuickAction}
          />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LOADING STATE
// ═══════════════════════════════════════════════════════════════════════════

function LoadingState() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={cn(
            'flex items-start gap-3',
            i % 2 === 0 ? 'flex-row-reverse' : 'flex-row'
          )}
        >
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton
            className={cn(
              'h-16 rounded-2xl',
              i % 2 === 0 ? 'w-48' : 'w-64'
            )}
          />
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function CompanionPage() {
  const [inputValue, setInputValue] = useState('');
  const [optimisticMessages, setOptimisticMessages] = useState<CompanionMessage[]>([]);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Data hooks
  const { data: conversation, isLoading: conversationLoading } = useCompanionConversation();
  const { data: history, isLoading: historyLoading } = useCompanionHistory(
    conversation?.id,
    50
  );
  const sendMessage = useSendCompanionMessage();
  const { data: quickActionsData } = useCompanionQuickActions({
    screen: 'companion',
  });

  const messages = [
    ...(history?.messages ?? []),
    ...optimisticMessages,
  ];

  const quickActions = quickActionsData?.quick_actions ?? [];
  const isLoading = conversationLoading || historyLoading;

  // Auto-scroll to bottom on new messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  // Track scroll position to show/hide scroll-to-bottom button
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollButton(!isNearBottom);
  }, []);

  // Send a message
  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || sendMessage.isPending) return;

    setInputValue('');

    // Optimistic: add user message immediately
    const optimisticUserMsg: CompanionMessage = {
      id: `optimistic-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    setOptimisticMessages((prev) => [...prev, optimisticUserMsg]);

    try {
      const response = await sendMessage.mutateAsync({
        message: text,
        conversation_id: conversation?.id,
        context: { screen: 'companion' },
      });

      // Add companion response as optimistic until invalidation refetches
      const companionMsg: CompanionMessage = {
        id: response.message_id || `response-${Date.now()}`,
        role: 'companion',
        content: response.response,
        timestamp: new Date().toISOString(),
      };
      setOptimisticMessages((prev) => [...prev, companionMsg]);
    } catch {
      // Remove optimistic message on error and restore input
      setOptimisticMessages((prev) =>
        prev.filter((m) => m.id !== optimisticUserMsg.id)
      );
      setInputValue(text);
    }
  }, [inputValue, sendMessage, conversation?.id]);

  // Clear optimistic messages when history refreshes
  useEffect(() => {
    if (history?.messages && history.messages.length > 0) {
      setOptimisticMessages([]);
    }
  }, [history?.messages]);

  // Handle quick action clicks
  const handleQuickAction = useCallback(
    (action: QuickAction) => {
      if (action.action_type === 'prompt' && action.payload?.prompt) {
        setInputValue(action.payload.prompt as string);
      } else if (action.action_type === 'navigate' && action.payload?.href) {
        window.location.href = action.payload.href as string;
      }
    },
    []
  );

  // Handle Enter key
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-patina-clay-beige/30 pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-patina-clay-beige/40 to-patina-mocha-brown/20">
          <Sparkles className="h-5 w-5 text-patina-mocha-brown" />
        </div>
        <div>
          <h1 className="text-lg font-serif font-semibold text-patina-charcoal">
            AI Companion
          </h1>
          <p className="text-xs text-patina-mocha-brown">
            Your personal design assistant
          </p>
        </div>
      </div>

      {/* Messages area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-y-auto py-4"
      >
        {isLoading ? (
          <LoadingState />
        ) : messages.length === 0 ? (
          <EmptyState onQuickAction={handleQuickAction} />
        ) : (
          <div className="space-y-1">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {sendMessage.isPending && <TypingIndicator />}
          </div>
        )}
        <div ref={messagesEndRef} />

        {/* Scroll to bottom button */}
        {showScrollButton && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-patina-clay-beige/40 bg-white p-2 shadow-md transition-colors hover:bg-patina-off-white"
          >
            <ArrowDown className="h-4 w-4 text-patina-mocha-brown" />
          </button>
        )}
      </div>

      {/* Quick actions bar */}
      {quickActions.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-t border-patina-clay-beige/20 px-1 py-2 scrollbar-none">
          {quickActions.map((action) => (
            <QuickActionChip
              key={action.id}
              action={action}
              onClick={handleQuickAction}
            />
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="flex items-center gap-2 border-t border-patina-clay-beige/30 pt-4">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask your AI companion anything..."
          className="flex-1 rounded-full border-patina-clay-beige/40 bg-white px-4 py-2 text-sm focus-visible:ring-patina-mocha-brown/30"
          disabled={sendMessage.isPending}
        />
        <Button
          onClick={handleSend}
          disabled={!inputValue.trim() || sendMessage.isPending}
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full bg-patina-mocha-brown text-white hover:bg-patina-mocha-brown/90"
        >
          <Send className="h-4 w-4" />
          <span className="sr-only">Send message</span>
        </Button>
      </div>
    </div>
  );
}
