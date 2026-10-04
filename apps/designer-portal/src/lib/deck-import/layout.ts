/**
 * Manifest → board geometry: one section per slide that contributes pictures,
 * slides stacked top to bottom in reading order, each scaled to `boardWidth`
 * board units. Item x/y is the top-left of the unrotated frame and rotation is
 * about its centre, the same convention OOXML uses, so rotation maps directly.
 * Flips are baked into the crop pixels (crop.ts), not the item.
 */
import type {
  EditableMoodBoardItem,
  MoodBoardItemData,
  MoodBoardSection,
} from "@patina/types";
import type { DeckManifest, ElementRole, ManifestElement } from "./manifest";

export const DECK_BOARD_WIDTH = 1200;
export const DECK_SLIDE_GUTTER = 96;

export interface DeckLayoutOptions {
  boardWidth?: number;
  gutter?: number;
  origin?: { x: number; y: number };
  /** Roles that become pins. Backgrounds, logos and ornaments stay in the manifest only. */
  roles?: ElementRole[];
  /** zIndex of the first item; later document order stacks on top. */
  zStart?: number;
  newId?: () => string;
}

export interface DeckLayout {
  sections: MoodBoardSection[];
  items: EditableMoodBoardItem[];
  /** element_key → item id, for attaching uploaded crops. */
  itemIds: Map<string, string>;
  /** Total height used, for placing the next thing below. */
  height: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

function itemData(
  manifest: DeckManifest,
  element: ManifestElement,
  sectionId: string,
): MoodBoardItemData {
  const slide = manifest.slides[element.slide_index];
  const data: MoodBoardItemData = {
    section_id: sectionId,
    source_url: element.links[0]?.url ?? null,
    image_provenance: "imported_deck",
    deck_import: {
      deck_sha256: manifest.deck_sha256,
      deck_name: manifest.deck_name,
      slide_index: element.slide_index,
      slide_title: slide?.title ?? null,
      element_ref: element.element_key,
      role: element.role,
      links: element.links.map((l) => ({ url: l.url, origin: l.source })),
      caption_text: element.caption,
      alt_text: element.alt,
      alt_auto: element.alt_auto,
      src_rect: element.src_rect,
      ...(element.remote_url ? { remote_url: element.remote_url } : {}),
    },
  };
  if (element.extracted.name) data.name = element.extracted.name;
  if (element.extracted.price_cents != null)
    data.price_cents = element.extracted.price_cents;
  if (element.extracted.vendor) data.vendor_name = element.extracted.vendor;
  return data;
}

export function layoutDeck(
  manifest: DeckManifest,
  options: DeckLayoutOptions = {},
): DeckLayout {
  const boardWidth = options.boardWidth ?? DECK_BOARD_WIDTH;
  const gutter = options.gutter ?? DECK_SLIDE_GUTTER;
  const origin = options.origin ?? { x: 0, y: 0 };
  const roles = new Set(options.roles ?? ["product", "reference"]);
  const newId = options.newId ?? (() => crypto.randomUUID());
  const scale = boardWidth / (manifest.slide_size.cx || 1);
  const slideHeight = manifest.slide_size.cy * scale;

  const sections: MoodBoardSection[] = [];
  const items: EditableMoodBoardItem[] = [];
  const itemIds = new Map<string, string>();
  let top = origin.y;
  let z = options.zStart ?? 0;

  for (const slide of manifest.slides) {
    const elements = manifest.elements
      .filter((e) => e.slide_index === slide.index && roles.has(e.role))
      .sort((a, b) => a.z - b.z);
    if (elements.length === 0) continue;
    const section: MoodBoardSection = { id: newId(), name: slide.section_name };
    sections.push(section);
    for (const element of elements) {
      const id = newId();
      itemIds.set(element.element_key, id);
      items.push({
        id,
        type: "image",
        x: round2(origin.x + element.bbox.x * scale),
        y: round2(top + element.bbox.y * scale),
        width: round2(element.bbox.w * scale),
        height: round2(element.bbox.h * scale),
        rotation: element.rot,
        zIndex: z++,
        imageUrl: null,
        data: itemData(manifest, element, section.id),
      });
    }
    top += slideHeight + gutter;
  }
  return {
    sections,
    items,
    itemIds,
    height: Math.max(0, top - origin.y - gutter),
  };
}
