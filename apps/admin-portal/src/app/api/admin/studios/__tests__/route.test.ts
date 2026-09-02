/**
 * @jest-environment node
 *
 * Tests for POST /api/admin/studios (00556's admin_create_studio_for_user).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin } from '@/lib/supabase-admin';

import { POST } from '../route';

jest.mock('@/lib/supabase-admin', () => {
  const actual = jest.requireActual('@/lib/supabase-admin');
  return {
    ...actual,
    getAuthenticatedAdmin: jest.fn(),
  };
});

const mockGetAuthenticatedAdmin = getAuthenticatedAdmin as jest.Mock;

describe('POST /api/admin/studios', () => {
  let rpcMock: jest.Mock;
  let insertMock: jest.Mock;
  let fromMock: jest.Mock;

  function makeRequest(body: Record<string, unknown> = {}): NextRequest {
    return new NextRequest('http://localhost:3001/api/admin/studios', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    } as unknown as RequestInit);
  }

  beforeEach(() => {
    rpcMock = jest.fn().mockResolvedValue({ data: { id: 'studio-1' }, error: null });
    insertMock = jest.fn().mockResolvedValue({ data: null, error: null });
    fromMock = jest.fn(() => ({ insert: insertMock }));
    mockGetAuthenticatedAdmin.mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@patina.cloud' },
      adminClient: { rpc: rpcMock, from: fromMock },
    });
  });

  it('calls admin_create_studio_for_user with the expected arg shape', async () => {
    const res = await POST(makeRequest({ ownerUserId: 'user-1', name: 'Acme Studio' }));

    expect(res.status).toBe(201);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('admin_create_studio_for_user', {
      p_actor: 'admin-1',
      p_owner_user_id: 'user-1',
      p_name: 'Acme Studio',
    });
  });

  it('returns the new studioId on success', async () => {
    const res = await POST(makeRequest({ ownerUserId: 'user-1', name: 'Acme Studio' }));
    const json = await res.json();
    expect(json).toMatchObject({ data: { studioId: 'studio-1' } });
  });

  it('records an audit log carrying organization_id and studio.create', async () => {
    await POST(makeRequest({ ownerUserId: 'user-1', name: 'Acme Studio' }));

    expect(fromMock).toHaveBeenCalledWith('audit_logs');
    const inserted = insertMock.mock.calls[0][0];
    expect(inserted.organization_id).toBe('studio-1');
    expect(inserted.action).toBe('studio.create');
  });

  it('400s when ownerUserId is missing', async () => {
    const res = await POST(makeRequest({ name: 'Acme Studio' }));
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('400s when name is missing', async () => {
    const res = await POST(makeRequest({ ownerUserId: 'user-1' }));
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('400s when the JSON body is invalid', async () => {
    const badReq = new NextRequest('http://localhost:3001/api/admin/studios', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    } as unknown as RequestInit);
    const res = await POST(badReq);
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('maps user_not_found to 404', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'user_not_found' } });
    const res = await POST(makeRequest({ ownerUserId: 'user-1', name: 'Acme Studio' }));
    expect(res.status).toBe(404);
  });

  it('passes through the auth failure response when unauthenticated', async () => {
    const authError = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    mockGetAuthenticatedAdmin.mockResolvedValue({ error: authError });

    const res = await POST(makeRequest({ ownerUserId: 'user-1', name: 'Acme Studio' }));

    expect(res).toBe(authError);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('surfaces a 500 for an unmapped RPC error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    const res = await POST(makeRequest({ ownerUserId: 'user-1', name: 'Acme Studio' }));
    expect(res.status).toBe(500);
  });
});
