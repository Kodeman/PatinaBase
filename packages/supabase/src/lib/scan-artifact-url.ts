/**
 * The client half of the scan read path (Rendered Room v2 W2, DELIVERY-PLAN R5).
 *
 * `GET /v1/scan/room-files/:roomFileId/artifacts/:kind` on the edge API Worker
 * mints a short-lived R2 capability URL after checking the caller's OWN row
 * security. So this module carries no authorization logic and no fallback: it
 * forwards the session's access token and reports exactly what the route said.
 *
 * ── FAIL-CLOSED ON CONFIGURATION ────────────────────────────────────────────
 * `NEXT_PUBLIC_EDGE_API_URL` unset means the read path is not wired in this
 * environment — which is every environment today, because `SCAN_ROUTES` rests at
 * `off` everywhere until the R2 credentials exist. An unset base URL therefore
 * resolves to `null` rather than guessing an origin, and the calling hook keeps
 * reporting `read-path-pending`, which is precisely today's behavior. Nothing
 * about turning this on is implicit.
 */

/** Artifact kinds the route serves. `renders` answers a shot map; the others a single URL. */
export type ScanArtifactKind = 'splat' | 'glb' | 'renders';

/** One signed, expiring capability URL. */
export interface ScanCapabilityUrl {
  url: string;
  /** ISO-8601 instant the URL stops working — 600 s after it was minted. */
  expiresAt: string;
}

export interface ScanRendersResponse {
  kind: 'renders';
  /** Shot name (`corner_ne`, `turntable`, …) — whatever the renders stage registered. */
  shots: Record<string, ScanCapabilityUrl>;
}

/**
 * The edge API's origin for this build, or null when the read path is not wired
 * here. `NEXT_PUBLIC_*` is inlined at build/dev start, so this is a build-time
 * fact rather than something that can change under a running page.
 */
export function edgeApiBaseUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_EDGE_API_URL;
  return configured && configured.trim().length > 0 ? configured.replace(/\/+$/, '') : null;
}

/** Thrown when the route answered with something other than 200 or 404. */
export class ScanArtifactError extends Error {
  constructor(readonly status: number) {
    super(`scan artifact request failed with ${status}`);
    this.name = 'ScanArtifactError';
  }
}

/**
 * Ask the route for one artifact.
 *
 * Returns `null` for a 404, which the route uses for every "you get nothing"
 * case at once — no such Room File, not visible to you, no artifact of this
 * kind, no confirmed bytes. That collapse is deliberate on the server side (a
 * 403 would confirm the row exists), so the client must not try to unpick it
 * either: absent is absent.
 *
 * A 401 or a 5xx is a real error and throws, so React Query retries and reports
 * rather than rendering "this room has no splat" over an expired session.
 */
export async function fetchScanArtifact(
  roomFileId: string,
  kind: ScanArtifactKind,
  accessToken: string,
  fetcher: typeof fetch = fetch,
): Promise<ScanCapabilityUrl | ScanRendersResponse | null> {
  const baseUrl = edgeApiBaseUrl();
  if (!baseUrl) return null;

  const response = await fetcher(
    `${baseUrl}/v1/scan/room-files/${encodeURIComponent(roomFileId)}/artifacts/${kind}`,
    {
      headers: { authorization: `Bearer ${accessToken}` },
      // A capability URL is minted per request and expires; caching the response
      // that carries it would hand out a URL that is already dead.
      cache: 'no-store',
    },
  );

  if (response.status === 404) return null;
  if (!response.ok) throw new ScanArtifactError(response.status);

  const body = (await response.json()) as
    | { kind: string; url?: string; expiresAt?: string; shots?: unknown };

  if (kind === 'renders') {
    const shots = body.shots;
    if (!shots || typeof shots !== 'object' || Array.isArray(shots)) return null;
    const resolved: Record<string, ScanCapabilityUrl> = {};
    for (const [shot, value] of Object.entries(shots as Record<string, unknown>)) {
      const entry = value as { url?: unknown; expiresAt?: unknown };
      if (typeof entry?.url === 'string' && typeof entry.expiresAt === 'string') {
        resolved[shot] = { url: entry.url, expiresAt: entry.expiresAt };
      }
    }
    return Object.keys(resolved).length > 0 ? { kind: 'renders', shots: resolved } : null;
  }

  if (typeof body.url !== 'string' || typeof body.expiresAt !== 'string') return null;
  return { url: body.url, expiresAt: body.expiresAt };
}
