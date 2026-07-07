// OpenNext config for the Cloudflare Workers adapter.
//
// This is the minimal form: @opennextjs/cloudflare/dist/api/config.js defaults
// incrementalCache/tagCache/queue/cachePurge to "dummy" (no-op) when omitted,
// which is correct for this app — a static scaffold with no ISR/revalidate
// pages and no R2 bucket provisioned. Heavier portals that use
// `revalidate`/on-demand ISR should pass an explicit `incrementalCache`
// (e.g. `r2IncrementalCache`) and provision the matching R2 bucket +
// `WORKER_SELF_REFERENCE` service binding in wrangler.jsonc — see
// node_modules/@opennextjs/cloudflare/templates/{open-next.config.ts,wrangler.jsonc}
// for the fuller template this was trimmed from.
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig();
