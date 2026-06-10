'use client';

import type { ReactNode } from 'react';
import type { BoardItem } from '@patina/design-system';
import type { ProposalBoardItem } from '@patina/supabase';

// ─── Snapshot shapes (written by board-editor.tsx into `data` JSONB) ─────────

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
 * renderItem implementation for BoardCanvas / BoardStatic. The canvas item
 * wrapper sets position/size/rotation; everything here just fills it.
 *
 * `item.data` carries the full `proposal_board_items` row (the editor maps
 * rows → BoardItem with `data: row`), so renderers read display fields from
 * the row's `data` JSONB snapshot and fall back to `image_url`/`content`.
 */
export function renderBoardItem(item: BoardItem): ReactNode {
  const row = item.data as ProposalBoardItem;

  switch (item.type) {
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
          {item.type}
        </div>
      );
  }
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
          // eslint-disable-next-line @next/next/no-img-element
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

function ImageTile({ row }: { row: ProposalBoardItem }) {
  if (!row.image_url) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-sm border border-dashed border-[var(--border-default)] bg-[var(--bg-muted)] text-xs text-[var(--text-muted)]">
        Missing image
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
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
          // eslint-disable-next-line @next/next/no-img-element
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
