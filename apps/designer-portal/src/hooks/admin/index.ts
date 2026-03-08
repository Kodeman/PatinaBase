/**
 * Admin Hooks Barrel Export
 *
 * Exports all admin-specific hooks for role management, user management,
 * catalog management, and bulk operations.
 */

// Role Management Hooks
export {
  // Query Keys
  adminRoleKeys,
  adminPermissionKeys,

  // Role Queries
  useAdminRoles,
  useAdminRole,
  useAdminRoleUsers,

  // Permission Queries
  useAdminPermissions,
  useAdminPermissionsGrouped,

  // Role Mutations
  useCreateAdminRole,
  useUpdateAdminRole,
  useDeleteAdminRole,
  useCloneAdminRole,

  // Permission Mutations
  useReplaceAdminPermissions,
  useAddAdminPermissions,
  useRemoveAdminPermissions,

  // User Assignment Mutations
  useBulkAssignAdminRole,
  useBulkRemoveAdminRole,
  useAssignAdminRoleToUser,
  useRemoveAdminRoleFromUser,
} from './use-roles';

// User Management Hooks
export {
  // Query Keys
  adminUserKeys,

  // User Queries
  useAdminUser,
  useAdminUserSessions,

  // User Mutations
  useSuspendAdminUser,
  useBanAdminUser,
  useActivateAdminUser,
  useVerifyAdminEmail,

  // Session Mutations
  useRevokeAdminSession,
  useRevokeAllAdminSessions,

  // Role Assignment Mutations
  useAssignAdminRole,
  useRevokeAdminRole,
} from './use-users';

// Product Management Hooks
export {
  // Product Queries
  useAdminProducts,
  useAdminProduct,

  // Product Mutations
  useCreateAdminProduct,
  useUpdateAdminProduct,
  useDeleteAdminProduct,
  usePublishAdminProduct,
  useUnpublishAdminProduct,
  useDuplicateAdminProduct,
} from './use-admin-products';

// Catalog Statistics Hooks
export {
  useAdminCatalogStats,
  useAdminCatalogHealth,
  useAdminValidationSummary,
  useAdminCatalogTrends,
} from './use-catalog-stats';

// Bulk Operations Hooks
export {
  useAdminProductBulkActions,
} from './use-product-bulk-actions';

// Variant Management Hooks
export {
  // Query Keys
  adminVariantsKeys,

  // Variant Queries
  useAdminVariants,
  useAdminVariant,

  // Variant Mutations
  useCheckAdminSkuUniqueness,
  useCreateAdminVariant,
  useUpdateAdminVariant,
  useDeleteAdminVariant,
  useBulkCreateAdminVariants,
} from './use-variants';

// Utility Hooks
export {
  useBulkOperationLock,
  type BulkOperationLock,
} from './useBulkOperationLock';
