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

export const MOOD_BOARD_VISUAL = {
  pinRadius: 2,
  sectionRadius: 2,
  sectionFillAlpha: 0.0625,
  sectionDash: [4, 3] as const,
  sectionLabelHeight: 20,
  sectionLabelPaddingX: 8,
  mediaLabelHeight: 28,
  colors: {
    surface: '#ffffff',
    pearl: '#f5f3ee',
    border: '#ded7cd',
    text: '#362f29',
    muted: '#776e64',
    // Kept as hex, not a CSS var: the deterministic export painter can't
    // resolve custom properties. These are the hex VALUES of the
    // --bg-warm/--border-warm/--color-bark tokens board-room-shell.tsx's
    // InlineNoteEditor and board-item-renderer.tsx's NoteCard standardized
    // on (VD1/VD18) — keep all three in step or edit mode diverges from
    // every presentation surface (Present/guest/client/mirror + export PDF).
    note: '#eee6db',
    noteBorder: '#ddd4c8',
    noteText: '#4a453f',
    placeholder: '#eee9e1',
    placeholderBorder: '#cfc5b8',
    placeholderText: '#756b60',
  },
} as const

export interface MoodBoardProductLayout {
  frame: BoardRect
  image: BoardRect
  captionTop: number
  nameTop: number
  metaBaseline: number
  sourceBaseline: number
}

export function resolveMoodBoardProductLayout(
  width: number,
  height: number,
): MoodBoardProductLayout {
  const captionHeight = Math.min(70, Math.max(42, height * 0.25))
  const captionTop = Math.max(1, height - captionHeight)
  return {
    frame: { x: 0, y: 0, width, height },
    image: {
      x: 1,
      y: 1,
      width: Math.max(1, width - 2),
      height: Math.max(1, captionTop - 1),
    },
    captionTop,
    nameTop: captionTop + 7,
    metaBaseline: height - 20,
    sourceBaseline: height - 6,
  }
}

export function resolveMoodBoardMediaLayout(
  width: number,
  height: number,
): { frame: BoardRect; media: BoardRect; labelTop: number } {
  const labelHeight = Math.min(
    MOOD_BOARD_VISUAL.mediaLabelHeight,
    Math.max(18, height * 0.3),
  )
  const labelTop = Math.max(1, height - labelHeight)
  return {
    frame: { x: 0, y: 0, width, height },
    media: {
      x: 1,
      y: 1,
      width: Math.max(1, width - 2),
      height: Math.max(1, labelTop - 1),
    },
    labelTop,
  }
}

export function moodBoardColorWithAlpha(color: string, alpha: number): string {
  const match = color.trim().match(/^#([0-9a-f]{6})$/i)
  if (!match) return `color-mix(in srgb, ${color} ${alpha * 100}%, transparent)`
  const hex = match[1]!
  return `rgba(${Number.parseInt(hex.slice(0, 2), 16)}, ${Number.parseInt(
    hex.slice(2, 4),
    16,
  )}, ${Number.parseInt(hex.slice(4, 6), 16)}, ${alpha})`
}
