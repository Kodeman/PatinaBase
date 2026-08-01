/**
 * @jest-environment node
 *
 * Contract tests for POST /api/proposals/[id]/sign. The user-session client
 * owns the safe proposal preflight and confirmation email; only a service-role
 * client may forward Cloudflare-derived IP evidence to the database. Browser
 * payload fields never control signed_ip, activation, or project start date.
 */
import { NextRequest } from 'next/server';
import {
  getUser,
  createServerClient,
  createServiceClient,
} from '@patina/supabase/server';

import { POST } from '../route';

jest.mock('@patina/supabase/server', () => ({
  getUser: jest.fn(),
  createServerClient: jest.fn(),
  createServiceClient: jest.fn(),
}));

const mockGetUser = getUser as jest.Mock;
const mockCreateServerClient = createServerClient as jest.Mock;
const mockCreateServiceClient = createServiceClient as jest.Mock;

describe('POST /api/proposals/[id]/sign', () => {
  function makeRequest(
    headers: Record<string, string> = {},
    body: Record<string, unknown> = { signedByName: 'Jamie Homeowner' },
  ): NextRequest {
    return new NextRequest('http://localhost:3002/api/proposals/prop-1/sign', {
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
  let proposalStatus: 'sent' | 'viewed' | 'accepted';
  let validUntil: string | null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ id: 'client-1' });
    proposalStatus = 'sent';
    validUntil = null;

    userRpcMock = jest.fn().mockImplementation((name: string) => {
      if (name === 'get_client_proposal_bundle') {
        return Promise.resolve({
          data: {
            proposal: {
              id: 'prop-1',
              status: proposalStatus,
              designer_id: 'designer-1',
              valid_until: validUntil,
            },
          },
          error: null,
        });
      }
      return Promise.resolve({ error: null });
    });
    serviceRpcMock = jest.fn().mockResolvedValue({ data: {}, error: null });
    invokeMock = jest.fn().mockResolvedValue({ data: null, error: null });

    mockCreateServerClient.mockResolvedValue({
      rpc: userRpcMock,
      functions: { invoke: invokeMock },
    });
    mockCreateServiceClient.mockReturnValue({ rpc: serviceRpcMock });
  });

  it('authenticates before constructing a service-role client', async () => {
    mockGetUser.mockResolvedValue(null);

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(401);
    expect(mockCreateServerClient).not.toHaveBeenCalled();
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });

  it('uses the user-session client only for the safe proposal preflight', async () => {
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(userRpcMock).toHaveBeenCalledTimes(1);
    expect(userRpcMock).toHaveBeenCalledWith('get_client_proposal_bundle', {
      p_proposal_id: 'prop-1',
    });
  });

  it('passes verified client identity and cf-connecting-ip only to the service RPC', async () => {
    const res = await POST(
      makeRequest({ 'cf-connecting-ip': '203.0.113.7' }),
      makeParams(),
    );

    expect(res.status).toBe(200);
    expect(serviceRpcMock).toHaveBeenCalledWith(
      'sign_proposal_with_trusted_ip',
      {
        p_proposal_id: 'prop-1',
        p_signed_name: 'Jamie Homeowner',
        p_client_id: 'client-1',
        p_signed_ip: '203.0.113.7',
      },
    );
  });

  it('ignores caller-supplied IP, activation, start-date, and client fields', async () => {
    const res = await POST(
      makeRequest(
        { 'cf-connecting-ip': '203.0.113.7' },
        {
          signedByName: 'Jamie Homeowner',
          signedIp: '198.51.100.200',
          autoActivate: false,
          startDate: '2040-01-01',
          clientId: 'attacker-controlled',
        },
      ),
      makeParams(),
    );

    expect(res.status).toBe(200);
    expect(serviceRpcMock).toHaveBeenCalledWith(
      'sign_proposal_with_trusted_ip',
      {
        p_proposal_id: 'prop-1',
        p_signed_name: 'Jamie Homeowner',
        p_client_id: 'client-1',
        p_signed_ip: '203.0.113.7',
      },
    );
  });

  it('uses the first x-forwarded-for hop when Cloudflare IP is absent', async () => {
    const res = await POST(
      makeRequest({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' }),
      makeParams(),
    );

    expect(res.status).toBe(200);
    expect(serviceRpcMock).toHaveBeenCalledWith(
      'sign_proposal_with_trusted_ip',
      expect.objectContaining({ p_signed_ip: '198.51.100.1' }),
    );
  });

  it('passes null trusted IP when no server-side address header is present', async () => {
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(serviceRpcMock).toHaveBeenCalledWith(
      'sign_proposal_with_trusted_ip',
      expect.objectContaining({ p_signed_ip: null }),
    );
  });

  it('allows an accepted retry so the database can repair a missing project', async () => {
    proposalStatus = 'accepted';
    validUntil = '2020-01-01T00:00:00.000Z';

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(serviceRpcMock).toHaveBeenCalledTimes(1);
  });

  it('does not send confirmation when the authoritative service RPC fails', async () => {
    serviceRpcMock.mockResolvedValue({
      data: null,
      error: { message: 'proposal approval evidence conflicts' },
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(500);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
