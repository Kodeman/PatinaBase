'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  useBoard,
  type ProposalBoardItem,
  type ProposalBoardSummary,
} from '@patina/supabase';
import { StrataMark } from '@/components/strata-mark';

// ─── Snapshot shapes (written by the designer board editor into `data`) ──────
// Mirrors the designer portal's board-item-renderer vocabulary — apps don't
// import each other's components, so the visual language is ported here with
// a client-facing (hospitality) tone.

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

// ─── Scaled canvas (local port of @patina/design-system BoardStatic) ─────────
// The client portal resolves the design system from its built dist/, which
// predates BoardStatic — so the dependency-free scale-to-fit logic is ported
// here verbatim. Swap to `import { BoardStatic } from '@patina/design-system'`
// once the package dist is rebuilt.

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface ScaledBoardCanvasProps {
  items: ProposalBoardItem[];
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
  renderItem: (item: ProposalBoardItem) => ReactNode;
}

function ScaledBoardCanvas({
  items,
  canvasWidth,
  canvasHeight,
  backgroundColor,
  renderItem,
}: ScaledBoardCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useIsomorphicLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const width = el.clientWidth;
      if (width > 0) setScale(width / canvasWidth);
    };

    measure();

    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [canvasWidth]);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-md border border-[var(--border-subtle)]"
      style={{ height: canvasHeight * scale }}
    >
      <div
        className="relative"
        style={{
          width: canvasWidth,
          height: canvasHeight,
          backgroundColor,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="absolute"
            style={{
              left: Number(item.x),
              top: Number(item.y),
              width: Number(item.width),
              height: item.height === null ? undefined : Number(item.height),
              zIndex: item.z_index ?? 0,
              transform: item.rotation ? `rotate(${Number(item.rotation)}deg)` : undefined,
            }}
          >
            {renderItem(item)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Item renderers (board-item-renderer visual language, client tone) ───────

function renderClientBoardItem(item: ProposalBoardItem): ReactNode {
  switch (item.type) {
    case 'product':
    case 'capture':
      return <ProductTile item={item} />;
    case 'image':
      return <ImageTile item={item} />;
    case 'room_scan':
      return <RoomScanTile item={item} />;
    case 'palette':
      return <PaletteStrip item={item} />;
    case 'note':
      return <NoteCard item={item} />;
    default:
      return null;
  }
}

function ProductTile({ item }: { item: ProposalBoardItem }) {
  const snap = (item.data ?? {}) as ProductSnapshot;
  const imageUrl = item.image_url ?? snap.image_url ?? null;

  return (
    <div className="flex h-full w-full select-none flex-col overflow-hidden rounded-sm border border-[var(--border-subtle)] bg-white shadow-sm">
      <div
        className="relative w-full overflow-hidden"
        style={{ aspectRatio: '1 / 1', background: 'var(--color-pearl, #f5f3ee)' }}
      >
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={snap.name ?? ''}
            draggable={false}
            className="pointer-events-none h-full w-full object-cover"
          />
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
          {snap.name ?? 'Selected piece'}
        </div>
        {snap.vendor_name && (
          <div
            className="truncate"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.64rem',
              fontStyle: 'italic',
              color: 'var(--text-muted)',
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

function ImageTile({ item }: { item: ProposalBoardItem }) {
  if (!item.image_url) {
    return (
      <div
        className="h-full w-full rounded-sm"
        style={{ background: 'var(--color-pearl, #f5f3ee)' }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.image_url}
      alt=""
      draggable={false}
      className="pointer-events-none h-full w-full select-none rounded-sm object-cover shadow-sm"
    />
  );
}

function RoomScanTile({ item }: { item: ProposalBoardItem }) {
  const snap = (item.data ?? {}) as RoomScanSnapshot;
  return (
    <div className="flex h-full w-full select-none flex-col overflow-hidden rounded-sm border border-[var(--border-subtle)] bg-white shadow-sm">
      <div
        className="relative min-h-0 flex-1"
        style={{ background: 'var(--color-pearl, #f5f3ee)' }}
      >
        {item.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt={snap.name ?? 'Your space'}
            draggable={false}
            className="pointer-events-none h-full w-full object-cover"
          />
        )}
      </div>
      <div
        className="truncate px-2 py-1"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.56rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
        }}
      >
        {snap.name ?? 'Your space'}
      </div>
    </div>
  );
}

function PaletteStrip({ item }: { item: ProposalBoardItem }) {
  const snap = (item.data ?? {}) as PaletteSnapshot;
  const swatches = snap.swatches ?? [];

  return (
    <div className="flex h-full w-full select-none flex-col overflow-hidden rounded-sm border border-[var(--border-subtle)] bg-white shadow-sm">
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
          <div className="h-full w-full" style={{ background: 'var(--color-pearl, #f5f3ee)' }} />
        )}
      </div>
      <div
        className="truncate px-2 py-1"
        style={{
          fontFamily: 'var(--font-display)',
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

function NoteCard({ item }: { item: ProposalBoardItem }) {
  if (!item.content?.trim()) return null;
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
      <p className="whitespace-pre-wrap break-words">{item.content}</p>
    </div>
  );
}

// ─── Mobile fallback (stacked grid, ordered by z then created) ───────────────

function StackedBoardItems({ items }: { items: ProposalBoardItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {items.map((item) => {
        switch (item.type) {
          case 'palette':
            return (
              <div key={item.id} className="col-span-2" style={{ height: 72 }}>
                <PaletteStrip item={item} />
              </div>
            );
          case 'note':
            if (!item.content?.trim()) return null;
            return (
              <p
                key={item.id}
                className="col-span-2"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.82rem',
                  fontStyle: 'italic',
                  lineHeight: 1.6,
                  color: 'var(--text-body)',
                }}
              >
                {item.content}
              </p>
            );
          case 'product':
          case 'capture':
            return (
              <div key={item.id}>
                <ProductTile item={item} />
              </div>
            );
          case 'image':
          case 'room_scan': {
            if (!item.image_url) return null;
            return (
              <div
                key={item.id}
                className="overflow-hidden rounded-sm"
                style={{ aspectRatio: '4 / 3', background: 'var(--color-pearl, #f5f3ee)' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.image_url} alt="" className="h-full w-full object-cover" />
              </div>
            );
          }
          default:
            return null;
        }
      })}
    </div>
  );
}

// ─── Featured pieces (product/capture snapshots, SelectionsList style) ───────

function FeaturedPieces({ items }: { items: ProposalBoardItem[] }) {
  const pieces = items.filter(
    (item) => item.type === 'product' || item.type === 'capture'
  );
  if (pieces.length === 0) return null;

  return (
    <div className="mt-5">
      <p
        className="mb-1 type-meta-small text-[var(--text-muted)]"
        style={{ textTransform: 'uppercase', letterSpacing: '0.12em' }}
      >
        Featured pieces
      </p>
      <ul className="mt-2 space-y-3">
        {pieces.map((item) => {
          const snap = (item.data ?? {}) as ProductSnapshot;
          const imageUrl = item.image_url ?? snap.image_url ?? null;
          return (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-[3px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2.5"
            >
              {imageUrl && (
                <div
                  className="h-12 w-12 flex-shrink-0 overflow-hidden rounded"
                  style={{ background: 'var(--color-pearl, #f5f3ee)' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="type-body-small font-medium text-[var(--text-primary)]">
                  {snap.name ?? 'Selected piece'}
                </p>
                {snap.vendor_name && (
                  <p className="type-meta-small text-[var(--text-muted)]">{snap.vendor_name}</p>
                )}
              </div>
              {typeof snap.price_cents === 'number' && (
                <span className="type-meta text-[var(--text-primary)]">
                  {formatDollars(snap.price_cents)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Single board ─────────────────────────────────────────────────────────────

function BoardBlock({ board }: { board: ProposalBoardSummary }) {
  const { data } = useBoard(board.id);
  const items = data?.items ?? [];

  if (items.length === 0) return null;

  return (
    <div className="mt-6 first:mt-0">
      <h3
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: '1.05rem',
          color: 'var(--text-primary)',
          marginBottom: '0.75rem',
        }}
      >
        {board.name}
      </h3>

      {/* Desktop: scale-to-fit canvas at the board's authored composition. */}
      <div className="hidden sm:block">
        <ScaledBoardCanvas
          items={items}
          canvasWidth={board.canvas_width}
          canvasHeight={board.canvas_height}
          backgroundColor={board.background_color}
          renderItem={renderClientBoardItem}
        />
      </div>

      {/* Mobile: stacked grid in z/created order (useBoard returns z-sorted). */}
      <div className="sm:hidden">
        <StackedBoardItems items={items} />
      </div>

      <FeaturedPieces items={items} />
    </div>
  );
}

// ─── Section wrapper (wired into ProposalDocument) ───────────────────────────

interface BoardsBlockProps {
  boards: ProposalBoardSummary[];
}

/**
 * Mood-board section of the client proposal document. Renders every non-empty
 * board on the proposal; renders nothing when there is nothing to show.
 * The `data-section-type="boards"` wrapper plugs into ProposalDocument's
 * IntersectionObserver engagement tracking.
 */
export function BoardsBlock({ boards }: BoardsBlockProps) {
  const visible = boards.filter((b) => b.item_count > 0);
  if (visible.length === 0) return null;

  return (
    <div data-section-type="boards">
      <StrataMark variant="micro" />
      <section className="py-8">
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: '1.4rem',
            color: 'var(--text-primary)',
            marginBottom: '1.25rem',
          }}
        >
          Mood Boards
        </h2>
        {visible.map((board) => (
          <BoardBlock key={board.id} board={board} />
        ))}
      </section>
    </div>
  );
}
