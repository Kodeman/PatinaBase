/** @jest-environment node */
import { NextRequest } from 'next/server';
import {
  createServerClient,
  getUser,
} from '@patina/supabase/server';
import { POST } from '../route';

jest.mock('@patina/supabase/server', () => ({
  createServerClient: jest.fn(),
  getUser: jest.fn(),
}));

const mockCreateServerClient = createServerClient as jest.Mock;
const mockGetUser = getUser as jest.Mock;

describe('POST /api/proposals/[id]/notifications/replay', () => {
  const request = new NextRequest(
    'http://localhost:3002/api/proposals/proposal-1/notifications/replay',
    { method: 'POST' },
  );
  const context = { params: Promise.resolve({ id: 'proposal-1' }) };
  let rpc: jest.Mock;
  let invoke: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ id: 'client-1' });
    rpc = jest.fn();
    invoke = jest.fn().mockResolvedValue({
      data: { ok: true },
      error: null,
    });
    mockCreateServerClient.mockResolvedValue({
      rpc,
      functions: { invoke },
    });
  });

  it('authenticates before reading a commercial document', async () => {
    mockGetUser.mockResolvedValue(null);

    const response = await POST(request, context);

    expect(response.status).toBe(401);
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });

  it('replays only the client signature receipt after studio execution', async () => {
    rpc.mockResolvedValue({
      data: {
        document: {
          documentKind: 'design_services',
          commercialState: 'executed',
        },
      },
      error: null,
    });

    const response = await POST(request, context);

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      'get_client_commercial_document_bundle',
      { p_proposal_id: 'proposal-1' },
    );
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('commercial-document-notify', {
      body: {
        documentId: 'proposal-1',
        transition: 'client_signed',
      },
    });
    expect(await response.json()).toEqual({
      ok: true,
      notificationDelivery: {
        state: 'delivered',
        transitions: { client_signed: 'delivered' },
      },
    });
  });

  it('replays authorization and outstanding deposit notices without signature data', async () => {
    rpc.mockResolvedValue({
      data: {
        document: {
          documentKind: 'furnishings_authorization',
          commercialState: 'executed',
        },
        furnishings: {
          depositInvoiceId: 'invoice-1',
          depositRequiredCents: 100_000,
          depositPaidCents: 20_000,
        },
      },
      error: null,
    });
    invoke
      .mockResolvedValueOnce({ data: { ok: true }, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'edge unavailable' },
      });

    const response = await POST(request, context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(invoke).toHaveBeenNthCalledWith(1, 'commercial-document-notify', {
      body: {
        documentId: 'proposal-1',
        transition: 'furnishings_executed',
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'commercial-document-notify', {
      body: { documentId: 'proposal-1', transition: 'deposit_ready' },
    });
    expect(body.notificationDelivery).toEqual({
      state: 'pending_retry',
      transitions: {
        furnishings_executed: 'delivered',
        deposit_ready: 'pending_retry',
      },
    });
  });

  it('does not replay a deposit notice after the deposit is paid', async () => {
    rpc.mockResolvedValue({
      data: {
        document: {
          documentKind: 'furnishings_authorization',
          commercialState: 'executed',
        },
        furnishings: {
          depositInvoiceId: 'invoice-1',
          depositRequiredCents: 100_000,
          depositPaidCents: 100_000,
        },
      },
      error: null,
    });

    await POST(request, context);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('commercial-document-notify', {
      body: {
        documentId: 'proposal-1',
        transition: 'furnishings_executed',
      },
    });
  });

  it('never asserts a channel on the invoke body — a replay of a paper execution must render paper copy through the fn\'s own server-side evidence derivation, not a client-portal guess', async () => {
    rpc.mockResolvedValue({
      data: {
        document: {
          documentKind: 'design_services',
          commercialState: 'executed',
        },
      },
      error: null,
    });

    await POST(request, context);

    const [, options] = invoke.mock.calls[0];
    expect(options.body).not.toHaveProperty('channel');
    expect(options.body).not.toHaveProperty('hasScan');
    // commercial-document-notify/index.ts derives channel/hasScan itself from
    // the client's own commercial_document_signatures row (or
    // trade_scope_terms.accepted_on_paper for trade_scope_accepted) whenever
    // the caller omits `channel` — see its channel/hasScan derivation block
    // and lib.test.ts / core.test.ts for the paper-copy assertions this
    // relies on. This route intentionally never computes or asserts a
    // channel of its own.
  });

  it('rejects documents without a committed client-owned transition', async () => {
    rpc.mockResolvedValue({
      data: {
        document: {
          documentKind: 'design_services',
          commercialState: 'sent',
        },
      },
      error: null,
    });

    const response = await POST(request, context);

    expect(response.status).toBe(409);
    expect(invoke).not.toHaveBeenCalled();
  });
});
