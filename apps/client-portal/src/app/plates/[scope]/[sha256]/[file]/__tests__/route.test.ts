/** @jest-environment node */
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import { createAdminClient, createMiddlewareClient } from '@patina/supabase/client';
import { getCloudflareContext } from '@opennextjs/cloudflare/cloudflare-context';
import { config, middleware } from '@/middleware';
import { GET } from '../route';

jest.mock('@patina/supabase/server', () => ({ createServerClient: jest.fn() }));
jest.mock('@patina/supabase/client', () => ({
  createMiddlewareClient: jest.fn(), createAdminClient: jest.fn(),
}));
jest.mock('@patina/supabase/auth', () => ({ safeAuthReturnPath: jest.fn() }));
jest.mock('@opennextjs/cloudflare/cloudflare-context', () => ({ getCloudflareContext: jest.fn() }));

const SCOPE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SHA = 'b'.repeat(64);
const FILE = 'wide-1280.avif';
const mockGetUser = jest.fn();
const mockRpc = jest.fn();
const mockGet = jest.fn();

function call(overrides: Partial<{ scope: string; sha256: string; file: string }> = {}, headers?: HeadersInit) {
  return GET(new Request(`https://client.patina.test/plates/${SCOPE}/${SHA}/${FILE}`, { headers }), {
    params: Promise.resolve({ scope: SCOPE, sha256: SHA, file: FILE, ...overrides }),
  });
}

function object(contentType: string | undefined = 'image/avif') {
  return {
    body: new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('plate')); controller.close(); },
    }),
    size: 5,
    httpEtag: '"plate-etag"',
    httpMetadata: { contentType },
  };
}

beforeEach(() => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'client-user' } }, error: null });
  mockRpc.mockResolvedValue({ data: PROJECT, error: null });
  jest.mocked(createServerClient).mockResolvedValue({
    auth: { getUser: mockGetUser }, rpc: mockRpc,
  } as unknown as Awaited<ReturnType<typeof createServerClient>>);
  jest.mocked(createMiddlewareClient).mockReturnValue({
    auth: { getUser: mockGetUser },
  } as unknown as ReturnType<typeof createMiddlewareClient>);
  jest.mocked(getCloudflareContext).mockReturnValue({ env: { PLATES: { get: mockGet } } } as unknown as ReturnType<typeof getCloudflareContext>);
  mockGet.mockResolvedValue(object());
});

describe('private plate GET', () => {
  it('rejects malformed params before auth or storage', async () => {
    for (const values of [
      { file: 'original.avif' }, { file: 'wide-12.avif' }, { file: 'wide-10000.avif' },
      { file: '../wide-1280.avif' }, { file: 'wide-1280.jpg' }, { file: 'wide-1280.avif\n' },
      { scope: 'not-a-uuid' }, { sha256: SHA.toUpperCase() }, { sha256: 'b'.repeat(63) },
    ]) {
      const response = await call(values);
      expect(response.status).toBe(404);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    }
    expect(createServerClient).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('rejects leading-zero widths before any I/O', async () => {
    for (const file of ['wide-0640.avif', 'piece-0256.webp', 'board-000.webp']) {
      expect((await call({ file })).status).toBe(404);
    }
    expect(createServerClient).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(getCloudflareContext).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('returns an empty 401 without a user and never reads a plate', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const response = await call();
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('returns 404 when the JWT-scoped RPC denies membership', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect((await call()).status).toBe(404);
    expect(mockRpc).toHaveBeenCalledWith('client_can_read_plate', { p_scope_id: SCOPE, p_sha256: SHA });
    expect(getCloudflareContext).not.toHaveBeenCalled();
  });

  it('logs only RPC code and message while failing closed even if it includes data', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc.mockResolvedValue({ data: PROJECT, error: { code: 'PGRST202', message: 'unavailable', details: 'private detail' } });
    const response = await call();
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(log).toHaveBeenCalledWith('client_can_read_plate', { code: 'PGRST202', message: 'unavailable' });
    expect(log).toHaveBeenCalledTimes(1);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('returns identical empty no-store 404s for denial, RPC fault, and missing bytes', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    const denied = await call();
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'fault' } });
    const fault = await call();
    mockGet.mockResolvedValueOnce(null);
    const missing = await call();
    for (const response of [denied, fault, missing]) {
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('');
      expect(Array.from(response.headers.entries())).toEqual([['cache-control', 'private, no-store']]);
    }
  });

  it('returns 404 for a missing object using the authorized project key', async () => {
    mockGet.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(mockGet).toHaveBeenCalledWith(`plates/${PROJECT}/${SHA}/${FILE}`, { onlyIf: expect.any(Headers) });
  });

  it('streams a hit with exactly private one-hour caching and Cookie variance', async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('plate');
    expect(response.headers.get('Content-Type')).toBe('image/avif');
    expect(response.headers.get('Content-Length')).toBe('5');
    expect(response.headers.get('ETag')).toBe('"plate-etag"');
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=3600');
    expect(response.headers.get('Vary')).toBe('Cookie');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(mockGet).toHaveBeenCalledWith(`plates/${PROJECT}/${SHA}/${FILE}`, { onlyIf: expect.any(Headers) });
  });

  it('derives the content type from each allowlisted extension, never stored metadata', async () => {
    mockGet.mockResolvedValueOnce(object('text/html'));
    expect((await call()).headers.get('Content-Type')).toBe('image/avif');
    const avif = object();
    delete avif.httpMetadata.contentType;
    mockGet.mockResolvedValueOnce(avif);
    expect((await call()).headers.get('Content-Type')).toBe('image/avif');
    mockGet.mockResolvedValueOnce(object('image/avif'));
    expect((await call({ file: 'piece-256.webp' })).headers.get('Content-Type')).toBe('image/webp');
  });

  it('returns a lean empty 304 from metadata-only exact, weak, list and wildcard reads after auth', async () => {
    for (const validator of ['"plate-etag"', 'W/"plate-etag"', '"other", W/"plate-etag"', '*']) {
      mockGet.mockImplementationOnce((_key, options) => Promise.resolve(options?.onlyIf
        ? { size: 5, httpEtag: '"plate-etag"' }
        : object()));
      const response = await call({}, { 'If-None-Match': validator });
      expect(response.status).toBe(304);
      expect(await response.text()).toBe('');
      expect(Array.from(response.headers.entries())).toEqual([
        ['cache-control', 'private, max-age=3600'], ['etag', '"plate-etag"'], ['vary', 'Cookie'],
      ]);
      expect(response.headers.has('Content-Type')).toBe(false);
      expect(response.headers.has('Content-Length')).toBe(false);
      const options = mockGet.mock.calls.at(-1)?.[1];
      expect(options?.onlyIf).toBeInstanceOf(Headers);
      expect(options.onlyIf.get('If-None-Match')).toBe(validator);
    }
    expect(mockRpc).toHaveBeenCalledTimes(4);
  });

  it('serves changed bytes for a stale validator but never bypasses membership for a match', async () => {
    expect((await call({}, { 'If-None-Match': '"old"' })).status).toBe(200);
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect((await call({}, { 'If-None-Match': '"plate-etag"' })).status).toBe(404);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('returns 503 private no-store outside Workers or without the binding', async () => {
    jest.mocked(getCloudflareContext).mockImplementationOnce(() => { throw new Error('not a Worker'); });
    const response = await call();
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    jest.mocked(getCloudflareContext).mockReturnValueOnce({ env: {} } as ReturnType<typeof getCloudflareContext>);
    const unbound = await call();
    expect(unbound.status).toBe(503);
    expect(unbound.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('serves sheet and board crops as ruled by the story owner', async () => {
    for (const crop of ['sheet', 'board']) {
      mockGet.mockResolvedValueOnce(object());
      expect((await call({ file: `${crop}-1024.webp` })).status).toBe(200);
      expect(mockGet).toHaveBeenLastCalledWith(`plates/${PROJECT}/${SHA}/${crop}-1024.webp`, { onlyIf: expect.any(Headers) });
    }
  });
});

describe('framing-versioned plate GET (?r=)', () => {
  // The media worker's framing revisions, as infra/media-worker/test/ingest-route.test.mjs
  // pins them: 32 hex of SHA-256 over [focal, subjectBox] for [null, null],
  // [[0.4, 0.5], null] and [[0.4, 0.5], [0.1, 0.1, 0.5, 0.6]].
  const GOLDEN_REVISIONS = ['95cb9b4f84ceff132cc7a875d8c192bf', '147a7fbdc34b04b129238958f8985fb4', '7983e9d3bf586c5d4625775f572ab2c1'];
  const REV = GOLDEN_REVISIONS[1];
  const BASE = `plates/${PROJECT}/${SHA}`;
  const onlyIf = { onlyIf: expect.any(Headers) };

  function callAt(query: string) {
    return GET(new Request(`https://client.patina.test/plates/${SCOPE}/${SHA}/${FILE}${query}`), {
      params: Promise.resolve({ scope: SCOPE, sha256: SHA, file: FILE }),
    });
  }

  function bucketWith(objects: Record<string, () => unknown>) {
    mockGet.mockImplementation((key: string) => Promise.resolve(objects[key]?.() ?? null));
  }

  it('serves the revision\'s own key and never the unversioned one', async () => {
    bucketWith({ [`${BASE}/f/${REV}/${FILE}`]: () => object(), [`${BASE}/${FILE}`]: () => object() });
    const response = await callAt(`?r=${REV}`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('plate');
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=3600');
    expect(mockGet.mock.calls).toEqual([[`${BASE}/f/${REV}/${FILE}`, onlyIf]]);
  });

  it('resolves each revision the media worker pins to its own f/<rev>/ key', async () => {
    for (const rev of GOLDEN_REVISIONS) {
      mockGet.mockClear();
      bucketWith({ [`${BASE}/f/${rev}/${FILE}`]: () => object() });
      expect((await callAt(`?r=${rev}`)).status).toBe(200);
      expect(mockGet.mock.calls).toEqual([[`${BASE}/f/${rev}/${FILE}`, onlyIf]]);
    }
  });

  it('without ?r= reads only the unversioned key', async () => {
    bucketWith({ [`${BASE}/${FILE}`]: () => object() });
    expect((await callAt('')).status).toBe(200);
    expect(mockGet.mock.calls).toEqual([[`${BASE}/${FILE}`, onlyIf]]);
  });

  it('a revision with no object is 404 and never falls back to the unversioned key', async () => {
    bucketWith({ [`${BASE}/${FILE}`]: () => object(), [`${BASE}/crops.json`]: () => object() });
    const response = await callAt(`?r=${REV}`);
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mockGet.mock.calls).toEqual([[`${BASE}/f/${REV}/${FILE}`, onlyIf]]);
  });

  it('reads any other r as none: legacy base36, 16-hex, malformed or repeated r get the unversioned plate after membership', async () => {
    for (const query of [
      '?r=1k2j3h', '?r=z9x8', '?r=234dc778349cc289', '?r=', '?r=XYZ', `?r=${REV.toUpperCase()}`, `?r=${REV.slice(1)}`,
      `?r=${REV}0`, `?r=${REV}%0A`, `?r=${REV}&r=${REV}`, `?r=../${REV}`, `?r=${REV}/../../x`,
    ]) {
      mockGet.mockClear();
      mockRpc.mockClear();
      bucketWith({ [`${BASE}/${FILE}`]: () => object() });
      const response = await callAt(query);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('plate');
      expect(response.headers.get('Cache-Control')).toBe('private, max-age=3600');
      expect(mockRpc).toHaveBeenCalledWith('client_can_read_plate', { p_scope_id: SCOPE, p_sha256: SHA });
      expect(mockGet.mock.calls).toEqual([[`${BASE}/${FILE}`, onlyIf]]);
    }
  });

  it('a revision, new or legacy, never bypasses membership', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    for (const query of [`?r=${REV}`, '?r=1k2j3h']) {
      expect((await callAt(query)).status).toBe(404);
    }
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('a signed-out request with any r is 401 and never reads a plate', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    for (const query of [`?r=${REV}`, '?r=1k2j3h']) {
      expect((await callAt(query)).status).toBe(401);
    }
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('plate middleware', () => {
  it('refreshes a signed-out image request without redirecting before the route returns 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const response = await middleware(new NextRequest(`https://client.patina.test/plates/${SCOPE}/${SHA}/piece-256.webp`));
    expect(createMiddlewareClient).toHaveBeenCalled();
    expect(response.headers.get('Location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect((await call({ file: 'piece-256.webp' })).status).toBe(401);
  });

  it('keeps signed-in plates on the route membership path, with unchanged generic matcher', async () => {
    expect(config.matcher).toEqual([
      '/plates/:path*',
      '/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ]);
    const response = await middleware(new NextRequest(`https://client.patina.test/plates/${SCOPE}/${SHA}/${FILE}`));
    expect(response.headers.get('Location')).toBeNull();
    expect(createAdminClient).not.toHaveBeenCalled();
    expect((await call()).status).toBe(200);
  });

  it('redirects signed-out page paths including plates lookalikes and apiary', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    for (const path of ['/plates', '/platesx', '/projects', '/apiary']) {
      const response = await middleware(new NextRequest(`https://client.patina.test${path}`));
      expect(response.headers.get('Location')).not.toBeNull();
      const location = new URL(response.headers.get('Location')!);
      expect(location.pathname).toBe('/auth/signin');
      expect(location.searchParams.get('callbackUrl')).toBe(path);
    }
  });

  it('preserves signed-out API pass-through for the exact root and slash boundary', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    for (const path of ['/api', '/api/', '/api/projects']) {
      const response = await middleware(new NextRequest(`https://client.patina.test${path}`));
      expect(response.headers.get('Location')).toBeNull();
      expect(response.headers.get('x-middleware-next')).toBe('1');
    }
  });

  it('keeps private plate URLs on the first PWA NetworkOnly rule', () => {
    const source = readFileSync(`${process.cwd()}/next.config.js`, 'utf8');
    const pattern = source.match(/urlPattern: (\/[^\n]+),\n\s+handler: 'NetworkOnly'/)?.[1];
    expect(pattern).toBeDefined();
    const networkOnly = new RegExp(pattern!.slice(1, -1));
    expect(networkOnly.test(`https://client.patina.test/plates/${SCOPE}/${SHA}/${FILE}`)).toBe(true);
    expect(networkOnly.test(`https://client.patina.test/plates/${SCOPE}/${SHA}/piece-256.webp`)).toBe(true);
    expect(source.indexOf("handler: 'NetworkOnly'")).toBeLessThan(source.indexOf("handler: 'NetworkFirst'"));
  });
});
