# Platform & Infrastructure — Detailed PRD (As-Built)

## 1. Header

**Area**: Platform & Infrastructure — the cross-cutting deployment, auth, data-access, caching, storage, edge-runtime, and CI/analytics plumbing every Patina feature rides on.

**Per-sub-feature status**:

| Sub-feature | Status |
|---|---|
| Deployment topology (Proxmox → Coolify → Cloudflare Tunnel) | Shipped |
| Self-hosted Supabase stack (Kong/GoTrue/PostgREST/Realtime/Storage/Postgres/Studio) | Shipped |
| Supabase Auth (GoTrue) across all portals + NestJS services | Shipped |
| NestJS retained services (orders/media/projects) + Prisma schema isolation | Shipped |
| `@patina/api-routes` proxy (retry, cookie reassembly, JWT re-verify) | Shipped |
| Circuit breaker at the proxy | ⚠ Planned-but-removed — docs describe it, code deliberately does not have it |
| `@patina/cache` (Redis) | Shipped |
| CI image publishing (GHCR via docker-publish.yml) | Shipped |
| CI test/lint/type-check gating on PRs | Planned (does not exist) |
| Edge-function runtime (single dispatcher + per-fn workers) | Shipped |
| Storage (R2 in prod, MinIO local) | Shipped |
| pg_cron → edge-function invocation plumbing | Shipped |
| RBAC data model (roles/permissions/org membership) | Shipped |
| RBAC enforcement (`PermissionsGuard`) | ⚠ Partial — DB model shipped, service-layer enforcement is a no-op |
| Daily-Room analytics pipeline (`analytics_summary`/`story_analytics` + FastAPI re-rank) | Partial — 6 tracking tables shipped (00069), summary tables and re-rank pipeline are spec-only |
| PostHog product analytics ingestion | Partial — dashboards built, ingestion dark (key unset in Coolify) |
| Residual NextAuth code path | ⚠ Planned removal — violates CLAUDE.md's Supabase-only mandate, still present |
| Stale dead-code / stale-doc surface (Tier 1/2 per stale-files-audit) | Planned cleanup (not started) |

**Last reconciled**: 2026-07-06

**Source docs**:
- `docs/architecture/CoolifyQuickStart.md`
- `docs/architecture/cloudflare-migration.html`
- `docs/architecture/supabase-cloud-migration.html`
- `docs/architecture/ios-development-plan.md`
- `docs/operations/e2e-local-test.md`
- `docs/operations/email-system-runbook.md`
- `docs/maintenance/stale-files-audit.md`
- `docs/specs/Data Tracking/patina-data-architecture.md`
- `docs/specs/Data Tracking/posthog-dashboards.md`
- `docs/handoffs/sprint-2-posthog-dashboards/README.md`
- `infra/DEPLOYMENT_GUIDE.md`
- `infra/PORT_REFERENCE.md`
- `infra/cloudflare-tunnel-config.yml`
- `infra/docker-compose.services.yml`
- `infra/coolify/docker-compose.ghcr-apps.yml`
- `supabase/config.toml`
- `.github/workflows/docker-publish.yml`

## 2. Overview

The platform layer is the substrate every Patina feature (Aesthete Engine, The Document, Procurement, iOS, extension, etc.) depends on: deployment topology, the self-hosted Supabase stack, shared auth, the Next.js→NestJS proxy/data-access packages, caching, CI/image publishing, storage, the edge-function runtime, and cron/analytics plumbing.

**Primary users**: the engineering team (deploy/operate the stack), and — transitively — every portal and app in the monorepo that consumes `@patina/supabase`, `@patina/auth`, `@patina/api-routes`, `@patina/cache`, and `@patina/utils`. There is no end-user-facing "platform" screen; this PRD covers infrastructure, not a product surface.

**Where it lives in the product**: Production is a single Proxmox box running Coolify, fronted by a Cloudflare Tunnel routing `*.patina.cloud`. The stack is Supabase-first — auth, database, realtime, storage, and edge functions all run behind Kong at `api.patina.cloud` — with 3 retained NestJS services (orders, media, projects) plus a Python/FastAPI worker (`services/aesthete-inference`) for domains that don't fit the Supabase-only model.

## 3. As-Built Architecture

### Monorepo & build
pnpm workspaces + Turborepo. Apps: `apps/{designer,admin,client}-portal` (Next.js 15), `apps/extension` (Plasmo), `apps/mobile` (SwiftUI). Retained services: `services/{orders,media,projects}` (NestJS + Prisma, schema-isolated) and `services/aesthete-inference` (Python/FastAPI — has `Dockerfile`, `requirements.txt`, `pytest.ini`). Shared packages include `supabase`, `auth`, `api-routes`, `api-client`, `cache`, `utils`, `types`.

### Auth (Supabase GoTrue only)
- **NestJS side** — `packages/auth/src/index.ts`: `verifyJwtToken()` (jose, HS256, `SUPABASE_JWT_SECRET`, fails closed, no dev fallback), `JwtAuthGuard`, `HybridAuthGuard` (alias of `JwtAuthGuard`), `Public`/`RequirePermissions`/`CurrentUser` decorators, `createCorsOptions()`.
- **Portal side** — `packages/supabase/src/client.ts`: `createBrowserClient()` (global singleton `__supabaseBrowserClient`), `createMiddlewareClient()` (host-aware cookie domain via `lib/cookie-domain`, scopes to `.patina.cloud` in prod / host-only on localhost), `createAdminClient`/`createServerClient` (service-role, `SUPABASE_INTERNAL_URL` fallback, `cache:'no-store'`).
- Portal shells gate on role at the edge: `apps/{designer,admin,client}-portal/src/middleware.ts` refresh session via `createMiddlewareClient` then `auth.getUser()`, and (designer) check `user_roles → roles.domain ∈ {designer,admin}` via the admin client; **fails open** on missing service key / DB blip.

### Proxy / data-access
`packages/api-routes/src/middleware/proxy-to-backend.ts` forwards portal `/api/*` calls to NestJS: reassembles chunked auth cookies (both Supabase `sb-<host>-auth-token.N` base64 JSON **and** legacy NextAuth `next-auth.session-token.N`), re-verifies the JWT before forwarding (A5 defense-in-depth on top of `@patina/auth`), applies a header whitelist, and `utils/retry.ts` (exponential backoff + Retry-After + mutation-aware). Explicitly **no circuit breaker** (removed in refactor). `packages/api-client` is a separate axios/base-client library (`clients/*.client.ts`).

### Caching
`packages/cache` — NestJS `CacheModule`/`CacheService` (Redis) + `token-blacklist.service.ts` + cache interceptor/decorator; wired into `services/orders/src/app.module.ts` and `services/projects/src/app.module.ts`.

### Deploy topology
Proxmox → Coolify → Cloudflare Tunnel. Prebuilt GHCR images (`ghcr.io/kodeman/*`) published by `.github/workflows/docker-publish.yml` (paths-filter → matrix build of 3 portals via `infra/Dockerfile.nextjs`, 3 NestJS via `infra/Dockerfile.nestjs`, and an edge-runtime image via `infra/Dockerfile.edge-runtime`). Coolify runs `infra/coolify/docker-compose.ghcr-apps.yml` (containers suffixed `-oc8kggksw4s8sg08o4w0wsw4`). Tunnel ingress in `infra/cloudflare-tunnel-config.yml`: app→3000, admin→3001, client→3002, api→Kong :8100, supabase(Studio)→3010, realtime→4000, media→3014, storage→5000, storage-admin→9001, db→tcp 5432.

### Self-hosted Supabase stack
Kong gateway (`infra/volumes/api/kong.yml`: key-auth on `/rest`, open `/auth/v1/verify|callback|authorize`), GoTrue :9999, PostgREST, Realtime :4000, Storage :5000, imgproxy :5001, Postgres 15 :5432, Studio :3010, Analytics/Logflare :54327 (local). Edge functions run via the self-hosted edge-runtime with a single dispatcher `supabase/functions/main/index.ts` that spawns a per-function user worker (256MB, forwards full env). `supabase/config.toml` overrides `verify_jwt=false` only for `stripe-webhook`.

### Storage
Prod = Cloudflare R2 (`docker-compose.services.yml` defaults `STORAGE_PROVIDER=R2`, `CDN_DOMAIN=cdn.patina.cloud`). Media service talks to R2 through the S3 SDK inside a class still named `OCIStorageService`; `services/media/src/main.ts` aliases `R2_BUCKET_*`→`OCI_BUCKET_*` at boot. Local dev = MinIO.

### Cron / edge invocation
pg_cron jobs live across many migrations, all invoking edge functions through `invoke_edge_function(fn_name, body)` (redefined in `00081_invoke_edge_function_dual_auth.sql`) which reads `app.settings.supabase_url` + `app.settings.service_role_key` GUCs and `net.http_post`s with both `apikey` + `Authorization` (so Kong key-auth passes).

### Key components/hooks (platform-facing)
- `createBrowserClient()` / `createMiddlewareClient()` / `createAdminClient()` / `createServerClient()` — `packages/supabase/src/client.ts`, the four Supabase client factories every app in the monorepo imports.
- `verifyJwtToken()`, `JwtAuthGuard`, `HybridAuthGuard`, `PermissionsGuard` — `packages/auth/src/index.ts`, the NestJS-side auth primitives.
- `proxyToBackend` / `createProxyHandler` — `packages/api-routes/src/middleware/proxy-to-backend.ts` (with `createRouteHandler` in `packages/api-routes/src/create-route-handler.ts`), the single chokepoint every portal `/api/*` route funnels through on its way to a NestJS service.
- `CacheModule` / `CacheService` / `token-blacklist.service.ts` — `packages/cache/src`, Redis-backed caching consumed by the orders and projects `app.module.ts` wiring.
- `invoke_edge_function(fn_name, body)` — Postgres function (`00081_invoke_edge_function_dual_auth.sql`), the sole path from pg_cron into the edge-runtime.

## 4. Data Model

### Migration inventory
252 files under `supabase/migrations/`, numbered `00001`–`00254` with **00010 and 00012 skipped** (no duplicates). Highest = `00254_record_offline_signature.sql`.

### RBAC / multi-tenant / platform tables — `00021_user_management_foundation.sql`
`roles`, `permissions`, `role_permissions`, `organizations`, `organization_members`, `user_roles`, `oauth_accounts`, `api_keys` (key_hash/key_prefix), `audit_logs`. All RLS-enabled. Migration `00126` guarantees every user has ≥1 `user_roles` row (relied on by portal middleware).

### GDPR — `00025_gdpr_compliance.sql`

### Schema isolation (NestJS)
`svc_orders` (`00052`), `svc_media` (`00053`), `svc_projects` (`00054`) — `svc_orders` and `svc_projects` each also define their own `audit_logs` inside the service schema (`svc_media` does not; it holds `media_assets`, `asset_renditions`, `three_d_assets`, `process_jobs`, `upload_sessions`, `license_records`, `outbox_events`).

### Storage buckets
`00031` (initial), `00057` product_images, `00059` extension_releases, `00099` proposal_assets, `00115` avatars, `00116` comms_attachments, `00170` project_documents, `00234` capture_media.

### RLS hardening / recursion fixes
`00058` tighten policies, `00068` org_members recursion, `00087` project_team_members recursion, `00100` proposal client-sign, `00102` comms, `00168` projects scope, `00205` margin_notes studio, `00217` coordination.

### Cron infrastructure
`00079_cron_schedules.sql` (email/engagement crons), `00081` invoke_edge_function dual-auth, plus job definitions in `00092/00096/00098/00120/00122/00151/00174/00181/00189/00193/00206/00241/00245/00248/00249/00250`.

### Analytics / event tables
`00037_engagement_events_and_profile_extensions.sql`; `00069_daily_room_tracking.sql` created the iOS Daily-Room set: `daily_stories`, `user_room_engagement`, `product_user_dwell`, `product_engagement`, `feed_cache_meta`, `spatial_context`; `00171_decision_status_guard_and_events.sql`. `00144` user_settings preferred_home_mode.

### RLS notes
RBAC and multi-tenant isolation are enforced via Postgres RLS on every platform table from `00021` onward. Several recursion bugs have surfaced and been fixed over time (org_members, project_team_members, coordination) — these are policy-shape bugs (self-referential `EXISTS` clauses triggering `42P17`), not missing-RLS bugs. ⚠ No enforcement currently exists above the DB layer for granular permissions — see Reconciliation & Gaps.

### RPCs (platform-relevant)
- `invoke_edge_function(fn_name, body)` — dual-auth (`apikey` + `Authorization`) bridge from pg_cron/triggers into the edge-runtime; redefined in `00081`.
- No dedicated "platform" RPC surface beyond this — feature-area RPCs (decisions, proposals, coordination, etc.) are documented in their own consolidated PRDs; this document covers only the invocation plumbing they all share.

## 5. API / Edge / Service Surface

### Edge functions (Deno, self-hosted)
39 directories under `supabase/functions/` including the `main` dispatcher and `_shared` (so ~37 callable functions). Platform-relevant: `notification-dispatch`, `campaign-dispatch`, `campaign-scheduler`, `digest-dispatcher`, `resend-webhook`, `stripe-webhook` (only function with `verify_jwt=false`), `create-checkout-session`, `automation-processor`, plus domain crons (`decision-reminders`, `expire-decisions`, `invoice-reminders`, `invoice-send`, `po-send`, `proposal-send/-nudge/-sign-confirmation`, `lead-expiration-check`, `review-requests`, `back-in-stock-check`, `price-drop-check`, `sms-dispatch`, `ab-winner-evaluator`) and the aesthete set (`aesthete-ask/-embed-worker/-nightly/-dna-draft/-drift-audit`). All reached through `main/index.ts`.

### NestJS services (behind portal proxy)
orders :3015, media :3014, projects :3016 — each exposes `/health` (docker healthchecks) + domain controllers; consumed only via `@patina/api-routes` `proxyToBackend`. `services/media/src/main.ts` mounts helmet + cookie-parser + Swagger.

### Next.js API routes
Proxy handlers built with `createRouteHandler` + `proxyToBackend`/`createProxyHandler`. Concrete platform routes: `apps/admin-portal/src/app/api/admin/health/route.ts`, `/api/unsubscribe` (email preference center), plus per-portal proxy routes.

⚠ The health checks referenced in `CoolifyQuickStart.md` (`/api/health`, `ml.patina.cloud/health`, `search.patina.cloud/health`) do **not** exist.

## 6. UI Surfaces

- **Supabase Studio** — `supabase.patina.cloud` (:3010), DB/auth admin.
- **MinIO console** — `storage-admin.patina.cloud` (:9001), local/dev object-store admin (prod storage is R2, managed in the Cloudflare dashboard).
- **Portal shells** — `apps/{designer,admin,client}-portal/src/middleware.ts` provide the auth/role gate every portal screen sits behind; the designer shell restricts to role domains `{designer, admin}`.
- **PostHog dashboards** — PostHog **Cloud US**, project `326191` (`us.posthog.com/project/326191`). 5 help-system dashboards / 16 tiles built 2026-05-19 (`docs/handoffs/sprint-2-posthog-dashboards/README.md`), all currently showing "No data".
- No dedicated platform/ops admin UI exists beyond Supabase Studio + Coolify + Cloudflare dashboards.

### Cross-app applicability
- **Designer / Admin / Client portals** — all three sit behind the same `middleware.ts` auth-gate pattern (`apps/{designer,admin,client}-portal/src/middleware.ts`) and consume the same `@patina/supabase` client factories; there is no portal-specific platform UI beyond the role check itself (designer portal narrows to `{designer, admin}` role domains).
- **Native (iOS)** — consumes the same Supabase Auth/GoTrue backend and the same edge-function surface, but has no dedicated platform-admin screen; PostHog SDK wiring on iOS is unverified (see Gaps).
- **Chrome extension** — authenticates by adopting the designer portal's Supabase session cookie (see Chrome Extension memory notes); no independent platform UI.

## 7. Reconciliation & Gaps

⚠ `docs/architecture/CoolifyQuickStart.md` (dated "January 2025") describes an architecture that does not exist: Core/Intelligence/Analytics NestJS services on ports 4001–4003, Typesense (:8108), Qdrant (:6333), a "consumer-web" app, and `ml.patina.cloud`/`search.patina.cloud` subdomains. The real prod topology is 3 portals + 3 NestJS services (media/orders/projects on 3014–3016), per `infra/DEPLOYMENT_GUIDE.md`, `infra/PORT_REFERENCE.md`, and `infra/cloudflare-tunnel-config.yml`.

⚠ CoolifyQuickStart.md maps "Designer Portal → admin.patina.cloud" and describes Git/Nixpacks deploys; reality is `app.patina.cloud`=designer, `admin.patina.cloud`=admin, `client.patina.cloud`=client, deployed as prebuilt GHCR images (`ghcr.io/kodeman/*`) via `.github/workflows/docker-publish.yml` and `infra/coolify/docker-compose.ghcr-apps.yml`.

⚠ `docs/specs/Data Tracking/patina-data-architecture.md` and `posthog-dashboards.md` state PostHog is "self-hosted"; the actual PostHog is PostHog Cloud US (project 326191, us.posthog.com) per the sprint-2 handoff and live MCP context.

⚠ `packages/api-routes/src/middleware/proxy-to-backend.ts` still `import { getToken } from 'next-auth/jwt'` and reassembles `next-auth.session-token.N` cookies, and `packages/auth/src/nextjs/index.ts` is a deprecated stub that throws — despite CLAUDE.md's "Auth: Always use Supabase Auth. Never add NextAuth" mandate. Dead NextAuth code path persists.

⚠ API-gateway port disagreement between infra docs: `infra/PORT_REFERENCE.md` says `api.patina.cloud → localhost:8000`, but the live `infra/cloudflare-tunnel-config.yml` routes `api.patina.cloud → localhost:8100` (Kong).

⚠ `packages/api-routes/CIRCUIT_BREAKER.md` / `CIRCUIT_BREAKER_SUMMARY.md` document a circuit breaker, but `proxy-to-backend.ts` explicitly removed it ("Intentionally no circuit breaker … removed in this refactor"). Docs describe a feature the code deliberately doesn't have (also flagged in the stale-files-audit).

⚠ Media storage code is named for OCI (`OCIStorageService`, `OCI_BUCKET_*`) but actually targets Cloudflare R2 via the S3 SDK; `services/media/src/main.ts` aliases `R2_BUCKET_*`→`OCI_BUCKET_*` at boot to avoid touching call sites. The multi-provider `storage.module.ts`/`multi-storage.service.ts`/r2+s3 providers are dead code (never imported).

⚠ Daily-Room data architecture is only partially built: `00069` created the six tracking tables, but `analytics_summary` and `story_analytics` (referenced throughout `patina-data-architecture.md`) have **zero** migrations, and the nightly FastAPI re-ranking pipeline + `/api/feed/{room_id}`, `/api/interactions/batch`, `/api/stories/today` contracts are spec-only.

⚠ PostHog analytics ingestion is effectively dark: all 5 help-system dashboards show "No data" because zero `help.*`/product events have reached project 326191 — the handoff notes `NEXT_PUBLIC_POSTHOG_KEY` is unset on the portals in Coolify. Deferred: real PostHog tags, ACLs for Leah, the D5 HogQL SQL tile, per-tile 30d windows.

⚠ `PermissionsGuard` in `packages/auth/src/index.ts` is a no-op that always returns true (comment: "A4 … until then this is a no-op gate"); `@RequirePermissions` metadata is declared but never enforced — RBAC is defined in the DB (`00021`) but not gated at the service layer.

⚠ No test/lint/type-check CI. `.github/workflows/` contains only `docker-publish.yml` + two extension-publish workflows (`extension-beta.yml`, `extension-cws.yml`); nothing runs `pnpm test/lint/type-check` on PRs.

⚠ No system-wide per-service failure detection at the proxy (circuit breaker intentionally removed) — resilience relies on Cloudflare retries + container liveness probes only.

⚠ Large committed dead-code / stale-doc surface per `docs/maintenance/stale-files-audit.md` (Tier 1 junk incl. ~446 compiled `.js/.d.ts` files checked into service `src/`; Tier 2 verified-dead media storage/transform modules, `*-refactored` service rewrites, legacy axios `@patina/api-client`, and `@patina/utils` error-tracking/logging/websocket/performance modules commented out of the barrel).

⚠ Tunnel/secrets are placeholder-only in-repo: `infra/cloudflare-tunnel-config.yml` and `CoolifyQuickStart.md` carry `<TUNNEL_ID>` placeholders; two untracked-but-not-gitignored `infra/.env.bak*` secret files sit in the working tree (flagged by stale-files-audit as a leak risk).

## 8. Forward Roadmap / Open Requirements

| Item | Priority |
|---|---|
| Rewrite or archive `docs/architecture/CoolifyQuickStart.md` so the canonical deploy guide matches the real 3-portal + 3-NestJS + edge-runtime topology (`infra/DEPLOYMENT_GUIDE.md` is already correct) | P0 |
| Set `NEXT_PUBLIC_POSTHOG_KEY` on all portals in Coolify (and verify iOS) so `help.*` + product analytics actually ingest to project 326191 — until then every dashboard is empty | P0 |
| Add a CI pipeline that runs `pnpm type-check` / `lint` / `test` on PRs; today only image-publish workflows exist | P1 |
| Implement real `PermissionsGuard` enforcement (A4) so `@RequirePermissions` is honored against DB-defined roles/permissions | P1 |
| Delete the residual NextAuth path in `proxy-to-backend.ts` and the deprecated `@patina/auth/nextjs` stub to fully honor the Supabase-only mandate | P1 |
| Prune stale-files-audit Tier 1/2 (committed tsc output, dead media/service-refactored modules, orphaned api-client) and gitignore the `infra/.env.bak*` secret files | P2 |
| Decide the Cloudflare vs managed-Supabase migration questions captured in the two evaluation decks (`cloudflare-migration.html`, `supabase-cloud-migration.html`) | P2 |
| Rename the OCI-named media storage layer to R2 and drop the boot-time env aliasing, or formally keep the alias and document it | P2 |

## 9. Status & Deploy

| | State |
|---|---|
| Main branch migration tip | `00254` |
| Production migration tip | `00229` |
| Not yet on prod | `00230`–`00254` (proposal-watch `00230`/`00231` + nudge edge fn; Aesthete Engine set `00239`–`00251`; field-capture/project-open-close `00232`–`00238`; offline-signature `00252`–`00254`) |
| Unmerged branches with platform-adjacent changes | `the-document/offline-signature` (migration `00254`, pushed not merged) |

Deploys are manual via Coolify pulling GHCR `:latest` images; per the deploy-workflow memory, Coolify `/restart`+`/deploy` skip image pull — the reliable path is SSH + `docker compose pull && up --force-recreate`. Edge functions ship baked into the edge-runtime image (built by `docker-publish.yml` when `supabase/functions/**` changes, matrix-built alongside the 3 portal and 3 NestJS images). Supabase stack + backend services run as Coolify Docker-Compose resources on `patina_network`.

Because migrations are deployed ahead of application code (per the AE runbook convention noted elsewhere in the program), any future prod deploy that picks up `00230`–`00254` must apply the migration batch first, then roll the portal/service images that depend on the new schema.

## 10. Superseded Sources

- `docs/architecture/CoolifyQuickStart.md`
