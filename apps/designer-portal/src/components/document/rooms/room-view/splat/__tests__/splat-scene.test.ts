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
  frameSplatInterior,
  orientBounds,
  defaultSplatOrientation,
  SPLAT_ORIENTATION,
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

describe('frameSplatInterior', () => {
  it('targets the splat’s own bounding-box centre, eye height 1.6 m above its floor', () => {
    const framing = frameSplatInterior(roomBounds());
    expect(framing.target.x).toBeCloseTo(10, 6);
    expect(framing.target.z).toBeCloseTo(-6, 6);
    expect(framing.target.y).toBeCloseTo(1.6, 6); // box.min.y (0) + EYE_HEIGHT_M
  });

  it('keeps Orbit’s azimuth and its polar clamp band, but flattens the default look', () => {
    const framing = frameSplatInterior(roomBounds());
    // The one shared piece of control math Orbit's frameRoom also uses — not a copy.
    expect(framing.azimuth).toBeCloseTo(0.82, 6);
    expect(framing.minPolar).toBeCloseTo(0.35, 6);
    expect(framing.maxPolar).toBeCloseTo(1.45, 6);
    // Flattened toward eye-level, not Orbit's exterior downward tilt (1.08 rad).
    expect(framing.polar).toBeCloseTo(Math.PI / 2, 6);
  });

  it('derives an interior-scale radius from the HALF-diagonal, well inside the shell', () => {
    const framing = frameSplatInterior(roomBounds()); // size 4×2.5×3, diagonal 5
    const halfDiagonal = Math.hypot(4, 3) / 2; // 2.5
    expect(framing.radius).toBeCloseTo(0.35 * halfDiagonal, 6); // 0.875 — under the 1.2 m cap
    expect(framing.radius).toBeLessThan(halfDiagonal);
    expect(framing.minRadius).toBeCloseTo(0.15, 6);
    expect(framing.maxRadius).toBeCloseTo(0.9 * halfDiagonal, 6);
    expect(framing.minRadius).toBeLessThan(framing.radius);
    expect(framing.maxRadius).toBeLessThan(Math.hypot(4, 3)); // stays inside the room, not outside it
  });

  it('caps the radius at an absolute distance for a large room rather than backing off further', () => {
    // half-diagonal 10 (hypot(16,12)=20) → 0.35×10 = 3.5, capped to 1.2.
    const framing = frameSplatInterior(roomBounds({ x: 16, y: 2.5, z: 12 }));
    expect(framing.radius).toBeCloseTo(1.2, 6);
  });

  it('falls back to a unit framing for an empty bounds rather than emitting NaNs', () => {
    const framing = frameSplatInterior(new THREE.Box3());
    expect(Number.isFinite(framing.radius)).toBe(true);
    expect(Number.isFinite(framing.target.x)).toBe(true);
    expect(framing.radius).toBeGreaterThan(0);
  });

  it('falls back for a non-finite bounds too — a degenerate splat can produce one', () => {
    const infinite = new THREE.Box3(
      new THREE.Vector3(-Infinity, -Infinity, -Infinity),
      new THREE.Vector3(Infinity, Infinity, Infinity),
    );
    const framing = frameSplatInterior(infinite);
    expect(Number.isFinite(framing.radius)).toBe(true);
    expect(Number.isFinite(framing.target.y)).toBe(true);
  });

  it('falls back for an oversize plan — a floater-polluted or non-metric splat, not a room', () => {
    const huge = roomBounds({ x: 50, y: 2.5, z: 3 }); // hypot(50,3) ≈ 50.1 > 40
    const framing = frameSplatInterior(huge);
    const unitRoom = frameSplatInterior(new THREE.Box3()); // same fallback shape
    expect(framing).toEqual(unitRoom);
  });
});

describe('orientBounds', () => {
  it('rotates a mesh-local box into the oriented frame (90° about X: y′=−z, z′=y)', () => {
    const local = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 2, 3));
    const oriented = orientBounds(local, SPLAT_ORIENTATION);
    const [minX, minY, minZ] = oriented.min.toArray();
    const [maxX, maxY, maxZ] = oriented.max.toArray();
    expect(minX).toBeCloseTo(0, 6);
    expect(minY).toBeCloseTo(-3, 6);
    expect(minZ).toBeCloseTo(0, 6);
    expect(maxX).toBeCloseTo(1, 6);
    expect(maxY).toBeCloseTo(0, 6);
    expect(maxZ).toBeCloseTo(2, 6);
  });

  it('leaves the box unchanged under an identity orientation', () => {
    const local = new THREE.Box3(new THREE.Vector3(-1, 0, -2), new THREE.Vector3(3, 2.5, 4));
    const oriented = orientBounds(local, new THREE.Quaternion());
    expect(oriented.min.toArray()).toEqual(local.min.toArray());
    expect(oriented.max.toArray()).toEqual(local.max.toArray());
  });

  it('passes an empty box through rather than producing a bogus rotated one', () => {
    expect(orientBounds(new THREE.Box3(), SPLAT_ORIENTATION).isEmpty()).toBe(true);
  });
});

describe('SPLAT_ORIENTATION', () => {
  it('is the 90°-about-X quaternion the derivation composes to', () => {
    expect(SPLAT_ORIENTATION.x).toBeCloseTo(Math.SQRT1_2, 10);
    expect(SPLAT_ORIENTATION.y).toBeCloseTo(0, 10);
    expect(SPLAT_ORIENTATION.z).toBeCloseTo(0, 10);
    expect(SPLAT_ORIENTATION.w).toBeCloseTo(Math.SQRT1_2, 10);
  });
});

describe('defaultSplatOrientation', () => {
  it('is identity for the committed dev fixture — built Y-up, no pipeline involved', () => {
    const q = defaultSplatOrientation('/fixtures/splat/room-fixture.ply');
    expect(q.equals(new THREE.Quaternion())).toBe(true);
  });

  it('is SPLAT_ORIENTATION for every other source — a real .spz off the pipeline', () => {
    const capabilityUrl = defaultSplatOrientation('https://r2.example.com/splat.spz?sig=abc');
    expect(capabilityUrl.equals(SPLAT_ORIENTATION)).toBe(true);

    const devOverrideOfSomethingElse = defaultSplatOrientation('/room/xyz/walk.spz');
    expect(devOverrideOfSomethingElse.equals(SPLAT_ORIENTATION)).toBe(true);
  });

  it('returns a fresh instance each call, never the shared singleton by reference', () => {
    // A caller doing `splatMesh.quaternion.copy(orientation)` never mutates it, but
    // `.clone()` here is what keeps that true even if that ever changes.
    const a = defaultSplatOrientation('/other.spz');
    const b = defaultSplatOrientation('/other.spz');
    expect(a).not.toBe(b);
    expect(a.equals(b)).toBe(true);
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
    // what the framing uses — via `frameSplatInterior`, same as calling it directly.
    const built = buildSplatScene(fakeParts(), roomBounds());
    const halfDiagonal = Math.hypot(4, 3) / 2;
    expect(built.framing.target.x).toBeCloseTo(10, 6);
    expect(built.framing.target.y).toBeCloseTo(1.6, 6);
    expect(built.framing.radius).toBeCloseTo(0.35 * halfDiagonal, 6);
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
