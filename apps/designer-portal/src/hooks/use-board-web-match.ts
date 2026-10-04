'use client';

/**
 * Bring in a Deck (US-15 W4b) — "Search the web for this piece". Always
 * designer-pressed: nothing here runs on its own. The board-web-match edge
 * function sends the crop to Google Vision Web Detection, keeps retailer and
 * vendor pages, and appends what it finds to the piece's candidates; the
 * ledger then shows them as "Found on the web". Every search is metered by a
 * per-studio monthly budget (00680).
 *
 * Hidden unless the `board-web-match` flag is on AND the function reports a
 * key (`GET ?probe=1` → {enabled}). A cap answer (429 cap_reached) becomes the
 * plain line in WEB_MATCH_COPY.capReached.
 */

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient, deckImportKeys } from '@patina/supabase';
import { useFeatureFlag } from '@/hooks/use-feature-flag';

export const WEB_MATCH_FLAG = 'board-web-match';
const FUNCTION_NAME = 'board-web-match';
/** The function takes at most this many pieces a call. */
export const WEB_MATCH_MAX_ITEMS = 20;

export const WEB_MATCH_COPY = {
  searchPiece: 'Search the web for this piece',
  searchNotFound: (count: number) => `Search the web for the ${count} not found yet`,
  searching: 'Searching the web…',
  nothingFound: 'Nothing found on the web',
  capReached: (resets: string) => `This month's web searches are used up — resets ${resets}`,
  failed: 'The web search did not finish. Try again.',
} as const;

/** "2026-11-01T00:00:00+00:00" → "November 1" (the reset is a UTC month start). */
export function webMatchResetLabel(iso: string | null): string {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return 'next month';
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** The function's answer, typed here: portal code does not read the 00680 tables. */
interface WebMatchResponse {
  ok?: boolean;
  code?: 'cap_reached' | 'no_key';
  resets_at?: string | null;
  cap_reached?: boolean;
  results?: Array<{ item_id: string; status: 'found' | 'none' | 'skipped' | 'cap_reached' | 'failed' }>;
}

async function errorBody(error: unknown): Promise<WebMatchResponse | null> {
  const context = (error as { context?: { json?: () => Promise<unknown> } })?.context;
  if (!context?.json) return null;
  try {
    return (await context.json()) as WebMatchResponse;
  } catch {
    return null;
  }
}

export function useBoardWebMatch(importId: string | null | undefined) {
  const queryClient = useQueryClient();
  const flag = useFeatureFlag(WEB_MATCH_FLAG);
  const probe = useQuery({
    queryKey: ['board-web-match', 'probe'] as const,
    enabled: flag.value,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await createBrowserClient().functions.invoke(`${FUNCTION_NAME}?probe=1`, {
        method: 'GET',
      });
      return !error && (data as { enabled?: unknown } | null)?.enabled === true;
    },
  });

  const [searching, setSearching] = useState<ReadonlySet<string>>(() => new Set());
  const [nothing, setNothing] = useState<ReadonlySet<string>>(() => new Set());
  const [capResetsAt, setCapResetsAt] = useState<string | null>(null);
  const [capReached, setCapReached] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = flag.value && probe.data === true && Boolean(importId);

  const search = useCallback(
    async (itemIds: readonly string[]) => {
      const ids = itemIds.slice(0, WEB_MATCH_MAX_ITEMS);
      if (!importId || ids.length === 0) return;
      setError(null);
      setSearching((prev) => new Set([...prev, ...ids]));
      try {
        const { data, error: invokeError } = await createBrowserClient().functions.invoke(FUNCTION_NAME, {
          body: { item_ids: ids },
        });
        const body = invokeError ? await errorBody(invokeError) : (data as WebMatchResponse | null);
        if (body?.code === 'cap_reached' || body?.cap_reached) {
          setCapReached(true);
          setCapResetsAt(body.resets_at ?? null);
        } else if (body?.code === 'no_key') {
          await queryClient.invalidateQueries({ queryKey: ['board-web-match', 'probe'] });
        } else if (invokeError) {
          setError(WEB_MATCH_COPY.failed);
        }
        const none = (body?.results ?? []).filter((r) => r.status === 'none').map((r) => r.item_id);
        if (none.length) setNothing((prev) => new Set([...prev, ...none]));
        await queryClient.invalidateQueries({ queryKey: deckImportKeys.items(importId) });
      } catch {
        setError(WEB_MATCH_COPY.failed);
      } finally {
        setSearching((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
      }
    },
    [importId, queryClient],
  );

  return {
    available,
    search,
    isSearching: (itemId: string) => searching.has(itemId),
    anySearching: searching.size > 0,
    nothingFound: (itemId: string) => nothing.has(itemId),
    capReached,
    capLine: capReached ? WEB_MATCH_COPY.capReached(webMatchResetLabel(capResetsAt)) : null,
    error,
  };
}

export type BoardWebMatch = ReturnType<typeof useBoardWebMatch>;
