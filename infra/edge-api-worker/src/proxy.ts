import type { EdgeApiEnv } from './env';

export const COMPATIBILITY_PREFIXES = [
  '/auth/v1/',
  '/realtime/v1/',
  '/rest/v1/',
  '/graphql/v1/',
  '/functions/v1/',
  '/storage/v1/',
] as const;

const LOOP_HEADER = 'x-patina-edge-proxy';

export function isCompatibilityPath(pathname: string): boolean {
  return COMPATIBILITY_PREFIXES.some(
    (prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix),
  );
}

export async function proxySupabaseRequest(
  request: Request,
  env: EdgeApiEnv,
  traceId: string,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const incoming = new URL(request.url);
  const upstreamBase = new URL(env.SUPABASE_UPSTREAM_URL);
  if (
    request.headers.has(LOOP_HEADER) ||
    upstreamBase.origin === incoming.origin
  ) {
    return new Response(JSON.stringify({ error: 'proxy_loop' }), {
      status: 508,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'private, no-store',
        'x-patina-trace-id': traceId,
      },
    });
  }

  const upstreamUrl = new URL(
    `${incoming.pathname}${incoming.search}`,
    upstreamBase,
  );
  const headers = new Headers(request.headers);
  headers.set(LOOP_HEADER, '1');
  headers.set('x-patina-trace-id', traceId);
  const requestInit: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
    signal: request.signal,
  };
  if (requestInit.body) requestInit.duplex = 'half';
  const upstreamRequest = new Request(upstreamUrl, requestInit);
  const upstream = await fetcher(upstreamRequest);
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.set('cache-control', 'private, no-store');
  responseHeaders.set('cdn-cache-control', 'no-store');
  responseHeaders.set('cloudflare-cdn-cache-control', 'no-store');
  responseHeaders.set('x-patina-trace-id', traceId);

  const workerResponse = upstream as Response & {
    webSocket?: WebSocket | null;
  };
  const responseInit = {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
    webSocket: workerResponse.webSocket ?? undefined,
  } as ResponseInit & { webSocket?: WebSocket };
  const response = new Response(
    workerResponse.webSocket ? null : upstream.body,
    responseInit,
  );
  if (workerResponse.webSocket && !('webSocket' in response)) {
    Object.defineProperty(response, 'webSocket', {
      value: workerResponse.webSocket,
    });
  }
  return response;
}
