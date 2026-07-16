# Conventions — code style, naming, patterns

Verified against the tree 2026-07-02. CLAUDE.md states the intent but several of its
counts/lists are stale — deltas flagged below. When in doubt, trust the tree.

## Workspace / naming
- pnpm@9 workspaces + Turborepo. Workspace globs (`pnpm-workspace.yaml`): `apps/*`,
  `packages/*`, `services/*`, **`studios/*`** (Sanity help-system studio — CLAUDE.md omits it).
- Every internal package is `@patina/<name>`. The design-system package is
  **`@patina/design-system`** even though its folder is `packages/patina-design-system`.
- Apps (6): designer-portal, admin-portal, client-portal, **manufacturer-portal** (real,
  Next.js — NOT in CLAUDE.md), extension (Plasmo), mobile (Swift).
- Packages (14): supabase, types, patina-design-system, api-routes, api-client, auth, utils,
  cache, email, notifications, shared, plus **aesthete-quiz, catalog-ui, help-system**
  (last three missing from CLAUDE.md's list).
- Services (4): orders, media, projects (NestJS) **+ aesthete-inference (Python/FastAPI)**.
  Rule "3 NestJS services, don't add new NestJS ones — use Supabase edge functions" holds;
  aesthete-inference is the sanctioned non-NestJS worker exception.

## Auth = Supabase only (no NextAuth)
- The `app/api/auth/[...nextauth]/route.ts` files in portals are **legacy gravestones** that
  return HTTP 410 ("Auth is now handled by Supabase"). No `next-auth` dependency exists. Do
  not resurrect them.
- Each portal wraps `@patina/supabase` primitives (`useSession`, `useProfile`) in a
  **portal-local `@/hooks/use-auth`** at `src/hooks/use-auth.ts` (note the `src/` — apps use
  the `src/` app-dir layout). Consumers use `const { user, isAuthenticated, signIn, signOut } = useAuth()`.
- RBAC helpers (Role/Permission/hasPermission) live per-portal in `@/lib/rbac`; roles come
  from Supabase JWT `app_metadata.roles` (fallback `['designer']`).
- NestJS services validate Supabase JWTs via `SUPABASE_JWT_SECRET`.

## Data access — two lanes, do not mix
- **Supabase data → `@patina/supabase` React Query hooks.** ~80 hook files in
  `packages/supabase/src/hooks/`, all named `use-<domain>.ts`, re-exported through a single
  barrel `hooks/index.ts` (explicit named re-exports + types, not `export *`). Add a new hook
  there and export it from the barrel.
- **NestJS service data → `@patina/api-routes` proxy inside a Next.js `app/api/**/route.ts`.**
  Pattern: `export const GET = createRouteHandler(async (req, ctx) => await proxyToBackend(req, ctx, {...}), { method: 'GET' })`.
  `proxyToBackend` config carries `service {name,baseUrl,path}`, `requireAuth`, `retry`,
  `timeout`, `cache` (retry + circuit-breaker + cache built in). Service base URL comes from
  env like `PROJECTS_SERVICE_URL` (falls back to `http://localhost:301x`). Wrap in try/catch →
  `apiError(error)`.

## Types & components
- Domain types come from **`@patina/types`** — never redefine. Split by domain file
  (ffe.ts, order.ts, crm.ts, comms.ts, catalog.ts, permissions.ts, ...) with a barrel `index.ts`.
- UI from **`@patina/design-system`** (~307 `.tsx` under `src/components`, plus `hooks/`,
  `tokens/`, `styles/`). Canonical control kit lives under `ui/controls/` (clay primary;
  `PortalButton` is an alias) — prefer these over ad-hoc buttons.

## Tooling config (per-package, not centralized)
- Root `tsconfig.json` is a minimal shared base (`strict`, `noEmit`, `moduleResolution: bundler`,
  `target ES2022`, `isolatedModules`); packages extend it.
- **ESLint is per-package and mixed**: designer-portal uses flat `eslint.config.mjs` (ESLint v9);
  client-portal still on legacy `.eslintrc.json`; NestJS services on `.eslintrc.js`. There is
  **no** root ESLint or Prettier config file — run `pnpm lint` / `pnpm format` from root (Turbo).
- **Dev**: use the selective scripts (`pnpm dev:designer`, `dev:admin`, `dev:client`,
  `dev:frontend`, `dev:backend`), NOT bare `pnpm dev`.

## Database / migrations / edge functions
- Single Supabase Postgres. Migrations in `supabase/migrations/` — **~253** (CLAUDE.md's "52"
  is very stale); numbered `00NNN_*`. Edge functions in `supabase/functions/` — **~40**, Deno,
  with a shared `deno.json` + `_shared/` helpers.
- NestJS Prisma **schema isolation is via the connection string** `?schema=svc_orders`
  (search_path) in `DATABASE_URL`/`DIRECT_URL`, plus `@@schema`/`@@map` annotations on models.
  Each service generates its own client (`output = ../src/generated/prisma-client`). Schemas:
  `svc_orders`, `svc_media`, `svc_projects`; everything else is `public` (via Supabase client).

## Env & commits
- Frontend env vars need the `NEXT_PUBLIC_` prefix; `SUPABASE_SERVICE_ROLE_KEY` is server-only.
  Never commit `.env` files.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`), usually
  scoped, e.g. `feat(the-document): ...`. Commit + push at the end of each task (grouped into
  logical commits).
