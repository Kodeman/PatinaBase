import { act, renderHook } from '@testing-library/react';
import { dist, ftIn, type Pt } from '@/lib/room-view/geometry';
import { prototypeRoom } from '@/lib/room-view/__fixtures__/room-fixture';
import { PLAN_STAGE_PAD, PLAN_STAGE_SCALE } from '../plan-stage';
import { measureReducer, MEASURE_IDLE, screenPointToFeet, useMeasure, type MeasureState } from '../use-measure';

// ═══════════════════════════════════════════════════════════════════════════
// Mock SVG / CTM — a minimal stand-in for the real DOM SVGSVGElement /
// DOMMatrix / DOMPoint contract that screenPointToFeet() actually calls
// (getScreenCTM → .inverse() → createSVGPoint().matrixTransform()). jsdom
// does not implement getScreenCTM at all, so production code is exercised
// here exactly as the browser would drive it, against a hand-built affine
// transform representing whatever CSS scale/translate the real stage is
// rendered under (container width, browser zoom) — no skew/rotation, which
// the real stage never applies either.
// ═══════════════════════════════════════════════════════════════════════════

interface MockMatrix {
  a: number;
  d: number;
  e: number;
  f: number;
  inverse(): MockMatrix;
}

interface MockPoint {
  x: number;
  y: number;
  matrixTransform(this: MockPoint, m: MockMatrix): MockPoint;
}

/** screen = a·user + e (x), d·user + f (y) — the CTM a real SVG reports when
 *  its viewBox-to-CSS-pixel scale is `a`/`d` and the stage sits at page
 *  offset `e`/`f`. */
function makeMatrix(a: number, d: number, e: number, f: number): MockMatrix {
  return {
    a,
    d,
    e,
    f,
    inverse: () => makeMatrix(1 / a, 1 / d, -e / a, -f / d),
  };
}

function makePoint(x: number, y: number): MockPoint {
  return {
    x,
    y,
    matrixTransform(m) {
      return makePoint(m.a * this.x + m.e, m.d * this.y + m.f);
    },
  };
}

function makeMockSvg(ctm: MockMatrix | null): SVGSVGElement {
  return {
    getScreenCTM: () => ctm,
    createSVGPoint: () => makePoint(0, 0),
  } as unknown as SVGSVGElement;
}

/** The forward direction: given a feet point in plan-stage's own px()
 *  convention (ft·SCALE+PAD), returns the client (screen) coordinates a
 *  browser would report for a click landing exactly there under `ctm`. This
 *  is the literal inverse of what screenPointToFeet computes — used to
 *  build test fixtures, never imported by production code. */
function clientCoordsFor(pt: Pt, ctm: MockMatrix, scale = PLAN_STAGE_SCALE, pad = PLAN_STAGE_PAD): { clientX: number; clientY: number } {
  const userX = pt.x * scale + pad;
  const userY = pt.z * scale + pad;
  return { clientX: ctm.a * userX + ctm.e, clientY: ctm.d * userY + ctm.f };
}

// ═══════════════════════════════════════════════════════════════════════════
// screenPointToFeet — screen→feet via a mocked CTM
// ═══════════════════════════════════════════════════════════════════════════

describe('screenPointToFeet — screen→feet through getScreenCTM().inverse()', () => {
  const target: Pt = { x: 5, z: 3 };

  it('recovers the exact feet point under an identity-scale CTM (no zoom, no offset)', () => {
    const ctm = makeMatrix(1, 1, 0, 0);
    const { clientX, clientY } = clientCoordsFor(target, ctm);
    const svg = makeMockSvg(ctm);
    expect(screenPointToFeet(svg, clientX, clientY)).toEqual({ x: 5, z: 3 });
  });

  it('recovers the exact feet point when the stage is rendered at 0.5x (container narrower than viewBox)', () => {
    const ctm = makeMatrix(0.5, 0.5, 0, 0);
    const { clientX, clientY } = clientCoordsFor(target, ctm);
    const svg = makeMockSvg(ctm);
    const p = screenPointToFeet(svg, clientX, clientY);
    expect(p?.x).toBeCloseTo(5, 9);
    expect(p?.z).toBeCloseTo(3, 9);
  });

  it('recovers the exact feet point at a large browser-zoom-like scale (2.75x)', () => {
    const ctm = makeMatrix(2.75, 2.75, 0, 0);
    const { clientX, clientY } = clientCoordsFor(target, ctm);
    const svg = makeMockSvg(ctm);
    const p = screenPointToFeet(svg, clientX, clientY);
    expect(p?.x).toBeCloseTo(5, 9);
    expect(p?.z).toBeCloseTo(3, 9);
  });

  it('recovers the exact feet point through a translated CTM (stage scrolled down the page)', () => {
    const ctm = makeMatrix(1, 1, 240, 918.4);
    const { clientX, clientY } = clientCoordsFor(target, ctm);
    const svg = makeMockSvg(ctm);
    const p = screenPointToFeet(svg, clientX, clientY);
    expect(p?.x).toBeCloseTo(5, 9);
    expect(p?.z).toBeCloseTo(3, 9);
  });

  it('recovers the exact feet point through a combined scale+translate CTM', () => {
    const ctm = makeMatrix(1.618, 1.618, 42.5, -13.2);
    const { clientX, clientY } = clientCoordsFor(target, ctm);
    const svg = makeMockSvg(ctm);
    const p = screenPointToFeet(svg, clientX, clientY);
    expect(p?.x).toBeCloseTo(5, 9);
    expect(p?.z).toBeCloseTo(3, 9);
  });

  it('returns null when the SVG has no CTM yet (unmounted / zero-size)', () => {
    const svg = makeMockSvg(null);
    expect(screenPointToFeet(svg, 100, 100)).toBeNull();
  });

  it('honors an overridden scale/pad (a caller measuring against a different transform)', () => {
    const ctm = makeMatrix(1, 1, 0, 0);
    const scale = 40;
    const pad = 10;
    const { clientX, clientY } = clientCoordsFor(target, ctm, scale, pad);
    const svg = makeMockSvg(ctm);
    const p = screenPointToFeet(svg, clientX, clientY, scale, pad);
    expect(p?.x).toBeCloseTo(5, 9);
    expect(p?.z).toBeCloseTo(3, 9);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Distance accuracy — known wall lengths from the fixture geometry, and
// zoom-invariance (package accept 2.3: "within 1″ of geometry truth at any
// zoom" — proven here as EXACT equality across differing CTMs, not just
// "close enough").
// ═══════════════════════════════════════════════════════════════════════════

describe('distance accuracy — fixture geometry, zoom-invariant', () => {
  const room = prototypeRoom();
  // West wall (index 4): (0,0) → (0,14) — a pure 14' run.
  const westWall = room.walls[4];
  // North wall's two runs together span the room's full 19' width, but the
  // wall itself is two segments; take the room's overall diagonal instead
  // for the "diagonal" case: NW corner (0,0) → SE corner (19,14).
  const nw: Pt = { x: 0, z: 0 };
  const se: Pt = { x: 19, z: 14 };

  it('reads the 14′ west wall as exactly 14′ 0″, at three different zoom levels', () => {
    const a: Pt = { x: westWall.x1, z: westWall.z1 };
    const b: Pt = { x: westWall.x2, z: westWall.z2 };
    expect(dist(a.x, a.z, b.x, b.z)).toBe(14);

    for (const ctm of [makeMatrix(1, 1, 0, 0), makeMatrix(0.6, 0.6, 12, 4), makeMatrix(3.2, 3.2, -80, 55)]) {
      const svg = makeMockSvg(ctm);
      const ca = clientCoordsFor(a, ctm);
      const cb = clientCoordsFor(b, ctm);
      const pa = screenPointToFeet(svg, ca.clientX, ca.clientY)!;
      const pb = screenPointToFeet(svg, cb.clientX, cb.clientY)!;
      const distanceFt = dist(pa.x, pa.z, pb.x, pb.z);
      expect(distanceFt).toBeCloseTo(14, 9);
      expect(ftIn(distanceFt)).toBe('14′ 0″');
    }
  });

  it('reads the room diagonal as the exact hypot, matching a hand-computed value', () => {
    const distanceFt = dist(nw.x, nw.z, se.x, se.z);
    const handComputed = Math.sqrt(19 * 19 + 14 * 14); // = sqrt(557) ≈ 23.6008...
    expect(distanceFt).toBeCloseTo(handComputed, 12);
    expect(ftIn(distanceFt)).toBe(ftIn(handComputed));
    // 23.6008... ft → 23' + 0.6008*12 = 7.21" → rounds to 7"
    expect(ftIn(distanceFt)).toBe("23′ 7″");
  });

  it('reads a 3-4-5 right triangle as exactly 5′ 0″ (Pythagorean sanity check)', () => {
    const a: Pt = { x: 0, z: 0 };
    const b: Pt = { x: 3, z: 4 };
    expect(dist(a.x, a.z, b.x, b.z)).toBe(5);
    expect(ftIn(dist(a.x, a.z, b.x, b.z))).toBe('5′ 0″');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Rounding behavior at ±0.5″ boundaries — the full measure pipeline (two
// points → dist() → ftIn()), not just ftIn() in isolation (already covered
// by geometry.test.ts).
// ═══════════════════════════════════════════════════════════════════════════

describe('rounding — ±0.5″ boundaries through the measure pipeline', () => {
  it('rounds an exact half-inch remainder UP (JS Math.round half-up) — 1.5″ → 2″', () => {
    // 1.5/12 = 0.125, exactly representable in binary — no float drift, so
    // this isolates ftIn's half-up rule from IEEE-754 twelfths noise (below).
    const a: Pt = { x: 0, z: 0 };
    const b: Pt = { x: 0, z: 10.125 }; // 10' 1.5"
    const distanceFt = dist(a.x, a.z, b.x, b.z);
    expect(distanceFt - 10).toBe(1.5 / 12); // confirms this case has NO drift
    expect(ftIn(distanceFt)).toBe('10′ 2″');
  });

  it('stays within 1″ of geometry truth even when a mathematically-exact half inch drifts a few ULPs under the boundary in floating point', () => {
    // 6.5/12 is NOT exactly representable — `10 + 6.5/12` lands at
    // 10.499999999999993 ft (a few ULPs BELOW the true half-inch mark), so
    // Math.round reads 6″ rather than 7″. That's still within the ±1″
    // budget (package accept 2.3) — this pins the actual, honest pipeline
    // behavior rather than an idealized one, so a future change to the
    // rounding path can't silently regress accuracy without failing here.
    const distanceFt = dist(0, 0, 0, 10 + 6.5 / 12);
    expect(ftIn(distanceFt)).toBe('10′ 6″');
    expect(Math.abs(distanceFt - (10 + 6.5 / 12))).toBeLessThan(1 / 12);
  });

  it('stays within 1″ either side of the boundary (5.49″ → 5″, 5.51″ → 6″)', () => {
    const below = dist(0, 0, 0, 10 + 5.49 / 12);
    const above = dist(0, 0, 0, 10 + 5.51 / 12);
    expect(ftIn(below)).toBe('10′ 5″');
    expect(ftIn(above)).toBe('10′ 6″');
  });

  it('carries a 12″ rounding into the next foot through the full pipeline', () => {
    const distanceFt = dist(0, 0, 0, 11.96);
    expect(ftIn(distanceFt)).toBe('12′ 0″');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// measureReducer — pure state-machine transitions (no React needed)
// ═══════════════════════════════════════════════════════════════════════════

describe('measureReducer — state machine', () => {
  const p1: Pt = { x: 2, z: 2 };
  const p2: Pt = { x: 2, z: 16 }; // 14' away from p1

  it('starts idle', () => {
    expect(MEASURE_IDLE).toEqual({ phase: 'idle' });
  });

  it('idle → armed on arm', () => {
    const s = measureReducer(MEASURE_IDLE, { type: 'arm' });
    expect(s).toEqual({ phase: 'armed' });
  });

  it('armed → point on the first click, carrying the point', () => {
    const armed: MeasureState = { phase: 'armed' };
    const s = measureReducer(armed, { type: 'point', point: p1 });
    expect(s).toEqual({ phase: 'point', a: p1 });
  });

  it('point → complete on the second click, computing distanceFt = dist(a, b)', () => {
    const mid: MeasureState = { phase: 'point', a: p1 };
    const s = measureReducer(mid, { type: 'point', point: p2 });
    expect(s.phase).toBe('complete');
    if (s.phase === 'complete') {
      expect(s.a).toEqual(p1);
      expect(s.b).toEqual(p2);
      expect(s.distanceFt).toBe(dist(p1.x, p1.z, p2.x, p2.z));
      expect(s.distanceFt).toBe(14);
    }
  });

  it('re-arming from complete clears the prior measurement', () => {
    const complete: MeasureState = { phase: 'complete', a: p1, b: p2, distanceFt: 14 };
    const s = measureReducer(complete, { type: 'arm' });
    expect(s).toEqual({ phase: 'armed' });
  });

  it('re-arming from point (mid-measurement) also clears prior', () => {
    const mid: MeasureState = { phase: 'point', a: p1 };
    const s = measureReducer(mid, { type: 'arm' });
    expect(s).toEqual({ phase: 'armed' });
  });

  it('reset (Clear / Escape) returns to idle from every non-idle phase', () => {
    const phases: MeasureState[] = [
      { phase: 'armed' },
      { phase: 'point', a: p1 },
      { phase: 'complete', a: p1, b: p2, distanceFt: 14 },
    ];
    for (const s of phases) {
      expect(measureReducer(s, { type: 'reset' })).toEqual({ phase: 'idle' });
    }
  });

  it('a stray point action while idle is a no-op', () => {
    const s = measureReducer(MEASURE_IDLE, { type: 'point', point: p1 });
    expect(s).toEqual({ phase: 'idle' });
  });

  it('a stray point action while complete is a no-op (must re-arm first)', () => {
    const complete: MeasureState = { phase: 'complete', a: p1, b: p2, distanceFt: 14 };
    const s = measureReducer(complete, { type: 'point', point: { x: 9, z: 9 } });
    expect(s).toEqual(complete);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// useMeasure — hook integration: arm / point / complete / clear / escape
// ═══════════════════════════════════════════════════════════════════════════

describe('useMeasure — hook integration', () => {
  const ctm = makeMatrix(1, 1, 0, 0);
  const svg = makeMockSvg(ctm);
  const pA: Pt = { x: 1, z: 1 };
  const pB: Pt = { x: 1, z: 15 }; // 14' from pA

  it('starts idle', () => {
    const { result } = renderHook(() => useMeasure());
    expect(result.current.state).toEqual({ phase: 'idle' });
  });

  it('arm() moves idle → armed', () => {
    const { result } = renderHook(() => useMeasure());
    act(() => result.current.arm());
    expect(result.current.state).toEqual({ phase: 'armed' });
  });

  it('addPoint() twice moves armed → point → complete with the correct distance', () => {
    const { result } = renderHook(() => useMeasure());
    act(() => result.current.arm());

    const c1 = clientCoordsFor(pA, ctm);
    act(() => result.current.addPoint(svg, c1.clientX, c1.clientY));
    expect(result.current.state.phase).toBe('point');

    const c2 = clientCoordsFor(pB, ctm);
    act(() => result.current.addPoint(svg, c2.clientX, c2.clientY));

    expect(result.current.state.phase).toBe('complete');
    if (result.current.state.phase === 'complete') {
      expect(result.current.state.distanceFt).toBeCloseTo(14, 9);
    }
  });

  it('addPoint() before arming is a no-op (stays idle)', () => {
    const { result } = renderHook(() => useMeasure());
    const c1 = clientCoordsFor(pA, ctm);
    act(() => result.current.addPoint(svg, c1.clientX, c1.clientY));
    expect(result.current.state).toEqual({ phase: 'idle' });
  });

  it('addPoint() with no CTM (null) does not advance the phase', () => {
    const { result } = renderHook(() => useMeasure());
    act(() => result.current.arm());
    const noCtmSvg = makeMockSvg(null);
    act(() => result.current.addPoint(noCtmSvg, 100, 100));
    expect(result.current.state).toEqual({ phase: 'armed' });
  });

  it('clear() returns to idle from complete', () => {
    const { result } = renderHook(() => useMeasure());
    act(() => result.current.arm());
    const c1 = clientCoordsFor(pA, ctm);
    const c2 = clientCoordsFor(pB, ctm);
    act(() => result.current.addPoint(svg, c1.clientX, c1.clientY));
    act(() => result.current.addPoint(svg, c2.clientX, c2.clientY));
    expect(result.current.state.phase).toBe('complete');

    act(() => result.current.clear());
    expect(result.current.state).toEqual({ phase: 'idle' });
  });

  it('re-arming after complete discards the prior measurement and starts fresh', () => {
    const { result } = renderHook(() => useMeasure());
    act(() => result.current.arm());
    const c1 = clientCoordsFor(pA, ctm);
    const c2 = clientCoordsFor(pB, ctm);
    act(() => result.current.addPoint(svg, c1.clientX, c1.clientY));
    act(() => result.current.addPoint(svg, c2.clientX, c2.clientY));
    expect(result.current.state.phase).toBe('complete');

    act(() => result.current.arm());
    expect(result.current.state).toEqual({ phase: 'armed' });
  });

  it('Escape cancels an in-progress measurement back to idle', () => {
    const { result } = renderHook(() => useMeasure());
    act(() => result.current.arm());
    const c1 = clientCoordsFor(pA, ctm);
    act(() => result.current.addPoint(svg, c1.clientX, c1.clientY));
    expect(result.current.state.phase).toBe('point');

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.state).toEqual({ phase: 'idle' });
  });

  it('Escape also clears a completed measurement back to idle', () => {
    const { result } = renderHook(() => useMeasure());
    act(() => result.current.arm());
    const c1 = clientCoordsFor(pA, ctm);
    const c2 = clientCoordsFor(pB, ctm);
    act(() => result.current.addPoint(svg, c1.clientX, c1.clientY));
    act(() => result.current.addPoint(svg, c2.clientX, c2.clientY));
    expect(result.current.state.phase).toBe('complete');

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.state).toEqual({ phase: 'idle' });
  });

  it('a non-Escape key does nothing', () => {
    const { result } = renderHook(() => useMeasure());
    act(() => result.current.arm());
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });
    expect(result.current.state).toEqual({ phase: 'armed' });
  });
});
