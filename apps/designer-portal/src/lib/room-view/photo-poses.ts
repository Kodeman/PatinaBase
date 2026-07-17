/**
 * Room View — photo-pose plan projection (Room View PHOTOS program, W1-T3).
 *
 * Pure math: an ARKit camera transform (as stored on
 * `room_scan_images.camera_transform`) plus the scan's stored provenance
 * (`room_scan_geometry.origin_yaw_deg` + `origin_offset_m`, migration 00337)
 * → the camera's standing position and facing in the SAME plan frame the
 * parser produced for the room geometry. The marker layer (plan pins) and the
 * orbit layer (camera frusta) both consume this so a photo lands exactly where
 * it was taken, relative to the walls/objects already drawn.
 *
 * No React, no IO, no DOM. Nothing here throws — malformed input returns null.
 *
 * ─── COORDINATE FACTS (verified — DECISIONS.md I77) ─────────────────────────
 *
 * `camera_transform` is `ARFrame.camera.transform` (a column-major
 * simd_float4x4) flattened **ROW-MAJOR** into 16 doubles. In row-major layout
 * element[r*4 + c] = M[r][c], so for the standard [ R | t ; 0 1 ] transform:
 *   · world translation (meters)      = elements [3], [7], [11]   → (x, y, z)
 *   · rotation basis columns are M[·][c]; the camera's local −Z axis (its
 *     forward, ARKit cameras look down −Z) in WORLD space is
 *         forward = −(element[2], element[6], element[10])
 * ARKit world frame: right-handed, +Y up. This is the SAME world frame the
 * CapturedRoom geometry lived in, so origin_yaw_deg / origin_offset_m map a
 * camera into plan feet identically to how the parser mapped the walls.
 *
 * NOTE the flattening differs from `parse-room-scan/lib.ts`, which reads the
 * CapturedRoom surface transforms COLUMN-major (translation at [12],[13],[14]).
 * The two are transposes of each other; do not copy index positions across.
 *
 * ─── PLAN MAPPING (mirrors parse-room-scan/lib.ts worldToPlanFt EXACTLY) ────
 *
 * θ  = origin_yaw_deg (degrees), off = origin_offset_m {x, z} (rotated meters).
 * For a world XZ point:
 *   rotateNeg(x, z, θ) = ( x·cosθ + z·sinθ , −x·sinθ + z·cosθ )   // rotate by −θ
 *   planFt.x = (rotateNeg.x − off.x) · 3.28084
 *   planFt.z = (rotateNeg.z − off.z) · 3.28084
 * (parser lines: `rotateNeg` §L147, `toPlanFt`/`worldToPlanFt` §L382-386.)
 * y is passed straight through: y_ft = world_y · 3.28084. It is world height
 * above the ARKit world origin, NOT floor-relative — the provenance carries no
 * floor datum, so consumers wanting eye-height-above-floor must subtract their
 * own reference.
 *
 * ─── HEADING CONVENTION (renderers: read this) ──────────────────────────────
 *
 * `headingDeg` is the camera's forward direction projected into the plan XZ
 * plane and expressed in DEGREES, normalized to [0, 360). It mirrors the
 * parser's object `rotation_deg` convention EXACTLY (parser §L585:
 * `normalizeDeg(atan2(zComp, xComp)·180/π − origin_yaw_deg)`):
 *
 *     headingDeg = normalize( atan2(forward.z, forward.x)·180/π − origin_yaw_deg )
 *
 *   · 0°  → forward points +x  (plan EAST)
 *   · 90° → forward points +z  (plan SOUTH)
 *   · the angle increases from +x toward +z, i.e. CLOCKWISE on a north-up plan
 *     (x → east/right, z → south/down).
 *
 * Because the formula is identical to the parser's object rotation, a photo
 * `headingDeg` and an object `rotation_deg` of the same numeric value point the
 * SAME way in the plan. This is deliberately the "atan2(z, x) then subtract
 * yaw" convention — NOT the mathematical CCW-from-east convention — for
 * consistency with the geometry already on screen.
 */

/** Meters → feet. Matches parse-room-scan/lib.ts `M_TO_FT` exactly. */
export const M_TO_FT = 3.28084;

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * The scan's stored plan-frame provenance (parser header, 00337). θ in
 * degrees; offset in rotated-frame meters (the NW plan origin). This is the
 * shape `from-rows.ts` surfaces as `AdapterResult.provenance`.
 */
export interface PhotoProvenance {
  originYawDeg: number;
  originOffsetM: { x: number; z: number };
}

/**
 * A camera's plan-frame pose. x/z/y in FEET (plan frame: x→east, z→south, y up
 * = world height in feet); `headingDeg` per the convention documented above.
 */
export interface PhotoPlanPose {
  x: number;
  z: number;
  y: number;
  headingDeg: number;
}

/** The minimum a pose needs to be clustered — its plan XZ position (feet). */
export interface ClusterablePose {
  x: number;
  z: number;
}

/** One proximity cluster of poses. */
export interface PoseCluster<T extends ClusterablePose> {
  /** The cluster's stand-in pose — the earliest member by the supplied sort key. */
  representative: T;
  /** Index of `representative` in the original input array. */
  representativeIndex: number;
  /** Original-array indices of every member (representative included), ascending. */
  memberIndices: number[];
  /** Convenience: `memberIndices.length`. */
  count: number;
}

// ─── Internal helpers (mirror the parser's math) ────────────────────────────

/** Rotate a plan point (x,z) by −θ (radians). Byte-for-byte the parser's `rotateNeg`. */
function rotateNeg(x: number, z: number, theta: number): { x: number; z: number } {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: x * c + z * s, z: -x * s + z * c };
}

/** Normalize degrees into [0, 360). Matches the parser's `normalizeDeg`. */
function normalizeDeg(d: number): number {
  let r = d % 360;
  if (r < 0) r += 360;
  return r;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/** True only for a 16-long array of all-finite numbers. */
function isValidTransform(t: unknown): t is number[] {
  if (!Array.isArray(t) || t.length !== 16) return false;
  for (let i = 0; i < 16; i++) {
    if (!isFiniteNumber(t[i])) return false;
  }
  return true;
}

function isValidProvenance(p: unknown): p is PhotoProvenance {
  if (p == null || typeof p !== 'object') return false;
  const prov = p as PhotoProvenance;
  return (
    isFiniteNumber(prov.originYawDeg) &&
    prov.originOffsetM != null &&
    typeof prov.originOffsetM === 'object' &&
    isFiniteNumber(prov.originOffsetM.x) &&
    isFiniteNumber(prov.originOffsetM.z)
  );
}

// ─── photoPlanPose ───────────────────────────────────────────────────────────

/**
 * Project one ARKit `camera_transform` (row-major, 16 doubles) into the plan
 * frame described by `provenance`. Returns null (never throws) when the
 * transform is not a 16-long all-finite array, or when the provenance is
 * malformed — so a bad row degrades to "no marker" rather than a crash.
 */
export function photoPlanPose(
  cameraTransform: number[],
  provenance: PhotoProvenance,
): PhotoPlanPose | null {
  if (!isValidTransform(cameraTransform) || !isValidProvenance(provenance)) {
    return null;
  }

  const theta = (provenance.originYawDeg * Math.PI) / 180;
  const { x: offX, z: offZ } = provenance.originOffsetM;

  // World translation (meters), row-major indices [3],[7],[11].
  const wx = cameraTransform[3];
  const wy = cameraTransform[7];
  const wz = cameraTransform[11];

  // Position → plan feet, exactly as the parser maps a world XZ point.
  const rotated = rotateNeg(wx, wz, theta);
  const x = (rotated.x - offX) * M_TO_FT;
  const z = (rotated.z - offZ) * M_TO_FT;
  const y = wy * M_TO_FT;

  // Forward = −(local −Z axis) = −(element[2], element[6], element[10]).
  // Only the XZ components matter for a plan heading.
  const forwardX = -cameraTransform[2];
  const forwardZ = -cameraTransform[10];
  const worldHeadingDeg = (Math.atan2(forwardZ, forwardX) * 180) / Math.PI;
  const headingDeg = normalizeDeg(worldHeadingDeg - provenance.originYawDeg);

  return { x, z, y, headingDeg };
}

// ─── clusterPoses ─────────────────────────────────────────────────────────────

/**
 * Greedy proximity clustering over plan XZ positions. Poses are visited in
 * ascending `sortKey` order; each unassigned pose becomes a cluster seed
 * (and its representative — the "earliest" member) and absorbs every remaining
 * unassigned pose within `radiusFt` (Euclidean, inclusive). Fully deterministic
 * for a given input + sort key: seed order, membership, and output order are
 * all fixed.
 *
 * @param poses    plan poses (need at least `{x, z}`).
 * @param radiusFt cluster radius in feet (default 1.5).
 * @param sortKey  ranks poses "earliest first" (e.g. capture time); ties break
 *                 by original index. Defaults to original input order.
 */
export function clusterPoses<T extends ClusterablePose>(
  poses: T[],
  radiusFt = 1.5,
  sortKey: (pose: T, index: number) => number | string = (_pose, index) => index,
): Array<PoseCluster<T>> {
  const order = poses
    .map((pose, index) => ({ pose, index, key: sortKey(pose, index) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.index - b.index));

  const assigned = new Array<boolean>(poses.length).fill(false);
  const clusters: Array<PoseCluster<T>> = [];

  for (const seed of order) {
    if (assigned[seed.index]) continue;
    assigned[seed.index] = true;
    const memberIndices = [seed.index];

    // Scan the rest in the same deterministic order.
    for (const cand of order) {
      if (assigned[cand.index]) continue;
      const dx = cand.pose.x - seed.pose.x;
      const dz = cand.pose.z - seed.pose.z;
      if (Math.hypot(dx, dz) <= radiusFt) {
        assigned[cand.index] = true;
        memberIndices.push(cand.index);
      }
    }

    memberIndices.sort((a, b) => a - b);
    clusters.push({
      representative: seed.pose,
      representativeIndex: seed.index,
      memberIndices,
      count: memberIndices.length,
    });
  }

  return clusters;
}
