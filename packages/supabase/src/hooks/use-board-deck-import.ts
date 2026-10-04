'use client';

// Bring in a Deck (US-15) — the client side of migration 00676. The browser
// parses the deck and materializes every pin; these hooks register the
// import, attach the pins, read the pieces, and turn the designer's decisions
// (Keep / Swap / Keep as reference / Unkeep) into PinPatches. The RPCs never
// write proposal_board_items: the caller applies each patch through the room
// command path so it can be undone. Reads are RLS-scoped to studio
// co-members who can manage the board.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DeckImportCandidate,
  DeckImportItem,
  DeckImportManifest,
  DeckImportRefusalReason,
  DeckImportRegistration,
  PinPatch,
} from '@patina/types';
import { createBrowserClient } from '../client';
import type { Database, Json } from '../database.types';

const getSupabase = () => createBrowserClient();

type DeckImportItemRow = Database['public']['Tables']['board_deck_import_items']['Row'];

export const deckImportKeys = {
  all: ['board-deck-import'] as const,
  items: (importId: string | undefined) => ['board-deck-import', 'items', importId] as const,
};

/** DB candidate (snake_case jsonb) → DeckImportCandidate. */
function toCandidate(raw: Record<string, unknown>): DeckImportCandidate {
  const extracted = raw.extracted as Record<string, unknown> | undefined;
  return {
    source: raw.source as DeckImportCandidate['source'],
    productId: (raw.product_id as string | undefined) ?? undefined,
    extracted: extracted
      ? {
          name: extracted.name as string | undefined,
          brand: extracted.brand as string | undefined,
          priceCents: extracted.price_cents as number | undefined,
          images: extracted.images as string[] | undefined,
          sourceUrl: extracted.source_url as string | undefined,
        }
      : undefined,
    band: raw.band as DeckImportCandidate['band'],
    rank: Number(raw.rank),
    evidence: (raw.evidence as Record<string, unknown> | undefined) ?? undefined,
  };
}

/** DB row → the camelCase domain shape in `@patina/types`. */
export function toDeckImportItem(row: DeckImportItemRow): DeckImportItem {
  const candidates = Array.isArray(row.candidates)
    ? (row.candidates as Record<string, unknown>[])
    : [];
  return {
    id: row.id,
    importId: row.import_id,
    elementKey: row.element_key,
    boardItemId: row.board_item_id,
    slideIndex: row.slide_index,
    slideTitle: row.slide_title,
    role: row.role as DeckImportItem['role'],
    extracted: (row.extracted ?? {}) as Record<string, unknown>,
    state: row.state as DeckImportItem['state'],
    foundBy: row.found_by as DeckImportItem['foundBy'],
    candidates: candidates.map(toCandidate),
    chosenProductId: row.chosen_product_id,
    attempts: row.attempts,
    keptBy: row.kept_by,
    keptAt: row.kept_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** RPC pin patch (snake_case top level) → PinPatch. `data` passes through:
 * its keys are the pin's own data keys. */
export function toPinPatch(raw: Json): PinPatch {
  const patch = raw as Record<string, unknown>;
  return {
    itemId: patch.item_id as string,
    boardItemId: (patch.board_item_id as string | null) ?? null,
    type: patch.type as PinPatch['type'],
    productId: (patch.product_id as string | null) ?? null,
    captureId: (patch.capture_id as string | null) ?? null,
    data: patch.data as PinPatch['data'],
  };
}

/** Why Unkeep / Swap / Keep as reference refused, from the Postgres HINT;
 * null for any other error. */
export function deckImportRefusalReason(error: unknown): DeckImportRefusalReason | null {
  const hint =
    typeof error === 'object' && error !== null && 'hint' in error
      ? (error as { hint?: unknown }).hint
      : null;
  return hint === 'promoted' || hint === 'on_schedule' ? hint : null;
}

/** Every piece of one import, in slide order (the review ledger's read). */
export function useBoardDeckImportItems(importId: string | undefined) {
  return useQuery({
    queryKey: deckImportKeys.items(importId),
    enabled: !!importId,
    queryFn: async (): Promise<DeckImportItem[]> => {
      const { data, error } = await getSupabase()
        .from('board_deck_import_items')
        .select('*')
        .eq('import_id', importId!)
        .order('slide_index', { ascending: true })
        .order('element_key', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(toDeckImportItem);
    },
  });
}

/** Register a deck on a board. Idempotent on (board, file sha-256): the same
 * deck again returns the existing import with `resumed: true`. */
export function useRegisterBoardDeckImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      boardId: string;
      fileSha256: string;
      fileName: string;
      manifest: DeckImportManifest;
    }): Promise<DeckImportRegistration> => {
      const { manifest } = input;
      const { data, error } = await getSupabase().rpc('register_board_deck_import', {
        p_board_id: input.boardId,
        p_file_sha256: input.fileSha256,
        p_file_name: input.fileName,
        p_manifest: {
          slide_count: manifest.slideCount ?? 0,
          options: manifest.options ?? {},
          items: manifest.items.map((item) => ({
            element_key: item.elementKey,
            slide_index: item.slideIndex,
            slide_title: item.slideTitle ?? null,
            role: item.role,
            extracted: item.extracted ?? {},
          })),
          deck_links: (manifest.deckLinks ?? []).map((link) => ({
            url: link.url,
            text_context: link.textContext ?? null,
            source: link.source ?? null,
          })),
          slides: (manifest.slides ?? []).map((slide) => ({
            slide_index: slide.slideIndex ?? null,
            unpaired_links: (slide.unpairedLinks ?? []).map((link) => ({
              url: link.url,
              text_context: link.textContext ?? null,
              source: link.source ?? null,
            })),
          })),
        } as unknown as Json,
      });
      if (error) throw error;
      const result = data as Record<string, unknown>;
      const items = (result.items as Record<string, unknown>[] | null) ?? [];
      return {
        importId: result.import_id as string,
        resumed: Boolean(result.resumed),
        status: result.status as DeckImportRegistration['status'],
        items: items.map((item) => ({
          itemId: item.item_id as string,
          elementKey: item.element_key as string,
          boardItemId: (item.board_item_id as string | null) ?? null,
          state: item.state as DeckImportRegistration['items'][number]['state'],
        })),
      };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: deckImportKeys.items(result.importId) });
    },
  });
}

/** Record which pin each placed picture became. Every pin must be on the
 * import's board. */
export function useAttachBoardDeckImportPins() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      importId: string;
      pins: { elementKey: string; boardItemId: string }[];
    }): Promise<{ attached: number; status: DeckImportRegistration['status'] }> => {
      const { data, error } = await getSupabase().rpc('attach_board_deck_import_pins', {
        p_import_id: input.importId,
        p_pins: input.pins.map((pin) => ({
          element_key: pin.elementKey,
          board_item_id: pin.boardItemId,
        })),
      });
      if (error) throw error;
      const result = data as Record<string, unknown>;
      return {
        attached: Number(result.attached),
        status: result.status as DeckImportRegistration['status'],
      };
    },
    onSuccess: (_result, input) => {
      qc.invalidateQueries({ queryKey: deckImportKeys.items(input.importId) });
    },
  });
}

/** Choose a candidate by rank, or any product by id. */
type DeckImportChoice =
  | { candidateRank: number; productId?: never }
  | { productId: string; candidateRank?: never };

/** Keep a piece. A page with no product yet becomes one in the keeper's
 * library (idempotent); an existing product is reused. `boardItemId` pairs a
 * picture with a piece that has none; leave it out to keep without one (the
 * patch then asks for a new pin). */
export function useKeepBoardDeckImportItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: { importId: string; itemId: string; boardItemId?: string } & DeckImportChoice,
    ): Promise<PinPatch> => {
      const { data, error } = await getSupabase().rpc('keep_board_deck_import_item', {
        p_item_id: input.itemId,
        p_candidate_rank: input.candidateRank,
        p_product_id: input.productId,
        p_board_item_id: input.boardItemId,
      });
      if (error) throw error;
      return toPinPatch(data);
    },
    onSuccess: (_patch, input) => {
      qc.invalidateQueries({ queryKey: deckImportKeys.items(input.importId) });
    },
  });
}

/** Replace a kept piece with another candidate or product. Refuses once the
 * pin is promoted or on the schedule (see deckImportRefusalReason). */
export function useSwapBoardDeckImportItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: { importId: string; itemId: string } & DeckImportChoice,
    ): Promise<PinPatch> => {
      const { data, error } = await getSupabase().rpc('swap_board_deck_import_item', {
        p_item_id: input.itemId,
        p_candidate_rank: input.candidateRank,
        p_product_id: input.productId,
      });
      if (error) throw error;
      return toPinPatch(data);
    },
    onSuccess: (_patch, input) => {
      qc.invalidateQueries({ queryKey: deckImportKeys.items(input.importId) });
    },
  });
}

/** "Keep as reference": the pin stays her picture, with no product. */
export function useReferenceBoardDeckImportItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { importId: string; itemId: string }): Promise<PinPatch> => {
      const { data, error } = await getSupabase().rpc('reference_board_deck_import_item', {
        p_item_id: input.itemId,
      });
      if (error) throw error;
      return toPinPatch(data);
    },
    onSuccess: (_patch, input) => {
      qc.invalidateQueries({ queryKey: deckImportKeys.items(input.importId) });
    },
  });
}

/** Undo a keep: the pin goes back to "to confirm". Refuses once the pin is
 * promoted or on the schedule (see deckImportRefusalReason). */
export function useUnkeepBoardDeckImportItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { importId: string; itemId: string }): Promise<PinPatch> => {
      const { data, error } = await getSupabase().rpc('unkeep_board_deck_import_item', {
        p_item_id: input.itemId,
      });
      if (error) throw error;
      return toPinPatch(data);
    },
    onSuccess: (_patch, input) => {
      qc.invalidateQueries({ queryKey: deckImportKeys.items(input.importId) });
    },
  });
}
