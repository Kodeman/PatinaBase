'use client';

import {
  useClientSafeProposalBundle,
  useClientSafeProposals,
} from '@patina/supabase';
import type { Proposal } from '@patina/supabase';
import { commercialSummaryFromProposal } from '@/lib/commercial-documents';

export function useClientProposals() {
  return useClientSafeProposals();
}

export function useClientProposal(proposalId: string) {
  const query = useClientSafeProposalBundle(proposalId);
  return {
    ...query,
    data: query.data?.proposal,
    bundle: query.data,
  };
}

export function partitionProposals(proposals: Proposal[] | undefined) {
  const list = proposals ?? [];
  const pending = list.filter((p) => commercialSummaryFromProposal(p).state === 'sent');
  const accepted = list.filter((p) => {
    const state = commercialSummaryFromProposal(p).state;
    return state === 'client_signed' || state === 'executed';
  });
  const archived = list.filter((p) => {
    const state = commercialSummaryFromProposal(p).state;
    return state === 'declined' || state === 'expired' || state === 'superseded';
  });
  // Draft documents stay hidden until the studio issues them. Superseded
  // commercial editions remain visible as inert history with replacement
  // guidance, while legacy `revised` proposals retain their old hidden behavior.
  const visibleArchived = archived.filter((p) =>
    p.status !== 'revised' || commercialSummaryFromProposal(p).kind !== 'legacy'
  );
  return { pending, accepted, archived: visibleArchived };
}
