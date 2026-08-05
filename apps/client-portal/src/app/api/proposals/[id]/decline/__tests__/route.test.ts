/**
 * @jest-environment node
 *
 * Contract tests for POST /api/proposals/[id]/decline. Mirrors the sign
 * route's kind-preflight discipline: resolve the commercial kind through
 * get_client_commercial_document_bundle first and fail closed to 404 before
 * ever calling decline_proposal. Unlike sign, decline_proposal (00387/00390/
 * 00412) is granted to `authenticated` only — REVOKEd from service_role — so
 * this route never constructs a service-role client; it runs entirely on the
 * user-session client so auth.uid() resolves to the caller.
 */
import { NextRequest } from 'next/server';
import { getUser, createServerClient } from '@patina/supabase/server';

import { POST } from '../route';

jest.mock('@patina/supabase/server', () => ({
  getUser: jest.fn(),
  createServerClient: jest.fn(),
}));

const mockGetUser = getUser as jest.Mock;
const mockCreateServerClient = createServerClient as jest.Mock;

describe('POST /api/proposals/[id]/decline', () => {
  function makeRequest(body: Record<string, unknown> = {}): NextRequest {
    return new NextRequest('http://localhost:3002/api/proposals/prop-1/decline', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    } as unknown as RequestInit);
  }

  function makeParams(id = 'prop-1') {
    return { params: Promise.resolve({ id }) };
  }

  let rpcMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ id: 'client-1' });

    rpcMock = jest.fn().mockImplementation((name: string) => {
      if (name === 'get_client_commercial_document_bundle') {
        return Promise.resolve({
          data: { document: { id: 'prop-1', documentKind: 'design_services', commercialState: 'sent' } },
          error: null,
        });
      }
      if (name === 'decline_proposal') {
        return Promise.resolve({
          data: { id: 'prop-1', status: 'declined', declined_at: '2026-08-04T00:00:00Z' },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    mockCreateServerClient.mockResolvedValue({ rpc: rpcMock });
  });

  it('requires authentication before touching the database', async () => {
    mockGetUser.mockResolvedValue(null);

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(401);
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });

  it('resolves kind via the client commercial bundle before declining', async () => {
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenNthCalledWith(1, 'get_client_commercial_document_bundle', {
      p_proposal_id: 'prop-1',
    });
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'decline_proposal', {
      p_proposal_id: 'prop-1',
      p_reason: null,
    });
  });

  it('calls decline_proposal on the user-session client only — never a service-role client', async () => {
    await POST(makeRequest(), makeParams());
    // The only client constructed anywhere in this route is createServerClient.
    expect(mockCreateServerClient).toHaveBeenCalledTimes(1);
  });

  it('forwards a trimmed, non-empty reason', async () => {
    await POST(makeRequest({ reason: '  Changed my mind  ' }), makeParams());

    expect(rpcMock).toHaveBeenNthCalledWith(2, 'decline_proposal', {
      p_proposal_id: 'prop-1',
      p_reason: 'Changed my mind',
    });
  });

  it('normalizes a blank reason to null rather than an empty string', async () => {
    await POST(makeRequest({ reason: '   ' }), makeParams());

    expect(rpcMock).toHaveBeenNthCalledWith(2, 'decline_proposal', {
      p_proposal_id: 'prop-1',
      p_reason: null,
    });
  });

  it('fails closed to 404 when the commercial kind preflight errors', async () => {
    rpcMock.mockImplementation((name: string) => {
      if (name === 'get_client_commercial_document_bundle') {
        return Promise.resolve({ data: null, error: { message: 'lookup failed' } });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(404);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it('never declines a legacy document through this route — legacy keeps its existing direct decline path', async () => {
    rpcMock.mockImplementation((name: string) => {
      if (name === 'get_client_commercial_document_bundle') {
        return Promise.resolve({
          data: { document: { id: 'prop-1', documentKind: 'legacy', kind: 'legacy' } },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(404);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it('never defaults an unrecognized kind through to decline_proposal', async () => {
    rpcMock.mockImplementation((name: string) => {
      if (name === 'get_client_commercial_document_bundle') {
        return Promise.resolve({
          data: { document: { id: 'prop-1', documentKind: 'future_contract' } },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(404);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it('maps insufficient_privilege from decline_proposal to 403', async () => {
    rpcMock.mockImplementation((name: string) => {
      if (name === 'get_client_commercial_document_bundle') {
        return Promise.resolve({
          data: { document: { id: 'prop-1', documentKind: 'design_services', commercialState: 'sent' } },
          error: null,
        });
      }
      if (name === 'decline_proposal') {
        return Promise.resolve({
          data: null,
          error: { code: '42501', message: 'proposal prop-1 may only be declined by its client' },
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('may only be declined') });
  });

  it('maps check_violation (not in a declinable status) from decline_proposal to 409', async () => {
    rpcMock.mockImplementation((name: string) => {
      if (name === 'get_client_commercial_document_bundle') {
        return Promise.resolve({
          data: { document: { id: 'prop-1', documentKind: 'design_services', commercialState: 'sent' } },
          error: null,
        });
      }
      if (name === 'decline_proposal') {
        return Promise.resolve({
          data: null,
          error: { code: '23514', message: 'proposal prop-1 is not declinable in status executed' },
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(409);
  });

  it('falls back to 500 for an unrecognized decline_proposal error', async () => {
    rpcMock.mockImplementation((name: string) => {
      if (name === 'get_client_commercial_document_bundle') {
        return Promise.resolve({
          data: { document: { id: 'prop-1', documentKind: 'design_services', commercialState: 'sent' } },
          error: null,
        });
      }
      if (name === 'decline_proposal') {
        return Promise.resolve({ data: null, error: { code: '58030', message: 'io error' } });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(500);
  });

  it('returns the declined id, status, and declinedAt on success', async () => {
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      id: 'prop-1',
      status: 'declined',
      declinedAt: '2026-08-04T00:00:00Z',
    });
  });
});
