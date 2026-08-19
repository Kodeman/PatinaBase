/**
 * `useRenderShots` — the Room File render-gallery data seam (Rendered Room v2,
 * W2 finale). Sibling to `use-splat-url.ts`: same two-phase shape (a local
 * presence read off `room_files.artifacts`, then a capability-URL resolver
 * behind the same `NEXT_PUBLIC_EDGE_API_URL` gate), because the whole point is
 * that a caller cannot tell these two artifact kinds apart by behavior.
 *
 * ── WHY `renders` NEEDS ITS OWN PRESENCE READ ────────────────────────────────
 * `splat`/`glb` are single refs; `renders` is the HOISTED-COVER manifest
 * (`renders_job.py`, mirrored by `infra/edge-api-worker/src/scan.ts`):
 *
 *     { object_id, version, cover, count, shots: { shot name -> ref } }
 *
 * with a legacy/tolerated fallback of a flat `{ shot name -> ref }` map (no
 * `shots` key of its own). `readRendersArtifactPresence` only asks "is there
 * anything here at all" — the shot-by-shot resolution (URLs, names) is the
 * route's job entirely; this module never parses individual refs out of the
 * jsonb, unlike `use-splat-url.ts` which has to (there is only one ref there).
 *
 * ── READ-PATH GATE ────────────────────────────────────────────────────────
 * Identical contract to `useSplatUrl`: `NEXT_PUBLIC_EDGE_API_URL` unset (every
 * environment until the Worker's `SCAN_ROUTES` flag flips on) means the shot
 * map never resolves — the hook reports `unavailable: 'read-path-pending'`
 * when a renders artifact IS registered, and stays silent otherwise.
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import { edgeApiBaseUrl, fetchScanArtifact, type ScanCapabilityUrl } from '../lib/scan-artifact-url';

const getSupabase = () => createBrowserClient();

/** The artifact key the renders stage registers under in `room_files.artifacts`. */
export const RENDERS_ARTIFACT_KIND = 'renders';

/**
 * Total and defensive, like `readSplatArtifactRef`: `artifacts` is jsonb with
 * no shape constraint, so anything that isn't a well-formed manifest (or the
 * legacy flat map) reads as "nothing registered" rather than throwing into a
 * render. Only presence is asked here — no ref is extracted or returned.
 */
export function readRendersArtifactPresence(artifacts: unknown): boolean {
  if (!artifacts || typeof artifacts !== 'object' || Array.isArray(artifacts)) return false;
  const entry = (artifacts as Record<string, unknown>)[RENDERS_ARTIFACT_KIND];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;

  const obj = entry as Record<string, unknown>;
  if (typeof obj.object_id === 'string' && obj.object_id.length > 0) return true;

  // Legacy/tolerated fallback: a flat `{ shot name -> ref }` map with no
  // `shots`/`object_id` of its own — present if any value looks like a ref.
  return Object.values(obj).some(
    (value) =>
      value != null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof (value as Record<string, unknown>).object_id === 'string',
  );
}

export type RenderShotsUnavailableReason = 'no-artifact' | 'read-path-pending';

export interface RenderShotsSource {
  /** True when this Room File version registers a renders manifest at all. */
  hasArtifact: boolean;
  /** Shot name → capability URL, once resolved. Null until then. */
  shots: Record<string, ScanCapabilityUrl> | null;
  /** Why `shots` is null; null once shots have resolved. */
  unavailable: RenderShotsUnavailableReason | null;
  /** True while the Room File row is in flight. */
  isLoading: boolean;
}

export interface UseRenderShotsOptions {
  /** Set false to keep the query from running at all (an unmounted gallery). */
  enabled?: boolean;
}

/**
 * The render-gallery strip's single source of truth: does this Room File
 * version carry renders, and can the shot map be fetched? Reads only
 * `id` + `artifacts` off `room_files` — same RLS delegation to `room_scans`
 * (00341) as every other artifact hook here.
 */
export function useRenderShots(
  roomFileId: string | null | undefined,
  options: UseRenderShotsOptions = {},
): RenderShotsSource {
  const { enabled = true } = options;

  const presenceQuery = useQuery<boolean>({
    queryKey: ['room-file-renders-artifact', roomFileId],
    enabled: enabled && Boolean(roomFileId),
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('room_files')
        .select('id, artifacts')
        .eq('id', roomFileId as string)
        .maybeSingle();

      if (error) throw error;
      return readRendersArtifactPresence((data as { artifacts?: unknown } | null)?.artifacts);
    },
  });

  const hasArtifact = presenceQuery.data ?? false;
  const readPathWired = edgeApiBaseUrl() !== null;

  const shotsQuery = useQuery<Record<string, ScanCapabilityUrl> | null>({
    queryKey: ['room-file-renders-shots', roomFileId],
    enabled: enabled && Boolean(roomFileId) && readPathWired && hasArtifact,
    // Capability URLs live 600 s — re-mint well inside that window rather than
    // at its edge, matching `useSplatUrl`.
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('no session');

      const result = await fetchScanArtifact(
        roomFileId as string,
        RENDERS_ARTIFACT_KIND,
        session.access_token,
      );
      return result && 'shots' in result ? result.shots : null;
    },
  });

  if (!hasArtifact) {
    return {
      hasArtifact: false,
      shots: null,
      unavailable: 'no-artifact',
      isLoading: presenceQuery.isLoading,
    };
  }

  if (!readPathWired) {
    return {
      hasArtifact: true,
      shots: null,
      unavailable: 'read-path-pending',
      isLoading: presenceQuery.isLoading,
    };
  }

  if (shotsQuery.data) {
    return {
      hasArtifact: true,
      shots: shotsQuery.data,
      unavailable: null,
      isLoading: false,
    };
  }

  // A resolved-but-empty answer is the route's 404: registered here, but not
  // servable to this caller — same collapse `useSplatUrl` makes.
  const resolvedAbsent = shotsQuery.isFetched && shotsQuery.data === null;
  return {
    hasArtifact: !resolvedAbsent,
    shots: null,
    unavailable: resolvedAbsent ? 'no-artifact' : 'read-path-pending',
    isLoading: presenceQuery.isLoading || shotsQuery.isLoading,
  };
}
