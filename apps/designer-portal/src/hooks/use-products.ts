/**
 * Hooks for product catalog operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CatalogProductsApiResponse, CatalogProductsResponse } from '@patina/types';

import { mockData } from '@/data/mock-designer-data';
import { catalogApi } from '@/lib/api-client';
import { withMockData } from '@/lib/mock-data';
import { queryKeys } from '@/lib/react-query';

// Product Queries
export interface ProductFilters {
  status?: string;
  categoryId?: string;
  vendorId?: string;
  collectionId?: string;
  priceMin?: number;
  priceMax?: number;
  search?: string;
  skip?: number;
  take?: number;
  page?: number;
  pageSize?: number;
  tags?: string[];
  brand?: string;
  materials?: string[];
}

export function useProducts(filters?: ProductFilters, enabled = true) {
  const normalizedFilters = filters ?? {};
  const fallbackPage = normalizedFilters.page ?? 1;
  const fallbackPageSize = normalizedFilters.pageSize ?? normalizedFilters.take ?? 0;

  const createEmptyResponse = (): CatalogProductsResponse => ({
    products: [],
    meta: {
      total: 0,
      page: fallbackPage,
      pageSize: fallbackPageSize ?? 0,
    },
  });

  const normalizeResponse = (raw: CatalogProductsApiResponse | undefined): CatalogProductsResponse => {
    if (!raw) {
      return createEmptyResponse();
    }

    if (Array.isArray(raw)) {
      return {
        products: raw,
        meta: {
          total: raw.length,
          page: fallbackPage,
          pageSize: raw.length || fallbackPageSize || 0,
        },
      };
    }

    const rawData = Array.isArray(raw.data)
      ? raw.data
      : raw.data?.products ?? raw.data?.results ?? undefined;

    const products = raw.products ?? raw.results ?? rawData ?? [];
    const total = raw.total ?? raw.meta?.total ?? raw.data?.total ?? (Array.isArray(products) ? products.length : 0);
    const page = raw.page ?? raw.meta?.page ?? raw.data?.page ?? fallbackPage;
    const pageSize =
      raw.pageSize ??
      raw.meta?.pageSize ??
      raw.data?.pageSize ??
      (Array.isArray(products) ? products.length : undefined) ??
      fallbackPageSize ??
      0;

    return {
      products: Array.isArray(products) ? products : [],
      meta: {
        total,
        page,
        pageSize,
      },
    };
  };

  return useQuery({
    queryKey: queryKeys.products.search(filters),
    queryFn: async () => {
      const result = await withMockData(
        () => catalogApi.getProducts(normalizedFilters) as Promise<CatalogProductsApiResponse>,
        () => Promise.resolve(mockData.getProducts(normalizedFilters))
      );
      return normalizeResponse(result);
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled,
    placeholderData: () => createEmptyResponse(),
  });
}

export function useProduct(id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.products.detail(id) : ['products', 'null'],
    queryFn: () => {
      if (!id) throw new Error('Product ID required');
      return withMockData(
        () => catalogApi.getProduct(id),
        () => {
          const product = mockData.getProductById(id);
          if (!product) throw new Error('Product not found');
          return product;
        }
      );
    },
    enabled: !!id,
  });
}

export function useProductBySlug(slug: string | null) {
  return useQuery({
    queryKey: slug ? ['products', 'slug', slug] : ['products', 'slug', 'null'],
    queryFn: () => {
      if (!slug) throw new Error('Product slug required');
      return withMockData(
        () => catalogApi.getProductBySlug(slug),
        () => {
          const product = mockData.getProductBySlug(slug);
          if (!product) throw new Error('Product not found');
          return product;
        }
      );
    },
    enabled: !!slug,
  });
}

export function useProductSearch(query: string, options?: { limit?: number; status?: string }) {
  return useQuery({
    queryKey: ['products', 'search', query, options],
    queryFn: () =>
      withMockData(
        () => catalogApi.searchProducts(query, options),
        () => mockData.searchProducts({ q: query, limit: options?.limit })
      ),
    enabled: query.length >= 2,
    staleTime: 1000 * 60 * 2, // 2 minutes for search results
  });
}

// Product Mutations
export function usePublishProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      withMockData(
        () => catalogApi.publishProduct(id),
        () => Promise.resolve({ id })
      ),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}

export function useUnpublishProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      withMockData(
        () => catalogApi.unpublishProduct(id),
        () => Promise.resolve({ id })
      ),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}

/**
 * Delete a product (admin/manufacturer only)
 */
export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      withMockData(
        () => catalogApi.deleteProduct(id),
        () => Promise.resolve({ id })
      ),
    onSuccess: (_, id) => {
      // Invalidate the deleted product's cache
      queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(id) });
      // Invalidate product lists to update counts and remove the deleted item
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      // Invalidate collections that might contain this product
      queryClient.invalidateQueries({ queryKey: queryKeys.collections.all });
      // Invalidate search results
      queryClient.invalidateQueries({ queryKey: queryKeys.search.all });
    },
  });
}

// Collections
export function useCollections(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['collections', 'list', params],
    queryFn: async () => {
      const result = await catalogApi.getCollections(params);
      return result;
    },
    staleTime: 1000 * 60 * 10, // 10 minutes - collections don't change often
    placeholderData: [] as any, // Default to empty array
  });
}

export function useCollection(id: string | null) {
  return useQuery({
    queryKey: id ? ['collections', id] : ['collections', 'null'],
    queryFn: () => {
      if (!id) throw new Error('Collection ID required');
      return catalogApi.getCollection(id);
    },
    enabled: !!id,
  });
}

export function useCollectionProducts(id: string | null, params?: Record<string, unknown>) {
  return useQuery({
    queryKey: id ? ['collections', id, 'products', params] : ['collections', 'null', 'products'],
    queryFn: () => {
      if (!id) throw new Error('Collection ID required');
      return catalogApi.getCollectionProducts(id, params);
    },
    enabled: !!id,
  });
}

// Categories
export function useCategories(params?: { parentId?: string }) {
  return useQuery({
    queryKey: ['categories', 'list', params],
    queryFn: async () => {
      const result = await catalogApi.getCategories(params);
      // Categories endpoint returns unwrapped array
      return result;
    },
    staleTime: 1000 * 60 * 30, // 30 minutes - categories are relatively static
    placeholderData: [] as any, // Default to empty array
  });
}

export function useCategory(id: string | null) {
  return useQuery({
    queryKey: id ? ['categories', id] : ['categories', 'null'],
    queryFn: () => {
      if (!id) throw new Error('Category ID required');
      return catalogApi.getCategory(id);
    },
    enabled: !!id,
  });
}

export function useCategoryTree() {
  return useQuery({
    queryKey: ['categories', 'tree'],
    queryFn: () => catalogApi.getCategoryTree(),
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}

// Variants
export function useVariants(productId: string | null) {
  return useQuery({
    queryKey: productId ? ['products', productId, 'variants'] : ['products', 'null', 'variants'],
    queryFn: () => {
      if (!productId) throw new Error('Product ID required');
      return catalogApi.getVariants(productId);
    },
    enabled: !!productId,
  });
}

export function useVariant(productId: string | null, variantId: string | null) {
  return useQuery({
    queryKey: productId && variantId
      ? ['products', productId, 'variants', variantId]
      : ['products', 'null', 'variants', 'null'],
    queryFn: () => {
      if (!productId || !variantId) throw new Error('Product ID and Variant ID required');
      return catalogApi.getVariant(productId, variantId);
    },
    enabled: !!productId && !!variantId,
  });
}

// Vendors
export function useVendors(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['vendors', 'list', params],
    queryFn: async () => {
      const result = await catalogApi.getVendors(params);
      return result;
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
    placeholderData: [] as any, // Default to empty array
  });
}

export function useVendor(id: string | null) {
  return useQuery({
    queryKey: id ? ['vendors', id] : ['vendors', 'null'],
    queryFn: () => {
      if (!id) throw new Error('Vendor ID required');
      return catalogApi.getVendor(id);
    },
    enabled: !!id,
  });
}

// Attributes
export function useAttributes(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['attributes', 'list', params],
    queryFn: () => catalogApi.getAttributes(params),
    staleTime: 1000 * 60 * 15, // 15 minutes
  });
}

export function useAttribute(id: string | null) {
  return useQuery({
    queryKey: id ? ['attributes', id] : ['attributes', 'null'],
    queryFn: () => {
      if (!id) throw new Error('Attribute ID required');
      return catalogApi.getAttribute(id);
    },
    enabled: !!id,
  });
}
