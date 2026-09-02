/**
 * @jest-environment node
 *
 * Tests for POST /api/admin/studios/[id]/invites. The load-bearing case is the
 * supabase-js FunctionsHttpError shape: its `message` is a constant, and the
 * edge fn's own {error} code only exists on `error.context`, the raw Response.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin } from '@/lib/supabase-admin';
import { createServerClient } from '@patina/supabase/server';

import { POST } from '../route';

jest.mock('@/lib/supabase-admin', () => {
  const actual = jest.requireActual('@/lib/supabase-admin');
  return {
    ...actual,
    getAuthenticatedAdmin: jest.fn(),
  };
});

jest.mock('@patina/supabase/server', () => ({
  createServerClient: jest.fn(),
}));

const mockGetAuthenticatedAdmin = getAuthenticatedAdmin as jest.Mock;
const mockCreateServerClient = createServerClient as jest.Mock;

describe('POST /api/admin/studios/[id]/invites', () => {
  let invokeMock: jest.Mock;
  let insertMock: jest.Mock;

  const ctx = { params: Promise.resolve({ id: 'studio-1' }) };

  function makeRequest(body: Record<string, unknown>): NextRequest {
    return new NextRequest('http://localhost:3001/api/admin/studios/studio-1/invites', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    } as unknown as RequestInit);
  }

  const validBody = { email: 'New@Example.com', role: 'member' };

  beforeEach(() => {
    invokeMock = jest.fn().mockResolvedValue({ data: { email_status: 'sent' }, error: null });
    insertMock = jest.fn().mockResolvedValue({ data: null, error: null });
    mockCreateServerClient.mockResolvedValue({ functions: { invoke: invokeMock } });
    mockGetAuthenticatedAdmin.mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@patina.cloud' },
      adminClient: { from: jest.fn(() => ({ insert: insertMock })) },
    });
  });

  it('maps an edge-fn organization_not_active body to 409', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        context: new Response(JSON.stringify({ error: 'organization_not_active' }), {
          status: 409,
        }),
      }),
    });

    const res = await POST(makeRequest(validBody), ctx);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('organization_not_active');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('maps a THROWN FunctionsHttpError body to 409 as well', async () => {
    invokeMock.mockRejectedValue(
      Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        context: new Response(JSON.stringify({ error: 'organization_not_active' }), {
          status: 409,
        }),
      }),
    );

    const res = await POST(makeRequest(validBody), ctx);
    expect(res.status).toBe(409);
  });

  it('maps forbidden to 403 and already_member to 409', async () => {
    for (const [code, status] of [
      ['forbidden', 403],
      ['already_member', 409],
      ['organization_not_found', 404],
    ] as const) {
      invokeMock.mockResolvedValue({
        data: null,
        error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
          context: new Response(JSON.stringify({ error: code }), { status }),
        }),
      });
      const res = await POST(makeRequest(validBody), ctx);
      expect(res.status).toBe(status);
    }
  });

  it('500s with a generic message for an unrecognised edge-fn error code', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        context: new Response(JSON.stringify({ error: 'membership_upsert_failed' }), {
          status: 500,
        }),
      }),
    });

    const res = await POST(makeRequest(validBody), ctx);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain('membership_upsert_failed');
  });

  it('passes the edge-fn payload through on success, including email_status failed', async () => {
    invokeMock.mockResolvedValue({ data: { email_status: 'failed' }, error: null });

    const res = await POST(makeRequest(validBody), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ email_status: 'failed' });
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it('400s when email or role is missing', async () => {
    expect((await POST(makeRequest({ role: 'member' }), ctx)).status).toBe(400);
    expect((await POST(makeRequest({ email: 'a@b.co' }), ctx)).status).toBe(400);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('passes through the auth failure response when unauthenticated', async () => {
    const authError = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    mockGetAuthenticatedAdmin.mockResolvedValue({ error: authError });

    const res = await POST(makeRequest(validBody), ctx);
    expect(res).toBe(authError);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
