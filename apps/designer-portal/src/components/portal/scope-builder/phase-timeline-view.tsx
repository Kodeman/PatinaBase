'use client';

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
  PhaseTimeline,
  type PhaseTimelineItem,
  type PhaseTimelineStatus,
} from '@patina/design-system';
import {
  useProposalPhases,
  useProposalPaymentMilestones,
  computePhaseGateStatus,
  type PhaseGate,
} from '@patina/supabase';
import { createBrowserClient } from '@patina/supabase/client';
import { DeliverablesEditor } from './deliverables-editor';
import {
  GateConditionsEditor,
  type ProposalPhaseLite,
  type PaymentMilestoneLite,
} from './gate-conditions-editor';

interface PhaseTimelineViewProps {
  proposalId: string;
}

interface ProposalPhase {
  id: string;
  proposal_id: string;
  name: string;
  phase_key: string | null;
  duration_weeks: number | null;
  fee_cents: number;
  revision_limit: number | null;
  gate_condition: string | null;
  sort_order: number;
}

const PROJECT_PHASE_STATUSES: PhaseTimelineStatus[] = [
  'pending',
  'active',
  'completed',
  'delayed',
  'blocked',
];

function isPhaseStatus(value: unknown): value is PhaseTimelineStatus {
  return typeof value === 'string' && PROJECT_PHASE_STATUSES.includes(value as PhaseTimelineStatus);
}

// Re-uses the @patina/supabase singleton browser client.
const getSupabase = createBrowserClient;

export function PhaseTimelineView({ proposalId }: PhaseTimelineViewProps) {
  const { data: phases = [], isLoading: phasesLoading } =
    useProposalPhases(proposalId);
  const { data: milestones = [], isLoading: milestonesLoading } =
    useProposalPaymentMilestones(proposalId);

  // Fetch gates for every phase in parallel using useQueries.
  const gateQueries = useQueries({
    queries: phases.map((phase: ProposalPhase) => ({
      queryKey: ['phase-gates', phase.id],
      queryFn: async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabase = getSupabase() as any;
        const { data, error } = await supabase
          .from('proposal_phase_gates')
          .select('*')
          .eq('phase_id', phase.id)
          .order('sort_order', { ascending: true });
        if (error) throw error;
        return (data ?? []) as PhaseGate[];
      },
      enabled: !!phase.id,
    })),
  });

  const timelineItems = useMemo<PhaseTimelineItem[]>(() => {
    return phases.map((phase: ProposalPhase, index: number) => {
      const gates = (gateQueries[index]?.data ?? []) as PhaseGate[];
      const gateStatus = computePhaseGateStatus(gates);
      // Visual status — proposals don't have project-state info yet, so we
      // just reflect gate state. `passed` reads as 'completed', `pending`
      // as 'pending', and `blocked` as 'blocked'. The DS component then
      // colors and labels accordingly.
      const status: PhaseTimelineStatus =
        gateStatus === 'passed'
          ? 'completed'
          : gateStatus === 'blocked'
            ? 'blocked'
            : 'pending';

      return {
        id: phase.id,
        slug: phase.phase_key ?? phase.id,
        label: phase.name,
        status,
        gateStatus,
        estimatedDuration: phase.duration_weeks
          ? `${phase.duration_weeks} wk`
          : undefined,
      } satisfies PhaseTimelineItem;
    });
  }, [phases, gateQueries]);

  const allPhasesLite: ProposalPhaseLite[] = useMemo(
    () =>
      phases.map((p: ProposalPhase) => ({
        id: p.id,
        name: p.name,
        sort_order: p.sort_order,
      })),
    [phases]
  );

  const milestonesLite: PaymentMilestoneLite[] = useMemo(
    () =>
      milestones.map(
        (m: {
          id: string;
          label: string;
          amount_cents: number;
          percentage: number;
        }) => ({
          id: m.id,
          label: m.label,
          amount_cents: m.amount_cents,
          percentage: m.percentage,
        })
      ),
    [milestones]
  );

  if (phasesLoading || milestonesLoading) {
    return (
      <div className="py-6 text-center font-body text-[0.82rem] text-[var(--text-muted)]">
        Loading timeline...
      </div>
    );
  }

  if (phases.length === 0) {
    return (
      <p className="py-4 font-body text-[0.82rem] text-[var(--text-muted)]">
        No phases yet. Add phases below to see the timeline.
      </p>
    );
  }

  return (
    <PhaseTimeline
      phases={timelineItems}
      showProgressBar
      renderExpandedContent={(phase) => {
        // Defensive — `status` is one of the DS statuses by construction.
        if (!isPhaseStatus(phase.status)) return null;
        return (
          <div className="flex flex-col gap-4">
            <DeliverablesEditor phaseId={phase.id} />
            <GateConditionsEditor
              phaseId={phase.id}
              allPhases={allPhasesLite}
              milestones={milestonesLite}
            />
          </div>
        );
      }}
    />
  );
}
