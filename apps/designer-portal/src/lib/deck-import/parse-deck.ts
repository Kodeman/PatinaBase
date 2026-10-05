/**
 * Package → DeckManifest. Pass 1 inflates only the XML the manifest needs;
 * the caller inflates `manifestMediaParts(manifest)` in pass 2 for the crops.
 */
import { associateDeck } from "./associate";
import { classifyRole } from "./classify-role";
import { extractFields } from "./fields";
import {
  DECK_MANIFEST_VERSION,
  type DeckLink,
  type DeckManifest,
  type ManifestElement,
  type ManifestSlide,
  type SkippedItem,
  type UnpairedLink,
} from "./manifest";
import { openPackage, pass1Names, type PackageReader } from "./read-package";
import { readSlideOrder } from "./slide-order";
import { paragraphsText, walkSlide, type DeckWalkContext } from "./walk-slide";
import type { PackageFiles } from "./xml";

const AUTO_ALT =
  /description automatically generated|generated with (?:very high|high|medium|low) confidence/i;

/** Links that sit on no picture: the speaker notes and bare slide text. */
const UNANCHORED: ReadonlySet<UnpairedLink["source"]> = new Set(["notes", "text"]);

/**
 * A slide with exactly one product picture: its notes and bare-text links
 * describe that picture, so they join it rather than standing as pieces of
 * their own. A slide with no product picture and exactly one reference
 * picture makes that picture the product: decks often carry the product link
 * only in the notes or slide text. Returns the slide's links still unpaired.
 */
export function joinSoleProduct(
  onSlide: ManifestElement[],
  unpaired: UnpairedLink[],
): UnpairedLink[] {
  const joining = unpaired.filter((l) => UNANCHORED.has(l.source));
  if (joining.length === 0) return unpaired;
  const products = onSlide.filter((e) => e.role === "product");
  const references = onSlide.filter((e) => e.role === "reference");
  const sole =
    products.length === 1
      ? products[0]
      : products.length === 0 && references.length === 1
        ? references[0]
        : null;
  if (!sole) return unpaired;
  sole.role = "product";
  const links = [...sole.links];
  for (const l of joining)
    if (!links.some((x) => x.url === l.url))
      links.push({ url: l.url, source: l.source as "notes" | "text" });
  sole.links = links;
  sole.extracted = extractFields(sole.caption, links.map((l) => l.url));
  return unpaired.filter((l) => !UNANCHORED.has(l.source));
}

export interface ManifestSource {
  entries: PackageReader["entries"];
  entryNames: Set<string>;
  mainPart: string;
  deck_sha256: string;
  deck_name: string;
}

export function buildManifest(
  files: PackageFiles,
  source: ManifestSource,
): DeckManifest {
  const order = readSlideOrder(files, source.mainPart);
  const ctx: DeckWalkContext = {
    files,
    entryNames: source.entryNames,
    slideSize: order.slide_size,
    z: { next: 0 },
  };
  const raw = order.slides.map((s) => walkSlide(ctx, s.index, s.part));
  const associations = associateDeck(raw);
  const slideArea = order.slide_size.cx * order.slide_size.cy || 1;

  const elements: ManifestElement[] = [];
  const slides: ManifestSlide[] = [];
  const deckLinks: DeckLink[] = [];
  const skipped: SkippedItem[] = [];

  raw.forEach((slide, i) => {
    const assoc = associations[i];
    const keys: string[] = [];
    const onSlide: ManifestElement[] = [];
    for (const pic of slide.pictures) {
      const pairing = assoc.pictures.get(pic.key)!;
      const extracted = extractFields(
        pairing.caption,
        pairing.links.map((l) => l.url),
      );
      const role = classifyRole({
        kind: pic.kind,
        areaFraction: (pic.bbox.w * pic.bbox.h) / slideArea,
        hasLink: pairing.links.length > 0,
        extracted,
        hasCaption: pairing.caption != null,
      });
      keys.push(pic.key);
      onSlide.push({
        element_key: pic.key,
        slide_index: slide.index,
        kind: pic.kind,
        media: pic.media,
        media_type: pic.media_type,
        remote_url: pic.remote_url,
        bbox: pic.bbox,
        rot: pic.rot,
        flip_h: pic.flip_h,
        flip_v: pic.flip_v,
        z: pic.z,
        group_path: pic.group_path,
        src_rect: pic.src_rect,
        role,
        links: pairing.links,
        caption: pairing.caption,
        caption_keys: pairing.caption_keys,
        association: pairing.basis,
        margin: pairing.margin,
        alt: pic.alt,
        alt_auto: pic.alt != null && AUTO_ALT.test(pic.alt),
        legend_number: pairing.legend_number,
        extracted,
      });
    }
    const unpaired = joinSoleProduct(onSlide, assoc.unpaired);
    elements.push(...onSlide);
    const hasPictures = slide.pictures.some((p) => p.kind !== "background");
    if (!hasPictures)
      for (const link of unpaired)
        deckLinks.push({ ...link, slide_index: slide.index });
    skipped.push(...slide.skipped, ...assoc.denied);
    const notes = paragraphsText(slide.notes);
    slides.push({
      index: slide.index,
      part: slide.part,
      title: slide.title,
      section_name: slide.title ?? `Slide ${slide.index + 1}`,
      hidden: slide.hidden,
      notes_text: notes || null,
      element_keys: keys,
      texts: slide.texts.map((t) => ({
        text_key: t.key,
        text: t.text,
        bbox: t.bbox,
        role: assoc.textRoles.get(t.key) ?? "text",
        links: assoc.textLinks.get(t.key) ?? [],
      })),
      unpaired_links: hasPictures ? unpaired : [],
      association_margin: assoc.margin,
      needs_adjudication: assoc.needs_adjudication,
    });
  });

  return {
    version: DECK_MANIFEST_VERSION,
    deck_sha256: source.deck_sha256,
    deck_name: source.deck_name,
    slide_size: order.slide_size,
    slides,
    elements,
    deck_links: deckLinks,
    skipped,
    stats: {
      slides: slides.length,
      elements: elements.length,
      elements_with_link: elements.filter((e) => e.links.length > 0).length,
      elements_with_caption: elements.filter((e) => e.caption != null).length,
      media_parts: new Set(elements.map((e) => e.media).filter(Boolean)).size,
      skipped: skipped.length,
      unpaired_links: slides.reduce((n, s) => n + s.unpaired_links.length, 0),
      deck_links: deckLinks.length,
      slides_needing_adjudication: slides.filter((s) => s.needs_adjudication)
        .length,
      zip_entries: source.entries.length,
      declared_uncompressed_bytes: source.entries.reduce(
        (n, e) => n + e.uncompressedSize,
        0,
      ),
    },
  };
}

/** Pass 1 through any package reader (inline or the Web Worker client). */
export async function readManifest(
  reader: PackageReader,
  deckName: string,
): Promise<DeckManifest> {
  const files = await reader.read(pass1Names(reader));
  return buildManifest(files, { ...reader, deck_name: deckName });
}

/** Inline path (tests, and the fallback when Workers are unavailable). */
export async function parseDeck(
  name: string,
  bytes: Uint8Array,
): Promise<{ manifest: DeckManifest; reader: PackageReader }> {
  const reader = await openPackage(name, bytes);
  return { manifest: await readManifest(reader, name), reader };
}
