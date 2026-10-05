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
  | "caption"
  /** Speaker notes or bare slide text, joined to the slide's only product picture. */
  | "notes"
  | "text";

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

/**
 * The `board_deck_import_items.extracted` payload the Wave 3 resolver reads
 * (SQ-358 seam, US-15 log #5). Unpaired links stay on the manifest
 * (`slides[].unpaired_links`, `deck_links`), except inside `adjudication`.
 */
export interface DeckItemExtracted {
  links: Array<{ url: string; source: LinkSource; on_picture: boolean }>;
  caption: {
    name?: string;
    vendor?: string;
    sku?: string;
    price_cents?: number;
    dims?: Dimensions;
    text: string;
  } | null;
  alt_text: string | null;
  alt_auto: boolean;
  needs_adjudication: boolean;
  adjudication?: {
    images: Array<{ key: string; alt?: string }>;
    texts: Array<{ key: string; text: string }>;
    links: Array<{ id: string; url: string; text_context?: string }>;
  };
}

const PIN_ROLES: ElementRole[] = ["product", "reference"];
/** PowerPoint defaults alt text to the inserted file's name: not evidence. */
const FILENAME_ALT = /^[^\n/\\]+\.(png|jpe?g|gif|bmp|webp|tiff?|svg|heic)$/i;
const usefulAlt = (alt: string | null) =>
  alt && !FILENAME_ALT.test(alt.trim()) ? alt : null;

export function itemExtracted(
  manifest: Pick<DeckManifest, "slides" | "elements">,
  element: ManifestElement,
): DeckItemExtracted {
  const { name, vendor, sku, price_cents, dims } = element.extracted;
  const out: DeckItemExtracted = {
    links: element.links.map((l) => ({
      url: l.url,
      source: l.source,
      on_picture: l.source === "picture" || l.source === "overlay",
    })),
    caption:
      element.caption === null
        ? null
        : { name, vendor, sku, price_cents, dims, text: element.caption },
    alt_text: usefulAlt(element.alt),
    alt_auto: element.alt_auto,
    needs_adjudication: false,
  };
  const slide = manifest.slides[element.slide_index];
  // Only pictures the associator abstained on go to adjudication.
  if (
    !slide?.needs_adjudication ||
    element.caption !== null ||
    !PIN_ROLES.includes(element.role)
  ) {
    return out;
  }
  const onSlide = manifest.elements.filter(
    (e) => e.slide_index === slide.index,
  );
  const used = new Set(onSlide.flatMap((e) => e.caption_keys));
  out.needs_adjudication = true;
  out.adjudication = {
    images: onSlide
      .filter((e) => e.caption === null && PIN_ROLES.includes(e.role))
      .map((e) => {
        const alt = e.alt_auto ? null : usefulAlt(e.alt);
        return alt ? { key: e.element_key, alt } : { key: e.element_key };
      }),
    texts: slide.texts
      .filter(
        (t) =>
          (t.role === "caption" || t.role === "text") && !used.has(t.text_key),
      )
      .map((t) => ({ key: t.text_key, text: t.text })),
    links: slide.unpaired_links.map((l, i) => ({
      id: `link:${i}`,
      url: l.url,
      text_context: l.text_context,
    })),
  };
  return out;
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
