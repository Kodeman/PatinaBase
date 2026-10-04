/**
 * Deck manifest: everything the browser learns from a .pptx before any pixel
 * work. Geometry is in EMU (914400 per inch) in slide space. JSON-safe, so the
 * register RPC can store it as jsonb; keys are snake_case like board item data.
 */

export const DECK_MANIFEST_VERSION = 1 as const;

export interface EmuBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** `a:srcRect` as fractions of the image (1 = 100%). Negative = padding. */
export interface SrcRect {
  l: number;
  t: number;
  r: number;
  b: number;
}

export type ElementKind =
  | "picture"
  | "picture_fill"
  | "table_cell"
  | "background";

export type ElementRole =
  | "product"
  | "reference"
  | "logo"
  | "decoration"
  | "background";

/** Where a paired link came from, strongest first. */
export type LinkSource =
  | "picture"
  | "overlay"
  | "group"
  | "table_row"
  | "legend"
  | "caption";

/** How the caption/link was tied to the picture. */
export type AssociationBasis =
  | "group"
  | "table_row"
  | "legend"
  | "caption_below"
  | "caption_above"
  | "caption_side";

export interface ElementLink {
  url: string;
  source: LinkSource;
  text?: string;
}

export interface Dimensions {
  width?: number;
  depth?: number;
  height?: number;
  unit: "in" | "cm";
  raw: string;
}

export interface ExtractedFields {
  name?: string;
  price_cents?: number;
  sku?: string;
  dims?: Dimensions;
  vendor?: string;
}

export interface ManifestElement {
  /** `<slidePart>#<shapeId>`; table cells `#<frameId>/r<row>c<col>`; background `#bg`. */
  element_key: string;
  slide_index: number;
  kind: ElementKind;
  /** Package part holding the pixels (`ppt/media/image3.png`), or null for remote pictures. */
  media: string | null;
  media_type: string | null;
  /** `r:link` http(s) target for pictures that are not embedded. */
  remote_url: string | null;
  /** Unrotated frame after group transforms; rotation is about its centre. */
  bbox: EmuBox;
  /** Degrees clockwise, [0, 360). */
  rot: number;
  flip_h: boolean;
  flip_v: boolean;
  /** Document order across the deck (later = on top). */
  z: number;
  /** Group shape ids, outermost first. */
  group_path: string[];
  src_rect: SrcRect | null;
  role: ElementRole;
  links: ElementLink[];
  caption: string | null;
  caption_keys: string[];
  association: AssociationBasis | null;
  /** Confidence margin of the caption pairing; 1 for explicit signals. */
  margin: number | null;
  alt: string | null;
  /** PowerPoint's "Description automatically generated" alt text: weak evidence. */
  alt_auto: boolean;
  legend_number: number | null;
  extracted: ExtractedFields;
}

export type UnpairedLinkSource = "text" | "notes" | "legend" | "overlay";

export interface UnpairedLink {
  url: string;
  text_context: string;
  source: UnpairedLinkSource;
}

export interface DeckLink extends UnpairedLink {
  slide_index: number;
}

export type TextRole =
  | "title"
  | "caption"
  | "legend"
  | "marker"
  | "attribution"
  | "text";

export interface ManifestText {
  text_key: string;
  text: string;
  bbox: EmuBox | null;
  role: TextRole;
  links: string[];
}

export interface ManifestSlide {
  index: number;
  part: string;
  title: string | null;
  /** Board section name: the title, else "Slide N". */
  section_name: string;
  hidden: boolean;
  notes_text: string | null;
  element_keys: string[];
  texts: ManifestText[];
  unpaired_links: UnpairedLink[];
  /** Smallest pairing margin on the slide (null when nothing was paired by geometry). */
  association_margin: number | null;
  /** True when a pairing was abstained: the Wave 3 resolver adjudicates it. */
  needs_adjudication: boolean;
}

export type SkipReason =
  | "unsupported_format"
  | "linked_image_unsupported"
  | "missing_media"
  | "video"
  | "audio"
  | "ole_object"
  | "link_denied"
  | "attribution_link";

export interface SkippedItem {
  slide_index: number | null;
  element_key: string | null;
  reason: SkipReason;
  detail?: string;
}

export interface ManifestStats {
  slides: number;
  elements: number;
  elements_with_link: number;
  elements_with_caption: number;
  media_parts: number;
  skipped: number;
  unpaired_links: number;
  deck_links: number;
  slides_needing_adjudication: number;
  zip_entries: number;
  declared_uncompressed_bytes: number;
}

export interface DeckManifest {
  version: typeof DECK_MANIFEST_VERSION;
  deck_sha256: string;
  deck_name: string;
  slide_size: { cx: number; cy: number };
  slides: ManifestSlide[];
  elements: ManifestElement[];
  /** Links on picture-less slides (shopping lists, notes) that were not paired. */
  deck_links: DeckLink[];
  skipped: SkippedItem[];
  stats: ManifestStats;
}

/** Media parts the crop stage needs, in first-use order. */
export function manifestMediaParts(
  manifest: Pick<DeckManifest, "elements">,
): string[] {
  const parts = new Set<string>();
  for (const element of manifest.elements)
    if (element.media) parts.add(element.media);
  return [...parts];
}
