# CLAUDE.md

## Project Overview

Patina is a custom home furnishing platform connecting interior designers with manufacturers. This is a **Supabase-first hybrid monorepo** — Supabase handles auth, database, realtime, and storage, while 3 retained NestJS services handle complex domains (orders, media, projects).

## Technology Stack

- **Monorepo**: pnpm workspaces + Turborepo — pnpm `9.0.0` exact (corepack pin), node ≥20
- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, TanStack Query
- **Auth**: Supabase Auth (GoTrue) — no NextAuth
- **Database**: Supabase PostgreSQL — production is Supabase Cloud project **"Strata"** (ref `bkvcixdmuyejfzcijpdg`, CLI-linked); local dev via Supabase CLI
- **Backend**: 3 NestJS services (orders, media, projects) using Prisma, isolated in `svc_*` schemas
- **Production infra**: Cloudflare — 4 portals on **Workers** (OpenNext), services on **Containers** (`infra/*-worker/`). The old self-hosted Coolify box is **retired** — never deploy, SSH, or point anything at it, even if an older doc says to.
- **Local infra**: Docker Compose (Redis, MinIO, Mailhog) + Supabase CLI
- **Native**: 2 Swift/SwiftUI iOS apps — Patina (client, `apps/mobile/Patina`) + Patina Field (designer/trades, dir is `apps/mobile/Capture`); Plasmo Chrome extension

## Project skills

Eleven `patina-*` skills in `.claude/skills/` carry the verified procedures and footguns this file only summarizes — load the matching skill before working on: DB migrations, edge functions, portal features, local dev, verification, testing, deploys, prod ops, Stripe payments, parallel/multi-agent work, or iOS. Index: `.claude/skills/README.md`.

## Essential Commands

```bash
# Install dependencies
pnpm install

# Start local infrastructure (Redis, MinIO, Mailhog)
docker compose up -d

# Start / stop / reset Supabase (Postgres, Auth, Realtime, Storage, Studio)
pnpm supabase:start          # Studio at http://localhost:54323
pnpm supabase:stop
pnpm supabase:reset          # replay all migrations + the seeds wired in config.toml [db.seed]

# Generate Prisma clients / push Prisma schemas (NestJS services only)
pnpm prisma:generate
pnpm prisma:push

# Development (use selective workflows — NOT `pnpm dev`)
pnpm dev:minimal              # Designer Portal + 3 NestJS services
pnpm dev:designer             # Same as minimal (most common workflow)
pnpm dev:admin                # Admin Portal + orders + media
pnpm dev:client               # Client Portal + orders + projects
pnpm dev:frontend             # All 4 portals (no backend)
pnpm dev:backend              # 3 NestJS services (not aesthete-inference — it's Python, own Makefile)

# Build / test / lint (turbo silently skips workspaces lacking the script — see patina-verification)
pnpm build
pnpm test
pnpm type-check
pnpm lint                     # only designer-portal has a working ESLint config; don't trust the rest
```

## Architecture

### Monorepo Structure

```
patina/
├── apps/
│   ├── designer-portal/       # Next.js 15 — primary designer workspace (port 3000)
│   ├── admin-portal/          # Next.js 15 — admin dashboard (port 3001; strictest build — types enforced)
│   ├── client-portal/         # Next.js 15 — client-facing PWA (port 3002)
│   ├── manufacturer-portal/   # Next.js 15 — scaffold, but deployed (port 3003)
│   ├── extension/             # Plasmo Chrome extension (product capture)
│   └── mobile/                # Swift/SwiftUI: Patina/ (client) + Capture/ (= Patina Field, designer/trades)
├── services/
│   ├── orders/                # NestJS — payments plumbing, EasyPost (port 3015; Stripe module intentionally dormant)
│   ├── media/                 # NestJS — image processing; storage = Cloudflare R2 (MinIO locally) (port 3014)
│   ├── projects/              # NestJS — project collab; realtime via Supabase broadcast, no WebSockets (port 3016)
│   └── aesthete-inference/    # Python/FastAPI + ONNX embeddings (deploys via infra/inference-worker)
├── packages/                  # 14 workspace packages; the load-bearing ones:
│   ├── supabase/              # Data access layer: clients + ~88 React Query hook modules + generated types
│   ├── types/                 # Shared TypeScript domain types (hand-authored camelCase — NOT DB row shapes)
│   ├── patina-design-system/  # ~128 UI components (Radix + Tailwind)
│   ├── api-routes/            # Next.js API route middleware (proxy to services: retry + caching; NO circuit breaker)
│   ├── auth/                  # NestJS guards for Supabase JWTs (PermissionsGuard is a no-op stub)
│   └── …                      # utils, api-client, cache, email, notifications, shared, catalog-ui, help-system, aesthete-quiz
├── studios/
│   └── help-system/           # Sanity Studio CMS (distinct from packages/help-system)
├── supabase/
│   ├── migrations/            # Sequential hand-numbered NNNNN_slug.sql (head 00284 at last count)
│   ├── functions/             # ~45 Deno edge functions + _shared/ + _tests/
│   ├── seed/                  # Dev seed data — only files wired in config.toml [db.seed] sql_paths run
│   └── config.toml            # Local Supabase config (ports, verify_jwt flags, seed list)
├── infra/
│   ├── deploy-portal.sh       # THE ONLY portal deploy path (see Deploying below)
│   ├── {orders,projects,media-svc,media,inference}-worker/   # Cloudflare Containers/Queues units (wrangler deploy)
│   └── …                      # Coolify/tunnel/GHCR files are LEGACY (dead box) — do not run them
├── docker-compose.yml         # Local dev infrastructure (Redis, MinIO, Mailhog)
└── turbo.json                 # Turborepo pipeline
```

### Auth: Supabase Only

All authentication uses Supabase Auth (GoTrue). There is no NextAuth.

- **Frontend**: `useAuth()` hook from each portal's `src/hooks/use-auth.ts` (thin RBAC adapter over `@patina/supabase`)
- **No SessionProvider needed**: Supabase hooks manage state internally
- **NestJS services**: validate Supabase JWTs (`SUPABASE_JWT_SECRET` locally, JWKS on Cloud) via `@patina/auth`
- **API routes**: `@patina/api-routes` extracts the user from the Supabase JWT

```typescript
// Frontend auth usage (any portal)
import { useAuth } from '@/hooks/use-auth';
const { user, isAuthenticated, signIn, signOut } = useAuth();
```

### Database

One Supabase PostgreSQL per environment (prod = Strata). NestJS services isolate via the connection string's `?schema=` param (no Prisma multiSchema):
- `svc_orders` / `svc_media` / `svc_projects` — the three services
- `public` — everything accessed via the Supabase client (products, users, projects, rooms, …)

### Key Packages

**`@patina/supabase`** — the main data access layer: `createBrowserClient()` / `createServerClient()` / `createMiddlewareClient()`, ~88 React Query hook modules (authoritative list: `src/hooks/index.ts`), generated `database.types.ts` (regenerate with `pnpm db:generate` after schema changes; never hand-edit).

**`@patina/types`** — canonical domain types. Import, never redefine. They are hand-authored camelCase shapes, not DB rows — confirm a column exists in `database.types.ts` before relying on a field.

**`@patina/design-system`** — ~128 Radix + Tailwind components. Portal-canonical form controls are app-local at `src/components/ui/controls/` (clay primary), not in this package.

**`@patina/api-routes`** — Next.js route middleware proxying to NestJS services: retry (mutations NOT retried by default) + caching. There is intentionally no circuit breaker.

### Service Ports

| Service | Port | | Service | Port |
|---------|------|-|---------|------|
| Designer Portal | 3000 | | Supabase API (Kong) | 54321 |
| Admin Portal | 3001 | | Supabase DB (Postgres) | 54322 |
| Client Portal | 3002 | | Supabase Studio | 54323 |
| Manufacturer Portal | 3003 | | Inbucket (GoTrue/auth email) | 54324 |
| Media Service | 3014 | | Redis | 6379 |
| Orders Service | 3015 | | MinIO API / Console | 9000 / 9001 |
| Projects Service | 3016 | | Mailhog (app SMTP email) | 8025 |

Two local email inboxes: auth emails (magic links, confirmations) land in **Inbucket** (:54324); app-sent SMTP lands in **Mailhog** (:8025).

## Environment Variables

All portals need `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and (server-side) `SUPABASE_SERVICE_ROLE_KEY`. Services need `DATABASE_URL` (with `?schema=`), `SUPABASE_JWT_SECRET`, and Redis config. See each `.env.example`.

- Frontend vars need the `NEXT_PUBLIC_` prefix and are inlined at build/dev start. Never commit `.env` files.
- **Prod portal env lives in `apps/*/wrangler.jsonc` `vars` blocks** (committed literals), not `.env` — changing a prod value means editing wrangler.jsonc and redeploying.
- ⚠ `apps/*/.env.local` has pointed at Strata **prod** before. Check `NEXT_PUBLIC_SUPABASE_URL` before any destructive local action (see patina-local-dev).

## Common Tasks

### Adding a Supabase migration

Migrations are **hand-numbered** `NNNNN_slug.sql` — never run `supabase migration new` (it emits timestamp names that break the convention).

```bash
ls supabase/migrations/*.sql | sort | tail -1   # take the next number
# write supabase/migrations/<next>_my_change.sql
pnpm supabase:reset                              # apply locally (full replay + seeds)
pnpm db:generate                                 # regenerate database.types.ts (needs SUPABASE_DB_URL)
```

Schema-qualify extension functions (`extensions.uuid_generate_v5(...)`) — the prod `db push` session's search_path lacks `extensions`. If the migration adds GRANT/REVOKEs, regenerate the local ACL seed: `python3 scripts/generate-legacy-grants.py`. Full rules (numbering collisions, RPC head-body discipline, RLS/grants): **patina-db-migrations** skill.

### Adding a new Supabase hook

Add to `packages/supabase/src/hooks/` and export from `src/hooks/index.ts`. Query-key and invalidation conventions: **patina-portal-features** skill.

### Modifying a NestJS service schema

```bash
cd services/orders  # or media, projects
# Edit prisma/schema.prisma
npx prisma generate
npx prisma db push                          # development
npx prisma migrate dev --name description   # production migration
```

### Working with the design system

```bash
cd packages/patina-design-system
pnpm storybook      # component development (:6006)
pnpm test           # vitest
```

### Deploying to production

Prod mutations require an explicit user request in the current session; a "ship X" request authorizes the full chain (migrate → functions/services → portals → verify) without per-step re-asking. Full procedures + verification: **patina-deploy** skill.

- **Portals** (client/designer/admin/manufacturer → Cloudflare Workers): **always** `./infra/deploy-portal.sh <name>` — never run `opennextjs-cloudflare build` directly. The script first rebuilds workspace-package dists (`turbo build --filter=<pkg>^...`); skipping that bundles a **stale dist** (this exact mechanism shipped `TypeError: proposalTierVisibility is not a function` to prod).
- **Services** (Cloudflare Containers): `cd infra/<unit>-worker && npx wrangler deploy`.
- **Migrations / edge functions** (Strata): `supabase db push` / `supabase functions deploy <name>` (CLI is linked). A `_shared/*` edit requires redeploying every importing function.
- `/version` endpoints return static defaults on the live path — verify deploys by `wrangler deployments list` (oldest-first; read the bottom) + behavior probes, not version strings.

## Important Conventions

- **Using Fable**: when the session model is Fable, use Fable **only** for planning, architecture, and orchestration (including the adversarial review of returned work) — it never executes, even for tasks that look quick. Dispatch all execution — code changes, migrations, tests, deploys, debugging legwork, bulk research — to subagents on the model that fits the task; on completion Fable reviews, then returns to the user or re-instructs the subagents.
  - **Opus** — complex implementation, hard debugging, cross-cutting refactors, work where the first attempt must be right.
  - **Sonnet** — standard feature/hook/edge-function implementation, test writing, most execution.
  - **Haiku** — mechanical edits, renames, bulk changes, file searches, simple lookups.
- **Auth**: always Supabase Auth. Never add NextAuth.
- **Data access**: `@patina/supabase` hooks for Supabase data; `@patina/api-routes` proxy for NestJS service data. No ad-hoc `fetch` to services.
- **Types**: import from `@patina/types`, never redefine.
- **Components**: use `@patina/design-system` (rich components) and the portal-local `ui/controls` (form controls).
- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`). Group logical changes; push at task end (feature branches included).
- **Git hygiene**: never `git add -A` (the tree carries untracked landmines) — stage explicit pathspecs. Concurrent agents/sessions each get their own worktree (see patina-parallel-work; a shared-checkout commit once swallowed 286 foreign files).
- **NestJS services**: only orders, media, and projects. Do not add new NestJS services — use Supabase edge functions instead.
- **No CI gates exist**: nothing runs tests/types/lint on push or PR, and the docker-publish workflow is dead — local verification is the only verification (see patina-verification).
