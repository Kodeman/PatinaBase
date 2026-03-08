/**
 * Hooks for collection operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mockData } from '@/data/mock-designer-data';
import { catalogApi } from '@/lib/api-client';
import { withMockData } from '@/lib/mock-data';
import { queryKeys } from '@/lib/react-query';
import type { Collection } from '@patina/types';

// Collection Queries
interface CollectionFilters {
  q?: string;
  type?: 'manual' | 'rule' | 'smart';
  status?: 'draft' | 'published' | 'scheduled' | 'archived';
  featured?: boolean;
  page?: number;
  pageSize?: number;
}

export function useCollections(filters?: CollectionFilters, enabled = true) {
  return useQuery({
    queryKey: ['collections', 'list', filters],
    queryFn: async () => {
      return withMockData(
        () => catalogApi.getCollections(filters),
        () => mockData.getCollections()
      );
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
    enabled,
    placeholderData: [] as any, // Default to empty array
  });
}

export function useCollection(id: string | null, includeProducts = true) {
  return useQuery({
    queryKey: id ? ['collections', id, { includeProducts }] : ['collections', 'null'],
    queryFn: () => {
      if (!id) throw new Error('Collection ID required');
      return withMockData(
        () => catalogApi.getCollection(id),
        () => {
          const collection = mockData.getCollections().find((c) => c.id === id);
          if (!collection) throw new Error('Collection not found');
          return collection;
        }
      );
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
      const collection = await withMockData(
        () => catalogApi.getCollection(id),
        () => {
          const mockCollection = mockData.getCollections().find((c) => c.id === id);
          if (!mockCollection) throw new Error('Collection not found');
          return mockCollection;
        }
      );

      const collectionData = collection as any;
      const products =
        collectionData?.data?.items?.map((item: any) => item.product) ||
        collectionData?.items?.map((item: any) => item.product) ||
        [];

      return {
        data: {
          products,
          total: products.length,
        },
      };
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useFeaturedCollections(limit = 3) {
  return useQuery({
    queryKey: ['collections', 'featured', { limit }],
    queryFn: async () => {
      return withMockData(
        () => catalogApi.getCollections({ featured: true, status: 'published', pageSize: limit }),
        () => mockData.getFeaturedCollections(limit)
      );
    },
    staleTime: 1000 * 60 * 15, // 15 minutes
    placeholderData: [] as any, // Default to empty array
  });
}

// Collection Mutations
export function useCreateCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Collection>) => catalogApi.createCollection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
  });
}

export function useUpdateCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Collection> }) =>
      catalogApi.updateCollection(id, data),
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

export function useEvaluateRuleCollection() {
  return useMutation({
    mutationFn: (id: string) => catalogApi.evaluateRuleCollection(id),
  });
}
