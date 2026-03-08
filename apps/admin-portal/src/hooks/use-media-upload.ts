'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mediaService, type UploadIntent } from '@/services/media';
import type { MediaAsset } from '@/types/media';
import { toast } from 'sonner';

export interface UseMediaUploadOptions {
  productId?: string;
  variantId?: string;
  role?: 'HERO' | 'DETAIL' | 'LIFESTYLE' | 'SWATCH' | 'OTHER';
  onSuccess?: (assetId: string) => void;
  onError?: (error: Error) => void;
  onProgress?: (progress: number) => void;
}

/**
 * Hook for uploading media files with progress tracking
 */
export function useMediaUpload(options: UseMediaUploadOptions = {}) {
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async ({
      file,
      onProgress,
    }: {
      file: File;
      onProgress?: (progress: number) => void;
    }) => {
      const intent: UploadIntent = {
        fileName: file.name,
        mimeType: file.type,
        kind: 'IMAGE', // Default to IMAGE, can be extended
        productId: options.productId,
        variantId: options.variantId,
        role: options.role,
      };

      // Upload file directly
      const response = await mediaService.uploadFile(
        file,
        intent,
        onProgress || options.onProgress
      );

      return response.data;
    },
    onSuccess: (data) => {
      // Invalidate product assets query
      if (options.productId) {
        queryClient.invalidateQueries({
          queryKey: ['media', 'product', options.productId],
        });
      }

      // Invalidate all media assets query
      queryClient.invalidateQueries({
        queryKey: ['media', 'assets'],
      });

      options.onSuccess?.(data?.assetId ?? '');
      toast.success('Image uploaded successfully');
    },
    onError: (error: Error) => {
      options.onError?.(error);
      toast.error(`Upload failed: ${error.message}`);
    },
  });

  return uploadMutation;
}

/**
 * Hook for uploading multiple files with batch tracking
 */
export function useMediaBatchUpload(options: UseMediaUploadOptions = {}) {
  const queryClient = useQueryClient();

  const batchUploadMutation = useMutation({
    mutationFn: async ({
      files,
      onFileProgress,
    }: {
      files: File[];
      onFileProgress?: (fileIndex: number, progress: number) => void;
    }) => {
      const uploadPromises = files.map(async (file, index) => {
        const intent: UploadIntent = {
          fileName: file.name,
          mimeType: file.type,
          kind: 'IMAGE',
          productId: options.productId,
          variantId: options.variantId,
          role: index === 0 ? 'HERO' : options.role, // First image is HERO by default
        };

        try {
          const response = await mediaService.uploadFile(
            file,
            intent,
            (progress) => onFileProgress?.(index, progress)
          );

          return {
            success: true,
            assetId: response.data?.assetId ?? '',
            fileName: file.name,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Upload failed',
            fileName: file.name,
          };
        }
      });

      const results = await Promise.all(uploadPromises);
      return results;
    },
    onSuccess: (results) => {
      const successCount = results.filter((r) => r.success).length;
      const failedCount = results.filter((r) => !r.success).length;

      // Invalidate queries
      if (options.productId) {
        queryClient.invalidateQueries({
          queryKey: ['media', 'product', options.productId],
        });
      }
      queryClient.invalidateQueries({
        queryKey: ['media', 'assets'],
      });

      if (successCount > 0) {
        toast.success(`${successCount} image${successCount > 1 ? 's' : ''} uploaded successfully`);
      }
      if (failedCount > 0) {
        toast.error(`${failedCount} image${failedCount > 1 ? 's' : ''} failed to upload`);
      }
    },
    onError: (error: Error) => {
      options.onError?.(error);
      toast.error(`Batch upload failed: ${error.message}`);
    },
  });

  return batchUploadMutation;
}

/**
 * Hook for fetching product media assets
 */
export function useProductMedia(productId?: string) {
  return useQuery({
    queryKey: ['media', 'product', productId],
    queryFn: async () => {
      if (!productId) return [];
      const response = await mediaService.getProductAssets(productId);
      return response.data || [];
    },
    enabled: !!productId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook for deleting a media asset
 */
export function useDeleteMedia() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      assetId,
      hardDelete = false,
    }: {
      assetId: string;
      hardDelete?: boolean;
    }) => {
      await mediaService.deleteAsset(assetId, hardDelete);
    },
    onSuccess: (_, variables) => {
      // Invalidate all media queries
      queryClient.invalidateQueries({
        queryKey: ['media'],
      });

      toast.success('Image deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Delete failed: ${error.message}`);
    },
  });
}

/**
 * Hook for bulk deleting media assets
 */
export function useBulkDeleteMedia() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      assetIds,
      softDelete = true,
    }: {
      assetIds: string[];
      softDelete?: boolean;
    }) => {
      const response = await mediaService.bulkDeleteAssets(assetIds, softDelete);
      return response.data;
    },
    onSuccess: (data) => {
      // Invalidate all media queries
      queryClient.invalidateQueries({
        queryKey: ['media'],
      });

      if ((data?.success ?? 0) > 0) {
        toast.success(`${data?.success} image${(data?.success ?? 0) > 1 ? 's' : ''} deleted successfully`);
      }
      if ((data?.failed ?? 0) > 0) {
        toast.error(`${data?.failed} image${(data?.failed ?? 0) > 1 ? 's' : ''} failed to delete`);
      }
    },
    onError: (error: Error) => {
      toast.error(`Bulk delete failed: ${error.message}`);
    },
  });
}

/**
 * Hook for reordering media assets
 */
export function useReorderMedia(productId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ assetIds }: { assetIds: string[] }) => {
      if (!productId) {
        throw new Error('Product ID is required for reordering');
      }
      await mediaService.reorderAssets(productId, { assetIds });
    },
    onMutate: async ({ assetIds }) => {
      // Optimistically update the cache
      if (productId) {
        await queryClient.cancelQueries({
          queryKey: ['media', 'product', productId],
        });

        const previousAssets = queryClient.getQueryData<MediaAsset[]>([
          'media',
          'product',
          productId,
        ]);

        if (previousAssets) {
          // Reorder assets in cache
          const reorderedAssets = assetIds
            .map((id) => previousAssets.find((asset) => asset.id === id))
            .filter(Boolean) as MediaAsset[];

          queryClient.setQueryData(['media', 'product', productId], reorderedAssets);
        }

        return { previousAssets };
      }
    },
    onError: (error: Error, _, context) => {
      // Rollback on error
      if (context?.previousAssets && productId) {
        queryClient.setQueryData(
          ['media', 'product', productId],
          context.previousAssets
        );
      }
      toast.error(`Reorder failed: ${error.message}`);
    },
    onSuccess: () => {
      toast.success('Images reordered successfully');
    },
    onSettled: () => {
      // Refetch to ensure consistency
      if (productId) {
        queryClient.invalidateQueries({
          queryKey: ['media', 'product', productId],
        });
      }
    },
  });
}

/**
 * Hook for updating media asset metadata
 */
export function useUpdateMedia() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      assetId,
      updates,
    }: {
      assetId: string;
      updates: Partial<MediaAsset>;
    }) => {
      const response = await mediaService.updateAsset(assetId, updates as any);
      return response.data;
    },
    onSuccess: (data) => {
      // Invalidate all media queries
      queryClient.invalidateQueries({
        queryKey: ['media'],
      });

      toast.success('Image updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Update failed: ${error.message}`);
    },
  });
}
