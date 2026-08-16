'use client';

/**
 * The Offer, on the paper (Start to Signature W4a, flag `worktable`).
 *
 * Direction B's R4 decomposition: the Drafting Room's eight facets split by
 * movement — Scope + Vision became the Speccing table (W3), and the Offer
 * movement (Phases · Exclusions · Payments · Terms) folds open here, under the
 * Finalize table's spread, in the Room's own `FacetSection` seam form. Same
 * component, same accent, same status words, same editors: presentation moves,
 * the facets do not fork, and the Drafting Room is untouched.
 *
 * **Editability is the Drafting Room's, not ours** (`draftingEditability`).
 * The Room evicts anyone who opens an issued proposal — so on this table, where
 * the proposal is by definition out of the studio's hands, the seams open onto
 * the offer as WRITTEN, in the canonical read blocks, and no editor mounts. The
 * blur-save law is intact where a draft is editable and irrelevant where it is
 * not; nothing here decides who may write.
 *
 * The Offer facets belong to the legacy proposal Room. A design-services
 * agreement has its own room and its own body on the paper already, and a
 * furnishings authorization opens from the ledger — neither grows these seams.
 */

import { useState } from 'react';
import {
  useProposalExclusions,
  useProposalPaymentMilestones,
  useProposalPhases,
  useProposalSections,
} from '@patina/supabase';
import type {
  ProposalExclusion,
  ProposalPaymentMilestone,
  ProposalPhase,
} from '@patina/supabase';
import {
  ExclusionsBlock,
  PaymentScheduleBlock,
  TimelinePhasesBlock,
} from '@patina/design-system';
import { useProposal } from '@/hooks/use-proposals';
import { useDraftingState } from '@/hooks/use-drafting-state';
import { commercialDocumentExperience } from '@/lib/document/commercial-documents';
import { draftingEditability } from '@/lib/document/drafting-editability';
import { FacetSection } from '../rooms/drafting/facet-section';
import { PhaseBuilder } from '@/components/portal/scope-builder/phase-builder';
import { ExclusionsList } from '@/components/portal/scope-builder/exclusions-list';
import { PaymentMilestonesBuilder } from '@/components/portal/scope-builder/payment-milestones-builder';
import { ChangeOrderTermsEditor } from '@/components/portal/scope-builder/change-order-terms-editor';
import { TermsAgreementBody } from '../rooms/drafting/terms-agreement-body';

/** The Room's Offer accent (drafting-room.tsx's MOVEMENT.offer). */
const OFFER_ACCENT = 'var(--color-clay)';

type OfferFacetId = 'phases' | 'exclusions' | 'payments' | 'terms';

export function OfferFacets({ proposalId }: { proposalId: string }) {
  const { data: proposal } = useProposal(proposalId) as { data: any };
  const { facets, summary: s } = useDraftingState(proposalId);
  const [openFacet, setOpenFacet] = useState<OfferFacetId | null>(null);

  const experience = commercialDocumentExperience(proposal?.document_kind);
  const editability = draftingEditability({
    documentKind: proposal?.document_kind,
    status: proposal?.status,
    commercialState: proposal?.commercial_state,
  });

  if (!proposal || experience !== 'legacy') return null;

  const editable = editability === 'editable';

  const toggle = (id: OfferFacetId) =>
    setOpenFacet((current) => (current === id ? null : id));

  return (
    <section
      data-offer-facets
      data-offer-editable={editable ? 'true' : 'false'}
      aria-label="The Offer"
      className="mt-8 border-t border-[var(--doc-ink-border)] pt-5"
    >
      <div className="mb-3 flex items-baseline gap-3">
        <span
          aria-hidden
          className="h-[4px] w-[34px] shrink-0 self-center rounded-[2px]"
          style={{ background: OFFER_ACCENT }}
        />
        <h3 className="font-heading text-[1.1rem] font-medium italic text-[var(--color-charcoal)]">
          The Offer
        </h3>
        <span className="doc-type-meta ml-auto uppercase tracking-[0.06em]">
          {editable
            ? 'Phases · exclusions · payments · terms'
            : 'As issued · phases · exclusions · payments · terms'}
        </span>
      </div>

      <FacetSection
        name="Phases"
        accent={OFFER_ACCENT}
        done={facets.phases}
        status={
          facets.phases
            ? `${s?.phases} phase${s?.phases === 1 ? '' : 's'} & fees`
            : 'no phases yet'
        }
        open={openFacet === 'phases'}
        onToggle={() => toggle('phases')}
      >
        {editable ? (
          <PhaseBuilder proposalId={proposalId} />
        ) : (
          <PhasesRead proposalId={proposalId} />
        )}
      </FacetSection>

      <FacetSection
        name="Exclusions"
        accent={OFFER_ACCENT}
        done={facets.exclusions}
        status={facets.exclusions ? `${s?.exclusions} stated` : 'none stated'}
        open={openFacet === 'exclusions'}
        onToggle={() => toggle('exclusions')}
      >
        {editable ? (
          <ExclusionsList proposalId={proposalId} />
        ) : (
          <ExclusionsRead proposalId={proposalId} />
        )}
      </FacetSection>

      <FacetSection
        name="Payments"
        accent={OFFER_ACCENT}
        done={facets.payments}
        status={
          facets.payments
            ? `${s?.payments} milestone${s?.payments === 1 ? '' : 's'}`
            : 'no schedule yet'
        }
        open={openFacet === 'payments'}
        onToggle={() => toggle('payments')}
      >
        {editable ? (
          // Unreachable on this table: the Finalize table composes only for a
          // proposal already in the client's hands, where the Room's own gate
          // answers 'issued'. The allocator therefore takes the proposal's own
          // total — the same denominator the read block below uses — rather
          // than this component opening a scope-builder query for a branch
          // that cannot run.
          <PaymentMilestonesBuilder
            proposalId={proposalId}
            totalCents={proposal?.total_amount || 0}
          />
        ) : (
          <PaymentsRead
            proposalId={proposalId}
            totalCents={proposal?.total_amount || 0}
          />
        )}
      </FacetSection>

      <FacetSection
        name="Terms"
        accent={OFFER_ACCENT}
        done={facets.terms}
        status={facets.terms ? 'change-order terms written' : 'not yet written'}
        open={openFacet === 'terms'}
        onToggle={() => toggle('terms')}
      >
        {editable ? (
          <>
            <TermsAgreementBody proposalId={proposalId} />
            <ChangeOrderTermsEditor proposalId={proposalId} />
          </>
        ) : (
          <TermsRead proposalId={proposalId} />
        )}
      </FacetSection>
    </section>
  );
}

/* ── The offer as issued. The same canonical blocks the client's copy and the
      settled unfold render, so a term reads identically wherever it is met. ─ */

function Nothing({ children }: { children: string }) {
  return (
    <p className="py-1 text-[11.5px] italic text-[var(--text-muted)]">
      {children}
    </p>
  );
}

function PhasesRead({ proposalId }: { proposalId: string }) {
  const { data: phases } = useProposalPhases(proposalId) as {
    data: ProposalPhase[] | undefined;
  };
  if (!(phases ?? []).length) return <Nothing>No phases were stated.</Nothing>;
  return (
    <TimelinePhasesBlock
      phases={(phases ?? []).map((p) => ({
        name: p.name,
        duration_weeks: p.duration_weeks,
        duration_days: p.duration_days,
      }))}
    />
  );
}

function ExclusionsRead({ proposalId }: { proposalId: string }) {
  const { data: exclusions } = useProposalExclusions(proposalId) as {
    data: ProposalExclusion[] | undefined;
  };
  if (!(exclusions ?? []).length) {
    return <Nothing>Nothing was stated as excluded.</Nothing>;
  }
  return (
    <ExclusionsBlock
      exclusions={(exclusions ?? []).map((e) => ({
        description: e.description,
        category: e.category,
      }))}
    />
  );
}

function PaymentsRead({
  proposalId,
  totalCents,
}: {
  proposalId: string;
  totalCents: number;
}) {
  const { data: milestones } = useProposalPaymentMilestones(proposalId) as {
    data: ProposalPaymentMilestone[] | undefined;
  };
  if (!(milestones ?? []).length) {
    return <Nothing>No payment schedule was set.</Nothing>;
  }
  return (
    <PaymentScheduleBlock
      milestones={(milestones ?? []).map((m) => ({
        label: m.label,
        percentage: m.percentage,
        amount_cents: m.amount_cents,
        trigger_condition: m.trigger_condition,
      }))}
      totalCents={totalCents}
    />
  );
}

function TermsRead({ proposalId }: { proposalId: string }) {
  const { data: sections } = useProposalSections(proposalId);
  const body = (sections ?? []).find((s) => s.type === 'terms')?.body?.trim();
  if (!body) return <Nothing>No terms were written.</Nothing>;
  return (
    <p className="max-w-[640px] whitespace-pre-wrap text-[12px] leading-[1.7] text-[var(--text-body)]">
      {body}
    </p>
  );
}
