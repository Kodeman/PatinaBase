/**
 * Room File v0 — data hooks (Field Capture P1, package item 12).
 *
 * The server chain (ingest → solve → drawings, services/scan-pipeline) lands a
 * versioned, tolerance-stamped deliverable per scan:
 *   · room_files              — one append-only row per generation (00341, R-f)
 *   · room_file_measurements  — per-dimension tolerance provenance (00341, R-d)
 *   · scan_anchors            — the typed ground-truth anchors (read via cert)
 * plus static Storage objects (SVG/PDF sheets + a layered DXF) under
 * `room_file/{userId}/{scanId}/v{n}/…` in the private `room-scans` bucket.
 *
 * These three read hooks power the portal Room File page. RLS on all three
 * tables delegates SELECT to the scan's own visibility on `room_scans`
 * (owner / designer-association / studio-co-member compose automatically —
 * 00341 §RLS), so no extra auth wiring is needed here.
 *
 * The drawings' stored URLs are `getPublicUrl()`-form strings against the
 * PRIVATE bucket (the worker writes them that way, mirroring the model/photo
 * columns) — they 400 raw. Downloads therefore sign at click time via
 * `publicUrlToPath` + `createSignedUrl` (see the app-local room-file-download
 * client). This module is the read layer only.
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// Lazy client getter to avoid module-level initialization during SSR.
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES — shaped to the worker's actual output (services/scan-pipeline). The
// generated database.types.ts predates the `drawings` column and types the two
// JSONB columns as opaque `Json`; these interfaces give the portal the real
// shape without hand-editing the generated file.
// ═══════════════════════════════════════════════════════════════════════════

/** One rendered sheet in `room_files.drawings.sheets` (drawings.py `sheets_manifest`). */
export interface RoomFileDrawingSheet {
  id: string;          // 'plan' | 'elev-north' | 'elev-east' | 'elev-south' | 'elev-west'
  title: string;       // 'FLOOR PLAN', 'ELEVATION — NORTH', …
  svg_url: string;     // public-style URL on the private room-scans bucket (sign to fetch)
  svg_sha256: string;
  pdf_url: string;
  pdf_sha256: string;
}

/** `room_files.drawings` — the full rendered sheet set + the layered DXF. */
export interface RoomFileDrawings {
  sheets?: RoomFileDrawingSheet[];
  dxf_url?: string | null;
  dxf_sha256?: string;
  generated_at?: string;
  sheet_count?: number;
}

/** One anchor's row in the accuracy certificate (`certificate.anchors[]`). */
export interface RoomFileCertificateAnchor {
  client_anchor_id: string;
  typed_mm: number;   // the designer's typed ground-truth value
  model_mm: number;   // the model-space span
  residual_mm: number; // typed − scale·model
  used: boolean;      // did this anchor snap a dimension
  flagged: boolean;   // |residual| over the flag threshold (25 mm)
}

export interface RoomFileToleranceModel {
  measured?: { sensor_floor_mm?: number; rms_residual_pct?: number; formula?: string };
  estimated?: { floor_mm?: number; pct?: number; formula?: string };
  invented?: { tolerance_mm?: number | null; note?: string };
}

export interface RoomFileDimensionCounts {
  verified: number;
  measured: number;
  estimated: number;
}

/** `room_files.certificate` — the accuracy certificate (solve_math.build_certificate). */
export interface RoomFileCertificate {
  solver_version?: number;
  scale?: number;
  scale_ignored?: boolean;
  rms_residual_mm?: number;
  rms_residual_pct?: number;
  anchors?: RoomFileCertificateAnchor[];
  anchor_count?: number;
  tolerance_model?: RoomFileToleranceModel;
  scale_bounds?: number[];
  unverified?: boolean;
  dimension_counts?: RoomFileDimensionCounts;
  floor_area_sqft?: number;
}

export type RoomFileStatus = 'pending' | 'solved' | 'generated' | 'error';
export type ToleranceClass = 'verified' | 'measured' | 'estimated';

/** A `room_files` row (00341), with the two JSONB columns typed. */
export interface RoomFile {
  id: string;
  scan_id: string;
  version: number;
  status: RoomFileStatus;
  unverified: boolean;
  anchor_count: number;
  certificate: RoomFileCertificate;
  tolerance_class: ToleranceClass | null;
  svg_url: string | null;
  pdf_url: string | null;
  dxf_url: string | null;
  drawings: RoomFileDrawings;
  generation_error: string | null;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A `room_file_measurements` row (00341). */
export interface RoomFileMeasurement {
  id: string;
  room_file_id: string;
  scan_id: string;
  label: string | null;
  element_ref: Record<string, unknown> | null;
  value_mm: number;
  source: 'anchor' | 'parametric';
  tolerance_mm: number | null;
  tolerance_class: ToleranceClass;
  anchor_id: string | null;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
}

/**
 * A capture-context row (`field_captures`) resolved to a scan. Only the
 * columns the Room File context list renders are selected. A capture's scan
 * association lives in provenance (the project_id association is NOT a column
 * — see 00233/00235), so the association is a JSONB filter, never a column
 * equality.
 *
 * ⚠ WIRE-CONTRACT SHAPE: the iOS Field app flattens its provenance to a
 * `[String:String]` map with DOTTED, top-level keys — the value under
 * `"siteScanContext.scanId"` — NOT a nested `{ siteScanContext: { scanId } }`
 * object (frozen contract:
 * apps/mobile/Capture/CaptureKit/CaptureKit/SiteScan/ContextCaptureProvenance.swift).
 * The design doc's nested `provenance->siteScanContext->>scanId` path matches
 * zero real captures. The resolver below therefore uses `@>` containment on
 * the real flat key. See the item-12 report's "discrepancy" note.
 */
export interface ScanContextCapture {
  id: string;
  title: string | null;
  notes: string | null;
  category: string | null;
  destination: string | null;
  status: string | null;
  photos: unknown[] | null;
  primary_photo_path: string | null;
  thumbnail_url: string | null;
  voice_transcript: string | null;
  captured_lat: number | null;
  captured_lng: number | null;
  provenance: Record<string, unknown> | null;
  committed_at: string | null;
  created_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Every Room File version for a scan, newest version first (append-only chain
 * — a re-scan/re-solve mints a new (scan_id, version) row, R-f). The version
 * strip reads the whole chain; the page renders the newest `generated` row as
 * current. Returns `[]` for a scan with no generations, or while `scanId` is
 * unset.
 */
export function useRoomFiles(scanId: string | null | undefined) {
  return useQuery<RoomFile[]>({
    queryKey: ['room-files', scanId],
    enabled: Boolean(scanId),
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('room_files')
        .select('*')
        .eq('scan_id', scanId as string)
        .order('version', { ascending: false });

      if (error) throw error;
      return (data ?? []) as RoomFile[];
    },
  });
}

/**
 * The newest `generated` Room File per scan, for a SET of scan ids in one
 * round trip — the project page's "Room Files" section feed (its scans come
 * from `useProjectRoomScans`; this resolves which of them actually have a
 * finished deliverable). Can't call `useRoomFiles` once per tile (a hook in a
 * loop), so this is the batch sibling, mirroring `useRoomScanCovers`.
 *
 * Returns a `Map<scanId, RoomFile>` holding ONLY scans with a generated
 * version (newest version wins). A scan with no generated room_file has no
 * entry — callers filter their scan list by key presence.
 */
export function useGeneratedRoomFilesByScan(scanIds: Array<string | null | undefined>) {
  const ids = Array.from(new Set(scanIds.filter((v): v is string => !!v))).sort();

  return useQuery<Map<string, RoomFile>>({
    queryKey: ['generated-room-files-by-scan', ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('room_files')
        .select('*')
        .in('scan_id', ids)
        .eq('status', 'generated')
        .order('version', { ascending: false });

      if (error) throw error;

      // version-desc → first seen per scan_id is the newest generated version.
      const byScan = new Map<string, RoomFile>();
      for (const row of (data ?? []) as RoomFile[]) {
        if (!byScan.has(row.scan_id)) byScan.set(row.scan_id, row);
      }
      return byScan;
    },
  });
}

/**
 * The published dimension set for one Room File version, capture order
 * (`created_at` asc — the solve writes rows in the drawing's dimension order).
 * Returns `[]` while `roomFileId` is unset.
 */
export function useRoomFileMeasurements(roomFileId: string | null | undefined) {
  return useQuery<RoomFileMeasurement[]>({
    queryKey: ['room-file-measurements', roomFileId],
    enabled: Boolean(roomFileId),
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('room_file_measurements')
        .select('*')
        .eq('room_file_id', roomFileId as string)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as RoomFileMeasurement[];
    },
  });
}

/**
 * Capture-context items (`field_captures`) pinned to this scan — resolved by
 * JSONB containment on the flat provenance key the Field app actually writes
 * (`"siteScanContext.scanId"` → this scan), NOT a project_id column (inbox
 * rows carry the association only in provenance — 00233/00235). Newest first.
 * Returns `[]` for a scan with no captures, or while `scanId` is unset.
 */
export function useScanContextCaptures(scanId: string | null | undefined) {
  return useQuery<ScanContextCapture[]>({
    queryKey: ['scan-context-captures', scanId],
    enabled: Boolean(scanId),
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('field_captures')
        .select(
          'id, title, notes, category, destination, status, photos, primary_photo_path, thumbnail_url, voice_transcript, captured_lat, captured_lng, provenance, committed_at, created_at',
        )
        // `@>` containment on the flat, dotted top-level key the phone emits —
        // provenance @> '{"siteScanContext.scanId":"<scanId>"}'. Robust to the
        // dot in the key (a `->` path filter would misparse it).
        .contains('provenance', { 'siteScanContext.scanId': scanId as string })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as ScanContextCapture[];
    },
  });
}
