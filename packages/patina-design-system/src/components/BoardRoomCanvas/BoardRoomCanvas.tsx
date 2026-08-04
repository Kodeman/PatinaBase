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
  additive: boolean
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
  promotedZIndices: Array<{ id: string; zIndex: number }>
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
    const [announcement, setAnnouncement] = React.useState('')
    const [spaceHeld, setSpaceHeld] = React.useState(false)
    const [focusedItemId, setFocusedItemId] = React.useState<string | null>(
      null,
    )
    const gestureRef = React.useRef<CanvasGesture | null>(null)
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

    const cancelLongPress = React.useCallback((pointerId?: number) => {
      const pending = longPressRef.current
      if (!pending || (pointerId !== undefined && pending.pointerId !== pointerId))
        return
      clearTimeout(pending.timer)
      longPressRef.current = null
    }, [])

    React.useEffect(() => cancelLongPress, [cancelLongPress])

    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        viewportRef.current = node
        if (typeof forwardedRef === 'function') forwardedRef(node)
        else if (forwardedRef) forwardedRef.current = node
      },
      [forwardedRef],
    )

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
          gestureRef.current = null
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
      [cancelLongPress, onContextMenuRequest],
    )

    const handleItemPointerDown = (
      event: React.PointerEvent<HTMLDivElement>,
      itemId: string,
    ) => {
      if (event.button !== 0) return
      event.stopPropagation()
      const item = items.find((candidate) => candidate.id === itemId)
      const viewport = viewportRef.current
      if (!item || !viewport) return
      event.currentTarget.focus()
      setFocusedItemId(itemId)

      let nextSelection: string[]
      if (event.shiftKey) {
        nextSelection = selectedSet.has(itemId)
          ? selectedItemIds.filter((id) => id !== itemId)
          : [...selectedItemIds, itemId]
      } else {
        nextSelection = selectedSet.has(itemId)
          ? [...selectedItemIds]
          : [itemId]
      }
      if (nextSelection.join('|') !== selectedItemIds.join('|'))
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
      const maxZ = Math.max(0, ...items.map((candidate) => candidate.zIndex ?? 0))
      const promotedZIndices = items
        .filter((candidate) => movingIds.includes(candidate.id))
        .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
        .map((candidate, index) => ({
          id: candidate.id,
          zIndex: maxZ + index + 1,
        }))
      const duplicate = event.altKey && !!onItemsAltDragged
      const leadBounds = geometry.items.find(
        (candidate) => candidate.id === itemId,
      )?.aabb
      if (!leadBounds) return
      gestureRef.current = {
        kind: 'move',
        pointerId: event.pointerId,
        startScreen: eventPoint(event, viewport),
        leadId: itemId,
        leadBounds,
        itemIds: movingIds,
        before,
        latest: before,
        guides: [],
        promotedZIndices,
        didMove: false,
        duplicate,
        sectionBounds: geometry.sections.map(({ id, bounds }) => ({
          id,
          bounds,
        })),
      }
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
      gestureRef.current = {
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
      }
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
      gestureRef.current = {
        kind: 'section-move',
        pointerId: event.pointerId,
        startScreen: eventPoint(event, viewport),
        sectionId,
        itemIds: before.map((item) => item.id),
        before,
        latest: before,
      }
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
      gestureRef.current = {
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
      }
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }

    const handleViewportPointerDown = (
      event: React.PointerEvent<HTMLDivElement>,
    ) => {
      if (event.button !== 0 && event.button !== 1) return
      const viewport = viewportRef.current
      if (!viewport) return
      viewport.focus()
      const screen = eventPoint(event, viewport)
      if (spaceHeld || event.button === 1) {
        event.preventDefault()
        gestureRef.current = {
          kind: 'pan',
          pointerId: event.pointerId,
          startScreen: screen,
          startPan: activeView.pan,
        }
      } else if (!readOnly) {
        const logical = screenPointToBoard(
          screen,
          activeView.pan,
          activeView.zoom,
        )
        gestureRef.current = {
          kind: 'marquee',
          pointerId: event.pointerId,
          start: logical,
          current: logical,
          additive: event.shiftKey,
        }
        setMarquee({ ...logical, width: 0, height: 0 })
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
      if (!gesture || !viewport || gesture.pointerId !== event.pointerId) return
      const screen = eventPoint(event, viewport)

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
        setMarquee(rectFromPoints(gesture.start, gesture.current))
        return
      }

      if (gesture.kind === 'move') {
        const rawDelta = {
          x: (screen.x - gesture.startScreen.x) / activeView.zoom,
          y: (screen.y - gesture.startScreen.y) / activeView.zoom,
        }
        const leadBefore = gesture.before.find(
          (item) => item.id === gesture.leadId,
        )!
        if (rawDelta.x !== 0 || rawDelta.y !== 0) gesture.didMove = true
        let delta = { ...rawDelta }
        if (snapToGrid && !event.altKey) {
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
        if (showGuides && !event.altKey) {
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
        if (gesture.duplicate) {
          setAltDragPreview(gesture.latest)
        } else {
          const zById = new Map(
            gesture.promotedZIndices.map((patch) => [patch.id, patch.zIndex]),
          )
          setPreview(
            Object.fromEntries(
              gesture.latest.map((item) => [
                item.id,
                { x: item.x, y: item.y, zIndex: zById.get(item.id) },
              ]),
            ),
          )
        }
        setGuides(nextGuides)
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
        setPreview(
          Object.fromEntries(
            gesture.latest.map((item) => [item.id, { x: item.x, y: item.y }]),
          ),
        )
        return
      }

      if (gesture.kind === 'resize') {
        const rawDelta = {
          x: (screen.x - gesture.startScreen.x) / activeView.zoom,
          y: (screen.y - gesture.startScreen.y) / activeView.zoom,
        }
        const snapped = resizeGeometryWithSnapping(
          gesture.boundsBefore,
          gesture.handle,
          rawDelta,
          gesture.preserveAspectByDefault && !event.shiftKey,
          {
            geometryItems: geometry.items,
            excludedIds: gesture.itemIds,
            canvas: geometry.canvas,
            zoom: activeView.zoom,
            gridSize,
            snapToGrid,
            showGuides,
            suppressSnapping: event.altKey,
          },
        )
        if (gesture.itemIds.length === 1) {
          gesture.latestBounds = snapped.geometry
          gesture.latest = [{
            id: gesture.itemIds[0]!,
            ...snapped.geometry,
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
        setPreview(Object.fromEntries(gesture.latest.map((item) => [
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
      setPreview({ [gesture.itemId]: { rotation: degrees } })
    }

    const commitGesture = (event: React.PointerEvent<HTMLDivElement>) => {
      cancelLongPress(event.pointerId)
      const gesture = gestureRef.current
      if (!gesture || gesture.pointerId !== event.pointerId) return
      gestureRef.current = null

      if (gesture.kind === 'marquee') {
        const box = rectFromPoints(gesture.start, gesture.current)
        const hits = marqueeIntersections(geometry.items, box).filter((id) =>
          items.some((item) => item.id === id),
        )
        const next = gesture.additive
          ? Array.from(new Set([...selectedItemIds, ...hits]))
          : hits
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
          emitMovePatches(
            patches,
            'drag',
            gesture.guides,
            gesture.promotedZIndices,
          )
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
            gesture.duplicate
              ? gesture.itemIds.length === 1
                ? 'Duplicated and moved 1 item'
                : `Duplicated and moved ${gesture.itemIds.length} items`
              : gesture.itemIds.length === 1
                ? 'Moved 1 item'
                : `Moved ${gesture.itemIds.length} items`,
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
            `Moved ${gesture.sectionId} section with ${gesture.itemIds.length} ${gesture.itemIds.length === 1 ? 'item' : 'items'}`,
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
        setAnnouncement(
          gesture.itemIds.length === 1
            ? 'Resized 1 item'
            : `Resized ${gesture.itemIds.length} items`,
        )
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
        setAnnouncement('Rotated 1 item')
      }

      setPreview({})
      setAltDragPreview(null)
      setGuides([])
      setMarquee(null)
    }

    const cancelGesture = () => {
      cancelLongPress()
      gestureRef.current = null
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
      if (
        !readOnly &&
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
          event.key,
        )
      ) {
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
          movable.length === 1
            ? `Moved 1 item ${distance} pixels`
            : `Moved ${movable.length} items ${distance} pixels`,
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
      setAnnouncement(`Aligned ${patches.length} items`)
    }

    const applyDistribution = (distribution: BoardDistribution) => {
      const patches = distributeBoardItems(
        geometry.items,
        selectedItemIds,
        distribution,
      )
      emitMovePatches(patches, 'distribute')
      setAnnouncement(`Distributed ${patches.length} items`)
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
    const handleSize = 20 / activeView.zoom
    const handleDot = 10 / activeView.zoom

    return (
      <div
        {...props}
        ref={setRefs}
        role="application"
        aria-label={`${boardName} mood board`}
        aria-describedby="board-room-instructions"
        tabIndex={0}
        className={cn(
          'relative h-full min-h-[320px] w-full overflow-hidden bg-[var(--bg-muted,#eeeae3)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-clay,#a66d4f)]',
          spaceHeld ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
          className,
        )}
        style={{ touchAction: 'none', ...style }}
        data-zoom={activeView.zoom}
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
          Use Tab to move through items, Enter to open an item, arrow keys to
          nudge a selection, Space and drag to pan, and 1 to fit the
          composition.
        </span>
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </div>

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

        {showAlignmentControls && !readOnly && selectedItemIds.length >= 2 && (
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
                aria-label={`${item.type.replace('_', ' ')} item`}
                aria-pressed={selected}
                aria-disabled={item.locked || readOnly}
                tabIndex={0}
                data-board-item-id={item.id}
                className={cn(
                  'absolute outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-clay,#a66d4f)]',
                  !readOnly && !item.locked && 'cursor-move',
                  item.locked && 'cursor-default',
                )}
                style={{
                  left: resolved.x,
                  top: resolved.y,
                  width: resolved.width,
                  height: resolved.height,
                  zIndex: Math.max(0, resolved.zIndex),
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
                {selectedSingle?.id === item.id &&
                  !item.locked &&
                  !readOnly &&
                  RESIZE_HANDLES.map((handle) => (
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
                {RESIZE_HANDLES.map((handle) => (
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
  const positions: Record<BoardResizeHandle, React.CSSProperties> = {
    nw: { left: 0, top: 0, transform: 'translate(-50%, -50%)' },
    n: { left: '50%', top: 0, transform: 'translate(-50%, -50%)' },
    ne: { right: 0, top: 0, transform: 'translate(50%, -50%)' },
    e: { right: 0, top: '50%', transform: 'translate(50%, -50%)' },
    se: { right: 0, bottom: 0, transform: 'translate(50%, 50%)' },
    s: { left: '50%', bottom: 0, transform: 'translate(-50%, 50%)' },
    sw: { left: 0, bottom: 0, transform: 'translate(-50%, 50%)' },
    w: { left: 0, top: '50%', transform: 'translate(-50%, -50%)' },
  }
  return (
    <button
      type="button"
      aria-label={label ?? `Resize ${handle}`}
      className="pointer-events-auto absolute z-30 flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-clay,#a66d4f)]"
      style={{ ...positions[handle], width: size, height: size }}
      onPointerDown={onPointerDown}
    >
      <span
        className="block rounded-sm border border-white bg-[var(--color-clay,#a66d4f)]"
        style={{ width: dot, height: dot }}
      />
    </button>
  )
}
