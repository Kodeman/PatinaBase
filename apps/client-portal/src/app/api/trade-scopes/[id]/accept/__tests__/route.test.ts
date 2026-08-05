/**
 * @jest-environment node
 *
 * Contract tests for POST /api/trade-scopes/[id]/accept. The user-session
 * client owns the fail-closed kind + progress preflight; only a service-role
 * client may forward the Cloudflare-derived IP evidence into
 * accept_trade_scope_with_trusted_ip. Browser payload fields never control
 * signed_ip or which proposal's progress the route trusts.
 */
import { NextRequest } from 'next/server';
import { getUser, createServerClient, createServiceClient } from '@patina/supabase/server';

import { POST } from '../route';

jest.mock('@patina/supabase/server', () => ({
  getUser: jest.fn(),
  createServerClient: jest.fn(),
  createServiceClient: jest.fn(),
}));

const mockGetUser = getUser as jest.Mock;
const mockCreateServerClient = createServerClient as jest.Mock;
const mockCreateServiceClient = createServiceClient as jest.Mock;

describe('POST /api/trade-scopes/[id]/accept', () => {
  function makeRequest(
    headers: Record<string, string> = {},
    body: Record<string, unknown> = { signedByName: 'Jamie Homeowner' }
  ): NextRequest {
    return new NextRequest('http://localhost:3002/api/trade-scopes/prop-1/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    } as unknown as RequestInit);
  }

  function makeParams(id = 'prop-1') {
    return { params: Promise.resolve({ id }) };
  }

  let userRpcMock: jest.Mock;
  let serviceRpcMock: jest.Mock;
  let invokeMock: jest.Mock;

  function bundleWith(progressState: string | null) {
    return {
      document: { id: 'prop-1', documentKind: 'trade_scope', commercialState: 'executed' },
      tradeScope: {
        progress: { state: progressState },
      },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ id: 'client-1' });

    userRpcMock = jest.fn().mockImplementation((name: string) => {
      if (name === 'get_client_commercial_document_bundle') {
        return Promise.resolve({ data: bundleWith('substantially_complete'), error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    serviceRpcMock = jest.fn().mockResolvedValue({
      data: { progress_state: 'accepted', accepted_at: '2026-08-04T00:00:00Z' },
      error: null,
    });
    invokeMock = jest.fn().mockResolvedValue({ data: { ok: true }, error: null });

    mockCreateServerClient.mockResolvedValue({
      rpc: userRpcMock,
      functions: { invoke: invokeMock },
    });
    mockCreateServiceClient.mockReturnValue({ rpc: serviceRpcMock });
  });

  it('requires authentication before constructing any client', async () => {
    mockGetUser.mockResolvedValue(null);

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(401);
    expect(mockCreateServerClient).not.toHaveBeenCalled();
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });

  it('rejects a signed name under two characters before touching the database', async () => {
    const res = await POST(makeRequest({}, { signedByName: 'J' }), makeParams());

    expect(res.status).toBe(400);
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });

  it('resolves kind and progress via the client bundle before accepting', async () => {
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(userRpcMock).toHaveBeenCalledWith('get_client_commercial_document_bundle', {
      p_proposal_id: 'prop-1',
    });
  });

  it('fails closed to 404 when the commercial kind preflight errors', async () => {
    userRpcMock.mockResolvedValue({ data: null, error: { message: 'lookup failed' } });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(404);
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });

  it('never accepts a non-trade-scope document through this route', async () => {
    userRpcMock.mockResolvedValue({
      data: { document: { id: 'prop-1', documentKind: 'furnishings_authorization', commercialState: 'executed' } },
      error: null,
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(404);
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });

  it('rejects acceptance before the bundle reports substantially_complete', async () => {
    userRpcMock.mockResolvedValue({ data: bundleWith('in_progress'), error: null });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'not_acceptable' });
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });

  it('accepts through the trusted service boundary and notifies trade_scope_accepted', async () => {
    const response = await POST(makeRequest({ 'cf-connecting-ip': '203.0.113.7' }), makeParams());

    expect(response.status).toBe(200);
    expect(serviceRpcMock).toHaveBeenCalledWith('accept_trade_scope_with_trusted_ip', {
      p_proposal_id: 'prop-1',
      p_signed_name: 'Jamie Homeowner',
      p_client_id: 'client-1',
      p_signed_ip: '203.0.113.7',
    });
    expect(invokeMock).toHaveBeenCalledWith('commercial-document-notify', {
      body: { documentId: 'prop-1', transition: 'trade_scope_accepted' },
    });
    expect(await response.json()).toMatchObject({
      ok: true,
      progressState: 'accepted',
      acceptedAt: '2026-08-04T00:00:00Z',
      notificationDelivery: { state: 'delivered' },
    });
  });

  it('allows an idempotent retry once the bundle already reports accepted', async () => {
    userRpcMock.mockResolvedValue({ data: bundleWith('accepted'), error: null });

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(200);
    expect(mockCreateServiceClient).toHaveBeenCalled();
  });

  it('maps an unknown accept_trade_scope_with_trusted_ip failure to 500 with clean copy, never raw Postgres text', async () => {
    serviceRpcMock.mockResolvedValue({
      data: null,
      error: { message: 'trade scope prop-1 not found or access denied', code: 'XX000' },
    });

    const response = await POST(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).not.toContain('not found or access denied');
    expect(body).toMatchObject({ error: "We couldn't accept this work right now. Please try again in a moment." });
  });

  it('maps an insufficient_privilege (42501) refusal to 403 with clean copy', async () => {
    serviceRpcMock.mockResolvedValue({
      data: null,
      error: { message: 'trade scope prop-1 not found or access denied', code: '42501' },
    });

    const response = await POST(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).not.toContain('not found or access denied');
    expect(body).toMatchObject({ error: "This trade scope can't be accepted from your account." });
  });

  it('maps a check_violation (23514) state conflict to 409 with clean copy', async () => {
    serviceRpcMock.mockResolvedValue({
      data: null,
      error: {
        message: 'a trade scope must be substantially complete before the client accepts it',
        code: '23514',
      },
    });

    const response = await POST(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).not.toContain('substantially complete');
    expect(body).toMatchObject({
      error: "This work isn't marked complete yet — check back once your designer updates it.",
    });
  });

  it('reports a notification failure as pending_retry without failing the request', async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: 'edge unavailable' } });

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      notificationDelivery: { state: 'pending_retry' },
    });
  });
});
