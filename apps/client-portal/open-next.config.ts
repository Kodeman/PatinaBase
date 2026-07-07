// OpenNext config for the Cloudflare Workers adapter.
//
// Minimal form: @opennextjs/cloudflare/dist/api/config.js defaults
// incrementalCache/tagCache/queue/cachePurge to "dummy" (no-op) when omitted.
// That's correct here even though this app calls `revalidatePath()` (in
// src/app/projects/[projectId]/actions.ts, after approval/message server
// actions): every page under /projects reads the Supabase session via
// `next/headers` cookies() (through @patina/supabase's createServerClient),
// which forces Next to render those routes dynamically on every request —
// there's no static/ISR cache entry for revalidatePath to invalidate, so the
// call is inert-but-harmless under the dummy cache. The app has no
// `export const revalidate` on a page and no on-demand ISR. If that changes,
// swap in an explicit `incrementalCache` (e.g. `r2IncrementalCache`) and
// provision the matching R2 bucket + `WORKER_SELF_REFERENCE` service binding
// in wrangler.jsonc — see
// node_modules/@opennextjs/cloudflare/templates/{open-next.config.ts,wrangler.jsonc}
// for the fuller template this was trimmed from.
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig();
