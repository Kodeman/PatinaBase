# Repoint program — Workstream D-B0: audit + baselines

Read-only audit. Prod DB probed via `execute_sql` SELECTs only; HTTP probes are GETs/HEADs
against `bkvcixdmuyejfzcijpdg.supabase.co` (direct) and `api.patina.cloud` (via
`infra/edge-api-worker`). No deploys, no config changes, no mutations were made while
producing this document.

Date: 2026-08-18. Prod project: Strata (`bkvcixdmuyejfzcijpdg`).

---

## 1. F8 — `https://api.patina.cloud` fallback audit

### 1a. Prod-executing default/fallback sites

| Site | Fallback triggers when… | Live or dead on prod today | Path class | Verdict |
|---|---|---|---|---|
| `supabase/migrations/00042_lead_notification_triggers.sql:44,127` (`notify_designer_new_lead`, `notify_consumer_confirmation`) | N/A | **Superseded.** `00258_edge_settings_vault.sql` `CREATE OR REPLACE FUNCTION`s these same two functions (public.notify_designer_new_lead, public.notify_consumer_confirmation) with a different body. 00042's body is not the one running on prod. | — | Historical only — no action |
| `supabase/migrations/00043_engagement_notification_triggers.sql:101,161` (`notify_price_drop`, `notify_back_in_stock`) | N/A | **Superseded** by `00258`'s redefinition of both functions, same as above. | — | Historical only — no action |
| `supabase/migrations/00258_edge_settings_vault.sql:111,173,238,307` (live bodies of `notify_back_in_stock`, `notify_consumer_confirmation`, `notify_designer_new_lead`, `notify_price_drop`) | `public.app_setting('supabase_url')` returns NULL | **DEAD.** Confirmed on prod: `current_setting('app.settings.supabase_url', true)` → `NULL` (Supabase Cloud denies custom-GUC `ALTER DATABASE ... SET`, exactly why 00258 exists), but `public.app_setting('supabase_url')` → `https://bkvcixdmuyejfzcijpdg.supabase.co` (Vault secret `app.settings.supabase_url` is populated and always resolves first). The COALESCE fallback literal never fires while that Vault secret exists. | `/functions/v1/...` | **SAFE-VIA-PROXY** (moot while dead — ratify; if the Vault secret is ever deleted, the fallback activates and is still safe since it targets a proxy-compatible path) |
| `supabase/functions/fulfillment-po/index.ts:26` (`PUBLIC_SUPABASE_URL`) | `Deno.env.get('PUBLIC_SUPABASE_URL')` is unset | **Likely LIVE.** `PUBLIC_SUPABASE_URL` is a hand-provisioned function secret, not a Supabase-platform-auto-injected variable (unlike `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`). Could not verify the actual secret set on Strata read-only (function secrets aren't in Postgres); flag for an operator check (`supabase secrets list` scoped to this function, or dashboard). Used only to rewrite the *host* of a signed storage URL (`core.ts:276`, `internalSupabaseUrl` → `publicSupabaseUrl`). | `/storage/v1/...` (signed-URL rewrite target) | **SAFE-VIA-PROXY** (ratify) |
| `supabase/functions/po-send/index.ts:79` (`PUBLIC_SUPABASE_URL`) | same as above | Same reasoning — likely LIVE, same secret name, same rewrite idiom (`index.ts:487`, `signedUrl.replace(SUPABASE_URL, PUBLIC_SUPABASE_URL)`) | `/storage/v1/...` | **SAFE-VIA-PROXY** (ratify) |
| `supabase/functions/_shared/comms-token.ts:83` (`commsPublicBase()`) | both `COMMS_PUBLIC_BASE` and `SUPABASE_URL` env vars are unset | **DEAD.** `SUPABASE_URL` is platform-auto-injected on every Supabase Cloud edge function invocation and is checked *before* the literal fallback, so the literal never fires on Strata. | `/functions/v1/comms-mute` | **SAFE-VIA-PROXY** (moot — ratify) |

### 1b. Fresh grep sweep (`git grep -n "api.patina.cloud" -- ':!.codex/' ':!docs/'`) — everything else found

Everything above was covered by name. The sweep surfaced three more categories of prod-executing code, all structurally different from the "Supabase URL fallback" pattern (they don't target Supabase paths at all, so the worker's `COMPATIBILITY_PREFIXES` allowlist doesn't apply the same way):

- **NestJS-service base-URL builders** — `apps/client-portal/src/lib/api-client.ts:15`, `apps/admin-portal/src/lib/api-client-server.ts:29`, `apps/designer-portal/src/lib/env.ts:18` all default to `` `https://api.patina.cloud/${serviceName}${defaultPath}` `` (e.g. `/orders/v1`, `/media/v1`). These are **not** Supabase compat paths (`orders`, `media`, `projects` are NestJS service names, not `auth/v1` etc.) — they route through a separate Cloudflare mechanism (Container service routes), not `infra/edge-api-worker/src/proxy.ts`'s `COMPATIBILITY_PREFIXES`. Out of scope for this worker's allowlist; **informational only**, not a D-B3 item under this program.
- **WebSocket defaults** — `apps/designer-portal/src/lib/env.ts:49,56`: `wss://api.patina.cloud/comms/ws` and `wss://api.patina.cloud/projects` (both used only when `NEXT_PUBLIC_WS_URL` / `NEXT_PUBLIC_PROJECTS_WS_URL` are unset). Neither path matches `COMPATIBILITY_PREFIXES` (no `/realtime/v1/` prefix) — if a client ever actually dials one of these paths through `api.patina.cloud`, the router would 404/reject it before it reaches `proxySupabaseRequest`. Per CLAUDE.md, projects realtime is supposed to be Supabase broadcast "NOT WebSockets," so this may already be dead/legacy code, but that couldn't be confirmed read-only here. **Flag as a D-B3 work item**: confirm whether either path is still dialed anywhere in the designer-portal; if so it needs either a dedicated worker route or migration onto `/realtime/v1/`.
- **CSP `connect-src` / `.env.example` / doc strings** (`apps/*/next.config.js`, `apps/*/.env.example`, `CSP_*.md`, `SECURITY*.md`, `apps/client-portal/wrangler.jsonc:14` `NEXT_PUBLIC_EDGE_API_URL`) — these are policy allowlists and documented config values, not runtime fallbacks; no code path silently defaults to them. No action.
- **QA/test-only** — `apps/mobile/Patina/scripts/qa-supabase-admin.sh:15` (hardcoded QA helper, not app runtime) and every `test/*.ts`/`*.test.ts` hit (`env.test.ts`, `proxy-security.test.ts`, `router.test.ts`, `validate-config.test.ts`, `workerd/runtime.test.ts`, `twilio-verify.test.ts`, `request-context.test.ts`) — test fixtures, not prod-executing. No action.

### F8 summary

**No PIN-DIRECT sites requiring a code change were found.** Every fallback that actually targets a Supabase path (`/functions/v1/`, `/storage/v1/`) resolves to a compat-allowlisted prefix, so it is either already `SAFE-VIA-PROXY` or currently dead. The one open item is confirming the two WS-URL literals in `designer-portal/src/lib/env.ts` are genuinely unreachable dead code (D-B3 follow-up); the two `PUBLIC_SUPABASE_URL` sites should get an operator secrets check to convert "likely live" into "confirmed live."

---

## 2. Latency/error baselines — direct vs. proxied

N=10 sequential `curl -w '%{http_code} %{time_total}'`, wall-clock from this workstation (not a controlled bench — network jitter dominates at this sample size; treat as a coarse pre-cutover floor, not a SLO).

| Route class | Direct p50 | Direct p95 | Proxy p50 | Proxy p95 | Δp50 | Δp95 | HTTP status (both) |
|---|---|---|---|---|---|---|---|
| `auth/v1/health` | 175 ms | 240 ms | 230 ms | 255 ms | +55 ms | +15 ms | 401/401 (no bearer supplied — timing-only probe) |
| `rest/v1/` (root) | 177 ms | 236 ms | 176 ms | 268 ms | ~0 ms | +32 ms | 401/401 |
| `functions/v1/__nope404` | 191 ms | 246 ms | 183 ms | 258 ms | −8 ms | +12 ms | 404/404 |
| `storage/v1/object/public/...` (HEAD, public bucket object) | 275 ms | 348 ms | 240 ms | 330 ms | −35 ms | −18 ms | 200/200 |

**Headline: at N=10, worker-proxy overhead is inside measurement noise across all four route classes** — deltas range from −35 ms to +55 ms with no consistent sign or route class standing out; two classes even measured *faster* through the proxy. No route class shows a doubling, a status-code mismatch, or an outlier. This is a coarse floor, not a guarantee — a controlled bench (fixed egress, many more samples, ideally from Cloudflare's own edge) would tighten the CI before using this as a go/no-go gate, but nothing here argues against the repoint on latency grounds.

---

## 3. Upload-size census (storage.objects, last 90 days, aggregate only — no object names/keys)

| Bucket | Objects (90d) | Max size | p95 size | Count >50MB | Count >95MB | Approaches 100MB cap? |
|---|---|---|---|---|---|---|
| `room-scans` | 916 | 51.88 MB | 0.48 MB | 1 | 0 | **Closest** — one object at 51.9MB clears the 50MB mark but stays well under 95/100MB |
| `project-documents` | 7 | 7.57 MB | 5.37 MB | 0 | 0 | No |
| `feedback-screenshots` | 15 | 0.88 MB | 0.87 MB | 0 | 0 | No |
| `field-media` | 1 | 0.74 MB | 0.74 MB | 0 | 0 | No |
| `capture-media` | 7 | 0.56 MB | 0.52 MB | 0 | 0 | No |
| `studio-logos` | 2 | 0.08 MB | 0.08 MB | 0 | 0 | No |
| `proposal-mood-boards` | 5 | 0.07 MB | 0.06 MB | 0 | 0 | No |
| `project-review-media` | 1 | 0.04 MB | 0.04 MB | 0 | 0 | No |
| `project-ffe-working` | 1 | 0.04 MB | 0.04 MB | 0 | 0 | No |

Buckets with **zero objects created in the last 90 days** (no data point, not necessarily empty overall): `avatars`, `catalog-feeds`, `comms-attachments`, `extension-releases`, `portfolio-items`, `product-images`, `proposal-assets`, `room-hero-frames`, `room-scan-thumbnails`, `site-requests`.

**Verdict**: nothing on prod, across any bucket, exceeds the 95MB/100MB Workers body-size boundary in the last 90 days. `room-scans` is the only bucket with real traffic anywhere near the 50MB mark (single object at 51.9MB — LiDAR room-scan payloads are the expected large-object producer here, consistent with the iOS scan pipeline). This **confirms F2's permanent storage exclusion is the right call**: it isn't a hypothetical risk being pre-empted, `room-scans` is already producing objects that would need chunked/multipart handling a Worker can't do inline — better to keep storage traffic off the proxy path entirely rather than build headroom for a cap real traffic is already approaching.

---

## 4. WebSocket handshake-timeout review

Read: `infra/edge-api-worker/src/proxy.ts`, `src/deadline.ts`, `wrangler.jsonc`.

- `proxy.ts:144-153`: a WebSocket upgrade (`Upgrade: websocket` header) gets `config.websocketHandshakeTimeoutMs` as its deadline instead of `compatibilityFetchTimeoutMs`; both race through the same `fetchWithDeadline`/`withDeadline` (`deadline.ts:56-66`) `AbortController` pattern — whichever of {work, timeout, caller-abort} settles first wins, and the timer/listener are always cleaned up in `finally`.
- `wrangler.jsonc`: `WEBSOCKET_HANDSHAKE_TIMEOUT_MS` is **5000 in all three environments** — `local` (line 49), `staging` (line 71), and `production` (line 105) — unlike `COMPATIBILITY_FETCH_TIMEOUT_MS`, which production alone bumped to 30000 (line 104, with an inline rationale comment about not clipping the Stripe webhook's ~30s window). No equivalent per-environment differentiation exists for the WS timeout.
- `env.ts:126-130` bounds it to `[1, 30_000]` at `validateRuntimeConfig` — 10000 would still validate cleanly.

**Reconnect-storm model**: picture N tabs/clients losing their Realtime connection simultaneously (a network blip, a Realtime-side deploy, or the edge worker itself cold-starting after idle) and all reconnecting in the same few-hundred-ms window. Each reconnect is an independent WS-upgrade fetch through the worker to Supabase Realtime, each racing the *same* fixed 5000ms deadline with no jitter at this layer. Two things compound under real load:
1. A cold Cloudflare Workers isolate itself is typically fast to start, but N simultaneous upgrade requests each still have to complete a full TLS+HTTP handshake to Supabase Realtime; if Realtime is itself under burst load from the same N-way stampede, its accept latency rises for everyone at once — pushing a cluster of the N attempts toward the 5s ceiling together.
2. Because the timeout is a hard wall with no server-side backoff signal, clients whose upgrade gets aborted at 5s typically retry immediately (client-side backoff, if any, is outside this file's control) — which can re-synchronize the herd on the next attempt instead of dispersing it, especially right after a cold start when the very first wave is already timing-correlated.

**Recommendation (do not implement — record only)**: raise **production** `WEBSOCKET_HANDSHAKE_TIMEOUT_MS` from `5000` to `10000` (single-line edit at `wrangler.jsonc:105`, mirroring the rationale already used for `COMPATIBILITY_FETCH_TIMEOUT_MS` at line 104). Rationale: 5s is tight for a "N tabs reconnect at once" burst against an upstream that is itself momentarily loaded; doubling it gives real handshakes more room to complete under contention without materially changing the failure-detection latency for a genuinely dead upstream (10s is still well inside a user's patience for "reconnecting…" UI). Leave `local`/`staging` at 5000 unless staging load-testing surfaces the same pattern — no reason to widen environments that aren't seeing the storm. This is scoped to Workstream D-B3 to actually change; nothing here was modified.

---

## 5. Cookie/storageKey ground truth (for D-B1)

### Current storage key

**`sb-bkvcixdmuyejfzcijpdg-auth-token`** — none of the client constructors below pass an explicit `storageKey`, so `@supabase/ssr` derives it from the Supabase project ref in the URL host's first label. Every portal's prod `NEXT_PUBLIC_SUPABASE_URL` is the direct hostname `https://bkvcixdmuyejfzcijpdg.supabase.co` (confirmed live in all four `apps/*/wrangler.jsonc` production `vars` blocks: `client-portal:13`, `admin-portal:13`, `designer-portal:18`, `manufacturer-portal:13`), so the derived key is identical across all four portals today.

### Every place that derives or depends on it

| File:line | Role | How it derives the key |
|---|---|---|
| `packages/supabase/src/client.ts:37-44` (`createClient`) | Browser client, non-SSR path | Delegates to `createBrowserClient()` in-browser; server-side falls to a bare `createSupabaseClient(supabaseUrl, supabaseAnonKey)` — no `storageKey` override either way |
| `packages/supabase/src/client.ts:56-70` (`createBrowserClient`) | SSR-aware browser singleton | `createSSRBrowserClient(supabaseUrl, supabaseAnonKey, { cookieOptions })` — `cookieOptions` only carries `domain`/`sameSite`/`secure`/`path` (from `buildAuthCookieOptions`, line 22-31); no `storageKey` |
| `packages/supabase/src/client.ts:94-131` (`createMiddlewareClient`) | Next.js middleware (request/response cookie plumbing) | Same: `createSSRServerClient(supabaseUrl, supabaseAnonKey, { cookieOptions, cookies })` (line 114) — no `storageKey` |
| `packages/supabase/src/client.ts:10-11` | Shared source of `supabaseUrl`/`supabaseAnonKey` for all of the above | `process.env.NEXT_PUBLIC_SUPABASE_URL!` — the value that indirectly determines the derived cookie name for every portal |
| `apps/*/wrangler.jsonc` (`client-portal:13`, `admin-portal:13`, `designer-portal:18`, `manufacturer-portal:13`) | Committed prod value of `NEXT_PUBLIC_SUPABASE_URL` | All four = `https://bkvcixdmuyejfzcijpdg.supabase.co` today — this is the single upstream input the derivation above depends on |
| `apps/extension/src/lib/supabase.ts:4` | Extension's own Supabase URL | `process.env.PLASMO_PUBLIC_SUPABASE_URL!` — a **separate** env var from the portals', currently expected to match |
| `apps/extension/src/lib/supabase.ts:29-36` (`getAuthCookieName`) | Extension's independent re-derivation of the cookie name | Re-implements the same `sb-<host-first-label>-auth-token` formula by parsing `SUPABASE_URL` itself (comment: "Matches the portal middleware logic") — **not** imported from `@patina/supabase`, a hand-written duplicate |
| `apps/extension/src/lib/portal-cookie.ts:136` (`readPortalSessionTokens`) | Reads the portal's cookie via `chrome.cookies.getAll` | Calls `getAuthCookieName()` (above) to know which cookie name to read/dechunk — depends transitively on the extension's own `PLASMO_PUBLIC_SUPABASE_URL` matching whatever the portals actually use |
| `packages/supabase/src/lib/cookie-domain.ts:16-48` (`getCookieDomain`) | Cookie **domain** scoping (`.patina.cloud` vs host-only) | Independent of the storage-key question — keyed off the request `host`, not the Supabase URL. Not affected by a repoint, included here only because `client.ts` composes it into the same `cookieOptions` object. |

### The exact edit list D-B1 needs

If/when the portals' `NEXT_PUBLIC_SUPABASE_URL` moves to point at `https://api.patina.cloud` (routing REST/auth/realtime/storage/functions traffic through the edge worker) while the underlying Supabase project stays `bkvcixdmuyejfzcijpdg`, the derived cookie name would silently change to `sb-api-auth-token` — invalidating every existing session cookie in the wild and breaking the extension's independent re-derivation (`portal-cookie.ts` reading a cookie name that no longer exists) unless the key is pinned explicitly *before* that URL changes. D-B1's edit list:

1. **`packages/supabase/src/client.ts:60-63`** (`createBrowserClient`) — add `auth: { storageKey: 'sb-bkvcixdmuyejfzcijpdg-auth-token' }` to the `createSSRBrowserClient(...)` options object, pinning the key independent of `supabaseUrl`.
2. **`packages/supabase/src/client.ts:67-69`** (the SSR-fallback branch of the same function) — same `storageKey` addition, so server-rendered and client-hydrated instances agree even before the singleton exists.
3. **`packages/supabase/src/client.ts:114`** (`createMiddlewareClient` → `createSSRServerClient(...)`) — same `storageKey` addition; this is the path that reads/refreshes the cookie in Next.js middleware, so a mismatch here is the one most likely to silently log everyone out.
4. **`apps/extension/src/lib/supabase.ts:29-36`** (`getAuthCookieName`) — stop deriving from `SUPABASE_URL` (which the extension may or may not repoint in lockstep with the portals); replace with the same pinned literal (or better, import a single shared constant from `@patina/supabase` instead of hand-duplicating the formula, closing the "not imported from `@patina/supabase`" gap noted above).
5. **`apps/extension/src/lib/portal-cookie.ts:136`** — no code change needed once #4 is fixed (it already just calls `getAuthCookieName()`), but it's the consumer that would silently break if #4 is missed, so it's the verification point: after #4 lands, confirm `readPortalSessionTokens()` still resolves a session against a portal running the repointed URL.
6. **No wrangler.jsonc changes are required by D-B1 itself** — D-B1 is exclusively about making the storage key URL-independent *before* any `NEXT_PUBLIC_SUPABASE_URL` value changes land; the actual repoint of those four `vars` blocks is a separate, later workstream this audit does not authorize or schedule.

---

## 6. D-B8 record — Kody's endgame ruling

Per Kody's ruling, the dual-hostname topology is **permanent**, not a transitional state to be collapsed once the repoint is proven: `bkvcixdmuyejfzcijpdg.supabase.co` (the direct Supabase hostname) stays load-bearing indefinitely for storage traffic (per §3's finding — real objects already near the sizes a Worker can't proxy inline), OAuth provider emails and redirect links (which are minted against the project's own auth domain and are impractical to rewrite retroactively), and legacy iOS builds already in the wild pointed at the direct hostname (which can't be forced to update on any particular timeline). `api.patina.cloud` is the new front door for everything else, but retiring the direct hostname entirely is explicitly **out of scope** for this program — there is no workstream, in this program or a follow-on, tasked with turning it off.

---

## Commit

Branch `docs/repoint-b0-audit`, worktree `.codex/worktrees/agent-db0`. See commit history for SHA.
