'use client'

import * as React from 'react'
import type {
  BoardPoint,
  BoardRect,
  EditableMoodBoardItem,
  MoodBoardItemSnapshot,
  MoodBoardSection,
} from '@patina/types'
import { cn } from '../../utils/cn'
import {
  alignBoardItems,
  boardRectsIntersect,
  clampBoardZoom,
  computeBoardAutoGrow,
  DEFAULT_MOOD_BOARD_BACKGROUND,
  DEFAULT_MOOD_BOARD_CANVAS,
  DEFAULT_MOOD_BOARD_GRID_SIZE,
  distributeBoardItems,
  findBoardSmartGuides,
  fitBoardGeometry,
  marqueeIntersections,
  resolveMoodBoardGeometry,
  rotateBoardVector,
  rotatedResizeAnchorCorrection,
  screenPointToBoard,
  unionBoardRects,
  zoomBoardViewAtPoint,
  type BoardAlignment,
  type BoardAutoGrowResult,
  type BoardDistribution,
  type BoardGuide,
  type BoardPositionPatch,
  type BoardView,
} from '../../mood-board/geometry'

export interface BoardMoveSnapshot extends BoardPoint {
  id: string
}

export interface BoardItemsMovedCommit {
  itemIds: string[]
  before: BoardMoveSnapshot[]
  after: BoardMoveSnapshot[]
  delta: BoardPoint
  reason: 'drag' | 'keyboard' | 'align' | 'distribute'
  guides: BoardGuide[]
  /** Applied with the position patches so drag promotion is one command. */
  zIndexPatches?: Array<{ id: string; zIndex: number }>
}

export type BoardResizeHandle =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'

export interface BoardResizeGeometry {
  x: number
  y: number
  width: number
  height: number | null
  resolvedHeight: number
}

export interface BoardItemResizedCommit {
  itemId: string
  handle: BoardResizeHandle
  before: BoardResizeGeometry
  after: BoardResizeGeometry
}

export interface BoardResizeSnapshot extends BoardResizeGeometry {
  id: string
}

export interface BoardItemsResizedCommit {
  itemIds: string[]
  handle: BoardResizeHandle
  before: BoardResizeSnapshot[]
  after: BoardResizeSnapshot[]
  guides: BoardGuide[]
}

export interface BoardItemsAltDraggedCommit {
  itemIds: string[]
  before: BoardMoveSnapshot[]
  after: BoardMoveSnapshot[]
  delta: BoardPoint
  guides: BoardGuide[]
}

export interface BoardItemRotatedCommit {
  itemId: string
  before: number
  after: number
}

export interface BoardSelectionChangeMeta {
  reason: 'item' | 'marquee' | 'keyboard' | 'escape'
}

export interface BoardItemsDroppedCommit {
  point: BoardPoint
  files: File[]
  dataTransfer: DataTransfer
}

export interface BoardSectionMembershipCommit {
  itemId: string
  sectionId: string | null
}

export interface BoardSectionBandMovedCommit {
  sectionId: string
  itemIds: string[]
  delta: BoardPoint
}

export interface BoardSectionUpdatedCommit {
  sectionId: string
  patch: Partial<Omit<MoodBoardSection, 'id'>>
}

export interface BoardCanvasGrowCommit extends BoardAutoGrowResult {
  reason: 'move' | 'resize' | 'rotate' | 'align' | 'distribute' | 'keyboard'
}

export interface BoardContextMenuRequest {
  itemId: string | null
  clientPoint: BoardPoint
  source: 'pointer' | 'keyboard'
}

export interface BoardRoomCanvasProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'children' | 'onDrop' | 'onContextMenu' | 'onDrag' | 'onSelect'
> {
  boardName: string
  items: readonly EditableMoodBoardItem[]
  sections?: readonly MoodBoardSection[]
  canvasWidth?: number
  canvasHeight?: number
  backgroundColor?: string
  selectedItemIds?: readonly string[]
  onSelectionChange?: (
    itemIds: string[],
    meta: BoardSelectionChangeMeta,
  ) => void
  view?: BoardView
  defaultView?: BoardView
  onViewChange?: (
    view: BoardView,
    reason: 'pan' | 'zoom' | 'fit' | 'reset',
  ) => void
  onItemsMoved?: (commit: BoardItemsMovedCommit) => void
  onItemResized?: (commit: BoardItemResizedCommit) => void
  onItemsResized?: (commit: BoardItemsResizedCommit) => void
  onItemsAltDragged?: (
    commit: BoardItemsAltDraggedCommit,
  ) => readonly string[] | void
  onItemRotated?: (commit: BoardItemRotatedCommit) => void
  onItemsDropped?: (commit: BoardItemsDroppedCommit) => void
  onSectionMembership?: (commit: BoardSectionMembershipCommit) => void
  onSectionBandMoved?: (commit: BoardSectionBandMovedCommit) => void
  onSectionUpdated?: (commit: BoardSectionUpdatedCommit) => void
  onCanvasGrow?: (commit: BoardCanvasGrowCommit) => void
  onItemActivate?: (item: EditableMoodBoardItem) => void
  onContextMenuRequest?: (request: BoardContextMenuRequest) => void
  /**
   * Fires whenever a pointer gesture (move/resize/rotate/section-move/
   * marquee/pan) starts or ends. A host uses this to suspend anything that
   * shouldn't fire mid-gesture — e.g. window-level edit shortcuts that would
   * otherwise race a held modifier key against stale gesture state.
   */
  onGestureActiveChange?: (active: boolean) => void
  /**
   * Routes every canvas announcement to the host so the room speaks through
   * ONE live region instead of the canvas and the controller talking over
   * each other (CI-14). When omitted the canvas keeps its own sr-only region,
   * which is what a standalone/Storybook mount needs.
   */
  onAnnounce?: (message: string) => void
  renderItem: (item: EditableMoodBoardItem) => React.ReactNode
  showGrid?: boolean
  snapToGrid?: boolean
  gridSize?: number
  showGuides?: boolean
  showViewControls?: boolean
  showAlignmentControls?: boolean
  readOnly?: boolean
}

type PreviewGeometry = Partial<
  Pick<
    EditableMoodBoardItem,
    'x' | 'y' | 'width' | 'height' | 'rotation' | 'zIndex'
  >
> & {
  resolvedHeight?: number
}

interface PanGesture {
  kind: 'pan'
  pointerId: number
  startScreen: BoardPoint
  startPan: BoardPoint
}

interface MarqueeGesture {
  kind: 'marquee'
  pointerId: number
  start: BoardPoint
  current: BoardPoint
  /** Shift held: the marquee TOGGLES its hits against the live selection. */
  additive: boolean
}

/**
 * Two fingers on the surface: pinch-zoom and two-finger pan are the same
 * gesture. The board point that sat under the initial midpoint stays under
 * the midpoint for the whole gesture, so scale and translate fall out of one
 * calculation (CI-01).
 */
interface PinchGesture {
  kind: 'pinch'
  pointerId: number
  pointerIds: [number, number]
  startDistance: number
  startZoom: number
  anchor: BoardPoint
}

interface MoveGesture {
  kind: 'move'
  pointerId: number
  startScreen: BoardPoint
  leadId: string
  leadBounds: BoardRect
  itemIds: string[]
  before: BoardMoveSnapshot[]
  latest: BoardMoveSnapshot[]
  guides: BoardGuide[]
  /** Also gates whether the gesture has cleared the arming threshold (CI-04). */
  didMove: boolean
  duplicate: boolean
  sectionBounds: Array<{ id: string; bounds: BoardRect }>
}

interface ResizeGesture {
  kind: 'resize'
  pointerId: number
  startScreen: BoardPoint
  itemIds: string[]
  handle: BoardResizeHandle
  boundsBefore: BoardResizeGeometry
  before: BoardResizeSnapshot[]
  latest: BoardResizeSnapshot[]
  latestBounds: BoardResizeGeometry
  guides: BoardGuide[]
  preserveAspectByDefault: boolean
  /**
   * Rotation of the single item being resized, in degrees. Zero for a group
   * resize, which scales the axis-aligned union and has no local frame of its
   * own. Non-zero puts the pointer delta through the item's local frame
   * (CI-07).
   */
  rotation: number
}

interface SectionMoveGesture {
  kind: 'section-move'
  pointerId: number
  startScreen: BoardPoint
  sectionId: string
  itemIds: string[]
  before: BoardMoveSnapshot[]
  latest: BoardMoveSnapshot[]
}

interface RotateGesture {
  kind: 'rotate'
  pointerId: number
  itemId: string
  center: BoardPoint
  startPointerAngle: number
  before: number
  latest: number
}

type CanvasGesture =
  | PanGesture
  | PinchGesture
  | MarqueeGesture
  | MoveGesture
  | SectionMoveGesture
  | ResizeGesture
  | RotateGesture

const RESIZE_HANDLES: BoardResizeHandle[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
]
const ASPECT_LOCKED_TYPES = new Set([
  'product',
  'capture',
  'image',
  'room_scan',
])
const BOARD_LONG_PRESS_MS = 500
const BOARD_LONG_PRESS_MOVE_TOLERANCE_PX = 8
const BOARD_LONG_PRESS_SUPPRESSION_MS = 1_000
/** Screen-space travel a pointer must clear before a move gesture arms (CI-04). */
const BOARD_MOVE_ARM_THRESHOLD_PX = 3
/** Below this on-screen size, edge (non-corner) resize handles hide so they
 * don't bury the artwork (CI-10). */
const BOARD_EDGE_HANDLE_MIN_SCREEN_PX = 80
/**
 * Touch convention, matching FigJam: one finger PANS the canvas, two fingers
 * pinch/pan, and a marquee needs a long press on empty canvas first. A finger
 * that starts on a pin still drags that pin. Documented here because the
 * mouse convention is the opposite way round — a bare drag on empty canvas
 * marquees (CI-01).
 */
const BOARD_TOUCH_MARQUEE_LONG_PRESS_MS = 500

function pointerDistance(a: BoardPoint, b: BoardPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function pointerMidpoint(a: BoardPoint, b: BoardPoint): BoardPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/**
 * The corner a resize anchors against, in unit space — the one diagonally
 * opposite the dragged handle. An edge handle anchors the whole opposite edge,
 * hence the 0.5 on the free axis.
 */
function resizeAnchorPoint(handle: BoardResizeHandle): BoardPoint {
  return {
    x: handle.includes('w') ? 1 : handle.includes('e') ? 0 : 0.5,
    y: handle.includes('n') ? 1 : handle.includes('s') ? 0 : 0.5,
  }
}

const BOARD_ITEM_TYPE_LABELS: Record<string, string> = {
  product: 'product',
  capture: 'capture',
  image: 'image',
  palette: 'palette',
  note: 'note',
  room_scan: 'room scan',
}

/**
 * A pin announces what it actually is — the product's title, the note's own
 * text, the palette's name — never the bare type, which made every pin on a
 * board indistinguishable to a screen reader (CI-13).
 */
export function boardItemAccessibleName(
  item: Pick<EditableMoodBoardItem, 'type' | 'content' | 'data'>,
): string {
  const typeLabel =
    BOARD_ITEM_TYPE_LABELS[item.type] ?? item.type.replace('_', ' ')
  const named =
    typeof item.data?.name === 'string' ? item.data.name.trim() : ''
  const written = typeof item.content === 'string' ? item.content.trim() : ''
  const source = item.type === 'note' ? written || named : named || written
  if (!source) return `Untitled ${typeLabel}`
  const label = source.length > 80 ? `${source.slice(0, 79).trimEnd()}…` : source
  return `${label}, ${typeLabel}`
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/**
 * Reading order for keyboard traversal: rows top-to-bottom, then left-to-right
 * inside each row (CI-16). Rows are grown greedily from the topmost pin rather
 * than by rounding to a fixed band — a fixed band splits two pins that plainly
 * sit side by side just because the boundary falls between them.
 */
function spatialItemOrder(
  items: readonly { id?: string; x: number; y: number; height: number }[],
): string[] {
  const remaining = items
    .filter((item): item is typeof item & { id: string } => Boolean(item.id))
    .sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x))
  const order: string[] = []
  while (remaining.length > 0) {
    const head = remaining.shift()!
    const rowLimit = head.y + Math.max(24, head.height / 2)
    const row = [head]
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      if (remaining[index]!.y < rowLimit) row.push(...remaining.splice(index, 1))
    }
    row.sort((a, b) => (a.x !== b.x ? a.x - b.x : a.id.localeCompare(b.id)))
    order.push(...row.map((item) => item.id))
  }
  return order
}

function eventPoint(
  event: { clientX: number; clientY: number },
  element: HTMLElement,
): BoardPoint {
  const rect = element.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function rectFromPoints(a: BoardPoint, b: BoardPoint): BoardRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  }
}

function selectionLabel(count: number): string {
  if (count === 0) return 'Selection cleared'
  return count === 1 ? '1 item selected' : `${count} items selected`
}

function resizeGeometry(
  before: BoardResizeGeometry,
  handle: BoardResizeHandle,
  delta: BoardPoint,
  preserveAspect: boolean,
): BoardResizeGeometry {
  const min = 40
  const movesLeft = handle.includes('w')
  const movesRight = handle.includes('e')
  const movesTop = handle.includes('n')
  const movesBottom = handle.includes('s')
  let x = before.x
  let y = before.y
  let width = before.width
  let resolvedHeight = before.resolvedHeight

  if (movesLeft) {
    x = before.x + delta.x
    width = before.width - delta.x
  }
  if (movesRight) width = before.width + delta.x
  if (movesTop) {
    y = before.y + delta.y
    resolvedHeight = before.resolvedHeight - delta.y
  }
  if (movesBottom) resolvedHeight = before.resolvedHeight + delta.y

  if (
    preserveAspect &&
    (movesLeft || movesRight) &&
    (movesTop || movesBottom)
  ) {
    const aspect = before.width / before.resolvedHeight
    const widthChange =
      Math.abs(width - before.width) / Math.max(1, before.width)
    const heightChange =
      Math.abs(resolvedHeight - before.resolvedHeight) /
      Math.max(1, before.resolvedHeight)
    if (widthChange >= heightChange) {
      resolvedHeight = width / aspect
      if (movesTop) y = before.y + before.resolvedHeight - resolvedHeight
    } else {
      width = resolvedHeight * aspect
      if (movesLeft) x = before.x + before.width - width
    }
  } else if (preserveAspect && (movesLeft || movesRight)) {
    const aspect = before.width / before.resolvedHeight
    resolvedHeight = width / aspect
    y = before.y + (before.resolvedHeight - resolvedHeight) / 2
  } else if (preserveAspect && (movesTop || movesBottom)) {
    const aspect = before.width / before.resolvedHeight
    width = resolvedHeight * aspect
    x = before.x + (before.width - width) / 2
  }

  if (width < min) {
    width = min
    if (movesLeft) x = before.x + before.width - min
  }
  if (resolvedHeight < min) {
    resolvedHeight = min
    if (movesTop) y = before.y + before.resolvedHeight - min
  }

  const horizontalOnly = (movesLeft || movesRight) && !movesTop && !movesBottom
  const implicitAspectHeight = before.height === null && horizontalOnly
  return {
    x,
    y,
    width,
    height: implicitAspectHeight ? null : resolvedHeight,
    resolvedHeight,
  }
}

function resizeHandleAxes(handle: BoardResizeHandle) {
  return {
    horizontal: handle.includes('w') || handle.includes('e'),
    vertical: handle.includes('n') || handle.includes('s'),
    movesLeft: handle.includes('w'),
    movesTop: handle.includes('n'),
  }
}

/** Directional resize cursor per handle (CI-10); ignores item rotation. */
function resizeHandleCursor(handle: BoardResizeHandle): string {
  switch (handle) {
    case 'nw':
    case 'se':
      return 'nwse-resize'
    case 'ne':
    case 'sw':
      return 'nesw-resize'
    case 'n':
    case 's':
      return 'ns-resize'
    case 'e':
    case 'w':
    default:
      return 'ew-resize'
  }
}

/** A rotate-affordance cursor: browsers have no native "rotate" keyword. */
const ROTATE_HANDLE_CURSOR =
  'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'20\' height=\'20\' viewBox=\'0 0 20 20\'%3E%3Cpath d=\'M5 10a5 5 0 1 1 1.6 3.7M5 10v4h4\' fill=\'none\' stroke=\'%23000\' stroke-width=\'1.6\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E") 10 10, grab'

function resizeGeometryWithSnapping(
  before: BoardResizeGeometry,
  handle: BoardResizeHandle,
  rawDelta: BoardPoint,
  preserveAspect: boolean,
  options: {
    geometryItems: ReturnType<typeof resolveMoodBoardGeometry>['items']
    excludedIds: readonly string[]
    canvas: { width: number; height: number }
    zoom: number
    gridSize: number
    snapToGrid: boolean
    showGuides: boolean
    suppressSnapping: boolean
  },
): { geometry: BoardResizeGeometry; guides: BoardGuide[] } {
  const axes = resizeHandleAxes(handle)
  let delta = { ...rawDelta }
  let candidate = resizeGeometry(before, handle, delta, preserveAspect)

  if (options.snapToGrid && !options.suppressSnapping) {
    if (axes.horizontal) {
      const edge = axes.movesLeft
        ? candidate.x
        : candidate.x + candidate.width
      delta.x += Math.round(edge / options.gridSize) * options.gridSize - edge
    }
    if (axes.vertical) {
      const edge = axes.movesTop
        ? candidate.y
        : candidate.y + candidate.resolvedHeight
      delta.y += Math.round(edge / options.gridSize) * options.gridSize - edge
    }
    candidate = resizeGeometry(before, handle, delta, preserveAspect)
  }

  if (!options.showGuides || options.suppressSnapping) {
    return { geometry: candidate, guides: [] }
  }
  const guideResult = findBoardSmartGuides(
    {
      x: candidate.x,
      y: candidate.y,
      width: candidate.width,
      height: candidate.resolvedHeight,
    },
    options.geometryItems,
    {
      zoom: options.zoom,
      excludeKeys: options.excludedIds,
      canvas: options.canvas,
      movingValueIndices: {
        x: axes.horizontal ? [axes.movesLeft ? 0 : 2] : [],
        y: axes.vertical ? [axes.movesTop ? 0 : 2] : [],
      },
    },
  )
  if (axes.horizontal) delta.x += guideResult.delta.x
  if (axes.vertical) delta.y += guideResult.delta.y
  return {
    geometry: resizeGeometry(before, handle, delta, preserveAspect),
    guides: guideResult.guides,
  }
}

function scaleResizeGroup(
  before: readonly BoardResizeSnapshot[],
  boundsBefore: BoardResizeGeometry,
  desiredBounds: BoardResizeGeometry,
  handle: BoardResizeHandle,
): { bounds: BoardResizeGeometry; items: BoardResizeSnapshot[] } {
  const axes = resizeHandleAxes(handle)
  let scaleX = axes.horizontal
    ? desiredBounds.width / Math.max(1, boundsBefore.width)
    : 1
  let scaleY = axes.vertical
    ? desiredBounds.resolvedHeight / Math.max(1, boundsBefore.resolvedHeight)
    : 1
  const minimumScaleX = Math.max(
    0,
    ...before.map((item) => 40 / Math.max(1, item.width)),
  )
  const minimumScaleY = Math.max(
    0,
    ...before.map((item) => 40 / Math.max(1, item.resolvedHeight)),
  )
  const uniformScale =
    axes.horizontal &&
    axes.vertical &&
    Math.abs(scaleX - scaleY) < 0.000_001
  if (uniformScale) {
    const scale = Math.max(scaleX, minimumScaleX, minimumScaleY)
    scaleX = scale
    scaleY = scale
  } else {
    scaleX = Math.max(scaleX, minimumScaleX)
    scaleY = Math.max(scaleY, minimumScaleY)
  }
  const width = boundsBefore.width * scaleX
  const resolvedHeight = boundsBefore.resolvedHeight * scaleY
  const x = axes.movesLeft
    ? boundsBefore.x + boundsBefore.width - width
    : boundsBefore.x
  const y = axes.movesTop
    ? boundsBefore.y + boundsBefore.resolvedHeight - resolvedHeight
    : boundsBefore.y
  const bounds: BoardResizeGeometry = {
    x,
    y,
    width,
    height: resolvedHeight,
    resolvedHeight,
  }
  return {
    bounds,
    items: before.map((item) => {
      const nextHeight = item.resolvedHeight * scaleY
      return {
        ...item,
        x: x + (item.x - boundsBefore.x) * scaleX,
        y: y + (item.y - boundsBefore.y) * scaleY,
        width: item.width * scaleX,
        height: item.height === null ? null : nextHeight,
        resolvedHeight: nextHeight,
      }
    }),
  }
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false)
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])
  return reduced
}

/**
 * Controlled, presentational editing surface for the dedicated board room.
 * It owns only transient gesture/view state and emits one semantic commit per
 * completed gesture. It imports no persistence, data-fetching or auth layer.
 */
export const BoardRoomCanvas = React.forwardRef<
  HTMLDivElement,
  BoardRoomCanvasProps
>(
  (
    {
      boardName,
      items,
      sections = [],
      canvasWidth = DEFAULT_MOOD_BOARD_CANVAS.width,
      canvasHeight = DEFAULT_MOOD_BOARD_CANVAS.height,
      backgroundColor = DEFAULT_MOOD_BOARD_BACKGROUND,
      selectedItemIds = [],
      onSelectionChange,
      view,
      defaultView = { pan: { x: 32, y: 32 }, zoom: 1 },
      onViewChange,
      onItemsMoved,
      onItemResized,
      onItemsResized,
      onItemsAltDragged,
      onItemRotated,
      onItemsDropped,
      onSectionMembership,
      onSectionBandMoved,
      onSectionUpdated,
      onCanvasGrow,
      onItemActivate,
      onContextMenuRequest,
      onGestureActiveChange,
      onAnnounce,
      renderItem,
      showGrid = false,
      snapToGrid = false,
      gridSize = DEFAULT_MOOD_BOARD_GRID_SIZE,
      showGuides = true,
      showViewControls = true,
      showAlignmentControls = true,
      readOnly = false,
      className,
      style,
      ...props
    },
    forwardedRef,
  ) => {
    const viewportRef = React.useRef<HTMLDivElement | null>(null)
    const [internalView, setInternalView] =
      React.useState<BoardView>(defaultView)
    const activeView = view ?? internalView
    const [preview, setPreview] = React.useState<
      Record<string, PreviewGeometry>
    >({})
    const [altDragPreview, setAltDragPreview] = React.useState<
      BoardMoveSnapshot[] | null
    >(null)
    const [marquee, setMarquee] = React.useState<BoardRect | null>(null)
    const [guides, setGuides] = React.useState<BoardGuide[]>([])
    const [localAnnouncement, setLocalAnnouncement] = React.useState('')
    const [spaceHeld, setSpaceHeld] = React.useState(false)
    const [hoveredItemId, setHoveredItemId] = React.useState<string | null>(
      null,
    )
    const [viewportBox, setViewportBox] = React.useState({
      width: 0,
      height: 0,
    })
    const onAnnounceRef = React.useRef(onAnnounce)
    React.useEffect(() => {
      onAnnounceRef.current = onAnnounce
    }, [onAnnounce])
    // One live region for the room: with a host listening, the canvas stops
    // rendering its own and speaks through the host's instead (CI-14).
    const setAnnouncement = React.useCallback((message: string) => {
      const host = onAnnounceRef.current
      if (host) host(message)
      else setLocalAnnouncement(message)
    }, [])
    const [focusedItemId, setFocusedItemId] = React.useState<string | null>(
      null,
    )
    const gestureRef = React.useRef<CanvasGesture | null>(null)
    // Every reassignment of gestureRef.current goes through here so a host
    // (the board-room controller) can suspend window-level edit shortcuts
    // for as long as a pointer gesture is in flight — see
    // onGestureActiveChange. In-place mutation of the current gesture object
    // (e.g. gesture.didMove, gesture.latest) does not call this.
    const setGesture = React.useCallback(
      (next: CanvasGesture | null) => {
        const wasActive = gestureRef.current !== null
        gestureRef.current = next
        const isActive = next !== null
        if (wasActive !== isActive) onGestureActiveChange?.(isActive)
      },
      [onGestureActiveChange],
    )
    /**
     * Pointer-move preview state is written at most once per animation frame.
     * The gesture object itself still updates synchronously on every event —
     * a commit on pointerup reads `gesture.latest`, never the rendered
     * preview — so coalescing costs no fidelity, only renders (CI-25).
     */
    const frameRef = React.useRef<number | null>(null)
    const scheduledRef = React.useRef(false)
    const pendingPaintRef = React.useRef<(() => void) | null>(null)
    const flushPaint = React.useCallback(() => {
      scheduledRef.current = false
      frameRef.current = null
      const next = pendingPaintRef.current
      pendingPaintRef.current = null
      next?.()
    }, [])
    const schedulePaint = React.useCallback(
      (paint: () => void) => {
        pendingPaintRef.current = paint
        if (scheduledRef.current) return
        scheduledRef.current = true
        const handle = requestAnimationFrame(flushPaint)
        // A synchronous requestAnimationFrame has already run flushPaint by
        // now; storing its handle would leave a frame permanently "pending"
        // and stall every later paint.
        if (scheduledRef.current) frameRef.current = handle
      },
      [flushPaint],
    )
    const cancelScheduledPaint = React.useCallback(() => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
      scheduledRef.current = false
      pendingPaintRef.current = null
    }, [])
    React.useEffect(() => cancelScheduledPaint, [cancelScheduledPaint])

    /** Live touch points, keyed by pointerId, in viewport-local coordinates. */
    const touchPointsRef = React.useRef(new Map<number, BoardPoint>())
    const touchMarqueeRef = React.useRef<{
      pointerId: number
      timer: ReturnType<typeof setTimeout>
    } | null>(null)
    const longPressRef = React.useRef<{
      pointerId: number
      itemId: string
      startClient: BoardPoint
      clientPoint: BoardPoint
      timer: ReturnType<typeof setTimeout>
    } | null>(null)
    const suppressClickUntilRef = React.useRef(0)
    const suppressContextMenuUntilRef = React.useRef(0)
    const reducedMotion = useReducedMotion()
    const selectedSet = React.useMemo(
      () => new Set(selectedItemIds),
      [selectedItemIds],
    )
    // Mirrors the controlled `selectedItemIds` prop so a click immediately
    // followed by a shift-click (same tick, before the parent's echo lands)
    // computes its "add to selection" against the truth we just requested,
    // not a stale prop read. Root cause of the aria-pressed multi-select
    // regression: the shift-click branch below used to read `selectedItemIds`
    // directly, which could still be the pre-first-click value.
    const selectedItemIdsRef = React.useRef<readonly string[]>(selectedItemIds)
    React.useEffect(() => {
      selectedItemIdsRef.current = selectedItemIds
    }, [selectedItemIds])

    // Focus follows selection: the roving Tab stop lands on whatever the user
    // last singled out, so Tab back into the canvas resumes where they were
    // rather than at the start of the board (CI-16).
    React.useEffect(() => {
      if (selectedItemIds.length === 1) setFocusedItemId(selectedItemIds[0]!)
    }, [selectedItemIds])

    const cancelLongPress = React.useCallback((pointerId?: number) => {
      const pending = longPressRef.current
      if (!pending || (pointerId !== undefined && pending.pointerId !== pointerId))
        return
      clearTimeout(pending.timer)
      longPressRef.current = null
    }, [])

    React.useEffect(() => cancelLongPress, [cancelLongPress])

    const cancelTouchMarqueeArm = React.useCallback((pointerId?: number) => {
      const pending = touchMarqueeRef.current
      if (
        !pending ||
        (pointerId !== undefined && pending.pointerId !== pointerId)
      )
        return
      clearTimeout(pending.timer)
      touchMarqueeRef.current = null
    }, [])

    React.useEffect(() => cancelTouchMarqueeArm, [cancelTouchMarqueeArm])

    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        viewportRef.current = node
        if (typeof forwardedRef === 'function') forwardedRef(node)
        else if (forwardedRef) forwardedRef.current = node
      },
      [forwardedRef],
    )

    // Feeds the off-screen-content cue (CI-22): without the viewport's own
    // size there is no way to tell what the pan has pushed out of sight.
    React.useEffect(() => {
      const node = viewportRef.current
      if (!node) return
      const measure = () => {
        const rect = node.getBoundingClientRect()
        setViewportBox({
          width: rect.width || node.clientWidth,
          height: rect.height || node.clientHeight,
        })
      }
      measure()
      // ResizeObserver catches layout-driven changes; the window listener is
      // the fallback where it isn't implemented.
      window.addEventListener('resize', measure)
      const observer =
        typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
      observer?.observe(node)
      return () => {
        window.removeEventListener('resize', measure)
        observer?.disconnect()
      }
    }, [])

    const geometryItems = React.useMemo(
      () =>
        items.map((item) => {
          const patch = preview[item.id]
          return {
            ...item,
            ...patch,
            height: patch?.height ?? item.height,
            data:
              patch?.resolvedHeight !== undefined
                ? {
                    ...(item.data ?? {}),
                    resolved_height: patch.resolvedHeight,
                  }
                : item.data,
          }
        }),
      [items, preview],
    )

    const geometry = React.useMemo(
      () =>
        resolveMoodBoardGeometry({
          canvasWidth,
          canvasHeight,
          backgroundColor,
          sections: [...sections],
          items: geometryItems,
        }),
      [backgroundColor, canvasHeight, canvasWidth, geometryItems, sections],
    )

    const updateView = React.useCallback(
      (next: BoardView, reason: 'pan' | 'zoom' | 'fit' | 'reset') => {
        const normalized = { pan: next.pan, zoom: clampBoardZoom(next.zoom) }
        if (!view) setInternalView(normalized)
        onViewChange?.(normalized, reason)
      },
      [onViewChange, view],
    )

    const viewportSize = React.useCallback(() => {
      const element = viewportRef.current
      const rect = element?.getBoundingClientRect()
      return {
        width: rect?.width || element?.clientWidth || 800,
        height: rect?.height || element?.clientHeight || 600,
      }
    }, [])

    const fit = React.useCallback(() => {
      updateView(fitBoardGeometry(geometry, viewportSize()), 'fit')
    }, [geometry, updateView, viewportSize])

    const emitAutoGrow = React.useCallback(
      (
        nextItems: readonly MoodBoardItemSnapshot[],
        reason: BoardCanvasGrowCommit['reason'],
      ) => {
        const nextGeometry = resolveMoodBoardGeometry({
          canvasWidth,
          canvasHeight,
          backgroundColor,
          sections: [...sections],
          items: nextItems,
        })
        const growth = computeBoardAutoGrow(nextGeometry)
        if (growth.grew) onCanvasGrow?.({ ...growth, reason })
      },
      [backgroundColor, canvasHeight, canvasWidth, onCanvasGrow, sections],
    )

    const emitMovePatches = React.useCallback(
      (
        patches: readonly BoardPositionPatch[],
        reason: BoardItemsMovedCommit['reason'],
        moveGuides: BoardGuide[] = [],
        zIndexPatches: Array<{ id: string; zIndex: number }> = [],
      ) => {
        if (patches.length === 0) return
        const byId = new Map(patches.map((patch) => [patch.id, patch]))
        const before = items
          .filter((item) => byId.has(item.id))
          .map((item) => ({ id: item.id, x: item.x, y: item.y }))
        const after = before.map((item) => ({
          ...item,
          ...byId.get(item.id)!,
        }))
        const leadBefore = before[0]
        const leadAfter = after[0]
        onItemsMoved?.({
          itemIds: after.map((item) => item.id),
          before,
          after,
          delta: {
            x: leadBefore && leadAfter ? leadAfter.x - leadBefore.x : 0,
            y: leadBefore && leadAfter ? leadAfter.y - leadBefore.y : 0,
          },
          reason,
          guides: moveGuides,
          ...(zIndexPatches.length > 0 ? { zIndexPatches } : {}),
        })
        const zById = new Map(
          zIndexPatches.map((patch) => [patch.id, patch.zIndex]),
        )
        const nextItems = items.map((item) => ({
          ...item,
          ...(byId.get(item.id) ?? {}),
          ...(zById.has(item.id) ? { zIndex: zById.get(item.id)! } : {}),
        }))
        emitAutoGrow(nextItems, reason === 'drag' ? 'move' : reason)
      },
      [emitAutoGrow, items, onItemsMoved],
    )

    const setSelection = React.useCallback(
      (ids: string[], reason: BoardSelectionChangeMeta['reason']) => {
        selectedItemIdsRef.current = ids
        onSelectionChange?.(ids, { reason })
        setAnnouncement(selectionLabel(ids.length))
      },
      [onSelectionChange],
    )

    const startLongPress = React.useCallback(
      (
        event: React.PointerEvent<HTMLDivElement>,
        itemId: string,
      ) => {
        if (event.pointerType !== 'touch' || !onContextMenuRequest) return
        cancelLongPress()
        const pending = {
          pointerId: event.pointerId,
          itemId,
          startClient: { x: event.clientX, y: event.clientY },
          clientPoint: { x: event.clientX, y: event.clientY },
          timer: 0 as unknown as ReturnType<typeof setTimeout>,
        }
        pending.timer = setTimeout(() => {
          if (longPressRef.current !== pending) return
          longPressRef.current = null
          setGesture(null)
          const suppressUntil = Date.now() + BOARD_LONG_PRESS_SUPPRESSION_MS
          suppressClickUntilRef.current = suppressUntil
          suppressContextMenuUntilRef.current = suppressUntil
          setPreview({})
          setAltDragPreview(null)
          setGuides([])
          setMarquee(null)
          setAnnouncement('Context menu opened')
          onContextMenuRequest({
            itemId: pending.itemId,
            clientPoint: pending.clientPoint,
            source: 'pointer',
          })
        }, BOARD_LONG_PRESS_MS)
        longPressRef.current = pending
      },
      [cancelLongPress, onContextMenuRequest, setGesture],
    )

    /**
     * The pins stacked under a board point, topmost first. Used by ⌘-click to
     * reach past whatever is covering the piece the user actually wants
     * (CI-19).
     */
    const stackedItemIdsAt = React.useCallback(
      (point: BoardPoint): string[] =>
        geometry.items
          .filter(
            (candidate) =>
              candidate.id &&
              boardRectsIntersect(candidate.aabb, {
                ...point,
                width: 0,
                height: 0,
              }),
          )
          .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))
          .map((candidate) => candidate.id!),
      [geometry.items],
    )

    const handleItemPointerDown = (
      event: React.PointerEvent<HTMLDivElement>,
      pinId: string,
    ) => {
      if (event.button !== 0) return
      event.stopPropagation()
      const viewport = viewportRef.current
      if (!viewport) return

      // ⌘-click walks DOWN the stack from whatever is currently selected, so
      // repeated presses cycle through every pin under the pointer instead of
      // being stuck on the topmost one (CI-19). Shift keeps its own meaning.
      let itemId = pinId
      const deepSelect = (event.metaKey || event.ctrlKey) && !event.shiftKey
      if (deepSelect) {
        const stack = stackedItemIdsAt(
          screenPointToBoard(
            eventPoint(event, viewport),
            activeView.pan,
            activeView.zoom,
          ),
        )
        if (stack.length > 1) {
          const currentIndex = stack.findIndex((id) =>
            selectedItemIdsRef.current.includes(id),
          )
          itemId = stack[(currentIndex + 1) % stack.length]!
        }
      }

      const item = items.find((candidate) => candidate.id === itemId)
      if (!item) return
      event.currentTarget.focus()
      setFocusedItemId(itemId)

      if (deepSelect) {
        if (selectedItemIdsRef.current.join('|') !== itemId)
          setSelection([itemId], 'item')
        return
      }

      const currentSelection = selectedItemIdsRef.current
      const isSelected = currentSelection.includes(itemId)
      let nextSelection: string[]
      if (event.shiftKey) {
        nextSelection = isSelected
          ? currentSelection.filter((id) => id !== itemId)
          : [...currentSelection, itemId]
      } else {
        nextSelection = isSelected ? [...currentSelection] : [itemId]
      }
      if (nextSelection.join('|') !== currentSelection.join('|'))
        setSelection(nextSelection, 'item')
      startLongPress(event, itemId)
      if (event.pointerType === 'touch')
        event.currentTarget.setPointerCapture?.(event.pointerId)
      if (
        readOnly ||
        item.locked ||
        (event.shiftKey && !nextSelection.includes(itemId))
      )
        return

      const movingIds = nextSelection.filter(
        (id) => items.find((candidate) => candidate.id === id)?.locked !== true,
      )
      const before = items
        .filter((candidate) => movingIds.includes(candidate.id))
        .map((candidate) => ({
          id: candidate.id,
          x: candidate.x,
          y: candidate.y,
        }))
      // Z-order is an explicit action (context menu / inspector / shortcuts)
      // only — a move never re-stacks the dragged item(s) (CI-03). The item
      // still renders above its siblings for the duration of the drag; see
      // the CSS-only boost applied at render time below.
      const duplicate = event.altKey && !!onItemsAltDragged
      const leadBounds = geometry.items.find(
        (candidate) => candidate.id === itemId,
      )?.aabb
      if (!leadBounds) return
      setGesture({
        kind: 'move',
        pointerId: event.pointerId,
        startScreen: eventPoint(event, viewport),
        leadId: itemId,
        leadBounds,
        itemIds: movingIds,
        before,
        latest: before,
        guides: [],
        didMove: false,
        duplicate,
        sectionBounds: geometry.sections.map(({ id, bounds }) => ({
          id,
          bounds,
        })),
      })
      if (duplicate) setAltDragPreview(before)
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }

    const handleResizePointerDown = (
      event: React.PointerEvent<HTMLButtonElement>,
      itemIds: readonly string[],
      handle: BoardResizeHandle,
    ) => {
      event.preventDefault()
      event.stopPropagation()
      const viewport = viewportRef.current
      const sources = items.filter(
        (candidate) => itemIds.includes(candidate.id) && !candidate.locked,
      )
      const resolved = geometry.items.filter(
        (candidate) => candidate.id && sources.some((source) => source.id === candidate.id),
      )
      if (!viewport || sources.length === 0 || readOnly) return
      const before: BoardResizeSnapshot[] = resolved.map((item) => {
        const source = sources.find((candidate) => candidate.id === item.id)!
        return {
          id: source.id,
          x: item.x,
          y: item.y,
          width: item.width,
          height: source.height ?? null,
          resolvedHeight: item.height,
        }
      })
      const selectionBounds = unionBoardRects(resolved.map((item) => item.aabb))
      if (!selectionBounds) return
      const boundsBefore: BoardResizeGeometry = sources.length === 1
        ? {
            x: before[0]!.x,
            y: before[0]!.y,
            width: before[0]!.width,
            height: before[0]!.height,
            resolvedHeight: before[0]!.resolvedHeight,
          }
        : {
            x: selectionBounds.x,
            y: selectionBounds.y,
            width: selectionBounds.width,
            height: selectionBounds.height,
            resolvedHeight: selectionBounds.height,
          }
      setGesture({
        kind: 'resize',
        pointerId: event.pointerId,
        startScreen: eventPoint(event, viewport),
        itemIds: before.map((item) => item.id),
        handle,
        boundsBefore,
        before,
        latest: before,
        latestBounds: boundsBefore,
        guides: [],
        preserveAspectByDefault: sources.length > 1 || ASPECT_LOCKED_TYPES.has(sources[0]!.type),
        rotation:
          sources.length === 1
            ? resolved.find((candidate) => candidate.id === sources[0]!.id)
                ?.rotation ?? 0
            : 0,
      })
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }

    const handleSectionPointerDown = (
      event: React.PointerEvent<HTMLElement>,
      sectionId: string,
    ) => {
      if (event.button !== 0 || readOnly) return
      event.preventDefault()
      event.stopPropagation()
      const viewport = viewportRef.current
      if (!viewport) return
      const before = items
        .filter((item) => item.data?.section_id === sectionId)
        .map((item) => ({ id: item.id, x: item.x, y: item.y }))
      if (before.length === 0) return
      setGesture({
        kind: 'section-move',
        pointerId: event.pointerId,
        startScreen: eventPoint(event, viewport),
        sectionId,
        itemIds: before.map((item) => item.id),
        before,
        latest: before,
      })
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }

    const handleRotatePointerDown = (
      event: React.PointerEvent<HTMLButtonElement>,
      itemId: string,
    ) => {
      event.preventDefault()
      event.stopPropagation()
      const viewport = viewportRef.current
      const item = geometry.items.find((candidate) => candidate.id === itemId)
      if (!viewport || !item || readOnly || item.locked) return
      const point = screenPointToBoard(
        eventPoint(event, viewport),
        activeView.pan,
        activeView.zoom,
      )
      setGesture({
        kind: 'rotate',
        pointerId: event.pointerId,
        itemId,
        center: item.center,
        startPointerAngle: Math.atan2(
          point.y - item.center.y,
          point.x - item.center.x,
        ),
        before: item.rotation,
        latest: item.rotation,
      })
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }

    /**
     * Runs in the capture phase, so it sees a second finger even when the
     * first one landed on a pin (whose own handler stops propagation). Two
     * touch points always mean pinch/pan: whatever gesture was in flight is
     * abandoned rather than fought over (CI-01).
     */
    const handleViewportPointerDownCapture = (
      event: React.PointerEvent<HTMLDivElement>,
    ) => {
      if (event.pointerType !== 'touch') return
      const viewport = viewportRef.current
      if (!viewport) return
      const points = touchPointsRef.current
      points.set(event.pointerId, eventPoint(event, viewport))
      if (points.size !== 2) return

      cancelLongPress()
      cancelTouchMarqueeArm()
      cancelScheduledPaint()
      setPreview({})
      setAltDragPreview(null)
      setGuides([])
      setMarquee(null)
      const [first, second] = [...points.entries()]
      const [firstId, firstPoint] = first!
      const [secondId, secondPoint] = second!
      const midpoint = pointerMidpoint(firstPoint, secondPoint)
      setGesture({
        kind: 'pinch',
        pointerId: event.pointerId,
        pointerIds: [firstId, secondId],
        startDistance: Math.max(1, pointerDistance(firstPoint, secondPoint)),
        startZoom: activeView.zoom,
        anchor: screenPointToBoard(
          midpoint,
          activeView.pan,
          activeView.zoom,
        ),
      })
      event.stopPropagation()
    }

    const handleViewportPointerDown = (
      event: React.PointerEvent<HTMLDivElement>,
    ) => {
      if (event.button !== 0 && event.button !== 1) return
      const viewport = viewportRef.current
      if (!viewport) return
      if (gestureRef.current?.kind === 'pinch') return
      viewport.focus()
      const screen = eventPoint(event, viewport)
      const logical = screenPointToBoard(
        screen,
        activeView.pan,
        activeView.zoom,
      )
      const startMarquee = () => {
        setGesture({
          kind: 'marquee',
          pointerId: event.pointerId,
          start: logical,
          current: logical,
          additive: event.shiftKey,
        })
        setMarquee({ ...logical, width: 0, height: 0 })
      }
      if (spaceHeld || event.button === 1) {
        event.preventDefault()
        setGesture({
          kind: 'pan',
          pointerId: event.pointerId,
          startScreen: screen,
          startPan: activeView.pan,
        })
      } else if (event.pointerType === 'touch') {
        // FigJam's convention: a finger on empty canvas pans. A marquee is
        // still reachable — hold still for half a second first (CI-01).
        setGesture({
          kind: 'pan',
          pointerId: event.pointerId,
          startScreen: screen,
          startPan: activeView.pan,
        })
        if (!readOnly) {
          cancelTouchMarqueeArm()
          const pending = {
            pointerId: event.pointerId,
            timer: 0 as unknown as ReturnType<typeof setTimeout>,
          }
          pending.timer = setTimeout(() => {
            if (touchMarqueeRef.current !== pending) return
            touchMarqueeRef.current = null
            if (gestureRef.current?.kind !== 'pan') return
            startMarquee()
            setAnnouncement('Marquee selection started')
          }, BOARD_TOUCH_MARQUEE_LONG_PRESS_MS)
          touchMarqueeRef.current = pending
        }
      } else if (!readOnly) {
        startMarquee()
      }
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
      const pendingLongPress = longPressRef.current
      if (
        pendingLongPress?.pointerId === event.pointerId &&
        Math.hypot(
          event.clientX - pendingLongPress.startClient.x,
          event.clientY - pendingLongPress.startClient.y,
        ) > BOARD_LONG_PRESS_MOVE_TOLERANCE_PX
      ) {
        cancelLongPress(event.pointerId)
      }
      const gesture = gestureRef.current
      const viewport = viewportRef.current
      if (!gesture || !viewport) return

      if (event.pointerType === 'touch') {
        const tracked = touchPointsRef.current
        if (tracked.has(event.pointerId))
          tracked.set(event.pointerId, eventPoint(event, viewport))
      }

      if (gesture.kind === 'pinch') {
        const points = touchPointsRef.current
        const first = points.get(gesture.pointerIds[0])
        const second = points.get(gesture.pointerIds[1])
        if (!first || !second) return
        const zoom = clampBoardZoom(
          (gesture.startZoom * pointerDistance(first, second)) /
            gesture.startDistance,
        )
        const midpoint = pointerMidpoint(first, second)
        updateView(
          {
            pan: {
              x: midpoint.x - gesture.anchor.x * zoom,
              y: midpoint.y - gesture.anchor.y * zoom,
            },
            zoom,
          },
          'zoom',
        )
        return
      }

      if (gesture.pointerId !== event.pointerId) return
      const screen = eventPoint(event, viewport)

      // A finger that travels is panning, not arming a marquee (CI-01).
      const pendingTouchMarquee = touchMarqueeRef.current
      if (
        pendingTouchMarquee?.pointerId === event.pointerId &&
        gesture.kind === 'pan' &&
        Math.hypot(
          screen.x - gesture.startScreen.x,
          screen.y - gesture.startScreen.y,
        ) > BOARD_LONG_PRESS_MOVE_TOLERANCE_PX
      ) {
        cancelTouchMarqueeArm(event.pointerId)
      }

      if (gesture.kind === 'pan') {
        updateView(
          {
            pan: {
              x: gesture.startPan.x + screen.x - gesture.startScreen.x,
              y: gesture.startPan.y + screen.y - gesture.startScreen.y,
            },
            zoom: activeView.zoom,
          },
          'pan',
        )
        return
      }

      if (gesture.kind === 'marquee') {
        gesture.current = screenPointToBoard(
          screen,
          activeView.pan,
          activeView.zoom,
        )
        const box = rectFromPoints(gesture.start, gesture.current)
        schedulePaint(() => setMarquee(box))
        return
      }

      if (gesture.kind === 'move') {
        // Screen-space travel, before the zoom division below, so the
        // threshold reads the same physical distance at any zoom (CI-04).
        const screenDeltaX = screen.x - gesture.startScreen.x
        const screenDeltaY = screen.y - gesture.startScreen.y
        if (!gesture.didMove) {
          if (
            Math.hypot(screenDeltaX, screenDeltaY) <=
            BOARD_MOVE_ARM_THRESHOLD_PX
          )
            return
          gesture.didMove = true
        }
        const rawDelta = {
          x: screenDeltaX / activeView.zoom,
          y: screenDeltaY / activeView.zoom,
        }
        const leadBefore = gesture.before.find(
          (item) => item.id === gesture.leadId,
        )!
        // Alt keeps exactly one meaning on a move: duplicate. Snap and guide
        // suppression live on Ctrl/Cmd instead, so alt-drag duplicates keep
        // smart guides active (CI-09).
        const suppressSnapping = event.ctrlKey || event.metaKey
        let delta = { ...rawDelta }
        if (snapToGrid && !suppressSnapping) {
          delta = {
            x:
              Math.round((leadBefore.x + delta.x) / gridSize) * gridSize -
              leadBefore.x,
            y:
              Math.round((leadBefore.y + delta.y) / gridSize) * gridSize -
              leadBefore.y,
          }
        }
        let nextGuides: BoardGuide[] = []
        if (showGuides && !suppressSnapping) {
          const guideResult = findBoardSmartGuides(
            {
              ...gesture.leadBounds,
              x: gesture.leadBounds.x + delta.x,
              y: gesture.leadBounds.y + delta.y,
            },
            geometry.items,
            {
              zoom: activeView.zoom,
              excludeKeys: gesture.itemIds,
              canvas: geometry.canvas,
            },
          )
          delta = {
            x: delta.x + guideResult.delta.x,
            y: delta.y + guideResult.delta.y,
          }
          nextGuides = guideResult.guides
        }
        gesture.latest = gesture.before.map((item) => ({
          ...item,
          x: item.x + delta.x,
          y: item.y + delta.y,
        }))
        gesture.guides = nextGuides
        const movedPositions = gesture.latest
        const duplicating = gesture.duplicate
        schedulePaint(() => {
          if (duplicating) {
            setAltDragPreview(movedPositions)
          } else {
            // No zIndex here: a move never re-stacks the dragged item(s) (CI-03).
            setPreview(
              Object.fromEntries(
                movedPositions.map((item) => [
                  item.id,
                  { x: item.x, y: item.y },
                ]),
              ),
            )
          }
          setGuides(nextGuides)
        })
        return
      }

      if (gesture.kind === 'section-move') {
        const delta = {
          x: (screen.x - gesture.startScreen.x) / activeView.zoom,
          y: (screen.y - gesture.startScreen.y) / activeView.zoom,
        }
        gesture.latest = gesture.before.map((item) => ({
          ...item,
          x: item.x + delta.x,
          y: item.y + delta.y,
        }))
        const sectionPositions = gesture.latest
        schedulePaint(() =>
          setPreview(
            Object.fromEntries(
              sectionPositions.map((item) => [
                item.id,
                { x: item.x, y: item.y },
              ]),
            ),
          ),
        )
        return
      }

      if (gesture.kind === 'resize') {
        // A rotated pin's handles live in the pin's own frame, so the screen
        // delta has to be counter-rotated into it before it means anything to
        // the axis-aligned box maths below (CI-07).
        const rawDelta = rotateBoardVector(
          {
            x: (screen.x - gesture.startScreen.x) / activeView.zoom,
            y: (screen.y - gesture.startScreen.y) / activeView.zoom,
          },
          -gesture.rotation,
        )
        const snapped = resizeGeometryWithSnapping(
          gesture.boundsBefore,
          gesture.handle,
          rawDelta,
          // Shift constrains aspect on ANY item type (revises AC1.13); an
          // aspect-locked-by-default type stays locked with no gesture-time
          // release — use the inspector's width/height fields for that (CI-08).
          gesture.preserveAspectByDefault || event.shiftKey,
          {
            geometryItems: geometry.items,
            excludedIds: gesture.itemIds,
            canvas: geometry.canvas,
            zoom: activeView.zoom,
            gridSize,
            snapToGrid,
            showGuides,
            // Alt is duplicate-on-move only; snap/guide suppression lives on
            // Ctrl/Cmd instead (CI-09).
            suppressSnapping: event.ctrlKey || event.metaKey,
          },
        )
        if (gesture.itemIds.length === 1) {
          // Growing the box moves the rotation centre; shift it back so the
          // corner opposite the dragged handle stays put on screen (CI-07).
          const correction = rotatedResizeAnchorCorrection(
            {
              x: gesture.boundsBefore.x,
              y: gesture.boundsBefore.y,
              width: gesture.boundsBefore.width,
              height: gesture.boundsBefore.resolvedHeight,
            },
            {
              x: snapped.geometry.x,
              y: snapped.geometry.y,
              width: snapped.geometry.width,
              height: snapped.geometry.resolvedHeight,
            },
            resizeAnchorPoint(gesture.handle),
            gesture.rotation,
          )
          const corrected: BoardResizeGeometry = {
            ...snapped.geometry,
            x: snapped.geometry.x + correction.x,
            y: snapped.geometry.y + correction.y,
          }
          gesture.latestBounds = corrected
          gesture.latest = [{
            id: gesture.itemIds[0]!,
            ...corrected,
          }]
        } else {
          const scaled = scaleResizeGroup(
            gesture.before,
            gesture.boundsBefore,
            snapped.geometry,
            gesture.handle,
          )
          gesture.latestBounds = scaled.bounds
          gesture.latest = scaled.items
        }
        gesture.guides = snapped.guides
        const resizedItems = gesture.latest
        schedulePaint(() => {
          setPreview(Object.fromEntries(resizedItems.map((item) => [
            item.id,
            {
              x: item.x,
              y: item.y,
              width: item.width,
              height: item.height,
              resolvedHeight: item.resolvedHeight,
            },
          ])))
          setGuides(snapped.guides)
        })
        return
      }

      const logical = screenPointToBoard(
        screen,
        activeView.pan,
        activeView.zoom,
      )
      const angle = Math.atan2(
        logical.y - gesture.center.y,
        logical.x - gesture.center.x,
      )
      let degrees =
        gesture.before + ((angle - gesture.startPointerAngle) * 180) / Math.PI
      if (event.shiftKey) degrees = Math.round(degrees / 15) * 15
      gesture.latest = degrees
      const rotatedId = gesture.itemId
      schedulePaint(() => setPreview({ [rotatedId]: { rotation: degrees } }))
    }

    const commitGesture = (event: React.PointerEvent<HTMLDivElement>) => {
      cancelLongPress(event.pointerId)
      cancelTouchMarqueeArm(event.pointerId)
      touchPointsRef.current.delete(event.pointerId)
      const gesture = gestureRef.current
      if (!gesture) return
      // A pinch ends when either finger leaves; the survivor does not inherit
      // the gesture, it has to press again (CI-01).
      if (gesture.kind === 'pinch') {
        if (!gesture.pointerIds.includes(event.pointerId)) return
        setGesture(null)
        cancelScheduledPaint()
        return
      }
      if (gesture.pointerId !== event.pointerId) return
      setGesture(null)
      cancelScheduledPaint()

      if (gesture.kind === 'marquee') {
        const box = rectFromPoints(gesture.start, gesture.current)
        const hits = marqueeIntersections(geometry.items, box).filter((id) =>
          items.some((item) => item.id === id),
        )
        // Shift-marquee TOGGLES: sweeping over something already selected
        // takes it out again, the way every canvas tool in the class behaves
        // (CI-19).
        let next: string[]
        if (gesture.additive) {
          const current = new Set(selectedItemIdsRef.current)
          for (const id of hits) {
            if (current.has(id)) current.delete(id)
            else current.add(id)
          }
          next = [...current]
        } else {
          next = hits
        }
        setSelection(next, 'marquee')
      }

      if (gesture.kind === 'move') {
        const patches = gesture.latest.map((item) => ({
          id: item.id,
          x: item.x,
          y: item.y,
        }))
        let createdIds: readonly string[] = []
        if (gesture.didMove && gesture.duplicate) {
          createdIds = onItemsAltDragged?.({
            itemIds: gesture.itemIds,
            before: gesture.before,
            after: gesture.latest,
            delta: {
              x: gesture.latest[0]!.x - gesture.before[0]!.x,
              y: gesture.latest[0]!.y - gesture.before[0]!.y,
            },
            guides: gesture.guides,
          }) ?? []
          if (createdIds.length === gesture.itemIds.length) {
            const maxZ = Math.max(
              0,
              ...items.map((item) => item.zIndex ?? 0),
            )
            const copied = gesture.itemIds.flatMap((sourceId, index) => {
              const source = items.find((item) => item.id === sourceId)
              const next = gesture.latest.find((item) => item.id === sourceId)
              if (!source || !next || !createdIds[index]) return []
              return [{
                ...source,
                id: createdIds[index]!,
                x: next.x,
                y: next.y,
                zIndex: maxZ + index + 1,
              }]
            })
            emitAutoGrow([...items, ...copied], 'move')
          }
        } else if (gesture.didMove) {
          // No z-order patches: a move never re-stacks the dragged item(s) (CI-03).
          emitMovePatches(patches, 'drag', gesture.guides)
        }
        const nextById = new Map(patches.map((patch) => [patch.id, patch]))
        const membershipIds = gesture.duplicate && createdIds.length > 0
          ? createdIds
          : gesture.itemIds
        for (let index = 0; index < gesture.itemIds.length; index += 1) {
          const itemId = gesture.itemIds[index]!
          const membershipId = membershipIds[index]
          const item = items.find((candidate) => candidate.id === itemId)
          const next = nextById.get(itemId)
          if (!item || !next || !membershipId || !gesture.didMove) continue
          const resolved = geometry.items.find(
            (candidate) => candidate.id === itemId,
          )
          const center = {
            x: next.x + (resolved?.width ?? item.width) / 2,
            y: next.y + (resolved?.height ?? item.height ?? item.width) / 2,
          }
          const sectionId =
            gesture.sectionBounds.find((section) =>
              boardRectsIntersect(section.bounds, {
                ...center,
                width: 0,
                height: 0,
              }),
            )?.id ?? null
          const previous =
            typeof item.data?.section_id === 'string'
              ? item.data.section_id
              : null
          if (sectionId !== previous)
            onSectionMembership?.({ itemId: membershipId, sectionId })
        }
        if (gesture.didMove) {
          setAnnouncement(
            `${gesture.duplicate ? 'Duplicated and moved' : 'Moved'} ${pluralize(gesture.itemIds.length, 'item')}`,
          )
        }
      }

      if (gesture.kind === 'section-move') {
        const firstBefore = gesture.before[0]
        const firstAfter = gesture.latest[0]
        const delta = {
          x: firstBefore && firstAfter ? firstAfter.x - firstBefore.x : 0,
          y: firstBefore && firstAfter ? firstAfter.y - firstBefore.y : 0,
        }
        if (delta.x !== 0 || delta.y !== 0) {
          onSectionBandMoved?.({
            sectionId: gesture.sectionId,
            itemIds: gesture.itemIds,
            delta,
          })
          const nextById = new Map(
            gesture.latest.map((position) => [position.id, position]),
          )
          emitAutoGrow(
            items.map((item) => ({
              ...item,
              ...(nextById.get(item.id) ?? {}),
            })),
            'move',
          )
          setAnnouncement(
            `Moved the ${sections.find((section) => section.id === gesture.sectionId)?.name ?? gesture.sectionId} section with ${pluralize(gesture.itemIds.length, 'item')}`,
          )
        }
      }

      if (gesture.kind === 'resize' && gesture.latest !== gesture.before) {
        if (gesture.itemIds.length === 1) {
          onItemResized?.({
            itemId: gesture.itemIds[0]!,
            handle: gesture.handle,
            before: gesture.before[0]!,
            after: gesture.latest[0]!,
          })
        } else {
          onItemsResized?.({
            itemIds: gesture.itemIds,
            handle: gesture.handle,
            before: gesture.before,
            after: gesture.latest,
            guides: gesture.guides,
          })
        }
        const nextById = new Map(
          gesture.latest.map((item) => [item.id, item]),
        )
        const nextItems = items.map((item) => {
          const next = nextById.get(item.id)
          return next
            ? {
                ...item,
                x: next.x,
                y: next.y,
                width: next.width,
                height: next.height,
                data: {
                  ...(item.data ?? {}),
                  resolved_height: next.resolvedHeight,
                },
              }
            : item
        })
        emitAutoGrow(nextItems, 'resize')
        setAnnouncement(`Resized ${pluralize(gesture.itemIds.length, 'item')}`)
      }

      if (gesture.kind === 'rotate' && gesture.latest !== gesture.before) {
        onItemRotated?.({
          itemId: gesture.itemId,
          before: gesture.before,
          after: gesture.latest,
        })
        const nextItems = items.map((item) =>
          item.id === gesture.itemId
            ? { ...item, rotation: gesture.latest }
            : item,
        )
        emitAutoGrow(nextItems, 'rotate')
        setAnnouncement(`Rotated to ${Math.round(gesture.latest)} degrees`)
      }

      setPreview({})
      setAltDragPreview(null)
      setGuides([])
      setMarquee(null)
    }

    const cancelGesture = (event: React.PointerEvent<HTMLDivElement>) => {
      cancelLongPress()
      cancelTouchMarqueeArm()
      cancelScheduledPaint()
      touchPointsRef.current.delete(event.pointerId)
      setGesture(null)
      setPreview({})
      setAltDragPreview(null)
      setGuides([])
      setMarquee(null)
    }

    const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault()
      const viewport = viewportRef.current
      if (!viewport) return
      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * 0.002)
        updateView(
          zoomBoardViewAtPoint(
            activeView,
            eventPoint(event, viewport),
            activeView.zoom * factor,
          ),
          'zoom',
        )
      } else {
        updateView(
          {
            pan: {
              x: activeView.pan.x - event.deltaX,
              y: activeView.pan.y - event.deltaY,
            },
            zoom: activeView.zoom,
          },
          'pan',
        )
      }
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement
      const editingText =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      if (editingText) return
      const mod = event.metaKey || event.ctrlKey

      if (event.code === 'Space') {
        event.preventDefault()
        // Space on a pin picks it up into the selection — the keyboard way
        // out of arrow-traversal and into the nudge (CI-16). Space anywhere
        // else still arms the pan.
        const spaceItemId = target.closest<HTMLElement>('[data-board-item-id]')
          ?.dataset.boardItemId
        if (spaceItemId && !readOnly) {
          const current = selectedItemIdsRef.current
          setSelection(
            current.includes(spaceItemId)
              ? current.filter((id) => id !== spaceItemId)
              : [...current, spaceItemId],
            'keyboard',
          )
          return
        }
        setSpaceHeld(true)
        return
      }
      if (event.key === '1' && !mod) {
        event.preventDefault()
        fit()
        return
      }
      if (mod && event.key === '0') {
        event.preventDefault()
        const size = viewportSize()
        updateView(
          zoomBoardViewAtPoint(
            activeView,
            { x: size.width / 2, y: size.height / 2 },
            1,
          ),
          'reset',
        )
        return
      }
      if (
        mod &&
        (event.key === '+' || event.key === '=' || event.key === '-')
      ) {
        event.preventDefault()
        const size = viewportSize()
        const nextZoom = activeView.zoom + (event.key === '-' ? -0.1 : 0.1)
        updateView(
          zoomBoardViewAtPoint(
            activeView,
            { x: size.width / 2, y: size.height / 2 },
            nextZoom,
          ),
          'zoom',
        )
        return
      }
      if (mod && event.key.toLowerCase() === 'a' && !readOnly) {
        event.preventDefault()
        setSelection(
          geometry.items
            .filter((item) => !item.locked && item.id)
            .map((item) => item.id!),
          'keyboard',
        )
        return
      }
      if (event.key === 'Escape' && selectedItemIds.length > 0) {
        event.preventDefault()
        setSelection([], 'escape')
        return
      }
      if (event.key === 'Enter' && focusedItemId) {
        const item = items.find((candidate) => candidate.id === focusedItemId)
        if (item) {
          event.preventDefault()
          onItemActivate?.(item)
        }
        return
      }
      if (
        event.key === 'ContextMenu' ||
        (event.shiftKey && event.key === 'F10')
      ) {
        event.preventDefault()
        const rect = viewportRef.current?.getBoundingClientRect()
        onContextMenuRequest?.({
          itemId: focusedItemId,
          clientPoint: { x: rect?.left ?? 0, y: rect?.top ?? 0 },
          source: 'keyboard',
        })
        return
      }
      // Arrow traversal walks the pins in reading order — the roving-tabindex
      // counterpart to the canvas being a single Tab stop (CI-16). It takes
      // Alt so it never displaces the nudge, which owns the bare arrows and
      // legitimately adopts a DOM-focused pin that isn't selected. Bare
      // arrows also traverse from a cold canvas (no selection, no focused
      // pin) — the state where the nudge has nothing to act on and does
      // nothing at all today, which is what makes Tab-then-arrow work.
      const arrowKey = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
        event.key,
      )
      if (
        arrowKey &&
        (event.altKey ||
          (selectedItemIds.length === 0 &&
            !focusedItemId &&
            !target.closest('[data-board-item-id]')))
      ) {
        const order = spatialItemOrder(geometry.items)
        if (order.length === 0) return
        event.preventDefault()
        const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown'
        const currentIndex = focusedItemId ? order.indexOf(focusedItemId) : -1
        const nextIndex =
          currentIndex === -1
            ? forward
              ? 0
              : order.length - 1
            : (currentIndex + (forward ? 1 : -1) + order.length) % order.length
        const nextId = order[nextIndex]!
        setFocusedItemId(nextId)
        viewportRef.current
          ?.querySelector<HTMLElement>(`[data-board-item-id="${nextId}"]`)
          ?.focus()
        const nextItem = items.find((candidate) => candidate.id === nextId)
        setAnnouncement(
          `${nextItem ? boardItemAccessibleName(nextItem) : nextId}, ${nextIndex + 1} of ${order.length}`,
        )
        return
      }
      if (!readOnly && arrowKey) {
        const eventFocusedItemId = target
          .closest<HTMLElement>('[data-board-item-id]')
          ?.dataset.boardItemId
        const keyboardFocusId = eventFocusedItemId ?? focusedItemId
        const keyboardTargetIds = keyboardFocusId && !selectedItemIds.includes(keyboardFocusId)
          ? [keyboardFocusId]
          : selectedItemIds.length > 0
            ? selectedItemIds
            : keyboardFocusId
              ? [keyboardFocusId]
              : []
        const keyboardTargetSet = new Set(keyboardTargetIds)
        const movable = items.filter(
          (item) => keyboardTargetSet.has(item.id) && !item.locked,
        )
        if (movable.length === 0) return
        event.preventDefault()
        if (
          keyboardTargetIds.length !== selectedItemIds.length ||
          keyboardTargetIds.some((id, index) => id !== selectedItemIds[index])
        ) {
          setSelection([...keyboardTargetIds], 'keyboard')
        }
        const distance = event.shiftKey ? 10 : 1
        const delta = {
          x:
            event.key === 'ArrowLeft'
              ? -distance
              : event.key === 'ArrowRight'
                ? distance
                : 0,
          y:
            event.key === 'ArrowUp'
              ? -distance
              : event.key === 'ArrowDown'
                ? distance
                : 0,
        }
        emitMovePatches(
          movable.map((item) => ({
              id: item.id,
              x: item.x + delta.x,
              y: item.y + delta.y,
          })),
          'keyboard',
        )
        setAnnouncement(
          `Moved ${pluralize(movable.length, 'item')} ${pluralize(distance, 'pixel')}`,
        )
      }
    }

    const applyAlignment = (alignment: BoardAlignment) => {
      const patches = alignBoardItems(
        geometry.items,
        selectedItemIds,
        alignment,
      )
      emitMovePatches(patches, 'align')
      setAnnouncement(`Aligned ${pluralize(patches.length, 'item')}`)
    }

    const applyDistribution = (distribution: BoardDistribution) => {
      const patches = distributeBoardItems(
        geometry.items,
        selectedItemIds,
        distribution,
      )
      emitMovePatches(patches, 'distribute')
      setAnnouncement(`Spaced ${pluralize(patches.length, 'item')} evenly`)
    }

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
      if (!onItemsDropped || readOnly) return
      event.preventDefault()
      const viewport = viewportRef.current
      if (!viewport) return
      onItemsDropped({
        point: screenPointToBoard(
          eventPoint(event, viewport),
          activeView.pan,
          activeView.zoom,
        ),
        files: Array.from(event.dataTransfer.files),
        dataTransfer: event.dataTransfer,
      })
    }

    const activeSelectionBounds = unionBoardRects(
      geometry.items
        .filter((item) => item.id && selectedSet.has(item.id))
        .map((item) => item.aabb),
    )
    const selectedSingle =
      selectedItemIds.length === 1
        ? geometry.items.find((item) => item.id === selectedItemIds[0])
        : undefined
    const resizableSelectionIds = geometry.items
      .filter(
        (item) =>
          item.id && selectedSet.has(item.id) && item.locked !== true,
      )
      .map((item) => item.id!)
    const resizableSelectionBounds = unionBoardRects(
      geometry.items
        .filter(
          (item) =>
            item.id &&
            resizableSelectionIds.includes(item.id),
        )
        .map((item) => item.aabb),
    )
    // 24px hit area (WCAG 2.2 ยง2.5.8); the painted dot stays small (CI-10).
    const handleSize = 24 / activeView.zoom
    const handleDot = 10 / activeView.zoom
    // CSS-only: the actively dragged item(s) render above their siblings for
    // the duration of the gesture without committing any z-order change
    // (CI-03) — settles back to its real stacking position on release.
    const activeDragItemIds =
      gestureRef.current?.kind === 'move' && !gestureRef.current.duplicate
        ? gestureRef.current.itemIds
        : null
    // The alignment cluster sits at the bottom-center and is unusable mid-
    // gesture anyway; hiding it (rather than out-z-indexing it) keeps a
    // dragged item from painting over it.
    const gestureInFlight = gestureRef.current !== null
    // Which edges have board content past them right now. The canvas auto-
    // grows on move/resize/rotate, so a pin can end up somewhere only Fit
    // will find — an edge cue is what makes that legible (CI-22).
    const contentBounds = unionBoardRects(
      geometry.items.map((item) => item.aabb),
    )
    const offscreenEdges = (() => {
      if (!contentBounds || viewportBox.width <= 0 || viewportBox.height <= 0)
        return { top: false, right: false, bottom: false, left: false }
      const { pan, zoom } = activeView
      return {
        left: contentBounds.x * zoom + pan.x < -1,
        top: contentBounds.y * zoom + pan.y < -1,
        right:
          (contentBounds.x + contentBounds.width) * zoom + pan.x >
          viewportBox.width + 1,
        bottom:
          (contentBounds.y + contentBounds.height) * zoom + pan.y >
          viewportBox.height + 1,
      }
    })()
    const hasOffscreenContent =
      offscreenEdges.top ||
      offscreenEdges.right ||
      offscreenEdges.bottom ||
      offscreenEdges.left
    // The single roving Tab stop: the canvas itself until a pin owns it, so a
    // 40-pin board costs one Tab, not forty (CI-16).
    const rovingItemId =
      focusedItemId &&
      geometry.items.some((item) => item.id === focusedItemId)
        ? focusedItemId
        : null

    return (
      <div
        {...props}
        ref={setRefs}
        role="application"
        aria-label={`${boardName} mood board`}
        aria-describedby="board-room-instructions"
        tabIndex={rovingItemId ? -1 : 0}
        className={cn(
          'relative h-full min-h-[320px] w-full overflow-hidden bg-[var(--bg-muted,#eeeae3)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-clay,#a66d4f)]',
          spaceHeld ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
          className,
        )}
        style={{ touchAction: 'none', ...style }}
        data-zoom={activeView.zoom}
        onPointerDownCapture={handleViewportPointerDownCapture}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={commitGesture}
        onPointerCancel={cancelGesture}
        onClickCapture={(event) => {
          if (Date.now() > suppressClickUntilRef.current) return
          suppressClickUntilRef.current = 0
          event.preventDefault()
          event.stopPropagation()
        }}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        onKeyUp={(event) => {
          if (event.code === 'Space') setSpaceHeld(false)
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setSpaceHeld(false)
        }}
        onDragOver={(event) => {
          if (onItemsDropped && !readOnly) event.preventDefault()
        }}
        onDrop={handleDrop}
        onContextMenu={(event) => {
          if (Date.now() <= suppressContextMenuUntilRef.current) {
            suppressContextMenuUntilRef.current = 0
            event.preventDefault()
            event.stopPropagation()
            return
          }
          if (!onContextMenuRequest) return
          event.preventDefault()
          const target = event.target instanceof Element
            ? event.target.closest<HTMLElement>('[data-board-item-id]')
            : null
          const itemId = target?.dataset.boardItemId ?? null
          if (itemId) {
            target?.focus()
            setFocusedItemId(itemId)
            if (!selectedSet.has(itemId)) setSelection([itemId], 'item')
          }
          onContextMenuRequest({
            itemId,
            clientPoint: { x: event.clientX, y: event.clientY },
            source: 'pointer',
          })
        }}
      >
        <span id="board-room-instructions" className="sr-only">
          Tab moves into the board, then arrow keys walk the pins in reading
          order. Space picks a pin up into the selection, arrow keys nudge it,
          and Alt with an arrow key walks to the next pin. Enter opens a pin.
          Hold Space and drag to pan, pinch or drag with two fingers on a
          touchscreen, and press 1 to fit the composition.
        </span>
        {!onAnnounce && (
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {localAnnouncement}
          </div>
        )}

        {hasOffscreenContent && (
          <div
            aria-hidden="true"
            data-testid="board-offscreen-cue"
            data-offscreen-edges={
              (
                [
                  offscreenEdges.top && 'top',
                  offscreenEdges.right && 'right',
                  offscreenEdges.bottom && 'bottom',
                  offscreenEdges.left && 'left',
                ].filter(Boolean) as string[]
              ).join(' ')
            }
            className="pointer-events-none absolute inset-0 z-30"
          >
            {/* A gradient, not a box-shadow: the Document's zero-shadow rule
                (D4) holds inside the board room too. */}
            {offscreenEdges.top && (
              <div className="absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-black/12 to-transparent" />
            )}
            {offscreenEdges.bottom && (
              <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-black/12 to-transparent" />
            )}
            {offscreenEdges.left && (
              <div className="absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-black/12 to-transparent" />
            )}
            {offscreenEdges.right && (
              <div className="absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-black/12 to-transparent" />
            )}
          </div>
        )}

        {showViewControls && (
          <div
            role="toolbar"
            aria-label="Board view"
            className="absolute right-3 top-3 z-40 flex items-center gap-1 rounded-full border border-black/10 bg-white/95 p-1 shadow-sm"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <CanvasControl
              label="Zoom out"
              onClick={() => {
                const size = viewportSize()
                updateView(
                  zoomBoardViewAtPoint(
                    activeView,
                    { x: size.width / 2, y: size.height / 2 },
                    activeView.zoom - 0.1,
                  ),
                  'zoom',
                )
              }}
            >
              −
            </CanvasControl>
            <span className="min-w-12 text-center text-xs tabular-nums">
              {Math.round(activeView.zoom * 100)}%
            </span>
            <CanvasControl
              label="Zoom in"
              onClick={() => {
                const size = viewportSize()
                updateView(
                  zoomBoardViewAtPoint(
                    activeView,
                    { x: size.width / 2, y: size.height / 2 },
                    activeView.zoom + 0.1,
                  ),
                  'zoom',
                )
              }}
            >
              +
            </CanvasControl>
            <CanvasControl label="Fit board" onClick={fit} wide>
              Fit
            </CanvasControl>
          </div>
        )}

        {showAlignmentControls && !readOnly && !gestureInFlight && selectedItemIds.length >= 2 && (
          <div
            role="toolbar"
            aria-label="Board alignment"
            className="absolute bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-black/10 bg-white/95 p-1 shadow-sm"
            onPointerDown={(event) => event.stopPropagation()}
          >
            {(
              [
                ['left', 'Align left'],
                ['horizontal-center', 'Align horizontal centers'],
                ['right', 'Align right'],
                ['top', 'Align top'],
                ['vertical-center', 'Align vertical centers'],
                ['bottom', 'Align bottom'],
              ] as const
            ).map(([value, label]) => (
              <CanvasControl
                key={value}
                label={label}
                onClick={() => applyAlignment(value)}
              >
                {label.replace('Align ', '').slice(0, 1).toUpperCase()}
              </CanvasControl>
            ))}
            {selectedItemIds.length >= 3 &&
              (
                [
                  ['horizontal-centers', 'Distribute horizontal centers'],
                  ['vertical-centers', 'Distribute vertical centers'],
                  ['horizontal-gaps', 'Distribute horizontal gaps'],
                  ['vertical-gaps', 'Distribute vertical gaps'],
                ] as const
              ).map(([value, label]) => (
                <CanvasControl
                  key={value}
                  label={label}
                  onClick={() => applyDistribution(value)}
                >
                  {value.startsWith('horizontal') ? '↔' : '↕'}
                </CanvasControl>
              ))}
          </div>
        )}

        <div
          className="absolute left-0 top-0"
          style={{
            width: canvasWidth,
            height: canvasHeight,
            backgroundColor,
            backgroundImage: showGrid
              ? 'linear-gradient(to right, rgba(87,76,63,.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(87,76,63,.12) 1px, transparent 1px)'
              : undefined,
            backgroundSize: showGrid
              ? `${gridSize}px ${gridSize}px`
              : undefined,
            transform: `translate(${activeView.pan.x}px, ${activeView.pan.y}px) scale(${activeView.zoom})`,
            transformOrigin: 'top left',
            transition:
              reducedMotion || gestureRef.current
                ? 'none'
                : 'transform 120ms ease-out',
          }}
          data-testid="board-room-canvas"
        >
          {geometry.sections.map((section) => (
            <SectionBand
              key={section.id}
              section={section}
              readOnly={readOnly}
              onPointerDown={(event) =>
                handleSectionPointerDown(event, section.id)
              }
              onUpdate={(patch) =>
                onSectionUpdated?.({ sectionId: section.id, patch })
              }
            />
          ))}

          {geometry.items.map((resolved) => {
            const item = items.find((candidate) => candidate.id === resolved.id)
            if (!item) return null
            const selected = selectedSet.has(item.id)
            return (
              <div
                key={item.id}
                role="button"
                aria-label={
                  item.locked
                    ? `${boardItemAccessibleName(item)}, locked`
                    : boardItemAccessibleName(item)
                }
                aria-pressed={selected}
                aria-disabled={item.locked || readOnly}
                tabIndex={rovingItemId === item.id ? 0 : -1}
                data-board-item-id={item.id}
                className={cn(
                  'absolute outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-clay,#a66d4f)]',
                  !readOnly && !item.locked && 'cursor-grab active:cursor-grabbing',
                  item.locked && 'cursor-default',
                )}
                onPointerEnter={() => setHoveredItemId(item.id)}
                onPointerLeave={() =>
                  setHoveredItemId((current) =>
                    current === item.id ? null : current,
                  )
                }
                style={{
                  left: resolved.x,
                  top: resolved.y,
                  width: resolved.width,
                  height: resolved.height,
                  // A drag never re-stacks the item (CI-03); this is a
                  // render-only boost so the piece being moved stays visible
                  // above its siblings, and it carries no committed z patch.
                  zIndex: activeDragItemIds?.includes(item.id)
                    ? 9000 + Math.max(0, resolved.zIndex)
                    : Math.max(0, resolved.zIndex),
                  transform: resolved.rotation
                    ? `rotate(${resolved.rotation}deg)`
                    : undefined,
                  transformOrigin: 'center',
                }}
                onFocus={() => setFocusedItemId(item.id)}
                onPointerDown={(event) => handleItemPointerDown(event, item.id)}
                onDoubleClick={() => onItemActivate?.(item)}
              >
                <div className="h-full w-full">{renderItem(item)}</div>
                {selected && (
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      border: `${2 / activeView.zoom}px solid var(--color-clay,#a66d4f)`,
                    }}
                    aria-hidden="true"
                  />
                )}
                {/* Lock was discoverable only by dragging something that
                    refused to move. Now it says so on hover or selection,
                    and shows dead handle stubs where live handles would be
                    (CI-15). */}
                {item.locked &&
                  (selected || hoveredItemId === item.id) && (
                    <>
                      <span
                        data-testid={`board-item-lock-${item.id}`}
                        aria-hidden="true"
                        title="Locked"
                        className="pointer-events-none absolute z-30 flex items-center justify-center rounded-full bg-[color:rgba(87,76,63,.82)] text-white"
                        style={{
                          left: 4 / activeView.zoom,
                          top: 4 / activeView.zoom,
                          width: 18 / activeView.zoom,
                          height: 18 / activeView.zoom,
                          fontSize: 11 / activeView.zoom,
                          lineHeight: 1,
                        }}
                      >
                        <svg
                          viewBox="0 0 16 16"
                          width="100%"
                          height="100%"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.6}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ padding: '22%' }}
                        >
                          <rect x="3.2" y="7" width="9.6" height="6.4" rx="1.2" />
                          <path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7" />
                        </svg>
                      </span>
                      {RESIZE_HANDLES.filter(
                        (handle) => handle.length > 1,
                      ).map((handle) => (
                        <LockedHandleStub
                          key={`locked-${handle}`}
                          handle={handle}
                          dot={handleDot}
                        />
                      ))}
                    </>
                  )}
                {selectedSingle?.id === item.id &&
                  !item.locked &&
                  !readOnly &&
                  RESIZE_HANDLES.filter(
                    (handle) =>
                      handle.length > 1 ||
                      Math.min(resolved.width, resolved.height) *
                        activeView.zoom >=
                        BOARD_EDGE_HANDLE_MIN_SCREEN_PX,
                  ).map((handle) => (
                    <ResizeHandle
                      key={handle}
                      handle={handle}
                      size={handleSize}
                      dot={handleDot}
                      onPointerDown={(event) =>
                        handleResizePointerDown(event, [item.id], handle)
                      }
                    />
                  ))}
                {selectedSingle?.id === item.id &&
                  !item.locked &&
                  !readOnly && (
                    <button
                      type="button"
                      aria-label="Rotate item"
                      className="absolute left-1/2 z-30 flex -translate-x-1/2 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-clay,#a66d4f)]"
                      style={{
                        width: handleSize,
                        height: handleSize,
                        top: -40 / activeView.zoom,
                        cursor: ROTATE_HANDLE_CURSOR,
                      }}
                      onPointerDown={(event) =>
                        handleRotatePointerDown(event, item.id)
                      }
                    >
                      <span
                        className="block rounded-full border border-white bg-[var(--color-clay,#a66d4f)]"
                        style={{ width: handleDot, height: handleDot }}
                      />
                    </button>
                  )}
              </div>
            )
          })}

          {altDragPreview?.map((position, index) => {
            const item = items.find((candidate) => candidate.id === position.id)
            const resolved = geometry.items.find(
              (candidate) => candidate.id === position.id,
            )
            if (!item || !resolved) return null
            return (
              <div
                key={`alt-drag-${item.id}`}
                aria-hidden="true"
                data-alt-drag-copy-of={item.id}
                className="pointer-events-none absolute"
                style={{
                  left: position.x,
                  top: position.y,
                  width: resolved.width,
                  height: resolved.height,
                  zIndex: Math.max(
                    ...items.map((candidate) => candidate.zIndex ?? 0),
                  ) + index + 1,
                  transform: resolved.rotation
                    ? `rotate(${resolved.rotation}deg)`
                    : undefined,
                  transformOrigin: 'center',
                }}
              >
                <div className="h-full w-full">{renderItem(item)}</div>
                <div
                  className="absolute inset-0"
                  style={{
                    border: `${2 / activeView.zoom}px solid var(--color-clay,#a66d4f)`,
                  }}
                />
              </div>
            )
          })}

          {activeSelectionBounds && selectedItemIds.length > 1 && (
            <div
              className="pointer-events-none absolute"
              data-testid="multi-selection-bounds"
              style={{
                left: activeSelectionBounds.x,
                top: activeSelectionBounds.y,
                width: activeSelectionBounds.width,
                height: activeSelectionBounds.height,
                border: `${2 / activeView.zoom}px solid var(--color-clay,#a66d4f)`,
              }}
            />
          )}

          {resizableSelectionBounds &&
            resizableSelectionIds.length > 1 &&
            !readOnly && (
              <div
                className="pointer-events-none absolute"
                data-testid="multi-selection-resize-bounds"
                style={{
                  left: resizableSelectionBounds.x,
                  top: resizableSelectionBounds.y,
                  width: resizableSelectionBounds.width,
                  height: resizableSelectionBounds.height,
                }}
              >
                {RESIZE_HANDLES.filter(
                  (handle) =>
                    handle.length > 1 ||
                    Math.min(
                      resizableSelectionBounds.width,
                      resizableSelectionBounds.height,
                    ) *
                      activeView.zoom >=
                      BOARD_EDGE_HANDLE_MIN_SCREEN_PX,
                ).map((handle) => (
                  <ResizeHandle
                    key={handle}
                    handle={handle}
                    label={`Resize selection ${handle}`}
                    size={handleSize}
                    dot={handleDot}
                    onPointerDown={(event) =>
                      handleResizePointerDown(
                        event,
                        resizableSelectionIds,
                        handle,
                      )
                    }
                  />
                ))}
              </div>
          )}

          {guides.map((guide, index) => (
            <div
              key={`${guide.axis}-${guide.position}-${index}`}
              data-board-guide={guide.axis}
              data-board-guide-kind={guide.kind}
              className={cn(
                'pointer-events-none absolute bg-[var(--color-clay,#a66d4f)]',
                guide.kind === 'spacing' && 'opacity-80',
              )}
              style={
                guide.kind === 'spacing' && guide.axis === 'x'
                  ? {
                      left: guide.start,
                      top: guide.position,
                      width: guide.end - guide.start,
                      height: 1 / activeView.zoom,
                      borderTop: `${1 / activeView.zoom}px dashed var(--color-clay,#a66d4f)`,
                      background: 'transparent',
                    }
                  : guide.kind === 'spacing'
                    ? {
                        left: guide.position,
                        top: guide.start,
                        width: 1 / activeView.zoom,
                        height: guide.end - guide.start,
                        borderLeft: `${1 / activeView.zoom}px dashed var(--color-clay,#a66d4f)`,
                        background: 'transparent',
                      }
                    : guide.axis === 'x'
                  ? {
                      left: guide.position,
                      top: guide.start,
                      width: 1 / activeView.zoom,
                      height: guide.end - guide.start,
                    }
                  : {
                      left: guide.start,
                      top: guide.position,
                      width: guide.end - guide.start,
                      height: 1 / activeView.zoom,
                    }
              }
            />
          ))}

          {marquee && (
            <div
              data-testid="board-marquee"
              className="pointer-events-none absolute border border-[var(--color-clay,#a66d4f)] bg-[color:rgba(166,109,79,.12)]"
              style={{
                left: marquee.x,
                top: marquee.y,
                width: marquee.width,
                height: marquee.height,
              }}
            />
          )}
        </div>
      </div>
    )
  },
)

BoardRoomCanvas.displayName = 'BoardRoomCanvas'

function sectionColor(value: string | undefined): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : '#8c8175'
}

function SectionBand({
  section,
  readOnly,
  onPointerDown,
  onUpdate,
}: {
  section: MoodBoardSection & { bounds: BoardRect }
  readOnly: boolean
  onPointerDown: React.PointerEventHandler<HTMLElement>
  onUpdate: (patch: Partial<Omit<MoodBoardSection, 'id'>>) => void
}) {
  const [draft, setDraft] = React.useState(section.name)
  React.useEffect(() => setDraft(section.name), [section.id, section.name])
  const color = sectionColor(section.color)
  const commitName = () => {
    const name = draft.trim()
    if (name && name !== section.name) onUpdate({ name })
    else setDraft(section.name)
  }

  return (
    <div
      data-board-section={section.id}
      className="pointer-events-none absolute rounded-sm border border-dashed"
      style={{
        left: section.bounds.x,
        top: section.bounds.y,
        width: section.bounds.width,
        height: section.bounds.height,
        borderColor: color,
        backgroundColor: `${color}12`,
      }}
    >
      <div
        data-board-section-label={section.id}
        className={cn(
          'pointer-events-auto absolute left-2 top-0 z-20 flex -translate-y-1/2 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white',
          !readOnly && 'cursor-move',
        )}
        style={{ backgroundColor: color }}
        onPointerDown={onPointerDown}
      >
        {!readOnly && <span aria-hidden="true">⋮⋮</span>}
        {readOnly ? (
          <span>{section.name}</span>
        ) : (
          <>
            <input
              aria-label={`Rename ${section.name} section`}
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onBlur={commitName}
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
                if (event.key === 'Escape') {
                  setDraft(section.name)
                  event.currentTarget.blur()
                }
              }}
              className="min-w-0 max-w-36 border-0 bg-transparent p-0 text-[11px] font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-clay)] focus-visible:ring-offset-2"
            />
            <input
              type="color"
              aria-label={`Change ${section.name} section color`}
              value={color}
              onChange={(event) => onUpdate({ color: event.currentTarget.value })}
              onPointerDown={(event) => event.stopPropagation()}
              className="h-4 w-4 cursor-pointer rounded-full border border-white/70 bg-transparent p-0"
            />
          </>
        )}
      </div>
    </div>
  )
}

function CanvasControl({
  label,
  children,
  onClick,
  wide = false,
}: {
  label: string
  children: React.ReactNode
  onClick: () => void
  wide?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'flex h-8 items-center justify-center rounded-full text-xs outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-[var(--color-clay,#a66d4f)]',
        wide ? 'min-w-11 px-2' : 'w-8',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

const RESIZE_HANDLE_POSITIONS: Record<BoardResizeHandle, React.CSSProperties> = {
  nw: { left: 0, top: 0, transform: 'translate(-50%, -50%)' },
  n: { left: '50%', top: 0, transform: 'translate(-50%, -50%)' },
  ne: { right: 0, top: 0, transform: 'translate(50%, -50%)' },
  e: { right: 0, top: '50%', transform: 'translate(50%, -50%)' },
  se: { right: 0, bottom: 0, transform: 'translate(50%, 50%)' },
  s: { left: '50%', bottom: 0, transform: 'translate(-50%, 50%)' },
  sw: { left: 0, bottom: 0, transform: 'translate(-50%, 50%)' },
  w: { left: 0, top: '50%', transform: 'translate(-50%, -50%)' },
}

/** A grey, inert twin of a corner handle: shows where the grips would be if
 *  the pin weren't locked (CI-15). */
function LockedHandleStub({
  handle,
  dot,
}: {
  handle: BoardResizeHandle
  dot: number
}) {
  return (
    <span
      aria-hidden="true"
      data-board-locked-handle={handle}
      className="pointer-events-none absolute z-30 block rounded-sm border border-white/70 bg-[color:rgba(87,76,63,.38)]"
      style={{ ...RESIZE_HANDLE_POSITIONS[handle], width: dot, height: dot }}
    />
  )
}

function ResizeHandle({
  handle,
  label,
  size,
  dot,
  onPointerDown,
}: {
  handle: BoardResizeHandle
  label?: string
  size: number
  dot: number
  onPointerDown: React.PointerEventHandler<HTMLButtonElement>
}) {
  const positions = RESIZE_HANDLE_POSITIONS
  return (
    <button
      type="button"
      aria-label={label ?? `Resize ${handle}`}
      className="pointer-events-auto absolute z-30 flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-clay,#a66d4f)]"
      style={{
        ...positions[handle],
        width: size,
        height: size,
        cursor: resizeHandleCursor(handle),
      }}
      onPointerDown={onPointerDown}
    >
      <span
        className="block rounded-sm border border-white bg-[var(--color-clay,#a66d4f)]"
        style={{ width: dot, height: dot }}
      />
    </button>
  )
}
