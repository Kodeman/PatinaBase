'use client';

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import type { BoardOwnerRef, BoardPoint, EditableMoodBoardItem } from '@patina/types';
import {
  createBrowserClient,
  useBoardFeedback,
  usePalettes,
  useProposal,
  useProposalCaptures,
  useRoomScans,
  type AddBoardItemInput,
  type ItemFeedback,
  type ProposalBoardItem,
  type ProposalCapture,
  type ProposalPalette,
  type RoomScan,
} from '@patina/supabase';
import { Button, Input } from '@/components/ui/controls';
import {
  ProductPickerModal,
  type ProductPickResult,
} from '@/components/portal/proposals/product-picker-modal';
import { prepareAndUploadBoardImages } from '@/lib/mood-board-assets/upload-board-assets';
import { verdictChipSpec } from '@/lib/document/verdict-chip';
import { BoardSuggestionsRail } from '@/components/portal/scope-builder/board-suggestions-rail';
import {
  BOARD_ROOM_CLIPBOARD_MIME,
  serializeBoardRoomSelection,
} from '@/components/portal/scope-builder/board-room-command-engine';

export type BoardAddSource = 'rail_click' | 'file_drop' | 'suggestion';
export type BoardAddRailTab =
  | 'library'
  | 'captures'
  | 'uploads'
  | 'palettes'
  | 'scans'
  | 'feedback';

const BOARD_RAIL_TAB_KEY = 'patina:mood-board:add-rail-tab';

function beginRailDrag(
  event: DragEvent<HTMLElement>,
  owner: BoardOwnerRef,
  boardId: string,
  item: EditableMoodBoardItem,
) {
  const envelope = serializeBoardRoomSelection({
    boardId,
    owner,
    name: 'Board rail item',
    canvasWidth: Math.max(1, item.width),
    canvasHeight: Math.max(1, item.height ?? item.width),
    backgroundColor: '#FAF8F5',
    sections: [],
    items: [item],
  }, [item.id]);
  if (!envelope) return;
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData(BOARD_ROOM_CLIPBOARD_MIME, envelope);
  event.dataTransfer.setData('text/plain', envelope);
}

function newItemId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `board-item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function payloadString(payload: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function captureToBoardItem(
  capture: ProposalCapture,
  point: BoardPoint,
  zIndex: number,
): EditableMoodBoardItem {
  const name = payloadString(capture.raw_payload, 'name', 'productName', 'title') ?? 'Untitled capture';
  const vendor = payloadString(capture.raw_payload, 'vendor_name', 'vendorName', 'brand');
  return {
    id: newItemId(),
    type: 'capture',
    x: point.x,
    y: point.y,
    width: 260,
    height: 300,
    zIndex,
    rotation: 0,
    locked: false,
    productId: capture.product_id,
    captureId: capture.id,
    paletteId: null,
    imageUrl: capture.thumbnail_url,
    content: null,
    data: {
      ...capture.raw_payload,
      name,
      vendor_name: vendor,
      image_url: capture.thumbnail_url,
      source_url: capture.source_url,
    },
  };
}

export function productPickToBoardItem(
  result: ProductPickResult,
  point: BoardPoint,
  zIndex: number,
): EditableMoodBoardItem {
  return {
    id: newItemId(),
    type: result.captureId ? 'capture' : 'product',
    x: point.x,
    y: point.y,
    width: 260,
    height: 300,
    zIndex,
    rotation: 0,
    locked: false,
    productId: result.productId,
    captureId: result.captureId ?? null,
    paletteId: null,
    imageUrl: result.imageUrl,
    content: null,
    data: {
      name: result.name,
      price_cents: result.priceCents,
      vendor_name: result.vendorName,
      image_url: result.imageUrl,
    },
  };
}

export async function uploadFilesAsBoardItems(options: {
  ownerId: string;
  boardId: string;
  files: readonly File[];
  point: BoardPoint;
  startZ: number;
}): Promise<EditableMoodBoardItem[]> {
  const uploaded = await prepareAndUploadBoardImages({
    ownerId: options.ownerId,
    boardId: options.boardId,
    files: options.files,
  });
  return uploaded.map((asset, index) => {
    const width = 280;
    const height = Math.max(120, Math.round(width / asset.aspectRatio));
    return {
      id: asset.assetId,
      type: 'image' as const,
      x: options.point.x + index * (width + 24),
      y: options.point.y,
      width,
      height,
      zIndex: options.startZ + index,
      rotation: 0,
      locked: false,
      productId: null,
      captureId: null,
      paletteId: null,
      imageUrl: asset.image_url,
      content: null,
      data: {
        image_url: asset.image_url,
        thumbnail_url: asset.data.thumbnail_url,
        resolved_height: height,
      },
    };
  });
}

function baseBoardItem(
  point: BoardPoint,
  zIndex: number,
): Pick<
  EditableMoodBoardItem,
  | 'id'
  | 'x'
  | 'y'
  | 'zIndex'
  | 'rotation'
  | 'locked'
  | 'productId'
  | 'captureId'
  | 'paletteId'
  | 'imageUrl'
  | 'content'
> {
  return {
    id: newItemId(),
    x: point.x,
    y: point.y,
    zIndex,
    rotation: 0,
    locked: false,
    productId: null,
    captureId: null,
    paletteId: null,
    imageUrl: null,
    content: null,
  };
}

function suggestionToBoardItem(
  input: Omit<AddBoardItemInput, 'boardId' | 'x' | 'y' | 'zIndex'>,
  point: BoardPoint,
  zIndex: number,
): EditableMoodBoardItem {
  return {
    ...baseBoardItem(point, zIndex),
    type: input.type,
    width: input.width ?? 260,
    height: input.height ?? (input.type === 'note' ? 160 : 300),
    productId: input.productId ?? null,
    captureId: input.captureId ?? null,
    paletteId: input.paletteId ?? null,
    imageUrl: input.imageUrl ?? null,
    content: input.content ?? null,
    data: input.data ?? {},
  };
}

function suggestionRows(
  boardId: string,
  items: readonly EditableMoodBoardItem[],
): ProposalBoardItem[] {
  const now = new Date(0).toISOString();
  return items.map((item) => ({
    id: item.id,
    board_id: boardId,
    type: item.type,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height ?? null,
    z_index: item.zIndex ?? 0,
    rotation: item.rotation ?? 0,
    locked: item.locked ?? false,
    product_id: item.productId ?? null,
    capture_id: item.captureId ?? null,
    palette_id: item.paletteId ?? null,
    image_url: item.imageUrl ?? null,
    content: item.content ?? null,
    data: item.data ?? {},
    created_at: now,
    updated_at: now,
  }));
}

function PalettePanel({
  proposalId,
  owner,
  boardId,
  nextPoint,
  nextZ,
  onAddItems,
}: {
  proposalId?: string;
  owner: BoardOwnerRef;
  boardId: string;
  nextPoint: () => BoardPoint;
  nextZ: () => number;
  onAddItems: (items: readonly EditableMoodBoardItem[], source: BoardAddSource) => void;
}) {
  const { data: palettes = [], isLoading } = usePalettes(proposalId);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [swatchesByPalette, setSwatchesByPalette] = useState(
    () => new Map<string, Array<{ hex: string; role: string | null; name: string | null }>>(),
  );

  useEffect(() => {
    if (palettes.length === 0) {
      setSwatchesByPalette((current) => current.size === 0 ? current : new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createBrowserClient() as any;
      const { data, error: readError } = await supabase
        .from('palette_swatches')
        .select('palette_id, hex, role, name, sort_order, created_at')
        .in('palette_id', palettes.map((palette) => palette.id))
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (readError) {
        setError(readError.message ?? 'Palette colors could not be loaded.');
        return;
      }
      const next = new Map<string, Array<{ hex: string; role: string | null; name: string | null }>>();
      for (const palette of palettes) next.set(palette.id, []);
      for (const swatch of data ?? []) {
        const list = next.get(swatch.palette_id);
        if (list) list.push({ hex: swatch.hex, role: swatch.role, name: swatch.name });
      }
      setSwatchesByPalette(next);
    })();
    return () => { cancelled = true; };
  }, [palettes]);

  const addPalette = async (palette: ProposalPalette) => {
    setAddingId(palette.id);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let swatches = swatchesByPalette.get(palette.id);
      if (!swatches) {
        const supabase = createBrowserClient() as any;
        const { data, error: readError } = await supabase
          .from('palette_swatches')
          .select('hex, role, name')
          .eq('palette_id', palette.id)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true });
        if (readError) throw readError;
        swatches = data ?? [];
      }
      const point = nextPoint();
      onAddItems([
        {
          ...baseBoardItem(point, nextZ()),
          type: 'palette',
          width: 320,
          height: 120,
          paletteId: palette.id,
          data: { name: palette.name, swatches },
        },
      ], 'rail_click');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The palette could not be added.');
    } finally {
      setAddingId(null);
    }
  };

  if (!proposalId) {
    return <p className="text-[11px] text-[var(--text-muted)]">Palettes stay with proposal boards.</p>;
  }
  if (isLoading) return <p className="text-[11px] text-[var(--text-muted)]">Loading palettes…</p>;
  if (palettes.length === 0) {
    return <p className="text-[11px] text-[var(--text-muted)]">No proposal palettes yet.</p>;
  }
  return (
    <div className="space-y-2">
      {palettes.map((palette) => (
        <button
          key={palette.id}
          type="button"
          draggable={swatchesByPalette.has(palette.id)}
          disabled={addingId === palette.id}
          onClick={() => void addPalette(palette)}
          onDragStart={(event) => beginRailDrag(event, owner, boardId, {
            ...baseBoardItem({ x: 0, y: 0 }, 0),
            type: 'palette',
            width: 320,
            height: 120,
            paletteId: palette.id,
            data: { name: palette.name, swatches: swatchesByPalette.get(palette.id) ?? [] },
          })}
          className="flex min-h-11 w-full items-center justify-between rounded-[4px] border border-[var(--border-default)] px-3 text-left text-[12px] hover:border-[var(--color-clay)] disabled:opacity-60"
        >
          <span className="truncate">{palette.name}</span>
          <span className="font-mono text-[9px] uppercase text-[var(--text-muted)]">
            {addingId === palette.id ? 'Adding…' : 'Add'}
          </span>
        </button>
      ))}
      {error && <p role="alert" className="text-[11px] text-[var(--color-clay)]">{error}</p>}
    </div>
  );
}

function ScansList({
  filters,
  owner,
  boardId,
  nextPoint,
  nextZ,
  onAddItems,
}: {
  filters: { userId?: string; projectId?: string; status: 'ready' };
  owner: BoardOwnerRef;
  boardId: string;
  nextPoint: () => BoardPoint;
  nextZ: () => number;
  onAddItems: (items: readonly EditableMoodBoardItem[], source: BoardAddSource) => void;
}) {
  const { data: scans = [], isLoading, isError } = useRoomScans(filters);
  const visible = (scans as RoomScan[]).filter((scan) => Boolean(scan.thumbnail_url));
  if (isLoading) return <p className="text-[11px] text-[var(--text-muted)]">Loading scans…</p>;
  if (isError || visible.length === 0) {
    return <p className="text-[11px] text-[var(--text-muted)]">No ready room scans.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {visible.map((scan) => (
        <button
          key={scan.id}
          type="button"
          draggable
          title={scan.name}
          onDragStart={(event) => beginRailDrag(event, owner, boardId, {
            ...baseBoardItem({ x: 0, y: 0 }, 0),
            type: 'room_scan',
            width: 280,
            height: 220,
            imageUrl: scan.thumbnail_url,
            data: {
              name: scan.name,
              room_type: scan.room_type,
              thumbnail_url: scan.thumbnail_url,
            },
          })}
          onClick={() => {
            const point = nextPoint();
            onAddItems([
              {
                ...baseBoardItem(point, nextZ()),
                type: 'room_scan',
                width: 280,
                height: 220,
                imageUrl: scan.thumbnail_url,
                data: {
                  name: scan.name,
                  room_type: scan.room_type,
                  thumbnail_url: scan.thumbnail_url,
                },
              },
            ], 'rail_click');
          }}
          className="overflow-hidden rounded-[4px] border border-[var(--border-default)] text-left hover:border-[var(--color-clay)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={scan.thumbnail_url ?? ''} alt="" className="aspect-[4/3] w-full object-cover" />
          <span className="block truncate px-2 py-1.5 text-[10px]">{scan.name}</span>
        </button>
      ))}
    </div>
  );
}

function ProposalScansPanel({
  proposalId,
  ...props
}: {
  proposalId: string;
  owner: BoardOwnerRef;
  boardId: string;
  nextPoint: () => BoardPoint;
  nextZ: () => number;
  onAddItems: (items: readonly EditableMoodBoardItem[], source: BoardAddSource) => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: proposal, isLoading } = useProposal(proposalId) as { data: any; isLoading: boolean };
  if (isLoading) return <p className="text-[11px] text-[var(--text-muted)]">Loading scans…</p>;
  const clientUserId = typeof proposal?.client_id === 'string' ? proposal.client_id : null;
  if (!clientUserId) {
    return <p className="text-[11px] text-[var(--text-muted)]">Link a client to see their room scans.</p>;
  }
  return <ScansList filters={{ userId: clientUserId, status: 'ready' }} {...props} />;
}

function FeedbackPanel({
  proposalId,
  boardId,
  items,
  onSelectItem,
}: {
  proposalId?: string;
  boardId: string;
  items: readonly EditableMoodBoardItem[];
  onSelectItem?: (itemId: string) => void;
}) {
  const { data: feedback = [], isLoading } = useBoardFeedback(proposalId);
  const [filter, setFilter] = useState<'all' | 'approved' | 'rejected' | 'comment' | 'none'>('all');
  const latest = useMemo(() => {
    const rows = new Map<string, ItemFeedback>();
    for (const entry of feedback) {
      if (entry.board_item_id) rows.set(entry.board_item_id, entry);
    }
    return rows;
  }, [feedback]);
  const boardItems = items.filter((item) => {
    const verdict = latest.get(item.id)?.verdict;
    if (filter === 'all') return true;
    if (filter === 'none') return !verdict;
    return verdict === filter;
  });
  if (!proposalId) {
    return <p className="text-[11px] text-[var(--text-muted)]">Client verdicts stay with proposal boards.</p>;
  }
  return (
    <div className="space-y-3" data-board-feedback-filter={boardId}>
      <div className="flex flex-wrap gap-1">
        {(['all', 'approved', 'rejected', 'comment', 'none'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`rounded-full border px-2 py-1 font-mono text-[8px] uppercase ${filter === value ? 'border-[var(--color-clay)] text-[var(--color-clay)]' : 'border-[var(--border-default)] text-[var(--text-muted)]'}`}
          >
            {value === 'rejected' ? 'flagged' : value === 'comment' ? 'noted' : value === 'none' ? 'no verdict' : value}
          </button>
        ))}
      </div>
      {isLoading ? (
        <p className="text-[11px] text-[var(--text-muted)]">Loading feedback…</p>
      ) : boardItems.length === 0 ? (
        <p className="text-[11px] text-[var(--text-muted)]">No pins match this filter.</p>
      ) : (
        <ul className="space-y-1.5">
          {boardItems.map((item, index) => {
            const row = latest.get(item.id);
            const chip = verdictChipSpec(row?.verdict, row?.resolved_at);
            const label = payloadString(item.data ?? {}, 'name', 'title') ?? item.content ?? `${item.type} ${index + 1}`;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelectItem?.(item.id)}
                  className="flex min-h-10 w-full items-center justify-between gap-2 rounded-[4px] border border-[var(--border-default)] px-2.5 text-left hover:border-[var(--color-clay)]"
                >
                  <span className="truncate text-[11px]">{label}</span>
                  <span className="shrink-0 font-mono text-[8px] uppercase" style={{ color: chip?.color ?? 'var(--text-muted)' }}>
                    {chip?.label ?? 'No verdict'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function BoardAddRail({
  owner,
  boardId,
  items,
  nextPoint,
  nextZ,
  onAddItems,
  onSelectItem,
}: {
  owner: BoardOwnerRef;
  boardId: string;
  items: readonly EditableMoodBoardItem[];
  nextPoint: () => BoardPoint;
  nextZ: () => number;
  onAddItems: (items: readonly EditableMoodBoardItem[], source: BoardAddSource) => void;
  onSelectItem?: (itemId: string) => void;
}) {
  const [tab, setTab] = useState<BoardAddRailTab>('library');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captureSearch, setCaptureSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: captures = [], isLoading: capturesLoading } = useProposalCaptures({ status: 'inbox' });
  const visibleCaptures = useMemo(() => {
    const term = captureSearch.trim().toLowerCase();
    if (!term) return captures;
    return captures.filter((capture) => {
      const name = payloadString(capture.raw_payload, 'name', 'productName', 'title') ?? '';
      return `${name} ${capture.source_url}`.toLowerCase().includes(term);
    });
  }, [captureSearch, captures]);
  const proposalId = owner.kind === 'proposal' ? owner.id : undefined;
  const suggestionItems = useMemo(() => suggestionRows(boardId, items), [boardId, items]);

  useEffect(() => {
    try {
      const persisted = window.localStorage.getItem(BOARD_RAIL_TAB_KEY);
      if (
        persisted === 'library' ||
        persisted === 'captures' ||
        persisted === 'uploads' ||
        persisted === 'palettes' ||
        persisted === 'scans' ||
        persisted === 'feedback'
      ) {
        setTab(persisted);
      }
    } catch {
      // Storage is an enhancement; private browsing must not break the rail.
    }
  }, []);

  const selectTab = (next: BoardAddRailTab) => {
    setTab(next);
    try {
      window.localStorage.setItem(BOARD_RAIL_TAB_KEY, next);
    } catch {
      // Keep the in-memory selection when storage is unavailable.
    }
  };

  const addProduct = (result: ProductPickResult) => {
    onAddItems([productPickToBoardItem(result, nextPoint(), nextZ())], 'rail_click');
  };

  const upload = async (files: readonly File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const items = await uploadFilesAsBoardItems({
        ownerId: owner.id,
        boardId,
        files,
        point: nextPoint(),
        startZ: nextZ(),
      });
      onAddItems(items, 'file_drop');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The image could not be uploaded.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const addNote = () => {
    const point = nextPoint();
    onAddItems([
      {
        id: newItemId(),
        type: 'note',
        x: point.x,
        y: point.y,
        width: 240,
        height: 160,
        zIndex: nextZ(),
        rotation: 0,
        locked: false,
        productId: null,
        captureId: null,
        paletteId: null,
        imageUrl: null,
        content: 'New note',
        data: {},
      },
    ], 'rail_click');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label="Board sources" className="flex shrink-0 overflow-x-auto border-b border-[var(--border-default)]">
        {(['library', 'captures', 'uploads', 'palettes', 'scans', 'feedback'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => selectTab(value)}
            className={`min-h-11 shrink-0 px-2 font-mono text-[8px] uppercase tracking-[0.04em] ${tab === value ? 'border-b-2 border-[var(--color-clay)] text-[var(--color-clay)]' : 'text-[var(--text-muted)]'}`}
          >
            {value}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'library' && (
          <div className="space-y-3">
            <p className="text-[11px] leading-4 text-[var(--text-muted)]">
              Search personal, studio, and catalog pieces.
            </p>
            <Button variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>
              Browse products
            </Button>
          </div>
        )}

        {tab === 'captures' && (
          <div className="space-y-2">
            <Input
              value={captureSearch}
              onChange={(event) => setCaptureSearch(event.target.value)}
              aria-label="Search captures"
              placeholder="Search captures"
            />
            {capturesLoading && <p className="text-[11px] text-[var(--text-muted)]">Loading captures…</p>}
            {!capturesLoading && visibleCaptures.length === 0 && (
              <p className="text-[11px] leading-4 text-[var(--text-muted)]">
                {captureSearch ? 'No captures match.' : 'Captures from the Patina extension appear here.'}
              </p>
            )}
            {visibleCaptures.map((capture) => {
              const name = payloadString(capture.raw_payload, 'name', 'productName', 'title') ?? 'Untitled capture';
              return (
                <button
                  key={capture.id}
                  type="button"
                  draggable
                  onClick={() => onAddItems([captureToBoardItem(capture, nextPoint(), nextZ())], 'rail_click')}
                  onDragStart={(event) => beginRailDrag(
                    event,
                    owner,
                    boardId,
                    captureToBoardItem(capture, { x: 0, y: 0 }, 0),
                  )}
                  className="flex w-full items-center gap-2 rounded-[4px] border border-[var(--border-default)] p-2 text-left hover:border-[var(--color-clay)]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[3px] bg-[var(--bg-muted)]">
                    {capture.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={capture.thumbnail_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span aria-hidden className="font-heading text-sm italic text-[var(--text-muted)]">C</span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] text-[var(--text-primary)]">{name}</span>
                    <span className="block truncate font-mono text-[9px] text-[var(--text-muted)]">
                      {(() => { try { return new URL(capture.source_url).hostname.replace(/^www\./, ''); } catch { return 'capture'; } })()}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {tab === 'uploads' && (
          <div className="space-y-3">
            <p className="text-[11px] leading-4 text-[var(--text-muted)]">
              Images are resized before upload; originals never leave the browser.
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(event) => void upload(Array.from(event.target.files ?? []))}
            />
            <Button variant="secondary" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? 'Preparing images…' : 'Choose images'}
            </Button>
          </div>
        )}

        {tab === 'palettes' && (
          <PalettePanel
            proposalId={proposalId}
            owner={owner}
            boardId={boardId}
            nextPoint={nextPoint}
            nextZ={nextZ}
            onAddItems={onAddItems}
          />
        )}

        {tab === 'scans' && (
          owner.kind === 'proposal' ? (
            <ProposalScansPanel
              proposalId={owner.id}
              owner={owner}
              boardId={boardId}
              nextPoint={nextPoint}
              nextZ={nextZ}
              onAddItems={onAddItems}
            />
          ) : (
            <ScansList
              filters={{ projectId: owner.id, status: 'ready' }}
              owner={owner}
              boardId={boardId}
              nextPoint={nextPoint}
              nextZ={nextZ}
              onAddItems={onAddItems}
            />
          )
        )}

        {tab === 'feedback' && (
          <FeedbackPanel
            proposalId={proposalId}
            boardId={boardId}
            items={items}
            onSelectItem={onSelectItem}
          />
        )}
      </div>

      <div className="space-y-2 border-t border-[var(--border-default)] p-3">
        <BoardSuggestionsRail
          items={suggestionItems}
          onAdd={(input) =>
            onAddItems(
              [suggestionToBoardItem(input, nextPoint(), nextZ())],
              'suggestion',
            )
          }
        />
        <Button variant="ghost" size="sm" onClick={addNote}>+ Note</Button>
        {error && <p role="alert" className="mt-2 text-[11px] text-[var(--color-clay)]">{error}</p>}
      </div>

      <ProductPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={addProduct}
        scope="library"
      />
    </div>
  );
}
