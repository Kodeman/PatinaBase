/**
 * @jest-environment node
 *
 * POST /api/clients/invite/resend — the plaintext-token leak (SQ-111 INFO-7 /
 * SQ-116). The client-invite edge function's resend leg already texts the
 * fresh capability (SQ-18); this route's job is to relay deliver/status, not
 * to hand the homeowner's own credential to the designer's browser. Mirrors
 * send-the-letter.test.ts's "calls client-invite with the phone kind and
 * reports what the text did" assertion: the response carries no
 * capabilityUrl and no 'auth/invite' anywhere in its body. Ownership scoping
 * and status/cooldown pass-through are covered by
 * resend/__tests__/route.test.ts; this file pins only the token-stripping
 * behavior the ticket is about.
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

const clientInvitationsBuilder = chainable({ data: { id: 'inv-1' }, error: null });

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

import { POST } from '../resend/route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/clients/invite/resend', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  } as any);
}

describe('POST /api/clients/invite/resend — capability token', () => {
  beforeEach(() => {
    fromMock.mockClear();
  });

  it('carries no capabilityUrl and no "auth/invite" anywhere in its body', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          invitationId: 'inv-2',
          token: 'fresh-plaintext-token',
          deliver: 'sms_sent',
        }),
    });

    const res = await POST(makeRequest({ invitationId: 'inv-1' }));

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload).toMatchObject({ invitationId: 'inv-2', deliver: 'sms_sent' });
    expect(payload).not.toHaveProperty('token');
    expect(payload).not.toHaveProperty('capabilityUrl');
    expect(JSON.stringify(payload)).not.toContain('auth/invite');
  });

  it('strips the token from an email letter\'s resend body too', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({ invitationId: 'inv-3', token: 'another-plaintext-token' }),
    });

    const res = await POST(makeRequest({ invitationId: 'inv-1' }));

    const payload = await res.json();
    expect(payload).toEqual({ invitationId: 'inv-3' });
    expect(JSON.stringify(payload)).not.toContain('auth/invite');
  });
});
