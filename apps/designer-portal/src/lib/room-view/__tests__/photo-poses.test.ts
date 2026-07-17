/**
 * photo-poses.ts — plan-frame projection of ARKit camera transforms.
 *
 * Truth sources:
 *  · Identity provenance: hand-computed (meters × 3.28084).
 *  · Elena fixture: the parser's OWN header outputs for
 *    supabase/seed/fixtures/room-scans/elena-formal-dining.captured_room.json —
 *    origin_yaw_deg = -15, origin_offset_m = { x: 6.2374, z: -1.6416 },
 *    room 14.0092 × 14.0092 ft, table dead-centre at plan (7.0046, 7.0046).
 *    These were produced by running parse-room-scan/lib.ts on the fixture.
 *  · An in-test oracle (`parserPlanFt`) ports the parser's rotateNeg + toPlanFt
 *    verbatim, so photoPlanPose is cross-checked against the parser's math, not
 *    just against itself.
 */

import {
  clusterPoses,
  M_TO_FT,
  photoPlanPose,
  type PhotoProvenance,
} from '../photo-poses';

// ────────────────────────────────────────────────────────────────────────────
// Camera-transform builders (row-major, 16 doubles — matches
// room_scan_images.camera_transform). Only two cells groups are load-bearing:
// translation at [3],[7],[11] and the local −Z (forward) column at [2],[6],[10].
// These helpers build a genuine orthonormal frame so the fixtures are realistic.
// ────────────────────────────────────────────────────────────────────────────

/** Identity orientation (camera forward = world −Z), placed at (tx,ty,tz). */
function identityCam(tx: number, ty: number, tz: number): number[] {
  return [
    1, 0, 0, tx,
    0, 1, 0, ty,
    0, 0, 1, tz,
    0, 0, 0, 1,
  ];
}

/**
 * Camera yawed `yawDeg` about world +Y, at (tx,ty,tz). Row-major R(φ):
 *   [ cosφ 0 sinφ ]   → forward = −Zcol = (−sinφ, 0, −cosφ)
 *   [ 0    1 0    ]
 *   [−sinφ 0 cosφ ]
 */
function yawCam(yawDeg: number, tx: number, ty: number, tz: number): number[] {
  const p = (yawDeg * Math.PI) / 180;
  const c = Math.cos(p);
  const s = Math.sin(p);
  return [
    c, 0, s, tx,
    0, 1, 0, ty,
    -s, 0, c, tz,
    0, 0, 0, 1,
  ];
}

// ── Elena fixture provenance (parser's own outputs) ──
const ELENA: PhotoProvenance = { originYawDeg: -15, originOffsetM: { x: 6.2374, z: -1.6416 } };
const ROOM_FT = 14.0092;

/** Parser oracle — verbatim rotateNeg + toPlanFt from parse-room-scan/lib.ts (no round4). */
function parserPlanFt(wx: number, wz: number, prov: PhotoProvenance): { x: number; z: number } {
  const theta = (prov.originYawDeg * Math.PI) / 180;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const rx = wx * c + wz * s; // rotateNeg.x
  const rz = -wx * s + wz * c; // rotateNeg.z
  return {
    x: (rx - prov.originOffsetM.x) * M_TO_FT,
    z: (rz - prov.originOffsetM.z) * M_TO_FT,
  };
}

/** Inverse of the plan mapping: a plan-feet point → the world XZ that lands there. */
function planToWorld(px: number, pz: number, prov: PhotoProvenance): { x: number; z: number } {
  const theta = (prov.originYawDeg * Math.PI) / 180;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const rx = px / M_TO_FT + prov.originOffsetM.x;
  const rz = pz / M_TO_FT + prov.originOffsetM.z;
  // rotate by +theta (inverse of rotateNeg, which rotates by −theta)
  return { x: rx * c - rz * s, z: rx * s + rz * c };
}

// ════════════════════════════════════════════════════════════════════════════
// (a) Identity provenance — pure meters → feet
// ════════════════════════════════════════════════════════════════════════════

describe('photoPlanPose — identity provenance (θ=0, offset 0)', () => {
  const IDENTITY: PhotoProvenance = { originYawDeg: 0, originOffsetM: { x: 0, z: 0 } };

  it('maps world (2m, 1.5m, 3m) straight to plan feet', () => {
    // x = 2·3.28084 = 6.56168 ; z = 3·3.28084 = 9.84252 ; y = 1.5·3.28084 = 4.92126
    const pose = photoPlanPose(identityCam(2, 1.5, 3), IDENTITY);
    expect(pose).not.toBeNull();
    expect(pose!.x).toBeCloseTo(6.56168, 5);
    expect(pose!.z).toBeCloseTo(9.84252, 5);
    expect(pose!.y).toBeCloseTo(4.92126, 5);
  });

  it('identity-orientation camera (forward = world −Z) faces plan north (270°)', () => {
    // forward (0,0,−1): worldHeading = atan2(−1,0) = −90° → normalize 270; minus θ=0 → 270
    const pose = photoPlanPose(identityCam(0, 1.5, 0), IDENTITY);
    expect(pose!.headingDeg).toBeCloseTo(270, 6);
  });

  it('origin camera lands at plan origin (0,0)', () => {
    const pose = photoPlanPose(identityCam(0, 0, 0), IDENTITY);
    expect(pose!.x).toBeCloseTo(0, 6);
    expect(pose!.z).toBeCloseTo(0, 6);
    expect(pose!.y).toBeCloseTo(0, 6);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// (b) Elena fixture — real θ/offset, positions land inside the 14×14 room,
//     and photoPlanPose == the parser's own mapping.
// ════════════════════════════════════════════════════════════════════════════

describe('photoPlanPose — Elena fixture (θ=-15°, offset {6.2374,-1.6416})', () => {
  it('a camera at the room-centre world point lands at plan (7.0046, 7.0046)', () => {
    // Hand-computed inverse of plan (7.0046, 7.0046):
    //   rx = 7.0046/3.28084 + 6.2374  = 8.37241
    //   rz = 7.0046/3.28084 − 1.6416  = 0.49341
    //   wx = rx·cos(−15°) − rz·sin(−15°) = 8.21487
    //   wz = rx·sin(−15°) + rz·cos(−15°) = −1.69037
    const w = planToWorld(7.0046, 7.0046, ELENA);
    expect(w.x).toBeCloseTo(8.21487, 4);
    expect(w.z).toBeCloseTo(-1.69037, 4);

    const pose = photoPlanPose(identityCam(w.x, 1.5, w.z), ELENA);
    expect(pose).not.toBeNull();
    expect(pose!.x).toBeCloseTo(7.0046, 4);
    expect(pose!.z).toBeCloseTo(7.0046, 4);
    // inside the room
    expect(pose!.x).toBeGreaterThan(0);
    expect(pose!.x).toBeLessThan(ROOM_FT);
    expect(pose!.z).toBeGreaterThan(0);
    expect(pose!.z).toBeLessThan(ROOM_FT);
  });

  it.each([
    ['centre', 7.0046, 7.0046],
    ['near NW corner', 3.5, 3.5],
    ['near SE corner', 10.5, 10.5],
    ['off-diagonal', 1.0, 13.0],
  ])('round-trips %s (%f, %f) and stays inside the room', (_label, px, pz) => {
    const w = planToWorld(px, pz, ELENA);
    const pose = photoPlanPose(identityCam(w.x, 1.5, w.z), ELENA);
    expect(pose).not.toBeNull();
    expect(pose!.x).toBeCloseTo(px, 4);
    expect(pose!.z).toBeCloseTo(pz, 4);
    expect(pose!.x).toBeGreaterThanOrEqual(0);
    expect(pose!.x).toBeLessThanOrEqual(ROOM_FT);
    expect(pose!.z).toBeGreaterThanOrEqual(0);
    expect(pose!.z).toBeLessThanOrEqual(ROOM_FT);
  });

  it.each([
    [8.21487, -1.69037],
    [7.5, 0.25],
    [9.1, -2.4],
  ])('agrees with the parser oracle for world XZ (%f, %f)', (wx, wz) => {
    const pose = photoPlanPose(identityCam(wx, 1.5, wz), ELENA);
    const oracle = parserPlanFt(wx, wz, ELENA);
    expect(pose!.x).toBeCloseTo(oracle.x, 9);
    expect(pose!.z).toBeCloseTo(oracle.z, 9);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// (c) Heading — camera looking along known world directions → plan headings
// ════════════════════════════════════════════════════════════════════════════

describe('photoPlanPose — heading convention (0°=+x east, +z south, CW)', () => {
  const IDENTITY: PhotoProvenance = { originYawDeg: 0, originOffsetM: { x: 0, z: 0 } };
  const YAW30: PhotoProvenance = { originYawDeg: 30, originOffsetM: { x: 0, z: 0 } };

  // yawCam(φ) gives camera forward = (−sinφ, 0, −cosφ).
  it.each([
    // yawDeg, expected worldForward, expected plan heading @ θ=0
    [270, '+x (east)', 0],
    [180, '+z (south)', 90],
    [90, '−x (west)', 180],
    [0, '−z (north)', 270],
  ])('θ=0: yaw %i° → forward %s → heading %i°', (yawDeg, _dir, expected) => {
    const pose = photoPlanPose(yawCam(yawDeg, 0, 1.5, 0), IDENTITY);
    expect(pose!.headingDeg).toBeCloseTo(expected, 6);
  });

  it('subtracting yaw rotates the heading: forward +x under θ=30 → 330°', () => {
    // worldHeading(+x) = 0; normalize(0 − 30) = 330
    const pose = photoPlanPose(yawCam(270, 0, 1.5, 0), YAW30);
    expect(pose!.headingDeg).toBeCloseTo(330, 6);
  });

  it('forward +z under θ=30 → 60°', () => {
    // worldHeading(+z) = 90; normalize(90 − 30) = 60
    const pose = photoPlanPose(yawCam(180, 0, 1.5, 0), YAW30);
    expect(pose!.headingDeg).toBeCloseTo(60, 6);
  });

  it.each([
    // Elena θ=-15: normalize(worldHeading − (−15)) = worldHeading + 15
    [270, 15], // forward +x: 0 + 15
    [0, 285], // forward −z: 270 + 15
  ])('Elena θ=-15: yaw %i° → heading %i°', (yawDeg, expected) => {
    const pose = photoPlanPose(yawCam(yawDeg, 5, 1.5, 5), ELENA);
    expect(pose!.headingDeg).toBeCloseTo(expected, 6);
  });

  it('heading is always normalized to [0, 360)', () => {
    for (const yawDeg of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const pose = photoPlanPose(yawCam(yawDeg, 0, 1.5, 0), ELENA);
      expect(pose!.headingDeg).toBeGreaterThanOrEqual(0);
      expect(pose!.headingDeg).toBeLessThan(360);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// (d) Malformed input → null (never throws)
// ════════════════════════════════════════════════════════════════════════════

describe('photoPlanPose — malformed input returns null', () => {
  const P: PhotoProvenance = { originYawDeg: 0, originOffsetM: { x: 0, z: 0 } };

  it('wrong length (15) → null', () => {
    expect(photoPlanPose(new Array(15).fill(0), P)).toBeNull();
  });
  it('wrong length (17) → null', () => {
    expect(photoPlanPose(new Array(17).fill(0), P)).toBeNull();
  });
  it('empty array → null', () => {
    expect(photoPlanPose([], P)).toBeNull();
  });
  it('contains NaN → null', () => {
    const t = identityCam(1, 1, 1);
    t[3] = NaN;
    expect(photoPlanPose(t, P)).toBeNull();
  });
  it('contains Infinity → null', () => {
    const t = identityCam(1, 1, 1);
    t[10] = Infinity;
    expect(photoPlanPose(t, P)).toBeNull();
  });
  it('non-array input → null', () => {
    expect(photoPlanPose(null as unknown as number[], P)).toBeNull();
    expect(photoPlanPose(undefined as unknown as number[], P)).toBeNull();
    expect(photoPlanPose('nope' as unknown as number[], P)).toBeNull();
  });
  it('malformed provenance → null', () => {
    const t = identityCam(1, 1, 1);
    expect(photoPlanPose(t, { originYawDeg: NaN, originOffsetM: { x: 0, z: 0 } })).toBeNull();
    expect(
      photoPlanPose(t, { originYawDeg: 0, originOffsetM: { x: NaN, z: 0 } }),
    ).toBeNull();
    expect(
      photoPlanPose(t, null as unknown as PhotoProvenance),
    ).toBeNull();
    expect(
      photoPlanPose(t, { originYawDeg: 0 } as unknown as PhotoProvenance),
    ).toBeNull();
  });
  it('does not throw on any of the above', () => {
    expect(() => photoPlanPose([1, 2, 3], P)).not.toThrow();
    expect(() => photoPlanPose(null as unknown as number[], P)).not.toThrow();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// (e) clusterPoses
// ════════════════════════════════════════════════════════════════════════════

describe('clusterPoses', () => {
  interface P {
    x: number;
    z: number;
    id: string;
    t: number;
  }

  // Five poses; A and B are 0.5 ft apart (within 1.5 ft), the rest are far.
  const poses: P[] = [
    { x: 0, z: 0, id: 'A', t: 10 },
    { x: 0.5, z: 0, id: 'B', t: 20 }, // 0.5 ft from A
    { x: 5, z: 5, id: 'C', t: 30 },
    { x: 10, z: 0, id: 'D', t: 40 },
    { x: 0, z: 10, id: 'E', t: 50 },
  ];

  it('merges the one near-pair → 4 clusters with correct counts', () => {
    const clusters = clusterPoses(poses, 1.5);
    expect(clusters).toHaveLength(4);
    const counts = clusters.map((c) => c.count).sort((a, b) => b - a);
    expect(counts).toEqual([2, 1, 1, 1]);
  });

  it('representative is the earliest by the supplied sort key (default: input order)', () => {
    const clusters = clusterPoses(poses, 1.5);
    const ab = clusters.find((c) => c.count === 2)!;
    // A (index 0) is earliest by input order → representative
    expect(ab.representativeIndex).toBe(0);
    expect(ab.representative.id).toBe('A');
    expect(ab.memberIndices).toEqual([0, 1]);
  });

  it('a supplied sort key changes which member is the representative', () => {
    // Rank by DESCENDING t → B (t=20) precedes A (t=10) → B represents the pair.
    const clusters = clusterPoses(poses, 1.5, (p) => -p.t);
    const ab = clusters.find((c) => c.count === 2)!;
    expect(ab.representative.id).toBe('B');
    expect(ab.representativeIndex).toBe(1);
    expect(ab.memberIndices).toEqual([0, 1]); // membership unchanged, still original indices
  });

  it('is deterministic (same input → identical output)', () => {
    expect(clusterPoses(poses, 1.5)).toEqual(clusterPoses(poses, 1.5));
  });

  it('radius is inclusive and configurable', () => {
    // C is 5 ft from D-ish; with a huge radius everything collapses to 1 cluster.
    const one = clusterPoses(poses, 100);
    expect(one).toHaveLength(1);
    expect(one[0].count).toBe(5);
    // With a tiny radius nothing merges → 5 singletons.
    const five = clusterPoses(poses, 0.1);
    expect(five).toHaveLength(5);
    expect(five.every((c) => c.count === 1)).toBe(true);
  });

  it('every input index appears in exactly one cluster', () => {
    const clusters = clusterPoses(poses, 1.5);
    const all = clusters.flatMap((c) => c.memberIndices).sort((a, b) => a - b);
    expect(all).toEqual([0, 1, 2, 3, 4]);
  });

  it('empty input → no clusters', () => {
    expect(clusterPoses([], 1.5)).toEqual([]);
  });
});
