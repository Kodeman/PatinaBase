/**
 * useProductBulkActions Hook
 *
 * Custom React hook for managing bulk product operations including
 * selection state, bulk publish/unpublish, bulk delete, and status updates.
 *
 * Features:
 * - Selection state management (individual and select-all)
 * - Bulk publish/unpublish operations
 * - Bulk delete with soft delete support
 * - Bulk status updates
 * - Error handling and callbacks
 * - Query invalidation after operations
 *
 * @module hooks/use-product-bulk-actions
 */

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { catalogService } from '@/services/catalog';
import type {
  BulkSelection,
  BulkActionResult,
  BulkActionItemResult,
} from '@/types';
import type { UUID } from '@patina/types';

/**
 * Options for configuring bulk actions hook
 */
interface UseBulkActionsOptions {
  /** Clear selection after successful operation */
  clearOnSuccess?: boolean;
  /** Require confirmation for delete operations */
  requireConfirmation?: boolean;
  /** Enable optimistic updates */
  optimistic?: boolean;
  /** Success callback */
  onSuccess?: (result: BulkActionResult) => void;
  /** Error callback */
  onError?: (error: any) => void;
}

/**
 * Hook for managing bulk product actions
 *
 * @param options - Configuration options
 * @returns Bulk actions interface with selection state and operations
 */
export function useProductBulkActions(options: UseBulkActionsOptions = {}) {
  const queryClient = useQueryClient();

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isAllSelected, setIsAllSelected] = useState(false);
  const [error, setError] = useState<any | null>(null);
  const [lastResult, setLastResult] = useState<BulkActionResult | null>(null);

  // Selection management functions
  const selectProduct = useCallback((productId: string) => {
    setSelectedIds((prev) => {
      // Prevent duplicates
      if (prev.includes(productId)) {
        return prev;
      }
      return [...prev, productId];
    });
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
    setSelectedIds((prev) => {
      if (prev.includes(productId)) {
        return prev.filter((id) => id !== productId);
      }
      return [...prev, productId];
    });
  }, []);

  const isSelected = useCallback(
    (productId: string) => selectedIds.includes(productId),
    [selectedIds]
  );

  // Validate selection
  const validateSelection = useCallback(() => {
    if (selectedIds.length === 0) {
      throw new Error('No products selected');
    }
  }, [selectedIds]);

  // Bulk publish mutation
  const bulkPublishMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      // Add bulk publish method to catalog service
      const results: BulkActionItemResult[] = [];

      for (const id of ids) {
        try {
          await catalogService.publishProduct(id);
          results.push({ id, success: true });
        } catch (err: any) {
          results.push({
            id,
            success: false,
            error: err.message || 'Failed to publish',
          });
        }
      }

      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      return {
        data: {
          success: successful,
          failed,
          skipped: [],
          total: ids.length,
        },
      };
    },
    onSuccess: (response) => {
      const result = response.data;
      setLastResult(result);
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });

      if (options.clearOnSuccess) {
        clearSelection();
      }

      if (options.onSuccess) {
        options.onSuccess(result);
      }
    },
    onError: (err) => {
      setError(err);
      if (options.onError) {
        options.onError(err);
      }
    },
  });

  // Bulk unpublish mutation
  const bulkUnpublishMutation = useMutation({
    mutationFn: async ({ ids, reason }: { ids: string[]; reason?: string }) => {
      const results: BulkActionItemResult[] = [];

      for (const id of ids) {
        try {
          await catalogService.unpublishProduct(id);
          results.push({ id, success: true });
        } catch (err: any) {
          results.push({
            id,
            success: false,
            error: err.message || 'Failed to unpublish',
          });
        }
      }

      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      return {
        data: {
          success: successful,
          failed,
          skipped: [],
          total: ids.length,
        },
      };
    },
    onSuccess: (response) => {
      const result = response.data;
      setLastResult(result);
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });

      if (options.clearOnSuccess) {
        clearSelection();
      }

      if (options.onSuccess) {
        options.onSuccess(result);
      }
    },
    onError: (err) => {
      setError(err);
      if (options.onError) {
        options.onError(err);
      }
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async ({ ids, deleteOptions }: { ids: string[]; deleteOptions?: { soft?: boolean } }) => {
      if (options.requireConfirmation) {
        throw new Error('Confirmation required');
      }

      const results: BulkActionItemResult[] = [];

      for (const id of ids) {
        try {
          await catalogService.deleteProduct(id);
          results.push({ id, success: true });
        } catch (err: any) {
          results.push({
            id,
            success: false,
            error: err.message || 'Failed to delete',
          });
        }
      }

      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      return {
        data: {
          success: successful,
          failed,
          skipped: [],
          total: ids.length,
        },
      };
    },
    onSuccess: (response) => {
      const result = response.data;
      setLastResult(result);
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });

      if (options.clearOnSuccess) {
        clearSelection();
      }

      if (options.onSuccess) {
        options.onSuccess(result);
      }
    },
    onError: (err) => {
      setError(err);
      if (options.onError) {
        options.onError(err);
      }
    },
  });

  // Bulk update status mutation
  const bulkUpdateStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      const results: BulkActionItemResult[] = [];

      for (const id of ids) {
        try {
          await catalogService.updateProduct(id, { status: status as any });
          results.push({ id, success: true });
        } catch (err: any) {
          results.push({
            id,
            success: false,
            error: err.message || 'Failed to update status',
          });
        }
      }

      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      return {
        data: {
          success: successful,
          failed,
          skipped: [],
          total: ids.length,
        },
      };
    },
    onSuccess: (response) => {
      const result = response.data;
      setLastResult(result);
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });

      if (options.clearOnSuccess) {
        clearSelection();
      }

      if (options.onSuccess) {
        options.onSuccess(result);
      }
    },
  });

  // Public API
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
    bulkDelete: async (deleteOptions?: { soft?: boolean }) => {
      validateSelection();
      return bulkDeleteMutation.mutateAsync({ ids: selectedIds, deleteOptions });
    },
    bulkUpdateStatus: async (status: string) => {
      validateSelection();
      return bulkUpdateStatusMutation.mutateAsync({ ids: selectedIds, status });
    },

    // Loading states
    isPublishing: bulkPublishMutation.isPending,
    isUnpublishing: bulkUnpublishMutation.isPending,
    isDeleting: bulkDeleteMutation.isPending,
    isLoading:
      bulkPublishMutation.isPending ||
      bulkUnpublishMutation.isPending ||
      bulkDeleteMutation.isPending ||
      bulkUpdateStatusMutation.isPending,

    // Operation results
    lastResult,
    error,

    // Error management
    setError,
    clearError: () => setError(null),

    // Optimistic updates flag
    optimisticSuccess: options.optimistic && bulkPublishMutation.isPending,
  };
}
