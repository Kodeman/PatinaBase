/**
 * Splat scene assembly — pure unit tests (Rendered Room v2, W2), mirroring
 * `model/__tests__/model-scene.test.ts`: three builds scenes, bounding boxes, and
 * object graphs in jsdom with no WebGL context, so the whole composition — what is
 * in the scene, what deliberately is NOT, the framing derived from the splat's own
 * bounds, the disposal order — is assertable here without a renderer.
 *
 * SPARK IS THE MOCKED BOUNDARY, AND ONLY THE BOUNDARY. `SparkRenderer` and
 * `SplatMesh` cannot be constructed in jsdom (both need a live GL context), so these
 * tests stand plain `THREE.Group`s carrying a `dispose` spy in their place — which is
 * exactly the structural contract `splat-scene.ts` is written against, and exactly
 * what the real classes satisfy (`Object3D` + `dispose(): void`). Nothing about
 * Spark's own behaviour is asserted here; that is the browser walk's job.
 */

import * as THREE from 'three';
import {
  buildSplatScene,
  disposeSplatParts,
  frameSplat,
  CREAM,
  type DisposableObject3D,
} from '../splat-scene';

type Tagged = THREE.Object3D & { userData: Record<string, unknown> };

const byRole = (scene: THREE.Scene, role: string) =>
  scene.children.filter((c) => (c as Tagged).userData.role === role);

/** Stand-in for a Spark part: an Object3D the library also frees itself. */
function fakePart(): DisposableObject3D {
  return Object.assign(new THREE.Group(), { dispose: jest.fn() });
}

function fakeParts() {
  return { spark: fakePart(), splatMesh: fakePart() };
}

/** A room-shaped bounds, floor at y = 0, sitting off-origin the way a real walk does. */
function roomBounds(
  size: { x: number; y: number; z: number } = { x: 4, y: 2.5, z: 3 },
  centre: { x: number; z: number } = { x: 10, z: -6 },
): THREE.Box3 {
  return new THREE.Box3(
    new THREE.Vector3(centre.x - size.x / 2, 0, centre.z - size.z / 2),
    new THREE.Vector3(centre.x + size.x / 2, size.y, centre.z + size.z / 2),
  );
}

describe('frameSplat', () => {
  it('targets the splat’s own bounding-box centre at ~eye height', () => {
    const framing = frameSplat(roomBounds());
    expect(framing.target.x).toBeCloseTo(10, 6);
    expect(framing.target.z).toBeCloseTo(-6, 6);
    expect(framing.target.y).toBeCloseTo(2.5 * 0.45, 6);
  });

  it('keeps Orbit’s angles and derives the radius band from the plan diagonal', () => {
    const framing = frameSplat(roomBounds());
    const diagonal = Math.hypot(4, 3); // 5

    // The same constants Orbit's frameRoom applies, and the same ones frameModel
    // lands on — this is the one shared piece of control math, not a third copy.
    expect(framing.azimuth).toBeCloseTo(0.82, 6);
    expect(framing.polar).toBeCloseTo(1.08, 6);
    expect(framing.radius).toBeCloseTo(1.35 * diagonal, 6);
    expect(framing.minRadius).toBeCloseTo(0.6 * diagonal, 6);
    expect(framing.maxRadius).toBeCloseTo(2.55 * diagonal, 6);
  });

  it('scales with the splat’s units — a metre walk and a foot walk both frame', () => {
    const metres = frameSplat(roomBounds({ x: 4, y: 2.5, z: 3 }));
    const feet = frameSplat(roomBounds({ x: 13.1, y: 8.2, z: 9.8 }));
    expect(feet.radius / metres.radius).toBeCloseTo(13.1 / 4, 1);
  });

  it('falls back to a unit framing for an empty bounds rather than emitting NaNs', () => {
    const framing = frameSplat(new THREE.Box3());
    expect(Number.isFinite(framing.radius)).toBe(true);
    expect(Number.isFinite(framing.target.x)).toBe(true);
    expect(framing.radius).toBeGreaterThan(0);
  });

  it('falls back for a non-finite bounds too — a degenerate splat can produce one', () => {
    const infinite = new THREE.Box3(
      new THREE.Vector3(-Infinity, -Infinity, -Infinity),
      new THREE.Vector3(Infinity, Infinity, Infinity),
    );
    const framing = frameSplat(infinite);
    expect(Number.isFinite(framing.radius)).toBe(true);
    expect(Number.isFinite(framing.target.y)).toBe(true);
  });
});

describe('buildSplatScene', () => {
  it('assembles cream ground + the SparkRenderer + the SplatMesh, and NOTHING else', () => {
    const parts = fakeParts();
    const built = buildSplatScene(parts, roomBounds());

    expect((built.scene.background as THREE.Color).getHex()).toBe(CREAM);
    expect(byRole(built.scene, 'spark-renderer')).toEqual([parts.spark]);
    expect(byRole(built.scene, 'splat-mesh')).toEqual([parts.splatMesh]);
    expect(built.scene.children).toHaveLength(2);
  });

  it('adds NO lights — a splat carries its own radiance (the Mesh rig would wash it)', () => {
    const built = buildSplatScene(fakeParts(), roomBounds());
    const lights = built.scene.children.filter((c) => (c as THREE.Light).isLight);
    expect(lights).toHaveLength(0);
  });

  it('adds the SparkRenderer before the SplatMesh it services', () => {
    const parts = fakeParts();
    const built = buildSplatScene(parts, roomBounds());
    expect(built.scene.children.indexOf(parts.spark)).toBeLessThan(
      built.scene.children.indexOf(parts.splatMesh),
    );
  });

  it('adds the splat untouched — no re-centring, re-scaling, or rotation', () => {
    const parts = fakeParts();
    const built = buildSplatScene(parts, roomBounds());

    expect(parts.splatMesh.position.toArray()).toEqual([0, 0, 0]);
    expect(parts.splatMesh.scale.toArray()).toEqual([1, 1, 1]);
    expect(parts.splatMesh.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
  });

  it('frames from the bounds it was handed, not from the scene graph', () => {
    // A SplatMesh holds no three geometry, so Box3.setFromObject would measure an
    // empty box. The bounds come from the library, and this is what proves they are
    // what the framing uses.
    const built = buildSplatScene(fakeParts(), roomBounds());
    expect(built.framing.target.x).toBeCloseTo(10, 6);
    expect(built.framing.radius).toBeCloseTo(1.35 * 5, 6);
  });

  it('dispose() hands both parts back to the library, mesh first, then empties', () => {
    const parts = fakeParts();
    const built = buildSplatScene(parts, roomBounds());

    built.dispose();

    expect(parts.splatMesh.dispose).toHaveBeenCalledTimes(1);
    expect(parts.spark.dispose).toHaveBeenCalledTimes(1);
    const meshOrder = (parts.splatMesh.dispose as jest.Mock).mock.invocationCallOrder[0];
    const sparkOrder = (parts.spark.dispose as jest.Mock).mock.invocationCallOrder[0];
    expect(meshOrder).toBeLessThan(sparkOrder);
    expect(built.scene.children).toHaveLength(0);
  });
});

describe('disposeSplatParts', () => {
  it('frees parts that never reached a scene (the cancelled-load path)', () => {
    const parts = fakeParts();
    disposeSplatParts(parts);
    expect(parts.splatMesh.dispose).toHaveBeenCalled();
    expect(parts.spark.dispose).toHaveBeenCalled();
  });

  it('still frees the renderer when the mesh’s own dispose throws', () => {
    // The heavier allocation is Spark's; a library throw on the mesh must not
    // strand it. (Upstream spark#237 reports disposal not always dropping memory.)
    const parts = fakeParts();
    (parts.splatMesh.dispose as jest.Mock).mockImplementation(() => {
      throw new Error('already disposed');
    });

    expect(() => disposeSplatParts(parts)).not.toThrow();
    expect(parts.spark.dispose).toHaveBeenCalled();
  });

  it('tolerates a half-built pair — either part may not exist yet', () => {
    const spark = fakePart();
    expect(() => disposeSplatParts({ spark })).not.toThrow();
    expect(spark.dispose).toHaveBeenCalled();
    expect(() => disposeSplatParts({})).not.toThrow();
  });
});
