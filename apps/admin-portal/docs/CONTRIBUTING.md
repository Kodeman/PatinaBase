# Contributing to Admin Portal Catalog

**Developer guidelines for contributing to the catalog system**

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Code Style Guide](#code-style-guide)
3. [Development Workflow](#development-workflow)
4. [Pull Request Process](#pull-request-process)
5. [Testing Requirements](#testing-requirements)
6. [Component Guidelines](#component-guidelines)

---

## Getting Started

### Prerequisites

```bash
# Required
Node.js 20.x+
pnpm 9.x+
PostgreSQL 16+
Redis 7+

# Recommended
VS Code with extensions:
  - ESLint
  - Prettier
  - TypeScript Vue Plugin (Volar)
  - Tailwind CSS IntelliSense
```

### Initial Setup

```bash
# Clone and install
git clone <repo>
cd patina
pnpm install

# Start infrastructure
pnpm db:up

# Seed databases
pnpm db:push
pnpm db:seed

# Start admin portal
cd apps/admin-portal
pnpm dev
```

---

## Code Style Guide

### TypeScript

**Always use TypeScript strict mode:**
```typescript
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

**Type imports explicitly:**
```typescript
// ✅ Good
import type { Product } from '@patina/types';
import { Button } from '@/components/ui/button';

// ❌ Bad
import { Product, Button } from 'somewhere';
```

**Use interfaces for objects:**
```typescript
// ✅ Good
interface ProductCardProps {
  product: Product;
  onSelect?: (id: string) => void;
}

// ❌ Bad
type ProductCardProps = {
  product: any;
  onSelect: Function;
}
```

### React Components

**Use functional components with hooks:**
```typescript
// ✅ Good
export function ProductCard({ product }: ProductCardProps) {
  const [selected, setSelected] = useState(false);
  return <div>{product.name}</div>;
}

// ❌ Bad
export class ProductCard extends React.Component { ... }
```

**Mark client components explicitly:**
```typescript
'use client';

import { useState } from 'react';

export function InteractiveComponent() {
  const [state, setState] = useState();
  // ...
}
```

**Use Server Components by default:**
```typescript
// No 'use client' directive
export async function ServerComponent() {
  const data = await fetchData();
  return <div>{data}</div>;
}
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| **Components** | PascalCase | `ProductCard`, `BulkActionToolbar` |
| **Hooks** | camelCase with `use` | `useAdminProducts`, `useBulkActions` |
| **Functions** | camelCase | `handleSubmit`, `fetchProducts` |
| **Constants** | UPPER_SNAKE_CASE | `MAX_PAGE_SIZE`, `DEFAULT_FILTERS` |
| **Types/Interfaces** | PascalCase | `AdminProductFilters`, `BulkActionResult` |
| **Files** | kebab-case | `product-card.tsx`, `use-admin-products.ts` |

### File Organization

```typescript
// Component file structure
'use client';

// 1. Imports (external, then internal, then relative)
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Product } from '@patina/types';

// 2. Types
interface ComponentProps {
  // ...
}

// 3. Constants
const DEFAULT_STATE = { ... };

// 4. Component
export function Component({ ... }: ComponentProps) {
  // Hooks
  const [state, setState] = useState();

  // Derived state
  const computed = useMemo(() => ..., []);

  // Handlers
  const handleClick = useCallback(() => ..., []);

  // Render
  return <div>...</div>;
}

// 5. Sub-components (if needed)
function SubComponent() { ... }
```

---

## Development Workflow

### Branch Strategy

```bash
# Feature branches
git checkout -b feature/add-bulk-export

# Bug fixes
git checkout -b fix/validation-error-display

# Documentation
git checkout -b docs/update-api-reference
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
feat: add bulk export functionality
fix: resolve race condition in bulk publish
docs: update API reference with new endpoints
refactor: extract presenter logic from component
test: add tests for bulk operations
chore: update dependencies
```

**Examples:**
```bash
feat(catalog): implement product duplication
fix(bulk-actions): prevent concurrent operations
docs(api): document rate limiting
test(hooks): add tests for useAdminProducts
```

### Development Process

1. **Create branch** from `main`
2. **Make changes** with tests
3. **Run linting**: `pnpm lint`
4. **Run tests**: `pnpm test`
5. **Type check**: `pnpm type-check`
6. **Commit** with conventional message
7. **Push** and create PR

---

## Pull Request Process

### PR Checklist

Before submitting a PR, ensure:

- [ ] Code follows style guide
- [ ] All tests pass (`pnpm test`)
- [ ] No linting errors (`pnpm lint`)
- [ ] No type errors (`pnpm type-check`)
- [ ] New features have tests (80%+ coverage)
- [ ] Documentation updated (if needed)
- [ ] PR description explains changes
- [ ] Screenshots for UI changes

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
How has this been tested?

## Screenshots (if UI changes)
Before / After screenshots

## Checklist
- [ ] Tests pass
- [ ] Linting passes
- [ ] Documentation updated
```

### Code Review Guidelines

**For Reviewers:**
- Review within 24 hours
- Provide constructive feedback
- Approve if meets standards
- Request changes if needed

**For Authors:**
- Respond to feedback promptly
- Make requested changes
- Re-request review after changes
- Merge after approval

---

## Testing Requirements

### Test Coverage

**Minimum coverage:**
- **Overall**: 80%
- **New features**: 90%
- **Bug fixes**: Include regression test

### Test Types

**1. Unit Tests (Jest + RTL)**
```typescript
// Component test example
import { render, screen } from '@testing-library/react';
import { ProductCard } from './product-card';

describe('ProductCard', () => {
  it('displays product name', () => {
    const product = { id: '1', name: 'Test Product' };
    render(<ProductCard product={product} />);
    expect(screen.getByText('Test Product')).toBeInTheDocument();
  });
});
```

**2. Hook Tests**
```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { useAdminProducts } from './use-admin-products';

describe('useAdminProducts', () => {
  it('fetches products', async () => {
    const { result } = renderHook(() => useAdminProducts());

    await waitFor(() => {
      expect(result.current.products).toHaveLength(20);
    });
  });
});
```

**3. E2E Tests (Playwright)**
```typescript
import { test, expect } from '@playwright/test';

test('create product flow', async ({ page }) => {
  await page.goto('/catalog');
  await page.click('text=Create Product');
  await page.fill('[name="name"]', 'Test Product');
  await page.click('text=Save');
  await expect(page.locator('text=Product created')).toBeVisible();
});
```

---

## Component Guidelines

### Component Structure

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * ProductCard Component
 *
 * Displays product information in a card layout.
 *
 * @example
 * <ProductCard
 *   product={product}
 *   onSelect={(id) => console.log(id)}
 * />
 */
export interface ProductCardProps {
  /** Product to display */
  product: Product;
  /** Callback when product is selected */
  onSelect?: (id: string) => void;
  /** Show selection checkbox */
  selectable?: boolean;
}

export function ProductCard({
  product,
  onSelect,
  selectable = false
}: ProductCardProps) {
  // Implementation
}
```

### Accessibility

**Always include:**
- ARIA labels for interactive elements
- Keyboard navigation support
- Focus management
- Screen reader support

```typescript
<button
  onClick={handleClick}
  aria-label="Delete product"
  aria-describedby="delete-description"
>
  <TrashIcon />
</button>
```

### Performance

**Use memo for expensive computations:**
```typescript
const filteredProducts = useMemo(() =>
  products.filter(p => p.status === 'published'),
  [products]
);
```

**Use callback for stable references:**
```typescript
const handleClick = useCallback((id: string) => {
  onSelect?.(id);
}, [onSelect]);
```

---

## Best Practices

### State Management

**Use local state when possible:**
```typescript
// ✅ Good
const [isOpen, setIsOpen] = useState(false);

// ❌ Bad (unnecessary global state)
const isOpen = useGlobalState('modal-open');
```

**Use TanStack Query for server state:**
```typescript
// ✅ Good
const { data } = useQuery({
  queryKey: ['products'],
  queryFn: fetchProducts
});

// ❌ Bad (manual fetch and state)
const [products, setProducts] = useState([]);
useEffect(() => { fetchProducts().then(setProducts); }, []);
```

### Error Handling

**Always handle errors:**
```typescript
try {
  await createProduct(data);
  toast.success('Product created');
} catch (error) {
  toast.error(error.message);
  logger.error('Failed to create product', error);
}
```

### Types Over Any

```typescript
// ✅ Good
function updateProduct(product: Product): void { }

// ❌ Bad
function updateProduct(product: any) { }
```

---

## Questions?

- **Slack**: #admin-portal-dev
- **Email**: dev-team@patina.com
- **Docs**: See [Architecture Guide](./CATALOG_ARCHITECTURE.md)

---

**Last Updated:** 2025-10-19 | **Version:** 1.0
