# Product Catalog Filters Component

Team Golf's implementation of the Product Catalog Filters component as specified in the Visual Preservation Guide (section 3.2).

## Overview

The ProductFilters component provides a comprehensive filtering interface for product catalogs with:
- Two-row layout (search/controls top, active filters bottom)
- Debounced search (500ms)
- Advanced filter popover with multi-select and range controls
- Active filter badges (dismissible)
- Saved searches functionality
- 200ms transition timing (per design tokens)

## Files

- **product-filters.tsx** - Main component implementation
- **../../types/product-filters.ts** - TypeScript interfaces and types

## Usage

### Basic Usage

```tsx
import { ProductFilters } from '@/components/products/product-filters';
import type { FilterState, Category, Vendor } from '@/types/product-filters';

function ProductCatalogPage() {
  const [filters, setFilters] = useState<FilterState>({});

  const categories: Category[] = [
    { id: '1', name: 'Furniture' },
    { id: '2', name: 'Lighting' },
    { id: '3', name: 'Decor' },
  ];

  const vendors: Vendor[] = [
    { id: '1', name: 'West Elm' },
    { id: '2', name: 'CB2' },
    { id: '3', name: 'Restoration Hardware' },
  ];

  return (
    <ProductFilters
      filters={filters}
      onFiltersChange={setFilters}
      categories={categories}
      vendors={vendors}
    />
  );
}
```

### With Saved Searches

```tsx
import { ProductFilters } from '@/components/products/product-filters';
import type { FilterState, SavedSearch } from '@/types/product-filters';

function ProductCatalogPage() {
  const [filters, setFilters] = useState<FilterState>({});
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);

  const handleSaveSearch = (search: SavedSearch) => {
    setSavedSearches([...savedSearches, search]);
  };

  const handleDeleteSearch = (id: string) => {
    setSavedSearches(savedSearches.filter(s => s.id !== id));
  };

  const handleLoadSearch = (search: SavedSearch) => {
    console.log('Loading search:', search.name);
  };

  return (
    <ProductFilters
      filters={filters}
      onFiltersChange={setFilters}
      categories={categories}
      vendors={vendors}
      savedSearches={savedSearches}
      onSaveSearch={handleSaveSearch}
      onDeleteSearch={handleDeleteSearch}
      onLoadSearch={handleLoadSearch}
    />
  );
}
```

## Props Interface

```typescript
interface ProductFiltersProps {
  // Required props
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  categories: Category[];
  vendors: Vendor[];

  // Optional props
  savedSearches?: SavedSearch[];
  onSaveSearch?: (search: SavedSearch) => void;
  onDeleteSearch?: (id: string) => void;
  onLoadSearch?: (search: SavedSearch) => void;
}
```

## FilterState Interface

```typescript
interface FilterState {
  search?: string;              // Text search query
  categoryIds?: string[];       // Selected category IDs
  vendorIds?: string[];         // Selected vendor IDs
  priceMin?: number;            // Minimum price (default: 0)
  priceMax?: number;            // Maximum price (default: 10000)
  inStock?: boolean;            // Show only in-stock items
  onSale?: boolean;             // Show only items on sale
  featured?: boolean;           // Show only featured items
}
```

## Features

### 1. Search Bar
- Icon overlay with magnifying glass
- Debounced search (500ms delay)
- Clay-focused states (as per design guide)
- Automatically clears when "Clear All" is clicked

### 2. Filter Popover
- Opens on "Filters" button click
- Shows badge with active filter count
- 24px spacing grid inside (per spec)
- Contains:
  - **Category Multi-Select**: Command component with search
  - **Vendor Multi-Select**: Command component with search
  - **Price Range Slider**: Dual-handle slider (0-10000)
  - **Availability Switches**: In Stock, On Sale, Featured

### 3. Active Filter Badges
- Displayed in bottom row
- Shows: "Label: Value" format
- Dismissible with X button
- Smooth 200ms transitions

### 4. Saved Searches
- Optional feature (requires callbacks)
- Save current filter state
- Load saved searches
- Delete saved searches
- Modal-style save dialog

### 5. Clear All
- Only visible when filters are active
- Resets all filters to empty state
- Clears search input

## Component Dependencies

### Radix UI Components
- `@radix-ui/react-popover` - Filter popover and nested selectors
- `@radix-ui/react-switch` - Availability toggles
- `@radix-ui/react-label` - Form labels
- `@radix-ui/react-dialog` - Save search modal

### Other Dependencies
- `cmdk` - Command palette for category/vendor selection
- `lucide-react` - Icons (Search, Filter, X, Save, ChevronDown, Check)

### UI Components Used
- `Input` - Search input
- `Button` - Action buttons
- `Badge` - Active filter badges
- `Slider` - Price range slider
- `Label` - Form labels

## Design Tokens

All transitions use the `duration-200` (200ms) timing as specified in the design tokens:

```typescript
// From @patina/design-system/tokens/animations.ts
durations.normal = '200ms'
```

This ensures consistent animation timing across:
- Search input focus states
- Popover open/close
- Button hover states
- Badge animations
- Switch transitions

## Layout Specifications

### Two-Row Layout
1. **Top Row**: Search + Controls
   - Search input (flex-1)
   - Filters button with badge
   - Saved searches button (optional)
   - Clear All button (conditional)

2. **Bottom Row**: Active Filters
   - Filter badges in flex-wrap layout
   - Only visible when filters are active
   - 2-unit gap between badges

### Spacing
- Container: `space-y-4` (16px vertical)
- Controls gap: `gap-3` (12px)
- Filter popover padding: `24px` (per spec)
- Badge spacing: `gap-2` (8px)

## Accessibility

- All interactive elements are keyboard accessible
- Popovers close on Escape key
- Focus management in Command components
- ARIA labels on switches
- Semantic HTML structure

## Notes

- Price range default: $0 - $10,000
- Debounce delay: 500ms
- Transition timing: 200ms
- Filter popover spacing: 24px grid
- The component is fully controlled - parent manages filter state
- All callbacks are optional except `onFiltersChange`
