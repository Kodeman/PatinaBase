/**
 * Room View — scan photo read/signing hook (Room Photos program, W1-T1).
 *
 * `room_scan_images` rows are fully posed (I77 — `camera_transform` is the
 * ARFrame pose at capture, in the same world frame as the scan geometry) but
 * two defects mean the raw columns are never directly usable:
 *
 *  - `image_url` / `thumbnail_url` are `getPublicUrl()`-form strings against
 *    the PRIVATE `room-scans` bucket — they 400 at the storage edge (I79).
 *    Fix mirrors `useSignedScanModelUrl` (`use-room-scans.ts`): strip the
 *    bucket marker via the shared `publicUrlToPath` helper, then
 *    `createSignedUrl`.
 *  - Duplicate rows exist in the wild from retried client batch inserts —
 *    the 00032 AFTER-INSERT trigger counts them all truthfully; only the
 *    read side dedupes (I82).
 *
 * Signing batches every distinct storage path across a scan's photo set into
 * ONE `createSignedUrls` call rather than up to 3N `createSignedUrl`
 * round-trips (image + preview + thumbnail per row).
 *
 * All three derivative rungs are selected and signed together. `preview_url`
 * is the 1600 px JPEG the 00340 derivative cron already produces for every
 * HEIC row; leaving it unselected is what forced consumers to request an
 * undecodable HEIC, watch it fail, and settle for the 512 px thumbnail.
 *
 * `hero_frame_url` is vestigial — no producer ever assigns it, and
 * `is_primary` is only ever set downstream of capture (client review) — so
 * the cover photo is RESOLVED from these rows (`resolveCoverPhoto`, I81),
 * never read off a stored column.
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { Database } from '../database.types';
import { publicUrlToPath } from '../lib/storage-url';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

const PHOTO_COLUMNS =
  'id, scan_id, image_url, thumbnail_url, preview_url, is_primary, display_order, quality_score, photo_kind, caption, captured_at, camera_transform, mime_type';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/** Shaped to exactly `PHOTO_COLUMNS` — a `Pick` (not the full row) so the
 *  type never claims columns the query didn't actually select. */
export type RoomScanPhotoRow = Pick<
  Database['public']['Tables']['room_scan_images']['Row'],
  | 'id'
  | 'scan_id'
  | 'image_url'
  | 'thumbnail_url'
  | 'preview_url'
  | 'is_primary'
  | 'display_order'
  | 'quality_score'
  | 'photo_kind'
  | 'caption'
  | 'captured_at'
  | 'camera_transform'
  | 'mime_type'
>;

/** A photo row plus its resolved, ready-to-render signed URLs. */
export interface RoomScanPhoto extends RoomScanPhotoRow {
  /** Signed, working URL — null only when the stored value couldn't be
   *  resolved to a real URL at all (should not happen for a NOT NULL
   *  `image_url`, but the hook never throws over it). */
  signedImageUrl: string | null;
  /** Signed thumbnail URL — null when `thumbnail_url` itself is null
   *  (true for every row in prod today per I78) or unresolved. */
  signedThumbUrl: string | null;
  /** Signed 1600 px JPEG preview URL (00340's derivative lane) — the rung
   *  between the original and the 512 px thumbnail.
   *
   *  Null on JPEG rows BY DESIGN, not by omission: the derivative sweep is
   *  HEIC-only because a JPEG original is already web-decodable, so there is
   *  nothing for a preview to buy. Consumers must therefore treat a null
   *  preview as "no rung here", never as "derivatives missing". */
  signedPreviewUrl: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// PURE HELPERS — exported for reuse
// ═══════════════════════════════════════════════════════════════════════════

/** Re-exported so consumers of this hook module have one import for both the
 *  photo-domain helpers and the marker-strip logic they're built on. */
export { publicUrlToPath };

/**
 * Dedupe photo rows per I82: retried client batch-inserts leave duplicate
 * `(scan_id, image_url)` rows in the wild (the insert trigger counts them
 * truthfully; only reads defend against them). Preserves input order;
 * within a duplicate group, prefers whichever row carries the MOST
 * derivatives — one point each for `thumbnail_url` and `preview_url` — so a
 * duplicate that the derivative sweep reached beats one it hasn't. Purely
 * defensive: zero production groups have mixed derivative presence. Ties keep
 * the first-seen row.
 *
 * `preview_url` is optional in the constraint so narrower callers (and bare
 * test literals) stay valid; an absent key simply scores zero.
 */
export function dedupeRoomScanPhotos<
  T extends Pick<RoomScanPhotoRow, 'image_url' | 'thumbnail_url'> &
    Partial<Pick<RoomScanPhotoRow, 'preview_url'>>,
>(rows: T[]): T[] {
  const order: string[] = [];
  const bestByUrl = new Map<string, T>();

  const derivativeScore = (row: T): number =>
    (row.thumbnail_url ? 1 : 0) + (row.preview_url ? 1 : 0);

  for (const row of rows) {
    const key = row.image_url;
    const existing = bestByUrl.get(key);
    if (!existing) {
      bestByUrl.set(key, row);
      order.push(key);
      continue;
    }
    if (derivativeScore(row) > derivativeScore(existing)) {
      bestByUrl.set(key, row);
    }
  }

  return order.map((key) => bestByUrl.get(key) as T);
}

/**
 * Cover-photo resolution per I81. `hero_frame_url` has no producer and
 * `photo_kind: 'hero'` is never assigned by either app, so the cover is
 * RESOLVED from the photo rows rather than read off a stored column:
 * `is_primary` first, then highest `quality_score`, then lowest
 * `display_order`, then simply the first row encountered. `null` on an
 * empty list.
 */
export function resolveCoverPhoto<
  T extends Pick<RoomScanPhotoRow, 'is_primary' | 'quality_score' | 'display_order'>,
>(rows: T[]): T | null {
  if (rows.length === 0) return null;

  const primary = rows.filter((r) => r.is_primary);
  const pool = primary.length > 0 ? primary : rows;

  return pool.reduce((best, row) => {
    const bestQuality = best.quality_score ?? -Infinity;
    const rowQuality = row.quality_score ?? -Infinity;
    if (rowQuality > bestQuality) return row;
    if (rowQuality < bestQuality) return best;
    // Tied on quality — lower display_order wins; a further tie keeps
    // whichever was encountered first (reduce's running `best`).
    return row.display_order < best.display_order ? row : best;
  }, pool[0]);
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A scan's photo set, deduped and batch-signed. Ordered `display_order` asc,
 * then `captured_at` asc (matches capture sequence for ties). Returns `[]`
 * for a scan with no rows, or while `scanId` is unset.
 */
export function useRoomScanPhotos(scanId: string | null | undefined) {
  return useQuery<RoomScanPhoto[]>({
    queryKey: ['room-scan-photos', scanId],
    enabled: Boolean(scanId),
    // The photo set is fixed once captured (only derivative columns change,
    // out of this hook's scope) — a generous stale window avoids re-signing
    // on every remount while the Room View is open.
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const id = scanId as string;
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from('room_scan_images')
        .select(PHOTO_COLUMNS)
        .eq('scan_id', id)
        .order('display_order', { ascending: true })
        .order('captured_at', { ascending: true });

      if (error) throw error;

      const rows = dedupeRoomScanPhotos((data ?? []) as RoomScanPhotoRow[]);
      if (rows.length === 0) return [];

      // Batch-sign every distinct storage path (image + preview + thumbnail
      // together) in ONE call — a scan with N photos costs one storage
      // round-trip, not up to 3N. The preview path is pushed INSIDE this same
      // loop precisely so the added rung costs zero extra round-trips: the
      // array grows from ≤2N to ≤3N entries in the one existing request.
      const pathSet = new Set<string>();
      for (const row of rows) {
        const imagePath = publicUrlToPath(row.image_url);
        if (imagePath) pathSet.add(imagePath);
        const previewPath = publicUrlToPath(row.preview_url);
        if (previewPath) pathSet.add(previewPath);
        const thumbPath = publicUrlToPath(row.thumbnail_url);
        if (thumbPath) pathSet.add(thumbPath);
      }

      const signedByPath = new Map<string, string>();
      if (pathSet.size > 0) {
        const { data: signedData, error: signError } = await supabase.storage
          .from('room-scans')
          .createSignedUrls(Array.from(pathSet), 3600);

        if (signError) throw signError;

        for (const entry of signedData ?? []) {
          if (entry.path && !entry.error) signedByPath.set(entry.path, entry.signedUrl);
        }
      }

      // Resolve one column's value to a renderable URL: signed if it needed
      // signing and signing succeeded; passed through if it was already a
      // usable URL; otherwise null rather than a throw (a per-photo signing
      // failure shouldn't take down the whole scan's photo set).
      const resolveUrl = (raw: string | null): string | null => {
        if (!raw) return null;
        const path = publicUrlToPath(raw);
        if (!path) return raw;
        return signedByPath.get(path) ?? null;
      };

      return rows.map((row) => ({
        ...row,
        signedImageUrl: resolveUrl(row.image_url),
        signedPreviewUrl: resolveUrl(row.preview_url),
        signedThumbUrl: resolveUrl(row.thumbnail_url),
      }));
    },
  });
}

/**
 * Cover photo per scan, for a SET of scan ids in one round trip (Room
 * Photos W2-T6). A strip/grid that renders a variable number of scans can't
 * call `useRoomScanPhotos` once per tile — that's a hook call inside a loop,
 * which breaks rules-of-hooks the moment the tile count changes between
 * renders. This is the batch sibling: one query across every requested
 * `scan_id`, one `resolveCoverPhoto` (I81) per scan, then ONE
 * `createSignedUrls` call over just the resolved covers' paths — cheaper
 * than signing every photo in every scan's set to show a single tile each.
 *
 * Returns a `Map<scanId, RoomScanPhoto | null>`. After a successful fetch,
 * every requested id has an entry: the resolved+signed cover, or `null` when
 * that scan has zero photo rows. A missing key means the query hasn't
 * resolved yet (or was called with no ids) — callers distinguish "loading"
 * from "confirmed empty" by key presence, not by the value under it.
 */
export function useRoomScanCovers(scanIds: Array<string | null | undefined>) {
  const ids = Array.from(new Set(scanIds.filter((v): v is string => !!v))).sort();

  return useQuery<Map<string, RoomScanPhoto | null>>({
    queryKey: ['room-scan-covers', ids],
    enabled: ids.length > 0,
    // Mirrors useRoomScanPhotos — a scan's photo set is fixed once captured.
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from('room_scan_images')
        .select(PHOTO_COLUMNS)
        .in('scan_id', ids)
        .order('display_order', { ascending: true })
        .order('captured_at', { ascending: true });

      if (error) throw error;

      // Dedupe (I82) across the whole result set, then group by scan_id —
      // equivalent to deduping per scan since `image_url` values are
      // scan-scoped storage paths and don't collide across scans.
      const byScan = new Map<string, RoomScanPhotoRow[]>();
      for (const row of dedupeRoomScanPhotos((data ?? []) as RoomScanPhotoRow[])) {
        const bucket = byScan.get(row.scan_id);
        if (bucket) bucket.push(row);
        else byScan.set(row.scan_id, [row]);
      }

      const covers = new Map<string, RoomScanPhotoRow | null>();
      for (const id of ids) {
        covers.set(id, resolveCoverPhoto(byScan.get(id) ?? []));
      }

      // Batch-sign only the resolved covers' paths — one storage round-trip
      // no matter how many scans are in the strip.
      const pathSet = new Set<string>();
      for (const cover of covers.values()) {
        if (!cover) continue;
        const imagePath = publicUrlToPath(cover.image_url);
        if (imagePath) pathSet.add(imagePath);
        const previewPath = publicUrlToPath(cover.preview_url);
        if (previewPath) pathSet.add(previewPath);
        const thumbPath = publicUrlToPath(cover.thumbnail_url);
        if (thumbPath) pathSet.add(thumbPath);
      }

      const signedByPath = new Map<string, string>();
      if (pathSet.size > 0) {
        const { data: signedData, error: signError } = await supabase.storage
          .from('room-scans')
          .createSignedUrls(Array.from(pathSet), 3600);

        if (signError) throw signError;

        for (const entry of signedData ?? []) {
          if (entry.path && !entry.error) signedByPath.set(entry.path, entry.signedUrl);
        }
      }

      const resolveUrl = (raw: string | null): string | null => {
        if (!raw) return null;
        const path = publicUrlToPath(raw);
        if (!path) return raw;
        return signedByPath.get(path) ?? null;
      };

      const result = new Map<string, RoomScanPhoto | null>();
      for (const [id, cover] of covers) {
        result.set(
          id,
          cover
            ? {
                ...cover,
                signedImageUrl: resolveUrl(cover.image_url),
                signedPreviewUrl: resolveUrl(cover.preview_url),
                signedThumbUrl: resolveUrl(cover.thumbnail_url),
              }
            : null,
        );
      }
      return result;
    },
  });
}
