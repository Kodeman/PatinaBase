/**
 * @jest-environment node
 *
 * Tests for POST /api/admin/studios/[id]/members (00556's
 * admin_add_studio_member). Locks the RPC's arg-key shape the same way
 * fulfillment/vendors/create/__tests__/route.test.ts locks
 * fulfillment_create_vendor's — a guessed-at signature drift here fails a
 * build instead of shipping a silent no-op against the roster.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin } from '@/lib/supabase-admin';

import { POST } from '../route';
import { PATCH } from '../[memberId]/route';

jest.mock('@/lib/supabase-admin', () => {
  const actual = jest.requireActual('@/lib/supabase-admin');
  return {
    ...actual,
    getAuthenticatedAdmin: jest.fn(),
  };
});

const mockGetAuthenticatedAdmin = getAuthenticatedAdmin as jest.Mock;

describe('POST /api/admin/studios/[id]/members', () => {
  let rpcMock: jest.Mock;
  let insertMock: jest.Mock;
  let fromMock: jest.Mock;

  function makeRequest(body: Record<string, unknown> = {}): NextRequest {
    return new NextRequest('http://localhost:3001/api/admin/studios/studio-1/members', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    } as unknown as RequestInit);
  }

  const ctx = { params: Promise.resolve({ id: 'studio-1' }) };

  beforeEach(() => {
    rpcMock = jest.fn().mockResolvedValue({ data: { id: 'member-1' }, error: null });
    insertMock = jest.fn().mockResolvedValue({ data: null, error: null });
    fromMock = jest.fn(() => ({ insert: insertMock }));
    mockGetAuthenticatedAdmin.mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@patina.cloud' },
      adminClient: { rpc: rpcMock, from: fromMock },
    });
  });

  it('calls admin_add_studio_member with the expected arg keys', async () => {
    const res = await POST(makeRequest({ userId: 'user-2', role: 'member' }), ctx);

    expect(res.status).toBe(201);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('admin_add_studio_member', {
      p_actor: 'admin-1',
      p_org_id: 'studio-1',
      p_user_id: 'user-2',
      p_role: 'member',
      p_teammate_type: undefined,
      p_job_title: undefined,
      p_staff_role: undefined,
    });

    const calledArgs = rpcMock.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(calledArgs).sort()).toEqual(
      ['p_actor', 'p_job_title', 'p_org_id', 'p_role', 'p_staff_role', 'p_teammate_type', 'p_user_id'].sort(),
    );
  });

  it('sends undefined for blank optional fields', async () => {
    const res = await POST(
      makeRequest({ userId: 'user-2', role: '  ', teammateType: '  ', jobTitle: '', staffRole: '   ' }),
      ctx,
    );
    expect(res.status).toBe(201);
    expect(rpcMock).toHaveBeenCalledWith('admin_add_studio_member', {
      p_actor: 'admin-1',
      p_org_id: 'studio-1',
      p_user_id: 'user-2',
      p_role: undefined,
      p_teammate_type: undefined,
      p_job_title: undefined,
      p_staff_role: undefined,
    });
  });

  it('records an audit log carrying organization_id and the studio.member.add action', async () => {
    await POST(makeRequest({ userId: 'user-2', role: 'member' }), ctx);

    expect(fromMock).toHaveBeenCalledWith('audit_logs');
    expect(insertMock).toHaveBeenCalledTimes(1);
    const inserted = insertMock.mock.calls[0][0];
    expect(inserted.organization_id).toBe('studio-1');
    expect(inserted.action).toBe('studio.member.add');
    expect(inserted.resource_type).toBe('organization');
    expect(inserted.resource_id).toBe('studio-1');
  });

  it('400s when userId is missing', async () => {
    const res = await POST(makeRequest({ role: 'member' }), ctx);
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('400s when the JSON body is invalid', async () => {
    const badReq = new NextRequest('http://localhost:3001/api/admin/studios/studio-1/members', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    } as unknown as RequestInit);
    const res = await POST(badReq, ctx);
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('maps organization_not_active to 409', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'organization_not_active' } });
    const res = await POST(makeRequest({ userId: 'user-2', role: 'member' }), ctx);
    expect(res.status).toBe(409);
  });

  it('maps already_member to 409', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'already_member' } });
    const res = await POST(makeRequest({ userId: 'user-2', role: 'member' }), ctx);
    expect(res.status).toBe(409);
  });

  it('400s on role owner without calling the RPC', async () => {
    const res = await POST(makeRequest({ userId: 'user-2', role: 'owner' }), ctx);
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.error).toMatch(/transfer ownership/i);
  });

  it('400s on an unknown role without calling the RPC', async () => {
    const res = await POST(makeRequest({ userId: 'user-2', role: 'bogus' }), ctx);
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('400s on an unknown teammateType without calling the RPC', async () => {
    const res = await POST(makeRequest({ userId: 'user-2', teammateType: 'bogus' }), ctx);
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('maps use_transfer_ownership from the RPC to 400', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'use_transfer_ownership' } });
    const res = await POST(makeRequest({ userId: 'user-2', role: 'member' }), ctx);
    expect(res.status).toBe(400);
  });

  it('passes through the auth failure response when unauthenticated', async () => {
    const authError = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    mockGetAuthenticatedAdmin.mockResolvedValue({ error: authError });

    const res = await POST(makeRequest({ userId: 'user-2' }), ctx);

    expect(res).toBe(authError);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('surfaces a 500 for an unmapped RPC error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    const res = await POST(makeRequest({ userId: 'user-2', role: 'member' }), ctx);
    expect(res.status).toBe(500);
  });
});

describe('PATCH /api/admin/studios/[id]/members/[memberId]', () => {
  let rpcMock: jest.Mock;
  let insertMock: jest.Mock;
  let maybeSingleMock: jest.Mock;
  let updateMaybeSingleMock: jest.Mock;
  let updateMock: jest.Mock;

  const ctx = { params: Promise.resolve({ id: 'studio-1', memberId: 'member-1' }) };

  function makeRequest(body: Record<string, unknown> = {}): NextRequest {
    return new NextRequest(
      'http://localhost:3001/api/admin/studios/studio-1/members/member-1',
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      } as unknown as RequestInit,
    );
  }

  function memberRow(orgType: string) {
    return {
      id: 'member-1',
      organization_id: 'studio-1',
      user_id: 'user-2',
      role: 'member',
      status: 'active',
      organizations: { type: orgType },
    };
  }

  beforeEach(() => {
    rpcMock = jest.fn().mockResolvedValue({ data: { id: 'member-1' }, error: null });
    insertMock = jest.fn().mockResolvedValue({ data: null, error: null });
    maybeSingleMock = jest.fn().mockResolvedValue({ data: memberRow('design_studio'), error: null });
    updateMaybeSingleMock = jest
      .fn()
      .mockResolvedValue({ data: { id: 'member-1', staff_role: null }, error: null });
    updateMock = jest.fn(() => ({
      eq: jest.fn(() => ({ select: jest.fn(() => ({ maybeSingle: updateMaybeSingleMock })) })),
    }));

    const fromMock = jest.fn((table: string) => {
      if (table === 'audit_logs') return { insert: insertMock };
      return {
        select: jest.fn(() => ({ eq: jest.fn(() => ({ maybeSingle: maybeSingleMock })) })),
        update: updateMock,
      };
    });

    mockGetAuthenticatedAdmin.mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@patina.cloud' },
      adminClient: { rpc: rpcMock, from: fromMock },
    });
  });

  it('404s when the membership belongs to a non-design_studio organization', async () => {
    maybeSingleMock.mockResolvedValue({ data: memberRow('manufacturer'), error: null });
    const res = await PATCH(makeRequest({ role: 'admin' }), ctx);
    expect(res.status).toBe(404);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('400s on role owner without calling the RPC', async () => {
    const res = await PATCH(makeRequest({ role: 'owner' }), ctx);
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('400s on an unknown role without calling the RPC', async () => {
    const res = await PATCH(makeRequest({ role: 'bogus' }), ctx);
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('400s on an over-long staffRole without calling the RPC', async () => {
    const res = await PATCH(makeRequest({ staffRole: 'x'.repeat(121) }), ctx);
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('writes the title before calling the role RPC when both are sent', async () => {
    const order: string[] = [];
    updateMaybeSingleMock.mockImplementation(async () => {
      order.push('title');
      return { data: { id: 'member-1' }, error: null };
    });
    rpcMock.mockImplementation(async () => {
      order.push('role');
      return { data: { id: 'member-1' }, error: null };
    });

    const res = await PATCH(makeRequest({ role: 'admin', staffRole: 'principal' }), ctx);
    expect(res.status).toBe(200);
    expect(order).toEqual(['title', 'role']);
  });

  it('clears the title when staffRole is null', async () => {
    const res = await PATCH(makeRequest({ staffRole: null }), ctx);
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({ staff_role: null });
  });
});
