'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CatalogFilters } from '@/components/catalog/catalog-filters';
import { useProducts, type ProductFilters } from '@/hooks/use-products';
import { useSearch } from '@/hooks/use-search';
import { useFeaturedCollections } from '@/hooks/use-collections';
import { trackSearch, trackSearchSelection } from '@/lib/search-analytics';
import type { Collection, CatalogProductsResponse, CatalogSearchResponse } from '@patina/types';

import type {
  CatalogDisplayProduct,
  CatalogPresenterActions,
  CatalogPresenterData,
  CatalogPresenterModals,
  CatalogPresenterOptions,
  CatalogPresenterResult,
  CatalogPresenterState,
  CatalogViewMode,
} from '../types';

const DEFAULT_PAGE_SIZE = 24;
const PLACEHOLDER_IMAGE = 'https://via.placeholder.com/400';

type SerializableFilters = Omit<ProductFilters, 'page' | 'pageSize' | 'take'>;

export function useCatalogPresenter(options: CatalogPresenterOptions = {}): CatalogPresenterResult {
  const { pageSize = DEFAULT_PAGE_SIZE, initialViewMode = 'grid' } = options;

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<CatalogViewMode>(initialViewMode);
  const [filters, setFilters] = useState<CatalogFilters>({});
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<CatalogDisplayProduct | null>(null);

  const trimmedSearchQuery = searchQuery.trim();
  const isSearching = trimmedSearchQuery.length >= 2;

  const serializedFilters: SerializableFilters = useMemo(() => {
    const baseFilters: SerializableFilters = {
      status: 'published',
      ...filters,
    };

    if (filters.priceMin !== undefined) {
      baseFilters.priceMin = Math.round(filters.priceMin * 100);
    }

    if (filters.priceMax !== undefined) {
      baseFilters.priceMax = Math.round(filters.priceMax * 100);
    }

    return baseFilters;
  }, [filters]);

  const productFilters: ProductFilters = useMemo(
    () => ({
      ...serializedFilters,
      page,
      pageSize,
    }),
    [serializedFilters, page, pageSize]
  );

  const searchParams = useMemo(
    () => ({
      q: trimmedSearchQuery || undefined,
      limit: pageSize,
      filters: JSON.stringify(serializedFilters),
    }),
    [trimmedSearchQuery, pageSize, serializedFilters]
  );

  const productsQuery = useProducts(productFilters, !isSearching);
  const searchQueryResult = useSearch(searchParams, isSearching);
  const featuredCollectionsQuery = useFeaturedCollections(4);

  const catalogResponse: CatalogProductsResponse = useMemo(
    () =>
      productsQuery.data ?? {
        products: [],
        meta: { total: 0, page, pageSize },
      },
    [productsQuery.data, page, pageSize]
  );

  const searchResponse: CatalogSearchResponse = useMemo(
    () =>
      searchQueryResult.data ?? {
        results: [],
        total: 0,
        facets: {},
      },
    [searchQueryResult.data]
  );

  const isLoading = isSearching ? searchQueryResult.isLoading : productsQuery.isLoading;
  const error = isSearching ? searchQueryResult.error : productsQuery.error;

  const rawProducts = isSearching ? searchResponse.results : catalogResponse.products;
  const totalProducts = isSearching ? searchResponse.total : catalogResponse.meta.total;

  const effectivePageSize = useMemo(() => {
    const inferredSize = isSearching
      ? searchResponse.limit ?? searchResponse.results.length
      : catalogResponse.meta.pageSize;

    return inferredSize && inferredSize > 0 ? inferredSize : pageSize;
  }, [catalogResponse.meta.pageSize, isSearching, pageSize, searchResponse.limit, searchResponse.results.length]);

  const totalPages = useMemo(() => {
    if (totalProducts === 0 || effectivePageSize <= 0) {
      return 0;
    }

    return Math.ceil(totalProducts / effectivePageSize);
  }, [effectivePageSize, totalProducts]);

  const resultsRange = useMemo(() => {
    if (totalProducts === 0) {
      return { start: 0, end: 0 };
    }

    const start = (page - 1) * effectivePageSize + 1;
    const end = Math.min(page * effectivePageSize, totalProducts);

    return { start, end };
  }, [effectivePageSize, page, totalProducts]);

  const featuredCollections: Collection[] = useMemo(() => {
    const data = featuredCollectionsQuery.data;
    if (!data) return [];
    if (Array.isArray(data)) return data as Collection[];

    if (Array.isArray((data as any).data?.collections)) {
      return (data as any).data.collections as Collection[];
    }

    if (Array.isArray((data as any).collections)) {
      return (data as any).collections as Collection[];
    }

    if (Array.isArray((data as any).data)) {
      return (data as any).data as Collection[];
    }

    return [];
  }, [featuredCollectionsQuery.data]);

  const activeFilterCount = useMemo(() => {
    return Object.keys(filters).filter((key) => {
      const value = filters[key as keyof CatalogFilters];
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return value !== undefined && value !== null;
    }).length;
  }, [filters]);

  const products: CatalogDisplayProduct[] = useMemo(
    () =>
      rawProducts.map((product) => {
        const productWithMedia = product as CatalogDisplayProduct;
        const media = (productWithMedia.media ?? []) as CatalogDisplayProduct['media'];
        const heroImage = media?.find((asset) => asset.type === 'image' && asset.role === 'hero');
        const firstImage = media?.find((asset) => asset.type === 'image');
        const fallbackImage =
          (heroImage as any)?.cdnUrl ||
          (heroImage as any)?.uri ||
          (heroImage as any)?.originalUrl ||
          (firstImage as any)?.cdnUrl ||
          (firstImage as any)?.uri ||
          (firstImage as any)?.originalUrl ||
          (product as any).imageUrl ||
          PLACEHOLDER_IMAGE;

        return {
          ...(product as CatalogDisplayProduct),
          media: media ?? [],
          imageUrl: fallbackImage,
          tags: product.styleTags || product.tags || [],
        } satisfies CatalogDisplayProduct;
      }),
    [rawProducts]
  );

  useEffect(() => {
    if (trimmedSearchQuery && !isLoading) {
      trackSearch(trimmedSearchQuery, totalProducts);
    }
  }, [trimmedSearchQuery, totalProducts, isLoading]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    setPage(1);
  }, []);

  const handleSearchSubmit = useCallback((query?: string) => {
    // Guard against undefined: use current query if none provided
    setSearchQuery(query ?? searchQuery);
    setPage(1);
  }, [searchQuery]);

  const handleViewModeChange = useCallback((mode: CatalogViewMode) => {
    setViewMode(mode);
  }, []);

  const handleOpenFilters = useCallback(() => {
    setIsFilterOpen(true);
  }, []);

  const handleCloseFilters = useCallback(() => {
    setIsFilterOpen(false);
  }, []);

  const handleFiltersChange = useCallback((nextFilters: CatalogFilters) => {
    setFilters(nextFilters);
    setPage(1);
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters({});
    setPage(1);
  }, []);

  const handleLoadPreset = useCallback((presetFilters: CatalogFilters) => {
    setFilters(presetFilters);
    setPage(1);
  }, []);

  const handleClearFilterKey = useCallback((key: keyof CatalogFilters) => {
    setFilters((prev) => {
      if (!(key in prev)) {
        return prev;
      }

      const next = { ...prev };
      delete next[key];
      return next;
    });
    setPage(1);
  }, []);

  const handleClearPriceFilter = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      priceMin: undefined,
      priceMax: undefined,
    }));
    setPage(1);
  }, []);

  const handleRemoveTag = useCallback((tag: string) => {
    setFilters((prev) => {
      const nextTags = prev.tags?.filter((t) => t !== tag);
      return {
        ...prev,
        tags: nextTags && nextTags.length > 0 ? nextTags : undefined,
      };
    });
    setPage(1);
  }, []);

  const handlePageChange = useCallback((nextPage: number) => {
    setPage(Math.max(1, nextPage));
  }, []);

  const handleViewProduct = useCallback(
    (product: CatalogDisplayProduct) => {
      if (trimmedSearchQuery) {
        trackSearchSelection(trimmedSearchQuery, product.id);
      }

      setSelectedProduct(product);
      setIsDetailModalOpen(true);
    },
    [trimmedSearchQuery]
  );

  const handleCloseProductDetail = useCallback(() => {
    setIsDetailModalOpen(false);
    setSelectedProduct(null);
  }, []);

  const handleDetailModalOpenChange = useCallback((open: boolean) => {
    setIsDetailModalOpen(open);
    if (!open) {
      setSelectedProduct(null);
    }
  }, []);

  const state: CatalogPresenterState = {
    searchQuery,
    viewMode,
    filters,
    page,
    pageSize,
    isFilterOpen,
    isDetailModalOpen,
  };

  const data: CatalogPresenterData = {
    products,
    totalProducts,
    totalPages,
    pageSize: effectivePageSize,
    resultsRange,
    isLoading: Boolean(isLoading),
    isSearching,
    error,
    activeFilterCount,
    featuredCollections,
    catalogResponse,
    searchResponse,
  };

  const modals: CatalogPresenterModals = {
    selectedProduct,
  };

  const actions: CatalogPresenterActions = {
    setSearchQuery: handleSearchChange,
    submitSearch: handleSearchSubmit,
    setViewMode: handleViewModeChange,
    openFilters: handleOpenFilters,
    closeFilters: handleCloseFilters,
    updateFilters: handleFiltersChange,
    clearFilters: handleClearFilters,
    loadFilterPreset: handleLoadPreset,
    clearFilterKey: handleClearFilterKey,
    clearPriceFilter: handleClearPriceFilter,
    removeFilterTag: handleRemoveTag,
    goToPage: handlePageChange,
    viewProduct: handleViewProduct,
    closeProductDetail: handleCloseProductDetail,
    setDetailModalOpen: handleDetailModalOpenChange,
  };

  return { state, data, modals, actions };
}
