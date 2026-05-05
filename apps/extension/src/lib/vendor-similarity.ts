/**
 * Fuzzy vendor name matching for duplicate detection at save time.
 *
 * Uses a Sørensen-Dice coefficient over character bigrams — fast, no deps,
 * works well for short brand names where Levenshtein over-penalizes shared
 * substrings ("Herman Miller" vs "Herman Miller Inc.").
 *
 * Threshold tuning notes:
 *   - 0.85+ → near-identical (whitespace/punctuation differences)
 *   - 0.70  → likely the same brand, plausible suffix difference
 *   - <0.60 → unrelated
 *
 * Spec §3.2 calls for "fuzzy match > 0.8" → we surface candidates at 0.7
 * so the user can confirm; the prompt is informational, not blocking.
 */

const NORMALIZE_RE = /[^a-z0-9]+/g;

function normalize(name: string): string {
  return name.toLowerCase().replace(NORMALIZE_RE, '');
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) {
    out.add(s.slice(i, i + 2));
  }
  return out;
}

export function diceCoefficient(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;

  const ba = bigrams(na);
  const bb = bigrams(nb);
  let intersection = 0;
  for (const g of ba) {
    if (bb.has(g)) intersection++;
  }
  return (2 * intersection) / (ba.size + bb.size);
}

export interface VendorLike {
  id: string;
  name: string;
}

export interface SimilarVendorMatch<V extends VendorLike> {
  vendor: V;
  score: number;
}

export function findSimilarVendors<V extends VendorLike>(
  query: string,
  candidates: readonly V[],
  threshold = 0.7,
): SimilarVendorMatch<V>[] {
  if (!query || candidates.length === 0) return [];
  return candidates
    .map((v) => ({ vendor: v, score: diceCoefficient(query, v.name) }))
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score);
}
