/**
 * Hooks for Communications & Messaging
 * Client Portal implementation for messaging with designers
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { commsApi } from '@/lib/api-client';

// Query key factory for consistent cache invalidation
export const queryKeys = {
  threads: {
    all: ['threads'] as const,
    list: (scope?: string) => [...queryKeys.threads.all, 'list', scope] as const,
    detail: (id: string) => [...queryKeys.threads.all, 'detail', id] as const,
  },
};

interface ThreadParams {
  scope?: string;
  projectId?: string;
  status?: string;
}

export function useThreads(params?: ThreadParams) {
  return useQuery({
    queryKey: queryKeys.threads.list(params?.scope || params?.projectId),
    queryFn: () => commsApi.getThreads(params),
    retry: 2,
    staleTime: 30000, // 30 seconds
  });
}

export function useThread(id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.threads.detail(id) : ['threads', 'null'],
    queryFn: () => {
      if (!id) throw new Error('Thread ID required');
      return commsApi.getThread(id);
    },
    enabled: !!id,
    retry: 2,
    staleTime: 15000, // 15 seconds
    refetchInterval: 60000, // 60 seconds fallback polling
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
      data: { bodyText?: string; bodyMd?: string };
    }) => commsApi.createMessage(threadId, data),

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
      commsApi.markRead(threadId, lastReadMessageId),

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.threads.detail(variables.threadId) });
    },
  });
}

// Stub for typing indicator (WebSocket not implemented in Client Portal yet)
export function useTypingIndicator(_threadId: string | null) {
  return {
    typingUsers: [] as string[],
    setTyping: (_isTyping: boolean, _userId: string) => {
      // WebSocket typing indicator not implemented for Client Portal
    },
  };
}
