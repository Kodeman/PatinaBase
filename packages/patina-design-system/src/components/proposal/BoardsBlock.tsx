'use client'

import * as React from 'react'
import type { MoodBoardItemType, MoodBoardSection } from '@patina/types'
import { cn } from '../../utils/cn'
import { resolveMoodBoardGeometry } from '../../mood-board/geometry'

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
  /** Optional renderer/cache identity; not required persistence truth. */
  image_key?: string | null
  content?: string | null
  locked?: boolean
  data?: unknown
}

export interface BoardsBlockBoard {
  id: string
  name: string
  canvas_width: number
  canvas_height: number
  background_color: string
  sections?: MoodBoardSection[]
  items: BoardsBlockItem[]
}

/**
 * Read-only project/template snapshots may predate persisted item ids. Keep the
 * legacy `BoardsBlockItem` contract strict while allowing composition-only
 * renderers to consume those frozen rows without inventing an identity.
 */
export type BoardCompositionItem = Omit<BoardsBlockItem, 'id'> & { id?: string }

export interface BoardCompositionBoard extends Omit<BoardsBlockBoard, 'items'> {
  items: BoardCompositionItem[]
}

// Presentation = exactly today's client-facing render (the default everywhere).
// Detail = presentation PLUS quiet lead-time context on product/capture pins;
// captured-source provenance is visible in both modes. It never
// changes presentation output, so the client copy stays byte-stable.
export type BoardMode = 'presentation' | 'detail'

// Host-supplied per-pin decoration (mirrors the `mark` seam so this stays
// presentational — the caller owns all data/hooks). Both default to undefined,
// so a guest share (which passes neither) renders byte-identically to today.
//   • renderPinOverlay — a QUIET, non-interactive chip laid over any id-backed
//     pin (designer verdict chip · "price moved" drift badge). Gets the mode so
//     detail-only chips can gate themselves.
//   • renderPinDetail  — an INTERACTIVE block under a pin in the Featured list
//     (client Approve/Flag/Note · designer "send to the schedule").
export type RenderPinOverlay = (item: BoardsBlockItem, mode: BoardMode) => React.ReactNode
export type RenderPinDetail = (item: BoardsBlockItem) => React.ReactNode
export type RenderPinInteraction = (item: BoardCompositionItem) => React.ReactNode

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
  items: BoardCompositionItem[]
  sections: MoodBoardSection[]
  canvasWidth: number
  canvasHeight: number
  backgroundColor: string
  fit: 'contain' | 'width'
  fullBleed: boolean
  interactive: boolean
  onItemActivate?: (item: BoardCompositionItem) => void
  renderPinInteraction?: RenderPinInteraction
  renderItem: (item: BoardCompositionItem) => React.ReactNode
}

function ScaledBoardCanvas({
  items,
  sections,
  canvasWidth,
  canvasHeight,
  backgroundColor,
  fit,
  fullBleed,
  interactive,
  onItemActivate,
  renderPinInteraction,
  renderItem,
}: ScaledBoardCanvasProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [frame, setFrame] = React.useState({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    height: canvasHeight,
  })

  const geometry = React.useMemo(
    () =>
      resolveMoodBoardGeometry({
        canvasWidth,
        canvasHeight,
        backgroundColor,
        sections,
        items: items.map((item) => ({
          id: item.id,
          type: item.type as MoodBoardItemType,
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          zIndex: item.z_index,
          rotation: item.rotation,
          locked: item.locked,
          imageUrl: item.image_url,
          imageKey: item.image_key,
          content: item.content,
          data:
            item.data && typeof item.data === 'object' && !Array.isArray(item.data)
              ? (item.data as Record<string, unknown>)
              : {},
        })),
      }),
    [backgroundColor, canvasHeight, canvasWidth, items, sections],
  )

  useIsomorphicLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return

    const measure = () => {
      const width = el.clientWidth
      if (width <= 0) return
      const widthScale = width / canvasWidth
      const availableHeight = el.clientHeight
      const scale =
        fit === 'contain' && availableHeight > 0
          ? Math.min(widthScale, availableHeight / canvasHeight)
          : widthScale
      const height = fullBleed && availableHeight > 0 ? availableHeight : canvasHeight * scale
      setFrame({
        scale,
        offsetX: fit === 'contain' ? (width - canvasWidth * scale) / 2 : 0,
        offsetY: fit === 'contain' ? Math.max(0, (height - canvasHeight * scale) / 2) : 0,
        height,
      })
    }

    measure()

    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [canvasHeight, canvasWidth, fit, fullBleed])

  return (
    <div
      ref={containerRef}
      data-board-composition-canvas="true"
      data-fit={fit}
      data-full-bleed={fullBleed ? 'true' : 'false'}
      data-canvas-width={canvasWidth}
      data-canvas-height={canvasHeight}
      className={cn(
        'relative w-full overflow-hidden',
        !fullBleed && 'rounded-md border border-[var(--border-subtle)]',
        fullBleed && 'h-full min-h-0',
      )}
      style={{ height: frame.height }}
    >
      <div
        className="absolute left-0 top-0"
        style={{
          width: canvasWidth,
          height: canvasHeight,
          backgroundColor,
          transform: `translate(${frame.offsetX}px, ${frame.offsetY}px) scale(${frame.scale})`,
          transformOrigin: 'top left',
        }}
      >
        {geometry.sections.map((section) => (
          <div
            key={section.id}
            data-composition-section={section.id}
            className="pointer-events-none absolute rounded-sm border border-dashed"
            style={{
              left: section.bounds.x,
              top: section.bounds.y,
              width: section.bounds.width,
              height: section.bounds.height,
              borderColor: section.color ?? '#8c8175',
              backgroundColor: `${section.color ?? '#8c8175'}10`,
            }}
          >
            <span
              className="absolute left-2 top-0 -translate-y-1/2 rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{
                backgroundColor: section.color ?? '#8c8175',
                color: '#fff',
              }}
            >
              {section.name}
            </span>
          </div>
        ))}
        {geometry.items.map((resolved) => {
          const item = items[resolved.sourceIndex]
          if (!item) return null
          const idInteractive = interactive && typeof item.id === 'string'
          const interaction = idInteractive ? renderPinInteraction?.(item) : null
          return (
            <div
              key={resolved.key}
              className={cn(
                'absolute outline-none',
                idInteractive &&
                  'focus-visible:ring-2 focus-visible:ring-[var(--color-clay,#a66d4f)]',
              )}
              role={idInteractive ? 'button' : undefined}
              tabIndex={idInteractive ? 0 : undefined}
              aria-label={idInteractive ? `${item.type.replace('_', ' ')} board item` : undefined}
              data-board-item-id={item.id}
              data-board-snapshot-key={resolved.key}
              data-interactive={idInteractive ? 'true' : 'false'}
              style={{
                left: resolved.x,
                top: resolved.y,
                width: resolved.width,
                height: resolved.height,
                zIndex: Math.max(0, resolved.zIndex),
                transform: resolved.rotation ? `rotate(${resolved.rotation}deg)` : undefined,
                transformOrigin: 'center',
              }}
              onClick={idInteractive ? () => onItemActivate?.(item) : undefined}
              onKeyDown={
                idInteractive
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onItemActivate?.(item)
                      }
                    }
                  : undefined
              }
            >
              {renderItem(item)}
              {interaction && (
                <div
                  className="absolute right-1 top-1 z-20"
                  data-pin-interaction="true"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  {interaction}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Item renderers (read-only, client-facing tone) ──────────────────────────

function renderBoardItem(
  item: BoardCompositionItem,
  mode: BoardMode = 'presentation',
  renderPinOverlay?: RenderPinOverlay,
): React.ReactNode {
  let tile: React.ReactNode

  switch (item.type) {
    case 'product':
    case 'capture':
      tile = <ProductTile item={item} mode={mode} />
      break
    case 'image':
      tile = <ImageTile item={item} />
      break
    case 'room_scan':
      tile = <RoomScanTile item={item} />
      break
    case 'palette':
      tile = <PaletteStrip item={item} />
      break
    case 'note':
      tile = <NoteCard item={item} />
      break
    default:
      return null
  }

  // Verdicts are anchored by board_item_id, so frozen snapshots without ids
  // deliberately keep their plain, non-interactive presentation.
  if (!renderPinOverlay || typeof item.id !== 'string') return tile
  const overlay = renderPinOverlay(item as BoardsBlockItem, mode)
  if (!overlay) return tile

  return (
    <div className="relative h-full w-full">
      {tile}
      <div
        className="absolute right-1 top-1 z-10 flex flex-col items-end gap-1"
        data-pin-overlay="true"
      >
        {overlay}
      </div>
    </div>
  )
}

function ProductTile({
  item,
  mode = 'presentation',
}: {
  item: BoardCompositionItem
  mode?: BoardMode
}) {
  const snap = (item.data ?? {}) as ProductSnapshot
  const imageUrl = item.image_url ?? snap.image_url ?? null
  // Provenance is artifact truth in every composition surface. Lead time
  // remains designer-detail context, but the captured source never disappears.
  const host = sourceHost(snap.source_url)
  const leadWeeks =
    mode === 'detail' && typeof snap.lead_time_weeks === 'number' ? snap.lead_time_weeks : null

  return (
    <div className="flex h-full w-full select-none flex-col overflow-hidden rounded-sm border border-[var(--border-subtle)] bg-white">
      <div
        className="relative w-full overflow-hidden"
        style={{
          aspectRatio: '1 / 1',
          background: 'var(--color-pearl, #f5f3ee)',
        }}
      >
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={snap.name ?? ''}
            draggable={false}
            className="pointer-events-none h-full w-full object-contain"
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
        {/* Lead time is detail-only; provenance is always visible. */}
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

function ImageTile({ item }: { item: BoardCompositionItem }) {
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
      className="pointer-events-none h-full w-full select-none rounded-sm object-contain"
    />
  )
}

function RoomScanTile({ item }: { item: BoardCompositionItem }) {
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
            className="pointer-events-none h-full w-full object-contain"
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

function PaletteStrip({ item }: { item: BoardCompositionItem }) {
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

function NoteCard({ item }: { item: BoardCompositionItem }) {
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

function StackedBoardItems({
  items,
  sections,
  mode,
  renderPinOverlay,
  interactive,
  onItemActivate,
  renderPinInteraction,
}: {
  items: BoardCompositionItem[]
  sections: MoodBoardSection[]
  mode: BoardMode
  renderPinOverlay?: RenderPinOverlay
  interactive: boolean
  onItemActivate?: (item: BoardCompositionItem) => void
  renderPinInteraction?: RenderPinInteraction
}) {
  const sectionId = (item: BoardCompositionItem) => {
    if (!item.data || typeof item.data !== 'object' || Array.isArray(item.data)) return null
    const value = (item.data as Record<string, unknown>).section_id
    return typeof value === 'string' ? value : null
  }
  const known = new Set(sections.map((section) => section.id))
  const groups = [
    ...sections.map((section) => ({
      section,
      items: items.filter((item) => sectionId(item) === section.id),
    })),
    {
      section: null,
      items: items.filter((item) => {
        const id = sectionId(item)
        return id === null || !known.has(id)
      }),
    },
  ].filter((group) => group.items.length > 0)

  return (
    <div
      className="grid grid-cols-2 gap-2.5"
      data-stacked-board-items={renderPinOverlay || interactive ? 'true' : undefined}
    >
      {groups.map((group, groupIndex) => (
        <React.Fragment key={group.section?.id ?? 'unassigned'}>
          {group.section && (
            <h4
              className="col-span-2 mt-2 border-b border-[var(--border-subtle)] pb-1 type-meta-small text-[var(--text-muted)] first:mt-0"
              data-stacked-section={group.section.id}
            >
              {group.section.name}
            </h4>
          )}
          {group.items.map((item, itemIndex) => {
            const key = item.id ?? `snapshot:${groupIndex}:${itemIndex}`
            const idBacked = typeof item.id === 'string'
            const idInteractive = interactive && idBacked
            const overlay = idBacked ? renderPinOverlay?.(item as BoardsBlockItem, mode) : null
            const interaction = idInteractive ? renderPinInteraction?.(item) : null
            const hasPinChrome = Boolean(idInteractive || overlay || interaction)
            const frame = (
              children: React.ReactNode,
              baseClassName?: string,
              style?: React.CSSProperties,
            ) => {
              const frameClassName = cn(
                baseClassName,
                (overlay || interaction) && 'relative',
                idInteractive &&
                  'outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-clay,#a66d4f)]',
              )

              return (
                <div
                  key={key}
                  className={frameClassName || undefined}
                  style={style}
                  role={idInteractive ? 'button' : undefined}
                  tabIndex={idInteractive ? 0 : undefined}
                  aria-label={
                    idInteractive ? `${item.type.replace('_', ' ')} board item` : undefined
                  }
                  data-board-item-id={hasPinChrome ? item.id : undefined}
                  data-board-item-type={hasPinChrome ? item.type : undefined}
                  data-stacked-board-item={hasPinChrome ? 'true' : undefined}
                  data-interactive={hasPinChrome ? (idInteractive ? 'true' : 'false') : undefined}
                  onClick={idInteractive ? () => onItemActivate?.(item) : undefined}
                  onKeyDown={
                    idInteractive
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            onItemActivate?.(item)
                          }
                        }
                      : undefined
                  }
                >
                  {children}
                  {overlay && (
                    <div
                      className="absolute right-1 top-1 z-10 flex flex-col items-end gap-1"
                      data-pin-overlay="true"
                    >
                      {overlay}
                    </div>
                  )}
                  {interaction && (
                    <div
                      className="absolute right-1 top-1 z-20"
                      data-pin-interaction="true"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      {interaction}
                    </div>
                  )}
                </div>
              )
            }

            switch (item.type) {
              case 'palette':
                return frame(<PaletteStrip item={item} />, 'col-span-2', {
                  height: 72,
                })
              case 'note': {
                if (!item.content?.trim()) return null
                const note = (
                  <p
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

                // Keep the no-callback guest markup byte-stable. A wrapper is
                // needed only when the note carries absolute pin chrome.
                if (!hasPinChrome) return React.cloneElement(note, { key })
                return frame(note, 'col-span-2')
              }
              case 'product':
              case 'capture':
                return frame(<ProductTile item={item} mode={mode} />)
              case 'image':
              case 'room_scan': {
                if (!item.image_url) return null
                return frame(
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image_url} alt="" className="h-full w-full object-contain" />,
                  'overflow-hidden rounded-sm',
                  {
                    aspectRatio: '4 / 3',
                    background: 'var(--color-pearl, #f5f3ee)',
                  },
                )
              }
              default:
                return null
            }
          })}
        </React.Fragment>
      ))}
    </div>
  )
}

// ─── Featured pieces (product/capture snapshots, list style) ─────────────────

function FeaturedPieces({
  items,
  renderPinDetail,
}: {
  items: BoardCompositionItem[]
  renderPinDetail?: RenderPinDetail
}) {
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
        {pieces.map((item, itemIndex) => {
          const itemKey = item.id ?? `featured-snapshot:${itemIndex}`
          const snap = (item.data ?? {}) as ProductSnapshot
          const imageUrl = item.image_url ?? snap.image_url ?? null
          // Host-supplied per-pin acts (client verdicts · send-to-schedule).
          const detail = item.id ? renderPinDetail?.(item as BoardsBlockItem) : null
          const row = (
            <>
              {imageUrl && (
                <div
                  className="h-12 w-12 flex-shrink-0 overflow-hidden rounded"
                  style={{ background: 'var(--color-pearl, #f5f3ee)' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt="" className="h-full w-full object-contain" />
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
            </>
          )
          // Byte-identical to the original list row when no detail is supplied.
          if (!detail) {
            return (
              <li
                key={itemKey}
                className="flex items-center gap-3 rounded-[3px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2.5"
              >
                {row}
              </li>
            )
          }
          return (
            <li
              key={itemKey}
              className="rounded-[3px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2.5"
            >
              <div className="flex items-center gap-3">{row}</div>
              <div className="mt-2">{detail}</div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ─── Single board composition (name + desktop canvas + mobile + featured) ────

export interface BoardCompositionProps {
  board: BoardsBlockBoard | BoardCompositionBoard
  className?: string
  /**
   * 'presentation' (default) is exactly the client-facing render.
   * 'detail' additionally overlays lead-time on product/capture pins — used
   * by the designer editor's preview toggle. See BoardMode.
   */
  mode?: BoardMode
  /** Quiet non-interactive overlay for any id-backed pin (verdict chip · drift badge). */
  renderPinOverlay?: RenderPinOverlay
  /** Interactive per-pin block in the Featured list (verdict acts · send-to-schedule). */
  renderPinDetail?: RenderPinDetail
  /** Section definitions. Defaults to `board.sections` and omits empty bands. */
  sections?: MoodBoardSection[]
  /** Additive overrides for persisted board dimensions/background. */
  canvasWidth?: number
  canvasHeight?: number
  backgroundColor?: string
  /** `width` for documents; `contain` for the full-viewport Present surface. */
  fit?: 'contain' | 'width'
  /** Removes the canvas card chrome and board-name heading. */
  fullBleed?: boolean
  /** Working-note visibility. @default true */
  showNotes?: boolean
  /** Enables id-backed, keyboard-focusable pin targets. @default false */
  interactive?: boolean
  onItemActivate?: (item: BoardCompositionItem) => void
  /** Optional id-backed control rendered over any pin when `interactive` is true. */
  renderPinInteraction?: RenderPinInteraction
}

/**
 * One board, rendered read-only: an authored scale-to-fit canvas on desktop, a
 * stacked grid on mobile, and a "Featured pieces" list. Renders nothing when the
 * board has no items. Used directly by compact surfaces (the drafting mirror);
 * BoardsBlock maps it across a proposal's boards for the full document surfaces.
 */
export function BoardComposition({
  board,
  className,
  mode = 'presentation',
  renderPinOverlay,
  renderPinDetail,
  sections = board.sections ?? [],
  canvasWidth = board.canvas_width,
  canvasHeight = board.canvas_height,
  backgroundColor = board.background_color,
  fit = 'width',
  fullBleed = false,
  showNotes = true,
  interactive = false,
  onItemActivate,
  renderPinInteraction,
}: BoardCompositionProps) {
  const items = (board.items ?? []).filter((item) => showNotes || item.type !== 'note')
  if (items.length === 0) return null

  return (
    <div
      className={cn(fullBleed && 'h-full min-h-0 w-full', className)}
      data-board-composition="true"
      data-full-bleed={fullBleed ? 'true' : 'false'}
    >
      {!fullBleed && (
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
      )}

      {/* Desktop: scale-to-fit canvas at the board's authored composition. */}
      <div className={cn('hidden sm:block', fullBleed && 'h-full min-h-0')}>
        <ScaledBoardCanvas
          items={items}
          sections={sections}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          backgroundColor={backgroundColor}
          fit={fit}
          fullBleed={fullBleed}
          interactive={interactive}
          onItemActivate={onItemActivate}
          renderPinInteraction={renderPinInteraction}
          renderItem={(item) => renderBoardItem(item, mode, renderPinOverlay)}
        />
      </div>

      {/* Mobile: stacked grid in the caller's array order (z-sorted). */}
      <div className="sm:hidden">
        <StackedBoardItems
          items={items}
          sections={sections}
          mode={mode}
          renderPinOverlay={renderPinOverlay}
          interactive={interactive}
          onItemActivate={onItemActivate}
          renderPinInteraction={renderPinInteraction}
        />
      </div>

      <FeaturedPieces items={items} renderPinDetail={renderPinDetail} />
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
  /** Quiet non-interactive overlay for any id-backed pin (verdict chip · drift badge). */
  renderPinOverlay?: RenderPinOverlay
  /** Interactive per-pin block in the Featured list (verdict acts · send-to-schedule). */
  renderPinDetail?: RenderPinDetail
  fit?: 'contain' | 'width'
  fullBleed?: boolean
  showNotes?: boolean
  interactive?: boolean
  onItemActivate?: (item: BoardsBlockItem) => void
  renderPinInteraction?: RenderPinInteraction
}

/**
 * Mood-board section of a proposal document. Renders every item-bearing board;
 * renders nothing when there is nothing to show. Callers own the engagement
 * wrapper (`data-section-type="boards"`) since it is client-portal-specific.
 */
export function BoardsBlock({
  boards,
  mark,
  heading = 'Mood Boards',
  mode = 'presentation',
  renderPinOverlay,
  renderPinDetail,
  fit = 'width',
  fullBleed = false,
  showNotes = true,
  interactive = false,
  onItemActivate,
  renderPinInteraction,
}: BoardsBlockProps) {
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
          <BoardComposition
            key={board.id}
            board={board}
            className="mt-6 first:mt-0"
            mode={mode}
            renderPinOverlay={renderPinOverlay}
            renderPinDetail={renderPinDetail}
            fit={fit}
            fullBleed={fullBleed}
            showNotes={showNotes}
            interactive={interactive}
            onItemActivate={
              onItemActivate
                ? (item) => {
                    if (item.id) onItemActivate(item as BoardsBlockItem)
                  }
                : undefined
            }
            renderPinInteraction={renderPinInteraction}
          />
        ))}
      </section>
    </>
  )
}
