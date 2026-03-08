/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: This file uses type assertions because the database types
// haven't been regenerated yet to include the new RPC functions and columns.
// Run `pnpm db:generate` after migrations are applied to get full type safety.

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// Lazy client getter for SSR safety with cookie-based auth
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// SIMILARITY SEARCH HOOKS
// ═══════════════════════════════════════════════════════════════════════════

interface SimilarProduct {
  id: string;
  name: string;
  images: string[];
  price_retail: number | null;
  similarity: number;
}

/**
 * Find products similar to a given product using vector similarity
 */
export function useSimilarProducts(productId: string, limit: number = 10) {
  return useQuery({
    queryKey: ['similar-products', productId, limit],
    queryFn: async () => {
      const supabase = getSupabase() as any;

      // Call the RPC function we created in the migration
      const { data, error } = await supabase.rpc('find_products_similar_to', {
        product_id: productId,
        match_count: limit,
      });

      if (error) {
        // If the function doesn't exist or product has no embedding, return empty
        if (error.message.includes('function') || error.message.includes('not found')) {
          console.warn('Similarity function not available:', error.message);
          return [];
        }
        throw error;
      }

      return (data ?? []) as SimilarProduct[];
    },
    enabled: !!productId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

/**
 * Check if a product has an embedding
 */
export function useProductEmbeddingStatus(productId: string) {
  return useQuery({
    queryKey: ['product-embedding-status', productId],
    queryFn: async () => {
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('products')
        .select('id, embedding_updated_at')
        .eq('id', productId)
        .single();

      if (error) throw error;

      return {
        hasEmbedding: data?.embedding_updated_at !== null,
        embeddingUpdatedAt: data?.embedding_updated_at,
      };
    },
    enabled: !!productId,
  });
}

/**
 * Get products that need embeddings (for batch processing UI)
 */
export function useProductsNeedingEmbeddings(limit: number = 50) {
  return useQuery({
    queryKey: ['products-needing-embeddings', limit],
    queryFn: async () => {
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('products')
        .select('id, name, images')
        .is('embedding', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30 * 1000, // Cache for 30 seconds
  });
}

/**
 * Get embedding statistics
 */
export function useEmbeddingStats() {
  return useQuery({
    queryKey: ['embedding-stats'],
    queryFn: async () => {
      const supabase = getSupabase() as any;

      // Call the stats RPC function
      const { data, error } = await supabase.rpc('get_embedding_stats');

      if (error) {
        // If function doesn't exist, compute manually
        if (error.message.includes('function')) {
          const { count: total } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: true });

          const { count: withEmbedding } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: true })
            .not('embedding', 'is', null);

          return {
            total_products: total ?? 0,
            products_with_embedding: withEmbedding ?? 0,
            products_without_embedding: (total ?? 0) - (withEmbedding ?? 0),
            embedding_coverage_percent:
              total && total > 0 ? Math.round(((withEmbedding ?? 0) / total) * 100) : 0,
          };
        }
        throw error;
      }

      return data?.[0] ?? {
        total_products: 0,
        products_with_embedding: 0,
        products_without_embedding: 0,
        embedding_coverage_percent: 0,
      };
    },
    staleTime: 60 * 1000, // Cache for 1 minute
  });
}

/**
 * Find products matching a style's embedding
 */
export function useProductsForStyle(styleId: string, limit: number = 20) {
  return useQuery({
    queryKey: ['products-for-style', styleId, limit],
    queryFn: async () => {
      const supabase = getSupabase() as any;

      const { data, error } = await supabase.rpc('find_products_for_style', {
        style_id: styleId,
        match_count: limit,
      });

      if (error) {
        if (error.message.includes('function')) {
          console.warn('Style matching function not available:', error.message);
          return [];
        }
        throw error;
      }

      return (data ?? []) as SimilarProduct[];
    },
    enabled: !!styleId,
    staleTime: 5 * 60 * 1000,
  });
}
