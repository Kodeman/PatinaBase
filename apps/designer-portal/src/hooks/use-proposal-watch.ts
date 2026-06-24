'use client';

/**
 * useProposalWatch — composes the proposal row + its engagement aggregate +
 * raw engagement events into the watch view-model (deriveProposalWatch). The
 * three reads already exist and back the legacy /tracking page; this hook just
 * folds them through the pure derivation so the ProposalWatch component stays
 * presentational.
 */

import { useMemo } from 'react';
import {
  useProposal,
  useProposalEngagement,
  useProposalEngagementStats,
} from '@/hooks/use-proposals';
import {
  deriveProposalWatch,
  type ProposalWatchModel,
} from '@/lib/document/proposal-watch-derivation';

export function useProposalWatch(proposalId: string): {
  watch: ProposalWatchModel | null;
  isLoading: boolean;
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: proposal, isLoading } = useProposal(proposalId) as { data: any; isLoading: boolean };
  const { data: stats } = useProposalEngagementStats(proposalId);
  const { data: events } = useProposalEngagement(proposalId);

  const watch = useMemo(() => {
    if (!proposal) return null;
    return deriveProposalWatch(
      {
        status: proposal.status,
        sentAt: proposal.sent_at ?? null,
        viewedAt: proposal.viewed_at ?? null,
        acceptedAt: proposal.accepted_at ?? null,
        lastNudgedAt: proposal.last_nudged_at ?? null,
        version: proposal.version ?? null,
      },
      stats ?? null,
      events ?? null,
      new Date(),
    );
  }, [proposal, stats, events]);

  return { watch, isLoading };
}
