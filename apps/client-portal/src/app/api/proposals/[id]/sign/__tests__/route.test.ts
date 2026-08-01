/**
 * @jest-environment node
 *
 * Tests for POST /api/proposals/[id]/sign.
 *
 * Regression: proposal 2ff78824's `signed_ip` was NULL after a real browser
 * signature. Cause: client-portal's middleware.ts only sets `x-client-ip`
 * for PAGE routes under `/proposals` (`pathname.startsWith('/proposals')`,
 * which `/api/proposals/**` never matches), and `x-forwarded-for` is
 * typically absent on Cloudflare Workers (Cloudflare's own client-IP header
 * is `cf-connecting-ip`). The old header-chain (`x-client-ip` ??
 * `x-forwarded-for`) had no header that was ever actually present in
 * production, so `p_signed_ip` was always null.
 *
 * Fix: `resolveClientIp()` (lib/utils/client-ip.ts — see its own unit tests
 * for the header-priority cases) prefers `cf-connecting-ip`, then the first
 * hop of `x-forwarded-for`, then the legacy `x-client-ip` as a last-resort
 * fallback. This file covers the route's end-to-end wiring: the resolved IP
 * actually reaches `sign_proposal`'s `p_signed_ip` argument.
 *
 * Uses the `node` test env (not jsdom) so `next/server`'s NextRequest can be
 * constructed directly.
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

describe('POST /api/proposals/[id]/sign', () => {
  function makeRequest(headers: Record<string, string> = {}): NextRequest {
    return new NextRequest('http://localhost:3002/api/proposals/prop-1/sign', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ signedByName: 'Jamie Homeowner' }),
    } as unknown as RequestInit);
  }

  function makeParams(id = 'prop-1') {
    return { params: Promise.resolve({ id }) };
  }

  let rpcMock: jest.Mock;
  let fromMock: jest.Mock;
  let invokeMock: jest.Mock;

  beforeEach(() => {
    mockGetUser.mockResolvedValue({ id: 'client-1' });

    rpcMock = jest.fn().mockImplementation((name: string) => {
      if (name === 'get_client_proposal_bundle') {
        return Promise.resolve({
          data: {
            proposal: {
              id: 'prop-1',
              status: 'sent',
              designer_id: 'designer-1',
              valid_until: null,
            },
          },
          error: null,
        });
      }
      return Promise.resolve({ error: null });
    });
    invokeMock = jest.fn().mockResolvedValue({ data: null, error: null });
    fromMock = jest.fn();

    mockCreateServerClient.mockResolvedValue({
      from: fromMock,
      rpc: rpcMock,
      functions: { invoke: invokeMock },
    });
  });

  it('passes cf-connecting-ip through to sign_proposal as p_signed_ip', async () => {
    const res = await POST(makeRequest({ 'cf-connecting-ip': '203.0.113.7' }), makeParams());

    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith(
      'sign_proposal',
      expect.objectContaining({ p_signed_ip: '203.0.113.7' }),
    );
  });

  it('uses the client-safe proposal bundle for the friendly signability preflight', async () => {
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenNthCalledWith(1, 'get_client_proposal_bundle', {
      p_proposal_id: 'prop-1',
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('falls back to x-forwarded-for when cf-connecting-ip is absent (e.g. local dev behind a reverse proxy)', async () => {
    const res = await POST(
      makeRequest({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' }),
      makeParams(),
    );

    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith(
      'sign_proposal',
      expect.objectContaining({ p_signed_ip: '198.51.100.1' }),
    );
  });

  it('sends null p_signed_ip when no IP header is present — documents the pre-fix production symptom, distinct from silently swallowing an available IP', async () => {
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith(
      'sign_proposal',
      expect.objectContaining({ p_signed_ip: null }),
    );
  });
});
