/**
 * Catalog Service Types
 *
 * Type definitions for the catalog service layer.
 * Defines method signatures, request/response types, and error handling
 * for all catalog-related API operations in the admin portal.
 *
 * @module catalog-service
 */

import type {
  Product,
  Variant,
  Category,
  Collection,
  Vendor,
  MediaAsset,
  ImportJob,
  UUID,
  PaginatedResponse,
  ApiResponse,
} from '@patina/types';

import type {
  AdminProductFilters,
  AdminProduct,
  ProductListItem,
  BulkActionRequest,
  BulkActionResult,
  CatalogStats,
  CatalogTrends,
  ProductValidation,
  ProductValidationIssue,
  ValidationRule,
  PublishOptions,
  DuplicateOptions,
  ExportOptions,
  ExportJob,
  SavedFilter,
} from './admin-catalog';

// ============================================================================
// CATALOG SERVICE INTERFACE
// ============================================================================

/**
 * Complete catalog service interface.
 * Defines all available catalog operations for the admin portal.
 */
export interface ICatalogService {
  // Product operations
  getProducts(params?: AdminProductFilters): Promise<CatalogServiceResponse<PaginatedResponse<ProductListItem>>>;
  getProduct(productId: UUID): Promise<CatalogServiceResponse<AdminProduct>>;
  createProduct(data: CreateProductRequest): Promise<CatalogServiceResponse<AdminProduct>>;
  updateProduct(productId: UUID, data: UpdateProductRequest): Promise<CatalogServiceResponse<AdminProduct>>;
  deleteProduct(productId: UUID): Promise<CatalogServiceResponse<void>>;
  duplicateProduct(productId: UUID, options?: DuplicateOptions): Promise<CatalogServiceResponse<AdminProduct>>;

  // Publishing operations
  publishProduct(productId: UUID, options?: PublishOptions): Promise<CatalogServiceResponse<void>>;
  unpublishProduct(productId: UUID): Promise<CatalogServiceResponse<void>>;
  schedulePublish(productId: UUID, scheduledAt: Date): Promise<CatalogServiceResponse<void>>;

  // Bulk operations
  bulkAction(request: BulkActionRequest): Promise<CatalogServiceResponse<BulkActionResult>>;
  getBulkActionStatus(jobId: UUID): Promise<CatalogServiceResponse<BulkActionStatus>>;

  // Validation operations
  validateProduct(productId: UUID): Promise<CatalogServiceResponse<ProductValidation>>;
  getValidationIssues(filters?: ValidationIssueFilters): Promise<CatalogServiceResponse<PaginatedResponse<ProductValidationIssue>>>;
  resolveValidationIssue(issueId: UUID, resolution: string): Promise<CatalogServiceResponse<void>>;
  autoFixValidationIssue(issueId: UUID): Promise<CatalogServiceResponse<ProductValidationIssue>>;
  getValidationRules(): Promise<CatalogServiceResponse<ValidationRule[]>>;

  // Statistics operations
  getCatalogStats(filters?: AdminProductFilters): Promise<CatalogServiceResponse<CatalogStats>>;
  getCatalogTrends(period: 'day' | 'week' | 'month' | 'year', days?: number): Promise<CatalogServiceResponse<CatalogTrends>>;

  // Variant operations
  getVariants(productId: UUID): Promise<CatalogServiceResponse<Variant[]>>;
  createVariant(productId: UUID, data: CreateVariantRequest): Promise<CatalogServiceResponse<Variant>>;
  updateVariant(variantId: UUID, data: UpdateVariantRequest): Promise<CatalogServiceResponse<Variant>>;
  deleteVariant(variantId: UUID): Promise<CatalogServiceResponse<void>>;

  // Category operations
  getCategories(filters?: CategoryFilters): Promise<CatalogServiceResponse<Category[]>>;
  getCategoryTree(): Promise<CatalogServiceResponse<CategoryTreeNode[]>>;
  getCategory(categoryId: UUID): Promise<CatalogServiceResponse<Category>>;
  createCategory(data: CreateCategoryRequest): Promise<CatalogServiceResponse<Category>>;
  updateCategory(categoryId: UUID, data: UpdateCategoryRequest): Promise<CatalogServiceResponse<Category>>;
  deleteCategory(categoryId: UUID, options?: DeleteCategoryOptions): Promise<CatalogServiceResponse<void>>;
  moveCategory(categoryId: UUID, newParentId: UUID | null): Promise<CatalogServiceResponse<Category>>;
  reorderCategories(categoryIds: UUID[]): Promise<CatalogServiceResponse<void>>;

  // Collection operations
  getCollections(filters?: CollectionFilters): Promise<CatalogServiceResponse<PaginatedResponse<Collection>>>;
  getCollection(collectionId: UUID): Promise<CatalogServiceResponse<Collection>>;
  createCollection(data: CreateCollectionRequest): Promise<CatalogServiceResponse<Collection>>;
  updateCollection(collectionId: UUID, data: UpdateCollectionRequest): Promise<CatalogServiceResponse<Collection>>;
  deleteCollection(collectionId: UUID): Promise<CatalogServiceResponse<void>>;
  publishCollection(collectionId: UUID): Promise<CatalogServiceResponse<void>>;
  scheduleCollection(collectionId: UUID, publishDate: Date): Promise<CatalogServiceResponse<void>>;
  evaluateRuleCollection(collectionId: UUID): Promise<CatalogServiceResponse<{ productIds: UUID[]; count: number }>>;
  addProductToCollection(collectionId: UUID, productId: UUID): Promise<CatalogServiceResponse<void>>;
  removeProductFromCollection(collectionId: UUID, productId: UUID): Promise<CatalogServiceResponse<void>>;
  reorderCollectionProducts(collectionId: UUID, productIds: UUID[]): Promise<CatalogServiceResponse<void>>;

  // Vendor operations
  getVendors(filters?: VendorFilters): Promise<CatalogServiceResponse<PaginatedResponse<Vendor>>>;
  getVendor(vendorId: UUID): Promise<CatalogServiceResponse<Vendor>>;
  createVendor(data: CreateVendorRequest): Promise<CatalogServiceResponse<Vendor>>;
  updateVendor(vendorId: UUID, data: UpdateVendorRequest): Promise<CatalogServiceResponse<Vendor>>;
  deleteVendor(vendorId: UUID): Promise<CatalogServiceResponse<void>>;

  // Media operations
  getProductMedia(productId: UUID): Promise<CatalogServiceResponse<MediaAsset[]>>;
  uploadMedia(productId: UUID, file: File, metadata?: MediaUploadMetadata): Promise<CatalogServiceResponse<MediaAsset>>;
  updateMedia(mediaId: UUID, data: UpdateMediaRequest): Promise<CatalogServiceResponse<MediaAsset>>;
  deleteMedia(mediaId: UUID): Promise<CatalogServiceResponse<void>>;
  reorderMedia(productId: UUID, mediaIds: UUID[]): Promise<CatalogServiceResponse<void>>;

  // Import operations
  getImportJobs(filters?: ImportJobFilters): Promise<CatalogServiceResponse<PaginatedResponse<ImportJob>>>;
  getImportJob(jobId: UUID): Promise<CatalogServiceResponse<ImportJob>>;
  createImportJob(data: CreateImportJobRequest): Promise<CatalogServiceResponse<ImportJob>>;
  retryImportJob(jobId: UUID): Promise<CatalogServiceResponse<ImportJob>>;
  cancelImportJob(jobId: UUID): Promise<CatalogServiceResponse<void>>;

  // Export operations
  exportProducts(options: ExportOptions): Promise<CatalogServiceResponse<ExportJob>>;
  getExportJob(jobId: UUID): Promise<CatalogServiceResponse<ExportJob>>;
  downloadExport(jobId: UUID): Promise<Blob>;

  // Filter operations
  getSavedFilters(): Promise<CatalogServiceResponse<SavedFilter[]>>;
  saveFilter(data: CreateSavedFilterRequest): Promise<CatalogServiceResponse<SavedFilter>>;
  updateFilter(filterId: UUID, data: UpdateSavedFilterRequest): Promise<CatalogServiceResponse<SavedFilter>>;
  deleteFilter(filterId: UUID): Promise<CatalogServiceResponse<void>>;
}

// ============================================================================
// REQUEST TYPES
// ============================================================================

/**
 * Create product request payload.
 */
export interface CreateProductRequest {
  name: string;
  brand: string;
  category: string;
  categoryId?: UUID;
  shortDescription: string;
  longDescription?: string;
  price: number;
  currency?: string;
  status?: 'draft' | 'in_review';
  manufacturerId?: UUID;
  materials?: string[];
  colors?: string[];
  styleTags?: string[];
  dimensions?: {
    width: number;
    height: number;
    depth: number;
    unit: 'cm' | 'inch';
  };
  weight?: {
    value: number;
    unit: 'kg' | 'lb';
  };
  customizable?: boolean;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string[];
  tags?: string[];
}

/**
 * Update product request payload.
 * Allows updating all product fields including published and deprecated states.
 */
export interface UpdateProductRequest extends Omit<Partial<CreateProductRequest>, 'status'> {
  // Allow updating to any product status, including published and deprecated
  status?: 'draft' | 'in_review' | 'published' | 'deprecated';
  msrp?: number;
  salePrice?: number;
  salePriceStart?: Date;
  salePriceEnd?: Date;
  has3D?: boolean;
  arSupported?: boolean;
  coverImage?: string;
  publishedAt?: Date;
  internalNotes?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Create variant request payload.
 */
export interface CreateVariantRequest {
  sku: string;
  barcode?: string;
  name?: string;
  options: Record<string, string>;
  price?: number;
  salePrice?: number;
  availabilityStatus: 'in_stock' | 'out_of_stock' | 'preorder' | 'discontinued' | 'backorder';
  quantity?: number;
  leadTimeDays?: number;
  dimensions?: {
    width: number;
    height: number;
    depth: number;
    unit: 'cm' | 'inch';
  };
  weight?: {
    value: number;
    unit: 'kg' | 'lb';
  };
}

/**
 * Update variant request payload.
 */
export interface UpdateVariantRequest extends Partial<CreateVariantRequest> {
  // Allow partial updates
}

/**
 * Create category request payload.
 */
export interface CreateCategoryRequest {
  name: string;
  slug: string;
  parentId?: UUID | null;
  description?: string;
  image?: string;
  seoTitle?: string;
  seoDescription?: string;
  order: number;
  isActive: boolean;
  requiredAttributes?: string[];
}

/**
 * Update category request payload.
 */
export interface UpdateCategoryRequest extends Partial<CreateCategoryRequest> {
  // Allow partial updates
}

/**
 * Delete category options.
 */
export interface DeleteCategoryOptions {
  /** Reassign products to this category before deleting */
  reassignTo?: UUID;
  /** Also delete child categories */
  deleteChildren?: boolean;
}

/**
 * Create collection request payload.
 */
export interface CreateCollectionRequest {
  name: string;
  slug: string;
  type: 'manual' | 'rule' | 'smart';
  description?: string;
  heroImage?: string;
  status?: 'draft' | 'published' | 'scheduled';
  scheduledPublishAt?: Date;
  seoTitle?: string;
  seoDescription?: string;
  tags?: string[];
  productIds?: UUID[]; // For manual collections
  rule?: {
    operator: 'AND' | 'OR';
    conditions: Array<{
      field: string;
      operator: string;
      value: any;
    }>;
  };
}

/**
 * Update collection request payload.
 */
export interface UpdateCollectionRequest extends Partial<CreateCollectionRequest> {
  displayOrder?: number;
  featured?: boolean;
}

/**
 * Create vendor request payload.
 */
export interface CreateVendorRequest {
  name: string;
  slug: string;
  code: string;
  logo?: string;
  website?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: {
    street1: string;
    street2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  leadTimeDays?: number;
  minimumOrderValue?: number;
  status: 'active' | 'inactive' | 'suspended';
}

/**
 * Update vendor request payload.
 */
export interface UpdateVendorRequest extends Partial<CreateVendorRequest> {
  apiEnabled?: boolean;
  apiEndpoint?: string;
  syncEnabled?: boolean;
  notes?: string;
  rating?: number;
}

/**
 * Media upload metadata.
 */
export interface MediaUploadMetadata {
  role?: 'hero' | 'angle' | 'lifestyle' | 'detail' | 'ar_preview' | 'thumbnail';
  alt?: string;
  caption?: string;
  displayOrder?: number;
  variantId?: UUID;
}

/**
 * Update media request payload.
 */
export interface UpdateMediaRequest {
  role?: 'hero' | 'angle' | 'lifestyle' | 'detail' | 'ar_preview' | 'thumbnail';
  alt?: string;
  caption?: string;
  displayOrder?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Create import job request payload.
 */
export interface CreateImportJobRequest {
  name: string;
  source: 'csv' | 'json' | 'xml' | 'api' | 'vendor';
  file?: File;
  fileUrl?: string;
  vendorId?: UUID;
  mapping: {
    productFields: Record<string, string>;
    variantFields?: Record<string, string>;
    delimiter?: string;
    hasHeader?: boolean;
    dateFormat?: string;
  };
  options: {
    updateExisting: boolean;
    skipDuplicates: boolean;
    validateOnly: boolean;
    publishAfterImport: boolean;
    defaultValues?: Record<string, unknown>;
  };
}

/**
 * Create saved filter request payload.
 */
export interface CreateSavedFilterRequest {
  name: string;
  description?: string;
  filters: AdminProductFilters;
  isGlobal?: boolean;
}

/**
 * Update saved filter request payload.
 */
export interface UpdateSavedFilterRequest extends Partial<CreateSavedFilterRequest> {
  // Allow partial updates
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

/**
 * Standard catalog service response wrapper.
 * Extends base ApiResponse with catalog-specific metadata.
 */
export interface CatalogServiceResponse<T> extends ApiResponse<T> {
  /** Request metadata */
  meta?: {
    /** Request ID for tracing */
    requestId?: string;
    /** Response timestamp */
    timestamp?: string;
    /** Execution time in milliseconds */
    duration?: number;
    /** Deprecation warnings */
    deprecations?: string[];
  };
}

/**
 * Bulk action status for async operations.
 */
export interface BulkActionStatus {
  jobId: UUID;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: {
    total: number;
    processed: number;
    successful: number;
    failed: number;
    percentage: number;
  };
  result?: BulkActionResult;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  estimatedCompletion?: Date;
}

// ============================================================================
// FILTER TYPES
// ============================================================================

/**
 * Validation issue filters.
 */
export interface ValidationIssueFilters {
  productId?: UUID;
  variantId?: UUID;
  severity?: 'error' | 'warning' | 'info' | 'error,warning';
  resolved?: boolean;
  ruleId?: UUID;
  field?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Category filters.
 */
export interface CategoryFilters {
  parentId?: UUID | null;
  isActive?: boolean;
  search?: string;
  hasProducts?: boolean;
}

/**
 * Collection filters.
 */
export interface CollectionFilters {
  type?: 'manual' | 'rule' | 'smart';
  status?: 'draft' | 'published' | 'scheduled';
  featured?: boolean;
  search?: string;
  tags?: string[];
  page?: number;
  pageSize?: number;
  sortBy?: 'name' | 'createdAt' | 'productCount';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Vendor filters.
 */
export interface VendorFilters {
  status?: 'active' | 'inactive' | 'suspended';
  search?: string;
  hasProducts?: boolean;
  apiEnabled?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: 'name' | 'productCount' | 'rating';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Import job filters.
 */
export interface ImportJobFilters {
  source?: 'csv' | 'json' | 'xml' | 'api' | 'vendor';
  status?: 'draft' | 'validating' | 'mapping' | 'running' | 'completed' | 'failed' | 'cancelled';
  vendorId?: UUID;
  createdAfter?: Date;
  createdBefore?: Date;
  page?: number;
  pageSize?: number;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Catalog-specific error codes.
 */
export enum CatalogErrorCode {
  // Product errors
  PRODUCT_NOT_FOUND = 'PRODUCT_NOT_FOUND',
  PRODUCT_ALREADY_EXISTS = 'PRODUCT_ALREADY_EXISTS',
  PRODUCT_VALIDATION_FAILED = 'PRODUCT_VALIDATION_FAILED',
  PRODUCT_CANNOT_PUBLISH = 'PRODUCT_CANNOT_PUBLISH',
  PRODUCT_HAS_DEPENDENCIES = 'PRODUCT_HAS_DEPENDENCIES',

  // Variant errors
  VARIANT_NOT_FOUND = 'VARIANT_NOT_FOUND',
  VARIANT_ALREADY_EXISTS = 'VARIANT_ALREADY_EXISTS',
  VARIANT_SKU_DUPLICATE = 'VARIANT_SKU_DUPLICATE',

  // Category errors
  CATEGORY_NOT_FOUND = 'CATEGORY_NOT_FOUND',
  CATEGORY_HAS_PRODUCTS = 'CATEGORY_HAS_PRODUCTS',
  CATEGORY_HAS_CHILDREN = 'CATEGORY_HAS_CHILDREN',
  CATEGORY_CIRCULAR_REFERENCE = 'CATEGORY_CIRCULAR_REFERENCE',

  // Collection errors
  COLLECTION_NOT_FOUND = 'COLLECTION_NOT_FOUND',
  COLLECTION_RULE_INVALID = 'COLLECTION_RULE_INVALID',

  // Vendor errors
  VENDOR_NOT_FOUND = 'VENDOR_NOT_FOUND',
  VENDOR_CODE_DUPLICATE = 'VENDOR_CODE_DUPLICATE',

  // Media errors
  MEDIA_NOT_FOUND = 'MEDIA_NOT_FOUND',
  MEDIA_UPLOAD_FAILED = 'MEDIA_UPLOAD_FAILED',
  MEDIA_INVALID_FORMAT = 'MEDIA_INVALID_FORMAT',
  MEDIA_TOO_LARGE = 'MEDIA_TOO_LARGE',

  // Import errors
  IMPORT_JOB_NOT_FOUND = 'IMPORT_JOB_NOT_FOUND',
  IMPORT_FILE_INVALID = 'IMPORT_FILE_INVALID',
  IMPORT_MAPPING_INVALID = 'IMPORT_MAPPING_INVALID',

  // Bulk operation errors
  BULK_OPERATION_FAILED = 'BULK_OPERATION_FAILED',
  BULK_OPERATION_TIMEOUT = 'BULK_OPERATION_TIMEOUT',
  BULK_SELECTION_INVALID = 'BULK_SELECTION_INVALID',

  // Generic errors
  INVALID_REQUEST = 'INVALID_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Catalog service error.
 */
export interface CatalogServiceError {
  code: CatalogErrorCode;
  message: string;
  field?: string;
  details?: Record<string, unknown>;
  timestamp: string;
  requestId?: string;
}

/**
 * Type guard for catalog service errors.
 */
export function isCatalogServiceError(error: unknown): error is CatalogServiceError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    Object.values(CatalogErrorCode).includes((error as any).code)
  );
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Extract method names from ICatalogService.
 */
export type CatalogServiceMethod = keyof ICatalogService;

/**
 * Extract parameter types for a service method.
 */
export type CatalogServiceParams<T extends CatalogServiceMethod> = Parameters<ICatalogService[T]>;

/**
 * Extract return type for a service method.
 */
export type CatalogServiceReturn<T extends CatalogServiceMethod> = ReturnType<ICatalogService[T]>;

/**
 * Unwrap Promise type from service method return.
 */
export type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

/**
 * Extract data type from CatalogServiceResponse.
 */
export type ExtractData<T> = T extends CatalogServiceResponse<infer U> ? U : never;

/**
 * Category tree node for hierarchical display.
 */
export interface CategoryTreeNode extends Category {
  children: CategoryTreeNode[];
  productCount: number;
  depth: number;
  path: string;
}
