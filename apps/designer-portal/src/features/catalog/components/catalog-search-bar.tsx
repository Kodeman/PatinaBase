'use client';

import { useMemo } from 'react';
import { SlidersHorizontal, Grid3x3, List, X } from 'lucide-react';
import { Badge, Button } from '@patina/design-system';

import { FilterPresets } from '@/components/catalog/filter-presets';
import { SearchAutocomplete } from '@/components/catalog/search-autocomplete';
import type { CatalogFilters } from '@/components/catalog/catalog-filters';

import type { CatalogViewMode } from '../types';

interface CatalogSearchBarProps {
  searchQuery: string;
  viewMode: CatalogViewMode;
  filters: CatalogFilters;
  activeFilterCount: number;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (query: string) => void;
  onOpenFilters: () => void;
  onChangeView: (mode: CatalogViewMode) => void;
  onLoadPreset: (filters: CatalogFilters) => void;
  onClearFilters: () => void;
  onClearFilterKey: (key: keyof CatalogFilters) => void;
  onClearPriceFilter: () => void;
  onRemoveTag: (tag: string) => void;
}

export function CatalogSearchBar({
  searchQuery,
  viewMode,
  filters,
  activeFilterCount,
  onSearchChange,
  onSearchSubmit,
  onOpenFilters,
  onChangeView,
  onLoadPreset,
  onClearFilters,
  onClearFilterKey,
  onClearPriceFilter,
  onRemoveTag,
}: CatalogSearchBarProps) {
  const hasFilters = useMemo(() => Object.keys(filters).length > 0, [filters]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <SearchAutocomplete
          value={searchQuery}
          onChange={onSearchChange}
          onSearch={onSearchSubmit}
          placeholder="Search products..."
          className="flex-1"
        />

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onOpenFilters}>
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="solid" className="ml-2">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
          <div className="flex items-center gap-1 rounded-lg border p-1">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => onChangeView('grid')}
            >
              <Grid3x3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => onChangeView('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterPresets currentFilters={filters} onLoadPreset={onLoadPreset} />

        {hasFilters && (
          <>
            <div className="h-4 w-px bg-border" />
            {filters.categoryId && (
              <Badge variant="subtle" className="gap-1">
                Category
                <button onClick={() => onClearFilterKey('categoryId')} className="ml-1">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {filters.brand && (
              <Badge variant="subtle" className="gap-1">
                {filters.brand}
                <button onClick={() => onClearFilterKey('brand')} className="ml-1">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {(filters.priceMin !== undefined || filters.priceMax !== undefined) && (
              <Badge variant="subtle" className="gap-1">
                ${filters.priceMin ?? 0} - ${filters.priceMax ?? '∞'}
                <button onClick={onClearPriceFilter} className="ml-1">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {filters.tags?.map((tag) => (
              <Badge key={tag} variant="subtle" className="gap-1">
                {tag}
                <button onClick={() => onRemoveTag(tag)} className="ml-1">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            <Button variant="ghost" size="sm" onClick={onClearFilters} className="text-muted-foreground">
              Clear all
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
