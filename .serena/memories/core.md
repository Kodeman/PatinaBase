# core — Patina monorepo source map & invariants

Supabase-first hybrid monorepo. Root `package.json` name is `patina-monorepo`, pnpm@9 workspaces via `pnpm-workspace.yaml` (`apps/* packages/* services/* studios/*`), Turborepo. Read root `CLAUDE.md` for the authoritative overview — but it is stale on several counts (flagged below). Verify against the tree.

## Top-level layout (verified on disk)

### apps/
- `designer-portal` — Next 15, primary workspace, port 3000. Pkg `@patina/designer-portal`.
- `admin-portal` — Next 15, port 3001.
- `client-portal` — Next 15 PWA, port 3002.
- `manufacturer-portal` — **NOT in CLAUDE.md.** Next 15, port **3003**, pkg `@patina/manufacturer-portal`. Intentional **scaffold** (Sprint-3 S3.9): only 3 files (`layout.tsx`, `page.tsx`, `onboarding/page.tsx`), depends on `@patina/supabase`. NOT wired into any `dev:*` script or turbo filter — won't start via the standard workflows. Not abandoned, just pre-pilot.
- `extension` — Chrome extension, **Plasmo** (`plasmo dev/build`), pkg `@patina/extension`.
- `mobile` — two Xcode projects side by side: `apps/mobile/Patina` (main iOS SwiftUI app) and `apps/mobile/Capture` (standalone Field Capture camera app; `Capture.xcodeproj`, `CaptureKit`, share ext + widgets). Has its own `apps/mobile/CLAUDE.md`.

### services/ (retained NestJS + 1 Python)
- `orders` (3015), `media` (3014), `projects` (3016) — NestJS + Prisma, schema-isolated (`svc_orders`/`svc_media`/`svc_projects`). Pkgs `@patina/{orders,media,projects}`.
- `aesthete-inference` — **NOT a NestJS service; Python/FastAPI** embedding worker (has `app/`, `Dockerfile`, `requirements*.txt`, `pytest.ini`, no package.json). Wave-1 Aesthete Engine. CLAUDE.md's "3 NestJS services" is right but this 4th Python service also lives here.

### packages/ (all `@patina/<name>`)
Listed in CLAUDE.md: `supabase` (main data layer, hooks + generated `database.types.ts`), `types` (canonical domain types), `patina-design-system` (pkg name `@patina/design-system`), `api-routes` (Next proxy middleware), `auth` (NestJS guards), `utils`, `cache`, `email`, `notifications`, `api-client`, `shared` (`@patina/shared`, zod; used by extension + all portals).
**On disk but NOT in CLAUDE.md's package list:**
- `catalog-ui` — `@patina/catalog-ui` (dnd-kit + radix). **Wired**: consumed by extension, admin-portal, designer-portal.
- `aesthete-quiz` — `@patina/aesthete-quiz`. **Wired**: consumed by client-portal. Has `WIRE-CONTRACT.md` (treat shape as a contract).
- `help-system` — `@patina/help-system` (Sanity-backed, `@portabletext/react`). **Wired**: consumed by all 3 main portals. NOTE the `@portabletext/react` ESM transform gotcha (see MEMORY.md jest notes).

### supabase/
- `migrations/` — hand-numbered sequential `NNNNN_slug.sql`; counts drift fast, never trust a hardcoded number — check the head via `ls supabase/migrations/*.sql | sort | tail -1`.
- `migrations/_pending/` — held-back migrations not in the applied chain (currently `00106_drop_client_messages.sql`). Do not assume everything under migrations/ is applied.
- `functions/` — Deno edge functions (count drifts; `ls supabase/functions`).
- `seed/`, `config.toml`.

### Other top-level
- `docs/` — large: `prds/` (AE, Guide, …), `design/`, `product/`, `qa/`, `specs/`, `architecture/`, `code-review/`, `operations/`, `handoffs/`, `implementation/`, `wireframes/`, `follow-ups/`.
- `scripts/` — repository hooks/policy, local fixtures, evaluation tools, type/grant generation, and targeted verification helpers; enumerate the current tree rather than trusting a fixed count.
- `studios/help-system` — Sanity Studio for the help system (project `kv3qrinl`).
- `infra/` — Cloudflare Worker/Container units plus the portal deployment entrypoint.

## Project-wide invariants
- **Auth is Supabase Auth (GoTrue) only.** No NextAuth anywhere. Frontend via `useAuth()` (each portal wraps `@patina/supabase`); NestJS validates JWT via `SUPABASE_JWT_SECRET`.
- **Data access split:** Supabase data → `@patina/supabase` hooks; NestJS-service data → `@patina/api-routes` proxy (retry + caching; intentionally NO circuit breaker). Types → always `@patina/types`. UI → `@patina/design-system` (~128 Radix+Tailwind components (count drifts)).
- **DB:** Supabase Cloud Strata. `public` schema via Supabase client; `svc_*` schemas via Prisma per retained service.
- **Do not add new NestJS services** — use Supabase edge functions. The 3 NestJS services are frozen.
- **Do NOT run `pnpm dev`** (concurrency-20, starts everything). Use `dev:minimal`/`dev:designer` (portal+orders+media+projects), `dev:admin`, `dev:client`, `dev:frontend`, `dev:backend`. All are `turbo run dev --filter=…`.
- **Turbo tasks:** build, dev, lint, lint:fix, type-check, test, clean. DB helpers: `db:generate|push|studio` (→ `@patina/supabase`); production Strata migrations use the linked Supabase CLI only when explicitly authorized. Prisma remains across the 3 retained services.
- **Migrations before app** on approved production releases; portals and service Containers deploy through the current Cloudflare procedures.
