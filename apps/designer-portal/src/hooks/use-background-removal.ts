'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { moodBoardAssetsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/react-query';
import type { BackgroundRemovalCapability } from '@/lib/mood-board-assets/background-removal-contract';

export function useBackgroundRemovalCapability(boardId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.moodBoardAssets.backgroundRemovalCapability(boardId ?? null),
    enabled: !!boardId,
    queryFn: async (): Promise<BackgroundRemovalCapability> => {
      if (!boardId) throw new Error('Board ID is required');
      // Launched disabled at GA — any probe failure (401, 5xx, network) degrades
      // to the contract's existing "unavailable" shape rather than a thrown query
      // error. A thrown 401 here previously reached the global auth handler and
      // reloaded the page just because this optional capability check failed.
      try {
        return await moodBoardAssetsApi.getBackgroundRemovalCapability(boardId);
      } catch {
        return { available: false, code: 'background_removal_not_configured' };
      }
    },
    staleTime: 30_000,
    meta: { errorSurface: 'silent' },
  });
}

export function useRemoveBoardItemBackground() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...queryKeys.moodBoardAssets.all, 'remove-background'],
    mutationFn: moodBoardAssetsApi.removeBoardItemBackground,
    // This operation can incur a vendor charge. Neither React Query nor the
    // server-side proxy may retry it automatically.
    retry: false,
    meta: { errorSurface: 'inline' },
    onSuccess: async (result, variables) => {
      const capabilityKey = queryKeys.moodBoardAssets.backgroundRemovalCapability(
        variables.boardId,
      );
      queryClient.setQueryData(capabilityKey, {
        available: true,
        quota: result.quota,
      } satisfies BackgroundRemovalCapability);
      await queryClient.invalidateQueries({ queryKey: capabilityKey });
    },
  });
}
