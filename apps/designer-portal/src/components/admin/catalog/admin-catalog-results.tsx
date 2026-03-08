'use client';

import { AdminProductCard } from './admin-product-card';
import { AdminProductList } from './admin-product-list';
import { AdminProductTable } from './admin-product-table';
import {
  Button,
  Skeleton
} from '@patina/design-system';
import { ChevronLeft, ChevronRight, Search, Filter } from 'lucide-react';
import type { AdminCatalogPresenter } from '@/features/admin/catalog/hooks/useAdminCatalogPresenter';

interface AdminCatalogResultsProps {
  presenter: AdminCatalogPresenter;
}

export function AdminCatalogResults({ presenter }: AdminCatalogResultsProps) {
  // Loading state
  if (presenter.isLoadingProducts && presenter.products.length === 0) {
    return (
      <div className="p-6">
        {presenter.viewMode === 'grid' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-80 w-full" />
            ))}
          </div>
        )}
        {presenter.viewMode === 'list' && (
          <div className="space-y-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        )}
        {presenter.viewMode === 'table' && <Skeleton className="h-[600px] w-full" />}
      </div>
    );
  }

  // Empty state - no products in catalog
  if (presenter.isEmptyState) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="text-center space-y-4 max-w-md">
          <div className="mx-auto w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center">
            <Search className="h-12 w-12 text-gray-400" />
          </div>
          <h3 className="text-2xl font-semibold">No products yet</h3>
          <p className="text-gray-500">
            Get started by creating your first product or importing products from a file.
          </p>
          <div className="flex gap-3 justify-center pt-4">
            <Button>Create Product</Button>
            <Button variant="outline">Import Products</Button>
          </div>
        </div>
      </div>
    );
  }

  // No results state - filters applied but no matches
  if (presenter.isNoResults) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="text-center space-y-4 max-w-md">
          <div className="mx-auto w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center">
            <Filter className="h-12 w-12 text-gray-400" />
          </div>
          <h3 className="text-2xl font-semibold">No products found</h3>
          <p className="text-gray-500">
            {presenter.searchQuery
              ? `No results for "${presenter.searchQuery}". Try adjusting your search or filters.`
              : 'Try adjusting your filters to see more results.'}
          </p>
          <div className="flex gap-2 justify-center pt-4">
            {presenter.searchQuery && (
              <Button variant="outline" onClick={presenter.handleClearSearch}>
                Clear search
              </Button>
            )}
            {presenter.activeFilterCount > 0 && (
              <Button variant="outline" onClick={presenter.handleClearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Results */}
      <div className="flex-1 p-6">
        {presenter.viewMode === 'grid' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {presenter.products.map((product) => (
              <AdminProductCard key={product.id} product={product} presenter={presenter} />
            ))}
          </div>
        )}

        {presenter.viewMode === 'list' && (
          <div className="space-y-4">
            {presenter.products.map((product) => (
              <AdminProductList key={product.id} product={product} presenter={presenter} />
            ))}
          </div>
        )}

        {presenter.viewMode === 'table' && (
          <AdminProductTable products={presenter.products} presenter={presenter} />
        )}

        {/* Loading overlay for pagination */}
        {presenter.isLoadingProducts && presenter.products.length > 0 && (
          <div className="absolute inset-0 bg-white/50 flex items-center justify-center">
            <div className="text-gray-600">Loading...</div>
          </div>
        )}
      </div>

      {/* Pagination */}
      {presenter.totalPages > 1 && (
        <nav
          className="flex items-center justify-between p-4 border-t bg-white"
          role="navigation"
          aria-label="Product list pagination"
        >
          <div className="text-sm text-gray-500" role="status" aria-live="polite">
            Page {presenter.currentPage} of {presenter.totalPages} ({presenter.totalProducts}{' '}
            total products)
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => presenter.handlePageChange(presenter.currentPage - 1)}
              disabled={!presenter.hasPreviousPage}
              aria-label="Go to previous page"
              aria-disabled={!presenter.hasPreviousPage}
            >
              <ChevronLeft className="h-4 w-4 mr-1" aria-hidden="true" />
              Previous
            </Button>

            {/* Page numbers */}
            <div className="flex gap-1" role="group" aria-label="Page numbers">
              {Array.from({ length: Math.min(5, presenter.totalPages) }, (_, i) => {
                let pageNum: number;
                if (presenter.totalPages <= 5) {
                  pageNum = i + 1;
                } else if (presenter.currentPage <= 3) {
                  pageNum = i + 1;
                } else if (presenter.currentPage >= presenter.totalPages - 2) {
                  pageNum = presenter.totalPages - 4 + i;
                } else {
                  pageNum = presenter.currentPage - 2 + i;
                }

                const isCurrent = presenter.currentPage === pageNum;

                return (
                  <Button
                    key={pageNum}
                    variant={isCurrent ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => presenter.handlePageChange(pageNum)}
                    className="w-10"
                    aria-label={`Go to page ${pageNum}`}
                    aria-current={isCurrent ? 'page' : undefined}
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => presenter.handlePageChange(presenter.currentPage + 1)}
              disabled={!presenter.hasNextPage}
              aria-label="Go to next page"
              aria-disabled={!presenter.hasNextPage}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" aria-hidden="true" />
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}
