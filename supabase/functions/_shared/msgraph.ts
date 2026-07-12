// _shared/msgraph.ts — minimal Microsoft Graph client for the Cowork intake
// bridge (WP-1.5). Client-credentials token + a fetch wrapper that honours
// 429/503 Retry-After with a single bounded wait, then throws RateLimited.
//
// Scoped deliberately small: the bridge needs a token, delta paging, item
// download, and a move (PATCH parentReference). No SDK — one dependency-free
// module so the edge fn bundles cleanly. Everything is injectable (fetchImpl,
// sleep) so it unit-tests offline against a fake.

export interface GraphCreds {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

/** Thrown when Graph is still rate-limited after one bounded Retry-After wait. */
export class RateLimited extends Error {
  /** Retry-After in seconds, as reported by Graph (best-effort). */
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number, message = 'Microsoft Graph rate limited') {
    super(message);
    this.name = 'RateLimited';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const DEFAULT_RETRY_MS = 5_000;
const MAX_WAIT_MS = 30_000;

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

/** Parse a Retry-After header (delta-seconds or HTTP-date) into ms, bounded. */
export function retryAfterMs(header: string | null, maxWaitMs = MAX_WAIT_MS): number {
  if (!header) return Math.min(DEFAULT_RETRY_MS, maxWaitMs);
  const secs = Number(header);
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, maxWaitMs);
  const when = Date.parse(header);
  if (!Number.isNaN(when)) return Math.min(Math.max(0, when - Date.now()), maxWaitMs);
  return Math.min(DEFAULT_RETRY_MS, maxWaitMs);
}

/** Client-credentials token for the .default app-permission scope. */
export async function getGraphToken(
  creds: GraphCreds,
  opts: { fetchImpl?: FetchImpl } = {},
): Promise<string> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetchImpl(
    `https://login.microsoftonline.com/${encodeURIComponent(creds.tenantId)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Graph token request failed: ${res.status} ${detail}`.trim());
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('Graph token response missing access_token');
  return json.access_token;
}

/**
 * Authenticated Graph fetch. Relative paths (starting '/') are resolved against
 * the v1.0 base; absolute URLs (e.g. an @odata.nextLink) pass through. On
 * 429/503 it waits once (bounded ≤30s, honouring Retry-After) and retries; if
 * still throttled, it throws RateLimited so the caller can stop cleanly.
 */
export async function graphFetch(
  token: string,
  url: string,
  init: RequestInit = {},
  opts: { fetchImpl?: FetchImpl; sleep?: (ms: number) => Promise<void>; maxWaitMs?: number } = {},
): Promise<Response> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxWaitMs = opts.maxWaitMs ?? MAX_WAIT_MS;
  const full = url.startsWith('http') ? url : `${GRAPH_BASE}${url}`;

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  let res = await fetchImpl(full, { ...init, headers });

  if (res.status === 429 || res.status === 503) {
    const waitMs = retryAfterMs(res.headers.get('Retry-After'), maxWaitMs);
    await sleep(waitMs);
    res = await fetchImpl(full, { ...init, headers });
    if (res.status === 429 || res.status === 503) {
      throw new RateLimited(Math.ceil(retryAfterMs(res.headers.get('Retry-After'), maxWaitMs) / 1000));
    }
  }

  return res;
}
