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
  findBoardAlignmentGuides,
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
  onItemRotated?: (commit: BoardItemRotatedCommit) => void
  onItemsDropped?: (commit: BoardItemsDroppedCommit) => void
  onSectionMembership?: (commit: BoardSectionMembershipCommit) => void
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
  Pick<EditableMoodBoardItem, 'x' | 'y' | 'width' | 'height' | 'rotation'>
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
  itemIds: string[]
  before: BoardMoveSnapshot[]
  latest: BoardMoveSnapshot[]
  guides: BoardGuide[]
  sectionBounds: Array<{ id: string; bounds: BoardRect }>
}

interface ResizeGesture {
  kind: 'resize'
  pointerId: number
  startScreen: BoardPoint
  itemId: string
  handle: BoardResizeHandle
  before: BoardResizeGeometry
  latest: BoardResizeGeometry
  preserveAspectByDefault: boolean
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
  const implicitAspectHeight =
    before.height === null && (horizontalOnly || preserveAspect)
  return {
    x,
    y,
    width,
    height: implicitAspectHeight ? null : resolvedHeight,
    resolvedHeight,
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
      onItemRotated,
      onItemsDropped,
      onSectionMembership,
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
    const [marquee, setMarquee] = React.useState<BoardRect | null>(null)
    const [guides, setGuides] = React.useState<BoardGuide[]>([])
    const [announcement, setAnnouncement] = React.useState('')
    const [spaceHeld, setSpaceHeld] = React.useState(false)
    const [focusedItemId, setFocusedItemId] = React.useState<string | null>(
      null,
    )
    const gestureRef = React.useRef<CanvasGesture | null>(null)
    const reducedMotion = useReducedMotion()
    const selectedSet = React.useMemo(
      () => new Set(selectedItemIds),
      [selectedItemIds],
    )

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
        })
        const nextItems = items.map((item) => ({
          ...item,
          ...(byId.get(item.id) ?? {}),
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
      gestureRef.current = {
        kind: 'move',
        pointerId: event.pointerId,
        startScreen: eventPoint(event, viewport),
        leadId: itemId,
        itemIds: movingIds,
        before,
        latest: before,
        guides: [],
        sectionBounds: geometry.sections.map(({ id, bounds }) => ({
          id,
          bounds,
        })),
      }
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }

    const handleResizePointerDown = (
      event: React.PointerEvent<HTMLButtonElement>,
      itemId: string,
      handle: BoardResizeHandle,
    ) => {
      event.preventDefault()
      event.stopPropagation()
      const viewport = viewportRef.current
      const item = geometry.items.find((candidate) => candidate.id === itemId)
      const source = items.find((candidate) => candidate.id === itemId)
      if (!viewport || !item || !source || readOnly || item.locked) return
      const before: BoardResizeGeometry = {
        x: item.x,
        y: item.y,
        width: item.width,
        height: source.height ?? null,
        resolvedHeight: item.height,
      }
      gestureRef.current = {
        kind: 'resize',
        pointerId: event.pointerId,
        startScreen: eventPoint(event, viewport),
        itemId,
        handle,
        before,
        latest: before,
        preserveAspectByDefault: ASPECT_LOCKED_TYPES.has(item.type),
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
        const leadGeometry = geometry.items.find(
          (item) => item.id === gesture.leadId,
        )!
        let delta = { ...rawDelta }
        if (snapToGrid) {
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
          const guideResult = findBoardAlignmentGuides(
            {
              ...leadGeometry.aabb,
              x: leadGeometry.aabb.x + delta.x,
              y: leadGeometry.aabb.y + delta.y,
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
        setPreview(
          Object.fromEntries(
            gesture.latest.map((item) => [item.id, { x: item.x, y: item.y }]),
          ),
        )
        setGuides(nextGuides)
        return
      }

      if (gesture.kind === 'resize') {
        const delta = {
          x: (screen.x - gesture.startScreen.x) / activeView.zoom,
          y: (screen.y - gesture.startScreen.y) / activeView.zoom,
        }
        gesture.latest = resizeGeometry(
          gesture.before,
          gesture.handle,
          delta,
          gesture.preserveAspectByDefault && !event.shiftKey,
        )
        setPreview({
          [gesture.itemId]: {
            x: gesture.latest.x,
            y: gesture.latest.y,
            width: gesture.latest.width,
            height: gesture.latest.height,
            resolvedHeight: gesture.latest.resolvedHeight,
          },
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
      setPreview({ [gesture.itemId]: { rotation: degrees } })
    }

    const commitGesture = (event: React.PointerEvent<HTMLDivElement>) => {
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
        emitMovePatches(patches, 'drag', gesture.guides)
        const nextById = new Map(patches.map((patch) => [patch.id, patch]))
        for (const itemId of gesture.itemIds) {
          const item = items.find((candidate) => candidate.id === itemId)
          const next = nextById.get(itemId)
          if (!item || !next) continue
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
            onSectionMembership?.({ itemId, sectionId })
        }
        setAnnouncement(
          gesture.itemIds.length === 1
            ? 'Moved 1 item'
            : `Moved ${gesture.itemIds.length} items`,
        )
      }

      if (gesture.kind === 'resize' && gesture.latest !== gesture.before) {
        onItemResized?.({
          itemId: gesture.itemId,
          handle: gesture.handle,
          before: gesture.before,
          after: gesture.latest,
        })
        const nextItems = items.map((item) =>
          item.id === gesture.itemId
            ? {
                ...item,
                x: gesture.latest.x,
                y: gesture.latest.y,
                width: gesture.latest.width,
                height: gesture.latest.height,
                data: {
                  ...(item.data ?? {}),
                  resolved_height: gesture.latest.resolvedHeight,
                },
              }
            : item,
        )
        emitAutoGrow(nextItems, 'resize')
        setAnnouncement('Resized 1 item')
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
      setGuides([])
      setMarquee(null)
    }

    const cancelGesture = () => {
      gestureRef.current = null
      setPreview({})
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
        ) &&
        selectedItemIds.length > 0
      ) {
        event.preventDefault()
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
          items
            .filter((item) => selectedSet.has(item.id) && !item.locked)
            .map((item) => ({
              id: item.id,
              x: item.x + delta.x,
              y: item.y + delta.y,
            })),
          'keyboard',
        )
        setAnnouncement(
          selectedItemIds.length === 1
            ? `Moved 1 item ${distance} pixels`
            : `Moved ${selectedItemIds.length} items ${distance} pixels`,
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
          if (!onContextMenuRequest) return
          event.preventDefault()
          onContextMenuRequest({
            itemId: focusedItemId,
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
            <div
              key={section.id}
              data-board-section={section.id}
              className="pointer-events-none absolute rounded-sm border border-dashed"
              style={{
                left: section.bounds.x,
                top: section.bounds.y,
                width: section.bounds.width,
                height: section.bounds.height,
                borderColor: section.color ?? '#8c8175',
                backgroundColor: `${section.color ?? '#8c8175'}12`,
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
                        handleResizePointerDown(event, item.id, handle)
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

          {guides.map((guide, index) => (
            <div
              key={`${guide.axis}-${guide.position}-${index}`}
              data-board-guide={guide.axis}
              className="pointer-events-none absolute bg-[var(--color-clay,#a66d4f)]"
              style={
                guide.axis === 'x'
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
  size,
  dot,
  onPointerDown,
}: {
  handle: BoardResizeHandle
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
      aria-label={`Resize ${handle}`}
      className="absolute z-30 flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-clay,#a66d4f)]"
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
