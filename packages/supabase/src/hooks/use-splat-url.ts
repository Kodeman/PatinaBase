/**
 * Splat artifact resolution — the Room View SPLAT projection's data seam
 * (Rendered Room v2, W2; PROPOSAL §4 "One viewer substrate").
 *
 * ── THE READ-PATH CONTRACT ────────────────────────────────────────────────────
 * A trained Gaussian splat is registered the way every new scan artifact is
 * registered after 00489: NOT as a URL column, but as an entry in
 * `room_files.artifacts`, a jsonb map of
 *
 *     artifact kind -> { object_id: uuid, version: int }
 *
 * whose `object_id` names a row in `public.media_objects` (bucket + object_key +
 * access_class). The splat lands under the key `splat`. `room_files.splat_url`
 * (00376) is the PREVIOUS generation's pointer and is deliberately not read here:
 * 00489 ruled `artifacts` the canonical home for new versioned artifacts, and the
 * splat is one.
 *
 * Resolving that ref to something a browser can fetch now runs through the typed
 * read path (plan §2 R5 / §3 W2):
 *
 *     room_files.artifacts.splat.object_id
 *       → GET /v1/scan/room-files/:id/artifacts/splat on the edge API Worker
 *       → the caller's OWN RLS on room_files + media_objects, in one
 *         SET LOCAL ROLE authenticated transaction on the uncached binding
 *       → a 600-second R2 capability URL
 *
 * Note what is NOT in that chain: `public.scan_media_read`. That view is
 * SELECT-able only by `scan_reader` and carries no tenant predicate, so 00490
 * requires one before any login role inherits it — the route runs the caller's
 * own policies instead, which is strictly stronger and needs no new role.
 *
 * The route is behind the Worker's `SCAN_ROUTES` flag, which rests at `off` in
 * every environment until the R2 credentials exist, and this hook is behind
 * `NEXT_PUBLIC_EDGE_API_URL`. With that unset — every environment today — the
 * hook's behavior is exactly what it was before the resolver existed: it reports
 * the artifact's PRESENCE and an explicit `unavailable: 'read-path-pending'`,
 * and invents no URL.
 *
 * ── WHY PRESENCE LIVES HERE AND NOT IN THE CALLER ─────────────────────────────
 * The portal never parses the `artifacts` jsonb. It asks this hook one question
 * and gets one answer, so the mode toggle and the stage can never disagree about
 * whether a splat exists — and when the read path lands, `url` starts arriving
 * from `urlSource` with no component change at all.
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import {
  edgeApiBaseUrl,
  fetchScanArtifact,
  type ScanCapabilityUrl,
} from '../lib/scan-artifact-url';

// Lazy client getter to avoid module-level initialization during SSR.
const getSupabase = () => createBrowserClient();

/** The artifact key a trained splat is registered under in `room_files.artifacts`. */
export const SPLAT_ARTIFACT_KIND = 'splat';

/** One `room_files.artifacts[kind]` entry (00489). `version` counts re-registrations
 *  of the same object and is informational — `object_id` is the identity, which is
 *  why `scan_media_read` joins on the id alone. */
export interface SplatArtifactRef {
  object_id: string;
  version: number | null;
}

/**
 * Why there is no fetchable URL.
 *  · `no-artifact`       — there is nothing to show: this Room File version
 *                          registers no `splat` entry, OR the read path is wired
 *                          and answered 404 for it. The route collapses every
 *                          "you get nothing" case into one answer on purpose (a
 *                          403 would confirm the row exists), so this hook does
 *                          not try to unpick it either.
 *  · `read-path-pending` — a splat IS registered but no URL has arrived: either
 *                          `NEXT_PUBLIC_EDGE_API_URL` is unset in this build, or
 *                          the capability request is still in flight.
 */
export type SplatUnavailableReason = 'no-artifact' | 'read-path-pending';

export interface SplatSource {
  /** True when there is a splat to show — registered, and servable if the read
   *  path is wired to say so. */
  hasArtifact: boolean;
  /** The ref exactly as recorded, for telemetry and for the future resolver. */
  artifact: SplatArtifactRef | null;
  /** A fetchable URL, or null. Non-null today only via `urlSource` (see below). */
  url: string | null;
  /** Why `url` is null; null when a URL resolved. */
  unavailable: SplatUnavailableReason | null;
  /** True while the Room File row is in flight. */
  isLoading: boolean;
}

/**
 * Pull the `splat` ref out of a `room_files.artifacts` value. Total and defensive:
 * `artifacts` is jsonb with no shape constraint beyond object-ness, so anything that
 * is not a well-formed `{object_id: string}` reads as "no splat" rather than throwing
 * into a render.
 */
export function readSplatArtifactRef(artifacts: unknown): SplatArtifactRef | null {
  if (!artifacts || typeof artifacts !== 'object' || Array.isArray(artifacts)) return null;
  const entry = (artifacts as Record<string, unknown>)[SPLAT_ARTIFACT_KIND];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;

  const { object_id: objectId, version } = entry as Record<string, unknown>;
  if (typeof objectId !== 'string' || objectId.length === 0) return null;

  return {
    object_id: objectId,
    version: typeof version === 'number' ? version : null,
  };
}

export interface UseSplatUrlOptions {
  /**
   * THE FORWARD SEAM. A URL from outside this hook, used verbatim when non-null.
   *
   * Two callers, now and later:
   *  · today — the designer portal's dev-only `?splatUrl=` override, so the viewer
   *    can be driven against a local fixture before the read path exists;
   *  · later — the resolved capability URL from the typed `/v1/scan/*` route, at
   *    which point this hook's own resolver leg replaces the override as the
   *    ordinary source and no consuming component changes.
   *
   * An override is authoritative: it reports `hasArtifact` true and `unavailable`
   * null even for a Room File that registers nothing, because the whole point is to
   * reach the stage without one.
   */
  urlSource?: string | null;
  /** Set false to keep the query from running at all (an unmounted projection). */
  enabled?: boolean;
}

/**
 * The SPLAT projection's single source of truth: does this Room File version carry a
 * splat, and can it be fetched?
 *
 * Reads only `id` + `artifacts` — the row's `certificate` jsonb is heavy and no part
 * of this answer. RLS on `room_files` delegates SELECT to the scan's own visibility
 * on `room_scans` (00341 §RLS), so a caller who can see the room can see this.
 */
export function useSplatUrl(
  roomFileId: string | null | undefined,
  options: UseSplatUrlOptions = {},
): SplatSource {
  const { urlSource = null, enabled = true } = options;

  const query = useQuery<SplatArtifactRef | null>({
    queryKey: ['room-file-splat-artifact', roomFileId],
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
      return readSplatArtifactRef((data as { artifacts?: unknown } | null)?.artifacts);
    },
  });

  const artifact = query.data ?? null;
  // The read path is wired per build. Unset — every environment today, since the
  // Worker's own SCAN_ROUTES flag rests at `off` until the R2 credentials exist
  // — leaves this leg disabled and the hook exactly as it behaved before.
  const readPathWired = edgeApiBaseUrl() !== null;

  const capability = useQuery<ScanCapabilityUrl | null>({
    queryKey: ['room-file-splat-url', roomFileId],
    enabled:
      enabled &&
      Boolean(roomFileId) &&
      !urlSource &&
      readPathWired &&
      artifact != null,
    // A capability URL lives 600 s. Re-mint well inside that rather than at the
    // edge of it: a URL that expires mid-download is a broken viewer.
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('no session');

      const result = await fetchScanArtifact(
        roomFileId as string,
        SPLAT_ARTIFACT_KIND,
        session.access_token,
      );
      // `renders` is the only kind that answers a shot map, and this hook never
      // asks for it.
      return result && 'url' in result ? result : null;
    },
  });

  if (urlSource) {
    return {
      hasArtifact: true,
      artifact,
      url: urlSource,
      unavailable: null,
      isLoading: false,
    };
  }

  if (artifact == null) {
    return {
      hasArtifact: false,
      artifact: null,
      url: null,
      unavailable: 'no-artifact',
      isLoading: query.isLoading,
    };
  }

  if (!readPathWired) {
    return {
      hasArtifact: true,
      artifact,
      url: null,
      unavailable: 'read-path-pending',
      isLoading: query.isLoading,
    };
  }

  if (capability.data) {
    return {
      hasArtifact: true,
      artifact,
      url: capability.data.url,
      unavailable: null,
      isLoading: false,
    };
  }

  // A resolved-but-empty answer is the route's 404: registered here, but not
  // servable to this caller. Nothing to show, so the mode toggle and the stage
  // agree — which is the entire reason presence is decided in this hook.
  const resolvedAbsent = capability.isFetched && capability.data === null;
  return {
    hasArtifact: !resolvedAbsent,
    artifact,
    url: null,
    unavailable: resolvedAbsent ? 'no-artifact' : 'read-path-pending',
    isLoading: query.isLoading || capability.isLoading,
  };
}
