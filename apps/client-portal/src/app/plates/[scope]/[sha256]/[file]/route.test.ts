/** @jest-environment node */
import { NextRequest } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import { createAdminClient, createMiddlewareClient } from '@patina/supabase/client';
import { getCloudflareContext } from '@opennextjs/cloudflare/cloudflare-context';
import { config, middleware } from '@/middleware';
import { GET } from './route';

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
      expect((await call(values)).status).toBe(404);
    }
    expect(createServerClient).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('returns an empty 401 without a user and never reads a plate', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const response = await call();
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('returns 404 when the JWT-scoped RPC denies membership', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect((await call()).status).toBe(404);
    expect(mockRpc).toHaveBeenCalledWith('client_can_read_plate', { p_scope_id: SCOPE, p_sha256: SHA });
    expect(getCloudflareContext).not.toHaveBeenCalled();
  });

  it('fails closed on an RPC error even if it includes data', async () => {
    mockRpc.mockResolvedValue({ data: PROJECT, error: { message: 'unavailable' } });
    expect((await call()).status).toBe(404);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing object using the authorized project key', async () => {
    mockGet.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(mockGet).toHaveBeenCalledWith(`plates/${PROJECT}/${SHA}/${FILE}`);
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
    expect(mockGet).toHaveBeenCalledWith(`plates/${PROJECT}/${SHA}/${FILE}`);
  });

  it('uses object metadata and falls back by extension for both formats', async () => {
    mockGet.mockResolvedValueOnce(object('image/custom'));
    expect((await call()).headers.get('Content-Type')).toBe('image/custom');
    const avif = object();
    delete avif.httpMetadata.contentType;
    mockGet.mockResolvedValueOnce(avif);
    expect((await call()).headers.get('Content-Type')).toBe('image/avif');
    const webp = object();
    delete webp.httpMetadata.contentType;
    mockGet.mockResolvedValueOnce(webp);
    expect((await call({ file: 'piece-256.webp' })).headers.get('Content-Type')).toBe('image/webp');
  });

  it('returns an empty 304 for exact, weak, list and wildcard validators after auth', async () => {
    for (const validator of ['"plate-etag"', 'W/"plate-etag"', '"other", W/"plate-etag"', '*']) {
      mockGet.mockResolvedValueOnce(object());
      const response = await call({}, { 'If-None-Match': validator });
      expect(response.status).toBe(304);
      expect(await response.text()).toBe('');
      expect(response.headers.get('Cache-Control')).toBe('private, max-age=3600');
      expect(response.headers.get('Vary')).toBe('Cookie');
    }
    expect(mockRpc).toHaveBeenCalledTimes(4);
  });

  it('serves changed bytes for a stale validator but never bypasses membership for a match', async () => {
    expect((await call({}, { 'If-None-Match': '"old"' })).status).toBe(200);
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect((await call({}, { 'If-None-Match': '"plate-etag"' })).status).toBe(404);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('returns 503 no-store outside Workers or without the binding', async () => {
    jest.mocked(getCloudflareContext).mockImplementationOnce(() => { throw new Error('not a Worker'); });
    const response = await call();
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    jest.mocked(getCloudflareContext).mockReturnValueOnce({ env: {} } as ReturnType<typeof getCloudflareContext>);
    expect((await call()).status).toBe(503);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('serves sheet and board crops as ruled by the story owner', async () => {
    for (const crop of ['sheet', 'board']) {
      mockGet.mockResolvedValueOnce(object());
      expect((await call({ file: `${crop}-1024.webp` })).status).toBe(200);
      expect(mockGet).toHaveBeenLastCalledWith(`plates/${PROJECT}/${SHA}/${crop}-1024.webp`);
    }
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

  it('keeps signed-in plates on the route membership path, with a matcher covering WebP', async () => {
    expect(config.matcher).toContain('/plates/:path*');
    const response = await middleware(new NextRequest(`https://client.patina.test/plates/${SCOPE}/${SHA}/${FILE}`));
    expect(response.headers.get('Location')).toBeNull();
    expect(createAdminClient).not.toHaveBeenCalled();
    expect((await call()).status).toBe(200);
  });
});
