'use client';

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

export type LayerProductLayer = 'personal' | 'studio' | 'catalog';

export interface UseLayerProductsOptions {
  layer: LayerProductLayer;
  /**
   * Substring match across name + brand. Optional.
   */
  search?: string;
  /**
   * Filter by `products.status` (draft / in_review / published / deprecated).
   */
  status?: 'draft' | 'in_review' | 'published' | 'deprecated';
  /**
   * Result limit. Default 60.
   */
  limit?: number;
  /**
   * Sort. Default `recent` (created_at desc).
   */
  sort?: 'recent' | 'name';
  /**
   * Disable the query (e.g. while auth is resolving).
   */
  enabled?: boolean;
}

export interface LayerProductRow {
  id: string;
  name: string;
  brand: string | null;
  price_retail: number | null;
  /** Trade (vendor) unit cost in cents — 00185 dual pricing. null = unknown. */
  price_trade: number | null;
  images: string[] | null;
  source_url: string | null;
  status: string | null;
  category: string | null;
  layer: LayerProductLayer;
  owner_user_id: string | null;
  studio_id: string | null;
  created_at: string;
}

/**
 * Layer-scoped product query. Reads directly from Supabase; RLS handles
 * per-layer visibility (see migration 00152). The explicit `.eq('layer', …)`
 * narrows the response payload — RLS would already exclude rows the caller
 * can't see, but filtering at the query layer keeps the wire size tight.
 *
 * Used by the Library's layer views (personal / studio / catalog shelves
 * under `/library`). Other surfaces should continue to use `useProducts` /
 * `useProductsWithVendorPricing` from this package; they're orthogonal and
 * RLS-safe through the same policies.
 */
export function useLayerProducts(opts: UseLayerProductsOptions) {
  const { layer, search, status, limit = 60, sort = 'recent', enabled = true } = opts;

  return useQuery({
    queryKey: ['layer-products', layer, { search, status, limit, sort }],
    enabled,
    queryFn: async (): Promise<LayerProductRow[]> => {
      const supabase = getSupabase();
      let query = supabase
        .from('products')
        .select(
          'id, name, brand, price_retail, price_trade, images, source_url, status, category, layer, owner_user_id, studio_id, created_at',
        )
        .eq('layer', layer)
        .limit(limit);

      if (status) {
        query = query.eq('status', status);
      }

      if (search && search.trim().length > 0) {
        // Match name OR brand — simple ilike for v1.
        const term = `%${search.trim()}%`;
        query = query.or(`name.ilike.${term},brand.ilike.${term}`);
      }

      if (sort === 'recent') {
        query = query.order('created_at', { ascending: false });
      } else {
        query = query.order('name', { ascending: true });
      }

      const { data, error } = await query;
      if (error) {
        throw new Error(`useLayerProducts(${layer}): ${error.message}`);
      }
      return (data ?? []) as LayerProductRow[];
    },
  });
}

/**
 * Count of products visible to the caller per layer. Used by the
 * ProductsZone tab labels (e.g. "Personal · 247"). Returns 0 for any layer
 * the caller can't see at all.
 */
export function useLayerCounts(enabled = true) {
  return useQuery({
    queryKey: ['layer-counts'],
    enabled,
    queryFn: async (): Promise<Record<LayerProductLayer, number>> => {
      const supabase = getSupabase();
      const layers: LayerProductLayer[] = ['personal', 'studio', 'catalog'];
      const counts: Record<LayerProductLayer, number> = {
        personal: 0,
        studio: 0,
        catalog: 0,
      };

      // Three count(*) queries in parallel. Each is RLS-filtered so we get the
      // caller-specific count without leaking other-tenant counts.
      await Promise.all(
        layers.map(async (l) => {
          const { count, error } = await supabase
            .from('products')
            .select('id', { count: 'exact', head: true })
            .eq('layer', l);
          if (error) {
            throw new Error(`useLayerCounts(${l}): ${error.message}`);
          }
          counts[l] = count ?? 0;
        }),
      );

      return counts;
    },
  });
}
