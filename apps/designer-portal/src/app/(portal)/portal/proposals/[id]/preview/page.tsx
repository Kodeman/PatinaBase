'use client';

import { Fragment, use, useEffect, useRef, useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProposal, useProposalSections } from '@/hooks/use-proposals';
import { useEnterRevision } from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { Button, PageActionBar } from '@/components/portal';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';
import { ProposalLetterhead } from '@/components/portal/proposal-letterhead';
import { StrataMark } from '@/components/portal/strata-mark';
import { ProposalProductItem } from '@/components/portal/proposal-product-item';
import { SignatureBlock } from '@/components/portal/signature-block';
import {
  createBrowserClient,
  useProposalPaymentMilestones,
  useProposalPhases,
  useProposalExclusions,
  useProposalScopeRooms,
  useBoardsWithItems,
} from '@patina/supabase';
import type {
  ProposalPaymentMilestone,
  ProposalPhase,
  ProposalExclusion,
  ProposalScopeRoom,
} from '@patina/supabase';
import {
  LineItemsBlock,
  PaymentScheduleBlock,
  TimelinePhasesBlock,
  ExclusionsBlock,
  ScopeRoomsBlock,
  BoardsBlock,
} from '@patina/design-system';

/**
 * Client-facing read-only proposal viewer.
 * Records engagement events to proposal_engagement table.
 * In production this would be a public route; for now it lives under the portal.
 */
export default function ProposalPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const hydrated = useHydrated();
  const router = useRouter();
  const { session } = useAuth();
  const searchParams = useSearchParams();
  const shouldAutoPrint = searchParams.get('print') === '1';
  const enterRevision = useEnterRevision();
  const [revising, setRevising] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: proposal, isLoading: proposalLoading } = useProposal(id) as { data: any; isLoading: boolean };
  const { data: sections, isLoading: sectionsLoading } = useProposalSections(id);
  const { data: paymentMilestones } = useProposalPaymentMilestones(id) as { data: ProposalPaymentMilestone[] | undefined };
  const { data: phases } = useProposalPhases(id) as { data: ProposalPhase[] | undefined };
  const { data: exclusions } = useProposalExclusions(id) as { data: ProposalExclusion[] | undefined };
  const { data: scopeRooms } = useProposalScopeRooms(id) as { data: ProposalScopeRoom[] | undefined };
  const { data: boardsData } = useBoardsWithItems(id);

  useEffect(() => {
    if (!shouldAutoPrint) return;
    if (!proposal || !sections) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [shouldAutoPrint, proposal, sections]);

  // ── Engagement Tracking ──
  const hasRecordedOpen = useRef(false);
  const sectionTimers = useRef<Map<string, number>>(new Map());
  const activeSectionRef = useRef<string | null>(null);
  const sectionStartRef = useRef<number>(0);

  const recordEvent = useCallback(
    async (
      eventType: string,
      sectionType?: string,
      durationSeconds?: number
    ) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabase = createBrowserClient() as any;
        await supabase.from('proposal_engagement').insert({
          proposal_id: id,
          viewer_id: session?.user?.id ?? null,
          event_type: eventType,
          section_type: sectionType || null,
          duration_seconds: durationSeconds || null,
          metadata: {},
        });
      } catch {
        // Silent fail — engagement tracking should never block the UI
      }
    },
    [id, session?.user?.id]
  );

  // Record "opened" event once (only for non-designer viewers)
  useEffect(() => {
    if (proposal && !hasRecordedOpen.current) {
      // Skip engagement tracking when the designer previews their own proposal
      if (session?.user?.id === proposal.designer_id) return;

      hasRecordedOpen.current = true;
      recordEvent('opened');

      // Also update proposal status to "viewed" if currently "sent"
      if (proposal.status === 'sent') {
        (async () => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const supabase = createBrowserClient() as any;
            await supabase
              .from('proposals')
              .update({ status: 'viewed', viewed_at: new Date().toISOString() })
              .eq('id', id);
          } catch {
            // Silent fail
          }
        })();
      }
    }
  }, [proposal, id, recordEvent, session]);

  // Track section visibility with IntersectionObserver
  useEffect(() => {
    if (!sections || sections.length === 0) return;

    const flushActiveSection = () => {
      if (activeSectionRef.current && sectionStartRef.current > 0) {
        const elapsed = Math.round((Date.now() - sectionStartRef.current) / 1000);
        if (elapsed >= 2) {
          // Only record if viewed for at least 2 seconds
          recordEvent('section_viewed', activeSectionRef.current, elapsed);
        }
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const sectionType = (entry.target as HTMLElement).dataset.sectionType;
          if (!sectionType) continue;

          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            // New section came into view
            if (activeSectionRef.current !== sectionType) {
              flushActiveSection();
              activeSectionRef.current = sectionType;
              sectionStartRef.current = Date.now();
            }
          }
        }
      },
      { threshold: 0.5 }
    );

    // Observe all section elements
    const sectionElements = document.querySelectorAll('[data-section-type]');
    sectionElements.forEach((el) => observer.observe(el));

    // Flush on page unload
    const handleUnload = () => flushActiveSection();
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      flushActiveSection();
      observer.disconnect();
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [sections, recordEvent]);

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || proposalLoading || sectionsLoading) return <LoadingStrata />;
  if (!proposal) {
    return (
      <p className="type-body py-16 text-center text-[var(--text-muted)]">
        Proposal not found.
      </p>
    );
  }

  const canRevise =
    proposal.status === 'declined' || proposal.status === 'expired';

  // Real mood boards (00179) render via the shared BoardsBlock — the SAME block
  // the client proposal + drafting mirror use. Placement mirrors the client
  // copy: after the `concept` section when one exists, else just before
  // `selections`, else after the last section. The legacy
  // `metadata.mood_board_urls` image strip inside `concept` stays ONLY as a
  // fallback when the proposal has zero real boards.
  const realBoards = boardsData ?? [];
  const hasRealBoards = realBoards.some((b) => b.items.length > 0);
  const sectionList = sections ?? [];
  const conceptIndex = sectionList.findIndex((s) => s.type === 'concept');
  const selectionsIndex = sectionList.findIndex((s) => s.type === 'selections');
  const boardsAfterIndex =
    conceptIndex >= 0
      ? conceptIndex
      : selectionsIndex >= 0
        ? selectionsIndex - 1
        : sectionList.length - 1;

  return (
    <div className="pt-8">
      {/* Designer revise bar — declined/expired proposals can be revised */}
      {canRevise && (
        <PageActionBar
          status={{
            tone: 'error',
            label: proposal.status === 'declined' ? 'Declined' : 'Expired',
          }}
          meta={
            <span className="type-label-secondary">
              {proposal.title} &middot; v{proposal.version || 1}.0
            </span>
          }
          actions={
            <Button
              variant="primary"
              size="sm"
              disabled={revising}
              onClick={async () => {
                setRevising(true);
                try {
                  await enterRevision.mutateAsync({ proposalId: id });
                  router.push(`/portal/proposals/${id}/revise`);
                } catch {
                  setRevising(false);
                }
              }}
            >
              {revising ? 'Starting revision…' : 'Revise'}
            </Button>
          }
        />
      )}

      {/* Document container */}
      <div
        className="proposal-print-area mx-auto rounded-lg bg-white shadow-sm"
        style={{
          maxWidth: 760,
          padding: 'clamp(1.5rem, 3vw, 2.5rem)',
          boxShadow:
            '0 1px 3px rgba(44,41,38,0.04), 0 8px 32px rgba(44,41,38,0.05)',
        }}
      >
        <ProposalLetterhead
          clientName={proposal.client?.full_name || null}
          date={proposal.created_at}
        />

        {boardsAfterIndex < 0 && hasRealBoards && (
          <BoardsBlock boards={realBoards} mark={<StrataMark variant="micro" />} />
        )}

        {sections?.map((section, index) => (
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

              {/* Body text */}
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

              {/* Concept: Mood board + palette */}
              {section.type === 'concept' && (
                <div className="mt-6">
                  {(() => {
                    const moodUrls = (section.metadata?.mood_board_urls as string[]) || [];
                    const palette = (section.metadata?.color_palette as Array<{ hex: string }>) || [];
                    return (
                      <>
                        {moodUrls.length > 0 && !hasRealBoards && (
                          <div className="mb-6 flex flex-wrap gap-2.5">
                            {moodUrls.map((url, i) => (
                              <div key={i} className="h-[75px] w-[100px] overflow-hidden rounded bg-[var(--color-pearl)]">
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
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Space plan */}
              {section.type === 'space_plan' && (
                <div
                  className="relative mt-4 mb-4 flex h-[220px] items-center justify-center overflow-hidden rounded-lg"
                  style={{ background: 'var(--color-pearl)' }}
                >
                  {(section.metadata?.floor_plan_url as string) ? (
                    <img
                      src={section.metadata.floor_plan_url as string}
                      alt="Space plan"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="type-meta-small z-10">
                      3D Room View
                    </span>
                  )}
                </div>
              )}

              {/* Selections */}
              {section.type === 'selections' && proposal.items && (
                <div className="mt-4">
                  {proposal.items.map(
                    (item: {
                      id: string;
                      name: string;
                      vendor_name?: string | null;
                      image_url?: string | null;
                      product?: { name?: string; images?: string[] | null; brand?: string | null } | null;
                      unit_price: number;
                      quantity: number;
                    }) => (
                      <ProposalProductItem
                        key={item.id}
                        name={item.name || item.product?.name || 'Product'}
                        maker={item.vendor_name || item.product?.brand}
                        imageUrl={item.image_url || item.product?.images?.[0]}
                        price={item.unit_price}
                        quantity={item.quantity}
                      />
                    )
                  )}
                </div>
              )}

              {/* Investment */}
              {section.type === 'investment' && (
                <div className="mt-2">
                  <LineItemsBlock
                    items={(proposal.items || []).map(
                      (item: {
                        id: string;
                        name: string;
                        item_type?: string;
                        quantity: number;
                        unit_price: number;
                        line_total_cents: number;
                        budget_min_cents?: number | null;
                        budget_max_cents?: number | null;
                        vendor_name?: string | null;
                        product?: { name?: string; brand?: string | null } | null;
                      }) => ({
                        id: item.id,
                        name: item.name,
                        item_type: item.item_type,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        line_total_cents: item.line_total_cents,
                        budget_min_cents: item.budget_min_cents,
                        budget_max_cents: item.budget_max_cents,
                        vendor_name: item.vendor_name,
                        product: item.product,
                      })
                    )}
                    totalCents={proposal.total_amount || 0}
                  />
                  {(scopeRooms ?? []).length > 0 && (
                    <div className="mt-6">
                      <p
                        className="mb-1 type-meta-small text-[var(--text-muted)]"
                        style={{ textTransform: 'uppercase', letterSpacing: '0.12em' }}
                      >
                        Per-room budgets
                      </p>
                      <ScopeRoomsBlock
                        rooms={(scopeRooms ?? []).map((r) => ({
                          name: r.name,
                          room_type: r.room_type,
                          budget_cents: r.budget_cents,
                        }))}
                      />
                    </div>
                  )}
                  <PaymentScheduleBlock
                    milestones={(paymentMilestones ?? []).map((m) => ({
                      label: m.label,
                      percentage: m.percentage,
                      amount_cents: m.amount_cents,
                      trigger_condition: m.trigger_condition,
                    }))}
                    totalCents={proposal.total_amount || 0}
                  />
                  {(exclusions ?? []).length > 0 && (
                    <div className="mt-6">
                      <p
                        className="mb-1 type-meta-small text-[var(--text-muted)]"
                        style={{ textTransform: 'uppercase', letterSpacing: '0.12em' }}
                      >
                        Not included
                      </p>
                      <ExclusionsBlock
                        exclusions={(exclusions ?? []).map((e) => ({
                          description: e.description,
                          category: e.category,
                        }))}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Timeline */}
              {section.type === 'timeline' && (
                <TimelinePhasesBlock
                  phases={(phases ?? []).map((p) => ({
                    name: p.name,
                    duration_weeks: p.duration_weeks,
                  }))}
                />
              )}

              {/* Terms + Signature */}
              {section.type === 'terms' && (
                <div>
                  {section.body && (
                    <p
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.82rem',
                        lineHeight: 1.75,
                        color: 'var(--text-muted)',
                        maxWidth: 640,
                        whiteSpace: 'pre-wrap',
                        marginBottom: '2rem',
                      }}
                    >
                      {section.body}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-8">
                    <SignatureBlock
                      label="Client Signature"
                      name={proposal.client?.full_name || 'Client'}
                    />
                    <SignatureBlock
                      label="Designer Signature"
                      name="Designer"
                      preSignedName={undefined}
                    />
                  </div>
                </div>
              )}
            </section>
          </div>
          {index === boardsAfterIndex && hasRealBoards && (
            <BoardsBlock boards={realBoards} mark={<StrataMark variant="micro" />} />
          )}
          </Fragment>
        ))}

        {/* Footer */}
        <div className="mt-12 flex items-baseline justify-between border-t border-[var(--border-subtle)] pt-6">
          <div
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
          </div>
          <span className="type-meta-small">
            {proposal.title} &middot; Proposal v{proposal.version || 1}.0
          </span>
        </div>
      </div>
    </div>
  );
}
