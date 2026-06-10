'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BoardCanvas,
  ImagePaletteExtractor,
  type BoardItem,
  type ExtractedSwatch,
} from '@patina/design-system';
import { Button, IconButton, Input, Textarea } from '@/components/ui/controls';
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
  type ProposalBoardItem,
  type AddBoardItemInput,
  type ProposalPalette,
  type RoomScan,
} from '@patina/supabase';
import {
  ProductPickerModal,
  type ProductPickResult,
} from '../proposals/product-picker-modal';
import { renderBoardItem } from './board-item-renderer';
import { BoardSuggestionsRail } from './board-suggestions-rail';

// Debounced layout autosave interval — mirrors the blur/600ms idiom used by
// the palette swatch editor.
const LAYOUT_FLUSH_MS = 600;

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
  proposalId: string;
  boardId: string;
}

/**
 * Freeform mood-board editor: BoardCanvas center + add/inspector sidebar.
 *
 * Persistence model:
 *  - Drag/rotate/restack edits land in local state, are marked dirty, and
 *    flush through useSaveBoardLayout on a 600ms debounce.
 *  - Structural ops (add/delete/resize/lock/content/cover) flush any pending
 *    layout save first, then run an immediate mutation with an optimistic
 *    local merge; React Query invalidation re-syncs afterwards.
 *  - Server data only overwrites local state when nothing is dirty, so an
 *    in-flight refetch never clobbers a drag in progress.
 *
 * Mount with `key={boardId}` so switching boards remounts (unmount flushes
 * the pending layout for the previous board).
 */
export function BoardEditor({ proposalId, boardId }: BoardEditorProps) {
  const { data: board } = useBoard(boardId);

  const addItem = useAddBoardItem();
  const updateItem = useUpdateBoardItem();
  const deleteItem = useDeleteBoardItem();
  const saveLayout = useSaveBoardLayout();
  const upsertBoard = useUpsertBoard();

  const [items, setItems] = useState<ProposalBoardItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const itemsRef = useRef<ProposalBoardItem[]>(items);
  itemsRef.current = items;
  const dirtyRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Layout autosave ─────────────────────────────────────────────────────────

  const { mutate: saveLayoutMutate } = saveLayout;

  const flushLayout = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (dirtyRef.current.size === 0) return;
    const ids = new Set(dirtyRef.current);
    dirtyRef.current.clear();
    const positions = itemsRef.current
      .filter((i) => ids.has(i.id))
      .map((i) => ({
        id: i.id,
        x: Number(i.x),
        y: Number(i.y),
        z_index: i.z_index,
        rotation: Number(i.rotation),
      }));
    if (positions.length > 0) saveLayoutMutate({ boardId, positions });
  }, [boardId, saveLayoutMutate]);

  const flushLayoutRef = useRef(flushLayout);
  flushLayoutRef.current = flushLayout;

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => flushLayoutRef.current(), LAYOUT_FLUSH_MS);
  }, []);

  // Flush any pending positions when the editor unmounts (board switch,
  // tab change, navigation).
  useEffect(() => () => flushLayoutRef.current(), []);

  // ── Server → local sync ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!board) return;
    // Don't clobber unsaved local moves; the post-flush invalidation will
    // bring us back here once dirty drains.
    if (dirtyRef.current.size > 0) return;
    setItems(board.items);
  }, [board]);

  // ── Local mutation helpers ──────────────────────────────────────────────────

  /** Optimistically merge field updates into local state. */
  const mergeLocal = useCallback((itemId: string, patch: Partial<ProposalBoardItem>) => {
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i)));
  }, []);

  /** Immediate field mutation (flushes pending layout first). */
  const commitField = useCallback(
    (itemId: string, patch: Partial<ProposalBoardItem>) => {
      flushLayoutRef.current();
      mergeLocal(itemId, patch);
      updateItem.mutate({
        itemId,
        boardId,
        ...(patch.width !== undefined ? { width: Number(patch.width) } : {}),
        ...(patch.height !== undefined
          ? { height: patch.height === null ? null : Number(patch.height) }
          : {}),
        ...(patch.locked !== undefined ? { locked: patch.locked } : {}),
        ...(patch.content !== undefined ? { content: patch.content } : {}),
        ...(patch.z_index !== undefined ? { zIndex: patch.z_index } : {}),
        ...(patch.rotation !== undefined ? { rotation: Number(patch.rotation) } : {}),
      });
    },
    [boardId, mergeLocal, updateItem],
  );

  const nextZ = useCallback(
    () => itemsRef.current.reduce((max, i) => Math.max(max, i.z_index), 0) + 1,
    [],
  );

  /** Add an item near the canvas center with a small random offset. */
  const addItemToBoard = useCallback(
    (input: Omit<AddBoardItemInput, 'boardId' | 'x' | 'y' | 'zIndex'>) => {
      if (!board) return;
      flushLayoutRef.current();
      const size = DEFAULT_SIZE[input.type] ?? { width: 240, height: null };
      const jitter = () => Math.round(Math.random() * 80 - 40);
      const x = Math.max(0, board.canvas_width / 2 - size.width / 2 + jitter());
      const y = Math.max(0, board.canvas_height / 2 - (size.height ?? 220) / 2 + jitter());
      addItem.mutate(
        {
          boardId,
          x,
          y,
          zIndex: nextZ(),
          width: input.width ?? size.width,
          height: input.height !== undefined ? input.height : size.height,
          ...input,
        },
        {
          onSuccess: (item) => {
            setItems((prev) => (prev.some((p) => p.id === item.id) ? prev : [...prev, item]));
            setSelectedId(item.id);
          },
        },
      );
    },
    [addItem, board, boardId, nextZ],
  );

  const handleDeleteItem = useCallback(
    (itemId: string) => {
      flushLayoutRef.current();
      dirtyRef.current.delete(itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      setSelectedId((sel) => (sel === itemId ? null : sel));
      deleteItem.mutate({ itemId, boardId });
    },
    [boardId, deleteItem],
  );

  // ── Canvas callbacks ────────────────────────────────────────────────────────

  const handleItemsChange = useCallback(
    (next: BoardItem[]) => {
      let changed = false;
      setItems((prev) =>
        prev.map((p) => {
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
            dirtyRef.current.add(p.id);
            changed = true;
            return { ...p, x: nx, y: ny, z_index: nz, rotation: nr };
          }
          return p;
        }),
      );
      if (changed) scheduleFlush();
    },
    [scheduleFlush],
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

  const selected = selectedId ? (items.find((i) => i.id === selectedId) ?? null) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      {/* Canvas */}
      <div className="max-h-[70vh] overflow-auto rounded-md border border-[var(--border-default)]">
        <BoardCanvas
          items={canvasItems}
          layout="freeform"
          showGrid={false}
          width={board.canvas_width}
          height={board.canvas_height}
          backgroundColor={board.background_color}
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

      {/* Sidebar */}
      <div className="space-y-4">
        {selected ? (
          <ItemInspector
            proposalId={proposalId}
            boardName={board.name}
            item={selected}
            items={items}
            onClose={() => setSelectedId(null)}
            onCommitField={commitField}
            onMergeLocal={(itemId, patch) => {
              // Rotation drags follow the debounced layout path.
              mergeLocal(itemId, patch);
              if (patch.rotation !== undefined || patch.z_index !== undefined) {
                dirtyRef.current.add(itemId);
                scheduleFlush();
              }
            }}
            onDelete={handleDeleteItem}
            onSetCover={(imageUrl) =>
              upsertBoard.mutate({ proposalId, boardId, coverImageUrl: imageUrl })
            }
          />
        ) : (
          <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] px-4 py-3 text-xs text-[var(--text-muted)]">
            Select an item on the canvas to edit it, or add something below.
          </div>
        )}

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

        {/* Add palette */}
        <AddPaletteSection proposalId={proposalId} onAdd={addItemToBoard} />

        {/* Add room scan */}
        <RoomScansGate proposalId={proposalId} onAdd={addItemToBoard} />

        {/* Upload image */}
        <UploadImageSection proposalId={proposalId} boardId={boardId} onAdd={addItemToBoard} />

        {/* Add note */}
        <AddNoteSection onAdd={addItemToBoard} />
      </div>

      <ProductPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handlePick}
        scope="catalog"
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

// ─── Add palette ─────────────────────────────────────────────────────────────

function AddPaletteSection({
  proposalId,
  onAdd,
}: {
  proposalId: string;
  onAdd: (input: Omit<AddBoardItemInput, 'boardId' | 'x' | 'y' | 'zIndex'>) => void;
}) {
  const { data: palettes = [] } = usePalettes(proposalId);
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
      {palettes.length === 0 ? (
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
  proposalId,
  boardId,
  onAdd,
}: {
  proposalId: string;
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
        // First path segment = proposalId satisfies the 00131 storage RLS.
        const ext = file.name.split('.').pop() ?? 'jpg';
        const path = `${proposalId}/boards/${boardId}/${crypto.randomUUID()}.${ext}`;
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
    [proposalId, boardId, onAdd],
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
  proposalId: string;
  boardName: string;
  item: ProposalBoardItem;
  items: ProposalBoardItem[];
  onClose: () => void;
  onCommitField: (itemId: string, patch: Partial<ProposalBoardItem>) => void;
  onMergeLocal: (itemId: string, patch: Partial<ProposalBoardItem>) => void;
  onDelete: (itemId: string) => void;
  onSetCover: (imageUrl: string) => void;
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
  onClose,
  onCommitField,
  onMergeLocal,
  onDelete,
  onSetCover,
}: ItemInspectorProps) {
  const imageUrl = itemImageUrl(item);

  const bringForward = () => {
    const maxZ = items.reduce((m, i) => Math.max(m, i.z_index), 0);
    if (item.z_index <= maxZ) onMergeLocal(item.id, { z_index: maxZ + 1 });
  };
  const sendBackward = () => {
    const minZ = items.reduce((m, i) => Math.min(m, i.z_index), 0);
    if (item.z_index >= minZ) onMergeLocal(item.id, { z_index: minZ - 1 });
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

        {/* Extract palette from image-bearing items */}
        {imageUrl && (
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
