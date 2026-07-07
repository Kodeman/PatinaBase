/**
 * @jest-environment node
 *
 * Unit tests for getServiceBindingFetcher — a server-only module (never
 * runs in a browser), so tested under `node` rather than the app-wide
 * jsdom default.
 *
 * `@opennextjs/cloudflare` is a pure-ESM package; Jest's default transform
 * (via next/jest) ignores everything under node_modules, so it can't parse
 * the package's `export` syntax if actually loaded. We never want a unit
 * test to require production jest config changes (transformIgnorePatterns
 * for this package would also need to be re-verified against the real
 * Workers build), so the module boundary is mocked directly instead of
 * exercising the real import — this is the standard way to unit-test a
 * thin wrapper around a library that can't run in this environment anyway
 * (the real success path only ever executes inside an actual Cloudflare
 * Worker or `wrangler dev`).
 */

import { getServiceBindingFetcher } from '../service-binding';

const mockGetCloudflareContext = jest.fn();

jest.mock('@opennextjs/cloudflare/cloudflare-context', () => ({
  getCloudflareContext: (...args: unknown[]) => mockGetCloudflareContext(...args),
}));

describe('getServiceBindingFetcher', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('returns undefined outside the Cloudflare Workers runtime (getCloudflareContext throws)', async () => {
    mockGetCloudflareContext.mockRejectedValue(
      new Error('getCloudflareContext called without initOpenNextCloudflareForDev'),
    );

    const fetcher = await getServiceBindingFetcher('SVC_ORDERS');

    expect(fetcher).toBeUndefined();
  });

  it('returns the binding fetch, bound to the binding, when the Cloudflare context is present', async () => {
    const boundFetch = jest.fn().mockResolvedValue('ok');
    const binding = { fetch: boundFetch };
    mockGetCloudflareContext.mockResolvedValue({ env: { SVC_ORDERS: binding }, cf: undefined, ctx: {} });

    const fetcher = await getServiceBindingFetcher('SVC_ORDERS');

    expect(typeof fetcher).toBe('function');
    await fetcher?.('https://example.com/orders');
    // Called through the returned, bound function — not just structurally
    // equal — so this fails if a future refactor drops the `.bind(binding)`
    // and breaks the binding's internal `this`.
    expect(boundFetch).toHaveBeenCalledWith('https://example.com/orders');
  });

  it('returns undefined when the named binding is missing from env', async () => {
    mockGetCloudflareContext.mockResolvedValue({ env: {}, cf: undefined, ctx: {} });

    const fetcher = await getServiceBindingFetcher('SVC_ORDERS');

    expect(fetcher).toBeUndefined();
  });

  it('returns undefined when the named binding has no fetch method', async () => {
    mockGetCloudflareContext.mockResolvedValue({ env: { SVC_ORDERS: {} }, cf: undefined, ctx: {} });

    const fetcher = await getServiceBindingFetcher('SVC_ORDERS');

    expect(fetcher).toBeUndefined();
  });
});
