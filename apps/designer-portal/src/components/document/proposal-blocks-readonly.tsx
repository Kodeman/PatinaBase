'use client';

/**
 * Read-only proposal rendering via the CANONICAL block components
 * (@patina/design-system proposal blocks — the same blocks the editor,
 * preview, and client portal render). Spec §4: the settled-Proposal unfold
 * and the pre-signing active Proposal/Direction sections all use this.
 * No actions.
 */

import {
  useProposalPaymentMilestones,
  useProposalPhases,
  useProposalExclusions,
  useProposalScopeRooms,
  useProposalScheduleMilestones,
} from '@patina/supabase';
import type {
  ProposalPaymentMilestone,
  ProposalPhase,
  ProposalExclusion,
  ProposalScopeRoom,
  ProposalScheduleMilestone,
} from '@patina/supabase';
import {
  LineItemsBlock,
  PaymentScheduleBlock,
  TimelinePhasesBlock,
  ExclusionsBlock,
  ScopeRoomsBlock,
} from '@patina/design-system';
import { useProposal } from '@/hooks/use-proposals';
import { fmtDay } from '@/lib/document/format';
import { commercialDocumentExperience } from '@/lib/document/commercial-documents';
import { ServiceAgreementDocumentBody } from './commercial/commercial-document-body';

/** Sign-off · Decision · Delivery · Event — the same kind labels the composer
 *  wears (milestone-composer.tsx's KINDS), so a milestone reads identically
 *  whether it's being drafted or reviewed read-only. */
const MILESTONE_KIND_LABEL: Record<string, string> = {
  signoff: 'Sign-off',
  decision: 'Decision',
  delivery: 'Delivery',
  event: 'Event',
};

function BlockLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
      {children}
    </p>
  );
}

export function ProposalBlocksReadOnly({ proposalId }: { proposalId: string }) {
  // Choose the renderer before any legacy room, FF&E, palette, or board query mounts.
  const { data: proposal, isLoading } = useProposal(proposalId) as {
    data: any;
    isLoading: boolean;
  };
  if (isLoading) {
    return <p className="py-3 text-[11.5px] italic text-[var(--text-muted)]">Unfolding…</p>;
  }

  const experience = commercialDocumentExperience(proposal?.document_kind);
  if (experience === 'design_services') {
    return (
      <ServiceAgreementDocumentBody
        proposalId={proposalId}
        clientName={proposal?.client?.full_name ?? undefined}
      />
    );
  }
  if (experience === 'commercial_readonly') {
    return (
      <p className="py-3 text-[11.5px] text-[var(--text-muted)]">
        This furnishings authorization opens from the Authorizations Ledger —
        it doesn&rsquo;t unfold here.
      </p>
    );
  }
  return <LegacyProposalBlocksReadOnly proposalId={proposalId} />;
}

function LegacyProposalBlocksReadOnly({ proposalId }: { proposalId: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: proposal, isLoading } = useProposal(proposalId) as {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any;
    isLoading: boolean;
  };
  const { data: milestones } = useProposalPaymentMilestones(proposalId) as {
    data: ProposalPaymentMilestone[] | undefined;
  };
  const { data: phases } = useProposalPhases(proposalId) as { data: ProposalPhase[] | undefined };
  const { data: exclusions } = useProposalExclusions(proposalId) as {
    data: ProposalExclusion[] | undefined;
  };
  const { data: scopeRooms } = useProposalScopeRooms(proposalId) as {
    data: ProposalScopeRoom[] | undefined;
  };
  // Slice 03 (R101.3) — anchored proposal milestones are the one client-
  // visible compose delta; they ride the proposal's existing non-draft RLS,
  // not a flag. Deliberately NOT the working (offset) milestones a designer
  // sketches on the project side — only the hard-dated commitments a client
  // signs against exist on this table at all.
  const { data: scheduleMilestones } = useProposalScheduleMilestones(proposalId) as {
    data: ProposalScheduleMilestone[] | undefined;
  };

  if (isLoading) {
    return <p className="py-3 text-[11.5px] italic text-[var(--text-muted)]">Unfolding…</p>;
  }
  if (!proposal) {
    return <p className="py-3 text-[11.5px] text-[var(--text-muted)]">Proposal unavailable.</p>;
  }

  // A freshly-seeded draft has nothing written yet — render a quiet line rather
  // than an empty "$0" husk that visually dominates the prominent work band
  // above it (R68). A settled/signed proposal always has content, so this never
  // fires in settled review.
  const isEmpty =
    (proposal.items ?? []).length === 0 &&
    (scopeRooms ?? []).length === 0 &&
    (phases ?? []).length === 0 &&
    (exclusions ?? []).length === 0 &&
    (milestones ?? []).length === 0 &&
    !proposal.description;
  if (isEmpty) {
    return <p className="py-3 text-[11.5px] italic text-[var(--text-muted)]">Nothing drafted yet.</p>;
  }

  // The Investment + Payment blocks render unconditionally below; gate them so a
  // draft with no priced items / no milestones doesn't show a "$0" husk (R68.1).
  const hasInvestment = (proposal.items ?? []).length > 0 || (proposal.total_amount ?? 0) > 0;
  const hasPayments = (milestones ?? []).length > 0;

  return (
    <div className="space-y-6">
      {proposal.description && (
        <p className="max-w-[640px] whitespace-pre-wrap text-[12px] leading-[1.7] text-[var(--text-body)]">
          {proposal.description}
        </p>
      )}

      {hasInvestment && (
      <div>
        <BlockLabel>Investment</BlockLabel>
        <LineItemsBlock
          items={(proposal.items ?? []).map(
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
            }),
          )}
          totalCents={proposal.total_amount || 0}
        />
      </div>
      )}

      {(scopeRooms ?? []).length > 0 && (
        <div>
          <BlockLabel>Per-room budgets</BlockLabel>
          <ScopeRoomsBlock
            rooms={(scopeRooms ?? []).map((r) => ({
              name: r.name,
              room_type: r.room_type,
              budget_cents: r.budget_cents,
            }))}
          />
        </div>
      )}

      {/* PaymentScheduleBlock renders its own heading — no BlockLabel here. */}
      {hasPayments && (
      <div>
        <PaymentScheduleBlock
          milestones={(milestones ?? []).map((m) => ({
            label: m.label,
            percentage: m.percentage,
            amount_cents: m.amount_cents,
            trigger_condition: m.trigger_condition,
          }))}
          totalCents={proposal.total_amount || 0}
        />
      </div>
      )}

      {(phases ?? []).length > 0 && (
        <div>
          <BlockLabel>Timeline</BlockLabel>
          <TimelinePhasesBlock
            phases={(phases ?? []).map((p) => ({
              name: p.name,
              duration_weeks: p.duration_weeks,
              duration_days: p.duration_days,
            }))}
          />

          {/* Slice 03 — anchored milestones as a "Key dates" sub-line inside
              the Timeline block (the boring placement, escalated: could also
              weave per-phase — a flat chronological list read faster for a
              client scanning commitments than a list re-grouped by phase). */}
          {(scheduleMilestones ?? []).length > 0 && (
            <div className="mt-3 border-t border-[var(--border-default)] pt-2">
              <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                Key dates
              </p>
              <ul className="space-y-1.5">
                {(scheduleMilestones ?? [])
                  .slice()
                  .sort((a, b) => (a.anchor_date < b.anchor_date ? -1 : a.anchor_date > b.anchor_date ? 1 : 0))
                  .map((m) => (
                    <li key={m.id} className="flex items-baseline gap-2 type-body-small">
                      <span className="text-[var(--text-body)]">{m.name}</span>
                      <span className="text-[var(--text-muted)]">
                        · {MILESTONE_KIND_LABEL[m.kind] ?? m.kind} · {fmtDay(m.anchor_date)}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {(exclusions ?? []).length > 0 && (
        <div>
          <BlockLabel>Not included</BlockLabel>
          <ExclusionsBlock
            exclusions={(exclusions ?? []).map((e) => ({
              description: e.description,
              category: e.category,
            }))}
          />
        </div>
      )}
    </div>
  );
}
