import 'server-only';

/**
 * Resolve a Cloudflare Workers service-binding `fetch` for a given binding
 * name (e.g. "SVC_ORDERS", declared under `services` in wrangler.jsonc).
 *
 * A service binding lets one Worker call another directly over
 * Worker-to-Worker RPC instead of going out to the public internet and back
 * in through Cloudflare's edge — faster, and unaffected by DNS/TLS/public
 * availability of the target Worker's own routes. This mirrors the
 * `ServiceConfig.fetcher` seam in `@patina/api-routes`'
 * `proxyToBackend` (see packages/api-routes/src/middleware/proxy-to-backend.ts),
 * which accepts an optional `(input, init) => Promise<Response>` in place of
 * global `fetch` for exactly this reason; nothing in the monorepo has wired
 * a binding into that seam yet, so this is the first caller.
 *
 * Returns `undefined` whenever a binding isn't available: local `next dev`
 * (unless `initOpenNextCloudflareForDev` is configured), Jest/unit tests, or
 * any other non-Workers runtime. Callers must fall back to plain `fetch`
 * against the service's public URL in that case.
 */
export async function getServiceBindingFetcher(
  bindingName: string,
): Promise<typeof fetch | undefined> {
  try {
    // Subpath import (not the package root) deliberately: the root re-export
    // also pulls in `defineCloudflareConfig`'s build-only dependency chain,
    // which has no business loading at request time. `cloudflare-context.js`
    // itself has no top-level imports of its own.
    const { getCloudflareContext } = await import('@opennextjs/cloudflare/cloudflare-context');
    const { env } = await getCloudflareContext({ async: true });
    const binding = (env as Record<string, unknown>)[bindingName] as
      | { fetch?: typeof fetch }
      | undefined;
    if (binding && typeof binding.fetch === 'function') {
      return binding.fetch.bind(binding);
    }
  } catch {
    // Not running on Cloudflare Workers, or the binding isn't configured —
    // caller falls back to a plain fetch against the service's public URL.
  }
  return undefined;
}
