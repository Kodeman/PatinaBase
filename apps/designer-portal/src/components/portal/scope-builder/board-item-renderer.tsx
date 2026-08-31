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

// ─── Product / capture card ──────────────────────────────────────────────────

function ProductCard({ row }: { row: ProposalBoardItem }) {
  const snap = (row.data ?? {}) as ProductSnapshot;
  const imageUrl = row.image_url ?? snap.image_url ?? null;

  return (
    <div className="flex h-full w-full select-none flex-col overflow-hidden rounded-sm border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-sm">
      <div
        className="relative w-full overflow-hidden bg-[var(--bg-muted)]"
        style={{ aspectRatio: '1 / 1' }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={snap.name ?? ''}
            draggable={false}
            className="pointer-events-none h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ color: 'var(--text-muted)', fontSize: '0.62rem' }}
          >
            No image
          </div>
        )}
      </div>
      <div className="flex flex-col gap-0.5 p-2">
        <div
          className="line-clamp-2"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.74rem',
            color: 'var(--text-primary)',
          }}
        >
          {snap.name ?? 'Untitled product'}
        </div>
        {snap.vendor_name && (
          <div
            className="truncate"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.64rem',
              fontStyle: 'italic',
              color: 'var(--color-aged-oak)',
            }}
          >
            {snap.vendor_name}
          </div>
        )}
        {typeof snap.price_cents === 'number' && (
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 500,
              fontSize: '0.74rem',
              color: 'var(--text-primary)',
            }}
          >
            {formatDollars(snap.price_cents)}
          </div>
        )}
      </div>
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
 * edit-only affordance (Present's placeholder border is solid).
 */
function ImageTile({ row }: { row: ProposalBoardItem }) {
  if (!row.image_url) {
    const snap = (row.data ?? {}) as ImageSnapshot;
    return (
      <div className="flex h-full w-full select-none flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-[var(--border-default)] bg-[var(--bg-muted)] p-2 text-center">
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.62rem',
            color: 'var(--text-muted)',
          }}
        >
          {snap.name?.trim() ? snap.name : 'No image'}
        </span>
      </div>
    );
  }
  return (
    <img
      src={row.image_url}
      alt=""
      draggable={false}
      className="pointer-events-none h-full w-full select-none rounded-sm object-cover shadow-sm"
    />
  );
}

// ─── Room scan photo ─────────────────────────────────────────────────────────

function RoomScanTile({ row }: { row: ProposalBoardItem }) {
  const snap = (row.data ?? {}) as RoomScanSnapshot;
  return (
    <div className="flex h-full w-full select-none flex-col overflow-hidden rounded-sm border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-sm">
      <div className="relative min-h-0 flex-1 bg-[var(--bg-muted)]">
        {row.image_url ? (
          <img
            src={row.image_url}
            alt={snap.name ?? 'Room scan'}
            draggable={false}
            className="pointer-events-none h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ color: 'var(--text-muted)', fontSize: '0.62rem' }}
          >
            No preview
          </div>
        )}
      </div>
      <div
        className="truncate px-2 py-1"
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.56rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
        }}
      >
        Scan · {snap.name ?? 'Room'}
      </div>
    </div>
  );
}

// ─── Palette strip ───────────────────────────────────────────────────────────

function PaletteStrip({ row }: { row: ProposalBoardItem }) {
  const snap = (row.data ?? {}) as PaletteSnapshot;
  const swatches = snap.swatches ?? [];

  return (
    <div className="flex h-full w-full select-none flex-col overflow-hidden rounded-sm border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-sm">
      <div className="flex min-h-0 flex-1">
        {swatches.length > 0 ? (
          swatches.map((s, i) => (
            <div
              key={`${s.hex}-${i}`}
              className="h-full flex-1"
              style={{ backgroundColor: s.hex }}
              title={s.name ?? s.hex}
            />
          ))
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ color: 'var(--text-muted)', fontSize: '0.62rem' }}
          >
            Empty palette
          </div>
        )}
      </div>
      <div
        className="truncate px-2 py-1"
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.56rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
        }}
      >
        {snap.name ?? 'Palette'}
      </div>
    </div>
  );
}

// ─── Note (kraft-paper sticky) ───────────────────────────────────────────────

function NoteCard({ row }: { row: ProposalBoardItem }) {
  return (
    <div
      className="h-full w-full select-none overflow-hidden rounded-sm p-3 shadow-sm"
      style={{
        backgroundColor: '#F3E9D5',
        border: '1px solid #E0D2B8',
        fontFamily: 'var(--font-body)',
        fontSize: '0.78rem',
        lineHeight: 1.5,
        color: '#4A4137',
      }}
    >
      <p className="whitespace-pre-wrap break-words">
        {row.content?.trim() ? row.content : 'Empty note'}
      </p>
    </div>
  );
}
