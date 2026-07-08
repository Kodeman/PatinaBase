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
 * Runtime discrimination is deliberately the SYNCHRONOUS
 * `getCloudflareContext()` — NOT `{ async: true }`:
 *
 *  - In a deployed OpenNext Worker, the worker entrypoint stamps the
 *    Cloudflare context onto `globalThis` (Symbol.for('__cloudflare-context__'))
 *    before any app code runs, so the sync accessor succeeds and we return
 *    the binding's bound `.fetch`.
 *  - Everywhere else (local `next dev`, `next build`, Jest) the sync
 *    accessor throws immediately, and we return `undefined` so callers fall
 *    back to plain `fetch` against the service's public/env URL.
 *
 * The async accessor must not be used here: on Node.js-runtime routes it
 * doesn't throw outside Workers — it falls through to wrangler's
 * `getPlatformProxy()`, which boots a Miniflare instance (~hundreds of ms,
 * plus `.wrangler/state` writes) and resolves the binding to a local STUB
 * whose `.fetch()` answers 503 whenever the target worker isn't also
 * running locally. Because the stub is truthy, `fetcher ?? fetch` would
 * pick it over global fetch, making a healthy local orders service on
 * :3015 render as "unreachable" under `pnpm dev:client`.
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
    // Sync mode — the real-Worker discriminator (see doc comment above).
    const { env } = getCloudflareContext();
    const binding = (env as Record<string, unknown>)[bindingName] as
      | { fetch?: typeof fetch }
      | undefined;
    if (binding && typeof binding.fetch === 'function') {
      return binding.fetch.bind(binding);
    }
  } catch {
    // Not inside a deployed Worker (sync accessor threw) — caller falls
    // back to a plain fetch against the service's public URL.
  }
  return undefined;
}
