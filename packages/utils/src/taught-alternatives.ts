/**
 * Designer-Taught alternatives — the small, LLM-free helpers that turn a
 * client's rejection note into a lightly-filtered shortlist.
 *
 * The corpus-first ORDER is the SQL RPC's job: find_taught_alternatives boosts
 * the designer's own personal, then studio, layers ahead of the shared catalog.
 * These functions only (1) pull attribute words out of the client's comment
 * against a curated furnishing vocabulary, and (2) float the candidates that
 * match those words to the top WITHOUT dropping the rest or unwinding the
 * corpus order. No taste model, no network — deliberately naive keyword spotting.
 *
 * Pure + dependency-free.
 */

// A small curated vocabulary — colors, materials, and furnishing forms. Single
// lowercase tokens; multi-word forms reduce to their salient word (a "coffee
// table" is caught by "table"). Finite on purpose: this is keyword spotting, not
// language understanding, so it cannot read negation ("not black") — it only
// nudges matching pieces up, never removes anything.
export const ATTRIBUTE_VOCABULARY: ReadonlySet<string> = new Set([
  // colors
  'black', 'white', 'cream', 'ivory', 'beige', 'taupe', 'tan', 'brown', 'camel', 'grey',
  'gray', 'charcoal', 'slate', 'navy', 'blue', 'teal', 'green', 'olive', 'sage', 'emerald',
  'red', 'crimson', 'burgundy', 'rust', 'terracotta', 'orange', 'amber', 'yellow', 'mustard',
  'gold', 'pink', 'blush', 'rose', 'mauve', 'purple', 'lavender', 'natural',
  // materials
  'oak', 'walnut', 'teak', 'ash', 'maple', 'mahogany', 'pine', 'rattan', 'cane', 'wicker',
  'bamboo', 'leather', 'linen', 'cotton', 'wool', 'velvet', 'boucle', 'chenille', 'silk',
  'jute', 'sisal', 'marble', 'travertine', 'granite', 'stone', 'concrete', 'glass', 'brass',
  'bronze', 'copper', 'steel', 'iron', 'chrome', 'nickel', 'ceramic', 'terrazzo', 'wood',
  'metal', 'fabric',
  // forms / categories
  'sofa', 'sectional', 'loveseat', 'chair', 'armchair', 'stool', 'bench', 'ottoman', 'table',
  'console', 'desk', 'dresser', 'credenza', 'cabinet', 'sideboard', 'shelf', 'bookcase', 'bed',
  'headboard', 'nightstand', 'mirror', 'lamp', 'sconce', 'pendant', 'chandelier', 'rug', 'art',
  'artwork', 'planter', 'vase', 'curtain', 'drape',
]);

/** Attribute words present in a client's comment, in order of first appearance. */
export function extractAttributeKeywords(comment: string | null | undefined): string[] {
  if (!comment) return [];
  const found = new Set<string>();
  for (const token of comment.toLowerCase().split(/[^a-z0-9]+/)) {
    if (token && ATTRIBUTE_VOCABULARY.has(token)) found.add(token);
  }
  return [...found];
}

export interface KeywordSurface {
  name?: string | null;
  category?: string | null;
  style_tags?: string[] | null;
  materials?: string[] | null;
}

/** The lowercased token set a keyword can match against, for one candidate. */
function surfaceTokens(c: KeywordSurface): Set<string> {
  const parts = [c.name ?? '', c.category ?? '', ...(c.style_tags ?? []), ...(c.materials ?? [])];
  return new Set(parts.join(' ').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

/**
 * Float keyword-matching candidates to the top, preserving the incoming
 * (corpus-first) order within the matched and unmatched groups. A stable, light
 * filter — nothing is removed. With no keywords, returns the list unchanged.
 */
export function rankTaughtAlternatives<T extends KeywordSurface>(
  candidates: readonly T[],
  keywords: readonly string[],
): T[] {
  if (keywords.length === 0) return candidates.slice();
  const matched: T[] = [];
  const rest: T[] = [];
  for (const c of candidates) {
    const tokens = surfaceTokens(c);
    (keywords.some((k) => tokens.has(k)) ? matched : rest).push(c);
  }
  return [...matched, ...rest];
}
