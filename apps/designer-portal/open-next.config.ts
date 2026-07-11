// OpenNext config for the Cloudflare Workers adapter.
//
// Minimal form: @opennextjs/cloudflare/dist/api/config.js defaults
// incrementalCache/tagCache/queue/cachePurge to "dummy" (no-op) when omitted.
// That's correct here too: designer-portal has no on-demand ISR and no page
// declares `export const revalidate` except `src/app/api/version/route.ts`,
// which already sets `revalidate = 0` (i.e. "never cache this route") — the
// dummy incremental cache is a no-op for that value, not a behavior change.
// Every page under `/portal` (and the rest of the authenticated app) reads
// the Supabase session via `next/headers` cookies() through
// `@patina/supabase`'s createServerClient/createMiddlewareClient, which
// forces Next to render those routes dynamically on every request — there's
// no static/ISR cache entry to invalidate. The one call site that looks like
// cache invalidation, `catalogApi.revalidateProduct()` in
// `src/components/products/validation-issues-panel.tsx`, is an app-level API
// call to the catalog service, not Next's `revalidatePath`/`revalidateTag` —
// unrelated to this config. If real ISR is introduced later, swap in an
// explicit `incrementalCache` (e.g. `r2IncrementalCache`) and provision the
// matching R2 bucket + `WORKER_SELF_REFERENCE` service binding in
// wrangler.jsonc — see
// node_modules/@opennextjs/cloudflare/templates/{open-next.config.ts,wrangler.jsonc}
// for the fuller template this was trimmed from.
import { defineCloudflareConfig, type OpenNextConfig } from '@opennextjs/cloudflare';

// Explicit annotation (not `satisfies`) so the default export's type is the
// named, importable `OpenNextConfig` — spreading + `satisfies` leaves an
// inferred literal type that references non-portable pnpm-internal paths (TS2742).
const config: OpenNextConfig = {
  ...defineCloudflareConfig(),
  // next build, then dedupe the byte-identical API-route client-reference
  // manifests in .next/standalone before OpenNext copies + bundles them.
  // See scripts/dedupe-client-reference-manifests.mjs (works around
  // vercel/next.js#88316).
  buildCommand: 'pnpm build && node ../../scripts/dedupe-client-reference-manifests.mjs',
};

export default config;
