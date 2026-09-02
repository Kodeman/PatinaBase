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
 * `node` env (not jsdom) so `next/server` can be imported directly — the
 * pattern src/app/api/catalog/import/__tests__/route.test.ts uses.
 */
import { NextRequest } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import { GET as listVendors } from '../route';
import { GET as getVendor } from '../[id]/route';

jest.mock('@patina/supabase/server', () => ({ createServerClient: jest.fn() }));

const mockCreateServerClient = createServerClient as jest.Mock;

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
});
