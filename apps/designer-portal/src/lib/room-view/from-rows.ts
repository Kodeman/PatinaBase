/**
 * Room View — adapter from the data-spine row shapes to RoomGeometry.
 *
 * CONTRACT WITH THE DATA SPINE. The upstream row shapes below are declared
 * STRUCTURALLY (the generated DB types for these tables do not exist on this
 * branch yet — hooks land in a later task). They mirror the two spine tables:
 *
 *   room_scan_geometry
 *     width_ft, depth_ft, wall_height_ft, wall_thickness_ft (nullable),
 *     floor_polygon jsonb [[x,z],…], floor_area_sqft, confidence_summary
 *
 *   room_scan_geometry_elements
 *     kind: 'wall' | 'window' | 'door' | 'opening' | 'object'
 *     walls    → x1_ft, z1_ft, x2_ft, z2_ft, height_ft
 *     openings → wall_element_id, from_ft, to_ft, sill_ft, head_ft, width_ft, swing, swing_inward
 *     objects  → cat, center_x_ft, center_z_ft, width_ft, depth_ft, height_ft, rotation_deg
 *     shared   → id, confidence, label, position, apple_id
 *
 * Responsibilities: order walls by `position`; resolve wall_element_id → wall index;
 * default wall thickness to 0.45 ft when null (I73d, flagged as convention);
 * convert object centre → corner (x = center_x − w/2) while preserving rotation;
 * bucket 'opening'-kind rows (cased/pass-through doorways) into openings[]; and
 * drop/flag only truly malformed rows defensively — this NEVER throws on partial
 * data. It returns the geometry plus a `warnings: string[]`.
 *
 * Pure: no React, no IO, no DOM.
 */

import type { Confidence, RoomDoor, RoomGeometry, RoomOpening, RoomWindow } from './geometry';

/** Default wall thickness drawing convention (RoomPlan walls are planes) — I73(d). */
export const THICKNESS_CONVENTION_FT = 0.45;
/** Default wall height when the scan omits one (stands in for the ceiling). */
export const WALL_HEIGHT_FALLBACK_FT = 8;

// ————————————————————————————————————————————————————————————————
// Upstream row shapes (structural — the contract with the data spine)
// ————————————————————————————————————————————————————————————————

export interface RoomScanGeometryRow {
  width_ft: number | null;
  depth_ft: number | null;
  wall_height_ft: number | null;
  wall_thickness_ft: number | null;
  floor_polygon: Array<[number, number]> | null;
  floor_area_sqft: number | null;
  confidence_summary: string | null;
}

export interface RoomScanGeometryElementRow {
  id: string;
  kind: 'wall' | 'window' | 'door' | 'opening' | 'object';
  position: number | null;
  confidence: string | null;
  label: string | null;
  apple_id: string | null;
  // walls
  x1_ft?: number | null;
  z1_ft?: number | null;
  x2_ft?: number | null;
  z2_ft?: number | null;
  height_ft?: number | null;
  // openings (window | door | opening)
  wall_element_id?: string | null;
  from_ft?: number | null;
  to_ft?: number | null;
  sill_ft?: number | null;
  head_ft?: number | null;
  width_ft?: number | null;
  swing?: string | null;
  swing_inward?: boolean | null;
  // objects
  cat?: string | null;
  center_x_ft?: number | null;
  center_z_ft?: number | null;
  depth_ft?: number | null;
  rotation_deg?: number | null;
}

export interface AdapterResult {
  geometry: RoomGeometry;
  /** every dropped/defaulted row is surfaced here; never thrown */
  warnings: string[];
  /** true when wall_thickness_ft was null/absent and the 0.45 ft convention was applied (I73d) */
  thicknessConvention: boolean;
}

// ————————————————————————————————————————————————————————————————
// Adapter
// ————————————————————————————————————————————————————————————————

export function roomGeometryFromRows(
  geo: RoomScanGeometryRow | null,
  elements: RoomScanGeometryElementRow[] = [],
): AdapterResult {
  const warnings: string[] = [];

  // ——— thickness (I73d): default 0.45 ft when null, flagged as convention ———
  let thick: number;
  let thicknessConvention: boolean;
  if (geo == null || geo.wall_thickness_ft == null || !Number.isFinite(geo.wall_thickness_ft)) {
    thick = THICKNESS_CONVENTION_FT;
    thicknessConvention = true;
    warnings.push(
      `wall_thickness_ft absent — using ${THICKNESS_CONVENTION_FT} ft drawing convention (RoomPlan walls are planes)`,
    );
  } else {
    thick = geo.wall_thickness_ft;
    thicknessConvention = false;
  }

  // ——— wall height ———
  let wallH: number;
  if (geo == null || geo.wall_height_ft == null || !Number.isFinite(geo.wall_height_ft)) {
    wallH = WALL_HEIGHT_FALLBACK_FT;
    warnings.push(`wall_height_ft absent — using ${WALL_HEIGHT_FALLBACK_FT} ft fallback (stands in for ceiling)`);
  } else {
    wallH = geo.wall_height_ft;
  }

  // ——— walls, ordered by position ———
  const wallRows = elements.filter((e) => e.kind === 'wall').sort(byPosition);
  const walls: RoomGeometry['walls'] = [];
  /** element id (and apple_id) → resolved index in `walls` */
  const wallIndexById = new Map<string, number>();

  for (const row of wallRows) {
    const { x1_ft, z1_ft, x2_ft, z2_ft } = row;
    if (![x1_ft, z1_ft, x2_ft, z2_ft].every(isNum)) {
      warnings.push(`wall element ${row.id} dropped — incomplete endpoints`);
      continue;
    }
    const len = Math.hypot((x2_ft as number) - (x1_ft as number), (z2_ft as number) - (z1_ft as number));
    if (!(len > 0)) {
      warnings.push(`wall element ${row.id} dropped — zero-length`);
      continue;
    }
    const index = walls.length;
    walls.push({
      x1: x1_ft as number,
      z1: z1_ft as number,
      x2: x2_ft as number,
      z2: z2_ft as number,
      conf: normalizeConfidence(row.confidence, warnings, `wall ${row.id}`),
      name: row.label ?? `Wall ${index + 1}`,
      len,
    });
    wallIndexById.set(row.id, index);
    if (row.apple_id) wallIndexById.set(row.apple_id, index);
  }

  const resolveWall = (row: RoomScanGeometryElementRow): number | null => {
    const ref = row.wall_element_id;
    if (ref != null && wallIndexById.has(ref)) return wallIndexById.get(ref) as number;
    return null;
  };

  // ——— windows ———
  const windows: RoomWindow[] = [];
  for (const row of elements.filter((e) => e.kind === 'window').sort(byPosition)) {
    const wall = resolveWall(row);
    if (wall == null) {
      warnings.push(`window element ${row.id} dropped — wall_element_id '${row.wall_element_id ?? ''}' unresolved`);
      continue;
    }
    if (!isNum(row.from_ft) || !isNum(row.to_ft)) {
      warnings.push(`window element ${row.id} dropped — missing from_ft/to_ft`);
      continue;
    }
    windows.push({
      wall,
      from: row.from_ft as number,
      to: row.to_ft as number,
      sill: isNum(row.sill_ft) ? (row.sill_ft as number) : 0,
      head: isNum(row.head_ft) ? (row.head_ft as number) : wallH,
    });
  }

  // ——— doors ———
  const doors: RoomDoor[] = [];
  for (const row of elements.filter((e) => e.kind === 'door').sort(byPosition)) {
    const wall = resolveWall(row);
    if (wall == null) {
      warnings.push(`door element ${row.id} dropped — wall_element_id '${row.wall_element_id ?? ''}' unresolved`);
      continue;
    }
    if (!isNum(row.from_ft) || !isNum(row.to_ft)) {
      warnings.push(`door element ${row.id} dropped — missing from_ft/to_ft`);
      continue;
    }
    doors.push({
      wall,
      from: row.from_ft as number,
      to: row.to_ft as number,
      h: isNum(row.head_ft) ? (row.head_ft as number) : wallH,
      swing: normalizeSwing(row.swing),
      swingInward: typeof row.swing_inward === 'boolean' ? row.swing_inward : null,
    });
  }

  // ——— openings: cased/pass-through doorways (no leaf) — a real wall gap ———
  const openings: RoomOpening[] = [];
  for (const row of elements.filter((e) => e.kind === 'opening').sort(byPosition)) {
    const wall = resolveWall(row);
    if (wall == null) {
      warnings.push(`opening element ${row.id} dropped — wall_element_id '${row.wall_element_id ?? ''}' unresolved`);
      continue;
    }
    if (!isNum(row.from_ft) || !isNum(row.to_ft)) {
      warnings.push(`opening element ${row.id} dropped — missing from_ft/to_ft`);
      continue;
    }
    openings.push({
      wall,
      from: row.from_ft as number,
      to: row.to_ft as number,
      h: isNum(row.head_ft) ? (row.head_ft as number) : null,
    });
  }

  // ——— objects: centre → corner, preserve rotation ———
  const objects: RoomGeometry['objects'] = [];
  for (const row of elements.filter((e) => e.kind === 'object').sort(byPosition)) {
    const cx = row.center_x_ft;
    const cz = row.center_z_ft;
    const w = row.width_ft;
    const d = row.depth_ft;
    if (![cx, cz, w, d].every(isNum)) {
      warnings.push(`object element ${row.id} dropped — incomplete centre/size`);
      continue;
    }
    objects.push({
      x: (cx as number) - (w as number) / 2,
      z: (cz as number) - (d as number) / 2,
      w: w as number,
      d: d as number,
      h: isNum(row.height_ft) ? (row.height_ft as number) : 0,
      rotationDeg: isNum(row.rotation_deg) ? (row.rotation_deg as number) : 0,
      cat: row.cat ?? 'object',
      label: row.label ?? row.cat ?? 'object',
      conf: row.confidence ? normalizeConfidence(row.confidence, warnings, `object ${row.id}`) : undefined,
    });
  }

  // ——— floor polygon ———
  const floor: RoomGeometry['floor'] = [];
  if (Array.isArray(geo?.floor_polygon)) {
    for (const pair of geo!.floor_polygon as Array<[number, number]>) {
      if (Array.isArray(pair) && isNum(pair[0]) && isNum(pair[1])) {
        floor.push({ x: pair[0], z: pair[1] });
      }
    }
  }

  // ——— overall dims (fall back to bounding boxes when absent) ———
  const width = isNum(geo?.width_ft) ? (geo!.width_ft as number) : bboxExtent(floor, walls, 'x');
  const depth = isNum(geo?.depth_ft) ? (geo!.depth_ft as number) : bboxExtent(floor, walls, 'z');
  if (!isNum(geo?.width_ft) || !isNum(geo?.depth_ft)) {
    warnings.push('width_ft/depth_ft absent — derived overall dimensions from geometry bounds');
  }

  const geometry: RoomGeometry = {
    width,
    depth,
    wallH,
    thick,
    walls,
    windows,
    doors,
    openings,
    objects,
    floor,
  };

  return { geometry, warnings, thicknessConvention };
}

// ————————————————————————————————————————————————————————————————
// Internals
// ————————————————————————————————————————————————————————————————

function byPosition(a: RoomScanGeometryElementRow, b: RoomScanGeometryElementRow): number {
  const pa = a.position == null ? Number.POSITIVE_INFINITY : a.position;
  const pb = b.position == null ? Number.POSITIVE_INFINITY : b.position;
  return pa - pb;
}

function isNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function normalizeConfidence(value: string | null | undefined, warnings: string[], who: string): Confidence {
  const v = (value ?? '').toLowerCase();
  if (v === 'high' || v === 'medium' || v === 'low') return v;
  // Don't fabricate uncertainty: an unrecognised value defaults to 'high' (solid), not 'low'.
  if (value) warnings.push(`${who}: unrecognised confidence '${value}' — defaulted to 'high'`);
  return 'high';
}

function normalizeSwing(value: string | null | undefined): 'left' | 'right' | null {
  const v = (value ?? '').toLowerCase();
  return v === 'left' || v === 'right' ? v : null;
}

function bboxExtent(
  floor: Array<{ x: number; z: number }>,
  walls: RoomGeometry['walls'],
  axis: 'x' | 'z',
): number {
  const vals: number[] = [];
  for (const p of floor) vals.push(axis === 'x' ? p.x : p.z);
  for (const w of walls) {
    vals.push(axis === 'x' ? w.x1 : w.z1, axis === 'x' ? w.x2 : w.z2);
  }
  if (vals.length === 0) return 0;
  return Math.max(...vals) - Math.min(...vals);
}
