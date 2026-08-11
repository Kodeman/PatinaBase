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

export const PROPOSAL_BOARD_BUCKET = 'proposal-mood-boards';

const PROPOSAL_BOARD_STORAGE_MARKERS = [
  `/storage/v1/object/public/${PROPOSAL_BOARD_BUCKET}/`,
  `/storage/v1/object/authenticated/${PROPOSAL_BOARD_BUCKET}/`,
  `/storage/v1/object/sign/${PROPOSAL_BOARD_BUCKET}/`,
  `/storage/v1/render/image/public/${PROPOSAL_BOARD_BUCKET}/`,
  `/storage/v1/render/image/authenticated/${PROPOSAL_BOARD_BUCKET}/`,
  `/storage/v1/render/image/sign/${PROPOSAL_BOARD_BUCKET}/`,
] as const;

/**
 * Recover the canonical bucket-relative key used by private mood-board media.
 * This intentionally mirrors `board_storage_reference_path` in migration
 * 00434 and the mobile parser: legacy public URLs, authenticated/signed URLs,
 * render URLs and bare keys all resolve to the same persisted object name.
 */
export function proposalBoardUrlToPath(
  value: string | null | undefined,
): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const withoutQuery = raw.split('?', 1)[0] ?? '';

  for (const marker of PROPOSAL_BOARD_STORAGE_MARKERS) {
    const markerIndex = withoutQuery.indexOf(marker);
    if (markerIndex >= 0) {
      const path = withoutQuery.slice(markerIndex + marker.length);
      return isSafeBoardStoragePath(path) ? path : null;
    }
  }

  if (/^https?:\/\//i.test(withoutQuery)) return null;
  const withoutLeadingSlash = withoutQuery.replace(/^\/+/, '');
  const path = withoutLeadingSlash.startsWith(`${PROPOSAL_BOARD_BUCKET}/`)
    ? withoutLeadingSlash.slice(PROPOSAL_BOARD_BUCKET.length + 1)
    : withoutLeadingSlash;
  return isSafeBoardStoragePath(path) ? path : null;
}

function isSafeBoardStoragePath(path: string): boolean {
  return path.length > 0 && !/(^|\/)\.\.(\/|$)/.test(path);
}

/** Persist bare canonical keys while leaving external HTTPS media untouched. */
export function normalizeProposalBoardReference<T extends string | null | undefined>(
  value: T,
): T | string {
  return proposalBoardUrlToPath(value) ?? value;
}
