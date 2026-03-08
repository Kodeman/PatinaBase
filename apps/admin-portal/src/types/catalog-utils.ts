/**
 * Catalog Utility Types
 *
 * Helper types and type utilities for catalog operations.
 * Includes type guards, narrowing utilities, mapped types,
 * and generic helpers for common patterns.
 *
 * @module catalog-utils
 */

import type {
  Product,
  ProductStatus,
  AvailabilityStatus,
  Variant,
  UUID,
} from '@patina/types';

import type {
  AdminProductFilters,
  AdminProduct,
  ProductListItem,
  ProductValidationIssue,
  BulkSelection,
  CatalogViewMode,
  ProductFilterKey,
  ProductFilterValue,
} from './admin-catalog';

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for AdminProduct.
 */
export function isAdminProduct(product: unknown): product is AdminProduct {
  return (
    typeof product === 'object' &&
    product !== null &&
    'id' in product &&
    'name' in product &&
    'brand' in product &&
    'status' in product &&
    'hasValidationIssues' in product
  );
}

/**
 * Type guard for ProductListItem.
 */
export function isProductListItem(item: unknown): item is ProductListItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    'id' in item &&
    'name' in item &&
    'brand' in item &&
    'status' in item &&
    'price' in item
  );
}

/**
 * Type guard for ProductValidationIssue.
 */
export function isValidationIssue(issue: unknown): issue is ProductValidationIssue {
  return (
    typeof issue === 'object' &&
    issue !== null &&
    'id' in issue &&
    'productId' in issue &&
    'severity' in issue &&
    'message' in issue
  );
}

/**
 * Type guard for ProductStatus.
 */
export function isProductStatus(status: unknown): status is ProductStatus {
  return (
    typeof status === 'string' &&
    ['draft', 'in_review', 'published', 'deprecated'].includes(status)
  );
}

/**
 * Type guard for AvailabilityStatus.
 */
export function isAvailabilityStatus(status: unknown): status is AvailabilityStatus {
  return (
    typeof status === 'string' &&
    ['in_stock', 'out_of_stock', 'preorder', 'discontinued', 'backorder'].includes(status)
  );
}

/**
 * Type guard for CatalogViewMode.
 */
export function isViewMode(mode: unknown): mode is CatalogViewMode {
  return typeof mode === 'string' && ['grid', 'list', 'table'].includes(mode);
}

/**
 * Type guard for UUID string.
 */
export function isUUID(value: unknown): value is UUID {
  if (typeof value !== 'string') return false;
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Type guard for Date objects.
 */
export function isDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

/**
 * Type guard for non-empty array.
 */
export function isNonEmptyArray<T>(arr: unknown): arr is [T, ...T[]] {
  return Array.isArray(arr) && arr.length > 0;
}

// ============================================================================
// TYPE NARROWING UTILITIES
// ============================================================================

/**
 * Narrow product to published products.
 */
export type PublishedProduct = AdminProduct & {
  status: 'published';
  publishedAt: Date;
};

/**
 * Type guard for published products.
 */
export function isPublishedProduct(product: AdminProduct): product is PublishedProduct {
  return product.status === 'published' && product.publishedAt !== undefined;
}

/**
 * Narrow product to products with validation issues.
 */
export type ProductWithIssues = AdminProduct & {
  hasValidationIssues: true;
  validation: NonNullable<AdminProduct['validation']>;
};

/**
 * Type guard for products with validation issues.
 */
export function hasValidationIssues(product: AdminProduct): product is ProductWithIssues {
  return product.hasValidationIssues === true && product.validation !== undefined;
}

/**
 * Narrow product to products with 3D models.
 */
export type ProductWith3D = AdminProduct & {
  has3D: true;
};

/**
 * Type guard for products with 3D models.
 */
export function has3DModel(product: AdminProduct): product is ProductWith3D {
  return product.has3D === true;
}

/**
 * Narrow product to products with variants.
 */
export type ProductWithVariants = AdminProduct & {
  variants: [Variant, ...Variant[]];
};

/**
 * Type guard for products with variants.
 */
export function hasVariants(product: AdminProduct): product is ProductWithVariants {
  return isNonEmptyArray(product.variants);
}

// ============================================================================
// MAPPED TYPES
// ============================================================================

/**
 * Make specific properties optional.
 */
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Make specific properties required.
 */
export type Required<T, K extends keyof T> = T & { [P in K]-?: T[P] };

/**
 * Make all properties nullable.
 */
export type Nullable<T> = {
  [P in keyof T]: T[P] | null;
};

/**
 * Deep partial type.
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Extract keys of specific type from an object.
 */
export type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

/**
 * Extract values of specific type from an object.
 */
export type ValuesOfType<T, U> = T[KeysOfType<T, U>];

/**
 * Make readonly deeply.
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/**
 * Make mutable (remove readonly).
 */
export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

/**
 * Extract non-nullable properties.
 */
export type NonNullableProps<T> = {
  [P in keyof T]: NonNullable<T[P]>;
};

/**
 * Pick only nullable properties.
 */
export type NullablePropsOnly<T> = {
  [P in keyof T as null extends T[P] ? P : never]: T[P];
};

// ============================================================================
// FILTER UTILITIES
// ============================================================================

/**
 * Extract filter keys by value type.
 */
export type FilterKeysByType<T extends string | number | boolean | Date> = KeysOfType<
  AdminProductFilters,
  T | T[] | undefined
>;

/**
 * String filter keys.
 */
export type StringFilterKeys = FilterKeysByType<string>;

/**
 * Number filter keys.
 */
export type NumberFilterKeys = FilterKeysByType<number>;

/**
 * Boolean filter keys.
 */
export type BooleanFilterKeys = FilterKeysByType<boolean>;

/**
 * Date filter keys.
 */
export type DateFilterKeys = FilterKeysByType<Date>;

/**
 * Active filters (non-undefined values).
 */
export type ActiveFilters = {
  [K in keyof AdminProductFilters]: Exclude<AdminProductFilters[K], undefined>;
};

/**
 * Filter value type extractor.
 */
export type FilterValueType<K extends ProductFilterKey> = NonNullable<AdminProductFilters[K]>;

/**
 * Type-safe filter update payload.
 */
export type FilterUpdate<K extends ProductFilterKey = ProductFilterKey> = {
  [P in K]: {
    key: P;
    value: AdminProductFilters[P];
  };
}[K];

// ============================================================================
// BULK OPERATION UTILITIES
// ============================================================================

/**
 * Bulk selection with computed properties.
 */
export interface EnhancedBulkSelection extends BulkSelection {
  isEmpty: boolean;
  hasSelection: boolean;
  count: number;
}

/**
 * Bulk operation payload types.
 */
export type BulkOperationPayload = {
  publish: { scheduledAt?: Date };
  unpublish: Record<string, never>;
  delete: { permanent?: boolean };
  update_status: { status: ProductStatus };
  update_category: { categoryId: UUID };
  update_vendor: { vendorId: UUID };
  add_tags: { tags: string[] };
  remove_tags: { tags: string[] };
  update_pricing: { priceModifier: number; type: 'percentage' | 'fixed' };
  archive: Record<string, never>;
  duplicate: { namePrefix?: string };
  export: { format: 'csv' | 'json' | 'xlsx' };
};

/**
 * Type-safe bulk operation request.
 */
export type TypedBulkActionRequest<T extends keyof BulkOperationPayload> = {
  action: T;
  selection: BulkSelection;
  filters?: AdminProductFilters;
  payload: BulkOperationPayload[T];
  dryRun?: boolean;
};

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validation issue grouped by severity.
 */
export type ValidationIssuesBySeverity = {
  error: ProductValidationIssue[];
  warning: ProductValidationIssue[];
  info: ProductValidationIssue[];
};

/**
 * Validation summary.
 */
export interface ValidationSummary {
  total: number;
  errors: number;
  warnings: number;
  info: number;
  resolved: number;
  unresolved: number;
  autoFixable: number;
}

/**
 * Validation issue with fix suggestion.
 */
export type FixableValidationIssue = ProductValidationIssue & {
  autoFixable: true;
  suggestion: string;
};

/**
 * Type guard for fixable validation issues.
 */
export function isFixableIssue(issue: ProductValidationIssue): issue is FixableValidationIssue {
  return issue.autoFixable === true && typeof issue.suggestion === 'string';
}

// ============================================================================
// PRODUCT UTILITIES
// ============================================================================

/**
 * Product sorting fields.
 */
export type ProductSortField =
  | 'name'
  | 'brand'
  | 'price'
  | 'status'
  | 'createdAt'
  | 'updatedAt'
  | 'publishedAt';

/**
 * Product comparison function type.
 */
export type ProductComparator = (a: ProductListItem, b: ProductListItem) => number;

/**
 * Product filter predicate.
 */
export type ProductPredicate = (product: ProductListItem) => boolean;

/**
 * Product transformer function.
 */
export type ProductTransformer<T> = (product: AdminProduct) => T;

/**
 * Product grouping key function.
 */
export type ProductGroupKey = (product: ProductListItem) => string;

/**
 * Grouped products map.
 */
export type GroupedProducts = Map<string, ProductListItem[]>;

// ============================================================================
// PAGINATION UTILITIES
// ============================================================================

/**
 * Pagination info.
 */
export interface PaginationInfo {
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startIndex: number;
  endIndex: number;
}

/**
 * Calculate pagination info.
 */
export type CalculatePagination = (
  totalItems: number,
  currentPage: number,
  pageSize: number
) => PaginationInfo;

/**
 * Cursor-based pagination.
 */
export interface CursorPagination {
  cursor?: string;
  limit: number;
  hasMore: boolean;
  nextCursor?: string;
}

// ============================================================================
// ASYNC UTILITIES
// ============================================================================

/**
 * Async result type.
 */
export type AsyncResult<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Loading state.
 */
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

/**
 * Async operation state.
 */
export interface AsyncOperationState<T> {
  state: LoadingState;
  data?: T;
  error?: Error;
  timestamp?: Date;
}

// ============================================================================
// QUERY STRING UTILITIES
// ============================================================================

/**
 * Serializable filter values (for URL query strings).
 */
export type SerializableFilterValue = string | number | boolean | string[];

/**
 * Serializable filters (only values that can be in URL).
 */
export type SerializableFilters = {
  [K in keyof AdminProductFilters]: AdminProductFilters[K] extends SerializableFilterValue
    ? AdminProductFilters[K]
    : never;
};

/**
 * Filter serializer function.
 */
export type FilterSerializer = (filters: AdminProductFilters) => string;

/**
 * Filter deserializer function.
 */
export type FilterDeserializer = (queryString: string) => Partial<AdminProductFilters>;

// ============================================================================
// DISPLAY UTILITIES
// ============================================================================

/**
 * Product status display info.
 */
export interface StatusDisplay {
  status: ProductStatus;
  label: string;
  color: 'gray' | 'blue' | 'green' | 'red' | 'yellow';
  icon?: string;
}

/**
 * Availability status display info.
 */
export interface AvailabilityDisplay {
  status: AvailabilityStatus;
  label: string;
  color: 'gray' | 'green' | 'yellow' | 'red' | 'blue';
  icon?: string;
}

/**
 * Validation severity display info.
 */
export interface SeverityDisplay {
  severity: 'error' | 'warning' | 'info';
  label: string;
  color: 'red' | 'yellow' | 'blue';
  icon: string;
}

/**
 * Format currency function.
 */
export type FormatCurrency = (amount: number, currency?: string) => string;

/**
 * Format date function.
 */
export type FormatDate = (date: Date, format?: string) => string;

/**
 * Format relative time function.
 */
export type FormatRelativeTime = (date: Date) => string;

// ============================================================================
// SORTING UTILITIES
// ============================================================================

/**
 * Sort order.
 */
export type SortOrder = 'asc' | 'desc';

/**
 * Sort configuration.
 */
export interface SortConfig<T extends string = string> {
  field: T;
  order: SortOrder;
}

/**
 * Multi-field sort configuration.
 */
export type MultiSortConfig<T extends string = string> = SortConfig<T>[];

/**
 * Sort function generator.
 */
export type CreateSorter = <T>(
  field: keyof T,
  order: SortOrder
) => (a: T, b: T) => number;

// ============================================================================
// EVENT UTILITIES
// ============================================================================

/**
 * Catalog event types.
 */
export type CatalogEventType =
  | 'product.created'
  | 'product.updated'
  | 'product.deleted'
  | 'product.published'
  | 'product.unpublished'
  | 'filter.changed'
  | 'view.changed'
  | 'selection.changed'
  | 'bulk.action.started'
  | 'bulk.action.completed';

/**
 * Catalog event payload.
 */
export interface CatalogEvent<T = unknown> {
  type: CatalogEventType;
  payload: T;
  timestamp: Date;
  userId?: string;
}

/**
 * Event handler function.
 */
export type EventHandler<T = unknown> = (event: CatalogEvent<T>) => void;

/**
 * Event unsubscribe function.
 */
export type Unsubscribe = () => void;

// ============================================================================
// COLLECTION UTILITIES
// ============================================================================

/**
 * Collection of unique items.
 */
export class UniqueCollection<T, K extends keyof T> {
  private items: Map<T[K], T>;
  private keyField: K;

  constructor(keyField: K, initialItems?: T[]) {
    this.keyField = keyField;
    this.items = new Map();
    if (initialItems) {
      initialItems.forEach((item) => this.add(item));
    }
  }

  add(item: T): void {
    this.items.set(item[this.keyField], item);
  }

  remove(key: T[K]): boolean {
    return this.items.delete(key);
  }

  has(key: T[K]): boolean {
    return this.items.has(key);
  }

  get(key: T[K]): T | undefined {
    return this.items.get(key);
  }

  toArray(): T[] {
    return Array.from(this.items.values());
  }

  get size(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }
}

// ============================================================================
// CONDITIONAL TYPES
// ============================================================================

/**
 * If type extends condition, return TrueType, else FalseType.
 */
export type IfExtends<T, U, TrueType, FalseType> = T extends U ? TrueType : FalseType;

/**
 * Extract promise resolved type.
 */
export type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

/**
 * Extract array element type.
 */
export type ArrayElement<T> = T extends (infer U)[] ? U : never;

/**
 * Function argument types.
 */
export type ArgumentTypes<F> = F extends (...args: infer A) => any ? A : never;

/**
 * Function return type (unwrapped from Promise).
 */
export type UnwrapReturnType<F> = F extends (...args: any[]) => infer R
  ? UnwrapPromise<R>
  : never;

// ============================================================================
// BRAND TYPES (for nominal typing)
// ============================================================================

/**
 * Brand type for nominal typing.
 */
export type Brand<T, B> = T & { __brand: B };

/**
 * Product ID with nominal type.
 */
export type ProductId = Brand<UUID, 'ProductId'>;

/**
 * Category ID with nominal type.
 */
export type CategoryId = Brand<UUID, 'CategoryId'>;

/**
 * Vendor ID with nominal type.
 */
export type VendorId = Brand<UUID, 'VendorId'>;

/**
 * Create branded ID.
 */
export function createProductId(id: UUID): ProductId {
  return id as ProductId;
}

export function createCategoryId(id: UUID): CategoryId {
  return id as CategoryId;
}

export function createVendorId(id: UUID): VendorId {
  return id as VendorId;
}
