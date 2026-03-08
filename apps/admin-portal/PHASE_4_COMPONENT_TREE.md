# Phase 4: Component Tree Visualization

## Page Hierarchy

```
CatalogPage
├── PageHeader
│   ├── Title: "Catalog"
│   └── Description: "Manage products, variants, and categories"
│
├── BulkActionToolbar (conditional: when hasSelection)
│   ├── SelectionBadge (count)
│   ├── ClearButton
│   └── ActionButtons
│       ├── PublishButton
│       ├── UnpublishButton
│       ├── DuplicateButton
│       ├── ArchiveButton
│       └── DeleteButton
│
├── AdminCatalogSearchBar
│   ├── SearchInput
│   │   ├── SearchIcon
│   │   ├── TextInput (debounced)
│   │   └── ClearButton (conditional)
│   ├── ViewModeToggle
│   │   ├── GridButton
│   │   ├── ListButton
│   │   └── TableButton
│   ├── FilterButton (with badge)
│   ├── ExportButton
│   ├── StatsRow
│   │   ├── TotalProducts
│   │   ├── PublishedCount
│   │   ├── DraftsCount
│   │   └── IssuesCount (conditional)
│   └── ActiveFiltersRow (conditional)
│       ├── FilterChips[]
│       │   └── FilterChip
│       │       ├── Label
│       │       └── RemoveButton
│       └── ClearAllButton
│
├── AdminCatalogResults
│   ├── LoadingState (conditional)
│   │   └── Skeletons[8]
│   ├── EmptyState (conditional)
│   │   ├── EmptyIcon
│   │   ├── Title
│   │   ├── Description
│   │   └── Actions
│   │       ├── CreateButton
│   │       └── ImportButton
│   ├── NoResultsState (conditional)
│   │   ├── FilterIcon
│   │   ├── Title
│   │   ├── Description
│   │   └── Actions
│   │       ├── ClearSearchButton
│   │       └── ClearFiltersButton
│   ├── GridView (conditional: viewMode === 'grid')
│   │   └── AdminProductCard[]
│   │       ├── SelectionCheckbox
│   │       ├── ProductImage
│   │       │   └── MediaBadges (3D, AR)
│   │       ├── ProductInfo
│   │       │   ├── Title
│   │       │   ├── Brand
│   │       │   ├── StatusBadge
│   │       │   ├── ValidationIndicator
│   │       │   ├── Price
│   │       │   └── Metadata
│   │       └── Actions
│   │           ├── ViewButton
│   │           └── MoreMenu
│   │               ├── EditItem
│   │               ├── DuplicateItem
│   │               ├── PublishItem
│   │               └── DeleteItem
│   ├── ListView (conditional: viewMode === 'list')
│   │   └── AdminProductList[]
│   │       ├── SelectionCheckbox
│   │       ├── Thumbnail
│   │       ├── ProductInfo
│   │       │   ├── Title + Brand
│   │       │   ├── Metadata (price, variants, category)
│   │       │   └── Badges (status, features, validation)
│   │       └── Actions
│   │           ├── UpdatedDate
│   │           ├── ViewButton
│   │           └── MoreMenu
│   ├── TableView (conditional: viewMode === 'table')
│   │   └── AdminProductTable
│   │       ├── TableHeader
│   │       │   ├── SelectAllCheckbox
│   │       │   ├── ImageColumn
│   │       │   ├── ProductColumn (sortable)
│   │       │   ├── StatusColumn
│   │       │   ├── PriceColumn (sortable)
│   │       │   ├── CategoryColumn
│   │       │   ├── VariantsColumn
│   │       │   ├── FeaturesColumn
│   │       │   ├── UpdatedColumn (sortable)
│   │       │   └── ActionsColumn
│   │       └── TableRows[]
│   │           └── TableRow
│   │               ├── SelectionCheckbox
│   │               ├── ImageCell
│   │               ├── ProductCell
│   │               ├── StatusCell
│   │               ├── PriceCell
│   │               ├── CategoryCell
│   │               ├── VariantsCell
│   │               ├── FeaturesCell
│   │               ├── UpdatedCell
│   │               └── ActionsCell
│   │                   ├── ViewButton
│   │                   └── MoreMenu
│   └── Pagination (conditional: totalPages > 1)
│       ├── PageInfo
│       ├── PreviousButton
│       ├── PageNumbers[5]
│       └── NextButton
│
├── AdminCatalogFilters (Sheet/Drawer)
│   ├── SheetHeader
│   │   ├── Title: "Filters"
│   │   └── ActiveBadge (conditional)
│   ├── FilterGroups
│   │   ├── StatusFilter
│   │   │   └── RadioGroup
│   │   │       ├── AllOption
│   │   │       ├── PublishedOption
│   │   │       ├── DraftOption
│   │   │       ├── InReviewOption
│   │   │       └── DeprecatedOption
│   │   ├── Separator
│   │   ├── CategoryFilter
│   │   │   ├── SearchInput
│   │   │   └── ClearButton (conditional)
│   │   ├── Separator
│   │   ├── BrandFilter
│   │   │   ├── SearchInput
│   │   │   └── ClearButton (conditional)
│   │   ├── Separator
│   │   ├── PriceRangeFilter
│   │   │   ├── MinInput
│   │   │   ├── MaxInput
│   │   │   └── ApplyButton
│   │   ├── Separator
│   │   ├── DataQualityFilter
│   │   │   ├── HasIssuesCheckbox
│   │   │   └── CompleteDataCheckbox
│   │   ├── Separator
│   │   └── FeaturesFilter
│   │       ├── Has3DCheckbox
│   │       ├── ARSupportedCheckbox
│   │       ├── HasVariantsCheckbox
│   │       └── CustomizableCheckbox
│   └── FilterActions
│       ├── ClearAllButton
│       └── ApplyButton
│
└── BulkActionDialogs
    ├── PublishDialog
    │   ├── AlertDialogContent
    │   │   ├── Header
    │   │   │   ├── Title: "Publish Products"
    │   │   │   └── Description
    │   │   └── Footer
    │   │       ├── CancelButton
    │   │       └── ConfirmButton
    ├── UnpublishDialog
    │   ├── AlertDialogContent
    │   │   ├── Header
    │   │   │   ├── Title: "Unpublish Products"
    │   │   │   └── Description
    │   │   ├── ReasonInput (optional)
    │   │   └── Footer
    │   │       ├── CancelButton
    │   │       └── ConfirmButton
    └── DeleteDialog
        └── AlertDialogContent
            ├── Header
            │   ├── Title: "Delete Products"
            │   └── Description
            ├── WarningBanner
            └── Footer
                ├── CancelButton
                └── ConfirmButton
```

## Data Flow

```
┌─────────────────────────────────────────────────────────┐
│                  useAdminCatalogPresenter               │
│                                                          │
│  State:                                                 │
│  • searchQuery, viewMode, filters                      │
│  • currentPage, pageSize, sortBy                       │
│  • selectedStatus, selectedCategory, selectedBrand     │
│  • isPublishModalOpen, etc.                            │
│                                                          │
│  Data:                                                  │
│  • products[], totalProducts, totalPages               │
│  • stats, activeFilterCount, selectedCount             │
│                                                          │
│  Actions:                                               │
│  • handleSearchChange, handlePageChange                │
│  • handleStatusChange, handleClearFilters              │
│  • handleProductToggle, handleBulkPublish              │
└─────────────────────────────────────────────────────────┘
                          │
                          │ (presenter prop)
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    CatalogPage                          │
│                                                          │
│  Local State:                                           │
│  • isFilterPanelOpen                                    │
└─────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
    ┌─────────┐       ┌──────────────┐      ┌──────────┐
    │ Search  │       │   Results    │      │ Filters  │
    │  Bar    │       │              │      │  Panel   │
    └─────────┘       └──────────────┘      └──────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
              ┌──────────┐        ┌─────────┐
              │   Grid   │        │  List   │
              │  Cards   │        │  Items  │
              └──────────┘        └─────────┘
                                        │
                                        ▼
                                  ┌─────────┐
                                  │  Table  │
                                  │  Rows   │
                                  └─────────┘
```

## State Management Flow

```
User Action
    │
    ▼
Component Event Handler
    │
    ▼
Presenter Action Method
    │
    ├──► Update Local State
    │    (searchQuery, filters, etc.)
    │
    ├──► Call Service Layer
    │    (via TanStack Query)
    │
    └──► Update URL (optional)
         (for shareable links)
    │
    ▼
TanStack Query Updates
    │
    ├──► Cache Update
    │
    └──► Component Re-render
         (new data from presenter)
    │
    ▼
UI Updates
```

## Component Responsibilities

### AdminCatalogSearchBar
- **Responsibility**: Search input, view mode selection, filter trigger
- **State**: None (uses presenter)
- **Props**: presenter, onFilterClick
- **Renders**: Search input, view toggle, stats, active filters

### AdminCatalogResults
- **Responsibility**: View rendering, pagination, empty states
- **State**: None (uses presenter)
- **Props**: presenter
- **Renders**: Grid/List/Table, pagination, loading/empty states

### AdminProductCard
- **Responsibility**: Single product in grid view
- **State**: None (uses presenter)
- **Props**: product, presenter
- **Renders**: Image, title, status, price, actions

### AdminProductList
- **Responsibility**: Single product in list view
- **State**: None (uses presenter)
- **Props**: product, presenter
- **Renders**: Horizontal layout with expanded info

### AdminProductTable
- **Responsibility**: All products in table view
- **State**: Table state (via TanStack Table)
- **Props**: products[], presenter
- **Renders**: Sortable table with inline actions

### AdminCatalogFilters
- **Responsibility**: Filter panel UI
- **State**: Local price inputs
- **Props**: presenter, isOpen, onClose
- **Renders**: Filter controls in drawer

### BulkActionToolbar
- **Responsibility**: Bulk action controls
- **State**: None (uses presenter)
- **Props**: presenter
- **Renders**: Action buttons when products selected

### BulkActionDialogs
- **Responsibility**: Confirmation modals
- **State**: Local unpublish reason
- **Props**: presenter
- **Renders**: Three confirmation dialogs

## Presenter Interface Summary

```typescript
interface AdminCatalogPresenter {
  // Search
  searchQuery: string
  handleSearchChange(query: string): void
  handleClearSearch(): void

  // View Mode
  viewMode: 'grid' | 'list' | 'table'
  setViewMode(mode: ViewMode): void

  // Filters
  selectedStatus: string | null
  selectedCategory: string | null
  selectedBrand: string | null
  activeFilterCount: number
  hasActiveFilters: boolean
  handleStatusChange(status: string | null): void
  handleCategoryChange(category: string | null): void
  handleBrandChange(brand: string | null): void
  handleClearFilters(): void

  // Pagination
  currentPage: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
  handlePageChange(page: number): void

  // Products
  products: ProductListItem[]
  isLoadingProducts: boolean
  totalProducts: number
  isEmpty: boolean
  isEmptyState: boolean
  isNoResults: boolean

  // Selection
  selectedCount: number
  hasSelection: boolean
  handleProductToggle(id: string): void
  handleSelectAllOnPage(): void
  handleClearSelection(): void

  // Bulk Actions
  handleBulkPublish(): Promise<void>
  handleBulkUnpublish(reason?: string): Promise<void>
  handleBulkDelete(): Promise<void>

  // Modals
  isPublishModalOpen: boolean
  isUnpublishModalOpen: boolean
  isDeleteModalOpen: boolean
  openPublishModal(): void
  closePublishModal(): void
  openUnpublishModal(): void
  closeUnpublishModal(): void
  openDeleteModal(): void
  closeDeleteModal(): void

  // Stats
  stats: CatalogStats
  refreshStats(): void
  refreshData(): void
}
```

## Communication Patterns

### Parent → Child (Props)
```
CatalogPage
    ↓ (presenter prop)
AdminCatalogSearchBar
    ↓ (presenter prop)
All child components
```

### Child → Parent (Callbacks)
```
AdminCatalogSearchBar
    ↑ (onFilterClick)
CatalogPage
    ↓ (setIsFilterPanelOpen)
AdminCatalogFilters (opens)
```

### Sibling Communication (via Presenter)
```
AdminCatalogSearchBar
    ↓ (presenter.handleSearchChange)
Presenter State Updated
    ↓ (presenter.products updated)
AdminCatalogResults
    → Re-renders with new products
```

## Event Flow Examples

### Search Flow
```
1. User types in search input
2. AdminCatalogSearchBar calls presenter.handleSearchChange()
3. Presenter updates searchQuery state
4. After 300ms debounce, debouncedSearchQuery updates
5. TanStack Query refetches with new query
6. Presenter.products updates
7. AdminCatalogResults re-renders
8. Grid/List/Table shows new results
```

### Filter Flow
```
1. User clicks Filter button
2. AdminCatalogSearchBar calls onFilterClick()
3. CatalogPage updates isFilterPanelOpen = true
4. AdminCatalogFilters opens (sheet animation)
5. User selects status filter
6. AdminCatalogFilters calls presenter.handleStatusChange()
7. Presenter updates selectedStatus state
8. TanStack Query refetches with new filters
9. Presenter.products updates
10. AdminCatalogResults re-renders
```

### Bulk Delete Flow
```
1. User selects products (checkboxes)
2. Components call presenter.handleProductToggle()
3. Presenter updates selection state
4. BulkActionToolbar appears (hasSelection = true)
5. User clicks Delete button
6. BulkActionToolbar calls presenter.openDeleteModal()
7. Presenter updates isDeleteModalOpen = true
8. BulkActionDialogs shows delete dialog
9. User clicks Confirm
10. BulkActionDialogs calls presenter.handleBulkDelete()
11. Presenter calls service layer
12. Service deletes products via API
13. TanStack Query invalidates cache
14. Presenter.products updates
15. All views re-render
16. Dialog closes automatically
```

This visualization shows the complete component tree, data flow, and communication patterns implemented in Phase 4.
