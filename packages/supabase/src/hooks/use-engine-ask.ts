'use client';

/**
 * useEngineAsk — the Engine's ask path (Aesthete Wave 3C; design §3.2 #14,
 * product law R31/R38). Invokes the `aesthete-ask` edge function with the
 * caller's session JWT: the fn embeds the ask text (1.5 s budget), unions a
 * vector kNN with the aesthete_search FTS seam over the designer-visible
 * layers (RLS-transitive), and returns ranked items with matched-on chips.
 *
 * Degradation (§12.1 rung 2): when the inference worker is resting the fn
 * still answers FTS-only and flags { degraded: true } — surfaces render
 * "the Engine is resting" quietly, never an error, never "AI".
 *
 * The ask is NEVER persisted — server-side observability logs latency +
 * result count only (match_events, source='engine_ask', no text by shape).
 * Client-side: refetch-on-focus is off and retries are disabled so one ask
 * logs one event; a failed invoke is the caller's cue to fall back to plain
 * keyword search (EngineResults does exactly that).
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

export type EngineAskMatchSource = 'vector' | 'fts';

export interface EngineAskItem {
  id: string;
  name: string;
  brand: string | null;
  price_retail: number | null;
  price_trade: number | null;
  images: string[] | null;
  category: string | null;
  layer: 'personal' | 'studio' | 'catalog' | string;
  /** Which seam(s) surfaced it: 'vector' = the Engine's read, 'fts' = keyword. */
  matched_on: EngineAskMatchSource[];
  /** Blended RRF score — ordering signal only, never user-facing copy. */
  score: number;
}

export interface EngineAskResult {
  items: EngineAskItem[];
  /** true = the inference worker was unreachable within budget → FTS-only. */
  degraded: boolean;
  latency_ms: number;
  result_count: number;
}

export interface UseEngineAskOptions {
  /** The ask text. Empty/whitespace disables the query (nothing is sent). */
  ask: string;
  /** Optional structured narrowing — passed as the fn's context. */
  category?: string;
  layer?: 'personal' | 'studio' | 'catalog';
  /** Items returned. Fn default 8, cap 24. */
  limit?: number;
  enabled?: boolean;
}

export function useEngineAsk(options: UseEngineAskOptions) {
  const { ask, category, layer, limit, enabled = true } = options;
  const trimmed = ask.trim();

  return useQuery<EngineAskResult, Error>({
    queryKey: ['engine-ask', trimmed, { category: category ?? null, layer: layer ?? null, limit: limit ?? null }],
    enabled: enabled && trimmed.length > 0,
    // One ask = one match_events row: no focus refetch, no retries (a failed
    // invoke falls back to keyword search at the surface instead).
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<EngineAskResult> => {
      const supabase = createBrowserClient();
      const context: Record<string, string> = {};
      if (category) context.category = category;
      if (layer) context.layer = layer;

      const { data, error } = await supabase.functions.invoke('aesthete-ask', {
        body: {
          ask: trimmed,
          ...(Object.keys(context).length > 0 ? { context } : {}),
          ...(limit ? { limit } : {}),
        },
      });
      if (error) {
        throw new Error(`useEngineAsk: ${error.message}`);
      }
      const result = data as EngineAskResult | null;
      if (!result || !Array.isArray(result.items)) {
        throw new Error('useEngineAsk: malformed response');
      }
      return result;
    },
  });
}
