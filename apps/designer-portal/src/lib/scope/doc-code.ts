/**
 * Doc codes (Track S · S1) — the short catalog reference that gives a scheduled
 * line a spine (CH-01, TB-03…). Programa-style schedule mechanics in the
 * Document's grammar: mono, small, always editable free text.
 *
 * Pure + dependency-free (jest/vitest-friendly). The suggester derives a prefix
 * from the line's ffe_category and appends the next per-prefix sequence within
 * the document — it NEVER overwrites a code the designer typed.
 */

/**
 * Curated category → prefix map. Keyed by the canonical ffe_categories slugs
 * (00128 taxonomy) so the suggestion actually fires against real data, with the
 * interior-design terms from the S1 brief aliased where they diverge from the
 * system slug (casegoods≈storage, textiles≈soft_goods, plumbing≈plumbing_fixtures).
 */
export const DOC_CODE_PREFIX_MAP: Record<string, string> = {
  seating: 'CH',
  tables: 'TB',
  lighting: 'LT',
  rugs: 'RG',
  storage: 'CS', // "casegoods"
  casegoods: 'CS',
  soft_goods: 'TX', // "textiles"
  textiles: 'TX',
  art: 'AR',
  accessories: 'AC',
  plumbing_fixtures: 'PL', // "plumbing"
  plumbing: 'PL',
  appliances: 'AP',
};

/**
 * Fallback prefix: the first two consonants of the text, uppercased. Falls back
 * to the first two letters if there aren't two consonants, then to 'XX'.
 */
export function consonantPrefix(text: string | null | undefined): string {
  const upper = (text ?? '').toUpperCase();
  const consonants = upper.replace(/[^A-Z]/g, '').replace(/[AEIOU]/g, '');
  if (consonants.length >= 2) return consonants.slice(0, 2);
  const alpha = upper.replace(/[^A-Z]/g, '');
  const combined = (consonants + alpha).slice(0, 2);
  return combined.length === 2 ? combined : 'XX';
}

/**
 * The two-letter prefix for a category. Curated map first, then a consonant
 * fallback over the category slug (or `fallbackText`, e.g. the item name, when
 * no category is set).
 */
export function suggestDocCodePrefix(
  category?: string | null,
  fallbackText?: string | null
): string {
  const key = (category ?? '').trim().toLowerCase();
  if (key && DOC_CODE_PREFIX_MAP[key]) return DOC_CODE_PREFIX_MAP[key];
  const basis = key || (fallbackText ?? '').trim().toLowerCase();
  return consonantPrefix(basis);
}

/**
 * The next code for a new line: `${prefix}-${NN}`, where NN is one past the
 * highest existing sequence for that prefix within the document. Two-digit
 * zero-padded (CH-01…CH-09, then CH-10). Matching is case-insensitive.
 */
export function suggestDocCode(
  category: string | null | undefined,
  existingCodes: Array<string | null | undefined>,
  fallbackText?: string | null
): string {
  const prefix = suggestDocCodePrefix(category, fallbackText);
  const re = new RegExp(`^${prefix}-(\\d+)$`, 'i');
  let max = 0;
  for (const raw of existingCodes) {
    const m = (raw ?? '').trim().match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  const next = max + 1;
  return `${prefix}-${String(next).padStart(2, '0')}`;
}

/**
 * The code to persist for a line: the designer's own code wins (never
 * overwritten); only an empty code gets an auto-suggestion.
 */
export function resolveDocCode(
  current: string | null | undefined,
  category: string | null | undefined,
  existingCodes: Array<string | null | undefined>,
  fallbackText?: string | null
): string {
  const typed = (current ?? '').trim();
  if (typed) return typed;
  return suggestDocCode(category, existingCodes, fallbackText);
}
