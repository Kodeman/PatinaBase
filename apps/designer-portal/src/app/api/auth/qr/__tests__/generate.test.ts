/**
 * @jest-environment node
 *
 * Tests for /api/auth/qr/generate.
 *
 * Regression: in production, POST /api/auth/qr/generate returned 405 with no
 * Allow header because the route only exported GET + OPTIONS. The Chrome
 * extension and iOS QR-pairing flow depend on a working POST handler as the
 * bootstrap of cross-device sign-in.
 *
 * Uses the `node` test env (not jsdom) so Web Fetch globals (Request/Response/
 * Headers/ReadableStream) come from Node directly and `next/server`'s
 * NextRequest can be constructed.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server';

// Capture inserts so we can assert on them
const insertMock = jest.fn().mockResolvedValue({ error: null });

jest.mock('@patina/supabase/client', () => ({
  createAdminClient: () => ({
    from: jest.fn().mockReturnValue({
      insert: insertMock,
    }),
  }),
}));

import { GET, POST } from '../generate/route';

function makeRequest(method: 'GET' | 'POST', body?: unknown): NextRequest {
  const url = 'http://localhost:3000/api/auth/qr/generate';
  const init: RequestInit = { method };
  if (body !== undefined && method === 'POST') {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers = { 'content-type': 'application/json' };
  }
  return new NextRequest(url, init as any);
}

describe('POST /api/auth/qr/generate', () => {
  beforeEach(() => {
    insertMock.mockReset();
    insertMock.mockResolvedValue({ error: null });
  });

  it('returns 200 with sessionToken, qrUrl, expiresAt for a valid body', async () => {
    const req = makeRequest('POST', { deviceInfo: { type: 'extension' } });
    const res = await POST(req);

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(typeof data.sessionToken).toBe('string');
    expect(data.sessionToken).toMatch(/^[a-f0-9]{64}$/);
    expect(typeof data.qrUrl).toBe('string');
    expect(data.qrUrl).toContain(data.sessionToken);
    expect(typeof data.expiresAt).toBe('string');
    // ISO 8601 in the near future
    expect(new Date(data.expiresAt).getTime()).toBeGreaterThan(Date.now());

    // Insert was called with the schema columns we expect
    expect(insertMock).toHaveBeenCalledTimes(1);
    const payload = insertMock.mock.calls[0][0];
    expect(payload).toMatchObject({
      session_token: data.sessionToken,
      status: 'pending',
    });
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
});

describe('GET /api/auth/qr/generate (preserved)', () => {
  beforeEach(() => {
    insertMock.mockReset();
    insertMock.mockResolvedValue({ error: null });
  });

  it('still returns 200 with the same shape (regression guard)', async () => {
    const req = makeRequest('GET');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sessionToken).toMatch(/^[a-f0-9]{64}$/);
    expect(typeof data.qrUrl).toBe('string');
    expect(typeof data.expiresAt).toBe('string');
  });
});
