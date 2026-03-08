import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Optimistic Update Configuration
 */
export interface UseOptimisticUpdateConfig<TData, TVariables, TContext> {
  queryKey: string[];
  mutationFn: (variables: TVariables) => Promise<TData>;
  updateFn: (oldData: any, newData: TData) => any;
  timeout?: number;
  onSuccess?: (data: TData, variables: TVariables, context: TContext) => void;
  onError?: (error: Error, variables: TVariables, context?: TContext) => void;
  onSettled?: (data: TData | undefined, error: Error | null, variables: TVariables, context?: TContext) => void;
}

/**
 * Optimistic Update Return Value
 */
export interface UseOptimisticUpdateReturn<TData, TVariables> {
  mutate: (variables: TVariables) => void;
  mutateAsync: (variables: TVariables) => Promise<TData>;
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: Error | null;
  data: TData | undefined;
  reset: () => void;
}

/**
 * React Hook for Optimistic Updates with WebSocket Confirmation
 *
 * Performs optimistic updates immediately for better UX, then waits for
 * server confirmation via WebSocket. Automatically rolls back if confirmation
 * doesn't arrive within the timeout period.
 *
 * @example
 * ```tsx
 * const { mutate, isPending } = useOptimisticUpdate({
 *   queryKey: ['approvals', projectId],
 *   mutationFn: async (approval) => {
 *     await api.approvals.create(approval);
 *     return approval;
 *   },
 *   updateFn: (oldData, newApproval) => [newApproval, ...oldData],
 *   timeout: 5000,
 * });
 *
 * // In component
 * <button onClick={() => mutate(newApproval)} disabled={isPending}>
 *   Submit Approval
 * </button>
 * ```
 */
export function useOptimisticUpdate<TData, TVariables = any, TContext = unknown>(
  config: UseOptimisticUpdateConfig<TData, TVariables, TContext>,
): UseOptimisticUpdateReturn<TData, TVariables> {
  const {
    queryKey,
    mutationFn,
    updateFn,
    timeout = 5000,
    onSuccess,
    onError,
    onSettled,
  } = config;

  const queryClient = useQueryClient();
  const rollbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [confirmationReceived, setConfirmationReceived] = useState(false);

  /**
   * Clear rollback timer
   */
  const clearRollbackTimer = useCallback(() => {
    if (rollbackTimerRef.current) {
      clearTimeout(rollbackTimerRef.current);
      rollbackTimerRef.current = null;
    }
  }, []);

  /**
   * Mutation with optimistic update logic
   */
  const mutation = useMutation<TData, Error, TVariables, TContext>({
    mutationFn,
    onMutate: async (variables: TVariables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData(queryKey);

      // Optimistically update to the new value
      queryClient.setQueryData(queryKey, (oldData: any) => {
        if (!oldData) return oldData;
        return updateFn(oldData, variables as any);
      });

      // Set rollback timer
      clearRollbackTimer();
      rollbackTimerRef.current = setTimeout(() => {
        if (!confirmationReceived) {
          console.warn('Optimistic update timed out, rolling back...');
          queryClient.setQueryData(queryKey, previousData);
        }
      }, timeout);

      return { previousData } as TContext;
    },
    onSuccess: (data: TData, variables: TVariables, context: TContext) => {
      // Clear rollback timer on success
      clearRollbackTimer();
      setConfirmationReceived(true);
      onSuccess?.(data, variables, context);
    },
    onError: (error: Error, variables: TVariables, context: TContext | undefined) => {
      // Rollback on error
      if (context && typeof context === 'object' && 'previousData' in context) {
        queryClient.setQueryData(queryKey, (context as any).previousData);
      }
      clearRollbackTimer();
      onError?.(error, variables, context);
    },
    onSettled: (data: TData | undefined, error: Error | null, variables: TVariables, context: TContext | undefined) => {
      clearRollbackTimer();
      onSettled?.(data || undefined, error, variables, context);
    },
  });


  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      clearRollbackTimer();
    };
  }, [clearRollbackTimer]);

  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isError: mutation.isError,
    isSuccess: mutation.isSuccess,
    error: mutation.error,
    data: mutation.data,
    reset: mutation.reset,
  };
}

/**
 * Hook for confirming optimistic updates via WebSocket events
 *
 * @example
 * ```tsx
 * const { confirm } = useOptimisticUpdateConfirmation(['approvals']);
 *
 * useWebSocket({
 *   namespace: '/projects',
 *   events: {
 *     'approval:created': (data) => {
 *       confirm(); // Confirm optimistic update
 *       // Query will be updated by server data
 *     },
 *   },
 * });
 * ```
 */
export function useOptimisticUpdateConfirmation(queryKey: string[]) {
  const queryClient = useQueryClient();

  const confirm = useCallback(() => {
    // Invalidate to fetch fresh data from server
    queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  return { confirm };
}
