'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/** The one cross-editor reconciliation path for Drafting Room facet counts. */
export function useDraftingFacetInvalidation(proposalId: string) {
  const queryClient = useQueryClient();

  return useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: ['drafting-facets', proposalId],
      }),
    [proposalId, queryClient],
  );
}
