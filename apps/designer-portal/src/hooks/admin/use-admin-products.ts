/**
 * useAdminProducts Hook
 *
 * Custom React hook for admin product management with advanced filtering,
 * pagination, and TanStack Query integration.
 *
 * Features:
 * - Product listing with admin-specific filters
 * - Pagination and sorting
 * - Cache management
 * - CRUD operations with mutations
 * - Query invalidation
 *
 * @module hooks/admin/use-admin-products
 */

import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { catalogService } from '@/services/admin/catalog';
import type {
  UseProductsResult,
  UseProductResult,
  UseCreateProductResult,
  UseUpdateProductResult,
  UseDeleteProductResult,
  UsePublishProductResult,
  AdminProductFilters,
  CatalogServiceResponse,
  AdminProduct,
  ProductListItem,
} from '@/types';
import type { PaginatedResponse, UUID } from '@patina/types';

/**
 * Query key factory for admin products
 */
const adminProductsKeys = {
  all: ['admin', 'products'] as const,
  lists: () => [...adminProductsKeys.all, 'list'] as const,
  list: (filters?: AdminProductFilters) => [...adminProductsKeys.lists(), filters] as const,
  details: () => [...adminProductsKeys.all, 'detail'] as const,
  detail: (id: string) => [...adminProductsKeys.details(), id] as const,
};

/**
 * Hook for fetching admin products with advanced filtering
 *
 * @param filters - Admin-specific product filters
 * @param options - Additional query options
 * @returns Query result with products and pagination metadata
 */
export function useAdminProducts(
  filters?: AdminProductFilters,
  options?: Partial<UseQueryOptions<CatalogServiceResponse<PaginatedResponse<ProductListItem>>, Error>>
): UseProductsResult {
  // Apply default pagination values
  const normalizedFilters: AdminProductFilters = {
    page: 1,
    pageSize: 20,
    ...filters,
  };

  const query = useQuery({
    queryKey: adminProductsKeys.list(normalizedFilters),
    queryFn: () => catalogService.getProducts(normalizedFilters as any) as any,
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: options?.enabled ?? true,
    ...options,
  });

  // Extract products and metadata from response
  const products = query.data?.data?.data ?? [];
  const meta = query.data?.data?.meta ?? {
    total: 0,
    page: normalizedFilters.page ?? 1,
    pageSize: normalizedFilters.pageSize ?? 20,
    totalPages: 0,
  };

  return {
    ...query,
    products,
    totalProducts: meta.total,
    currentPage: meta.page,
    totalPages: meta.totalPages,
    hasNextPage: meta.page < meta.totalPages,
    hasPreviousPage: meta.page > 1,
    // Computed properties for empty states
    isEmpty: products.length === 0,
    hasFilters: Object.keys(filters ?? {}).length > 0,
    // Cache management
    invalidate: () => {
      const queryClient = useQueryClient();
      return queryClient.invalidateQueries({ queryKey: adminProductsKeys.lists() });
    },
  } as any as UseProductsResult;
}

/**
 * Hook for fetching a single product by ID
 *
 * @param id - Product UUID
 * @param options - Additional query options
 * @returns Query result with product data
 */
export function useAdminProduct(
  id: string,
  options?: Partial<UseQueryOptions<CatalogServiceResponse<AdminProduct>, Error>>
): UseProductResult {
  const query = useQuery({
    queryKey: adminProductsKeys.detail(id),
    queryFn: () => catalogService.getProduct(id) as any,
    staleTime: 10 * 60 * 1000, // 10 minutes
    enabled: !!id && (options?.enabled ?? true),
    ...options,
  });

  return {
    ...query,
    product: query.data?.data,
  } as any as UseProductResult;
}

/**
 * Hook for creating a new product
 *
 * @returns Mutation result with create function
 */
export function useCreateAdminProduct(): UseCreateProductResult {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: any) => catalogService.createProduct(data),
    onSuccess: () => {
      // Invalidate all product lists
      queryClient.invalidateQueries({ queryKey: adminProductsKeys.lists() });
    },
  }) as UseCreateProductResult;
}

/**
 * Hook for updating an existing product
 *
 * @returns Mutation result with update function
 */
export function useUpdateAdminProduct(): UseUpdateProductResult {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, data }: { productId: UUID; data: any }) =>
      catalogService.updateProduct(productId, data),
    onSuccess: (_, { productId }) => {
      // Invalidate specific product and all lists
      queryClient.invalidateQueries({ queryKey: adminProductsKeys.detail(productId) });
      queryClient.invalidateQueries({ queryKey: adminProductsKeys.lists() });
    },
  }) as UseUpdateProductResult;
}

/**
 * Hook for deleting a product
 *
 * @returns Mutation result with delete function
 */
export function useDeleteAdminProduct(): UseDeleteProductResult {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (productId: UUID) => catalogService.deleteProduct(productId),
    onSuccess: (_, productId) => {
      // Remove from cache and invalidate lists
      queryClient.removeQueries({ queryKey: adminProductsKeys.detail(productId) });
      queryClient.invalidateQueries({ queryKey: adminProductsKeys.lists() });
    },
  }) as UseDeleteProductResult;
}

/**
 * Hook for publishing a product
 *
 * @returns Mutation result with publish function
 */
export function usePublishAdminProduct(): UsePublishProductResult {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId }: { productId: UUID; options?: any }) =>
      catalogService.publishProduct(productId),
    onSuccess: (_, { productId }) => {
      // Invalidate specific product and all lists
      queryClient.invalidateQueries({ queryKey: adminProductsKeys.detail(productId) });
      queryClient.invalidateQueries({ queryKey: adminProductsKeys.lists() });
    },
  }) as UsePublishProductResult;
}

/**
 * Hook for unpublishing a product
 *
 * @returns Mutation result with unpublish function
 */
export function useUnpublishAdminProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (productId: UUID) => catalogService.unpublishProduct(productId),
    onSuccess: (_, productId) => {
      queryClient.invalidateQueries({ queryKey: adminProductsKeys.detail(productId) });
      queryClient.invalidateQueries({ queryKey: adminProductsKeys.lists() });
    },
  });
}

/**
 * Hook for duplicating a product
 *
 * @returns Mutation result with duplicate function
 */
export function useDuplicateAdminProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId }: { productId: UUID; options?: any }) => {
      // Duplicate would be implemented in the service
      // For now, this is a placeholder
      return catalogService.getProduct(productId).then((response) => response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminProductsKeys.lists() });
    },
  });
}
