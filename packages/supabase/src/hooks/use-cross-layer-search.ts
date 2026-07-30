'use client';

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { LayerProductLayer, LayerProductRow } from './use-layer-products';

const getSupabase = () => createBrowserClient();

const PRODUCT_FIELDS =
  'id, name, brand, price_retail, price_trade, images, source_url, status, category, layer, owner_user_id, studio_id, created_at';

/**
 * The columns field-grain search can match on (R88). `brand` IS the maker
 * column the Library shows as a piece's maker, so "search by maker" filters
 * `brand`. All four are plain `ilike` substring matches, unioned in one `.or()`.
 */
export type CrossLayerSearchField = 'name' | 'brand' | 'sku' | 'category';

/** name · maker(brand) · SKU · category — the Library's field-grain default. */
export const DEFAULT_CROSS_LAYER_FIELDS: CrossLayerSearchField[] = [
  'name',
  'brand',
  'sku',
  'category',
];

/**
 * Build the PostgREST `.or()` filter for a cross-layer search — one
 * `<field>.ilike.<term>` clause per requested field, comma-joined. Pure and
 * exported so the field set is a testable contract (R88 slice 4). `term`
 * should already carry its `%…%` wildcards.
 */
export function buildCrossLayerOrFilter(
  term: string,
  fields: CrossLayerSearchField[] = DEFAULT_CROSS_LAYER_FIELDS,
): string {
  const safe = fields.length > 0 ? fields : DEFAULT_CROSS_LAYER_FIELDS;
  return safe.map((f) => `${f}.ilike.${term}`).join(',');
}

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
  /**
   * Which columns to match. Defaults to name · maker(brand) · SKU · category
   * (R88 field-grain search). The Engine's keyword fallback and the legacy
   * search route both take the default, so they gain SKU/category matching too.
   */
  fields?: CrossLayerSearchField[];
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
 * Used by the Library's ASK surface — the LibrarianBar on `/library`, which
 * renders results in place on the Room. There is no `/library/search` route: the
 * R21 dissolve (the-document DECISIONS I109) retired the old zone's search page
 * along with the header input that submitted to it, and the `?q=` URL contract
 * went with them. Results are not shareable by URL; the ask is a gesture on the
 * Room, not an address.
 */
export function useCrossLayerSearch(
  options: UseCrossLayerSearchOptions,
): ReturnType<typeof useQuery<CrossLayerSearchResult, Error>> {
  const { query, perLayerLimit = 25, fields = DEFAULT_CROSS_LAYER_FIELDS, enabled = true } = options;
  const trimmed = query.trim();

  return useQuery<CrossLayerSearchResult, Error>({
    queryKey: ['cross-layer-search', trimmed, { perLayerLimit, fields }],
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
        .or(buildCrossLayerOrFilter(term, fields))
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
