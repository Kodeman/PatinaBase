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
} from '@patina/design-system';
import { useProposal } from '@/hooks/use-proposals';

function BlockLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
      {children}
    </p>
  );
}

export function ProposalBlocksReadOnly({ proposalId }: { proposalId: string }) {
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

  if (isLoading) {
    return <p className="py-3 text-[11.5px] italic text-[var(--text-muted)]">Unfolding…</p>;
  }
  if (!proposal) {
    return <p className="py-3 text-[11.5px] text-[var(--text-muted)]">Proposal unavailable.</p>;
  }

  return (
    <div className="space-y-6">
      {proposal.description && (
        <p className="max-w-[640px] whitespace-pre-wrap text-[12px] leading-[1.7] text-[var(--text-body)]">
          {proposal.description}
        </p>
      )}

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

      <div>
        <BlockLabel>Payment schedule</BlockLabel>
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

      {(phases ?? []).length > 0 && (
        <div>
          <BlockLabel>Timeline</BlockLabel>
          <TimelinePhasesBlock
            phases={(phases ?? []).map((p) => ({
              name: p.name,
              duration_weeks: p.duration_weeks,
            }))}
          />
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
