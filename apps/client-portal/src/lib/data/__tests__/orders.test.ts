/**
 * @jest-environment node
 *
 * Unit tests for fetchClientOrders — the discriminated result contract that
 * replaced "return [] on any failure" (which rendered a down orders service
 * as "you have no orders"). Covers: no session, network failure, 401/403,
 * other non-OK statuses, malformed JSON, genuine empty success, and mapped
 * data — plus that the Cloudflare service-binding fetcher (when available)
 * is used instead of global fetch.
 *
 * Forced to the `node` test environment rather than the app-wide jsdom
 * default: `orders.ts` is a `server-only` module (never runs in a browser),
 * and jsdom's AbortSignal doesn't implement the static `.timeout()` method
 * that the fetch call below relies on — Node's real one does. `node` is
 * also just the more honest environment for code that only ever executes
 * server-side.
 */

import { getSession } from '@patina/supabase/server';

import { fetchClientOrders } from '../orders';
import { getServiceBindingFetcher } from '../service-binding';

jest.mock('@patina/supabase/server', () => ({
  getSession: jest.fn(),
}));

jest.mock('../service-binding', () => ({
  getServiceBindingFetcher: jest.fn(),
}));

const mockGetSession = getSession as jest.Mock;
const mockGetServiceBindingFetcher = getServiceBindingFetcher as jest.Mock;

describe('fetchClientOrders', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({ access_token: 'test-token' });
    mockGetServiceBindingFetcher.mockResolvedValue(undefined);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('returns unauthorized without calling fetch when there is no Supabase session', async () => {
    mockGetSession.mockResolvedValue(null);

    const result = await fetchClientOrders();

    expect(result).toEqual({ error: 'unauthorized' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns unauthorized when the session has no access token', async () => {
    mockGetSession.mockResolvedValue({ access_token: undefined });

    const result = await fetchClientOrders();

    expect(result).toEqual({ error: 'unauthorized' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns unreachable when the request throws (network/DNS failure)', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new TypeError('fetch failed'));

    const result = await fetchClientOrders();

    expect(result).toEqual({ error: 'unreachable' });
  });

  it('returns unauthorized on a 401 from the orders service', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ message: 'invalid token' }),
    });

    const result = await fetchClientOrders();

    expect(result).toEqual({ error: 'unauthorized' });
  });

  it('returns unauthorized on a 403 from the orders service', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ message: 'forbidden' }),
    });

    const result = await fetchClientOrders();

    expect(result).toEqual({ error: 'unauthorized' });
  });

  it('returns unreachable on a 5xx from the orders service (this was the silent-empty bug)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({ message: 'down for maintenance' }),
    });

    const result = await fetchClientOrders();

    expect(result).toEqual({ error: 'unreachable' });
  });

  it('returns unreachable when the response body is not valid JSON', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    });

    const result = await fetchClientOrders();

    expect(result).toEqual({ error: 'unreachable' });
  });

  it('returns an empty orders array for a genuine 200 with zero orders', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    });

    const result = await fetchClientOrders();

    expect(result).toEqual({ orders: [] });
  });

  it('normalizes snake_case backend rows into ClientOrder shape on success', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: 'order-1',
            order_number: 'PO-1001',
            status: 'PAID',
            total_cents: 125000,
            currency: 'USD',
            created_at: '2026-01-01T00:00:00Z',
            items: [{ id: 'i1' }, { id: 'i2' }],
          },
        ],
      }),
    });

    const result = await fetchClientOrders();

    expect(result.error).toBeUndefined();
    expect(result.orders).toEqual([
      {
        id: 'order-1',
        orderNumber: 'PO-1001',
        status: 'paid',
        totalCents: 125000,
        currency: 'USD',
        createdAt: '2026-01-01T00:00:00Z',
        itemCount: 2,
      },
    ]);
  });

  it('accepts a bare array payload in addition to the { data } envelope', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: 'order-2',
          orderNumber: 'PO-1002',
          status: 'shipped',
          totalCents: 5000,
          currency: 'USD',
          createdAt: '2026-02-01T00:00:00Z',
          itemCount: 1,
        },
      ],
    });

    const result = await fetchClientOrders();

    expect(result.orders).toHaveLength(1);
    expect(result.orders?.[0].id).toBe('order-2');
  });

  it('sends the bearer token to the orders-service v1 path (not the internal /api/orders route)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    });

    await fetchClientOrders();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toMatch(/\/api\/v1\/orders$/);
    expect(String(url)).not.toContain('/api/orders');
    expect(init).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
  });

  it('uses the Cloudflare service-binding fetcher instead of global fetch when one is available', async () => {
    const bindingFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    });
    mockGetServiceBindingFetcher.mockResolvedValue(bindingFetch);

    const result = await fetchClientOrders();

    expect(result).toEqual({ orders: [] });
    expect(bindingFetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockGetServiceBindingFetcher).toHaveBeenCalledWith('SVC_ORDERS');
  });

  it('surfaces unreachable when the binding fetch rejects — no silent second try via global fetch', async () => {
    // Production semantics: if the Worker handed us a binding, its failure
    // IS the orders service being unreachable. Falling back to a public
    // fetch from inside the Worker would mask a real outage.
    const bindingFetch = jest.fn().mockRejectedValue(new Error('binding: connection refused'));
    mockGetServiceBindingFetcher.mockResolvedValue(bindingFetch);

    const result = await fetchClientOrders();

    expect(result).toEqual({ error: 'unreachable' });
    expect(bindingFetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('surfaces unreachable when the binding fetch answers 503 (binding resolves, service down)', async () => {
    const bindingFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({ message: 'no healthy upstream' }),
    });
    mockGetServiceBindingFetcher.mockResolvedValue(bindingFetch);

    const result = await fetchClientOrders();

    expect(result).toEqual({ error: 'unreachable' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('falls back to global fetch against ORDERS_SERVICE_URL when no binding resolves (local dev)', async () => {
    // The local-dev contract behind the sync-discriminator fix: the context
    // accessor throws outside a Worker → getServiceBindingFetcher returns
    // undefined → the request must go through global fetch to the env URL,
    // NOT through any Miniflare stub.
    mockGetServiceBindingFetcher.mockResolvedValue(undefined);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    });

    const result = await fetchClientOrders();

    expect(result).toEqual({ orders: [] });
    // next/jest loads .env.local, which sets ORDERS_SERVICE_URL — mirror the
    // module's own resolution (env var, localhost fallback, trailing-slash
    // strip) so this asserts the URL actually used, not a hardcoded guess.
    const expectedBase = (process.env.ORDERS_SERVICE_URL || 'http://localhost:3015').replace(
      /\/$/,
      '',
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      `${expectedBase}/api/v1/orders`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
  });
});
