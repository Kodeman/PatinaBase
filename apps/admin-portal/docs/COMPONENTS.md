# Admin Portal Catalog - Component Documentation

**Complete reference for all catalog components**

---

## Component Catalog

### Page Components

#### CatalogPage

Main catalog listing page with search, filters, and bulk operations.

**Location:** `/apps/admin-portal/src/app/(dashboard)/catalog/page.tsx`

**Features:**
- Product grid/list/table views
- Search and filtering
- Bulk selection and actions
- Product creation
- Pagination

**Example:**
```typescript
// Automatically rendered by Next.js App Router
// Access at: /catalog
```

---

### Layout Components

#### AdminCatalogSearchBar

Search bar with view mode toggles.

**Props:**
```typescript
interface AdminCatalogSearchBarProps {
  presenter: AdminCatalogPresenter;
  onFilterClick: () => void;
}
```

**Usage:**
```typescript
<AdminCatalogSearchBar
  presenter={presenter}
  onFilterClick={() => setIsFilterPanelOpen(true)}
/>
```

**Features:**
- Debounced search input (300ms)
- View mode switcher (Grid/List/Table)
- Filter panel trigger
- Clear search button

---

#### AdminCatalogFilters

Advanced filter drawer with multiple criteria.

**Props:**
```typescript
interface AdminCatalogFiltersProps {
  presenter: AdminCatalogPresenter;
  isOpen: boolean;
  onClose: () => void;
}
```

**Usage:**
```typescript
<AdminCatalogFilters
  presenter={presenter}
  isOpen={isFilterPanelOpen}
  onClose={() => setIsFilterPanelOpen(false)}
/>
```

**Filter Options:**
- Status (Draft, In Review, Published, Archived)
- Category (hierarchical selection)
- Brand (dropdown)
- Price range (min/max)
- Features (3D, AR, Customizable)
- Validation issues
- Date ranges (created, updated, published)

---

#### AdminCatalogResults

Product display component with loading/error/empty states.

**Props:**
```typescript
interface AdminCatalogResultsProps {
  presenter: AdminCatalogPresenter;
}
```

**Usage:**
```typescript
<AdminCatalogResults presenter={presenter} />
```

**Displays:**
- `AdminProductGrid` in grid mode
- `AdminProductList` in list mode
- `AdminProductTable` in table mode
- Loading spinner during fetch
- Error message on failure
- Empty state when no products
- No results state when filtered with no matches

---

### Display Components

#### AdminProductCard

Product card for grid view.

**Props:**
```typescript
interface AdminProductCardProps {
  product: ProductListItem;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onEdit: (id: string) => void;
}
```

**Usage:**
```typescript
<AdminProductCard
  product={product}
  isSelected={selectedIds.has(product.id)}
  onToggleSelect={handleToggle}
  onEdit={(id) => router.push(`/catalog/${id}`)}
/>
```

**Displays:**
- Product image (cover)
- Product name
- Brand
- Price and MSRP (with discount %)
- Status badge
- Validation badge (if issues)
- Selection checkbox
- Quick action buttons (Edit, View)

---

#### AdminProductList

Product list item for list view.

**Props:**
```typescript
interface AdminProductListProps {
  product: ProductListItem;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}
```

**Usage:**
```typescript
<AdminProductList
  product={product}
  isSelected={selectedIds.has(product.id)}
  onToggleSelect={handleToggle}
/>
```

**Displays:**
- Thumbnail image (small)
- Product name and brand (inline)
- Price
- Status
- Last updated date
- Compact layout for more items per screen

---

#### AdminProductTable

Product table row for table view.

**Props:**
```typescript
interface AdminProductTableProps {
  products: ProductListItem[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onSort: (field: string) => void;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}
```

**Usage:**
```typescript
<AdminProductTable
  products={products}
  selectedIds={selectedIds}
  onToggleSelect={handleToggle}
  onSelectAll={handleSelectAll}
  onSort={handleSort}
  sortBy="createdAt"
  sortOrder="desc"
/>
```

**Columns:**
- Selection checkbox
- Image thumbnail
- Name
- Brand
- Category
- Price
- Status
- Validation (icon)
- Created Date
- Updated Date
- Actions (dropdown)

**Features:**
- Sortable columns (click header)
- Select all checkbox
- Row hover state
- Action dropdown per row

---

### Action Components

#### BulkActionToolbar

Toolbar that appears when products are selected.

**Props:**
```typescript
interface BulkActionToolbarProps {
  presenter: AdminCatalogPresenter;
}
```

**Usage:**
```typescript
<BulkActionToolbar presenter={presenter} />
```

**Displays:**
- Selection count
- "Publish" button
- "Unpublish" button
- "Delete" button
- "Clear Selection" button

**Behavior:**
- Only visible when `presenter.hasSelection === true`
- Buttons open confirmation modals
- Shows loading state during operations

---

#### BulkActionDialogs

Confirmation dialogs for bulk operations.

**Props:**
```typescript
interface BulkActionDialogsProps {
  presenter: AdminCatalogPresenter;
}
```

**Usage:**
```typescript
<BulkActionDialogs presenter={presenter} />
```

**Includes:**
- **PublishConfirmDialog**: Confirms bulk publish
  - Shows list of products to publish
  - Validates eligibility
  - Displays progress
- **UnpublishConfirmDialog**: Confirms bulk unpublish
  - Optional reason field
  - Shows affected products
- **DeleteConfirmDialog**: Confirms bulk delete
  - Type "DELETE" to confirm
  - Warning about permanent deletion
  - Shows what will be deleted

---

### Form Components

#### ProductCreateDialog

Modal dialog for creating new products.

**Props:**
```typescript
interface ProductCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (productId: string) => void;
}
```

**Usage:**
```typescript
<ProductCreateDialog
  open={isCreateDialogOpen}
  onOpenChange={setIsCreateDialogOpen}
  onSuccess={(productId) => {
    console.log('Created:', productId);
    presenter.refreshData();
  }}
/>
```

**Form Sections:**
1. **Basic Information**
   - Product Name (required, 3-255 chars)
   - Brand (required, 2-100 chars)
   - Short Description (required, 10-500 chars)

2. **Pricing**
   - Price (required, > $0)
   - MSRP (optional)

3. **Categorization**
   - Category (required, dropdown)
   - Status (draft or in_review)

4. **Attributes**
   - Tags (multi-input)
   - Materials (multi-input)
   - Colors (multi-input)
   - Style Tags (multi-input)

**Validation:**
- Client-side with Zod schema
- Real-time field validation
- Error messages below fields
- Submit disabled until valid

**Features:**
- Auto-loading categories
- Multi-input fields with tag chips
- Toast notifications on success/error
- Auto-refresh product list on success

---

#### MultiInput

Reusable multi-value input component.

**Props:**
```typescript
interface MultiInputProps {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
  id?: string;
}
```

**Usage:**
```typescript
<MultiInput
  label="Tags"
  placeholder="Add tags..."
  values={tags}
  onChange={(newTags) => setValue('tags', newTags)}
/>
```

**Interactions:**
- **Enter or Comma**: Add new value
- **Backspace** (empty input): Remove last value
- **Click ×**: Remove specific value
- Prevents duplicates
- Shows values as chips

**Example:**
```
┌─────────────────────────────────────────┐
│ Tags                                    │
├─────────────────────────────────────────┤
│ [modern ×] [sectional ×] [leather ×] _  │
└─────────────────────────────────────────┘
  Press Enter or comma to add
```

---

### Utility Components

#### CatalogErrorFallback

Error boundary fallback for catalog errors.

**Props:**
```typescript
interface CatalogErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}
```

**Usage:**
```typescript
<ErrorBoundary FallbackComponent={CatalogErrorFallback}>
  <CatalogContent />
</ErrorBoundary>
```

**Displays:**
- Error icon
- Error message
- "Try Again" button
- "Report Issue" link

---

## Component Patterns

### Presenter Pattern

Most catalog components receive a `presenter` prop containing all state and actions.

**Benefits:**
- Centralized business logic
- Easy testing (mock presenter)
- Consistent interface
- Clean components

**Example:**
```typescript
interface ComponentProps {
  presenter: AdminCatalogPresenter;
}

function Component({ presenter }: ComponentProps) {
  return (
    <div>
      <SearchBar
        value={presenter.searchQuery}
        onChange={presenter.handleSearchChange}
      />
      <Results products={presenter.products} />
    </div>
  );
}
```

### Composition Over Props

Break down complex components into smaller, composable pieces.

**Example:**
```typescript
// Instead of:
<ProductCard
  showImage={true}
  showPrice={true}
  showStatus={true}
  showActions={true}
/>

// Use composition:
<ProductCard>
  <ProductCard.Image />
  <ProductCard.Info>
    <ProductCard.Price />
    <ProductCard.Status />
  </ProductCard.Info>
  <ProductCard.Actions />
</ProductCard>
```

### Render Props

For flexible, reusable components.

**Example:**
```typescript
<ProductList
  products={products}
  renderItem={(product) => (
    <CustomProductCard product={product} />
  )}
/>
```

---

## Styling

### Tailwind CSS

All components use Tailwind for styling.

**Class Organization:**
```typescript
<div className="
  flex items-center justify-between
  p-4 rounded-lg
  bg-white border border-gray-200
  hover:shadow-md transition-shadow
">
```

**Order:**
1. Layout (flex, grid)
2. Sizing (w-, h-, p-, m-)
3. Appearance (bg-, border-, rounded-)
4. Typography (text-, font-)
5. States (hover:, focus:, active:)
6. Responsive (sm:, md:, lg:)

### Design Tokens

**Colors:**
```typescript
bg-primary        // Brand color
bg-secondary      // Secondary brand
bg-accent         // Accent color
bg-muted          // Muted backgrounds
bg-destructive    // Delete/danger actions
```

**Spacing:**
```typescript
p-1  // 0.25rem (4px)
p-2  // 0.5rem (8px)
p-4  // 1rem (16px)
p-6  // 1.5rem (24px)
p-8  // 2rem (32px)
```

**Typography:**
```typescript
text-xs   // 0.75rem (12px)
text-sm   // 0.875rem (14px)
text-base // 1rem (16px)
text-lg   // 1.125rem (18px)
text-xl   // 1.25rem (20px)
```

---

## Accessibility

### ARIA Labels

```typescript
<button
  onClick={handleDelete}
  aria-label="Delete product"
  aria-describedby="delete-help"
>
  <TrashIcon />
</button>
<span id="delete-help" className="sr-only">
  This action cannot be undone
</span>
```

### Keyboard Navigation

**Tab Order:**
1. Search input
2. Filter button
3. View mode buttons
4. Product cards/rows
5. Pagination

**Shortcuts:**
- `Escape`: Close modals/panels
- `Cmd/Ctrl + K`: Focus search
- `Cmd/Ctrl + F`: Open filters
- `Enter`: Submit forms

### Focus Management

```typescript
useEffect(() => {
  if (isOpen) {
    firstInputRef.current?.focus();
  }
}, [isOpen]);
```

---

## Performance

### React.memo

Use for expensive components:
```typescript
export const ProductCard = React.memo(
  function ProductCard(props) {
    // Component code
  },
  (prev, next) => prev.product.id === next.product.id
);
```

### useMemo

Expensive computations:
```typescript
const filteredProducts = useMemo(
  () => products.filter(matchesFilter),
  [products, filter]
);
```

### useCallback

Stable function references:
```typescript
const handleClick = useCallback(
  (id: string) => onSelect(id),
  [onSelect]
);
```

---

## Testing Components

### Unit Tests

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductCard } from './product-card';

describe('ProductCard', () => {
  const mockProduct = {
    id: '1',
    name: 'Test Product',
    price: 100
  };

  it('renders product name', () => {
    render(<ProductCard product={mockProduct} />);
    expect(screen.getByText('Test Product')).toBeInTheDocument();
  });

  it('calls onSelect when clicked', async () => {
    const onSelect = jest.fn();
    render(<ProductCard product={mockProduct} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('checkbox'));
    expect(onSelect).toHaveBeenCalledWith('1');
  });
});
```

### Integration Tests

```typescript
import { renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useAdminCatalogPresenter } from './useAdminCatalogPresenter';

describe('CatalogPage Integration', () => {
  it('loads products on mount', async () => {
    const { result, waitFor } = renderHook(
      () => useAdminCatalogPresenter(),
      { wrapper: QueryClientProvider }
    );

    await waitFor(() => {
      expect(result.current.products).toHaveLength(20);
    });
  });
});
```

---

## Related Documentation

- **User Guide**: [USER_GUIDE.md](./USER_GUIDE.md)
- **API Reference**: [API_REFERENCE.md](./API_REFERENCE.md)
- **Architecture**: [CATALOG_ARCHITECTURE.md](./CATALOG_ARCHITECTURE.md)
- **Testing Guide**: [TESTING_GUIDE.md](./TESTING_GUIDE.md)

---

**Last Updated:** 2025-10-19 | **Version:** 1.0
