import type { QueryClient } from '@tanstack/react-query';

export const PROPOSAL_CLIENT_MUTATION_KEY = 'proposal-client-copy';

export const proposalClientQueryKeys = {
  draftingFacets: (proposalId: string) =>
    ['drafting-facets', proposalId] as const,
  mirror: (proposalId: string) => ['proposal-mirror', proposalId] as const,
};

/**
 * Invalidate the two mounted projections that compose and verify a proposal's
 * client-facing children. Awaiting both keeps the mutation pending until the
 * Drafting facets and “client copy · live” preview have reconciled.
 */
export async function invalidateProposalClientQueries(
  queryClient: QueryClient,
  proposalId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: proposalClientQueryKeys.draftingFacets(proposalId),
    }),
    queryClient.invalidateQueries({
      queryKey: proposalClientQueryKeys.mirror(proposalId),
    }),
  ]);
}
