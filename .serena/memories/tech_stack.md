# Tech Stack

Supabase-first hybrid monorepo. Verified against the tree 2026-07-02 (CLAUDE.md is partly stale — see "CLAUDE.md drift" below).

## Monorepo tooling
- **pnpm** workspaces (`packageManager: pnpm@9.0.0`, `engines.node >=20`) + **Turborepo** (`turbo ^2`).
- pnpm-workspace globs: `apps/*`, `packages/*`, `services/*`, `studios/*`.
- TS **5.x** everywhere (pins vary 5.3–5.8 per package); ESLint **9** (flat config), Prettier 3.
- Run dev via the selective `dev:*` turbo filters — NOT bare `pnpm dev`. Build order via Turbo (`dependsOn: ["^build"]`); worktree builds must run through turbo (dist/ dep gotcha).
- Turbo strict env: shell-exported `NEXT_PUBLIC_*` need `globalPassThroughEnv` (only `NEXT_PUBLIC_FLAG_OVERRIDES` is passed through today).

## Frontend (all portals)
- **Next.js 15** (App Router) + **React 19** + TS. TanStack Query 5, react-hook-form 7, zod 3, Tailwind, Radix UI, lucide-react, tailwind-merge.
- Portals: designer-portal, admin-portal, client-portal (+ **manufacturer-portal** — real, not in CLAUDE.md). client-portal is a PWA (`next-pwa`) and uses three / @react-three/fiber (also in designer-portal).
- `@supabase/ssr` + `@supabase/supabase-js` (^2) for auth/data. NO NextAuth.

## Auth & data access
- **Supabase Auth (GoTrue)** only. Frontend: `useAuth()` per-portal wrapping `@patina/supabase`. NestJS: validate Supabase JWT via `SUPABASE_JWT_SECRET`.
- `@patina/supabase` is the data layer: browser/server/middleware clients, ~35 React Query hooks, generated `database.types.ts` (via `supabase gen types typescript`).
- Types come from `@patina/types`; UI from `@patina/design-system`; NestJS proxy via `@patina/api-routes`.

## Backend — NestJS services (retained)
- **NestJS 10** + **Prisma 5** (`@prisma/client ^5.22`): `orders` (Stripe ^14, EasyPost ^8, Bull/Redis), `media` (sharp, BullMQ, AWS S3 SDK v3 / MinIO), `projects` (socket.io ^4, WebSockets, Bull). Convention: do NOT add new NestJS services — use Supabase edge functions.
- **Schema isolation is via the DATABASE_URL `?schema=svc_orders|svc_media|svc_projects` search_path (+ pgbouncer on prod), NOT Prisma `multiSchema`.** No `@@schema`/`previewFeatures` in the schemas. Prisma client output is a custom path `src/generated/prisma-client` (not node_modules) — regenerate after schema edits.
- `services/aesthete-inference` is **Python 3.12 / FastAPI** (uvicorn, onnxruntime, tokenizers, pillow, numpy) — the embedding worker, NOT NestJS. So `services/` has 4 dirs but only 3 are NestJS.

## Database
- Single self-hosted **Supabase Postgres, major_version 15** (supabase/config.toml). `public` schema via Supabase client; svc_* schemas via Prisma. (Orders schema.prisma header comment "PostgreSQL 16 on OCI" is stale.)
- **254 SQL migrations** (`supabase/migrations`, latest `00254_*`) and **39 edge functions** (Deno) — CLAUDE.md's "52 migrations / 33+ functions" is very stale.

## Native / extension
- **iOS: Swift/SwiftUI** — TWO Xcode projects under `apps/mobile`: `Patina/` (main app) and `Capture/` (Field Capture camera app). ~2200 .swift files. Uses RoomPlan/ARKit for scans.
- **Chrome extension**: Plasmo (`plasmo ^0.90`), `@plasmohq/storage`, **React 18.3** + Vitest. It is the ONLY React-18 surface — everything else is React 19 (duplicate-React dedupe gotcha).

## Shared packages (beyond CLAUDE.md's list)
- Also present, unlisted in CLAUDE.md: `aesthete-quiz`, `catalog-ui` (react19 lib), `help-system` (Sanity-backed help UI: `@sanity/client`, `@portabletext/react`, Storybook 8 + Vite/Vitest).
- `studios/help-system` = a **Sanity Studio** (`sanity ^3.88`, React 19) — separate workspace root.
- `@patina/design-system` builds on **Tailwind v4** (dev dep `tailwindcss ^4.0.0`) + Vite/Vitest/Storybook 8, while the portals still run **Tailwind v3.4** — version split to be aware of.

## CLAUDE.md drift (verify tree, don't trust the doc)
- Missing app: `manufacturer-portal`. Missing packages: `aesthete-quiz`, `catalog-ui`, `help-system`. Missing native app: `mobile/Capture`.
- Stale counts: migrations (254 not 52), edge functions (39 not 33+).
- "3 NestJS services" is still accurate as a convention; aesthete-inference is Python.
