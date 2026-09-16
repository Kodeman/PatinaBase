/**
 * @jest-environment node
 *
 * Tests for POST /api/clients/invite/resend (R10).
 *
 * The edge function trusts the service role unconditionally, so THIS route is
 * the only place ownership is proven before a resend is forwarded — these
 * tests pin that the ownership filter is `designer_id = callerUser.id` (not
 * merely `id = invitationId`), and that the edge function's status and JSON
 * body come back to the caller unchanged.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server';

function chainable(terminalResult: { data?: unknown; error?: unknown }) {
  const builder: any = {};
  for (const method of ['select', 'eq', 'in', 'insert', 'update', 'upsert']) {
    builder[method] = jest.fn(() => builder);
  }
  builder.maybeSingle = jest.fn(() => Promise.resolve(terminalResult));
  builder.single = jest.fn(() => Promise.resolve(terminalResult));
  builder.then = (resolve: (v: unknown) => unknown) => resolve(terminalResult);
  return builder;
}

let clientInvitationsBuilder = chainable({ data: { id: 'inv-1' }, error: null });

const fromMock = jest.fn((table: string) => {
  if (table === 'client_invitations') return clientInvitationsBuilder;
  throw new Error(`Unexpected table in test: ${table}`);
});

const adminClientStub = { from: fromMock };

jest.mock('@/lib/supabase-admin', () => {
  const actual = jest.requireActual('@/lib/supabase-admin');
  return {
    ...actual,
    getAuthenticatedDesignerAdmin: jest.fn(() =>
      Promise.resolve({
        user: { id: 'designer-1', email: 'designer@example.com' },
        adminClient: adminClientStub,
      }),
    ),
  };
});

import { POST } from '../route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/clients/invite/resend', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  } as any);
}

describe('POST /api/clients/invite/resend', () => {
  beforeEach(() => {
    fromMock.mockClear();
    clientInvitationsBuilder = chainable({ data: { id: 'inv-1' }, error: null });
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ invitationId: 'inv-2', token: 'tok' }),
    });
  });

  it('requires invitationId', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('scopes the ownership check to designer_id = callerUser.id, not just id', async () => {
    await POST(makeRequest({ invitationId: 'inv-1' }));

    expect(clientInvitationsBuilder.eq).toHaveBeenCalledWith('id', 'inv-1');
    expect(clientInvitationsBuilder.eq).toHaveBeenCalledWith('designer_id', 'designer-1');
  });

  it('refuses to forward when the caller does not own the letter', async () => {
    clientInvitationsBuilder = chainable({ data: null, error: null });

    const res = await POST(makeRequest({ invitationId: 'someone-elses-letter' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Letter not found');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('500s when the ownership lookup errors, rather than treating it as not-owned', async () => {
    clientInvitationsBuilder = chainable({ data: null, error: { message: 'connection reset' } });

    const res = await POST(makeRequest({ invitationId: 'inv-1' }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('connection reset');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('passes the edge function\'s success status and body through unchanged', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ invitationId: 'inv-2', token: 'fresh-token' }),
    });

    const res = await POST(makeRequest({ invitationId: 'inv-1' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ invitationId: 'inv-2', token: 'fresh-token' });
  });

  it('passes a 429 cooldown status and body through unchanged (R10)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 429,
      text: async () => JSON.stringify({ error: 'too_soon', retryAfterMs: 1200000 }),
    });

    const res = await POST(makeRequest({ invitationId: 'inv-1' }));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual({ error: 'too_soon', retryAfterMs: 1200000 });
  });

  it('passes a 409 nothing_to_resend status and body through unchanged', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 409,
      text: async () => JSON.stringify({ error: 'nothing_to_resend' }),
    });

    const res = await POST(makeRequest({ invitationId: 'inv-1' }));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ error: 'nothing_to_resend' });
  });
});
