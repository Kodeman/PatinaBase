import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaintColorBrand =
  | 'sherwin_williams'
  | 'benjamin_moore'
  | 'farrow_ball'
  | 'pantone_tpg';

export interface PaintColor {
  id: string;
  brand: PaintColorBrand;
  code: string;
  name: string;
  hex: string;
  family: string | null;
  lrv: number | null;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a free-text query into a websearch_to_tsquery-compatible string.
 * Escape any single quotes by doubling them; otherwise pass through. We
 * use `websearch_to_tsquery` server-side so the user can type natural
 * phrases.
 */
function buildQuery(raw: string): string {
  return raw.trim().replace(/'/g, "''");
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Search the paint_colors catalog by name/code/brand using the GIN
 * tsvector index. Returns up to 50 matches. When `query` is empty and a
 * brand is provided, returns the most common rows for that brand
 * (alphabetical by code). When both are empty, returns an empty list.
 */
export function useSearchPaintColors(query: string, brand?: PaintColorBrand) {
  const trimmed = (query ?? '').trim();
  const enabled = trimmed.length > 0 || !!brand;

  return useQuery({
    queryKey: ['paint-colors', 'search', trimmed.toLowerCase(), brand ?? null],
    enabled,
    staleTime: 60_000, // catalog rows are effectively immutable per session
    queryFn: async (): Promise<PaintColor[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      let q = supabase.from('paint_colors').select('*').limit(50);

      if (brand) q = q.eq('brand', brand);

      if (trimmed.length > 0) {
        const tsq = buildQuery(trimmed);
        // textSearch with `websearch` config matches the operator used by
        // `websearch_to_tsquery` server-side; `simple` regconfig is what
        // the migration's tsvector uses.
        q = q.textSearch('search_vector', tsq, { type: 'websearch', config: 'simple' });
      } else {
        // Brand-only listing: deterministic order so the picker is stable.
        q = q.order('code', { ascending: true });
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PaintColor[];
    },
  });
}

/**
 * Fetch a single paint color by id.
 */
export function usePaintColor(id: string | null | undefined) {
  return useQuery({
    queryKey: ['paint-colors', 'one', id ?? null],
    enabled: !!id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PaintColor | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('paint_colors')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      return (data ?? null) as PaintColor | null;
    },
  });
}
