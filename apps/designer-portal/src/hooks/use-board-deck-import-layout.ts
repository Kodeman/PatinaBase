'use client';

/**
 * Bring in a Deck (US-15 W2) — "Lay it out": the browser turns a parsed deck
 * into board sections and pins, through the room's own command and save path.
 *
 * Order: register (idempotent on board + sha-256; a re-drop resumes) → crops
 * (already made for the sheet's filmstrip, via cropDeckElements) → upload
 * through uploadFilesAsBoardItems → ONE room command adds the sections, pins
 * and notes (one undo step) → flush the save → attach the pins → kick the
 * resolver. The server never inserts pins (apply_board_room_state deletes
 * anything missing from a whole-state save).
 */

import { useCallback, useState } from 'react';
import type {
  BoardOwnerRef,
  DeckImportLink,
  DeckImportManifest,
  DeckImportRegistration,
  EditableMoodBoardItem,
  MoodBoardItemData,
  MoodBoardItemSnapshot,
  MoodBoardSection,
} from '@patina/types';
import {
  createBrowserClient,
  useAttachBoardDeckImportPins,
  useRegisterBoardDeckImport,
} from '@patina/supabase';
import type {
  BoardItemUploadOverride,
  uploadFilesAsBoardItems,
} from '@/components/mood-board/board-add-rail';
import { cropDeckElements, createCanvasCodec, type DeckImageCodec } from '@/lib/deck-import/crop';
import { layoutDeck, DECK_BOARD_WIDTH, DECK_SLIDE_GUTTER } from '@/lib/deck-import/layout';
import { findBareUrls } from '@/lib/deck-import/links';
import {
  itemExtracted,
  manifestMediaParts,
  type DeckManifest,
  type ManifestElement,
} from '@/lib/deck-import/manifest';
import { readManifest } from '@/lib/deck-import/parse-deck';
import { DeckImportError, openPackage, type PackageReader } from '@/lib/deck-import/read-package';

export const DECK_IMPORT_FLAG = 'board-deck-import';
/** ⌘K → the mounted board room opens its deck chooser. */
export const DECK_OPEN_EVENT = 'document:open-deck-import';

/** Contract copy lexicon (PLAN.md "The designer flow"; no codes in the UI). */
export const DECK_COPY = {
  notSupported: "Decks aren't supported here yet",
  resave: 'Re-save it as .pptx and bring it in again.',
  unreadable: "This deck couldn't be read — re-save it from PowerPoint and try again.",
  tooLarge: 'This deck is too large to bring in here.',
  resume: 'Already brought in — resume?',
  hold: 'Confirm the piece first',
  layOut: 'Lay it out',
  bringIn: 'Bring in a deck…',
} as const;

const DECK_EXTENSIONS = new Set(['pptx', 'ppsx', 'potx']);
const RESAVE_EXTENSIONS = new Set(['ppt', 'pps', 'pot', 'key']);
const PRESENTATION_MIME = /^application\/vnd\.openxmlformats-officedocument\.presentationml\./i;

function extensionOf(name: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(name);
  return match ? match[1].toLowerCase() : '';
}

/** A dropped/chosen file that is a deck (or an old-format one to re-save). */
export function deckFileKind(file: { name: string; type?: string }): 'deck' | 'resave' | null {
  const ext = extensionOf(file.name);
  if (DECK_EXTENSIONS.has(ext) || PRESENTATION_MIME.test(file.type ?? '')) return 'deck';
  if (RESAVE_EXTENSIONS.has(ext) || /^application\/vnd\.ms-powerpoint$/i.test(file.type ?? '')) {
    return 'resave';
  }
  return null;
}

/** Plain copy for any failure while reading a deck. */
export function deckImportMessage(error: unknown): string {
  if (error instanceof DeckImportError) {
    if (error.reason === 'resave_as_pptx') return DECK_COPY.resave;
    if (error.reason === 'file_too_large') return DECK_COPY.tooLarge;
    return DECK_COPY.unreadable;
  }
  return DECK_COPY.unreadable;
}

/** http(s) URLs pasted into "Links that came with this deck", in any text. */
export function extractPastedUrls(text: string): string[] {
  return findBareUrls(text);
}

/** A deck pin still "to confirm" may not be promoted or sent to the schedule. */
export function deckPinHoldReason(item: Pick<MoodBoardItemSnapshot, 'data'>): string | null {
  const deckImport = item.data?.deck_import;
  if (deckImport && typeof deckImport === 'object' && (deckImport as { state?: unknown }).state === 'to_confirm') {
    return DECK_COPY.hold;
  }
  return null;
}

/**
 * Hand-off from "From a deck" in the create picker to the new board's room:
 * the board has no room until the route changes, so the file waits here.
 */
const pendingDecks = new Map<string, File>();
export function stashPendingDeck(boardId: string, file: File): void {
  pendingDecks.set(boardId, file);
}
export function takePendingDeck(boardId: string): File | null {
  const file = pendingDecks.get(boardId) ?? null;
  pendingDecks.delete(boardId);
  return file;
}

// ── Prepare: parse + crop (feeds the sheet's filmstrip and the lay-out) ─────

export interface DeckCrop {
  blob: Blob;
  width: number;
  height: number;
}

export interface PreparedDeck {
  file: File;
  manifest: DeckManifest;
  crops: Map<string, DeckCrop>;
  /** Pin-role pictures with no crop (EMF, linked, undecodable, …). */
  unreadable: number;
}

const PIN_ROLES = new Set(['product', 'reference']);

async function openReader(file: File): Promise<PackageReader & { close?: () => void }> {
  if (typeof Worker !== 'undefined') {
    try {
      const { openPackageInWorker } = await import('@/lib/deck-import/package-worker-client');
      return await openPackageInWorker(file);
    } catch (error) {
      if (error instanceof DeckImportError) throw error;
      // No module worker in this browser: read inline instead.
    }
  }
  return openPackage(file.name, new Uint8Array(await file.arrayBuffer()));
}

export async function prepareDeck(
  file: File,
  deps: {
    open?: (file: File) => Promise<PackageReader & { close?: () => void }>;
    codec?: DeckImageCodec;
  } = {},
): Promise<PreparedDeck> {
  const reader = await (deps.open ?? openReader)(file);
  try {
    const manifest = await readManifest(reader, file.name);
    const media = await reader.read(manifestMediaParts(manifest));
    const results = await cropDeckElements(manifest, media, deps.codec ?? createCanvasCodec());
    const crops = new Map<string, DeckCrop>();
    for (const result of results) {
      if (result.ok) crops.set(result.element_key, { blob: result.blob, width: result.width, height: result.height });
    }
    const unreadable = manifest.elements.filter(
      (element) => PIN_ROLES.has(element.role) && !crops.has(element.element_key),
    ).length + manifest.skipped.filter((skip) =>
      skip.reason === 'unsupported_format' ||
      skip.reason === 'linked_image_unsupported' ||
      skip.reason === 'missing_media').length;
    return { file, manifest, crops, unreadable };
  } finally {
    reader.close?.();
  }
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "1 picture we couldn't read · 4 slides with no pictures"; null when clean. */
export function deckLedgerLine(deck: Pick<PreparedDeck, 'manifest' | 'unreadable'>): string | null {
  const withPictures = new Set(
    deck.manifest.elements.filter((element) => PIN_ROLES.has(element.role)).map((element) => element.slide_index),
  );
  const empty = deck.manifest.slides.filter((slide) => !withPictures.has(slide.index)).length;
  const parts: string[] = [];
  if (deck.unreadable > 0) parts.push(`${plural(deck.unreadable, 'picture', 'pictures')} we couldn't read`);
  if (empty > 0) parts.push(`${plural(empty, 'slide', 'slides')} with no pictures`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** The pin elements that will be placed: pin roles with a crop. */
function placeableElements(deck: PreparedDeck): ManifestElement[] {
  return deck.manifest.elements.filter(
    (element) => PIN_ROLES.has(element.role) && deck.crops.has(element.element_key),
  );
}

/** register_board_deck_import's manifest: the placed pictures plus every link. */
export function buildRegisterManifest(deck: PreparedDeck, pastedText = ''): DeckImportManifest {
  const { manifest } = deck;
  const deckLinks: DeckImportLink[] = manifest.deck_links.map((link) => ({
    url: link.url,
    textContext: link.text_context,
    source: link.source,
  }));
  const known = new Set(deckLinks.map((link) => link.url));
  for (const url of extractPastedUrls(pastedText)) {
    if (known.has(url)) continue;
    known.add(url);
    deckLinks.push({ url, source: 'pasted' });
  }
  return {
    slideCount: manifest.slides.length,
    options: { layout: 'section_per_slide' },
    items: placeableElements(deck).map((element) => ({
      elementKey: element.element_key,
      slideIndex: element.slide_index,
      slideTitle: manifest.slides[element.slide_index]?.title ?? undefined,
      role: element.role as 'product' | 'reference',
      extracted: itemExtracted(manifest, element) as unknown as Record<string, unknown>,
    })),
    deckLinks,
    slides: manifest.slides.map((slide) => ({
      slideIndex: slide.index,
      unpairedLinks: slide.unpaired_links.map((link) => ({
        url: link.url,
        textContext: link.text_context,
        source: link.source,
      })),
    })),
  };
}

/** An existing import of this exact deck on this board (RLS-scoped read). */
export async function findExistingDeckImport(boardId: string, sha256: string): Promise<boolean> {
  const { data, error } = await createBrowserClient()
    .from('board_deck_imports')
    .select('id')
    .eq('board_id', boardId)
    .eq('file_sha256', sha256)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

/** Wave 3 resolver kick. A 404 (not deployed yet) or any failure is fine:
 *  the every-minute cron picks the import up. Never awaited by the caller. */
export async function kickDeckImportResolver(importId: string): Promise<void> {
  try {
    await createBrowserClient().functions.invoke('board-deck-import-resolve', {
      body: { import_id: importId },
    });
  } catch {
    // Tolerated: the lay-out has already landed.
  }
}

// ── Lay it out ─────────────────────────────────────────────────────────────

export interface DeckLayoutRoom {
  sections: readonly MoodBoardSection[];
  items: readonly EditableMoodBoardItem[];
  /** Adds sections + items as ONE undoable room command. */
  commit: (sections: readonly MoodBoardSection[], items: readonly EditableMoodBoardItem[]) => void;
  /** Resolves once the room's save has landed. */
  flush: () => Promise<void>;
}

export interface DeckLayoutDeps {
  register: (input: {
    boardId: string;
    fileSha256: string;
    fileName: string;
    manifest: DeckImportManifest;
  }) => Promise<DeckImportRegistration>;
  upload: (input: {
    files: File[];
    overrides: BoardItemUploadOverride[];
    onProgress: (index: number) => void;
  }) => Promise<EditableMoodBoardItem[]>;
  attach: (input: { importId: string; pins: { elementKey: string; boardItemId: string }[] }) => Promise<unknown>;
  kick: (importId: string) => Promise<void>;
  newId?: () => string;
}

export interface DeckLayoutResult {
  importId: string;
  resumed: boolean;
  placed: number;
}

function newUuid(): string {
  return globalThis.crypto.randomUUID();
}

/** Where the deck starts: below everything already on the board. */
function originBelow(items: readonly EditableMoodBoardItem[]): { x: number; y: number } {
  if (items.length === 0) return { x: 0, y: 0 };
  const bottom = Math.max(...items.map((item) => item.y + (item.height ?? item.width)));
  return { x: 0, y: Math.ceil(bottom + DECK_SLIDE_GUTTER) };
}

export async function runDeckLayout(
  input: {
    boardId: string;
    deck: PreparedDeck;
    pastedLinks?: string;
    room: DeckLayoutRoom;
    onProgress?: (slide: number, of: number) => void;
  },
  deps: DeckLayoutDeps,
): Promise<DeckLayoutResult> {
  const { deck, room } = input;
  const { manifest } = deck;
  const slideCount = manifest.slides.length;
  const newId = deps.newId ?? newUuid;

  const registration = await deps.register({
    boardId: input.boardId,
    fileSha256: manifest.deck_sha256,
    fileName: deck.file.name,
    manifest: buildRegisterManifest(deck, input.pastedLinks),
  });
  const itemIdByKey = new Map(registration.items.map((item) => [item.elementKey, item.itemId]));
  const attached = new Set(
    registration.items.filter((item) => item.boardItemId).map((item) => item.elementKey),
  );

  const todo = placeableElements(deck).filter(
    (element) => itemIdByKey.has(element.element_key) && !attached.has(element.element_key),
  );
  if (todo.length === 0) {
    void deps.kick(registration.importId);
    return { importId: registration.importId, resumed: registration.resumed, placed: 0 };
  }

  const zStart = Math.max(-1, ...room.items.map((item) => item.zIndex ?? 0)) + 1;
  const layout = layoutDeck({ ...manifest, elements: todo }, {
    origin: originBelow(room.items),
    zStart,
    newId,
  });

  // A resumed deck reuses the sections it already laid out.
  const existingByName = new Map(room.sections.map((section) => [section.name, section.id]));
  const sectionIdMap = new Map<string, string>();
  const sections: MoodBoardSection[] = [];
  for (const section of layout.sections) {
    const reuse = registration.resumed ? existingByName.get(section.name) : undefined;
    if (reuse) sectionIdMap.set(section.id, reuse);
    else sections.push(section);
  }

  const elementByKey = new Map(todo.map((element) => [element.element_key, element]));
  const keyByItemId = new Map([...layout.itemIds].map(([key, id]) => [id, key]));
  const placements = layout.items.map((item) => ({
    element: elementByKey.get(keyByItemId.get(item.id)!)!,
    item,
  }));

  const files = placements.map(({ element }, index) => {
    const crop = deck.crops.get(element.element_key)!;
    return new File([crop.blob], `deck-${element.slide_index + 1}-${index + 1}.webp`, {
      type: crop.blob.type || 'image/webp',
    });
  });
  const overrides: BoardItemUploadOverride[] = placements.map(({ element, item }) => {
    const layoutData = item.data ?? {};
    const sectionId = typeof layoutData.section_id === 'string'
      ? sectionIdMap.get(layoutData.section_id) ?? layoutData.section_id
      : null;
    const itemId = itemIdByKey.get(element.element_key)!;
    const data: MoodBoardItemData = {
      ...layoutData,
      section_id: sectionId,
      provenance: 'imported_deck',
      deck_import: {
        ...(layoutData.deck_import as Record<string, unknown>),
        import_id: registration.importId,
        item_id: itemId,
        slide: element.slide_index,
        state: element.role === 'product' ? 'to_confirm' : 'reference',
      },
    };
    return {
      point: { x: item.x, y: item.y },
      size: { width: item.width, height: item.height ?? item.width },
      rotation: item.rotation ?? 0,
      zIndex: item.zIndex,
      data,
    };
  });

  const uploaded = await deps.upload({
    files,
    overrides,
    onProgress: (index) => {
      const element = placements[index]?.element;
      if (element) input.onProgress?.(element.slide_index + 1, slideCount);
    },
  });

  const pins: EditableMoodBoardItem[] = uploaded.map((item, index) =>
    placements[index].element.role === 'product' ? { ...item, type: 'capture' } : item,
  );

  // Free text becomes a note on the slide's frame (fresh imports only; a
  // resumed deck already carries its notes).
  const notes: EditableMoodBoardItem[] = [];
  if (!registration.resumed) {
    const scale = DECK_BOARD_WIDTH / (manifest.slide_size.cx || 1);
    const frameTop = new Map<number, { top: number; left: number; sectionId: string | null }>();
    placements.forEach(({ element, item }, index) => {
      if (frameTop.has(element.slide_index)) return;
      const sectionId = overrides[index].data?.section_id;
      frameTop.set(element.slide_index, {
        top: item.y - element.bbox.y * scale,
        left: item.x - element.bbox.x * scale,
        sectionId: typeof sectionId === 'string' ? sectionId : null,
      });
    });
    let z = zStart + pins.length;
    for (const slide of manifest.slides) {
      const frame = frameTop.get(slide.index);
      if (!frame) continue;
      const captions = new Set(
        manifest.elements.filter((e) => e.slide_index === slide.index).flatMap((e) => e.caption_keys),
      );
      for (const text of slide.texts) {
        if (text.role !== 'text' || captions.has(text.text_key) || !text.text.trim()) continue;
        const box = text.bbox ?? { x: 0, y: 0, w: 2_000_000, h: 600_000 };
        notes.push({
          id: newId(),
          type: 'note',
          x: Math.round((frame.left + box.x * scale) * 100) / 100,
          y: Math.round((frame.top + box.y * scale) * 100) / 100,
          width: Math.max(160, Math.round(box.w * scale)),
          height: Math.max(80, Math.round(box.h * scale)),
          zIndex: z++,
          rotation: 0,
          locked: false,
          productId: null,
          captureId: null,
          paletteId: null,
          imageUrl: null,
          content: text.text.trim(),
          data: {
            section_id: frame.sectionId,
            provenance: 'imported_deck',
            deck_import: {
              import_id: registration.importId,
              slide: slide.index,
              element_ref: text.text_key,
            },
          },
        });
      }
    }
  }

  room.commit(sections, [...pins, ...notes]);
  await room.flush();

  await deps.attach({
    importId: registration.importId,
    pins: pins.map((pin, index) => ({
      elementKey: placements[index].element.element_key,
      boardItemId: pin.id,
    })),
  });
  void deps.kick(registration.importId);
  return { importId: registration.importId, resumed: registration.resumed, placed: pins.length };
}

/** The room's wiring of runDeckLayout: real RPCs, the board's upload path. */
export function useBoardDeckImportLayout(options: {
  owner: BoardOwnerRef;
  boardId: string;
  /** The room's own upload path, injected so this module never imports the rail. */
  upload: typeof uploadFilesAsBoardItems;
}) {
  const register = useRegisterBoardDeckImport();
  const attach = useAttachBoardDeckImportPins();
  const [progress, setProgress] = useState<string | null>(null);
  const { owner, boardId, upload } = options;

  const layOut = useCallback(async (input: {
    deck: PreparedDeck;
    pastedLinks?: string;
    room: DeckLayoutRoom;
  }) => {
    const slideCount = input.deck.manifest.slides.length;
    setProgress(`Laying out · slide 1 of ${slideCount}`);
    try {
      return await runDeckLayout(
        {
          boardId,
          deck: input.deck,
          pastedLinks: input.pastedLinks,
          room: input.room,
          onProgress: (slide, of) => setProgress(`Laying out · slide ${slide} of ${of}`),
        },
        {
          register: (args) => register.mutateAsync(args),
          upload: ({ files, overrides, onProgress }) => upload({
            ownerId: owner.id,
            ownerKind: owner.kind,
            boardId,
            files,
            point: { x: 0, y: 0 },
            startZ: 0,
            overrides,
            onProgress: ({ index }) => onProgress(index),
          }),
          attach: (args) => attach.mutateAsync(args),
          kick: kickDeckImportResolver,
        },
      );
    } finally {
      setProgress(null);
    }
  }, [attach, boardId, owner.id, owner.kind, register, upload]);

  return { layOut, progress };
}
