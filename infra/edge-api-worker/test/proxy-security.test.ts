import { UpstreamAbortError, UpstreamTimeoutError } from '../src/deadline';
import type { EdgeApiEnv, RuntimeConfig } from '../src/env';
import { proxySupabaseRequest } from '../src/proxy';
import {
  ALERT_EVENTS,
  createTraceId,
  isSelectedForRollout,
  rolloutBucket,
  routeClassFor,
  structuredLog,
  trustedRolloutKey,
} from '../src/security';

const env = {
  SUPABASE_UPSTREAM_URL: 'https://project.supabase.co',
} as EdgeApiEnv;

const config: RuntimeConfig = {
  catalogSource: 'legacy',
  catalogHyperdrivePercent: 0,
  legacyFetchTimeoutMs: 100,
  compatibilityFetchTimeoutMs: 100,
  websocketHandshakeTimeoutMs: 50,
};

describe('Supabase compatibility proxy', () => {
  it('preserves method, body, Supabase auth, cookies, status, CORS, and response cookies', async () => {
    let forwarded: Request | undefined;
    const response = await proxySupabaseRequest(
      new Request('https://api.patina.cloud/rest/v1/rpc/do_work?select=id', {
        method: 'POST',
        headers: {
          authorization: 'Bearer user-jwt',
          apikey: 'publishable-key',
          cookie: 'session=value',
          'content-type': 'application/json',
          origin: 'https://client.patina.cloud',
        },
        body: JSON.stringify({ hello: 'world' }),
      }),
      env,
      config,
      'trace-0000000001',
      async (input, init) => {
        forwarded = new Request(input, init);
        return new Response('created', {
          status: 201,
          headers: {
            'access-control-allow-origin': 'https://client.patina.cloud',
            'set-cookie': 'refresh=token; HttpOnly',
          },
        });
      },
    );

    expect(forwarded?.url).toBe(
      'https://project.supabase.co/rest/v1/rpc/do_work?select=id',
    );
    expect(forwarded?.method).toBe('POST');
    expect(forwarded?.redirect).toBe('manual');
    expect(forwarded?.headers.get('authorization')).toBe('Bearer user-jwt');
    expect(forwarded?.headers.get('apikey')).toBe('publishable-key');
    expect(forwarded?.headers.get('cookie')).toBe('session=value');
    expect(await forwarded?.json()).toEqual({ hello: 'world' });
    expect(response.status).toBe(201);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://client.patina.cloud',
    );
    expect(response.headers.get('set-cookie')).toContain('refresh=token');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('strips Access, internal, Cloudflare, Host, proxy, and hop-by-hop request headers', async () => {
    let forwarded: Request | undefined;
    const request = new Request('https://api.patina.cloud/storage/v1/object/a', {
      headers: {
        authorization: 'Bearer user-jwt',
        apikey: 'publishable-key',
        cookie: 'session=value',
        host: 'api.patina.cloud',
        connection: 'keep-alive, x-remove-me',
        'x-remove-me': 'connection-nominated',
        'keep-alive': 'timeout=5',
        'proxy-authorization': 'Basic secret',
        forwarded: 'for=private',
        'x-forwarded-for': '10.0.0.1',
        'cf-access-client-id': 'service-id',
        'cf-access-client-secret': 'service-secret',
        'cf-access-jwt-assertion': 'assertion',
        'cf-connecting-ip': '10.0.0.2',
        'cf-ray': 'caller-ray',
        'x-patina-trace-id': 'caller-trace',
        'x-patina-edge-proxy': '1',
      },
    });
    await proxySupabaseRequest(
      request,
      env,
      config,
      'server-trace',
      async (input, init) => {
        forwarded = new Request(input, init);
        return new Response('ok');
      },
    );

    expect(forwarded?.headers.get('authorization')).toBe('Bearer user-jwt');
    expect(forwarded?.headers.get('apikey')).toBe('publishable-key');
    expect(forwarded?.headers.get('cookie')).toBe('session=value');
    for (const name of [
      'host',
      'connection',
      'x-remove-me',
      'keep-alive',
      'proxy-authorization',
      'forwarded',
      'x-forwarded-for',
      'cf-access-client-id',
      'cf-access-client-secret',
      'cf-access-jwt-assertion',
      'cf-connecting-ip',
      'cf-ray',
      'x-patina-trace-id',
      'x-patina-edge-proxy',
    ]) {
      expect(forwarded?.headers.has(name), name).toBe(false);
    }
  });

  it('blocks a same-origin route loop without fetching', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const response = await proxySupabaseRequest(
      new Request('https://api.patina.cloud/auth/v1/token'),
      { SUPABASE_UPSTREAM_URL: 'https://api.patina.cloud' } as EdgeApiEnv,
      config,
      'trace-0000000004',
      fetcher,
    );
    expect(response.status).toBe(508);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('times out a never-settling compatibility fetch independently', async () => {
    await expect(
      proxySupabaseRequest(
        new Request('https://api.patina.cloud/rest/v1/products'),
        env,
        { ...config, compatibilityFetchTimeoutMs: 5 },
        'server-trace',
        () => new Promise<Response>(() => undefined),
      ),
    ).rejects.toBeInstanceOf(UpstreamTimeoutError);
  });

  it('uses the independent WebSocket handshake deadline', async () => {
    await expect(
      proxySupabaseRequest(
        new Request('https://api.patina.cloud/realtime/v1/websocket', {
          headers: { connection: 'Upgrade', upgrade: 'websocket' },
        }),
        env,
        {
          ...config,
          compatibilityFetchTimeoutMs: 1000,
          websocketHandshakeTimeoutMs: 5,
        },
        'server-trace',
        () => new Promise<Response>(() => undefined),
      ),
    ).rejects.toBeInstanceOf(UpstreamTimeoutError);
  });

  it('rejects a malformed WebSocket response that carries a socket without 101', async () => {
    const upstream = new Response(null, { status: 200 });
    Object.defineProperty(upstream, 'webSocket', {
      value: {} as WebSocket,
    });
    const response = await proxySupabaseRequest(
      new Request('https://api.patina.cloud/realtime/v1/websocket', {
        headers: { connection: 'Upgrade', upgrade: 'websocket' },
      }),
      env,
      config,
      'server-trace',
      async () => upstream,
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'invalid_upstream_response',
    });
  });

  it('propagates caller abort even when the upstream fetch ignores its signal', async () => {
    const controller = new AbortController();
    const pending = proxySupabaseRequest(
      new Request('https://api.patina.cloud/functions/v1/work', {
        signal: controller.signal,
      }),
      env,
      config,
      'server-trace',
      () => new Promise<Response>(() => undefined),
    );
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(UpstreamAbortError);
  });
});

describe('allowlisted logging, server trace ids, and deterministic canary selection', () => {
  it('serializes only the explicit operational allowlist', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    structuredLog({
      event: ALERT_EVENTS.requestFailure,
      severity: 'error',
      traceId: 'server-trace',
      routeClass: 'unknown',
      status: 500,
      authorization: 'Bearer secret',
      pathname: '/private/person@example.com',
      nested: { content: 'customer note' },
    } as never);
    expect(JSON.parse(String(consoleSpy.mock.calls[0][0]))).toEqual({
      event: 'edge_api_request_failure',
      severity: 'error',
      traceId: 'server-trace',
      routeClass: 'unknown',
      status: 500,
    });
    consoleSpy.mockRestore();
  });

  it('always creates a server trace and classifies arbitrary paths without logging them', () => {
    expect(createTraceId(() => 'server-generated')).toBe('server-generated');
    expect(routeClassFor('/users/person@example.com/private')).toBe('unknown');
  });

  it('buckets the same trusted key consistently and honors boundary percentages', () => {
    expect(rolloutBucket('stable-client')).toBe(rolloutBucket('stable-client'));
    expect(isSelectedForRollout('stable-client', 0)).toBe(false);
    expect(isSelectedForRollout('stable-client', 100)).toBe(true);
    const bucket = rolloutBucket('stable-client');
    expect(isSelectedForRollout('stable-client', bucket)).toBe(false);
    expect(isSelectedForRollout('stable-client', bucket + 1)).toBe(true);
  });

  it('does not let a caller rollout header override the Cloudflare cohort', () => {
    const first = new Request('https://api.example/v1/catalog/products', {
      headers: {
        'cf-connecting-ip': '192.0.2.10',
        'x-patina-rollout-key': 'force-selected',
      },
    });
    const second = new Request('https://api.example/v1/catalog/products', {
      headers: {
        'cf-connecting-ip': '192.0.2.10',
        'x-patina-rollout-key': 'force-legacy',
      },
    });
    expect(trustedRolloutKey(first)).toBe(trustedRolloutKey(second));
  });
});
