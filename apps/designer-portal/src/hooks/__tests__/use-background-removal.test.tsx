import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { queryKeys } from '@/lib/react-query';

const mockGetCapability = jest.fn();
const mockRemoveBackground = jest.fn();

jest.mock('@/lib/api-client', () => ({
  moodBoardAssetsApi: {
    getBackgroundRemovalCapability: (...args: unknown[]) => mockGetCapability(...args),
    removeBoardItemBackground: (...args: unknown[]) => mockRemoveBackground(...args),
  },
}));

import {
  useBackgroundRemovalCapability,
  useRemoveBoardItemBackground,
} from '../use-background-removal';

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: 5, retryDelay: 0 },
    },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('background-removal hooks', () => {
  beforeEach(() => {
    mockGetCapability.mockReset();
    mockRemoveBackground.mockReset();
  });

  it('uses the canonical capability query key', async () => {
    mockGetCapability.mockResolvedValue({
      available: false,
      code: 'background_removal_not_configured',
    });
    const { wrapper } = setup();
    const { result } = renderHook(() => useBackgroundRemovalCapability('board-id'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetCapability).toHaveBeenCalledWith('board-id');
    expect(result.current.data).toEqual({
      available: false,
      code: 'background_removal_not_configured',
    });
    expect(queryKeys.moodBoardAssets.backgroundRemovalCapability('board-id')).toEqual([
      'mood-board-assets',
      'board-id',
      'background-removal-capability',
    ]);
  });

  it('disables mutation retries even when the QueryClient default retries', async () => {
    mockRemoveBackground.mockRejectedValue(new Error('timeout'));
    const { wrapper } = setup();
    const { result } = renderHook(() => useRemoveBoardItemBackground(), { wrapper });

    act(() => {
      result.current.mutate({
        boardId: 'board-id',
        itemId: 'item-id',
        idempotencyKey: 'background-removal:request-1',
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockRemoveBackground).toHaveBeenCalledTimes(1);
  });

  it('refreshes the capability after a successful charged request', async () => {
    const quota = {
      studioMonthly: { limit: 25, used: 1, remaining: 24, resetAt: 'monthly-reset' },
      globalDaily: { limit: 100, used: 1, remaining: 99, resetAt: 'daily-reset' },
    };
    mockRemoveBackground.mockResolvedValue({
      originalUrl: 'original',
      cutoutUrl: 'cutout',
      idempotentReplay: false,
      quota,
    });
    const { queryClient, wrapper } = setup();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useRemoveBoardItemBackground(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        boardId: 'board-id',
        itemId: 'item-id',
        idempotencyKey: 'background-removal:request-2',
      });
    });

    const capabilityKey = queryKeys.moodBoardAssets.backgroundRemovalCapability('board-id');
    expect(queryClient.getQueryData(capabilityKey)).toEqual({ available: true, quota });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: capabilityKey });
  });
});
