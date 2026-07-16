/**
 * Room View — the geometry data hook (Room View program, W2-T3).
 *
 * Fetches everything `apps/designer-portal/src/lib/room-view/from-rows.ts`'s
 * pure adapter needs to build a `RoomGeometry`, plus the identity/document
 * fields the Room View shell renders around it: one `room_scan_documents`
 * view row (client/document resolution — 00339), the scan's
 * `room_scan_geometry` header row (parse bookkeeping + overall dims — 00337,
 * null until parsed), and its `room_scan_geometry_elements` rows.
 *
 * This package never imports app code (packages/ sit below apps/ in the
 * dependency graph), so `RoomGeometryHeader` / `RoomGeometryElement` below
 * are kept STRUCTURALLY compatible with from-rows.ts's `RoomScanGeometryRow`
 * / `RoomScanGeometryElementRow` input contract rather than shared by
 * reference — the same approach from-rows.ts itself documents for its own
 * upstream row shapes.
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { Database } from '../database.types';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

const DOCUMENT_COLUMNS =
  'scan_id, name, room_type, document_client_name, owner_client_name, engagement_kind, engagement_id, active_section, parse_status, quality_grade, coverage_percentage, scanned_at, status';

const HEADER_COLUMNS =
  'scan_id, parse_status, width_ft, depth_ft, wall_height_ft, wall_thickness_ft, floor_polygon, floor_area_sqft, confidence_summary';

const ELEMENT_COLUMNS =
  'id, kind, position, confidence, label, apple_id, x1_ft, z1_ft, x2_ft, z2_ft, height_ft, wall_element_id, from_ft, to_ft, sill_ft, head_ft, width_ft, swing, swing_inward, cat, center_x_ft, center_z_ft, depth_ft, rotation_deg';

/** Shaped to exactly `DOCUMENT_COLUMNS` — a `Pick` (not the full view Row)
 *  so the type never claims columns the query didn't actually select. */
type RoomScanDocumentDbRow = Pick<
  Database['public']['Views']['room_scan_documents']['Row'],
  | 'scan_id'
  | 'name'
  | 'room_type'
  | 'document_client_name'
  | 'owner_client_name'
  | 'engagement_kind'
  | 'engagement_id'
  | 'active_section'
  | 'parse_status'
  | 'quality_grade'
  | 'coverage_percentage'
  | 'scanned_at'
  | 'status'
>;

/** Shaped to exactly `HEADER_COLUMNS`. */
type RoomScanGeometryDbRow = Pick<
  Database['public']['Tables']['room_scan_geometry']['Row'],
  | 'scan_id'
  | 'parse_status'
  | 'width_ft'
  | 'depth_ft'
  | 'wall_height_ft'
  | 'wall_thickness_ft'
  | 'floor_polygon'
  | 'floor_area_sqft'
  | 'confidence_summary'
>;

/** Shaped to exactly `ELEMENT_COLUMNS` (`kind` narrowed at runtime below). */
type RoomScanGeometryElementDbRow = Pick<
  Database['public']['Tables']['room_scan_geometry_elements']['Row'],
  | 'id'
  | 'kind'
  | 'position'
  | 'confidence'
  | 'label'
  | 'apple_id'
  | 'x1_ft'
  | 'z1_ft'
  | 'x2_ft'
  | 'z2_ft'
  | 'height_ft'
  | 'wall_element_id'
  | 'from_ft'
  | 'to_ft'
  | 'sill_ft'
  | 'head_ft'
  | 'width_ft'
  | 'swing'
  | 'swing_inward'
  | 'cat'
  | 'center_x_ft'
  | 'center_z_ft'
  | 'depth_ft'
  | 'rotation_deg'
>;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/** The scan's identity + Document resolution (room_scan_documents, 00339). */
export interface RoomGeometryDocument {
  scanId: string;
  name: string | null;
  roomType: string | null;
  /** The Document's own client-name resolution, when one resolves. */
  documentClientName: string | null;
  /** Fallback: the scan owner's profile name (orphan scans — no Document resolves). */
  ownerClientName: string | null;
  engagementKind: string | null;
  engagementId: string | null;
  /** `document_state.active_section` (brief/discovery/direction/proposal/project/install/care). */
  activeSection: string | null;
  /** 'pending' | 'parsed' | 'error' | null (no header row yet — same as 'pending'). */
  parseStatus: string | null;
  qualityGrade: string | null;
  coveragePercentage: number | null;
  scannedAt: string | null;
  status: string | null;
}

/** Structurally matches from-rows.ts's `RoomScanGeometryRow` adapter input —
 *  `floor_polygon` and `confidence_summary` are the two fields converted off
 *  the raw jsonb columns (everything else passes straight through). */
export interface RoomGeometryHeader {
  width_ft: number | null;
  depth_ft: number | null;
  wall_height_ft: number | null;
  wall_thickness_ft: number | null;
  floor_polygon: Array<[number, number]> | null;
  floor_area_sqft: number | null;
  confidence_summary: string | null;
}

/** Structurally matches from-rows.ts's `RoomScanGeometryElementRow`. */
export type RoomGeometryElement = Pick<
  RoomScanGeometryElementDbRow,
  | 'id'
  | 'position'
  | 'confidence'
  | 'label'
  | 'apple_id'
  | 'x1_ft'
  | 'z1_ft'
  | 'x2_ft'
  | 'z2_ft'
  | 'height_ft'
  | 'wall_element_id'
  | 'from_ft'
  | 'to_ft'
  | 'sill_ft'
  | 'head_ft'
  | 'width_ft'
  | 'swing'
  | 'swing_inward'
  | 'cat'
  | 'center_x_ft'
  | 'center_z_ft'
  | 'depth_ft'
  | 'rotation_deg'
> & { kind: 'wall' | 'window' | 'door' | 'opening' | 'object' };

export interface RoomGeometryData {
  document: RoomGeometryDocument;
  /** null until the scan is parsed (room_scan_geometry has no row yet). */
  header: RoomGeometryHeader | null;
  elements: RoomGeometryElement[];
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERNALS
// ═══════════════════════════════════════════════════════════════════════════

const ELEMENT_KINDS = ['wall', 'window', 'door', 'opening', 'object'] as const;

function isElementKind(k: string): k is RoomGeometryElement['kind'] {
  return (ELEMENT_KINDS as readonly string[]).includes(k);
}

/** `room_scan_geometry.floor_polygon` is jsonb `[[x,z],…]`. Defensive parse —
 *  never throws on malformed data, matching from-rows.ts's own philosophy. */
function parseFloorPolygon(json: RoomScanGeometryDbRow['floor_polygon']): Array<[number, number]> | null {
  if (!Array.isArray(json)) return null;
  const pts: Array<[number, number]> = [];
  for (const pair of json) {
    if (Array.isArray(pair) && pair.length === 2 && typeof pair[0] === 'number' && typeof pair[1] === 'number') {
      pts.push([pair[0], pair[1]]);
    }
  }
  return pts.length > 0 ? pts : null;
}

function toDocument(row: RoomScanDocumentDbRow, fallbackScanId: string): RoomGeometryDocument {
  return {
    scanId: row.scan_id ?? fallbackScanId,
    name: row.name,
    roomType: row.room_type,
    documentClientName: row.document_client_name,
    ownerClientName: row.owner_client_name,
    engagementKind: row.engagement_kind,
    engagementId: row.engagement_id,
    activeSection: row.active_section,
    parseStatus: row.parse_status,
    qualityGrade: row.quality_grade,
    coveragePercentage: row.coverage_percentage,
    scannedAt: row.scanned_at,
    status: row.status,
  };
}

function toHeader(row: RoomScanGeometryDbRow | null): RoomGeometryHeader | null {
  if (!row) return null;
  return {
    width_ft: row.width_ft,
    depth_ft: row.depth_ft,
    wall_height_ft: row.wall_height_ft,
    wall_thickness_ft: row.wall_thickness_ft,
    floor_polygon: parseFloorPolygon(row.floor_polygon),
    floor_area_sqft: row.floor_area_sqft,
    confidence_summary: row.confidence_summary == null ? null : JSON.stringify(row.confidence_summary),
  };
}

function toElements(rows: RoomScanGeometryElementDbRow[] | null): RoomGeometryElement[] {
  return (rows ?? [])
    .filter((row): row is RoomScanGeometryElementDbRow & { kind: RoomGeometryElement['kind'] } =>
      isElementKind(row.kind),
    )
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      position: row.position,
      confidence: row.confidence,
      label: row.label,
      apple_id: row.apple_id,
      x1_ft: row.x1_ft,
      z1_ft: row.z1_ft,
      x2_ft: row.x2_ft,
      z2_ft: row.z2_ft,
      height_ft: row.height_ft,
      wall_element_id: row.wall_element_id,
      from_ft: row.from_ft,
      to_ft: row.to_ft,
      sill_ft: row.sill_ft,
      head_ft: row.head_ft,
      width_ft: row.width_ft,
      swing: row.swing,
      swing_inward: row.swing_inward,
      cat: row.cat,
      center_x_ft: row.center_x_ft,
      center_z_ft: row.center_z_ft,
      depth_ft: row.depth_ft,
      rotation_deg: row.rotation_deg,
    }));
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * One scan's Room View data: its Document identity/resolution, geometry
 * header (parse bookkeeping + overall dims), and geometry elements — the
 * exact inputs `roomGeometryFromRows(header, elements)` consumes. Returns
 * `null` when the scan doesn't resolve (no access / doesn't exist) rather
 * than throwing, so the shell can render its quiet "still being drawn"
 * fallback uniformly.
 */
export function useRoomGeometry(scanId: string | null | undefined) {
  return useQuery<RoomGeometryData | null>({
    queryKey: ['room-geometry', scanId],
    enabled: Boolean(scanId),
    queryFn: async () => {
      const id = scanId as string;
      const supabase = getSupabase();

      const { data: docRow, error: docError } = await supabase
        .from('room_scan_documents')
        .select(DOCUMENT_COLUMNS)
        .eq('scan_id', id)
        .maybeSingle();
      if (docError) throw docError;
      if (!docRow) return null;

      const [headerResult, elementsResult] = await Promise.all([
        supabase.from('room_scan_geometry').select(HEADER_COLUMNS).eq('scan_id', id).maybeSingle(),
        supabase
          .from('room_scan_geometry_elements')
          .select(ELEMENT_COLUMNS)
          .eq('scan_id', id)
          .order('position', { ascending: true, nullsFirst: false }),
      ]);
      if (headerResult.error) throw headerResult.error;
      if (elementsResult.error) throw elementsResult.error;

      return {
        document: toDocument(docRow as RoomScanDocumentDbRow, id),
        header: toHeader(headerResult.data as RoomScanGeometryDbRow | null),
        elements: toElements(elementsResult.data as RoomScanGeometryElementDbRow[] | null),
      };
    },
  });
}
