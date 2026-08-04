'use client';

import { Fragment, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
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
  type BoardsBlockBoard,
} from '@patina/design-system';
import {
  shareVisibilityForTier,
  blockVisibilityFromShare,
  rollupVerdicts,
  formatVerdictRollup,
  recordCompletenessFill,
  recordCompletenessPct,
  type ShareVisibility,
} from '@patina/utils';
import { useClientProposalFeedback, type ItemFeedback } from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { StrataMark } from '@/components/strata-mark';
import { BoardsBlock } from '@/components/board-block';
import { LineFeedback } from '@/components/proposal-line-feedback';
import { proposalClientEvents } from '@/lib/analytics/events';
import { productFromProposalSnapshot } from '@/lib/proposal-product-snapshot';

interface ProposalDocumentProps {
  proposal: Proposal & { items?: ProposalItem[] };
  sections: ProposalSection[];
  trackEngagement?: boolean;
  paymentMilestones?: ProposalPaymentMilestone[];
  phases?: ProposalPhase[];
  exclusions?: ProposalExclusion[];
  scopeRooms?: ProposalScopeRoom[];
  boards?: ProposalBoardSummary[];
  /** Fully-materialized boards; skips the client-side board query when present. */
  resolvedBoards?: BoardsBlockBoard[];
  /** Authorization/telemetry surface; materialization mode does not imply guest. */
  moodBoardSurface?: 'client_proposal' | 'guest_share';
  /**
   * A per-field visibility override. Passed by a guest share render (C2) with
   * the share's ShareVisibility record. When absent, visibility is derived from
   * the proposal's tier (the authed client's own copy).
   */
  visibility?: ShareVisibility;
  /**
   * Whether the per-line verdict loop (C3) is offered. The page computes this:
   * authed client + proposals.feedback_enabled + not a guest share. Never true
   * on a guest render.
   */
  feedbackEnabled?: boolean;
  /** The studio name for the quiet "shared by" letterhead line. */
  sharedByStudio?: string;
  /** Optional studio logo rendered next to the "Shared by" line. Nil-safe. */
  sharedByStudioLogoUrl?: string;
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
  resolvedBoards,
  moodBoardSurface = 'client_proposal',
  visibility,
  feedbackEnabled = false,
  sharedByStudio,
  sharedByStudioLogoUrl,
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
          await supabase.rpc('mark_proposal_viewed', {
            p_proposal_id: proposal.id,
          });
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
  }, [
    trackEngagement,
    sections,
    recordEvent,
    boardCount,
    paymentMilestones.length,
    phases.length,
    exclusions.length,
    scopeRooms.length,
  ]);

  // R86 — the client copy is canonical, tier-governed. The SAME shared gate the
  // Drafting-Room mirror obeys (proposalTierVisibility) decides which money
  // blocks render here, so preview = truth. `tbd` placeholder pieces are studio
  // scaffolding and never reach the client (R43), so they fall out of the
  // itemized list at every tier.
  // R86 + Wave-2 C1: the fielded law. `visibility` (a guest share's record) wins;
  // otherwise the proposal's tier preset. The legacy block gate derives from the
  // same record, so existing money-block behavior is unchanged.
  const share = visibility ?? shareVisibilityForTier(proposal.client_visibility_tier);
  const gate = blockVisibilityFromShare(share);
  // A product is shared catalog state; the proposal-owned snapshot is the
  // edition. Normalize it into the legacy product shape so every renderer in
  // this document consumes the frozen copy, never a newer catalog join.
  const items = (proposal.items ?? [])
    .filter((it) => it.item_type !== 'tbd')
    .map((item) => ({
      ...item,
      // A guest bundle has already reduced `product` to the fields permitted by
      // that share's visibility. Keep that audited DTO intact; authenticated
      // renders build the product exclusively from the immutable client copy.
      product: visibility
        ? item.product
        : productFromProposalSnapshot(item.client_product_snapshot, item.id),
    }));

  // C3/C5 — the client's own verdicts on this proposal's lines (only when the
  // loop is offered; a guest render passes feedbackEnabled=false so this is inert).
  const { data: feedbackRows = [] } = useClientProposalFeedback(
    feedbackEnabled ? proposal.id : undefined,
  );
  const feedbackByItem = useMemo(() => {
    const m = new Map<string, ItemFeedback[]>();
    for (const f of feedbackRows) {
      if (!f.proposal_item_id) continue;
      const arr = m.get(f.proposal_item_id) ?? [];
      arr.push(f);
      m.set(f.proposal_item_id, arr);
    }
    return m;
  }, [feedbackRows]);
  const rollupText = useMemo(() => {
    if (!feedbackEnabled) return '';
    const verdicts = feedbackRows
      .filter((f) => f.proposal_item_id)
      .map((f) => ({
        lineId: f.proposal_item_id as string,
        verdict: f.verdict,
        createdAt: f.created_at,
        resolvedAt: f.resolved_at,
      }));
    return formatVerdictRollup(rollupVerdicts(items.length, verdicts));
  }, [feedbackEnabled, feedbackRows, items.length]);

  // Investment and timeline rows are legacy layout markers, not the authority
  // for whether the structured proposal data exists. The designer's sent-copy
  // mirror renders the structured arrays independently; filter those markers
  // from the narrative stream so the client follows the same contract without
  // producing duplicate blocks for older proposals that still carry them.
  const narrativeSections = sections.filter(
    (section) => section.type !== 'investment' && section.type !== 'timeline',
  );

  // Mood boards render after the `concept` section when one exists, else just
  // before `selections`, else after the last narrative section. A negative index
  // means "before all sections" (selections-first or section-less proposals).
  const conceptIndex = narrativeSections.findIndex((s) => s.type === 'concept');
  const selectionsIndex = narrativeSections.findIndex((s) => s.type === 'selections');
  const boardsAfterIndex =
    conceptIndex >= 0
      ? conceptIndex
      : selectionsIndex >= 0
        ? selectionsIndex - 1
        : narrativeSections.length - 1;

  // One board section, positioned by boardsAfterIndex. `resolvedBoards` renders
  // directly; otherwise the wrapper fetches by proposalId under RLS. The
  // explicit surface keeps pre-resolved authenticated data distinct from guest
  // shares for verdict authorization and renderer telemetry.
  const boardsBlock = (
    <BoardsBlock
      boards={boards}
      resolved={resolvedBoards}
      proposalId={proposal.id}
      feedbackEnabled={feedbackEnabled}
      surface={moodBoardSurface}
    />
  );

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
          {rollupText && (
            <p className="type-meta-small mt-1 text-[var(--text-muted)]">{rollupText}</p>
          )}
        </div>
        <div className="text-right">
          <span className="type-meta-small block text-[var(--text-muted)]">
            {formatDate(proposal.created_at)}
          </span>
          {sharedByStudio && (
            <span className="type-meta-small mt-1 flex items-center justify-end gap-1.5 text-[var(--text-muted)]">
              {sharedByStudioLogoUrl && (
                <img
                  src={sharedByStudioLogoUrl}
                  alt=""
                  className="h-4 w-4 rounded-full object-cover"
                />
              )}
              Shared by {sharedByStudio}
            </span>
          )}
        </div>
      </header>

      {boardsAfterIndex < 0 && boardsBlock}

      {narrativeSections.map((section, index) => (
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

            {section.type === 'selections' && items.length > 0 && share.itemDetails && (
              <SelectionsList
                items={items}
                showPrices={share.pricing}
                showSupplier={share.supplierIdentity}
                showLeadTimes={share.leadTimes}
                showSourceUrls={share.sourceUrls}
                proposalId={proposal.id}
                feedbackEnabled={feedbackEnabled}
                feedbackByItem={feedbackByItem}
              />
            )}

          </section>
        </div>
        {index === boardsAfterIndex && boardsBlock}
        </Fragment>
      ))}

      {gate.scopeRooms && scopeRooms.length > 0 && (
        <StructuredProposalSection type="scope" title="In scope">
          {gate.roomBudgets ? (
            <ScopeRoomsBlock
              rooms={scopeRooms.map((room) => ({
                name: room.name,
                room_type: room.room_type,
                budget_cents: room.budget_cents ?? 0,
              }))}
            />
          ) : (
            <div>
              {scopeRooms.map((room) => (
                <div
                  key={room.id}
                  className="flex items-baseline justify-between border-b border-dashed border-[var(--border-subtle)] py-2"
                >
                  <span className="type-body-small text-[var(--text-primary)]">{room.name}</span>
                  {room.room_type && (
                    <span className="type-meta-small uppercase text-[var(--text-muted)]">
                      {room.room_type}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </StructuredProposalSection>
      )}

      {gate.investmentTotal && (
        <StructuredProposalSection type="investment" title="Investment">
          {/* Itemized at 'full'; at 'milestone'/'curated' the gate hands
              LineItemsBlock no items, so it renders the single rolled-up Total
              row (R86). */}
          <LineItemsBlock
            items={gate.lineItems ? items : []}
            totalCents={proposal.total_amount || 0}
          />
        </StructuredProposalSection>
      )}

      {gate.paymentSchedule && paymentMilestones.length > 0 && (
        <StructuredProposalSection type="payment_schedule">
          <PaymentScheduleBlock
            milestones={paymentMilestones.map((milestone) => ({
              label: milestone.label,
              percentage: milestone.percentage,
              amount_cents: milestone.amount_cents,
              trigger_condition: milestone.trigger_condition,
            }))}
            totalCents={proposal.total_amount || 0}
          />
        </StructuredProposalSection>
      )}

      {gate.timeline && phases.length > 0 && (
        <StructuredProposalSection type="timeline" title="Timeline">
          <TimelinePhasesBlock
            phases={phases.map((phase) => ({
              name: phase.name,
              duration_weeks: phase.duration_weeks,
            }))}
          />
        </StructuredProposalSection>
      )}

      {gate.exclusions && exclusions.length > 0 && (
        <StructuredProposalSection type="exclusions" title="Not included">
          <ExclusionsBlock
            exclusions={exclusions.map((exclusion) => ({
              description: exclusion.description,
              category: exclusion.category,
            }))}
          />
        </StructuredProposalSection>
      )}

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

function StructuredProposalSection({
  type,
  title,
  children,
}: {
  type: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div data-section-type={type}>
      <StrataMark variant="micro" />
      <section className="py-8">
        {title && (
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              fontSize: '1.4rem',
              color: 'var(--text-primary)',
              marginBottom: '1.25rem',
            }}
          >
            {title}
          </h2>
        )}
        {children}
      </section>
    </div>
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

/**
 * Bare host of a source URL, www-stripped — the quiet provenance tag (A2).
 * Matches spec-pdf's host-only style ("Brand · host.com · …"). An invalid URL
 * renders nothing (returns null).
 */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * The record-completeness trust mark (A2) — three short stacked rules whose fill
 * fractions come from recordCompletenessFill (identity+piece / commerce+folio /
 * taught). A quiet echo of the designer Piece Room's Strata-Mark; the mono label
 * beside it carries the reading, so the mark itself is aria-hidden. All three
 * fully filled === a verified record (100%), consistent with spec-pdf.
 */
function RecordFillMark({ fill }: { fill: [number, number, number] }) {
  const rows: { width: number; accent: string; opacity: string }[] = [
    { width: 34, accent: 'bg-patina-mocha', opacity: '' },
    { width: 27, accent: 'bg-patina-clay', opacity: 'opacity-70' },
    { width: 20, accent: 'bg-patina-clay', opacity: 'opacity-35' },
  ];
  return (
    <span aria-hidden className="inline-flex shrink-0 flex-col gap-[2px]">
      {rows.map((row, i) => (
        <span
          key={i}
          className="block h-[2px] rounded-full bg-[var(--border-subtle)]"
          style={{ width: row.width }}
        >
          <span
            className={`block h-full rounded-full ${row.accent} ${row.opacity}`}
            style={{ width: `${Math.round(fill[i] * 100)}%` }}
          />
        </span>
      ))}
    </span>
  );
}

function SelectionsList({
  items,
  showPrices = true,
  showSupplier = true,
  showLeadTimes = false,
  showSourceUrls = false,
  proposalId,
  feedbackEnabled = false,
  feedbackByItem,
}: {
  items: ProposalItem[];
  showPrices?: boolean;
  // C1 fielded law — supplier identity is now independent of pricing (fixes the
  // vendor/brand bundling defect), and lead times gate on their own field.
  showSupplier?: boolean;
  showLeadTimes?: boolean;
  // A2 — makes the share's `sourceUrls` field real: the per-line source host.
  showSourceUrls?: boolean;
  proposalId: string;
  feedbackEnabled?: boolean;
  feedbackByItem?: Map<string, ItemFeedback[]>;
}) {
  return (
    <ul className="mt-4 space-y-3">
      {items.map((item) => {
        const supplier = showSupplier ? item.vendor_name || item.product?.brand : null;
        const leadWeeks = (item as { lead_time_weeks?: number | null }).lead_time_weeks;
        const meta: string[] = [];
        if (supplier) meta.push(supplier);
        if (item.quantity > 1) meta.push(`Qty ${item.quantity}`);
        if (showLeadTimes && leadWeeks) meta.push(`${leadWeeks} wk lead`);
        // A2 — provenance trust surfaces. The source host is gated on the share's
        // sourceUrls field; the record-completeness mark rides on a joined product
        // (itemDetails already gates the whole list). hasTeaching = ≥1 taught style
        // from the product_styles(count) embed; when the relation is unreadable the
        // count is absent and it degrades to false (an un-taught record).
        const product = item.product;
        const sourceHost =
          showSourceUrls && product?.source_url ? hostOf(product.source_url) : null;
        const hasTeaching =
          product?.has_teaching === true || (product?.product_styles?.[0]?.count ?? 0) > 0;
        const completenessHidden =
          (product as { record_completeness_hidden?: boolean } | undefined)
            ?.record_completeness_hidden === true;
        const fill =
          product && !completenessHidden ? recordCompletenessFill(product, hasTeaching) : null;
        const pct =
          product && !completenessHidden ? recordCompletenessPct(product, hasTeaching) : null;
        return (
          <li
            key={item.id}
            className="rounded-[3px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2.5"
          >
            <div className="flex items-center gap-3">
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
                {meta.length > 0 && (
                  <p className="type-meta-small text-[var(--text-muted)]">{meta.join(' · ')}</p>
                )}
                {sourceHost && (
                  <p className="type-meta-small text-[var(--text-muted)]">{sourceHost}</p>
                )}
                {fill && pct !== null && (
                  <div className="mt-1 flex items-center gap-1.5">
                    <RecordFillMark fill={fill} />
                    <span className="type-meta-small text-[var(--text-muted)]">
                      {pct === 100 ? 'Verified record' : `Record ${pct}% complete`}
                    </span>
                  </div>
                )}
              </div>
              {showPrices && (
                <span className="type-meta text-[var(--text-primary)]">
                  {formatCurrency((item.line_total_cents || 0) / 100)}
                </span>
              )}
            </div>
            {feedbackEnabled && (
              <LineFeedback
                proposalId={proposalId}
                itemId={item.id}
                feedback={feedbackByItem?.get(item.id) ?? []}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
