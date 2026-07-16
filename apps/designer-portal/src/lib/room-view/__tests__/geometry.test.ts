import { areaOf, ftIn, overallDims, rectCorners, type RoomGeometry } from '../geometry';

describe('ftIn — feet to feet-and-inches (ported exactly from the prototype)', () => {
  it('formats a half foot as 6 inches', () => {
    expect(ftIn(0.5)).toBe('0′ 6″');
  });

  it('formats exact feet with 0 inches', () => {
    expect(ftIn(14)).toBe('14′ 0″');
    expect(ftIn(19)).toBe('19′ 0″');
    expect(ftIn(0)).toBe('0′ 0″');
  });

  it('carries a 12″ rounding into the next foot (11.96 → 12′ 0″)', () => {
    // (11.96 − 11) × 12 = 11.52 → rounds to 12 → carry to 12′ 0″
    expect(ftIn(11.96)).toBe('12′ 0″');
    // sub-foot carry: 0.96 → 1′ 0″
    expect(ftIn(0.96)).toBe('1′ 0″');
  });

  it('rounds to the nearest inch without carrying below the threshold', () => {
    // 6.94 → (0.94 × 12 = 11.28) → 11″, no carry
    expect(ftIn(6.94)).toBe('6′ 11″');
    // 5.5 → 6″
    expect(ftIn(5.5)).toBe('5′ 6″');
    // 13 + 3/12 = 13.25 → 3″
    expect(ftIn(13.25)).toBe('13′ 3″');
  });

  it('uses the prime and double-prime glyphs, not ASCII quotes', () => {
    const s = ftIn(3.5);
    expect(s).toContain('′'); // ′
    expect(s).toContain('″'); // ″
    expect(s).not.toContain("'");
    expect(s).not.toContain('"');
  });
});

describe('areaOf', () => {
  const base = (): RoomGeometry => ({
    width: 19,
    depth: 14,
    wallH: 8,
    thick: 0.45,
    walls: [],
    windows: [],
    doors: [],
    objects: [],
    floor: [],
  });

  it('uses width × depth when no floor polygon is present', () => {
    expect(areaOf(base())).toBe(266);
  });

  it('uses the shoelace area of the floor polygon when present', () => {
    const g = base();
    g.floor = [
      { x: 0, z: 0 },
      { x: 19, z: 0 },
      { x: 19, z: 14 },
      { x: 0, z: 14 },
    ];
    expect(areaOf(g)).toBe(266);
  });

  it('computes an L-shaped polygon area correctly (shoelace)', () => {
    const g = base();
    // 10×10 square with a 4×4 bite out of one corner = 100 − 16 = 84
    g.floor = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 6 },
      { x: 6, z: 6 },
      { x: 6, z: 10 },
      { x: 0, z: 10 },
    ];
    expect(areaOf(g)).toBeCloseTo(84, 6);
  });

  it('returns 0 for degenerate geometry rather than NaN', () => {
    const g = base();
    g.width = Number.NaN;
    g.depth = Number.NaN;
    expect(areaOf(g)).toBe(0);
  });
});

describe('overallDims', () => {
  const base = (): RoomGeometry => ({
    width: 19,
    depth: 14,
    wallH: 8,
    thick: 0.45,
    walls: [],
    windows: [],
    doors: [],
    objects: [],
    floor: [],
  });

  it('prefers the stored width/depth', () => {
    expect(overallDims(base())).toEqual({ w: 19, d: 14 });
  });

  it('falls back to the floor-polygon bounding box', () => {
    const g = base();
    g.width = 0;
    g.depth = 0;
    g.floor = [
      { x: 1, z: 2 },
      { x: 12, z: 2 },
      { x: 12, z: 9 },
      { x: 1, z: 9 },
    ];
    expect(overallDims(g)).toEqual({ w: 11, d: 7 });
  });

  it('falls back to the walls bounding box when no dims and no floor', () => {
    const g = base();
    g.width = 0;
    g.depth = 0;
    g.walls = [
      { x1: 0, z1: 0, x2: 8, z2: 0, conf: 'high', name: 'a', len: 8 },
      { x1: 8, z1: 0, x2: 8, z2: 5, conf: 'high', name: 'b', len: 5 },
    ];
    expect(overallDims(g)).toEqual({ w: 8, d: 5 });
  });
});

describe('rectCorners', () => {
  it('returns axis-aligned corners for a zero-rotation rect', () => {
    const c = rectCorners({ cx: 5, cz: 3, w: 4, d: 2, angleDeg: 0 });
    expect(c).toEqual([
      { x: 3, z: 2 },
      { x: 7, z: 2 },
      { x: 7, z: 4 },
      { x: 3, z: 4 },
    ]);
  });

  it('rotates 90° about the centre', () => {
    const c = rectCorners({ cx: 0, cz: 0, w: 2, d: 0, angleDeg: 90 });
    // width axis rotates from +x to +z
    expect(c[0].x).toBeCloseTo(0, 6);
    expect(c[0].z).toBeCloseTo(-1, 6);
    expect(c[1].x).toBeCloseTo(0, 6);
    expect(c[1].z).toBeCloseTo(1, 6);
  });
});
