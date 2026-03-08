# CLAUDE.md

## Project Overview

Patina is a custom home furnishing platform connecting interior designers with manufacturers. This is a **Supabase-first hybrid monorepo** — Supabase handles auth, database, realtime, and storage, while 3 retained NestJS services handle complex domains (orders, media, projects).

## Technology Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, TanStack Query
- **Auth**: Supabase Auth (GoTrue) — no NextAuth
- **Database**: Single Supabase PostgreSQL (self-hosted at api.patina.cloud)
- **Backend**: 3 NestJS services (orders, media, projects) using Prisma with schema isolation
- **Infrastructure**: Coolify + Cloudflare Tunnel (production), Docker Compose + Supabase CLI (local)
- **Native**: iOS app (Swift/SwiftUI), Chrome extension (Plasmo)

## Essential Commands

```bash
# Install dependencies
pnpm install

# Start local infrastructure (Redis, MinIO, Mailhog)
docker compose up -d

# Start Supabase (Postgres, Auth, Realtime, Storage, Studio)
pnpm supabase:start          # Studio at http://localhost:54323

# Stop Supabase
pnpm supabase:stop

# Generate Prisma clients for retained NestJS services
pnpm prisma:generate

# Push Prisma schemas to Supabase Postgres
pnpm prisma:push

# Development (use selective workflows — NOT `pnpm dev`)
pnpm dev:minimal              # Designer Portal + 3 NestJS services
pnpm dev:designer             # Same as minimal (most common workflow)
pnpm dev:admin                # Admin Portal + orders + media
pnpm dev:client               # Client Portal + orders + projects
pnpm dev:frontend             # All 3 portals (no backend)
pnpm dev:backend              # All NestJS services (no frontend)

# Build
pnpm build                    # Build all (Turborepo handles dependency order)

# Test
pnpm test                     # Run all tests

# Lint
pnpm lint
pnpm format
pnpm type-check
```

## Architecture

### Monorepo Structure

```
patina/
├── apps/
│   ├── designer-portal/       # Next.js 15 — primary designer workspace (port 3000)
│   ├── admin-portal/          # Next.js 15 — admin dashboard (port 3001)
│   ├── client-portal/         # Next.js 15 — client-facing PWA (port 3002)
│   ├── extension/             # Plasmo Chrome extension (product capture)
│   └── mobile/                # Swift/SwiftUI iOS app (room scans, QR auth)
├── services/
│   ├── orders/                # NestJS — Stripe payments, EasyPost shipping (port 3015)
│   ├── media/                 # NestJS — image processing, MinIO/S3 storage (port 3014)
│   ├── projects/              # NestJS — real-time collab, WebSocket (port 3016)
│   └── aesthete-engine/       # Python/FastAPI ML (deferred, not deployed)
├── packages/
│   ├── supabase/              # Supabase client + 35 React Query hooks + generated types
│   ├── types/                 # Shared TypeScript domain types
│   ├── patina-design-system/  # 122 UI components (Radix + Tailwind)
│   ├── api-routes/            # Next.js API route middleware (proxy, retry, circuit breaker)
│   ├── auth/                  # NestJS auth guards and decorators (for retained services)
│   ├── utils/                 # Shared utilities
│   ├── cache/                 # Redis caching abstractions
│   ├── email/                 # React Email templates (Resend)
│   ├── notifications/         # Automation engine, audience segmentation
│   ├── api-client/            # API client library (used by portals)
│   └── shared/                # Shared types for Chrome extension (@patina/shared)
├── supabase/
│   ├── migrations/            # 52 SQL migrations
│   ├── functions/             # 11 Deno edge functions
│   ├── seed/                  # Development seed data
│   └── config.toml            # Supabase project config
├── infra/
│   ├── docker-compose.supabase.yml    # Production Supabase stack (Coolify)
│   ├── docker-compose.services.yml    # Production services (Coolify)
│   ├── docker-compose.backend-infra.yml # Redis, Typesense, Qdrant, MinIO
│   ├── cloudflare-tunnel-config.yml   # Cloudflare Tunnel routing
│   └── Dockerfile.nextjs             # Multi-stage Next.js Dockerfile
├── docker-compose.yml         # Local dev infrastructure (Redis, MinIO, Mailhog)
└── turbo.json                 # Turborepo build pipeline
```

### Auth: Supabase Only

All authentication uses Supabase Auth (GoTrue). There is no NextAuth.

- **Frontend**: `useAuth()` hook from `@patina/supabase` — wraps `supabase.auth.onAuthStateChange()`
- **No SessionProvider needed**: Supabase hooks manage state internally
- **NestJS services**: Validate Supabase JWTs via `SUPABASE_JWT_SECRET`
- **API routes**: `@patina/api-routes` extracts user from Supabase JWT

```typescript
// Frontend auth usage (any portal)
import { useAuth } from '@/hooks/use-auth';
const { user, isAuthenticated, signIn, signOut } = useAuth();

// Each portal has its own hooks/use-auth.ts wrapping @patina/supabase
```

### Database

Single Supabase PostgreSQL instance. NestJS services use Prisma with schema isolation:
- `svc_orders` schema — orders service
- `svc_media` schema — media service
- `svc_projects` schema — projects service
- `public` schema — everything accessed via Supabase client (products, users, rooms, etc.)

### Key Packages

**`@patina/supabase`** — The main data access layer. Contains:
- `createBrowserClient()`, `createServerClient()`, `createMiddlewareClient()`
- 35 React Query hooks covering all domains (products, projects, rooms, teaching, campaigns, vendors, insights, etc.)
- Generated database types (`database.types.ts`)

**`@patina/types`** — Canonical domain types. Always import from here, never redefine.

**`@patina/design-system`** — 122 Radix + Tailwind components. Use these in all portals.

**`@patina/api-routes`** — Next.js API route middleware for proxying to NestJS services with retry, circuit breaker, and caching.

### Service Ports

| Service | Port |
|---------|------|
| Designer Portal | 3000 |
| Admin Portal | 3001 |
| Client Portal | 3002 |
| Media Service | 3014 |
| Orders Service | 3015 |
| Projects Service | 3016 |
| Supabase API (Kong) | 54321 |
| Supabase DB (Postgres) | 54322 |
| Supabase Studio | 54323 |
| Redis | 6379 |
| MinIO API | 9000 |
| MinIO Console | 9001 |
| Mailhog Web | 8025 |

## Environment Variables

All portals need:
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase API URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` — Server-side only, admin access

NestJS services need:
- `DATABASE_URL` — Postgres connection string with schema isolation
- `SUPABASE_JWT_SECRET` — For JWT validation
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` — Redis connection

See each app/service `.env.example` for full configuration.

## Common Tasks

### Adding a Supabase migration
```bash
cd supabase
supabase migration new my_migration_name
# Edit supabase/migrations/TIMESTAMP_my_migration_name.sql
supabase db reset  # Apply locally
```

### Adding a new Supabase hook
Add to `packages/supabase/src/hooks/` and export from `packages/supabase/src/hooks/index.ts`.

### Modifying a NestJS service schema
```bash
cd services/orders  # or media, projects
# Edit prisma/schema.prisma
npx prisma generate
npx prisma db push  # Development
npx prisma migrate dev --name description  # Production migration
```

### Working with the design system
```bash
cd packages/patina-design-system
pnpm storybook      # Component development
pnpm test           # Run tests
```

## Important Conventions

- **Auth**: Always use Supabase Auth. Never add NextAuth.
- **Data access**: Use `@patina/supabase` hooks for Supabase data. Use `@patina/api-routes` proxy for NestJS service data.
- **Types**: Import from `@patina/types`, never redefine.
- **Components**: Use `@patina/design-system` components.
- **Commits**: Follow Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
- **Environment variables**: Frontend vars need `NEXT_PUBLIC_` prefix. Never commit `.env` files.
- **NestJS services**: Only orders, media, and projects. Do not add new NestJS services — use Supabase edge functions instead.
