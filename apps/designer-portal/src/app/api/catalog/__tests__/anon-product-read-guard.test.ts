/**
 * @jest-environment node
 *
 * US-37 SQ-1199 R1 + SQ-1218 (R189): the catalog GET routes that read every
 * products column are designer-private.
 *
 * These four handlers called `createServerClient()` (anon key + cookies) and
 * never asked for a user, and the designer-portal middleware passes `/api/*`
 * through, so a cookie-less request ran as `anon`. Before 00813 it read
 * `price_trade` (tradePrice) on every product; after 00813's anon column grant
 * the same `select('*')` / `product:products(*)` is a 42501, i.e. a 500.
 * SQ-1199 answered 401 without a user, but a `getUser()` guard admits every
 * signed-in account, and a homeowner's `.patina.cloud` session read
 * tradePrice through the same route (SQ-1213 F1). Each GET now goes through
 * `getAuthenticatedDesignerAdmin`, as /api/catalog/vendors does: 401 with no
 * session, 403 with a session that holds no designer- or admin-domain role,
 * and the designer's shape is unchanged. Every consumer is a signed-in
 * designer page (catalogApi in src/lib/api-client.ts via use-products /
 * use-collections).
 */
import { NextRequest } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import { createAdminClient } from '@patina/supabase/client';
import { GET as listProducts } from '../products/route';
import { GET as getProduct } from '../products/[id]/route';
import { GET as getCollection } from '../collections/[id]/route';
import { GET as listCollectionProducts } from '../collections/[id]/products/route';

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

// Each session client mock is used twice: by the guard's getUser and by the
// route's data read.
function clientWithUser(authResult: unknown, result: QueryResult = { data: null, error: null }) {
  const from = jest.fn(() => builder(result));
  return { auth: { getUser: jest.fn().mockResolvedValue(authResult) }, from };
}

const PRODUCT_ROW = {
  id: 'product-1',
  name: 'Catalog sofa',
  price_retail: 150000,
  price_trade: 70000,
  status: 'published',
};

const idParams = { params: Promise.resolve({ id: 'row-1' }) };

const ROUTES: Array<[string, () => Promise<Response>]> = [
  ['GET /api/catalog/products', () => listProducts(new NextRequest('http://localhost/api/catalog/products'))],
  ['GET /api/catalog/products/[id]', () => getProduct(new NextRequest('http://localhost/api/catalog/products/row-1'), idParams)],
  ['GET /api/catalog/collections/[id]', () => getCollection(new NextRequest('http://localhost/api/catalog/collections/row-1'), idParams)],
  [
    'GET /api/catalog/collections/[id]/products',
    () => listCollectionProducts(new NextRequest('http://localhost/api/catalog/collections/row-1/products'), idParams),
  ],
];

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateAdminClient.mockReturnValue(adminClientWithRoles(DESIGNER_ROLE));
});

describe('catalog product reads without a user', () => {
  it.each(ROUTES)('%s answers 401 and never queries', async (_label, call) => {
    const client = clientWithUser(NO_USER, { data: [PRODUCT_ROW], error: null, count: 1 });
    mockCreateServerClient.mockResolvedValue(client as never);

    const res = await call();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe('catalog product reads for a signed-in non-designer', () => {
  it.each(ROUTES)('%s answers 403, never queries and never returns a tradePrice', async (_label, call) => {
    mockCreateAdminClient.mockReturnValue(adminClientWithRoles(CLIENT_ROLE));
    const client = clientWithUser(SIGNED_IN, {
      data: [PRODUCT_ROW],
      error: null,
      count: 1,
    });
    mockCreateServerClient.mockResolvedValue(client as never);

    const res = await call();
    const text = await res.text();

    expect(res.status).toBe(403);
    expect(JSON.parse(text)).toEqual({ error: 'Forbidden: designer or admin role required' });
    expect(text).not.toMatch(/tradePrice|price_trade/);
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe('catalog product reads for a signed-in designer keep their shape', () => {
  it('GET /api/catalog/products lists products with tradePrice', async () => {
    const client = clientWithUser(SIGNED_IN, { data: [PRODUCT_ROW], error: null, count: 1 });
    mockCreateServerClient.mockResolvedValue(client as never);

    const res = await listProducts(new NextRequest('http://localhost/api/catalog/products'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(client.from).toHaveBeenCalledWith('products');
    expect(body.products[0]).toMatchObject({ id: 'product-1', tradePrice: 700, price: 1500 });
    expect(body.meta).toMatchObject({ total: 1, page: 1 });
  });

  it('GET /api/catalog/products/[id] returns the product with tradePrice', async () => {
    const client = clientWithUser(SIGNED_IN, { data: PRODUCT_ROW, error: null });
    mockCreateServerClient.mockResolvedValue(client as never);

    const res = await getProduct(new NextRequest('http://localhost/api/catalog/products/product-1'), idParams);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: 'product-1', tradePrice: 700 });
  });

  it('GET /api/catalog/collections/[id] returns the collection and its products', async () => {
    const client = clientWithUser(SIGNED_IN, {
      data: {
        id: 'collection-1',
        name: 'Living room',
        collection_products: [{ id: 'cp-1', product_id: 'product-1', position: 0, notes: null, product: PRODUCT_ROW }],
      },
      error: null,
    });
    mockCreateServerClient.mockResolvedValue(client as never);

    const res = await getCollection(new NextRequest('http://localhost/api/catalog/collections/collection-1'), idParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(client.from).toHaveBeenCalledWith('collections');
    expect(body).toMatchObject({ id: 'collection-1', name: 'Living room' });
  });

  it('GET /api/catalog/collections/[id]/products lists the embedded products', async () => {
    const client = clientWithUser(SIGNED_IN, {
      data: [{ id: 'cp-1', product_id: 'product-1', position: 0, notes: null, added_at: null, product: PRODUCT_ROW }],
      error: null,
      count: 1,
    });
    mockCreateServerClient.mockResolvedValue(client as never);

    const res = await listCollectionProducts(
      new NextRequest('http://localhost/api/catalog/collections/collection-1/products'),
      idParams
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(client.from).toHaveBeenCalledWith('collection_products');
    expect(body.products[0]).toMatchObject({ id: 'cp-1', productId: 'product-1', product: PRODUCT_ROW });
    expect(body.meta).toMatchObject({ total: 1 });
  });
});
