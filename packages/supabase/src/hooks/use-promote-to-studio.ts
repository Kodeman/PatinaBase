'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  promoteToStudio,
  demoteToPersonal,
  type PromoteToStudioInput,
  type DemoteToPersonalInput,
} from '../mutations/promotion';

function invalidateLayerCaches(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['layer-products'] });
  void qc.invalidateQueries({ queryKey: ['layer-counts'] });
  void qc.invalidateQueries({ queryKey: ['promotion-candidates'] });
  void qc.invalidateQueries({ queryKey: ['cross-layer-search'] });
}

export interface UsePromoteToStudioOptions {
  onSuccess?: (productId: string) => void;
  onError?: (error: Error) => void;
}

/**
 * React Query wrapper for the `promote_to_studio` RPC. Invalidates every
 * layer-aware cache so the source layer view (Personal) and the
 * destination view (Studio) both refresh on success.
 */
export function usePromoteToStudio(options: UsePromoteToStudioOptions = {}) {
  const queryClient = useQueryClient();
  return useMutation<string, Error, PromoteToStudioInput>({
    mutationKey: ['promote-to-studio'],
    mutationFn: (input) => promoteToStudio(input),
    onSuccess: (productId) => {
      invalidateLayerCaches(queryClient);
      options.onSuccess?.(productId);
    },
    onError: (error) => {
      options.onError?.(error);
    },
  });
}

export interface UseDemoteToPersonalOptions {
  onSuccess?: (productId: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Demotion hook. The RPC enforces the in-active-use block; a thrown
 * Error with that message is the caller's signal to render the
 * "remove from project first" guidance from PRD §6.5.
 */
export function useDemoteToPersonal(options: UseDemoteToPersonalOptions = {}) {
  const queryClient = useQueryClient();
  return useMutation<string, Error, DemoteToPersonalInput>({
    mutationKey: ['demote-to-personal'],
    mutationFn: (input) => demoteToPersonal(input),
    onSuccess: (productId) => {
      invalidateLayerCaches(queryClient);
      options.onSuccess?.(productId);
    },
    onError: (error) => {
      options.onError?.(error);
    },
  });
}
