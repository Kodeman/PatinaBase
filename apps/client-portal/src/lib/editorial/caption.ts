/* Plate captions: what · whose · when, three stored fields from the record.
   V23 R3: no "AI" or model wording reaches the page, and alt never says "image of". */

import type { CaptionFields, CaptionTriplet, EditorialAsset, EditorialItem, SourceKind } from './types';

export const CAPTION_SEPARATOR = ' · ';

const BANNED: readonly RegExp[] = [/\bAI\b/, /generated/i, /image of/i];

export const NOTE_LOAD_FAILED = 'Picture did not load.';
export const NOTE_NOT_YOUR_PIECE = 'Not your piece; yours is in production.';

export function hasBannedWords(text: string): boolean {
  return BANNED.some((re) => re.test(text));
}

/** A field never carries the separator, or the caption would read as four segments. */
function field(value: string | null | undefined): string | null {
  const text = (value ?? '').replace(/\s*·\s*/g, ', ').replace(/\s+/g, ' ').trim();
  return text && !hasBannedWords(text) ? text : null;
}

/**
 * Null when what or whose is missing, or any field carries refused wording. A
 * missing when only drops that segment: the reader withholds a when that names
 * a maker while makers are off (story seq 59).
 */
export function captionTriplet(fields: CaptionFields): CaptionTriplet | null {
  const what = field(fields.what);
  const whose = field(fields.whose);
  if (!what || !whose || hasBannedWords(fields.when ?? '')) return null;
  return { what, whose, when: field(fields.when) };
}

export function captionText(caption: CaptionTriplet): string {
  return [caption.what, caption.whose, caption.when].filter(Boolean).join(CAPTION_SEPARATOR);
}

const SOURCE_WORD: Readonly<Record<SourceKind, string>> = {
  installed: 'photograph',
  upload: 'photograph',
  scan: 'scan',
  board: 'board',
  sheet: 'drawing',
  maker: "maker's photograph",
  concept: 'concept render',
};

export function sourceWord(kind: SourceKind): string {
  return SOURCE_WORD[kind];
}

/**
 * The perceived description when the record has a clean one; otherwise what ·
 * whose · source word, built from the caption fields.
 */
export function plateAlt(asset: Pick<EditorialAsset, 'alt' | 'caption' | 'sourceKind'>): string {
  const perceived = field(asset.alt);
  if (perceived) return perceived.slice(0, 125);
  const parts = [field(asset.caption.what), field(asset.caption.whose), sourceWord(asset.sourceKind)];
  return parts.filter((p): p is string => Boolean(p)).join(CAPTION_SEPARATOR);
}

function catalogueKind(category: string | null, showMakers: boolean): string {
  const kind = category?.trim() ?? '';
  if (!showMakers || /^(?:uncategorized)?$/i.test(kind)) return 'This piece';
  const words = kind.replace(/[_-]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A retailer or catalogue photograph of the specified model, never of her piece. */
export function catalogueCaption(
  itemName: string | null, makerName: string | null | undefined, when: string | null,
  category: string | null = null, showMakers = true,
): CaptionTriplet | null {
  const maker = field(makerName);
  const name = (itemName ?? '').replace(/^[\s–—/]+|[\s–—/]+$/g, '');
  const what = /[\p{L}\p{N}]/u.test(name) ? name : catalogueKind(category, showMakers);
  return captionTriplet({
    what: `${what}, the same model`,
    whose: maker ? `from ${maker}${/s$/i.test(maker) ? "'" : "'s"} catalogue` : "from the maker's catalogue",
    when,
  });
}

export function silhouetteCaption(itemName: string): CaptionTriplet {
  return {
    what: field(itemName) ?? 'This piece',
    whose: 'drawn from the specification',
    when: null,
  };
}

/** The piece photo needs both a stored rendition and the caption Plate will draw. */
export function piecePhotoCaption(
  item: Pick<EditorialItem, 'nameAsSigned' | 'makerName' | 'category'>,
  asset: EditorialAsset, showMakers: boolean,
): CaptionTriplet | null {
  if (!asset.crops.piece?.widths.length) return null;
  if (asset.sourceKind !== 'maker' || asset.ground !== 'white') return captionTriplet(asset.caption);
  return catalogueCaption(
    showMakers ? item.nameAsSigned : asset.caption.what,
    item.makerName, asset.caption.when, item.category, showMakers,
  );
}
