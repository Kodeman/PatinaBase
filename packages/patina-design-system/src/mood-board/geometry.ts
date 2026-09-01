import {
  MOOD_BOARD_GEOMETRY_VERSION,
  type BoardGeometrySnapshot,
  type BoardItemGeometrySnapshot,
  type BoardPoint,
  type BoardRect,
  type BoardSectionGeometrySnapshot,
  type BoardSize,
  type MoodBoardItemData,
  type MoodBoardItemSnapshot,
  type MoodBoardSection,
  type MoodBoardSnapshot,
} from '@patina/types'

export const DEFAULT_MOOD_BOARD_CANVAS = { width: 1200, height: 800 } as const
export const DEFAULT_MOOD_BOARD_BACKGROUND = '#FAF8F5'
export const DEFAULT_MOOD_BOARD_ITEM_WIDTH = 240
export const DEFAULT_MOOD_BOARD_GRID_SIZE = 20
export const MOOD_BOARD_GUIDE_TOLERANCE_PX = 6
export const MOOD_BOARD_CANVAS_GROW_MARGIN = 240
export const MOOD_BOARD_MIN_ZOOM = 0.05
export const MOOD_BOARD_MAX_ZOOM = 4

type NumericInput = number | string | null | undefined

export interface MoodBoardGeometryItemInput extends Omit<
  MoodBoardItemSnapshot,
  'x' | 'y' | 'width' | 'height' | 'zIndex' | 'rotation' | 'data'
> {
  x: NumericInput
  y: NumericInput
  width: NumericInput
  height?: NumericInput
  zIndex?: NumericInput
  rotation?: NumericInput
  data?: MoodBoardItemData | Record<string, unknown> | null
}

export interface MoodBoardGeometryInput extends Pick<
  MoodBoardSnapshot,
  'sections' | 'backgroundColor'
> {
  canvasWidth: NumericInput
  canvasHeight: NumericInput
  items: readonly MoodBoardGeometryItemInput[]
}

export interface BoardView {
  pan: BoardPoint
  zoom: number
}

export interface BoardFitResult extends BoardView {
  visibleBounds: BoardRect
}

export type BoardAlignment =
  | 'left'
  | 'horizontal-center'
  | 'right'
  | 'top'
  | 'vertical-center'
  | 'bottom'

export type BoardDistribution =
  | 'horizontal-centers'
  | 'vertical-centers'
  | 'horizontal-gaps'
  | 'vertical-gaps'

export interface BoardPositionPatch extends BoardPoint {
  id: string
}

export interface BoardGuide {
  axis: 'x' | 'y'
  position: number
  start: number
  end: number
  kind: 'edge' | 'center' | 'spacing'
}

export interface BoardGuideResult {
  delta: BoardPoint
  snappedRect: BoardRect
  guides: BoardGuide[]
}

interface BoardGuideMatch {
  delta: number
  position: number
  target: BoardRect
  kind: 'edge' | 'center'
}

interface BoardSpacingMatch {
  delta: number
  movingGuide: BoardGuide
  referenceGuide: BoardGuide
}

export interface BoardGuideOptions {
  zoom: number
  tolerancePx?: number
  excludeKeys?: readonly string[]
  canvas?: BoardSize
  /** Restricts which moving edge/center may snap (used by resize handles). */
  movingValueIndices?: Partial<Record<'x' | 'y', readonly number[]>>
}

export interface BoardAutoGrowResult {
  grew: boolean
  canvas: BoardSize
  translation: BoardPoint
  items: Array<{ key: string; id?: string; x: number; y: number }>
}

function finiteNumber(value: NumericInput, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function positiveNumber(value: NumericInput): number | null {
  const parsed = finiteNumber(value, Number.NaN)
  return parsed > 0 ? parsed : null
}

function round(value: number, places = 6): number {
  const factor = 10 ** places
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function recordData(value: unknown): MoodBoardItemData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return { ...(value as Record<string, unknown>) }
}

/**
 * Resolves the nullable-height contract exactly once for all consumers:
 * persisted explicit height → measured JSON snapshot → deterministic fallback.
 */
export function resolveMoodBoardItemHeight(item: MoodBoardGeometryItemInput): number {
  const explicit = positiveNumber(item.height)
  if (explicit !== null) return explicit

  const data = recordData(item.data)
  const measured = positiveNumber(data.resolved_height as NumericInput)
  if (measured !== null) return measured

  const width = positiveNumber(item.width) ?? DEFAULT_MOOD_BOARD_ITEM_WIDTH
  const ratio = item.type === 'image' || item.type === 'room_scan' ? 0.72 : 1.15
  return round(width * ratio)
}

/** Axis-aligned bounds of a rectangle rotated about its center. */
export function rotatedBoardRect(rect: BoardRect, degrees = 0): BoardRect {
  const normalized = ((degrees % 360) + 360) % 360
  if (normalized === 0) return { ...rect }

  const radians = (normalized * Math.PI) / 180
  const sin = Math.abs(Math.sin(radians))
  const cos = Math.abs(Math.cos(radians))
  const width = rect.width * cos + rect.height * sin
  const height = rect.width * sin + rect.height * cos
  const center = {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  }
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
  }
}

export function unionBoardRects(rects: readonly BoardRect[]): BoardRect | null {
  if (rects.length === 0) return null
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const rect of rects) {
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
    maxX = Math.max(maxX, rect.x + rect.width)
    maxY = Math.max(maxY, rect.y + rect.height)
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function boardRectsIntersect(a: BoardRect, b: BoardRect): boolean {
  return (
    a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
  )
}

function itemSectionId(item: BoardItemGeometrySnapshot): string | null {
  const id = item.data.section_id
  return typeof id === 'string' && id.length > 0 ? id : null
}

function resolveSectionGeometry(
  sections: readonly MoodBoardSection[],
  items: readonly BoardItemGeometrySnapshot[],
  sidePad = 16,
  topPad = 24,
): BoardSectionGeometrySnapshot[] {
  const result: BoardSectionGeometrySnapshot[] = []
  for (const section of sections) {
    const members = items.filter((item) => itemSectionId(item) === section.id)
    const memberBounds = unionBoardRects(members.map((item) => item.aabb))
    if (!memberBounds) continue

    const x = Math.max(0, memberBounds.x - sidePad)
    const y = Math.max(0, memberBounds.y - topPad)
    result.push({
      ...section,
      bounds: {
        x,
        y,
        width: memberBounds.x + memberBounds.width + sidePad - x,
        height: memberBounds.y + memberBounds.height + sidePad - y,
      },
      memberKeys: members.map((item) => item.key),
    })
  }
  return result
}

/**
 * Builds the immutable geometry snapshot shared by BoardComposition, the room,
 * the PNG painter, cover generation and the later PDF adapter.
 */
export function resolveMoodBoardGeometry(input: MoodBoardGeometryInput): BoardGeometrySnapshot {
  const canvas = {
    width: positiveNumber(input.canvasWidth) ?? DEFAULT_MOOD_BOARD_CANVAS.width,
    height: positiveNumber(input.canvasHeight) ?? DEFAULT_MOOD_BOARD_CANVAS.height,
    backgroundColor: input.backgroundColor || DEFAULT_MOOD_BOARD_BACKGROUND,
  }

  const items = input.items
    .map((source, sourceIndex): BoardItemGeometrySnapshot => {
      const width = positiveNumber(source.width) ?? DEFAULT_MOOD_BOARD_ITEM_WIDTH
      const height = resolveMoodBoardItemHeight(source)
      const x = finiteNumber(source.x, 0)
      const y = finiteNumber(source.y, 0)
      const rotation = finiteNumber(source.rotation, 0)
      const box = { x, y, width, height }
      const data = recordData(source.data)
      return {
        key: source.id || `snapshot:${sourceIndex}`,
        id: source.id,
        sourceIndex,
        type: source.type,
        x,
        y,
        width,
        height,
        zIndex: finiteNumber(source.zIndex, 0),
        rotation,
        locked: source.locked ?? false,
        box,
        center: { x: x + width / 2, y: y + height / 2 },
        aabb: rotatedBoardRect(box, rotation),
        imageUrl: source.imageUrl ?? null,
        imageKey: source.imageKey ?? null,
        content: source.content ?? null,
        data,
      }
    })
    .sort((a, b) => a.zIndex - b.zIndex || a.sourceIndex - b.sourceIndex)

  const sections = resolveSectionGeometry(input.sections ?? [], items)
  const contentBounds = unionBoardRects([
    ...items.map((item) => item.aabb),
    ...sections.map((section) => section.bounds),
  ]) ?? { x: 0, y: 0, width: canvas.width, height: canvas.height }

  return {
    version: MOOD_BOARD_GEOMETRY_VERSION,
    canvas,
    items,
    sections,
    contentBounds,
  }
}

export function screenPointToBoard(point: BoardPoint, pan: BoardPoint, zoom: number): BoardPoint {
  const safeZoom = clampBoardZoom(zoom)
  return { x: (point.x - pan.x) / safeZoom, y: (point.y - pan.y) / safeZoom }
}

export function boardPointToScreen(point: BoardPoint, pan: BoardPoint, zoom: number): BoardPoint {
  const safeZoom = clampBoardZoom(zoom)
  return { x: point.x * safeZoom + pan.x, y: point.y * safeZoom + pan.y }
}

export function clampBoardZoom(zoom: number): number {
  return Math.min(MOOD_BOARD_MAX_ZOOM, Math.max(MOOD_BOARD_MIN_ZOOM, zoom))
}

export function zoomBoardViewAtPoint(
  view: BoardView,
  screenPoint: BoardPoint,
  zoom: number,
): BoardView {
  const nextZoom = clampBoardZoom(zoom)
  const logicalPoint = screenPointToBoard(screenPoint, view.pan, view.zoom)
  return {
    zoom: nextZoom,
    pan: {
      x: screenPoint.x - logicalPoint.x * nextZoom,
      y: screenPoint.y - logicalPoint.y * nextZoom,
    },
  }
}

export function fitBoardGeometry(
  geometry: BoardGeometrySnapshot,
  viewport: BoardSize,
  marginRatio = 0.05,
): BoardFitResult {
  const bounds = geometry.contentBounds
  const usableWidth = Math.max(1, viewport.width * (1 - marginRatio * 2))
  const usableHeight = Math.max(1, viewport.height * (1 - marginRatio * 2))
  const zoom = clampBoardZoom(
    Math.min(usableWidth / Math.max(1, bounds.width), usableHeight / Math.max(1, bounds.height)),
  )
  const pan = {
    x: (viewport.width - bounds.width * zoom) / 2 - bounds.x * zoom,
    y: (viewport.height - bounds.height * zoom) / 2 - bounds.y * zoom,
  }
  return {
    pan,
    zoom,
    visibleBounds: {
      x: bounds.x * zoom + pan.x,
      y: bounds.y * zoom + pan.y,
      width: bounds.width * zoom,
      height: bounds.height * zoom,
    },
  }
}

export function marqueeIntersections(
  items: readonly BoardItemGeometrySnapshot[],
  marquee: BoardRect,
): string[] {
  return items
    .filter((item) => !item.locked && boardRectsIntersect(item.aabb, marquee))
    .map((item) => item.id ?? item.key)
}

function rectAxisValues(rect: BoardRect, axis: 'x' | 'y'): number[] {
  return axis === 'x'
    ? [rect.x, rect.x + rect.width / 2, rect.x + rect.width]
    : [rect.y, rect.y + rect.height / 2, rect.y + rect.height]
}

export function findBoardAlignmentGuides(
  movingRect: BoardRect,
  stationaryItems: readonly BoardItemGeometrySnapshot[],
  options: BoardGuideOptions,
): BoardGuideResult {
  const tolerance =
    (options.tolerancePx ?? MOOD_BOARD_GUIDE_TOLERANCE_PX) / clampBoardZoom(options.zoom)
  const excluded = new Set(options.excludeKeys ?? [])
  const targets = stationaryItems.filter((item) => !excluded.has(item.key))
  let xMatch: BoardGuideMatch | null = null
  let yMatch: BoardGuideMatch | null = null

  const consider = (axis: 'x' | 'y', targetRect: BoardRect) => {
    const movingValues = rectAxisValues(movingRect, axis)
    const targetValues = rectAxisValues(targetRect, axis)
    const movingIndices = options.movingValueIndices?.[axis] ?? [0, 1, 2]
    for (const movingIndex of movingIndices) {
      for (let targetIndex = 0; targetIndex < targetValues.length; targetIndex += 1) {
        const delta = targetValues[targetIndex]! - movingValues[movingIndex]!
        if (Math.abs(delta) > tolerance) continue
        const match = {
          delta,
          position: targetValues[targetIndex]!,
          target: targetRect,
          kind: targetIndex === 1 || movingIndex === 1 ? ('center' as const) : ('edge' as const),
        }
        if (axis === 'x' && (!xMatch || Math.abs(delta) < Math.abs(xMatch.delta))) xMatch = match
        if (axis === 'y' && (!yMatch || Math.abs(delta) < Math.abs(yMatch.delta))) yMatch = match
      }
    }
  }

  targets.forEach((item) => {
    consider('x', item.aabb)
    consider('y', item.aabb)
  })

  if (options.canvas) {
    const canvasCenter = {
      x: options.canvas.width / 2,
      y: options.canvas.height / 2,
      width: 0,
      height: 0,
    }
    consider('x', canvasCenter)
    consider('y', canvasCenter)
  }

  // TypeScript does not model assignment performed inside `consider`; retain
  // the precise runtime type after all candidates have been visited.
  const resolvedXMatch = xMatch as BoardGuideMatch | null
  const resolvedYMatch = yMatch as BoardGuideMatch | null
  const delta = {
    x: resolvedXMatch?.delta ?? 0,
    y: resolvedYMatch?.delta ?? 0,
  }
  const snappedRect = {
    ...movingRect,
    x: movingRect.x + delta.x,
    y: movingRect.y + delta.y,
  }
  const guides: BoardGuide[] = []
  if (resolvedXMatch) {
    guides.push({
      axis: 'x',
      position: resolvedXMatch.position,
      start: Math.min(snappedRect.y, resolvedXMatch.target.y),
      end: Math.max(
        snappedRect.y + snappedRect.height,
        resolvedXMatch.target.y + resolvedXMatch.target.height,
      ),
      kind: resolvedXMatch.kind,
    })
  }
  if (resolvedYMatch) {
    guides.push({
      axis: 'y',
      position: resolvedYMatch.position,
      start: Math.min(snappedRect.x, resolvedYMatch.target.x),
      end: Math.max(
        snappedRect.x + snappedRect.width,
        resolvedYMatch.target.x + resolvedYMatch.target.width,
      ),
      kind: resolvedYMatch.kind,
    })
  }
  return { delta, snappedRect, guides }
}

function axisSpan(rect: BoardRect, axis: 'x' | 'y') {
  return axis === 'x'
    ? { start: rect.x, end: rect.x + rect.width, cross: rect.y + rect.height / 2 }
    : { start: rect.y, end: rect.y + rect.height, cross: rect.x + rect.width / 2 }
}

function spacingGuide(
  axis: 'x' | 'y',
  start: number,
  end: number,
  cross: number,
): BoardGuide {
  return {
    axis,
    position: cross,
    start: Math.min(start, end),
    end: Math.max(start, end),
    kind: 'spacing',
  }
}

function findBoardSpacingMatch(
  axis: 'x' | 'y',
  movingRect: BoardRect,
  targets: readonly BoardRect[],
  tolerance: number,
  movingValueIndices: readonly number[] = [0, 1, 2],
): BoardSpacingMatch | null {
  if (targets.length < 2) return null
  const ordered = targets
    .map((rect) => ({ rect, span: axisSpan(rect, axis) }))
    .sort((a, b) => a.span.start - b.span.start)
  const referenceGaps = ordered.flatMap((entry, index) => {
    const next = ordered[index + 1]
    if (!next) return []
    const gap = next.span.start - entry.span.end
    if (gap <= 0) return []
    return [{
      gap,
      start: entry.span.end,
      end: next.span.start,
      cross: Math.min(entry.span.cross, next.span.cross),
    }]
  })
  if (referenceGaps.length === 0) return null

  const moving = axisSpan(movingRect, axis)
  let best: BoardSpacingMatch | null = null
  const consider = (
    delta: number,
    neighbor: ReturnType<typeof axisSpan>,
    reference: (typeof referenceGaps)[number],
    movingStart: number,
    movingEnd: number,
  ) => {
    if (Math.abs(delta) > tolerance) return
    const candidate: BoardSpacingMatch = {
      delta,
      movingGuide: spacingGuide(
        axis,
        movingStart,
        movingEnd,
        Math.min(moving.cross, neighbor.cross),
      ),
      referenceGuide: spacingGuide(
        axis,
        reference.start,
        reference.end,
        reference.cross,
      ),
    }
    if (!best || Math.abs(delta) < Math.abs(best.delta)) best = candidate
  }

  for (const { span: neighbor } of ordered) {
    const beforeGap = moving.start - neighbor.end
    if (beforeGap >= 0 && movingValueIndices.includes(0)) {
      for (const reference of referenceGaps) {
        const delta = reference.gap - beforeGap
        consider(
          delta,
          neighbor,
          reference,
          neighbor.end,
          moving.start + delta,
        )
      }
    }
    const afterGap = neighbor.start - moving.end
    if (afterGap >= 0 && movingValueIndices.includes(2)) {
      for (const reference of referenceGaps) {
        const delta = afterGap - reference.gap
        consider(
          delta,
          neighbor,
          reference,
          moving.end + delta,
          neighbor.start,
        )
      }
    }
  }
  return best
}

/**
 * Alignment is preferred per axis; when no edge/center match exists, an
 * equal-gap match supplies the snap delta and a pair of distance markers.
 */
export function findBoardSmartGuides(
  movingRect: BoardRect,
  stationaryItems: readonly BoardItemGeometrySnapshot[],
  options: BoardGuideOptions,
): BoardGuideResult {
  const alignment = findBoardAlignmentGuides(
    movingRect,
    stationaryItems,
    options,
  )
  const excluded = new Set(options.excludeKeys ?? [])
  const targets = stationaryItems
    .filter((item) => !excluded.has(item.key))
    .map((item) => item.aabb)
  const tolerance =
    (options.tolerancePx ?? MOOD_BOARD_GUIDE_TOLERANCE_PX) /
    clampBoardZoom(options.zoom)
  const hasXAlignment = alignment.guides.some(
    (guide) => guide.axis === 'x' && guide.kind !== 'spacing',
  )
  const hasYAlignment = alignment.guides.some(
    (guide) => guide.axis === 'y' && guide.kind !== 'spacing',
  )
  const allowsX = (options.movingValueIndices?.x?.length ?? 1) > 0
  const allowsY = (options.movingValueIndices?.y?.length ?? 1) > 0
  const xSpacing = !hasXAlignment && allowsX
    ? findBoardSpacingMatch(
        'x',
        movingRect,
        targets,
        tolerance,
        options.movingValueIndices?.x,
      )
    : null
  const ySpacing = !hasYAlignment && allowsY
    ? findBoardSpacingMatch(
        'y',
        movingRect,
        targets,
        tolerance,
        options.movingValueIndices?.y,
      )
    : null
  const delta = {
    x: hasXAlignment ? alignment.delta.x : xSpacing?.delta ?? 0,
    y: hasYAlignment ? alignment.delta.y : ySpacing?.delta ?? 0,
  }
  return {
    delta,
    snappedRect: {
      ...movingRect,
      x: movingRect.x + delta.x,
      y: movingRect.y + delta.y,
    },
    guides: [
      ...alignment.guides,
      ...(xSpacing ? [xSpacing.referenceGuide, xSpacing.movingGuide] : []),
      ...(ySpacing ? [ySpacing.referenceGuide, ySpacing.movingGuide] : []),
    ],
  }
}

function selectedGeometry(
  items: readonly BoardItemGeometrySnapshot[],
  ids: readonly string[],
): BoardItemGeometrySnapshot[] {
  const selected = new Set(ids)
  return items.filter((item) => item.id && selected.has(item.id))
}

export function alignBoardItems(
  items: readonly BoardItemGeometrySnapshot[],
  ids: readonly string[],
  alignment: BoardAlignment,
): BoardPositionPatch[] {
  const selected = selectedGeometry(items, ids)
  const bounds = unionBoardRects(selected.map((item) => item.aabb))
  if (!bounds || selected.length < 2) return []

  return selected.flatMap((item) => {
    if (!item.id || item.locked) return []
    let dx = 0
    let dy = 0
    if (alignment === 'left') dx = bounds.x - item.aabb.x
    if (alignment === 'horizontal-center') {
      dx = bounds.x + bounds.width / 2 - (item.aabb.x + item.aabb.width / 2)
    }
    if (alignment === 'right') dx = bounds.x + bounds.width - (item.aabb.x + item.aabb.width)
    if (alignment === 'top') dy = bounds.y - item.aabb.y
    if (alignment === 'vertical-center') {
      dy = bounds.y + bounds.height / 2 - (item.aabb.y + item.aabb.height / 2)
    }
    if (alignment === 'bottom') dy = bounds.y + bounds.height - (item.aabb.y + item.aabb.height)
    if (dx === 0 && dy === 0) return []
    return [{ id: item.id, x: item.x + dx, y: item.y + dy }]
  })
}

function distributeCenters(
  items: readonly BoardItemGeometrySnapshot[],
  axis: 'x' | 'y',
): BoardPositionPatch[] {
  const sorted = items
    .slice()
    .sort((a, b) => (axis === 'x' ? a.center.x - b.center.x : a.center.y - b.center.y))
  if (sorted.length < 3) return []
  const first = axis === 'x' ? sorted[0]!.center.x : sorted[0]!.center.y
  const last = axis === 'x' ? sorted.at(-1)!.center.x : sorted.at(-1)!.center.y
  const step = (last - first) / (sorted.length - 1)
  return sorted.slice(1, -1).flatMap((item, index) => {
    if (!item.id || item.locked) return []
    const target = first + step * (index + 1)
    return [
      {
        id: item.id,
        x: axis === 'x' ? item.x + target - item.center.x : item.x,
        y: axis === 'y' ? item.y + target - item.center.y : item.y,
      },
    ]
  })
}

function distributeGaps(
  items: readonly BoardItemGeometrySnapshot[],
  axis: 'x' | 'y',
): BoardPositionPatch[] {
  const start = (item: BoardItemGeometrySnapshot) => (axis === 'x' ? item.aabb.x : item.aabb.y)
  const size = (item: BoardItemGeometrySnapshot) =>
    axis === 'x' ? item.aabb.width : item.aabb.height
  const sorted = items.slice().sort((a, b) => start(a) - start(b))
  if (sorted.length < 3) return []
  const totalSize = sorted.reduce((sum, item) => sum + size(item), 0)
  const span = start(sorted.at(-1)!) + size(sorted.at(-1)!) - start(sorted[0]!)
  const gap = (span - totalSize) / (sorted.length - 1)
  let cursor = start(sorted[0]!) + size(sorted[0]!) + gap
  const patches: BoardPositionPatch[] = []
  for (const item of sorted.slice(1, -1)) {
    const delta = cursor - start(item)
    if (item.id && !item.locked && delta !== 0) {
      patches.push({
        id: item.id,
        x: axis === 'x' ? item.x + delta : item.x,
        y: axis === 'y' ? item.y + delta : item.y,
      })
    }
    cursor += size(item) + gap
  }
  return patches
}

export function distributeBoardItems(
  items: readonly BoardItemGeometrySnapshot[],
  ids: readonly string[],
  distribution: BoardDistribution,
): BoardPositionPatch[] {
  const selected = selectedGeometry(items, ids)
  if (distribution === 'horizontal-centers') return distributeCenters(selected, 'x')
  if (distribution === 'vertical-centers') return distributeCenters(selected, 'y')
  if (distribution === 'horizontal-gaps') return distributeGaps(selected, 'x')
  return distributeGaps(selected, 'y')
}

export interface BoardCascadePlacementOptions {
  /** Board-space distance between cascade steps on each axis. */
  step?: number
  /** How close two points must be to count as the same occupied slot. */
  tolerance?: number
  maxAttempts?: number
  /**
   * Rects a candidate slot must not fall inside — e.g. section-band bounds
   * (label included, since a band's derived bounds already pad for it), so
   * a click-add never lands under a band.
   */
  avoidRects?: readonly BoardRect[]
}

function pointInBoardRect(point: BoardPoint, rect: BoardRect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

/**
 * Walks a diagonal cascade from `basePoint` — (step, step), (2*step, 2*step),
 * … — and returns the first point that is neither already occupied nor
 * inside an avoided rect. Click-add (note, product, palette, scan, project
 * selection, single uploads) shares one base anchor; without this, every
 * add would land on the exact same board point and stack invisibly (CI-11).
 * Exhausting `maxAttempts` (default 500) falls back to the final unchecked
 * cascade point rather than looping forever.
 */
export function findBoardCascadePlacement(
  basePoint: BoardPoint,
  occupied: readonly BoardPoint[],
  options: BoardCascadePlacementOptions = {},
): BoardPoint {
  const step = options.step ?? 24
  const tolerance = options.tolerance ?? 4
  const maxAttempts = options.maxAttempts ?? 500
  const avoidRects = options.avoidRects ?? []
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = {
      x: basePoint.x + step * attempt,
      y: basePoint.y + step * attempt,
    }
    const collidesWithItem = occupied.some(
      (point) =>
        Math.abs(point.x - candidate.x) <= tolerance &&
        Math.abs(point.y - candidate.y) <= tolerance,
    )
    const collidesWithBand = avoidRects.some((rect) =>
      pointInBoardRect(candidate, rect),
    )
    if (!collidesWithItem && !collidesWithBand) return candidate
  }
  return {
    x: basePoint.x + step * maxAttempts,
    y: basePoint.y + step * maxAttempts,
  }
}

export function computeBoardAutoGrow(
  geometry: BoardGeometrySnapshot,
  margin = MOOD_BOARD_CANVAS_GROW_MARGIN,
): BoardAutoGrowResult {
  const bounds = geometry.contentBounds
  const right = bounds.x + bounds.width
  const bottom = bounds.y + bounds.height
  const leftGrowth = bounds.x < 0 ? -bounds.x + margin : 0
  const topGrowth = bounds.y < 0 ? -bounds.y + margin : 0
  const rightGrowth = right > geometry.canvas.width ? right - geometry.canvas.width + margin : 0
  const bottomGrowth =
    bottom > geometry.canvas.height ? bottom - geometry.canvas.height + margin : 0
  const grew = leftGrowth > 0 || topGrowth > 0 || rightGrowth > 0 || bottomGrowth > 0
  const translation = { x: leftGrowth, y: topGrowth }

  // Canvas dimensions are integers on the wire (proposal_boards.canvas_width /
  // canvas_height are `integer`, and apply_board_room_state rejects anything
  // that is not `^[0-9]+$`). Growth derived from rotated/fractional content
  // bounds is not, so it is rounded up here rather than at each consumer.
  // The item translation below deliberately stays fractional: the same RPC
  // accepts decimal item coordinates (`^[0-9]+([.][0-9]+)?$`), and rounding
  // them would shift pins away from where the gesture left them.
  return {
    grew,
    canvas: {
      width: Math.ceil(geometry.canvas.width + leftGrowth + rightGrowth),
      height: Math.ceil(geometry.canvas.height + topGrowth + bottomGrowth),
    },
    translation,
    items: geometry.items.map((item) => ({
      key: item.key,
      id: item.id,
      x: item.x + translation.x,
      y: item.y + translation.y,
    })),
  }
}
