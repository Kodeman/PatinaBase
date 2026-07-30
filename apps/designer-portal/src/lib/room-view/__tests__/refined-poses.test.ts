/**
 * refined-poses.ts — reading Refine's COLMAP poses into the plan frame.
 *
 * THE RISK THIS SUITE EXISTS FOR: the conversion is silent when wrong. A
 * transposed rotation, a column-instead-of-row read, a dropped
 * `ARKIT_TO_RIGHT_ROTATED_COLMAP` or a sign error all produce finite,
 * plausible, in-room poses that point the wrong way. Nothing downstream can
 * tell. And no refine artifact has ever been written to production Storage, so
 * there is no live document to check against.
 *
 * So the two load-bearing tests here do not restate the algebra:
 *
 *  (a) §Round-trip identity — ports the pipeline's OWN `arkit_c2w_to_colmap_w2c`
 *      as an oracle, then asserts that going ARKit → COLMAP → plan lands
 *      exactly where ARKit → plan lands, for seeded random rigid transforms
 *      under several provenances. Each of the four failure modes above breaks
 *      this at every sample, not at some samples.
 *
 *  (b) §Cross-language pin — eight canonical vectors emitted by
 *      `services/scan-pipeline/tests/test_refine_adapter.py`, frozen in
 *      `__fixtures__/refine-pose-vectors.ts`. If either language's basis
 *      convention drifts, exactly one of the two suites goes red.
 *
 * Everything else — the parsers, the ladder, the drift stats — is ordinary
 * degradation testing: nothing throws, nothing renders on bad input.
 */

import {
  photoPlanPose,
  type PhotoPlanPose,
  type PhotoProvenance,
} from '../photo-poses';
import {
  ARKIT_TO_RIGHT_ROTATED_COLMAP,
  buildCameraPath,
  CAMERA_PATH_MAX_POINTS,
  colmapPlanPose,
  forwardFromW2cQuat,
  forwardFromW2cRotation,
  parsePoseDeltas,
  parseRefinedPoses,
  parseRefinementEvidence,
  poseDriftStats,
  type PoseDeltaFrame,
} from '../refined-poses';
import { CROSS_LANGUAGE_POSE_VECTORS } from '../__fixtures__/refine-pose-vectors';

// ════════════════════════════════════════════════════════════════════════════
// Oracle — a faithful port of refine_adapter.arkit_c2w_to_colmap_w2c
// (services/scan-pipeline/src/patina_scan_worker/refine_adapter.py:609-620,
// _rotation_to_quaternion:527-561, _canonical_quaternion:512-524). This is the
// SECOND implementation the round-trip test cross-checks against; it is
// deliberately written from the Python, not from refined-poses.ts.
// ════════════════════════════════════════════════════════════════════════════

type M3 = number[][];

const A: M3 = [
  [0, 1, 0],
  [1, 0, 0],
  [0, 0, -1],
];

function matMul(a: M3, b: M3): M3 {
  return [0, 1, 2].map((r) =>
    [0, 1, 2].map((c) => a[r][0] * b[0][c] + a[r][1] * b[1][c] + a[r][2] * b[2][c]),
  );
}

function transpose(m: M3): M3 {
  return [0, 1, 2].map((r) => [0, 1, 2].map((c) => m[c][r]));
}

function matVec(m: M3, v: number[]): number[] {
  return [0, 1, 2].map((r) => m[r][0] * v[0] + m[r][1] * v[1] + m[r][2] * v[2]);
}

/** Port of `_canonical_quaternion` — normalise, then force the first
 *  non-negligible component positive so q and −q don't differ by convention. */
function canonicalQuat(values: number[]): number[] {
  const length = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
  let q = values.map((v) => v / length);
  for (const value of q) {
    if (Math.abs(value) > 1e-14) {
      if (value < 0) q = q.map((v) => -v);
      break;
    }
  }
  return q;
}

/** Port of `_rotation_to_quaternion` — Hamilton [qw, qx, qy, qz]. */
function rotationToQuat(m: M3): number[] {
  const trace = m[0][0] + m[1][1] + m[2][2];
  let values: number[];
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    values = [
      0.25 * s,
      (m[2][1] - m[1][2]) / s,
      (m[0][2] - m[2][0]) / s,
      (m[1][0] - m[0][1]) / s,
    ];
  } else if (m[0][0] >= m[1][1] && m[0][0] >= m[2][2]) {
    const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2;
    values = [
      (m[2][1] - m[1][2]) / s,
      0.25 * s,
      (m[0][1] + m[1][0]) / s,
      (m[0][2] + m[2][0]) / s,
    ];
  } else if (m[1][1] >= m[2][2]) {
    const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2;
    values = [
      (m[0][2] - m[2][0]) / s,
      (m[0][1] + m[1][0]) / s,
      0.25 * s,
      (m[1][2] + m[2][1]) / s,
    ];
  } else {
    const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2;
    values = [
      (m[1][0] - m[0][1]) / s,
      (m[0][2] + m[2][0]) / s,
      (m[1][2] + m[2][1]) / s,
      0.25 * s,
    ];
  }
  return canonicalQuat(values);
}

interface OraclePose {
  rotation: M3;
  translation: number[];
  qvec: number[];
}

/** `R = A · R_aᵀ`, `t = −R·c`. */
function arkitC2wToColmapW2c(cameraTransform: number[]): OraclePose {
  const arkitRotation: M3 = [
    [cameraTransform[0], cameraTransform[1], cameraTransform[2]],
    [cameraTransform[4], cameraTransform[5], cameraTransform[6]],
    [cameraTransform[8], cameraTransform[9], cameraTransform[10]],
  ];
  const center = [cameraTransform[3], cameraTransform[7], cameraTransform[11]];
  const rotation = matMul(A, transpose(arkitRotation));
  const translation = matVec(rotation, center).map((v) => -v);
  return { rotation, translation, qvec: rotationToQuat(rotation) };
}

/** Port of `refine_runner._camera_center` — `c = −Rᵀ·t`, i.e. what the
 *  artifact's `cameraCenterMeters` actually holds. Deliberately recovered from
 *  the COLMAP pose rather than copied off the input transform, so the test
 *  exercises the same round trip the publisher does. */
function colmapCameraCenter(pose: OraclePose): number[] {
  return matVec(transpose(pose.rotation), pose.translation).map((v) => -v);
}

// ════════════════════════════════════════════════════════════════════════════
// Seeded random rigid transforms
// ════════════════════════════════════════════════════════════════════════════

/** mulberry32 — deterministic, so a failure is reproducible from the seed. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A uniformly random rotation matrix, via a normalised random quaternion. */
function randomRotation(next: () => number): M3 {
  let q = [next() * 2 - 1, next() * 2 - 1, next() * 2 - 1, next() * 2 - 1];
  let n = Math.hypot(...q);
  while (n < 1e-6) {
    q = [next() * 2 - 1, next() * 2 - 1, next() * 2 - 1, next() * 2 - 1];
    n = Math.hypot(...q);
  }
  const [w, x, y, z] = q.map((v) => v / n);
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
}

/** A row-major 16-double ARKit camera transform with a real orthonormal basis. */
function randomArkitTransform(next: () => number): number[] {
  const r = randomRotation(next);
  const c = [next() * 12 - 6, next() * 3, next() * 12 - 6];
  return [
    r[0][0], r[0][1], r[0][2], c[0],
    r[1][0], r[1][1], r[1][2], c[1],
    r[2][0], r[2][1], r[2][2], c[2],
    0, 0, 0, 1,
  ];
}

// ── Provenances under test. ELENA is the parser's own output for
//    supabase/seed/fixtures/room-scans/elena-formal-dining.captured_room.json,
//    already pinned by photo-poses.test.ts.
const IDENTITY_PROV: PhotoProvenance = {
  originYawDeg: 0,
  originOffsetM: { x: 0, z: 0 },
};
const ELENA: PhotoProvenance = {
  originYawDeg: -15,
  originOffsetM: { x: 6.2374, z: -1.6416 },
};
const SKEWED: PhotoProvenance = {
  originYawDeg: 117.5,
  originOffsetM: { x: -3.75, z: 9.125 },
};
const PROVENANCES: Array<[string, PhotoProvenance]> = [
  ['identity', IDENTITY_PROV],
  ['Elena (θ=-15)', ELENA],
  ['skewed (θ=117.5)', SKEWED],
];

/** Smallest absolute difference between two headings, respecting the 0/360
 *  wrap — otherwise a true heading of ~0 compares 359.9999999 against 1e-13. */
function headingDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

function expectPosesEqual(actual: PhotoPlanPose, expected: PhotoPlanPose, tol: number) {
  expect(Math.abs(actual.x - expected.x)).toBeLessThan(tol);
  expect(Math.abs(actual.z - expected.z)).toBeLessThan(tol);
  expect(Math.abs(actual.y - expected.y)).toBeLessThan(tol);
  expect(headingDiff(actual.headingDeg, expected.headingDeg)).toBeLessThan(tol);
}

// ════════════════════════════════════════════════════════════════════════════
// (a) THE ROUND-TRIP IDENTITY — the test that matters
// ════════════════════════════════════════════════════════════════════════════

describe('round-trip identity: colmapPlanPose ≡ photoPlanPose', () => {
  const SAMPLES = 64;
  const TOL = 1e-9;

  it.each(PROVENANCES)(
    'agrees to 1e-9 over %s provenance for seeded random rigid transforms',
    (_label, provenance) => {
      const next = rng(0x5eed_1234);
      let compared = 0;

      for (let i = 0; i < SAMPLES; i++) {
        const transform = randomArkitTransform(next);
        const pose = arkitC2wToColmapW2c(transform);
        const center = colmapCameraCenter(pose);

        const viaArkit = photoPlanPose(transform, provenance);
        const viaColmap = colmapPlanPose(
          center,
          { qvecHamilton: pose.qvec },
          provenance,
        );

        expect(viaArkit).not.toBeNull();
        expect(viaColmap).not.toBeNull();
        expectPosesEqual(viaColmap as PhotoPlanPose, viaArkit as PhotoPlanPose, TOL);
        compared++;
      }

      // A guard against a vacuous pass: assert we actually compared samples.
      expect(compared).toBe(SAMPLES);
    },
  );

  it('agrees just as tightly when the ROTATION MATRIX is the orientation source', () => {
    const next = rng(0xc0ffee);
    for (let i = 0; i < 32; i++) {
      const transform = randomArkitTransform(next);
      const pose = arkitC2wToColmapW2c(transform);
      const viaArkit = photoPlanPose(transform, ELENA);
      const viaColmap = colmapPlanPose(
        colmapCameraCenter(pose),
        { rotation: pose.rotation },
        ELENA,
      );
      expectPosesEqual(viaColmap as PhotoPlanPose, viaArkit as PhotoPlanPose, 1e-9);
    }
  });

  it('the hand-verifiable anchor: identity camera at origin → heading 270°', () => {
    // qvec [0, √2/2, √2/2, 0] is the identity ARKit camera's COLMAP pose —
    // the value test_refine_adapter.py and photo-poses.test.ts:102-105 both pin.
    const root = Math.SQRT1_2;
    const pose = colmapPlanPose([0, 0, 0], { qvecHamilton: [0, root, root, 0] }, IDENTITY_PROV);
    expect(pose).not.toBeNull();
    expect(pose!.x).toBeCloseTo(0, 12);
    expect(pose!.z).toBeCloseTo(0, 12);
    expect(pose!.y).toBeCloseTo(0, 12);
    expect(pose!.headingDeg).toBeCloseTo(270, 9);
  });

  it('a DELIBERATELY WRONG conversion fails the same assertion', () => {
    // The suite's own smoke alarm: prove the identity test is not vacuous by
    // feeding it the third COLUMN instead of the third ROW and watching it
    // disagree. (0.5 rad-scale disagreement in the mutation study.)
    const next = rng(0xbad_bee);
    let disagreements = 0;
    for (let i = 0; i < 16; i++) {
      const transform = randomArkitTransform(next);
      const pose = arkitC2wToColmapW2c(transform);
      const wrongForward = [0, 1, 2].map((r) => pose.rotation[r][2]); // COLUMN
      const viaArkit = photoPlanPose(transform, ELENA)!;
      const wrongHeading =
        (((Math.atan2(wrongForward[2], wrongForward[0]) * 180) / Math.PI -
          ELENA.originYawDeg) %
          360 +
          360) %
        360;
      if (headingDiff(wrongHeading, viaArkit.headingDeg) > 1e-6) disagreements++;
    }
    expect(disagreements).toBeGreaterThan(12);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// (b) CROSS-LANGUAGE PIN
// ════════════════════════════════════════════════════════════════════════════

describe('cross-language pose-vector pin (generated by test_refine_adapter.py)', () => {
  it('freezes exactly the eight vectors the Python suite asserts', () => {
    expect(CROSS_LANGUAGE_POSE_VECTORS).toHaveLength(8);
  });

  it.each(CROSS_LANGUAGE_POSE_VECTORS.map((v) => [v.label, v] as const))(
    '%s — the pinned COLMAP pose plan-projects exactly where its ARKit transform does',
    (_label, vector) => {
      for (const [, provenance] of PROVENANCES) {
        const viaArkit = photoPlanPose(vector.cameraTransform, provenance);
        expect(viaArkit).not.toBeNull();

        const viaQuat = colmapPlanPose(
          vector.cameraCenterMeters,
          { qvecHamilton: vector.qvecHamilton },
          provenance,
        );
        const viaMatrix = colmapPlanPose(
          vector.cameraCenterMeters,
          { rotation: vector.rotation },
          provenance,
        );

        expectPosesEqual(viaQuat as PhotoPlanPose, viaArkit as PhotoPlanPose, 1e-9);
        expectPosesEqual(viaMatrix as PhotoPlanPose, viaArkit as PhotoPlanPose, 1e-9);
      }
    },
  );

  it.each(CROSS_LANGUAGE_POSE_VECTORS.map((v) => [v.label, v] as const))(
    '%s — the THIRD ROW is minus the ARKit rotation’s third column',
    (_label, vector) => {
      // The identity the whole conversion turns on, asserted directly:
      // an ARKit camera looks down its own −Z, so its world forward is
      // −(third column of R_a) — and that is the third ROW of cam_from_world.
      const arkitForward = [
        -vector.cameraTransform[2],
        -vector.cameraTransform[6],
        -vector.cameraTransform[10],
      ];
      const fromRotation = forwardFromW2cRotation(vector.rotation)!;
      const fromQuat = forwardFromW2cQuat(vector.qvecHamilton)!;
      for (let i = 0; i < 3; i++) {
        expect(fromRotation[i]).toBeCloseTo(arkitForward[i], 12);
        expect(fromQuat[i]).toBeCloseTo(arkitForward[i], 12);
      }
    },
  );
});

// ════════════════════════════════════════════════════════════════════════════
// Matrix ↔ quaternion agreement
// ════════════════════════════════════════════════════════════════════════════

describe('matrix ↔ quaternion agreement', () => {
  // The pipeline runs its own version of this guard at 5e-3 (the device's
  // rotations arrive orthonormal only to ~3.3e-7). The READ side sees values
  // that have already been through that guard, so it asserts far tighter.
  it('agrees to better than 1e-6 across a refined-poses-v1.json fixture', () => {
    const document = {
      schemaVersion: 1,
      frames: CROSS_LANGUAGE_POSE_VECTORS.map((v, i) => ({
        imageName: `keyframe_${String(i).padStart(6, '0')}.heic`,
        sourceImageName: `keyframe_${String(i).padStart(6, '0')}.heic`,
        engineImageName: `frame_${i}.ppm`,
        cameraCenterMeters: v.cameraCenterMeters,
        camFromWorld: {
          qvecHamilton: v.qvecHamilton,
          rotation: v.rotation,
          translation: [0, 0, 0],
        },
      })),
    };

    const rows = parseRefinedPoses(document);
    expect(rows).toHaveLength(8);

    for (const row of rows!) {
      const fromMatrix = forwardFromW2cRotation(row.rotation)!;
      const fromQuat = forwardFromW2cQuat(row.qvecHamilton)!;
      expect(fromMatrix).not.toBeNull();
      expect(fromQuat).not.toBeNull();
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(fromMatrix[i] - fromQuat[i])).toBeLessThan(1e-6);
      }
    }
  });

  it('an unnormalised quaternion still yields a unit forward vector', () => {
    const scaled = CROSS_LANGUAGE_POSE_VECTORS[5].qvecHamilton.map((v) => v * 7.3);
    const forward = forwardFromW2cQuat(scaled)!;
    expect(Math.hypot(...forward)).toBeCloseTo(1, 9);
  });

  it('q and −q describe the same forward direction', () => {
    for (const vector of CROSS_LANGUAGE_POSE_VECTORS) {
      const positive = forwardFromW2cQuat(vector.qvecHamilton)!;
      const negated = forwardFromW2cQuat(vector.qvecHamilton.map((v) => -v))!;
      for (let i = 0; i < 3; i++) expect(negated[i]).toBeCloseTo(positive[i], 12);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Algebraic properties of A — so a future "fix" to the constant fails first
// ════════════════════════════════════════════════════════════════════════════

describe('ARKIT_TO_RIGHT_ROTATED_COLMAP', () => {
  const M = ARKIT_TO_RIGHT_ROTATED_COLMAP.map((row) => [...row]);

  it('is involutive: A·A = I', () => {
    const product = matMul(M, M);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        expect(product[r][c]).toBeCloseTo(r === c ? 1 : 0, 12);
      }
    }
  });

  it('is symmetric: Aᵀ = A', () => {
    const t = transpose(M);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) expect(t[r][c]).toBeCloseTo(M[r][c], 12);
    }
  });

  it('is proper: det A = +1', () => {
    const det =
      M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
      M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
      M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    expect(det).toBeCloseTo(1, 12);
  });

  it('matches the pipeline constant value for value', () => {
    expect(M).toEqual([
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, -1],
    ]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Parsers — every malformed shape degrades, none throws
// ════════════════════════════════════════════════════════════════════════════

function poseFrame(overrides: Record<string, unknown> = {}) {
  return {
    imageName: 'keyframe_000001.heic',
    sourceImageName: 'keyframe_000001.heic',
    engineImageName: 'frame_1.ppm',
    cameraCenterMeters: [1, 1.5, 2],
    camFromWorld: {
      qvecHamilton: [0, Math.SQRT1_2, Math.SQRT1_2, 0],
      rotation: [
        [0, 1, 0],
        [1, 0, 0],
        [0, 0, -1],
      ],
      translation: [0, 0, 0],
    },
    ...overrides,
  };
}

function deltaFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    imageName: 'keyframe_000001.heic',
    sourceImageName: 'keyframe_000001.heic',
    engineImageName: 'frame_1.ppm',
    rawCameraCenterMeters: [1, 1.5, 2],
    alignedCameraCenterMeters: [1.02, 1.51, 2.03],
    cameraCenterDeltaMeters: [0.02, 0.01, 0.03],
    rawQvecHamilton: [0, Math.SQRT1_2, Math.SQRT1_2, 0],
    alignedQvecHamilton: [0, Math.SQRT1_2, Math.SQRT1_2, 0],
    ...overrides,
  };
}

describe('parsers — malformed documents return null, malformed rows drop', () => {
  const BAD_DOCUMENTS: Array<[string, unknown]> = [
    ['null', null],
    ['undefined', undefined],
    ['a string', 'nope'],
    ['a number', 7],
    ['an array', [{ imageName: 'a' }]],
    ['empty object', {}],
    ['schemaVersion 2', { schemaVersion: 2, frames: [] }],
    ['schemaVersion "1" (string)', { schemaVersion: '1', frames: [] }],
    ['no frames key', { schemaVersion: 1 }],
    ['frames not an array', { schemaVersion: 1, frames: { 0: {} } }],
  ];

  it.each(BAD_DOCUMENTS)('parseRefinedPoses(%s) → null, no throw', (_l, doc) => {
    let result: unknown;
    expect(() => {
      result = parseRefinedPoses(doc);
    }).not.toThrow();
    expect(result).toBeNull();
  });

  it.each(BAD_DOCUMENTS)('parsePoseDeltas(%s) → null, no throw', (_l, doc) => {
    let result: unknown;
    expect(() => {
      result = parsePoseDeltas(doc);
    }).not.toThrow();
    expect(result).toBeNull();
  });

  it.each([
    ['null', null],
    ['a string', 'nope'],
    ['schemaVersion 2', { schemaVersion: 2, refinementEvidenced: true, absoluteAccuracyCertified: false }],
    ['non-boolean verdict', { schemaVersion: 1, refinementEvidenced: 'yes', absoluteAccuracyCertified: false }],
    ['missing certification flag', { schemaVersion: 1, refinementEvidenced: true }],
  ])('parseRefinementEvidence(%s) → null, no throw', (_l, doc) => {
    let result: unknown;
    expect(() => {
      result = parseRefinementEvidence(doc);
    }).not.toThrow();
    expect(result).toBeNull();
  });

  it.each([
    ['missing imageName', poseFrame({ imageName: null, sourceImageName: null })],
    ['centre of length 2', poseFrame({ cameraCenterMeters: [1, 2] })],
    ['centre with NaN', poseFrame({ cameraCenterMeters: [1, NaN, 2] })],
    ['centre with Infinity', poseFrame({ cameraCenterMeters: [1, 2, Infinity] })],
    ['no camFromWorld', poseFrame({ camFromWorld: null })],
    ['quaternion of length 3', poseFrame({ camFromWorld: { qvecHamilton: [1, 0, 0] } })],
    ['row is not an object', 'not-a-row'],
  ])('parseRefinedPoses drops a row with %s', (_l, frame) => {
    const rows = parseRefinedPoses({ schemaVersion: 1, frames: [frame, poseFrame()] });
    expect(rows).toHaveLength(1);
    expect(rows![0].imageName).toBe('keyframe_000001.heic');
  });

  it('parseRefinedPoses keeps a row whose rotation is absent (quaternion is the authority)', () => {
    const rows = parseRefinedPoses({
      schemaVersion: 1,
      frames: [poseFrame({ camFromWorld: { qvecHamilton: [0, Math.SQRT1_2, Math.SQRT1_2, 0] } })],
    });
    expect(rows).toHaveLength(1);
    expect(rows![0].rotation).toBeNull();
  });

  it.each([
    ['missing aligned centre', deltaFrame({ alignedCameraCenterMeters: undefined })],
    ['missing raw quaternion', deltaFrame({ rawQvecHamilton: null })],
    ['raw centre with NaN', deltaFrame({ rawCameraCenterMeters: [NaN, 0, 0] })],
    ['aligned quaternion of length 3', deltaFrame({ alignedQvecHamilton: [1, 0, 0] })],
  ])('parsePoseDeltas drops a row with %s', (_l, frame) => {
    const rows = parsePoseDeltas({ schemaVersion: 1, frames: [frame, deltaFrame()] });
    expect(rows).toHaveLength(1);
  });

  it('parsePoseDeltas derives the delta when the published key is malformed', () => {
    const rows = parsePoseDeltas({
      schemaVersion: 1,
      frames: [deltaFrame({ cameraCenterDeltaMeters: 'nope' })],
    });
    expect(rows).toHaveLength(1);
    expect(rows![0].cameraCenterDeltaMeters[0]).toBeCloseTo(0.02, 9);
    expect(rows![0].cameraCenterDeltaMeters[2]).toBeCloseTo(0.03, 9);
  });

  it('a well-formed document with every row malformed yields [] (not null)', () => {
    expect(parseRefinedPoses({ schemaVersion: 1, frames: [{}, 3, null] })).toEqual([]);
    expect(parsePoseDeltas({ schemaVersion: 1, frames: [{}, 3, null] })).toEqual([]);
  });

  it('parseRefinementEvidence reads the verdict block and the advisory verbatim', () => {
    const advisory =
      'advisory_not_gating_r123: loop_rotation_rmse_deg 1.250000->1.310000 (+4.80%); ' +
      'loop_translation_direction_rmse_deg 2.000000->1.900000 (-5.00%); verified_loop_edges 31';
    const parsed = parseRefinementEvidence({
      schemaVersion: 1,
      refinementEvidenced: true,
      absoluteAccuracyCertified: false,
      verdictCode: 'REFINEMENT_EVIDENCED',
      verdictReason: 'reprojection improved and loop evidence held',
      loopConsistencyAdvisory: advisory,
      registeredImagesBefore: 98,
      registeredImagesAfter: 100,
      reprojectionRmsePxBefore: 1.4,
      reprojectionRmsePxAfter: 0.9,
    });
    expect(parsed).not.toBeNull();
    // Verbatim — character for character. refine_adapter.py:1116 is explicit:
    // "Nothing reads this string; it exists to be read."
    expect(parsed!.loopConsistencyAdvisory).toBe(advisory);
    expect(parsed!.refinementEvidenced).toBe(true);
    expect(parsed!.absoluteAccuracyCertified).toBe(false);
    expect(parsed!.reprojectionRmsePxAfter).toBe(0.9);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// colmapPlanPose — degradation
// ════════════════════════════════════════════════════════════════════════════

describe('colmapPlanPose — malformed input returns null, never throws', () => {
  const Q = [0, Math.SQRT1_2, Math.SQRT1_2, 0];

  it.each([
    ['centre null', null, { qvecHamilton: Q }, ELENA],
    ['centre length 2', [1, 2], { qvecHamilton: Q }, ELENA],
    ['centre with NaN', [1, NaN, 3], { qvecHamilton: Q }, ELENA],
    ['centre with Infinity', [1, 2, -Infinity], { qvecHamilton: Q }, ELENA],
    ['centre a string', '1,2,3', { qvecHamilton: Q }, ELENA],
    ['orientation null', [0, 0, 0], null, ELENA],
    ['quaternion length 3', [0, 0, 0], { qvecHamilton: [1, 0, 0] }, ELENA],
    ['quaternion all zero', [0, 0, 0], { qvecHamilton: [0, 0, 0, 0] }, ELENA],
    ['quaternion with NaN', [0, 0, 0], { qvecHamilton: [NaN, 1, 0, 0] }, ELENA],
    ['rotation 2×3', [0, 0, 0], { rotation: [[1, 0, 0], [0, 1, 0]] }, ELENA],
    ['provenance null', [0, 0, 0], { qvecHamilton: Q }, null],
    ['provenance yaw NaN', [0, 0, 0], { qvecHamilton: Q }, { originYawDeg: NaN, originOffsetM: { x: 0, z: 0 } }],
    ['provenance offset missing', [0, 0, 0], { qvecHamilton: Q }, { originYawDeg: 0 }],
  ])('%s → null', (_l, center, orientation, provenance) => {
    let result: unknown;
    expect(() => {
      result = colmapPlanPose(center, orientation, provenance as PhotoProvenance);
    }).not.toThrow();
    expect(result).toBeNull();
  });

  it('a camera pointing straight down has no plan heading → null (not a fabricated 0°)', () => {
    // cam_from_world whose third row is (0, ±1, 0): the optical axis is
    // vertical, so its XZ projection is degenerate.
    const straightDown = [
      [1, 0, 0],
      [0, 0, 1],
      [0, 1, 0],
    ];
    expect(colmapPlanPose([0, 2, 0], { rotation: straightDown }, ELENA)).toBeNull();
  });

  it('falls back to the quaternion when the rotation matrix is unusable', () => {
    const vector = CROSS_LANGUAGE_POSE_VECTORS[2];
    const pose = colmapPlanPose(
      vector.cameraCenterMeters,
      { rotation: 'garbage', qvecHamilton: vector.qvecHamilton },
      ELENA,
    );
    const expected = photoPlanPose(vector.cameraTransform, ELENA)!;
    expectPosesEqual(pose as PhotoPlanPose, expected, 1e-9);
  });

  it('accepts a bare quaternion array as the orientation', () => {
    const vector = CROSS_LANGUAGE_POSE_VECTORS[3];
    const pose = colmapPlanPose(vector.cameraCenterMeters, vector.qvecHamilton, ELENA);
    const expected = photoPlanPose(vector.cameraTransform, ELENA)!;
    expectPosesEqual(pose as PhotoPlanPose, expected, 1e-9);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// buildCameraPath — §3.3's degradation ladder, one case per rung
// ════════════════════════════════════════════════════════════════════════════

function deltaRows(count: number, drift = 0.02): PoseDeltaFrame[] {
  const parsed = parsePoseDeltas({
    schemaVersion: 1,
    frames: Array.from({ length: count }, (_, i) =>
      deltaFrame({
        imageName: `keyframe_${String(i).padStart(6, '0')}.heic`,
        rawCameraCenterMeters: [i * 0.4, 1.5, 0],
        alignedCameraCenterMeters: [i * 0.4 + drift, 1.5, drift],
        cameraCenterDeltaMeters: [drift, 0, drift],
      }),
    ),
  });
  return parsed!;
}

describe('buildCameraPath — the degradation ladder (§3.3)', () => {
  const rows = deltaRows(6);

  it.each([
    ['frames null', null, ELENA, { refinementEvidenced: true }],
    ['frames undefined', undefined, ELENA, { refinementEvidenced: true }],
    ['frames empty', [], ELENA, { refinementEvidenced: true }],
    ['provenance null', rows, null, { refinementEvidenced: true }],
    ['provenance undefined', rows, undefined, { refinementEvidenced: true }],
    ['provenance malformed', rows, { originYawDeg: NaN, originOffsetM: { x: 0, z: 0 } }, { refinementEvidenced: true }],
    ['one usable frame', deltaRows(1), ELENA, { refinementEvidenced: true }],
  ])('%s → null, nothing rendered, nothing thrown', (_l, frames, provenance, options) => {
    let result: unknown;
    expect(() => {
      result = buildCameraPath(
        frames as PoseDeltaFrame[] | null,
        provenance as PhotoProvenance | null,
        options,
      );
    }).not.toThrow();
    expect(result).toBeNull();
  });

  it('every frame unprojectable → null (fewer than 2 points survive)', () => {
    const broken = rows.map((r) => ({
      ...r,
      rawQvecHamilton: [0, 0, 0, 0] as [number, number, number, number],
      alignedQvecHamilton: [0, 0, 0, 0] as [number, number, number, number],
    }));
    expect(buildCameraPath(broken, ELENA, { refinementEvidenced: true })).toBeNull();
  });

  it('refinementEvidenced=false ⇒ NOTHING is drawn from a refined pose', () => {
    const path = buildCameraPath(rows, ELENA, { refinementEvidenced: false })!;
    expect(path.points.every((p) => p.source === 'captured')).toBe(true);
    expect(path.source).toBe('captured');
  });

  it('the verdict defaults to false — a caller that forgets it gets the honest answer', () => {
    const path = buildCameraPath(rows, ELENA)!;
    expect(path.source).toBe('captured');
  });

  it('refinementEvidenced=true ⇒ every point refined, path labelled refined', () => {
    const path = buildCameraPath(rows, ELENA, { refinementEvidenced: true })!;
    expect(path.points.every((p) => p.source === 'refined')).toBe(true);
    expect(path.source).toBe('refined');
    expect(path.droppedCount).toBe(0);
    expect(path.frameCount).toBe(6);
    expect(path.usableCount).toBe(6);
  });

  it('a MIXED path is labelled `captured` — 90% refined is not a refined path', () => {
    const mixed = rows.map((row, i) =>
      i === 3
        ? { ...row, alignedQvecHamilton: [0, 0, 0, 0] as [number, number, number, number] }
        : row,
    );
    const path = buildCameraPath(mixed, ELENA, { refinementEvidenced: true })!;
    expect(path.points.filter((p) => p.source === 'refined')).toHaveLength(5);
    expect(path.points.filter((p) => p.source === 'captured')).toHaveLength(1);
    expect(path.source).toBe('captured');
    expect(path.droppedCount).toBe(0);
  });

  it('a frame usable in NEITHER lane is dropped and counted', () => {
    const zero: [number, number, number, number] = [0, 0, 0, 0];
    const withBroken = rows.map((row, i) =>
      i === 2 ? { ...row, rawQvecHamilton: zero, alignedQvecHamilton: zero } : row,
    );
    const path = buildCameraPath(withBroken, ELENA, { refinementEvidenced: true })!;
    expect(path.droppedCount).toBe(1);
    expect(path.usableCount).toBe(5);
    expect(path.points).toHaveLength(5);
  });

  it('the path lands in the SAME plan frame as photoPlanPose', () => {
    const path = buildCameraPath(rows, ELENA, { refinementEvidenced: true })!;
    // The first frame's aligned centre, projected the ARKit way for comparison.
    const c = rows[0].alignedCameraCenterMeters;
    const asArkit = photoPlanPose(
      [1, 0, 0, c[0], 0, 1, 0, c[1], 0, 0, 1, c[2], 0, 0, 0, 1],
      ELENA,
    )!;
    expect(path.points[0].x).toBeCloseTo(asArkit.x, 9);
    expect(path.points[0].z).toBeCloseTo(asArkit.z, 9);
    expect(path.points[0].y).toBeCloseTo(asArkit.y, 9);
  });
});

describe('buildCameraPath — decimation', () => {
  it('leaves a path that already fits untouched', () => {
    const path = buildCameraPath(deltaRows(120), ELENA, { refinementEvidenced: true })!;
    expect(path.points).toHaveLength(120);
    expect(path.decimated).toBe(false);
  });

  it('caps at 400 points and preserves BOTH endpoints', () => {
    const rows = deltaRows(1500);
    const path = buildCameraPath(rows, ELENA, { refinementEvidenced: true })!;
    expect(path.points).toHaveLength(CAMERA_PATH_MAX_POINTS);
    expect(path.decimated).toBe(true);
    expect(path.usableCount).toBe(1500);
    expect(path.points[0].imageName).toBe(rows[0].imageName);
    expect(path.points[path.points.length - 1].imageName).toBe(
      rows[rows.length - 1].imageName,
    );
  });

  it('honours a caller-supplied cap, endpoints still preserved', () => {
    const rows = deltaRows(97);
    const path = buildCameraPath(rows, ELENA, {
      refinementEvidenced: true,
      maxPoints: 10,
    })!;
    expect(path.points).toHaveLength(10);
    expect(path.points[0].imageName).toBe(rows[0].imageName);
    expect(path.points[9].imageName).toBe(rows[96].imageName);
  });

  it('decimation preserves monotone order (it samples, it does not reorder)', () => {
    const path = buildCameraPath(deltaRows(1000), ELENA, {
      refinementEvidenced: true,
    })!;
    for (let i = 1; i < path.points.length; i++) {
      expect(path.points[i].x).toBeGreaterThanOrEqual(path.points[i - 1].x - 1e-9);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// poseDriftStats
// ════════════════════════════════════════════════════════════════════════════

describe('poseDriftStats', () => {
  function frames(magnitudes: number[]): PoseDeltaFrame[] {
    return parsePoseDeltas({
      schemaVersion: 1,
      frames: magnitudes.map((m, i) =>
        deltaFrame({
          imageName: `k${i}.heic`,
          cameraCenterDeltaMeters: [m, 0, 0],
        }),
      ),
    })!;
  }

  it('reports max and median over an odd sample', () => {
    const stats = poseDriftStats(frames([0.01, 0.05, 0.02]))!;
    expect(stats.maxM).toBeCloseTo(0.05, 12);
    expect(stats.medianM).toBeCloseTo(0.02, 12);
    expect(stats.sampleCount).toBe(3);
  });

  it('averages the two middles over an even sample', () => {
    const stats = poseDriftStats(frames([0.04, 0.01, 0.03, 0.02]))!;
    expect(stats.medianM).toBeCloseTo(0.025, 12);
    expect(stats.maxM).toBeCloseTo(0.04, 12);
  });

  it('is a magnitude, so sign never cancels', () => {
    const stats = poseDriftStats(frames([-0.06, 0.06]))!;
    expect(stats.maxM).toBeCloseTo(0.06, 12);
    expect(stats.medianM).toBeCloseTo(0.06, 12);
  });

  it('uses all three components', () => {
    const rows = parsePoseDeltas({
      schemaVersion: 1,
      frames: [deltaFrame({ cameraCenterDeltaMeters: [3, 4, 12] })],
    })!;
    expect(poseDriftStats(rows)!.maxM).toBeCloseTo(13, 12);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', []],
  ])('%s → null, no throw', (_l, rows) => {
    let result: unknown;
    expect(() => {
      result = poseDriftStats(rows as PoseDeltaFrame[] | null);
    }).not.toThrow();
    expect(result).toBeNull();
  });
});
