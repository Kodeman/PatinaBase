import { fetchWithDeadline } from './deadline';
import type { EdgeApiEnv, RuntimeConfig } from './env';
import { ALERT_EVENTS, routeClassFor, structuredLog } from './security';

export const COMPATIBILITY_PREFIXES = [
  '/auth/v1/',
  '/realtime/v1/',
  '/rest/v1/',
  '/graphql/v1/',
  '/functions/v1/',
  '/storage/v1/',
] as const;

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const PROXY_METADATA_HEADERS = new Set([
  'forwarded',
  'host',
  'true-client-ip',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
]);

export function isCompatibilityPath(pathname: string): boolean {
  return COMPATIBILITY_PREFIXES.some(
    (prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix),
  );
}

function isWebSocketUpgrade(request: Request): boolean {
  return request.headers.get('upgrade')?.toLowerCase() === 'websocket';
}

export function compatibilityUpstreamHeaders(request: Request): Headers {
  const headers = new Headers();
  const connectionNamedHeaders = new Set(
    (request.headers.get('connection') ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );

  request.headers.forEach((value, name) => {
    const lowerName = name.toLowerCase();
    if (
      HOP_BY_HOP_HEADERS.has(lowerName) ||
      connectionNamedHeaders.has(lowerName) ||
      PROXY_METADATA_HEADERS.has(lowerName) ||
      lowerName.startsWith('cf-') ||
      lowerName.startsWith('x-patina-')
    ) {
      return;
    }
    headers.append(name, value);
  });

  // All client-supplied forwarding headers were stripped above (anti-spoof).
  // Re-derive X-Forwarded-For solely from cf-connecting-ip, which Cloudflare
  // sets and a client cannot forge, so GoTrue sees the real per-caller IP for
  // rate-limiting and audit. Absent it (non-CF path), forward nothing.
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  if (cfConnectingIp) {
    headers.set('x-forwarded-for', cfConnectingIp);
  }

  if (isWebSocketUpgrade(request)) {
    headers.set('connection', 'Upgrade');
    headers.set('upgrade', 'websocket');
  }
  return headers;
}

function proxyError(status: number, error: string, traceId: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'private, no-store',
      'x-patina-trace-id': traceId,
    },
  });
}

export async function proxySupabaseRequest(
  request: Request,
  env: EdgeApiEnv,
  config: RuntimeConfig,
  traceId: string,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const incoming = new URL(request.url);
  const upstreamBase = new URL(env.SUPABASE_UPSTREAM_URL);
  if (upstreamBase.origin === incoming.origin) {
    return proxyError(508, 'proxy_loop', traceId);
  }

  const upstreamUrl = new URL(
    `${incoming.pathname}${incoming.search}`,
    upstreamBase,
  );
  // Defense-in-depth: the router's isCompatibilityPath prefix gate already
  // keeps arbitrary paths out, but a scheme-relative pathname (e.g.
  // "//evil.com/rest/v1/x") resolves against upstreamBase to a *different*
  // origin entirely. Re-validate here so a future routing change can't
  // silently reopen an open-redirect-style proxy to an attacker origin.
  // Origin re-validation is not path re-validation, so the resolved path is
  // checked too, making this function safe fully independent of the router.
  if (
    upstreamUrl.origin !== upstreamBase.origin ||
    !isCompatibilityPath(upstreamUrl.pathname)
  ) {
    structuredLog({
      event: ALERT_EVENTS.proxyOriginRejected,
      severity: 'error',
      traceId,
      routeClass: routeClassFor(incoming.pathname),
      status: 400,
    });
    return proxyError(400, 'invalid_upstream_path', traceId);
  }
  const requestInit: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers: compatibilityUpstreamHeaders(request),
    body:
      request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : request.body,
    redirect: 'manual',
  };
  if (requestInit.body) requestInit.duplex = 'half';

  const websocketUpgrade = isWebSocketUpgrade(request);
  const upstream = await fetchWithDeadline(
    fetcher,
    upstreamUrl,
    requestInit,
    request.signal,
    websocketUpgrade
      ? config.websocketHandshakeTimeoutMs
      : config.compatibilityFetchTimeoutMs,
  );
  const workerResponse = upstream as Response & {
    webSocket?: WebSocket | null;
  };
  const webSocket = workerResponse.webSocket ?? undefined;
  if (
    (upstream.status === 101 && !webSocket) ||
    (webSocket && upstream.status !== 101)
  ) {
    return proxyError(502, 'invalid_upstream_response', traceId);
  }

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.set('cache-control', 'private, no-store');
  responseHeaders.set('cdn-cache-control', 'no-store');
  responseHeaders.set('cloudflare-cdn-cache-control', 'no-store');
  responseHeaders.set('x-patina-trace-id', traceId);

  const responseInit = {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
    webSocket,
  } as ResponseInit & { webSocket?: WebSocket };
  return new Response(webSocket ? null : upstream.body, responseInit);
}
