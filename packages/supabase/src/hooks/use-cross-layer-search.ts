'use client';

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { LayerProductLayer, LayerProductRow } from './use-layer-products';

const getSupabase = () => createBrowserClient();

const PRODUCT_FIELDS =
  'id, name, brand, price_retail, price_trade, images, source_url, status, category, layer, owner_user_id, studio_id, created_at';

export interface CrossLayerSearchResult {
  /** Items keyed by layer. RLS removes anything the caller can't see. */
  byLayer: Record<LayerProductLayer, LayerProductRow[]>;
  /** Per-layer counts — sourced from the same query, kept in sync with `byLayer`. */
  counts: Record<LayerProductLayer, number>;
  /** Total count across visible layers. */
  total: number;
}

export interface UseCrossLayerSearchOptions {
  /** Trimmed query string. Empty/whitespace returns an empty result without querying. */
  query: string;
  /** Per-layer cap. Default 25 — enough for a search results page section. */
  perLayerLimit?: number;
  enabled?: boolean;
}

const EMPTY_RESULT: CrossLayerSearchResult = {
  byLayer: { personal: [], studio: [], catalog: [] },
  counts: { personal: 0, studio: 0, catalog: 0 },
  total: 0,
};

/**
 * Single-query cross-layer search. Hits all three layers in one Supabase
 * request and groups results client-side by `layer`. RLS in migration
 * 00152 enforces visibility — a designer searching for "lamp" sees their
 * own personal items, their studio items, and the public catalog;
 * another studio's library is invisible.
 *
 * Used by the `/portal/library/search` page. The header search input in
 * the ProductsZone layout submits to that route rather than rendering an
 * inline panel — keeps the in-tab focus simple and lets the route own
 * pagination / shareable URLs.
 */
export function useCrossLayerSearch(
  options: UseCrossLayerSearchOptions,
): ReturnType<typeof useQuery<CrossLayerSearchResult, Error>> {
  const { query, perLayerLimit = 25, enabled = true } = options;
  const trimmed = query.trim();

  return useQuery<CrossLayerSearchResult, Error>({
    queryKey: ['cross-layer-search', trimmed, { perLayerLimit }],
    enabled: enabled && trimmed.length > 0,
    queryFn: async (): Promise<CrossLayerSearchResult> => {
      if (trimmed.length === 0) return EMPTY_RESULT;

      const supabase = getSupabase();
      const term = `%${trimmed}%`;

      // One query, RLS-filtered, all three layers. The `.limit` is a hard
      // ceiling across layers; we partition in JS so a search that hits
      // mostly catalog rows doesn't starve the personal/studio sections.
      const overallLimit = perLayerLimit * 3;

      const { data, error } = await supabase
        .from('products')
        .select(PRODUCT_FIELDS)
        .or(`name.ilike.${term},brand.ilike.${term}`)
        .order('created_at', { ascending: false })
        .limit(overallLimit);

      if (error) {
        throw new Error(`useCrossLayerSearch: ${error.message}`);
      }

      const byLayer: Record<LayerProductLayer, LayerProductRow[]> = {
        personal: [],
        studio: [],
        catalog: [],
      };

      for (const row of (data ?? []) as LayerProductRow[]) {
        const bucket = byLayer[row.layer];
        if (bucket && bucket.length < perLayerLimit) {
          bucket.push(row);
        }
      }

      const counts: Record<LayerProductLayer, number> = {
        personal: byLayer.personal.length,
        studio: byLayer.studio.length,
        catalog: byLayer.catalog.length,
      };

      return {
        byLayer,
        counts,
        total: counts.personal + counts.studio + counts.catalog,
      };
    },
  });
}
