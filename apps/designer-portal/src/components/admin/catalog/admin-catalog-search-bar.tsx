'use client';

import { Search, Grid, List, TableIcon, Filter, Download, X } from 'lucide-react';
import {
  Badge,
  Button,
  Input,
} from '@patina/design-system';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { toast } from 'sonner';
import type { AdminCatalogPresenter } from '@/features/admin/catalog/hooks/useAdminCatalogPresenter';
import {
  sanitizeSearchQuery,
  detectSuspiciousInput,
  MAX_SEARCH_LENGTH,
} from '@/lib/admin/security/sanitize';

interface AdminCatalogSearchBarProps {
  presenter: AdminCatalogPresenter;
  onFilterClick?: () => void;
}

export function AdminCatalogSearchBar({ presenter, onFilterClick }: AdminCatalogSearchBarProps) {
  /**
   * Handle search input with security checks
   */
  const handleSearchChange = (value: string) => {
    // Length check
    if (value.length > MAX_SEARCH_LENGTH) {
      toast.error('Search query too long', {
        description: `Maximum ${MAX_SEARCH_LENGTH} characters allowed`,
      });
      return;
    }

    // Detect and log suspicious patterns
    if (detectSuspiciousInput(value)) {
      toast.warning('Suspicious input detected', {
        description: 'Special characters have been removed for security',
      });
    }

    // Sanitize and update
    const sanitized = sanitizeSearchQuery(value);
    presenter.handleSearchChange(sanitized);
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-white border-b" role="region" aria-label="Product catalog search and filters">
      {/* Top Row: Search + View Mode + Actions */}
      <div className="flex items-center gap-4">
        {/* Search Input */}
        <div className="relative flex-1" role="search">
          <label htmlFor="catalog-search" className="sr-only">
            Search products by name, brand, SKU, or category
          </label>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <Input
            id="catalog-search"
            type="search"
            placeholder="Search products by name, brand, SKU..."
            value={presenter.searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10 pr-10"
            aria-label="Search products by name, brand, SKU, or category"
            aria-describedby="search-hint search-results-count"
            maxLength={MAX_SEARCH_LENGTH}
          />
          <span id="search-hint" className="sr-only">
            Type to search products. Results will appear automatically. Press Escape to clear.
          </span>
          {presenter.searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0 icon-only"
              onClick={presenter.handleClearSearch}
              aria-label={`Clear search query: ${presenter.searchQuery}`}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>

        {/* View Mode Toggle */}
        <ToggleGroup
          type="single"
          value={presenter.viewMode}
          onValueChange={(value: string) => {
            if (value) presenter.setViewMode(value as 'grid' | 'list' | 'table');
          }}
          className="border"
        >
          <ToggleGroupItem value="grid" aria-label="Grid view">
            <Grid className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List view">
            <List className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="table" aria-label="Table view">
            <TableIcon className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>

        {/* Filter Button with Badge */}
        <Button
          variant="outline"
          onClick={onFilterClick}
          className="relative"
          aria-label={`Filters${presenter.activeFilterCount > 0 ? ` (${presenter.activeFilterCount} active)` : ''}`}
        >
          <Filter className="mr-2 h-4 w-4" />
          Filters
          {presenter.activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-2">
              {presenter.activeFilterCount}
            </Badge>
          )}
        </Button>

        {/* Export Button */}
        <Button variant="outline" aria-label="Export products">
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-6 text-sm text-gray-600" role="status" aria-live="polite">
        <div id="search-results-count">
          <span className="font-medium">{presenter.totalProducts}</span> products
        </div>
        {presenter.stats && (
          <>
            <div>
              <span className="font-medium text-green-600">
                {presenter.stats.byStatus?.published || 0}
              </span>{' '}
              published
            </div>
            <div>
              <span className="font-medium text-yellow-600">
                {presenter.stats.byStatus?.draft || 0}
              </span>{' '}
              drafts
            </div>
            {presenter.stats.withValidationIssues > 0 && (
              <div>
                <span className="font-medium text-red-600">
                  {presenter.stats.withValidationIssues}
                </span>{' '}
                need attention
              </div>
            )}
          </>
        )}
      </div>

      {/* Active Filters */}
      {presenter.hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap" role="region" aria-label="Active filters" aria-live="polite">
          <span className="text-sm text-gray-500">Active filters:</span>

          {presenter.searchQuery && (
            <Badge variant="secondary" className="gap-1">
              Search: {presenter.searchQuery}
              <button
                onClick={presenter.handleClearSearch}
                className="hover:text-red-600"
                aria-label="Clear search filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {presenter.selectedStatus && (
            <Badge variant="secondary" className="gap-1">
              Status: {presenter.selectedStatus}
              <button
                onClick={() => presenter.handleStatusChange(null)}
                className="hover:text-red-600"
                aria-label="Clear status filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {presenter.selectedCategory && (
            <Badge variant="secondary" className="gap-1">
              Category: {presenter.selectedCategory}
              <button
                onClick={() => presenter.handleCategoryChange(null)}
                className="hover:text-red-600"
                aria-label="Clear category filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {presenter.selectedBrand && (
            <Badge variant="secondary" className="gap-1">
              Brand: {presenter.selectedBrand}
              <button
                onClick={() => presenter.handleBrandChange(null)}
                className="hover:text-red-600"
                aria-label="Clear brand filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={presenter.handleClearFilters}
            className="h-6 text-xs"
          >
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}
