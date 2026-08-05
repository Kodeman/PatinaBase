/**
 * @jest-environment node
 *
 * Contract tests for POST /api/commercial/[id]/paper-notify. The route must
 * authorize with the CALLER's own session BEFORE ever constructing a
 * service-role client: an explicit is_studio_comember RPC (run as the
 * caller) is the real authorization boundary — a bare proposal-row read is
 * not, because RLS returns that row to the document's own client too. The
 * service client exists ONLY to carry the actor:'service' policy pass and to
 * read paper evidence authoritatively — it must never be reachable for an
 * unauthorized, malformed, or evidence-unsupported request.
 */
import { NextRequest } from 'next/server';
import { createServerClient, createServiceClient } from '@patina/supabase/server';

import { POST } from '../route';

jest.mock('@patina/supabase/server', () => ({
  createServerClient: jest.fn(),
  createServiceClient: jest.fn(),
}));

const mockCreateServerClient = createServerClient as jest.Mock;
const mockCreateServiceClient = createServiceClient as jest.Mock;

function chainable(terminalResult: { data?: unknown; error?: unknown }) {
  const builder: any = {};
  builder.select = jest.fn(() => builder);
  builder.eq = jest.fn(() => builder);
  builder.maybeSingle = jest.fn(() => Promise.resolve(terminalResult));
  return builder;
}

describe('POST /api/commercial/[id]/paper-notify', () => {
  function makeRequest(
    body: Record<string, unknown> = { transition: 'executed', channel: 'paper' }
  ): NextRequest {
    return new NextRequest('http://localhost:3000/api/commercial/doc-1/paper-notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    } as unknown as RequestInit);
  }
  function makeParams(id = 'doc-1') {
    return { params: Promise.resolve({ id }) };
  }

  let getUserMock: jest.Mock;
  let comemberRpcMock: jest.Mock;
  let callerProposalsBuilder: ReturnType<typeof chainable>;
  let callerFromMock: jest.Mock;
  let signaturesBuilder: ReturnType<typeof chainable>;
  let termsBuilder: ReturnType<typeof chainable>;
  let serviceFromMock: jest.Mock;
  let invokeMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    getUserMock = jest.fn().mockResolvedValue({ data: { user: { id: 'designer-1' } }, error: null });
    comemberRpcMock = jest.fn().mockResolvedValue({ data: true, error: null });
    callerProposalsBuilder = chainable({ data: { id: 'doc-1', designer_id: 'designer-owner-1' }, error: null });
    callerFromMock = jest.fn((table: string) => {
      if (table === 'proposals') return callerProposalsBuilder;
      throw new Error(`unexpected caller-session table in test: ${table}`);
    });
    signaturesBuilder = chainable({ data: { metadata: { executedOnPaper: true } }, error: null });
    termsBuilder = chainable({
      data: { accepted_on_paper: true, acceptance_scan_document_id: null },
      error: null,
    });
    serviceFromMock = jest.fn((table: string) => {
      if (table === 'commercial_document_signatures') return signaturesBuilder;
      if (table === 'trade_scope_terms') return termsBuilder;
      throw new Error(`unexpected service-session table in test: ${table}`);
    });
    invokeMock = jest.fn().mockResolvedValue({
      data: { ok: true, results: { client: { suppressed: false, logId: 'log-1' } } },
      error: null,
    });

    mockCreateServerClient.mockResolvedValue({
      auth: { getUser: getUserMock },
      from: callerFromMock,
      rpc: comemberRpcMock,
    });
    mockCreateServiceClient.mockReturnValue({
      from: serviceFromMock,
      functions: { invoke: invokeMock },
    });
  });

  // ── authz fail-closed ───────────────────────────────────────────────────

  it('fails closed with 401 when there is no session, before any document read or service client', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(401);
    expect(callerFromMock).not.toHaveBeenCalled();
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });

  it('fails closed with 404 for a genuinely absent document', async () => {
    callerProposalsBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });

    const res = await POST(makeRequest(), makeParams('does-not-exist'));

    expect(res.status).toBe(404);
    expect(comemberRpcMock).not.toHaveBeenCalled();
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });

  it('fails closed with 404 when the caller is not a studio comember of the document\'s designer — covers both the document\'s own client and a foreign designer, indistinguishable on purpose', async () => {
    comemberRpcMock.mockResolvedValue({ data: false, error: null });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(404);
    expect(comemberRpcMock).toHaveBeenCalledWith('is_studio_comember', { p_owner: 'designer-owner-1' });
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });

  it('passes authorization for a genuine studio comember of the owning designer', async () => {
    const res = await POST(makeRequest(), makeParams());

    expect(comemberRpcMock).toHaveBeenCalledWith('is_studio_comember', { p_owner: 'designer-owner-1' });
    expect(res.status).toBe(200);
    expect(mockCreateServiceClient).toHaveBeenCalledTimes(1);
  });

  // ── transition allowlist ────────────────────────────────────────────────

  it('rejects an unknown transition (400) without ever reading the document or invoking the fn', async () => {
    const res = await POST(makeRequest({ transition: 'not_a_real_transition', channel: 'paper' }), makeParams());

    expect(res.status).toBe(400);
    expect(callerFromMock).not.toHaveBeenCalled();
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });

  it.each(['client_signed', 'budget_published', 'furnishings_sent', 'trade_scope_sent'])(
    'never fires %s from this route',
    async (transition) => {
      const res = await POST(makeRequest({ transition, channel: 'paper' }), makeParams());

      expect(res.status).toBe(400);
      expect(mockCreateServiceClient).not.toHaveBeenCalled();
    }
  );

  it.each([
    'executed',
    'furnishings_executed',
    'trade_scope_executed',
    'deposit_ready',
    'trade_draw_ready',
    'trade_scope_accepted',
  ])('allows %s through the route-level allowlist', async (transition) => {
    const res = await POST(makeRequest({ transition, channel: 'paper' }), makeParams());

    expect(res.status).toBe(200);
    expect(mockCreateServiceClient).toHaveBeenCalledTimes(1);
  });

  it('rejects a channel other than paper', async () => {
    const res = await POST(makeRequest({ transition: 'executed', channel: 'online' }), makeParams());

    expect(res.status).toBe(400);
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });

  // ── evidence-derived channel, not caller-asserted ───────────────────────

  it('rejects with 400 when the executed-family transition has no paper evidence on the client signature', async () => {
    signaturesBuilder.maybeSingle.mockResolvedValue({ data: { metadata: {} }, error: null });

    const res = await POST(makeRequest({ transition: 'furnishings_executed', channel: 'paper' }), makeParams());

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'not_recorded_on_paper' });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('rejects with 400 when a money transition traces back to a client signature that was not paper', async () => {
    signaturesBuilder.maybeSingle.mockResolvedValue({ data: { metadata: { executedOnPaper: false } }, error: null });

    const res = await POST(makeRequest({ transition: 'deposit_ready', channel: 'paper' }), makeParams());

    expect(res.status).toBe(400);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('rejects with 400 when trade_scope_accepted has no accepted_on_paper evidence on trade_scope_terms', async () => {
    termsBuilder.maybeSingle.mockResolvedValue({ data: { accepted_on_paper: false }, error: null });

    const res = await POST(makeRequest({ transition: 'trade_scope_accepted', channel: 'paper' }), makeParams());

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'not_recorded_on_paper' });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('derives paper-ness even when the caller sends no channel at all', async () => {
    const res = await POST(makeRequest({ transition: 'executed' }), makeParams());

    expect(res.status).toBe(200);
    expect(invokeMock).toHaveBeenCalledWith('commercial-document-notify', {
      body: { documentId: 'doc-1', transition: 'executed', channel: 'paper', hasScan: false },
    });
  });

  // ── service invoke payloads ─────────────────────────────────────────────

  it('invokes the fn only through the service client (never the caller session), so a studio-blocked transition still succeeds', async () => {
    const res = await POST(makeRequest({ transition: 'furnishings_executed', channel: 'paper' }), makeParams());

    expect(res.status).toBe(200);
    expect(mockCreateServiceClient).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('commercial-document-notify', {
      body: { documentId: 'doc-1', transition: 'furnishings_executed', channel: 'paper', hasScan: false },
    });
  });

  it('always sends channel:paper downstream once evidence confirms it', async () => {
    await POST(makeRequest({ transition: 'executed', channel: 'paper' }), makeParams());

    const [, options] = invokeMock.mock.calls[0];
    expect(options.body.channel).toBe('paper');
  });

  it('carries hasScan=true when the client signature metadata has a paperScanDocumentId', async () => {
    signaturesBuilder.maybeSingle.mockResolvedValue({
      data: { metadata: { executedOnPaper: true, paperScanDocumentId: 'scan-doc-1' } },
      error: null,
    });

    await POST(makeRequest({ transition: 'trade_scope_executed', channel: 'paper' }), makeParams());

    expect(invokeMock).toHaveBeenCalledWith('commercial-document-notify', {
      body: { documentId: 'doc-1', transition: 'trade_scope_executed', channel: 'paper', hasScan: true },
    });
  });

  it('reads evidence from trade_scope_terms (not commercial_document_signatures) for trade_scope_accepted, and carries its scan', async () => {
    termsBuilder.maybeSingle.mockResolvedValue({
      data: { accepted_on_paper: true, acceptance_scan_document_id: 'scan-doc-2' },
      error: null,
    });

    await POST(makeRequest({ transition: 'trade_scope_accepted', channel: 'paper' }), makeParams());

    expect(serviceFromMock).toHaveBeenCalledWith('trade_scope_terms');
    expect(serviceFromMock).not.toHaveBeenCalledWith('commercial_document_signatures');
    expect(invokeMock).toHaveBeenCalledWith('commercial-document-notify', {
      body: { documentId: 'doc-1', transition: 'trade_scope_accepted', channel: 'paper', hasScan: true },
    });
  });

  it('reads signature evidence for the money transitions (to verify paper-ness) but omits hasScan from the outgoing payload', async () => {
    await POST(makeRequest({ transition: 'deposit_ready', channel: 'paper' }), makeParams());

    expect(serviceFromMock).toHaveBeenCalledWith('commercial_document_signatures');
    expect(invokeMock).toHaveBeenCalledWith('commercial-document-notify', {
      body: { documentId: 'doc-1', transition: 'deposit_ready', channel: 'paper' },
    });
  });

  it('forwards eventId for trade_draw_ready', async () => {
    await POST(
      makeRequest({ transition: 'trade_draw_ready', channel: 'paper', eventId: 'draw-2' }),
      makeParams()
    );

    expect(invokeMock).toHaveBeenCalledWith('commercial-document-notify', {
      body: { documentId: 'doc-1', transition: 'trade_draw_ready', channel: 'paper', eventId: 'draw-2' },
    });
  });

  it('surfaces a fn-level failure as a 502 with the fn error, never a false success', async () => {
    invokeMock.mockResolvedValue({ data: { ok: false, error: 'transition_not_committed' }, error: null });

    const res = await POST(makeRequest({ transition: 'executed', channel: 'paper' }), makeParams());

    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: 'transition_not_committed' });
  });

  it('surfaces a transport-level invoke error as a 502', async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: 'edge unavailable' } });

    const res = await POST(makeRequest({ transition: 'executed', channel: 'paper' }), makeParams());

    expect(res.status).toBe(502);
  });
});
