'use client';

import type { ReactNode } from 'react';
import type { ProposalBoardItem } from '@patina/supabase';
import type { EditableMoodBoardItem } from '@patina/types';

// ─── Persisted snapshot shapes carried in item `data` JSONB ─────────────────

interface ProductSnapshot {
  name?: string | null;
  price_cents?: number | null;
  vendor_name?: string | null;
  image_url?: string | null;
}

interface PaletteSwatchSnapshot {
  hex: string;
  role?: string | null;
  name?: string | null;
}

interface PaletteSnapshot {
  name?: string | null;
  swatches?: PaletteSwatchSnapshot[];
}

interface RoomScanSnapshot {
  name?: string | null;
  room_type?: string | null;
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

/**
 * Shared board-room pin content. BoardRoomCanvas owns geometry and gestures;
 * this renderer reads display fields from the persisted item snapshot.
 */
function renderBoardItem(row: ProposalBoardItem): ReactNode {
  switch (row.type) {
    case 'product':
    case 'capture':
      return <ProductCard row={row} />;
    case 'image':
      return <ImageTile row={row} />;
    case 'room_scan':
      return <RoomScanTile row={row} />;
    case 'palette':
      return <PaletteStrip row={row} />;
    case 'note':
      return <NoteCard row={row} />;
    default:
      return (
        <div className="rounded-sm border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-xs text-[var(--text-muted)]">
          {row.type}
        </div>
      );
  }
}

/** Canonical board-room adapter; pin appearance still has one portal source. */
export function renderBoardRoomItem(item: EditableMoodBoardItem): ReactNode {
  const row: ProposalBoardItem = {
    id: item.id,
    board_id: '',
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
    created_at: '',
    updated_at: '',
  };
  return renderBoardItem(row);
}

// ─── Plate and caption (US-28 S12; SPEC §S12.2.1) ───────────────────────────
//
// Every picture item is a plate and a caption: the photo or drawing on a 1px
// card edge, then a sans name and a mono line of facts. No shadow, no pill,
// no overlay on the plate, nothing truncated — the plate gives up height so
// the caption always prints whole (the item's box is the canvas's geometry).

function Plate({ children, dashed = false }: { children: ReactNode; dashed?: boolean }) {
  return (
    <div className={dashed ? 'br-plate br-plate--slot' : 'br-plate'}>
      {children}
    </div>
  );
}

function Caption({ name, meta }: { name: ReactNode; meta?: ReactNode }) {
  return (
    <div className="br-cap">
      <span className="br-cap-name">{name}</span>
      {meta ? <span className="br-cap-meta">{meta}</span> : null}
    </div>
  );
}

// ─── Product / capture ───────────────────────────────────────────────────────

function ProductCard({ row }: { row: ProposalBoardItem }) {
  const snap = (row.data ?? {}) as ProductSnapshot;
  const imageUrl = row.image_url ?? snap.image_url ?? null;
  const facts = [
    snap.vendor_name,
    typeof snap.price_cents === 'number' ? formatDollars(snap.price_cents) : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="br-item flex h-full w-full select-none flex-col">
      <Plate>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={snap.name ?? ''}
            draggable={false}
            className="pointer-events-none h-full w-full object-cover"
          />
        ) : (
          <span className="br-plate-word">No image</span>
        )}
      </Plate>
      <Caption name={snap.name ?? 'Untitled product'} meta={facts || null} />
    </div>
  );
}

// ─── Bare image ──────────────────────────────────────────────────────────────

interface ImageSnapshot {
  name?: string | null;
}

/**
 * Edit-mode placeholder for an id-backed image with no `image_url` yet
 * (VD12). Present mode's `ImageTile` (packages/patina-design-system's
 * BoardsBlock.tsx) already names the item instead of a bare "missing" label;
 * this brings the same captioned treatment here so what a designer composes
 * matches what they present, while keeping the dashed border as an
 * edit-only affordance (Present's placeholder border is solid). The empty
 * slot keeps its dashed placeholder (SPEC §S12.4).
 */
function ImageTile({ row }: { row: ProposalBoardItem }) {
  if (!row.image_url) {
    const snap = (row.data ?? {}) as ImageSnapshot;
    return (
      <div className="br-item flex h-full w-full select-none flex-col">
        <Plate dashed>
          <span className="br-plate-word">{snap.name?.trim() ? snap.name : 'No image'}</span>
        </Plate>
      </div>
    );
  }
  return (
    <div className="br-item flex h-full w-full select-none flex-col">
      <Plate>
        <img
          src={row.image_url}
          alt=""
          draggable={false}
          className="pointer-events-none h-full w-full object-cover"
        />
      </Plate>
    </div>
  );
}

// ─── Room scan photo ─────────────────────────────────────────────────────────

function RoomScanTile({ row }: { row: ProposalBoardItem }) {
  const snap = (row.data ?? {}) as RoomScanSnapshot;
  return (
    <div className="br-item flex h-full w-full select-none flex-col">
      <Plate>
        {row.image_url ? (
          <img
            src={row.image_url}
            alt={snap.name ?? 'Room scan'}
            draggable={false}
            className="pointer-events-none h-full w-full object-cover"
          />
        ) : (
          <span className="br-plate-word">No preview</span>
        )}
      </Plate>
      <Caption name={snap.name ?? 'Room'} meta="Scan" />
    </div>
  );
}

// ─── Palette strip ───────────────────────────────────────────────────────────

function PaletteStrip({ row }: { row: ProposalBoardItem }) {
  const snap = (row.data ?? {}) as PaletteSnapshot;
  const swatches = snap.swatches ?? [];

  return (
    <div className="br-item flex h-full w-full select-none flex-col">
      <Plate>
        {swatches.length > 0 ? (
          <span className="flex h-full w-full">
            {swatches.map((s, i) => (
              <span
                key={`${s.hex}-${i}`}
                className="h-full flex-1"
                style={{ backgroundColor: s.hex }}
                title={s.name ?? s.hex}
              />
            ))}
          </span>
        ) : (
          <span className="br-plate-word">Empty palette</span>
        )}
      </Plate>
      <Caption name={snap.name ?? 'Palette'} />
    </div>
  );
}

// ─── Note ────────────────────────────────────────────────────────────────────

/**
 * A note is text on the note edge (US-28 S12, frame p1): the house's one
 * non-stage edge (`--edge-note`) and the board's own stock, no fill, no
 * shadow. The editable InlineNoteEditor (board-room-shell.tsx) wears the
 * same dress, so a note being edited does not jump.
 */
function NoteCard({ row }: { row: ProposalBoardItem }) {
  return (
    <div
      className="br-note h-full w-full select-none overflow-hidden"
      style={{
        borderLeft: 'var(--edge-note)',
        padding: '4px 0 4px 16px',
        fontFamily: 'var(--font-body)',
        fontSize: '0.875rem',
        lineHeight: 1.5,
        color: 'var(--text-muted)',
      }}
    >
      <p className="whitespace-pre-wrap break-words">
        {row.content?.trim() ? row.content : 'Empty note'}
      </p>
    </div>
  );
}
