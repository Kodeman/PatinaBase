import type { BoardRect } from '@patina/types'

/**
 * Pixel contract shared by the DOM composition and the deterministic painter.
 * Keep typography and box math here instead of maintaining two look-alikes.
 */
export const MOOD_BOARD_BODY_FONT =
  'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif'
export const MOOD_BOARD_DISPLAY_FONT =
  'Iowan Old Style, Georgia, ui-serif, serif'
export const MOOD_BOARD_MONO_FONT =
  'ui-monospace, SFMono-Regular, Menlo, monospace'

/**
 * Plate and caption (US-28 S12; SPEC §S12.2): a picture item is a plate — the
 * photo or drawing on a 1px card edge — then a sans name and mono lines of
 * facts. No shadow, no pill, no clamp, no truncation: the plate gives up
 * height so the caption always prints whole. A zone is a 1px dashed edge in
 * the designer's colour with its word printed in ink inside it; a note is
 * text on the note edge.
 *
 * The colours are kept as hex, not CSS vars, because the export painter can't
 * resolve custom properties. Each is the hex VALUE of the designer-portal
 * token named beside it (apps/designer-portal/src/app/globals.css); keep them
 * in step or Present/guest/export stop matching the board room.
 */
export const MOOD_BOARD_VISUAL = {
  plateRadius: 3,
  sectionRadius: 2,
  sectionDash: [4, 3] as const,
  /** The zone word sits inside the dashed edge, top-left. */
  zoneWordInsetX: 12,
  zoneWordInsetY: 8,
  /** The house state word: mono 12/16, .08em tracking, uppercase. */
  word: { size: 12, line: 16, letterSpacing: 0.96 },
  caption: { gap: 6, nameSize: 13, nameLine: 18, metaSize: 12, metaLine: 16 },
  /**
   * The least a plate gives up to its caption — the canvas's smallest item
   * edge. Mirrored as 40px in globals.css `.br-item`/`.br-plate` (R13).
   */
  plateMin: 40,
  /** Padding around a word printed inside an empty plate. */
  plateWordPadding: 8,
  /** As board-item-renderer.tsx NoteCard: the 2px edge, then 16px of air. */
  note: { edge: 2, padTop: 4, padLeft: 16, size: 14, line: 21 },
  colors: {
    plate: '#FCFAF6', // --paper-doc
    cardEdge: '#8F8C88', // --card-edge
    text: '#2C2926', // --text-primary
    subtle: '#5A4E43', // --text-subtle
    muted: '#4E4339', // --text-muted
    noteEdge: '#8B7355', // --oak (--edge-note)
    zoneDefault: '#8c8175', // a zone with no designer colour
  },
} as const

/** A zone's dashed edge: the designer's colour, or the quiet default. */
export function moodBoardZoneColor(value: string | null | undefined): string {
  return value && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : MOOD_BOARD_VISUAL.colors.zoneDefault
}

/** Height a caption takes under its plate, from its wrapped line counts. */
export function moodBoardCaptionHeight(
  nameLines: number,
  metaLines: number,
): number {
  const { gap, nameLine, metaLine } = MOOD_BOARD_VISUAL.caption
  if (nameLines + metaLines === 0) return 0
  return gap + nameLines * nameLine + metaLines * metaLine
}

/**
 * The plate gives up height to the caption down to `plateMin`; past that the
 * item grows below its saved box so the caption still prints whole, never
 * truncated (R13). The DOM tile does the same with a grid row of
 * `minmax(plateMin, 1fr)` over an item at least its saved height.
 */
export function resolveMoodBoardPlate(
  width: number,
  height: number,
  captionHeight: number,
): { plate: BoardRect; captionTop: number } {
  const plateHeight = Math.max(MOOD_BOARD_VISUAL.plateMin, height - captionHeight)
  return {
    plate: { x: 0, y: 0, width, height: plateHeight },
    captionTop: plateHeight + (captionHeight > 0 ? MOOD_BOARD_VISUAL.caption.gap : 0),
  }
}

/** The height a plate-and-caption item prints: its saved box, or more for a long caption. */
export function moodBoardItemExtent(height: number, captionHeight: number): number {
  return captionHeight > 0
    ? Math.max(height, MOOD_BOARD_VISUAL.plateMin + captionHeight)
    : height
}

/**
 * The rectangle an item prints, in board px: the box from its top edge down
 * to `extent` (its plate and caption), turned about the centre of its SAVED
 * box as the DOM tile (`transform-origin: center`) and the painter both turn
 * it. Unrotated, that is simply `{ x, y, width, height: extent }`; rotated, it
 * is the turned box's bounds on all four sides, so a turned caption is never
 * clipped at any edge (R13b).
 */
export function moodBoardPrintedRect(
  box: { x: number; y: number; width: number; height: number; rotation?: number | null },
  extent: number,
): BoardRect {
  const radians = ((box.rotation ?? 0) * Math.PI) / 180
  if (!Number.isFinite(radians) || radians % (2 * Math.PI) === 0) {
    return { x: box.x, y: box.y, width: box.width, height: extent }
  }
  const sin = Math.sin(radians)
  const cos = Math.cos(radians)
  const centreX = box.x + box.width / 2
  const centreY = box.y + box.height / 2
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const dx of [-box.width / 2, box.width / 2]) {
    for (const dy of [-box.height / 2, extent - box.height / 2]) {
      const x = centreX + dx * cos - dy * sin
      const y = centreY + dx * sin + dy * cos
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * The composition's printed bounds: the saved canvas, grown on every side so
 * each item's printed rectangle — a caption past its saved box, turned past
 * the top or a side, included — sits inside it. `x`/`y` are 0 or negative:
 * the composition's origin moves by them, the saved coordinates never do.
 * Never clip (R13b): the DOM composition, Present, the painter and the PNG
 * preflight all size and place to this one rectangle, the DOM from measured
 * boxes and the painter and preflight from the paint's text metrics.
 */
export function resolveMoodBoardContentBounds(
  canvas: { width: number; height: number },
  printed: ReadonlyArray<BoardRect>,
): BoardRect {
  let left = 0
  let top = 0
  let right = canvas.width
  let bottom = canvas.height
  for (const rect of printed) {
    left = Math.min(left, rect.x)
    top = Math.min(top, rect.y)
    right = Math.max(right, rect.x + rect.width)
    bottom = Math.max(bottom, rect.y + rect.height)
  }
  // Whole board px, outward. A quarter turn leaves float dust (sin π is
  // 1.2e-16, not 0) that must not cost a pixel, so edges read to a thousandth.
  const edge = (value: number) => Math.round(value * 1000) / 1000
  const x = Math.floor(edge(left))
  const y = Math.floor(edge(top))
  return { x, y, width: Math.ceil(edge(right)) - x, height: Math.ceil(edge(bottom)) - y }
}
