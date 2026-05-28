'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  captureProduct,
  type CaptureProductInput,
  type CaptureProductResult,
} from '../mutations/capture-product';

export type UseCaptureProductOptions = {
  /**
   * Fires after a successful capture. Use this seam to emit your portal's
   * PostHog `product.captured` event — keeping it out of the mutation
   * itself means the hook works equally from queue drains, edge
   * functions, and any other non-React caller of `captureProduct()`.
   */
  onCaptured?: (result: CaptureProductResult) => void;
  /**
   * Optional override for the React Query mutation key — useful when
   * mounting multiple capture surfaces (e.g. URL-paste + Chrome
   * extension popup) in the same tree.
   */
  mutationKey?: unknown[];
};

/**
 * React Query wrapper around `captureProduct`. Invalidates the
 * `layer-products` + `layer-counts` caches on success so the Personal
 * LayerView refreshes immediately.
 */
export function useCaptureProduct(options: UseCaptureProductOptions = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: options.mutationKey ?? ['capture-product'],
    mutationFn: (input: CaptureProductInput) => captureProduct(input),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['layer-products', 'personal'] });
      void queryClient.invalidateQueries({ queryKey: ['layer-counts'] });
      options.onCaptured?.(result);
    },
  });
}
