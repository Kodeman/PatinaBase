# Admin Catalog - Quick Reference Guide

## TL;DR

**Phase 3 is complete!** Use `useAdminCatalogPresenter` for all catalog state management.

```typescript
import { useAdminCatalogPresenter } from '@/features/catalog/hooks';

const presenter = useAdminCatalogPresenter();
// Access: presenter.products, presenter.handleSearchChange, etc.
```

---

## Cheat Sheet

### Import

```typescript
import { useAdminCatalogPresenter } from '@/features/catalog/hooks';
```

### State Properties

```typescript
// Search
presenter.searchQuery              // Current search input
presenter.debouncedSearchQuery     // Debounced for API calls

// Filters
presenter.selectedStatus           // Selected status filter
presenter.selectedCategory         // Selected category filter
presenter.selectedBrand            // Selected brand filter
presenter.activeFilterCount        // Number of active filters
presenter.hasActiveFilters         // Boolean: any filters active?

// Pagination
presenter.currentPage              // Current page (1-indexed)
presenter.pageSize                 // Items per page
presenter.totalPages               // Total number of pages
presenter.hasNextPage              // Can go to next page?
presenter.hasPreviousPage          // Can go to previous page?

// Sorting
presenter.sortBy                   // Current sort field
presenter.sortOrder                // 'asc' or 'desc'

// View
presenter.viewMode                 // 'grid' | 'list' | 'table'

// Bulk Actions
presenter.selectedCount            // Number of selected products
presenter.hasSelection             // Are any products selected?

// Data
presenter.products                 // Array of products
presenter.totalProducts            // Total across all pages
presenter.isLoadingProducts        // Loading indicator
presenter.stats                    // Catalog statistics

// Empty States
presenter.isEmpty                  // No products in result
presenter.isEmptyState             // Truly empty catalog
presenter.isNoResults              // No results for filters

// Modals
presenter.isPublishModalOpen       // Bulk publish modal
presenter.isUnpublishModalOpen     // Bulk unpublish modal
presenter.isDeleteModalOpen        // Bulk delete modal
```

### Action Methods

```typescript
// Search
presenter.handleSearchChange(query: string)
presenter.handleClearSearch()

// Filters
presenter.handleStatusChange(status: string | null)
presenter.handleCategoryChange(category: string | null)
presenter.handleBrandChange(brand: string | null)
presenter.handleClearFilters()

// Pagination
presenter.handlePageChange(page: number)
presenter.handlePageSizeChange(size: number)

// Sorting
presenter.handleSortChange(field: string, order: 'asc' | 'desc')

// View
presenter.setViewMode('grid' | 'list' | 'table')

// Bulk Selection
presenter.handleProductToggle(productId: string)
presenter.handleSelectAllOnPage()
presenter.handleClearSelection()

// Bulk Operations
await presenter.handleBulkPublish()
await presenter.handleBulkUnpublish(reason?: string)
await presenter.handleBulkDelete()

// Modals
presenter.openPublishModal()
presenter.closePublishModal()
presenter.openUnpublishModal()
presenter.closeUnpublishModal()
presenter.openDeleteModal()
presenter.closeDeleteModal()

// Refresh
presenter.refreshData()
presenter.refreshStats()
```

---

## Common Patterns

### Search Bar

```typescript
<input
  type="search"
  value={presenter.searchQuery}
  onChange={(e) => presenter.handleSearchChange(e.target.value)}
  placeholder="Search products..."
/>
{presenter.searchQuery && (
  <button onClick={presenter.handleClearSearch}>Clear</button>
)}
```

### Filters

```typescript
<select
  value={presenter.selectedStatus || ''}
  onChange={(e) => presenter.handleStatusChange(e.target.value || null)}
>
  <option value="">All Status</option>
  <option value="draft">Draft</option>
  <option value="published">Published</option>
</select>

{presenter.hasActiveFilters && (
  <button onClick={presenter.handleClearFilters}>
    Clear Filters ({presenter.activeFilterCount})
  </button>
)}
```

### Product Grid

```typescript
{presenter.isLoadingProducts ? (
  <LoadingSpinner />
) : presenter.isEmptyState ? (
  <EmptyState message="No products in catalog" />
) : presenter.isNoResults ? (
  <NoResults onClear={presenter.handleClearFilters} />
) : (
  <div className="grid">
    {presenter.products.map(product => (
      <ProductCard
        key={product.id}
        product={product}
        onToggle={() => presenter.handleProductToggle(product.id)}
      />
    ))}
  </div>
)}
```

### Pagination

```typescript
<div className="pagination">
  <button
    onClick={() => presenter.handlePageChange(presenter.currentPage - 1)}
    disabled={!presenter.hasPreviousPage}
  >
    Previous
  </button>

  <span>Page {presenter.currentPage} of {presenter.totalPages}</span>

  <button
    onClick={() => presenter.handlePageChange(presenter.currentPage + 1)}
    disabled={!presenter.hasNextPage}
  >
    Next
  </button>

  <select
    value={presenter.pageSize}
    onChange={(e) => presenter.handlePageSizeChange(Number(e.target.value))}
  >
    <option value={20}>20 per page</option>
    <option value={50}>50 per page</option>
    <option value={100}>100 per page</option>
  </select>
</div>
```

### Bulk Actions

```typescript
{presenter.hasSelection && (
  <div className="bulk-actions">
    <span>{presenter.selectedCount} selected</span>
    <button onClick={presenter.openPublishModal}>Publish</button>
    <button onClick={presenter.openUnpublishModal}>Unpublish</button>
    <button onClick={presenter.openDeleteModal}>Delete</button>
    <button onClick={presenter.handleClearSelection}>Clear</button>
  </div>
)}

<Modal isOpen={presenter.isPublishModalOpen}>
  <h3>Publish {presenter.selectedCount} products?</h3>
  <button onClick={async () => {
    await presenter.handleBulkPublish();
    presenter.closePublishModal();
  }}>
    Confirm
  </button>
  <button onClick={presenter.closePublishModal}>Cancel</button>
</Modal>
```

---

## Optional Enhancements

### URL Synchronization

```typescript
import { useCatalogUrlSync } from '@/features/catalog/hooks';

useCatalogUrlSync({
  q: presenter.searchQuery,
  status: presenter.selectedStatus,
  category: presenter.selectedCategory,
  page: presenter.currentPage,
  view: presenter.viewMode,
});
```

### Keyboard Shortcuts

```typescript
import { useKeyboardShortcuts, useSearchInputFocus } from '@/features/catalog/hooks';

const { searchInputRef, focusSearch } = useSearchInputFocus();

useKeyboardShortcuts({
  onFocusSearch: focusSearch,
  onToggleFilters: () => setIsFilterPanelOpen(prev => !prev),
  onSelectAll: presenter.handleSelectAllOnPage,
  onClearSelection: presenter.handleClearSelection,
  onNextPage: () => presenter.handlePageChange(presenter.currentPage + 1),
  onPrevPage: () => presenter.handlePageChange(presenter.currentPage - 1),
  onRefresh: presenter.refreshData,
});

// In render:
<input ref={searchInputRef} ... />
```

**Available Shortcuts:**
- **Cmd/Ctrl + K** - Focus search
- **Cmd/Ctrl + F** - Toggle filters
- **Cmd/Ctrl + A** - Select all on page
- **Cmd/Ctrl + R** - Refresh data
- **Cmd/Ctrl + →** - Next page
- **Cmd/Ctrl + ←** - Previous page
- **Escape** - Clear selection / Close modals

---

## Performance Tips

1. **Don't destruct the presenter** - Pass the whole object to avoid unnecessary rerenders
   ```typescript
   // ❌ Bad - creates new references
   const { products, handlePageChange } = presenter;

   // ✅ Good - stable reference
   const presenter = useAdminCatalogPresenter();
   ```

2. **Use React.memo for product cards**
   ```typescript
   const ProductCard = React.memo(({ product, onToggle }) => {
     // ...
   });
   ```

3. **The presenter already optimizes** - All callbacks use `useCallback`, all computed values use `useMemo`

---

## Debugging

### Check if data is loading
```typescript
console.log('Loading:', presenter.isLoadingProducts);
console.log('Products:', presenter.products.length);
console.log('Total:', presenter.totalProducts);
```

### Check filter state
```typescript
console.log('Filters:', {
  search: presenter.searchQuery,
  status: presenter.selectedStatus,
  category: presenter.selectedCategory,
  brand: presenter.selectedBrand,
});
```

### Check selection state
```typescript
console.log('Selection:', {
  count: presenter.selectedCount,
  hasSelection: presenter.hasSelection,
});
```

---

## TypeScript

The presenter is fully typed. Your IDE will provide autocomplete for all properties and methods.

```typescript
import type { AdminCatalogPresenter } from '@/features/catalog/hooks';

// If you need to pass presenter as prop:
interface CatalogPageProps {
  presenter: AdminCatalogPresenter;
}
```

---

## Need More Help?

📚 **Full Documentation:**
- `PHASE_3_PRESENTER_IMPLEMENTATION.md` - Detailed implementation docs
- `PHASE_3_COMPLETION_SUMMARY.md` - Phase 3 summary
- `ADMIN_CATALOG_PROJECT_COMPLETE.md` - Complete project index

📄 **Examples:**
- `src/features/catalog/USAGE_EXAMPLE.tsx` - Complete working example

🧪 **Tests:**
- `src/features/catalog/hooks/__tests__/useAdminCatalogPresenter.test.ts`

---

**Quick Links:**
- Main hook: `/src/features/catalog/hooks/useAdminCatalogPresenter.ts`
- URL sync: `/src/features/catalog/hooks/useCatalogUrlSync.ts`
- Shortcuts: `/src/features/catalog/hooks/useKeyboardShortcuts.ts`

---

**Last Updated:** October 19, 2025
