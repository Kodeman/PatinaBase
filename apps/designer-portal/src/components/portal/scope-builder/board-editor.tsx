'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BoardCanvas,
  BoardComposition,
  ImagePaletteExtractor,
  type BoardItem,
  type BoardsBlockItem,
  type BoardMode,
  type BoardSection as CanvasBoardSection,
  type ExtractedSwatch,
} from '@patina/design-system';
import { Button, IconButton, Input, Select, Textarea } from '@/components/ui/controls';
import {
  createBrowserClient,
  useBoard,
  useAddBoardItem,
  useUpdateBoardItem,
  useDeleteBoardItem,
  useSaveBoardLayout,
  useUpsertBoard,
  usePalettes,
  useUpsertPalette,
  useUpsertSwatch,
  useProposal,
  useRoomScans,
  useBoardFeedback,
  useProductPrices,
  useProposalScheduleItems,
  useAddProposalItem,
  type ProposalBoardItem,
  type BoardLayoutPosition,
  type AddBoardItemInput,
  type BoardSection,
  type ProposalPalette,
  type RoomScan,
  type ItemFeedback,
} from '@patina/supabase';
import { useBufferedAutosave } from '@/hooks/use-buffered-autosave';
import { runProposalAutosaveAction } from '@/lib/proposal-autosave-registry';
import {
  ProductPickerModal,
  type ProductPickResult,
} from '../proposals/product-picker-modal';
import { verdictChipSpec } from '@/lib/document/verdict-chip';
import {
  buildSendToScheduleArgs,
  computeBoardDrift,
  findScheduleTwin,
  type PinScheduleSnapshot,
  type ScheduleLineRef,
} from '@/lib/scope/board-schedule';
import { renderBoardItem } from './board-item-renderer';
import { BoardSuggestionsRail } from './board-suggestions-rail';
import {
  addSection,
  arrangeBoardItems,
  deleteSection,
  moveSection,
  renameSection,
  sectionBounds,
  type ArrangeItem,
} from './board-arrange';

type ViewMode = 'edit' | 'presentation' | 'detail';

// Snap grid spacing (px) — matches BoardCanvas's default gridSize.
const SNAP_GRID = 20;

// Debounced layout autosave interval — mirrors the blur/600ms idiom used by
// the palette swatch editor.
const LAYOUT_FLUSH_MS = 600;

type BoardLayoutPatch = Record<string, BoardLayoutPosition>;

function layoutPosition(item: ProposalBoardItem): BoardLayoutPosition {
  return {
    id: item.id,
    board_id: item.board_id,
    type: item.type,
    x: Number(item.x),
    y: Number(item.y),
    z_index: item.z_index,
    rotation: Number(item.rotation),
  };
}

// Default footprint per item type when dropped onto the canvas.
const DEFAULT_SIZE: Record<string, { width: number; height: number | null }> = {
  product: { width: 220, height: null },
  capture: { width: 220, height: null },
  image: { width: 280, height: null },
  palette: { width: 320, height: 120 },
  note: { width: 200, height: 150 },
  room_scan: { width: 260, height: 210 },
};

const WIDTH_PRESETS: Array<{ label: string; width: number }> = [
  { label: 'S', width: 160 },
  { label: 'M', width: 240 },
  { label: 'L', width: 360 },
];

interface BoardEditorProps {
  /** Owner — EXACTLY ONE (B8). proposalId for a proposal board; projectId for a
   *  live project-owned board (00272). Proposal-only affordances (palettes, room
   *  scans, send-to-schedule, client verdicts) hide in project mode. */
  proposalId?: string;
  projectId?: string;
  boardId: string;
  /** Locks pointer-driven edits while a parent board action is in flight. */
  actionPending?: boolean;
}

/**
 * Freeform mood-board editor: BoardCanvas center + add/inspector sidebar.
 *
 * Persistence model:
 *  - Drag/rotate/restack edits land in local state, are marked dirty, and
 *    flush through useSaveBoardLayout on a 600ms debounce.
 *  - Structural ops (add/delete/resize/lock/content/cover) cross the
 *    proposal-wide autosave barrier first. A failed barrier aborts the
 *    mutation and stays visible instead of racing a stale layout upsert.
 *  - Server data only overwrites local state when nothing is dirty, so an
 *    in-flight refetch never clobbers a drag in progress.
 *
 * The layout buffer is generation-keyed by boardId, so switching boards drains
 * and unregisters the previous board even if a parent forgets to remount it.
 */
export function BoardEditor({ proposalId, projectId, boardId, actionPending = false }: BoardEditorProps) {
  const isProject = !!projectId;
  // First path segment for board-image uploads (00131 for proposals; 00272 leg
  // for projects). One of the two is always set.
  const ownerId = (projectId ?? proposalId)!;

  const { data: board } = useBoard(boardId);

  const addItem = useAddBoardItem();
  const updateItem = useUpdateBoardItem();
  const deleteItem = useDeleteBoardItem();
  const { mutateAsync: saveLayoutAsync } = useSaveBoardLayout();
  const upsertBoard = useUpsertBoard();

  // B4/B5 — proposal boards only. Board-pin verdicts (read-only chips), live
  // product prices for the drift badge, and the schedule for twin detection.
  const { data: pinVerdicts = [] } = useBoardFeedback(isProject ? undefined : proposalId);
  const { data: scheduleItems = [] } = useProposalScheduleItems(
    isProject ? undefined : proposalId,
  );

  const [items, setItems] = useState<ProposalBoardItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [snap, setSnap] = useState(false);
  const [structuralPending, setStructuralPending] = useState(false);
  const [structuralError, setStructuralError] = useState<string | null>(null);
  // Local mirror of board.sections so section edits feel instant; write-through
  // to the board row happens in persistSections.
  const [sections, setSections] = useState<BoardSection[]>([]);

  const itemsRef = useRef<ProposalBoardItem[]>(items);
  itemsRef.current = items;
  const parentActionPendingRef = useRef(actionPending);
  parentActionPendingRef.current = actionPending;
  const structuralPendingRef = useRef(false);
  const retiredLayoutItemIdsRef = useRef(new Set<string>());

  useEffect(() => {
    setStructuralError(null);
  }, [boardId, ownerId]);

  const runStructuralMutation = useCallback(
    async (failureMessage: string, mutation: () => Promise<void>): Promise<boolean> => {
      if (parentActionPendingRef.current || structuralPendingRef.current) return false;
      structuralPendingRef.current = true;
      setStructuralPending(true);
      setStructuralError(null);
      try {
        await runProposalAutosaveAction(ownerId, mutation);
        return true;
      } catch (error) {
        const detail = error instanceof Error ? ` ${error.message}` : '';
        setStructuralError(`${failureMessage} Nothing was changed.${detail}`);
        return false;
      } finally {
        structuralPendingRef.current = false;
        setStructuralPending(false);
      }
    },
    [ownerId],
  );

  // ── B4/B5 derivations (product/capture pins) ────────────────────────────────

  // One batched price query for every linked product on the board (no N+1).
  const pinProductIds = useMemo(
    () => items.filter((it) => it.product_id).map((it) => it.product_id as string),
    [items],
  );
  const { data: productPrices } = useProductPrices(pinProductIds);

  // board_item_id → latest verdict (rows are ascending, so last write wins).
  const verdictByItem = useMemo(() => {
    const m = new Map<string, ItemFeedback>();
    for (const v of pinVerdicts) if (v.board_item_id) m.set(v.board_item_id, v);
    return m;
  }, [pinVerdicts]);

  // board_item_id → "the linked product's live price ≠ the pin's snapshot".
  const driftByItem = useMemo(() => {
    const priceById = new Map<string, number | null>();
    if (productPrices) for (const [id, p] of productPrices) priceById.set(id, p.price_retail);
    return computeBoardDrift(
      items.map((it) => ({
        id: it.id,
        product_id: it.product_id,
        snapshotPriceCents: (it.data as { price_cents?: number } | null)?.price_cents ?? null,
      })),
      priceById,
    );
  }, [items, productPrices]);

  // board_item_id → the snapshot a schedule line would be seeded from (B5).
  const pinSnapshotByItem = useMemo(() => {
    const m = new Map<string, PinScheduleSnapshot>();
    for (const it of items) {
      const d = (it.data ?? {}) as { name?: string; price_cents?: number; image_url?: string };
      m.set(it.id, {
        type: it.type,
        productId: it.product_id,
        name: d.name ?? null,
        imageUrl: it.image_url ?? d.image_url ?? null,
        priceCents: typeof d.price_cents === 'number' ? d.price_cents : null,
      });
    }
    return m;
  }, [items]);

  // ── Layout autosave ─────────────────────────────────────────────────────────

  const {
    queue: queueLayoutPatch,
    state: layoutAutosaveState,
  } = useBufferedAutosave<string, BoardLayoutPatch>({
    // Project boards never share a SendSheet, but still use their owner id to
    // isolate this editor's buffer and retain lossless unmount behavior.
    proposalId: ownerId,
    generationKey: boardId,
    delay: LAYOUT_FLUSH_MS,
    save: useCallback(
      async (targetBoardId, positionsById) => {
        const positions = Object.values(positionsById).filter(
          (position) => !retiredLayoutItemIdsRef.current.has(position.id),
        );
        if (positions.length === 0) return;
        // mutateAsync is load-bearing: the registry remains in-flight until
        // persistence and central client-copy invalidations have settled.
        await saveLayoutAsync({
          boardId: targetBoardId,
          proposalId,
          positions,
        });
      },
      [proposalId, saveLayoutAsync],
    ),
  });

  const queueLayout = useCallback(
    (changedItems: ProposalBoardItem[]) => {
      if (parentActionPendingRef.current || structuralPendingRef.current) return;
      const activeItems = changedItems.filter(
        (item) => !retiredLayoutItemIdsRef.current.has(item.id),
      );
      if (activeItems.length === 0) return;
      const patch: BoardLayoutPatch = {};
      for (const item of activeItems) {
        patch[item.id] = layoutPosition(item);
      }
      queueLayoutPatch(boardId, patch);
    },
    [boardId, queueLayoutPatch],
  );

  const layoutAutosaveBlocksSyncRef = useRef(false);
  layoutAutosaveBlocksSyncRef.current =
    layoutAutosaveState === 'dirty' ||
    layoutAutosaveState === 'saving' ||
    layoutAutosaveState === 'error';

  // ── Server → local sync ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!board) return;
    // Don't clobber unsaved local moves; the post-flush invalidation will
    // bring us back here once dirty drains.
    if (layoutAutosaveBlocksSyncRef.current) return;
    setItems(board.items);
  }, [board]);

  // Mirror the board's persisted sections. Sections change through
  // persistSections (which sets local state first), so re-syncing from a
  // refetch just confirms the same value.
  useEffect(() => {
    setSections(board?.sections ?? []);
  }, [board?.sections]);

  // ── Local mutation helpers ──────────────────────────────────────────────────

  /** Optimistically merge field updates into local state. */
  const mergeLocal = useCallback((itemId: string, patch: Partial<ProposalBoardItem>) => {
    const next = itemsRef.current.map((item) =>
      item.id === itemId ? { ...item, ...patch } : item,
    );
    itemsRef.current = next;
    setItems(next);
  }, []);

  /** Merge a layout field and synchronously register its persisted snapshot. */
  const mergeLocalLayout = useCallback(
    (itemId: string, patch: Partial<ProposalBoardItem>) => {
      if (
        parentActionPendingRef.current ||
        structuralPendingRef.current ||
        retiredLayoutItemIdsRef.current.has(itemId)
      ) {
        return;
      }
      let changedItem: ProposalBoardItem | null = null;
      const next = itemsRef.current.map((item) => {
        if (item.id !== itemId) return item;
        changedItem = { ...item, ...patch };
        return changedItem;
      });
      if (!changedItem) return;
      itemsRef.current = next;
      setItems(next);
      queueLayout([changedItem]);
    },
    [queueLayout],
  );

  /** Immediate field mutation after the proposal-wide layout barrier. */
  const commitField = useCallback(
    (itemId: string, patch: Partial<ProposalBoardItem>) => {
      void runStructuralMutation('The item could not be updated.', async () => {
        await updateItem.mutateAsync({
          itemId,
          boardId,
          proposalId,
          ...(patch.width !== undefined ? { width: Number(patch.width) } : {}),
          ...(patch.height !== undefined
            ? { height: patch.height === null ? null : Number(patch.height) }
            : {}),
          ...(patch.locked !== undefined ? { locked: patch.locked } : {}),
          ...(patch.content !== undefined ? { content: patch.content } : {}),
          ...(patch.z_index !== undefined ? { zIndex: patch.z_index } : {}),
          ...(patch.rotation !== undefined ? { rotation: Number(patch.rotation) } : {}),
        });
        mergeLocal(itemId, patch);
      });
    },
    [boardId, mergeLocal, proposalId, runStructuralMutation, updateItem],
  );

  const nextZ = useCallback(
    () => itemsRef.current.reduce((max, i) => Math.max(max, i.z_index), 0) + 1,
    [],
  );

  /**
   * Add an item near the canvas center, cascading each new item 32px
   * down-right (keyed on item count) so a large new item can never land
   * exactly on top of — and fully hide — an existing one.
   */
  const addItemToBoard = useCallback(
    (input: Omit<AddBoardItemInput, 'boardId' | 'x' | 'y' | 'zIndex'>) => {
      if (!board) return;
      void runStructuralMutation('The item could not be added.', async () => {
        const size = DEFAULT_SIZE[input.type] ?? { width: 240, height: null };
        const cascade = (itemsRef.current.length % 8) * 32;
        const x = Math.min(
          Math.max(0, board.canvas_width / 2 - size.width / 2 + cascade),
          Math.max(0, board.canvas_width - size.width),
        );
        const y = Math.min(
          Math.max(0, board.canvas_height / 2 - (size.height ?? 220) / 2 + cascade),
          Math.max(0, board.canvas_height - (size.height ?? 220)),
        );
        const item = await addItem.mutateAsync({
          boardId,
          proposalId,
          x,
          y,
          zIndex: nextZ(),
          width: input.width ?? size.width,
          height: input.height !== undefined ? input.height : size.height,
          ...input,
        });
        setItems((prev) => (prev.some((p) => p.id === item.id) ? prev : [...prev, item]));
        setSelectedId(item.id);
      });
    },
    [addItem, board, boardId, nextZ, proposalId, runStructuralMutation],
  );

  const handleDeleteItem = useCallback(
    (itemId: string) => {
      void runStructuralMutation('The item could not be deleted.', async () => {
        // Retire the id before the delete request. Late canvas callbacks and
        // detached drains must never upsert the deleted item back into being.
        retiredLayoutItemIdsRef.current.add(itemId);
        try {
          await deleteItem.mutateAsync({ itemId, boardId, proposalId });
        } catch (error) {
          retiredLayoutItemIdsRef.current.delete(itemId);
          throw error;
        }
        const next = itemsRef.current.filter((item) => item.id !== itemId);
        itemsRef.current = next;
        setItems(next);
        setSelectedId((selected) => (selected === itemId ? null : selected));
      });
    },
    [boardId, deleteItem, proposalId, runStructuralMutation],
  );

  // ── Sections ──────────────────────────────────────────────────────────────

  /** Persist first, then mirror proposal_boards.sections locally. */
  const persistSections = useCallback(
    (next: BoardSection[]) => {
      void runStructuralMutation('The board sections could not be updated.', async () => {
        await upsertBoard.mutateAsync({ proposalId, boardId, sections: next });
        setSections(next);
      });
    },
    [proposalId, boardId, runStructuralMutation, upsertBoard],
  );

  /** Assign (or clear, sectionId=null) the selected item's section membership. */
  const assignSection = useCallback(
    (itemId: string, sectionId: string | null) => {
      const item = itemsRef.current.find((i) => i.id === itemId);
      if (!item) return;
      const nextData = { ...(item.data ?? {}), section_id: sectionId };
      void runStructuralMutation('The item section could not be updated.', async () => {
        await updateItem.mutateAsync({ itemId, boardId, proposalId, data: nextData });
        mergeLocal(itemId, { data: nextData });
      });
    },
    [boardId, mergeLocal, proposalId, runStructuralMutation, updateItem],
  );

  /**
   * Auto-lay-out every item into a tidy grid (grouped by section when sections
   * exist). Persists the full layout batch behind the proposal barrier, then
   * updates local state only after that write succeeds.
   */
  const handleArrange = useCallback(() => {
    if (!board) return;
    void runStructuralMutation('The board could not be arranged.', async () => {
      const arrangeItems: ArrangeItem[] = itemsRef.current.map((it) => ({
        id: it.id,
        type: it.type,
        width: Number(it.width),
        height: it.height === null ? null : Number(it.height),
        data: it.data as { section_id?: string | null } | null,
      }));
      const positions = arrangeBoardItems(arrangeItems, sections, {
        canvasWidth: board.canvas_width,
      });
      if (positions.length === 0) return;
      const byId = new Map(positions.map((p) => [p.id, p]));
      const changedItems: ProposalBoardItem[] = [];
      const nextItems = itemsRef.current.map((it) => {
        const pos = byId.get(it.id);
        if (!pos || (Number(it.x) === pos.x && Number(it.y) === pos.y)) return it;
        const changed = { ...it, x: pos.x, y: pos.y };
        changedItems.push(changed);
        return changed;
      });
      if (changedItems.length === 0) return;
      await saveLayoutAsync({
        boardId,
        proposalId,
        positions: changedItems.map(layoutPosition),
      });
      itemsRef.current = nextItems;
      setItems(nextItems);
    });
  }, [board, boardId, proposalId, runStructuralMutation, saveLayoutAsync, sections]);

  // ── Canvas callbacks ────────────────────────────────────────────────────────

  const handleItemsChange = useCallback(
    (next: BoardItem[]) => {
      if (parentActionPendingRef.current || structuralPendingRef.current) return;
      const changedItems: ProposalBoardItem[] = [];
      const nextItems = itemsRef.current.map((p) => {
        const n = next.find((i) => String(i.id) === p.id);
        if (!n) return p;
        const nx = n.position.x;
        const ny = n.position.y;
        const nz = n.zIndex ?? 0;
        const nr = n.rotation ?? 0;
        if (
          nx !== Number(p.x) ||
          ny !== Number(p.y) ||
          nz !== p.z_index ||
          nr !== Number(p.rotation)
        ) {
          const changed = {
            ...p,
            x: nx,
            y: ny,
            z_index: nz,
            rotation: nr,
          };
          changedItems.push(changed);
          return changed;
        }
        return p;
      });
      if (changedItems.length === 0) return;
      itemsRef.current = nextItems;
      setItems(nextItems);
      queueLayout(changedItems);
    },
    [queueLayout],
  );

  const handlePick = useCallback(
    (result: ProductPickResult) => {
      addItemToBoard({
        type: result.captureId ? 'capture' : 'product',
        productId: result.productId,
        captureId: result.captureId ?? null,
        imageUrl: result.imageUrl,
        data: {
          name: result.name,
          price_cents: result.priceCents,
          vendor_name: result.vendorName,
          image_url: result.imageUrl,
        },
      });
    },
    [addItemToBoard],
  );

  const handleSetCover = useCallback(
    (imageUrl: string) => {
      void runStructuralMutation('The board cover could not be updated.', async () => {
        await upsertBoard.mutateAsync({ proposalId, boardId, coverImageUrl: imageUrl });
      });
    },
    [boardId, proposalId, runStructuralMutation, upsertBoard],
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!board) {
    return (
      <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-8 text-center text-sm text-[var(--text-muted)]">
        Loading board…
      </div>
    );
  }

  const canvasItems: BoardItem[] = items.map((it) => ({
    id: it.id,
    type: it.type,
    position: { x: Number(it.x), y: Number(it.y) },
    // BoardCanvas types size as {width, height}, but an undefined height
    // intentionally falls through to CSS auto (image/card items size to
    // their content).
    size: {
      width: Number(it.width),
      height: it.height === null ? undefined : Number(it.height),
    } as { width: number; height: number },
    zIndex: it.z_index,
    rotation: Number(it.rotation),
    locked: it.locked,
    data: it,
  }));

  // Live section bands (edit mode only) — each wraps its assigned items, so it
  // tracks them in freeform, not just after Arrange. Sections with no items are
  // skipped (sectionBounds → null).
  const canvasSections: CanvasBoardSection[] = sections
    .map((s): CanvasBoardSection | null => {
      const bounds = sectionBounds(
        items.map((it) => ({
          id: it.id,
          type: it.type,
          width: Number(it.width),
          height: it.height === null ? null : Number(it.height),
          data: it.data as { section_id?: string | null } | null,
          x: Number(it.x),
          y: Number(it.y),
        })),
        s.id,
      );
      return bounds ? { id: s.id, name: s.name, color: s.color, bounds } : null;
    })
    .filter((s): s is CanvasBoardSection => s !== null);

  // Read-only composition for the Presentation/Detail preview toggle — the SAME
  // shared block the client copy renders.
  const compositionBoard = {
    id: board.id,
    name: board.name,
    canvas_width: board.canvas_width,
    canvas_height: board.canvas_height,
    background_color: board.background_color,
    items,
  };

  const selected = selectedId ? (items.find((i) => i.id === selectedId) ?? null) : null;
  const mutationLocked = actionPending || structuralPending;

  // Quiet per-pin overlay (detail-mode language): the client's latest verdict
  // (B4) + a "price moved" chip when the linked product drifted (B5, detail
  // only). Proposal boards only carry verdicts; project boards show just drift.
  const renderPinOverlay = (pin: BoardsBlockItem, mode: BoardMode) => {
    const verdict = verdictByItem.get(pin.id);
    const spec = verdict ? verdictChipSpec(verdict.verdict, verdict.resolved_at) : null;
    const drift = mode === 'detail' && driftByItem.has(pin.id);
    if (!spec && !drift) return null;
    return (
      <>
        {spec && <VerdictPill label={spec.label} color={spec.color} />}
        {drift && <DriftChip />}
      </>
    );
  };

  // "Send to the schedule" (B5) — proposal boards only (it creates a
  // proposal_item). Product/capture pins only.
  const renderPinDetail = isProject
    ? undefined
    : (pin: BoardsBlockItem) => {
        const snap = pinSnapshotByItem.get(pin.id);
        if (!snap || (snap.type !== 'product' && snap.type !== 'capture')) return null;
        return (
          <SendToScheduleControl
            proposalId={proposalId!}
            snap={snap}
            boardScopeRoomId={board.scope_room_id ?? null}
            scheduleItems={scheduleItems}
          />
        );
      };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      {/* Canvas column */}
      <div className="space-y-2">
        {structuralError && (
          <p
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
          >
            {structuralError}
          </p>
        )}
        <BoardViewToolbar
          viewMode={viewMode}
          onViewMode={setViewMode}
          snap={snap}
          onToggleSnap={() => setSnap((s) => !s)}
          onArrange={handleArrange}
          itemCount={items.length}
          disabled={mutationLocked}
        />

        {viewMode === 'edit' ? (
          <div className="max-h-[70vh] overflow-auto rounded-md border border-[var(--border-default)]">
            <BoardCanvas
              items={canvasItems}
              sections={canvasSections}
              layout={snap ? 'grid' : 'freeform'}
              gridSize={SNAP_GRID}
              showGrid={snap}
              width={board.canvas_width}
              height={board.canvas_height}
              backgroundColor={board.background_color}
              readOnly={mutationLocked}
              onItemsChange={handleItemsChange}
              onItemClick={(item) => setSelectedId(String(item.id))}
              onItemDelete={(itemId) => handleDeleteItem(String(itemId))}
              renderItem={(item) => (
                <div
                  className={
                    selectedId === String(item.id)
                      ? 'h-full w-full rounded-sm ring-2 ring-[var(--accent-primary)] ring-offset-1'
                      : 'h-full w-full'
                  }
                >
                  {renderBoardItem(item)}
                </div>
              )}
              className="border-0"
            />
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-auto rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
            {items.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--text-muted)]">
                Nothing on this board yet — switch to Edit and add something.
              </p>
            ) : (
              <BoardComposition
                board={compositionBoard}
                mode={viewMode === 'detail' ? 'detail' : 'presentation'}
                renderPinOverlay={renderPinOverlay}
                renderPinDetail={renderPinDetail}
              />
            )}
          </div>
        )}
      </div>

      {/* Sidebar */}
      <fieldset disabled={mutationLocked} className="min-w-0 space-y-4 border-0 p-0">
        {viewMode !== 'edit' ? (
          <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] px-4 py-3 text-xs text-[var(--text-muted)]">
            Previewing the client&rsquo;s view
            {viewMode === 'detail' ? ' with sourcing detail' : ''}. Switch to Edit to make changes.
          </div>
        ) : (
          <>
            {selected ? (
              <ItemInspector
                proposalId={proposalId}
                boardName={board.name}
                item={selected}
                items={items}
                sections={sections}
                onClose={() => setSelectedId(null)}
                onCommitField={commitField}
                onMergeLocal={(itemId, patch) => {
                  // Rotation drags follow the debounced layout path.
                  if (patch.rotation !== undefined || patch.z_index !== undefined) {
                    mergeLocalLayout(itemId, patch);
                  } else {
                    mergeLocal(itemId, patch);
                  }
                }}
                onAssignSection={assignSection}
                onDelete={handleDeleteItem}
                onSetCover={handleSetCover}
                sendToSchedule={
                  !isProject &&
                  proposalId &&
                  (selected.type === 'product' || selected.type === 'capture') ? (
                    <SendToScheduleControl
                      proposalId={proposalId}
                      snap={pinSnapshotByItem.get(selected.id)!}
                      boardScopeRoomId={board.scope_room_id ?? null}
                      scheduleItems={scheduleItems}
                    />
                  ) : null
                }
              />
            ) : (
              <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] px-4 py-3 text-xs text-[var(--text-muted)]">
                Select an item on the canvas to edit it, or add something below.
              </div>
            )}

            {/* Sections — create / rename / delete / reorder. Arrange lives on
                the toolbar. */}
            <BoardSectionsPanel sections={sections} onChange={persistSections} />

            {/* Add product / capture */}
            <SidebarSection title="Products & captures">
              <Button variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>
                + Add product or capture
              </Button>
            </SidebarSection>

            {/* Similar-product suggestions (hidden until a product item exists and
                the similarity RPC returns matches — degrades silently without
                embeddings). Collapsible so it doesn't crowd the inspector. */}
            <BoardSuggestionsRail items={items} onAdd={addItemToBoard} />

            {/* Add palette + room scan — proposal-only (project boards have no
                proposal palettes / scope). */}
            {!isProject && proposalId && (
              <>
                <AddPaletteSection proposalId={proposalId} onAdd={addItemToBoard} />
                <RoomScansGate proposalId={proposalId} onAdd={addItemToBoard} />
              </>
            )}

            {/* Upload image — keyed on the owner id (00131 proposal leg or the
                00272 project leg). */}
            <UploadImageSection ownerId={ownerId} boardId={boardId} onAdd={addItemToBoard} />

            {/* Add note */}
            <AddNoteSection onAdd={addItemToBoard} />
          </>
        )}
      </fieldset>

      <ProductPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handlePick}
        // Full 3-layer library (personal/studio/catalog) + cross-layer search,
        // matching the FF&E add (ffe/page.tsx pickerScope="library"). The
        // Captures and Quick-create-draft tabs are scope-independent (the modal
        // shell renders them for both scopes), so both still work here.
        scope="library"
      />
    </div>
  );
}

// ─── Sidebar chrome ──────────────────────────────────────────────────────────

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
      <span className="type-meta mb-3 block text-[var(--accent-primary)]">{title}</span>
      {children}
    </div>
  );
}

// ─── View toolbar (Edit / Presentation / Detail + snap + arrange) ────────────

const VIEW_LABELS: Record<ViewMode, string> = {
  edit: 'Edit',
  presentation: 'Presentation',
  detail: 'Detail',
};

function BoardViewToolbar({
  viewMode,
  onViewMode,
  snap,
  onToggleSnap,
  onArrange,
  itemCount,
  disabled,
}: {
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  snap: boolean;
  onToggleSnap: () => void;
  onArrange: () => void;
  itemCount: number;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="inline-flex overflow-hidden rounded-md border border-[var(--border-default)]">
        {(['edit', 'presentation', 'detail'] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={viewMode === mode}
            onClick={() => onViewMode(mode)}
            className={`px-3 py-1.5 text-xs transition-colors ${
              viewMode === mode
                ? 'bg-[var(--accent-primary)] text-white'
                : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {VIEW_LABELS[mode]}
          </button>
        ))}
      </div>

      {viewMode === 'edit' && (
        <div className="flex items-center gap-1.5">
          <Button
            variant={snap ? 'primary' : 'ghost'}
            size="sm"
            onClick={onToggleSnap}
            aria-pressed={snap}
            disabled={disabled}
          >
            {snap ? 'Snap: on' : 'Snap: off'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onArrange}
            disabled={disabled || itemCount === 0}
          >
            Arrange
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Sections panel (create / rename / delete / reorder) ─────────────────────

function BoardSectionsPanel({
  sections,
  onChange,
}: {
  sections: BoardSection[];
  onChange: (next: BoardSection[]) => void;
}) {
  return (
    <SidebarSection title="Sections">
      {sections.length === 0 ? (
        <p className="mb-2 text-xs text-[var(--text-muted)]">
          Group items into named sections, then use Arrange to lay them out by section.
        </p>
      ) : (
        <div className="mb-2 space-y-1.5">
          {sections.map((section, index) => (
            <SectionRow
              key={section.id}
              section={section}
              isFirst={index === 0}
              isLast={index === sections.length - 1}
              onRename={(name) => onChange(renameSection(sections, section.id, name))}
              onMove={(dir) => onChange(moveSection(sections, section.id, dir))}
              onDelete={() => onChange(deleteSection(sections, section.id))}
            />
          ))}
        </div>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange(addSection(sections, ''))}
      >
        + Add section
      </Button>
    </SidebarSection>
  );
}

function SectionRow({
  section,
  isFirst,
  isLast,
  onRename,
  onMove,
  onDelete,
}: {
  section: BoardSection;
  isFirst: boolean;
  isLast: boolean;
  onRename: (name: string) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(section.name);
  // Keep the draft in step if the persisted name changes underneath (e.g. after
  // a reorder re-key would remount, but a rename refetch would not).
  useEffect(() => setDraft(section.name), [section.name]);

  const commit = () => {
    if (draft.trim() && draft !== section.name) onRename(draft);
    else setDraft(section.name);
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setDraft(section.name);
        }}
        className="h-7 flex-1"
        aria-label={`Section name: ${section.name}`}
      />
      <IconButton label="Move section up" variant="ghost" size="sm" disabled={isFirst} onClick={() => onMove(-1)}>
        ↑
      </IconButton>
      <IconButton label="Move section down" variant="ghost" size="sm" disabled={isLast} onClick={() => onMove(1)}>
        ↓
      </IconButton>
      <IconButton label="Delete section" variant="ghost" size="sm" onClick={onDelete}>
        ×
      </IconButton>
    </div>
  );
}

// ─── Add palette ─────────────────────────────────────────────────────────────

function AddPaletteSection({
  proposalId,
  onAdd,
}: {
  proposalId: string;
  onAdd: (input: Omit<AddBoardItemInput, 'boardId' | 'x' | 'y' | 'zIndex'>) => void;
}) {
  const { data: palettes = [], isLoading: palettesLoading } = usePalettes(proposalId);
  const [addingId, setAddingId] = useState<string | null>(null);

  const handleAdd = useCallback(
    async (palette: ProposalPalette) => {
      setAddingId(palette.id);
      try {
        // Snapshot the swatches into the item's data JSONB so the board
        // renders even if the palette is later edited or deleted.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabase = createBrowserClient() as any;
        const { data: swatches, error } = await supabase
          .from('palette_swatches')
          .select('hex, role, name')
          .eq('palette_id', palette.id)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true });
        if (error) throw error;
        onAdd({
          type: 'palette',
          paletteId: palette.id,
          data: {
            name: palette.name,
            swatches: ((swatches ?? []) as Array<{ hex: string; role: string | null; name: string | null }>).map(
              (s) => ({ hex: s.hex, role: s.role, name: s.name }),
            ),
          },
        });
      } finally {
        setAddingId(null);
      }
    },
    [onAdd],
  );

  return (
    <SidebarSection title="Palettes">
      {palettesLoading ? (
        <p className="text-xs text-[var(--text-muted)]">Loading palettes…</p>
      ) : palettes.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">
          No palettes on this proposal yet — build one in the Palette tab.
        </p>
      ) : (
        <div className="space-y-1.5">
          {palettes.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2">
              <span className="truncate text-sm">{p.name}</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={addingId === p.id}
                onClick={() => void handleAdd(p)}
              >
                {addingId === p.id ? 'Adding…' : 'Add'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </SidebarSection>
  );
}

// ─── Room scans ──────────────────────────────────────────────────────────────

/**
 * Gate: only mounts the scans query once we know the proposal's client.
 * Proposals without a linked client (or clients without ready scans) hide
 * the section entirely.
 */
function RoomScansGate({
  proposalId,
  onAdd,
}: {
  proposalId: string;
  onAdd: (input: Omit<AddBoardItemInput, 'boardId' | 'x' | 'y' | 'zIndex'>) => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: proposal } = useProposal(proposalId) as { data: any };
  const clientUserId: string | null = proposal?.client_id ?? null;
  if (!clientUserId) return null;
  return <RoomScansSection clientUserId={clientUserId} onAdd={onAdd} />;
}

function RoomScansSection({
  clientUserId,
  onAdd,
}: {
  clientUserId: string;
  onAdd: (input: Omit<AddBoardItemInput, 'boardId' | 'x' | 'y' | 'zIndex'>) => void;
}) {
  // proposals.client_id is the client's auth uid — the same column
  // room_scans.user_id stores (useClientRoomScans resolves to this exact
  // query via designer_clients).
  const { data: scans = [], isError } = useRoomScans({
    userId: clientUserId,
    status: 'ready',
  });
  const withThumbs = (scans as RoomScan[]).filter((s) => !!s.thumbnail_url);

  if (isError || withThumbs.length === 0) return null;

  return (
    <SidebarSection title="Room scans">
      <div className="grid grid-cols-3 gap-2">
        {withThumbs.map((scan) => (
          <button
            key={scan.id}
            type="button"
            title={scan.name}
            onClick={() =>
              onAdd({
                type: 'room_scan',
                imageUrl: scan.thumbnail_url,
                data: { name: scan.name, room_type: scan.room_type },
              })
            }
            className="group overflow-hidden rounded-sm border border-[var(--border-default)] transition-colors hover:border-[var(--accent-primary)]"
            style={{ aspectRatio: '4 / 3' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={scan.thumbnail_url ?? ''}
              alt={scan.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>
      <p className="mt-2 text-[0.65rem] text-[var(--text-muted)]">
        Click a scan to drop it on the board.
      </p>
    </SidebarSection>
  );
}

// ─── Upload image ────────────────────────────────────────────────────────────

function UploadImageSection({
  ownerId,
  boardId,
  onAdd,
}: {
  /** First path segment — a proposal id (00131 leg) or project id (00272 leg). */
  ownerId: string;
  boardId: string;
  onAdd: (input: Omit<AddBoardItemInput, 'boardId' | 'x' | 'y' | 'zIndex'>) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      setErrorMessage(null);
      try {
        const supabase = createBrowserClient();
        // First path segment = owner id satisfies the proposal-mood-boards RLS
        // (00131 proposal leg / 00272 project leg).
        const ext = file.name.split('.').pop() ?? 'jpg';
        const path = `${ownerId}/boards/${boardId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from('proposal-mood-boards')
          .upload(path, file, { upsert: true, contentType: file.type });
        if (error) throw error;
        const { data } = supabase.storage.from('proposal-mood-boards').getPublicUrl(path);
        onAdd({ type: 'image', imageUrl: data.publicUrl });
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
    [ownerId, boardId, onAdd],
  );

  return (
    <SidebarSection title="Images">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUpload(file);
          e.target.value = '';
        }}
      />
      <Button
        variant="secondary"
        size="sm"
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? 'Uploading…' : '+ Upload image'}
      </Button>
      {errorMessage && (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {errorMessage}
        </p>
      )}
    </SidebarSection>
  );
}

// ─── Add note ────────────────────────────────────────────────────────────────

function AddNoteSection({
  onAdd,
}: {
  onAdd: (input: Omit<AddBoardItemInput, 'boardId' | 'x' | 'y' | 'zIndex'>) => void;
}) {
  const [content, setContent] = useState('');

  const handleAdd = () => {
    onAdd({ type: 'note', content: content.trim() || 'New note' });
    setContent('');
  };

  return (
    <SidebarSection title="Notes">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Jot a styling note…"
        rows={2}
      />
      <Button variant="ghost" size="sm" className="mt-2" onClick={handleAdd}>
        + Add note
      </Button>
    </SidebarSection>
  );
}

// ─── Item inspector ──────────────────────────────────────────────────────────

interface ItemInspectorProps {
  /** Undefined for a project-owned board (no proposal palette extraction). */
  proposalId?: string;
  boardName: string;
  item: ProposalBoardItem;
  items: ProposalBoardItem[];
  sections: BoardSection[];
  onClose: () => void;
  onCommitField: (itemId: string, patch: Partial<ProposalBoardItem>) => void;
  onMergeLocal: (itemId: string, patch: Partial<ProposalBoardItem>) => void;
  onAssignSection: (itemId: string, sectionId: string | null) => void;
  onDelete: (itemId: string) => void;
  onSetCover: (imageUrl: string) => void;
  /** "Send to the schedule" control for product/capture pins (B5); parent-built. */
  sendToSchedule?: React.ReactNode;
}

function itemImageUrl(item: ProposalBoardItem): string | null {
  if (item.image_url) return item.image_url;
  const data = (item.data ?? {}) as { image_url?: string | null };
  return data.image_url ?? null;
}

function ItemInspector({
  proposalId,
  boardName,
  item,
  items,
  sections,
  onClose,
  onCommitField,
  onMergeLocal,
  onAssignSection,
  onDelete,
  onSetCover,
  sendToSchedule,
}: ItemInspectorProps) {
  const imageUrl = itemImageUrl(item);
  const currentSectionId =
    (item.data as { section_id?: string | null } | null)?.section_id ?? '';

  const bringForward = () => {
    const maxZ = items.reduce((m, i) => Math.max(m, i.z_index), 0);
    if (item.z_index <= maxZ) onMergeLocal(item.id, { z_index: maxZ + 1 });
  };
  const sendBackward = () => {
    const minZ = items.reduce((m, i) => Math.min(m, i.z_index), 0);
    if (item.z_index < minZ) return;
    const newZ = minZ - 1;
    if (newZ >= 0) {
      onMergeLocal(item.id, { z_index: newZ });
      return;
    }
    // Keep the z floor at 0 — negative z would render behind the opaque
    // canvas background. Shift everything else up instead; each merge marks
    // the item dirty so the whole restack persists in one batched flush.
    const shift = -newZ;
    for (const other of items) {
      if (other.id !== item.id) onMergeLocal(other.id, { z_index: other.z_index + shift });
    }
    onMergeLocal(item.id, { z_index: 0 });
  };

  return (
    <div className="rounded-md border border-[var(--accent-primary)] bg-[var(--bg-surface)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="type-meta text-[var(--accent-primary)]">Selected {item.type.replace('_', ' ')}</span>
        <IconButton label="Deselect" variant="ghost" size="sm" onClick={onClose}>
          ×
        </IconButton>
      </div>

      <div className="space-y-3">
        {/* Size */}
        <div>
          <span className="mb-1 block text-xs text-[var(--text-muted)]">Size</span>
          <div className="flex items-center gap-1.5">
            {WIDTH_PRESETS.map((p) => (
              <Button
                key={p.label}
                variant={Number(item.width) === p.width ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => onCommitField(item.id, { width: p.width })}
              >
                {p.label}
              </Button>
            ))}
            <Input
              type="number"
              min={40}
              max={2000}
              value={Math.round(Number(item.width))}
              onChange={(e) => {
                const w = Number(e.target.value);
                if (Number.isFinite(w) && w >= 40) onCommitField(item.id, { width: w });
              }}
              className="w-20"
              aria-label="Width (px)"
            />
          </div>
        </div>

        {/* Stacking */}
        <div>
          <span className="mb-1 block text-xs text-[var(--text-muted)]">Stacking</span>
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" onClick={bringForward}>
              Bring forward
            </Button>
            <Button variant="ghost" size="sm" onClick={sendBackward}>
              Send back
            </Button>
          </div>
        </div>

        {/* Section membership (only when the board has sections) */}
        {sections.length > 0 && (
          <div>
            <span className="mb-1 block text-xs text-[var(--text-muted)]">Section</span>
            <Select
              value={currentSectionId}
              onChange={(e) => onAssignSection(item.id, e.target.value || null)}
              wrapperClassName="w-full"
              aria-label="Assign to section"
            >
              <option value="">Unsorted</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        {/* Rotation */}
        <div>
          <span className="mb-1 block text-xs text-[var(--text-muted)]">
            Rotation · {Math.round(Number(item.rotation))}°
          </span>
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={Number(item.rotation)}
            onChange={(e) => onMergeLocal(item.id, { rotation: Number(e.target.value) })}
            className="w-full accent-[var(--accent-primary)]"
            aria-label="Rotation (degrees)"
          />
        </div>

        {/* Note content */}
        {item.type === 'note' && (
          <NoteContentEditor
            key={item.id}
            content={item.content ?? ''}
            onCommit={(next) => onCommitField(item.id, { content: next })}
          />
        )}

        {/* Lock / cover / delete */}
        <div className="flex flex-wrap gap-1.5 border-t border-[var(--border-default)] pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCommitField(item.id, { locked: !item.locked })}
          >
            {item.locked ? 'Unlock' : 'Lock'}
          </Button>
          {imageUrl && (
            <Button variant="ghost" size="sm" onClick={() => onSetCover(imageUrl)}>
              Set as cover
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="!text-red-700"
            onClick={() => onDelete(item.id)}
          >
            Delete
          </Button>
        </div>

        {/* Send this pin to the schedule (B5) — parent supplies the control for
            product/capture pins on a proposal board. */}
        {sendToSchedule && (
          <div className="border-t border-[var(--border-default)] pt-3">{sendToSchedule}</div>
        )}

        {/* Extract palette from image-bearing items (proposal boards only) */}
        {imageUrl && proposalId && (
          <ExtractPalettePanel proposalId={proposalId} boardName={boardName} imageUrl={imageUrl} />
        )}
      </div>
    </div>
  );
}

function NoteContentEditor({
  content,
  onCommit,
}: {
  content: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(content);
  return (
    <div>
      <span className="mb-1 block text-xs text-[var(--text-muted)]">Note text</span>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== content) onCommit(draft);
        }}
        rows={3}
      />
    </div>
  );
}

// ─── Extract palette ─────────────────────────────────────────────────────────

function ExtractPalettePanel({
  proposalId,
  boardName,
  imageUrl,
}: {
  proposalId: string;
  boardName: string;
  imageUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState(false);
  const upsertPalette = useUpsertPalette();
  const upsertSwatch = useUpsertSwatch();

  // Mirrors palette-builder's handleExtracted flow: create the palette, then
  // one swatch per extracted color.
  const handleExtracted = useCallback(
    async (swatches: ExtractedSwatch[]) => {
      const palette = await upsertPalette.mutateAsync({
        proposalId,
        name: `${boardName} palette`,
      });
      swatches.forEach((s) => {
        upsertSwatch.mutate({
          proposalId,
          paletteId: palette.id,
          hex: s.hex,
          sourcePixel: s.sourcePixel,
        });
      });
      setCreated(true);
    },
    [boardName, proposalId, upsertPalette, upsertSwatch],
  );

  return (
    <div className="border-t border-[var(--border-default)] pt-3">
      <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide palette extraction' : 'Extract palette'}
      </Button>
      {open && (
        <div className="mt-2">
          <ImagePaletteExtractor
            imageUrl={imageUrl}
            k={5}
            onExtracted={(swatches) => void handleExtracted(swatches)}
          />
          {created && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Saved as “{boardName} palette” — see the Palette tab.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── B5: send-to-schedule + quiet pin chips ──────────────────────────────────

/** Quiet mono verdict pill for a board pin (B4, read-only, designer side). */
function VerdictPill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[3px] px-1.5 py-0.5"
      style={{
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: '0.5rem',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
      }}
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: 9999, backgroundColor: color }} />
      {label}
    </span>
  );
}

/** Quiet "price moved" mono chip (B5, detail mode). */
function DriftChip() {
  return (
    <span
      className="inline-flex items-center rounded-[3px] px-1.5 py-0.5"
      title="This pin's linked product price changed since it was added"
      style={{
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: '0.5rem',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'var(--color-clay, #a5552f)',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
      }}
    >
      price moved
    </span>
  );
}

/**
 * "Send to the schedule" (B5): create a proposal_item from a product/capture
 * pin's snapshot (name/image/price → sell side; product_id + room carried; a
 * doc_code auto-suggested). Idempotence guard (the Wave-1 twin concept): if a
 * line already exists for this product in this room, acknowledge it instead of
 * duplicating. Quiet inline confirm; inline error on failure.
 */
function SendToScheduleControl({
  proposalId,
  snap,
  boardScopeRoomId,
  scheduleItems,
}: {
  proposalId: string;
  snap: PinScheduleSnapshot;
  boardScopeRoomId: string | null;
  scheduleItems: ScheduleLineRef[];
}) {
  const addItem = useAddProposalItem();
  const [status, setStatus] = useState<
    null | { kind: 'added' | 'exists'; docCode: string | null; name: string | null }
  >(null);
  const [error, setError] = useState<string | null>(null);

  // A line already on this schedule for this product in this room (idempotence).
  const twin = findScheduleTwin(scheduleItems, snap.productId, boardScopeRoomId);

  const handleSend = async () => {
    setError(null);
    if (twin) {
      setStatus({ kind: 'exists', docCode: twin.doc_code, name: twin.name });
      return;
    }
    try {
      const args = buildSendToScheduleArgs({
        proposalId,
        snap,
        boardScopeRoomId,
        existingCodes: scheduleItems.map((s) => s.doc_code),
      });
      await addItem.mutateAsync(args);
      setStatus({ kind: 'added', docCode: args.docCode, name: snap.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add to the schedule.');
    }
  };

  if (status) {
    return (
      <p className="type-meta-small text-[var(--text-muted)]">
        {status.kind === 'added' ? 'Added to the schedule' : 'Already on the schedule'}
        {status.docCode ? ` · ${status.docCode}` : ''}
      </p>
    );
  }

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        disabled={addItem.isPending}
        onClick={() => void handleSend()}
      >
        {addItem.isPending ? 'Sending…' : twin ? 'Already on the schedule' : 'Send to the schedule'}
      </Button>
      {error && (
        <p className="type-meta-small text-[var(--color-clay,#a5552f)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
