/* Plate captions: what · whose · when, three stored fields from the record.
   V23 R3: no "AI" or model wording reaches the page, and alt never says "image of". */

import type { CaptionFields, CaptionTriplet, EditorialAsset, SourceKind } from './types';

export const CAPTION_SEPARATOR = ' · ';

const BANNED: readonly RegExp[] = [/\bAI\b/, /generated/i, /image of/i];

export const NOTE_LOAD_FAILED = 'Picture did not load.';
export const NOTE_NOT_HER_PIECE = 'Not her piece; hers is in production.';

export function hasBannedWords(text: string): boolean {
  return BANNED.some((re) => re.test(text));
}

/** A field never carries the separator, or the caption would read as four segments. */
function field(value: string | null | undefined): string | null {
  const text = (value ?? '').replace(/\s*·\s*/g, ', ').replace(/\s+/g, ' ').trim();
  return text && !hasBannedWords(text) ? text : null;
}

/** Null when any field is missing or carries refused wording. */
export function captionTriplet(fields: CaptionFields): CaptionTriplet | null {
  const what = field(fields.what);
  const whose = field(fields.whose);
  const when = field(fields.when);
  return what && whose && when ? { what, whose, when } : null;
}

export function captionText(caption: CaptionTriplet): string {
  return [caption.what, caption.whose, caption.when].join(CAPTION_SEPARATOR);
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

/** A retailer or catalogue photograph of the specified model, never of her piece. */
export function catalogueCaption(itemName: string, makerName: string | null | undefined, when: string | null): CaptionTriplet | null {
  const maker = field(makerName);
  return captionTriplet({
    what: `${itemName}, the same model`,
    whose: maker ? `from ${maker}${/s$/i.test(maker) ? "'" : "'s"} catalogue` : "from the maker's catalogue",
    when,
  });
}

export function silhouetteCaption(itemName: string): CaptionTriplet {
  return {
    what: field(itemName) ?? 'This piece',
    whose: 'drawn from the specification',
    when: 'photograph to follow',
  };
}
