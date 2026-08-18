/**
 * Room View — Mesh scene assembly (Rendered Room v2, P1 / PROPOSAL §4).
 *
 * The pure half of ModelStage, mirroring `orbit/scene.ts`'s split: everything here is
 * plain three.js object construction and arithmetic, so the whole module builds and is
 * asserted in jsdom with no canvas and no WebGL context. The loader lives one file over
 * in `model-canvas.tsx` (the renderer's file), exactly as the Orbit renderer owns the
 * WebGL context and `scene.ts` owns the geometry.
 *
 * Where Orbit builds a synthetic room out of `RoomGeometry`, this takes the ALREADY
 * PARSED root of a scan GLB and only does the three things the loader can't:
 *   - neutral studio light (one hemisphere + one directional, no shadows — the scan
 *     carries its own baked colour; we are lighting a record, not art-directing it),
 *   - a camera framing derived from the model's own bounding box, and
 *   - a disposal walk that frees every geometry, material, AND texture the loader
 *     allocated (a GLB's KTX2 textures are the largest thing on the GPU here; the
 *     Orbit scene has none, so its dispose() has no texture leg).
 *
 * Units are deliberately not assumed. Orbit's geometry is in feet; a RoomPlan GLB is in
 * metres. `frameModel` reuses `orbit/controls.ts`'s `frameRoom` — whose radius and clamp
 * band are pure RATIOS of the plan diagonal — and then re-targets the look-at point onto
 * the model's own centre, so both unit systems land at the same camera feel with one
 * piece of control math, not two.
 */

import * as THREE from 'three';
import { frameRoom, type CameraFraming } from '../orbit/controls';

/** Orbit's stage ground (`orbit-canvas.tsx`), so Mesh and Orbit sit on one paper. */
export const CREAM = 0xfaf7f2;

const HEMI_SKY = 0xffffff;
const HEMI_GROUND = 0x8b7355; // aged oak, the Orbit palette's ground note
const HEMI_INTENSITY = 1.5;
const DIR_INTENSITY = 1.1;
/** Direction of the single key light, in model-diagonal multiples off the centre. */
const DIR_OFFSET = { x: 0.6, y: 1.2, z: 0.8 };

/** Look-at height as a fraction of the model's own height — roughly standing eye level
 *  in a room, and unit-free (works for a metre GLB and a foot GLB alike). */
const EYE_FRACTION = 0.45;

export interface BuiltModelScene {
  scene: THREE.Scene;
  /** Camera framing derived from the model's bounding box (see `frameModel`). */
  framing: CameraFraming;
  /** Frees every geometry / material / texture under the scene, then empties it. */
  dispose(): void;
}

/** Near/far derived from the framing, so a metre-scaled and a foot-scaled model both
 *  clip cleanly without a hardcoded pair tuned for one of them. */
export function clipPlanes(framing: CameraFraming): { near: number; far: number } {
  return {
    near: Math.max(0.01, framing.minRadius / 100),
    far: Math.max(1, framing.maxRadius * 6),
  };
}

/**
 * Camera framing for a loaded model: Orbit's angles + diagonal-derived radius band
 * (`frameRoom`, reused verbatim), re-targeted onto the model's own bounding-box centre
 * at ~eye height. An empty/degenerate box falls back to a unit room rather than
 * producing NaNs — `frameRoom` already guards non-finite and non-positive extents.
 */
export function frameModel(model: THREE.Object3D): CameraFraming {
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return frameRoom(1, 1);

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

/**
 * Compose the Mesh scene around an already-loaded GLB root: cream ground, the two
 * neutral lights, the model itself. The model is added as-is — never re-centred,
 * re-scaled, or rotated, so what the designer orbits is what the scan holds.
 */
export function buildModelScene(model: THREE.Object3D): BuiltModelScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CREAM);

  const framing = frameModel(model);

  const hemi = new THREE.HemisphereLight(HEMI_SKY, HEMI_GROUND, HEMI_INTENSITY);
  hemi.userData.role = 'hemisphere-light';
  scene.add(hemi);

  // One key light, placed off the framing radius so it scales with the room. No
  // shadows: shadow maps on scan geometry read as dirt, and cost a second pass.
  const dir = new THREE.DirectionalLight(HEMI_SKY, DIR_INTENSITY);
  dir.castShadow = false;
  dir.position.set(
    framing.target.x + framing.radius * DIR_OFFSET.x,
    framing.target.y + framing.radius * DIR_OFFSET.y,
    framing.target.z + framing.radius * DIR_OFFSET.z,
  );
  dir.userData.role = 'key-light';
  scene.add(dir);

  model.userData.role = 'scan-model';
  scene.add(model);

  return {
    scene,
    framing,
    dispose() {
      disposeObject3D(scene);
      scene.clear();
    },
  };
}

/**
 * Free every GPU-backed resource under `root` — geometries, materials, and each
 * material's texture maps. Safe to call on a loader result that never reached a scene
 * (the cancel path in `model-canvas.tsx` does exactly that), and idempotent: three's
 * `dispose()` is harmless on an already-disposed resource.
 */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as Partial<THREE.Mesh>;
    mesh.geometry?.dispose?.();
    const material = mesh.material;
    if (!material) return;
    if (Array.isArray(material)) material.forEach(disposeMaterial);
    else disposeMaterial(material);
  });
}

function disposeMaterial(material: THREE.Material): void {
  // Texture maps hang off the material as ordinary properties; three has no public
  // enumeration for them, so walk the material's own keys and dispose anything that
  // is a Texture. This is what frees a KTX2-transcoded GLB's basis textures.
  for (const value of Object.values(material as unknown as Record<string, unknown>)) {
    if (value && (value as THREE.Texture).isTexture) (value as THREE.Texture).dispose();
  }
  material.dispose();
}
