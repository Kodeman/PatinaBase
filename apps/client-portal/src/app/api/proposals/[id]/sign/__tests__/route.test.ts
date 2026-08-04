/**
 * @jest-environment node
 *
 * Contract tests for POST /api/proposals/[id]/sign. The user-session client
 * owns the safe proposal preflight and confirmation email; only a service-role
 * client may forward Cloudflare-derived IP evidence to the database. Browser
 * payload fields never control signed_ip, activation, or project start date.
 */
import { NextRequest } from 'next/server';
import { getUser, createServerClient, createServiceClient } from '@patina/supabase/server';
import { captureMoodBoardProposalActivated } from '@/lib/analytics/mood-board-server';

import { POST } from '../route';

jest.mock('@patina/supabase/server', () => ({
  getUser: jest.fn(),
  createServerClient: jest.fn(),
  createServiceClient: jest.fn(),
}));
jest.mock('@/lib/analytics/mood-board-server', () => ({
  captureMoodBoardProposalActivated: jest.fn().mockResolvedValue(undefined),
}));

const mockGetUser = getUser as jest.Mock;
const mockCreateServerClient = createServerClient as jest.Mock;
const mockCreateServiceClient = createServiceClient as jest.Mock;
const mockCaptureProposalActivated = captureMoodBoardProposalActivated as jest.Mock;

describe('POST /api/proposals/[id]/sign', () => {
  function makeRequest(
    headers: Record<string, string> = {},
    body: Record<string, unknown> = { signedByName: 'Jamie Homeowner' }
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
  let serviceFromMock: jest.Mock;
  let boardCountStatusEqMock: jest.Mock;
  let proposalStatus: 'sent' | 'viewed' | 'accepted';
  let validUntil: string | null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ id: 'client-1' });
    proposalStatus = 'sent';
    validUntil = null;

    userRpcMock = jest.fn().mockImplementation((name: string) => {
      if (name === 'get_client_commercial_document_bundle') {
        return Promise.resolve({
          data: { document: { id: 'prop-1', kind: 'legacy', state: 'sent' } },
          error: null,
        });
      }
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
    serviceRpcMock = jest.fn().mockResolvedValue({
      data: {
        newly_signed: true,
        project_id: 'e4061000-0000-4000-8000-000000000001',
      },
      error: null,
    });
    boardCountStatusEqMock = jest.fn().mockResolvedValue({ count: 2, error: null });
    const boardCountProposalEqMock = jest.fn().mockReturnValue({
      eq: boardCountStatusEqMock,
    });
    const boardCountSelectMock = jest.fn().mockReturnValue({
      eq: boardCountProposalEqMock,
    });
    serviceFromMock = jest.fn().mockReturnValue({ select: boardCountSelectMock });
    invokeMock = jest.fn().mockResolvedValue({ data: { ok: true }, error: null });

    mockCreateServerClient.mockResolvedValue({
      rpc: userRpcMock,
      functions: { invoke: invokeMock },
    });
    mockCreateServiceClient.mockReturnValue({
      rpc: serviceRpcMock,
      from: serviceFromMock,
    });
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
    expect(userRpcMock).toHaveBeenCalledTimes(2);
    expect(userRpcMock).toHaveBeenNthCalledWith(1, 'get_client_commercial_document_bundle', {
      p_proposal_id: 'prop-1',
    });
    expect(userRpcMock).toHaveBeenNthCalledWith(2, 'get_client_proposal_bundle', {
      p_proposal_id: 'prop-1',
    });
  });

  it('fails closed when the commercial kind preflight errors', async () => {
    userRpcMock.mockImplementation((name: string) => {
      if (name === 'get_client_commercial_document_bundle') {
        return Promise.resolve({
          data: null,
          error: { message: 'lookup failed' },
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(404);
    expect(userRpcMock).toHaveBeenCalledTimes(1);
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });

  it('does not default an unknown commercial kind into legacy activation', async () => {
    userRpcMock.mockResolvedValue({
      data: {
        document: { id: 'prop-1', kind: 'future_contract', state: 'sent' },
      },
      error: null,
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(404);
    expect(userRpcMock).toHaveBeenCalledTimes(1);
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });

  it('passes verified client identity and cf-connecting-ip only to the service RPC', async () => {
    const res = await POST(makeRequest({ 'cf-connecting-ip': '203.0.113.7' }), makeParams());

    expect(res.status).toBe(200);
    expect(serviceRpcMock).toHaveBeenCalledWith('sign_proposal_with_trusted_ip', {
      p_proposal_id: 'prop-1',
      p_signed_name: 'Jamie Homeowner',
      p_client_id: 'client-1',
      p_signed_ip: '203.0.113.7',
    });
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
        }
      ),
      makeParams()
    );

    expect(res.status).toBe(200);
    expect(serviceRpcMock).toHaveBeenCalledWith('sign_proposal_with_trusted_ip', {
      p_proposal_id: 'prop-1',
      p_signed_name: 'Jamie Homeowner',
      p_client_id: 'client-1',
      p_signed_ip: '203.0.113.7',
    });
  });

  it('uses the first x-forwarded-for hop when Cloudflare IP is absent', async () => {
    const res = await POST(makeRequest({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' }), makeParams());

    expect(res.status).toBe(200);
    expect(serviceRpcMock).toHaveBeenCalledWith(
      'sign_proposal_with_trusted_ip',
      expect.objectContaining({ p_signed_ip: '198.51.100.1' })
    );
  });

  it('passes null trusted IP when no server-side address header is present', async () => {
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(serviceRpcMock).toHaveBeenCalledWith(
      'sign_proposal_with_trusted_ip',
      expect.objectContaining({ p_signed_ip: null })
    );
  });

  it('allows an accepted retry so the database can repair a missing project', async () => {
    proposalStatus = 'accepted';
    validUntil = '2020-01-01T00:00:00.000Z';
    serviceRpcMock.mockResolvedValue({
      data: {
        newly_signed: false,
        project_id: 'e4061000-0000-4000-8000-000000000001',
      },
      error: null,
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(serviceRpcMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(mockCaptureProposalActivated).toHaveBeenCalledWith({
      proposalId: 'prop-1',
      projectId: 'e4061000-0000-4000-8000-000000000001',
      boardCount: 2,
    });
  });

  it('sends confirmation only for the transaction that created the signature', async () => {
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('proposal-sign-confirmation', {
      body: { proposalId: 'prop-1' },
    });
  });

  it('records the authoritative active-board count for a newly activated proposal', async () => {
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(serviceFromMock).toHaveBeenCalledWith('proposal_boards');
    expect(boardCountStatusEqMock).toHaveBeenCalledWith('status', 'active');
    expect(mockCaptureProposalActivated).toHaveBeenCalledWith({
      proposalId: 'prop-1',
      projectId: 'e4061000-0000-4000-8000-000000000001',
      boardCount: 2,
    });
  });

  it('does not let an activation analytics count failure break signing', async () => {
    boardCountStatusEqMock.mockRejectedValue(new Error('count unavailable'));

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(mockCaptureProposalActivated).not.toHaveBeenCalled();
  });

  it('fails closed on a legacy or malformed RPC result without duplicating mail', async () => {
    serviceRpcMock.mockResolvedValue({ data: {}, error: null });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(mockCaptureProposalActivated).not.toHaveBeenCalled();
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

  it('records design-services client consent without assuming project activation', async () => {
    userRpcMock.mockImplementation((name: string) => {
      if (name === 'get_client_commercial_document_bundle') {
        return Promise.resolve({
          data: {
            document: { id: 'prop-1', kind: 'design_services', state: 'sent' },
          },
          error: null,
        });
      }
      if (name === 'get_client_proposal_bundle') {
        return Promise.resolve({
          data: { proposal: { id: 'prop-1', valid_until: null } },
          error: null,
        });
      }
      return Promise.resolve({ error: null });
    });
    serviceRpcMock.mockResolvedValue({
      data: {
        commercial_state: 'client_signed',
        newly_client_signed: true,
        project_id: null,
      },
      error: null,
    });

    const response = await POST(makeRequest({ 'cf-connecting-ip': '203.0.113.7' }), makeParams());

    expect(response.status).toBe(200);
    expect(serviceRpcMock).toHaveBeenCalledWith('sign_design_services_agreement_with_trusted_ip', {
      p_proposal_id: 'prop-1',
      p_signed_name: 'Jamie Homeowner',
      p_client_id: 'client-1',
      p_signed_ip: '203.0.113.7',
    });
    expect(await response.json()).toMatchObject({
      commercialState: 'client_signed',
      newlyClientSigned: true,
      notificationDelivery: { state: 'delivered' },
    });
    expect(invokeMock).toHaveBeenCalledWith('commercial-document-notify', {
      body: { documentId: 'prop-1', transition: 'client_signed' },
    });
  });

  it('executes FF&E through the trusted service boundary and preserves evidence', async () => {
    userRpcMock.mockImplementation((name: string) => {
      if (name === 'get_client_commercial_document_bundle') {
        return Promise.resolve({
          data: {
            document: {
              id: 'prop-1',
              kind: 'furnishings_authorization',
              state: 'sent',
            },
          },
          error: null,
        });
      }
      if (name === 'get_client_proposal_bundle') {
        return Promise.resolve({
          data: { proposal: { id: 'prop-1', valid_until: null } },
          error: null,
        });
      }
      return Promise.resolve({ error: null });
    });
    serviceRpcMock.mockResolvedValue({
      data: {
        projectId: 'project-1',
        depositInvoiceId: 'invoice-1',
        newlyExecuted: true,
      },
      error: null,
    });

    const response = await POST(makeRequest({ 'cf-connecting-ip': '203.0.113.7' }), makeParams());

    expect(response.status).toBe(200);
    expect(serviceRpcMock).toHaveBeenCalledWith('execute_furnishings_authorization_with_trusted_ip', {
      p_proposal_id: 'prop-1',
      p_signed_name: 'Jamie Homeowner',
      p_client_id: 'client-1',
      p_signed_ip: '203.0.113.7',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(1, 'commercial-document-notify', {
      body: { documentId: 'prop-1', transition: 'furnishings_executed' },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'commercial-document-notify', {
      body: { documentId: 'prop-1', transition: 'deposit_ready' },
    });
    expect(await response.json()).toMatchObject({
      commercialState: 'executed',
      projectId: 'project-1',
      depositInvoiceId: 'invoice-1',
      newlyExecuted: true,
      notificationDelivery: {
        state: 'delivered',
        transitions: {
          furnishingsExecuted: 'delivered',
          depositReady: 'delivered',
        },
      },
    });
  });

  it('keeps a durable services signature successful while surfacing notification retry', async () => {
    userRpcMock.mockImplementation((name: string) => {
      if (name === 'get_client_commercial_document_bundle') {
        return Promise.resolve({
          data: {
            document: { id: 'prop-1', kind: 'design_services', state: 'sent' },
          },
          error: null,
        });
      }
      if (name === 'get_client_proposal_bundle') {
        return Promise.resolve({
          data: { proposal: { id: 'prop-1', valid_until: null } },
          error: null,
        });
      }
      return Promise.resolve({ error: null });
    });
    serviceRpcMock.mockResolvedValue({
      data: { commercialState: 'client_signed', newlyClientSigned: true },
      error: null,
    });
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: 'edge unavailable' },
    });

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      commercialState: 'client_signed',
      newlyClientSigned: true,
      notificationDelivery: { state: 'pending_retry' },
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('attempts both FF&E notices and reports a partial delivery failure truthfully', async () => {
    userRpcMock.mockImplementation((name: string) => {
      if (name === 'get_client_commercial_document_bundle') {
        return Promise.resolve({
          data: {
            document: {
              id: 'prop-1',
              kind: 'furnishings_authorization',
              state: 'sent',
            },
          },
          error: null,
        });
      }
      if (name === 'get_client_proposal_bundle') {
        return Promise.resolve({
          data: { proposal: { id: 'prop-1', valid_until: null } },
          error: null,
        });
      }
      return Promise.resolve({ error: null });
    });
    serviceRpcMock.mockResolvedValue({
      data: {
        projectId: 'project-1',
        depositInvoiceId: 'invoice-1',
        newlyExecuted: true,
      },
      error: null,
    });
    invokeMock
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'first unavailable' },
      })
      .mockResolvedValueOnce({ data: { ok: true }, error: null });

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(200);
    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(await response.json()).toMatchObject({
      newlyExecuted: true,
      notificationDelivery: {
        state: 'pending_retry',
        transitions: {
          furnishingsExecuted: 'pending_retry',
          depositReady: 'delivered',
        },
      },
    });
  });

  it('replays idempotent FF&E notices on an executed retry without repeating execution', async () => {
    userRpcMock.mockImplementation((name: string) => {
      if (name === 'get_client_commercial_document_bundle') {
        return Promise.resolve({
          data: {
            document: {
              id: 'prop-1',
              kind: 'furnishings_authorization',
              state: 'executed',
            },
          },
          error: null,
        });
      }
      if (name === 'get_client_proposal_bundle') {
        return Promise.resolve({
          data: {
            proposal: { id: 'prop-1', valid_until: '2020-01-01T00:00:00.000Z' },
          },
          error: null,
        });
      }
      return Promise.resolve({ error: null });
    });
    serviceRpcMock.mockResolvedValue({
      data: {
        project_id: 'project-1',
        deposit_invoice_id: 'invoice-1',
        newly_executed: false,
      },
      error: null,
    });

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(200);
    expect(serviceRpcMock).toHaveBeenCalledWith(
      'execute_furnishings_authorization_with_trusted_ip',
      expect.objectContaining({ p_client_id: 'client-1' })
    );
    expect(invokeMock).toHaveBeenNthCalledWith(1, 'commercial-document-notify', {
      body: { documentId: 'prop-1', transition: 'furnishings_executed' },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'commercial-document-notify', {
      body: { documentId: 'prop-1', transition: 'deposit_ready' },
    });
    expect(await response.json()).toMatchObject({
      newlyExecuted: false,
      notificationDelivery: { state: 'delivered' },
    });
  });

  it('replays the idempotent client-sign notice when the committed retry is newly=false', async () => {
    userRpcMock.mockImplementation((name: string) => {
      if (name === 'get_client_commercial_document_bundle') {
        return Promise.resolve({
          data: {
            document: {
              id: 'prop-1',
              kind: 'design_services',
              state: 'client_signed',
            },
          },
          error: null,
        });
      }
      if (name === 'get_client_proposal_bundle') {
        return Promise.resolve({
          data: { proposal: { id: 'prop-1', valid_until: null } },
          error: null,
        });
      }
      return Promise.resolve({ error: null });
    });
    serviceRpcMock.mockResolvedValue({
      data: { commercial_state: 'client_signed', newly_client_signed: false },
      error: null,
    });

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(200);
    expect(invokeMock).toHaveBeenCalledWith('commercial-document-notify', {
      body: { documentId: 'prop-1', transition: 'client_signed' },
    });
    expect(await response.json()).toMatchObject({
      newlyClientSigned: false,
      notificationDelivery: { state: 'delivered' },
    });
  });

  it('rejects an expired first commercial signature before privileged execution', async () => {
    userRpcMock.mockImplementation((name: string) => {
      if (name === 'get_client_commercial_document_bundle') {
        return Promise.resolve({
          data: {
            document: {
              id: 'prop-1',
              kind: 'furnishings_authorization',
              state: 'sent',
            },
          },
          error: null,
        });
      }
      if (name === 'get_client_proposal_bundle') {
        return Promise.resolve({
          data: {
            proposal: { id: 'prop-1', valid_until: '2020-01-01T00:00:00.000Z' },
          },
          error: null,
        });
      }
      return Promise.resolve({ error: null });
    });

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(410);
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });
});
