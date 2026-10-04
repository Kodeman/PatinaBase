/**
 * Slide order comes from `p:sldIdLst` through the presentation rels, never from
 * `slideN.xml` file names (reordering a deck does not rename its parts).
 */
import {
  NS,
  child,
  childrenOf,
  numAttr,
  parseXml,
  readRels,
  relId,
  type PackageFiles,
} from "./xml";
import { DeckImportError } from "./read-package";

/** PowerPoint's default 10in x 7.5in, used only when `p:sldSz` is absent. */
const DEFAULT_SIZE = { cx: 9144000, cy: 6858000 };

export interface SlideRef {
  index: number;
  part: string;
}

export interface SlideOrder {
  slide_size: { cx: number; cy: number };
  slides: SlideRef[];
}

export function readSlideOrder(
  files: PackageFiles,
  mainPart: string,
): SlideOrder {
  const bytes = files.get(mainPart);
  if (!bytes)
    throw new DeckImportError("not_a_presentation", `${mainPart} is missing`);
  const root = parseXml(bytes, mainPart).documentElement;
  const size = child(root, NS.p, "sldSz");
  const rels = readRels(files, mainPart);
  const slides: SlideRef[] = [];
  const seen = new Set<string>();
  for (const sldId of childrenOf(
    child(root, NS.p, "sldIdLst"),
    NS.p,
    "sldId",
  )) {
    const id = relId(sldId, "id");
    const part = id ? rels.get(id)?.part : null;
    // A dangling or repeated entry is skipped rather than failing the deck.
    if (!part || seen.has(part) || !files.has(part)) continue;
    seen.add(part);
    slides.push({ index: slides.length, part });
  }
  return {
    slide_size: size
      ? {
          cx: numAttr(size, "cx", DEFAULT_SIZE.cx),
          cy: numAttr(size, "cy", DEFAULT_SIZE.cy),
        }
      : DEFAULT_SIZE,
    slides,
  };
}
