# Phase 4: Quick Reference Guide

## Component Overview

### UI Primitives (4 files)
```
src/components/ui/
├── toggle-group.tsx    # View mode selector (grid/list/table)
├── sheet.tsx           # Filter panel drawer
├── radio-group.tsx     # Status filter radio buttons
└── separator.tsx       # Visual separators in filter panel
```

### Catalog Components (8 files + 1 index)
```
src/components/catalog/
├── admin-catalog-search-bar.tsx   # Search + view mode + filters + stats
├── admin-catalog-results.tsx      # View switcher + pagination
├── admin-catalog-filters.tsx      # Filter panel (drawer)
├── admin-product-card.tsx         # Grid view card
├── admin-product-list.tsx         # List view item
├── admin-product-table.tsx        # Table view (TanStack Table)
├── bulk-action-toolbar.tsx        # Bulk action controls
├── bulk-action-dialogs.tsx        # Confirmation modals
└── index.ts                       # Barrel exports
```

### Main Page
```
src/app/(dashboard)/catalog/page.tsx   # Completely rewritten
```

## Usage Examples

### Basic Page Setup
```tsx
import { useAdminCatalogPresenter } from '@/features/catalog/hooks/useAdminCatalogPresenter';
import {
  AdminCatalogSearchBar,
  AdminCatalogResults,
  AdminCatalogFilters,
  BulkActionToolbar,
  BulkActionDialogs,
} from '@/components/catalog';

export default function CatalogPage() {
  const presenter = useAdminCatalogPresenter();
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  return (
    <div className="flex flex-col h-full">
      <BulkActionToolbar presenter={presenter} />
      <AdminCatalogSearchBar
        presenter={presenter}
        onFilterClick={() => setIsFilterPanelOpen(true)}
      />
      <AdminCatalogResults presenter={presenter} />
      <AdminCatalogFilters
        presenter={presenter}
        isOpen={isFilterPanelOpen}
        onClose={() => setIsFilterPanelOpen(false)}
      />
      <BulkActionDialogs presenter={presenter} />
    </div>
  );
}
```

### Accessing Presenter State
```tsx
// Search state
presenter.searchQuery           // Current search query
presenter.debouncedSearchQuery  // Debounced query for API
presenter.handleSearchChange()  // Update search
presenter.handleClearSearch()   // Clear search

// View mode
presenter.viewMode             // 'grid' | 'list' | 'table'
presenter.setViewMode()        // Change view

// Filters
presenter.selectedStatus       // Current status filter
presenter.selectedCategory     // Current category filter
presenter.selectedBrand        // Current brand filter
presenter.activeFilterCount    // Number of active filters
presenter.hasActiveFilters     // Boolean
presenter.handleStatusChange() // Update status filter
presenter.handleClearFilters() // Clear all filters

// Products
presenter.products             // Array of products
presenter.isLoadingProducts    // Loading state
presenter.totalProducts        // Total count
presenter.currentPage          // Current page number
presenter.totalPages           // Total page count
presenter.handlePageChange()   // Navigate pages

// Bulk selection
presenter.selectedCount        // Number selected
presenter.hasSelection         // Boolean
presenter.handleProductToggle()     // Toggle single product
presenter.handleSelectAllOnPage()   // Select all on page
presenter.handleClearSelection()    // Clear selection

// Bulk actions
presenter.handleBulkPublish()      // Publish selected
presenter.handleBulkUnpublish()    // Unpublish selected
presenter.handleBulkDelete()       // Delete selected

// Modals
presenter.isPublishModalOpen       // Publish modal state
presenter.openPublishModal()       // Open publish modal
presenter.closePublishModal()      // Close publish modal
// Same pattern for unpublish and delete modals

// Statistics
presenter.stats                    // CatalogStats object
presenter.refreshStats()           // Refresh stats
```

### Component Props

#### AdminCatalogSearchBar
```tsx
interface AdminCatalogSearchBarProps {
  presenter: AdminCatalogPresenter;
  onFilterClick?: () => void;
}
```

#### AdminCatalogResults
```tsx
interface AdminCatalogResultsProps {
  presenter: AdminCatalogPresenter;
}
```

#### AdminCatalogFilters
```tsx
interface AdminCatalogFiltersProps {
  presenter: AdminCatalogPresenter;
  isOpen: boolean;
  onClose: () => void;
}
```

#### AdminProductCard/List
```tsx
interface AdminProductCardProps {
  product: ProductListItem;
  presenter: AdminCatalogPresenter;
}
```

#### AdminProductTable
```tsx
interface AdminProductTableProps {
  products: ProductListItem[];
  presenter: AdminCatalogPresenter;
}
```

#### BulkActionToolbar
```tsx
interface BulkActionToolbarProps {
  presenter: AdminCatalogPresenter;
}
```

#### BulkActionDialogs
```tsx
interface BulkActionDialogsProps {
  presenter: AdminCatalogPresenter;
}
```

## Key Features

### View Modes
- **Grid**: 4-column responsive grid with cards
- **List**: Horizontal cards with expanded info
- **Table**: Sortable data table with inline actions

### Search & Filters
- **Search**: Debounced text search (300ms)
- **Status**: Published, Draft, In Review, Deprecated
- **Category**: Text search
- **Brand**: Text search
- **Price Range**: Min/max inputs
- **Quality**: Validation issues, complete data
- **Features**: 3D, AR, variants, customizable

### Bulk Operations
- **Publish**: Make products visible
- **Unpublish**: Hide products (with reason)
- **Duplicate**: Clone selected products
- **Archive**: Move to archive
- **Delete**: Permanent deletion (with warning)

### States
- **Loading**: Skeleton loaders
- **Empty**: No products in catalog
- **No Results**: Filters applied but no matches
- **Error**: Graceful error handling

### Accessibility
- Full keyboard navigation
- ARIA labels on all interactive elements
- Screen reader support
- Focus management in modals

### Performance
- Debounced search
- Optimistic updates
- Skeleton loading
- Image optimization
- LocalStorage for preferences

## Common Tasks

### Add a New Filter
1. Add filter state to presenter hook
2. Add filter UI in `AdminCatalogFilters`
3. Connect to presenter state/handler
4. Add filter chip in `AdminCatalogSearchBar`
5. Update `activeFilterCount` logic

### Customize Table Columns
1. Edit `columns` array in `AdminProductTable`
2. Add/remove column definitions
3. Update sorting if needed
4. Adjust responsive breakpoints

### Add Bulk Action
1. Add action handler to presenter
2. Add button to `BulkActionToolbar`
3. Add confirmation dialog to `BulkActionDialogs`
4. Implement API call in service layer

### Change View Mode Default
```tsx
// In useAdminCatalogPresenter
const [viewMode, setViewMode] = useState<ViewMode>('list'); // Change default
```

### Customize Empty States
Edit messages in `AdminCatalogResults`:
- `isEmptyState`: No products at all
- `isNoResults`: Filters applied, no matches

## Styling Guide

### Design Tokens
- Primary color: Blue (#3B82F6)
- Success: Green (#10B981)
- Warning: Yellow (#F59E0B)
- Danger: Red (#EF4444)
- Gray scale: 50-900

### Spacing
- Gap between items: 4 (1rem)
- Padding: 4-6 (1rem-1.5rem)
- Card padding: 4 (1rem)

### Breakpoints
- sm: 640px
- md: 768px
- lg: 1024px
- xl: 1280px

### Grid Columns
```tsx
grid-cols-1           // Mobile
md:grid-cols-2        // Tablet
lg:grid-cols-3        // Laptop
xl:grid-cols-4        // Desktop
```

## Keyboard Shortcuts

- **Escape**: Clear selection or close modals
- **Cmd/Ctrl + A**: Select all products on page
- **Tab**: Navigate between elements
- **Enter**: Activate focused button
- **Space**: Toggle checkbox/radio

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Dependencies

```json
{
  "@radix-ui/react-toggle-group": "^1.0.4",
  "@radix-ui/react-radio-group": "^1.1.3",
  "@radix-ui/react-separator": "^1.0.3",
  "@radix-ui/react-dialog": "^1.0.5",
  "@tanstack/react-table": "^8.x",
  "@tanstack/react-query": "^5.x",
  "lucide-react": "^0.x",
  "next": "^15.x",
  "react": "^18.x"
}
```

## File Sizes

```
UI Primitives:        ~333 lines
Catalog Components: ~1,458 lines
Main Page:            ~63 lines
Total:             ~1,854 lines
```

## Next Steps

1. **Install dependencies**: `pnpm install @radix-ui/react-toggle-group @radix-ui/react-radio-group @radix-ui/react-separator`
2. **Test locally**: `pnpm --filter @patina/admin-portal dev`
3. **Verify views**: Switch between grid/list/table
4. **Test filters**: Apply different filter combinations
5. **Test bulk actions**: Select products and perform actions
6. **Check accessibility**: Navigate with keyboard
7. **Test responsiveness**: Check on mobile/tablet/desktop

## Troubleshooting

### Components not rendering
- Check presenter hook is initialized
- Verify all imports are correct
- Check console for TypeScript errors

### Filter panel not opening
- Verify `onFilterClick` is passed to SearchBar
- Check `isFilterPanelOpen` state is managed
- Ensure Sheet component is rendered

### Bulk actions not working
- Check products are being selected
- Verify `selectedCount` is > 0
- Check modal state in presenter

### Table not sorting
- Verify TanStack Table is installed
- Check column definitions have `accessorKey`
- Ensure sortable columns have `header` function

## Support

For questions or issues:
1. Check Phase 3 presenter documentation
2. Review component JSDoc comments
3. Examine existing catalog components
4. Reference Radix UI documentation
5. Check TanStack Table documentation
