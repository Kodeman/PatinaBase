import type {
  BoardGeometrySnapshot,
  BoardItemGeometrySnapshot,
  BoardRect,
} from '@patina/types'

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
}

export interface MoodBoardPaintResult {
  warnings: MoodBoardPaintWarning[]
  paintedItemKeys: string[]
}

const BODY_FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif'
const DISPLAY_FONT = 'Iowan Old Style, Georgia, ui-serif, serif'

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
  fillRoundedRect(context, rect, 4, '#eee9e1')
  context.strokeStyle = '#cfc5b8'
  context.lineWidth = 1
  context.strokeRect(rect.x, rect.y, rect.width, rect.height)
  context.fillStyle = '#756b60'
  context.font = `12px ${BODY_FONT}`
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

async function resolveItemImage(
  item: BoardItemGeometrySnapshot,
  resolver: MoodBoardImageResolver | undefined,
  warnings: MoodBoardPaintWarning[],
): Promise<MoodBoardResolvedImage | null> {
  const request = imageRequest(item)
  if (!request || !resolver) return null
  try {
    const image = await resolver(request)
    if (image) return image
  } catch {
    // Failed resources degrade to a labelled placeholder below.
  }
  warnings.push({
    itemKey: item.key,
    itemId: item.id,
    label: request.label,
    reason: 'image-load-failed',
  })
  return null
}

function drawSection(
  context: MoodBoardPainterContext,
  section: BoardGeometrySnapshot['sections'][number],
) {
  context.save()
  context.globalAlpha = 0.09
  fillRoundedRect(context, section.bounds, 6, section.color ?? '#8c8175')
  context.restore()
  context.lineWidth = 1
  strokeRoundedRect(context, section.bounds, 6, section.color ?? '#8c8175')
  context.fillStyle = section.color ?? '#8c8175'
  context.font = `600 12px ${BODY_FONT}`
  context.textAlign = 'left'
  context.textBaseline = 'bottom'
  context.fillText(section.name, section.bounds.x + 8, section.bounds.y - 4)
}

async function drawProduct(
  context: MoodBoardPainterContext,
  item: BoardItemGeometrySnapshot,
  image: MoodBoardResolvedImage | null,
) {
  fillRoundedRect(
    context,
    { x: 0, y: 0, width: item.width, height: item.height },
    4,
    '#ffffff',
  )
  strokeRoundedRect(
    context,
    { x: 0, y: 0, width: item.width, height: item.height },
    4,
    '#ded7cd',
  )
  const captionHeight = Math.min(70, Math.max(42, item.height * 0.25))
  const imageRect = {
    x: 0,
    y: 0,
    width: item.width,
    height: Math.max(1, item.height - captionHeight),
  }
  if (image) drawContainedImage(context, image, imageRect)
  else drawPlaceholder(context, imageRect, itemLabel(item))

  const name = itemLabel(item)
  context.fillStyle = '#362f29'
  context.font = `12px ${BODY_FONT}`
  context.textAlign = 'left'
  context.textBaseline = 'top'
  const lines = wrapText(context, name, item.width - 16, 2)
  lines.forEach((line, index) =>
    context.fillText(line, 8, imageRect.height + 7 + index * 14),
  )

  const vendor = dataString(item, 'vendor_name')
  if (vendor) {
    context.fillStyle = '#776e64'
    context.font = `italic 10px ${BODY_FONT}`
    context.fillText(vendor, 8, item.height - 18, item.width - 16)
  }
  const price = dataNumber(item, 'price_cents')
  if (price !== null) {
    context.fillStyle = '#362f29'
    context.font = `600 11px ${DISPLAY_FONT}`
    context.textAlign = 'right'
    context.fillText(
      `$${Math.round(price / 100).toLocaleString('en-US')}`,
      item.width - 8,
      item.height - 18,
    )
  }
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
  fillRoundedRect(
    context,
    { x: 0, y: 0, width: item.width, height: item.height },
    4,
    '#ffffff',
  )
  const labelHeight = Math.min(28, item.height * 0.3)
  const stripHeight = item.height - labelHeight
  if (swatches.length === 0) {
    context.fillStyle = '#eee9e1'
    context.fillRect(0, 0, item.width, stripHeight)
  } else {
    const width = item.width / swatches.length
    swatches.forEach((swatch, index) => {
      context.fillStyle = swatch.hex
      context.fillRect(index * width, 0, width + 0.5, stripHeight)
    })
  }
  context.fillStyle = '#5f564d'
  context.font = `10px ${DISPLAY_FONT}`
  context.textAlign = 'left'
  context.textBaseline = 'middle'
  context.fillText(
    itemLabel(item),
    8,
    stripHeight + labelHeight / 2,
    item.width - 16,
  )
}

function drawNote(
  context: MoodBoardPainterContext,
  item: BoardItemGeometrySnapshot,
) {
  fillRoundedRect(
    context,
    { x: 0, y: 0, width: item.width, height: item.height },
    5,
    '#f3e9d5',
  )
  strokeRoundedRect(
    context,
    { x: 0, y: 0, width: item.width, height: item.height },
    5,
    '#e0d2b8',
  )
  context.fillStyle = '#4a4137'
  context.font = `13px ${BODY_FONT}`
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
  fillRoundedRect(
    context,
    { x: 0, y: 0, width: item.width, height: item.height },
    4,
    '#ffffff',
  )
  const labelHeight = Math.min(28, item.height * 0.22)
  const imageRect = {
    x: 0,
    y: 0,
    width: item.width,
    height: item.height - labelHeight,
  }
  if (image) drawContainedImage(context, image, imageRect)
  else drawPlaceholder(context, imageRect, itemLabel(item))
  context.fillStyle = '#655b52'
  context.font = `10px ${DISPLAY_FONT}`
  context.textAlign = 'left'
  context.textBaseline = 'middle'
  context.fillText(
    itemLabel(item),
    8,
    item.height - labelHeight / 2,
    item.width - 16,
  )
}

async function drawItem(
  context: MoodBoardPainterContext,
  item: BoardItemGeometrySnapshot,
  resolver: MoodBoardImageResolver | undefined,
  warnings: MoodBoardPaintWarning[],
) {
  const image =
    item.type === 'product' ||
    item.type === 'capture' ||
    item.type === 'image' ||
    item.type === 'room_scan'
      ? await resolveItemImage(item, resolver, warnings)
      : null

  context.save()
  context.translate(item.x + item.width / 2, item.y + item.height / 2)
  context.rotate((item.rotation * Math.PI) / 180)
  context.translate(-item.width / 2, -item.height / 2)
  if (item.type === 'product' || item.type === 'capture')
    await drawProduct(context, item, image)
  else if (item.type === 'image') {
    if (image)
      drawContainedImage(context, image, {
        x: 0,
        y: 0,
        width: item.width,
        height: item.height,
      })
    else
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
}: PaintMoodBoardOptions): Promise<MoodBoardPaintResult> {
  const warnings: MoodBoardPaintWarning[] = []
  const paintedItemKeys: string[] = []
  context.save()
  context.globalAlpha = 1
  context.fillStyle = geometry.canvas.backgroundColor
  context.fillRect(0, 0, transform.viewportWidth, transform.viewportHeight)
  context.translate(transform.offsetX, transform.offsetY)
  context.scale(transform.scale, transform.scale)
  geometry.sections.forEach((section) => drawSection(context, section))
  onProgress?.(geometry.items.length === 0 ? 1 : 0)

  for (let index = 0; index < geometry.items.length; index += 1) {
    const item = geometry.items[index]!
    await drawItem(context, item, resolveImage, warnings)
    paintedItemKeys.push(item.key)
    onProgress?.((index + 1) / geometry.items.length, item.key)
  }
  context.restore()
  return { warnings, paintedItemKeys }
}
