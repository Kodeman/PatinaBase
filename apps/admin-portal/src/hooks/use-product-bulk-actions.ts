/**
 * useProductBulkActions Hook
 *
 * Manages bulk product operations via the admin bulk API endpoint.
 * Replaces N+1 individual service calls with single batch requests.
 */

'use client';

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import type { BulkActionResult, BulkActionItemResult } from '@/types';

interface UseBulkActionsOptions {
  clearOnSuccess?: boolean;
  requireConfirmation?: boolean;
  optimistic?: boolean;
  onSuccess?: (result: BulkActionResult) => void;
  onError?: (error: unknown) => void;
}

async function getAuthToken(): Promise<string | null> {
  const supabase = createBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function bulkFetch(action: string, productIds: string[]) {
  const token = await getAuthToken();
  const res = await fetch('/api/catalog/products/bulk', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, productIds }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Bulk ${action} failed: ${res.status}`);
  }

  return res.json();
}

export function useProductBulkActions(options: UseBulkActionsOptions = {}) {
  const queryClient = useQueryClient();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isAllSelected, setIsAllSelected] = useState(false);
  const [error, setError] = useState<unknown | null>(null);
  const [lastResult, setLastResult] = useState<BulkActionResult | null>(null);

  // Selection management
  const selectProduct = useCallback((productId: string) => {
    setSelectedIds((prev) => prev.includes(productId) ? prev : [...prev, productId]);
  }, []);

  const selectProducts = useCallback((productIds: string[]) => {
    setSelectedIds(productIds);
  }, []);

  const deselectProduct = useCallback((productId: string) => {
    setSelectedIds((prev) => prev.filter((id) => id !== productId));
  }, []);

  const deselectProducts = useCallback((productIds: string[]) => {
    setSelectedIds((prev) => prev.filter((id) => !productIds.includes(id)));
  }, []);

  const selectAll = useCallback((productIds: string[]) => {
    setSelectedIds(productIds);
    setIsAllSelected(true);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setIsAllSelected(false);
  }, []);

  const toggleProduct = useCallback((productId: string) => {
    setSelectedIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  }, []);

  const isSelected = useCallback(
    (productId: string) => selectedIds.includes(productId),
    [selectedIds]
  );

  const validateSelection = useCallback(() => {
    if (selectedIds.length === 0) {
      throw new Error('No products selected');
    }
  }, [selectedIds]);

  function handleSuccess(response: BulkActionResult) {
    setLastResult(response);
    queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    queryClient.invalidateQueries({ queryKey: ['catalog-stats'] });
    if (options.clearOnSuccess) clearSelection();
    if (options.onSuccess) options.onSuccess(response);
  }

  function handleError(err: unknown) {
    setError(err);
    if (options.onError) options.onError(err);
  }

  const bulkPublishMutation = useMutation({
    mutationFn: (ids: string[]) => bulkFetch('publish', ids),
    onSuccess: handleSuccess,
    onError: handleError,
  });

  const bulkUnpublishMutation = useMutation({
    mutationFn: ({ ids }: { ids: string[]; reason?: string }) => bulkFetch('unpublish', ids),
    onSuccess: handleSuccess,
    onError: handleError,
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: ({ ids }: { ids: string[] }) => bulkFetch('delete', ids),
    onSuccess: handleSuccess,
    onError: handleError,
  });

  return {
    // Selection state
    selectedIds,
    isAllSelected,
    selectedCount: selectedIds.length,
    hasSelection: selectedIds.length > 0,

    // Selection methods
    selectProduct,
    selectProducts,
    deselectProduct,
    deselectProducts,
    selectAll,
    clearSelection,
    toggleProduct,
    isSelected,

    // Bulk operations
    bulkPublish: async () => {
      validateSelection();
      return bulkPublishMutation.mutateAsync(selectedIds);
    },
    bulkUnpublish: async (reason?: string) => {
      validateSelection();
      return bulkUnpublishMutation.mutateAsync({ ids: selectedIds, reason });
    },
    bulkDelete: async () => {
      validateSelection();
      return bulkDeleteMutation.mutateAsync({ ids: selectedIds });
    },
    bulkUpdateStatus: async (status: string) => {
      validateSelection();
      // For now, map to publish/unpublish
      if (status === 'published') return bulkPublishMutation.mutateAsync(selectedIds);
      if (status === 'draft') return bulkUnpublishMutation.mutateAsync({ ids: selectedIds });
      throw new Error(`Unsupported bulk status: ${status}`);
    },

    // Loading states
    isPublishing: bulkPublishMutation.isPending,
    isUnpublishing: bulkUnpublishMutation.isPending,
    isDeleting: bulkDeleteMutation.isPending,
    isLoading:
      bulkPublishMutation.isPending ||
      bulkUnpublishMutation.isPending ||
      bulkDeleteMutation.isPending,

    // Operation results
    lastResult,
    error,
    setError,
    clearError: () => setError(null),

    optimisticSuccess: options.optimistic && bulkPublishMutation.isPending,
  };
}
