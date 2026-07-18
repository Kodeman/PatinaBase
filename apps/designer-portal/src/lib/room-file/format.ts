/**
 * Room File — dimension formatting (Field Capture P1, package item 12).
 *
 * A faithful TS port of the worker's drawing unit layer
 * (services/scan-pipeline/src/patina_scan_worker/drawing/units.py) so the
 * portal's measurement/certificate numbers read IDENTICALLY to the numbers
 * printed on the SVG/PDF/DXF sheets — one formatting authority, two renderers,
 * agreeing by construction (units.py's own promise).
 *
 * `formatFtIn`  — integer mm → `F'-I"` or `F'-I n/d"`, nearest 1/8"
 *                 (architectural default, carpenter-legible).
 * `dimensionBadge` — the tolerance-class badge triad (deck SC-11 / units.py
 *                 `badge_text`): verified → leading ✓, no ±; measured → value
 *                 + ± tolerance (mm); estimated → leading ~, ± when present.
 *                 Returned as parts (not one string) so the glyph and ± band
 *                 can carry their own quiet styling.
 */

import type { ToleranceClass } from '@patina/supabase';

const MM_PER_IN = 25.4;

function gcd(a: number, b: number): number {
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

/**
 * Integer millimetres → `F'-I"` or `F'-I n/d"`, rounded to the nearest
 * 1/`denom` inch (default eighths). Ports units.py `format_ftin` exactly,
 * including the 12″→+1′ and 8/8→+1″ carries and fraction reduction.
 */
export function formatFtIn(mm: number, denom = 8): string {
  const totalIn = mm / MM_PER_IN;
  let feet = Math.floor(totalIn / 12);
  const remIn = totalIn - feet * 12;
  let whole = Math.floor(remIn);
  let fracEighths = Math.round((remIn - whole) * denom);
  if (fracEighths === denom) {
    whole += 1;
    fracEighths = 0;
  }
  if (whole === 12) {
    feet += 1;
    whole = 0;
  }
  let inch: string;
  if (fracEighths) {
    const g = gcd(fracEighths, denom);
    inch = `${whole} ${fracEighths / g}/${denom / g}"`;
  } else {
    inch = `${whole}"`;
  }
  return `${feet}'-${inch}`;
}

export interface DimensionBadge {
  /** Leading class glyph: '✓' verified, '~' estimated, null measured. */
  glyph: '✓' | '~' | null;
  /** The ft-in value string (nearest 1/8"). */
  value: string;
  /** The ± tolerance band (e.g. '±10'), in mm, or null when none applies. */
  tolerance: string | null;
  toleranceClass: ToleranceClass;
}

/**
 * The full dimension badge for a measurement, mirroring units.py `badge_text`:
 *   verified  → ✓ value              (anchor-exact, no ±)
 *   measured  → value ±tol           (± omitted when tolerance is null)
 *   estimated → ~ value ±tol         (± omitted for RoomPlan-invented/null)
 * The ± is shown in raw mm (the stored tolerance_mm is exact in mm; a mixed
 * ft-in ± reads worse than "±10" — units.py's M3 note).
 */
export function dimensionBadge(
  valueMm: number,
  toleranceMm: number | null | undefined,
  toleranceClass: ToleranceClass,
): DimensionBadge {
  const value = formatFtIn(valueMm);
  const tol = toleranceMm != null ? `±${toleranceMm}` : null;
  if (toleranceClass === 'verified') {
    return { glyph: '✓', value, tolerance: null, toleranceClass };
  }
  if (toleranceClass === 'estimated') {
    return { glyph: '~', value, tolerance: tol, toleranceClass };
  }
  // measured
  return { glyph: null, value, tolerance: tol, toleranceClass };
}

/** Human label for a tolerance class (title-block vocabulary). */
export function toleranceClassLabel(cls: ToleranceClass | null): string {
  switch (cls) {
    case 'verified':
      return 'Verified';
    case 'measured':
      return 'Measured';
    case 'estimated':
      return 'Estimated';
    default:
      return '—';
  }
}
