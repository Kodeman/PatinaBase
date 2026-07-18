import { formatFtIn, roundHalfEven, dimensionBadge } from '../format';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SHARED IDENTITY FIXTURE — keep in lockstep with the Python side:
 *   services/scan-pipeline/src/patina_scan_worker/drawing/__tests__/test_units.py
 * The two suites assert the SAME literal (mm → ft-in) rows against their own
 * formatter (this portal port vs the worker's units.py). If a future edit to
 * either formatter drifts, a fixture row trips here or in pytest — not a
 * dimension on a customer's drawing. Any change to a row MUST be mirrored in
 * both files in the same commit.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const SHARED_FTIN_FIXTURE: ReadonlyArray<readonly [number, string]> = [
  [0, `0'-0"`], // zero
  [114, `0'-4 1/2"`], // sub-inch, 1/2
  [305, `1'-0"`], // 12.008 in → foot boundary, fraction rounds away
  [360, `1'-2 1/8"`], // 1/8 reduced from 1/8
  [2440, `8'-0 1/8"`], // walk value
  [2982, `9'-9 3/8"`], // 3/8
  [3000, `9'-10 1/8"`], // walk value
  [3048, `10'-0"`], // exact foot (120.0 in)
  [3660, `12'-0 1/8"`], // 12'-0 carry region
  [3720, `12'-2 1/2"`], // walk value, 1/2
  [5200, `17'-0 3/4"`], // walk value, 3/4
];

/**
 * SHARED EXACT-HALF (ties-to-even) FIXTURE — the synthetic exact-half-eighth
 * case integer-mm inputs can never reach (a 1..40000 mm sweep finds zero IEEE
 * half-ties). Pins the rounding PRIMITIVE both formatters share on an exact .5:
 * JS roundHalfEven here, Python's built-in round() in test_units.py — same
 * literals, both must round the tie to the even neighbour.
 */
const SHARED_HALF_EVEN_FIXTURE: ReadonlyArray<readonly [number, number]> = [
  [0.5, 0],
  [1.5, 2],
  [2.5, 2],
  [3.5, 4],
  [4.5, 4],
  [5.5, 6],
];

describe('formatFtIn — shared identity fixture', () => {
  it.each(SHARED_FTIN_FIXTURE)('%d mm → %s', (mm, expected) => {
    expect(formatFtIn(mm)).toBe(expected);
  });
});

describe('roundHalfEven — exact-half ties-to-even (matches Python round)', () => {
  it.each(SHARED_HALF_EVEN_FIXTURE)('round(%f) → %d', (input, expected) => {
    expect(roundHalfEven(input)).toBe(expected);
  });

  it('rounds non-ties to nearest (both directions)', () => {
    expect(roundHalfEven(2.4)).toBe(2);
    expect(roundHalfEven(2.6)).toBe(3);
    expect(roundHalfEven(0.499999)).toBe(0);
    expect(roundHalfEven(0.500001)).toBe(1);
  });
});

describe('dimensionBadge — the triad (✓ / ± / ~), matching units.py badge_text', () => {
  it('verified → leading ✓, no ± band', () => {
    const b = dimensionBadge(3000, null, 'verified');
    expect(b).toMatchObject({ glyph: '✓', value: `9'-10 1/8"`, tolerance: null });
  });

  it('measured → no glyph, ± band in mm', () => {
    const b = dimensionBadge(3720, 48, 'measured');
    expect(b).toMatchObject({ glyph: null, value: `12'-2 1/2"`, tolerance: '±48' });
  });

  it('measured with null tolerance → no band', () => {
    expect(dimensionBadge(3720, null, 'measured').tolerance).toBeNull();
  });

  it('estimated → leading ~, ± band when present', () => {
    const b = dimensionBadge(360, 60, 'estimated');
    expect(b).toMatchObject({ glyph: '~', value: `1'-2 1/8"`, tolerance: '±60' });
  });

  it('estimated invented (null tolerance) → ~ with no band', () => {
    const b = dimensionBadge(114, null, 'estimated');
    expect(b).toMatchObject({ glyph: '~', value: `0'-4 1/2"`, tolerance: null });
  });
});
