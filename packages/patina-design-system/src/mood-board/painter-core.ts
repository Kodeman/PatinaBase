import type {
  BoardGeometrySnapshot,
  BoardItemGeometrySnapshot,
  BoardRect,
} from '@patina/types'
import {
  MOOD_BOARD_BODY_FONT,
  MOOD_BOARD_DISPLAY_FONT,
  MOOD_BOARD_MONO_FONT,
  MOOD_BOARD_VISUAL,
  resolveMoodBoardMediaLayout,
  resolveMoodBoardProductLayout,
} from './visual-contract'

/** Minimal structural 2D context; implemented by browser and worker canvases. */
export interface MoodBoardPainterContext {
  fillStyle: string
  strokeStyle: string
  lineWidth: number
  font: string
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
  globalAlpha: number
  save(): void
  restore(): void
  scale(x: number, y: number): void
  translate(x: number, y: number): void
  rotate(radians: number): void
  fillRect(x: number, y: number, width: number, height: number): void
  strokeRect(x: number, y: number, width: number, height: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void
  closePath(): void
  fill(): void
  stroke(): void
  clip(): void
  setLineDash(segments: number[]): void
  drawImage(
    image: unknown,
    dx: number,
    dy: number,
    dWidth: number,
    dHeight: number,
  ): void
  fillText(text: string, x: number, y: number, maxWidth?: number): void
  measureText(text: string): { width: number }
}

export interface MoodBoardResolvedImage {
  source: unknown
  width: number
  height: number
}

export interface MoodBoardImageRequest {
  itemKey: string
  itemId?: string
  url?: string | null
  imageKey?: string | null
  label: string
}

export type MoodBoardImageResolver = (
  request: MoodBoardImageRequest,
) => Promise<MoodBoardResolvedImage | null>

export interface MoodBoardPaintWarning {
  itemKey: string
  itemId?: string
  label: string
  reason: 'image-load-failed'
}

export interface MoodBoardPaintTransform {
  scale: number
  offsetX: number
  offsetY: number
  viewportWidth: number
  viewportHeight: number
}

export interface PaintMoodBoardOptions {
  context: MoodBoardPainterContext
  geometry: BoardGeometrySnapshot
  transform: MoodBoardPaintTransform
  resolveImage?: MoodBoardImageResolver
  onProgress?: (progress: number, itemKey?: string) => void
  /** Bounded image decode/fetch parallelism. @default 8 */
  imageLoadConcurrency?: number
  /** Cooperative main-thread yield seam (injected by deterministic tests). */
  yieldControl?: () => Promise<void>
}

export interface MoodBoardPaintResult {
  warnings: MoodBoardPaintWarning[]
  paintedItemKeys: string[]
}

function dataString(
  item: BoardItemGeometrySnapshot,
  key: string,
): string | null {
  const value = item.data[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function dataNumber(
  item: BoardItemGeometrySnapshot,
  key: string,
): number | null {
  const value = item.data[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function sourceHost(value: string | null): string | null {
  if (!value) return null
  try {
    return new URL(value).host.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

function itemLabel(item: BoardItemGeometrySnapshot): string {
  return (
    dataString(item, 'name') ??
    item.content?.trim() ??
    item.type.replace('_', ' ')
  )
}

function imageRequest(
  item: BoardItemGeometrySnapshot,
): MoodBoardImageRequest | null {
  const url = item.imageUrl ?? dataString(item, 'image_url')
  if (!url && !item.imageKey) return null
  return {
    itemKey: item.key,
    itemId: item.id,
    url,
    imageKey: item.imageKey,
    label: itemLabel(item),
  }
}

function roundedRectPath(
  context: MoodBoardPainterContext,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + r, y)
  context.lineTo(x + width - r, y)
  context.quadraticCurveTo(x + width, y, x + width, y + r)
  context.lineTo(x + width, y + height - r)
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  context.lineTo(x + r, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - r)
  context.lineTo(x, y + r)
  context.quadraticCurveTo(x, y, x + r, y)
  context.closePath()
}

function fillRoundedRect(
  context: MoodBoardPainterContext,
  rect: BoardRect,
  radius: number,
  color: string,
) {
  context.fillStyle = color
  roundedRectPath(context, rect.x, rect.y, rect.width, rect.height, radius)
  context.fill()
}

function strokeRoundedRect(
  context: MoodBoardPainterContext,
  rect: BoardRect,
  radius: number,
  color: string,
) {
  context.strokeStyle = color
  roundedRectPath(context, rect.x, rect.y, rect.width, rect.height, radius)
  context.stroke()
}

function drawContainedImage(
  context: MoodBoardPainterContext,
  image: MoodBoardResolvedImage,
  rect: BoardRect,
) {
  const imageWidth = Math.max(1, image.width)
  const imageHeight = Math.max(1, image.height)
  const scale = Math.min(rect.width / imageWidth, rect.height / imageHeight)
  const width = imageWidth * scale
  const height = imageHeight * scale
  context.drawImage(
    image.source,
    rect.x + (rect.width - width) / 2,
    rect.y + (rect.height - height) / 2,
    width,
    height,
  )
}

function drawPlaceholder(
  context: MoodBoardPainterContext,
  rect: BoardRect,
  label: string,
) {
  context.fillStyle = MOOD_BOARD_VISUAL.colors.placeholder
  context.fillRect(rect.x, rect.y, rect.width, rect.height)
  context.strokeStyle = MOOD_BOARD_VISUAL.colors.placeholderBorder
  context.lineWidth = 1
  context.strokeRect(rect.x, rect.y, rect.width, rect.height)
  context.fillStyle = MOOD_BOARD_VISUAL.colors.placeholderText
  context.font = `12px ${MOOD_BOARD_BODY_FONT}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(
    label,
    rect.x + rect.width / 2,
    rect.y + rect.height / 2,
    rect.width - 16,
  )
}

function wrapText(
  context: MoodBoardPainterContext,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (
      context.measureText(candidate).width <= maxWidth ||
      current.length === 0
    ) {
      current = candidate
      continue
    }
    lines.push(current)
    current = word
    if (lines.length === maxLines - 1) break
  }
  if (current && lines.length < maxLines) lines.push(current)
  if (
    lines.length === maxLines &&
    words.join(' ').length > lines.join(' ').length
  ) {
    const last = lines.at(-1) ?? ''
    lines[lines.length - 1] = `${last.replace(/[.…]+$/, '')}…`
  }
  return lines
}

interface ResolvedItemImage {
  image: MoodBoardResolvedImage | null
  warning: MoodBoardPaintWarning | null
}

async function resolveItemImage(
  item: BoardItemGeometrySnapshot,
  resolver: MoodBoardImageResolver | undefined,
): Promise<ResolvedItemImage> {
  const request = imageRequest(item)
  if (!request || !resolver) return { image: null, warning: null }
  try {
    const image = await resolver(request)
    if (image) return { image, warning: null }
  } catch {
    // Failed resources degrade to a labelled placeholder below.
  }
  return {
    image: null,
    warning: {
      itemKey: item.key,
      itemId: item.id,
      label: request.label,
      reason: 'image-load-failed',
    },
  }
}

function itemUsesImage(item: BoardItemGeometrySnapshot): boolean {
  return (
    item.type === 'product' ||
    item.type === 'capture' ||
    item.type === 'image' ||
    item.type === 'room_scan'
  )
}

async function defaultYieldControl(): Promise<void> {
  const scheduler = (
    globalThis as typeof globalThis & {
      scheduler?: { yield?: () => Promise<void> }
    }
  ).scheduler
  if (typeof scheduler?.yield === 'function') {
    await scheduler.yield()
    return
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

async function preloadItemImages(options: {
  items: readonly BoardItemGeometrySnapshot[]
  resolver: MoodBoardImageResolver | undefined
  concurrency: number
  onProgress?: (progress: number, itemKey?: string) => void
}): Promise<Map<string, ResolvedItemImage>> {
  const candidates = options.items.filter(
    (item) => itemUsesImage(item) && imageRequest(item) !== null,
  )
  const resolved = new Map<string, ResolvedItemImage>()
  if (candidates.length === 0 || !options.resolver) return resolved

  let cursor = 0
  let completed = 0
  const workerCount = Math.min(
    candidates.length,
    Math.max(1, Math.floor(options.concurrency)),
  )
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      for (;;) {
        const index = cursor
        cursor += 1
        const item = candidates[index]
        if (!item) return
        resolved.set(item.key, await resolveItemImage(item, options.resolver))
        completed += 1
        // Image hydration owns the first 70% of determinate progress. This is
        // deliberately emitted as each request completes instead of leaving
        // the UI parked at zero behind a large Promise.all barrier.
        options.onProgress?.((completed / candidates.length) * 0.7, item.key)
      }
    }),
  )
  return resolved
}

function drawSection(
  context: MoodBoardPainterContext,
  section: BoardGeometrySnapshot['sections'][number],
) {
  const color = section.color ?? '#8c8175'
  context.save()
  context.globalAlpha = MOOD_BOARD_VISUAL.sectionFillAlpha
  fillRoundedRect(
    context,
    section.bounds,
    MOOD_BOARD_VISUAL.sectionRadius,
    color,
  )
  context.restore()
  context.lineWidth = 1
  context.setLineDash([...MOOD_BOARD_VISUAL.sectionDash])
  strokeRoundedRect(
    context,
    section.bounds,
    MOOD_BOARD_VISUAL.sectionRadius,
    color,
  )
  context.setLineDash([])

  context.font = `500 11px ${MOOD_BOARD_BODY_FONT}`
  const labelWidth =
    context.measureText(section.name).width +
    MOOD_BOARD_VISUAL.sectionLabelPaddingX * 2
  const labelRect = {
    x: section.bounds.x + 8,
    y: section.bounds.y - MOOD_BOARD_VISUAL.sectionLabelHeight / 2,
    width: labelWidth,
    height: MOOD_BOARD_VISUAL.sectionLabelHeight,
  }
  fillRoundedRect(context, labelRect, labelRect.height / 2, color)
  context.fillStyle = '#ffffff'
  context.textAlign = 'left'
  context.textBaseline = 'middle'
  context.fillText(
    section.name,
    labelRect.x + MOOD_BOARD_VISUAL.sectionLabelPaddingX,
    section.bounds.y,
  )
}

async function drawProduct(
  context: MoodBoardPainterContext,
  item: BoardItemGeometrySnapshot,
  image: MoodBoardResolvedImage | null,
) {
  const layout = resolveMoodBoardProductLayout(item.width, item.height)
  fillRoundedRect(
    context,
    layout.frame,
    MOOD_BOARD_VISUAL.pinRadius,
    MOOD_BOARD_VISUAL.colors.surface,
  )
  context.save()
  roundedRectPath(
    context,
    layout.frame.x,
    layout.frame.y,
    layout.frame.width,
    layout.frame.height,
    MOOD_BOARD_VISUAL.pinRadius,
  )
  context.clip()
  if (image) drawContainedImage(context, image, layout.image)
  else drawPlaceholder(context, layout.image, itemLabel(item))

  const name = itemLabel(item)
  context.fillStyle = MOOD_BOARD_VISUAL.colors.text
  context.font = `12px ${MOOD_BOARD_BODY_FONT}`
  context.textAlign = 'left'
  context.textBaseline = 'top'
  const lines = wrapText(context, name, item.width - 16, 2)
  lines.forEach((line, index) =>
    context.fillText(line, 8, layout.nameTop + index * 14),
  )

  const vendor = dataString(item, 'vendor_name')
  if (vendor) {
    context.fillStyle = MOOD_BOARD_VISUAL.colors.muted
    context.font = `italic 10px ${MOOD_BOARD_BODY_FONT}`
    context.textBaseline = 'alphabetic'
    context.fillText(vendor, 8, layout.metaBaseline, item.width - 16)
  }
  const price = dataNumber(item, 'price_cents')
  if (price !== null) {
    context.fillStyle = MOOD_BOARD_VISUAL.colors.text
    context.font = `600 11px ${MOOD_BOARD_DISPLAY_FONT}`
    context.textAlign = 'right'
    context.textBaseline = 'alphabetic'
    context.fillText(
      `$${Math.round(price / 100).toLocaleString('en-US')}`,
      item.width - 8,
      layout.metaBaseline,
    )
  }
  const host = sourceHost(dataString(item, 'source_url'))
  if (host) {
    context.fillStyle = MOOD_BOARD_VISUAL.colors.muted
    context.font = `9px ${MOOD_BOARD_MONO_FONT}`
    context.textAlign = 'left'
    context.textBaseline = 'alphabetic'
    context.fillText(host, 8, layout.sourceBaseline, item.width - 16)
  }
  context.restore()
  context.lineWidth = 1
  strokeRoundedRect(
    context,
    layout.frame,
    MOOD_BOARD_VISUAL.pinRadius,
    MOOD_BOARD_VISUAL.colors.border,
  )
}

function drawPalette(
  context: MoodBoardPainterContext,
  item: BoardItemGeometrySnapshot,
) {
  const raw = item.data.swatches
  const swatches = Array.isArray(raw)
    ? raw.filter(
        (swatch): swatch is { hex: string; name?: string } =>
          !!swatch &&
          typeof swatch === 'object' &&
          typeof (swatch as { hex?: unknown }).hex === 'string',
      )
    : []
  const layout = resolveMoodBoardMediaLayout(item.width, item.height)
  fillRoundedRect(
    context,
    layout.frame,
    MOOD_BOARD_VISUAL.pinRadius,
    MOOD_BOARD_VISUAL.colors.surface,
  )
  if (swatches.length === 0) {
    context.fillStyle = MOOD_BOARD_VISUAL.colors.placeholder
    context.fillRect(
      layout.media.x,
      layout.media.y,
      layout.media.width,
      layout.media.height,
    )
  } else {
    const width = layout.media.width / swatches.length
    swatches.forEach((swatch, index) => {
      context.fillStyle = swatch.hex
      context.fillRect(
        layout.media.x + index * width,
        layout.media.y,
        width + 0.5,
        layout.media.height,
      )
    })
  }
  context.fillStyle = MOOD_BOARD_VISUAL.colors.muted
  context.font = `500 9px ${MOOD_BOARD_DISPLAY_FONT}`
  context.textAlign = 'left'
  context.textBaseline = 'middle'
  context.fillText(
    itemLabel(item).toUpperCase(),
    8,
    layout.labelTop + (item.height - layout.labelTop) / 2,
    item.width - 16,
  )
  context.lineWidth = 1
  strokeRoundedRect(
    context,
    layout.frame,
    MOOD_BOARD_VISUAL.pinRadius,
    MOOD_BOARD_VISUAL.colors.border,
  )
}

function drawNote(
  context: MoodBoardPainterContext,
  item: BoardItemGeometrySnapshot,
) {
  fillRoundedRect(
    context,
    { x: 0, y: 0, width: item.width, height: item.height },
    MOOD_BOARD_VISUAL.pinRadius,
    MOOD_BOARD_VISUAL.colors.note,
  )
  strokeRoundedRect(
    context,
    { x: 0, y: 0, width: item.width, height: item.height },
    MOOD_BOARD_VISUAL.pinRadius,
    MOOD_BOARD_VISUAL.colors.noteBorder,
  )
  context.fillStyle = MOOD_BOARD_VISUAL.colors.noteText
  context.font = `13px ${MOOD_BOARD_BODY_FONT}`
  context.textAlign = 'left'
  context.textBaseline = 'top'
  const lines = wrapText(
    context,
    item.content?.trim() || 'Empty note',
    item.width - 24,
    12,
  )
  lines.forEach((line, index) => context.fillText(line, 12, 12 + index * 18))
}

function drawRoomScan(
  context: MoodBoardPainterContext,
  item: BoardItemGeometrySnapshot,
  image: MoodBoardResolvedImage | null,
) {
  const layout = resolveMoodBoardMediaLayout(item.width, item.height)
  fillRoundedRect(
    context,
    layout.frame,
    MOOD_BOARD_VISUAL.pinRadius,
    MOOD_BOARD_VISUAL.colors.surface,
  )
  if (image) drawContainedImage(context, image, layout.media)
  else drawPlaceholder(context, layout.media, itemLabel(item))
  context.fillStyle = MOOD_BOARD_VISUAL.colors.muted
  context.font = `500 9px ${MOOD_BOARD_DISPLAY_FONT}`
  context.textAlign = 'left'
  context.textBaseline = 'middle'
  context.fillText(
    itemLabel(item).toUpperCase(),
    8,
    layout.labelTop + (item.height - layout.labelTop) / 2,
    item.width - 16,
  )
  context.lineWidth = 1
  strokeRoundedRect(
    context,
    layout.frame,
    MOOD_BOARD_VISUAL.pinRadius,
    MOOD_BOARD_VISUAL.colors.border,
  )
}

async function drawItem(
  context: MoodBoardPainterContext,
  item: BoardItemGeometrySnapshot,
  image: MoodBoardResolvedImage | null,
) {
  context.save()
  context.translate(item.x + item.width / 2, item.y + item.height / 2)
  context.rotate((item.rotation * Math.PI) / 180)
  context.translate(-item.width / 2, -item.height / 2)
  if (item.type === 'product' || item.type === 'capture')
    await drawProduct(context, item, image)
  else if (item.type === 'image') {
    if (image) {
      roundedRectPath(
        context,
        0,
        0,
        item.width,
        item.height,
        MOOD_BOARD_VISUAL.pinRadius,
      )
      context.clip()
      drawContainedImage(context, image, {
        x: 0,
        y: 0,
        width: item.width,
        height: item.height,
      })
    } else
      drawPlaceholder(
        context,
        { x: 0, y: 0, width: item.width, height: item.height },
        itemLabel(item),
      )
  } else if (item.type === 'room_scan') drawRoomScan(context, item, image)
  else if (item.type === 'palette') drawPalette(context, item)
  else if (item.type === 'note') drawNote(context, item)
  context.restore()
}

/**
 * Worker-safe painter. No `window`, `document`, `Image`, React or DOM snapshot
 * code is referenced here; callers inject a context and optional image loader.
 */
export async function paintMoodBoardGeometry({
  context,
  geometry,
  transform,
  resolveImage,
  onProgress,
  imageLoadConcurrency = 8,
  yieldControl = defaultYieldControl,
}: PaintMoodBoardOptions): Promise<MoodBoardPaintResult> {
  const warnings: MoodBoardPaintWarning[] = []
  const paintedItemKeys: string[] = []
  onProgress?.(0)
  const images = await preloadItemImages({
    items: geometry.items,
    resolver: resolveImage,
    concurrency: imageLoadConcurrency,
    onProgress,
  })
  for (const item of geometry.items) {
    const warning = images.get(item.key)?.warning
    if (warning) warnings.push(warning)
  }
  const hasImages = images.size > 0
  const paintProgressStart = hasImages ? 0.7 : 0

  context.save()
  context.globalAlpha = 1
  context.fillStyle = geometry.canvas.backgroundColor
  context.fillRect(0, 0, transform.viewportWidth, transform.viewportHeight)
  context.translate(transform.offsetX, transform.offsetY)
  context.scale(transform.scale, transform.scale)
  geometry.sections.forEach((section) => drawSection(context, section))
  onProgress?.(geometry.items.length === 0 ? 1 : paintProgressStart)

  for (let index = 0; index < geometry.items.length; index += 1) {
    const item = geometry.items[index]!
    await drawItem(context, item, images.get(item.key)?.image ?? null)
    paintedItemKeys.push(item.key)
    onProgress?.(
      paintProgressStart +
        ((index + 1) / geometry.items.length) * (1 - paintProgressStart),
      item.key,
    )
    if ((index + 1) % 12 === 0 && index + 1 < geometry.items.length) {
      await yieldControl()
    }
  }
  context.restore()
  return { warnings, paintedItemKeys }
}
