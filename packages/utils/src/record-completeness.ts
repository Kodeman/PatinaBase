/**
 * Record completeness — the Strata-Mark fill for a `products` row, shared so the
 * client + guest proposal renders can show the same quiet trust mark the
 * designer's Piece Room shows. This mirrors, deliberately field-for-field, the
 * scoring in the designer portal's `lib/document/piece-progress.ts` and the
 * server mirror in `supabase/functions/_shared/spec-pdf.ts` (computeRecordPct).
 * Keep the three in step: line 1 = identity + the piece, line 2 = commerce + the
 * folio, line 3 = the eye (whether the piece is taught).
 *
 * Pure + dependency-free.
 */

export interface RecordCompletenessRow {
  name?: string | null;
  brand?: string | null;
  dimensions?: unknown;
  materials?: string[] | null;
  price_retail?: number | null;
  price_trade?: number | null;
  images?: string[] | null;
}

/** Does the JSONB dimensions object carry a real measurement? */
function hasDimensions(d: unknown): boolean {
  if (!d || typeof d !== 'object') return false;
  const dim = d as Record<string, unknown>;
  return ['width', 'depth', 'height'].some((k) => {
    const v = dim[k];
    return v != null && String(v).trim() !== '';
  });
}

/** [line1, line2, line3] fill fractions for the Strata Mark (each 0 … 1). */
export function recordCompletenessFill(
  row: RecordCompletenessRow,
  hasTeaching: boolean,
): [number, number, number] {
  const identity = !!row.name?.trim() && !!row.brand?.trim();
  const piece = hasDimensions(row.dimensions) && (row.materials?.length ?? 0) > 0;
  const commerce = row.price_retail != null || row.price_trade != null;
  const folio = (row.images?.length ?? 0) >= 1;
  const eye = hasTeaching;
  return [
    (identity ? 0.5 : 0) + (piece ? 0.5 : 0),
    (commerce ? 0.5 : 0) + (folio ? 0.5 : 0),
    eye ? 1 : 0,
  ];
}

/** 0 … 100. 100 == a fully verified record (matches spec-pdf's "verified"). */
export function recordCompletenessPct(row: RecordCompletenessRow, hasTeaching: boolean): number {
  const [a, b, c] = recordCompletenessFill(row, hasTeaching);
  return Math.round(((a + b + c) / 3) * 100);
}
