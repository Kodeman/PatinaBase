/* The House Issue: the `get_client_project_editorial` envelope (00842), camelCase,
   as the server read hands it over, plus the Phase 2 edition record. */

export type SourceKind = 'upload' | 'installed' | 'scan' | 'board' | 'sheet' | 'maker' | 'concept';

/** Crop keys the plate route serves (`/plates/[scope]/[sha256]/[file]`). */
export type CropKey = 'wide' | 'cover_phone' | 'tall' | 'wide32' | 'pair' | 'piece';
/** `none` is an uncropped rendition (sheet, board). */
export type PlateCropKey = CropKey | 'none';

export type Ground = 'white' | 'scene' | 'drawing';

/** [x, y, w, h]: source pixels, or 0–1 of the source when every value is ≤ 1. */
export type Rect = readonly [number, number, number, number];
/** [x, y], 0–1 of the source. */
export type Point = readonly [number, number];

export interface PlateCrop {
  rect: Rect;
  widths: readonly number[];
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

export interface ClientProjectEditorial {
  project: EditorialProject;
  rooms: readonly EditorialRoom[];
  assets: readonly EditorialAsset[];
  palette: readonly PaletteSwatch[];
  boards: readonly EditorialBoard[];
  sheets: readonly EditorialSheet[];
}

/** Phase 2 (`get_client_project_edition`): the approved edition's own record. */
export interface EditionMeta {
  id: string;
  seq: number;
  approvedAt: string;
  approvedBy: 'studio' | 'auto';
  notice: string | null;
}

export interface ClientProjectEdition extends ClientProjectEditorial {
  edition?: EditionMeta;
}

/** What · whose · when: exactly three stored fields, never a fourth. */
export interface CaptionTriplet {
  what: string;
  whose: string;
  when: string;
}
