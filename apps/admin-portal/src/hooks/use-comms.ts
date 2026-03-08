import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ThreadWithMessages } from '@patina/types';

import { commsApi } from '@/lib/api-client';

interface ThreadFilters {
  projectId?: string;
  proposalId?: string;
  scope?: string;
  cursor?: string;
  limit?: number;
}

const threadKeys = {
  all: ['threads'] as const,
  list: (filters?: ThreadFilters) => ['threads', 'list', filters] as const,
  detail: (id?: string | null) => ['threads', 'detail', id] as const,
};

type ThreadPreview = Record<string, unknown>;

const normalizeThreads = (raw: unknown): ThreadPreview[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as ThreadPreview[];
  if (Array.isArray((raw as Record<string, unknown>)?.threads)) {
    return (raw as { threads: ThreadPreview[] }).threads;
  }
  if (Array.isArray((raw as Record<string, unknown>)?.data)) {
    return (raw as { data: ThreadPreview[] }).data;
  }
  return [];
};

export function useThreads(filters?: ThreadFilters) {
  return useQuery({
    queryKey: threadKeys.list(filters),
    queryFn: async () => commsApi.getThreads(filters),
  });
}

export function useThread(threadId: string | null) {
  return useQuery<ThreadWithMessages>({
    queryKey: threadKeys.detail(threadId),
    queryFn: async () => {
      if (!threadId) throw new Error('Thread ID is required');
      return commsApi.getThread(threadId) as Promise<ThreadWithMessages>;
    },
    enabled: Boolean(threadId),
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      threadId,
      data,
    }: {
      threadId: string;
      data: { bodyText?: string; bodyMd?: string; attachments?: unknown[] };
    }) => commsApi.createMessage(threadId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: threadKeys.detail(variables.threadId) });
      queryClient.invalidateQueries({ queryKey: threadKeys.all });
    },
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ threadId, lastReadMessageId }: { threadId: string; lastReadMessageId: string }) =>
      commsApi.markRead(threadId, lastReadMessageId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: threadKeys.detail(variables.threadId) });
    },
  });
}

export { normalizeThreads, threadKeys };
