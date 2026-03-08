# Admin Catalog TDD Test Strategy

## Overview

This document outlines the comprehensive test-driven development strategy for the Admin Portal catalog enhancement. All tests have been written FIRST and are currently FAILING, following strict TDD red-green-refactor methodology.

## Test-Driven Development Approach

### Phase 1: RED - Write Failing Tests ✅ COMPLETE

We have created comprehensive failing tests that define the expected behavior of the enhanced admin catalog. These tests serve as:

1. **Specifications**: Precise definitions of what the system should do
2. **Design Documents**: Guide implementation decisions
3. **Safety Net**: Ensure features work as expected and prevent regressions
4. **Documentation**: Living documentation of system behavior

### Phase 2: GREEN - Implement Minimum Code (NEXT STEP)

Implement just enough code to make each test pass:
- Start with service layer (catalogService enhancements)
- Then hooks (useAdminProducts, useProductBulkActions, useCatalogStats)
- Then presenter (useAdminCatalogPresenter)
- Finally, UI components (catalog page)

### Phase 3: REFACTOR - Improve Code Quality

Once tests pass:
- Optimize performance
- Improve code organization
- Enhance error handling
- Add edge case handling
- Ensure all tests still pass

## Test Infrastructure

### Test Utilities (`/src/test-utils/`)

**Purpose**: Provide reusable mocks, helpers, and rendering utilities

#### Files Created:
1. **`index.ts`**: Central export for all test utilities
2. **`mock-api.ts`**: Mock API responses and data generators
   - `createMockProduct()`: Generate realistic product mock data
   - `createMockPaginatedResponse()`: Paginated API responses
   - `createMockBulkOperationResult()`: Bulk operation results
   - `createMockCatalogStats()`: Catalog statistics
   - `createMockValidationIssue()`: Validation error mocks

3. **`mock-session.ts`**: NextAuth session mocking
   - `createMockSession()`: Generate authenticated sessions
   - `mockUseSession()`: Mock session hook

4. **`render.tsx`**: Custom React Testing Library setup
   - `createTestQueryClient()`: TanStack Query client for tests
   - `renderWithProviders()`: Render with all necessary providers

5. **`test-data.ts`**: Curated test data scenarios
   - Pre-configured product states (draft, published, with issues, etc.)
   - Edge case data sets
   - Helper functions for test data generation

### Testing Stack

- **Test Runner**: Jest (configured via Next.js)
- **React Testing**: React Testing Library (behavior-focused)
- **User Interactions**: @testing-library/user-event
- **Assertions**: @testing-library/jest-dom
- **Mocking**: Jest mocks with TypeScript support
- **Query Testing**: TanStack Query testing utilities

## Test Layers

### 1. Service Layer Tests

**File**: `/src/services/__tests__/catalog.test.ts`

**Coverage**: 78 tests planned

**What's Tested**:
- ✅ Baseline existing functionality (product CRUD, publish/unpublish)
- ✅ New bulk operations (bulkPublish, bulkUnpublish, bulkDelete, bulkUpdateStatus)
- ✅ Validation and quality features (getValidationSummary, validation issue management)
- ✅ Analytics and statistics (getProductStats with filtering and date ranges)
- ✅ Error handling and retry logic
- ✅ Advanced filtering (multiple statuses, date ranges, validation issues)
- ✅ Export functionality (CSV and JSON)

**Key Test Patterns**:
```typescript
// API client mocking
jest.mock('@/lib/api-client');

// Success scenarios
it('should publish multiple products successfully', async () => {
  const mockResult = createMockBulkOperationResult();
  (apiClient.post as jest.Mock).mockResolvedValueOnce({ data: mockResult });

  const result = await catalogService.bulkPublish(productIds);

  expect(apiClient.post).toHaveBeenCalledWith('/v1/admin/catalog/bulk/publish', { productIds });
  expect(result.data.successful).toHaveLength(3);
});

// Error handling
it('should handle publish errors', async () => {
  const error = createMockApiError({ code: 'VALIDATION_FAILED' });
  (apiClient.post as jest.Mock).mockResolvedValueOnce({ error });

  const result = await catalogService.publishProduct('product-1');

  expect(result.error).toBeDefined();
});

// Validation
it('should validate product IDs before publishing', async () => {
  await expect(catalogService.bulkPublish([])).rejects.toThrow('Product IDs are required');
});
```

### 2. Hook Layer Tests

#### a) useAdminProducts Hook

**File**: `/src/hooks/__tests__/use-admin-products.test.ts`

**Coverage**: 35 tests planned

**What's Tested**:
- ✅ Basic product fetching with loading/success/error states
- ✅ Filtering (status, search query, category, brand, validation issues)
- ✅ Multi-filter combinations
- ✅ Pagination (page, pageSize, metadata)
- ✅ Sorting (by field and order)
- ✅ Refetching and cache invalidation
- ✅ Empty states (no data vs no results)
- ✅ Performance optimization (SWR caching, stale-while-revalidate)

**Key Test Patterns**:
```typescript
// Hook testing with providers
const { result } = renderHook(() => useAdminProducts({ status: 'draft' }), {
  wrapper: ({ children }) => renderWithProviders(children).container,
});

await waitFor(() => {
  expect(result.current.isSuccess).toBe(true);
});

expect(result.current.data?.data).toHaveLength(10);
```

#### b) useProductBulkActions Hook

**File**: `/src/hooks/__tests__/use-product-bulk-actions.test.ts`

**Coverage**: 37 tests planned

**What's Tested**:
- ✅ Selection management (select, deselect, toggle, select all, clear)
- ✅ Bulk publish with success/partial failure scenarios
- ✅ Bulk unpublish with reason parameter
- ✅ Bulk delete with soft delete option
- ✅ Bulk status updates
- ✅ Loading states for all operations
- ✅ Error handling with recovery
- ✅ Callbacks (onSuccess, onError)
- ✅ Query invalidation after operations
- ✅ Optimistic updates

**Key Test Patterns**:
```typescript
// Selection state management
act(() => {
  result.current.selectProduct('product-1');
});

expect(result.current.selectedIds).toEqual(['product-1']);
expect(result.current.isSelected('product-1')).toBe(true);

// Async bulk operations with loading states
let publishPromise: Promise<void>;
act(() => {
  publishPromise = result.current.bulkPublish();
});

expect(result.current.isPublishing).toBe(true);

await act(async () => {
  await publishPromise;
});

expect(result.current.isPublishing).toBe(false);
```

#### c) useCatalogStats Hook

**File**: `/src/hooks/__tests__/use-catalog-stats.test.ts`

**Coverage**: 20 tests planned

**What's Tested**:
- ✅ Basic statistics fetching
- ✅ Date range filtering (specific dates and presets)
- ✅ Category filtering
- ✅ Derived metrics (publish rate, draft rate, avg variants)
- ✅ Attention detection (products needing fixes)
- ✅ Refresh functionality and auto-polling
- ✅ Comparison with previous period
- ✅ Trending indicators
- ✅ Caching strategies

### 3. Presenter Layer Tests

**File**: `/src/features/catalog/hooks/__tests__/useAdminCatalogPresenter.test.ts`

**Coverage**: 40 tests planned

**What's Tested**:
- ✅ State initialization and aggregation
- ✅ Search with debouncing
- ✅ Filter management (status, category, brand)
- ✅ Filter clearing and counting
- ✅ Pagination controls
- ✅ Bulk action coordination
- ✅ Modal state management (publish, unpublish, delete)
- ✅ View mode switching (grid/list)
- ✅ Sorting controls
- ✅ Data refresh coordination
- ✅ Empty state detection

**Key Test Patterns**:
```typescript
// Mocking underlying hooks
mockUseAdminProducts.mockReturnValue({
  data: createMockPaginatedResponse(createMockProducts(10)),
  isLoading: false,
});

// Testing presenter coordination
const { result } = renderHook(() => useAdminCatalogPresenter());

act(() => {
  result.current.handleStatusChange('draft');
});

expect(result.current.selectedStatus).toBe('draft');
expect(result.current.currentPage).toBe(1); // Should reset page
```

### 4. Component Layer Tests

**File**: `/src/app/(dashboard)/catalog/__tests__/page.test.tsx`

**Coverage**: 50+ tests planned

**What's Tested**:
- ✅ Page rendering (loading, data, empty states)
- ✅ Statistics dashboard display
- ✅ Search UI and interactions
- ✅ Filter controls and badges
- ✅ Product grid/list display
- ✅ Bulk action toolbar
- ✅ Pagination UI
- ✅ View mode toggle
- ✅ Sorting controls
- ✅ Confirmation modals
- ✅ Action buttons
- ✅ Accessibility (ARIA labels, keyboard nav, screen readers)

**Key Test Patterns**:
```typescript
// Mocking presenter hook
mockUseAdminCatalogPresenter.mockReturnValue({
  products: createMockProducts(10),
  selectedCount: 3,
  hasSelection: true,
  // ... all presenter state
});

// Testing user interactions
const user = userEvent.setup();
const searchInput = screen.getByPlaceholderText(/search.*products/i);

await user.type(searchInput, 'modern sofa');

expect(handleSearchChange).toHaveBeenCalledWith('modern sofa');

// Testing conditional rendering
expect(screen.queryByTestId('bulk-action-toolbar')).not.toBeInTheDocument();

// With selection
mockUseAdminCatalogPresenter.mockReturnValue({
  ...state,
  selectedCount: 3,
  hasSelection: true,
});

rerender(<CatalogPage />);

expect(screen.getByTestId('bulk-action-toolbar')).toBeInTheDocument();
```

## Test Organization Principles

### 1. Behavior-Driven Testing
- Test **what** the code does, not **how** it does it
- Focus on user-facing behavior and API contracts
- Avoid testing implementation details

### 2. Test Isolation
- Each test is independent and can run in any order
- Mock external dependencies consistently
- Clear all mocks between tests

### 3. Descriptive Test Names
```typescript
// ✅ Good: Describes behavior and expectation
it('should publish multiple products successfully')
it('should handle partial failures during bulk publish')
it('should prevent publish when no products selected')

// ❌ Bad: Implementation-focused
it('should call API endpoint')
it('should update state')
```

### 4. Arrange-Act-Assert Pattern
```typescript
it('should filter products by status', async () => {
  // Arrange: Set up test data and mocks
  const mockProducts = createMockProducts(5);
  (catalogService.getProducts as jest.Mock).mockResolvedValueOnce({ data: mockProducts });

  // Act: Perform the action
  const { result } = renderHook(() => useAdminProducts({ status: 'draft' }));

  // Assert: Verify expectations
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(catalogService.getProducts).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'draft' })
  );
});
```

### 5. Edge Case Coverage
Every feature includes tests for:
- ✅ Happy path (success)
- ✅ Error scenarios (network, validation, server errors)
- ✅ Empty states (no data, no results)
- ✅ Boundary conditions (empty arrays, max limits)
- ✅ Loading states
- ✅ Permission/authorization failures

## Running the Tests

### Run All Tests
```bash
cd apps/admin-portal
pnpm test
```

### Run Specific Test File
```bash
pnpm test catalog.test.ts
pnpm test use-admin-products.test.ts
```

### Watch Mode (for TDD)
```bash
pnpm test:watch
```

### Coverage Report
```bash
pnpm test:coverage
```

## Expected Test Results (Current State)

### All Tests Should FAIL

Since we're in the RED phase, all tests are expected to fail with errors like:

```
FAIL  src/services/__tests__/catalog.test.ts
  ● catalogService › Bulk Operations › bulkPublish › should publish multiple products successfully

    TypeError: catalogService.bulkPublish is not a function
```

```
FAIL  src/hooks/__tests__/use-admin-products.test.ts
  ● useAdminProducts › Basic product fetching › should fetch products successfully

    Error: Cannot find module '@/hooks/use-admin-products'
```

This is **EXPECTED** and **CORRECT** for TDD Phase 1.

## Implementation Order (Phase 2)

Once all tests are in place, implement in this order:

1. **Service Layer** (1-2 hours)
   - Add new methods to `/src/services/catalog.ts`
   - `bulkPublish`, `bulkUnpublish`, `bulkDelete`
   - `getProductStats`, `getValidationSummary`
   - Enhanced filtering parameters

2. **Hook: useAdminProducts** (1-2 hours)
   - Create `/src/hooks/use-admin-products.ts`
   - TanStack Query integration
   - Filter and pagination logic

3. **Hook: useProductBulkActions** (2-3 hours)
   - Create `/src/hooks/use-product-bulk-actions.ts`
   - Selection state management
   - Mutation hooks for bulk operations

4. **Hook: useCatalogStats** (1 hour)
   - Create `/src/hooks/use-catalog-stats.ts`
   - Statistics fetching and derived metrics

5. **Presenter: useAdminCatalogPresenter** (2-3 hours)
   - Create `/src/features/catalog/hooks/useAdminCatalogPresenter.ts`
   - Coordinate all hooks
   - Manage UI state and modal logic

6. **UI Components** (4-5 hours)
   - Update `/src/app/(dashboard)/catalog/page.tsx`
   - Build sub-components (BulkActionToolbar, FilterPanel, etc.)
   - Implement modals and confirmations

## Success Criteria

### Phase 2 Complete When:
- ✅ All 260+ tests pass
- ✅ No skipped or pending tests
- ✅ Test coverage > 80% for new code
- ✅ All edge cases handled
- ✅ Error states properly displayed
- ✅ Loading states smooth

### Phase 3 Complete When:
- ✅ Code follows best practices
- ✅ No code duplication
- ✅ Performance optimized
- ✅ All tests still pass
- ✅ Documentation complete

## Test Maintenance

### Adding New Features
1. Write failing tests first
2. Implement minimum code to pass
3. Refactor while keeping tests green
4. Update this document

### Modifying Existing Features
1. Update tests to reflect new expectations
2. Ensure tests fail appropriately
3. Modify implementation
4. Verify all tests pass

### Debugging Failing Tests
1. Read error message carefully
2. Check mock setup
3. Verify test data
4. Use `debug()` from RTL for DOM inspection
5. Check async handling with `waitFor`

## Best Practices

### DO:
✅ Write tests before implementation (TDD)
✅ Test user-facing behavior
✅ Use meaningful test descriptions
✅ Mock external dependencies
✅ Test error scenarios
✅ Test loading states
✅ Test empty states
✅ Use `screen.getByRole` for accessibility
✅ Use `waitFor` for async operations
✅ Clean up mocks between tests

### DON'T:
❌ Test implementation details
❌ Write tests after implementation
❌ Skip error scenarios
❌ Ignore async warnings
❌ Use `getByTestId` when semantic queries available
❌ Share state between tests
❌ Mock too much (test integration when possible)
❌ Ignore accessibility

## Resources

- [React Testing Library Docs](https://testing-library.com/react)
- [TanStack Query Testing Guide](https://tanstack.com/query/latest/docs/react/guides/testing)
- [Jest Documentation](https://jestjs.io/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

## Conclusion

This comprehensive test suite provides:
1. **Confidence**: Know features work as expected
2. **Safety**: Prevent regressions
3. **Documentation**: Living spec of system behavior
4. **Design**: Guide implementation decisions
5. **Speed**: Faster development with immediate feedback

By following TDD strictly, we ensure high-quality, maintainable code that meets all requirements.
