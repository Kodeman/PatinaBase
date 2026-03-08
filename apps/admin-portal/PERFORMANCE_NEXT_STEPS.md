# Performance Optimization - Next Steps

**For**: Next developer working on Admin Portal
**Priority**: High
**Estimated Time**: 6-8 hours total

---

## Step 1: Fix Build Issues (2-3 hours) 🔴 CRITICAL

The build currently fails due to type errors. These must be fixed before we can run bundle analysis and measure performance improvements.

### Issue 1: Next.js 15 Async Params

**Error**:
```
Type 'ProductEditPageProps' does not satisfy the constraint 'PageProps'.
Types of property 'params' are incompatible.
Type '{ productId: string; }' is missing the following properties from type 'Promise<any>': then, catch, finally
```

**Location**: `/home/kody/patina/apps/admin-portal/src/app/(dashboard)/catalog/[productId]/page.tsx`

**Fix**:
```typescript
// BEFORE
interface ProductEditPageProps {
  params: {
    productId: string;
  };
}

export default function ProductEditPage({ params }: ProductEditPageProps) {
  const { productId } = params;
  // ...
}

// AFTER (Next.js 15 requires async params)
interface ProductEditPageProps {
  params: Promise<{
    productId: string;
  }>;
}

export default async function ProductEditPage({ params }: ProductEditPageProps) {
  const { productId } = await params;
  // ...
}
```

**Reference**: [Next.js 15 Migration Guide](https://nextjs.org/docs/app/building-your-application/upgrading/version-15)

### Issue 2: Missing API Client Export

**Error**:
```
Attempted import error: 'apiClient' is not exported from '@/lib/api-client'
```

**Location**: `/home/kody/patina/apps/admin-portal/src/lib/api-client.ts`

**Fix**: Add or verify export:
```typescript
// In api-client.ts
export const apiClient = {
  get: async (url: string, options?) => { /* ... */ },
  post: async (url: string, data, options?) => { /* ... */ },
  put: async (url: string, data, options?) => { /* ... */ },
  delete: async (url: string, options?) => { /* ... */ },
};
```

### Issue 3: ESLint Configuration

**Error**:
```
Invalid Options: - Unknown options: useEslintrc, extensions
```

**Location**: `/home/kody/patina/apps/admin-portal/.eslintrc.json` or `eslint.config.js`

**Fix**: Update to ESLint 9 flat config:
```javascript
// eslint.config.js (new format)
import { FlatCompat } from '@eslint/eslintrc';
import nextPlugin from '@next/eslint-plugin-next';

const compat = new FlatCompat();

export default [
  ...compat.extends('next/core-web-vitals'),
  {
    plugins: {
      '@next/next': nextPlugin,
    },
  },
];
```

**OR** downgrade ESLint to v8 temporarily:
```bash
pnpm add -D eslint@8 --workspace=@patina/admin-portal
```

---

## Step 2: Run Bundle Analysis (30 minutes) 🟡

Once build works:

```bash
cd /home/kody/patina/apps/admin-portal

# 1. Clean build
rm -rf .next

# 2. Run bundle analyzer
pnpm analyze

# 3. Open the reports
# Reports will be at:
# - .next/analyze/client.html
# - .next/analyze/nodejs.html
# - .next/analyze/edge.html

# 4. Document findings in a new file
```

### What to Look For

**In the analyzer**:
- [ ] Verify ProductCreateDialog is in separate chunk
- [ ] Verify BulkActionDialogs is in separate chunk
- [ ] Check for duplicate dependencies (dedupe if found)
- [ ] Identify packages >100KB
- [ ] Check lucide-react size (should be tree-shakeable)

**Document Results**:
```markdown
# Bundle Analysis Results

## Baseline (Before Optimizations)
- First Load JS: ___KB
- Total Bundle: ___KB (gzipped: ___KB)
- Largest Chunk: ___KB

## After Phase 1 Optimizations
- First Load JS: ___KB (Δ -__KB, -_%)
- Total Bundle: ___KB (gzipped: ___KB, Δ -__KB, -_%)
- Largest Chunk: ___KB

## Separate Chunks Created
- ProductCreateDialog: ___KB
- BulkActionDialogs: ___KB

## Issues Found
- [ ] List any duplicates
- [ ] List any unexpectedly large dependencies
```

---

## Step 3: Performance Testing (1 hour) 🟡

### Lighthouse Testing

```bash
# Start dev server
pnpm dev

# In another terminal, run Lighthouse
npx lighthouse http://localhost:3001/catalog --view --preset=desktop

# Run for mobile too
npx lighthouse http://localhost:3001/catalog --view --preset=mobile
```

**Target Scores**:
- Performance: >90
- Accessibility: >95
- Best Practices: >90
- SEO: >85

**Document Results**:
```markdown
# Lighthouse Scores

## Desktop
- Performance: ___/100
- FCP: ___s
- LCP: ___s
- TBT: ___ms
- CLS: ___

## Mobile
- Performance: ___/100
- FCP: ___s
- LCP: ___s
- TBT: ___ms
- CLS: ___
```

### React DevTools Profiler Testing

1. Open React DevTools
2. Go to Profiler tab
3. Click Record (⚪)
4. Perform these actions:
   - Load catalog page
   - Search for a product
   - Select 3 products
   - Open filter panel
   - Click "Create Product"
5. Stop recording

**What to verify**:
- [ ] AdminProductCard doesn't re-render during search (thanks to memo)
- [ ] ProductCreateDialog loads only when clicked
- [ ] BulkActionDialogs loads only when items selected
- [ ] No "yellow" (slow) components during interactions

---

## Step 4: Implement Remaining Critical Optimizations (2-3 hours) 🟢

### 4A: Memoize AdminProductTable

**File**: `/home/kody/patina/apps/admin-portal/src/components/catalog/admin-product-table.tsx`

```typescript
import { memo, useMemo } from 'react';

export const AdminProductTable = memo(function AdminProductTable({
  products,
  presenter
}: AdminProductTableProps) {
  // Memoize table columns (they don't change)
  const columns = useMemo(() => [
    { id: 'name', header: 'Name', ... },
    { id: 'price', header: 'Price', ... },
    // ... other columns
  ], []);

  // Component implementation
  return <Table columns={columns} data={products} />;
});
```

**Estimated Impact**: 30-40% fewer re-renders

### 4B: Add useCallback to Catalog Page

**File**: `/home/kody/patina/apps/admin-portal/src/app/(dashboard)/catalog/page.tsx`

```typescript
import { useCallback } from 'react';

export default function CatalogPage() {
  const presenter = useAdminCatalogPresenter();

  // Memoize callbacks to prevent child re-renders
  const handleFilterPanelToggle = useCallback((isOpen: boolean) => {
    setIsFilterPanelOpen(isOpen);
  }, []);

  const handleCreateDialogToggle = useCallback((isOpen: boolean) => {
    setIsCreateDialogOpen(isOpen);
  }, []);

  const handleProductCreated = useCallback((productId: string) => {
    presenter.refreshData();
    console.log('Product created:', productId);
  }, [presenter]);

  return (
    <div>
      {/* Pass memoized callbacks */}
      <AdminCatalogFilters
        presenter={presenter}
        isOpen={isFilterPanelOpen}
        onClose={() => handleFilterPanelToggle(false)}
      />
      <ProductCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={handleCreateDialogToggle}
        onSuccess={handleProductCreated}
      />
    </div>
  );
}
```

**Estimated Impact**: 20-30% fewer re-renders in child components

### 4C: useMemo for Filtered Data

**File**: `/home/kody/patina/apps/admin-portal/src/features/catalog/hooks/useAdminCatalogPresenter.ts`

Find expensive filter/sort operations and wrap them:

```typescript
import { useMemo } from 'react';

export function useAdminCatalogPresenter() {
  // ... existing code

  // Memoize filtered products
  const filteredProducts = useMemo(() => {
    return products
      .filter(p => matchesFilters(p, filters))
      .sort((a, b) => sortFn(a, b, sortConfig));
  }, [products, filters, sortConfig]);

  return {
    // ... existing return
    products: filteredProducts,
  };
}
```

**Estimated Impact**: Prevents re-filtering on every render

---

## Step 5: Additional Optimizations (Optional, 2-3 hours) 🟢

### 5A: Code-Split Edit Page Tabs

If the edit page has tabs (Details, Variants, Media, SEO):

**File**: `/home/kody/patina/apps/admin-portal/src/app/(dashboard)/catalog/[productId]/page.tsx`

```typescript
import dynamic from 'next/dynamic';

// Lazy load tab content
const DetailsTab = dynamic(() => import('./tabs/DetailsTab'));
const VariantsTab = dynamic(() => import('./tabs/VariantsTab'));
const MediaTab = dynamic(() => import('./tabs/MediaTab'));
const SEOTab = dynamic(() => import('./tabs/SEOTab'));

// Only active tab's content is loaded
```

**Estimated Savings**: 100-150KB for edit page

### 5B: Lazy Load Heavy Features

**CSV Importer** (if exists):
```typescript
const CSVImporter = dynamic(
  () => import('@/components/catalog/CSVImporter'),
  { ssr: false }
);
```

**Image Lightbox** (if exists):
```typescript
const ImageLightbox = dynamic(
  () => import('@/components/catalog/ImageLightbox'),
  { ssr: false }
);
```

---

## Step 6: Set Up Monitoring (1-2 hours) 🟢

### 6A: Web Vitals Tracking

**File**: `/home/kody/patina/apps/admin-portal/src/app/layout.tsx`

```typescript
'use client';

import { useEffect } from 'react';
import { onCLS, onFID, onFCP, onLCP, onTTFB } from 'web-vitals';

export function WebVitalsReporter() {
  useEffect(() => {
    const reportMetric = (metric: any) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[Web Vitals]', metric.name, metric.value, metric);
      }

      // In production, send to analytics
      if (process.env.NODE_ENV === 'production') {
        // TODO: Send to analytics service
        // fetch('/api/analytics', {
        //   method: 'POST',
        //   body: JSON.stringify(metric),
        // });
      }
    };

    onCLS(reportMetric);
    onFID(reportMetric);
    onFCP(reportMetric);
    onLCP(reportMetric);
    onTTFB(reportMetric);
  }, []);

  return null;
}
```

Add to layout:
```typescript
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <WebVitalsReporter />
        {children}
      </body>
    </html>
  );
}
```

### 6B: Performance Budget CI/CD

**File**: `.github/workflows/performance.yml`

```yaml
name: Performance Budget

on:
  pull_request:
    paths:
      - 'apps/admin-portal/**'

jobs:
  bundle-size:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3

      - name: Install dependencies
        run: pnpm install

      - name: Build
        run: pnpm --filter @patina/admin-portal build

      - name: Check bundle size
        run: |
          # Check if any JS file is > 500KB
          find apps/admin-portal/.next/static -name "*.js" -size +500k -exec ls -lh {} \; | tee large-files.txt
          if [ -s large-files.txt ]; then
            echo "❌ Files exceed 500KB limit!"
            cat large-files.txt
            exit 1
          fi
          echo "✅ All files under 500KB"
```

---

## Quick Command Reference

```bash
# Fix build and test
cd /home/kody/patina/apps/admin-portal
pnpm build                  # Should pass without errors
pnpm analyze                # Run bundle analysis
pnpm dev                    # Start dev server

# Performance testing
npx lighthouse http://localhost:3001/catalog --view

# Check specific file sizes
ls -lh .next/static/chunks/*.js

# Clean and rebuild
rm -rf .next && pnpm build
```

---

## Success Checklist

### Before Considering Complete:
- [ ] Build passes without errors
- [ ] Bundle analysis shows separate chunks for dialogs
- [ ] Total bundle size < 500KB (gzipped)
- [ ] Lighthouse performance score >90
- [ ] React Profiler shows reduced re-renders
- [ ] No console errors in production build
- [ ] All optimizations documented
- [ ] Web Vitals tracking implemented

---

## When You're Done

Create a PR with:

**Title**: "feat: Admin Portal Catalog Performance Optimizations (Phase 1)"

**Description**:
```markdown
## Summary
Implemented Phase 1 performance optimizations for Admin Portal Catalog.

## Changes
- ✅ Code-split ProductCreateDialog and BulkActionDialogs
- ✅ Memoized AdminProductCard component
- ✅ Added bundle analysis configuration
- ✅ Created comprehensive performance documentation
- ✅ Fixed build issues (Next.js 15 compat, missing exports, etc.)

## Performance Impact
- Bundle size reduced by __KB (gzipped: __KB)
- First Load JS reduced by __%
- React re-renders reduced by 50-70%

## Testing
- ✅ Build passes
- ✅ Bundle analysis verified
- ✅ Lighthouse score: __/100
- ✅ Manual testing complete

## Documentation
- See PERFORMANCE_BASELINE_REPORT.md
- See PERFORMANCE_OPTIMIZATION_GUIDE.md
- See PERFORMANCE_IMPLEMENTATION_SUMMARY.md

## Next Steps
- Implement remaining high-priority optimizations
- Set up continuous performance monitoring
- Track Web Vitals in production
```

---

**Good luck! The foundation is solid. Just need to fix the builds and measure the impact!** 🚀
