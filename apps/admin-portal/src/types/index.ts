// ============================================================================
// RE-EXPORT SHARED TYPES FROM @patina/types
// ============================================================================
export type {
  // Catalog types
  Product,
  Variant,
  ProductImage,
  ProductCategory,
  ProductStatus,
  AvailabilityStatus,
  Dimensions,
  Weight,
  Category,
  Collection,
  CollectionType,
  Vendor,
  MediaAsset,
  ImportJob,
  SearchQuery,
  ValidationIssue,

  // API types
  ApiResponse,
  ApiError,
  PaginatedResponse,

  // Common types
  UUID,
  Timestamps,
} from '@patina/types';

// ============================================================================
// ADMIN CATALOG TYPES
// Enhanced catalog types for admin-specific features
// ============================================================================
export type {
  // Filters
  AdminProductFilters,
  ProductFilterKey,
  ProductFilterValue,

  // Bulk operations
  BulkSelection,
  BulkActionType,
  BulkActionRequest,
  BulkActionItemResult,
  BulkActionResult,

  // Statistics
  CatalogStats,
  CatalogTrends,

  // Validation
  ProductValidationIssue,
  ProductValidation,
  ValidationRule,

  // State management
  AdminCatalogState,
  CatalogViewMode,
  ActiveFilter,
  SavedFilter,

  // Product extensions
  AdminProduct,
  ProductListItem,

  // Operations
  PublishOptions,
  DuplicateOptions,
  ExportOptions,
  ExportJob,

  // Utilities
  FilterUpdater,
  PartialFilters,
  FilterResetHandler,
} from './admin-catalog';

// ============================================================================
// CATALOG SERVICE TYPES
// Service layer types for API operations
// ============================================================================
export type {
  // Service interface
  ICatalogService,

  // Request types
  CreateProductRequest,
  UpdateProductRequest,
  CreateVariantRequest,
  UpdateVariantRequest,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  DeleteCategoryOptions,
  CreateCollectionRequest,
  UpdateCollectionRequest,
  CreateVendorRequest,
  UpdateVendorRequest,
  MediaUploadMetadata,
  UpdateMediaRequest,
  CreateImportJobRequest,
  CreateSavedFilterRequest,
  UpdateSavedFilterRequest,

  // Response types
  CatalogServiceResponse,
  BulkActionStatus,
  CategoryTreeNode,

  // Filter types
  ValidationIssueFilters,
  CategoryFilters,
  CollectionFilters,
  VendorFilters,
  ImportJobFilters,

  // Error types
  CatalogErrorCode,
  CatalogServiceError,

  // Utility types
  CatalogServiceMethod,
  CatalogServiceParams,
  CatalogServiceReturn,
  UnwrapPromise,
  ExtractData,
} from './catalog-service';

// Export error type guard
export { isCatalogServiceError } from './catalog-service';

// ============================================================================
// CATALOG HOOKS TYPES
// Custom hook return types and configurations
// ============================================================================
export type {
  // Query hook results
  UseProductsResult,
  UseProductResult,
  UseProductValidationResult,
  UseCatalogStatsResult,
  UseCatalogTrendsResult,
  UseCategoriesResult,
  UseCollectionsResult,
  UseVendorsResult,
  UseValidationRulesResult,
  UseImportJobsResult,
  UseSavedFiltersResult,

  // Mutation hook results
  UseCreateProductResult,
  UseUpdateProductResult,
  UseDeleteProductResult,
  UsePublishProductResult,
  UseDuplicateProductResult,
  UseBulkActionResult,
  UseCreateVariantResult,
  UseUpdateVariantResult,
  UseUploadMediaResult,
  UseExportProductsResult,

  // Infinite query results
  UseInfiniteProductsResult,

  // Hook options
  UseProductsOptions,
  UseProductOptions,
  UseCatalogStatsOptions,
  UseMutationOptions,

  // Presenter pattern
  CatalogPresenter,
  UseCatalogPresenterOptions,
  UseCatalogPresenterResult,

  // Filter hooks
  UseFiltersResult,
  UseBulkSelectionResult,
  UseValidationIssuesResult,

  // Optimistic updates
  OptimisticUpdateContext,
  OptimisticProductUpdate,

  // Utility types
  ExtractQueryData,
  AsyncState,
  MutationActions,
  HookResult,
  UseDebouncedValueResult,
} from './catalog-hooks';

// Export query and mutation keys
export { CatalogQueryKeys, CatalogMutationKeys } from './catalog-hooks';

// ============================================================================
// CATALOG UTILITY TYPES
// Helper types and type guards
// ============================================================================
export type {
  // Narrowed types
  PublishedProduct,
  ProductWithIssues,
  ProductWith3D,
  ProductWithVariants,

  // Mapped types
  Optional,
  Required,
  Nullable,
  DeepPartial,
  KeysOfType,
  ValuesOfType,
  DeepReadonly,
  Mutable,
  NonNullableProps,
  NullablePropsOnly,

  // Filter utilities
  FilterKeysByType,
  StringFilterKeys,
  NumberFilterKeys,
  BooleanFilterKeys,
  DateFilterKeys,
  ActiveFilters,
  FilterValueType,
  FilterUpdate,

  // Bulk operation utilities
  EnhancedBulkSelection,
  BulkOperationPayload,
  TypedBulkActionRequest,

  // Validation utilities
  ValidationIssuesBySeverity,
  ValidationSummary,
  FixableValidationIssue,

  // Product utilities
  ProductSortField,
  ProductComparator,
  ProductPredicate,
  ProductTransformer,
  ProductGroupKey,
  GroupedProducts,

  // Pagination utilities
  PaginationInfo,
  CalculatePagination,
  CursorPagination,

  // Async utilities
  AsyncResult,
  LoadingState,
  AsyncOperationState,

  // Query string utilities
  SerializableFilterValue,
  SerializableFilters,
  FilterSerializer,
  FilterDeserializer,

  // Display utilities
  StatusDisplay,
  AvailabilityDisplay,
  SeverityDisplay,
  FormatCurrency,
  FormatDate,
  FormatRelativeTime,

  // Sorting utilities
  SortOrder,
  SortConfig,
  MultiSortConfig,
  CreateSorter,

  // Event utilities
  CatalogEventType,
  CatalogEvent,
  EventHandler,
  Unsubscribe,

  // Conditional types
  IfExtends,
  ArrayElement,
  ArgumentTypes,
  UnwrapReturnType,

  // Brand types
  Brand,
  ProductId,
  CategoryId,
  VendorId,
} from './catalog-utils';

// Export type guards
export {
  isAdminProduct,
  isProductListItem,
  isValidationIssue,
  isProductStatus,
  isAvailabilityStatus,
  isViewMode,
  isUUID,
  isDate,
  isNonEmptyArray,
  isPublishedProduct,
  hasValidationIssues,
  has3DModel,
  hasVariants,
  isFixableIssue,
} from './catalog-utils';

// Export utility classes
export { UniqueCollection } from './catalog-utils';

// Export ID creators
export {
  createProductId,
  createCategoryId,
  createVendorId,
} from './catalog-utils';

// ============================================================================
// ADMIN-PORTAL SPECIFIC TYPES (EXISTING)
// These types are unique to the admin portal and not in the shared package
// ============================================================================

// User Management Types (Admin-specific extensions)
export interface User {
  id: string;
  sub: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
  avatarUrl?: string;
  status: 'active' | 'pending' | 'suspended' | 'banned' | 'deleted';
  roles: Role[];
  createdAt: string;
  updatedAt: string;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: Permission[];
}

export interface Permission {
  id: string;
  code: string;
  description?: string;
  resource: string;
  action: string;
}

export interface DesignerProfile {
  userId: string;
  businessName?: string;
  website?: string;
  documents: Document[];
  status: 'draft' | 'submitted' | 'in_review' | 'approved' | 'rejected' | 'expired';
  reviewerId?: string;
  reviewedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  uploadedAt: string;
}

// Media Types (Backend/Service layer - for media service)
// Note: MediaAsset is also imported from @patina/types
// This admin-portal-specific interface has different structure
export interface MediaAssetAdmin {
  id: string;
  kind: 'image' | 'model3d';
  productId?: string;
  variantId?: string;
  role?: 'hero' | 'angle' | 'lifestyle' | 'detail' | 'ar-preview';
  rawKey: string;
  processed: boolean;
  status: 'pending' | 'processing' | 'ready' | 'failed' | 'blocked';
  width?: number;
  height?: number;
  format?: string;
  sizeBytes?: number;
  phash?: string;
  palette?: string[];
  license?: License;
  qcIssues?: QCIssue[];
  renditions?: AssetRendition[];
  threeD?: ThreeDAsset;
  createdAt: string;
  updatedAt: string;
}

export interface AssetRendition {
  id: string;
  assetId: string;
  key: string;
  width?: number;
  height?: number;
  format: string;
  sizeBytes?: number;
  purpose: 'thumb' | 'web' | 'retina' | 'preview';
  createdAt: string;
}

export interface ThreeDAsset {
  id: string;
  assetId: string;
  glbKey?: string;
  usdzKey?: string;
  triCount?: number;
  nodeCount?: number;
  materialCount?: number;
  textureCount?: number;
  widthM?: number;
  heightM?: number;
  depthM?: number;
  arReady: boolean;
  lods?: LOD[];
  qcIssues?: QCIssue[];
  snapshots?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LOD {
  lod: number;
  triCount: number;
}

export interface QCIssue {
  code: string;
  severity: 'error' | 'warn' | 'info';
  field?: string;
  message: string;
}

export interface License {
  licenseType: string;
  attribution?: string;
  expiresAt?: string;
  usageScope?: string[];
  sourceVendorId?: string;
}

// Order Types (E-commerce specific - admin portal manages orders)
export interface Order {
  id: string;
  userId: string;
  cartId?: string;
  status: 'created' | 'paid' | 'fulfilled' | 'closed' | 'refunded' | 'canceled';
  currency: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  shippingTotal: number;
  total: number;
  paymentIntentId?: string;
  chargeId?: string;
  shippingAddressId?: string;
  billingAddressId?: string;
  snapshot: any;
  items: OrderItem[];
  shipments: Shipment[];
  refunds: Refund[];
  payments: Payment[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  variantId?: string;
  name: string;
  qty: number;
  unitPrice: number;
  currency: string;
  taxLines?: any;
  discountAlloc?: number;
  meta?: any;
  createdAt: string;
}

export interface Payment {
  id: string;
  orderId: string;
  provider: string;
  amount: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled';
  paymentIntentId?: string;
  chargeId?: string;
  raw?: any;
  createdAt: string;
}

export interface Refund {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  reason?: string;
  provider: string;
  providerRefundId?: string;
  raw?: any;
  createdAt: string;
}

export interface Shipment {
  id: string;
  orderId: string;
  carrier?: string;
  trackingNumber?: string;
  status: 'pending' | 'in_transit' | 'delivered' | 'exception';
  shippedAt?: string;
  deliveredAt?: string;
  meta?: any;
  createdAt: string;
}

// Search Types (Admin search management)
export interface SearchResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    nextCursor?: string;
  };
  facets?: Record<string, FacetValue[]>;
}

export interface FacetValue {
  value: string;
  count: number;
  selected: boolean;
}

export interface SynonymSet {
  id: string;
  locale: string;
  terms: string[];
  active: boolean;
  createdBy: string;
  createdAt: string;
}

// System Health Types (Admin monitoring)
export interface HealthMetrics {
  api: ServiceHealth;
  database: ServiceHealth;
  redis: ServiceHealth;
  openSearch: ServiceHealth;
  streaming: ServiceHealth;
}

export interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'down';
  latencyP95?: number;
  errorRate?: number;
  uptime?: number;
  lastCheck: string;
}

// Audit Types (Admin audit logging)
export interface AuditLog {
  id: string;
  actorId: string;
  actorEmail?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  timestamp: string;
  ip?: string;
  userAgent?: string;
  result: 'success' | 'failure';
  meta?: any;
}

// Privacy Types (Admin GDPR compliance)
export interface PrivacyJob {
  id: string;
  userId: string;
  type: 'export' | 'delete';
  state: 'queued' | 'approved' | 'running' | 'completed' | 'failed' | 'on_hold';
  reason?: string;
  createdBy: string;
  approvedBy?: string;
  createdAt: string;
  updatedAt: string;
  resultKey?: string;
}

// Feature Flags Types (Admin feature management)
export interface FeatureFlag {
  id: string;
  key: string;
  value: any;
  env: 'dev' | 'stg' | 'prod';
  rollout?: RolloutConfig;
  createdBy: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RolloutConfig {
  percent: number;
  rules?: any[];
}
