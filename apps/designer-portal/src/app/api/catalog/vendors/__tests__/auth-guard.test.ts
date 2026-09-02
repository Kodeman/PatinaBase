/**
 * @jest-environment node
 *
 * FF-01a / FF-01b — the vendors catalogue routes were readable by anyone.
 *
 * Neither route called `supabase.auth.getUser()`, and the designer-portal
 * middleware passes `/api/*` through, so an unauthenticated
 * `curl https://app.patina.cloud/api/catalog/vendors` returned every column of
 * `vendors` — the 13-column trade file (trade_terms, notes, contact_info,
 * preferred_contact, orders_email, trade_account_email, trade_portal_url,
 * trade_account_established_at, default_payment_terms, nomination_status,
 * nominated_by, nominated_at, contact_profile_id) included.
 *
 * The guard is correct independent of migration 00555: without it, 00555's
 * column revoke turns the leak into a 500 rather than closing it.
 *
 * RL02B-01 (fix round, 2026-09-02) — AUTHENTICATED WAS NOT AUTHORIZED.
 * The first fix added `getUser()`, which admits every signed-in account on the
 * platform. Auth cookies are scoped to `.patina.cloud`, so round one's own
 * cohort — homeowners signed in on the iOS app and the client portal — carried
 * a session both routes accepted, and the detail route handed them the trade
 * file. Both routes now go through `getAuthenticatedDesignerAdmin`, the same
 * helper POST /api/clients/invite uses: 401 with no session, 403 with a session
 * that holds no designer- or admin-domain role.
 *
 * `node` env (not jsdom) so `next/server` can be imported directly — the
 * pattern src/app/api/catalog/import/__tests__/route.test.ts uses.
 */
import { NextRequest } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import { createAdminClient } from '@patina/supabase/client';
import { GET as listVendors } from '../route';
import { GET as getVendor } from '../[id]/route';

jest.mock('@patina/supabase/server', () => ({ createServerClient: jest.fn() }));
jest.mock('@patina/supabase/client', () => ({ createAdminClient: jest.fn() }));

const mockCreateServerClient = createServerClient as jest.Mock;
const mockCreateAdminClient = createAdminClient as jest.Mock;

/**
 * The service-role client `getAuthenticatedDesignerAdmin` uses for the role
 * lookup: `.from('user_roles').select(…).eq('user_id', …).in('roles.domain',
 * ['designer','admin'])`. `roles` is the rows that query resolves to — a
 * designer/admin caller gets one, a homeowner gets none.
 */
function adminClientWithRoles(roles: unknown[]) {
  const inFn = jest.fn().mockResolvedValue({ data: roles, error: null });
  const eq = jest.fn(() => ({ in: inFn }));
  const select = jest.fn(() => ({ eq }));
  return { from: jest.fn(() => ({ select })), __in: inFn, __select: select };
}

const DESIGNER_ROLE = [{ role_id: 'r-1', roles: { domain: 'designer' } }];
const NO_ROLE: unknown[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  // Default: the caller holds a designer role. Cases that care override it.
  mockCreateAdminClient.mockReturnValue(adminClientWithRoles(DESIGNER_ROLE));
});

const TRADE_COLUMNS = [
  'trade_terms',
  'notes',
  'contact_info',
  'preferred_contact',
  'orders_email',
  'trade_account_email',
  'trade_portal_url',
  'trade_account_established_at',
  'default_payment_terms',
  'nomination_status',
  'nominated_by',
  'nominated_at',
  'contact_profile_id',
];

const LIST_URL = 'https://app.patina.cloud/api/catalog/vendors';
const DETAIL_URL = 'https://app.patina.cloud/api/catalog/vendors/vendor-1';
const DETAIL_PARAMS = { params: Promise.resolve({ id: 'vendor-1' }) };

/** A client whose `getUser()` resolves to the given auth result. */
function clientWithUser(
  authResult: { data: { user: unknown }; error: unknown },
  from: jest.Mock = jest.fn(),
) {
  return {
    auth: { getUser: jest.fn().mockResolvedValue(authResult) },
    from,
  };
}

const NO_USER = { data: { user: null }, error: null };
const AUTH_ERROR = { data: { user: { id: 'user-1' } }, error: { message: 'jwt expired' } };
const SIGNED_IN = { data: { user: { id: 'user-1' } }, error: null };

describe('GET /api/catalog/vendors', () => {
  it('returns 401 and never queries vendors when there is no session', async () => {
    const from = jest.fn();
    mockCreateServerClient.mockResolvedValue(clientWithUser(NO_USER, from));

    const response = await listVendors(new NextRequest(LIST_URL));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(from).not.toHaveBeenCalled();
  });

  it('returns 401 when getUser reports an auth error', async () => {
    const from = jest.fn();
    mockCreateServerClient.mockResolvedValue(clientWithUser(AUTH_ERROR, from));

    const response = await listVendors(new NextRequest(LIST_URL));

    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it('returns rows for a signed-in caller, selecting named public-face columns only', async () => {
    const order = jest
      .fn()
      .mockResolvedValue({ data: [{ id: 'vendor-1', name: 'Acme' }], error: null });
    const select = jest.fn(() => ({ order }));
    const from = jest.fn(() => ({ select }));
    mockCreateServerClient.mockResolvedValue(clientWithUser(SIGNED_IN, from));

    const response = await listVendors(new NextRequest(LIST_URL));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ vendors: [{ id: 'vendor-1', name: 'Acme' }] });
    expect(from).toHaveBeenCalledWith('vendors');
    expect(order).toHaveBeenCalledWith('name', { ascending: true });

    const selectArg = String(select.mock.calls[0]?.[0]);
    expect(selectArg).not.toContain('*');
    for (const column of TRADE_COLUMNS) {
      expect(selectArg).not.toContain(column);
    }
    expect(selectArg).toContain('brand_story');
    expect(selectArg).toContain('made_in');
  });

  // RL02B-01. A homeowner signed in on the iOS app or the client portal carries
  // a `.patina.cloud` cookie this route used to accept. It must not.
  it('returns 403 and never queries vendors for a signed-in homeowner', async () => {
    const from = jest.fn();
    mockCreateServerClient.mockResolvedValue(clientWithUser(SIGNED_IN, from));
    mockCreateAdminClient.mockReturnValue(adminClientWithRoles(NO_ROLE));

    const response = await listVendors(new NextRequest(LIST_URL));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Forbidden: designer or admin role required',
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('resolves the role through user_roles JOIN roles, filtered to designer and admin', async () => {
    const order = jest.fn().mockResolvedValue({ data: [], error: null });
    const select = jest.fn(() => ({ order }));
    mockCreateServerClient.mockResolvedValue(
      clientWithUser(SIGNED_IN, jest.fn(() => ({ select }))),
    );
    const adminClient = adminClientWithRoles(DESIGNER_ROLE);
    mockCreateAdminClient.mockReturnValue(adminClient);

    await listVendors(new NextRequest(LIST_URL));

    expect(adminClient.from).toHaveBeenCalledWith('user_roles');
    expect(String(adminClient.__select.mock.calls[0]?.[0])).toContain('roles!inner(domain)');
    expect(adminClient.__in).toHaveBeenCalledWith('roles.domain', ['designer', 'admin']);
  });
});

describe('GET /api/catalog/vendors/[id]', () => {
  it('returns 401 and never queries vendors when there is no session', async () => {
    const from = jest.fn();
    mockCreateServerClient.mockResolvedValue(clientWithUser(NO_USER, from));

    const response = await getVendor(new NextRequest(DETAIL_URL), DETAIL_PARAMS);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(from).not.toHaveBeenCalled();
  });

  it('returns 401 when getUser reports an auth error', async () => {
    const from = jest.fn();
    mockCreateServerClient.mockResolvedValue(clientWithUser(AUTH_ERROR, from));

    const response = await getVendor(new NextRequest(DETAIL_URL), DETAIL_PARAMS);

    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it('serves the trade file to a signed-in caller, from named columns rather than *', async () => {
    const single = jest
      .fn()
      .mockResolvedValue({ data: { id: 'vendor-1', trade_terms: 'net 30' }, error: null });
    const eq = jest.fn(() => ({ single }));
    const select = jest.fn(() => ({ eq }));
    const from = jest.fn(() => ({ select }));
    mockCreateServerClient.mockResolvedValue(clientWithUser(SIGNED_IN, from));

    const response = await getVendor(new NextRequest(DETAIL_URL), DETAIL_PARAMS);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'vendor-1', trade_terms: 'net 30' });
    expect(from).toHaveBeenCalledWith('vendors');
    expect(eq).toHaveBeenCalledWith('id', 'vendor-1');

    const selectArg = String(select.mock.calls[0]?.[0]);
    expect(selectArg).not.toContain('*');
    // The detail route is the designer's trade view: the trade file stays,
    // behind the guard. Removing it would break the surface, not secure it.
    for (const column of TRADE_COLUMNS) {
      expect(selectArg).toContain(column);
    }
  });

  it('still returns 404 when the row does not exist', async () => {
    const single = jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
    const select = jest.fn(() => ({ eq: jest.fn(() => ({ single })) }));
    mockCreateServerClient.mockResolvedValue(
      clientWithUser(SIGNED_IN, jest.fn(() => ({ select }))),
    );

    const response = await getVendor(new NextRequest(DETAIL_URL), DETAIL_PARAMS);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Vendor not found' });
  });

  // RL02B-01, and this is the one that mattered: the detail route is where the
  // 13 trade columns live. A homeowner's `.patina.cloud` session used to read
  // `trade_terms`, `orders_email` and `notes` straight out of it.
  it('returns 403 and never queries vendors for a signed-in homeowner', async () => {
    const from = jest.fn();
    mockCreateServerClient.mockResolvedValue(clientWithUser(SIGNED_IN, from));
    mockCreateAdminClient.mockReturnValue(adminClientWithRoles(NO_ROLE));

    const response = await getVendor(new NextRequest(DETAIL_URL), DETAIL_PARAMS);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Forbidden: designer or admin role required',
    });
    expect(from).not.toHaveBeenCalled();

    // The 403 body is a role refusal and nothing else — no trade column may
    // ride out on it.
    const body = JSON.stringify(await getVendor(new NextRequest(DETAIL_URL), DETAIL_PARAMS)
      .then((r) => r.json()));
    for (const column of TRADE_COLUMNS) {
      expect(body).not.toContain(column);
    }
  });

  it('serves the trade file to an admin-domain caller too', async () => {
    const single = jest
      .fn()
      .mockResolvedValue({ data: { id: 'vendor-1', trade_terms: 'net 30' }, error: null });
    const select = jest.fn(() => ({ eq: jest.fn(() => ({ single })) }));
    mockCreateServerClient.mockResolvedValue(
      clientWithUser(SIGNED_IN, jest.fn(() => ({ select }))),
    );
    mockCreateAdminClient.mockReturnValue(
      adminClientWithRoles([{ role_id: 'r-2', roles: { domain: 'admin' } }]),
    );

    const response = await getVendor(new NextRequest(DETAIL_URL), DETAIL_PARAMS);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'vendor-1', trade_terms: 'net 30' });
  });
});
