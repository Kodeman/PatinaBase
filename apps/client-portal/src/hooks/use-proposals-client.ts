'use client';

import { useProposals, useProposal } from '@patina/supabase';
import type { Proposal } from '@patina/supabase';
import { useAuth } from './use-auth';

export function useClientProposals() {
  const { user } = useAuth();
  return useProposals(user ? { clientId: user.id } : undefined);
}

export function useClientProposal(proposalId: string) {
  return useProposal(proposalId);
}

export function partitionProposals(proposals: Proposal[] | undefined) {
  const list = proposals ?? [];
  const pending = list.filter((p) => p.status === 'sent' || p.status === 'viewed');
  const accepted = list.filter((p) => p.status === 'accepted');
  const archived = list.filter((p) => p.status === 'declined' || p.status === 'expired');
  // Note: 'revised' (a superseded version the designer pulled back to revise)
  // intentionally falls into NO bucket — it stays hidden from the client until
  // the new version is sent. 'draft' is likewise omitted.
  return { pending, accepted, archived };
}
