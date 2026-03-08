# Admin Portal Catalog Type Architecture

**Author**: TypeScript Pro
**Date**: 2025-10-19
**Phase**: 1 - Type System Enhancement
**Status**: Complete

## Executive Summary

This document describes the comprehensive, type-safe type system implemented for the admin portal catalog functionality. The type system is built on strict TypeScript principles, leveraging advanced type features to ensure compile-time safety, excellent developer experience, and maintainability.

## Architecture Overview

### Design Principles

1. **Single Source of Truth**: Extend types from `@patina/types` rather than duplicating them
2. **Strict Type Safety**: Leverage TypeScript's strict mode with no `any` types
3. **Type Inference**: Design types to enable maximum type inference in components
4. **Developer Experience**: Provide clear type errors and auto-completion
5. **Modularity**: Organize types by concern (state, service, hooks, utilities)
6. **Documentation**: Include JSDoc comments for complex types

### Type System Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    Component Layer                          │
│          (React components consume types)                   │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────┐
│                    Hooks Layer                              │
│   catalog-hooks.ts - TanStack Query & custom hook types    │
│   - UseProductsResult, CatalogPresenter                     │
│   - Query keys, mutation types                              │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────┐
│                  Service Layer                              │
│   catalog-service.ts - API operation types                  │
│   - ICatalogService interface                               │
│   - Request/Response types                                  │
│   - Error types with error codes                            │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────┐
│                   Domain Layer                              │
│   admin-catalog.ts - Business logic types                   │
│   - AdminProductFilters                                     │
│   - BulkSelection, BulkActionResult                         │
│   - CatalogStats, ValidationIssue                           │
│   - AdminCatalogState                                       │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────┐
│                  Utility Layer                              │
│   catalog-utils.ts - Helper types & type guards             │
│   - Type guards (isAdminProduct, hasVariants)               │
│   - Mapped types (Optional, Required, DeepPartial)          │
│   - Utility classes (UniqueCollection)                      │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────┐
│                 Foundation Layer                            │
│   @patina/types - Shared types across monorepo              │
│   - Product, Variant, Category                              │
│   - Common types (UUID, Timestamps, PaginatedResponse)      │
└─────────────────────────────────────────────────────────────┘
```

## File Organization

### `/src/types/admin-catalog.ts`

**Purpose**: Admin-specific domain types for catalog management.

**Key Types**:

- **AdminProductFilters**: Extended filters with admin-only features
  - Validation filters (`hasValidationIssues`, `validationSeverity`)
  - Feature flags (`has3D`, `arSupported`, `customizable`)
  - Date ranges (`createdAfter`, `publishedBefore`)
  - Advanced filtering (by vendor, tags, pricing, inventory)

- **BulkSelection**: Manages bulk product selection
  - Supports explicit selection (`selectedIds`)
  - Supports "select all with exclusions" pattern
  - Computed properties for selection count

- **BulkActionRequest & BulkActionResult**: Type-safe bulk operations
  - 11 bulk action types (publish, delete, update, export, etc.)
  - Success/failure tracking per item
  - Performance metadata

- **CatalogStats & CatalogTrends**: Dashboard statistics
  - Product counts by status/availability
  - Validation issue breakdowns
  - Media and pricing statistics
  - Time-series trend data

- **ProductValidationIssue**: Enhanced validation with admin features
  - Severity levels (error, warning, info)
  - Auto-fix capabilities
  - Resolution tracking
  - Blocking issue identification

- **AdminCatalogState**: Complete UI state management
  - View configuration (grid/list/table)
  - Filter state with active filter tracking
  - Bulk selection state
  - Pagination and sorting
  - Feature flags

- **AdminProduct**: Extended product with admin metadata
  - Validation status
  - Audit trail (createdBy, updatedBy, publishedBy)
  - Performance metrics (views, conversions, revenue)
  - Internal notes and priorities

**Design Decisions**:

1. Extend `SearchQuery` from `@patina/types` rather than redefine
2. Use `Set<string>` for selections (O(1) lookup)
3. Separate "active" state from "computed" properties
4. Use discriminated unions for action types

### `/src/types/catalog-service.ts`

**Purpose**: Service layer types for API operations.

**Key Types**:

- **ICatalogService**: Complete service interface
  - Product CRUD operations
  - Publishing operations with scheduling
  - Bulk operations with progress tracking
  - Validation operations
  - Category, collection, vendor operations
  - Media upload and management
  - Import/export operations
  - Filter management

- **Request Types**: Strongly-typed request payloads
  - `CreateProductRequest` - Required fields enforced
  - `UpdateProductRequest` - All fields optional (partial update)
  - Type-safe nested objects (dimensions, weight)
  - Validation at the type level

- **CatalogServiceResponse<T>**: Standardized response wrapper
  - Extends base `ApiResponse<T>`
  - Includes request metadata (requestId, duration)
  - Deprecation warnings for API evolution

- **Filter Types**: Specialized filters per operation
  - `ValidationIssueFilters` - Filter validation issues
  - `CategoryFilters` - Filter categories
  - `CollectionFilters` - Filter collections with pagination
  - `VendorFilters` - Filter vendors with sorting

- **CatalogErrorCode**: Enum of error codes
  - Enables exhaustive error handling
  - Clear error categorization
  - Type-safe error checking with `isCatalogServiceError` guard

- **Utility Types**: Type extraction and manipulation
  - `CatalogServiceMethod` - Extract method names
  - `CatalogServiceParams<T>` - Extract parameter types
  - `UnwrapPromise<T>` - Extract resolved value from Promise
  - `ExtractData<T>` - Extract data from response wrapper

**Design Decisions**:

1. Interface-based design for easy mocking and testing
2. Separate create/update types (required vs optional fields)
3. Error codes as enum for exhaustive matching
4. Generic response wrapper for consistent structure
5. Utility types for DRY principle in hook implementations

### `/src/types/catalog-hooks.ts`

**Purpose**: Custom React hook types for TanStack Query integration.

**Key Types**:

- **Query Hook Results**: Extended `UseQueryResult` with computed properties
  - `UseProductsResult` - Products with pagination helpers
  - `UseProductResult` - Single product with direct data access
  - `UseCatalogStatsResult` - Statistics with quick access
  - Additional computed properties (`hasNextPage`, `canPublish`)

- **Mutation Hook Results**: Type-safe mutations
  - `UseCreateProductResult` - Create with optimistic updates
  - `UseBulkActionResult` - Bulk operations with progress
  - Proper error typing for error boundaries

- **CatalogPresenter**: Presenter pattern interface
  - Encapsulates all catalog state and actions
  - 40+ methods for complete catalog management
  - Computed properties for derived state
  - Type-safe filter updates
  - Bulk selection management
  - Complete CRUD operations

- **Hook Options**: Configuration types
  - `UseProductsOptions` - Query configuration
  - `UseMutationOptions` - Mutation callbacks
  - `UseCatalogPresenterOptions` - Presenter initialization

- **Cache Keys**: Query key factories
  - `CatalogQueryKeys` - Hierarchical query keys
  - `CatalogMutationKeys` - Mutation identifiers
  - Enables precise cache invalidation

**Design Decisions**:

1. Extend TanStack Query types rather than wrap them
2. Add computed properties for common operations
3. Presenter pattern for complex state management
4. Query key factories prevent key duplication
5. Type-safe mutation variables and responses

### `/src/types/catalog-utils.ts`

**Purpose**: Helper types, type guards, and utility functions.

**Key Types**:

- **Type Guards**: Runtime type checking
  - `isAdminProduct` - Validate AdminProduct shape
  - `isPublishedProduct` - Narrow to published products
  - `hasValidationIssues` - Type narrowing with proof
  - `isUUID` - Validate UUID format with regex
  - All guards provide type narrowing for TypeScript

- **Mapped Types**: Generic type transformations
  - `Optional<T, K>` - Make specific keys optional
  - `Required<T, K>` - Make specific keys required
  - `DeepPartial<T>` - Recursively make all keys optional
  - `KeysOfType<T, U>` - Extract keys by value type
  - `DeepReadonly<T>` - Recursively make readonly

- **Narrowed Types**: Specific product types
  - `PublishedProduct` - Product with published status
  - `ProductWithIssues` - Product with validation issues
  - `ProductWith3D` - Product with 3D model
  - `ProductWithVariants` - Product with non-empty variants

- **Filter Utilities**: Filter-specific helpers
  - `FilterKeysByType<T>` - Extract filter keys by value type
  - `ActiveFilters` - Non-undefined filter values
  - `FilterUpdate` - Type-safe filter update payload

- **Brand Types**: Nominal typing for IDs
  - `ProductId`, `CategoryId`, `VendorId` - Prevent ID mix-ups
  - `createProductId` - Type-safe ID creation

- **UniqueCollection<T, K>**: Generic collection class
  - Ensures uniqueness by key field
  - Type-safe add/remove/has operations

**Design Decisions**:

1. Type guards use runtime checks with type narrowing
2. Mapped types follow TypeScript conventions
3. Narrowed types use intersection types
4. Brand types prevent accidental ID confusion
5. Utility classes provide type-safe collections

## Type Safety Features

### Strict Null Checking

All types are designed for strict null checking:

```typescript
// ✅ Explicit optional properties
interface ProductValidation {
  productId: string;
  isValid: boolean;
  issues: ProductValidationIssue[];  // Always array, never undefined
  lastChecked: Date;
  canPublish: boolean;
  blockingIssues?: ProductValidationIssue[];  // Explicitly optional
}

// ✅ Non-null assertions only when guaranteed
export function isPublishedProduct(product: AdminProduct): product is PublishedProduct {
  return product.status === 'published' && product.publishedAt !== undefined;
}
```

### Discriminated Unions

Used for type-safe conditional logic:

```typescript
// Bulk action result discriminated by success
export interface BulkActionItemResult {
  id: string;
  success: boolean;
  error?: string;  // Only present when success is false
  errorCode?: string;
  warnings?: string[];
}

// Type narrowing works automatically
function handleResult(result: BulkActionItemResult) {
  if (result.success) {
    // TypeScript knows error is undefined here
  } else {
    // TypeScript knows error may be present here
    console.error(result.error);
  }
}
```

### Generic Constraints

Ensure type safety with generics:

```typescript
// Filter updater with key constraint
export type FilterUpdater = <K extends ProductFilterKey>(
  key: K,
  value: AdminProductFilters[K]  // Value type matches key
) => void;

// Service method type extraction
export type CatalogServiceReturn<T extends CatalogServiceMethod> =
  ReturnType<ICatalogService[T]>;
```

### Template Literal Types

Used in query keys for type safety:

```typescript
export const CatalogQueryKeys = {
  all: ['catalog'] as const,
  products: () => [...CatalogQueryKeys.all, 'products'] as const,
  product: (id: UUID) => [...CatalogQueryKeys.products(), 'detail', id] as const,
  // TypeScript enforces correct key structure
} as const;
```

## Usage Patterns

### Component Usage

```typescript
import type {
  AdminProduct,
  AdminProductFilters,
  BulkSelection,
  ProductValidationIssue
} from '@/types';

// ✅ Full type inference in components
function ProductCard({ product }: { product: AdminProduct }) {
  // TypeScript knows all product properties
  const hasIssues = product.hasValidationIssues;
  const issueCount = product.validation?.issueCount.error ?? 0;

  // Type guard provides narrowing
  if (isPublishedProduct(product)) {
    // TypeScript knows publishedAt is defined here
    console.log(product.publishedAt.toISOString());
  }
}
```

### Hook Usage

```typescript
import {
  UseProductsResult,
  UseCatalogPresenterResult,
  AdminProductFilters
} from '@/types';

// ✅ Strongly-typed hook implementation
function useProducts(filters: AdminProductFilters): UseProductsResult {
  const query = useQuery({
    queryKey: CatalogQueryKeys.productsList(filters),
    queryFn: () => catalogService.getProducts(filters),
  });

  return {
    ...query,
    products: query.data?.data?.data ?? [],
    totalProducts: query.data?.data?.meta.total ?? 0,
    currentPage: filters.page ?? 1,
    totalPages: query.data?.data?.meta.totalPages ?? 0,
    hasNextPage: (filters.page ?? 1) < (query.data?.data?.meta.totalPages ?? 0),
    hasPreviousPage: (filters.page ?? 1) > 1,
  };
}
```

### Service Usage

```typescript
import type {
  ICatalogService,
  CreateProductRequest,
  CatalogServiceResponse
} from '@/types';

// ✅ Type-safe service implementation
class CatalogService implements ICatalogService {
  async createProduct(
    data: CreateProductRequest
  ): Promise<CatalogServiceResponse<AdminProduct>> {
    // TypeScript validates all required fields
    return apiClient.post('/v1/products', data);
  }

  async bulkAction(
    request: BulkActionRequest
  ): Promise<CatalogServiceResponse<BulkActionResult>> {
    // Type-safe bulk operations
    return apiClient.post('/v1/bulk-actions', request);
  }
}
```

### Presenter Pattern Usage

```typescript
import type {
  CatalogPresenter,
  UseCatalogPresenterOptions
} from '@/types';

// ✅ Encapsulated state management
function useCatalogPresenter(
  options?: UseCatalogPresenterOptions
): CatalogPresenter {
  const [state, setState] = useState<AdminCatalogState>(/* ... */);

  return {
    state,
    products: /* computed */,
    isLoading: /* computed */,

    // Type-safe filter updates
    updateFilter: <K extends keyof AdminProductFilters>(
      key: K,
      value: AdminProductFilters[K]
    ) => {
      setState((prev) => ({
        ...prev,
        filters: { ...prev.filters, [key]: value }
      }));
    },

    // All other presenter methods...
  };
}
```

## Type Safety Guarantees

### Compile-Time Guarantees

1. **No `any` types**: All types explicitly defined
2. **Required field validation**: TypeScript enforces required fields
3. **Type narrowing**: Type guards provide compile-time guarantees
4. **Exhaustive checking**: Discriminated unions enable exhaustive switches
5. **Generic constraints**: Generics prevent type mismatches

### Runtime Safety

1. **Type guards**: Runtime validation with type narrowing
2. **Validation utilities**: `isUUID`, `isDate`, `isNonEmptyArray`
3. **Brand types**: Prevent ID confusion at runtime
4. **Error code enum**: Exhaustive error handling

### Developer Experience

1. **Auto-completion**: Full IntelliSense support
2. **Type inference**: Minimal type annotations needed
3. **Clear errors**: Descriptive type error messages
4. **JSDoc comments**: Inline documentation
5. **Type utilities**: Reduce boilerplate with mapped types

## Integration Points

### TanStack Query

- Query result types extend `UseQueryResult<T, E>`
- Mutation types extend `UseMutationResult<T, E, V, C>`
- Query keys use const assertions for type safety
- Optimistic update context types for rollbacks

### Zustand

- `AdminCatalogState` serves as store state type
- Actions return updated state for immutability
- Selectors use type inference from state

### React Hook Form

- `CreateProductRequest` serves as form schema
- Field validation uses discriminated unions
- Error types match validation issue types

### API Client

- `ICatalogService` defines all API methods
- Request/response types ensure API contract
- Error types enable error boundary handling

## Testing Implications

### Type-Safe Mocking

```typescript
// ✅ Mock with full type safety
const mockCatalogService: ICatalogService = {
  getProducts: vi.fn(),
  getProduct: vi.fn(),
  createProduct: vi.fn(),
  // TypeScript ensures all methods implemented
};
```

### Test Data Factories

```typescript
// ✅ Type-safe test data
function createMockProduct(overrides?: Partial<AdminProduct>): AdminProduct {
  return {
    id: 'test-id',
    name: 'Test Product',
    brand: 'Test Brand',
    status: 'draft',
    hasValidationIssues: false,
    // TypeScript validates required fields
    ...overrides,
  };
}
```

## Migration Guide

### From Existing Code

1. **Update imports**:
   ```typescript
   // ❌ Before
   import { Product } from '@patina/types';

   // ✅ After
   import type { AdminProduct } from '@/types';
   ```

2. **Use specialized types**:
   ```typescript
   // ❌ Before
   interface ProductFilters {
     status?: string;
   }

   // ✅ After
   import type { AdminProductFilters } from '@/types';
   ```

3. **Leverage type guards**:
   ```typescript
   // ❌ Before
   if (product.status === 'published') {
     console.log(product.publishedAt!);  // Non-null assertion
   }

   // ✅ After
   if (isPublishedProduct(product)) {
     console.log(product.publishedAt);  // Type narrowed
   }
   ```

## Future Enhancements

### Planned Additions

1. **Zod Integration**: Runtime validation with static types
2. **GraphQL Types**: Generated types from GraphQL schema
3. **OpenAPI Types**: Generated types from OpenAPI spec
4. **Type-Level Validation**: Branded types for validated data
5. **Effect-TS Integration**: Functional error handling types

### Maintenance Notes

1. **Version Sync**: Keep in sync with `@patina/types`
2. **Breaking Changes**: Document in migration guide
3. **Type Coverage**: Maintain 100% type coverage
4. **Performance**: Monitor compilation time
5. **Documentation**: Update JSDoc comments

## Best Practices

### Do's ✅

- Extend types from `@patina/types`
- Use type guards for runtime validation
- Provide JSDoc comments for complex types
- Use discriminated unions for conditional logic
- Leverage type inference over explicit annotations
- Use branded types for domain IDs
- Create utility types for common patterns

### Don'ts ❌

- Don't use `any` type
- Don't duplicate types from `@patina/types`
- Don't use type assertions unless necessary
- Don't create overly complex generic types
- Don't skip JSDoc for public APIs
- Don't use string unions without exhaustive checks

## Conclusion

This type system provides a robust, type-safe foundation for the admin portal catalog. It leverages TypeScript's advanced features to ensure compile-time safety while maintaining excellent developer experience through type inference and clear error messages.

The modular architecture allows for easy extension and maintenance, while the comprehensive utility types reduce boilerplate. The integration with TanStack Query, Zustand, and React Hook Form ensures type safety across the entire application stack.

## References

- TypeScript Handbook: https://www.typescriptlang.org/docs/handbook/
- TanStack Query TypeScript: https://tanstack.com/query/latest/docs/typescript
- Advanced TypeScript Patterns: https://www.typescriptlang.org/docs/handbook/2/types-from-types.html
- Patina Types Package: `/home/kody/patina/packages/types/`
