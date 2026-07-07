'use client'

import * as React from 'react'

// ============================================================================
// Shared mood-board rendering (client proposal · designer preview · drafting
// mirror). Promoted verbatim from the client portal's board-block.tsx so the
// three surfaces render the SAME boards (R86 "preview is truth"). Presentational
// only — NO @patina/supabase imports; the caller resolves board items and passes
// them in. Section chrome that differs per surface (the client's StrataMark, the
// mirror's compact label) stays with the caller: StrataMark rides in via `mark`,
// and the mirror composes single boards through the exported BoardComposition.
// ============================================================================

// Minimal structural item shape — a superset-compatible subset of
// @patina/supabase's ProposalBoardItem. PostgREST can hand NUMERIC columns back
// as strings, so geometry is coerced with Number() at the point of use (the
// same defensiveness the client render has always carried).
export interface BoardsBlockItem {
  id: string
  type: string
  x: number | string
  y: number | string
  width: number | string
  height: number | string | null
  z_index?: number | null
  rotation?: number | string | null
  image_url?: string | null
  content?: string | null
  data?: unknown
}

export interface BoardsBlockBoard {
  id: string
  name: string
  canvas_width: number
  canvas_height: number
  background_color: string
  items: BoardsBlockItem[]
}

// Presentation = exactly today's client-facing render (the default everywhere).
// Detail = presentation PLUS quiet product context on product/capture pins
// (lead time + provenance), for the designer's editor preview toggle. It never
// changes presentation output, so the client copy stays byte-stable.
export type BoardMode = 'presentation' | 'detail'

// ─── Snapshot shapes (written by the designer board editor into `data`) ──────

interface ProductSnapshot {
  name?: string | null
  price_cents?: number | null
  vendor_name?: string | null
  image_url?: string | null
  // Read only in detail mode, rendered when present (the editor may not have
  // captured them — dormant until it does).
  lead_time_weeks?: number | null
  source_url?: string | null
}

interface PaletteSwatchSnapshot {
  hex: string
  role?: string | null
  name?: string | null
}

interface PaletteSnapshot {
  name?: string | null
  swatches?: PaletteSwatchSnapshot[]
}

interface RoomScanSnapshot {
  name?: string | null
  room_type?: string | null
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`
}

// Bare host for the provenance line ("west-elm.com"), stripped of a leading
// www. Returns null for anything that isn't a parseable absolute URL.
function sourceHost(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).host.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

// ─── Scaled canvas (dependency-free scale-to-fit) ────────────────────────────
// A sibling of BoardStatic, but keyed off the flat DB row shape (x/y/width/
// height directly, height:null → CSS auto) rather than BoardStatic's
// position/size objects — kept identical to the client render it replaces.

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect

interface ScaledBoardCanvasProps {
  items: BoardsBlockItem[]
  canvasWidth: number
  canvasHeight: number
  backgroundColor: string
  renderItem: (item: BoardsBlockItem) => React.ReactNode
}

function ScaledBoardCanvas({
  items,
  canvasWidth,
  canvasHeight,
  backgroundColor,
  renderItem,
}: ScaledBoardCanvasProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = React.useState(1)

  useIsomorphicLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return

    const measure = () => {
      const width = el.clientWidth
      if (width > 0) setScale(width / canvasWidth)
    }

    measure()

    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [canvasWidth])

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
              height: item.height === null || item.height === undefined ? undefined : Number(item.height),
              zIndex: item.z_index ?? 0,
              transform: item.rotation ? `rotate(${Number(item.rotation)}deg)` : undefined,
            }}
          >
            {renderItem(item)}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Item renderers (read-only, client-facing tone) ──────────────────────────

function renderBoardItem(item: BoardsBlockItem, mode: BoardMode = 'presentation'): React.ReactNode {
  switch (item.type) {
    case 'product':
    case 'capture':
      return <ProductTile item={item} mode={mode} />
    case 'image':
      return <ImageTile item={item} />
    case 'room_scan':
      return <RoomScanTile item={item} />
    case 'palette':
      return <PaletteStrip item={item} />
    case 'note':
      return <NoteCard item={item} />
    default:
      return null
  }
}

function ProductTile({ item, mode = 'presentation' }: { item: BoardsBlockItem; mode?: BoardMode }) {
  const snap = (item.data ?? {}) as ProductSnapshot
  const imageUrl = item.image_url ?? snap.image_url ?? null
  // Detail-only context, computed once; renders nothing when absent.
  const host = mode === 'detail' ? sourceHost(snap.source_url) : null
  const leadWeeks =
    mode === 'detail' && typeof snap.lead_time_weeks === 'number' ? snap.lead_time_weeks : null

  return (
    <div className="flex h-full w-full select-none flex-col overflow-hidden rounded-sm border border-[var(--border-subtle)] bg-white">
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
        {/* Detail mode: quiet lead-time + provenance context. Guarded so
            presentation output is byte-identical. */}
        {leadWeeks !== null && (
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.62rem',
              color: 'var(--text-muted)',
            }}
          >
            {leadWeeks} wk lead time
          </div>
        )}
        {host && (
          <div
            className="truncate"
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '0.58rem',
              letterSpacing: '0.02em',
              color: 'var(--text-muted)',
            }}
          >
            {host}
          </div>
        )}
      </div>
    </div>
  )
}

function ImageTile({ item }: { item: BoardsBlockItem }) {
  if (!item.image_url) {
    return (
      <div
        className="h-full w-full rounded-sm"
        style={{ background: 'var(--color-pearl, #f5f3ee)' }}
      />
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.image_url}
      alt=""
      draggable={false}
      className="pointer-events-none h-full w-full select-none rounded-sm object-cover"
    />
  )
}

function RoomScanTile({ item }: { item: BoardsBlockItem }) {
  const snap = (item.data ?? {}) as RoomScanSnapshot
  return (
    <div className="flex h-full w-full select-none flex-col overflow-hidden rounded-sm border border-[var(--border-subtle)] bg-white">
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
  )
}

function PaletteStrip({ item }: { item: BoardsBlockItem }) {
  const snap = (item.data ?? {}) as PaletteSnapshot
  const swatches = snap.swatches ?? []

  return (
    <div className="flex h-full w-full select-none flex-col overflow-hidden rounded-sm border border-[var(--border-subtle)] bg-white">
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
  )
}

function NoteCard({ item }: { item: BoardsBlockItem }) {
  if (!item.content?.trim()) return null
  return (
    <div
      className="h-full w-full select-none overflow-hidden rounded-sm p-3"
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
  )
}

// ─── Mobile fallback (stacked grid, in the array's z/created order) ──────────

function StackedBoardItems({ items }: { items: BoardsBlockItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {items.map((item) => {
        switch (item.type) {
          case 'palette':
            return (
              <div key={item.id} className="col-span-2" style={{ height: 72 }}>
                <PaletteStrip item={item} />
              </div>
            )
          case 'note':
            if (!item.content?.trim()) return null
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
            )
          case 'product':
          case 'capture':
            return (
              <div key={item.id}>
                <ProductTile item={item} />
              </div>
            )
          case 'image':
          case 'room_scan': {
            if (!item.image_url) return null
            return (
              <div
                key={item.id}
                className="overflow-hidden rounded-sm"
                style={{ aspectRatio: '4 / 3', background: 'var(--color-pearl, #f5f3ee)' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.image_url} alt="" className="h-full w-full object-cover" />
              </div>
            )
          }
          default:
            return null
        }
      })}
    </div>
  )
}

// ─── Featured pieces (product/capture snapshots, list style) ─────────────────

function FeaturedPieces({ items }: { items: BoardsBlockItem[] }) {
  const pieces = items.filter((item) => item.type === 'product' || item.type === 'capture')
  if (pieces.length === 0) return null

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
          const snap = (item.data ?? {}) as ProductSnapshot
          const imageUrl = item.image_url ?? snap.image_url ?? null
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
          )
        })}
      </ul>
    </div>
  )
}

// ─── Single board composition (name + desktop canvas + mobile + featured) ────

export interface BoardCompositionProps {
  board: BoardsBlockBoard
  className?: string
  /**
   * 'presentation' (default) is exactly the client-facing render.
   * 'detail' additionally overlays lead-time + provenance on product/capture
   * pins — used by the designer editor's preview toggle. See BoardMode.
   */
  mode?: BoardMode
}

/**
 * One board, rendered read-only: an authored scale-to-fit canvas on desktop, a
 * stacked grid on mobile, and a "Featured pieces" list. Renders nothing when the
 * board has no items. Used directly by compact surfaces (the drafting mirror);
 * BoardsBlock maps it across a proposal's boards for the full document surfaces.
 */
export function BoardComposition({ board, className, mode = 'presentation' }: BoardCompositionProps) {
  const items = board.items ?? []
  if (items.length === 0) return null

  return (
    <div className={className}>
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
          renderItem={(item) => renderBoardItem(item, mode)}
        />
      </div>

      {/* Mobile: stacked grid in the caller's array order (z-sorted). */}
      <div className="sm:hidden">
        <StackedBoardItems items={items} />
      </div>

      <FeaturedPieces items={items} />
    </div>
  )
}

// ─── Section (all boards on a proposal) ──────────────────────────────────────

export interface BoardsBlockProps {
  boards: BoardsBlockBoard[]
  /**
   * Optional device rendered before the section — the client passes its
   * StrataMark divider; document surfaces without one pass nothing.
   */
  mark?: React.ReactNode
  /** Section heading. Defaults to "Mood Boards". */
  heading?: string
  /**
   * 'presentation' (default) is the client-facing render; 'detail' overlays
   * product context (editor preview only). Client + preview + drafting-mirror
   * callers omit it, so their render is unchanged.
   */
  mode?: BoardMode
}

/**
 * Mood-board section of a proposal document. Renders every item-bearing board;
 * renders nothing when there is nothing to show. Callers own the engagement
 * wrapper (`data-section-type="boards"`) since it is client-portal-specific.
 */
export function BoardsBlock({ boards, mark, heading = 'Mood Boards', mode = 'presentation' }: BoardsBlockProps) {
  const visible = (boards ?? []).filter((b) => (b.items?.length ?? 0) > 0)
  if (visible.length === 0) return null

  return (
    <>
      {mark}
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
          {heading}
        </h2>
        {visible.map((board) => (
          <BoardComposition key={board.id} board={board} className="mt-6 first:mt-0" mode={mode} />
        ))}
      </section>
    </>
  )
}
