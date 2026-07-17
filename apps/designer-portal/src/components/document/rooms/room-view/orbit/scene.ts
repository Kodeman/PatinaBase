/**
 * Room View — Orbit scene builder (Room View program, W3-T6; R107 §3, I71/I73).
 *
 * A PURE, framework-free port of the prototype's `buildOrbit` (room-view-prototype.html
 * L511–573) to a reusable `buildScene(geometry)`. It reads the SAME `RoomGeometry` the
 * Plan projection reads and constructs a plain three.js `Scene` — no @react-three/fiber
 * anywhere (fiber@8 crashes at init under React 19; ruled out in I71). WebGL is never
 * touched here: geometry + material construction is pure math, so the scene builds (and
 * is asserted) in jsdom with no canvas/context.
 *
 * Where the prototype hardcodes its one fixture room's wall runs, this generalizes:
 *   - `solidRuns(len, spans)` splits a wall into the segments NOT covered by any window /
 *     door / opening — each becomes a full-height box; the openings then contribute their
 *     own sill/header boxes so the wall tiles completely.
 *   - windows: a box below the sill (0→sill) + a box above the head (head→wallH) + the
 *     glass frame outline and cross-mullion outline (per prototype).
 *   - doors: a header-only box (h→wallH); NOTHING below (the door leaf is the gap).
 *   - pass-through openings: a header box (h→wallH) ONLY when the scan carries a head
 *     height below the wall; otherwise a clean full-height gap (we never fabricate a head).
 *
 * Coordinate mapping (from the geometry contract): feet, origin NW, x→east, z→south,
 * height→y. A wall running along its (dir) gets `rotation.y = atan2(dirz, dirx)`; the
 * strip is offset onto the room EXTERIOR by thick/2 along the outward normal (the same
 * outward-normal rule plan-primitives.ts uses), so Plan and Orbit place walls identically.
 *
 * Honesty (I73a): ONLY `conf === 'low'` wall runs render with the fainter fill
 * (`fillMatLow`) + dashed edges (`LineDashedMaterial` + `computeLineDistances()`); medium
 * renders solid like high. Detected furniture draws as ~.04-opacity ghost volumes with
 * ghost edges, rotated about their own centre by `rotationDeg`.
 */

import * as THREE from 'three';
import {
  overallDims,
  dist,
  type Pt,
  type RoomGeometry,
  type RoomWall,
} from '@/lib/room-view/geometry';

// ————————————————————————————————————————————————————————————————
// Palette (verbatim from the prototype)
// ————————————————————————————————————————————————————————————————

const OAK = 0x8b7355;
const MOCHA = 0x5c4a3c;
const CREAM = 0xfaf7f2;

export interface BuiltScene {
  scene: THREE.Scene;
  /** Traverses the scene disposing every geometry + material, then empties it. */
  dispose(): void;
}

/**
 * Build the Orbit scene from one `RoomGeometry`. Pure — constructs a `THREE.Scene`
 * and a `dispose()` that frees all GPU-backed resources. Every mesh/line is added as a
 * DIRECT child of the scene (mirroring the prototype), and tagged with `userData`
 * (`role`, `wallIndex`, along-wall `span`) so the shape of the scene is unit-assertable.
 */
export function buildScene(g: RoomGeometry): BuiltScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CREAM);

  const thick = Number.isFinite(g.thick) && g.thick > 0 ? g.thick : 0.45;
  const wallH = Number.isFinite(g.wallH) && g.wallH > 0 ? g.wallH : 8;
  const centroid = floorCentroid(g);

  // Shared materials — the prototype reuses these across every box/line. Collected so
  // dispose() can free them; disposing a shared material more than once is harmless.
  const fillMat = new THREE.MeshBasicMaterial({ color: OAK, transparent: true, opacity: 0.05, depthWrite: false });
  const fillMatLow = new THREE.MeshBasicMaterial({ color: OAK, transparent: true, opacity: 0.025, depthWrite: false });
  const edgeMat = new THREE.LineBasicMaterial({ color: MOCHA, transparent: true, opacity: 0.85 });
  const edgeGhost = new THREE.LineBasicMaterial({ color: OAK, transparent: true, opacity: 0.5 });
  const dashMat = new THREE.LineDashedMaterial({ color: OAK, dashSize: 0.32, gapSize: 0.22, transparent: true, opacity: 0.6 });
  const mullionMat = new THREE.LineBasicMaterial({ color: MOCHA, transparent: true, opacity: 0.35 });
  const floorMat = new THREE.MeshBasicMaterial({ color: OAK, transparent: true, opacity: 0.08, side: THREE.DoubleSide });
  const ghostFillMat = new THREE.MeshBasicMaterial({ color: OAK, transparent: true, opacity: 0.04, depthWrite: false });

  // ——— floor + its edge outline ———
  addFloor(scene, g, floorMat, edgeMat);

  // ——— walls: split each into solid runs + per-opening sill/header boxes ———
  const walls = g.walls ?? [];
  walls.forEach((wall, wi) => {
    const frame = wallFrame(wall, centroid);
    if (!frame) return; // degenerate wall — skip rather than emit NaN

    const box = (span: [number, number], vert: [number, number], role: WallRole) =>
      addWallBox(scene, frame, thick, span, vert, role, wi, {
        fill: frame.low ? fillMatLow : fillMat,
        edge: frame.low ? dashMat : edgeMat,
        dashed: frame.low,
      });

    // openings on this wall, in along-wall [from,to] feet
    const windows = (g.windows ?? []).filter((w) => w.wall === wi);
    const doors = (g.doors ?? []).filter((d) => d.wall === wi);
    const openings = (g.openings ?? []).filter((o) => o.wall === wi);

    const spans: Array<[number, number]> = [
      ...windows.map((w) => spanOf(w.from, w.to)),
      ...doors.map((d) => spanOf(d.from, d.to)),
      ...openings.map((o) => spanOf(o.from, o.to)),
    ];

    // full-height solid runs (the wall minus every opening)
    for (const run of solidRuns(frame.len, spans)) {
      box(run, [0, wallH], 'wall-solid');
    }

    // windows: sill box below, header box above, + frame/cross outlines
    for (const w of windows) {
      const span = spanOf(w.from, w.to);
      const sill = clampH(w.sill, wallH);
      const head = clampH(w.head, wallH);
      if (sill > 0) box(span, [0, sill], 'wall-sill');
      if (head < wallH) box(span, [head, wallH], 'wall-header');
      addWindowFrame(scene, frame, span, sill, head, edgeMat, mullionMat, wi);
    }

    // doors: header-only box above the leaf; the opening below stays a clean gap
    for (const d of doors) {
      const head = clampH(d.h, wallH);
      if (head < wallH) box(spanOf(d.from, d.to), [head, wallH], 'wall-header');
    }

    // pass-through openings: a header ONLY when a head height is known and below the
    // wall — otherwise a full-height gap (never fabricate a head we didn't capture).
    for (const o of openings) {
      const h = o.h;
      if (h != null && Number.isFinite(h) && h > 0 && h < wallH) {
        box(spanOf(o.from, o.to), [h, wallH], 'wall-header');
      }
    }
  });

  // ——— detected furniture ghosts ———
  (g.objects ?? []).forEach((o, oi) => {
    const geo = new THREE.BoxGeometry(safePos(o.w), safePos(o.h), safePos(o.d));
    const yaw = o.rotationDeg ? -THREE.MathUtils.degToRad(o.rotationDeg) : 0;

    const mesh = new THREE.Mesh(geo, ghostFillMat);
    mesh.position.set(o.x + o.w / 2, o.h / 2, o.z + o.d / 2);
    mesh.rotation.y = yaw;
    mesh.userData = { role: 'ghost', objectIndex: oi };
    scene.add(mesh);

    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeGhost);
    edge.position.copy(mesh.position);
    edge.rotation.copy(mesh.rotation);
    edge.userData = { role: 'ghost-edge', objectIndex: oi };
    scene.add(edge);
  });

  return { scene, dispose: () => disposeScene(scene) };
}

// ————————————————————————————————————————————————————————————————
// Wall geometry
// ————————————————————————————————————————————————————————————————

type WallRole = 'wall-solid' | 'wall-sill' | 'wall-header';

interface WallFrameGeom {
  x1: number;
  z1: number;
  /** unit vector along the wall (from start to end) */
  dirx: number;
  dirz: number;
  /** outward (exterior) unit normal */
  nx: number;
  nz: number;
  /** yaw about +y so a box's length axis aligns with the wall */
  yawRad: number;
  len: number;
  low: boolean;
}

function wallFrame(wall: RoomWall, centroid: Pt): WallFrameGeom | null {
  const len = wallLength(wall);
  if (len <= 0) return null;
  const dirx = (wall.x2 - wall.x1) / len;
  const dirz = (wall.z2 - wall.z1) / len;
  const midx = (wall.x1 + wall.x2) / 2;
  const midz = (wall.z1 + wall.z2) / 2;
  const n = outwardNormal(dirx, dirz, midx, midz, centroid);
  return {
    x1: wall.x1,
    z1: wall.z1,
    dirx,
    dirz,
    nx: n.x,
    nz: n.z,
    yawRad: Math.atan2(dirz, dirx),
    len,
    low: wall.conf === 'low',
  };
}

interface BoxMats {
  fill: THREE.Material;
  edge: THREE.Material;
  dashed: boolean;
}

/** One wall box: a fill Mesh + an edge LineSegments, positioned on the wall's exterior
 *  face, spanning [a,b] feet along the wall and [y0,y1] feet in height. */
function addWallBox(
  scene: THREE.Scene,
  frame: WallFrameGeom,
  thick: number,
  [a, b]: [number, number],
  [y0, y1]: [number, number],
  role: WallRole,
  wallIndex: number,
  mats: BoxMats,
): void {
  const lenAlong = b - a;
  const heightY = y1 - y0;
  if (lenAlong <= 0 || heightY <= 0) return;

  const along = (a + b) / 2;
  const clx = frame.x1 + frame.dirx * along;
  const clz = frame.z1 + frame.dirz * along;
  const cx = clx + frame.nx * (thick / 2);
  const cz = clz + frame.nz * (thick / 2);
  const cy = (y0 + y1) / 2;

  const geo = new THREE.BoxGeometry(lenAlong, heightY, thick);

  const mesh = new THREE.Mesh(geo, mats.fill);
  mesh.position.set(cx, cy, cz);
  mesh.rotation.y = frame.yawRad;
  mesh.userData = { role, wallIndex, span: [a, b] as [number, number] };
  scene.add(mesh);

  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), mats.edge);
  edge.position.copy(mesh.position);
  edge.rotation.copy(mesh.rotation);
  if (mats.dashed) edge.computeLineDistances();
  edge.userData = { role: `${role}-edge`, wallIndex, dashed: mats.dashed };
  scene.add(edge);
}

/** The window's glass frame outline + a cross-mullion outline, drawn in the wall plane
 *  on the centreline (no exterior offset — matches the prototype). Always solid line-work
 *  (the glass reads the same regardless of wall confidence). */
function addWindowFrame(
  scene: THREE.Scene,
  frame: WallFrameGeom,
  [a, b]: [number, number],
  sill: number,
  head: number,
  edgeMat: THREE.Material,
  mullionMat: THREE.Material,
  wallIndex: number,
): void {
  const spanLen = b - a;
  const fh = head - sill;
  if (spanLen <= 0 || fh <= 0) return;

  const along = (a + b) / 2;
  const clx = frame.x1 + frame.dirx * along;
  const clz = frame.z1 + frame.dirz * along;
  const cy = (sill + head) / 2;

  const frameGeo = new THREE.PlaneGeometry(spanLen, fh);
  const frameLine = new THREE.LineSegments(new THREE.EdgesGeometry(frameGeo), edgeMat);
  frameLine.rotation.y = frame.yawRad;
  frameLine.position.set(clx, cy, clz);
  frameLine.userData = { role: 'window-frame', wallIndex };
  scene.add(frameLine);

  const crossGeo = new THREE.PlaneGeometry(spanLen / 2, fh);
  const crossLine = new THREE.LineSegments(new THREE.EdgesGeometry(crossGeo), mullionMat);
  crossLine.rotation.y = frame.yawRad;
  crossLine.position.set(clx, cy, clz);
  crossLine.userData = { role: 'window-cross', wallIndex };
  scene.add(crossLine);
}

// ————————————————————————————————————————————————————————————————
// Floor
// ————————————————————————————————————————————————————————————————

function addFloor(
  scene: THREE.Scene,
  g: RoomGeometry,
  floorMat: THREE.Material,
  edgeMat: THREE.Material,
): void {
  let geo: THREE.BufferGeometry;
  let rotX: number;
  let pos: Pt & { y: number };

  if (g.floor && g.floor.length >= 3) {
    // Non-rectangular polygon → a Shape in the shape's XY plane using the floor's
    // absolute (x,z). Rotating +π/2 about X maps a shape point (x, z) → world (x, 0, z),
    // so no position offset is needed. DoubleSide material makes it visible from above
    // regardless of the resulting face normal.
    const shape = new THREE.Shape();
    g.floor.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, p.z) : shape.lineTo(p.x, p.z)));
    shape.closePath();
    geo = new THREE.ShapeGeometry(shape);
    rotX = Math.PI / 2;
    pos = { x: 0, y: 0, z: 0 };
  } else {
    // Rectangular fallback — the prototype's exact PlaneGeometry placement.
    const { w, d } = overallDims(g);
    geo = new THREE.PlaneGeometry(safePos(w), safePos(d));
    rotX = -Math.PI / 2;
    pos = { x: w / 2, y: 0, z: d / 2 };
  }

  const floor = new THREE.Mesh(geo, floorMat);
  floor.rotation.x = rotX;
  floor.position.set(pos.x, pos.y, pos.z);
  floor.userData = { role: 'floor' };
  scene.add(floor);

  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
  edge.rotation.x = rotX;
  edge.position.set(pos.x, pos.y, pos.z);
  edge.userData = { role: 'floor-edge' };
  scene.add(edge);
}

// ————————————————————————————————————————————————————————————————
// Run splitting + shared math
// ————————————————————————————————————————————————————————————————

/**
 * The solid segments of a wall of length `len`, i.e. [0,len] minus the union of every
 * opening `span`. Spans are clamped to [0,len], sorted, and merged before complementing,
 * so overlapping or out-of-range openings can't produce negative-length or NaN runs.
 */
export function solidRuns(len: number, spans: Array<[number, number]>): Array<[number, number]> {
  if (!(len > 0)) return [];
  const clamped = spans
    .map(([a, b]) => [Math.max(0, Math.min(a, b)), Math.min(len, Math.max(a, b))] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((p, q) => p[0] - q[0]);

  const merged: Array<[number, number]> = [];
  for (const [a, b] of clamped) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }

  const runs: Array<[number, number]> = [];
  let cursor = 0;
  for (const [a, b] of merged) {
    if (a > cursor) runs.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < len) runs.push([cursor, len]);
  return runs;
}

/** Perpendicular unit normal to (dirx,dirz) pointing AWAY from the room centroid — the
 *  same exterior-facing rule plan-primitives.ts uses, so Plan and Orbit agree on which
 *  side of the centreline the wall thickness lands on. */
function outwardNormal(dirx: number, dirz: number, atx: number, atz: number, centroid: Pt): Pt {
  const px = -dirz;
  const pz = dirx;
  const dot = px * (centroid.x - atx) + pz * (centroid.z - atz);
  return dot > 0 ? { x: -px, z: -pz } : { x: px, z: pz };
}

function floorCentroid(g: RoomGeometry): Pt {
  if (g.floor && g.floor.length >= 3) {
    let sx = 0;
    let sz = 0;
    for (const p of g.floor) {
      sx += p.x;
      sz += p.z;
    }
    return { x: sx / g.floor.length, z: sz / g.floor.length };
  }
  const { w, d } = overallDims(g);
  return { x: w / 2, z: d / 2 };
}

function wallLength(wall: RoomWall): number {
  if (Number.isFinite(wall.len) && wall.len > 0) return wall.len;
  return dist(wall.x1, wall.z1, wall.x2, wall.z2);
}

function spanOf(from: number, to: number): [number, number] {
  return [Math.min(from, to), Math.max(from, to)];
}

function clampH(v: number | null | undefined, wallH: number): number {
  if (v == null || !Number.isFinite(v)) return wallH;
  return Math.max(0, Math.min(wallH, v));
}

function safePos(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0.001;
}

// ————————————————————————————————————————————————————————————————
// Disposal
// ————————————————————————————————————————————————————————————————

/** Traverse every object, dispose its geometry + material(s), then empty the scene. */
function disposeScene(scene: THREE.Scene): void {
  scene.traverse((obj) => {
    const holder = obj as THREE.Mesh | THREE.LineSegments;
    holder.geometry?.dispose?.();
    const mat = holder.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose?.();
  });
  scene.clear();
}
