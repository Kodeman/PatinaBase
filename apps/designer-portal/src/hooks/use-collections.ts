/**
 * Hooks for collection operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { catalogApi } from '@/lib/api-client';
import type { Collection } from '@patina/types';

// Collection Queries
interface CollectionFilters {
  q?: string;
  type?: 'manual' | 'rule' | 'smart';
  status?: 'draft' | 'published' | 'scheduled' | 'archived';
  featured?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export function useCollections(filters?: CollectionFilters, enabled = true) {
  return useQuery({
    queryKey: ['collections', 'list', filters],
    queryFn: async () => {
      const params: Record<string, unknown> = {};
      if (filters?.q) params.q = filters.q;
      if (filters?.type) params.type = filters.type;
      if (filters?.status) params.status = filters.status;
      if (filters?.featured) params.featured = 'true';
      if (filters?.page) params.page = filters.page;
      if (filters?.pageSize) params.pageSize = filters.pageSize;
      if (filters?.sortBy) params.sortBy = filters.sortBy;
      if (filters?.sortOrder) params.sortOrder = filters.sortOrder;

      const response = await catalogApi.getCollections(params);
      const data = (response as any)?.data ?? response;
      return data?.collections ?? data ?? [];
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
    enabled,
    placeholderData: [] as any,
  });
}

export function useCollection(id: string | null, includeProducts = true) {
  return useQuery({
    queryKey: id ? ['collections', id, { includeProducts }] : ['collections', 'null'],
    queryFn: async () => {
      if (!id) throw new Error('Collection ID required');
      const response = await catalogApi.getCollection(id);
      return (response as any)?.data ?? response;
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}

export function useCollectionProducts(id: string | null, params?: { page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: id ? ['collections', id, 'products', params] : ['collections', 'null', 'products'],
    queryFn: async () => {
      if (!id) throw new Error('Collection ID required');
      const response = await catalogApi.getCollectionProducts(id, params);
      return (response as any)?.data ?? response;
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useFeaturedCollections(limit = 3) {
  return useQuery({
    queryKey: ['collections', 'featured', { limit }],
    queryFn: async () => {
      const response = await catalogApi.getCollections({
        featured: 'true',
        status: 'published',
        pageSize: limit,
      });
      const data = (response as any)?.data ?? response;
      return data?.collections ?? data ?? [];
    },
    staleTime: 1000 * 60 * 15, // 15 minutes
    placeholderData: [] as any,
  });
}

// Collection Mutations
export function useCreateCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Collection>) => catalogApi.createCollection(data as Record<string, unknown>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
  });
}

export function useUpdateCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Collection> }) =>
      catalogApi.updateCollection(id, data as Record<string, unknown>),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['collections', id] });
      queryClient.invalidateQueries({ queryKey: ['collections', 'list'] });
    },
  });
}

export function useDeleteCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => catalogApi.deleteCollection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
  });
}

export function usePublishCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => catalogApi.publishCollection(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['collections', id] });
      queryClient.invalidateQueries({ queryKey: ['collections', 'list'] });
    },
  });
}

export function useAddProductToCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ collectionId, productId }: { collectionId: string; productId: string }) =>
      catalogApi.addProductToCollection(collectionId, { productId }),
    onSuccess: (_, { collectionId }) => {
      queryClient.invalidateQueries({ queryKey: ['collections', collectionId] });
      queryClient.invalidateQueries({ queryKey: ['collections', collectionId, 'products'] });
    },
  });
}

export function useRemoveProductFromCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ collectionId, productId }: { collectionId: string; productId: string }) =>
      catalogApi.removeProductFromCollection(collectionId, productId),
    onSuccess: (_, { collectionId }) => {
      queryClient.invalidateQueries({ queryKey: ['collections', collectionId] });
      queryClient.invalidateQueries({ queryKey: ['collections', collectionId, 'products'] });
    },
  });
}

export function useReorderCollectionProducts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ collectionId, productIds }: { collectionId: string; productIds: string[] }) =>
      catalogApi.reorderCollectionProducts(collectionId, { productIds }),
    onSuccess: (_, { collectionId }) => {
      queryClient.invalidateQueries({ queryKey: ['collections', collectionId] });
      queryClient.invalidateQueries({ queryKey: ['collections', collectionId, 'products'] });
    },
  });
}

export function useEvaluateRuleCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => catalogApi.evaluateRuleCollection(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['collections', id] });
      queryClient.invalidateQueries({ queryKey: ['collections', id, 'products'] });
    },
  });
}
