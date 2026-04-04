/**
 * useAdminProducts Hook
 *
 * Fetches products directly from Supabase for admin catalog management.
 * Uses browser client for reads (RLS allows authenticated SELECT).
 * Mutations call admin API routes that use service role for writes.
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import type {
  AdminProductFilters,
  ProductListItem,
} from '@/types';

const SORT_COL_MAP: Record<string, string> = {
  name: 'name',
  price: 'price_retail',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  publishedAt: 'published_at',
  status: 'status',
};

/**
 * Query key factory for admin products
 */
const adminProductsKeys = {
  all: ['admin-products'] as const,
  lists: () => [...adminProductsKeys.all, 'list'] as const,
  list: (filters?: AdminProductFilters) => [...adminProductsKeys.lists(), filters] as const,
  details: () => [...adminProductsKeys.all, 'detail'] as const,
  detail: (id: string) => [...adminProductsKeys.details(), id] as const,
};

function mapRowToProductListItem(row: Record<string, unknown>): ProductListItem {
  const images = row.images as string[] | null;
  return {
    id: row.id as string,
    name: (row.name as string) || '',
    brand: (row.brand as string) || '',
    category: (row.category as string) || '',
    status: (row.status as ProductListItem['status']) || 'draft',
    price: row.price_retail != null ? (row.price_retail as number) / 100 : 0,
    currency: 'USD',
    coverImage: images?.[0] ?? undefined,
    hasValidationIssues: false,
    validationErrorCount: 0,
    variantCount: 0,
    has3D: false,
    arSupported: false,
    sourceUrl: (row.source_url as string) || undefined,
    publishedAt: row.published_at ? new Date(row.published_at as string) : undefined,
    updatedAt: new Date((row.updated_at as string) || Date.now()),
    createdAt: new Date((row.created_at as string) || Date.now()),
  };
}

/**
 * Hook for fetching admin products with filtering, pagination, and sorting.
 */
export function useAdminProducts(filters?: AdminProductFilters) {
  const normalizedFilters: AdminProductFilters = {
    page: 1,
    pageSize: 20,
    ...filters,
  };

  const query = useQuery({
    queryKey: adminProductsKeys.list(normalizedFilters),
    queryFn: async () => {
      const supabase = createBrowserClient();
      let q = supabase.from('products').select('*', { count: 'exact' });

      // Search
      if (normalizedFilters.q?.trim()) {
        q = q.ilike('name', `%${normalizedFilters.q.trim()}%`);
      }

      // Status filter
      if (normalizedFilters.status) {
        if (Array.isArray(normalizedFilters.status)) {
          q = q.in('status', normalizedFilters.status);
        } else {
          q = q.eq('status', normalizedFilters.status);
        }
      }

      // Category filter
      if (normalizedFilters.categoryId) {
        if (Array.isArray(normalizedFilters.categoryId)) {
          q = q.in('category', normalizedFilters.categoryId);
        } else {
          q = q.eq('category', normalizedFilters.categoryId);
        }
      }

      // Brand filter
      if (normalizedFilters.brand) {
        if (Array.isArray(normalizedFilters.brand)) {
          q = q.in('brand', normalizedFilters.brand);
        } else {
          q = q.eq('brand', normalizedFilters.brand);
        }
      }

      // Sorting
      const sortCol = SORT_COL_MAP[normalizedFilters.sortBy || 'createdAt'] || 'created_at';
      q = q.order(sortCol, { ascending: normalizedFilters.sortOrder === 'asc' });

      // Pagination
      const page = normalizedFilters.page ?? 1;
      const pageSize = normalizedFilters.pageSize ?? 20;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      q = q.range(from, to);

      const { data, count, error } = await q;
      if (error) throw error;

      const total = count ?? 0;
      return {
        products: (data ?? []).map(mapRowToProductListItem),
        meta: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const products = query.data?.products ?? [];
  const meta = query.data?.meta ?? {
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
    isEmpty: products.length === 0,
    hasFilters: Object.keys(filters ?? {}).length > 0,
  };
}

/** Helper to get the current session token for API route calls */
async function getAuthToken(): Promise<string | null> {
  const supabase = createBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function adminFetch(url: string, options: RequestInit = {}) {
  const token = await getAuthToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Maps a raw Supabase product row to the camelCase shape expected by the edit form.
 * DB columns: id, name, description, short_description, brand, category, status,
 *   price_retail, price_trade, slug, sku, source_url, images, materials, tags,
 *   style_tags, seo_title, seo_description, published_at, created_at, updated_at
 */
function mapRowToProduct(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: (row.name as string) || '',
    brand: (row.brand as string) || '',
    shortDescription: (row.short_description as string) || (row.description as string) || '',
    longDescription: (row.description as string) || '',
    category: (row.category as string) || '',
    status: ((row.status as string) || 'draft') as 'draft' | 'in_review' | 'published' | 'deprecated',
    price: row.price_retail != null ? (row.price_retail as number) / 100 : 0,
    msrp: 0,
    salePrice: 0,
    currency: 'USD',
    slug: (row.slug as string) || '',
    sku: (row.sku as string) || '',
    sourceUrl: (row.source_url as string) || '',
    images: (row.images as string[]) || [],
    materials: (row.materials as string[]) || [],
    tags: (row.tags as string[]) || [],
    styleTags: (row.style_tags as string[]) || [],
    seoTitle: (row.seo_title as string) || '',
    seoDescription: (row.seo_description as string) || '',
    seoKeywords: [] as string[],
    publishedAt: row.published_at ? new Date(row.published_at as string) : undefined,
    updatedAt: new Date((row.updated_at as string) || Date.now()),
    createdAt: new Date((row.created_at as string) || Date.now()),
  };
}

/**
 * Hook for fetching a single product by ID.
 * Uses browser client directly (consistent with list query) instead of API route.
 */
export function useProduct(id: string) {
  const query = useQuery({
    queryKey: adminProductsKeys.detail(id),
    queryFn: async () => {
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return mapRowToProduct(data as Record<string, unknown>);
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!id,
  });

  return {
    ...query,
    product: query.data,
  };
}

/**
 * Hook for creating a new product
 */
export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      adminFetch('/api/catalog/products', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminProductsKeys.lists() });
    },
  });
}

/**
 * Hook for updating an existing product
 */
export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, data }: { productId: string; data: Record<string, unknown> }) =>
      adminFetch(`/api/catalog/products/${productId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: (_, { productId }) => {
      queryClient.invalidateQueries({ queryKey: adminProductsKeys.detail(productId) });
      queryClient.invalidateQueries({ queryKey: adminProductsKeys.lists() });
    },
  });
}

/**
 * Hook for deleting a product
 */
export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (productId: string) =>
      adminFetch(`/api/catalog/products/${productId}`, { method: 'DELETE' }),
    onSuccess: (_, productId) => {
      queryClient.removeQueries({ queryKey: adminProductsKeys.detail(productId) });
      queryClient.invalidateQueries({ queryKey: adminProductsKeys.lists() });
    },
  });
}

/**
 * Hook for publishing a product
 */
export function usePublishProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId }: { productId: string }) =>
      adminFetch(`/api/catalog/products/${productId}/publish`, { method: 'POST' }),
    onSuccess: (_, { productId }) => {
      queryClient.invalidateQueries({ queryKey: adminProductsKeys.detail(productId) });
      queryClient.invalidateQueries({ queryKey: adminProductsKeys.lists() });
    },
  });
}

/**
 * Hook for unpublishing a product
 */
export function useUnpublishProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (productId: string) =>
      adminFetch(`/api/catalog/products/${productId}/unpublish`, { method: 'POST' }),
    onSuccess: (_, productId) => {
      queryClient.invalidateQueries({ queryKey: adminProductsKeys.detail(productId) });
      queryClient.invalidateQueries({ queryKey: adminProductsKeys.lists() });
    },
  });
}

/**
 * Hook for duplicating a product
 */
export function useDuplicateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ productId }: { productId: string }) => {
      const product = await adminFetch(`/api/catalog/products/${productId}`);
      const { id, created_at, updated_at, published_at, ...rest } = product;
      return adminFetch('/api/catalog/products', {
        method: 'POST',
        body: JSON.stringify({ ...rest, name: `${rest.name} (Copy)`, status: 'draft' }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminProductsKeys.lists() });
    },
  });
}
