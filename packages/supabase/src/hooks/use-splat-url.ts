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
 * Resolving that ref to something a browser can fetch is the half that does not
 * exist yet. The intended path (00490's comment, plan §2 R5 / §3 W2) is:
 *
 *     room_files.artifacts.splat.object_id
 *       → public.scan_media_read  (kind / bucket / object_key / access_class)
 *       → a typed /v1/scan/* route on the edge API Worker
 *       → a short-lived capability URL against R2
 *
 * and every rung of it is W2 work gated behind PR #28. `scan_media_read` exists
 * today but is SELECT-able only by `scan_reader`, a NOLOGIN role no browser
 * session can reach, and it carries no tenant predicate — 00490 says in as many
 * words that W2 must add one before any login role inherits it. So there is no
 * honest way for this hook to produce a URL right now, and it does not invent
 * one: it reports the artifact's PRESENCE and an explicit
 * `unavailable: 'read-path-pending'`.
 *
 * ── WHY PRESENCE LIVES HERE AND NOT IN THE CALLER ─────────────────────────────
 * The portal never parses the `artifacts` jsonb. It asks this hook one question
 * and gets one answer, so the mode toggle and the stage can never disagree about
 * whether a splat exists — and when the read path lands, `url` starts arriving
 * from `urlSource` with no component change at all.
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

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
 *  · `no-artifact`       — this Room File version registers no `splat` entry.
 *  · `read-path-pending` — a splat IS registered, but the capability-URL route
 *                          that would resolve it is not built yet (see header).
 */
export type SplatUnavailableReason = 'no-artifact' | 'read-path-pending';

export interface SplatSource {
  /** True when this Room File version registers a `splat` artifact. */
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

  if (urlSource) {
    return {
      hasArtifact: true,
      artifact: query.data ?? null,
      url: urlSource,
      unavailable: null,
      isLoading: false,
    };
  }

  const artifact = query.data ?? null;
  return {
    hasArtifact: artifact != null,
    artifact,
    url: null,
    unavailable: artifact != null ? 'read-path-pending' : 'no-artifact',
    isLoading: query.isLoading,
  };
}
