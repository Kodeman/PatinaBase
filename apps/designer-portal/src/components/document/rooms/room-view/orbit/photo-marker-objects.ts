/**
 * Room View — Orbit photo-frustum markers (Room View PHOTOS program, W3-T7; I76
 * "the drawing knows where you stood", the room-as-a-volume face).
 *
 * The Orbit counterpart to the Plan's camera ticks (photo-markers.tsx): for each
 * proximity cluster of posed photos it builds a small camera-frustum wedge sitting
 * at the pose position + height, opening along the pose heading — a quiet locator
 * in the same Aged-Oak line-work the scene's edges already use, so a photo reads
 * where it was taken relative to the walls/objects already drawn.
 *
 * PURE + framework-free — plain three.js, no @react-three/fiber, no DOM, no React.
 * Geometry + material construction is math only, so the whole marker set builds
 * (and is unit-asserted) in jsdom with no WebGL context, exactly like scene.ts.
 * `orbit-canvas.tsx` owns adding the returned group to the live scene and the
 * pointer→raycast plumbing; this module owns the objects + their disposal.
 *
 * ─── COORDINATE MAPPING (matches scene.ts) ──────────────────────────────────
 * Plan feet → three.js: plan x → x, plan z → z, height → y. A pose's heading is
 * photo-poses.ts's convention (0° = +x east, 90° = +z south, CLOCKWISE on a
 * north-up plan). The wedge's forward axis is therefore
 *     forward = (cos θ, 0, sin θ)          θ = headingDeg in radians
 * so heading 0° opens toward +x and heading 90° toward +z — identical facing to
 * the Plan tick and to an object's rotation_deg of the same value.
 *
 * The pose `y` is world-height-in-feet (world-origin-relative — the provenance
 * carries no floor datum; see photo-poses.ts header). We treat it as height above
 * the floor for placement; a camera held at ~5 ft lands its apex at y≈5, which is
 * the honest, useful read in a room whose floor sits at y=0.
 *
 * ─── RAYCAST TARGET (documented technique) ──────────────────────────────────
 * The visible wedge is thin line-work — a poor click target. Each marker therefore
 * carries an INVISIBLE hit sphere at its apex: a normal `THREE.Mesh` whose MATERIAL
 * has `visible = false` (renderer skips drawing it) while the OBJECT stays
 * `visible = true` (three's Raycaster does not gate on object visibility, and Mesh
 * raycasting ignores material.visible — so the sphere is never drawn yet always
 * hit). `markerMeshes` returns these, paired with the photo index the viewer opens.
 */

import * as THREE from 'three';

/** Aged-Oak — the scene's ghost/edge line colour (scene.ts `OAK`). */
const OAK = 0x8b7355;

/** One Orbit marker's input: a clustered pose in plan feet + the photo it opens. */
export interface OrbitPhotoPose {
  /** plan x, feet (→ three x / east) */
  x: number;
  /** plan z, feet (→ three z / south) */
  z: number;
  /** camera height, feet (world-origin-relative — treat as height above floor) */
  y: number;
  /** heading per photo-poses.ts (0° = +x east, 90° = +z south, CLOCKWISE) */
  headingDeg: number;
  /** members in this proximity cluster (≥1) — >1 gets the doubled cross-section */
  count: number;
  /** index into the ORIGINAL photos array the viewer opens at (cluster representative) */
  photoIndex: number;
}

export interface BuildPhotoMarkersOptions {
  /** wedge depth (apex → far plane) along heading, feet */
  depthFt?: number;
  /** far-plane half-width along the wedge's right axis, feet */
  spreadFt?: number;
  /** far-plane half-height along +y, feet */
  riseFt?: number;
  /** apex-dot radius, feet */
  dotRadiusFt?: number;
  /** invisible hit-sphere radius, feet (the click target around the apex) */
  hitRadiusFt?: number;
  /** line colour (defaults to Aged-Oak) */
  color?: number;
}

/** A marker's raycast target, paired with the photo it opens. */
export interface OrbitMarkerMesh {
  mesh: THREE.Mesh;
  photoIndex: number;
}

export interface BuiltPhotoMarkers {
  /** all marker objects (wedge line, apex dot, invisible hit sphere) as one group */
  group: THREE.Group;
  /** the invisible hit spheres, in input order — raycast these, open `photoIndex` */
  markerMeshes: OrbitMarkerMesh[];
  /** disposes every geometry + material this builder created, then empties the group */
  dispose(): void;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * The wedge's forward unit axis in three.js world space for a plan heading.
 * heading 0° → (1,0,0) (+x east); 90° → (0,0,1) (+z south). Pure — the heading
 * math the tests pin.
 */
export function frustumForward(headingDeg: number): Vec3 {
  const r = (headingDeg * Math.PI) / 180;
  return { x: Math.cos(r), y: 0, z: Math.sin(r) };
}

/** The wedge's horizontal right unit axis: forward rotated +90° about +y in the
 *  plan sense, i.e. plan (cosθ, sinθ) → (−sinθ, cosθ). */
function frustumRight(headingDeg: number): Vec3 {
  const r = (headingDeg * Math.PI) / 180;
  return { x: -Math.sin(r), y: 0, z: Math.cos(r) };
}

/**
 * True when the pointer moved less than `thresholdPx` between down and up — i.e.
 * this was a click, not an orbit-drag. Pure; the click-vs-drag gate the canvas
 * uses and the tests pin. Chebyshev/Euclidean agnostic: uses Euclidean distance.
 */
export function pointerMovedWithin(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  thresholdPx: number,
): boolean {
  return Math.hypot(bx - ax, by - ay) < thresholdPx;
}

/**
 * Nearest photo index under a configured raycaster, or null. `meshes` are the
 * invisible hit spheres (each tagged `userData.photoIndex`). `intersectObjects`
 * returns hits sorted near→far, so the first carries the front-most marker. Pure
 * given a raycaster — the intersection→index step the tests pin.
 */
export function pickPhotoIndex(
  raycaster: THREE.Raycaster,
  meshes: THREE.Object3D[],
): number | null {
  const hits = raycaster.intersectObjects(meshes, false);
  if (hits.length === 0) return null;
  const idx = hits[0].object.userData?.photoIndex;
  return typeof idx === 'number' ? idx : null;
}

/**
 * Build the Orbit photo-frustum markers for a set of clustered poses. Returns an
 * empty group (no meshes) for an empty input, so an unposed / photoless room costs
 * nothing. Every marker adds three DIRECT children to the group — the wedge
 * `LineSegments`, the apex-dot `Mesh`, and the invisible hit `Mesh` — each tagged
 * with `userData.role` (+ `photoIndex`, `count`) so the group's shape is
 * unit-assertable without WebGL.
 */
export function buildPhotoMarkers(
  poses: OrbitPhotoPose[],
  opts: BuildPhotoMarkersOptions = {},
): BuiltPhotoMarkers {
  const depth = opts.depthFt ?? 1.2;
  const spread = opts.spreadFt ?? 0.5;
  const rise = opts.riseFt ?? 0.36;
  const dotR = opts.dotRadiusFt ?? 0.07;
  const hitR = opts.hitRadiusFt ?? 0.9;
  const color = opts.color ?? OAK;

  const group = new THREE.Group();
  group.userData = { role: 'photo-markers' };
  const markerMeshes: OrbitMarkerMesh[] = [];

  // Shared resources — one of each, positioned per marker. Collected for dispose().
  const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
  const dotMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const dotGeo = new THREE.SphereGeometry(dotR, 6, 4);
  const hitGeo = new THREE.SphereGeometry(hitR, 8, 6);

  // Per-marker wedge geometries (unique vertices) — disposed individually.
  const wedgeGeos: THREE.BufferGeometry[] = [];

  poses.forEach((pose, i) => {
    const apex: Vec3 = { x: pose.x, y: pose.y, z: pose.z };
    const f = frustumForward(pose.headingDeg);
    const r = frustumRight(pose.headingDeg);

    // Far-plane centre + its four corners (TR, TL, BL, BR).
    const cx = apex.x + f.x * depth;
    const cy = apex.y + f.y * depth;
    const cz = apex.z + f.z * depth;
    const corner = (sw: number, sh: number): Vec3 => ({
      x: cx + r.x * spread * sw,
      y: cy + rise * sh,
      z: cz + r.z * spread * sw,
    });
    const tr = corner(1, 1);
    const tl = corner(-1, 1);
    const bl = corner(-1, -1);
    const br = corner(1, -1);

    // Segment list. Base wedge = 4 apex rays + 4 far-rect edges (8). A cluster of
    // >1 adds a mid cross-section rectangle at 0.6 depth (+4 → 12) — the "second
    // tick" that reads as more-than-one, quiet + in-kind (linewidth is a no-op on
    // most WebGL, so density carries the weight instead).
    const seg: Vec3[] = [
      apex, tr, apex, tl, apex, bl, apex, br, // 4 rays
      tr, tl, tl, bl, bl, br, br, tr, // far rectangle
    ];
    if (pose.count > 1) {
      const lerp = (p: Vec3, t: number): Vec3 => ({
        x: apex.x + (p.x - apex.x) * t,
        y: apex.y + (p.y - apex.y) * t,
        z: apex.z + (p.z - apex.z) * t,
      });
      const mtr = lerp(tr, 0.6);
      const mtl = lerp(tl, 0.6);
      const mbl = lerp(bl, 0.6);
      const mbr = lerp(br, 0.6);
      seg.push(mtr, mtl, mtl, mbl, mbl, mbr, mbr, mtr); // mid rectangle
    }

    const positions = new Float32Array(seg.length * 3);
    seg.forEach((p, k) => {
      positions[k * 3] = p.x;
      positions[k * 3 + 1] = p.y;
      positions[k * 3 + 2] = p.z;
    });
    const wedgeGeo = new THREE.BufferGeometry();
    wedgeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    wedgeGeos.push(wedgeGeo);

    const wedge = new THREE.LineSegments(wedgeGeo, lineMat);
    wedge.userData = { role: 'photo-frustum', photoIndex: pose.photoIndex, count: pose.count, markerIndex: i };
    group.add(wedge);

    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(apex.x, apex.y, apex.z);
    dot.userData = { role: 'photo-apex', photoIndex: pose.photoIndex, markerIndex: i };
    group.add(dot);

    // Invisible-but-raycastable hit target (see file header). Object stays visible;
    // its material does not draw. Sits at the apex — clicking near the camera opens it.
    const hit = new THREE.Mesh(hitGeo, hitMat);
    hit.position.set(apex.x, apex.y, apex.z);
    hit.userData = { role: 'photo-hit', photoIndex: pose.photoIndex, markerIndex: i };
    group.add(hit);
    markerMeshes.push({ mesh: hit, photoIndex: pose.photoIndex });
  });

  const dispose = () => {
    for (const g of wedgeGeos) g.dispose();
    dotGeo.dispose();
    hitGeo.dispose();
    lineMat.dispose();
    dotMat.dispose();
    hitMat.dispose();
    group.clear();
  };

  return { group, markerMeshes, dispose };
}
