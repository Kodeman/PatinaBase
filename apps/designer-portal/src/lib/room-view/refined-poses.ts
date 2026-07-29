/**
 * Room View — Refine's refined camera poses, read into the plan frame
 * (Field Capture P2, Layer 3).
 *
 * Pure math + parsing. No React, no IO, no DOM. **Nothing here throws** —
 * every malformed input degrades to `null`/`[]` and a count, exactly as
 * `photoPlanPose` does, because this whole lane is optional decoration over a
 * drawing that must keep rendering without it.
 *
 * ─── WHAT THIS READS, AND WHAT IT EMPHATICALLY DOES NOT ─────────────────────
 *
 * Refine (services/scan-pipeline) refines Field **SfM keyframes** — the
 * accuracy lane: HEIC + depth, motion-triggered, sharpness-gated. The Room
 * View's photo markers come from `room_scan_images` — the **context photo**
 * lane: JPEG, 60-cap, 2 s interval. The iOS producer states the relationship
 * in the imperative (`FieldKeyframeRecorder.swift:10-13`): *"They share
 * nothing and never merge."* There is no keyframe table; the lane exists only
 * as files in the capture bundle, so no identifier joins the two sets.
 *
 * Therefore this module **never touches `buildPhotoMarkers` or
 * `photoPlanPose`'s behaviour.** It does not correct, re-pose, interpolate or
 * annotate a single context photo. It reads a second, separately-labelled set
 * of poses and reports what they say.
 *
 * ─── THE CONVERSION — the part that must not be guessed ─────────────────────
 *
 * Refine publishes `cam_from_world` (COLMAP world-to-camera). ARKit stores
 * `camera_transform` (camera-to-world, row-major). The pipeline's converter is
 * `refine_adapter.arkit_c2w_to_colmap_w2c`:
 *
 *     R = A · R_aᵀ,   t = −R · c
 *
 * with `A = ARKIT_TO_RIGHT_ROTATED_COLMAP = ((0,1,0),(1,0,0),(0,0,−1))`, which
 * is symmetric (`Aᵀ = A`), involutive (`A·A = I`) and proper (`det A = +1`) —
 * it is the 180° rotation about `(1,1,0)/√2`. So `R_a = Rᵀ·A`, and since an
 * ARKit camera looks down its own −Z:
 *
 *     forward_world = R_a·(0,0,−1) = −Rᵀ·A·e₃ = −Rᵀ·(0,0,−1) = Rᵀ·e₃
 *
 * **`Rᵀ·e₃` is the THIRD ROW of `R`.** `refine_adapter.optical_axis()` states
 * the same identity from the COLMAP side ("the direction it points in world
 * coordinates is `R^T e_z` — the third ROW of R") and calls it the one
 * quantity three independent derivations of the candidate graph must agree on.
 *
 * The 90° raster rotation baked into `A` does not corrupt the axis because `A`
 * permutes only the two axes orthogonal to the optical axis, leaving the axis
 * itself fixed.
 *
 * The camera CENTRE needs no such care: Refine publishes it directly, already
 * sim3-aligned back into the ARKit world frame, as `cameraCenterMeters` /
 * `alignedCameraCenterMeters` (`refine_runner._camera_center` round-trips
 * through `colmap_w2c_to_arkit_c2w` before writing it).
 *
 * A transposed rotation, a column-instead-of-row read, a dropped `A`, or a
 * sign error each produce a *plausible but wrong* heading. `__tests__/
 * refined-poses.test.ts` therefore does not restate this algebra — it ports
 * the Python oracle and asserts `colmapPlanPose ≡ photoPlanPose` over seeded
 * random rigid transforms, and pins ~8 canonical vectors emitted by the Python
 * suite itself.
 */

import {
  isValidProvenance,
  planPoseFromWorld,
  type PhotoPlanPose,
  type PhotoProvenance,
} from './photo-poses';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `refine_adapter.ARKIT_TO_RIGHT_ROTATED_COLMAP`, row-major.
 *
 * Carried here so the algebraic properties the conversion depends on
 * (`A·A = I`, `Aᵀ = A`, `det A = +1`) can be asserted on the read side — a
 * future "fix" to the constant then fails loudly and first. Nothing in this
 * module multiplies by it: the third-ROW identity is what `A` *implies*, and
 * reading the row is both cheaper and the same quantity the pipeline reads.
 */
export const ARKIT_TO_RIGHT_ROTATED_COLMAP: readonly (readonly number[])[] = [
  [0, 1, 0],
  [1, 0, 0],
  [0, 0, -1],
] as const;

/** Artifact names this module can parse (`refine_runner`'s runner artifacts). */
export const REFINED_POSES_ARTIFACT = 'refined-poses-v1.json';
export const POSE_DELTAS_ARTIFACT = 'pose-deltas-v1.json';
export const REFINEMENT_EVIDENCE_ARTIFACT = 'refinement-evidence-v1.json';

/** Uniform-decimation ceiling for a rendered/summarised path. */
export const CAMERA_PATH_MAX_POINTS = 400;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES — shaped to `refine_runner._pose_documents` / `_evidence_document`
// ═══════════════════════════════════════════════════════════════════════════

export type Vec3 = [number, number, number];
/** Hamilton order — `[qw, qx, qy, qz]`, as `ColmapPose.qvec` publishes it. */
export type QuatHamilton = [number, number, number, number];
export type Mat3 = [Vec3, Vec3, Vec3];

/** One row of `refined-poses-v1.json`. */
export interface RefinedPoseFrame {
  imageName: string;
  /** Sim3-aligned camera centre, ARKit world metres. */
  cameraCenterMeters: Vec3;
  /** `camFromWorld.qvecHamilton`. */
  qvecHamilton: QuatHamilton;
  /** `camFromWorld.rotation` — null when absent or malformed (the quaternion
   *  is the authority; the matrix exists to cross-check it). */
  rotation: Mat3 | null;
}

/** One row of `pose-deltas-v1.json`. Carries BOTH lanes, so prefer-refined
 *  with fallback-to-captured is a per-frame branch inside ONE document — no
 *  cross-artifact join. */
export interface PoseDeltaFrame {
  imageName: string;
  rawCameraCenterMeters: Vec3;
  alignedCameraCenterMeters: Vec3;
  cameraCenterDeltaMeters: Vec3;
  rawQvecHamilton: QuatHamilton;
  alignedQvecHamilton: QuatHamilton;
}

/** The subset of `refinement-evidence-v1.json` this lane reads. */
export interface RefinementEvidenceDocument {
  refinementEvidenced: boolean;
  /**
   * ⚠ ALWAYS `false` in practice — `evaluate_refinement_evidence` never sets
   * it true. Treat `true` as unreachable; the readout renders the
   * not-certified treatment either way.
   */
  absoluteAccuracyCertified: boolean;
  verdictCode: string | null;
  verdictReason: string | null;
  /** R123's advisory. Rendered VERBATIM or not at all — never paraphrased. */
  loopConsistencyAdvisory: string | null;
  registeredImagesBefore: number | null;
  registeredImagesAfter: number | null;
  reprojectionRmsePxBefore: number | null;
  reprojectionRmsePxAfter: number | null;
}

/** One point of a camera path, in the plan frame. Same shape as a photo pose. */
export interface CameraPathPoint extends PhotoPlanPose {
  imageName: string;
  /** Which lane THIS point came from. */
  source: 'refined' | 'captured';
}

export interface CameraPath {
  points: CameraPathPoint[];
  /**
   * `'refined'` ONLY when every retained point came from a refined pose.
   * A path that is 90% refined is not a refined path (§3.3) — calling it one
   * is the quiet overclaim R123's advisory exists to prevent.
   */
  source: 'refined' | 'captured';
  /** Frames present in the parsed document. */
  frameCount: number;
  /** Frames that yielded a usable plan pose (pre-decimation). */
  usableCount: number;
  /** Frames whose pose could not be projected at all. */
  droppedCount: number;
  /** True when uniform decimation reduced `usableCount` to `points.length`. */
  decimated: boolean;
}

/** Camera-centre correction magnitudes, metres. */
export interface PoseDriftStats {
  maxM: number;
  medianM: number;
  /** Frames that contributed a finite magnitude. */
  sampleCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// GUARDS — every one of them total; none throws
// ═══════════════════════════════════════════════════════════════════════════

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readVec(value: unknown, length: 3): Vec3 | null;
function readVec(value: unknown, length: 4): QuatHamilton | null;
function readVec(value: unknown, length: number): number[] | null {
  if (!Array.isArray(value) || value.length !== length) return null;
  for (const component of value) {
    if (!isFiniteNumber(component)) return null;
  }
  return value as number[];
}

function readMat3(value: unknown): Mat3 | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const rows: Vec3[] = [];
  for (const row of value) {
    const parsed = readVec(row, 3);
    if (!parsed) return null;
    rows.push(parsed);
  }
  return rows as Mat3;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNullableNumber(value: unknown): number | null {
  return isFiniteNumber(value) ? value : null;
}

/** `schemaVersion === 1` and a `frames` array — the shared preamble of both
 *  pose documents. Anything else is refused (§3.3: `schemaVersion ≠ 1` is a
 *  degradation rung, not a best-effort parse). */
function readFrames(document: unknown): unknown[] | null {
  if (!isRecord(document)) return null;
  if (document.schemaVersion !== 1) return null;
  if (!Array.isArray(document.frames)) return null;
  return document.frames;
}

// ═══════════════════════════════════════════════════════════════════════════
// PARSERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `refined-poses-v1.json` → rows. Returns `null` when the document itself is
 * unusable (not an object, wrong `schemaVersion`, no `frames` array); returns
 * `[]` when the document is well-formed but every row was malformed. A single
 * malformed row is dropped, never fatal.
 */
export function parseRefinedPoses(document: unknown): RefinedPoseFrame[] | null {
  const frames = readFrames(document);
  if (!frames) return null;

  const rows: RefinedPoseFrame[] = [];
  for (const raw of frames) {
    if (!isRecord(raw)) continue;
    const imageName = readString(raw.imageName) ?? readString(raw.sourceImageName);
    const center = readVec(raw.cameraCenterMeters, 3);
    const camFromWorld = isRecord(raw.camFromWorld) ? raw.camFromWorld : null;
    const qvec = camFromWorld ? readVec(camFromWorld.qvecHamilton, 4) : null;
    if (!imageName || !center || !qvec) continue;
    rows.push({
      imageName,
      cameraCenterMeters: center,
      qvecHamilton: qvec,
      rotation: camFromWorld ? readMat3(camFromWorld.rotation) : null,
    });
  }
  return rows;
}

/**
 * `pose-deltas-v1.json` → rows. Same contract as `parseRefinedPoses`.
 *
 * A row must carry BOTH lanes to be usable: the whole point of this document
 * is that prefer-refined-fall-back-to-captured is decidable per frame without
 * reaching for a second artifact.
 */
export function parsePoseDeltas(document: unknown): PoseDeltaFrame[] | null {
  const frames = readFrames(document);
  if (!frames) return null;

  const rows: PoseDeltaFrame[] = [];
  for (const raw of frames) {
    if (!isRecord(raw)) continue;
    const imageName = readString(raw.imageName) ?? readString(raw.sourceImageName);
    const rawCenter = readVec(raw.rawCameraCenterMeters, 3);
    const alignedCenter = readVec(raw.alignedCameraCenterMeters, 3);
    const rawQvec = readVec(raw.rawQvecHamilton, 4);
    const alignedQvec = readVec(raw.alignedQvecHamilton, 4);
    if (!imageName || !rawCenter || !alignedCenter || !rawQvec || !alignedQvec) {
      continue;
    }
    // The published delta is authoritative when present; otherwise derive it,
    // so a row is not lost over a key the producer may reasonably reshape.
    const delta =
      readVec(raw.cameraCenterDeltaMeters, 3) ??
      ([
        alignedCenter[0] - rawCenter[0],
        alignedCenter[1] - rawCenter[1],
        alignedCenter[2] - rawCenter[2],
      ] as Vec3);
    rows.push({
      imageName,
      rawCameraCenterMeters: rawCenter,
      alignedCameraCenterMeters: alignedCenter,
      cameraCenterDeltaMeters: delta,
      rawQvecHamilton: rawQvec,
      alignedQvecHamilton: alignedQvec,
    });
  }
  return rows;
}

/**
 * `refinement-evidence-v1.json` → the subset the readout renders. `null` when
 * the document is not an object, `schemaVersion ≠ 1`, or the two verdict
 * booleans are not booleans — a verdict that cannot be read is not a verdict.
 */
export function parseRefinementEvidence(
  document: unknown,
): RefinementEvidenceDocument | null {
  if (!isRecord(document)) return null;
  if (document.schemaVersion !== 1) return null;
  if (
    typeof document.refinementEvidenced !== 'boolean' ||
    typeof document.absoluteAccuracyCertified !== 'boolean'
  ) {
    return null;
  }
  return {
    refinementEvidenced: document.refinementEvidenced,
    absoluteAccuracyCertified: document.absoluteAccuracyCertified,
    verdictCode: readString(document.verdictCode),
    verdictReason: readString(document.verdictReason),
    loopConsistencyAdvisory: readString(document.loopConsistencyAdvisory),
    registeredImagesBefore: readNullableNumber(document.registeredImagesBefore),
    registeredImagesAfter: readNullableNumber(document.registeredImagesAfter),
    reprojectionRmsePxBefore: readNullableNumber(document.reprojectionRmsePxBefore),
    reprojectionRmsePxAfter: readNullableNumber(document.reprojectionRmsePxAfter),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// THE CONVERSION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * World-space forward direction of a COLMAP `cam_from_world` ROTATION MATRIX:
 * its **third row**, normalised. See this module's header for the derivation
 * and `refine_adapter.optical_axis()` for the same identity stated from the
 * COLMAP side (which also explains the normalisation — the device's rotations
 * arrive orthonormal only to ~3.3e-7).
 *
 * `null` when the row carries no usable direction. Never throws.
 */
export function forwardFromW2cRotation(rotation: unknown): Vec3 | null {
  const matrix = readMat3(rotation);
  if (!matrix) return null;
  const [ax, ay, az] = matrix[2];
  const norm = Math.sqrt(ax * ax + ay * ay + az * az);
  if (!Number.isFinite(norm) || norm <= 1e-9) return null;
  return [ax / norm, ay / norm, az / norm];
}

/**
 * The same world-space forward direction, from the Hamilton quaternion
 * `[qw, qx, qy, qz]` — which is what `pose-deltas-v1.json` publishes (it
 * carries no rotation matrices at all).
 *
 * This is literally the third row of `_quaternion_to_rotation(q)`:
 *
 *     forward = ( 2(qx·qz − qy·qw), 2(qy·qz + qx·qw), 1 − 2(qx² + qy²) )
 *
 * The quaternion is normalised first, matching `_canonical_quaternion`; the
 * sign convention does not matter, since `q` and `−q` are the same rotation
 * and every term above is quadratic.
 *
 * `null` for a non-quaternion or a zero quaternion. Never throws.
 */
export function forwardFromW2cQuat(qvecHamilton: unknown): Vec3 | null {
  const q = readVec(qvecHamilton, 4);
  if (!q) return null;
  const length = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
  if (!Number.isFinite(length) || length <= 1e-12) return null;
  const w = q[0] / length;
  const x = q[1] / length;
  const y = q[2] / length;
  const z = q[3] / length;
  return [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
}

/**
 * One refined camera pose → the SAME `PhotoPlanPose` shape, in the SAME plan
 * frame, as `photoPlanPose` produces for a context photo.
 *
 * `cameraCenterMeters` is already ARKit-world metres (Refine sim3-aligns
 * before publishing). The heading comes from the third-row identity above.
 * Prefers the rotation matrix when one is supplied and usable, since that is
 * the quantity the pipeline itself reads; falls back to the quaternion, which
 * is all `pose-deltas-v1.json` carries. The two agree to ~1e-15 (asserted).
 *
 * `null` (never a throw) for a malformed centre, an unusable orientation, a
 * malformed provenance, or a camera pointing straight up/down — a forward with
 * no XZ extent has no plan heading, and inventing 0° would be a fabrication.
 */
export function colmapPlanPose(
  cameraCenterMeters: unknown,
  orientation: { qvecHamilton?: unknown; rotation?: unknown } | unknown,
  provenance: PhotoProvenance,
): PhotoPlanPose | null {
  if (!isValidProvenance(provenance)) return null;

  const center = readVec(cameraCenterMeters, 3);
  if (!center) return null;

  // `orientation` accepts either the {qvecHamilton, rotation} bag or a bare
  // quaternion array, so callers holding only a quaternion need no wrapper.
  const bag = isRecord(orientation) ? orientation : { qvecHamilton: orientation };
  const forward =
    forwardFromW2cRotation(bag.rotation) ?? forwardFromW2cQuat(bag.qvecHamilton);
  if (!forward) return null;

  // A plan heading needs SOME extent in the XZ plane. 1e-9 is far below any
  // real camera tilt and far above float noise in a normalised row.
  if (Math.hypot(forward[0], forward[2]) <= 1e-9) return null;

  return planPoseFromWorld(
    { x: center[0], y: center[1], z: center[2] },
    { x: forward[0], z: forward[2] },
    provenance,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PATH + DRIFT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Uniform decimation to at most `maxPoints`, ALWAYS preserving the first and
 * last element. Returns the input unchanged when it already fits.
 */
function decimate<T>(items: T[], maxPoints: number): T[] {
  if (maxPoints < 2 || items.length <= maxPoints) return items;
  const out: T[] = [];
  const last = items.length - 1;
  for (let i = 0; i < maxPoints; i++) {
    out.push(items[Math.round((i * last) / (maxPoints - 1))]);
  }
  return out;
}

export interface BuildCameraPathOptions {
  /**
   * §3.3's first ruling: a run that failed its own evidence test must not
   * decorate anything with a refined pose. `false` forces every point to the
   * captured lane. Defaults to `false` — fail-closed, so a caller that forgets
   * to pass the verdict gets the honest answer rather than the flattering one.
   */
  refinementEvidenced?: boolean;
  maxPoints?: number;
}

/**
 * `pose-deltas-v1.json` rows → a plan-frame camera path, preferring refined
 * poses and falling back to captured ones per frame.
 *
 * Returns `null` when fewer than two points survive — a path needs two points
 * to be a path, and one lonely point asserted as a walk would be worse than
 * nothing.
 *
 * Per-row failures drop the row and increment `droppedCount`: the same silent
 * degradation contract as `photoPlanPose`, no error UI, no console noise.
 */
export function buildCameraPath(
  frames: PoseDeltaFrame[] | null | undefined,
  provenance: PhotoProvenance | null | undefined,
  options: BuildCameraPathOptions = {},
): CameraPath | null {
  const { refinementEvidenced = false, maxPoints = CAMERA_PATH_MAX_POINTS } = options;
  if (!Array.isArray(frames) || frames.length === 0) return null;
  if (!provenance || !isValidProvenance(provenance)) return null;

  const points: CameraPathPoint[] = [];
  let dropped = 0;

  for (const frame of frames) {
    // Prefer refined — but only when the run earned it.
    const refined = refinementEvidenced
      ? colmapPlanPose(
          frame.alignedCameraCenterMeters,
          { qvecHamilton: frame.alignedQvecHamilton },
          provenance,
        )
      : null;
    if (refined) {
      points.push({ ...refined, imageName: frame.imageName, source: 'refined' });
      continue;
    }
    const captured = colmapPlanPose(
      frame.rawCameraCenterMeters,
      { qvecHamilton: frame.rawQvecHamilton },
      provenance,
    );
    if (captured) {
      points.push({ ...captured, imageName: frame.imageName, source: 'captured' });
      continue;
    }
    dropped++;
  }

  if (points.length < 2) return null;

  const retained = decimate(points, maxPoints);
  return {
    points: retained,
    // Evaluated over the RETAINED points — those are the ones a reader sees.
    source: retained.every((p) => p.source === 'refined') ? 'refined' : 'captured',
    frameCount: frames.length,
    usableCount: points.length,
    droppedCount: dropped,
    decimated: retained.length < points.length,
  };
}

/**
 * Camera-centre correction magnitudes over the delta rows, metres.
 *
 * This is a statement about what Refine *published*, not about whether the
 * correction is trustworthy — R123 left global consistency unguarded, so the
 * caller must pair these figures with the verdict and the advisory rather than
 * present them alone. `null` when no row yields a finite magnitude.
 */
export function poseDriftStats(
  frames: PoseDeltaFrame[] | null | undefined,
): PoseDriftStats | null {
  if (!Array.isArray(frames) || frames.length === 0) return null;

  const magnitudes: number[] = [];
  for (const frame of frames) {
    const [dx, dy, dz] = frame.cameraCenterDeltaMeters;
    const magnitude = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (Number.isFinite(magnitude)) magnitudes.push(magnitude);
  }
  if (magnitudes.length === 0) return null;

  const sorted = [...magnitudes].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median =
    sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  return {
    maxM: sorted[sorted.length - 1],
    medianM: median,
    sampleCount: sorted.length,
  };
}
