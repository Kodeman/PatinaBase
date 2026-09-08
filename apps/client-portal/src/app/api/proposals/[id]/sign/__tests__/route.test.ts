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
  let proposalStatus: 'sent' | 'viewed' | 'accepted';
  let validUntil: string | null;
  /**
   * Wave 2, P6. What the bundle says beyond the document itself — its parts
   * and the sentence `compose_agreement_consent` composed. Empty by default,
   * so every test written before the composer keeps its own answer.
   */
  let commercialExtras: Record<string, unknown>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ id: 'client-1' });
    proposalStatus = 'sent';
    validUntil = null;
    commercialExtras = {};

    // The default preflight resolves to a live commercial kind (never
    // 'legacy') — prod's get_client_commercial_document_bundle only returns
    // 'legacy' for rows the migration retires, and those get their own
    // dedicated tests below. For a commercial edition the RPC only ever
    // emits documentKind/commercialState (never kind/state) — see 00414's
    // non-legacy branch — so the mock uses the real field names, exercising
    // route.ts's actual fallback chain rather than its first alias.
    userRpcMock = jest.fn().mockImplementation((name: string) => {
      if (name === 'get_client_commercial_document_bundle') {
        return Promise.resolve({
          data: {
            document: { id: 'prop-1', documentKind: 'design_services', commercialState: 'sent' },
            ...commercialExtras,
          },
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
        commercial_state: 'client_signed',
        newly_client_signed: true,
        project_id: null,
      },
      error: null,
    });
    invokeMock = jest.fn().mockResolvedValue({ data: { ok: true }, error: null });

    mockCreateServerClient.mockResolvedValue({
      rpc: userRpcMock,
      functions: { invoke: invokeMock },
    });
    mockCreateServiceClient.mockReturnValue({
      rpc: serviceRpcMock,
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
        document: { id: 'prop-1', documentKind: 'future_contract', commercialState: 'sent' },
      },
      error: null,
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(404);
    expect(userRpcMock).toHaveBeenCalledTimes(1);
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });

  it('retires legacy signing: the retired-marker bundle responds 410 legacy_signing_retired', async () => {
    // Post-migration, get_client_commercial_document_bundle returns a minimal
    // retired marker for legacy rows instead of raising.
    userRpcMock.mockImplementation((name: string) => {
      if (name === 'get_client_commercial_document_bundle') {
        return Promise.resolve({
          data: {
            document: {
              id: 'prop-1',
              documentKind: 'legacy',
              kind: 'legacy',
              retired: true,
              title: 'Living Room Refresh',
              status: 'sent',
              // 00412's guard_commercial_proposal_authority only ever leaves
              // a legacy row's commercial_state NULL or (post-cutover)
              // 'superseded' — 'sent' is unreachable on the real column.
              commercialState: null,
              supersededAt: null,
              replacementProposalId: null,
              validUntil: null,
              sentAt: '2026-01-01T00:00:00Z',
            },
          },
          error: null,
        });
      }
      if (name === 'get_client_proposal_bundle') {
        return Promise.resolve({
          data: { proposal: { id: 'prop-1', status: 'sent', valid_until: null } },
          error: null,
        });
      }
      return Promise.resolve({ error: null });
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ error: 'legacy_signing_retired' });
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('retires legacy signing: pre-migration, the bundle RPC still raises for a legacy row and fails closed to 404', async () => {
    userRpcMock.mockImplementation((name: string) => {
      if (name === 'get_client_commercial_document_bundle') {
        return Promise.resolve({
          data: null,
          error: { message: 'legacy proposals are not supported by this RPC' },
        });
      }
      return Promise.resolve({ error: null });
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(404);
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });

  it('records design-services client consent without assuming project activation', async () => {
    userRpcMock.mockImplementation((name: string) => {
      if (name === 'get_client_commercial_document_bundle') {
        return Promise.resolve({
          data: {
            document: { id: 'prop-1', documentKind: 'design_services', commercialState: 'sent' },
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
      // Wave 2, P6. An un-composed agreement consents to nothing extra and
      // acknowledges nothing, so it takes the FOUR-argument call it has always
      // taken. PostgREST resolves an RPC by the argument names it is given, so
      // sending `p_consent` to a database the Wave 2 migration has not reached
      // yet fails to resolve the function at all — and that would break every
      // services signature, composed or not, in one deploy order.
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
              documentKind: 'furnishings_authorization',
              commercialState: 'sent',
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
            document: { id: 'prop-1', documentKind: 'design_services', commercialState: 'sent' },
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
              documentKind: 'furnishings_authorization',
              commercialState: 'sent',
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
              documentKind: 'furnishings_authorization',
              commercialState: 'executed',
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

  it('executes a trade scope through the trusted service boundary and fires both notices', async () => {
    userRpcMock.mockImplementation((name: string) => {
      if (name === 'get_client_commercial_document_bundle') {
        return Promise.resolve({
          data: {
            document: { id: 'prop-1', documentKind: 'trade_scope', commercialState: 'sent' },
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
        depositInvoiceId: 'invoice-trade-1',
        newlyExecuted: true,
      },
      error: null,
    });

    const response = await POST(makeRequest({ 'cf-connecting-ip': '203.0.113.7' }), makeParams());

    expect(response.status).toBe(200);
    expect(serviceRpcMock).toHaveBeenCalledWith('execute_trade_scope_with_trusted_ip', {
      p_proposal_id: 'prop-1',
      p_signed_name: 'Jamie Homeowner',
      p_client_id: 'client-1',
      p_signed_ip: '203.0.113.7',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(1, 'commercial-document-notify', {
      body: { documentId: 'prop-1', transition: 'trade_scope_executed' },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'commercial-document-notify', {
      body: { documentId: 'prop-1', transition: 'deposit_ready' },
    });
    expect(await response.json()).toMatchObject({
      commercialState: 'executed',
      projectId: 'project-1',
      depositInvoiceId: 'invoice-trade-1',
      newlyExecuted: true,
      notificationDelivery: {
        state: 'delivered',
        transitions: {
          tradeScopeExecuted: 'delivered',
          depositReady: 'delivered',
        },
      },
    });
  });

  it('replays an idempotent trade scope execution retry without repeating it', async () => {
    userRpcMock.mockImplementation((name: string) => {
      if (name === 'get_client_commercial_document_bundle') {
        return Promise.resolve({
          data: {
            document: { id: 'prop-1', documentKind: 'trade_scope', commercialState: 'executed' },
          },
          error: null,
        });
      }
      if (name === 'get_client_proposal_bundle') {
        return Promise.resolve({
          data: { proposal: { id: 'prop-1', valid_until: '2020-01-01T00:00:00.000Z' } },
          error: null,
        });
      }
      return Promise.resolve({ error: null });
    });
    serviceRpcMock.mockResolvedValue({
      data: {
        project_id: 'project-1',
        deposit_invoice_id: 'invoice-trade-1',
        newly_executed: false,
      },
      error: null,
    });

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(200);
    expect(serviceRpcMock).toHaveBeenCalledWith(
      'execute_trade_scope_with_trusted_ip',
      expect.objectContaining({ p_client_id: 'client-1' })
    );
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
              documentKind: 'design_services',
              commercialState: 'client_signed',
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
              documentKind: 'furnishings_authorization',
              commercialState: 'sent',
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

  /* ── Wave 2, P6: the consent and the attachments ─────────────────────── */

  const ATTACHMENT_PART = {
    id: 'p3',
    position: 3,
    kind: 'attachment',
    partKey: 'studio.lead_paint_notice',
    title: 'the lead-paint notice',
    payload: { body: 'A notice.', acknowledgeRequired: true },
  };

  const OPTIONAL_ATTACHMENT_PART = {
    id: 'p4',
    position: 4,
    kind: 'attachment',
    part_key: 'studio.care_guide',
    title: 'the care guide',
    payload: { body: 'A guide.' },
  };

  const COMPOSED_LINE =
    'I agree to these design-services terms and the flat design fee, and understand my signature alone does not authorize work until the studio countersigns.';

  it('records the sentence the DATABASE composed, never one the browser sent', async () => {
    commercialExtras = { consentSentence: COMPOSED_LINE, parts: [] };

    const response = await POST(
      makeRequest(
        {},
        {
          signedByName: 'Jamie Homeowner',
          // A browser trying to file a record of an agreement it did not sign.
          consentSentence: 'I agree to nothing at all.',
        },
      ),
      makeParams(),
    );

    expect(response.status).toBe(200);
    expect(serviceRpcMock).toHaveBeenCalledWith(
      'sign_design_services_agreement_with_trusted_ip',
      expect.objectContaining({
        p_consent: { consentSentence: COMPOSED_LINE, attachmentsAcknowledged: [] },
      }),
    );
  });

  it('refuses to sign while a required attachment is unacknowledged', async () => {
    commercialExtras = { parts: [ATTACHMENT_PART] };

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'not_signable' });
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });

  it('records the acknowledgment the client actually gave', async () => {
    commercialExtras = { consentSentence: COMPOSED_LINE, parts: [ATTACHMENT_PART] };

    const response = await POST(
      makeRequest(
        {},
        {
          signedByName: 'Jamie Homeowner',
          attachmentsAcknowledged: ['studio.lead_paint_notice'],
        },
      ),
      makeParams(),
    );

    expect(response.status).toBe(200);
    expect(serviceRpcMock).toHaveBeenCalledWith(
      'sign_design_services_agreement_with_trusted_ip',
      expect.objectContaining({
        p_consent: {
          consentSentence: COMPOSED_LINE,
          attachmentsAcknowledged: ['studio.lead_paint_notice'],
        },
      }),
    );
  });

  it('drops a key the agreement never carried, without comment', async () => {
    commercialExtras = { parts: [ATTACHMENT_PART, OPTIONAL_ATTACHMENT_PART] };

    const response = await POST(
      makeRequest(
        {},
        {
          signedByName: 'Jamie Homeowner',
          attachmentsAcknowledged: [
            'studio.lead_paint_notice',
            // Neither required nor, in the second case, a part at all.
            'studio.care_guide',
            'studio.not_on_this_agreement',
          ],
        },
      ),
      makeParams(),
    );

    expect(response.status).toBe(200);
    expect(serviceRpcMock).toHaveBeenCalledWith(
      'sign_design_services_agreement_with_trusted_ip',
      expect.objectContaining({
        p_consent: {
          consentSentence: null,
          attachmentsAcknowledged: ['studio.lead_paint_notice'],
        },
      }),
    );
  });

  it('asks nothing of an agreement whose attachments require no acknowledgment', async () => {
    commercialExtras = { parts: [OPTIONAL_ATTACHMENT_PART] };

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(200);
    expect(serviceRpcMock).toHaveBeenCalledWith(
      'sign_design_services_agreement_with_trusted_ip',
      expect.objectContaining({
        p_consent: { consentSentence: null, attachmentsAcknowledged: [] },
      }),
    );
  });

  /* DEPLOY ORDER. The fifth argument arrives with the Wave 2 migration, and a
     Worker can be live ahead of it. An agreement with nothing to record must
     therefore keep taking the four-argument call — otherwise a portal deployed
     first turns EVERY services signature, composed or not, into `sign_failed`.
     A composed one has something to record and takes the wider call, which is
     the deploy order the wave already commits to. */
  it('keeps the four-argument call for an agreement with nothing to record', async () => {
    commercialExtras = {};

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(200);
    expect(serviceRpcMock).toHaveBeenCalledWith(
      'sign_design_services_agreement_with_trusted_ip',
      expect.not.objectContaining({ p_consent: expect.anything() }),
    );
  });

  it('keeps the four-argument call for a composed agreement with no parts left visible', async () => {
    // `composed: false` is the database saying so itself, and an empty part
    // array carries nothing to consent to.
    commercialExtras = { composed: false, parts: [], consentSentence: null };

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(200);
    expect(serviceRpcMock).toHaveBeenCalledWith(
      'sign_design_services_agreement_with_trusted_ip',
      expect.not.objectContaining({ p_consent: expect.anything() }),
    );
  });

  it('widens the call the moment the bundle carries a part', async () => {
    commercialExtras = { parts: [OPTIONAL_ATTACHMENT_PART] };

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(200);
    expect(serviceRpcMock.mock.calls[0][1]).toHaveProperty('p_consent');
  });

  it('widens the call when the database says the bundle is composed', async () => {
    commercialExtras = { composed: true };

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(200);
    expect(serviceRpcMock.mock.calls[0][1]).toHaveProperty('p_consent');
  });

  it('never gates a furnishings authorization on an agreement’s attachments', async () => {
    userRpcMock.mockImplementation((name: string) => {
      if (name === 'get_client_commercial_document_bundle') {
        return Promise.resolve({
          data: {
            document: {
              id: 'prop-1',
              documentKind: 'furnishings_authorization',
              commercialState: 'sent',
            },
            parts: [ATTACHMENT_PART],
          },
          error: null,
        });
      }
      return Promise.resolve({
        data: { proposal: { id: 'prop-1', status: 'sent', valid_until: null } },
        error: null,
      });
    });
    serviceRpcMock.mockResolvedValue({
      data: { commercial_state: 'executed', newly_executed: true },
      error: null,
    });

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(200);
    expect(serviceRpcMock).toHaveBeenCalledWith(
      'execute_furnishings_authorization_with_trusted_ip',
      expect.not.objectContaining({ p_consent: expect.anything() }),
    );
  });
});

/* ── THE TURNKEY PRIME (Wave 3, P9 / P13) ────────────────────────────────────
   Two things are proved here, and the first one is the reason this block
   exists at all.

   WHICH RPC RAN, not that the request answered 200. Before this wave the
   route's routing was `furnishings → trade_scope → else`, and the allowlist
   above it is derived from `COMMERCIAL_DOCUMENT_KINDS` — so appending
   `design_build` to that array in `@patina/types` auto-admitted the kind into
   an `else` branch that would have signed it as a plain design-services
   agreement. The HTTP response of that mistake is byte-identical to the
   correct one. So every assertion below names the RPC.

   AND THAT THE OFFER NEVER TOUCHES THE SIGNATURE (R15). The deposit is a
   second, independently failable call made AFTER the signature RPC returned.
   Its every failure shape is `depositOffer: null` with the signature intact —
   asserted three ways: a refusal, a throw, and a payload too thin to build an
   offer from.
   ────────────────────────────────────────────────────────────────────────── */
describe('POST /api/proposals/[id]/sign — a design-build prime', () => {
  function makeRequest(body: Record<string, unknown> = { signedByName: 'Jamie Homeowner' }) {
    return new NextRequest('http://localhost:3002/api/proposals/prop-db/sign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    } as unknown as RequestInit);
  }
  const makeParams = () => ({ params: Promise.resolve({ id: 'prop-db' }) });

  const DRAW = {
    drawKey: 'deposit',
    label: 'Deposit at signing',
    amountCents: 841340,
    retainageCents: 0,
    netCents: 841340,
    invoiceId: 'inv-deposit',
    invoiceStatus: 'sent',
    payToken: 'a'.repeat(64),
  };

  let userRpcMock: jest.Mock;
  let serviceRpcMock: jest.Mock;
  let invokeMock: jest.Mock;
  /** What `issue_agreement_draw_invoice` answers. Overridden per test. */
  let drawAnswer: { data: unknown; error: { message: string } | null };
  /** The RPC names the service client was asked for, in order. */
  let serviceCalls: string[];
  let commercialState: string;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ id: 'client-1' });
    commercialState = 'sent';
    drawAnswer = { data: DRAW, error: null };
    serviceCalls = [];

    userRpcMock = jest.fn().mockImplementation((name: string) => {
      if (name === 'get_client_commercial_document_bundle') {
        return Promise.resolve({
          data: {
            document: { id: 'prop-db', documentKind: 'design_build', commercialState },
            composed: true,
            parts: [],
          },
          error: null,
        });
      }
      return Promise.resolve({
        data: { proposal: { id: 'prop-db', status: 'sent', valid_until: null } },
        error: null,
      });
    });
    serviceRpcMock = jest.fn().mockImplementation((name: string) => {
      serviceCalls.push(name);
      if (name === 'issue_agreement_draw_invoice') return Promise.resolve(drawAnswer);
      return Promise.resolve({
        data: { commercial_state: 'client_signed', newly_client_signed: true, project_id: null },
        error: null,
      });
    });
    invokeMock = jest.fn().mockResolvedValue({ data: { ok: true }, error: null });

    mockCreateServerClient.mockResolvedValue({
      rpc: userRpcMock,
      functions: { invoke: invokeMock },
    });
    mockCreateServiceClient.mockReturnValue({ rpc: serviceRpcMock });
  });

  it('signs through the services RPC, and through no other', async () => {
    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(200);
    expect(serviceCalls[0]).toBe('sign_design_services_agreement_with_trusted_ip');
    expect(serviceCalls).not.toContain('execute_furnishings_authorization_with_trusted_ip');
    expect(serviceCalls).not.toContain('execute_trade_scope_with_trusted_ip');
    expect(await response.json()).toMatchObject({
      ok: true,
      commercialState: 'client_signed',
      newlyClientSigned: true,
    });
  });

  it('mints the deposit only after the signature RPC has answered', async () => {
    const response = await POST(makeRequest(), makeParams());

    expect(serviceCalls).toEqual([
      'sign_design_services_agreement_with_trusted_ip',
      'issue_agreement_draw_invoice',
    ]);
    expect(serviceRpcMock).toHaveBeenCalledWith('issue_agreement_draw_invoice', {
      p_proposal_id: 'prop-db',
      p_draw_key: 'deposit',
    });
    expect(await response.json()).toMatchObject({
      depositOffer: {
        invoiceId: 'inv-deposit',
        amountCents: 841340,
        label: 'Deposit at signing',
        payPath: `/pay/${'a'.repeat(64)}`,
      },
    });
  });

  /* The deposit is minted by the SERVICE client, never the user session: the
     client's own signature is the authority for her own deposit, and the RPC
     skips the studio authorship check for exactly that caller (PART 10). */
  it('mints the deposit through the trusted service boundary', async () => {
    await POST(makeRequest(), makeParams());

    expect(userRpcMock).not.toHaveBeenCalledWith(
      'issue_agreement_draw_invoice',
      expect.anything(),
    );
  });

  it('keeps the signature when the deposit refuses', async () => {
    drawAnswer = { data: null, error: { message: 'draw not found or access denied' } };

    const response = await POST(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.commercialState).toBe('client_signed');
    expect(body.depositOffer).toBeNull();
    // The database's own sentence stays in the log (`W1-02`).
    expect(JSON.stringify(body)).not.toContain('access denied');
  });

  it('keeps the signature when the deposit call throws', async () => {
    serviceRpcMock.mockImplementation((name: string) => {
      serviceCalls.push(name);
      if (name === 'issue_agreement_draw_invoice') return Promise.reject(new Error('socket hang up'));
      return Promise.resolve({
        data: { commercial_state: 'client_signed', newly_client_signed: true },
        error: null,
      });
    });

    const response = await POST(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.depositOffer).toBeNull();
  });

  it('offers nothing it cannot build a whole offer from', async () => {
    // No pay link minted yet — `issue_agreement_draw_invoice` returns
    // `payToken: null` rather than raising, because a missing link is
    // recoverable and an aborted issuance is not (00574).
    drawAnswer = { data: { ...DRAW, payToken: null }, error: null };

    const response = await POST(makeRequest(), makeParams());

    expect((await response.json()).depositOffer).toBeNull();
  });

  it('offers nothing on an agreement with no deposit figure', async () => {
    drawAnswer = { data: { ...DRAW, netCents: 0, amountCents: 0 }, error: null };

    const response = await POST(makeRequest(), makeParams());

    expect((await response.json()).depositOffer).toBeNull();
  });

  it('sends the signature notice, and no deposit notice', async () => {
    await POST(makeRequest(), makeParams());

    expect(invokeMock).toHaveBeenCalledWith('commercial-document-notify', {
      body: { documentId: 'prop-db', transition: 'client_signed' },
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  /* A retry after the signature already landed re-answers the receipt; it must
     not be refused as `not_signable`, and it must not mint a second deposit
     over a live invoice (the RPC refuses that; the route simply asks). */
  it('re-answers a client-signed retry rather than refusing it', async () => {
    commercialState = 'client_signed';
    serviceRpcMock.mockImplementation((name: string) => {
      serviceCalls.push(name);
      if (name === 'issue_agreement_draw_invoice') return Promise.resolve(drawAnswer);
      return Promise.resolve({
        data: { commercial_state: 'client_signed', newly_client_signed: false },
        error: null,
      });
    });

    const response = await POST(makeRequest(), makeParams());

    expect(response.status).toBe(200);
    expect((await response.json()).newlyClientSigned).toBe(false);
  });

  /* Every other kind keeps the response it has always had: `depositOffer` is
     null and the draw RPC is never reached. */
  it('offers no deposit on a design-services agreement', async () => {
    userRpcMock.mockImplementation((name: string) =>
      name === 'get_client_commercial_document_bundle'
        ? Promise.resolve({
            data: {
              document: { id: 'prop-db', documentKind: 'design_services', commercialState: 'sent' },
            },
            error: null,
          })
        : Promise.resolve({
            data: { proposal: { id: 'prop-db', status: 'sent', valid_until: null } },
            error: null,
          }),
    );

    const response = await POST(makeRequest(), makeParams());

    expect((await response.json()).depositOffer).toBeNull();
    expect(serviceCalls).not.toContain('issue_agreement_draw_invoice');
  });
});
