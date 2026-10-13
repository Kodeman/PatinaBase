import type {
  BoardGeometrySnapshot,
  BoardItemGeometrySnapshot,
  BoardRect,
} from '@patina/types'
import {
  MOOD_BOARD_BODY_FONT,
  MOOD_BOARD_MONO_FONT,
  MOOD_BOARD_VISUAL,
  moodBoardCaptionHeight,
  moodBoardItemExtent,
  moodBoardPrintedRect,
  moodBoardZoneColor,
  resolveMoodBoardContentBounds,
  resolveMoodBoardPlate,
} from './visual-contract'

/** Minimal structural 2D context; implemented by browser and worker canvases. */
export interface MoodBoardPainterContext {
  fillStyle: string
  strokeStyle: string
  lineWidth: number
  font: string
  /** Canvas text tracking (e.g. `0.96px`); optional where a context lacks it. */
  letterSpacing?: string
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

/**
 * Wraps text to `maxWidth` the way the DOM caption does (`overflow-wrap:
 * anywhere`): on spaces first, and a word too long for a line breaks inside
 * itself. Never clamps or adds an ellipsis — every line prints.
 */
function wrapText(
  context: MoodBoardPainterContext,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  const fits = (value: string) => context.measureText(value).width <= maxWidth
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (fits(candidate)) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    current = ''
    let rest = word
    while (rest.length > 1 && !fits(rest)) {
      let cut = rest.length - 1
      while (cut > 1 && !fits(rest.slice(0, cut))) cut -= 1
      lines.push(rest.slice(0, cut))
      rest = rest.slice(cut)
    }
    current = rest
  }
  if (current) lines.push(current)
  return lines
}

function setTracking(context: MoodBoardPainterContext, value: string) {
  if ('letterSpacing' in context) context.letterSpacing = value
}

/** The house word: mono, tracked, uppercase (SPEC §S12.2.2). */
function setWordFont(context: MoodBoardPainterContext) {
  const { size, letterSpacing } = MOOD_BOARD_VISUAL.word
  context.font = `${size}px ${MOOD_BOARD_MONO_FONT}`
  setTracking(context, `${letterSpacing}px`)
}

/** Lines of text, each vertically centred in its CSS line box. */
function fillLines(
  context: MoodBoardPainterContext,
  lines: readonly string[],
  x: number,
  top: number,
  lineHeight: number,
) {
  context.textBaseline = 'middle'
  lines.forEach((line, index) =>
    context.fillText(line, x, top + index * lineHeight + lineHeight / 2),
  )
}

/** The plate's 1px card edge, drawn inside its box like a CSS border. */
function strokePlate(context: MoodBoardPainterContext, plate: BoardRect) {
  if (plate.width < 1 || plate.height < 1) return
  context.lineWidth = 1
  strokeRoundedRect(
    context,
    {
      x: plate.x + 0.5,
      y: plate.y + 0.5,
      width: plate.width - 1,
      height: plate.height - 1,
    },
    MOOD_BOARD_VISUAL.plateRadius,
    MOOD_BOARD_VISUAL.colors.cardEdge,
  )
}

/** Inside the 1px edge: where a photo or swatches sit. */
function plateMedia(plate: BoardRect): BoardRect {
  return {
    x: plate.x + 1,
    y: plate.y + 1,
    width: Math.max(0, plate.width - 2),
    height: Math.max(0, plate.height - 2),
  }
}

/**
 * Paints a plate: the board stock, then its contents clipped to the rounded
 * edge, then the edge itself. Nothing paints when the caption took it all.
 */
function drawPlate(
  context: MoodBoardPainterContext,
  plate: BoardRect,
  paintContents: () => void,
) {
  if (plate.width < 1 || plate.height < 1) return
  fillRoundedRect(
    context,
    plate,
    MOOD_BOARD_VISUAL.plateRadius,
    MOOD_BOARD_VISUAL.colors.plate,
  )
  context.save()
  roundedRectPath(
    context,
    plate.x,
    plate.y,
    plate.width,
    plate.height,
    MOOD_BOARD_VISUAL.plateRadius,
  )
  context.clip()
  paintContents()
  context.restore()
  strokePlate(context, plate)
}

/** A word printed in an empty plate ("No image"), centred and wrapping. */
function drawPlateWord(
  context: MoodBoardPainterContext,
  plate: BoardRect,
  word: string,
) {
  const padding = MOOD_BOARD_VISUAL.plateWordPadding
  const { line } = MOOD_BOARD_VISUAL.word
  context.fillStyle = MOOD_BOARD_VISUAL.colors.subtle
  context.font = `${MOOD_BOARD_VISUAL.word.size}px ${MOOD_BOARD_MONO_FONT}`
  setTracking(context, '0px')
  context.textAlign = 'center'
  const lines = wrapText(context, word, Math.max(1, plate.width - padding * 2))
  const top = plate.y + (plate.height - lines.length * line) / 2
  fillLines(context, lines, plate.x + plate.width / 2, top, line)
}

interface CaptionLines {
  name: string[]
  meta: string[]
}

/** Wraps a caption to the item's width; the plate takes what is left. */
function measureCaption(
  context: MoodBoardPainterContext,
  width: number,
  name: string | null,
  meta: readonly string[],
): CaptionLines {
  const { nameSize, metaSize } = MOOD_BOARD_VISUAL.caption
  setTracking(context, '0px')
  context.font = `${nameSize}px ${MOOD_BOARD_BODY_FONT}`
  const nameLines = name ? wrapText(context, name, width) : []
  context.font = `${metaSize}px ${MOOD_BOARD_MONO_FONT}`
  const metaLines = meta.flatMap((line) => wrapText(context, line, width))
  return { name: nameLines, meta: metaLines }
}

function drawCaption(
  context: MoodBoardPainterContext,
  lines: CaptionLines,
  top: number,
) {
  const { nameSize, nameLine, metaSize, metaLine } = MOOD_BOARD_VISUAL.caption
  setTracking(context, '0px')
  context.textAlign = 'left'
  context.fillStyle = MOOD_BOARD_VISUAL.colors.text
  context.font = `${nameSize}px ${MOOD_BOARD_BODY_FONT}`
  fillLines(context, lines.name, 0, top, nameLine)
  context.fillStyle = MOOD_BOARD_VISUAL.colors.subtle
  context.font = `${metaSize}px ${MOOD_BOARD_MONO_FONT}`
  fillLines(context, lines.meta, 0, top + lines.name.length * nameLine, metaLine)
}

/**
 * The shared plate-and-caption item: wraps the caption first, gives the plate
 * the rest of the box, paints the plate, then prints the caption whole.
 */
function drawPlateAndCaption(
  context: MoodBoardPainterContext,
  item: BoardItemGeometrySnapshot,
  caption: { name: string | null; meta: readonly string[] },
  paintContents: (media: BoardRect, plate: BoardRect) => void,
) {
  const lines = measureCaption(context, item.width, caption.name, caption.meta)
  const { plate, captionTop } = resolveMoodBoardPlate(
    item.width,
    item.height,
    moodBoardCaptionHeight(lines.name.length, lines.meta.length),
  )
  drawPlate(context, plate, () => paintContents(plateMedia(plate), plate))
  drawCaption(context, lines, captionTop)
}

/**
 * The caption a plate item prints under its plate, or null for an item with
 * none (a bare image, a note). Product: the name, then one mono line of facts
 * (maker · price), then the captured source — provenance prints on every
 * presentation surface.
 */
function itemCaption(
  item: BoardItemGeometrySnapshot,
): { name: string | null; meta: string[] } | null {
  if (item.type === 'product' || item.type === 'capture') {
    const price = dataNumber(item, 'price_cents')
    const facts = [
      dataString(item, 'vendor_name'),
      price !== null ? formatDollars(price) : null,
    ]
      .filter(Boolean)
      .join(' · ')
    const host = sourceHost(dataString(item, 'source_url'))
    return {
      name: dataString(item, 'name') ?? 'Selected piece',
      meta: [facts, host].filter((line): line is string => Boolean(line)),
    }
  }
  if (item.type === 'palette') return { name: dataString(item, 'name') ?? 'Palette', meta: [] }
  if (item.type === 'room_scan') return { name: dataString(item, 'name') ?? 'Your space', meta: ['Scan'] }
  return null
}

/**
 * The composition the painter prints: the saved canvas, grown on every side
 * to hold every caption that ran past its saved box, wrapped with the same
 * text metrics the paint uses (R13b). Rasters size to this rectangle and move
 * their origin by its `x`/`y`, so nothing is clipped at any edge.
 */
export function measureMoodBoardContentBounds(
  context: MoodBoardPainterContext,
  geometry: BoardGeometrySnapshot,
): BoardRect {
  return resolveMoodBoardContentBounds(
    geometry.canvas,
    geometry.items.map((item) => {
      const caption = itemCaption(item)
      if (!caption) return moodBoardPrintedRect(item, item.height)
      const lines = measureCaption(context, item.width, caption.name, caption.meta)
      // The plate and caption, turned with the item (drawItem rotates about
      // the saved box's centre): a rotated caption's corners set the edges.
      return moodBoardPrintedRect(
        item,
        moodBoardItemExtent(
          item.height,
          moodBoardCaptionHeight(lines.name.length, lines.meta.length),
        ),
      )
    }),
  )
}

function formatDollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`
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
  // A zone is a 1px dashed edge in the designer's colour; no fill and no pill
  // label. Its word prints in ink inside the edge (SPEC §S12.2.2).
  const { bounds } = section
  context.lineWidth = 1
  context.setLineDash([...MOOD_BOARD_VISUAL.sectionDash])
  strokeRoundedRect(
    context,
    {
      x: bounds.x + 0.5,
      y: bounds.y + 0.5,
      width: Math.max(0, bounds.width - 1),
      height: Math.max(0, bounds.height - 1),
    },
    MOOD_BOARD_VISUAL.sectionRadius,
    moodBoardZoneColor(section.color),
  )
  context.setLineDash([])

  const insetX = MOOD_BOARD_VISUAL.zoneWordInsetX
  context.fillStyle = MOOD_BOARD_VISUAL.colors.text
  context.textAlign = 'left'
  setWordFont(context)
  const lines = wrapText(
    context,
    section.name.toUpperCase(),
    Math.max(1, bounds.width - insetX * 2),
  )
  fillLines(
    context,
    lines,
    bounds.x + insetX,
    bounds.y + MOOD_BOARD_VISUAL.zoneWordInsetY,
    MOOD_BOARD_VISUAL.word.line,
  )
  setTracking(context, '0px')
}

async function drawProduct(
  context: MoodBoardPainterContext,
  item: BoardItemGeometrySnapshot,
  image: MoodBoardResolvedImage | null,
) {
  drawPlateAndCaption(
    context,
    item,
    itemCaption(item)!,
    (media, plate) => {
      if (image) drawContainedImage(context, image, media)
      else drawPlateWord(context, plate, 'No image')
    },
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
  drawPlateAndCaption(
    context,
    item,
    itemCaption(item)!,
    (media, plate) => {
      if (swatches.length === 0) {
        drawPlateWord(context, plate, 'Empty palette')
        return
      }
      const width = media.width / swatches.length
      swatches.forEach((swatch, index) => {
        context.fillStyle = swatch.hex
        context.fillRect(
          media.x + index * width,
          media.y,
          width + 0.5,
          media.height,
        )
      })
    },
  )
}

/**
 * A note is text on the note edge (`--edge-note`): a 2px oak rule down its
 * left side on the board's own stock — no fill, no box, no shadow. Lines past
 * the item's height are clipped, as the DOM's `overflow: hidden` clips them.
 */
function drawNote(
  context: MoodBoardPainterContext,
  item: BoardItemGeometrySnapshot,
) {
  const { edge, padTop, padLeft, size, line } = MOOD_BOARD_VISUAL.note
  context.fillStyle = MOOD_BOARD_VISUAL.colors.noteEdge
  context.fillRect(0, 0, edge, item.height)
  context.save()
  context.beginPath()
  context.moveTo(0, 0)
  context.lineTo(item.width, 0)
  context.lineTo(item.width, item.height)
  context.lineTo(0, item.height)
  context.closePath()
  context.clip()
  context.fillStyle = MOOD_BOARD_VISUAL.colors.muted
  context.font = `${size}px ${MOOD_BOARD_BODY_FONT}`
  setTracking(context, '0px')
  context.textAlign = 'left'
  const text = item.content?.trim() || 'Empty note'
  const lines = text
    .split('\n')
    .flatMap((paragraph) =>
      paragraph.trim()
        ? wrapText(context, paragraph, Math.max(1, item.width - edge - padLeft))
        : [''],
    )
  fillLines(context, lines, edge + padLeft, padTop, line)
  context.restore()
}

function drawRoomScan(
  context: MoodBoardPainterContext,
  item: BoardItemGeometrySnapshot,
  image: MoodBoardResolvedImage | null,
) {
  drawPlateAndCaption(
    context,
    item,
    itemCaption(item)!,
    (media, plate) => {
      if (image) drawContainedImage(context, image, media)
      else drawPlateWord(context, plate, 'No preview')
    },
  )
}

/** A bare image is a plate with no caption; an empty one names itself. */
function drawImage(
  context: MoodBoardPainterContext,
  item: BoardItemGeometrySnapshot,
  image: MoodBoardResolvedImage | null,
) {
  const plate = { x: 0, y: 0, width: item.width, height: item.height }
  drawPlate(context, plate, () => {
    if (image) drawContainedImage(context, image, plateMedia(plate))
    else drawPlateWord(context, plate, dataString(item, 'name')?.trim() || 'Image reference')
  })
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
  else if (item.type === 'image') drawImage(context, item, image)
  else if (item.type === 'room_scan') drawRoomScan(context, item, image)
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
