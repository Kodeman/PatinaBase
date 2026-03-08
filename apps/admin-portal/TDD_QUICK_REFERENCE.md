# Admin Catalog TDD - Quick Reference

## 🎯 Current Status: RED Phase Complete ✅

All tests written and intentionally FAILING. Ready for implementation phase.

## 📊 Statistics

- **Total Tests**: 260+
- **Test Files**: 6
- **Infrastructure Files**: 5
- **Total Lines**: ~3,640 lines of test code
- **Expected Failures**: 100% (this is correct for TDD RED phase)

## 📁 File Locations

### Test Files
```
apps/admin-portal/src/
├── services/__tests__/
│   └── catalog.test.ts                    (78 tests - service layer)
├── hooks/__tests__/
│   ├── use-admin-products.test.ts         (35 tests - product fetching)
│   ├── use-product-bulk-actions.test.ts   (37 tests - bulk operations)
│   └── use-catalog-stats.test.ts          (20 tests - statistics)
├── features/catalog/hooks/__tests__/
│   └── useAdminCatalogPresenter.test.ts   (40 tests - presenter coordination)
└── app/(dashboard)/catalog/__tests__/
    └── page.test.tsx                      (50+ tests - UI components)
```

### Test Infrastructure
```
apps/admin-portal/src/test-utils/
├── index.ts              (Central exports)
├── mock-api.ts           (Mock API responses & data generators)
├── mock-session.ts       (NextAuth mocking)
├── render.tsx            (Custom RTL setup with providers)
└── test-data.ts          (Curated test scenarios)
```

## 🔨 Implementation Files to Create

```
apps/admin-portal/src/
├── hooks/
│   ├── use-admin-products.ts          ⬅️ TODO: Create this
│   ├── use-product-bulk-actions.ts    ⬅️ TODO: Create this
│   └── use-catalog-stats.ts           ⬅️ TODO: Create this
└── features/catalog/hooks/
    └── useAdminCatalogPresenter.ts    ⬅️ TODO: Create this
```

### Existing Files to Enhance

```
apps/admin-portal/src/
└── services/
    └── catalog.ts                     ⬅️ TODO: Add new methods
```

## 🚀 Quick Start Commands

### Run All Tests (Expect All to Fail)
```bash
cd /home/kody/patina/apps/admin-portal
pnpm test
```

### Run Specific Test Suite
```bash
# Service tests
pnpm test catalog.test.ts

# Hook tests
pnpm test use-admin-products.test.ts
pnpm test use-product-bulk-actions.test.ts
pnpm test use-catalog-stats.test.ts

# Presenter tests
pnpm test useAdminCatalogPresenter.test.ts

# Component tests
pnpm test page.test.tsx
```

### Watch Mode (for TDD workflow)
```bash
pnpm test:watch
```

### Coverage Report
```bash
pnpm test:coverage
```

## 📝 Implementation Checklist

### Step 1: Service Layer (2 hours)
```typescript
// File: src/services/catalog.ts

- [ ] bulkPublish(productIds: string[])
- [ ] bulkUnpublish(productIds: string[], reason?: string)
- [ ] bulkDelete(productIds: string[], options?: { soft?: boolean })
- [ ] bulkUpdateStatus(productIds: string[], status: string)
- [ ] getProductStats(filters?: { startDate?, endDate?, categoryId? })
- [ ] getValidationSummary(filters?: { severity?, productId? })
- [ ] getProductValidationIssues(productId: string)
- [ ] resolveValidationIssue(issueId: string)
- [ ] getRecentActivity(options?: { limit?: number })
- [ ] exportProducts(options: { format: 'csv' | 'json' })
```

**Run**: `pnpm test catalog.test.ts`
**Goal**: 78 tests pass ✅

### Step 2: useAdminProducts Hook (2 hours)
```typescript
// File: src/hooks/use-admin-products.ts

export function useAdminProducts(options?: {
  query?: string;
  status?: string;
  category?: string;
  brand?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  hasValidationIssues?: boolean;
  enabled?: boolean;
}) {
  // Use TanStack Query
  // Return: { data, isLoading, isError, error, refetch, ... }
}
```

**Run**: `pnpm test use-admin-products.test.ts`
**Goal**: 35 tests pass ✅

### Step 3: useProductBulkActions Hook (3 hours)
```typescript
// File: src/hooks/use-product-bulk-actions.ts

export function useProductBulkActions(options?: {
  clearOnSuccess?: boolean;
  requireConfirmation?: boolean;
  optimistic?: boolean;
  onSuccess?: (result: any) => void;
  onError?: (error: any) => void;
}) {
  // Selection state
  // Mutation hooks for bulk operations
  // Return: { selectedIds, selectProduct, bulkPublish, ... }
}
```

**Run**: `pnpm test use-product-bulk-actions.test.ts`
**Goal**: 37 tests pass ✅

### Step 4: useCatalogStats Hook (1 hour)
```typescript
// File: src/hooks/use-catalog-stats.ts

export function useCatalogStats(options?: {
  startDate?: string;
  endDate?: string;
  categoryId?: string;
  preset?: 'last30days' | 'last7days' | 'thisMonth';
  refreshInterval?: number;
  compare?: boolean;
  staleTime?: number;
}) {
  // Use TanStack Query
  // Calculate derived metrics
  // Return: { data, publishRate, draftRate, needsAttention, ... }
}
```

**Run**: `pnpm test use-catalog-stats.test.ts`
**Goal**: 20 tests pass ✅

### Step 5: useAdminCatalogPresenter Hook (3 hours)
```typescript
// File: src/features/catalog/hooks/useAdminCatalogPresenter.ts

export function useAdminCatalogPresenter() {
  // Coordinate all hooks
  // Manage UI state (search, filters, pagination)
  // Handle bulk actions
  // Manage modals
  // Return: all state + handlers
}
```

**Run**: `pnpm test useAdminCatalogPresenter.test.ts`
**Goal**: 40 tests pass ✅

### Step 6: Update Catalog Page Component (5 hours)
```typescript
// File: src/app/(dashboard)/catalog/page.tsx

export default function CatalogPage() {
  const presenter = useAdminCatalogPresenter();

  // Render:
  // - Stats dashboard
  // - Search bar
  // - Filters
  // - Product grid/list
  // - Bulk action toolbar
  // - Pagination
  // - Modals
}
```

**Run**: `pnpm test page.test.tsx`
**Goal**: 50+ tests pass ✅

## ✅ Verification

After each step, verify:

1. **Tests Pass**: All tests for that layer should pass
2. **No Regressions**: Previous layers still pass
3. **TypeScript**: No type errors
4. **Linting**: No lint errors

```bash
# All tests
pnpm test

# TypeScript
pnpm type-check

# Linting
pnpm lint
```

## 🎨 TDD Workflow

### Classic Red-Green-Refactor

```
1. 🔴 RED: Write failing test (DONE ✅)
2. 🟢 GREEN: Write minimum code to pass (NEXT STEP ⬅️)
3. 🔵 REFACTOR: Improve code while keeping tests green
4. Repeat for each feature
```

### Example Workflow

```bash
# 1. Pick a test file
pnpm test:watch catalog.test.ts

# 2. Implement just enough to make ONE test pass
# 3. Refactor if needed
# 4. Move to next test
# 5. Repeat until all tests pass
```

## 🧪 Test Utilities Usage

### Create Mock Data
```typescript
import {
  createMockProduct,
  createMockProducts,
  createMockPaginatedResponse,
  createMockCatalogStats,
} from '@/test-utils';

// Single product
const product = createMockProduct({ status: 'published' });

// Multiple products
const products = createMockProducts(10);

// Paginated response
const response = createMockPaginatedResponse(products);

// Statistics
const stats = createMockCatalogStats({ totalProducts: 150 });
```

### Render with Providers
```typescript
import { render, screen, waitFor } from '@/test-utils';

test('my component', async () => {
  render(<MyComponent />);

  await waitFor(() => {
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### Mock Session
```typescript
import { createMockSession } from '@/test-utils';

const session = createMockSession({ role: 'admin' });
```

## 📚 Key Resources

### Documentation
- `/apps/admin-portal/ADMIN_CATALOG_TEST_STRATEGY.md` - Full strategy
- `/apps/admin-portal/ADMIN_CATALOG_TDD_SUMMARY.md` - Detailed summary
- `/apps/admin-portal/TDD_QUICK_REFERENCE.md` - This file

### External Docs
- [React Testing Library](https://testing-library.com/react)
- [TanStack Query Testing](https://tanstack.com/query/latest/docs/react/guides/testing)
- [Jest](https://jestjs.io/)

## 🐛 Common Issues

### Issue: Tests not found
```bash
# Make sure you're in the right directory
cd /home/kody/patina/apps/admin-portal

# Clear cache
pnpm test --clearCache
```

### Issue: TypeScript errors in tests
```bash
# Rebuild shared packages
cd /home/kody/patina
pnpm --filter @patina/types build
pnpm --filter @patina/utils build
```

### Issue: Mock not working
```typescript
// Always clear mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
});
```

## 💡 Pro Tips

1. **Work One Test at a Time**: Don't try to implement everything at once
2. **Watch Mode**: Use `pnpm test:watch` for instant feedback
3. **Read Error Messages**: They tell you exactly what to implement
4. **Keep It Simple**: Write minimum code to pass, then refactor
5. **Run All Tests Often**: Ensure no regressions
6. **Commit Often**: After each passing test or small set of tests

## 🎯 Success Criteria

Phase 2 complete when:
- ✅ All 260+ tests pass
- ✅ No TypeScript errors
- ✅ No ESLint warnings
- ✅ Test coverage > 80%
- ✅ All features working in UI

## 📞 Need Help?

Refer to:
1. Test error messages (they're very descriptive)
2. ADMIN_CATALOG_TEST_STRATEGY.md (detailed patterns)
3. Existing test implementations (see examples in each test file)
4. Test utilities (well-documented mock generators)

---

**Ready to start?** Pick Step 1 and run:
```bash
cd /home/kody/patina/apps/admin-portal
pnpm test:watch catalog.test.ts
```

Good luck! 🚀
