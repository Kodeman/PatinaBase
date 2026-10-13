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
 * The composition's height: the saved canvas, grown so every item's printed
 * extent — a caption that ran past its saved box included — sits inside it.
 * Never clip (R13b): the DOM composition, Present and the painter all size to
 * this, the DOM from measured boxes and the painter from its text metrics.
 */
export function resolveMoodBoardContentHeight(
  canvasHeight: number,
  extents: ReadonlyArray<{ y: number; height: number }>,
): number {
  let bottom = canvasHeight
  for (const extent of extents) bottom = Math.max(bottom, extent.y + extent.height)
  return Math.ceil(bottom)
}
