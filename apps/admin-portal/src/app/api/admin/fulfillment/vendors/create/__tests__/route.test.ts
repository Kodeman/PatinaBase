/**
 * @jest-environment node
 *
 * Tests for POST /api/admin/fulfillment/vendors/create (I15).
 *
 * Locks fulfillment_create_vendor's (00371) 4-arg call shape the same way
 * shipments/[shipmentId]/eta/__tests__/route.test.ts locks
 * fulfillment_update_shipment_eta's — a guessed-at signature drift here
 * fails a build instead of shipping a silent no-op against the Directory.
 *
 * Uses the `node` test env (not jsdom) so `next/server`'s NextRequest can be
 * constructed directly.
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

describe('POST /api/admin/fulfillment/vendors/create', () => {
  let rpcMock: jest.Mock;

  function makeRequest(body: Record<string, unknown> = {}): NextRequest {
    return new NextRequest('http://localhost:3001/api/admin/fulfillment/vendors/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    } as unknown as RequestInit);
  }

  beforeEach(() => {
    rpcMock = jest.fn().mockResolvedValue({ data: 'vendor-1', error: null });
    mockGetAuthenticatedAdmin.mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@patina.cloud' },
      adminClient: { rpc: rpcMock },
    });
  });

  it('calls fulfillment_create_vendor with exactly the 00371 4-arg signature', async () => {
    const res = await POST(
      makeRequest({ name: 'Acme Textiles', website: 'https://acme.example', notes: 'net-30' }),
    );

    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('fulfillment_create_vendor', {
      p_name: 'Acme Textiles',
      p_website: 'https://acme.example',
      p_notes: 'net-30',
      p_actor: 'admin@patina.cloud',
    });

    const calledArgs = rpcMock.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(calledArgs).sort()).toEqual(['p_actor', 'p_name', 'p_notes', 'p_website']);
  });

  it('returns the new vendorId on success', async () => {
    const res = await POST(makeRequest({ name: 'Acme Textiles' }));
    const json = await res.json();
    expect(json).toMatchObject({ data: { vendorId: 'vendor-1' } });
  });

  it('trims the name and sends undefined for blank optional fields', async () => {
    const res = await POST(makeRequest({ name: '  Acme Textiles  ', website: '   ', notes: '' }));
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith('fulfillment_create_vendor', {
      p_name: 'Acme Textiles',
      p_website: undefined,
      p_notes: undefined,
      p_actor: 'admin@patina.cloud',
    });
  });

  it('400s when name is missing', async () => {
    const res = await POST(makeRequest({ website: 'https://acme.example' }));
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('400s when name is only whitespace', async () => {
    const res = await POST(makeRequest({ name: '   ' }));
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('400s when the JSON body is invalid', async () => {
    const badReq = new NextRequest('http://localhost:3001/api/admin/fulfillment/vendors/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    } as unknown as RequestInit);
    const res = await POST(badReq);
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('downgrades a duplicate-name RPC error to 400', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'fulfillment_create_vendor: a vendor named "Acme Textiles" already exists' },
    });

    const res = await POST(makeRequest({ name: 'Acme Textiles' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/already exists/i);
  });

  it('passes through the auth failure response when unauthenticated', async () => {
    const authError = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    mockGetAuthenticatedAdmin.mockResolvedValue({ error: authError });

    const res = await POST(makeRequest({ name: 'Acme Textiles' }));

    expect(res).toBe(authError);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('surfaces a 500 if the RPC errors for an unexpected reason', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'connection reset' } });

    const res = await POST(makeRequest({ name: 'Acme Textiles' }));
    expect(res.status).toBe(500);
  });
});
