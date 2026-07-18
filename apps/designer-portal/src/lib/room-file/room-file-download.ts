'use client';

/**
 * Room File — drawing download client (Field Capture P1, package item 12).
 *
 * The worker records each sheet/DXF as a `getPublicUrl()`-form URL against the
 * PRIVATE `room-scans` bucket (drawings.py), so a raw `<a href>` 400s. This
 * client mints a SHORT-LIVED signed URL at click time (`publicUrlToPath` +
 * `createSignedUrl`, the same resolution `useSignedScanModelUrl` /
 * `useRoomScanPhotos` use), fetches it as a blob, and triggers the browser
 * download — the blob-and-anchor idiom of `spec-pdf-client.ts`.
 *
 * SHARED-DESIGNER READ IS NOT BLOCKED (settled, do not re-litigate): the
 * drawings prefix is `room_file/{userId}/{scanId}/v{n}/…`, which puts the SCAN
 * id at path segment [3]. Storage policy 00287 ("Designers can read shared scan
 * artifacts") accepts `rs.id::text = (storage.foldername(name))[3]` as its
 * FIRST branch — so a designer with an active/full association signs and
 * downloads these objects without a room_id-shaped path. `createSignedUrl` runs
 * under the caller's storage RLS, so this is enforced, not assumed.
 */

import { createBrowserClient, publicUrlToPath } from '@patina/supabase';

const ROOM_SCANS_BUCKET = 'room-scans';
const SIGNED_URL_TTL_SECONDS = 120; // short-lived — a download is a moment, not a session

/**
 * Mint a signed, fetchable URL for a `room-scans` object from its stored
 * public-style URL. A value that isn't a room-scans public URL (already a real
 * URL) passes through unchanged.
 */
export async function signRoomScansUrl(publicUrl: string): Promise<string> {
  const path = publicUrlToPath(publicUrl);
  if (!path) return publicUrl;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createBrowserClient() as any;
  const { data, error } = await supabase.storage
    .from(ROOM_SCANS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error) throw error;
  const signed = data?.signedUrl;
  if (!signed) throw new Error('Could not sign the drawing URL.');
  return signed;
}

function triggerDownload(blob: Blob, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Sign, fetch, and download a Room File drawing artifact. Throws on a signing
 * failure or a non-2xx fetch (the caller surfaces the message).
 */
export async function downloadRoomFileArtifact(publicUrl: string, filename: string): Promise<void> {
  const signed = await signRoomScansUrl(publicUrl);
  const response = await fetch(signed);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }
  const blob = await response.blob();
  triggerDownload(blob, filename);
}
