'use client';

import { useState } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Button,
  Input,
  Label,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  Badge,
} from '@patina/design-system';
import { useCategories, useVendors } from '@/hooks/use-products';

export interface CatalogFilters {
  categoryId?: string;
  brand?: string;
  priceMin?: number;
  priceMax?: number;
  tags?: string[];
  materials?: string[];
}

interface CatalogFiltersProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: CatalogFilters;
  onFiltersChange: (filters: CatalogFilters) => void;
  onClearFilters: () => void;
}

export function CatalogFilterPanel({
  open,
  onOpenChange,
  filters,
  onFiltersChange,
  onClearFilters,
}: CatalogFiltersProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    category: true,
    price: true,
    brand: false,
    tags: false,
  });

  const { data: categoriesData, isLoading: categoriesLoading } = useCategories();
  const { data: vendorsData, isLoading: vendorsLoading } = useVendors();

  // Categories and vendors return unwrapped arrays directly
  const categories = Array.isArray(categoriesData) ? categoriesData : [];
  const vendors = Array.isArray(vendorsData) ? vendorsData : [];

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handlePriceChange = (type: 'min' | 'max', value: string) => {
    const numValue = value === '' ? undefined : parseFloat(value);
    if (type === 'min') {
      onFiltersChange({ ...filters, priceMin: numValue });
    } else {
      onFiltersChange({ ...filters, priceMax: numValue });
    }
  };

  const handleCategoryChange = (categoryId: string) => {
    onFiltersChange({
      ...filters,
      categoryId: filters.categoryId === categoryId ? undefined : categoryId,
    });
  };

  const handleBrandChange = (brand: string) => {
    onFiltersChange({
      ...filters,
      brand: filters.brand === brand ? undefined : brand,
    });
  };

  const handleTagToggle = (tag: string) => {
    const currentTags = filters.tags || [];
    const newTags = currentTags.includes(tag)
      ? currentTags.filter((t) => t !== tag)
      : [...currentTags, tag];
    onFiltersChange({
      ...filters,
      tags: newTags.length > 0 ? newTags : undefined,
    });
  };

  const activeFilterCount =
    (filters.categoryId ? 1 : 0) +
    (filters.brand ? 1 : 0) +
    (filters.priceMin || filters.priceMax ? 1 : 0) +
    (filters.tags?.length || 0);

  const commonTags = [
    'modern',
    'contemporary',
    'mid-century',
    'traditional',
    'industrial',
    'scandinavian',
    'minimalist',
    'rustic',
    'luxury',
    'vintage',
  ];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent side="left" className="w-full sm:max-w-md overflow-y-auto">
        <DrawerHeader>
          <DrawerTitle>Filters</DrawerTitle>
          <DrawerDescription>
            Refine your product search
            {activeFilterCount > 0 && ` (${activeFilterCount} active)`}
          </DrawerDescription>
        </DrawerHeader>

        <div className="mt-6 space-y-6">
          {/* Clear Filters */}
          {activeFilterCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onClearFilters}
              className="w-full"
            >
              Clear All Filters
            </Button>
          )}

          {/* Category Filter */}
          <div className="space-y-3">
            <button
              onClick={() => toggleSection('category')}
              className="flex w-full items-center justify-between text-sm font-semibold"
            >
              <span>Category</span>
              {expandedSections.category ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {expandedSections.category && (
              <div className="space-y-2">
                {categoriesLoading ? (
                  <p className="text-sm text-muted-foreground">Loading categories...</p>
                ) : categories.length > 0 ? (
                  categories.map((category: any) => (
                    <label
                      key={category.id}
                      className="flex items-center space-x-2 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="category"
                        checked={filters.categoryId === category.id}
                        onChange={() => handleCategoryChange(category.id)}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">{category.name}</span>
                    </label>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No categories available</p>
                )}
              </div>
            )}
          </div>

          {/* Price Range Filter */}
          <div className="space-y-3">
            <button
              onClick={() => toggleSection('price')}
              className="flex w-full items-center justify-between text-sm font-semibold"
            >
              <span>Price Range</span>
              {expandedSections.price ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {expandedSections.price && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="priceMin" className="text-xs">
                    Minimum
                  </Label>
                  <Input
                    id="priceMin"
                    type="number"
                    placeholder="$0"
                    value={filters.priceMin || ''}
                    onChange={(e) => handlePriceChange('min', e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="priceMax" className="text-xs">
                    Maximum
                  </Label>
                  <Input
                    id="priceMax"
                    type="number"
                    placeholder="No limit"
                    value={filters.priceMax || ''}
                    onChange={(e) => handlePriceChange('max', e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Brand Filter */}
          <div className="space-y-3">
            <button
              onClick={() => toggleSection('brand')}
              className="flex w-full items-center justify-between text-sm font-semibold"
            >
              <span>Brand</span>
              {expandedSections.brand ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {expandedSections.brand && (
              <div className="space-y-2">
                {vendorsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading brands...</p>
                ) : vendors.length > 0 ? (
                  vendors.slice(0, 10).map((vendor: any) => (
                    <label
                      key={vendor.id}
                      className="flex items-center space-x-2 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="brand"
                        checked={filters.brand === vendor.name}
                        onChange={() => handleBrandChange(vendor.name)}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">{vendor.name}</span>
                    </label>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No brands available</p>
                )}
              </div>
            )}
          </div>

          {/* Tags Filter */}
          <div className="space-y-3">
            <button
              onClick={() => toggleSection('tags')}
              className="flex w-full items-center justify-between text-sm font-semibold"
            >
              <span>Style Tags</span>
              {expandedSections.tags ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {expandedSections.tags && (
              <div className="flex flex-wrap gap-2">
                {commonTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant={filters.tags?.includes(tag) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => handleTagToggle(tag)}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Active Filters Summary */}
          {activeFilterCount > 0 && (
            <div className="pt-4 border-t space-y-3">
              <h4 className="text-sm font-semibold">Active Filters</h4>
              <div className="flex flex-wrap gap-2">
                {filters.categoryId && (
                  <Badge variant="subtle" className="gap-1">
                    Category:{' '}
                    {categories.find((c: any) => c.id === filters.categoryId)?.name}
                    <button
                      onClick={() =>
                        onFiltersChange({ ...filters, categoryId: undefined })
                      }
                      className="ml-1"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filters.brand && (
                  <Badge variant="subtle" className="gap-1">
                    Brand: {filters.brand}
                    <button
                      onClick={() => onFiltersChange({ ...filters, brand: undefined })}
                      className="ml-1"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {(filters.priceMin || filters.priceMax) && (
                  <Badge variant="subtle" className="gap-1">
                    Price: ${filters.priceMin || 0} - ${filters.priceMax || '∞'}
                    <button
                      onClick={() =>
                        onFiltersChange({
                          ...filters,
                          priceMin: undefined,
                          priceMax: undefined,
                        })
                      }
                      className="ml-1"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filters.tags?.map((tag) => (
                  <Badge key={tag} variant="subtle" className="gap-1">
                    {tag}
                    <button onClick={() => handleTagToggle(tag)} className="ml-1">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
