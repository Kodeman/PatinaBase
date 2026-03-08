/**
 * Search-specific hooks using the dedicated search service
 * Uses port 3002 search service with graceful fallback to catalog service
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CatalogSearchApiResponse, CatalogSearchResponse } from '@patina/types';

import { mockData } from '@/data/mock-designer-data';
import { searchApi } from '@/lib/api-client';
import { withMockData } from '@/lib/mock-data';
import { queryKeys } from '@/lib/react-query';

interface SearchParams {
  q?: string;
  filters?: string;
  cursor?: string;
  limit?: number;
  sort?: string;
}

/**
 * Main search hook - uses dedicated search service (port 3002)
 * Falls back gracefully if search service is unavailable
 */
export function useSearch(params: SearchParams, enabled = true) {
  const normalizeResponse = (raw: CatalogSearchApiResponse | undefined): CatalogSearchResponse => {
    if (!raw) {
      return { results: [], total: 0, facets: {} };
    }

    const directResults = raw.results ?? raw.data?.results ?? [];
    const total = raw.total ?? raw.meta?.total ?? raw.data?.total ?? directResults.length;
    const limit = raw.limit ?? raw.meta?.pageSize ?? raw.data?.limit;
    const cursor = raw.cursor ?? raw.meta?.cursor ?? raw.data?.cursor;
    const nextCursor = raw.nextCursor ?? raw.meta?.nextCursor ?? raw.data?.nextCursor;
    const facets = raw.facets ?? raw.data?.facets ?? {};

    return {
      results: Array.isArray(directResults) ? directResults : [],
      total,
      limit,
      cursor,
      nextCursor,
      facets,
    };
  };

  return useQuery({
    queryKey: queryKeys.search.query(params),
    queryFn: async () => {
      const response = await withMockData(
        () => searchApi.search(params) as Promise<CatalogSearchApiResponse>,
        () => Promise.resolve(mockData.searchProducts(params))
      );
      return normalizeResponse(response);
    },
    enabled: enabled && (params.q !== undefined || params.filters !== undefined),
    staleTime: 1000 * 60 * 2, // 2 minutes
    retry: (failureCount, error: any) => {
      // Don't retry if search service is unavailable
      if (error.code === 'ECONNREFUSED' || error.code === 'NETWORK_ERROR') {
        return false;
      }
      return failureCount < 2;
    },
  });
}

/**
 * Autocomplete hook - provides search suggestions as user types
 * Debouncing should be handled by the caller (150ms recommended)
 */
export function useAutocomplete(query: string, limit = 10) {
  return useQuery({
    queryKey: queryKeys.search.autocomplete(query),
    queryFn: async () => {
      return withMockData(
        () => searchApi.autocomplete(query, limit),
        () => {
          const products = mockData.getProducts({ pageSize: limit }).products;
          return { suggestions: products.map((product) => product.name).slice(0, limit) };
        }
      );
    },
    enabled: query.length >= 2,
    staleTime: 1000 * 30, // 30 seconds - autocomplete is very time-sensitive
    gcTime: 1000 * 60 * 5, // 5 minutes
    retry: false, // Don't retry autocomplete - it needs to be fast
  });
}

/**
 * Similar products hook - provides product recommendations
 */
export function useSimilarProducts(productId: string | null, limit = 20) {
  return useQuery({
    queryKey: productId ? queryKeys.search.similar(productId) : ['search', 'similar', 'null'],
    queryFn: async () => {
      if (!productId) throw new Error('Product ID required');
      return withMockData(
        () => searchApi.similarProducts(productId, limit),
        () => mockData.getSimilarProducts(productId, limit)
      );
    },
    enabled: !!productId,
    staleTime: 1000 * 60 * 10, // 10 minutes - similar products don't change often
  });
}

/**
 * Facets hook - provides dynamic filter options based on current search
 */
export function useSearchFacets(filters?: string) {
  return useQuery({
    queryKey: ['search', 'facets', filters],
    queryFn: async () => {
      return withMockData(
        () => searchApi.getFacets(filters),
        () => ({ facets: mockData.searchProducts({ filters }).facets })
      );
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: false,
  });
}

/**
 * Cancel active search requests
 */
export function useCancelSearch() {
  const queryClient = useQueryClient();

  return () => {
    searchApi.cancelSearch();
    searchApi.cancelAutocomplete();
    queryClient.cancelQueries({ queryKey: queryKeys.search.all });
  };
}
