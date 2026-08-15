import { exports } from 'cloudflare:workers';
import type { EdgeApiEnv, RuntimeConfig } from '../../src/env';
import { proxySupabaseRequest } from '../../src/proxy';

const config: RuntimeConfig = {
  catalogSource: 'legacy',
  catalogHyperdrivePercent: 0,
  legacyFetchTimeoutMs: 100,
  compatibilityFetchTimeoutMs: 100,
  websocketHandshakeTimeoutMs: 100,
};

describe('workerd runtime contracts', () => {
  it('invokes the default export without dependency overrides', async () => {
    const response = await exports.default.fetch(
      new Request('https://preview.example/not-found'),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-patina-trace-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('passes a real WebSocketPair through a 101 compatibility response', async () => {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    let forwarded: Request | undefined;

    const response = await proxySupabaseRequest(
      new Request('https://api.patina.cloud/realtime/v1/websocket', {
        headers: { connection: 'Upgrade', upgrade: 'websocket' },
      }),
      {
        SUPABASE_UPSTREAM_URL: 'https://project.supabase.co',
      } as EdgeApiEnv,
      config,
      'server-trace',
      async (input, init) => {
        forwarded = new Request(input, init);
        return new Response(null, { status: 101, webSocket: client });
      },
    );

    expect(forwarded?.headers.get('connection')).toBe('Upgrade');
    expect(forwarded?.headers.get('upgrade')).toBe('websocket');
    expect(response.status).toBe(101);
    expect(response.webSocket).toBe(client);
    server.close(1000, 'test complete');
  });
});
