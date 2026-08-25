'use client';

// ═══════════════════════════════════════════════════════════════════════════
// CAPTURE MEDIA — the portal's read path into the PRIVATE `capture-media`
// bucket (migration 00234).
//
// Layout, enforced by storage RLS: capture-media/<auth.uid()>/<client_capture_id>/<artifact>
// All four object policies gate on (storage.foldername(name))[1] = auth.uid()::text,
// so a designer can only ever sign her own field media. That IS the per-designer
// scope FC-R8 asks for — there is no extra filter to add here.
//
// Batched on purpose: one createSignedUrls call for every distinct path a
// surface needs, mirroring `useClientScans` in letterhead-instruments.tsx,
// rather than one round-trip per thumbnail.
// ═══════════════════════════════════════════════════════════════════════════

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

/** The private Field-media bucket (00234). */
export const CAPTURE_MEDIA_BUCKET = 'capture-media';

/** Default signed-URL lifetime, matching `useFieldMediaUrl` (use-party-sms.ts:19). */
export const CAPTURE_MEDIA_TTL_SECONDS = 3600;

/** Refetch a minute before the URLs go dead (use-party-sms.ts:168's margin). */
const STALE_MARGIN_SECONDS = 60;

/** Order- and duplicate-insensitive, so two callers asking for the same set
 *  in a different order share one cache entry. */
export function captureMediaUrlsKey(paths: readonly string[], ttlSeconds: number) {
  return ['capture-media-urls', [...paths].sort().join('|'), ttlSeconds] as const;
}

function normalise(
  paths: readonly (string | null | undefined)[] | null | undefined,
): string[] {
  const seen = new Set<string>();
  for (const raw of paths ?? []) {
    if (typeof raw !== 'string') continue;
    const path = raw.trim();
    if (path.length > 0) seen.add(path);
  }
  return Array.from(seen).sort();
}

/**
 * Short-lived signed URLs for a set of `capture-media` object paths.
 *
 * Returns a `path → signedUrl` map. A path that could not be signed is ABSENT
 * from the map — never a broken URL — so a caller writes
 * `data?.[path] ?? fallback` and gets an honest "no image" rather than a 400.
 * `data` is `undefined` while the query is disabled (nothing to sign) or in flight.
 */
export function useCaptureMediaUrls(
  paths: readonly (string | null | undefined)[] | null | undefined,
  ttlSeconds: number = CAPTURE_MEDIA_TTL_SECONDS,
): UseQueryResult<Record<string, string>> {
  const wanted = normalise(paths);

  return useQuery<Record<string, string>>({
    queryKey: captureMediaUrlsKey(wanted, ttlSeconds),
    enabled: wanted.length > 0,
    staleTime: Math.max(0, (ttlSeconds - STALE_MARGIN_SECONDS) * 1000),
    queryFn: async (): Promise<Record<string, string>> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.storage
        .from(CAPTURE_MEDIA_BUCKET)
        .createSignedUrls(wanted, ttlSeconds);
      if (error) throw error;

      const byPath: Record<string, string> = {};
      for (const entry of data ?? []) {
        if (entry.path && !entry.error && entry.signedUrl) {
          byPath[entry.path] = entry.signedUrl;
        }
      }
      return byPath;
    },
  });
}
