import { describe, it, expect, vi, beforeEach } from 'vitest';
import { proxyToBackend, createProxyHandler } from '../proxy-to-backend';
import type { RouteContext } from '../../utils/request-context';
import { setAuthToken } from '../../utils/request-context';

// Mocks for cross-boundary dependencies. vi.hoisted ensures the spies exist
// before vi.mock factories run.
const mocks = vi.hoisted(() => ({
  verifyJwtToken: vi.fn(),
  cookiesGet: vi.fn().mockReturnValue(undefined),
  cookiesGetAll: vi.fn().mockReturnValue([]),
  getNextAuthToken: vi.fn().mockResolvedValue(null),
}));

vi.mock('@patina/auth', () => ({
  verifyJwtToken: mocks.verifyJwtToken,
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: mocks.cookiesGet,
    getAll: mocks.cookiesGetAll,
  }),
}));
vi.mock('next-auth/jwt', () => ({
  getToken: mocks.getNextAuthToken,
}));
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logRequestStart: vi.fn(),
  logRequestComplete: vi.fn(),
  logRequestError: vi.fn(),
  loggerFromContext: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const { verifyJwtToken, cookiesGet, cookiesGetAll, getNextAuthToken } = mocks;

const mockFetch = vi.fn();
global.fetch = mockFetch;

function mkContext(): RouteContext {
  return {
    requestId: 'test-request-id',
    ip: '127.0.0.1',
    userAgent: 'test-agent',
    user: {
      id: 'user-123',
      email: 'test@example.com',
      displayName: 'Test User',
      roles: ['designer'],
      status: 'active',
      emailVerified: true,
    } as any,
    validatedData: {},
    startTime: Date.now(),
  };
}

function mkRequest(url = 'https://example.com/api/catalog/products', init: RequestInit = {}) {
  return new Request(url, {
    method: 'GET',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    ...init,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: token verification passes
  verifyJwtToken.mockResolvedValue({ sub: 'user-123' });
});

describe('proxyToBackend — happy path', () => {
  it('proxies a GET request and returns standardized success', async () => {
    const ctx = setAuthToken(mkContext(), 'test-token-123');

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ products: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await proxyToBackend(mkRequest(), ctx, {
      service: { name: 'catalog', baseUrl: 'http://localhost:3011' },
    });

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3011/api/catalog/products');
    expect(opts.method).toBe('GET');
    expect(opts.headers['Authorization']).toBe('Bearer test-token-123');
    expect(opts.headers['X-Request-Id']).toBe('test-request-id');
    expect(opts.headers['X-User-Id']).toBe('user-123');

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ products: [] });
  });

  it('forwards a JSON POST body', async () => {
    const ctx = setAuthToken(mkContext(), 'test-token-123');

    const requestBody = { name: 'Widget', price: 99 };
    const req = new Request('https://example.com/api/catalog/products', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'p_1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await proxyToBackend(req, ctx, {
      service: { name: 'catalog', baseUrl: 'http://localhost:3011' },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const opts = mockFetch.mock.calls[0][1];
    expect(opts.method).toBe('POST');
    expect(opts.body).toBe(JSON.stringify(requestBody));
  });

  it('applies a response transformer', async () => {
    const ctx = setAuthToken(mkContext(), 'test-token-123');

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ inner: { count: 5 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await proxyToBackend(mkRequest(), ctx, {
      service: { name: 'catalog', baseUrl: 'http://localhost:3011' },
      responseTransformer: {
        transform: (data: any) => ({ count: data.inner.count, transformed: true }),
      },
    });

    const body = await response.json();
    expect(body.data).toEqual({ count: 5, transformed: true });
  });

  it('forwards configured extra headers', async () => {
    const ctx = setAuthToken(mkContext(), 'test-token-123');

    const req = new Request('https://example.com/api/x', {
      method: 'GET',
      headers: { 'x-custom-trace': 'abc123', 'content-type': 'application/json' },
    });

    mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));

    await proxyToBackend(req, ctx, {
      service: { name: 'svc', baseUrl: 'http://x' },
      forwardHeaders: ['x-custom-trace'],
    });

    const opts = mockFetch.mock.calls[0][1];
    expect(opts.headers['x-custom-trace']).toBe('abc123');
  });
});

describe('proxyToBackend — authentication', () => {
  it('returns 401 when requireAuth=true and no token is found', async () => {
    const ctx = mkContext(); // no auth token set
    cookiesGet.mockReturnValue(undefined);
    cookiesGetAll.mockReturnValue([]);

    const response = await proxyToBackend(mkRequest(), ctx, {
      service: { name: 'catalog', baseUrl: 'http://x' },
      requireAuth: true,
    });

    expect(response.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('skips token extraction and forwards when requireAuth=false', async () => {
    const ctx = mkContext();

    mockFetch.mockResolvedValueOnce(
      new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );

    const response = await proxyToBackend(mkRequest(), ctx, {
      service: { name: 'catalog', baseUrl: 'http://x' },
      requireAuth: false,
    });

    expect(response.status).toBe(200);
    const opts = mockFetch.mock.calls[0][1];
    expect(opts.headers['Authorization']).toBeUndefined();
    expect(verifyJwtToken).not.toHaveBeenCalled();
  });

  it('A5: rejects with 401 when JWT verification fails', async () => {
    const ctx = setAuthToken(mkContext(), 'tampered-token');
    verifyJwtToken.mockRejectedValueOnce(new Error('signature verification failed'));

    const response = await proxyToBackend(mkRequest(), ctx, {
      service: { name: 'catalog', baseUrl: 'http://x' },
    });

    expect(response.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled(); // never forwards an unverifiable token
  });

  it('A5: verifies token before forwarding when token is present', async () => {
    const ctx = setAuthToken(mkContext(), 'valid-token');
    mockFetch.mockResolvedValueOnce(
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );

    await proxyToBackend(mkRequest(), ctx, {
      service: { name: 'catalog', baseUrl: 'http://x' },
    });

    expect(verifyJwtToken).toHaveBeenCalledWith('valid-token');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('extracts NextAuth chunked session token and forwards the accessToken', async () => {
    const ctx = mkContext(); // no token in context

    // Simulate chunked NextAuth cookies
    cookiesGet.mockImplementation((name: string) => {
      if (name === 'next-auth.session-token.0') return { value: 'chunk-a' };
      if (name === 'next-auth.session-token.1') return { value: 'chunk-b' };
      return undefined;
    });
    cookiesGetAll.mockReturnValue([]);
    getNextAuthToken.mockResolvedValueOnce({ accessToken: 'reassembled-supabase-jwt' });

    mockFetch.mockResolvedValueOnce(
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );

    await proxyToBackend(mkRequest(), ctx, {
      service: { name: 'catalog', baseUrl: 'http://x' },
    });

    expect(verifyJwtToken).toHaveBeenCalledWith('reassembled-supabase-jwt');
    const opts = mockFetch.mock.calls[0][1];
    expect(opts.headers['Authorization']).toBe('Bearer reassembled-supabase-jwt');
  });

  it('falls back to Supabase chunked auth-token cookie', async () => {
    const ctx = mkContext();

    cookiesGet.mockReturnValue(undefined);
    const supabasePayload = JSON.stringify({ access_token: 'sb-access-token' });
    cookiesGetAll.mockReturnValue([
      { name: 'sb-api-auth-token.0', value: supabasePayload.slice(0, 20) },
      { name: 'sb-api-auth-token.1', value: supabasePayload.slice(20) },
    ]);

    mockFetch.mockResolvedValueOnce(
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );

    await proxyToBackend(mkRequest(), ctx, {
      service: { name: 'catalog', baseUrl: 'http://x' },
    });

    expect(verifyJwtToken).toHaveBeenCalledWith('sb-access-token');
  });

  it('decodes base64-prefixed Supabase cookies', async () => {
    const ctx = mkContext();

    const supabasePayload = JSON.stringify({ access_token: 'sb-token-from-b64' });
    const b64 = `base64-${Buffer.from(supabasePayload).toString('base64')}`;

    cookiesGet.mockReturnValue(undefined);
    cookiesGetAll.mockReturnValue([{ name: 'sb-api-auth-token', value: b64 }]);

    mockFetch.mockResolvedValueOnce(
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );

    await proxyToBackend(mkRequest(), ctx, {
      service: { name: 'catalog', baseUrl: 'http://x' },
    });

    expect(verifyJwtToken).toHaveBeenCalledWith('sb-token-from-b64');
  });
});

describe('proxyToBackend — error paths', () => {
  it('returns 504 on TimeoutError', async () => {
    const ctx = setAuthToken(mkContext(), 'tok');

    // Make fetch hang past the configured timeout
    mockFetch.mockImplementation(
      (_url: string, opts: RequestInit) =>
        new Promise((_resolve, reject) => {
          opts.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    const response = await proxyToBackend(mkRequest(), ctx, {
      service: { name: 'slow', baseUrl: 'http://x' },
      timeout: { read: 50 },
    });

    expect(response.status).toBe(504);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('applies errorMapping for specific upstream status codes', async () => {
    const ctx = setAuthToken(mkContext(), 'tok');

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'forbidden' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await proxyToBackend(mkRequest(), ctx, {
      service: { name: 'catalog', baseUrl: 'http://x' },
      errorMapping: {
        403: { code: 'INSUFFICIENT_ROLE', message: 'You do not have access to this catalog' },
      },
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('preserves the original error status when no mapping is configured', async () => {
    const ctx = setAuthToken(mkContext(), 'tok');

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await proxyToBackend(mkRequest(), ctx, {
      service: { name: 'catalog', baseUrl: 'http://x' },
    });

    expect(response.status).toBe(404);
  });
});

describe('createProxyHandler', () => {
  it('returns a handler that calls proxyToBackend with the bound service', async () => {
    const handler = createProxyHandler('catalog', 'http://localhost:3011', {
      retry: { maxRetries: 0 },
    });

    const ctx = setAuthToken(mkContext(), 'tok');
    mockFetch.mockResolvedValueOnce(
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );

    const response = await handler(mkRequest(), ctx);
    expect(response.status).toBe(200);
    expect(mockFetch.mock.calls[0][0]).toMatch(/^http:\/\/localhost:3011/);
  });
});
