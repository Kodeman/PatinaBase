# Admin Portal Catalog - Testing Guide

**Comprehensive testing strategies and patterns for catalog features**

---

## Table of Contents

1. [Overview](#overview)
2. [Testing Stack](#testing-stack)
3. [Unit Testing](#unit-testing)
4. [Integration Testing](#integration-testing)
5. [E2E Testing](#e2e-testing)
6. [Testing Patterns](#testing-patterns)
7. [Mocking Strategies](#mocking-strategies)
8. [Coverage Requirements](#coverage-requirements)

---

## Overview

### Testing Philosophy

1. **Test behavior, not implementation**
2. **Write tests from user perspective**
3. **Keep tests simple and readable**
4. **Mock external dependencies**
5. **Maintain fast test execution**

### Test Pyramid

```
        /\
       /E2E\      (Few, slow, brittle)
      /------\
     /  Integ \   (Some, moderate speed)
    /----------\
   /    Unit    \ (Many, fast, isolated)
  /--------------\
```

**Target distribution:**
- 70% Unit tests
- 20% Integration tests
- 10% E2E tests

---

## Testing Stack

### Tools

```typescript
{
  "unit": "Jest + React Testing Library",
  "e2e": "Playwright",
  "coverage": "Jest coverage reporter",
  "mocking": "MSW (Mock Service Worker)",
  "assertions": "Jest matchers + jest-dom"
}
```

### Setup Files

**jest.config.js:**
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.tsx',
  ],
  coverageThresholds: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
```

**jest.setup.js:**
```javascript
import '@testing-library/jest-dom';
import { server } from './src/__mocks__/server';

// Enable API mocking
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

---

## Unit Testing

### Component Tests

**Example: ProductCard**

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductCard } from './product-card';

describe('ProductCard', () => {
  const mockProduct = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Modern Sectional Sofa',
    brand: 'Herman Miller',
    price: 2495.00,
    msrp: 3199.00,
    status: 'published',
    coverImage: '/images/sofa.jpg',
    hasValidationIssues: false
  };

  it('renders product information', () => {
    render(<ProductCard product={mockProduct} />);

    expect(screen.getByText('Modern Sectional Sofa')).toBeInTheDocument();
    expect(screen.getByText('Herman Miller')).toBeInTheDocument();
    expect(screen.getByText('$2,495.00')).toBeInTheDocument();
  });

  it('displays discount badge when MSRP > price', () => {
    render(<ProductCard product={mockProduct} />);

    expect(screen.getByText('22% OFF')).toBeInTheDocument();
  });

  it('shows validation badge when product has issues', () => {
    const productWithIssues = {
      ...mockProduct,
      hasValidationIssues: true,
      validationErrorCount: 3
    };

    render(<ProductCard product={productWithIssues} />);

    expect(screen.getByText('3 errors')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveClass('badge-destructive');
  });

  it('calls onToggleSelect when checkbox is clicked', async () => {
    const onToggleSelect = jest.fn();
    render(
      <ProductCard
        product={mockProduct}
        isSelected={false}
        onToggleSelect={onToggleSelect}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    await userEvent.click(checkbox);

    expect(onToggleSelect).toHaveBeenCalledWith(mockProduct.id);
  });

  it('shows selected state when isSelected is true', () => {
    render(
      <ProductCard
        product={mockProduct}
        isSelected={true}
        onToggleSelect={jest.fn()}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
  });
});
```

### Hook Tests

**Example: useAdminProducts**

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAdminProducts } from './use-admin-products';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('useAdminProducts', () => {
  it('fetches products successfully', async () => {
    const { result } = renderHook(
      () => useAdminProducts({ page: 1, pageSize: 20 }),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.products).toHaveLength(20);
    });
  });

  it('applies filters correctly', async () => {
    const { result } = renderHook(
      () => useAdminProducts({
        status: 'published',
        page: 1,
        pageSize: 20
      }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.products.every(p => p.status === 'published')).toBe(true);
    });
  });

  it('handles errors gracefully', async () => {
    // Mock API to return error
    server.use(
      rest.get('/api/catalog/products', (req, res, ctx) => {
        return res(ctx.status(500), ctx.json({ error: 'Server error' }));
      })
    );

    const { result } = renderHook(
      () => useAdminProducts(),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
      expect(result.current.error).toBeDefined();
    });
  });
});
```

### Service Tests

**Example: catalogService**

```typescript
import { catalogService } from './catalog';
import { server } from '@/__mocks__/server';
import { rest } from 'msw';

describe('catalogService', () => {
  describe('getProducts', () => {
    it('fetches products with filters', async () => {
      const response = await catalogService.getProducts({
        status: 'published',
        page: 1,
        pageSize: 20
      });

      expect(response.data.data).toHaveLength(20);
      expect(response.data.meta.total).toBeGreaterThan(0);
    });

    it('handles network errors', async () => {
      server.use(
        rest.get('/api/catalog/products', (req, res, ctx) => {
          return res.networkError('Network error');
        })
      );

      await expect(catalogService.getProducts()).rejects.toThrow();
    });
  });

  describe('createProduct', () => {
    it('creates a product successfully', async () => {
      const productData = {
        name: 'Test Product',
        brand: 'Test Brand',
        price: 100,
        categoryId: 'cat-123',
        status: 'draft'
      };

      const response = await catalogService.createProduct(productData);

      expect(response.data).toHaveProperty('id');
      expect(response.data.name).toBe('Test Product');
    });

    it('validates required fields', async () => {
      await expect(
        catalogService.createProduct({ name: 'Test' })
      ).rejects.toThrow('Validation failed');
    });
  });

  describe('bulkPublish', () => {
    it('publishes multiple products', async () => {
      const productIds = ['id-1', 'id-2', 'id-3'];

      const result = await catalogService.bulkPublish(productIds);

      expect(result.data.success).toHaveLength(3);
      expect(result.data.failed).toHaveLength(0);
    });

    it('handles partial failures', async () => {
      const productIds = ['valid-1', 'invalid-1', 'valid-2'];

      const result = await catalogService.bulkPublish(productIds);

      expect(result.data.success).toHaveLength(2);
      expect(result.data.failed).toHaveLength(1);
      expect(result.data.failed[0].id).toBe('invalid-1');
    });

    it('enforces rate limits', async () => {
      const productIds = Array(101).fill('id'); // Exceeds max of 100

      await expect(
        catalogService.bulkPublish(productIds)
      ).rejects.toThrow('Maximum 100 products allowed');
    });
  });
});
```

---

## Integration Testing

### Presenter Integration

**Example: useAdminCatalogPresenter**

```typescript
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useAdminCatalogPresenter } from './useAdminCatalogPresenter';

describe('useAdminCatalogPresenter Integration', () => {
  it('coordinates data loading and filtering', async () => {
    const { result } = renderHook(
      () => useAdminCatalogPresenter(),
      { wrapper: QueryClientProvider }
    );

    // Initial load
    await waitFor(() => {
      expect(result.current.isLoadingProducts).toBe(false);
      expect(result.current.products).toHaveLength(20);
    });

    // Apply filter
    act(() => {
      result.current.handleStatusChange('published');
    });

    await waitFor(() => {
      expect(result.current.products.every(
        p => p.status === 'published'
      )).toBe(true);
    });

    // Clear filter
    act(() => {
      result.current.handleClearFilters();
    });

    await waitFor(() => {
      expect(result.current.activeFilterCount).toBe(0);
    });
  });

  it('handles bulk operations', async () => {
    const { result } = renderHook(
      () => useAdminCatalogPresenter(),
      { wrapper: QueryClientProvider }
    );

    await waitFor(() => {
      expect(result.current.products).toHaveLength(20);
    });

    // Select products
    act(() => {
      result.current.handleProductToggle(result.current.products[0].id);
      result.current.handleProductToggle(result.current.products[1].id);
    });

    expect(result.current.selectedCount).toBe(2);

    // Bulk publish
    await act(async () => {
      await result.current.handleBulkPublish();
    });

    await waitFor(() => {
      expect(result.current.selectedCount).toBe(0); // Cleared after success
    });
  });

  it('manages pagination correctly', async () => {
    const { result } = renderHook(
      () => useAdminCatalogPresenter(),
      { wrapper: QueryClientProvider }
    );

    await waitFor(() => {
      expect(result.current.currentPage).toBe(1);
    });

    // Go to page 2
    act(() => {
      result.current.handlePageChange(2);
    });

    await waitFor(() => {
      expect(result.current.currentPage).toBe(2);
    });

    // Change page size (resets to page 1)
    act(() => {
      result.current.handlePageSizeChange(50);
    });

    await waitFor(() => {
      expect(result.current.currentPage).toBe(1);
      expect(result.current.pageSize).toBe(50);
    });
  });
});
```

---

## E2E Testing

### Playwright Tests

**Example: Catalog Page**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Catalog Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/catalog');
  });

  test('loads and displays products', async ({ page }) => {
    // Wait for products to load
    await expect(page.locator('[data-testid="product-card"]')).toHaveCount(20);

    // Check first product
    const firstProduct = page.locator('[data-testid="product-card"]').first();
    await expect(firstProduct).toContainText('Modern Sectional Sofa');
    await expect(firstProduct).toContainText('Herman Miller');
  });

  test('search filters products', async ({ page }) => {
    // Type in search
    await page.fill('[data-testid="search-input"]', 'sofa');

    // Wait for results to update
    await page.waitForResponse(resp =>
      resp.url().includes('/api/catalog/products') && resp.status() === 200
    );

    // Check results
    const products = page.locator('[data-testid="product-card"]');
    const count = await products.count();
    expect(count).toBeLessThan(20);

    // All results should contain 'sofa'
    for (let i = 0; i < count; i++) {
      const product = products.nth(i);
      const text = await product.textContent();
      expect(text.toLowerCase()).toContain('sofa');
    }
  });

  test('bulk publish workflow', async ({ page }) => {
    // Select multiple products
    await page.locator('[data-testid="product-checkbox"]').nth(0).click();
    await page.locator('[data-testid="product-checkbox"]').nth(1).click();
    await page.locator('[data-testid="product-checkbox"]').nth(2).click();

    // Check toolbar appears
    await expect(page.locator('[data-testid="bulk-toolbar"]')).toBeVisible();
    await expect(page.locator('[data-testid="selection-count"]')).toHaveText('3 selected');

    // Click publish
    await page.click('[data-testid="bulk-publish-button"]');

    // Confirm in modal
    await expect(page.locator('[data-testid="publish-confirm-modal"]')).toBeVisible();
    await page.click('[data-testid="confirm-publish"]');

    // Wait for success toast
    await expect(page.locator('text=Published 3 products')).toBeVisible();

    // Toolbar should disappear (selection cleared)
    await expect(page.locator('[data-testid="bulk-toolbar"]')).not.toBeVisible();
  });

  test('create product flow', async ({ page }) => {
    // Click create button
    await page.click('text=Create Product');

    // Fill form
    await page.fill('[name="name"]', 'New Test Product');
    await page.fill('[name="brand"]', 'Test Brand');
    await page.fill('[name="shortDescription"]', 'This is a test product description');
    await page.fill('[name="price"]', '999.99');

    // Select category
    await page.selectOption('[name="categoryId"]', { index: 1 });

    // Add tags
    await page.fill('[data-testid="tags-input"]', 'test');
    await page.keyboard.press('Enter');
    await expect(page.locator('text=test')).toBeVisible();

    // Submit
    await page.click('text=Create Product');

    // Wait for success
    await expect(page.locator('text=Product created')).toBeVisible();

    // Product should appear in list
    await expect(page.locator('text=New Test Product')).toBeVisible();
  });

  test('handles errors gracefully', async ({ page }) => {
    // Mock API error
    await page.route('/api/catalog/products', route =>
      route.fulfill({ status: 500, body: 'Server error' })
    );

    await page.reload();

    // Error state should show
    await expect(page.locator('text=Failed to load products')).toBeVisible();
    await expect(page.locator('text=Try Again')).toBeVisible();

    // Clear route mock
    await page.unroute('/api/catalog/products');

    // Click retry
    await page.click('text=Try Again');

    // Products should load
    await expect(page.locator('[data-testid="product-card"]')).toHaveCount(20);
  });
});
```

---

## Testing Patterns

### AAA Pattern

Arrange, Act, Assert:

```typescript
test('example test', () => {
  // Arrange
  const mockProduct = { id: '1', name: 'Test' };
  const onSelect = jest.fn();

  // Act
  render(<ProductCard product={mockProduct} onSelect={onSelect} />);
  userEvent.click(screen.getByRole('checkbox'));

  // Assert
  expect(onSelect).toHaveBeenCalledWith('1');
});
```

### Page Object Model (E2E)

```typescript
// pages/catalog.page.ts
export class CatalogPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/catalog');
  }

  async searchFor(query: string) {
    await this.page.fill('[data-testid="search-input"]', query);
  }

  async selectProduct(index: number) {
    await this.page.locator('[data-testid="product-checkbox"]').nth(index).click();
  }

  async bulkPublish() {
    await this.page.click('[data-testid="bulk-publish-button"]');
    await this.page.click('[data-testid="confirm-publish"]');
  }

  async getProductCount() {
    return await this.page.locator('[data-testid="product-card"]').count();
  }
}

// Usage in test
test('bulk publish', async ({ page }) => {
  const catalogPage = new CatalogPage(page);

  await catalogPage.goto();
  await catalogPage.selectProduct(0);
  await catalogPage.selectProduct(1);
  await catalogPage.bulkPublish();

  await expect(page.locator('text=Published 2 products')).toBeVisible();
});
```

---

## Mocking Strategies

### MSW (Mock Service Worker)

**Setup:**
```typescript
// src/__mocks__/handlers.ts
import { rest } from 'msw';

export const handlers = [
  rest.get('/api/catalog/products', (req, res, ctx) => {
    const page = req.url.searchParams.get('page') || '1';
    const pageSize = req.url.searchParams.get('pageSize') || '20';

    return res(
      ctx.status(200),
      ctx.json({
        data: generateMockProducts(parseInt(pageSize)),
        meta: {
          total: 247,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          totalPages: 13
        }
      })
    );
  }),

  rest.post('/api/catalog/products', (req, res, ctx) => {
    const product = req.body as any;

    return res(
      ctx.status(201),
      ctx.json({
        data: {
          ...product,
          id: 'generated-id-123',
          createdAt: new Date().toISOString()
        }
      })
    );
  }),

  rest.post('/api/catalog/bulk/publish', (req, res, ctx) => {
    const { productIds } = req.body as any;

    return res(
      ctx.status(200),
      ctx.json({
        data: {
          success: productIds.map(id => ({ id, success: true })),
          failed: [],
          skipped: [],
          total: productIds.length
        }
      })
    );
  })
];

// src/__mocks__/server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

### Mocking Hooks

```typescript
jest.mock('@/hooks/use-admin-products', () => ({
  useAdminProducts: () => ({
    products: mockProducts,
    isLoading: false,
    totalProducts: 100,
    refetch: jest.fn()
  })
}));
```

---

## Coverage Requirements

### Minimum Thresholds

```javascript
// jest.config.js
coverageThresholds: {
  global: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80
  },
  './src/components/': {
    branches: 90,
    functions: 90,
    lines: 90
  }
}
```

### Running Coverage

```bash
# Full coverage report
pnpm test:coverage

# Coverage for specific files
pnpm test:coverage -- product-card

# Open HTML report
open coverage/lcov-report/index.html
```

### Coverage Badges

Add to README:
```markdown
![Coverage](https://img.shields.io/badge/coverage-85%25-green)
```

---

## Best Practices

1. **Test user behavior, not implementation**
2. **Use data-testid for E2E, accessible queries for unit tests**
3. **Keep tests isolated and independent**
4. **Mock external dependencies**
5. **Write descriptive test names**
6. **Use beforeEach for common setup**
7. **Clean up after tests**
8. **Avoid testing library internals**
9. **Test error states**
10. **Maintain fast test execution**

---

## CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install
      - run: pnpm test:coverage
      - run: pnpm test:e2e

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

---

## Related Documentation

- **User Guide**: [USER_GUIDE.md](./USER_GUIDE.md)
- **Contributing**: [CONTRIBUTING.md](./CONTRIBUTING.md)
- **Architecture**: [CATALOG_ARCHITECTURE.md](./CATALOG_ARCHITECTURE.md)
- **Components**: [COMPONENTS.md](./COMPONENTS.md)

---

**Last Updated:** 2025-10-19 | **Version:** 1.0
