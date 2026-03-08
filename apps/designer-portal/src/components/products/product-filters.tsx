'use client';

import * as React from 'react';
import { Search, Filter, X, Save, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@patina/design-system';
import { Button } from '@patina/design-system';
import { Badge } from '@patina/design-system';
import { Slider } from '@patina/design-system';
import { Switch } from '@patina/design-system';
import { Label } from '@patina/design-system';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@patina/design-system';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@patina/design-system';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@patina/design-system';
import type {
  ProductFiltersProps,
  FilterState,
  ActiveFilter,
  SavedSearch,
  Category,
  Vendor,
} from '@/types/product-filters';

/**
 * Product Catalog Filters Component
 *
 * Features:
 * - Two-row layout (search/controls top, active filters bottom)
 * - Debounced search (500ms)
 * - Filter popover with category/vendor multi-select
 * - Price range slider
 * - Boolean availability switches
 * - Active filter badges (dismissible)
 * - Saved searches functionality
 * - 200ms transition timing
 */
export function ProductFilters({
  filters,
  onFiltersChange,
  categories = [],
  vendors = [],
  savedSearches = [],
  onSaveSearch,
  onDeleteSearch,
  onLoadSearch,
}: ProductFiltersProps) {
  const [searchValue, setSearchValue] = React.useState(filters.search || '');
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const [isSavedSearchOpen, setIsSavedSearchOpen] = React.useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = React.useState(false);
  const [saveSearchName, setSaveSearchName] = React.useState('');

  // Debounced search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (searchValue !== filters.search) {
        onFiltersChange({ ...filters, search: searchValue || undefined });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchValue, filters, onFiltersChange]);

  // Calculate active filters for badges
  const activeFilters = React.useMemo((): ActiveFilter[] => {
    const active: ActiveFilter[] = [];

    if (filters.search) {
      active.push({
        key: 'search',
        label: 'Search',
        value: filters.search,
        displayValue: filters.search,
      });
    }

    if (filters.categoryIds && filters.categoryIds.length > 0) {
      const categoryNames = filters.categoryIds
        .map((id) => categories.find((c) => c.id === id)?.name)
        .filter(Boolean);
      active.push({
        key: 'categoryIds',
        label: 'Categories',
        value: filters.categoryIds,
        displayValue: categoryNames.join(', '),
      });
    }

    if (filters.vendorIds && filters.vendorIds.length > 0) {
      const vendorNames = filters.vendorIds
        .map((id) => vendors.find((v) => v.id === id)?.name)
        .filter(Boolean);
      active.push({
        key: 'vendorIds',
        label: 'Vendors',
        value: filters.vendorIds,
        displayValue: vendorNames.join(', '),
      });
    }

    if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
      const min = filters.priceMin ?? 0;
      const max = filters.priceMax ?? 10000;
      active.push({
        key: 'priceMin',
        label: 'Price',
        value: `${min}-${max}`,
        displayValue: `$${min} - $${max}`,
      });
    }

    if (filters.inStock) {
      active.push({
        key: 'inStock',
        label: 'In Stock',
        value: true,
        displayValue: 'In Stock Only',
      });
    }

    if (filters.onSale) {
      active.push({
        key: 'onSale',
        label: 'On Sale',
        value: true,
        displayValue: 'On Sale',
      });
    }

    if (filters.featured) {
      active.push({
        key: 'featured',
        label: 'Featured',
        value: true,
        displayValue: 'Featured',
      });
    }

    return active;
  }, [filters, categories, vendors]);

  const handleClearAll = () => {
    setSearchValue('');
    onFiltersChange({});
  };

  const handleRemoveFilter = (key: keyof FilterState) => {
    const newFilters = { ...filters };
    if (key === 'priceMin' || key === 'priceMax') {
      delete newFilters.priceMin;
      delete newFilters.priceMax;
    } else if (key === 'search') {
      setSearchValue('');
      delete newFilters.search;
    } else {
      delete newFilters[key];
    }
    onFiltersChange(newFilters);
  };

  const handleCategoryToggle = (categoryId: string) => {
    const current = filters.categoryIds || [];
    const updated = current.includes(categoryId)
      ? current.filter((id) => id !== categoryId)
      : [...current, categoryId];
    onFiltersChange({
      ...filters,
      categoryIds: updated.length > 0 ? updated : undefined,
    });
  };

  const handleVendorToggle = (vendorId: string) => {
    const current = filters.vendorIds || [];
    const updated = current.includes(vendorId)
      ? current.filter((id) => id !== vendorId)
      : [...current, vendorId];
    onFiltersChange({
      ...filters,
      vendorIds: updated.length > 0 ? updated : undefined,
    });
  };

  const handlePriceChange = (values: number[]) => {
    onFiltersChange({
      ...filters,
      priceMin: values[0],
      priceMax: values[1],
    });
  };

  const handleSaveSearch = () => {
    if (!onSaveSearch || !saveSearchName.trim()) return;

    const newSearch: SavedSearch = {
      id: Date.now().toString(),
      name: saveSearchName.trim(),
      filters: { ...filters },
      createdAt: new Date(),
    };

    onSaveSearch(newSearch);
    setSaveSearchName('');
    setIsSaveDialogOpen(false);
  };

  const handleLoadSearch = (search: SavedSearch) => {
    onLoadSearch?.(search);
    onFiltersChange(search.filters);
    setSearchValue(search.filters.search || '');
    setIsSavedSearchOpen(false);
  };

  const priceRange = [filters.priceMin ?? 0, filters.priceMax ?? 10000];

  return (
    <div className="space-y-4">
      {/* Top Row: Search & Controls */}
      <div className="flex items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors duration-200" />
          <Input
            type="search"
            placeholder="Search products..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="pl-10 transition-all duration-200 focus:ring-clay-500"
          />
        </div>

        {/* Filter Popover */}
        <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'transition-all duration-200',
                activeFilters.length > 0 && 'border-primary'
              )}
            >
              <Filter className="mr-2 h-4 w-4" />
              Filters
              {activeFilters.length > 0 && (
                <Badge variant="default" className="ml-2 h-5 min-w-5 px-1.5">
                  {activeFilters.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-6" style={{ padding: '24px' }}>
              {/* Categories */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Categories</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between transition-all duration-200"
                    >
                      {filters.categoryIds && filters.categoryIds.length > 0
                        ? `${filters.categoryIds.length} selected`
                        : 'Select categories'}
                      <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[240px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search categories..." />
                      <CommandList>
                        <CommandEmpty>No categories found.</CommandEmpty>
                        <CommandGroup>
                          {categories.map((category) => (
                            <CommandItem
                              key={category.id}
                              onSelect={() => handleCategoryToggle(category.id)}
                            >
                              <div
                                className={cn(
                                  'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                                  filters.categoryIds?.includes(category.id)
                                    ? 'bg-primary text-primary-foreground'
                                    : 'opacity-50'
                                )}
                              >
                                {filters.categoryIds?.includes(category.id) && (
                                  <Check className="h-3 w-3" />
                                )}
                              </div>
                              {category.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Vendors */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Vendors</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between transition-all duration-200"
                    >
                      {filters.vendorIds && filters.vendorIds.length > 0
                        ? `${filters.vendorIds.length} selected`
                        : 'Select vendors'}
                      <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[240px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search vendors..." />
                      <CommandList>
                        <CommandEmpty>No vendors found.</CommandEmpty>
                        <CommandGroup>
                          {vendors.map((vendor) => (
                            <CommandItem
                              key={vendor.id}
                              onSelect={() => handleVendorToggle(vendor.id)}
                            >
                              <div
                                className={cn(
                                  'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                                  filters.vendorIds?.includes(vendor.id)
                                    ? 'bg-primary text-primary-foreground'
                                    : 'opacity-50'
                                )}
                              >
                                {filters.vendorIds?.includes(vendor.id) && (
                                  <Check className="h-3 w-3" />
                                )}
                              </div>
                              {vendor.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Price Range */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  Price Range: ${priceRange[0]} - ${priceRange[1]}
                </Label>
                <Slider
                  value={priceRange}
                  onValueChange={handlePriceChange}
                  min={0}
                  max={10000}
                  step={100}
                  className="transition-all duration-200"
                />
              </div>

              {/* Availability Switches */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="in-stock" className="text-sm font-medium">
                    In Stock Only
                  </Label>
                  <Switch
                    id="in-stock"
                    checked={filters.inStock || false}
                    onCheckedChange={(checked) =>
                      onFiltersChange({ ...filters, inStock: checked || undefined })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="on-sale" className="text-sm font-medium">
                    On Sale
                  </Label>
                  <Switch
                    id="on-sale"
                    checked={filters.onSale || false}
                    onCheckedChange={(checked) =>
                      onFiltersChange({ ...filters, onSale: checked || undefined })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="featured" className="text-sm font-medium">
                    Featured
                  </Label>
                  <Switch
                    id="featured"
                    checked={filters.featured || false}
                    onCheckedChange={(checked) =>
                      onFiltersChange({ ...filters, featured: checked || undefined })
                    }
                  />
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Saved Searches */}
        {onSaveSearch && (
          <>
            <Popover open={isSavedSearchOpen} onOpenChange={setIsSavedSearchOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="transition-all duration-200">
                  <Save className="mr-2 h-4 w-4" />
                  Saved
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="end">
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-sm">Saved Searches</h4>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setIsSaveDialogOpen(true)}
                    >
                      Save Current
                    </Button>
                  </div>
                  {savedSearches.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No saved searches
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {savedSearches.map((search) => (
                        <div
                          key={search.id}
                          className="flex items-center justify-between p-2 rounded-md hover:bg-accent transition-colors duration-200"
                        >
                          <button
                            onClick={() => handleLoadSearch(search)}
                            className="flex-1 text-left text-sm transition-colors duration-200"
                          >
                            {search.name}
                          </button>
                          {onDeleteSearch && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onDeleteSearch(search.id)}
                              className="h-6 w-6 p-0"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Save Search Dialog */}
            <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Save Search</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                  <Label htmlFor="search-name" className="text-sm font-medium">
                    Search Name
                  </Label>
                  <Input
                    id="search-name"
                    value={saveSearchName}
                    onChange={(e) => setSaveSearchName(e.target.value)}
                    placeholder="My Search"
                    className="mt-2"
                  />
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsSaveDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleSaveSearch} disabled={!saveSearchName.trim()}>
                    Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}

        {/* Clear All */}
        {activeFilters.length > 0 && (
          <Button
            variant="ghost"
            onClick={handleClearAll}
            className="transition-all duration-200"
          >
            Clear All
          </Button>
        )}
      </div>

      {/* Bottom Row: Active Filters */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeFilters.map((filter) => (
            <Badge
              key={filter.key}
              variant="secondary"
              className="pl-3 pr-1 transition-all duration-200 hover:bg-secondary/80"
            >
              <span className="text-xs">
                {filter.label}: {filter.displayValue}
              </span>
              <button
                onClick={() => handleRemoveFilter(filter.key)}
                className="ml-2 rounded-full p-0.5 hover:bg-secondary-foreground/20 transition-colors duration-200"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
