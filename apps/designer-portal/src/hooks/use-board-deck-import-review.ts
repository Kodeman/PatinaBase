'use client';

/**
 * Bring in a Deck (US-15 W3) — the review side: what the resolver found for
 * each piece, the canvas captions and room-head line it drives, and the
 * designer's decisions (Keep / Swap / Paste a link / Keep as reference /
 * Unkeep). Every decision RPC answers with a PinPatch; it is applied here
 * through the room's own command path (replaceItem / addItems), so the next
 * whole-state save carries it and undo can take it back. The server never
 * writes proposal_board_items.
 */

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  DeckImportCandidate,
  DeckImportItem,
  DeckImportStatus,
  EditableMoodBoardItem,
  MoodBoardItemData,
  PinPatch,
} from '@patina/types';
import {
  createBrowserClient,
  deckImportKeys,
  deckImportRefusalReason,
  resolveVendor,
  toDeckImportItem,
  useAttachBoardDeckImportPins,
  useCaptureFromUrl,
  useCommitProposalCapture,
  useKeepBoardDeckImportItem,
  useReferenceBoardDeckImportItem,
  useSwapBoardDeckImportItem,
  useUnkeepBoardDeckImportItem,
} from '@patina/supabase';

/** Contract lexicon (PLAN.md "The designer flow" steps 3–5). No scores, no %. */
export const DECK_REVIEW_COPY = {
  byLink: 'From the link on the slide',
  named: 'Named on the slide',
  likelyLook: 'Likely, by look',
  possibleLook: 'Possible, by look',
  web: 'Found on the web',
  notFound: 'Not found yet',
  finding: 'Finding pieces',
  kept: 'Kept',
  reference: 'Kept as reference',
  keep: 'Keep',
  swap: 'Swap',
  pasteLink: 'Paste a link',
  keepAsReference: 'Keep as reference',
  unkeep: 'Unkeep',
  review: 'Review',
  searchLibrary: 'Search the library',
  whichPicture: 'Which picture?',
  keepWithoutPicture: 'Keep without a picture',
  bulkKeepLinks: 'Keep every piece found by its link',
  onSchedule: 'Already on the schedule',
  inProject: 'Already in the project',
  selections: 'These are her selections',
  options: 'These are options',
  orderFromSchedule: 'Order from the schedule',
} as const;

export const DECK_REVIEW_POLL_MS = 5_000;

export interface DeckImportSummary {
  id: string;
  status: DeckImportStatus;
  slideCount: number;
}

/** The product behind a candidate id, as the ledger shows it. */
export interface DeckProductView {
  name: string | null;
  maker: string | null;
  priceCents: number | null;
  imageUrl: string | null;
  sourceUrl: string | null;
}

export type DeckProductMap = ReadonlyMap<string, DeckProductView>;

export type DeckRowState =
  | 'finding'
  | 'to_confirm'
  | 'not_found'
  | 'needs_picture'
  | 'kept'
  | 'reference';

// ── Pure helpers ───────────────────────────────────────────────────────────

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Terminal rows off the ledger and its counts. `merged` is a link row folded
 *  into the picture it was kept onto (SQ-367 / 00678). */
const OFF_LEDGER_STATES = new Set<string>(['removed', 'merged']);

/** The pieces the ledger lists: product-role, still on the board. */
export function reviewPieces(items: readonly DeckImportItem[]): DeckImportItem[] {
  return items
    .filter((item) => item.role === 'product' && !OFF_LEDGER_STATES.has(item.state))
    .sort((a, b) => a.slideIndex - b.slideIndex || a.elementKey.localeCompare(b.elementKey));
}

/** A product found from a link that no picture claimed (pairing abstained). */
export function needsPicture(item: DeckImportItem): boolean {
  return item.boardItemId == null && item.state === 'found';
}

export function rowState(item: DeckImportItem): DeckRowState {
  if (item.state === 'kept') return 'kept';
  if (item.state === 'reference') return 'reference';
  if (item.state === 'not_found') return 'not_found';
  if (item.state === 'pending') return 'finding';
  return needsPicture(item) ? 'needs_picture' : 'to_confirm';
}

/** The candidate a row shows: the kept product, else the first candidate. */
export function shownCandidate(item: DeckImportItem): DeckImportCandidate | null {
  if (item.state === 'kept' && item.chosenProductId) {
    return item.candidates.find((c) => c.productId === item.chosenProductId) ?? null;
  }
  return item.candidates[0] ?? null;
}

/** How a piece was found, in the contract's words. */
export function howPhrase(item: DeckImportItem): string {
  const state = rowState(item);
  if (state === 'finding') return DECK_REVIEW_COPY.finding;
  if (state === 'not_found') return DECK_REVIEW_COPY.notFound;
  if (state === 'reference') return DECK_REVIEW_COPY.reference;
  if (state === 'needs_picture') return `Found from a link on slide ${item.slideIndex + 1}`;
  const band = shownCandidate(item)?.band;
  switch (item.foundBy) {
    case 'link': return DECK_REVIEW_COPY.byLink;
    case 'words': return DECK_REVIEW_COPY.named;
    case 'look': return band === 'possible' ? DECK_REVIEW_COPY.possibleLook : DECK_REVIEW_COPY.likelyLook;
    case 'web': return DECK_REVIEW_COPY.web;
    default: return state === 'kept' ? DECK_REVIEW_COPY.kept : DECK_REVIEW_COPY.notFound;
  }
}

/**
 * The only bulk act: a piece found by its own link, with a picture, whose
 * page photo agrees with the deck photo (band strong). Look matches — and
 * links paired to a picture by look — are kept one row at a time (R-DI7).
 */
export function isBulkKeepEligible(item: DeckImportItem): boolean {
  if (item.state !== 'found' || item.foundBy !== 'link' || item.boardItemId == null) return false;
  const top = item.candidates[0];
  if (!top || top.band !== 'strong') return false;
  if (top.source !== 'link' && top.source !== 'link_existing') return false;
  return top.evidence?.paired_by !== 'look';
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Name, maker, price, photo and page of a candidate, from either source. */
export function candidateView(
  candidate: DeckImportCandidate | null,
  products: DeckProductMap,
): (DeckProductView & { host: string | null }) | null {
  if (!candidate) return null;
  if (candidate.productId) {
    const product = products.get(candidate.productId);
    const sourceUrl = product?.sourceUrl ?? null;
    return {
      name: product?.name ?? null,
      maker: product?.maker ?? null,
      priceCents: product?.priceCents ?? null,
      imageUrl: product?.imageUrl ?? null,
      sourceUrl,
      host: hostOf(sourceUrl),
    };
  }
  const page = candidate.extracted;
  return {
    name: page?.name ?? null,
    maker: page?.brand ?? null,
    priceCents: typeof page?.priceCents === 'number' ? page.priceCents : null,
    imageUrl: page?.images?.[0] ?? null,
    sourceUrl: page?.sourceUrl ?? null,
    host: hostOf(page?.sourceUrl),
  };
}

const BAND_WORD: Record<DeckImportCandidate['band'], string> = {
  strong: 'found',
  likely: 'likely',
  possible: 'possible',
};

/** The mono caption under a to-confirm pin's label; null when none applies. */
export function canvasCaption(item: DeckImportItem, products: DeckProductMap): string | null {
  const state = rowState(item);
  if (state === 'not_found') return 'not found yet';
  if (state !== 'to_confirm') return null;
  const candidate = shownCandidate(item);
  const view = candidateView(candidate, products);
  if (!candidate || !view?.name) return null;
  return `${BAND_WORD[candidate.band]} · ${[view.name, view.maker].filter(Boolean).join(', ')}`;
}

/** "Finding pieces · 23 of 38" while resolving; "38 pieces from the deck · 8 to confirm" once ready. */
export function roomHeadLine(
  status: DeckImportStatus | null,
  items: readonly DeckImportItem[],
): { text: string; review: boolean } | null {
  const pieces = reviewPieces(items);
  if (!status || pieces.length === 0 || status === 'laying_out') return null;
  if (status === 'resolving') {
    const settled = pieces.filter((item) => item.state !== 'pending').length;
    return { text: `${DECK_REVIEW_COPY.finding} · ${settled} of ${pieces.length}`, review: settled > 0 };
  }
  if (status !== 'ready') return null;
  const toConfirm = pieces.filter((item) => {
    const state = rowState(item);
    return state === 'to_confirm' || state === 'needs_picture' || state === 'not_found';
  }).length;
  const total = plural(pieces.length, 'piece', 'pieces');
  return {
    text: toConfirm > 0 ? `${total} from the deck · ${toConfirm} to confirm` : `${total} from the deck`,
    review: true,
  };
}

/** LedgerFrontMatter stats: "N pieces · a by link · b by look · c named on the slide · d not found yet · e links still need a picture". */
export function frontMatterStats(items: readonly DeckImportItem[]): { label: string; value: string }[] {
  const pieces = reviewPieces(items);
  const count = (test: (item: DeckImportItem) => boolean) => pieces.filter(test).length;
  const decided = (item: DeckImportItem) => item.state === 'found' || item.state === 'kept';
  const byLink = count((item) => decided(item) && item.foundBy === 'link' && !needsPicture(item));
  const byLook = count((item) => decided(item) && item.foundBy === 'look');
  const named = count((item) => decided(item) && item.foundBy === 'words');
  const notFound = count((item) => item.state === 'not_found');
  const linkNoPicture = count(needsPicture);
  const stats = [{ value: String(pieces.length), label: pieces.length === 1 ? 'piece' : 'pieces' }];
  if (byLink) stats.push({ value: String(byLink), label: 'by link' });
  if (byLook) stats.push({ value: String(byLook), label: 'by look' });
  if (named) stats.push({ value: String(named), label: 'named on the slide' });
  if (notFound) stats.push({ value: String(notFound), label: 'not found yet' });
  if (linkNoPicture) {
    stats.push({
      value: String(linkNoPicture),
      label: linkNoPicture === 1 ? 'link still needs a picture' : 'links still need a picture',
    });
  }
  return stats;
}

/** The text "Search the library" opens with: what the slide said. */
export function captionSearchText(item: DeckImportItem): string {
  const extracted = item.extracted as {
    caption?: { name?: string; vendor?: string; text?: string };
    alt_text?: string | null;
    alt_auto?: boolean;
  };
  const caption = extracted.caption;
  const name = caption?.name?.trim() || caption?.text?.trim() ||
    (!extracted.alt_auto ? extracted.alt_text?.trim() : '') || '';
  return [name, caption?.vendor?.trim()].filter(Boolean).join(' ').slice(0, 120);
}

type DeckImportData = Record<string, unknown> & { item_id?: unknown; state?: unknown };

function deckImportOf(pin: Pick<EditableMoodBoardItem, 'data'>): DeckImportData | null {
  const value = pin.data?.deck_import;
  return value && typeof value === 'object' ? (value as DeckImportData) : null;
}

/** The pin a patch is for: its board item id, else the pin carrying its item id. */
export function findPatchedPin(
  pins: readonly EditableMoodBoardItem[],
  patch: Pick<PinPatch, 'boardItemId' | 'itemId'>,
): EditableMoodBoardItem | undefined {
  return (patch.boardItemId ? pins.find((pin) => pin.id === patch.boardItemId) : undefined) ??
    pins.find((pin) => deckImportOf(pin)?.item_id === patch.itemId);
}

/**
 * Apply one RPC pin patch to its pin. `data` keys merge as-is and a null
 * clears that key; `deck_import` merges into the pin's own (state always,
 * found_by when known) so nothing else on it is lost. The deck crop stays
 * the image; Unkeep / Keep as reference restore it if anything replaced it.
 */
export function applyPinPatch(pin: EditableMoodBoardItem, patch: PinPatch): EditableMoodBoardItem {
  const { deck_import: patchDeck, ...rest } = patch.data;
  const data: MoodBoardItemData = { ...(pin.data ?? {}) };
  for (const [key, value] of Object.entries(rest)) {
    if (value === null || value === undefined) delete data[key];
    else data[key] = value;
  }
  const previous = deckImportOf(pin) ?? {};
  data.deck_import = {
    ...previous,
    item_id: patch.itemId,
    state: patchDeck.state,
    ...(patchDeck.found_by ? { found_by: patchDeck.found_by } : {}),
  };
  const original = typeof data.original_image_url === 'string' ? data.original_image_url : null;
  const restoreCrop = patchDeck.state !== 'kept' && original;
  return {
    ...pin,
    type: patch.type,
    productId: patch.productId,
    captureId: patch.captureId,
    imageUrl: restoreCrop ? original : pin.imageUrl,
    data,
  };
}

/** A new product pin for a link kept without a picture, beside its slide. */
export function pinForKeptLink(input: {
  id: string;
  patch: PinPatch;
  item: Pick<DeckImportItem, 'id' | 'importId' | 'elementKey' | 'slideIndex' | 'slideTitle'>;
  pins: readonly EditableMoodBoardItem[];
}): EditableMoodBoardItem {
  const { patch, item, pins } = input;
  const siblings = pins.filter((pin) => {
    const deck = deckImportOf(pin);
    return deck?.import_id === item.importId && deck?.slide_index === item.slideIndex;
  });
  const width = 200;
  const x = siblings.length
    ? Math.max(...siblings.map((pin) => pin.x + pin.width)) + 24
    : Math.max(0, ...pins.map((pin) => pin.x + pin.width)) + 24;
  const y = siblings.length ? Math.min(...siblings.map((pin) => pin.y)) : 0;
  const sectionId = siblings.find((pin) => typeof pin.data?.section_id === 'string')?.data?.section_id ?? null;
  const zIndex = Math.max(-1, ...pins.map((pin) => pin.zIndex ?? 0)) + 1;
  const base: EditableMoodBoardItem = {
    id: input.id,
    type: patch.type,
    x,
    y,
    width,
    height: null,
    zIndex,
    rotation: 0,
    locked: false,
    productId: null,
    captureId: null,
    paletteId: null,
    imageUrl: patch.data.product_image_url,
    content: null,
    data: {
      section_id: sectionId,
      provenance: 'imported_deck',
      image_url: patch.data.product_image_url,
      deck_import: {
        import_id: item.importId,
        item_id: item.id,
        element_key: item.elementKey,
        slide_index: item.slideIndex,
        slide_title: item.slideTitle ?? `Slide ${item.slideIndex + 1}`,
        state: 'kept',
      },
    },
  };
  return applyPinPatch(base, patch);
}

// ── Reads ───────────────────────────────────────────────────────────────────

const ACTIVE: ReadonlySet<DeckImportStatus> = new Set(['laying_out', 'resolving']);

/**
 * The board's latest deck import, its pieces and the products behind their
 * candidates. Both reads poll every 5 s while the import is still laying out
 * or resolving, then stop.
 */
export function useBoardDeckImportReview(boardId: string | undefined, enabled: boolean) {
  const importQuery = useQuery({
    queryKey: [...deckImportKeys.all, 'board', boardId] as const,
    enabled: enabled && !!boardId,
    queryFn: async (): Promise<DeckImportSummary | null> => {
      const { data, error } = await createBrowserClient()
        .from('board_deck_imports')
        .select('id, status, slide_count')
        .eq('board_id', boardId!)
        .eq('source_format', 'deck')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { id: data.id, status: data.status as DeckImportStatus, slideCount: data.slide_count };
    },
    refetchInterval: (query) =>
      query.state.data && ACTIVE.has(query.state.data.status) ? DECK_REVIEW_POLL_MS : false,
  });
  const deckImport = importQuery.data ?? null;
  const importId = deckImport?.id;
  const live = deckImport ? ACTIVE.has(deckImport.status) : false;

  const itemsQuery = useQuery({
    queryKey: deckImportKeys.items(importId),
    enabled: enabled && !!importId,
    queryFn: async (): Promise<DeckImportItem[]> => {
      const { data, error } = await createBrowserClient()
        .from('board_deck_import_items')
        .select('*')
        .eq('import_id', importId!)
        .order('slide_index', { ascending: true })
        .order('element_key', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(toDeckImportItem);
    },
    refetchInterval: (query) =>
      live || (query.state.data ?? []).some((item) => item.state === 'pending')
        ? DECK_REVIEW_POLL_MS
        : false,
  });
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);

  const productIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of items) {
      if (item.chosenProductId) ids.add(item.chosenProductId);
      for (const candidate of item.candidates) if (candidate.productId) ids.add(candidate.productId);
    }
    return [...ids].sort();
  }, [items]);

  const productsQuery = useQuery({
    queryKey: [...deckImportKeys.all, 'products', productIds] as const,
    enabled: enabled && productIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, DeckProductView>> => {
      const { data, error } = await createBrowserClient()
        .from('products')
        .select('id, name, images, price_retail, source_url, vendor:vendors!products_vendor_id_fkey(name)')
        .in('id', productIds);
      if (error) throw error;
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

  return { deckImport, items, products, refetch: itemsQuery.refetch };
}

// ── Decisions ───────────────────────────────────────────────────────────────

/** The room seam: the same command path the deck lay-out uses. */
export interface DeckReviewRoom {
  pins: () => readonly EditableMoodBoardItem[];
  replaceItem: (item: EditableMoodBoardItem) => void;
  addItems: (items: readonly EditableMoodBoardItem[]) => void;
  flush: () => Promise<void>;
}

type Choice = { candidateRank: number } | { productId: string };

function refusalMessage(error: unknown): string {
  const reason = deckImportRefusalReason(error);
  if (reason === 'on_schedule') return DECK_REVIEW_COPY.onSchedule;
  if (reason === 'promoted') return DECK_REVIEW_COPY.inProject;
  return error instanceof Error && error.message ? error.message : 'That did not go through.';
}

/** Unkeep is blocked once the piece has gone onward. */
export function unkeepBlockedReason(pin: EditableMoodBoardItem | undefined): string | null {
  if (!pin) return null;
  if (pin.projectFfeItemId || (typeof pin.data?.project_ffe_item_id === 'string' && pin.data.project_ffe_item_id)) {
    return DECK_REVIEW_COPY.inProject;
  }
  if (typeof pin.data?.proposalItemId === 'string' && pin.data.proposalItemId) return DECK_REVIEW_COPY.onSchedule;
  return null;
}

export function useDeckImportDecisions(importId: string | undefined, room: DeckReviewRoom) {
  const keepMutation = useKeepBoardDeckImportItem();
  const swapMutation = useSwapBoardDeckImportItem();
  const referenceMutation = useReferenceBoardDeckImportItem();
  const unkeepMutation = useUnkeepBoardDeckImportItem();
  const attach = useAttachBoardDeckImportPins();
  const captureFromUrl = useCaptureFromUrl();
  const commitCapture = useCommitProposalCapture();
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [error, setError] = useState<{ itemId: string; message: string } | null>(null);

  const apply = useCallback(async (item: DeckImportItem, patch: PinPatch) => {
    const pins = room.pins();
    const pin = findPatchedPin(pins, patch);
    if (pin) {
      room.replaceItem(applyPinPatch(pin, patch));
      return;
    }
    if (patch.boardItemId == null && patch.data.deck_import.state === 'kept') {
      const created = pinForKeptLink({ id: globalThis.crypto.randomUUID(), patch, item, pins });
      room.addItems([created]);
      await room.flush();
      await attach.mutateAsync({
        importId: item.importId,
        pins: [{ elementKey: item.elementKey, boardItemId: created.id }],
      });
    }
  }, [attach, room]);

  const run = useCallback(async (
    item: DeckImportItem,
    act: () => Promise<PinPatch>,
  ): Promise<boolean> => {
    if (!importId) return false;
    setBusyItemId(item.id);
    setError(null);
    try {
      await apply(item, await act());
      return true;
    } catch (cause) {
      setError({ itemId: item.id, message: refusalMessage(cause) });
      return false;
    } finally {
      setBusyItemId(null);
    }
  }, [apply, importId]);

  /** Keep the shown candidate (or a given one); a kept piece swaps instead. */
  const choose = useCallback((item: DeckImportItem, choice?: Choice, boardItemId?: string) => {
    const pick: Choice | null = choice ??
      (item.candidates[0] ? { candidateRank: item.candidates[0].rank } : null);
    if (!pick || !importId) return Promise.resolve(false);
    return run(item, () => item.state === 'kept'
      ? swapMutation.mutateAsync({ importId, itemId: item.id, ...pick })
      : keepMutation.mutateAsync({
        importId,
        itemId: item.id,
        ...pick,
        ...(boardItemId ? { boardItemId } : {}),
      }));
  }, [importId, keepMutation, run, swapMutation]);

  const reference = useCallback((item: DeckImportItem) => run(
    item,
    () => referenceMutation.mutateAsync({ importId: importId!, itemId: item.id }),
  ), [importId, referenceMutation, run]);

  const unkeep = useCallback((item: DeckImportItem) => {
    const pin = item.boardItemId ? room.pins().find((p) => p.id === item.boardItemId) : undefined;
    const blocked = unkeepBlockedReason(pin);
    if (blocked) {
      setError({ itemId: item.id, message: blocked });
      return Promise.resolve(false);
    }
    return run(item, () => unkeepMutation.mutateAsync({ importId: importId!, itemId: item.id }));
  }, [importId, room, run, unkeepMutation]);

  /** Paste a link: the capture-from-url flow for this row, then keep it. */
  const pasteLink = useCallback((item: DeckImportItem, url: string) => run(item, async () => {
    const extracted = await captureFromUrl.mutateAsync({ url: url.trim(), mode: 'capture' });
    const sourceUrl = extracted.sourceUrl ?? url.trim();
    const vendor = await resolveVendor({ url: sourceUrl, name: extracted.brand ?? undefined });
    const committed = await commitCapture.mutateAsync({
      clientCaptureId: globalThis.crypto.randomUUID(),
      payload: {
        name: extracted.name ?? undefined,
        description: extracted.description ?? undefined,
        sourceUrl,
        images: extracted.images ?? undefined,
        priceRetailCents: extracted.priceRetailCents ?? undefined,
        vendorId: vendor.id,
        captureSource: 'portal',
        productStatus: 'draft',
        thumbnailUrl: extracted.images?.[0] ?? undefined,
        rawPayload: {
          name: extracted.name ?? null,
          price_retail_cents: extracted.priceRetailCents ?? null,
          vendor: extracted.brand ? { name: extracted.brand } : null,
        },
      },
    });
    const productId = committed.productId;
    if (!productId) throw new Error('That link could not become a product.');
    return item.state === 'kept'
      ? swapMutation.mutateAsync({ importId: importId!, itemId: item.id, productId })
      : keepMutation.mutateAsync({ importId: importId!, itemId: item.id, productId });
  }), [captureFromUrl, commitCapture, importId, keepMutation, run, swapMutation]);

  /** "Keep every piece found by its link" — eligible rows only, one at a time. */
  const keepEveryLink = useCallback(async (items: readonly DeckImportItem[]) => {
    let kept = 0;
    for (const item of items.filter(isBulkKeepEligible)) {
      if (await choose(item)) kept += 1;
    }
    return kept;
  }, [choose]);

  return { choose, reference, unkeep, pasteLink, keepEveryLink, busyItemId, error, clearError: () => setError(null) };
}

export type DeckImportDecisions = ReturnType<typeof useDeckImportDecisions>;
