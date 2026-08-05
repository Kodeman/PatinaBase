/**
 * @jest-environment node
 *
 * Tests for /api/auth/qr/generate.
 *
 * The Chrome extension and portal clients depend on POST as the bootstrap of
 * cross-device sign-in. GET remains temporarily compatible for already-shipped
 * clients, with origin checks and the same atomic limiter as POST.
 *
 * Uses the `node` test env (not jsdom) so Web Fetch globals (Request/Response/
 * Headers/ReadableStream) come from Node directly and `next/server`'s
 * NextRequest can be constructed.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server';

// Capture inserts so we can assert on them
const insertMock = jest.fn().mockResolvedValue({ error: null });
const fromMock = jest.fn().mockReturnValue({ insert: insertMock });

jest.mock('@patina/supabase/client', () => ({
  createAdminClient: () => ({
    from: fromMock,
  }),
}));

import { GET, POST } from '../generate/route';

function makeRequest(method: 'GET' | 'POST', body?: unknown, headers?: Record<string, string>): NextRequest {
  const url = 'http://localhost:3000/api/auth/qr/generate';
  const init: RequestInit = { method };
  if (body !== undefined && method === 'POST') {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers = { 'content-type': 'application/json', ...headers };
  } else if (headers) {
    init.headers = headers;
  }
  return new NextRequest(url, init as any);
}

describe('POST /api/auth/qr/generate', () => {
  beforeEach(() => {
    insertMock.mockReset();
    insertMock.mockResolvedValue({ error: null });
    fromMock.mockReset();
    fromMock.mockReturnValue({ insert: insertMock });
  });

  it('returns 200 with sessionToken, qrUrl, expiresAt for a valid body', async () => {
    const req = makeRequest('POST', { deviceInfo: { type: 'extension' } });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');

    const data = await res.json();
    expect(Object.keys(data).sort()).toEqual(['expiresAt', 'qrUrl', 'sessionToken']);
    expect(typeof data.sessionToken).toBe('string');
    expect(data.sessionToken).toMatch(/^[a-f0-9]{64}$/);
    expect(typeof data.qrUrl).toBe('string');
    expect(typeof data.expiresAt).toBe('string');
    // ISO 8601 in the near future
    expect(new Date(data.expiresAt).getTime()).toBeGreaterThan(Date.now());

    // Insert was called with the schema columns we expect
    expect(insertMock).toHaveBeenCalledTimes(1);
    const payload = insertMock.mock.calls[0][0];
    expect(payload).toMatchObject({ status: 'pending' });
    expect(payload.session_token).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.poll_token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.session_token).not.toBe(data.sessionToken);
    expect(data.qrUrl).toContain(payload.session_token);
    expect(data.qrUrl).not.toContain(data.sessionToken);
    expect(payload.expires_at).toBe(data.expiresAt);
  });

  it('accepts an empty body and still produces a session', async () => {
    const req = makeRequest('POST', {});
    const res = await POST(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sessionToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns 400 for malformed JSON', async () => {
    const req = makeRequest('POST', 'not-json{');
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('returns 500 if the database insert fails', async () => {
    insertMock.mockResolvedValueOnce({
      error: { message: 'connection refused' },
    });
    const req = makeRequest('POST', {});
    const res = await POST(req);

    expect(res.status).toBe(500);
  });

  it('produces a unique session token on each call', async () => {
    const r1 = await POST(makeRequest('POST', {}));
    const r2 = await POST(makeRequest('POST', {}));

    const d1 = await r1.json();
    const d2 = await r2.json();
    expect(d1.sessionToken).not.toEqual(d2.sessionToken);
  });

  it('rate limits repeated creation from a trusted Cloudflare address', async () => {
    insertMock.mockResolvedValueOnce({
      error: { code: 'P0001', message: 'qr_auth_rate_limited' },
    });

    const response = await POST(makeRequest('POST', {}, {
      'cf-connecting-ip': '203.0.113.10',
      'x-forwarded-for': '198.51.100.99',
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ ip_address: '203.0.113.10' }),
    );
  });

  it('fails closed when a production request has no trusted Cloudflare address', async () => {
    const response = await POST(
      new NextRequest('https://app.patina.cloud/api/auth/qr/generate', {
        method: 'POST',
        body: '{}',
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(503);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('rejects cross-site and simple-form session creation requests', async () => {
    const crossSite = await POST(
      makeRequest('POST', {}, {
        origin: 'https://evil.example',
        'sec-fetch-site': 'cross-site',
      }),
    );
    expect(crossSite.status).toBe(403);

    const simpleForm = await POST(
      new NextRequest('http://localhost:3000/api/auth/qr/generate', {
        method: 'POST',
        body: 'device=browser',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      }),
    );
    expect(simpleForm.status).toBe(415);
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe('legacy GET /api/auth/qr/generate', () => {
  beforeEach(() => {
    insertMock.mockReset();
    insertMock.mockResolvedValue({ error: null });
    fromMock.mockReset();
    fromMock.mockReturnValue({ insert: insertMock });
  });

  it('creates a rate-limited session for an existing same-origin client', async () => {
    const req = makeRequest('GET');
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('deprecation')).toBe('true');
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it('rejects cross-site resource amplification', async () => {
    const res = await GET(
      makeRequest('GET', undefined, {
        origin: 'https://evil.example',
        'sec-fetch-site': 'cross-site',
      }),
    );

    expect(res.status).toBe(403);
    expect(insertMock).not.toHaveBeenCalled();
  });
});
