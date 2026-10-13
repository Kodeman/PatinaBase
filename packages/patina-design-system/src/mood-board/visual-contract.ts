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
 * The plate gives up height to the caption; it never goes below zero, and a
 * caption taller than its item prints past the item rather than truncating.
 */
export function resolveMoodBoardPlate(
  width: number,
  height: number,
  captionHeight: number,
): { plate: BoardRect; captionTop: number } {
  const plateHeight = Math.max(0, height - captionHeight)
  return {
    plate: { x: 0, y: 0, width, height: plateHeight },
    captionTop: plateHeight + (captionHeight > 0 ? MOOD_BOARD_VISUAL.caption.gap : 0),
  }
}
