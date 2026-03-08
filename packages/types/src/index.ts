// Common Types
export * from './common';
export * from './user';
export * from './designer';
export * from './dev-accounts';
export * from './product';
export * from './catalog';
export * from './catalog-search';
export * from './order';
export * from './style-profile';
export * from './api';
// Export media types (re-exports MediaType locally to avoid conflict with catalog)
export type {
  MediaAsset,
  MediaAssetType,
  MediaAssetStatus,
  MediaLibraryAsset,
  MediaVersion,
  MediaUsage,
  MediaFolder,
  UploadChunk,
  UploadOptions,
  ImageEditorState,
  MediaFilter,
  ViewMode,
  SortField,
  SortOrder,
} from './media';

// Domain-specific Types
export * from './events';
export * from './proposal';
export * from './project';
export * from './comms';
export * from './aesthete';
export * from './timeline';
export * from './permissions';

// Value Objects
export * from './value-objects/email.vo';
export * from './value-objects/phone-number.vo';
export * from './value-objects/money.vo';
export * from './value-objects/color.vo';
export * from './value-objects/url.vo';

// Value Objects with naming conflicts - export with 'VO' suffix to avoid conflicts with interfaces
export {
  Address as AddressVO,
  InvalidAddressError,
  type AddressComponents,
  type Country,
} from './value-objects/address.vo';

export {
  Dimensions as DimensionsVO,
  InvalidDimensionsError,
  type DimensionUnit,
} from './value-objects/dimensions.vo';

export {
  Weight as WeightVO,
  InvalidWeightError,
  type WeightUnit,
} from './value-objects/weight.vo';

// ============================================================================
// Strata Types (merged from @patina/shared)
// ============================================================================

// Teaching workflow types (style attribution, client matching, validation)
export * from './teaching';

// Extraction types (Chrome extension product/vendor capture)
export * from './extraction';

// Vendor management types (profiles, trade accounts, reviews)
export * from './strata-vendor';

// Room scan & 3D viewer types
export * from './room-scan';

// Analytics & engagement tracking types
export * from './analytics';

// Notification, campaign, audience, and automation types
// Exported as namespace to avoid conflicts with comms.ts NotificationType/Channel/Status/Priority
export * as Notifications from './strata-notifications';

// User management types (organizations, RBAC, GDPR)
// Exported as namespace to avoid conflicts with user.ts Role/Permission/UserRole
export * as UserManagement from './user-management';
