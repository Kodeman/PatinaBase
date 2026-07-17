/**
 * Shared marker-strip logic for `room-scans` bucket storage URLs.
 *
 * The client iOS apps write PUBLIC-style `getPublicUrl()` strings
 * (`.../storage/v1/object/public/room-scans/...`) into columns backed by the
 * PRIVATE `room-scans` bucket — `room_scans.model_url` / `.model_url_gltf`
 * and `room_scan_images.image_url` / `.thumbnail_url` alike. Every one of
 * those 400s at the storage edge when rendered raw.
 *
 * Extracted into a standalone helper (mirrors `updateProposalTotal` in
 * `proposal-total.ts`) so both `useSignedScanModelUrl` (`use-room-scans.ts`,
 * the model-file sibling of this exact problem) and `useRoomScanPhotos`
 * (`use-room-scan-photos.ts`) resolve the bucket marker identically, once.
 */
export const PUBLIC_ROOM_SCANS_MARKER = '/storage/v1/object/public/room-scans/';

/**
 * Recover a `room-scans` bucket-relative storage path — suitable for
 * `supabase.storage.from('room-scans').createSignedUrl(path, …)` — from a
 * raw URL/path value read off a row.
 *
 * - a public-style URL containing the bucket marker → the path after it
 * - a bare storage path (no `http(s)://` scheme) → returned unchanged
 * - anything else — already a real/signed URL, or empty/nullish — → `null`;
 *   there's nothing to sign, and the caller decides whether to pass the raw
 *   value through as-is (it may already be usable) or treat it as unresolved
 */
export function publicUrlToPath(url: string | null | undefined): string | null {
  if (!url) return null;

  if (url.includes(PUBLIC_ROOM_SCANS_MARKER)) {
    return url.split(PUBLIC_ROOM_SCANS_MARKER)[1] ?? null;
  }

  if (!/^https?:\/\//i.test(url)) {
    // No scheme — already a bare storage path.
    return url;
  }

  return null;
}
