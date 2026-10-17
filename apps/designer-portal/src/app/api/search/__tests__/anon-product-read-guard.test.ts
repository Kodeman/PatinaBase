/**
 * @jest-environment node
 *
 * US-37 SQ-1199 R1 + SQ-1218 (R189): the product search GET routes that read
 * every products column are designer-private.
 *
 * Both handlers called `createServerClient()` (anon key + cookies) and never
 * asked for a user, and the designer-portal middleware passes `/api/*`
 * through, so a cookie-less request ran as `anon`. Before 00813 the search
 * route returned `price_trade` (tradePrice) for every hit; after 00813's anon
 * column grant the same `select('*')` is a 42501, i.e. a 500. SQ-1199
 * answered 401 without a user, but a `getUser()` guard admits every signed-in
 * account, so a homeowner's session read tradePrice (SQ-1213 F1). Each GET
 * now goes through `getAuthenticatedDesignerAdmin`: 401 with no session, 403
 * with a session that holds no designer- or admin-domain role, and the
 * designer's shape is unchanged. Every consumer is a signed-in designer page
 * (searchApi in src/lib/api-client.ts via use-search / use-products). facets
 * (category, brand) and autocomplete (name) read no trade column and stay
 * public.
 */
import { NextRequest } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import { createAdminClient } from '@patina/supabase/client';
import { GET as searchProducts } from '../search/route';
import { GET as similarProducts } from '../search/similar/route';

jest.mock('@patina/supabase/server', () => ({ createServerClient: jest.fn() }));
jest.mock('@patina/supabase/client', () => ({ createAdminClient: jest.fn() }));

const mockCreateServerClient = createServerClient as jest.MockedFunction<typeof createServerClient>;
const mockCreateAdminClient = createAdminClient as jest.Mock;

type QueryResult = { data: unknown; error: unknown; count?: number | null };
type RoleRow = { role_id: string; roles: { domain: string } };

// A PostgREST builder stand-in: every filter returns the builder, awaiting it
// (or .single()/.maybeSingle()) resolves to the result.
function builder(result: QueryResult): unknown {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject);
        }
        if (prop === 'single' || prop === 'maybeSingle') {
          return () => Promise.resolve(result);
        }
        return () => proxy;
      },
    }
  );
  return proxy;
}

// The service-role role lookup getAuthenticatedDesignerAdmin runs:
// user_roles → roles.domain IN (designer, admin). The .in() filter is applied.
function adminClientWithRoles(roles: RoleRow[]) {
  const inFn = jest.fn((_column: string, domains: string[]) =>
    Promise.resolve({ data: roles.filter((row) => domains.includes(row.roles.domain)), error: null })
  );
  const eq = jest.fn(() => ({ in: inFn }));
  const select = jest.fn(() => ({ eq }));
  return { from: jest.fn(() => ({ select })) };
}

const NO_USER = { data: { user: null }, error: null };
const SIGNED_IN = { data: { user: { id: 'user-1' } }, error: null };
const DESIGNER_ROLE: RoleRow[] = [{ role_id: 'r-1', roles: { domain: 'designer' } }];
// A homeowner signed in on the client portal or iOS app.
const CLIENT_ROLE: RoleRow[] = [{ role_id: 'r-3', roles: { domain: 'client' } }];

const PRODUCT_ROW = {
  id: 'product-1',
  name: 'Catalog sofa',
  price_retail: 150000,
  price_trade: 70000,
  status: 'published',
};

function clientWithUser(authResult: unknown, result: QueryResult = { data: null, error: null }) {
  return {
    auth: { getUser: jest.fn().mockResolvedValue(authResult) },
    from: jest.fn(() => builder(result)),
    rpc: jest.fn().mockResolvedValue({ data: [{ id: 'product-1', similarity: 0.9 }], error: null }),
  };
}

const ROUTES: Array<[string, () => Promise<Response>]> = [
  ['GET /api/search/search', () => searchProducts(new NextRequest('http://localhost/api/search/search?q=sofa'))],
  [
    'GET /api/search/search/similar',
    () => similarProducts(new NextRequest('http://localhost/api/search/search/similar?productId=product-0')),
  ],
];

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateAdminClient.mockReturnValue(adminClientWithRoles(DESIGNER_ROLE));
});

describe('product search reads without a user', () => {
  it.each(ROUTES)('%s answers 401 and never queries', async (_label, call) => {
    const client = clientWithUser(NO_USER, { data: [PRODUCT_ROW], error: null, count: 1 });
    mockCreateServerClient.mockResolvedValue(client as never);

    const res = await call();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });
});

describe('product search reads for a signed-in non-designer', () => {
  it.each(ROUTES)('%s answers 403, never queries and never returns a tradePrice', async (_label, call) => {
    mockCreateAdminClient.mockReturnValue(adminClientWithRoles(CLIENT_ROLE));
    const client = clientWithUser(SIGNED_IN, { data: [PRODUCT_ROW], error: null, count: 1 });
    mockCreateServerClient.mockResolvedValue(client as never);

    const res = await call();
    const text = await res.text();

    expect(res.status).toBe(403);
    expect(JSON.parse(text)).toEqual({ error: 'Forbidden: designer or admin role required' });
    expect(text).not.toMatch(/tradePrice|price_trade/);
    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });
});

describe('product search reads for a signed-in designer keep their shape', () => {
  it('GET /api/search/search returns results with tradePrice', async () => {
    const client = clientWithUser(SIGNED_IN, { data: [PRODUCT_ROW], error: null, count: 1 });
    mockCreateServerClient.mockResolvedValue(client as never);

    const res = await searchProducts(new NextRequest('http://localhost/api/search/search?q=sofa'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(client.from).toHaveBeenCalledWith('products');
    expect(body.data.results[0]).toMatchObject({ id: 'product-1', tradePrice: 700 });
    expect(body.data).toMatchObject({ total: 1, limit: 20 });
  });

  it('GET /api/search/search/similar returns the similar products', async () => {
    const client = clientWithUser(SIGNED_IN, { data: [PRODUCT_ROW], error: null });
    mockCreateServerClient.mockResolvedValue(client as never);

    const res = await similarProducts(
      new NextRequest('http://localhost/api/search/search/similar?productId=product-0')
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(client.rpc).toHaveBeenCalledWith('find_products_similar_to', { product_id: 'product-0', match_count: 20 });
    expect(body.data.products[0]).toMatchObject({ id: 'product-1', name: 'Catalog sofa', price: 1500 });
  });
});
