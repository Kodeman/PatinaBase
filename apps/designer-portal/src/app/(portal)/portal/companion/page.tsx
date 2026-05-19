'use client';

import { useState, useEffect, useRef } from 'react';
import { useCompanionConversation, useCompanionHistory, useSendCompanionMessage, useCompanionQuickActions } from '@patina/supabase';
import { PortalButton } from '@/components/portal/button';
import { LoadingStrata } from '@/components/portal/loading-strata';
// F1.4 — Aesthete Engine migrated to reactive help-system per spec §4.2 + §9.2.
// Every Patina-vocab concept (Aesthete Engine, Aesthete Score, Aesthete
// Vocabulary, the teaching loop) is marked with <StrataInfoIcon> so the icon
// trains the eye that "this is a platform concept worth learning." Generic
// "what does this mean?" affordances would use <InfoIcon>, but on this surface
// every helpable noun IS Patina vocab. <LearnMore> collapses the data-use /
// "how the engine learns" deep dive (spec §9.2 Phase-2 line 982). Until Sanity
// content publishes, every component renders its `fallback` body per the
// spec §13.4 graceful-degradation chain.
import {
  StrataInfoIcon,
  SectionIntro,
  LearnMore,
  EmptyState,
  Tooltip,
  SurfaceKeys,
} from '@patina/help-system';
import { Sparkles } from 'lucide-react';

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
      // Existing typo `conversationId` (vs schema `conversation_id`) is
      // pre-existing baseline — out of scope for the F1.4 help-system migration.
      { message: input.trim(), conversationId },
      { onSuccess: () => setInput('') }
    );
    setInput('');
  };

  if (isLoading) return <LoadingStrata />;

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-[calc(100vh-200px)] flex-col pt-8">
      {/* ── Page header ─────────────────────────────────────────────────────
          The H1 carries the Patina-vocab name ("The Aesthete Engine") next to
          a <StrataInfoIcon> — this is the canonical spec §4.2 line 216 pattern.
          The StrataInfoIcon points at the engine-overview surface key so
          authors can write a single canonical paragraph defining the concept
          and reuse it across every entry-point to this surface. */}
      <h1 className="type-section-head mb-2 inline-flex items-baseline gap-2">
        <span>The Aesthete Engine</span>
        <StrataInfoIcon
          surfaceKey={SurfaceKeys.DesignerPortal.Aesthete.EngineOverview}
          fallback="The Aesthete Engine is Patina's designer-taught ML system. As you teach products and validate matches, it learns your style vocabulary and translates it into personalized recommendations."
        />
      </h1>
      <SectionIntro
        className="mb-4 max-w-prose"
        surfaceKey={SurfaceKeys.DesignerPortal.Aesthete.Engine.Intro}
        fallback="Ask it to find products, propose style recommendations, or surface market trends — every prompt feeds back into your Aesthete profile."
      />
      <LearnMore
        className="mb-6"
        surfaceKey={SurfaceKeys.DesignerPortal.Aesthete.Engine.HowItWorks}
        fallback="The Engine learns from three signals: products you teach, decisions you make on behalf of clients, and matches you validate. Each interaction refines your style vocabulary — the set of attributes the model uses to score future recommendations. Your teaching data is private to your account; we never share it with other designers or expose individual prompts in shared analytics."
      />

      {/* ── Messages ────────────────────────────────────────────────────────
          When there is no conversation yet, swap the chat-style greeting for
          a help-system <EmptyState>. The EmptyState surfaces the Aesthete-
          specific "teaching session" empty per spec §9.2 Phase-2 line 979.
          Once a conversation exists, render messages as before — every
          assistant message is labelled "Aesthete Engine" so the Patina-vocab
          framing stays consistent across the transcript. */}
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {!hasMessages && (
          <EmptyState
            size="md"
            icon={<Sparkles className="h-12 w-12" />}
            surfaceKey={SurfaceKeys.DesignerPortal.Aesthete.EmptyTeaching}
          />
        )}
        {messages.map((msg: Any) => {
          const isUser = msg.role === 'user' || msg.sender === 'user';
          return (
            <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[75%] ${isUser ? '' : 'rounded-sm bg-[var(--bg-hover)] px-4 py-3'}`}>
                {!isUser && (
                  <span className="type-meta mb-1 inline-flex items-center gap-1.5">
                    <span>Aesthete Engine</span>
                    {/* StrataInfoIcon next to the Engine label inside every
                        assistant turn — the same surface key is reused so a
                        single canonical paragraph in Sanity drives every
                        instance. The icon costs nothing visually (14px Clay
                        glyph) but it's the affordance that lets a new
                        designer mid-conversation say "wait, what IS this?". */}
                    <StrataInfoIcon
                      surfaceKey={SurfaceKeys.DesignerPortal.Aesthete.EngineOverview}
                      fallback="The Aesthete Engine is Patina's designer-taught ML — it learns your style vocabulary from teaching, decisions, and validations."
                    />
                  </span>
                )}
                <p className="type-body">{msg.content || msg.message || msg.text || ''}</p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Quick Actions ───────────────────────────────────────────────────
          Quick-action chips are scaffolding for first-touch teaching prompts.
          Wrap the row with a <SectionIntro> so the CMS can carry a 1-sentence
          framing ("here are good ways to start teaching"), and wrap each chip
          in a <Tooltip> on the quick-actions intro key so hover surfaces a
          single canonical hint. The chip body itself is the prompt — the
          tooltip explains WHY this prompt is a good teaching input. */}
      {!hasMessages && (
        <div className="mb-4">
          <SectionIntro
            className="mb-3"
            surfaceKey={SurfaceKeys.DesignerPortal.Aesthete.QuickActions.Intro}
            fallback="Quick prompts to start teaching — each one feeds your Aesthete profile."
          />
          <div className="flex flex-wrap gap-2">
            {(Array.isArray(quickActions) ? quickActions : []).map((action: Any) => {
              const label = typeof action === 'string' ? action : action.label || action.text || '';
              return (
                <Tooltip
                  key={label}
                  surfaceKey={SurfaceKeys.DesignerPortal.Aesthete.QuickActions.Intro}
                  fallback="Tap to use this as a starting prompt — your replies shape what the Aesthete Engine recommends next."
                >
                  <button
                    onClick={() => setInput(label)}
                    className="type-btn-text cursor-pointer rounded-sm border border-[var(--border-default)] bg-transparent px-3 py-1.5 text-[var(--text-body)] transition-colors hover:bg-[var(--bg-hover)]"
                  >
                    {label}
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Input ───────────────────────────────────────────────────────────
          No help-system primitive applies to the bare input row — the
          surrounding SectionIntro + EmptyState already carry the "how to use
          this" framing. Leaving the input untouched per ambient principle:
          guidance lives in the chrome around the work, never blocking it. */}
      <div className="flex items-center gap-3 border-t border-[var(--border-default)] pt-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask the Aesthete Engine..."
          className="type-body flex-1 border-0 bg-transparent py-2 outline-none placeholder:text-[var(--text-subtle)]"
        />
        <PortalButton variant="ghost" onClick={handleSend} disabled={!input.trim() || sendMessage.isPending}>
          {sendMessage.isPending ? '...' : 'Send'}
        </PortalButton>
      </div>
    </div>
  );
}
