/**
 * Client-side product similarity for duplicate detection (D1). Reuses the
 * dependency-free Sørensen–Dice name coefficient from vendor-similarity and
 * layers vendor-match + price-proximity bonuses. RLS-scoped candidates are
 * fetched and ranked here; the merge itself reconciles against the one match
 * (updateExisting), so no server-side merge RPC is needed for capture.
 */
import { diceCoefficient } from './vendor-similarity';

export interface ProductCandidate {
  id: string;
  name: string;
  priceRetail: number | null;
  vendorId: string | null;
}

export interface ProductQuery {
  name: string;
  priceCents: number | null;
  vendorId: string | null;
}

export interface ProductMatch {
  candidate: ProductCandidate;
  score: number;
}

/** 0..1 confidence that the candidate is the same product as the query. */
export function scoreProductMatch(
  candidate: ProductCandidate,
  query: ProductQuery
): number {
  let score = diceCoefficient(candidate.name, query.name) * 0.7;

  if (query.vendorId && candidate.vendorId && query.vendorId === candidate.vendorId) {
    score += 0.2;
  }

  if (query.priceCents != null && candidate.priceRetail != null && query.priceCents > 0) {
    const diff = Math.abs(candidate.priceRetail - query.priceCents) / query.priceCents;
    if (diff <= 0.05) score += 0.1;
    else if (diff <= 0.15) score += 0.05;
  }

  return Math.min(1, score);
}

export function bestProductMatch(
  candidates: ProductCandidate[],
  query: ProductQuery
): ProductMatch | null {
  let best: ProductMatch | null = null;
  for (const candidate of candidates) {
    const score = scoreProductMatch(candidate, query);
    if (!best || score > best.score) best = { candidate, score };
  }
  return best;
}
