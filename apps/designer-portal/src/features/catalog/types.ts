import type { CatalogFilters } from '@/components/catalog/catalog-filters';
import type { CatalogProductsResponse, CatalogSearchResponse, Collection, CatalogProductMedia, Product } from '@patina/types';

export type CatalogViewMode = 'grid' | 'list';

export interface CatalogPresenterState {
  searchQuery: string;
  viewMode: CatalogViewMode;
  filters: CatalogFilters;
  page: number;
  pageSize: number;
  isFilterOpen: boolean;
  isDetailModalOpen: boolean;
}

export interface CatalogPresenterData {
  products: CatalogDisplayProduct[];
  totalProducts: number;
  totalPages: number;
  pageSize: number;
  resultsRange: {
    start: number;
    end: number;
  };
  isLoading: boolean;
  isSearching: boolean;
  error: unknown;
  activeFilterCount: number;
  featuredCollections: Collection[];
  catalogResponse: CatalogProductsResponse;
  searchResponse: CatalogSearchResponse;
}

export interface CatalogPresenterModals {
  selectedProduct: CatalogDisplayProduct | null;
}

export interface CatalogPresenterActions {
  setSearchQuery: (value: string) => void;
  submitSearch: (query: string) => void;
  setViewMode: (mode: CatalogViewMode) => void;
  openFilters: () => void;
  closeFilters: () => void;
  updateFilters: (filters: CatalogFilters) => void;
  clearFilters: () => void;
  loadFilterPreset: (filters: CatalogFilters) => void;
  clearFilterKey: (key: keyof CatalogFilters) => void;
  clearPriceFilter: () => void;
  removeFilterTag: (tag: string) => void;
  goToPage: (page: number) => void;
  viewProduct: (product: CatalogDisplayProduct) => void;
  closeProductDetail: () => void;
  setDetailModalOpen: (open: boolean) => void;
}

export interface CatalogPresenterResult {
  state: CatalogPresenterState;
  data: CatalogPresenterData;
  modals: CatalogPresenterModals;
  actions: CatalogPresenterActions;
}

export type CatalogDisplayProduct = Product & {
  media?: CatalogProductMedia[];
  imageUrl: string;
  tags: string[];
};

export interface CatalogPresenterOptions {
  pageSize?: number;
  initialViewMode?: CatalogViewMode;
}
