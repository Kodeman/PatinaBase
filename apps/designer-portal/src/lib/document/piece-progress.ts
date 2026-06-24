/**
 * The Piece Room's completeness (R40 grammar, applied to an existing row).
 *
 * Mirrors compose-progress.ts, but reads a real `products` row rather than a
 * draft-in-hand. The three movements map to the three Strata lines, and the
 * state reads Capture → Draft → Catalog-ready off the same fill the mark shows:
 *   · line 1 — the record  (identity + the piece)
 *   · line 2 — the catalog (commerce + the folio)
 *   · line 3 — the eye     (the teaching)
 *
 * Pure + dependency-free. The Piece Room shows how complete the *record* is —
 * never a stepper, never a stored progress column.
 */

export interface PieceRow {
  name?: string | null;
  brand?: string | null;
  dimensions?: unknown;
  materials?: string[] | null;
  price_retail?: number | null;
  price_trade?: number | null;
  images?: string[] | null;
}

export interface PieceSections {
  /** name + maker on file */
  identity: boolean;
  /** dimensions + materials written */
  piece: boolean;
  /** a price on file (trade or retail) */
  commerce: boolean;
  /** at least one image */
  folio: boolean;
  /** taught — at least one style */
  eye: boolean;
}

export type PieceStateLabel = 'Capture' | 'Draft' | 'Catalog-ready';

/** Does the JSONB dimensions object carry a real measurement? */
function hasDimensions(d: unknown): boolean {
  if (!d || typeof d !== 'object') return false;
  const dim = d as Record<string, unknown>;
  return ['width', 'depth', 'height'].some((k) => {
    const v = dim[k];
    return v != null && String(v).trim() !== '';
  });
}

/** Derive the five sections from a loaded row + whether the eye is taught. */
export function pieceSections(row: PieceRow, hasTeaching: boolean): PieceSections {
  return {
    identity: !!row.name?.trim() && !!row.brand?.trim(),
    piece: hasDimensions(row.dimensions) && (row.materials?.length ?? 0) > 0,
    commerce: row.price_retail != null || row.price_trade != null,
    folio: (row.images?.length ?? 0) >= 1,
    eye: hasTeaching,
  };
}

/** [line1, line2, line3] fill fractions for the Strata Mark. */
export function pieceFill(s: PieceSections): [number, number, number] {
  const line1 = (s.identity ? 0.5 : 0) + (s.piece ? 0.5 : 0);
  const line2 = (s.commerce ? 0.5 : 0) + (s.folio ? 0.5 : 0);
  const line3 = s.eye ? 1 : 0;
  return [line1, line2, line3];
}

export function piecePct(fill: [number, number, number]): number {
  return Math.round(((fill[0] + fill[1] + fill[2]) / 3) * 100);
}

/** The state band reads off the same fill — never a separate stepper. */
export function pieceStateLabel(pct: number): PieceStateLabel {
  if (pct <= 0) return 'Capture';
  if (pct >= 100) return 'Catalog-ready';
  return 'Draft';
}

/** What's still open, in plain words — the colophon's quiet completeness line. */
export function pieceGaps(s: PieceSections): string[] {
  const gaps: string[] = [];
  if (!s.identity) gaps.push('a name & maker');
  if (!s.piece) gaps.push('dimensions & materials');
  if (!s.commerce) gaps.push('a price');
  if (!s.folio) gaps.push('an image');
  if (!s.eye) gaps.push('its style');
  return gaps;
}
