/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server';

const singleMock = jest.fn();
const selectMock = jest.fn();
const updateEqMock = jest.fn().mockResolvedValue({ error: null });
const updateMock = jest.fn();
const fromMock = jest.fn();

jest.mock('@patina/supabase/client', () => ({
  createAdminClient: () => ({ from: fromMock }),
}));

import { GET } from '../status/route';

const SESSION_TOKEN = 'a'.repeat(64);

function request(session = SESSION_TOKEN, origin?: string) {
  return new NextRequest(`http://localhost:3000/api/auth/qr/status?session=${session}`, {
    headers: origin ? { origin } : undefined,
  });
}

function setSession(session: Record<string, unknown> | null) {
  singleMock.mockResolvedValue({ data: session, error: session ? null : { message: 'not found' } });
  selectMock.mockReturnValue({ eq: jest.fn().mockReturnValue({ single: singleMock }) });
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

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid session token' });
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
