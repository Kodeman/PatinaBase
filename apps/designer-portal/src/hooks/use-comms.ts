/**
 * Hooks for Communications & Messaging
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mockData } from '@/data/mock-designer-data';
import { commsApi } from '@/lib/api-client';
import { withMockData } from '@/lib/mock-data';
import { queryKeys } from '@/lib/react-query';
import { useRealtimeMessages, useRealtimeThreads, useTypingIndicator } from './use-websocket';

interface ThreadParams {
  scope?: string;
  cursor?: string;
  limit?: number;
}

export function useThreads(params?: ThreadParams) {
  // Enable real-time updates for thread list
  useRealtimeThreads();

  return useQuery({
    queryKey: queryKeys.threads.list(params?.scope),
    queryFn: () =>
      withMockData(
        () => commsApi.getThreads(params),
        () => mockData.getThreads()
      ),
  });
}

export function useThread(id: string | null) {
  // Enable real-time updates for this thread
  useRealtimeMessages(id);

  return useQuery({
    queryKey: id ? queryKeys.threads.detail(id) : ['threads', 'null'],
    queryFn: () => {
      if (!id) throw new Error('Thread ID required');
      return withMockData(
        () => commsApi.getThread(id),
        () => {
          const thread = mockData.getThreadById(id);
          if (!thread) throw new Error('Thread not found');
          return thread;
        }
      );
    },
    enabled: !!id,
    // Real-time updates via WebSocket, so less aggressive polling
    refetchInterval: 60000, // 60 seconds fallback
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      threadId,
      data,
    }: {
      threadId: string;
      data: { bodyText?: string; bodyMd?: string; attachments?: unknown[] };
    }) =>
      withMockData(
        () => commsApi.createMessage(threadId, data),
        () => mockData.addThreadMessage(threadId, data)
      ),
    // Optimistic update
    onMutate: async ({ threadId, data }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.detail(threadId) });
      const previousThread = queryClient.getQueryData(queryKeys.threads.detail(threadId));

      queryClient.setQueryData(queryKeys.threads.detail(threadId), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          messages: [
            ...(old.messages || []),
            {
              id: `temp-${Date.now()}`,
              ...data,
              createdAt: new Date().toISOString(),
              status: 'sending',
            },
          ],
        };
      });

      return { previousThread };
    },
    onError: (_err, { threadId }, context) => {
      if (context?.previousThread) {
        queryClient.setQueryData(queryKeys.threads.detail(threadId), context.previousThread);
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.threads.detail(variables.threadId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.threads.all });
    },
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ threadId, lastReadMessageId }: { threadId: string; lastReadMessageId: string }) =>
      withMockData(
        () => commsApi.markRead(threadId, lastReadMessageId),
        () => Promise.resolve({ threadId, lastReadMessageId })
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.threads.detail(variables.threadId) });
    },
  });
}

// Re-export typing indicator hook for convenience
export { useTypingIndicator };
