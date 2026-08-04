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

// ── S4: Back of House notifications/directory/config (spec §6, §7, §10) ─────
export {
  notificationKeys,
  useOrderNotifications,
  findPendingDraft,
  useDraftClientNote,
  useSendClientNote,
} from './use-fulfillment-notifications';
export { vendorKeys, useVendorDirectory, useVendorDetail, useUpdateVendorProfile } from './use-fulfillment-vendors';
export { configKeys, useFulfillmentConfig, useUpdateFulfillmentConfig } from './use-fulfillment-config';

// ── S5: Back of House Shipment Board (spec §5.4) ────────────────────────────
export {
  shipmentKeys,
  useFulfillmentShipments,
  useCreateShipment,
  useConfirmAppointment,
  useUploadShipmentPod,
  useDeliverShipment,
  useRecordEtaChange,
} from './use-fulfillment-shipments';
