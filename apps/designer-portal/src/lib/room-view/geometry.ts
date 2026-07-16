/**
 * Room View — geometry contract + pure helpers.
 *
 * This is the typed ROOM contract both the roster thumbnails and the interactive
 * Plan projection render from. It is a faithful data-port of the design authority:
 *   docs/design/the-document/room-view-prototype.html  (the `ROOM` object, L365–386)
 * generalized per the render rulings in DECISIONS.md:
 *   - R107 (The Room View — the room as material, in Patina's hand)
 *   - I73  (Render-honesty rulings)
 *
 * Coordinate system (from the prototype): FEET. Origin = north-west corner.
 *   x → east, z → south.  width = extent along x, depth = extent along z.
 * Everything here is PURE — no React, no IO, no DOM. Renderers own the single
 * screen transform (px-per-foot + padding); this module never touches pixels.
 *
 * Two deliberate generalizations over the prototype (see report / DECISIONS feed):
 *   - the prototype's single `door` becomes `doors[]` (real scans carry n doors);
 *   - objects gain `rotationDeg` (RoomPlan oriented bounding boxes carry yaw).
 */

// ————————————————————————————————————————————————————————————————
// The contract
// ————————————————————————————————————————————————————————————————

/** RoomPlan emits three confidence levels. Per I73(a): only `low` renders the
 *  lighter + dashed + verify-on-site treatment; `medium` renders solid like `high`.
 *  All three are stored and reported in the facts rail. */
export type Confidence = 'high' | 'medium' | 'low';

export interface RoomWall {
  /** wall start, feet (origin = NW corner, x→east, z→south) */
  x1: number;
  z1: number;
  /** wall end, feet */
  x2: number;
  z2: number;
  conf: Confidence;
  /** scan-relative compass name from the data, e.g. "North wall (west run)" (I73c) */
  name: string;
  /** along-wall length in feet */
  len: number;
}

export interface RoomWindow {
  /** index into RoomGeometry.walls */
  wall: number;
  /** distance along the wall from its start point (x1,z1), feet */
  from: number;
  to: number;
  /** sill height above floor, feet */
  sill: number;
  /** head height above floor, feet */
  head: number;
}

export interface RoomDoor {
  /** index into RoomGeometry.walls */
  wall: number;
  /** distance along the wall from its start point (x1,z1), feet */
  from: number;
  to: number;
  /** head (opening top) height above floor, feet */
  h: number;
  /**
   * Hinge side, when the data carries it. Per I73(b): a swing ARC is drawn ONLY
   * when this is present — null/undefined means the scan does not know the hinge,
   * and we never fabricate the geometry.
   */
  swing?: 'left' | 'right' | null;
  /** true = opens into the room, false = opens out; null/undefined = unknown */
  swingInward?: boolean | null;
}

export interface RoomObject {
  /** top-left CORNER of the axis-aligned footprint, feet (adapter converts center→corner) */
  x: number;
  z: number;
  /** footprint width (x extent before rotation), feet */
  w: number;
  /** footprint depth (z extent before rotation), feet */
  d: number;
  /** object height, feet */
  h: number;
  /** yaw of the oriented bounding box about its own center, degrees (0 = axis-aligned) */
  rotationDeg?: number;
  /** RoomPlan category, e.g. 'sofa' */
  cat: string;
  /** display label with true dimensions, e.g. 'sofa · 84″ × 36″' */
  label: string;
  /** per-object confidence, when the scan carries it (I73a: low → ghost drawn lighter/dashed) */
  conf?: Confidence;
}

export interface RoomGeometry {
  /** overall extent along x (east–west), feet */
  width: number;
  /** overall extent along z (north–south), feet */
  depth: number;
  /** wall height — stands in for ceiling; RoomPlan captures no ceiling (facts-rail note), feet */
  wallH: number;
  /** wall thickness — a drawing convention (RoomPlan walls are planes), feet. Default 0.45 (I73d). */
  thick: number;
  walls: RoomWall[];
  windows: RoomWindow[];
  doors: RoomDoor[];
  objects: RoomObject[];
  /** floor polygon, feet; empty when the scan carried none (renderers fall back to the bounding rect) */
  floor: Array<{ x: number; z: number }>;
}

/** A roster entry — one row per scanned room in The Rooms Studio index (R107 §1).
 *  `geometry` is null until the geometry rows exist / parse; the card still renders
 *  its metadata (a lens over the same rows the Document owns; nothing is copied). */
export interface RoomRosterEntry {
  roomId: string;
  clientName: string | null;
  roomType: string | null;
  scanDate: string | null;
  areaSqFt: number | null;
  dims: { w: number; d: number } | null;
  quality: { grade: string | null; coverage: number | null };
  docRef: { engagementKind: string; engagementId: string; phaseLabel: string } | null;
  geometry: RoomGeometry | null;
}

// ————————————————————————————————————————————————————————————————
// Formatting
// ————————————————————————————————————————————————————————————————

/**
 * Feet → feet-and-inches, e.g. 0.5 → "0′ 6″", 14 → "14′ 0″".
 * Ported EXACTLY from the prototype (L389), including the 12″ carry: when the
 * inch part rounds to 12, roll it into the next foot ("11.96 ft" → "12′ 0″").
 * Uses the true prime (′ U+2032) and double-prime (″ U+2033) glyphs.
 */
export function ftIn(ft: number): string {
  const f = Math.floor(ft);
  const i = Math.round((ft - f) * 12);
  return i === 12 ? `${f + 1}′ 0″` : `${f}′ ${i}″`;
}

// ————————————————————————————————————————————————————————————————
// Derived measurements
// ————————————————————————————————————————————————————————————————

/**
 * Floor area in square feet. Uses the floor polygon (shoelace) when the scan
 * carried one (≥3 points); otherwise falls back to width × depth (the prototype's
 * rectangular read). Returns 0 for degenerate geometry rather than NaN.
 */
export function areaOf(g: RoomGeometry): number {
  if (g.floor && g.floor.length >= 3) {
    let sum = 0;
    for (let i = 0; i < g.floor.length; i++) {
      const a = g.floor[i];
      const b = g.floor[(i + 1) % g.floor.length];
      sum += a.x * b.z - b.x * a.z;
    }
    return Math.abs(sum) / 2;
  }
  const w = safe(g.width);
  const d = safe(g.depth);
  return w * d;
}

/**
 * Overall bounding dimensions {w, d} in feet. Prefers the stored width/depth;
 * falls back to the floor-polygon bounding box, then the walls' bounding box.
 */
export function overallDims(g: RoomGeometry): { w: number; d: number } {
  if (isPos(g.width) && isPos(g.depth)) return { w: g.width, d: g.depth };

  const pts: Array<{ x: number; z: number }> = [];
  if (g.floor) pts.push(...g.floor);
  for (const wall of g.walls ?? []) {
    pts.push({ x: wall.x1, z: wall.z1 }, { x: wall.x2, z: wall.z2 });
  }
  if (pts.length === 0) return { w: safe(g.width), d: safe(g.depth) };

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of pts) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  if (!Number.isFinite(minX)) return { w: safe(g.width), d: safe(g.depth) };
  return { w: maxX - minX, d: maxZ - minZ };
}

// ————————————————————————————————————————————————————————————————
// Shared geometry math (used by plan-primitives; exported for renderers + tests)
// ————————————————————————————————————————————————————————————————

export interface Pt {
  x: number;
  z: number;
}

/** An oriented (rotatable) rectangle in feet-space: center + size + yaw.
 *  angleDeg = 0 means `w` runs along +x and `d` along +z. Rotation is about the center. */
export interface OrientedRect {
  cx: number;
  cz: number;
  w: number;
  d: number;
  angleDeg: number;
}

/** Distance between two points, feet. */
export function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(bx - ax, bz - az);
}

/** The four corners of an oriented rectangle, in feet: [TL, TR, BR, BL] (pre-rotation order). */
export function rectCorners(r: OrientedRect): [Pt, Pt, Pt, Pt] {
  const a = (r.angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const hw = r.w / 2;
  const hd = r.d / 2;
  const corner = (lx: number, lz: number): Pt => ({
    x: r.cx + lx * cos - lz * sin,
    z: r.cz + lx * sin + lz * cos,
  });
  return [corner(-hw, -hd), corner(hw, -hd), corner(hw, hd), corner(-hw, hd)];
}

function safe(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

function isPos(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}
