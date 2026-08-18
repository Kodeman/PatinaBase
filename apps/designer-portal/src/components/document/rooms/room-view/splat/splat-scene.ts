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
import { frameRoom, type CameraFraming } from '../orbit/controls';
import { CREAM } from '../model/model-scene';

export { CREAM };

/** Look-at height as a fraction of the splat's own height — the same standing-eye-level
 *  rule `model-scene.ts` uses, and unit-free for the same reason. */
const EYE_FRACTION = 0.45;

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
  /** Camera framing derived from the splat's own bounds (see `frameSplat`). */
  framing: CameraFraming;
  /** Hands each Spark part back to the library, then empties the scene. */
  dispose(): void;
}

/**
 * Camera framing for a loaded splat. Orbit's angles + diagonal-derived radius band
 * (`frameRoom`, reused verbatim — the same one piece of control math Plan, Orbit, and
 * Mesh all share), re-targeted onto the splat's own bounding-box centre at eye height.
 *
 * Takes a `Box3` rather than an `Object3D` because a `SplatMesh` holds no three geometry
 * for `Box3.setFromObject` to measure — its extent comes from the library
 * (`SplatMesh.getBoundingBox()`). A degenerate or non-finite box falls back to a unit
 * room rather than emitting NaNs into the camera.
 */
export function frameSplat(box: THREE.Box3): CameraFraming {
  if (box.isEmpty() || !boxIsFinite(box)) return frameRoom(1, 1);

  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const base = frameRoom(size.x, size.z);

  return {
    ...base,
    target: {
      x: centre.x,
      y: box.min.y + size.y * EYE_FRACTION,
      z: centre.z,
    },
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
 * re-centred, re-scaled, or rotated, so what the designer orbits is what the walk
 * recorded.
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
    framing: frameSplat(bounds),
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
