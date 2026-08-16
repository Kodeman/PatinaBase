/**
 * @jest-environment node
 *
 * Tests for POST /api/clients/invite.
 *
 * Regression: `inviteUserByEmail` was called with no `redirectTo`, so GoTrue
 * fell back to its site_url default (the DESIGNER portal's origin). A
 * homeowner clicking the invite email link landed in the designer's
 * workspace instead of their own. Fix: pass an explicit `redirectTo` that
 * points at the CLIENT portal's auth callback.
 *
 * Uses the `node` test env (not jsdom) so `next/server`'s NextRequest can be
 * constructed directly (see apps/designer-portal/.../auth/qr/__tests__/generate.test.ts
 * for the same pattern).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server';

// ── Chainable Supabase query-builder stub ───────────────────────────────────
// Every `.select()/.eq()/.in()/.insert()/.update()` call returns the same
// builder so calls can be chained arbitrarily; `.single()`/`.maybeSingle()`
// resolve the canned terminal result, and the builder is itself thenable so
// a bare `await adminClient.from(table).insert(...)` (no further chaining)
// also resolves it.
function chainable(terminalResult: { data?: unknown; error?: unknown }) {
  const builder: any = {};
  for (const method of ['select', 'eq', 'neq', 'in', 'limit', 'insert', 'update', 'upsert']) {
    builder[method] = jest.fn(() => builder);
  }
  builder.maybeSingle = jest.fn(() => Promise.resolve(terminalResult));
  builder.single = jest.fn(() => Promise.resolve(terminalResult));
  builder.then = (resolve: (v: unknown) => unknown) => resolve(terminalResult);
  return builder;
}

const profilesBuilder = chainable({ data: null, error: null }); // no existing profile by email; caller profile lookup also null (falls back to email)
const rolesBuilder = chainable({ data: { id: 'role-client' }, error: null });
const userRolesBuilder = chainable({ data: { role_id: 'role-designer' }, error: null });
const organizationMembersBuilder = chainable({ data: { id: 'membership-1' }, error: null });
const designerClientsBuilder = chainable({ data: { id: 'designer-client-1' }, error: null });
const activityLogBuilder = chainable({ data: null, error: null });

const fromMock = jest.fn((table: string) => {
  switch (table) {
    case 'profiles':
      return profilesBuilder;
    case 'roles':
      return rolesBuilder;
    case 'user_roles':
      return userRolesBuilder;
    case 'designer_clients':
      return designerClientsBuilder;
    case 'organization_members':
      return organizationMembersBuilder;
    case 'client_activity_log':
      return activityLogBuilder;
    default:
      throw new Error(`Unexpected table in test: ${table}`);
  }
});

const inviteUserByEmailMock = jest.fn().mockResolvedValue({
  data: { user: { id: 'new-client-user-id' } },
  error: null,
});

const adminClientStub = {
  from: fromMock,
  auth: { admin: { inviteUserByEmail: inviteUserByEmailMock } },
};

jest.mock('@/lib/supabase-admin', () => {
  const actual = jest.requireActual('@/lib/supabase-admin');
  return {
    ...actual,
    // Lazy body (not `.mockResolvedValue(...)`): jest.mock factories are
    // hoisted above the `const adminClientStub = ...` below, so an eagerly
    // evaluated resolved value would read it before initialization. Wrapping
    // in a function defers the read until the mock is actually called
    // (inside a test, well after module init has finished).
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
  return new NextRequest('http://localhost:3000/api/clients/invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  } as any);
}

describe('POST /api/clients/invite', () => {
  beforeEach(() => {
    fromMock.mockClear();
    designerClientsBuilder.insert.mockClear();
    inviteUserByEmailMock.mockClear();
    inviteUserByEmailMock.mockResolvedValue({
      data: { user: { id: 'new-client-user-id' } },
      error: null,
    });
  });

  it('sends the invite with redirectTo pointed at the client portal callback, not the GoTrue site_url default', async () => {
    const res = await POST(makeRequest({
      studioId: 'studio-1',
      clientEmail: 'homeowner@example.com',
      clientName: 'Homeowner',
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ invited: true, alreadyExists: false });

    expect(inviteUserByEmailMock).toHaveBeenCalledTimes(1);
    const [email, options] = inviteUserByEmailMock.mock.calls[0];
    expect(email).toBe('homeowner@example.com');

    const expectedClientPortalUrl =
      process.env.NEXT_PUBLIC_CLIENT_PORTAL_URL ?? 'https://client.patina.cloud';
    expect(options.redirectTo).toBe(`${expectedClientPortalUrl}/auth/callback?type=invite`);
    // Never the designer portal's own origin, and never left unset (which
    // is what let GoTrue silently fall back to site_url in production).
    expect(options.redirectTo).not.toContain('app.patina.cloud');
    expect(typeof options.redirectTo).toBe('string');
    expect(options.redirectTo.length).toBeGreaterThan(0);
  });

  it('does not call inviteUserByEmail (and needs no redirectTo) when a profile already exists for the email', async () => {
    profilesBuilder.maybeSingle.mockResolvedValueOnce({
      data: { id: 'existing-profile-id', full_name: 'Existing Homeowner', display_name: null },
      error: null,
    });

    const res = await POST(makeRequest({ studioId: 'studio-1', clientEmail: 'existing@example.com' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ invited: false, alreadyExists: true, profileId: 'existing-profile-id' });
    expect(inviteUserByEmailMock).not.toHaveBeenCalled();
  });

  it('rejects a missing exact studio before sending an invite or writing a relationship', async () => {
    const res = await POST(makeRequest({ clientEmail: 'homeowner@example.com' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'studioId is required' });
    expect(inviteUserByEmailMock).not.toHaveBeenCalled();
    expect(designerClientsBuilder.insert).not.toHaveBeenCalled();
  });
});
