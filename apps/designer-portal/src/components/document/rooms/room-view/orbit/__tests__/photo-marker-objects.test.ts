/**
 * Orbit photo-frustum markers — pure unit tests (W3-T7, I76). three builds the
 * geometry/materials in jsdom with no WebGL context, and its Raycaster is pure
 * math, so the whole marker set — object counts, per-wedge segment counts, the
 * heading→geometry mapping, raycast targeting, and clean disposal — is fully
 * assertable here. Also pins the two pure pick helpers (click-vs-drag gate,
 * intersection→index).
 */

import * as THREE from 'three';
import {
  buildPhotoMarkers,
  frustumForward,
  pickPhotoIndex,
  pointerMovedWithin,
  type OrbitPhotoPose,
} from '../photo-marker-objects';

type Tagged = THREE.Object3D & { userData: Record<string, unknown> };

const byRole = (group: THREE.Group, role: string) =>
  group.children.filter((c) => (c as Tagged).userData.role === role);

/** A wedge line's segment count = its position vertices ÷ 2 (LineSegments pairs). */
const segCount = (line: THREE.LineSegments) =>
  (line.geometry.getAttribute('position').count as number) / 2;

function pose(partial: Partial<OrbitPhotoPose> = {}): OrbitPhotoPose {
  return { x: 3, y: 4, z: 5, headingDeg: 0, count: 1, photoIndex: 0, ...partial };
}

describe('frustumForward — heading convention', () => {
  it('opens toward +x at 0° and +z at 90° (photo-poses convention)', () => {
    const f0 = frustumForward(0);
    expect(f0.x).toBeCloseTo(1, 6);
    expect(f0.y).toBeCloseTo(0, 6);
    expect(f0.z).toBeCloseTo(0, 6);

    const f90 = frustumForward(90);
    expect(f90.x).toBeCloseTo(0, 6);
    expect(f90.z).toBeCloseTo(1, 6);

    const f180 = frustumForward(180);
    expect(f180.x).toBeCloseTo(-1, 6);
    expect(f180.z).toBeCloseTo(0, 6);
  });
});

describe('buildPhotoMarkers — group shape', () => {
  it('emits one wedge + one apex dot + one hit sphere per pose (clusters honored)', () => {
    const poses = [pose({ photoIndex: 0 }), pose({ x: 9, photoIndex: 3, count: 2 }), pose({ z: 1, photoIndex: 5 })];
    const { group, markerMeshes } = buildPhotoMarkers(poses);

    expect(byRole(group, 'photo-frustum')).toHaveLength(3);
    expect(byRole(group, 'photo-apex')).toHaveLength(3);
    expect(byRole(group, 'photo-hit')).toHaveLength(3);
    // raycast-target count == cluster count
    expect(markerMeshes).toHaveLength(3);
    // each hit mesh carries the photo index its click opens
    expect(markerMeshes.map((m) => m.photoIndex)).toEqual([0, 3, 5]);
  });

  it('builds no meshes for an empty pose set (photoless room = zero cost)', () => {
    const { group, markerMeshes } = buildPhotoMarkers([]);
    expect(group.children).toHaveLength(0);
    expect(markerMeshes).toHaveLength(0);
  });

  it('a single-photo wedge is 8 segments; a cluster (count>1) adds a mid cross-section → 12', () => {
    const single = buildPhotoMarkers([pose({ count: 1 })]);
    const many = buildPhotoMarkers([pose({ count: 4 })]);
    expect(segCount(byRole(single.group, 'photo-frustum')[0] as THREE.LineSegments)).toBe(8);
    expect(segCount(byRole(many.group, 'photo-frustum')[0] as THREE.LineSegments)).toBe(12);
  });

  it('places the hit sphere at the pose apex (three: plan x→x, z→z, height→y)', () => {
    const { markerMeshes } = buildPhotoMarkers([pose({ x: 3, y: 4, z: 5 })]);
    const p = markerMeshes[0].mesh.position;
    expect(p.x).toBeCloseTo(3, 6);
    expect(p.y).toBeCloseTo(4, 6);
    expect(p.z).toBeCloseTo(5, 6);
  });
});

describe('buildPhotoMarkers — heading geometry', () => {
  it('a heading-0° wedge opens toward +x (far plane at apex.x + depth)', () => {
    const depthFt = 1.2;
    const { group } = buildPhotoMarkers([pose({ x: 0, y: 0, z: 0, headingDeg: 0, count: 1 })], { depthFt });
    const wedge = byRole(group, 'photo-frustum')[0] as THREE.LineSegments;
    const pos = wedge.geometry.getAttribute('position');

    let minX = Infinity;
    let maxX = -Infinity;
    let maxAbsZ = 0;
    for (let i = 0; i < pos.count; i++) {
      minX = Math.min(minX, pos.getX(i));
      maxX = Math.max(maxX, pos.getX(i));
      maxAbsZ = Math.max(maxAbsZ, Math.abs(pos.getZ(i)));
    }
    // apex sits at x=0, the entire far plane at x=+depth → opens toward +x
    expect(minX).toBeCloseTo(0, 6);
    expect(maxX).toBeCloseTo(depthFt, 6);
    // and it spreads across z (the far-plane width), never into −x
    expect(maxAbsZ).toBeGreaterThan(0);
  });

  it('a heading-90° wedge opens toward +z instead', () => {
    const depthFt = 1.2;
    const { group } = buildPhotoMarkers([pose({ x: 0, y: 0, z: 0, headingDeg: 90, count: 1 })], { depthFt });
    const wedge = byRole(group, 'photo-frustum')[0] as THREE.LineSegments;
    const pos = wedge.geometry.getAttribute('position');

    let maxZ = -Infinity;
    let maxAbsX = 0;
    for (let i = 0; i < pos.count; i++) {
      maxZ = Math.max(maxZ, pos.getZ(i));
      maxAbsX = Math.max(maxAbsX, Math.abs(pos.getX(i)));
    }
    expect(maxZ).toBeCloseTo(depthFt, 6);
    expect(maxAbsX).toBeGreaterThan(0); // spread now lives on x
  });
});

describe('buildPhotoMarkers — disposal', () => {
  it('empties the group and disposes every geometry + material', () => {
    const geoSpy = jest.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const matSpy = jest.spyOn(THREE.Material.prototype, 'dispose');

    const { group, dispose } = buildPhotoMarkers([pose({ count: 1 }), pose({ x: 9, count: 3 })]);
    expect(group.children.length).toBeGreaterThan(0);

    dispose();

    expect(group.children).toHaveLength(0);
    expect(geoSpy).toHaveBeenCalled();
    expect(matSpy).toHaveBeenCalled();

    geoSpy.mockRestore();
    matSpy.mockRestore();
  });
});

describe('pointerMovedWithin — click-vs-drag gate', () => {
  it('is true only when the press stayed under the slop radius', () => {
    expect(pointerMovedWithin(100, 100, 102, 101, 5)).toBe(true); // ~2.2px → click
    expect(pointerMovedWithin(100, 100, 100, 100, 5)).toBe(true); // no move → click
    expect(pointerMovedWithin(100, 100, 110, 100, 5)).toBe(false); // 10px → drag
    expect(pointerMovedWithin(100, 100, 104, 104, 5)).toBe(false); // ~5.66px → drag
  });
});

describe('pickPhotoIndex — intersection → photo index', () => {
  it('returns the photoIndex of the hit sphere under the ray, null when it misses', () => {
    const poses = [
      pose({ x: 5, y: 4, z: 5, photoIndex: 2 }),
      pose({ x: 40, y: 4, z: 40, photoIndex: 7 }), // far away — not under the ray
    ];
    const { group, markerMeshes } = buildPhotoMarkers(poses);
    group.updateMatrixWorld(true); // the renderer keeps this fresh in-app; the raycaster reads it
    const meshes = markerMeshes.map((m) => m.mesh);

    // A ray straight down through the first apex (three: x=5, z=5, above at y=40).
    const hitRay = new THREE.Raycaster(new THREE.Vector3(5, 40, 5), new THREE.Vector3(0, -1, 0));
    expect(pickPhotoIndex(hitRay, meshes)).toBe(2);

    // A ray through empty space hits nothing.
    const missRay = new THREE.Raycaster(new THREE.Vector3(100, 40, 100), new THREE.Vector3(0, -1, 0));
    expect(pickPhotoIndex(missRay, meshes)).toBeNull();
  });

  it('returns the nearest marker when the ray could reach more than one', () => {
    const poses = [
      pose({ x: 0, y: 0, z: 0, photoIndex: 1 }), // nearer to a camera above
      pose({ x: 0, y: -10, z: 0, photoIndex: 9 }), // same column, further down
    ];
    const { group, markerMeshes } = buildPhotoMarkers(poses);
    group.updateMatrixWorld(true);
    const meshes = markerMeshes.map((m) => m.mesh);
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 20, 0), new THREE.Vector3(0, -1, 0));
    // Both spheres sit on the ray; the nearer (y=0) wins.
    expect(pickPhotoIndex(ray, meshes)).toBe(1);
  });
});
