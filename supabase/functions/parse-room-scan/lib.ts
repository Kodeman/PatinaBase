// parse-room-scan · lib.ts — PURE, no IO.
//
// CapturedRoom JSON (iOS-17 JSONEncoder on Codable CapturedRoom) →
// normalized geometry rows for public.room_scan_geometry(_elements) (migration
// 00337). One geometry object; two projections (SVG plan + three.js orbit)
// read the same rows. The output `header`/`elements` shapes map key-for-key to
// what public.replace_room_scan_geometry(p_scan_id, p_header, p_elements)
// reads via `->>`.
//
// Frame produced: plan frame, origin NW, feet; x → east, z → south.
// Raw ARKit world frame is reconstructable from origin_yaw_deg + origin_offset_m.
//
// Nothing here throws on malformed input — unknown enums / missing fields
// degrade into `extras`/`warnings`. The shell (index.ts) is what decides,
// per-scan, whether to land the parse or mark it errored.

/** Bumping this forces the fleet to re-parse (header.parser_version at ingest). */
export const PARSER_VERSION = 1;

/** Meters → feet. RoomPlan/ARKit emit meters; the plan frame is feet. */
export const M_TO_FT = 3.28084;

// ─── Output shapes (mirror the RPC's ->> reads) ────────────────────────────

export type ConfidenceLevel = "high" | "medium" | "low";

export interface GeometryHeader {
  parser_version: number;
  source_schema_version: string | null;
  units: "ft";
  origin_yaw_deg: number;
  origin_offset_m: { x: number; z: number };
  width_ft: number;
  depth_ft: number;
  wall_height_ft: number;
  wall_thickness_ft: number | null;
  /** [[x,z],…] feet, plan frame, origin NW, x→east z→south. */
  floor_polygon: Array<[number, number]>;
  floor_area_sqft: number;
  confidence_summary: { high: number; medium: number; low: number };
}

export interface GeometryElement {
  kind: "wall" | "window" | "door" | "opening" | "object";
  apple_id: string | null;
  confidence: ConfidenceLevel | null;
  label: string | null;
  position: number;
  // wall
  x1_ft?: number;
  z1_ft?: number;
  x2_ft?: number;
  z2_ft?: number;
  height_ft?: number;
  thickness_ft?: number | null;
  // opening (window / door / opening)
  wall_ref?: string | null; // parent wall apple_id; RPC resolves → wall_element_id
  from_ft?: number;
  to_ft?: number;
  sill_ft?: number;
  head_ft?: number;
  width_ft?: number;
  swing?: "left" | "right" | null;
  swing_inward?: boolean | null;
  // object
  cat?: string;
  center_x_ft?: number;
  center_z_ft?: number;
  depth_ft?: number;
  rotation_deg?: number;
  extras: Record<string, unknown>;
}

export interface ParseResult {
  header: GeometryHeader;
  elements: GeometryElement[];
  warnings: string[];
}

// Known RoomPlan object categories (CapturedRoom.Object.Category). Unknown
// categories are NOT rejected — they degrade into `cat` + a warning.
const KNOWN_CATEGORIES = new Set([
  "storage", "refrigerator", "stove", "bed", "sink", "washerDryer", "toilet",
  "bathtub", "oven", "dishwasher", "table", "sofa", "chair", "fireplace",
  "television", "stairs",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── small pure helpers ────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : NaN;
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** Normalize an ARKit UUID to lowercase, or null if it isn't a UUID. */
function asUuid(v: unknown): string | null {
  return typeof v === "string" && UUID_RE.test(v) ? v.toLowerCase() : null;
}

/**
 * Codable enums arrive either bare ("high") or as a single-key container
 * ({"high":{}} / {"door":{"isOpen":false}}). Return {name, payload}.
 */
function decodeEnum(v: unknown): { name: string | null; payload: Record<string, unknown> } {
  if (typeof v === "string") return { name: v, payload: {} };
  if (isRecord(v)) {
    const keys = Object.keys(v);
    if (keys.length >= 1) {
      const name = keys[0];
      const inner = v[name];
      return { name, payload: isRecord(inner) ? inner : {} };
    }
  }
  return { name: null, payload: {} };
}

function decodeConfidence(v: unknown): ConfidenceLevel | null {
  const { name } = decodeEnum(v);
  return name === "high" || name === "medium" || name === "low" ? name : null;
}

/** Column 3 of a column-major 4×4: world translation (x,y,z). */
function translation(t: number[]): { x: number; y: number; z: number } {
  return { x: num(t[12]), y: num(t[13]), z: num(t[14]) };
}

/** Column 0 (local +x basis) projected to XZ → world heading, radians. */
function headingRad(t: number[]): number {
  return Math.atan2(num(t[2]), num(t[0]));
}

/** Rotate a plan point (x,z) by −θ (clockwise by θ). */
function rotateNeg(x: number, z: number, theta: number): { x: number; z: number } {
  const c = Math.cos(theta), s = Math.sin(theta);
  return { x: x * c + z * s, z: -x * s + z * c };
}

function normalizeDeg(d: number): number {
  let r = d % 360;
  if (r < 0) r += 360;
  return r;
}

/**
 * Derive the bucket-relative object key from a stored URL. Both iOS apps write
 * the CapturedRoom export under the `room-scans` bucket but differ in the path
 * segments after it, so we split on the LAST `/room-scans/` and keep the tail
 * (query string stripped). A value that is already a bare bucket key (no
 * `/room-scans/`) is used as-is. Pure — lives here so it is unit-testable
 * without importing the shell (which calls Deno.serve at module load).
 */
export function objectKeyFromUrl(url: string): string | null {
  if (typeof url !== "string" || url.length === 0) return null;
  const marker = "/room-scans/";
  const idx = url.lastIndexOf(marker);
  let key = idx >= 0 ? url.slice(idx + marker.length) : url;
  const q = key.indexOf("?");
  if (q >= 0) key = key.slice(0, q);
  key = key.replace(/^\/+/, "");
  return key.length > 0 ? key : null;
}

/** Shoelace area (absolute), feet² for a [[x,z],…] polygon. */
function shoelaceArea(poly: Array<[number, number]>): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i];
    const [x2, z2] = poly[(i + 1) % poly.length];
    a += x1 * z2 - x2 * z1;
  }
  return Math.abs(a) / 2;
}

/** Andrew's monotone-chain convex hull over [x,z] points (CCW). */
function convexHull(pts: Array<[number, number]>): Array<[number, number]> {
  const uniq = Array.from(new Set(pts.map((p) => `${p[0]},${p[1]}`))).map(
    (s) => s.split(",").map(Number) as [number, number],
  );
  if (uniq.length <= 2) return uniq;
  uniq.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const p of uniq) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Array<[number, number]> = [];
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

// ─── internal working shapes ───────────────────────────────────────────────

interface RawSurface {
  identifier: string | null;
  parentIdentifier: string | null;
  confidence: ConfidenceLevel | null;
  dims: [number, number, number];
  transform: number[];
  categoryName: string | null;
  categoryPayload: Record<string, unknown>;
  polygonCorners: number[][] | null;
}

function readSurface(v: unknown): RawSurface | null {
  if (!isRecord(v)) return null;
  const t = asArray(v.transform).map(num);
  const d = asArray(v.dimensions).map(num);
  const cat = decodeEnum(v.category);
  const corners = Array.isArray(v.polygonCorners)
    ? (v.polygonCorners as unknown[]).map((c) => asArray(c).map(num))
    : null;
  return {
    identifier: typeof v.identifier === "string" ? v.identifier : null,
    parentIdentifier: typeof v.parentIdentifier === "string" ? v.parentIdentifier : null,
    confidence: decodeConfidence(v.confidence),
    dims: [d[0] ?? NaN, d[1] ?? NaN, d[2] ?? NaN],
    transform: t,
    categoryName: cat.name,
    categoryPayload: cat.payload,
    polygonCorners: corners,
  };
}

// ─── the parser ─────────────────────────────────────────────────────────────

export function parseCapturedRoom(json: unknown): ParseResult {
  const warnings: string[] = [];

  const emptyHeader = (): GeometryHeader => ({
    parser_version: PARSER_VERSION,
    source_schema_version: null,
    units: "ft",
    origin_yaw_deg: 0,
    origin_offset_m: { x: 0, z: 0 },
    width_ft: 0,
    depth_ft: 0,
    wall_height_ft: 0,
    wall_thickness_ft: null,
    floor_polygon: [],
    floor_area_sqft: 0,
    confidence_summary: { high: 0, medium: 0, low: 0 },
  });

  if (!isRecord(json)) {
    warnings.push("input is not an object; nothing parsed");
    return { header: emptyHeader(), elements: [], warnings };
  }

  const sourceSchemaVersion =
    typeof json.version === "string"
      ? json.version
      : typeof json.version === "number"
      ? String(json.version)
      : null;

  const rawWalls = asArray(json.walls).map(readSurface).filter((s): s is RawSurface => !!s);
  const rawDoors = asArray(json.doors).map(readSurface).filter((s): s is RawSurface => !!s);
  const rawWindows = asArray(json.windows).map(readSurface).filter((s): s is RawSurface => !!s);
  const rawOpenings = asArray(json.openings).map(readSurface).filter((s): s is RawSurface => !!s);
  const rawFloors = asArray(json.floors).map(readSurface).filter((s): s is RawSurface => !!s);
  const rawObjects = asArray(json.objects).map(readSurface).filter((s): s is RawSurface => !!s);

  if (rawWalls.length === 0) {
    warnings.push("no walls present; geometry will be degenerate");
    const h = emptyHeader();
    h.source_schema_version = sourceSchemaVersion;
    return { header: h, elements: [], warnings };
  }

  // ── (1) wall world endpoints + heading ────────────────────────────────────
  interface WallWork {
    raw: RawSurface;
    // world XZ endpoints (meters), from ±dx/2 along the x-basis
    aw: { x: number; z: number };
    bw: { x: number; z: number };
    lenM: number;
    heading: number; // radians
    heightM: number;
  }
  const wallWork: WallWork[] = [];
  for (const w of rawWalls) {
    const dx = w.dims[0];
    const tr = translation(w.transform);
    const hx = num(w.transform[0]); // x-basis x
    const hz = num(w.transform[2]); // x-basis z
    if (!Number.isFinite(dx) || !Number.isFinite(tr.x) || !Number.isFinite(tr.z) ||
        !Number.isFinite(hx) || !Number.isFinite(hz)) {
      warnings.push(`wall ${w.identifier ?? "?"} has an unusable transform/dimensions; skipped`);
      continue;
    }
    const half = dx / 2;
    wallWork.push({
      raw: w,
      aw: { x: tr.x + half * hx, z: tr.z + half * hz },
      bw: { x: tr.x - half * hx, z: tr.z - half * hz },
      lenM: Math.abs(dx),
      heading: Math.atan2(hz, hx),
      heightM: Number.isFinite(w.dims[1]) ? w.dims[1] : NaN,
    });
  }

  if (wallWork.length === 0) {
    warnings.push("no usable wall transforms; geometry will be degenerate");
    const h = emptyHeader();
    h.source_schema_version = sourceSchemaVersion;
    return { header: h, elements: [], warnings };
  }

  // ── (2) θ = length-weighted circular mean of headings mod 90° ─────────────
  let sumSin = 0, sumCos = 0;
  for (const w of wallWork) {
    sumSin += w.lenM * Math.sin(4 * w.heading);
    sumCos += w.lenM * Math.cos(4 * w.heading);
  }
  const theta = Math.atan2(sumSin, sumCos) / 4; // radians, in (−π/4, π/4]
  const thetaDeg = theta * 180 / Math.PI;

  // rotate a world XZ point (meters) into the rotated (still meters) frame
  const rot = (p: { x: number; z: number }) => rotateNeg(p.x, p.z, theta);

  // ── (3) floor polygon (rotated meters), then the origin offset ────────────
  // floors[0].polygonCorners through its transform; else hull of wall endpoints.
  let floorRotM: Array<[number, number]> = [];
  const floor0 = rawFloors[0];
  if (floor0 && floor0.polygonCorners && floor0.polygonCorners.length >= 3) {
    const T = floor0.transform;
    for (const c of floor0.polygonCorners) {
      const lx = num(c[0]), ly = num(c[1]), lz = num(c[2]);
      if (!Number.isFinite(lx) || !Number.isFinite(lz)) continue;
      // world = col0*lx + col1*ly + col2*lz + col3  (column-major 4×4)
      const wx = num(T[0]) * lx + num(T[4]) * ly + num(T[8]) * (Number.isFinite(lz) ? lz : 0) + num(T[12]);
      const wz = num(T[2]) * lx + num(T[6]) * ly + num(T[10]) * (Number.isFinite(lz) ? lz : 0) + num(T[14]);
      if (Number.isFinite(wx) && Number.isFinite(wz)) {
        const r = rotateNeg(wx, wz, theta);
        floorRotM.push([r.x, r.z]);
      }
    }
  }
  if (floorRotM.length < 3) {
    if (floor0) warnings.push("floors[0] polygon unusable; deriving floor from wall-endpoint hull");
    else warnings.push("no floors[]; deriving floor polygon from wall-endpoint hull");
    const eps: Array<[number, number]> = [];
    for (const w of wallWork) {
      const a = rot(w.aw), b = rot(w.bw);
      eps.push([a.x, a.z], [b.x, b.z]);
    }
    floorRotM = convexHull(eps);
  }

  // origin offset = bbox min corner of the floor polygon (rotated meters)
  let minX = Infinity, minZ = Infinity;
  for (const [x, z] of floorRotM) {
    if (x < minX) minX = x;
    if (z < minZ) minZ = z;
  }
  if (!Number.isFinite(minX)) { minX = 0; minZ = 0; }
  const originOffsetM = { x: minX, z: minZ };

  // rotated-meters → plan feet (origin NW at the bbox min corner)
  const toPlanFt = (p: { x: number; z: number }) => ({
    x: (p.x - minX) * M_TO_FT,
    z: (p.z - minZ) * M_TO_FT,
  });
  const worldToPlanFt = (wx: number, wz: number) => toPlanFt(rotateNeg(wx, wz, theta));

  // ── (4) floor in feet + overall dimensions ────────────────────────────────
  const floorPolyFt: Array<[number, number]> = floorRotM.map(([x, z]) => [
    round4((x - minX) * M_TO_FT),
    round4((z - minZ) * M_TO_FT),
  ]);
  let fMaxX = 0, fMaxZ = 0;
  for (const [x, z] of floorPolyFt) {
    if (x > fMaxX) fMaxX = x;
    if (z > fMaxZ) fMaxZ = z;
  }
  const widthFt = round4(fMaxX);
  const depthFt = round4(fMaxZ);
  const floorAreaSqft = round4(shoelaceArea(floorPolyFt));
  let wallHeightFt = 0;
  for (const w of wallWork) {
    if (Number.isFinite(w.heightM)) wallHeightFt = Math.max(wallHeightFt, w.heightM * M_TO_FT);
  }
  wallHeightFt = round4(wallHeightFt);

  // floor world Y (meters) — for window sill/head; else min wall base.
  let floorYm = NaN;
  if (floor0) floorYm = translation(floor0.transform).y;
  if (!Number.isFinite(floorYm)) {
    let minBase = Infinity;
    for (const w of wallWork) {
      const cy = translation(w.raw.transform).y;
      if (Number.isFinite(cy) && Number.isFinite(w.heightM)) minBase = Math.min(minBase, cy - w.heightM / 2);
    }
    floorYm = Number.isFinite(minBase) ? minBase : 0;
  }

  // ── build wall elements (plan feet) + compass labels ──────────────────────
  interface WallElem {
    apple_id: string | null;
    confidence: ConfidenceLevel | null;
    x1: number; z1: number; x2: number; z2: number;
    heightFt: number;
    side: "N" | "S" | "E" | "W";
    posAxis: number; // position along the side's varying axis (for run qualifiers)
    order: number;
    label: string;
  }
  // room center (rotated feet) for outward-normal classification
  let cX = 0, cZ = 0;
  for (const [x, z] of floorPolyFt) { cX += x; cZ += z; }
  cX /= floorPolyFt.length || 1;
  cZ /= floorPolyFt.length || 1;

  const wallElems: WallElem[] = [];
  for (const w of wallWork) {
    const a = worldToPlanFt(w.aw.x, w.aw.z);
    const b = worldToPlanFt(w.bw.x, w.bw.z);
    const ax = round4(a.x), az = round4(a.z), bx = round4(b.x), bz = round4(b.z);
    // (x1,z1) = lexicographically smaller endpoint → deterministic run origin.
    // Compare ROUNDED coords: axis-aligned walls sit at x1≈x2 or z1≈z2, so raw
    // float noise on the equal axis would otherwise flip the tiebreak (and with
    // it every opening's from/to measured off this endpoint).
    let x1 = ax, z1 = az, x2 = bx, z2 = bz;
    if (bx < ax || (bx === ax && bz < az)) { x1 = bx; z1 = bz; x2 = ax; z2 = az; }
    const dxw = Math.abs(x2 - x1), dzw = Math.abs(z2 - z1);
    const midX = (x1 + x2) / 2, midZ = (z1 + z2) / 2;
    let side: "N" | "S" | "E" | "W";
    let posAxis: number;
    if (dxw >= dzw) { // horizontal run → north / south
      side = midZ < cZ ? "N" : "S";
      posAxis = midX;
    } else { // vertical run → west / east
      side = midX < cX ? "W" : "E";
      posAxis = midZ;
    }
    wallElems.push({
      apple_id: asUuid(w.raw.identifier),
      confidence: w.raw.confidence,
      x1: round4(x1), z1: round4(z1), x2: round4(x2), z2: round4(z2),
      heightFt: round4(Number.isFinite(w.heightM) ? w.heightM * M_TO_FT : wallHeightFt),
      side, posAxis, order: 0, label: "",
    });
  }

  // compass labels + run qualifiers
  const SIDE_NAME = { N: "North wall", S: "South wall", E: "East wall", W: "West wall" };
  for (const side of ["N", "S", "E", "W"] as const) {
    const group = wallElems.filter((w) => w.side === side).sort((a, b) => a.posAxis - b.posAxis);
    if (group.length === 1) {
      group[0].label = SIDE_NAME[side];
    } else if (group.length > 1) {
      // N/S vary along x (west↔east); E/W vary along z (north↔south)
      const words = side === "N" || side === "S"
        ? { first: "west run", mid: "center run", last: "east run" }
        : { first: "north run", mid: "center run", last: "south run" };
      group.forEach((w, i) => {
        let q: string;
        if (i === 0) q = words.first;
        else if (i === group.length - 1) q = words.last;
        else if (group.length === 3) q = words.mid;
        else q = `run ${i + 1}`;
        w.label = `${SIDE_NAME[side]} (${q})`;
      });
    }
  }

  // deterministic wall ordering: side rank N,E,S,W then posAxis
  const SIDE_RANK = { N: 0, E: 1, S: 2, W: 3 };
  const wallsSorted = [...wallElems].sort(
    (a, b) => (SIDE_RANK[a.side] - SIDE_RANK[b.side]) || (a.posAxis - b.posAxis),
  );

  // apple_id → wall (for opening projection); prefer real UUIDs
  const wallByAppleId = new Map<string, WallElem>();
  for (let i = 0; i < wallWork.length; i++) {
    const id = asUuid(wallWork[i].raw.identifier);
    if (id) wallByAppleId.set(id, wallElems[i]);
  }

  // ── openings (windows / doors / generic openings) ─────────────────────────
  interface OpeningElem {
    kind: "window" | "door" | "opening";
    apple_id: string | null;
    confidence: ConfidenceLevel | null;
    wall_ref: string | null;
    from: number; to: number; sill: number; head: number;
    width: number; height: number;
    extras: Record<string, unknown>;
    parentPos: number; // sort key
  }
  const openingElems: OpeningElem[] = [];
  const buildOpening = (s: RawSurface, kind: "window" | "door" | "opening") => {
    const dx = s.dims[0], dy = s.dims[1];
    const tr = translation(s.transform);
    const widthFtO = Number.isFinite(dx) ? round4(Math.abs(dx) * M_TO_FT) : 0;
    const heightFtO = Number.isFinite(dy) ? round4(Math.abs(dy) * M_TO_FT) : 0;
    const parentId = asUuid(s.parentIdentifier);
    const wall = parentId ? wallByAppleId.get(parentId) : undefined;

    const extras: Record<string, unknown> = {};
    if ("isOpen" in s.categoryPayload) extras.isOpen = s.categoryPayload.isOpen;

    let from = 0, to = widthFtO, parentPos = Number.POSITIVE_INFINITY;
    if (wall && Number.isFinite(tr.x) && Number.isFinite(tr.z)) {
      const c = worldToPlanFt(tr.x, tr.z);
      const ux = wall.x2 - wall.x1, uz = wall.z2 - wall.z1;
      const ulen = Math.hypot(ux, uz) || 1;
      const t = ((c.x - wall.x1) * ux + (c.z - wall.z1) * uz) / ulen; // dist from (x1,z1)
      from = round4(t - widthFtO / 2);
      to = round4(t + widthFtO / 2);
      parentPos = wall.order;
    } else if (!wall) {
      warnings.push(
        `${kind} ${s.identifier ?? "?"} has no matching wall (parentIdentifier=${s.parentIdentifier ?? "null"}); wall_ref left null`,
      );
    }

    // sill / head. windows sit above the floor; doors/openings start at floor.
    let sill = 0, head = heightFtO;
    if (kind === "window" && Number.isFinite(tr.y) && Number.isFinite(dy)) {
      sill = round4((tr.y - dy / 2 - floorYm) * M_TO_FT);
      head = round4(sill + Math.abs(dy) * M_TO_FT);
    } else {
      sill = 0;
      head = heightFtO;
    }

    openingElems.push({
      kind,
      apple_id: asUuid(s.identifier),
      confidence: s.confidence,
      wall_ref: wall ? parentId : null,
      from, to, sill, head, width: widthFtO, height: heightFtO,
      extras, parentPos,
    });
  };
  for (const s of rawWindows) buildOpening(s, "window");
  for (const s of rawDoors) buildOpening(s, "door");
  for (const s of rawOpenings) buildOpening(s, "opening");

  // ── objects (oriented boxes in the plan frame) ────────────────────────────
  interface ObjectElem {
    apple_id: string | null;
    confidence: ConfidenceLevel | null;
    cat: string;
    cx: number; cz: number;
    width: number; depth: number; height: number;
    rotation: number;
    label: string;
    extras: Record<string, unknown>;
  }
  const objectElems: ObjectElem[] = [];
  for (const o of rawObjects) {
    const tr = translation(o.transform);
    if (!Number.isFinite(tr.x) || !Number.isFinite(tr.z)) {
      warnings.push(`object ${o.identifier ?? "?"} has an unusable transform; skipped`);
      continue;
    }
    const c = worldToPlanFt(tr.x, tr.z);
    const widthFtO = Number.isFinite(o.dims[0]) ? round4(Math.abs(o.dims[0]) * M_TO_FT) : 0;
    const heightFtO = Number.isFinite(o.dims[1]) ? round4(Math.abs(o.dims[1]) * M_TO_FT) : 0;
    const depthFtO = Number.isFinite(o.dims[2]) ? round4(Math.abs(o.dims[2]) * M_TO_FT) : 0;
    const rotation = round4(normalizeDeg(headingRad(o.transform) * 180 / Math.PI - thetaDeg));
    let cat = o.categoryName ?? "unknown";
    const extras: Record<string, unknown> = {};
    if (!o.categoryName) {
      warnings.push(`object ${o.identifier ?? "?"} has no category; labeled 'unknown'`);
    } else if (!KNOWN_CATEGORIES.has(o.categoryName)) {
      warnings.push(`object ${o.identifier ?? "?"} has unrecognized category '${o.categoryName}'`);
      extras.raw_category = o.categoryName;
    }
    if (Object.keys(o.categoryPayload).length > 0) extras.category_meta = o.categoryPayload;
    const wIn = Math.round(widthFtO * 12), dIn = Math.round(depthFtO * 12);
    objectElems.push({
      apple_id: asUuid(o.identifier),
      confidence: o.confidence,
      cat,
      cx: round4(c.x), cz: round4(c.z),
      width: widthFtO, depth: depthFtO, height: heightFtO,
      rotation,
      label: `${cat} · ${wIn}″ × ${dIn}″`,
      extras,
    });
  }

  // ── (8) confidence_summary: counts across walls + objects ─────────────────
  const summary = { high: 0, medium: 0, low: 0 };
  for (const w of wallElems) if (w.confidence) summary[w.confidence]++;
  for (const o of objectElems) if (o.confidence) summary[o.confidence]++;

  // ── deterministic global positions + assembled element array ──────────────
  // Walls first (RPC needs their apple_ids for opening resolution), then
  // openings (by parent wall then from), then objects (by z,x,cat).
  wallsSorted.forEach((w, i) => { w.order = i; });
  // openings reference wall.order — recompute parentPos now that orders exist
  for (const op of openingElems) {
    if (op.wall_ref) {
      const w = wallByAppleId.get(op.wall_ref);
      op.parentPos = w ? w.order : Number.POSITIVE_INFINITY;
    }
  }
  const openingsSorted = [...openingElems].sort(
    (a, b) => (a.parentPos - b.parentPos) || (a.from - b.from) || (a.width - b.width),
  );
  const objectsSorted = [...objectElems].sort(
    (a, b) => (a.cz - b.cz) || (a.cx - b.cx) || a.cat.localeCompare(b.cat),
  );

  const elements: GeometryElement[] = [];
  let pos = 0;
  for (const w of wallsSorted) {
    elements.push({
      kind: "wall",
      apple_id: w.apple_id,
      confidence: w.confidence,
      label: w.label,
      position: pos++,
      x1_ft: w.x1, z1_ft: w.z1, x2_ft: w.x2, z2_ft: w.z2,
      height_ft: w.heightFt,
      thickness_ft: null,
      extras: {},
    });
  }
  for (const op of openingsSorted) {
    elements.push({
      kind: op.kind,
      apple_id: op.apple_id,
      confidence: op.confidence,
      label: op.kind,
      position: pos++,
      wall_ref: op.wall_ref,
      from_ft: op.from, to_ft: op.to,
      sill_ft: op.sill, head_ft: op.head,
      width_ft: op.width, height_ft: op.height,
      swing: null, swing_inward: null, // never fabricated — RoomPlan carries neither
      extras: op.extras,
    });
  }
  for (const o of objectsSorted) {
    elements.push({
      kind: "object",
      apple_id: o.apple_id,
      confidence: o.confidence,
      label: o.label,
      position: pos++,
      cat: o.cat,
      center_x_ft: o.cx, center_z_ft: o.cz,
      width_ft: o.width, depth_ft: o.depth, height_ft: o.height,
      rotation_deg: o.rotation,
      extras: o.extras,
    });
  }

  const header: GeometryHeader = {
    parser_version: PARSER_VERSION,
    source_schema_version: sourceSchemaVersion,
    units: "ft",
    origin_yaw_deg: round4(thetaDeg),
    origin_offset_m: { x: round4(originOffsetM.x), z: round4(originOffsetM.z) },
    width_ft: widthFt,
    depth_ft: depthFt,
    wall_height_ft: wallHeightFt,
    wall_thickness_ft: null,
    floor_polygon: floorPolyFt,
    floor_area_sqft: floorAreaSqft,
    confidence_summary: summary,
  };

  return { header, elements, warnings };
}
