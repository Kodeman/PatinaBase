// OpenNext config for the Cloudflare Workers adapter.
//
// Minimal form: @opennextjs/cloudflare/dist/api/config.js defaults
// incrementalCache/tagCache/queue/cachePurge to "dummy" (no-op) when omitted.
// That's correct here, and more clearly so than for client-portal: admin
// has zero `revalidatePath()`/`revalidateTag()` calls anywhere in
// src/app (grepped) — the one `export const revalidate = 0` in
// src/app/api/version/route.ts *disables* caching, it doesn't request ISR.
// Every protected page is gated by src/middleware.ts (service-role admin
// role check against Supabase on every request) and every dashboard route
// reads live Supabase data via @patina/supabase's createServerClient
// (cookies() from next/headers), which forces dynamic rendering — there's
// no static/ISR cache entry for the dummy cache to ever need to serve or
// invalidate. If that changes (e.g. a public/marketing-style page gets
// `export const revalidate = N`), swap in an explicit `incrementalCache`
// (e.g. `r2IncrementalCache`) and provision the matching R2 bucket +
// `WORKER_SELF_REFERENCE` service binding in wrangler.jsonc — see
// node_modules/@opennextjs/cloudflare/templates/{open-next.config.ts,wrangler.jsonc}
// for the fuller template this was trimmed from.
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig();
