'use client';

import { Fragment, useEffect, useRef, useCallback } from 'react';
import { createBrowserClient } from '@patina/supabase';
import type {
  Proposal,
  ProposalSection,
  ProposalItem,
  ProposalPaymentMilestone,
  ProposalPhase,
  ProposalExclusion,
  ProposalScopeRoom,
  ProposalBoardSummary,
} from '@patina/supabase';
import {
  LineItemsBlock,
  PaymentScheduleBlock,
  TimelinePhasesBlock,
  ExclusionsBlock,
  ScopeRoomsBlock,
} from '@patina/design-system';
import { useAuth } from '@/hooks/use-auth';
import { StrataMark } from '@/components/strata-mark';
import { BoardsBlock } from '@/components/board-block';
import { proposalClientEvents } from '@/lib/analytics/events';

interface ProposalDocumentProps {
  proposal: Proposal & { items?: ProposalItem[] };
  sections: ProposalSection[];
  trackEngagement?: boolean;
  paymentMilestones?: ProposalPaymentMilestone[];
  phases?: ProposalPhase[];
  exclusions?: ProposalExclusion[];
  scopeRooms?: ProposalScopeRoom[];
  boards?: ProposalBoardSummary[];
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function ProposalDocument({
  proposal,
  sections,
  trackEngagement = true,
  paymentMilestones = [],
  phases = [],
  exclusions = [],
  scopeRooms = [],
  boards = [],
}: ProposalDocumentProps) {
  const { user } = useAuth();
  const hasRecordedOpen = useRef(false);
  const activeSectionRef = useRef<string | null>(null);
  const sectionStartRef = useRef<number>(0);

  const recordEvent = useCallback(
    async (eventType: string, sectionType?: string, durationSeconds?: number) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabase = createBrowserClient() as any;
        await supabase.from('proposal_engagement').insert({
          proposal_id: proposal.id,
          viewer_id: user?.id ?? null,
          event_type: eventType,
          section_type: sectionType ?? null,
          duration_seconds: durationSeconds ?? null,
          metadata: {},
        });
      } catch {
        // Silent — engagement tracking should never block render
      }
    },
    [proposal.id, user?.id]
  );

  useEffect(() => {
    if (!trackEngagement || hasRecordedOpen.current) return;
    if (!user || user.id === proposal.designer_id) return;

    hasRecordedOpen.current = true;
    void recordEvent('opened');
    proposalClientEvents.viewedByClient({ proposalId: proposal.id });

    if (proposal.status === 'sent') {
      void (async () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const supabase = createBrowserClient() as any;
          await supabase
            .from('proposals')
            .update({ status: 'viewed', viewed_at: new Date().toISOString() })
            .eq('id', proposal.id);
        } catch {
          // Silent
        }
      })();
    }
  }, [trackEngagement, user, proposal.id, proposal.status, proposal.designer_id, recordEvent]);

  // boards.length is a dep so the observer re-binds once the (async-loaded)
  // boards section is in the DOM — otherwise it would never be observed.
  const boardCount = boards.length;

  useEffect(() => {
    if (!trackEngagement) return;
    if (!sections || sections.length === 0) return;

    const flushActive = () => {
      if (activeSectionRef.current && sectionStartRef.current > 0) {
        const elapsed = Math.round((Date.now() - sectionStartRef.current) / 1000);
        if (elapsed >= 2) {
          void recordEvent('section_viewed', activeSectionRef.current, elapsed);
          proposalClientEvents.sectionViewed({
            proposalId: proposal.id,
            sectionType: activeSectionRef.current,
            durationSeconds: elapsed,
          });
        }
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const sectionType = (entry.target as HTMLElement).dataset.sectionType;
          if (!sectionType) continue;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            if (activeSectionRef.current !== sectionType) {
              flushActive();
              activeSectionRef.current = sectionType;
              sectionStartRef.current = Date.now();
            }
          }
        }
      },
      { threshold: 0.5 }
    );

    document.querySelectorAll('[data-section-type]').forEach((el) => observer.observe(el));

    const handleUnload = () => flushActive();
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      flushActive();
      observer.disconnect();
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [trackEngagement, sections, recordEvent, boardCount]);

  const items = proposal.items ?? [];

  // Mood boards render after the `concept` section when one exists, else just
  // before `selections`, else after the last section. A negative index means
  // "before all sections" (selections-first or section-less proposals).
  const conceptIndex = sections.findIndex((s) => s.type === 'concept');
  const selectionsIndex = sections.findIndex((s) => s.type === 'selections');
  const boardsAfterIndex =
    conceptIndex >= 0
      ? conceptIndex
      : selectionsIndex >= 0
        ? selectionsIndex - 1
        : sections.length - 1;

  return (
    <article
      className="proposal-print-area mx-auto rounded-lg bg-white shadow-sm"
      style={{
        maxWidth: 760,
        padding: 'clamp(1.5rem, 3vw, 2.5rem)',
        boxShadow: '0 1px 3px rgba(44,41,38,0.04), 0 8px 32px rgba(44,41,38,0.05)',
      }}
    >
      <header className="mb-8 flex items-baseline justify-between border-b border-[var(--border-subtle)] pb-6">
        <div>
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.65rem',
              fontWeight: 500,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            Proposal
          </p>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.6rem',
              fontWeight: 400,
              color: 'var(--text-primary)',
              marginTop: '0.25rem',
            }}
          >
            {proposal.title}
          </h1>
          {proposal.client?.full_name && (
            <p className="type-meta mt-1 text-[var(--text-muted)]">
              For {proposal.client.full_name}
            </p>
          )}
        </div>
        <span className="type-meta-small text-[var(--text-muted)]">
          {formatDate(proposal.created_at)}
        </span>
      </header>

      {boardsAfterIndex < 0 && <BoardsBlock boards={boards} />}

      {sections.map((section, index) => (
        <Fragment key={section.id}>
        <div data-section-type={section.type}>
          {index > 0 && <StrataMark variant="micro" />}

          <section className="py-8">
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 400,
                fontSize: '1.4rem',
                color: 'var(--text-primary)',
                marginBottom: '1.25rem',
              }}
            >
              {section.title}
            </h2>

            {section.body && section.type !== 'investment' && section.type !== 'timeline' && (
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.92rem',
                  lineHeight: 1.75,
                  color: 'var(--text-body)',
                  maxWidth: 640,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {section.body}
              </p>
            )}

            {section.type === 'concept' && (
              <ConceptBlock metadata={section.metadata} />
            )}

            {section.type === 'space_plan' && (
              <SpacePlanBlock metadata={section.metadata} />
            )}

            {section.type === 'selections' && items.length > 0 && (
              <SelectionsList items={items} />
            )}

            {section.type === 'investment' && (
              <div className="mt-2">
                <LineItemsBlock items={items} totalCents={proposal.total_amount || 0} />
                {scopeRooms.length > 0 && (
                  <div className="mt-6">
                    <p
                      className="mb-1 type-meta-small text-[var(--text-muted)]"
                      style={{ textTransform: 'uppercase', letterSpacing: '0.12em' }}
                    >
                      Per-room budgets
                    </p>
                    <ScopeRoomsBlock
                      rooms={scopeRooms.map((r) => ({
                        name: r.name,
                        room_type: r.room_type,
                        budget_cents: r.budget_cents,
                      }))}
                    />
                  </div>
                )}
                <PaymentScheduleBlock
                  milestones={paymentMilestones.map((m) => ({
                    label: m.label,
                    percentage: m.percentage,
                    amount_cents: m.amount_cents,
                    trigger_condition: m.trigger_condition,
                  }))}
                  totalCents={proposal.total_amount || 0}
                />
                {exclusions.length > 0 && (
                  <div className="mt-6">
                    <p
                      className="mb-1 type-meta-small text-[var(--text-muted)]"
                      style={{ textTransform: 'uppercase', letterSpacing: '0.12em' }}
                    >
                      Not included
                    </p>
                    <ExclusionsBlock
                      exclusions={exclusions.map((e) => ({
                        description: e.description,
                        category: e.category,
                      }))}
                    />
                  </div>
                )}
              </div>
            )}

            {section.type === 'timeline' && (
              <TimelinePhasesBlock
                phases={phases.map((p) => ({
                  name: p.name,
                  duration_weeks: p.duration_weeks,
                }))}
              />
            )}
          </section>
        </div>
        {index === boardsAfterIndex && <BoardsBlock boards={boards} />}
        </Fragment>
      ))}

      <footer className="mt-12 flex items-baseline justify-between border-t border-[var(--border-subtle)] pt-6">
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 500,
            fontSize: '0.65rem',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          Patina
        </span>
        <span className="type-meta-small">
          {proposal.title} &middot; v{proposal.version ?? 1}.0
        </span>
      </footer>
    </article>
  );
}

function ConceptBlock({ metadata }: { metadata: Record<string, unknown> }) {
  const moodUrls = (metadata?.mood_board_urls as string[]) || [];
  const palette = (metadata?.color_palette as Array<{ hex: string }>) || [];
  if (moodUrls.length === 0 && palette.length === 0) return null;
  return (
    <div className="mt-6">
      {moodUrls.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2.5">
          {moodUrls.map((url, i) => (
            <div key={i} className="h-[75px] w-[100px] overflow-hidden rounded bg-[var(--color-pearl)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
      )}
      {palette.length > 0 && (
        <div className="flex gap-1.5">
          {palette.map((c, i) => (
            <div key={i} className="h-12 w-12 rounded" style={{ background: c.hex }} />
          ))}
        </div>
      )}
    </div>
  );
}

function SpacePlanBlock({ metadata }: { metadata: Record<string, unknown> }) {
  const url = metadata?.floor_plan_url as string | undefined;
  return (
    <div
      className="relative mt-4 mb-4 flex h-[220px] items-center justify-center overflow-hidden rounded-lg"
      style={{ background: 'var(--color-pearl, #f5f3ee)' }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Space plan" className="h-full w-full object-contain" />
      ) : (
        <span className="type-meta-small">Space plan pending</span>
      )}
    </div>
  );
}

function SelectionsList({ items }: { items: ProposalItem[] }) {
  return (
    <ul className="mt-4 space-y-3">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-center gap-3 rounded-[3px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2.5"
        >
          {(item.image_url || item.product?.images?.[0]) && (
            <div
              className="h-12 w-12 flex-shrink-0 overflow-hidden rounded"
              style={{ background: 'var(--color-pearl, #f5f3ee)' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.image_url || item.product?.images?.[0]!}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="type-body-small font-medium text-[var(--text-primary)]">
              {item.name || item.product?.name || 'Item'}
            </p>
            {(item.vendor_name || item.product?.brand) && (
              <p className="type-meta-small text-[var(--text-muted)]">
                {item.vendor_name || item.product?.brand}
                {item.quantity > 1 && ` · Qty ${item.quantity}`}
              </p>
            )}
          </div>
          <span className="type-meta text-[var(--text-primary)]">
            {formatCurrency((item.line_total_cents || 0) / 100)}
          </span>
        </li>
      ))}
    </ul>
  );
}

