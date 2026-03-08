/**
 * Catalog Page Usage Example
 *
 * This example demonstrates how to use the useAdminCatalogPresenter hook
 * in a real catalog page component. It shows the basic pattern and can be
 * used as a template for implementation.
 *
 * @example Basic Usage
 */

'use client';

import { useAdminCatalogPresenter } from './hooks';
import type { ProductListItem } from '@/types';

/**
 * Main Catalog Page Component
 *
 * This component uses the presenter pattern to separate business logic
 * from presentation. All state and actions come from the presenter hook.
 */
export function CatalogPage() {
  // Get all state and actions from presenter
  const presenter = useAdminCatalogPresenter();

  return (
    <div className="catalog-page">
      {/* Header with Stats */}
      <CatalogHeader stats={presenter.stats} />

      {/* Search and Filters */}
      <div className="catalog-controls">
        <SearchBar
          value={presenter.searchQuery}
          onChange={presenter.handleSearchChange}
          onClear={presenter.handleClearSearch}
          placeholder="Search products..."
        />

        <FilterBar
          status={presenter.selectedStatus}
          category={presenter.selectedCategory}
          brand={presenter.selectedBrand}
          activeCount={presenter.activeFilterCount}
          onStatusChange={presenter.handleStatusChange}
          onCategoryChange={presenter.handleCategoryChange}
          onBrandChange={presenter.handleBrandChange}
          onClear={presenter.handleClearFilters}
        />

        <ViewModeToggle
          mode={presenter.viewMode}
          onChange={presenter.setViewMode}
        />
      </div>

      {/* Bulk Action Bar (shown when products selected) */}
      {presenter.hasSelection && (
        <BulkActionBar
          count={presenter.selectedCount}
          onPublish={presenter.openPublishModal}
          onUnpublish={presenter.openUnpublishModal}
          onDelete={presenter.openDeleteModal}
          onClear={presenter.handleClearSelection}
        />
      )}

      {/* Product List with Loading/Empty States */}
      <div className="catalog-content">
        {presenter.isLoadingProducts ? (
          <LoadingState />
        ) : presenter.isEmptyState ? (
          <EmptyState message="No products in catalog" />
        ) : presenter.isNoResults ? (
          <NoResults
            message="No products match your filters"
            onClear={presenter.handleClearFilters}
          />
        ) : (
          <ProductGrid
            products={presenter.products}
            viewMode={presenter.viewMode}
            selectedIds={[]} // From bulk actions
            onToggle={presenter.handleProductToggle}
          />
        )}
      </div>

      {/* Pagination */}
      {presenter.totalPages > 1 && (
        <Pagination
          currentPage={presenter.currentPage}
          totalPages={presenter.totalPages}
          pageSize={presenter.pageSize}
          totalItems={presenter.totalProducts}
          hasNext={presenter.hasNextPage}
          hasPrevious={presenter.hasPreviousPage}
          onPageChange={presenter.handlePageChange}
          onPageSizeChange={presenter.handlePageSizeChange}
        />
      )}

      {/* Bulk Action Modals */}
      <BulkPublishModal
        isOpen={presenter.isPublishModalOpen}
        count={presenter.selectedCount}
        onConfirm={async () => {
          await presenter.handleBulkPublish();
          presenter.closePublishModal();
        }}
        onCancel={presenter.closePublishModal}
      />

      <BulkUnpublishModal
        isOpen={presenter.isUnpublishModalOpen}
        count={presenter.selectedCount}
        onConfirm={async (reason: string) => {
          await presenter.handleBulkUnpublish(reason);
          presenter.closeUnpublishModal();
        }}
        onCancel={presenter.closeUnpublishModal}
      />

      <BulkDeleteModal
        isOpen={presenter.isDeleteModalOpen}
        count={presenter.selectedCount}
        onConfirm={async () => {
          await presenter.handleBulkDelete();
          presenter.closeDeleteModal();
        }}
        onCancel={presenter.closeDeleteModal}
      />
    </div>
  );
}

/**
 * Example Component: Catalog Header with Stats
 */
function CatalogHeader({ stats }: { stats: any }) {
  if (!stats) return null;

  return (
    <div className="catalog-header">
      <h1>Product Catalog</h1>
      <div className="stats">
        <StatCard label="Total Products" value={stats.totalProducts} />
        <StatCard label="Published" value={stats.publishedProducts} />
        <StatCard label="Drafts" value={stats.draftProducts} />
        <StatCard label="Variants" value={stats.totalVariants} />
      </div>
    </div>
  );
}

/**
 * Example Component: Search Bar
 */
function SearchBar({
  value,
  onChange,
  onClear,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder?: string;
}) {
  return (
    <div className="search-bar">
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="search-input"
      />
      {value && (
        <button onClick={onClear} className="clear-btn">
          Clear
        </button>
      )}
    </div>
  );
}

/**
 * Example Component: Filter Bar
 */
function FilterBar({
  status,
  category,
  brand,
  activeCount,
  onStatusChange,
  onCategoryChange,
  onBrandChange,
  onClear,
}: {
  status: string | null;
  category: string | null;
  brand: string | null;
  activeCount: number;
  onStatusChange: (value: string | null) => void;
  onCategoryChange: (value: string | null) => void;
  onBrandChange: (value: string | null) => void;
  onClear: () => void;
}) {
  return (
    <div className="filter-bar">
      <select
        value={status || ''}
        onChange={(e) => onStatusChange(e.target.value || null)}
      >
        <option value="">All Status</option>
        <option value="draft">Draft</option>
        <option value="published">Published</option>
      </select>

      <select
        value={category || ''}
        onChange={(e) => onCategoryChange(e.target.value || null)}
      >
        <option value="">All Categories</option>
        {/* Add category options */}
      </select>

      <select
        value={brand || ''}
        onChange={(e) => onBrandChange(e.target.value || null)}
      >
        <option value="">All Brands</option>
        {/* Add brand options */}
      </select>

      {activeCount > 0 && (
        <button onClick={onClear} className="clear-filters-btn">
          Clear Filters ({activeCount})
        </button>
      )}
    </div>
  );
}

/**
 * Example Component: Bulk Action Bar
 */
function BulkActionBar({
  count,
  onPublish,
  onUnpublish,
  onDelete,
  onClear,
}: {
  count: number;
  onPublish: () => void;
  onUnpublish: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div className="bulk-action-bar">
      <span>{count} selected</span>
      <button onClick={onPublish}>Publish</button>
      <button onClick={onUnpublish}>Unpublish</button>
      <button onClick={onDelete}>Delete</button>
      <button onClick={onClear}>Clear Selection</button>
    </div>
  );
}

/**
 * Example Component: Product Grid
 */
function ProductGrid({
  products,
  viewMode,
  selectedIds,
  onToggle,
}: {
  products: ProductListItem[];
  viewMode: 'grid' | 'list' | 'table';
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className={`product-grid view-${viewMode}`}>
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          isSelected={selectedIds.includes(product.id)}
          onToggle={() => onToggle(product.id)}
        />
      ))}
    </div>
  );
}

/**
 * Example Component: Product Card
 */
function ProductCard({
  product,
  isSelected,
  onToggle,
}: {
  product: ProductListItem;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`product-card ${isSelected ? 'selected' : ''}`}>
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
      />
      <img src={product.coverImage || '/placeholder.png'} alt={product.name} />
      <h3>{product.name}</h3>
      <p>{product.brand}</p>
      <span className={`status-badge ${product.status}`}>
        {product.status}
      </span>
    </div>
  );
}

/**
 * Example Component: Pagination
 */
function Pagination({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  hasNext,
  hasPrevious,
  onPageChange,
  onPageSizeChange,
}: {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  hasNext: boolean;
  hasPrevious: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  return (
    <div className="pagination">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={!hasPrevious}
      >
        Previous
      </button>

      <span>
        Page {currentPage} of {totalPages} ({totalItems} total)
      </span>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={!hasNext}
      >
        Next
      </button>

      <select
        value={pageSize}
        onChange={(e) => onPageSizeChange(parseInt(e.target.value))}
      >
        <option value={10}>10 per page</option>
        <option value={20}>20 per page</option>
        <option value={50}>50 per page</option>
        <option value={100}>100 per page</option>
      </select>
    </div>
  );
}

// Placeholder components (implement as needed)
function StatCard({ label, value }: any) { return null; }
function ViewModeToggle({ mode, onChange }: any) { return null; }
function LoadingState() { return <div>Loading...</div>; }
function EmptyState({ message }: any) { return <div>{message}</div>; }
function NoResults({ message, onClear }: any) {
  return (
    <div>
      <p>{message}</p>
      <button onClick={onClear}>Clear Filters</button>
    </div>
  );
}
function BulkPublishModal(props: any) { return null; }
function BulkUnpublishModal(props: any) { return null; }
function BulkDeleteModal(props: any) { return null; }
