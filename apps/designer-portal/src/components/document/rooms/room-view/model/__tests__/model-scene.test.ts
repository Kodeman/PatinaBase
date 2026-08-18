/**
 * Mesh scene assembly — pure unit tests (Rendered Room v2, P1), mirroring
 * `orbit/__tests__/scene.test.ts`: three builds geometry, materials, and bounding
 * boxes in jsdom with no WebGL context, so the whole composition — light set,
 * framing derived from the model's own box, clip planes, disposal — is assertable
 * here without a renderer.
 *
 * The GLB loader is NOT exercised (it belongs to `model-canvas.tsx`, the renderer's
 * file). What a loader hands back is a `THREE.Object3D` root, so these tests stand a
 * tiny in-memory one — a textured box mesh — in its place, which is exactly the
 * boundary `buildModelScene` is written against.
 */

import * as THREE from 'three';
import {
  buildModelScene,
  clipPlanes,
  disposeObject3D,
  frameModel,
} from '../model-scene';

type Tagged = THREE.Object3D & { userData: Record<string, unknown> };

const byRole = (scene: THREE.Scene, role: string) =>
  scene.children.filter((c) => (c as Tagged).userData.role === role);

/** Stand-in for `gltf.scene`: one box, sized and placed like a small room, with a
 *  texture on its material so the disposal walk has something to free. */
function fakeGltfRoot(
  size: { x: number; y: number; z: number } = { x: 4, y: 2.5, z: 3 },
): { root: THREE.Group; mesh: THREE.Mesh; texture: THREE.Texture } {
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const mesh = new THREE.Mesh(geometry, material);
  // Box geometry is centred on the origin; lift it so the floor sits at y = 0 and
  // shift it off-origin, the way a real scan's frame does.
  mesh.position.set(10, size.y / 2, -6);
  const root = new THREE.Group();
  root.add(mesh);
  return { root, mesh, texture };
}

describe('frameModel', () => {
  it('targets the model’s own bounding-box centre at ~eye height', () => {
    const { root } = fakeGltfRoot({ x: 4, y: 2.5, z: 3 });
    const framing = frameModel(root);

    // Centre of the box in x/z; 45% of its height above the floor in y.
    expect(framing.target.x).toBeCloseTo(10, 6);
    expect(framing.target.z).toBeCloseTo(-6, 6);
    expect(framing.target.y).toBeCloseTo(2.5 * 0.45, 6);
  });

  it('keeps Orbit’s angles and derives the radius band from the plan diagonal', () => {
    const { root } = fakeGltfRoot({ x: 4, y: 2.5, z: 3 });
    const framing = frameModel(root);
    const diagonal = Math.hypot(4, 3); // 5

    // Same constants Orbit's frameRoom applies — this is the reused control math,
    // not a second copy.
    expect(framing.azimuth).toBeCloseTo(0.82, 6);
    expect(framing.polar).toBeCloseTo(1.08, 6);
    expect(framing.radius).toBeCloseTo(1.35 * diagonal, 6);
    expect(framing.minRadius).toBeCloseTo(0.6 * diagonal, 6);
    expect(framing.maxRadius).toBeCloseTo(2.55 * diagonal, 6);
  });

  it('scales with the model’s units — a metre model and a foot model both frame', () => {
    const metres = frameModel(fakeGltfRoot({ x: 4, y: 2.5, z: 3 }).root);
    const feet = frameModel(fakeGltfRoot({ x: 13.1, y: 8.2, z: 9.8 }).root);
    expect(feet.radius / metres.radius).toBeCloseTo(13.1 / 4, 1);
  });

  it('falls back to a unit framing for an empty root rather than emitting NaNs', () => {
    const framing = frameModel(new THREE.Group());
    expect(Number.isFinite(framing.radius)).toBe(true);
    expect(Number.isFinite(framing.target.x)).toBe(true);
    expect(framing.radius).toBeGreaterThan(0);
  });
});

describe('clipPlanes', () => {
  it('derives near/far from the framing band so both unit systems clip cleanly', () => {
    const framing = frameModel(fakeGltfRoot({ x: 4, y: 2.5, z: 3 }).root);
    const { near, far } = clipPlanes(framing);

    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(framing.minRadius);
    expect(far).toBeGreaterThan(framing.maxRadius);
  });
});

describe('buildModelScene', () => {
  it('assembles cream ground + exactly two neutral lights + the model, no shadows', () => {
    const { root } = fakeGltfRoot();
    const built = buildModelScene(root);

    expect((built.scene.background as THREE.Color).getHex()).toBe(0xfaf7f2);

    const hemis = byRole(built.scene, 'hemisphere-light');
    const keys = byRole(built.scene, 'key-light');
    expect(hemis).toHaveLength(1);
    expect(keys).toHaveLength(1);
    expect(hemis[0]).toBeInstanceOf(THREE.HemisphereLight);
    expect(keys[0]).toBeInstanceOf(THREE.DirectionalLight);
    expect((keys[0] as THREE.DirectionalLight).castShadow).toBe(false);

    // Nothing else lights the scene — no ambient, no second key.
    const lights = built.scene.children.filter((c) => (c as THREE.Light).isLight);
    expect(lights).toHaveLength(2);

    built.dispose();
  });

  it('adds the loaded model untouched — no re-centring, re-scaling, or rotation', () => {
    const { root, mesh } = fakeGltfRoot();
    const built = buildModelScene(root);

    expect(byRole(built.scene, 'scan-model')).toEqual([root]);
    expect(root.position.toArray()).toEqual([0, 0, 0]);
    expect(root.scale.toArray()).toEqual([1, 1, 1]);
    expect(root.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    expect(mesh.position.toArray()).toEqual([10, 1.25, -6]);

    built.dispose();
  });

  it('places the key light off the framing radius, above the target', () => {
    const { root } = fakeGltfRoot();
    const built = buildModelScene(root);
    const key = byRole(built.scene, 'key-light')[0] as THREE.DirectionalLight;

    expect(key.position.y).toBeGreaterThan(built.framing.target.y);
    expect(key.position.distanceTo(new THREE.Vector3(
      built.framing.target.x,
      built.framing.target.y,
      built.framing.target.z,
    ))).toBeGreaterThan(built.framing.radius);

    built.dispose();
  });

  it('dispose() frees geometry, material, and textures, then empties the scene', () => {
    const { root, mesh, texture } = fakeGltfRoot();
    const geometryDispose = jest.spyOn(mesh.geometry, 'dispose');
    const materialDispose = jest.spyOn(mesh.material as THREE.Material, 'dispose');
    const textureDispose = jest.spyOn(texture, 'dispose');

    const built = buildModelScene(root);
    built.dispose();

    expect(geometryDispose).toHaveBeenCalled();
    expect(materialDispose).toHaveBeenCalled();
    expect(textureDispose).toHaveBeenCalled();
    expect(built.scene.children).toHaveLength(0);
  });
});

describe('disposeObject3D', () => {
  it('frees a loader result that never reached a scene (the cancelled-load path)', () => {
    const { root, mesh, texture } = fakeGltfRoot();
    const geometryDispose = jest.spyOn(mesh.geometry, 'dispose');
    const textureDispose = jest.spyOn(texture, 'dispose');

    disposeObject3D(root);

    expect(geometryDispose).toHaveBeenCalled();
    expect(textureDispose).toHaveBeenCalled();
  });

  it('handles a multi-material mesh', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const materials = [
      new THREE.MeshStandardMaterial(),
      new THREE.MeshStandardMaterial(),
    ];
    const spies = materials.map((m) => jest.spyOn(m, 'dispose'));
    disposeObject3D(new THREE.Mesh(geometry, materials));
    spies.forEach((spy) => expect(spy).toHaveBeenCalled());
  });
});
