/**
 * Hooks Barrel Export
 *
 * Centralized export point for all custom React hooks in the admin portal.
 *
 * @module hooks
 */

// Authentication hooks
export * from './use-auth';

// Admin Products hooks
export {
  useAdminProducts,
  useProduct,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  usePublishProduct,
  useUnpublishProduct,
  useDuplicateProduct,
} from './use-admin-products';

// Bulk Actions hooks
export { useProductBulkActions } from './use-product-bulk-actions';

// Catalog Stats hooks
export {
  useCatalogStats,
  useCatalogHealth,
  useValidationSummary,
  useCatalogTrends,
} from './use-catalog-stats';

// Operation Lock hooks
export { useBulkOperationLock } from './useBulkOperationLock';
export type { BulkOperationLock } from './useBulkOperationLock';

// Variant Management hooks
export {
  useVariants,
  useVariant,
  useCreateVariant,
  useUpdateVariant,
  useDeleteVariant,
  useBulkCreateVariants,
  useCheckSkuUniqueness,
  variantsKeys,
} from './use-variants';

// Media Upload hooks
export {
  useMediaUpload,
  useMediaBatchUpload,
  useProductMedia,
  useDeleteMedia,
  useBulkDeleteMedia,
  useReorderMedia,
  useUpdateMedia,
} from './use-media-upload';
export type { UseMediaUploadOptions } from './use-media-upload';
