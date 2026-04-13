'use client';

import { use, useEffect, useRef, useCallback } from 'react';
import { useProposal, useProposalSections } from '@/hooks/use-proposals';
import { useAuth } from '@/hooks/use-auth';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { ProposalLetterhead } from '@/components/portal/proposal-letterhead';
import { StrataMark } from '@/components/portal/strata-mark';
import { ProposalProductItem } from '@/components/portal/proposal-product-item';
import { InvestmentTable } from '@/components/portal/investment-table';
import { PaymentSchedule } from '@/components/portal/payment-schedule';
import { TimelinePhases } from '@/components/portal/timeline-phases';
import { SignatureBlock } from '@/components/portal/signature-block';
import { createBrowserClient } from '@patina/supabase';

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
  const { session } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: proposal, isLoading: proposalLoading } = useProposal(id) as { data: any; isLoading: boolean };
  const { data: sections, isLoading: sectionsLoading } = useProposalSections(id);

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
          event_type: eventType,
          section_type: sectionType || null,
          duration_seconds: durationSeconds || null,
          metadata: {},
        });
      } catch {
        // Silent fail — engagement tracking should never block the UI
      }
    },
    [id]
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

  if (proposalLoading || sectionsLoading) return <LoadingStrata />;
  if (!proposal) {
    return (
      <p className="type-body py-16 text-center text-[var(--text-muted)]">
        Proposal not found.
      </p>
    );
  }

  return (
    <div className="pt-8">
      {/* Document container */}
      <div
        className="mx-auto rounded-lg bg-white shadow-sm"
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

        {sections?.map((section, index) => (
          <div key={section.id} data-section-type={section.type}>
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
                        {moodUrls.length > 0 && (
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
                <div>
                  <InvestmentTable
                    rows={(proposal.items || []).map(
                      (item: { name: string; product?: { name?: string } | null; unit_price: number; quantity: number }) => ({
                        label: item.name || item.product?.name || 'Item',
                        amount: item.unit_price * item.quantity,
                      })
                    )}
                    totalAmount={proposal.total_amount || 0}
                  />
                  <div className="mt-6">
                    <PaymentSchedule
                      milestones={[
                        { label: 'Deposit', percent: 30, description: 'due on signing' },
                        { label: 'Procurement', percent: 40, description: 'due before ordering' },
                        { label: 'Completion', percent: 30, description: 'due on final walkthrough' },
                      ]}
                      totalAmount={proposal.total_amount || 0}
                    />
                  </div>
                </div>
              )}

              {/* Timeline */}
              {section.type === 'timeline' && (
                <TimelinePhases
                  phases={
                    (section.metadata?.phases as Array<{ dateRange: string; name: string }>) || [
                      { dateRange: 'Weeks 1\u20132', name: 'Consultation & site documentation' },
                      { dateRange: 'Weeks 3\u20136', name: 'Concept development & design presentation' },
                      { dateRange: 'Weeks 7\u201310', name: 'Refinement, final selections, client approvals' },
                      { dateRange: 'Weeks 11\u201316', name: 'Procurement & order management' },
                      { dateRange: 'Weeks 17\u201318', name: 'Delivery, installation & styling' },
                      { dateRange: 'Week 19', name: 'Final walkthrough & photography' },
                    ]
                  }
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
