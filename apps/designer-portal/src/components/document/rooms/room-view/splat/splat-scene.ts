/**
 * Room View — Splat scene assembly (Rendered Room v2, W2 / PROPOSAL §4).
 *
 * The pure half of SplatStage, mirroring `model/model-scene.ts`'s split: everything here
 * is plain three.js object construction and arithmetic, so the whole composition — what
 * goes in the scene, the framing derived from the splat's own bounds, the disposal order
 * — is assertable in jsdom with no canvas and no WebGL context. The renderer, the Spark
 * library, and its WASM live one file over in `splat-canvas.tsx`.
 *
 * TWO THINGS DIFFER FROM `model-scene.ts`, AND BOTH ARE THE POINT:
 *
 * 1. **No lights.** A Gaussian splat carries its own radiance — it IS the photograph.
 *    Mesh needs a hemisphere + key rig because a scan mesh is untextured geometry;
 *    lighting a splat would only wash it. The scene holds the SparkRenderer, the
 *    SplatMesh, and the cream ground, and nothing else.
 * 2. **Library-owned disposal.** A splat's GPU footprint is packed splat buffers Spark
 *    allocated, not three geometries/materials/textures, so `model-scene.ts`'s traversal
 *    walk would free nothing. `dispose()` calls the library's own `dispose()` on each
 *    part instead — mesh first, then the renderer that services it.
 *
 * The Spark types are taken STRUCTURALLY (`SplatSceneParts`), not imported. Two reasons:
 * `@sparkjsdev/spark` must stay reachable only from the dynamic canvas chunk, and jsdom
 * cannot instantiate either class (both need a live WebGL context), so a structural
 * boundary is what lets these tests be honest rather than mocked into meaninglessness.
 * `SparkRenderer` and `SplatMesh` both extend `THREE.Object3D` and both expose
 * `dispose(): void`, so they satisfy it exactly.
 */

import * as THREE from 'three';
import { clamp, frameRoom, DEFAULT_AZIMUTH, MIN_POLAR, MAX_POLAR, type CameraFraming } from '../orbit/controls';
import { CREAM } from '../model/model-scene';

export { CREAM };

/**
 * ── ORIENTATION ────────────────────────────────────────────────────────────────────
 *
 * A splat mesh does NOT arrive in three.js's Y-up frame, and two separate facts
 * compose to explain why:
 *
 * 1. Spark assumes a typical COLMAP-trained splat's Y-DOWN authoring frame. Its own
 *    quickstart corrects for it on every mesh it shows:
 *    `butterfly.quaternion.set(1, 0, 0, 0)` (`@sparkjsdev/spark` README, quickstart) —
 *    three.js `Quaternion.set(x, y, z, w)`, so `(1,0,0,0)` is a 180°-about-X flip.
 *
 * 2. Our own .spz is NOT COLMAP-trained — it is nerfstudio-trained from ARKit poses,
 *    and the pipeline that gets it there applies its own world-up change of basis
 *    BEFORE training: `ARKIT_TO_NERFSTUDIO`
 *    (`services/scan-modal/src/scan_modal/core/transforms.py:57-77`) rotates ARKit's
 *    Y-up world into nerfstudio's Z-up convention (gravity is real and known, so this
 *    is an exact rotation, not an estimate). `splat_job.py:248-250` trains with
 *    `--orientation-method none`, so nothing further reorients the result — the
 *    trained gaussians sit exactly in that transform's Z-up target frame.
 *    `ARKIT_TO_NERFSTUDIO`'s matrix (X unchanged, Y_nerf = −Z_arkit, Z_nerf = Y_arkit)
 *    is a rotation of +90° about X.
 *
 * An UNROTATED mesh therefore puts the room's height on the wrong axis — the box this
 * file used to measure came out with height where depth belongs, which is the
 * inside-out blob this file used to render. The fix composes both corrections:
 * Spark's 180°-about-X flip, applied to the inverse of `ARKIT_TO_NERFSTUDIO`'s
 * +90°-about-X (i.e. −90° about X). Both rotations share the X axis, so they commute
 * and the whole composition collapses to ONE rotation:
 *
 *     180° + (−90°) = 90° about X
 *
 * — numerically identical to `ARKIT_TO_NERFSTUDIO` itself. That is a coincidence of
 * this pipeline's two corrections sharing an axis, not a shortcut where one constant
 * could stand in for the other's meaning.
 */
export const SPLAT_ORIENTATION: THREE.Quaternion = new THREE.Quaternion(
  Math.SQRT1_2,
  0,
  0,
  Math.SQRT1_2,
);

/**
 * Rotate a mesh-local `Box3` by `orientation` and return the new axis-aligned bounds.
 * `Box3.applyMatrix4` re-derives min/max from all 8 corners — the only correct way to
 * keep a rotated box axis-aligned; a naive per-component transform of `min`/`max`
 * would not. Pure three.js math: no Spark import, no WebGL, jsdom-testable exactly
 * like `frameSplatInterior`.
 */
export function orientBounds(box: THREE.Box3, orientation: THREE.Quaternion): THREE.Box3 {
  if (box.isEmpty() || !boxIsFinite(box)) return box.clone();
  const rotation = new THREE.Matrix4().makeRotationFromQuaternion(orientation);
  return box.clone().applyMatrix4(rotation);
}

/**
 * The orientation a given splat SOURCE needs, keyed on its URL rather than guessed
 * from its data. `/fixtures/…` is the one non-production source this repo can point
 * Splat at: the committed dev fixture (`scripts/make-splat-fixture.mjs`), built Y-up
 * BY CONSTRUCTION (floor at y=0, ceiling at y=height — no ARKit→nerfstudio pipeline
 * involved), so it is the one case identity is correct. Every other URL — today a dev
 * `?splatUrl=` override of something else, tomorrow the resolved R2 capability URL —
 * is a real .spz off the pipeline described above and gets `SPLAT_ORIENTATION`.
 *
 * Declaring this per source, rather than inferring it from the loaded geometry, is
 * the whole point: a green fixture render must never be able to stand in for having
 * verified the real, rotated path.
 */
export function defaultSplatOrientation(splatUrl: string): THREE.Quaternion {
  return splatUrl.startsWith('/fixtures/') ? new THREE.Quaternion() : SPLAT_ORIENTATION.clone();
}

/** Eye height above the splat's own floor (`box.min.y`), metres, pinned rather than
 *  derived. `services/scan-modal/src/scan_modal/core/cameras.py`'s Modal-side rig
 *  uses `EYE_HEIGHT_M = 1.5` for a diagonal establishing shot; we use 1.6 here — a
 *  touch taller, and there is no reason the two must match: one composes a camera
 *  shot, the other seats a designer who has stood up. */
const EYE_HEIGHT_M = 1.6;

/**
 * Interior radius as a fraction of the room's own plan HALF-diagonal, not Orbit's
 * exterior `frameRoom` fit (1.35 × the FULL diagonal, clamped to [0.6×, 2.55×]).
 * `frameRoom` was authored for backing away from a room to frame the whole box in
 * one exterior shot; its entire clamp band sits outside a room's own walls. Standing
 * INSIDE the room a splat reconstructs, the camera belongs near the centre.
 */
const INTERIOR_RADIUS_FIT = 0.35;
/** Absolute cap, metres — without it a large room's fit-radius still reads as
 *  "back off toward the middle distance" rather than "stand near the centre". */
const INTERIOR_RADIUS_CAP_M = 1.2;
const INTERIOR_MIN_RADIUS_M = 0.15;
const INTERIOR_MAX_RADIUS_FIT = 0.9;

/** Flattened polar — an eye-level look, not Orbit's exterior downward tilt (1.08 rad
 *  looks down into the room from above; standing inside it, level is correct). Note
 *  this still passes through `createOrbitController`'s own `clamp(…, minPolar,
 *  maxPolar)` against the SAME `MAX_POLAR` (1.45 rad) Orbit uses, which is slightly
 *  less than π/2 (1.5708) — the initial look ends up ~1.45 rad, "flattened to ~π/2"
 *  rather than exactly π/2. Not narrowed further: the clamp band is shared control
 *  math, not a Splat-specific one. */
const INTERIOR_POLAR = Math.PI / 2;

/** `hypot(size.x, size.z)` beyond this reads as a floater-polluted or non-metric
 *  splat (a stray point cloud spanning a building, garbage bounds from a bad train)
 *  rather than a real room. Its centre and diagonal are not trustworthy, so this
 *  falls back to the same unit-room framing the degenerate-box guard uses, rather
 *  than computing a plausible-looking but meaningless "interior" camera from
 *  garbage bounds. */
const OVERSIZE_PLAN_M = 40;

/** An `Object3D` the library also wants to free itself. Both Spark parts are this. */
export interface DisposableObject3D extends THREE.Object3D {
  dispose(): void;
}

export interface SplatSceneParts {
  /** `new SparkRenderer({ renderer })` — an Object3D that must sit in the scene. */
  spark: DisposableObject3D;
  /** `new SplatMesh({ url })`, already initialized. */
  splatMesh: DisposableObject3D;
}

export interface BuiltSplatScene {
  scene: THREE.Scene;
  /** Camera framing derived from the splat's own bounds (see `frameSplatInterior`). */
  framing: CameraFraming;
  /** Hands each Spark part back to the library, then empties the scene. */
  dispose(): void;
}

/**
 * Camera framing for a loaded splat, standing INSIDE the room it reconstructs — not
 * Orbit's exterior diagram. Keeps Orbit's azimuth and polar CLAMP BAND (shared control
 * math, not a second copy of it) but replaces the exterior radius fit and default
 * polar with interior-scaled ones (see the constants above): a designer opening Splat
 * is meant to feel like they are standing in the room the walk captured, not backed up
 * outside its walls looking in.
 *
 * Takes a `Box3` rather than an `Object3D` because a `SplatMesh` holds no three geometry
 * for `Box3.setFromObject` to measure — its extent comes from the library
 * (`SplatMesh.getBoundingBox()`), already rotated into Y-up by the caller (see
 * `orientBounds` / `SPLAT_ORIENTATION` above — this function assumes ITS input is
 * already correctly oriented). A degenerate, non-finite, or implausibly large box
 * (`OVERSIZE_PLAN_M`) falls back to a unit room rather than placing a camera from
 * bounds that cannot be trusted.
 */
export function frameSplatInterior(box: THREE.Box3): CameraFraming {
  if (box.isEmpty() || !boxIsFinite(box)) return frameRoom(1, 1);

  const size = box.getSize(new THREE.Vector3());
  const planDiagonal = Math.hypot(size.x, size.z);
  if (planDiagonal > OVERSIZE_PLAN_M) return frameRoom(1, 1);

  const centre = box.getCenter(new THREE.Vector3());
  const halfDiagonal = planDiagonal / 2;
  const maxRadius = INTERIOR_MAX_RADIUS_FIT * halfDiagonal;
  const radius = clamp(
    Math.min(INTERIOR_RADIUS_FIT * halfDiagonal, INTERIOR_RADIUS_CAP_M),
    INTERIOR_MIN_RADIUS_M,
    maxRadius,
  );

  return {
    target: {
      x: centre.x,
      y: box.min.y + EYE_HEIGHT_M,
      z: centre.z,
    },
    azimuth: DEFAULT_AZIMUTH,
    polar: INTERIOR_POLAR,
    radius,
    minRadius: INTERIOR_MIN_RADIUS_M,
    maxRadius,
    minPolar: MIN_POLAR,
    maxPolar: MAX_POLAR,
  };
}

function boxIsFinite(box: THREE.Box3): boolean {
  return [box.min, box.max].every(
    (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z),
  );
}

/**
 * Compose the Splat scene: cream ground, the SparkRenderer, the SplatMesh. The renderer
 * goes in FIRST — it is the thing that services every splat in the scene, and Spark's
 * own quick-start adds it before any mesh. The mesh itself is added as-is: never
 * re-centred or re-scaled here.
 *
 * "Never rotated" no longer holds for the mesh as a whole, and that reversal happens
 * ONE LAYER UP, not in this function. `splat-canvas.tsx` sets `splatMesh.quaternion`
 * to `SPLAT_ORIENTATION` (or identity for the dev fixture, via
 * `defaultSplatOrientation`) and orients the measured bounds with `orientBounds`
 * BEFORE either the mesh or the bounds ever reach `buildSplatScene` — see the
 * ORIENTATION section above for why an unrotated mesh renders inside-out. This
 * function itself still touches neither rotation, position, nor scale; it composes
 * whatever it is handed, and what it is handed is now already correctly oriented.
 */
export function buildSplatScene(
  parts: SplatSceneParts,
  bounds: THREE.Box3,
): BuiltSplatScene {
  const { spark, splatMesh } = parts;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CREAM);

  spark.userData.role = 'spark-renderer';
  scene.add(spark);

  splatMesh.userData.role = 'splat-mesh';
  scene.add(splatMesh);

  return {
    scene,
    framing: frameSplatInterior(bounds),
    dispose() {
      disposeSplatParts(parts);
      scene.clear();
    },
  };
}

/**
 * Free both Spark parts, mesh before renderer. Also the teardown path for parts that
 * never reached a scene — `splat-canvas.tsx`'s cancelled-load guard calls exactly this,
 * the way `model-canvas.tsx` calls `disposeObject3D` on a late GLB.
 *
 * Each call is isolated: a throw out of `SplatMesh.dispose()` must not strand the
 * `SparkRenderer` (the heavier of the two) undisposed.
 */
export function disposeSplatParts(parts: Partial<SplatSceneParts>): void {
  for (const part of [parts.splatMesh, parts.spark]) {
    try {
      part?.dispose();
    } catch {
      // Already disposed, or disposed mid-teardown by the library. Nothing to do.
    }
  }
}
