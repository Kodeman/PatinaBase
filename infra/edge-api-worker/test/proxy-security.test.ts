import { proxySupabaseRequest } from '../src/proxy';
import {
  isSelectedForRollout,
  redactRecord,
  rolloutBucket,
} from '../src/security';
import type { EdgeApiEnv } from '../src/env';

const env = {
  SUPABASE_UPSTREAM_URL: 'https://project.supabase.co',
} as EdgeApiEnv;

describe('Supabase compatibility proxy', () => {
  it('preserves method, body, auth headers, cookies, status, CORS, and response cookies', async () => {
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
      'trace-0000000001',
      async (request) => {
        forwarded = request as Request;
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

  it('passes a WebSocket upgrade and the upstream socket through', async () => {
    const socket = { accept: vi.fn() } as unknown as WebSocket;
    let forwarded: Request | undefined;
    const upstream = new Response(null, { status: 200 });
    Object.defineProperty(upstream, 'webSocket', { value: socket });
    const response = await proxySupabaseRequest(
      new Request('https://api.patina.cloud/realtime/v1/websocket', {
        headers: { upgrade: 'websocket', connection: 'Upgrade' },
      }),
      env,
      'trace-0000000002',
      async (request) => {
        forwarded = request as Request;
        return upstream;
      },
    );
    expect(forwarded?.headers.get('upgrade')).toBe('websocket');
    expect((response as Response & { webSocket?: WebSocket }).webSocket).toBe(
      socket,
    );
  });

  it('blocks marker-header and same-origin route loops without fetching', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const markerResponse = await proxySupabaseRequest(
      new Request('https://api.patina.cloud/auth/v1/token', {
        headers: { 'x-patina-edge-proxy': '1' },
      }),
      env,
      'trace-0000000003',
      fetcher,
    );
    const originResponse = await proxySupabaseRequest(
      new Request('https://api.patina.cloud/auth/v1/token'),
      { SUPABASE_UPSTREAM_URL: 'https://api.patina.cloud' } as EdgeApiEnv,
      'trace-0000000004',
      fetcher,
    );
    expect(markerResponse.status).toBe(508);
    expect(originResponse.status).toBe(508);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('logging redaction and deterministic canary selection', () => {
  it('redacts credentials, cookies, SQL inputs, PII, and nested content', () => {
    expect(
      redactRecord({
        event: 'request_failure',
        authorization: 'Bearer secret',
        apikey: 'key',
        cookie: 'session=value',
        sqlParams: ['private-id'],
        email: 'person@example.com',
        nested: { content: 'customer note' },
        status: 500,
      }),
    ).toEqual({
      event: 'request_failure',
      authorization: '[REDACTED]',
      apikey: '[REDACTED]',
      cookie: '[REDACTED]',
      sqlParams: '[REDACTED]',
      email: '[REDACTED]',
      nested: { content: '[REDACTED]' },
      status: 500,
    });
  });

  it('buckets the same key consistently and honors boundary percentages', () => {
    expect(rolloutBucket('stable-client')).toBe(rolloutBucket('stable-client'));
    expect(isSelectedForRollout('stable-client', 0)).toBe(false);
    expect(isSelectedForRollout('stable-client', 100)).toBe(true);
    const bucket = rolloutBucket('stable-client');
    expect(isSelectedForRollout('stable-client', bucket)).toBe(false);
    expect(isSelectedForRollout('stable-client', bucket + 1)).toBe(true);
  });
});
