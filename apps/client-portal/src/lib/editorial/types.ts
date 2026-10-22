/* The House Issue: the `get_client_project_editorial` envelope (00842), camelCase,
   as the server read hands it over, plus the Phase 2 edition record. */

export type SourceKind = 'upload' | 'installed' | 'scan' | 'board' | 'sheet' | 'maker' | 'concept';

/** Crop keys the plate route serves (`/plates/[scope]/[sha256]/[file]`). */
export type CropKey = 'wide' | 'cover_phone' | 'tall' | 'wide32' | 'pair' | 'piece';
/** `sheet` and `board` are the uncropped renditions the route also serves. */
export type PlateCropKey = CropKey | 'sheet' | 'board';

export type Ground = 'white' | 'scene' | 'drawing';

/** [x, y, w, h]: source pixels, or 0–1 of the source when every value is ≤ 1. */
export type Rect = readonly [number, number, number, number];
/** [x, y], 0–1 of the source. */
export type Point = readonly [number, number];

export interface PlateCrop {
  rect: Rect;
  widths: readonly number[];
  /** The framing revision (32 hex) whose prefix holds these renditions; absent for the unversioned (legacy) prefix. */
  rev?: string;
}

export interface CaptionFields {
  what: string | null;
  whose: string | null;
  when: string | null;
}

export interface EditorialAsset {
  id: string;
  sha256: string;
  sourceKind: SourceKind;
  width: number;
  height: number;
  ground: Ground | null;
  dominantHex: string | null;
  lqip: string | null;
  focal: Point | null;
  subjectBox: Rect | null;
  crops: Partial<Record<PlateCropKey, PlateCrop>>;
  caption: CaptionFields;
  alt: string | null;
}

export interface EditorialItem {
  id: string;
  nameAsSigned: string;
  category: string | null;
  status: string | null;
  /** Present only when the project's `showMakers` is on. */
  makerName?: string | null;
  madeIn?: string | null;
  material: string | null;
  finish: string | null;
  dimensions: string | null;
  descriptionAsSigned: string | null;
  assetIds: readonly string[];
  silhouetteKind: string | null;
}

export interface EditorialRoom {
  id: string;
  name: string;
  anchor: string;
  conceptAssetId: string | null;
  scanAssetIds: readonly string[];
  items: readonly EditorialItem[];
}

export interface EditorialProject {
  id: string;
  name: string;
  phase: string;
  targetDate: string | null;
  showMakers: boolean;
  studio: { name: string; town: string | null };
}

export interface PaletteSwatch {
  hex: string;
  brand: string | null;
  name: string | null;
}

export interface EditorialBoard {
  id: string;
  name: string;
  assetId: string | null;
}

export interface EditorialSheet {
  id: string;
  title: string;
  assetId: string | null;
}

/** Phase 2 (`get_client_project_edition`): the approved edition's own record. */
export interface EditionMeta {
  id: string;
  seq: number;
  approvedAt: string;
  approvedBy: 'studio' | 'auto';
  notice: string | null;
}

/** A composed chapter's words; key is cover | house | progress | a room's anchor. */
export interface EditionChapterWords {
  key: string;
  headline: string | null;
  standing: string | null;
}

/** The parts of the edition's composition the page draws (overrides merged by 00846). */
export interface EditionComposition {
  hero: { assetId: string } | null;
  /** The held pictures the edition approved; empty when it approved none. */
  held: readonly string[];
  chapters: readonly EditionChapterWords[];
}

/** Where the edition placed a picture (`client_edition_images`). */
export interface EditionImage {
  assetId: string;
  plateRole: string;
  rank: number | null;
  /** cover | house | a room's anchor. */
  chapterKey: string | null;
}

/**
 * The 00842 envelope. Read through `get_client_project_edition` (00846) it also
 * carries the approved edition and its composition; read through
 * `get_client_project_editorial` it carries neither.
 */
export interface ClientProjectEditorial {
  project: EditorialProject;
  rooms: readonly EditorialRoom[];
  assets: readonly EditorialAsset[];
  palette: readonly PaletteSwatch[];
  boards: readonly EditorialBoard[];
  sheets: readonly EditorialSheet[];
  edition?: EditionMeta;
  composition?: EditionComposition;
  images?: readonly EditionImage[];
}

/**
 * LOCAL TYPE OVERLAY (SQ-1591): the two homeowner readers as the page calls
 * them. Remove once SQ-1642 lands `get_client_project_edition` in the
 * regenerated packages/supabase/src/database.types.ts.
 */
export interface EditionReaderFunctions {
  get_client_project_edition: { Args: { p_project_id: string }; Returns: unknown };
  get_client_project_editorial: { Args: { p_project_id: string }; Returns: unknown };
}

/**
 * What · whose · when: at most three stored fields, never a fourth. `when` is
 * null when the record withholds it (makers off, story seq 59).
 */
export interface CaptionTriplet {
  what: string;
  whose: string;
  when: string | null;
}
