// board-deck-import-resolve · link-to-picture pairing by look, and the name
// overlap the resolver's unanchored-link pairing uses (PURE).
//
// A link no picture claimed resolves to a page with a photo. That photo and
// the unclaimed product crops are embedded with /embed/image; this module
// assigns links to crops one-to-one (Hungarian, maximizing cosine) and keeps
// an assignment only when it is clear: similarity ≥ τ_pair and a margin of
// τ_pair_margin over the next-best alternative for BOTH the link and the
// crop. Anything ambiguous stays unassigned ("which picture?").

import { THRESHOLDS } from './thresholds.ts';

export interface PairAssignment {
  link: number;
  crop: number;
  similarity: number;
  margin: number;
}

export function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

/** A link page's product name names a picture when at least this share of
 *  the shorter name's words appear in the other (case-insensitive). */
export const PAIR_NAME_MIN_OVERLAP = 0.6;

function nameTokens(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1));
}

/** Shared words over the shorter name's word count, 0..1. */
export function nameOverlap(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  const shorter = Math.min(ta.size, tb.size);
  if (shorter === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / shorter;
}

/** Minimum-cost assignment on a square matrix (Kuhn–Munkres, O(n³)).
 *  Returns, for each row, its assigned column. */
function hungarianSquare(cost: number[][]): number[] {
  const n = cost.length;
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0);
  const way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const rowToCol = new Array(n).fill(-1);
  for (let j = 1; j <= n; j++) if (p[j] > 0) rowToCol[p[j] - 1] = j - 1;
  return rowToCol;
}

/** sim[link][crop] → the confident one-to-one pairs. */
export function pairByLook(
  sim: number[][],
  tau: number = THRESHOLDS.pair.tau,
  margin: number = THRESHOLDS.pair.margin,
): PairAssignment[] {
  const links = sim.length;
  const crops = links ? sim[0].length : 0;
  if (links === 0 || crops === 0) return [];
  const n = Math.max(links, crops);
  // Pad to square; padding costs nothing so it never displaces a real pair.
  const cost = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i < links && j < crops ? 1 - sim[i][j] : 1)));
  const assigned = hungarianSquare(cost);
  const out: PairAssignment[] = [];
  for (let i = 0; i < links; i++) {
    const j = assigned[i];
    if (j < 0 || j >= crops) continue;
    const s = sim[i][j];
    let rowNext = -Infinity;
    for (let k = 0; k < crops; k++) if (k !== j) rowNext = Math.max(rowNext, sim[i][k]);
    let colNext = -Infinity;
    for (let k = 0; k < links; k++) if (k !== i) colNext = Math.max(colNext, sim[k][j]);
    const next = Math.max(rowNext, colNext);
    const m = next === -Infinity ? 1 : s - next;
    if (s >= tau && m >= margin) out.push({ link: i, crop: j, similarity: s, margin: m });
  }
  return out;
}
