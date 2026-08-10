/**
 * Canonical, persistence-agnostic contracts for Patina mood boards.
 *
 * Database adapters intentionally live outside this module. Supabase rows use
 * snake_case while these domain/render contracts follow the package's camelCase
 * convention. JSON snapshot data retains its persisted snake_case keys.
 */

export const MOOD_BOARD_GEOMETRY_VERSION = 1 as const

export type BoardOwnerKind = 'proposal' | 'project'

/** Exactly one owner leg for a live board. */
export interface BoardOwnerRef {
  kind: BoardOwnerKind
  id: string
}

export type MoodBoardItemType = 'product' | 'capture' | 'image' | 'palette' | 'note' | 'room_scan'

export interface MoodBoardSection {
  id: string
  name: string
  color?: string
}

export interface MoodBoardPaletteSwatch {
  hex: string
  role?: string | null
  name?: string | null
}

/**
 * Persisted item snapshot payload. The named keys mirror JSONB exactly; other
 * capture/product metadata remains permitted without weakening the known seam.
 */
export interface MoodBoardItemData extends Record<string, unknown> {
  section_id?: string | null
  resolved_height?: number | null
  image_url?: string | null
  thumbnail_url?: string | null
  working_image_path?: string | null
  working_thumbnail_path?: string | null
  review_media_asset_id?: string | null
  review_media_status?: 'preparing' | 'prepared' | 'error' | null
  original_image_url?: string | null
  source_url?: string | null
  name?: string | null
  vendor_name?: string | null
  price_cents?: number | null
  lead_time_weeks?: number | null
  room_type?: string | null
  swatches?: MoodBoardPaletteSwatch[]
}

/**
 * Render-safe item snapshot. `id` is optional because frozen project-board
 * snapshots created by activation historically contain no item ids.
 */
export interface MoodBoardItemSnapshot {
  id?: string
  type: MoodBoardItemType
  x: number
  y: number
  width: number
  height?: number | null
  zIndex?: number
  rotation?: number
  locked?: boolean
  productId?: string | null
  captureId?: string | null
  /** Project selection linked to this placement; null keeps a loose reference. */
  projectFfeItemId?: string | null
  paletteId?: string | null
  imageUrl?: string | null
  /** Optional renderer/cache identity; never required persistence truth. */
  imageKey?: string | null
  content?: string | null
  data?: MoodBoardItemData | null
}

/** Live editing requires the stable id absent from some frozen snapshots. */
export type EditableMoodBoardItem = MoodBoardItemSnapshot & { id: string }

export interface MoodBoardSnapshot {
  id?: string
  owner?: BoardOwnerRef
  name: string
  canvasWidth: number
  canvasHeight: number
  backgroundColor: string
  sections: MoodBoardSection[]
  items: MoodBoardItemSnapshot[]
  coverImageUrl?: string | null
  /** Optional renderer/cache identity; never required persistence truth. */
  coverImageKey?: string | null
}

export interface BoardPoint {
  x: number
  y: number
}

export interface BoardSize {
  width: number
  height: number
}

export interface BoardRect extends BoardPoint, BoardSize {}

export interface BoardCanvasSnapshot extends BoardSize {
  backgroundColor: string
}

/** Fully resolved, deterministic geometry consumed by every renderer. */
export interface BoardItemGeometrySnapshot {
  key: string
  id?: string
  sourceIndex: number
  type: MoodBoardItemType
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  rotation: number
  locked: boolean
  box: BoardRect
  center: BoardPoint
  aabb: BoardRect
  imageUrl?: string | null
  imageKey?: string | null
  content?: string | null
  data: MoodBoardItemData
}

export interface BoardSectionGeometrySnapshot extends MoodBoardSection {
  bounds: BoardRect
  memberKeys: string[]
}

/**
 * Versioned geometry is the common contract for DOM, canvas and PDF renderers.
 * Bump `version` only with a coordinated change to every consumer and fixture.
 */
export interface BoardGeometrySnapshot {
  version: typeof MOOD_BOARD_GEOMETRY_VERSION
  canvas: BoardCanvasSnapshot
  items: BoardItemGeometrySnapshot[]
  sections: BoardSectionGeometrySnapshot[]
  contentBounds: BoardRect
}

export type BoardCommandKind =
  | 'move'
  | 'resize'
  | 'rotate'
  | 'add'
  | 'delete'
  | 'duplicate'
  | 'paste'
  | 'lock'
  | 'z-order'
  | 'section-membership'
  | 'section-create'
  | 'section-update'
  | 'section-delete'
  | 'section-reorder'
  | 'tidy'
  | 'align'
  | 'distribute'
  | 'canvas-grow'
  | 'canvas-trim'
  | 'content'

export type BoardCommandLane = 'layout' | 'structural' | 'canvas'

export interface BoardCommandItemGeometrySnapshot {
  id: string
  x: number
  y: number
  width: number
  height: number | null
  zIndex: number
  rotation: number
}

export interface BoardCommandGeometrySnapshot {
  canvasWidth: number
  canvasHeight: number
  items: BoardCommandItemGeometrySnapshot[]
}

/** Serializable before/after payload used by a portal-side command runtime. */
export interface BoardCommandSnapshot {
  id: string
  kind: BoardCommandKind
  lane: BoardCommandLane
  touches: string[]
  before: BoardCommandGeometrySnapshot
  after: BoardCommandGeometrySnapshot
}

/** Runtime command shape. The design-system canvas deliberately never owns it. */
export interface BoardCommand<State = unknown> extends Omit<
  BoardCommandSnapshot,
  'before' | 'after'
> {
  before: BoardCommandGeometrySnapshot
  after: BoardCommandGeometrySnapshot
  apply(state: State): State
  invert(state: State): State
}
