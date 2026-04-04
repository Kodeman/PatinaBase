/**
 * useAdminCollections Hook
 *
 * Fetches collections from Supabase for admin catalog management.
 * Uses browser client for reads, admin API routes for mutations.
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import type { Collection } from '@patina/types';

export interface AdminCollectionFilters {
  q?: string;
  type?: 'manual' | 'rule' | 'smart';
  status?: 'draft' | 'published' | 'scheduled';
  featured?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface CollectionListItem {
  id: string;
  name: string;
  slug: string;
  type: 'manual' | 'rule' | 'smart';
  description: string;
  coverImage?: string;
  status: 'draft' | 'published' | 'scheduled';
  featured: boolean;
  tags: string[];
  productCount: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const SORT_COL_MAP: Record<string, string> = {
  name: 'name',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  displayOrder: 'display_order',
  publishedAt: 'published_at',
  status: 'status',
  type: 'type',
};

const adminCollectionsKeys = {
  all: ['admin-collections'] as const,
  lists: () => [...adminCollectionsKeys.all, 'list'] as const,
  list: (filters?: AdminCollectionFilters) => [...adminCollectionsKeys.lists(), filters] as const,
  details: () => [...adminCollectionsKeys.all, 'detail'] as const,
  detail: (id: string) => [...adminCollectionsKeys.details(), id] as const,
};

function mapRowToCollectionListItem(row: Record<string, unknown>): CollectionListItem {
  return {
    id: row.id as string,
    name: (row.name as string) || '',
    slug: (row.slug as string) || '',
    type: (row.type as CollectionListItem['type']) || 'manual',
    description: (row.description as string) || '',
    coverImage: (row.cover_image as string) || undefined,
    status: (row.status as CollectionListItem['status']) || 'draft',
    featured: (row.featured as boolean) || false,
    tags: (row.tags as string[]) || [],
    productCount: (row.collection_products as unknown[])?.length ?? 0,
    createdBy: (row.created_by as string) || '',
    createdAt: new Date((row.created_at as string) || Date.now()),
    updatedAt: new Date((row.updated_at as string) || Date.now()),
  };
}

export function useAdminCollections(filters?: AdminCollectionFilters) {
  const normalizedFilters: AdminCollectionFilters = {
    page: 1,
    pageSize: 20,
    ...filters,
  };

  const query = useQuery({
    queryKey: adminCollectionsKeys.list(normalizedFilters),
    queryFn: async () => {
      const supabase = createBrowserClient();
      let q = supabase
        .from('collections')
        .select('*, collection_products(product_id)', { count: 'exact' });

      if (normalizedFilters.q?.trim()) {
        q = q.or(`name.ilike.%${normalizedFilters.q.trim()}%,description.ilike.%${normalizedFilters.q.trim()}%`);
      }
      if (normalizedFilters.status) q = q.eq('status', normalizedFilters.status);
      if (normalizedFilters.type) q = q.eq('type', normalizedFilters.type);
      if (normalizedFilters.featured) q = q.eq('featured', true);

      const sortCol = SORT_COL_MAP[normalizedFilters.sortBy || 'createdAt'] || 'created_at';
      q = q.order(sortCol, { ascending: normalizedFilters.sortOrder === 'asc' });

      const page = normalizedFilters.page ?? 1;
      const pageSize = normalizedFilters.pageSize ?? 20;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      q = q.range(from, to);

      const { data, count, error } = await q;
      if (error) throw error;

      const total = count ?? 0;
      return {
        collections: (data ?? []).map((row: any) => mapRowToCollectionListItem(row)),
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

  const collections = query.data?.collections ?? [];
  const meta = query.data?.meta ?? {
    total: 0,
    page: normalizedFilters.page ?? 1,
    pageSize: normalizedFilters.pageSize ?? 20,
    totalPages: 0,
  };

  return {
    ...query,
    collections,
    totalCollections: meta.total,
    currentPage: meta.page,
    totalPages: meta.totalPages,
    hasNextPage: meta.page < meta.totalPages,
    hasPreviousPage: meta.page > 1,
    isEmpty: collections.length === 0,
  };
}

function mapRowToCollection(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: (row.name as string) || '',
    slug: (row.slug as string) || '',
    type: (row.type as string) || 'manual',
    description: (row.description as string) || '',
    coverImage: (row.cover_image as string) || undefined,
    isPublic: (row.is_public as boolean) || false,
    status: (row.status as string) || 'draft',
    featured: (row.featured as boolean) || false,
    tags: (row.tags as string[]) || [],
    displayOrder: (row.display_order as number) || 0,
    publishedAt: row.published_at ? new Date(row.published_at as string) : undefined,
    scheduledPublishAt: row.scheduled_publish_at ? new Date(row.scheduled_publish_at as string) : undefined,
    seoTitle: (row.seo_title as string) || '',
    seoDescription: (row.seo_description as string) || '',
    rule: row.rule,
    createdBy: (row.created_by as string) || '',
    createdAt: new Date((row.created_at as string) || Date.now()),
    updatedAt: new Date((row.updated_at as string) || Date.now()),
  };
}

export function useAdminCollection(id: string) {
  const query = useQuery({
    queryKey: adminCollectionsKeys.detail(id),
    queryFn: async () => {
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from('collections')
        .select('*, collection_products(id, product_id, position, notes, added_at, product:products(*))')
        .eq('id', id)
        .single();

      if (error) throw error;
      const collection = mapRowToCollection(data as Record<string, unknown>);
      const items = ((data as any).collection_products ?? []).map((cp: any) => ({
        id: cp.id,
        productId: cp.product_id,
        position: cp.position,
        notes: cp.notes,
        addedAt: cp.added_at,
        product: cp.product,
      }));

      return { ...collection, items, productCount: items.length };
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!id,
  });

  return {
    ...query,
    collection: query.data,
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

export function useCreateAdminCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Collection>) =>
      adminFetch('/api/catalog/collections', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminCollectionsKeys.lists() });
    },
  });
}

export function useUpdateAdminCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Collection> }) =>
      adminFetch(`/api/catalog/collections/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: adminCollectionsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: adminCollectionsKeys.lists() });
    },
  });
}

export function useDeleteAdminCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      adminFetch(`/api/catalog/collections/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: adminCollectionsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: adminCollectionsKeys.lists() });
    },
  });
}

export function usePublishAdminCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      adminFetch(`/api/catalog/collections/${id}/publish`, { method: 'POST' }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: adminCollectionsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: adminCollectionsKeys.lists() });
    },
  });
}

export function useEvaluateAdminCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      adminFetch(`/api/catalog/collections/${id}/evaluate`, { method: 'POST' }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: adminCollectionsKeys.detail(id) });
    },
  });
}

export function useAddProductToAdminCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ collectionId, productId, notes }: { collectionId: string; productId: string; notes?: string }) =>
      adminFetch(`/api/catalog/collections/${collectionId}/products`, {
        method: 'POST',
        body: JSON.stringify({ productId, notes }),
      }),
    onSuccess: (_, { collectionId }) => {
      queryClient.invalidateQueries({ queryKey: adminCollectionsKeys.detail(collectionId) });
      queryClient.invalidateQueries({ queryKey: adminCollectionsKeys.lists() });
    },
  });
}

export function useRemoveProductFromAdminCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ collectionId, productId }: { collectionId: string; productId: string }) =>
      adminFetch(`/api/catalog/collections/${collectionId}/products?productId=${productId}`, {
        method: 'DELETE',
      }),
    onSuccess: (_, { collectionId }) => {
      queryClient.invalidateQueries({ queryKey: adminCollectionsKeys.detail(collectionId) });
      queryClient.invalidateQueries({ queryKey: adminCollectionsKeys.lists() });
    },
  });
}
