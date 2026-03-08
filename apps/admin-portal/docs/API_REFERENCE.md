# Admin Portal Catalog - API Reference

**Complete reference for catalog services, hooks, and types**

**Version 1.0** | **Last Updated: 2025-10-19**

---

## Table of Contents

1. [Overview](#overview)
2. [Catalog Service](#catalog-service)
3. [React Hooks](#react-hooks)
4. [Type Definitions](#type-definitions)
5. [Error Handling](#error-handling)
6. [Code Examples](#code-examples)

---

## Overview

### Import Paths

```typescript
// Services
import { catalogService } from '@/services/catalog';

// Hooks
import {
  useAdminProducts,
  useProduct,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  usePublishProduct
} from '@/hooks/use-admin-products';

import { useProductBulkActions } from '@/hooks/use-product-bulk-actions';
import { useCatalogStats } from '@/hooks/use-catalog-stats';
import { useAdminCatalogPresenter } from '@/features/catalog/hooks/useAdminCatalogPresenter';

// Types
import type {
  AdminProduct,
  AdminProductFilters,
  BulkActionResult,
  CatalogStats,
  ProductValidationIssue
} from '@/types/admin-catalog';

import type {
  Product,
  Variant,
  Category,
  PaginatedResponse
} from '@patina/types';
```

---

## Catalog Service

The `catalogService` provides type-safe methods for interacting with the catalog API.

### Product Methods

#### `getProducts()`

Fetch a paginated list of products with optional filtering.

**Signature:**
```typescript
getProducts(params?: AdminProductFilters): Promise<ApiResponse<PaginatedResponse<Product>>>
```

**Parameters:**
```typescript
interface AdminProductFilters {
  // Search
  query?: string;               // Search query
  q?: string;                   // Alias for query

  // Status filtering
  status?: ProductStatus | ProductStatus[];
  statuses?: string[];          // Multiple statuses

  // Catalog filtering
  category?: string;            // Category ID
  brand?: string;               // Brand name

  // Pagination
  page?: number;                // Page number (1-indexed)
  pageSize?: number;            // Items per page

  // Date filtering
  createdAfter?: string;        // ISO 8601 date
  createdBefore?: string;       // ISO 8601 date

  // Validation
  hasValidationIssues?: boolean;
}
```

**Returns:**
```typescript
{
  data: {
    data: Product[];            // Array of products
    meta: {
      total: number;            // Total count
      page: number;             // Current page
      pageSize: number;         // Items per page
      totalPages: number;       // Total pages
    }
  }
}
```

**Example:**
```typescript
const response = await catalogService.getProducts({
  query: 'modern sofa',
  status: 'published',
  page: 1,
  pageSize: 20
});

console.log(response.data.data);        // Products array
console.log(response.data.meta.total);  // Total count
```

---

#### `getProduct()`

Fetch a single product by ID.

**Signature:**
```typescript
getProduct(productId: string): Promise<ApiResponse<Product>>
```

**Parameters:**
- `productId` (string): UUID of the product

**Returns:**
```typescript
{
  data: Product
}
```

**Example:**
```typescript
const response = await catalogService.getProduct('550e8400-e29b-41d4-a716-446655440000');
console.log(response.data);  // Product object
```

**Error codes:**
- `NOT_FOUND`: Product doesn't exist
- `UNAUTHORIZED`: Invalid authentication
- `FORBIDDEN`: Insufficient permissions

---

#### `createProduct()`

Create a new product.

**Signature:**
```typescript
createProduct(data: Partial<Product>): Promise<ApiResponse<Product>>
```

**Parameters:**
```typescript
interface CreateProductData {
  // Required fields
  name: string;                 // Min 3, max 255 chars
  brand: string;                // Min 2, max 100 chars
  shortDescription: string;     // Min 10, max 500 chars
  price: number;                // > 0, max 1000000
  categoryId: string;           // UUID
  status: 'draft' | 'in_review';

  // Optional fields
  msrp?: number;                // >= price
  tags?: string[];
  materials?: string[];
  colors?: string[];
  styleTags?: string[];
  category?: string;            // Category name (deprecated, use categoryId)
  currency?: string;            // Default: 'USD'
}
```

**Returns:**
```typescript
{
  data: Product                 // Created product with ID
}
```

**Example:**
```typescript
const response = await catalogService.createProduct({
  name: 'Modern Sectional Sofa',
  brand: 'Herman Miller',
  shortDescription: 'Luxurious 3-seater sofa with modular chaise',
  price: 2495.00,
  msrp: 3199.00,
  categoryId: '550e8400-e29b-41d4-a716-446655440000',
  status: 'draft',
  tags: ['modern', 'sectional'],
  materials: ['Leather', 'Oak'],
  colors: ['Navy', 'Charcoal'],
  styleTags: ['Modern', 'Scandinavian']
});

console.log(response.data.id);  // New product ID
```

**Validation errors:**
- `VALIDATION_FAILED`: Field validation failed
- `DUPLICATE_SKU`: SKU already exists (if SKU provided)
- `INVALID_CATEGORY`: Category ID doesn't exist

---

#### `updateProduct()`

Update an existing product.

**Signature:**
```typescript
updateProduct(productId: string, data: Partial<Product>): Promise<ApiResponse<Product>>
```

**Parameters:**
- `productId` (string): UUID of product to update
- `data` (Partial<Product>): Fields to update

**Returns:**
```typescript
{
  data: Product                 // Updated product
}
```

**Example:**
```typescript
const response = await catalogService.updateProduct(
  '550e8400-e29b-41d4-a716-446655440000',
  {
    price: 2795.00,
    msrp: 3499.00,
    tags: ['modern', 'sectional', 'bestseller']
  }
);
```

**Error codes:**
- `NOT_FOUND`: Product doesn't exist
- `CONFLICT`: Resource modified by another user
- `VALIDATION_FAILED`: Invalid data

---

#### `deleteProduct()`

Delete a product permanently.

**Signature:**
```typescript
deleteProduct(productId: string): Promise<ApiResponse<void>>
```

**Parameters:**
- `productId` (string): UUID of product to delete

**Returns:**
```typescript
{
  data: void
}
```

**Example:**
```typescript
await catalogService.deleteProduct('550e8400-e29b-41d4-a716-446655440000');
```

**⚠️ Warning:** Deletion is permanent and cannot be undone.

**Error codes:**
- `NOT_FOUND`: Product doesn't exist
- `FORBIDDEN`: Cannot delete published products (unpublish first)

---

### Publishing Methods

#### `publishProduct()`

Publish a product to make it visible to customers.

**Signature:**
```typescript
publishProduct(productId: string): Promise<ApiResponse<void>>
```

**Parameters:**
- `productId` (string): UUID of product to publish

**Returns:**
```typescript
{
  data: void
}
```

**Example:**
```typescript
await catalogService.publishProduct('550e8400-e29b-41d4-a716-446655440000');
```

**Requirements:**
- Product must have no blocking validation errors
- Product must have at least one image
- Product must have valid pricing

**Error codes:**
- `VALIDATION_FAILED`: Product has blocking validation errors
- `NOT_FOUND`: Product doesn't exist

---

#### `unpublishProduct()`

Unpublish a product to remove it from customer view.

**Signature:**
```typescript
unpublishProduct(productId: string): Promise<ApiResponse<void>>
```

**Parameters:**
- `productId` (string): UUID of product to unpublish

**Returns:**
```typescript
{
  data: void
}
```

**Example:**
```typescript
await catalogService.unpublishProduct('550e8400-e29b-41d4-a716-446655440000');
```

---

### Bulk Operation Methods

#### `bulkPublish()`

Publish multiple products simultaneously.

**Signature:**
```typescript
bulkPublish(productIds: string[]): Promise<ApiResponse<BulkActionResult>>
```

**Parameters:**
- `productIds` (string[]): Array of product UUIDs (max 100)

**Returns:**
```typescript
{
  data: {
    success: BulkActionItemResult[];    // Successful items
    failed: BulkActionItemResult[];     // Failed items
    skipped: BulkActionItemResult[];    // Already published
    total: number;                       // Total attempted
    duration: number;                    // Execution time (ms)
  }
}
```

**Example:**
```typescript
const result = await catalogService.bulkPublish([
  '550e8400-e29b-41d4-a716-446655440000',
  '550e8400-e29b-41d4-a716-446655440001',
  '550e8400-e29b-41d4-a716-446655440002'
]);

console.log(`Published: ${result.data.success.length}`);
console.log(`Failed: ${result.data.failed.length}`);

// Check failed items
result.data.failed.forEach(item => {
  console.log(`${item.id}: ${item.error}`);
});
```

**Rate limits:**
- Max 100 products per operation
- Max 10 operations per minute
- Cooldown: 60 seconds

**Error codes:**
- `RATE_LIMIT_EXCEEDED`: Rate limit hit
- `INVALID_INPUT`: Invalid product IDs

---

#### `bulkUnpublish()`

Unpublish multiple products simultaneously.

**Signature:**
```typescript
bulkUnpublish(productIds: string[], reason?: string): Promise<ApiResponse<BulkActionResult>>
```

**Parameters:**
- `productIds` (string[]): Array of product UUIDs (max 100)
- `reason` (string, optional): Reason for unpublishing (logged in audit trail)

**Returns:**
```typescript
{
  data: BulkActionResult
}
```

**Example:**
```typescript
const result = await catalogService.bulkUnpublish(
  ['550e8400-e29b-41d4-a716-446655440000'],
  'Out of stock - temporary'
);
```

---

#### `bulkDelete()`

Delete multiple products simultaneously.

**Signature:**
```typescript
bulkDelete(productIds: string[], options?: { soft?: boolean }): Promise<ApiResponse<BulkActionResult>>
```

**Parameters:**
- `productIds` (string[]): Array of product UUIDs (max 50)
- `options.soft` (boolean, optional): Soft delete (mark as deleted) vs hard delete

**Returns:**
```typescript
{
  data: BulkActionResult
}
```

**Example:**
```typescript
const result = await catalogService.bulkDelete(
  ['550e8400-e29b-41d4-a716-446655440000'],
  { soft: true }
);
```

**⚠️ Warning:** Hard delete is permanent. Use soft delete when possible.

---

### Variant Methods

#### `createVariant()`

Create a product variant.

**Signature:**
```typescript
createVariant(productId: string, data: Partial<Variant>): Promise<ApiResponse<Variant>>
```

**Parameters:**
```typescript
interface CreateVariantData {
  sku: string;                  // Required, unique
  name: string;                 // Required
  price?: number;               // Override base price
  attributes: {                 // Key-value pairs
    [key: string]: string;
  };
}
```

**Example:**
```typescript
const variant = await catalogService.createVariant(
  '550e8400-e29b-41d4-a716-446655440000',
  {
    sku: 'SOFA-001-NVY-L',
    name: 'Navy Blue, Large',
    price: 2695.00,
    attributes: {
      color: 'Navy',
      size: 'Large'
    }
  }
);
```

---

### Category Methods

#### `getCategories()`

Fetch all categories (hierarchical).

**Signature:**
```typescript
getCategories(): Promise<ApiResponse<Category[]>>
```

**Returns:**
```typescript
{
  data: Category[]              // Nested category tree
}
```

**Example:**
```typescript
const response = await catalogService.getCategories();
const categories = response.data;

// Categories include parent/child relationships
categories.forEach(cat => {
  console.log(cat.name);
  cat.children?.forEach(child => {
    console.log(`  - ${child.name}`);
  });
});
```

---

### Statistics Methods

#### `getProductStats()`

Fetch catalog statistics.

**Signature:**
```typescript
getProductStats(filters?: {
  startDate?: string;
  endDate?: string;
  categoryId?: string;
}): Promise<ApiResponse<CatalogStats>>
```

**Returns:**
```typescript
{
  data: {
    totalProducts: number;
    byStatus: Record<ProductStatus, number>;
    byAvailability: Record<AvailabilityStatus, number>;
    withValidationIssues: number;
    validationBreakdown: {
      errors: number;
      warnings: number;
      info: number;
    };
    with3D: number;
    withAR: number;
    pricing: {
      average: number;
      median: number;
      min: number;
      max: number;
    };
    // ... more stats
  }
}
```

**Example:**
```typescript
const stats = await catalogService.getProductStats();
console.log(`Total products: ${stats.data.totalProducts}`);
console.log(`Published: ${stats.data.byStatus.published}`);
console.log(`With errors: ${stats.data.withValidationIssues}`);
```

---

### Validation Methods

#### `getProductValidationIssues()`

Get validation issues for a specific product.

**Signature:**
```typescript
getProductValidationIssues(productId: string): Promise<ApiResponse<ValidationIssue[]>>
```

**Returns:**
```typescript
{
  data: ValidationIssue[]
}

interface ValidationIssue {
  id: string;
  productId: string;
  severity: 'error' | 'warning' | 'info';
  code: string;
  field?: string;
  message: string;
  suggestion?: string;
  autoFixable: boolean;
}
```

**Example:**
```typescript
const issues = await catalogService.getProductValidationIssues(productId);

const errors = issues.data.filter(i => i.severity === 'error');
console.log(`${errors.length} blocking errors`);
```

---

## React Hooks

### Product Data Hooks

#### `useAdminProducts()`

Fetch paginated products with filters.

**Signature:**
```typescript
function useAdminProducts(
  filters?: AdminProductFilters,
  options?: UseQueryOptions
): UseProductsResult
```

**Returns:**
```typescript
interface UseProductsResult {
  // Data
  products: ProductListItem[];
  totalProducts: number;
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;

  // State
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;

  // Computed
  isEmpty: boolean;
  hasFilters: boolean;

  // Methods
  refetch: () => Promise<void>;
  invalidate: () => Promise<void>;
}
```

**Example:**
```typescript
function ProductList() {
  const { products, isLoading, totalProducts } = useAdminProducts({
    status: 'published',
    page: 1,
    pageSize: 20
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <h2>Products ({totalProducts})</h2>
      {products.map(product => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
```

---

#### `useProduct()`

Fetch a single product by ID.

**Signature:**
```typescript
function useProduct(
  id: string,
  options?: UseQueryOptions
): UseProductResult
```

**Returns:**
```typescript
interface UseProductResult {
  product: Product | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}
```

**Example:**
```typescript
function ProductDetail({ productId }: { productId: string }) {
  const { product, isLoading } = useProduct(productId);

  if (isLoading) return <LoadingSpinner />;
  if (!product) return <NotFound />;

  return <div>{product.name}</div>;
}
```

---

### Product Mutation Hooks

#### `useCreateProduct()`

Create a new product.

**Signature:**
```typescript
function useCreateProduct(): UseCreateProductResult
```

**Returns:**
```typescript
interface UseCreateProductResult {
  mutate: (data: Partial<Product>) => void;
  mutateAsync: (data: Partial<Product>) => Promise<Product>;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  reset: () => void;
}
```

**Example:**
```typescript
function CreateProductForm() {
  const createProduct = useCreateProduct();

  const handleSubmit = async (data) => {
    try {
      const product = await createProduct.mutateAsync(data);
      toast.success('Product created');
      router.push(`/catalog/${product.id}`);
    } catch (error) {
      toast.error('Failed to create product');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
    </form>
  );
}
```

---

#### `useUpdateProduct()`

Update an existing product.

**Signature:**
```typescript
function useUpdateProduct(): UseUpdateProductResult
```

**Returns:**
```typescript
interface UseUpdateProductResult {
  mutate: (params: { productId: string; data: Partial<Product> }) => void;
  mutateAsync: (params: { productId: string; data: Partial<Product> }) => Promise<Product>;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
}
```

**Example:**
```typescript
function EditProductForm({ productId }: { productId: string }) {
  const updateProduct = useUpdateProduct();

  const handleSave = async (data) => {
    await updateProduct.mutateAsync({ productId, data });
    toast.success('Product updated');
  };

  return <form onSubmit={handleSave}>{/* Fields */}</form>;
}
```

---

#### `useDeleteProduct()`

Delete a product.

**Signature:**
```typescript
function useDeleteProduct(): UseDeleteProductResult
```

**Example:**
```typescript
function DeleteButton({ productId }: { productId: string }) {
  const deleteProduct = useDeleteProduct();

  const handleDelete = async () => {
    if (confirm('Are you sure?')) {
      await deleteProduct.mutateAsync(productId);
      toast.success('Product deleted');
    }
  };

  return (
    <Button onClick={handleDelete} variant="destructive">
      Delete
    </Button>
  );
}
```

---

### Bulk Operations Hook

#### `useProductBulkActions()`

Manage bulk product operations.

**Signature:**
```typescript
function useProductBulkActions(options?: {
  clearOnSuccess?: boolean;
  onSuccess?: (result: BulkActionResult) => void;
}): ProductBulkActionsHook
```

**Returns:**
```typescript
interface ProductBulkActionsHook {
  // Selection state
  selectedIds: Set<string>;
  selectedCount: number;
  hasSelection: boolean;

  // Selection actions
  toggleProduct: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;

  // Bulk operations
  bulkPublish: () => Promise<BulkActionResult>;
  bulkUnpublish: (reason?: string) => Promise<BulkActionResult>;
  bulkDelete: () => Promise<BulkActionResult>;

  // Operation state
  isPublishing: boolean;
  isUnpublishing: boolean;
  isDeleting: boolean;
}
```

**Example:**
```typescript
function BulkActions() {
  const bulkActions = useProductBulkActions({
    clearOnSuccess: true,
    onSuccess: (result) => {
      toast.success(`Published ${result.success.length} products`);
    }
  });

  return (
    <div>
      <p>Selected: {bulkActions.selectedCount}</p>
      <Button onClick={bulkActions.bulkPublish}>
        Publish Selected
      </Button>
      <Button onClick={bulkActions.clearSelection}>
        Clear
      </Button>
    </div>
  );
}
```

---

### Presenter Hook

#### `useAdminCatalogPresenter()`

Main orchestration hook for catalog page.

**Signature:**
```typescript
function useAdminCatalogPresenter(): AdminCatalogPresenter
```

**Returns:** See [AdminCatalogPresenter interface](#admincatalogpresenter-interface)

**Example:**
```typescript
function CatalogPage() {
  const presenter = useAdminCatalogPresenter();

  return (
    <div>
      <SearchBar
        value={presenter.searchQuery}
        onChange={presenter.handleSearchChange}
      />
      <ProductGrid products={presenter.products} />
      {presenter.hasSelection && (
        <BulkToolbar
          count={presenter.selectedCount}
          onPublish={presenter.handleBulkPublish}
        />
      )}
    </div>
  );
}
```

---

## Type Definitions

### AdminProductFilters

Complete filter interface for product queries.

```typescript
export interface AdminProductFilters extends Omit<SearchQuery, 'sort'> {
  // Search
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
  availability?: AvailabilityStatus | AvailabilityStatus[];
  inStock?: boolean;
  lowStock?: boolean;

  // Media
  hasImages?: boolean;
  imageCount?: number;

  // Sorting
  sortBy?: 'name' | 'price' | 'createdAt' | 'updatedAt' | 'publishedAt';
  sortOrder?: 'asc' | 'desc';

  // Pagination
  page?: number;
  pageSize?: number;
  cursor?: string;
}
```

---

### BulkActionResult

Result of a bulk operation.

```typescript
export interface BulkActionResult {
  success: BulkActionItemResult[];
  failed: BulkActionItemResult[];
  skipped: BulkActionItemResult[];
  total: number;
  duration?: number;
  metadata?: {
    action: BulkActionType;
    timestamp: Date;
    affectedFields?: string[];
    validationErrors?: number;
  };
}

export interface BulkActionItemResult {
  id: string;
  success: boolean;
  error?: string;
  errorCode?: string;
  warnings?: string[];
}
```

---

### AdminCatalogPresenter Interface

Complete presenter interface.

```typescript
export interface AdminCatalogPresenter {
  // ========== STATE ==========
  searchQuery: string;
  debouncedSearchQuery: string;
  viewMode: 'grid' | 'list' | 'table';
  currentPage: number;
  pageSize: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  selectedStatus: string | null;
  selectedCategory: string | null;
  selectedBrand: string | null;
  activeFilterCount: number;
  hasActiveFilters: boolean;
  selectedCount: number;
  hasSelection: boolean;

  // ========== DATA ==========
  products: ProductListItem[];
  isLoadingProducts: boolean;
  isError: boolean;
  totalProducts: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  stats: CatalogStats;
  isEmpty: boolean;
  isEmptyState: boolean;
  isNoResults: boolean;

  // ========== ACTIONS ==========
  handleSearchChange: (query: string) => void;
  handleClearSearch: () => void;
  handleStatusChange: (status: string | null) => void;
  handleCategoryChange: (category: string | null) => void;
  handleBrandChange: (brand: string | null) => void;
  handleClearFilters: () => void;
  handlePageChange: (page: number) => void;
  handlePageSizeChange: (size: number) => void;
  handleSortChange: (field: string, order: 'asc' | 'desc') => void;
  setViewMode: (mode: 'grid' | 'list' | 'table') => void;
  handleProductToggle: (productId: string) => void;
  handleSelectAllOnPage: () => void;
  handleClearSelection: () => void;
  handleBulkPublish: () => Promise<any>;
  handleBulkUnpublish: (reason?: string) => Promise<any>;
  handleBulkDelete: () => Promise<any>;
  refreshData: () => void;
  refreshStats: () => void;
}
```

---

## Error Handling

### Error Types

```typescript
interface ApiError {
  message: string;
  code: string;
  statusCode: number;
  details?: any;
  timestamp: string;
}
```

### Common Error Codes

| Code | HTTP Status | Meaning | Solution |
|------|-------------|---------|----------|
| `VALIDATION_FAILED` | 400 | Input validation failed | Check field requirements |
| `NOT_FOUND` | 404 | Resource doesn't exist | Verify ID, refresh page |
| `DUPLICATE_SKU` | 409 | SKU already exists | Use unique SKU |
| `CONFLICT` | 409 | Resource state conflict | Refresh and retry |
| `UNAUTHORIZED` | 401 | Authentication failed | Sign in again |
| `FORBIDDEN` | 403 | Insufficient permissions | Contact admin |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Wait for cooldown |
| `SERVER_ERROR` | 500 | Backend error | Retry, contact support |

### Error Handling Examples

**In components:**
```typescript
const { mutate, error } = useCreateProduct();

if (error) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>{error.message}</AlertDescription>
    </Alert>
  );
}
```

**In async handlers:**
```typescript
try {
  await catalogService.createProduct(data);
  toast.success('Product created');
} catch (error) {
  if (error.code === 'VALIDATION_FAILED') {
    toast.error('Please check all required fields');
  } else if (error.code === 'DUPLICATE_SKU') {
    toast.error('SKU already exists');
  } else {
    toast.error('Failed to create product');
  }
}
```

---

## Code Examples

### Complete CRUD Example

```typescript
import { useAdminProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from '@/hooks/use-admin-products';

function ProductManager() {
  // Fetch products
  const { products, isLoading, refetch } = useAdminProducts({
    status: 'published',
    page: 1,
    pageSize: 20
  });

  // Create mutation
  const createProduct = useCreateProduct();

  // Update mutation
  const updateProduct = useUpdateProduct();

  // Delete mutation
  const deleteProduct = useDeleteProduct();

  // Create
  const handleCreate = async () => {
    try {
      const product = await createProduct.mutateAsync({
        name: 'New Product',
        brand: 'Brand Name',
        shortDescription: 'Product description here',
        price: 100,
        categoryId: 'category-uuid',
        status: 'draft'
      });
      toast.success('Product created');
      refetch();
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Update
  const handleUpdate = async (productId: string) => {
    try {
      await updateProduct.mutateAsync({
        productId,
        data: { price: 150 }
      });
      toast.success('Product updated');
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Delete
  const handleDelete = async (productId: string) => {
    if (!confirm('Are you sure?')) return;

    try {
      await deleteProduct.mutateAsync(productId);
      toast.success('Product deleted');
      refetch();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <div>
      <Button onClick={handleCreate}>Create Product</Button>
      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <div>
          {products.map(product => (
            <div key={product.id}>
              <h3>{product.name}</h3>
              <Button onClick={() => handleUpdate(product.id)}>
                Update
              </Button>
              <Button onClick={() => handleDelete(product.id)}>
                Delete
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Bulk Operations Example

```typescript
import { useProductBulkActions } from '@/hooks/use-product-bulk-actions';

function BulkOperationsExample() {
  const bulkActions = useProductBulkActions({
    clearOnSuccess: true,
    onSuccess: (result) => {
      toast.success(
        `Success: ${result.success.length}, Failed: ${result.failed.length}`
      );
    }
  });

  const handleBulkPublish = async () => {
    try {
      const result = await bulkActions.bulkPublish();

      // Show detailed results
      if (result.failed.length > 0) {
        console.log('Failed items:', result.failed);
      }
    } catch (error) {
      toast.error('Bulk publish failed');
    }
  };

  return (
    <div>
      <p>Selected: {bulkActions.selectedCount}</p>

      <Button
        onClick={handleBulkPublish}
        disabled={!bulkActions.hasSelection || bulkActions.isPublishing}
      >
        {bulkActions.isPublishing ? 'Publishing...' : 'Publish Selected'}
      </Button>

      <Button onClick={bulkActions.clearSelection}>
        Clear Selection
      </Button>
    </div>
  );
}
```

### Filtering Example

```typescript
import { useAdminProducts } from '@/hooks/use-admin-products';
import { useState } from 'react';

function FilteredProductList() {
  const [filters, setFilters] = useState<AdminProductFilters>({
    page: 1,
    pageSize: 20
  });

  const { products, totalProducts, isLoading } = useAdminProducts(filters);

  const handleFilterChange = (newFilters: Partial<AdminProductFilters>) => {
    setFilters(prev => ({
      ...prev,
      ...newFilters,
      page: 1 // Reset to page 1
    }));
  };

  return (
    <div>
      {/* Filters */}
      <select onChange={(e) => handleFilterChange({ status: e.target.value })}>
        <option value="">All Statuses</option>
        <option value="draft">Draft</option>
        <option value="published">Published</option>
      </select>

      <input
        type="text"
        placeholder="Search..."
        onChange={(e) => handleFilterChange({ q: e.target.value })}
      />

      {/* Results */}
      <p>Total: {totalProducts}</p>
      {isLoading ? (
        <LoadingSpinner />
      ) : (
        products.map(product => (
          <ProductCard key={product.id} product={product} />
        ))
      )}
    </div>
  );
}
```

---

## Related Documentation

- **User Guide**: [USER_GUIDE.md](./USER_GUIDE.md)
- **Quick Reference**: [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)
- **Architecture**: [CATALOG_ARCHITECTURE.md](./CATALOG_ARCHITECTURE.md)
- **Contributing**: [CONTRIBUTING.md](./CONTRIBUTING.md)
- **Testing**: [TESTING_GUIDE.md](./TESTING_GUIDE.md)

---

**Last Updated:** 2025-10-19 | **Version:** 1.0
