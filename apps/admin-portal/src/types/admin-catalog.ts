/**
 * Admin Catalog Types
 *
 * Admin-specific extensions and types for catalog management.
 * Extends base types from @patina/types with admin-only features like
 * validation issues, bulk operations, and enhanced filtering.
 *
 * @module admin-catalog
 */

import type {
  Product,
  ProductStatus,
  AvailabilityStatus,
  SearchQuery,
  ValidationIssue as BaseValidationIssue,
  UUID,
  Timestamps,
} from '@patina/types';

// ============================================================================
// ADMIN PRODUCT FILTERS
// ============================================================================

/**
 * Admin-specific product filters extending base SearchQuery.
 * Includes additional filters for validation state, publishing status,
 * and advanced feature flags (3D, AR support).
 */
export interface AdminProductFilters extends Omit<SearchQuery, 'sort'> {
  // Base search
  q?: string;

  // Status filters
  status?: ProductStatus | ProductStatus[];
  isPublished?: boolean;
  publishedAfter?: Date;
  publishedBefore?: Date;

  // Validation filters
  hasValidationIssues?: boolean;
  validationSeverity?: 'error' | 'warning' | 'info';

  // Feature flags
  hasVariants?: boolean;
  has3D?: boolean;
  arSupported?: boolean;
  customizable?: boolean;

  // Date range filters
  createdAfter?: Date;
  createdBefore?: Date;
  updatedAfter?: Date;
  updatedBefore?: Date;

  // Catalog metadata
  categoryId?: string | string[];
  brand?: string | string[];
  vendorId?: string | string[];
  tags?: string[];

  // Pricing
  priceMin?: number;
  priceMax?: number;
  onSale?: boolean;

  // Inventory
  availability?: AvailabilityStatus[];
  inStock?: boolean;
  lowStock?: boolean;
  lowStockThreshold?: number;

  // Media
  hasImages?: boolean;
  imageCount?: number;
  imageLicense?: string;

  // Sorting
  sortBy?: 'name' | 'price' | 'createdAt' | 'updatedAt' | 'publishedAt' | 'popularity' | 'status';
  sortOrder?: 'asc' | 'desc';

  // Pagination
  page?: number;
  pageSize?: number;
  cursor?: string;
}

/**
 * Narrowed filter type for specific operations.
 * Useful for type-safe filter operations.
 */
export type ProductFilterKey = keyof AdminProductFilters;

/**
 * Type guard for filter values.
 */
export type ProductFilterValue = AdminProductFilters[ProductFilterKey];

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Bulk selection state management.
 * Supports both explicit selection and "select all with exclusions" pattern.
 */
export interface BulkSelection {
  /** Explicitly selected product IDs */
  selectedIds: Set<string>;

  /** True if "select all" is active */
  isAllSelected: boolean;

  /** IDs to exclude when isAllSelected is true */
  excludedIds: Set<string>;

  /** Total count of selected items (computed) */
  totalSelected?: number;
}

/**
 * Actions that can be performed on multiple products.
 */
export type BulkActionType =
  | 'publish'
  | 'unpublish'
  | 'delete'
  | 'update_status'
  | 'update_category'
  | 'update_vendor'
  | 'add_tags'
  | 'remove_tags'
  | 'update_pricing'
  | 'archive'
  | 'duplicate'
  | 'export';

/**
 * Bulk action request payload.
 */
export interface BulkActionRequest {
  action: BulkActionType;
  selection: BulkSelection;
  filters?: AdminProductFilters;
  payload?: Record<string, unknown>;
  dryRun?: boolean;
}

/**
 * Individual item result from a bulk operation.
 */
export interface BulkActionItemResult {
  id: string;
  success: boolean;
  error?: string;
  errorCode?: string;
  warnings?: string[];
}

/**
 * Complete result of a bulk operation.
 */
export interface BulkActionResult {
  /** Successfully processed items */
  success: BulkActionItemResult[];

  /** Failed items with error details */
  failed: BulkActionItemResult[];

  /** Items skipped (e.g., already in target state) */
  skipped: BulkActionItemResult[];

  /** Total items attempted */
  total: number;

  /** Execution time in milliseconds */
  duration?: number;

  /** Detailed metadata about the operation */
  metadata?: {
    action: BulkActionType;
    timestamp: Date;
    affectedFields?: string[];
    validationErrors?: number;
  };
}

// ============================================================================
// CATALOG STATISTICS
// ============================================================================

/**
 * Comprehensive catalog statistics for admin dashboard.
 */
export interface CatalogStats {
  /** Total number of products across all statuses */
  totalProducts: number;

  /** Breakdown by product status */
  byStatus: Record<ProductStatus, number>;

  /** Breakdown by availability status */
  byAvailability: Record<AvailabilityStatus, number>;

  /** Products with unresolved validation issues */
  withValidationIssues: number;

  /** Breakdown by validation severity */
  validationBreakdown: {
    errors: number;
    warnings: number;
    info: number;
  };

  /** Products with 3D models */
  with3D: number;

  /** Products with AR support */
  withAR: number;

  /** Products with customization options */
  customizable: number;

  /** Total number of variants across all products */
  totalVariants: number;

  /** Average number of variants per product */
  avgVariantsPerProduct: number;

  /** Pricing statistics */
  pricing: {
    average: number;
    median: number;
    min: number;
    max: number;
    currency: string;
  };

  /** Media statistics */
  media: {
    totalImages: number;
    avgImagesPerProduct: number;
    totalVideos: number;
    total3DModels: number;
  };

  /** Category distribution (top 10) */
  topCategories: Array<{
    categoryId: string;
    categoryName: string;
    count: number;
  }>;

  /** Brand distribution (top 10) */
  topBrands: Array<{
    brand: string;
    count: number;
  }>;

  /** Recently updated products count (last 7 days) */
  recentlyUpdated: number;

  /** Recently published products count (last 7 days) */
  recentlyPublished: number;

  /** Last statistics calculation timestamp */
  calculatedAt: Date;
}

/**
 * Time-series data for catalog trends.
 */
export interface CatalogTrends {
  period: 'day' | 'week' | 'month' | 'year';
  dataPoints: Array<{
    timestamp: Date;
    productsAdded: number;
    productsPublished: number;
    productsUpdated: number;
    productsDeleted: number;
  }>;
}

// ============================================================================
// VALIDATION TYPES
// ============================================================================

/**
 * Admin-specific product validation issue.
 * Extends base ValidationIssue with admin UI features.
 */
export interface ProductValidationIssue extends BaseValidationIssue {
  /** Unique identifier for the issue */
  id: string;

  /** Associated product ID */
  productId: string;

  /** Associated variant ID (if applicable) */
  variantId?: string;

  /** Issue code for categorization */
  code: string;

  /** Field that has the issue */
  field?: string;

  /** Severity level */
  severity: 'error' | 'warning' | 'info';

  /** Human-readable message */
  message: string;

  /** Current invalid value */
  currentValue?: unknown;

  /** Expected value or format */
  expectedValue?: unknown;

  /** Suggested fix */
  suggestion?: string;

  /** Auto-fixable flag */
  autoFixable: boolean;

  /** Resolution status */
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolution?: string;

  /** Rule that generated this issue */
  ruleId?: string;

  /** Additional context */
  metadata?: Record<string, unknown>;
}

/**
 * Validation summary for a product.
 */
export interface ProductValidation {
  productId: string;
  isValid: boolean;
  issues: ProductValidationIssue[];
  issueCount: {
    error: number;
    warning: number;
    info: number;
    total: number;
  };
  lastChecked: Date;
  canPublish: boolean;
  blockingIssues: ProductValidationIssue[];
}

/**
 * Validation rule definition.
 */
export interface ValidationRule {
  id: string;
  code: string;
  name: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  category: 'required_field' | 'format' | 'business_rule' | 'data_quality' | 'seo' | 'compliance';
  enabled: boolean;
  autoFix?: boolean;
  appliesTo: 'product' | 'variant' | 'both';
  conditions?: Record<string, unknown>;
}

// ============================================================================
// ADMIN CATALOG STATE
// ============================================================================

/**
 * Admin catalog view modes.
 */
export type CatalogViewMode = 'grid' | 'list' | 'table';

/**
 * Complete admin catalog UI state.
 * Manages filters, view preferences, and bulk operations.
 */
export interface AdminCatalogState {
  // View configuration
  viewMode: CatalogViewMode;
  gridColumns: 2 | 3 | 4 | 5;
  showThumbnails: boolean;

  // Search and filtering
  searchQuery: string;
  filters: AdminProductFilters;
  activeFilters: ActiveFilter[];
  savedFilters: SavedFilter[];

  // Sorting and pagination
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  totalResults: number;

  // Bulk operations
  bulkSelection: BulkSelection;
  isBulkMode: boolean;
  currentBulkAction?: BulkActionType;

  // UI state
  isFilterPanelOpen: boolean;
  isBulkActionModalOpen: boolean;
  isExporting: boolean;
  selectedProductId?: string;

  // Feature flags
  enableAdvancedFilters: boolean;
  enableBulkOperations: boolean;
  enableInlineEditing: boolean;

  // Performance
  lastFetchTimestamp?: Date;
  isFetching: boolean;
  fetchError?: string;
}

/**
 * Active filter with display metadata.
 */
export interface ActiveFilter {
  key: ProductFilterKey;
  label: string;
  value: ProductFilterValue;
  displayValue: string;
  removable: boolean;
}

/**
 * Saved filter preset.
 */
export interface SavedFilter {
  id: string;
  name: string;
  description?: string;
  filters: AdminProductFilters;
  isGlobal: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  usageCount?: number;
}

// ============================================================================
// ADMIN PRODUCT EXTENSIONS
// ============================================================================

/**
 * Product with admin-specific metadata.
 */
export interface AdminProduct extends Product {
  // Validation
  validation?: ProductValidation;
  hasValidationIssues: boolean;

  // Audit
  createdBy?: string;
  createdByEmail?: string;
  updatedBy?: string;
  updatedByEmail?: string;
  publishedBy?: string;

  // Metrics
  viewCount?: number;
  wishlistCount?: number;
  cartAddCount?: number;
  purchaseCount?: number;
  revenue?: number;
  conversionRate?: number;

  // Internal metadata
  internalNotes?: string;
  flags?: string[];
  priority?: 'low' | 'medium' | 'high' | 'critical';

  // SEO score
  seoScore?: number;
  seoIssues?: string[];
}

/**
 * Product list item for table/list views.
 */
export interface ProductListItem {
  id: string;
  name: string;
  brand: string;
  category: string;
  categoryName?: string;
  status: ProductStatus;
  price: number;
  currency: string;
  coverImage?: string;
  hasValidationIssues: boolean;
  validationErrorCount: number;
  variantCount: number;
  has3D: boolean;
  arSupported: boolean;
  publishedAt?: Date;
  updatedAt: Date;
  createdAt: Date;
}

// ============================================================================
// CATALOG OPERATIONS
// ============================================================================

/**
 * Product publishing options.
 */
export interface PublishOptions {
  validateBeforePublish: boolean;
  publishVariants: boolean;
  notifySubscribers: boolean;
  scheduledAt?: Date;
  expiresAt?: Date;
}

/**
 * Product duplication options.
 */
export interface DuplicateOptions {
  includeVariants: boolean;
  includeImages: boolean;
  includeCustomizations: boolean;
  namePrefix?: string;
  status?: ProductStatus;
}

/**
 * Product export options.
 */
export interface ExportOptions {
  format: 'csv' | 'json' | 'xlsx' | 'xml';
  includeVariants: boolean;
  includeImages: boolean;
  includeCustomizations: boolean;
  fields?: string[];
  filters?: AdminProductFilters;
}

/**
 * Export job status.
 */
export interface ExportJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  format: ExportOptions['format'];
  totalProducts: number;
  processedProducts: number;
  downloadUrl?: string;
  expiresAt?: Date;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

// ============================================================================
// TYPE UTILITIES
// ============================================================================

/**
 * Extract keys from AdminProductFilters that are arrays.
 */
export type ArrayFilterKeys = {
  [K in keyof AdminProductFilters]: AdminProductFilters[K] extends Array<any> ? K : never;
}[keyof AdminProductFilters];

/**
 * Extract keys from AdminProductFilters that are dates.
 */
export type DateFilterKeys = {
  [K in keyof AdminProductFilters]: AdminProductFilters[K] extends Date | undefined ? K : never;
}[keyof AdminProductFilters];

/**
 * Extract keys from AdminProductFilters that are booleans.
 */
export type BooleanFilterKeys = {
  [K in keyof AdminProductFilters]: AdminProductFilters[K] extends boolean | undefined ? K : never;
}[keyof AdminProductFilters];

/**
 * Type-safe filter update function signature.
 */
export type FilterUpdater = <K extends ProductFilterKey>(
  key: K,
  value: AdminProductFilters[K]
) => void;

/**
 * Partial filters for incremental updates.
 */
export type PartialFilters = Partial<AdminProductFilters>;

/**
 * Filter reset handler signature.
 */
export type FilterResetHandler = (keys?: ProductFilterKey[]) => void;
