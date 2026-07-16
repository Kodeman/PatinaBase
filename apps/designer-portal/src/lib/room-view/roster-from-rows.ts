/**
 * Room View — adapter from the roster's raw hook rows (a `room_scan_documents`
 * view row + its geometry element rows) to `RoomRosterEntry` (geometry.ts).
 *
 * Pure: no React, no IO, no DOM. Two responsibilities, both testable in
 * isolation from any component:
 *   - the client-name fallback chain (document_client_name ?? owner_client_name
 *     ?? the scan's own name) — a scan always has SOME name to show;
 *   - the docRef, present only when the scan actually has a document behind it
 *     (an orphan scan — no engagement — carries `docRef: null`, and the card
 *     omits the line rather than link to nothing).
 *
 * Geometry: built via `roomGeometryFromRows` only for scans whose geometry has
 * actually parsed. The view does not expose `wall_thickness_ft` /
 * `floor_polygon` / `confidence_summary` (those live on the `room_scan_geometry`
 * base table, deliberately not queried by `useRoomRoster` — see its header
 * comment) — the adapter passes those through as `null`, which engages
 * from-rows.ts's own documented fallbacks (I73d's 0.45ft thickness convention;
 * the walls-bounding-box floor fallback). Confirmed identical in practice: the
 * seeded exemplar scan's `wall_thickness_ft` is null even in the real table.
 */

import type {
  RoomRosterGeometryElementRow,
  RoomRosterScan,
  RoomRosterScanRow,
} from '@patina/supabase';
import type { RoomRosterEntry } from './geometry';
import { roomGeometryFromRows, type RoomScanGeometryElementRow, type RoomScanGeometryRow } from './from-rows';

/** document_client_name ?? owner_client_name ?? the scan's own name — a scan
 *  always has SOME name to show; only the person behind it may be unresolved. */
export function resolveRosterClientName(row: RoomRosterScanRow): string | null {
  return row.document_client_name ?? row.owner_client_name ?? row.name ?? null;
}

/** Title-cases a section slug ('brief' -> 'Brief', 'active_project' -> 'Active project'). */
function capitalizeSection(section: string): string {
  const spaced = section.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The docRef line's data, or null for an orphan scan (no engagement on file)
 *  — the card omits the docref line entirely rather than link to nothing. */
export function resolveRosterDocRef(row: RoomRosterScanRow): RoomRosterEntry['docRef'] {
  if (!row.engagement_id) return null;
  return {
    engagementKind: row.engagement_kind ?? 'engagement',
    engagementId: row.engagement_id,
    phaseLabel: row.active_section ? capitalizeSection(row.active_section) : 'Document',
  };
}

/** Narrows a geometry-element DB row's free-text `kind` to from-rows.ts's
 *  literal union. An unrecognized kind is passed through and simply matches
 *  none of from-rows.ts's kind filters (defensive, matches its own posture:
 *  never throw on unexpected data). */
function toElementRow(el: RoomRosterGeometryElementRow): RoomScanGeometryElementRow {
  return {
    id: el.id,
    kind: el.kind as RoomScanGeometryElementRow['kind'],
    position: el.position,
    confidence: el.confidence,
    label: el.label,
    apple_id: el.apple_id,
    x1_ft: el.x1_ft,
    z1_ft: el.z1_ft,
    x2_ft: el.x2_ft,
    z2_ft: el.z2_ft,
    height_ft: el.height_ft,
    wall_element_id: el.wall_element_id,
    from_ft: el.from_ft,
    to_ft: el.to_ft,
    sill_ft: el.sill_ft,
    head_ft: el.head_ft,
    width_ft: el.width_ft,
    swing: el.swing,
    swing_inward: el.swing_inward,
    cat: el.cat,
    center_x_ft: el.center_x_ft,
    center_z_ft: el.center_z_ft,
    depth_ft: el.depth_ft,
    rotation_deg: el.rotation_deg,
  };
}

/**
 * Builds one `RoomRosterEntry` from a roster hook row. Geometry is built only
 * when `scan.parse_status === 'parsed'` — an un-parsed scan gets `geometry:
 * null`, and `RoomPlanThumb` renders its "awaiting drawing" placeholder.
 */
export function buildRoomRosterEntry({ scan, elements }: RoomRosterScan): RoomRosterEntry {
  const geometryInput: RoomScanGeometryRow = {
    width_ft: scan.width_ft,
    depth_ft: scan.depth_ft,
    wall_height_ft: scan.wall_height_ft,
    // Not exposed by the view — see this module's header comment.
    wall_thickness_ft: null,
    floor_polygon: null,
    floor_area_sqft: scan.floor_area_sqft,
    confidence_summary: null,
  };

  const geometry =
    scan.parse_status === 'parsed'
      ? roomGeometryFromRows(geometryInput, elements.map(toElementRow)).geometry
      : null;

  return {
    roomId: scan.scan_id ?? '',
    clientName: resolveRosterClientName(scan),
    roomType: scan.room_type,
    scanDate: scan.scanned_at,
    areaSqFt: scan.floor_area_sqft,
    dims: scan.width_ft != null && scan.depth_ft != null ? { w: scan.width_ft, d: scan.depth_ft } : null,
    quality: { grade: scan.quality_grade, coverage: scan.coverage_percentage },
    docRef: resolveRosterDocRef(scan),
    geometry,
  };
}
