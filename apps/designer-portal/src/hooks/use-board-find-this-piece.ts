'use client';

/**
 * "Find this piece" (US-15 W4a) — the deck resolver for one picture pin.
 * The pin becomes a `source_format = 'pin'` import (register_board_deck_import,
 * one job per pin, resumable), the resolver runs for it under the designer's
 * JWT, and its 3–5 candidates are shown inline. Keep goes through the same
 * keep RPC and pin-patch path as a deck piece; the picture stays on the pin
 * and is remembered as `data.original_image_url`.
 */

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DeckImportCandidate, DeckImportItem, EditableMoodBoardItem } from '@patina/types';
import { createBrowserClient, deckImportKeys, toDeckImportItem } from '@patina/supabase';
import {
  DECK_REVIEW_COPY,
  DECK_REVIEW_POLL_MS,
  type DeckProductMap,
  type DeckProductView,
  type DeckReviewRoom,
  useDeckImportDecisions,
} from './use-board-deck-import-review';

export const PHOTO_MATCH_FLAG = 'board-photo-match';

export const FIND_PIECE_COPY = {
  action: 'Find this piece',
  finding: 'Finding this piece',
  library: 'From your library',
  likelyLook: DECK_REVIEW_COPY.likelyLook,
  possibleLook: DECK_REVIEW_COPY.possibleLook,
  unavailable: 'Photo match is unavailable right now',
  nothing: 'Nothing close yet',
  keep: DECK_REVIEW_COPY.keep,
  kept: DECK_REVIEW_COPY.kept,
  failed: 'That did not go through.',
} as const;

/** At most five candidates are ever shown (the item holds five). */
export const FIND_PIECE_SHOWN = 5;

const LIBRARY_LAYERS = new Set(['personal', 'studio']);

export interface FindPieceGroups {
  library: DeckImportCandidate[];
  likely: DeckImportCandidate[];
  possible: DeckImportCandidate[];
}

/**
 * The inline groups: anything found by link or words, and look matches in the
 * designer's own (personal or studio) library, under "From your library";
 * catalog look matches under "Likely, by look" / "Possible, by look".
 */
export function groupFoundCandidates(candidates: readonly DeckImportCandidate[]): FindPieceGroups {
  const groups: FindPieceGroups = { library: [], likely: [], possible: [] };
  for (const candidate of candidates.slice(0, FIND_PIECE_SHOWN)) {
    const layer = candidate.evidence?.layer;
    if (candidate.source !== 'look' || (typeof layer === 'string' && LIBRARY_LAYERS.has(layer))) {
      groups.library.push(candidate);
    } else if (candidate.band === 'possible') {
      groups.possible.push(candidate);
    } else {
      groups.likely.push(candidate);
    }
  }
  return groups;
}

/** A picture pin that is not already a deck piece (those are reviewed in the deck ledger). */
export function canFindThisPiece(pin: Pick<EditableMoodBoardItem, 'type' | 'imageUrl' | 'data'>): boolean {
  if (pin.type !== 'image') return false;
  const imageUrl = pin.imageUrl ?? (typeof pin.data?.image_url === 'string' ? pin.data.image_url : null);
  if (!imageUrl) return false;
  const deck = pin.data?.deck_import;
  return !(deck && typeof deck === 'object' && (deck as { source_format?: unknown }).source_format !== 'pin');
}

function pinCaption(pin: Pick<EditableMoodBoardItem, 'data' | 'content'>): { [key: string]: { name: string } } {
  const name = typeof pin.data?.name === 'string' && pin.data.name.trim()
    ? pin.data.name.trim()
    : typeof pin.content === 'string' && pin.content.trim() ? pin.content.trim() : null;
  return name ? { caption: { name: name.slice(0, 200) } } : {};
}

type LookStatus = 'not_asked' | 'unavailable' | 'ran';

export interface FindThisPieceRoom {
  pins: () => readonly EditableMoodBoardItem[];
  replaceItem: (item: EditableMoodBoardItem) => void;
  addItems: (items: readonly EditableMoodBoardItem[]) => void;
  flush: () => Promise<void>;
}

export function useBoardFindThisPiece(input: {
  boardId: string | undefined;
  pin: EditableMoodBoardItem;
  room: FindThisPieceRoom;
}) {
  const { boardId, pin, room } = input;
  const [importId, setImportId] = useState<string | undefined>(undefined);
  const [itemId, setItemId] = useState<string | undefined>(undefined);
  const [finding, setFinding] = useState(false);
  const [lookStatus, setLookStatus] = useState<LookStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // One hook per pin: the caller keys it by pin id.
  const pinId = pin.id;
  const crop = pin.imageUrl;

  // The pin carries its job and keeps its picture as the original.
  const deckRoom = useMemo<DeckReviewRoom>(() => ({
    pins: room.pins,
    addItems: room.addItems,
    flush: room.flush,
    replaceItem: (next) => {
      if (next.id !== pinId) {
        room.replaceItem(next);
        return;
      }
      const data = { ...(next.data ?? {}) };
      if (typeof data.original_image_url !== 'string' && crop) data.original_image_url = crop;
      const deck = data.deck_import && typeof data.deck_import === 'object' ? data.deck_import : {};
      data.deck_import = { ...deck, import_id: importId, source_format: 'pin' };
      room.replaceItem({ ...next, data });
    },
  }), [crop, importId, pinId, room]);
  const decisions = useDeckImportDecisions(importId, deckRoom);

  const itemQuery = useQuery({
    queryKey: deckImportKeys.items(importId),
    enabled: !!importId,
    queryFn: async (): Promise<DeckImportItem[]> => {
      const { data, error: readError } = await createBrowserClient()
        .from('board_deck_import_items')
        .select('*')
        .eq('import_id', importId!)
        .order('slide_index', { ascending: true })
        .order('element_key', { ascending: true });
      if (readError) throw readError;
      return (data ?? []).map(toDeckImportItem);
    },
    refetchInterval: (query) =>
      (query.state.data ?? []).some((row) => row.state === 'pending') ? DECK_REVIEW_POLL_MS : false,
  });
  const item = useMemo(
    () => (itemQuery.data ?? []).find((row) => row.id === itemId) ?? itemQuery.data?.[0] ?? null,
    [itemId, itemQuery.data],
  );

  const productIds = useMemo(() => [...new Set(
    (item?.candidates ?? []).map((candidate) => candidate.productId).filter((id): id is string => !!id),
  )].sort(), [item]);
  const productsQuery = useQuery({
    queryKey: [...deckImportKeys.all, 'products', productIds] as const,
    enabled: productIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, DeckProductView>> => {
      const { data, error: readError } = await createBrowserClient()
        .from('products')
        .select('id, name, images, price_retail, source_url, vendor:vendors!products_vendor_id_fkey(name)')
        .in('id', productIds);
      if (readError) throw readError;
      const map = new Map<string, DeckProductView>();
      for (const row of (data ?? []) as unknown as Array<{
        id: string;
        name: string | null;
        images: string[] | null;
        price_retail: number | null;
        source_url: string | null;
        vendor: { name: string | null } | null;
      }>) {
        map.set(row.id, {
          name: row.name,
          maker: row.vendor?.name ?? null,
          priceCents: row.price_retail,
          imageUrl: row.images?.[0] ?? null,
          sourceUrl: row.source_url,
        });
      }
      return map;
    },
  });
  const products: DeckProductMap = useMemo(() => productsQuery.data ?? new Map(), [productsQuery.data]);

  const find = useCallback(async () => {
    if (!boardId) return;
    setFinding(true);
    setError(null);
    setLookStatus(null);
    try {
      // The pin must be saved before the server can see it.
      await room.flush();
      const client = createBrowserClient();
      const { data, error: registerError } = await client.rpc('register_board_deck_import', {
        p_board_id: boardId,
        p_file_sha256: '',
        p_file_name: '',
        p_manifest: {
          source_format: 'pin',
          board_item_id: pinId,
          options: { photo_match: true },
          extracted: pinCaption(pin),
        },
      });
      if (registerError) throw registerError;
      const registration = data as { import_id: string; items?: { item_id: string }[] | null };
      setImportId(registration.import_id);
      setItemId(registration.items?.[0]?.item_id);
      const { data: run, error: runError } = await client.functions.invoke('board-deck-import-resolve', {
        body: { import_id: registration.import_id },
      });
      if (runError) {
        // The piece stays pending; the every-minute cron finishes it.
        setLookStatus('unavailable');
      } else {
        const status = (run as { summary?: { look?: { status?: LookStatus } } } | null)?.summary?.look?.status;
        setLookStatus(status ?? null);
      }
      await itemQuery.refetch();
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : FIND_PIECE_COPY.failed);
    } finally {
      setFinding(false);
    }
  }, [boardId, itemQuery, pin, pinId, room]);

  const keep = useCallback((candidate: DeckImportCandidate) => {
    if (!item) return Promise.resolve(false);
    return decisions.choose(item, { candidateRank: candidate.rank });
  }, [decisions, item]);

  const groups = useMemo(() => groupFoundCandidates(item?.candidates ?? []), [item]);

  return {
    find,
    keep,
    finding: finding || item?.state === 'pending',
    started: !!importId,
    item,
    groups,
    products,
    unavailable: lookStatus === 'unavailable',
    busy: decisions.busyItemId != null && decisions.busyItemId === item?.id,
    error: error ?? (decisions.error && decisions.error.itemId === item?.id ? decisions.error.message : null),
  };
}
