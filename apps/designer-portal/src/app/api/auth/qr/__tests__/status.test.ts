/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server';

const singleMock = jest.fn();
const selectMock = jest.fn();
const eqMock = jest.fn();
const updateEqMock = jest.fn().mockResolvedValue({ error: null });
const updateMock = jest.fn();
const fromMock = jest.fn();

jest.mock('@patina/supabase/client', () => ({
  createAdminClient: () => ({ from: fromMock }),
}));

import { GET } from '../status/route';

const SESSION_TOKEN = 'a'.repeat(64);

function request(session = SESSION_TOKEN, origin?: string) {
  return new NextRequest('http://localhost:3000/api/auth/qr/status', {
    headers: {
      authorization: `Bearer ${session}`,
      ...(origin ? { origin } : {}),
    },
  });
}

function setSession(session: Record<string, unknown> | null) {
  const row = session ? { id: 'qr-row-1', ...session } : null;
  singleMock.mockResolvedValue({ data: row, error: row ? null : { message: 'not found' } });
  eqMock.mockReturnValue({ single: singleMock });
  selectMock.mockReturnValue({ eq: eqMock });
  updateMock.mockReturnValue({ eq: updateEqMock });
  fromMock.mockReturnValue({ select: selectMock, update: updateMock });
}

describe('GET /api/auth/qr/status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps an approved session available through browser verification and preserves the legacy email field', async () => {
    setSession({
      status: 'approved',
      token_hash: 'hashed-token',
      user_email: 'designer@example.com',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'approved',
      tokenHash: 'hashed-token',
      email: 'designer@example.com',
    });
    expect(fromMock).toHaveBeenCalledWith('qr_auth_sessions');
    expect(updateMock).not.toHaveBeenCalled();
    expect(eqMock).toHaveBeenCalledWith(
      'poll_token_hash',
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });

  it('fails closed when the QR-visible approval nonce is presented for a new row', async () => {
    setSession(null);

    const response = await GET(request('c'.repeat(64)));

    await expect(response.json()).resolves.toEqual({ status: 'expired' });
    expect(eqMock).toHaveBeenCalledWith(
      'poll_token_hash',
      expect.not.stringContaining('c'.repeat(64)),
    );
  });

  it('accepts the browser poll bearer by its SHA-256 digest', async () => {
    setSession({
      status: 'pending',
      token_hash: null,
      user_email: null,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });

    const pollSecret = 'd'.repeat(64);
    const response = await GET(request(pollSecret));

    await expect(response.json()).resolves.toEqual({ status: 'pending' });
    expect(eqMock).toHaveBeenCalledWith(
      'poll_token_hash',
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });

  it('never sends the raw browser bearer to PostgREST', async () => {
    setSession({
      status: 'pending',
      token_hash: null,
      user_email: null,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });

    const pollSecret = 'e'.repeat(64);
    const response = await GET(request(pollSecret));

    await expect(response.json()).resolves.toEqual({ status: 'pending' });
    expect(eqMock).toHaveBeenCalledWith(
      'poll_token_hash',
      expect.not.stringContaining(pollSecret),
    );
  });

  it('fails closed for an unknown browser secret', async () => {
    setSession(null);

    const response = await GET(request('f'.repeat(64)));

    await expect(response.json()).resolves.toEqual({ status: 'expired' });
  });

  it('marks an expired session and does not return its authentication material', async () => {
    setSession({
      status: 'approved',
      token_hash: 'hashed-token',
      user_email: 'designer@example.com',
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });

    const response = await GET(request());

    await expect(response.json()).resolves.toEqual({ status: 'expired' });
    expect(updateMock).toHaveBeenCalledWith({ status: 'expired' });
    expect(updateEqMock).toHaveBeenCalledWith('id', 'qr-row-1');
  });

  it('returns a denied terminal state without exposing a token', async () => {
    setSession({
      status: 'denied',
      token_hash: null,
      user_email: null,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });

    const response = await GET(request());

    await expect(response.json()).resolves.toEqual({ status: 'denied' });
  });

  it('rejects malformed session tokens', async () => {
    const response = await GET(request('not-a-session'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid polling credential' });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('temporarily accepts a legacy query poll but hashes it before PostgREST', async () => {
    setSession({
      status: 'pending',
      token_hash: null,
      user_email: null,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    const response = await GET(
      new NextRequest(
        `http://localhost:3000/api/auth/qr/status?session=${SESSION_TOKEN}`,
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('deprecation')).toBe('true');
    await expect(response.json()).resolves.toEqual({ status: 'pending' });
    expect(eqMock).toHaveBeenCalledWith(
      'poll_token_hash',
      expect.not.stringContaining(SESSION_TOKEN),
    );
  });

  it('rejects a malformed bearer instead of falling back to a query credential', async () => {
    const response = await GET(
      new NextRequest(
        `http://localhost:3000/api/auth/qr/status?session=${SESSION_TOKEN}`,
        { headers: { authorization: 'Bearer malformed' } },
      ),
    );

    expect(response.status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('applies the portal CORS allow-list to a browser poll', async () => {
    setSession({
      status: 'pending',
      token_hash: null,
      user_email: null,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });

    const response = await GET(request(SESSION_TOKEN, 'http://localhost:3002'));

    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3002');
  });
});
