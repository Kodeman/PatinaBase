'use client';

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import type {
  BoardOwnerRef,
  BoardPoint,
  EditableMoodBoardItem,
  ProjectFfeSelection,
} from '@patina/types';
import {
  createBrowserClient,
  useBoardFeedback,
  usePalettes,
  useProposal,
  useProposalCaptures,
  usePlaceProductInProjectV2,
  useProjectFFEItems,
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
import { validateBoardImageFiles } from '@/components/portal/scope-builder/board-room-controller';
import { prepareAndUploadBoardImages } from '@/lib/mood-board-assets/upload-board-assets';
import { verdictChipSpec } from '@/lib/document/verdict-chip';
import { BoardSuggestionsRail } from '@/components/portal/scope-builder/board-suggestions-rail';
import {
  BOARD_ROOM_CLIPBOARD_MIME,
  serializeBoardRoomSelection,
} from '@/components/portal/scope-builder/board-room-command-engine';

export type BoardAddSource = 'rail_click' | 'file_drop' | 'suggestion';
export type BoardAddRailTab =
  | 'project'
  | 'library'
  | 'captures'
  | 'uploads'
  | 'palettes'
  | 'scans'
  | 'feedback';

const BOARD_RAIL_TAB_KEY = 'patina:mood-board:add-rail-tab';

function projectSelectionFromRow(row: Record<string, unknown>): ProjectFfeSelection {
  const product = row.product && typeof row.product === 'object'
    ? row.product as Record<string, unknown>
    : null;
  const room = row.room && typeof row.room === 'object'
    ? row.room as Record<string, unknown>
    : null;
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    productId: typeof row.product_id === 'string' ? row.product_id : null,
    captureId: typeof row.capture_id === 'string' ? row.capture_id : null,
    projectRoomId: typeof row.project_room_id === 'string' ? row.project_room_id : null,
    name: String(row.name ?? product?.name ?? 'Untitled selection'),
    quantity: Number(row.quantity ?? 1),
    status: String(row.status ?? 'specified') as ProjectFfeSelection['status'],
    designDisposition: String(row.design_disposition ?? 'selected') as ProjectFfeSelection['designDisposition'],
    assignmentScope: String(row.assignment_scope ?? (row.project_room_id ? 'room' : 'throughout')) as ProjectFfeSelection['assignmentScope'],
    selectionThreadId: String(row.selection_thread_id ?? row.id),
    supersedesFfeItemId: typeof row.supersedes_ffe_item_id === 'string' ? row.supersedes_ffe_item_id : null,
    readinessStatus: typeof row.readiness_status === 'string' ? row.readiness_status : null,
    missingRequiredFieldCount: Number(row.missing_required_field_count ?? 0),
    latestReviewVerdict: (row.latest_review_verdict ?? null) as ProjectFfeSelection['latestReviewVerdict'],
    createdAt: String(row.created_at ?? ''),
    product: product ? {
      id: String(product.id ?? row.product_id ?? ''),
      name: String(product.name ?? row.name ?? 'Untitled selection'),
      brand: typeof product.brand === 'string' ? product.brand : null,
      images: Array.isArray(product.images) ? product.images.filter((value): value is string => typeof value === 'string') : null,
    } : null,
    room: room ? { id: String(room.id), name: String(room.name) } : null,
  };
}

export function projectSelectionToBoardItem(
  selection: ProjectFfeSelection,
  point: BoardPoint,
  zIndex: number,
): EditableMoodBoardItem {
  const imageUrl = selection.product?.images?.[0] ?? null;
  return {
    ...baseBoardItem(point, zIndex),
    type: 'product',
    width: 260,
    height: 300,
    productId: selection.productId,
    projectFfeItemId: selection.id,
    imageUrl,
    data: {
      name: selection.name,
      vendor_name: selection.product?.brand ?? null,
      image_url: imageUrl,
      assignment_scope: selection.assignmentScope,
      design_disposition: selection.designDisposition,
    },
  };
}

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

export function boardItemThumbnail(item: EditableMoodBoardItem): string | null {
  const thumbnail = item.data?.thumbnail_url;
  if (typeof thumbnail === 'string' && thumbnail.trim()) return thumbnail;
  return typeof item.imageUrl === 'string' && item.imageUrl.trim() ? item.imageUrl : null;
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
  onProgress?: Parameters<typeof prepareAndUploadBoardImages>[0]['onProgress'];
}): Promise<EditableMoodBoardItem[]> {
  const uploaded = await prepareAndUploadBoardImages({
    ownerId: options.ownerId,
    boardId: options.boardId,
    files: options.files,
    onProgress: options.onProgress,
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
          className="flex min-h-11 w-full items-center justify-between rounded-[4px] border border-[var(--border-default)] px-3 text-left text-[12px] hover:border-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)] disabled:opacity-60"
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
          className="min-h-11 min-w-11 overflow-hidden rounded-[4px] border border-[var(--border-default)] text-left hover:border-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={scan.thumbnail_url ?? ''} alt="" draggable={false} className="aspect-[4/3] w-full object-cover" />
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
            className={`min-h-11 min-w-11 rounded-full border px-2 py-1 font-mono text-[8px] uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)] ${filter === value ? 'border-[var(--color-clay)] text-[var(--color-clay)]' : 'border-[var(--border-default)] text-[var(--text-muted)]'}`}
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
                  className="flex min-h-11 w-full items-center justify-between gap-2 rounded-[4px] border border-[var(--border-default)] px-2.5 text-left hover:border-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)]"
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
  projectRoomId,
  items,
  preferenceScope,
  nextPoint,
  nextZ,
  onAddItems,
  onSelectItem,
}: {
  owner: BoardOwnerRef;
  boardId: string;
  projectRoomId?: string | null;
  items: readonly EditableMoodBoardItem[];
  /** Auth user id; keeps rail preferences isolated on shared browsers. */
  preferenceScope?: string;
  nextPoint: () => BoardPoint;
  nextZ: () => number;
  onAddItems: (items: readonly EditableMoodBoardItem[], source: BoardAddSource) => void;
  onSelectItem?: (itemId: string) => void;
}) {
  const [tab, setTab] = useState<BoardAddRailTab>('library');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [captureSearch, setCaptureSearch] = useState('');
  const [placingProductId, setPlacingProductId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: captures = [], isLoading: capturesLoading } = useProposalCaptures({ status: 'inbox' });
  const projectSelectionsQuery = useProjectFFEItems(owner.kind === 'project' ? owner.id : '');
  const placeProduct = usePlaceProductInProjectV2();
  const projectSelections = useMemo(
    () => ((projectSelectionsQuery.data ?? []) as Record<string, unknown>[])
      .filter((row) => row.removed_at == null && !['not_selected', 'superseded'].includes(String(row.design_disposition)))
      .map(projectSelectionFromRow),
    [projectSelectionsQuery.data],
  );
  const compatibleProjectSelections = useMemo(
    () => projectSelections.filter((selection) => !projectRoomId || (
      selection.assignmentScope === 'room' && selection.projectRoomId === projectRoomId
    )),
    [projectRoomId, projectSelections],
  );
  const visibleCaptures = useMemo(() => {
    const term = captureSearch.trim().toLowerCase();
    if (!term) return captures;
    return captures.filter((capture) => {
      const name = payloadString(capture.raw_payload, 'name', 'productName', 'title') ?? '';
      return `${name} ${capture.source_url}`.toLowerCase().includes(term);
    });
  }, [captureSearch, captures]);
  const uploadedImages = useMemo(
    () => items.filter((item) => item.type === 'image' && boardItemThumbnail(item)),
    [items],
  );
  const proposalId = owner.kind === 'proposal' ? owner.id : undefined;
  const tabPreferenceKey = preferenceScope
    ? `${BOARD_RAIL_TAB_KEY}:${preferenceScope}`
    : null;
  const suggestionItems = useMemo(() => suggestionRows(boardId, items), [boardId, items]);

  useEffect(() => {
    if (!tabPreferenceKey) return;
    try {
      const persisted = window.localStorage.getItem(tabPreferenceKey);
      if (
        persisted === 'project' ||
        persisted === 'library' ||
        persisted === 'captures' ||
        persisted === 'uploads' ||
        persisted === 'palettes' ||
        persisted === 'scans' ||
        persisted === 'feedback'
      ) {
        setTab(persisted === 'project' && owner.kind !== 'project' ? 'library' : persisted);
      } else {
        setTab('library');
      }
    } catch {
      // Storage is an enhancement; private browsing must not break the rail.
    }
  }, [owner.kind, tabPreferenceKey]);

  const selectTab = (next: BoardAddRailTab) => {
    setTab(next);
    if (!tabPreferenceKey) return;
    try {
      window.localStorage.setItem(tabPreferenceKey, next);
    } catch {
      // Keep the in-memory selection when storage is unavailable.
    }
  };

  const placeProjectProduct = async (
    draft: EditableMoodBoardItem,
    productId: string,
    captureId: string | null,
  ) => {
    setPlacingProductId(productId);
    setError(null);
    try {
      const response = await placeProduct.mutateAsync({
        projectId: owner.id,
        productId,
        captureId,
        assignmentScope: projectRoomId ? 'room' : 'unassigned',
        roomId: projectRoomId ?? null,
        boardId,
        disposition: 'candidate',
        duplicateMode: 'reuse',
        placement: {
          x: draft.x,
          y: draft.y,
          width: draft.width,
          sectionId: typeof draft.data?.section_id === 'string' ? draft.data.section_id : null,
        },
        idempotencyKey: `board-place:${boardId}:${draft.id}`,
      });
      if (!response.selectionId || !response.placementId) {
        throw new Error('The project placement did not return its selection identity.');
      }
      onAddItems([{
        ...draft,
        id: response.placementId,
        type: 'product',
        productId,
        captureId,
        projectFfeItemId: response.selectionId,
      }], 'rail_click');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This product could not be placed in the project.');
    } finally {
      setPlacingProductId(null);
    }
  };

  const addProduct = (result: ProductPickResult) => {
    const draft = productPickToBoardItem(result, nextPoint(), nextZ());
    if (owner.kind === 'project') {
      void placeProjectProduct(draft, result.productId, result.captureId ?? null);
      return;
    }
    onAddItems([draft], 'rail_click');
  };

  const upload = async (files: readonly File[]) => {
    if (files.length === 0) return;
    try {
      validateBoardImageFiles(files);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Choose PNG, JPEG, WebP, GIF, or AVIF images up to 20MB.');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const items = await uploadFilesAsBoardItems({
        ownerId: owner.id,
        boardId,
        files,
        point: nextPoint(),
        startZ: nextZ(),
        onProgress: ({ file, index, total, stage }) => {
          setUploadProgress(`${index + 1}/${total} · ${file.name} · ${stage}`);
        },
      });
      onAddItems(items, 'file_drop');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The image could not be uploaded.');
    } finally {
      setUploading(false);
      setUploadProgress(null);
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
        {([
          ...(owner.kind === 'project' ? ['project'] as const : []),
          'library',
          'captures',
          'uploads',
          'palettes',
          'scans',
          'feedback',
        ] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => selectTab(value)}
            className={`min-h-11 min-w-11 shrink-0 px-2 font-mono text-[8px] uppercase tracking-[0.04em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)] ${tab === value ? 'border-b-2 border-[var(--color-clay)] text-[var(--color-clay)]' : 'text-[var(--text-muted)]'}`}
          >
            {value === 'project' ? 'In project' : value}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'project' && owner.kind === 'project' && (
          <div className="space-y-2">
            <p className="text-[11px] leading-4 text-[var(--text-muted)]">
              Place an existing project selection on this board. The selection remains in the project if this placement is removed.
            </p>
            {projectSelectionsQuery.isLoading && (
              <p className="text-[11px] text-[var(--text-muted)]">Loading project selections…</p>
            )}
            {!projectSelectionsQuery.isLoading && compatibleProjectSelections.length === 0 && (
              <p className="text-[11px] text-[var(--text-muted)]">No project selections yet.</p>
            )}
            {compatibleProjectSelections.map((selection) => (
              <button
                key={selection.id}
                type="button"
                onClick={() => onAddItems([
                  projectSelectionToBoardItem(selection, nextPoint(), nextZ()),
                ], 'rail_click')}
                className="flex min-h-11 w-full items-center justify-between gap-2 rounded-[4px] border border-[var(--border-default)] px-2.5 text-left hover:border-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[11px] text-[var(--text-primary)]">
                    {selection.name}
                  </span>
                  <span className="block truncate font-mono text-[8px] uppercase text-[var(--text-muted)]">
                    {selection.room?.name ?? (selection.assignmentScope === 'unassigned' ? 'Unsorted' : 'Throughout')} · {selection.designDisposition.replace('_', ' ')}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[8px] uppercase text-[var(--color-clay)]">Place</span>
              </button>
            ))}
          </div>
        )}

        {tab === 'library' && (
          <div className="space-y-3">
            <p className="text-[11px] leading-4 text-[var(--text-muted)]">
              Search personal, studio, and catalog pieces.
            </p>
            <Button variant="secondary" size="sm" className="min-h-11 min-w-11" onClick={() => setPickerOpen(true)}>
              Browse products
            </Button>
          </div>
        )}

        {tab === 'captures' && (
          <div className="space-y-2">
            <Input
              className="h-11"
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
                  disabled={placingProductId === capture.product_id}
                  onClick={() => {
                    const draft = captureToBoardItem(capture, nextPoint(), nextZ());
                    if (owner.kind === 'project' && capture.product_id) {
                      void placeProjectProduct(draft, capture.product_id, capture.id);
                      return;
                    }
                    onAddItems([draft], 'rail_click');
                  }}
                  onDragStart={(event) => beginRailDrag(
                    event,
                    owner,
                    boardId,
                    captureToBoardItem(capture, { x: 0, y: 0 }, 0),
                  )}
                  className="flex min-h-11 w-full items-center gap-2 rounded-[4px] border border-[var(--border-default)] p-2 text-left hover:border-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[3px] bg-[var(--bg-muted)]">
                    {capture.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={capture.thumbnail_url} alt="" draggable={false} className="h-full w-full object-cover" />
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
            <Button variant="secondary" size="sm" className="min-h-11 min-w-11" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? 'Preparing images…' : 'Choose images'}
            </Button>
            {uploadProgress && <p role="status" className="text-[11px] text-[var(--text-muted)]">{uploadProgress}</p>}
            {uploadedImages.length > 0 && (
              <div className="space-y-2 border-t border-[var(--border-default)] pt-3">
                <p className="font-mono text-[8px] uppercase tracking-[0.04em] text-[var(--text-muted)]">
                  Uploaded images
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {uploadedImages.map((item, index) => {
                    const thumbnail = boardItemThumbnail(item)!;
                    const label = payloadString(item.data ?? {}, 'name', 'title') ?? `Upload ${index + 1}`;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        draggable
                        title={label}
                        onClick={() => {
                          const point = nextPoint();
                          onAddItems([{
                            ...item,
                            id: newItemId(),
                            x: point.x,
                            y: point.y,
                            zIndex: nextZ(),
                            locked: false,
                            data: item.data ? { ...item.data } : {},
                          }], 'rail_click');
                        }}
                        onDragStart={(event) => beginRailDrag(event, owner, boardId, {
                          ...item,
                          x: 0,
                          y: 0,
                          zIndex: 0,
                        })}
                        className="min-h-11 min-w-11 overflow-hidden rounded-[4px] border border-[var(--border-default)] text-left hover:border-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={thumbnail} alt="" draggable={false} className="aspect-[4/3] w-full object-cover" />
                        <span className="block truncate px-2 py-1.5 text-[10px]">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
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
        <Button variant="ghost" size="sm" className="min-h-11 min-w-11" onClick={addNote}>+ Note</Button>
        {error && <p role="alert" className="mt-2 text-[11px] text-[var(--color-clay)]">{error}</p>}
      </div>

      <ProductPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={addProduct}
        scope="library"
        // A board pin is an image on a surface, not a line anyone orders —
        // keep the one-click grammar and never interrupt it to configure.
        configureStep={false}
      />
    </div>
  );
}
