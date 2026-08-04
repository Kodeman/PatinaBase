'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { moodBoardAssetsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/react-query';
import type { BackgroundRemovalCapability } from '@/lib/mood-board-assets/background-removal-contract';

export function useBackgroundRemovalCapability(boardId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.moodBoardAssets.backgroundRemovalCapability(boardId ?? null),
    enabled: !!boardId,
    queryFn: (): Promise<BackgroundRemovalCapability> => {
      if (!boardId) throw new Error('Board ID is required');
      return moodBoardAssetsApi.getBackgroundRemovalCapability(boardId);
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
