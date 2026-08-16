'use client';

/**
 * The Finalize table's leader + verdict headline, composed from reads the open
 * document already holds hot (the proposal, its feedback, its watch model), so
 * mounting this costs no query the page was not already paying for.
 *
 * The page reads it once and hands the answer to both mouths — the head that
 * prints it, and the instruments below, which stand their own copy of the
 * hoisted act down so the verb prints once.
 */

import { useMemo } from 'react';
import { useProposalFeedback } from '@patina/supabase';
import { formatVerdictRollup, rollupVerdicts } from '@patina/utils';
import type { VerdictRollup } from '@patina/utils';
import { useProposal } from '@/hooks/use-proposals';
import { useProposalWatch } from '@/hooks/use-proposal-watch';
import { familyLabel } from '@/lib/document/family-label';
import {
  deriveFinalizeLeader,
  type FinalizeLeader,
} from '@/lib/document/finalize-leader';

export interface FinalizeHeadModel {
  /** "4 of 12 approved · 1 flagged" — empty when the client has not weighed in.
   *  The flag count is the UNRESOLVED one: the leader reads
   *  `rollup.unresolvedFlags`, and a headline counting flags the designer has
   *  already answered would put two numbers on one table. */
  headline: string;
  rollup: VerdictRollup;
  leader: FinalizeLeader | null;
}

export function useFinalizeLeader(
  proposalId: string,
  clientName: string,
): FinalizeHeadModel {
  const { data: proposal } = useProposal(proposalId) as { data: any };
  const { data: feedback = [] } = useProposalFeedback(proposalId);
  const { watch } = useProposalWatch(proposalId);

  const rollup = useMemo(
    () =>
      rollupVerdicts(
        proposal?.items?.length ?? 0,
        feedback.map((f) => ({
          lineId: f.proposal_item_id ?? '',
          verdict: f.verdict,
          createdAt: f.created_at,
          resolvedAt: f.resolved_at,
        })),
      ),
    [feedback, proposal?.items?.length],
  );

  const leader = useMemo(() => {
    if (!watch) return null;
    return deriveFinalizeLeader(
      {
        watch,
        commercialState:
          typeof proposal?.commercial_state === 'string'
            ? proposal.commercial_state
            : null,
        issuedOnPaper: proposal?.issued_on_paper === true,
        rollup,
        family: familyLabel(clientName),
      },
      new Date(),
    );
  }, [
    watch,
    proposal?.commercial_state,
    proposal?.issued_on_paper,
    rollup,
    clientName,
  ]);

  // The shared formatter, handed the count that is still open. `rollup.flagged`
  // is every flag the client ever raised, resolved ones included.
  const headline = formatVerdictRollup({
    ...rollup,
    flagged: rollup.unresolvedFlags,
  });

  return { headline, rollup, leader };
}
