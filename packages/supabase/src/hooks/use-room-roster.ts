import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { Tables } from '../database.types';

// ═══════════════════════════════════════════════════════════════════════════
// THE ROOMS ROSTER (R107 §1 / Phase 2.1) — the Studio room's data hook.
// ═══════════════════════════════════════════════════════════════════════════
//
// `room_scan_documents` is a read-only VIEW — a lens over room_scans + the
// geometry parse state + the request→client→document chain (I70, landed).
// Nothing is copied: the roster reads the same rows the Document owns.
//
// This hook fetches every scanned room, newest scan first, then — in ONE
// second query — every geometry ELEMENT row for scans whose geometry has
// actually parsed (`parse_status === 'parsed'`). Un-parsed scans still get a
// roster row (the card renders its metadata with an "awaiting drawing"
// thumbnail placeholder); we just never ask for elements that don't exist yet.
//
// Deliberately NOT fetched here: `room_scan_geometry` (the base table —
// wall_thickness_ft / floor_polygon / confidence_summary). The view already
// re-exposes width_ft/depth_ft/wall_height_ft/floor_area_sqft, which is every
// field the roster's cards and mini-plan thumbnails need; consumers building a
// `RoomGeometry` from these rows get the from-rows.ts adapter's documented
// fallbacks for the rest (I73d's 0.45ft wall-thickness convention, the
// walls-bounding-box floor fallback) — verified against the seeded exemplar
// scan, whose `wall_thickness_ft` is null even in the real table, so the
// fallback produces identical output either way.

const getSupabase = () => createBrowserClient();

export type RoomRosterScanRow = Tables<'room_scan_documents'>;
export type RoomRosterGeometryElementRow = Tables<'room_scan_geometry_elements'>;

/** One roster row: the view row plus its geometry elements (empty when the
 *  scan hasn't parsed — `scan.parse_status !== 'parsed'`). */
export interface RoomRosterScan {
  scan: RoomRosterScanRow;
  elements: RoomRosterGeometryElementRow[];
}

/**
 * Every scanned room across every client, newest scan first. Query key
 * `['room-roster']` — no params; the roster carries no filters in v1 (the
 * package's "four cards don't need them" ruling — add filters when the
 * roster actually needs them, not preemptively).
 */
export function useRoomRoster() {
  return useQuery({
    queryKey: ['room-roster'],
    queryFn: async (): Promise<RoomRosterScan[]> => {
      const supabase = getSupabase();

      const { data: scans, error: scansError } = await supabase
        .from('room_scan_documents')
        .select('*')
        .order('scanned_at', { ascending: false, nullsFirst: false });
      if (scansError) throw scansError;

      const rows = scans ?? [];
      const parsedScanIds = rows
        .filter((row): row is RoomRosterScanRow & { scan_id: string } =>
          row.scan_id != null && row.parse_status === 'parsed',
        )
        .map((row) => row.scan_id);

      const elementsByScan = new Map<string, RoomRosterGeometryElementRow[]>();
      if (parsedScanIds.length > 0) {
        const { data: elements, error: elementsError } = await supabase
          .from('room_scan_geometry_elements')
          .select('*')
          .in('scan_id', parsedScanIds)
          .order('position', { ascending: true, nullsFirst: false });
        if (elementsError) throw elementsError;

        for (const element of elements ?? []) {
          const list = elementsByScan.get(element.scan_id);
          if (list) {
            list.push(element);
          } else {
            elementsByScan.set(element.scan_id, [element]);
          }
        }
      }

      return rows.map((row) => ({
        scan: row,
        elements: row.scan_id ? (elementsByScan.get(row.scan_id) ?? []) : [],
      }));
    },
    staleTime: 60_000, // 1 minute — scans are near-static once parsed
  });
}
