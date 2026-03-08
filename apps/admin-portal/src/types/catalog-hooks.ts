/**
 * Catalog Hooks Types
 *
 * Type definitions for custom React hooks used in the admin catalog.
 * Defines return types, configuration options, and presenter pattern types
 * for TanStack Query hooks and custom state management hooks.
 *
 * @module catalog-hooks
 */

import type {
  UseQueryResult,
  UseMutationResult,
  UseInfiniteQueryResult,
  QueryKey,
  MutationKey,
} from '@tanstack/react-query';

import type {
  Product,
  Variant,
  Category,
  Collection,
  Vendor,
  MediaAsset,
  ImportJob,
  PaginatedResponse,
  UUID,
} from '@patina/types';

import type {
  AdminProductFilters,
  AdminProduct,
  ProductListItem,
  BulkActionRequest,
  BulkActionResult,
  BulkSelection,
  CatalogStats,
  CatalogTrends,
  ProductValidation,
  ProductValidationIssue,
  ValidationRule,
  AdminCatalogState,
  CatalogViewMode,
  ActiveFilter,
  SavedFilter,
  PublishOptions,
  DuplicateOptions,
  ExportOptions,
  ExportJob,
} from './admin-catalog';

import type {
  CreateProductRequest,
  UpdateProductRequest,
  CreateVariantRequest,
  UpdateVariantRequest,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  CreateCollectionRequest,
  UpdateCollectionRequest,
  CategoryFilters,
  CollectionFilters,
  VendorFilters,
  ValidationIssueFilters,
  BulkActionStatus,
  CatalogServiceResponse,
} from './catalog-service';

// ============================================================================
// QUERY HOOK TYPES
// ============================================================================

/**
 * Products query hook result.
 */
export type UseProductsResult = UseQueryResult<
  CatalogServiceResponse<PaginatedResponse<ProductListItem>>,
  Error
> & {
  products: ProductListItem[];
  totalProducts: number;
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

/**
 * Single product query hook result.
 */
export type UseProductResult = UseQueryResult<CatalogServiceResponse<AdminProduct>, Error> & {
  product: AdminProduct | undefined;
};

/**
 * Product validation query hook result.
 */
export type UseProductValidationResult = UseQueryResult<
  CatalogServiceResponse<ProductValidation>,
  Error
> & {
  validation: ProductValidation | undefined;
  isValid: boolean;
  canPublish: boolean;
  errorCount: number;
  warningCount: number;
};

/**
 * Catalog statistics query hook result.
 */
export type UseCatalogStatsResult = UseQueryResult<CatalogServiceResponse<CatalogStats>, Error> & {
  stats: CatalogStats | undefined;
};

/**
 * Catalog trends query hook result.
 */
export type UseCatalogTrendsResult = UseQueryResult<CatalogServiceResponse<CatalogTrends>, Error> & {
  trends: CatalogTrends | undefined;
};

/**
 * Categories query hook result.
 */
export type UseCategoriesResult = UseQueryResult<CatalogServiceResponse<Category[]>, Error> & {
  categories: Category[];
  categoryTree: CategoryTreeNode[];
};

/**
 * Collections query hook result.
 */
export type UseCollectionsResult = UseQueryResult<
  CatalogServiceResponse<PaginatedResponse<Collection>>,
  Error
> & {
  collections: Collection[];
  totalCollections: number;
};

/**
 * Vendors query hook result.
 */
export type UseVendorsResult = UseQueryResult<
  CatalogServiceResponse<PaginatedResponse<Vendor>>,
  Error
> & {
  vendors: Vendor[];
  totalVendors: number;
};

/**
 * Validation rules query hook result.
 */
export type UseValidationRulesResult = UseQueryResult<
  CatalogServiceResponse<ValidationRule[]>,
  Error
> & {
  rules: ValidationRule[];
};

/**
 * Import jobs query hook result.
 */
export type UseImportJobsResult = UseQueryResult<
  CatalogServiceResponse<PaginatedResponse<ImportJob>>,
  Error
> & {
  jobs: ImportJob[];
  totalJobs: number;
};

/**
 * Saved filters query hook result.
 */
export type UseSavedFiltersResult = UseQueryResult<CatalogServiceResponse<SavedFilter[]>, Error> & {
  filters: SavedFilter[];
};

// ============================================================================
// MUTATION HOOK TYPES
// ============================================================================

/**
 * Create product mutation hook result.
 */
export type UseCreateProductResult = UseMutationResult<
  CatalogServiceResponse<AdminProduct>,
  Error,
  CreateProductRequest,
  unknown
>;

/**
 * Update product mutation hook result.
 */
export type UseUpdateProductResult = UseMutationResult<
  CatalogServiceResponse<AdminProduct>,
  Error,
  { productId: UUID; data: UpdateProductRequest },
  unknown
>;

/**
 * Delete product mutation hook result.
 */
export type UseDeleteProductResult = UseMutationResult<
  CatalogServiceResponse<void>,
  Error,
  UUID,
  unknown
>;

/**
 * Publish product mutation hook result.
 */
export type UsePublishProductResult = UseMutationResult<
  CatalogServiceResponse<void>,
  Error,
  { productId: UUID; options?: PublishOptions },
  unknown
>;

/**
 * Duplicate product mutation hook result.
 */
export type UseDuplicateProductResult = UseMutationResult<
  CatalogServiceResponse<AdminProduct>,
  Error,
  { productId: UUID; options?: DuplicateOptions },
  unknown
>;

/**
 * Bulk action mutation hook result.
 */
export type UseBulkActionResult = UseMutationResult<
  CatalogServiceResponse<BulkActionResult>,
  Error,
  BulkActionRequest,
  unknown
>;

/**
 * Create variant mutation hook result.
 */
export type UseCreateVariantResult = UseMutationResult<
  CatalogServiceResponse<Variant>,
  Error,
  { productId: UUID; data: CreateVariantRequest },
  unknown
>;

/**
 * Update variant mutation hook result.
 */
export type UseUpdateVariantResult = UseMutationResult<
  CatalogServiceResponse<Variant>,
  Error,
  { variantId: UUID; data: UpdateVariantRequest },
  unknown
>;

/**
 * Upload media mutation hook result.
 */
export type UseUploadMediaResult = UseMutationResult<
  CatalogServiceResponse<MediaAsset>,
  Error,
  { productId: UUID; file: File; metadata?: any },
  unknown
>;

/**
 * Export products mutation hook result.
 */
export type UseExportProductsResult = UseMutationResult<
  CatalogServiceResponse<ExportJob>,
  Error,
  ExportOptions,
  unknown
>;

// ============================================================================
// INFINITE QUERY HOOK TYPES
// ============================================================================

/**
 * Infinite products query hook result (for virtualization).
 */
export type UseInfiniteProductsResult = UseInfiniteQueryResult<
  CatalogServiceResponse<PaginatedResponse<ProductListItem>>,
  Error
> & {
  products: ProductListItem[];
  totalProducts: number;
  loadMore: () => void;
  hasMore: boolean;
};

// ============================================================================
// CUSTOM HOOK OPTIONS
// ============================================================================

/**
 * Options for useProducts hook.
 */
export interface UseProductsOptions {
  filters?: AdminProductFilters;
  enabled?: boolean;
  refetchInterval?: number | false;
  keepPreviousData?: boolean;
  onSuccess?: (data: CatalogServiceResponse<PaginatedResponse<ProductListItem>>) => void;
  onError?: (error: Error) => void;
}

/**
 * Options for useProduct hook.
 */
export interface UseProductOptions {
  productId: UUID;
  enabled?: boolean;
  refetchOnMount?: boolean;
  onSuccess?: (data: CatalogServiceResponse<AdminProduct>) => void;
  onError?: (error: Error) => void;
}

/**
 * Options for useCatalogStats hook.
 */
export interface UseCatalogStatsOptions {
  filters?: AdminProductFilters;
  enabled?: boolean;
  refetchInterval?: number;
  cacheTime?: number;
}

/**
 * Options for mutation hooks.
 */
export interface UseMutationOptions<TData, TError, TVariables> {
  onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>;
  onError?: (error: TError, variables: TVariables) => void;
  onSettled?: (data: TData | undefined, error: TError | null, variables: TVariables) => void;
  optimisticUpdate?: boolean;
}

// ============================================================================
// PRESENTER PATTERN TYPES
// ============================================================================

/**
 * Catalog presenter interface.
 * Encapsulates catalog state management and business logic.
 */
export interface CatalogPresenter {
  // State
  state: AdminCatalogState;

  // Queries
  products: ProductListItem[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  totalProducts: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;

  // Actions - Filtering
  setFilters: (filters: Partial<AdminProductFilters>) => void;
  updateFilter: <K extends keyof AdminProductFilters>(key: K, value: AdminProductFilters[K]) => void;
  resetFilters: (keys?: Array<keyof AdminProductFilters>) => void;
  clearAllFilters: () => void;
  saveCurrentFilter: (name: string, description?: string) => Promise<void>;
  loadSavedFilter: (filterId: UUID) => void;

  // Actions - View
  setViewMode: (mode: CatalogViewMode) => void;
  setGridColumns: (columns: 2 | 3 | 4 | 5) => void;
  toggleFilterPanel: () => void;

  // Actions - Search
  setSearchQuery: (query: string) => void;
  clearSearch: () => void;

  // Actions - Pagination
  goToPage: (page: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  setPageSize: (size: number) => void;

  // Actions - Sorting
  setSorting: (sortBy: string, sortOrder?: 'asc' | 'desc') => void;
  toggleSortOrder: () => void;

  // Actions - Bulk operations
  selectProduct: (productId: UUID) => void;
  selectProducts: (productIds: UUID[]) => void;
  deselectProduct: (productId: UUID) => void;
  deselectProducts: (productIds: UUID[]) => void;
  selectAllProducts: () => void;
  clearSelection: () => void;
  isProductSelected: (productId: UUID) => boolean;
  getSelectionCount: () => number;
  executeBulkAction: (action: BulkActionRequest) => Promise<BulkActionResult>;

  // Actions - Product operations
  createProduct: (data: CreateProductRequest) => Promise<AdminProduct>;
  updateProduct: (productId: UUID, data: UpdateProductRequest) => Promise<AdminProduct>;
  deleteProduct: (productId: UUID) => Promise<void>;
  duplicateProduct: (productId: UUID, options?: DuplicateOptions) => Promise<AdminProduct>;
  publishProduct: (productId: UUID, options?: PublishOptions) => Promise<void>;
  unpublishProduct: (productId: UUID) => Promise<void>;

  // Actions - Export
  exportProducts: (options: ExportOptions) => Promise<ExportJob>;

  // Computed
  activeFilters: ActiveFilter[];
  hasActiveFilters: boolean;
  filterCount: number;
  isFiltering: boolean;
  isBulkMode: boolean;
}

/**
 * Options for useCatalogPresenter hook.
 */
export interface UseCatalogPresenterOptions {
  initialFilters?: AdminProductFilters;
  initialViewMode?: CatalogViewMode;
  enableAutoRefresh?: boolean;
  autoRefreshInterval?: number;
  enableBulkOperations?: boolean;
  onFilterChange?: (filters: AdminProductFilters) => void;
  onProductsLoaded?: (products: ProductListItem[]) => void;
  onError?: (error: Error) => void;
}

/**
 * Return type for useCatalogPresenter hook.
 */
export type UseCatalogPresenterResult = CatalogPresenter;

// ============================================================================
// FILTER HOOK TYPES
// ============================================================================

/**
 * Filter manager hook result.
 */
export interface UseFiltersResult {
  filters: AdminProductFilters;
  setFilters: (filters: Partial<AdminProductFilters>) => void;
  updateFilter: <K extends keyof AdminProductFilters>(key: K, value: AdminProductFilters[K]) => void;
  resetFilters: () => void;
  clearFilter: (key: keyof AdminProductFilters) => void;
  activeFilters: ActiveFilter[];
  hasActiveFilters: boolean;
  filterCount: number;
  toQueryString: () => string;
  fromQueryString: (queryString: string) => void;
}

/**
 * Bulk selection manager hook result.
 */
export interface UseBulkSelectionResult {
  selection: BulkSelection;
  selectProduct: (productId: UUID) => void;
  selectProducts: (productIds: UUID[]) => void;
  deselectProduct: (productId: UUID) => void;
  deselectProducts: (productIds: UUID[]) => void;
  selectAll: () => void;
  clearSelection: () => void;
  isSelected: (productId: UUID) => boolean;
  toggleProduct: (productId: UUID) => void;
  selectionCount: number;
  hasSelection: boolean;
  isAllSelected: boolean;
}

/**
 * Validation issue manager hook result.
 */
export interface UseValidationIssuesResult {
  issues: ProductValidationIssue[];
  isLoading: boolean;
  error: Error | null;
  filters: ValidationIssueFilters;
  setFilters: (filters: Partial<ValidationIssueFilters>) => void;
  resolveIssue: (issueId: UUID, resolution: string) => Promise<void>;
  autoFixIssue: (issueId: UUID) => Promise<void>;
  groupedByProduct: Map<UUID, ProductValidationIssue[]>;
  groupedBySeverity: Map<'error' | 'warning' | 'info', ProductValidationIssue[]>;
}

// ============================================================================
// OPTIMISTIC UPDATE TYPES
// ============================================================================

/**
 * Optimistic update context for mutations.
 */
export interface OptimisticUpdateContext<T = unknown> {
  previousData?: T;
  rollback: () => void;
}

/**
 * Optimistic product update.
 */
export interface OptimisticProductUpdate {
  productId: UUID;
  updates: Partial<AdminProduct>;
  timestamp: Date;
}

// ============================================================================
// CACHE MANAGEMENT TYPES
// ============================================================================

/**
 * Query cache keys for catalog operations.
 */
export const CatalogQueryKeys = {
  all: ['catalog'] as const,
  products: () => [...CatalogQueryKeys.all, 'products'] as const,
  productsList: (filters?: AdminProductFilters) =>
    [...CatalogQueryKeys.products(), 'list', filters] as const,
  product: (id: UUID) => [...CatalogQueryKeys.products(), 'detail', id] as const,
  productValidation: (id: UUID) => [...CatalogQueryKeys.products(), 'validation', id] as const,
  stats: (filters?: AdminProductFilters) => [...CatalogQueryKeys.all, 'stats', filters] as const,
  trends: (period: string, days?: number) => [...CatalogQueryKeys.all, 'trends', period, days] as const,
  categories: () => [...CatalogQueryKeys.all, 'categories'] as const,
  categoryTree: () => [...CatalogQueryKeys.categories(), 'tree'] as const,
  collections: (filters?: CollectionFilters) => [...CatalogQueryKeys.all, 'collections', filters] as const,
  vendors: (filters?: VendorFilters) => [...CatalogQueryKeys.all, 'vendors', filters] as const,
  validationRules: () => [...CatalogQueryKeys.all, 'validation-rules'] as const,
  validationIssues: (filters?: ValidationIssueFilters) =>
    [...CatalogQueryKeys.all, 'validation-issues', filters] as const,
  importJobs: () => [...CatalogQueryKeys.all, 'import-jobs'] as const,
  savedFilters: () => [...CatalogQueryKeys.all, 'saved-filters'] as const,
} as const;

/**
 * Mutation cache keys for catalog operations.
 */
export const CatalogMutationKeys = {
  createProduct: ['catalog', 'product', 'create'] as const,
  updateProduct: ['catalog', 'product', 'update'] as const,
  deleteProduct: ['catalog', 'product', 'delete'] as const,
  publishProduct: ['catalog', 'product', 'publish'] as const,
  duplicateProduct: ['catalog', 'product', 'duplicate'] as const,
  bulkAction: ['catalog', 'bulk-action'] as const,
  uploadMedia: ['catalog', 'media', 'upload'] as const,
  exportProducts: ['catalog', 'export'] as const,
} as const;

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Extract query data type from a query key.
 */
export type ExtractQueryData<T extends QueryKey> = T extends readonly [
  string,
  string,
  'list',
  ...any[]
]
  ? PaginatedResponse<ProductListItem>
  : T extends readonly [string, string, 'detail', UUID]
  ? AdminProduct
  : T extends readonly [string, 'stats', ...any[]]
  ? CatalogStats
  : unknown;

/**
 * Hook state for async operations.
 */
export interface AsyncState<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isSuccess: boolean;
}

/**
 * Hook actions for mutations.
 */
export interface MutationActions<TData, TVariables> {
  mutate: (variables: TVariables) => void;
  mutateAsync: (variables: TVariables) => Promise<TData>;
  reset: () => void;
}

/**
 * Combined hook result with state and actions.
 */
export type HookResult<TData, TVariables = void> = AsyncState<TData> & MutationActions<TData, TVariables>;

/**
 * Category tree node (for hierarchical display).
 */
export interface CategoryTreeNode extends Category {
  children: CategoryTreeNode[];
  productCount: number;
  depth: number;
}

/**
 * Debounced value hook result.
 */
export interface UseDebouncedValueResult<T> {
  debouncedValue: T;
  isDebouncing: boolean;
  cancel: () => void;
}
