/**
 * Hooks for category operations
 */

import { useQuery } from '@tanstack/react-query';
import type { Category } from '@patina/types';

import { catalogApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/react-query';

export interface CategoryTreeResponse {
  categories: Category[];
  meta: {
    total: number;
    maxDepth: number;
  };
}

/**
 * Fetch category tree with hierarchy
 */
export function useCategoryTree(enabled = true) {
  return useQuery({
    queryKey: queryKeys.categories.tree(),
    queryFn: async () => {
      const response = await catalogApi.getCategoryTree();

      // Handle different response formats
      if (Array.isArray(response)) {
        // Simple array response
        return {
          categories: response as Category[],
          meta: {
            total: response.length,
            maxDepth: calculateMaxDepth(response as Category[]),
          },
        } as CategoryTreeResponse;
      }

      // Structured response
      return response as CategoryTreeResponse;
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Fetch all categories (flat list)
 */
export function useCategories(params?: { parentId?: string }, enabled = true) {
  return useQuery({
    queryKey: queryKeys.categories.list(params),
    queryFn: async () => {
      const response = await catalogApi.getCategories(params);

      if (Array.isArray(response)) {
        return response as Category[];
      }

      return (response as { categories: Category[] }).categories;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Fetch a single category by ID
 */
export function useCategory(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.categories.detail(id),
    queryFn: async () => {
      const response = await catalogApi.getCategory(id);
      return response as Category;
    },
    enabled: enabled && !!id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Helper function to calculate maximum depth of category tree
 */
function calculateMaxDepth(categories: Category[], depth = 1): number {
  if (categories.length === 0) return depth;

  const childDepths = categories
    .filter(cat => cat.children && cat.children.length > 0)
    .map(cat => calculateMaxDepth(cat.children!, depth + 1));

  return childDepths.length > 0 ? Math.max(...childDepths) : depth;
}
