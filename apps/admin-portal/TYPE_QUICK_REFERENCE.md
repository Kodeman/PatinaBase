# Admin Catalog Types - Quick Reference

## Quick Import Guide

```typescript
// Domain types (filters, state, validation)
import type {
  AdminProductFilters,
  AdminProduct,
  ProductListItem,
  BulkSelection,
  BulkActionResult,
  CatalogStats,
  ProductValidationIssue,
  AdminCatalogState,
} from '@/types';

// Service types (API operations)
import type {
  ICatalogService,
  CreateProductRequest,
  UpdateProductRequest,
  CatalogServiceResponse,
  CatalogErrorCode,
} from '@/types';

// Hook types (React hooks)
import type {
  UseProductsResult,
  CatalogPresenter,
  UseCatalogPresenterOptions,
} from '@/types';

// Utilities (type guards, helpers)
import {
  isPublishedProduct,
  hasValidationIssues,
  isAdminProduct,
  CatalogQueryKeys,
} from '@/types';
```

## Common Patterns Cheat Sheet

### 1. Product Filtering
```typescript
const [filters, setFilters] = useState<AdminProductFilters>({
  status: 'published',
  hasValidationIssues: false,
  priceMin: 100,
  priceMax: 1000,
  page: 1,
  pageSize: 24,
});
```

### 2. Type-Safe Filter Updates
```typescript
const updateFilter = <K extends keyof AdminProductFilters>(
  key: K,
  value: AdminProductFilters[K]
) => {
  setFilters(prev => ({ ...prev, [key]: value }));
};

// Usage - TypeScript validates key and value
updateFilter('status', 'published'); // ✅
updateFilter('status', 'invalid');   // ❌ Type error
```

### 3. Bulk Selection
```typescript
const [selection, setSelection] = useState<BulkSelection>({
  selectedIds: new Set(),
  isAllSelected: false,
  excludedIds: new Set(),
});

// Add to selection
setSelection(prev => ({
  ...prev,
  selectedIds: new Set([...prev.selectedIds, productId]),
}));
```

### 4. Using Type Guards
```typescript
function ProductCard({ product }: { product: AdminProduct }) {
  // Type narrowing
  if (isPublishedProduct(product)) {
    // product.publishedAt is guaranteed to exist
    return <PublishedDate date={product.publishedAt} />;
  }

  if (hasValidationIssues(product)) {
    // product.validation is guaranteed to exist
    return <ValidationBadge count={product.validation.issueCount.error} />;
  }

  return <DraftBadge />;
}
```

### 5. Custom Hooks with TanStack Query
```typescript
function useProducts(filters: AdminProductFilters): UseProductsResult {
  const query = useQuery({
    queryKey: CatalogQueryKeys.productsList(filters),
    queryFn: () => catalogService.getProducts(filters),
  });

  return {
    ...query,
    products: query.data?.data?.data ?? [],
    totalProducts: query.data?.data?.meta.total ?? 0,
    hasNextPage: /* computed */,
  };
}
```

### 6. Mutations
```typescript
const createProduct = useMutation({
  mutationKey: CatalogMutationKeys.createProduct,
  mutationFn: (data: CreateProductRequest) =>
    catalogService.createProduct(data),
  onSuccess: (response) => {
    // response.data is AdminProduct
    queryClient.invalidateQueries({ queryKey: CatalogQueryKeys.products() });
  },
});

// Usage
createProduct.mutate({
  name: 'New Product',
  brand: 'Brand Name',
  status: 'draft',
  // TypeScript validates required fields
});
```

### 7. Service Implementation
```typescript
class CatalogService implements ICatalogService {
  async getProducts(
    params?: AdminProductFilters
  ): Promise<CatalogServiceResponse<PaginatedResponse<ProductListItem>>> {
    return apiClient.get('/v1/products', { params });
  }

  async createProduct(
    data: CreateProductRequest
  ): Promise<CatalogServiceResponse<AdminProduct>> {
    return apiClient.post('/v1/products', data);
  }
}
```

### 8. Error Handling
```typescript
import { isCatalogServiceError, CatalogErrorCode } from '@/types';

try {
  await catalogService.createProduct(data);
} catch (error) {
  if (isCatalogServiceError(error)) {
    switch (error.code) {
      case CatalogErrorCode.PRODUCT_VALIDATION_FAILED:
        showValidationErrors(error.details);
        break;
      case CatalogErrorCode.PRODUCT_ALREADY_EXISTS:
        showDuplicateError();
        break;
      default:
        showGenericError();
    }
  }
}
```

### 9. Presenter Pattern
```typescript
function CatalogPage() {
  const catalog = useCatalogPresenter({
    initialFilters: { status: 'published' },
    enableBulkOperations: true,
  });

  return (
    <>
      <FilterPanel
        filters={catalog.state.filters}
        onFilterChange={catalog.setFilters}
        activeFilters={catalog.activeFilters}
      />

      <ProductGrid
        products={catalog.products}
        selection={catalog.state.bulkSelection}
        onSelect={catalog.selectProduct}
        onBulkAction={catalog.executeBulkAction}
      />
    </>
  );
}
```

### 10. Form with Validation
```typescript
import { useForm } from 'react-hook-form';
import type { CreateProductRequest } from '@/types';

function ProductForm() {
  const form = useForm<CreateProductRequest>({
    defaultValues: {
      name: '',
      brand: '',
      category: '',
      shortDescription: '',
      price: 0,
      currency: 'USD',
      status: 'draft',
    },
  });

  const onSubmit = async (data: CreateProductRequest) => {
    await catalogService.createProduct(data);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <Input {...form.register('name', { required: true })} />
      <Input {...form.register('brand', { required: true })} />
      {/* TypeScript validates field names */}
    </form>
  );
}
```

## Type Guard Reference

| Guard | Purpose | Returns |
|-------|---------|---------|
| `isAdminProduct(x)` | Check if AdminProduct | `x is AdminProduct` |
| `isProductListItem(x)` | Check if list item | `x is ProductListItem` |
| `isPublishedProduct(x)` | Check if published | `x is PublishedProduct` |
| `hasValidationIssues(x)` | Check if has issues | `x is ProductWithIssues` |
| `has3DModel(x)` | Check if has 3D | `x is ProductWith3D` |
| `hasVariants(x)` | Check if has variants | `x is ProductWithVariants` |
| `isValidationIssue(x)` | Check if validation issue | `x is ProductValidationIssue` |
| `isProductStatus(x)` | Check if valid status | `x is ProductStatus` |
| `isUUID(x)` | Check if valid UUID | `x is UUID` |

## Filter Keys by Type

```typescript
// String filters
'q' | 'categoryId' | 'brand' | 'vendorId' | 'imageLicense' | 'sortBy'

// Number filters
'priceMin' | 'priceMax' | 'imageCount' | 'lowStockThreshold' | 'page' | 'pageSize'

// Boolean filters
'isPublished' | 'hasValidationIssues' | 'hasVariants' | 'has3D' | 'arSupported' | 'customizable' | 'onSale' | 'inStock' | 'lowStock' | 'hasImages'

// Date filters
'createdAfter' | 'createdBefore' | 'updatedAfter' | 'updatedBefore' | 'publishedAfter' | 'publishedBefore'

// Array filters
'status' | 'availability' | 'tags' | 'categoryId' | 'brand' | 'vendorId'
```

## Query Key Patterns

```typescript
// All products
CatalogQueryKeys.products()

// Products with filters
CatalogQueryKeys.productsList(filters)

// Single product
CatalogQueryKeys.product(productId)

// Product validation
CatalogQueryKeys.productValidation(productId)

// Statistics
CatalogQueryKeys.stats(filters)

// Categories
CatalogQueryKeys.categories()
CatalogQueryKeys.categoryTree()

// Collections
CatalogQueryKeys.collections(filters)
```

## Mutation Key Patterns

```typescript
CatalogMutationKeys.createProduct
CatalogMutationKeys.updateProduct
CatalogMutationKeys.deleteProduct
CatalogMutationKeys.publishProduct
CatalogMutationKeys.duplicateProduct
CatalogMutationKeys.bulkAction
CatalogMutationKeys.uploadMedia
CatalogMutationKeys.exportProducts
```

## Common Utility Types

```typescript
// Make specific keys optional
type PartialProduct = Optional<AdminProduct, 'coverImage' | 'publishedAt'>;

// Make specific keys required
type RequiredProduct = Required<AdminProduct, 'validation' | 'variants'>;

// Deep partial (all keys optional recursively)
type DraftProduct = DeepPartial<AdminProduct>;

// Extract keys by value type
type StringKeys = KeysOfType<AdminProduct, string>;
type NumberKeys = KeysOfType<AdminProduct, number>;

// Non-nullable version
type CompleteProduct = NonNullableProps<AdminProduct>;
```

## Bulk Operation Types

```typescript
type BulkActionType =
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

// Type-safe bulk request
const request: BulkActionRequest = {
  action: 'publish',
  selection: bulkSelection,
  filters: currentFilters,
  payload: { scheduledAt: new Date() },
};
```

## Error Code Reference

```typescript
enum CatalogErrorCode {
  // Product errors
  PRODUCT_NOT_FOUND = 'PRODUCT_NOT_FOUND',
  PRODUCT_ALREADY_EXISTS = 'PRODUCT_ALREADY_EXISTS',
  PRODUCT_VALIDATION_FAILED = 'PRODUCT_VALIDATION_FAILED',
  PRODUCT_CANNOT_PUBLISH = 'PRODUCT_CANNOT_PUBLISH',

  // Variant errors
  VARIANT_NOT_FOUND = 'VARIANT_NOT_FOUND',
  VARIANT_SKU_DUPLICATE = 'VARIANT_SKU_DUPLICATE',

  // Category errors
  CATEGORY_NOT_FOUND = 'CATEGORY_NOT_FOUND',
  CATEGORY_HAS_PRODUCTS = 'CATEGORY_HAS_PRODUCTS',

  // Bulk errors
  BULK_OPERATION_FAILED = 'BULK_OPERATION_FAILED',
  BULK_OPERATION_TIMEOUT = 'BULK_OPERATION_TIMEOUT',

  // Generic errors
  INVALID_REQUEST = 'INVALID_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}
```

## Tips & Tricks

### Tip 1: Use Type Inference
```typescript
// ❌ Don't over-annotate
const products: ProductListItem[] = catalog.products;

// ✅ Let TypeScript infer
const products = catalog.products; // Already ProductListItem[]
```

### Tip 2: Leverage Const Assertions
```typescript
// ✅ Use const assertion for query keys
const queryKey = ['products', productId] as const;
```

### Tip 3: Use Discriminated Unions
```typescript
// ✅ Type-safe conditional rendering
function ProductStatus({ product }: { product: AdminProduct }) {
  switch (product.status) {
    case 'draft': return <DraftBadge />;
    case 'in_review': return <ReviewBadge />;
    case 'published': return <PublishedBadge />;
    case 'deprecated': return <DeprecatedBadge />;
    // TypeScript ensures exhaustive checking
  }
}
```

### Tip 4: Use Type Guards for Safety
```typescript
// ❌ Unsafe
const date = product.publishedAt!.toISOString();

// ✅ Safe with type guard
if (isPublishedProduct(product)) {
  const date = product.publishedAt.toISOString();
}
```

### Tip 5: Branded IDs Prevent Mistakes
```typescript
const productId = createProductId('...');
const categoryId = createCategoryId('...');

getProduct(categoryId); // ❌ Type error - prevents bugs!
getProduct(productId);  // ✅ Correct
```

## Performance Tips

1. **Use Query Key Factories**: `CatalogQueryKeys.productsList(filters)`
2. **Memoize Filter Objects**: Prevent unnecessary re-renders
3. **Use `as const`**: Improve type inference and reduce allocations
4. **Leverage Type Inference**: Less runtime overhead from checks
5. **Use Set for Selections**: O(1) lookup vs O(n) for arrays

## Common Gotchas

### Gotcha 1: Optional Chaining
```typescript
// ❌ TypeScript can't narrow through optional chaining
const count = product.validation?.issues.length;

// ✅ Use type guard
if (hasValidationIssues(product)) {
  const count = product.validation.issues.length;
}
```

### Gotcha 2: Array Filter with Guards
```typescript
// ❌ Type not narrowed
const published = products.filter(p => p.status === 'published');
// published is still AdminProduct[]

// ✅ Use type guard
const published = products.filter(isPublishedProduct);
// published is PublishedProduct[]
```

### Gotcha 3: Mutation Variables
```typescript
// ❌ Inline object loses type safety
createProduct.mutate({ name: 'Test' });

// ✅ Define variable with type
const data: CreateProductRequest = { name: 'Test', /* ... */ };
createProduct.mutate(data);
```

## Resources

- **Full Architecture**: `/src/types/TYPE_ARCHITECTURE.md`
- **Type Files**: `/src/types/admin-catalog.ts`, `catalog-service.ts`, `catalog-hooks.ts`, `catalog-utils.ts`
- **Examples**: See usage patterns above

---

**Keep this reference handy while developing catalog features!**
