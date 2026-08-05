/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server';

const getUserMock = jest.fn();
const generateLinkMock = jest.fn();
const singleMock = jest.fn();
const maybeSingleMock = jest.fn();
const selectMock = jest.fn();
const updateMock = jest.fn();
const fromMock = jest.fn();

jest.mock('@patina/supabase/client', () => ({
  createAdminClient: () => ({
    auth: {
      getUser: getUserMock,
      admin: { generateLink: generateLinkMock },
    },
    from: fromMock,
  }),
}));

import { POST } from '../verify/route';

const SESSION_TOKEN = 'b'.repeat(64);

function makeRequest(
  overrides: Record<string, unknown> = {},
  authorization: string | null = 'Bearer header-user-jwt',
) {
  return new NextRequest('http://localhost:3000/api/auth/qr/verify', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost:3001',
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify({
      sessionToken: SESSION_TOKEN,
      userJwt: 'valid-user-jwt',
      deviceInfo: { platform: 'iOS' },
      biometricConfirmed: true,
      ...overrides,
    }),
  });
}

function setPendingSession(session: Record<string, unknown> | null) {
  singleMock.mockResolvedValue({ data: session, error: session ? null : { message: 'not found' } });
  maybeSingleMock.mockResolvedValue({ data: session ? { session_token: SESSION_TOKEN } : null, error: null });
  selectMock.mockReturnValue({ eq: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: singleMock }) }) });
  updateMock.mockReturnValue({
    eq: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({ maybeSingle: maybeSingleMock }),
      }),
    }),
  });
  fromMock.mockReturnValue({ select: selectMock, update: updateMock });
}

describe('POST /api/auth/qr/verify', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'designer@example.com' } }, error: null });
    generateLinkMock.mockResolvedValue({ data: { properties: { hashed_token: 'one-time-hash' } }, error: null });
    setPendingSession({ expires_at: new Date(Date.now() + 60_000).toISOString() });
  });

  it('conditionally approves a pending session and returns CORS headers for an allowed portal', async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, message: 'Session approved' });
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      status: 'approved',
      token_hash: 'one-time-hash',
      user_email: 'designer@example.com',
    }));
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3001');
    expect(getUserMock).toHaveBeenCalledWith('header-user-jwt');
  });

  it('rejects a body-only JWT and never passes it to Supabase auth', async () => {
    const response = await POST(makeRequest({ userJwt: 'body-only-jwt' }, null));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ success: false, error: 'Authentication required' });
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('uses the Authorization bearer and ignores a conflicting body JWT', async () => {
    const response = await POST(makeRequest({ userJwt: 'attacker-body-jwt' }, 'Bearer trusted-header-jwt'));

    expect(response.status).toBe(200);
    expect(getUserMock).toHaveBeenCalledWith('trusted-header-jwt');
    expect(getUserMock).not.toHaveBeenCalledWith('attacker-body-jwt');
  });

  it('does not overwrite a session that was approved by a competing verification', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    const response = await POST(makeRequest());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ success: false, error: 'Session was already used' });
  });

  it('rejects an expired pending session', async () => {
    setPendingSession({ expires_at: new Date(Date.now() - 60_000).toISOString() });

    const response = await POST(makeRequest());

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({ success: false, error: 'Session has expired' });
  });

  it('rejects biometric denial before generating a token', async () => {
    const response = await POST(makeRequest({ biometricConfirmed: false }));

    expect(response.status).toBe(403);
    expect(generateLinkMock).not.toHaveBeenCalled();
  });

  it('returns a friendly client error for malformed verification input', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/qr/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: 'not-json',
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ success: false, error: 'Invalid request' });
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
  });

  it('rejects a replay after the session is no longer pending', async () => {
    setPendingSession(null);

    const response = await POST(makeRequest());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ success: false, error: 'Session not found or already used' });
  });
});
