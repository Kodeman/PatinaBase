'use client';

import { useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Input,
  Label,
} from '@patina/design-system';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import type { AdminCatalogPresenter } from '@/features/admin/catalog/hooks/useAdminCatalogPresenter';
import {
  sanitizeFilterValue,
  detectSuspiciousInput,
  MAX_FILTER_LENGTH,
} from '@/lib/admin/security/sanitize';

interface AdminCatalogFiltersProps {
  presenter: AdminCatalogPresenter;
  isOpen: boolean;
  onClose: () => void;
}

export function AdminCatalogFilters({ presenter, isOpen, onClose }: AdminCatalogFiltersProps) {
  // Local state for price inputs
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  /**
   * Handles filter value changes with sanitization
   */
  const handleFilterChange = (value: string, onChange: (val: string | null) => void) => {
    if (!value) {
      onChange(null);
      return;
    }

    if (value.length > MAX_FILTER_LENGTH) {
      toast.error('Filter value too long', {
        description: `Maximum ${MAX_FILTER_LENGTH} characters allowed`,
      });
      return;
    }

    if (detectSuspiciousInput(value)) {
      toast.warning('Suspicious input detected', {
        description: 'Special characters have been removed',
      });
    }

    const sanitized = sanitizeFilterValue(value);
    onChange(sanitized);
  };

  const handleApplyPriceFilter = () => {
    // TODO: Implement price filtering when available in presenter
    console.log('Apply price filter:', { minPrice, maxPrice });
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="left" className="w-80 overflow-y-auto" aria-labelledby="filter-panel-title">
        <SheetHeader>
          <SheetTitle id="filter-panel-title">Product Filters</SheetTitle>
          {presenter.activeFilterCount > 0 && (
            <Badge variant="secondary" aria-label={`${presenter.activeFilterCount} active filters`}>
              {presenter.activeFilterCount} active
            </Badge>
          )}
        </SheetHeader>

        <div className="space-y-6 mt-6" role="form" aria-label="Filter products">
          {/* Status Filter */}
          <fieldset>
            <legend className="text-sm font-semibold mb-2">Filter by Status</legend>
            <RadioGroup
              value={presenter.selectedStatus || 'all'}
              onValueChange={(value: string) =>
                presenter.handleStatusChange(value === 'all' ? null : value)
              }
              className="mt-2 space-y-2"
              aria-label="Product status filter"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="status-all" />
                <Label htmlFor="status-all" className="font-normal cursor-pointer">
                  All statuses
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="published" id="status-published" />
                <Label htmlFor="status-published" className="font-normal cursor-pointer">
                  Published
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="draft" id="status-draft" />
                <Label htmlFor="status-draft" className="font-normal cursor-pointer">
                  Draft
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="in_review" id="status-review" />
                <Label htmlFor="status-review" className="font-normal cursor-pointer">
                  In Review
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="deprecated" id="status-deprecated" />
                <Label htmlFor="status-deprecated" className="font-normal cursor-pointer">
                  Deprecated
                </Label>
              </div>
            </RadioGroup>
          </fieldset>

          <Separator />

          {/* Category Filter */}
          <div>
            <Label className="text-sm font-semibold">Category</Label>
            <div className="mt-2">
              <Input
                placeholder="Search categories..."
                value={presenter.selectedCategory || ''}
                onChange={(e) => handleFilterChange(e.target.value, presenter.handleCategoryChange)}
                maxLength={MAX_FILTER_LENGTH}
              />
              {presenter.selectedCategory && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7"
                  onClick={() => presenter.handleCategoryChange(null)}
                >
                  <X className="mr-1 h-3 w-3" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          <Separator />

          {/* Brand Filter */}
          <div>
            <Label className="text-sm font-semibold">Brand</Label>
            <div className="mt-2">
              <Input
                placeholder="Search brands..."
                value={presenter.selectedBrand || ''}
                onChange={(e) => handleFilterChange(e.target.value, presenter.handleBrandChange)}
                maxLength={MAX_FILTER_LENGTH}
              />
              {presenter.selectedBrand && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7"
                  onClick={() => presenter.handleBrandChange(null)}
                >
                  <X className="mr-1 h-3 w-3" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          <Separator />

          {/* Price Range */}
          <div>
            <Label className="text-sm font-semibold">Price Range</Label>
            <div className="flex gap-2 mt-2">
              <Input
                type="number"
                placeholder="Min"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                min="0"
              />
              <Input
                type="number"
                placeholder="Max"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                min="0"
              />
            </div>
            {(minPrice || maxPrice) && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={handleApplyPriceFilter}
              >
                Apply Price Filter
              </Button>
            )}
          </div>

          <Separator />

          {/* Data Quality */}
          <div>
            <Label className="text-sm font-semibold">Data Quality</Label>
            <div className="mt-2 space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="has-issues"
                  checked={false} // TODO: Connect to presenter
                  onCheckedChange={(checked) => {
                    // TODO: Implement validation filter
                    console.log('Has validation issues:', checked);
                  }}
                />
                <Label htmlFor="has-issues" className="font-normal cursor-pointer">
                  Has validation issues
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="complete-data"
                  checked={false}
                  onCheckedChange={(checked) => {
                    console.log('Complete data:', checked);
                  }}
                />
                <Label htmlFor="complete-data" className="font-normal cursor-pointer">
                  Complete data only
                </Label>
              </div>
            </div>
          </div>

          <Separator />

          {/* Features */}
          <div>
            <Label className="text-sm font-semibold">Features</Label>
            <div className="mt-2 space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="has-3d"
                  checked={false} // TODO: Connect to presenter
                  onCheckedChange={(checked) => {
                    // TODO: Implement 3D filter
                    console.log('Has 3D model:', checked);
                  }}
                />
                <Label htmlFor="has-3d" className="font-normal cursor-pointer">
                  Has 3D model
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="ar-supported"
                  checked={false}
                  onCheckedChange={(checked) => {
                    console.log('AR supported:', checked);
                  }}
                />
                <Label htmlFor="ar-supported" className="font-normal cursor-pointer">
                  AR supported
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="has-variants"
                  checked={false}
                  onCheckedChange={(checked) => {
                    console.log('Has variants:', checked);
                  }}
                />
                <Label htmlFor="has-variants" className="font-normal cursor-pointer">
                  Has variants
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="customizable"
                  checked={false}
                  onCheckedChange={(checked) => {
                    console.log('Customizable:', checked);
                  }}
                />
                <Label htmlFor="customizable" className="font-normal cursor-pointer">
                  Customizable
                </Label>
              </div>
            </div>
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                presenter.handleClearFilters();
                setMinPrice('');
                setMaxPrice('');
              }}
              disabled={!presenter.hasActiveFilters}
            >
              Clear All
            </Button>
            <Button className="flex-1" onClick={onClose}>
              Apply
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
