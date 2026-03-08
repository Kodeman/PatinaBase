/**
 * Product Filters Types
 * Used by the Product Catalog Filters component
 */

export interface Category {
  id: string;
  name: string;
  slug?: string;
  parentId?: string | null;
}

export interface Vendor {
  id: string;
  name: string;
  slug?: string;
}

export interface FilterState {
  search?: string;
  categoryIds?: string[];
  vendorIds?: string[];
  priceMin?: number;
  priceMax?: number;
  inStock?: boolean;
  onSale?: boolean;
  featured?: boolean;
}

export interface SavedSearch {
  id: string;
  name: string;
  filters: FilterState;
  createdAt?: Date;
}

export interface ProductFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  categories: Category[];
  vendors: Vendor[];
  savedSearches?: SavedSearch[];
  onSaveSearch?: (search: SavedSearch) => void;
  onDeleteSearch?: (id: string) => void;
  onLoadSearch?: (search: SavedSearch) => void;
}

export interface ActiveFilter {
  key: keyof FilterState;
  label: string;
  value: string | number | boolean;
  displayValue: string;
}
