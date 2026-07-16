/**
 * Room View — Plan primitives.
 *
 * A pure, renderer-agnostic port of the prototype's `drawPlan` (room-view-prototype.html
 * L406–458) as DATA in FEET-SPACE. There is no SCALE / PAD here — the renderer owns the
 * single screen transform. Both the roster thumbnails and the interactive Plan projection
 * consume this same list.
 *
 * Rulings applied (DECISIONS.md):
 *   - I73(a): only conf === 'low' sets `lowConf` (medium renders like high).
 *   - I73(b): a door swing arc is emitted ONLY when `swing` is present — never fabricated.
 *   - I73(d): wall thickness is a drawing convention; strips are drawn at `g.thick`
 *             (default 0.45 ft set by the adapter).
 *   - R107 §2/§4: confidence renders honestly; detected furniture ghosts with its category.
 *
 * Output order is fixed and deterministic (no randomness, no sorting on identity):
 *   floor · wallStrips · (windowClear, windowLines)* · (doorClear, doorLeaf, doorSwingArc?)* ·
 *   ghostObject* · dimLabel×2
 *
 * Wall handling: the prototype is axis-aligned and hardcodes strip rects. Here every wall
 * strip is emitted as an OrientedRect (center + size + yaw), so slightly-off-axis walls
 * (the parser de-rotates to the dominant orientation, so near-axis is the expected case)
 * stay correct and never produce NaN. The strip is offset to the room's EXTERIOR — the
 * outward normal is chosen as the wall perpendicular pointing away from the floor centroid.
 */

import {
  type RoomGeometry,
  type RoomWall,
  type OrientedRect,
  type Pt,
  dist,
  ftIn,
  overallDims,
} from './geometry';

// ————————————————————————————————————————————————————————————————
// Primitive union
// ————————————————————————————————————————————————————————————————

export interface Seg {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

export interface FloorPrimitive {
  kind: 'floor';
  /** polygon vertices, feet; for the rect fallback these are the 4 corners */
  points: Pt[];
  /** true when the points came from a real floor polygon; false = bounding-rect fallback */
  fromPolygon: boolean;
}

export interface WallStripPrimitive {
  kind: 'wallStrip';
  wallIndex: number;
  name: string;
  rect: OrientedRect;
  /** ONLY conf === 'low' (I73a). Renderer draws lighter fill + inner dashed stroke. */
  lowConf: boolean;
  /** hover tip built via ftIn */
  tip: string;
}

export interface WindowClearPrimitive {
  kind: 'windowClear';
  windowIndex: number;
  wallIndex: number;
  /** the wall-strip zone to paint in the background colour (clears the wall for glass) */
  rect: OrientedRect;
  /** hover tip built via ftIn (this is the window's hover target) */
  tip: string;
}

export interface WindowLinesPrimitive {
  kind: 'windowLines';
  windowIndex: number;
  wallIndex: number;
  /** three parallel glass lines across the thickness (inner, middle, outer) */
  lines: [Seg, Seg, Seg];
}

export interface DoorClearPrimitive {
  kind: 'doorClear';
  doorIndex: number;
  wallIndex: number;
  rect: OrientedRect;
  /** hover tip built via ftIn (this is the door's hover target) */
  tip: string;
}

export interface DoorLeafPrimitive {
  kind: 'doorLeaf';
  doorIndex: number;
  wallIndex: number;
  /** the open leaf, from the hinge jamb perpendicular into (or out of) the room */
  line: Seg;
}

export interface DoorSwingArcPrimitive {
  kind: 'doorSwingArc';
  doorIndex: number;
  wallIndex: number;
  /** arc centre = hinge jamb */
  cx: number;
  cz: number;
  radius: number;
  /** leaf tip */
  start: Pt;
  /** far jamb on the wall */
  end: Pt;
  /** SVG-style flags, precomputed so any renderer can draw the same arc */
  largeArcFlag: 0 | 1;
  sweepFlag: 0 | 1;
}

export interface GhostObjectPrimitive {
  kind: 'ghostObject';
  objectIndex: number;
  cat: string;
  label: string;
  rect: OrientedRect;
  /** category label anchor (footprint centre) */
  labelAnchor: Pt;
  /** conf === 'low' (I73a) — renderer draws the ghost lighter/dashed */
  lowConf: boolean;
  /** hover tip = the object's label */
  tip: string;
}

export interface DimLabelPrimitive {
  kind: 'dimLabel';
  axis: 'width' | 'depth';
  text: string;
  x: number;
  z: number;
  angleDeg: number;
}

export type PlanPrimitive =
  | FloorPrimitive
  | WallStripPrimitive
  | WindowClearPrimitive
  | WindowLinesPrimitive
  | DoorClearPrimitive
  | DoorLeafPrimitive
  | DoorSwingArcPrimitive
  | GhostObjectPrimitive
  | DimLabelPrimitive;

export interface PlanPrimitivesOptions {
  /** suppress detected-furniture ghosts (used by scenarios that render the empty box) */
  hideObjects?: boolean;
}

/** quiet-label offset off the exterior face, feet (cosmetic; ≈ the prototype's 10–12px) */
const DIM_OFFSET_FT = 0.4;

// ————————————————————————————————————————————————————————————————
// Entry point
// ————————————————————————————————————————————————————————————————

export function planPrimitives(g: RoomGeometry, opts: PlanPrimitivesOptions = {}): PlanPrimitive[] {
  const out: PlanPrimitive[] = [];
  const thick = Number.isFinite(g.thick) && g.thick > 0 ? g.thick : 0.45;
  const centroid = floorCentroid(g);

  // ——— floor ———
  out.push(floorPrimitive(g));

  // ——— wall strips ———
  const walls = g.walls ?? [];
  walls.forEach((wall, i) => {
    const strip = wallStrip(wall, i, thick, centroid);
    if (strip) out.push(strip);
  });

  // ——— windows: clear the wall + triple glass lines ———
  (g.windows ?? []).forEach((win, wi) => {
    const wall = walls[win.wall];
    if (!wall) return; // bad ref — adapter should have dropped it; stay silent + deterministic
    const geom = openingGeom(wall, win.from, win.to, thick, centroid);
    if (!geom) return;
    const width = Math.abs(win.to - win.from);

    out.push({
      kind: 'windowClear',
      windowIndex: wi,
      wallIndex: win.wall,
      rect: geom.zone,
      tip: `window — ${ftIn(width)} wide · sill ${ftIn(win.sill)}`,
    });
    out.push({
      kind: 'windowLines',
      windowIndex: wi,
      wallIndex: win.wall,
      lines: glassLines(geom, thick),
    });
  });

  // ——— doors: clear + leaf + optional swing arc ———
  (g.doors ?? []).forEach((door, di) => {
    const wall = walls[door.wall];
    if (!wall) return;
    const geom = openingGeom(wall, door.from, door.to, thick, centroid);
    if (!geom) return;
    const width = Math.abs(door.to - door.from);

    out.push({
      kind: 'doorClear',
      doorIndex: di,
      wallIndex: door.wall,
      rect: geom.zone,
      tip: `door — ${ftIn(width)} wide`,
    });

    const leaf = doorLeaf(geom, door, width);
    out.push({ kind: 'doorLeaf', doorIndex: di, wallIndex: door.wall, line: leaf.line });

    // I73(b): arc ONLY when the data carries a hinge direction.
    if (door.swing === 'left' || door.swing === 'right') {
      out.push(doorSwingArc(di, door.wall, leaf, width));
    }
  });

  // ——— detected furniture ghosts ———
  if (!opts.hideObjects) {
    (g.objects ?? []).forEach((o, oi) => {
      const rect: OrientedRect = {
        cx: o.x + o.w / 2,
        cz: o.z + o.d / 2,
        w: o.w,
        d: o.d,
        angleDeg: o.rotationDeg ?? 0,
      };
      out.push({
        kind: 'ghostObject',
        objectIndex: oi,
        cat: o.cat,
        label: o.label,
        rect,
        labelAnchor: { x: rect.cx, z: rect.cz },
        lowConf: o.conf === 'low',
        tip: o.label,
      });
    });
  }

  // ——— the two quiet overall dimensions ———
  const { w, d } = overallDims(g);
  out.push({
    kind: 'dimLabel',
    axis: 'width',
    text: ftIn(w),
    x: w / 2,
    z: -thick - DIM_OFFSET_FT,
    angleDeg: 0,
  });
  out.push({
    kind: 'dimLabel',
    axis: 'depth',
    text: ftIn(d),
    x: -thick - DIM_OFFSET_FT,
    z: d / 2,
    angleDeg: -90,
  });

  return out;
}

// ————————————————————————————————————————————————————————————————
// Internals
// ————————————————————————————————————————————————————————————————

function floorPrimitive(g: RoomGeometry): FloorPrimitive {
  if (g.floor && g.floor.length >= 3) {
    return { kind: 'floor', points: g.floor.map((p) => ({ x: p.x, z: p.z })), fromPolygon: true };
  }
  const { w, d } = overallDims(g);
  return {
    kind: 'floor',
    points: [
      { x: 0, z: 0 },
      { x: w, z: 0 },
      { x: w, z: d },
      { x: 0, z: d },
    ],
    fromPolygon: false,
  };
}

function wallStrip(
  wall: RoomWall,
  index: number,
  thick: number,
  centroid: Pt,
): WallStripPrimitive | null {
  const len = wallLength(wall);
  if (len <= 0) return null; // degenerate — skip rather than emit NaN

  const dirx = (wall.x2 - wall.x1) / len;
  const dirz = (wall.z2 - wall.z1) / len;
  const midx = (wall.x1 + wall.x2) / 2;
  const midz = (wall.z1 + wall.z2) / 2;
  const n = outwardNormal(dirx, dirz, midx, midz, centroid);

  const rect: OrientedRect = {
    // offset the strip fully onto the exterior side (inner edge on the wall centreline)
    cx: midx + n.x * (thick / 2),
    cz: midz + n.z * (thick / 2),
    // extend by `thick` at each end so corners of a closed loop fill cleanly
    w: len + 2 * thick,
    d: thick,
    angleDeg: (Math.atan2(dirz, dirx) * 180) / Math.PI,
  };

  const lowConf = wall.conf === 'low';
  const tip = `${wall.name} — ${ftIn(len)}${lowConf ? ' · low confidence — verify on site' : ''}`;
  return { kind: 'wallStrip', wallIndex: index, name: wall.name, rect, lowConf, tip };
}

interface OpeningGeom {
  /** opening start point on the wall centreline */
  startX: number;
  startZ: number;
  /** opening end point on the wall centreline */
  endX: number;
  endZ: number;
  /** unit vector along the wall */
  dirx: number;
  dirz: number;
  /** outward (exterior) unit normal */
  nx: number;
  nz: number;
  /** the wall-strip zone covering the opening (an OrientedRect) */
  zone: OrientedRect;
}

/** Compute the along-wall geometry for an opening spanning [from, to] feet from the wall start. */
function openingGeom(
  wall: RoomWall,
  from: number,
  to: number,
  thick: number,
  centroid: Pt,
): OpeningGeom | null {
  const len = wallLength(wall);
  if (len <= 0) return null;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;

  const dirx = (wall.x2 - wall.x1) / len;
  const dirz = (wall.z2 - wall.z1) / len;
  const a = Math.min(from, to);
  const b = Math.max(from, to);
  const width = b - a;

  const startX = wall.x1 + dirx * a;
  const startZ = wall.z1 + dirz * a;
  const endX = wall.x1 + dirx * b;
  const endZ = wall.z1 + dirz * b;
  const midx = (startX + endX) / 2;
  const midz = (startZ + endZ) / 2;
  const n = outwardNormal(dirx, dirz, midx, midz, centroid);

  const zone: OrientedRect = {
    cx: midx + n.x * (thick / 2),
    cz: midz + n.z * (thick / 2),
    w: width,
    d: thick,
    angleDeg: (Math.atan2(dirz, dirx) * 180) / Math.PI,
  };

  return { startX, startZ, endX, endZ, dirx, dirz, nx: n.x, nz: n.z, zone };
}

/** Three glass lines across the wall thickness (inner @0, middle @thick/2, outer @thick). */
function glassLines(g: OpeningGeom, thick: number): [Seg, Seg, Seg] {
  const line = (offset: number): Seg => ({
    x1: g.startX + g.nx * offset,
    z1: g.startZ + g.nz * offset,
    x2: g.endX + g.nx * offset,
    z2: g.endZ + g.nz * offset,
  });
  return [line(0), line(thick / 2), line(thick)];
}

interface Leaf {
  /** hinge jamb (arc centre) */
  hingeX: number;
  hingeZ: number;
  /** far jamb on the wall (arc end) */
  farX: number;
  farZ: number;
  /** leaf line, hinge → open tip */
  line: Seg;
  /** open tip (arc start) */
  tipX: number;
  tipZ: number;
}

/** The door leaf line: from the hinge jamb, perpendicular to the wall, into/out of the room. */
function doorLeaf(g: OpeningGeom, door: RoomDoorLike, width: number): Leaf {
  // hinge side: default (null / 'left') hinges at the `from` jamb; 'right' hinges at `to`.
  const hingeAtFrom = door.swing !== 'right';
  const hingeX = hingeAtFrom ? g.startX : g.endX;
  const hingeZ = hingeAtFrom ? g.startZ : g.endZ;
  const farX = hingeAtFrom ? g.endX : g.startX;
  const farZ = hingeAtFrom ? g.endZ : g.startZ;

  // opening direction: inward unless the data says swingInward === false.
  const outward = door.swingInward === false;
  const ox = outward ? g.nx : -g.nx;
  const oz = outward ? g.nz : -g.nz;

  const tipX = hingeX + ox * width;
  const tipZ = hingeZ + oz * width;

  return {
    hingeX,
    hingeZ,
    farX,
    farZ,
    tipX,
    tipZ,
    line: { x1: hingeX, z1: hingeZ, x2: tipX, z2: tipZ },
  };
}

function doorSwingArc(
  doorIndex: number,
  wallIndex: number,
  leaf: Leaf,
  radius: number,
): DoorSwingArcPrimitive {
  // sweep direction from the cross product of (start-centre) × (end-centre) in z-down space.
  const cross =
    (leaf.tipX - leaf.hingeX) * (leaf.farZ - leaf.hingeZ) -
    (leaf.tipZ - leaf.hingeZ) * (leaf.farX - leaf.hingeX);
  return {
    kind: 'doorSwingArc',
    doorIndex,
    wallIndex,
    cx: leaf.hingeX,
    cz: leaf.hingeZ,
    radius,
    start: { x: leaf.tipX, z: leaf.tipZ },
    end: { x: leaf.farX, z: leaf.farZ },
    largeArcFlag: 0, // door swings are ≤ 90°, never reflex
    sweepFlag: cross >= 0 ? 1 : 0,
  };
}

/** Perpendicular unit normal to (dirx,dirz) pointing away from the room centroid. */
function outwardNormal(
  dirx: number,
  dirz: number,
  atx: number,
  atz: number,
  centroid: Pt,
): Pt {
  // two perpendicular candidates
  const px = -dirz;
  const pz = dirx;
  const toCentroidX = centroid.x - atx;
  const toCentroidZ = centroid.z - atz;
  // outward points AWAY from centroid → negative dot with the to-centroid vector
  const dot = px * toCentroidX + pz * toCentroidZ;
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
  const geom = dist(wall.x1, wall.z1, wall.x2, wall.z2);
  if (Number.isFinite(wall.len) && wall.len > 0) return wall.len;
  return geom;
}

/** structural subset of RoomDoor used by the leaf/arc math */
interface RoomDoorLike {
  swing?: 'left' | 'right' | null;
  swingInward?: boolean | null;
}
