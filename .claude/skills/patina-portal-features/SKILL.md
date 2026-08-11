---
name: patina-portal-features
description: Use when adding or changing pages, routes, components, hooks, or data access in Patina's Next.js portals (designer/admin/client/manufacturer) — route groups under src/app, React Query hooks, @patina/supabase data, @patina/api-routes proxies to NestJS services, design-system controls, PostHog feature-flag gating, or editing shared workspace packages a portal consumes. Also when a portal serves stale UI after a package edit or gated UI won't render.
---
# Building Portal Features (Next.js portals)

Last verified: 2026-07-09 (main @ c4de810d, migrations head 00284). Re-verify load-bearing claims if the repo has moved.

Primary exemplar throughout: the **procurement** zone in `apps/designer-portal`. Read it before inventing a new pattern.

## Use when / Don't use when
- USE when: adding/editing a portal route, page, component, or React Query hook; wiring Supabase or NestJS-backed data; gating UI behind a PostHog flag; editing a shared `@patina/*` package a portal imports; a portal serves stale code after a package edit; gated UI won't appear.
- DON'T use for: schema/migrations (patina-db-migrations), edge functions (patina-edge-functions), running/booting local infra or flag env setup (patina-local-dev), driving the built app to verify (patina-verification), shipping to prod (patina-deploy/patina-prod-ops), Stripe surfaces (patina-stripe-payments), iOS (patina-ios-verification).
- Scope boundary: this skill is web portal source. Booting servers and `.env.local` mechanics live in patina-local-dev; proving a change works at runtime lives in patina-verification.

## Procedure
Route placement first:
- Routes live under `apps/<portal>/src/app/` with route groups, each owning its own `layout.tsx`. In designer-portal:
  - `(document)/` = The Document surfaces: `desk`, `doc`, `drafting`, `compose`, `library`, `people`.
  - `(portal)/portal/` = ~29 zone features: `clients`, `projects`, `proposals`, `procurement`, `vendors`, `leads`, `rooms`, ...
- New zone-style feature → `(portal)/portal/<feature>/`. Document-native surface → `(document)/`.
- `/desk` vs `/portal`: middleware sends authed users to `/portal`. `(portal)/portal/page.tsx` runs `router.replace('/desk')` only when flag `the-document-pilot` resolves on (THE FLIP / R21); `(document)/document-gate.tsx` bounces `/desk`→`/portal` when it's off. Rollback = flag off. Do NOT "fix" either redirect — the flag is the toggle.

Golden path for a flag-gated zone (verified against procurement):
1. **Flag-gate at the route-group `layout.tsx`.** `const { value: enabled, isLoading } = useFeatureFlag('<flag>')` from `@/hooks/use-feature-flag`. Fail-closed — the hook defaults to `{ value: false, isLoading: true }`.
   - Never render gated content while `isLoading` — that flashes gated UI to non-pilot users.
   - Simplest (procurement's): `if (isLoading || !enabled) return <ComingSoon/>`. Pilot users see a brief fallback flash during PostHog cold-load, accepted per C-02.
   - Flash-free (recommended in the `use-feature-flag` doc): render a neutral skeleton while `isLoading`, branch on `value` only after.
   - Inline slot: `{enabled && <Card/>}` — `value` defaults false, so the slot stays hidden until the flag resolves.
2. **Zone root redirects to the default sub-tab.** `procurement/page.tsx` → `redirect('/portal/procurement/by-vendor')` (keeps per-view active-state simple).
3. **Pages are `'use client'`; gate the loading skeleton on hydration.** `const hydrated = useHydrated()` from `@/hooks/use-hydrated`; `if (!hydrated || isLoading) return <Skeleton/>`.
   - Why: the app shares ONE module-level TanStack QueryClient (`src/lib/react-query.ts`); without the `!hydrated` gate a warm client cache diverges from the empty SSR cache → "Hydration failed" + shifted `useId`.
   - **All hooks must sit above every early return** — a conditional return reorders hooks and breaks hydration.
4. **Supabase data via `@patina/supabase` hooks** (`packages/supabase/src/hooks/`, ~85 modules / 148 exports; `src/hooks/index.ts` is the authoritative list). Extend there and export from `hooks/index.ts`.
   - Clients come from the same package: `createBrowserClient()` (components), `createServerClient()` (server components / route handlers), `createMiddlewareClient()` (middleware). Don't hand-roll a client.
   - `packages/supabase/src/database.types.ts` is GENERATED — regenerate with `pnpm db:generate` after a schema change, never hand-edit (patina-db-migrations).
   - Query keys — lists: plural domain + params, `['purchase-orders', filters]`. Entities: singular + id, `['purchase-order', id]`.
   - Keep exactly ONE canonical key per entity — a dual-key split once left FF&E UI stale; now unified on `['project-ffe-items', id]`.
   - A mutation invalidates its list key AND every cross-domain key it touches. Example: `use-procurement.ts` invalidates `['project-ffe-items', projectId]`, `['projects', projectId]`, and `['procurement-items']` on a win.
5. **NestJS-backed data (orders/media/projects services) via a proxy route.** Add `src/app/api/<x>/route.ts` using `createRouteHandler` + `proxyToBackend` from `@patina/api-routes`. Canonical: `apps/designer-portal/src/app/api/projects/route.ts`.
   - Config: `baseUrl` from an env var (e.g. `PROJECTS_SERVICE_URL`, falls back to `http://localhost:3016`), `requireAuth: true` (the default), `retry` with backoff, `timeout`, optional `cache`.
   - **Mutations are NOT retried by default** — the retry predicate sets `shouldRetryMutation: false`, so POST/PUT/PATCH/DELETE won't retry even with `maxRetries` set (a `maxRetries: 2` on a POST is inert unless you also pass `shouldRetryMutation: true`).
   - **There is NO circuit breaker** — `proxy-to-backend.ts` documents "Intentionally no circuit breaker" (the in-process CB was removed); older docs claimed one; `proxy-to-backend.ts` is authoritative.
   - Portal-local hooks in `src/hooks/` call these routes via `@/lib/api-client` using the `queryKeys` factory in `@/lib/react-query`.
6. **Controls.** Portal-canonical form controls are app-local at `apps/<portal>/src/components/ui/controls/`, NOT in the design-system package (`button`, `input`, `select`, `textarea`, `status-badge`, `filter-pill`, `icon-button`; clay primary via `--accent-primary`; variants primary/secondary/ghost/danger). Richer components (~128 Radix + Tailwind) from `@patina/design-system`.
   - TRAP: the app-local `Button` implements `asChild` with `React.cloneElement` → it accepts exactly ONE element child (a fragment or multiple children breaks it).
   - The `@patina/design-system` `Button` uses a real Radix `Slot` and handles multiple/complex children. Do not conflate the two.
7. **Types.** Import domain types from `@patina/types` (barrel `packages/types/src/index.ts`). DB row shapes come from the generated `packages/supabase/src/database.types.ts`. Never redefine. CAUTION: `@patina/types` interfaces are hand-authored **camelCase domain shapes** (e.g. `Product`) — they are NOT the DB row (`products` Row is snake_case, e.g. `dimensions`, `match_score`). Before relying on a field for real data, confirm the column exists in `database.types.ts`.
8. **Analytics** live in namespaced modules `src/lib/analytics/<domain>-events.ts` (e.g. `procurement-events.ts`, `document-events.ts`), fired from layouts/pages — never inline `posthog.capture` in a component.
9. **Document-shell design**: zero shadows, typography-first. Decisions log is `docs/design/the-document/DECISIONS.md` (append-only — add, don't rewrite).

Shared-package edit hazard (the load-bearing one):
- A portal consumes a `@patina/*` package as **compiled dist** or as **raw source** depending on that package's `package.json` `main`, NOT on `transpilePackages` membership. Verify before editing: `grep '"main"' packages/<pkg>/package.json`.
- `main → ./dist/...` ⇒ portal serves compiled output; after editing `src/`, **rebuild the dist** or the portal keeps stale code.
  - Dist-resolved set: `@patina/utils`, `@patina/api-routes`, `@patina/types`, `@patina/api-client`, `@patina/help-system`.
  - `@patina/utils` and `@patina/types` are in `transpilePackages` yet still dist-resolved — membership does not save them.
  - This exact mechanism shipped a prod `TypeError: proposalTierVisibility is not a function` from a stale `@patina/utils` dist.
- `main → ./src/...` ⇒ edits are live, no rebuild: `@patina/supabase`, `@patina/design-system`, `@patina/catalog-ui`, `@patina/email`.
- Rebuild a dist package with `pnpm turbo build --filter=@patina/<pkg>`. Deploys already rebuild all dists via `infra/deploy-portal.sh` — see patina-deploy.

Build strictness differs per portal (verify `next.config.*`):
- designer: `typescript.ignoreBuildErrors: true` + `eslint.ignoreDuringBuilds: true` — build does NOT type-check.
- client: `typescript.ignoreBuildErrors: true` — build does NOT type-check.
- admin: NO `typescript` block → **build enforces types**; `typedRoutes: true`.
- manufacturer: scaffold only (`transpilePackages: ['@patina/supabase']`, placeholder routes).
- Consequence: a shared-package type break can pass the designer build and FAIL the admin build.
- On designer/client the type gate is `pnpm --filter <app> type-check`, not the build. Cross-ref patina-verification.

Auth wiring:
- App-local hooks (`use-auth`, `use-hydrated`, `use-feature-flag`, `use-projects`, ...) live PER-PORTAL under `apps/<portal>/src/hooks/` — each portal owns its copy. This is distinct from the shared data hooks in `@patina/supabase`.
- Each portal's `src/hooks/use-auth.ts` is a thin RBAC adapter over `@patina/supabase` (`useSession`/`useProfile`) via `@/lib/rbac`; exports `useAuth`, `usePermissions`, `useRequireAuth`. Use these, not `supabase.auth` directly, in components.
- Middleware already gates the portal shell. The designer role gate **fails open** when `SUPABASE_SERVICE_ROLE_KEY` is unset (returns "permitted") — env hygiene matters; a missing key silently disables the role check.
- Server side: `@patina/api-routes` extracts the user from the Supabase JWT on proxy routes; NestJS services validate Supabase JWTs via `@patina/auth` guards. `@patina/auth`'s `PermissionsGuard` is a **no-op stub** — it authorizes nothing. Never treat it as a permission check; enforce in RLS or in the handler.
- No SessionProvider needed — the Supabase hooks manage auth state internally; don't add one.

Mock-fallback trap (designer portal):
- `src/lib/mock-data.ts` `withMockData` + `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE` (default `auto`) silently serves mock data whenever the live call THROWS — a false-green hazard when QA-ing real data paths.
- Set `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` to disable the fallback. Full treatment in patina-verification / patina-local-dev.

## Commands
```bash
# Which shared packages are dist-resolved (rebuild after editing) vs source (live)?
for p in utils api-routes types api-client help-system supabase design-system catalog-ui email; do \
  printf '%s: ' "$p"; grep -m1 '"main"' packages/$p/package.json; done
# → ./dist/... = rebuild needed;  ./src/... = live edit

# Rebuild a dist package after editing its src (or the portal serves stale code)
pnpm turbo build --filter=@patina/utils

# Type gate on a portal whose BUILD does not check types (designer/client)
pnpm --filter @patina/designer-portal type-check
```

## Quality bar
- New gated zone matches procurement: flag gate in the route-group `layout.tsx` (fail-closed), zone root redirects to a default sub-tab, pages `'use client'` with `!hydrated || isLoading` skeleton, all hooks above early returns.
- Every mutation invalidates its list key plus each cross-domain key it changes; one canonical query key per entity.
- Data comes from `@patina/supabase` hooks (Supabase) or a `proxyToBackend` route (NestJS) — no ad-hoc `fetch` to a service.
- After editing a dist-resolved package, its dist was rebuilt.
- Types imported from `@patina/types` / `database.types.ts`, never redefined.

## Verification checklist
- [ ] `grep '"main"'` run on every edited `@patina/*` package; dist ones rebuilt via turbo.
- [ ] Page renders skeleton on first paint, then content (no hydration error in console) — verify by driving the app (patina-verification).
- [ ] Flag off → fallback/hidden; flag on → content. Non-pilot users never see gated UI mid-load.
- [ ] Mutation → dependent lists refetch; no stale card.
- [ ] `pnpm --filter <app> type-check` clean for designer/client; for a shared-package change also check admin's build path.
- [ ] Designer QA done with `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` (not silent mock).

## Common mistakes
| Situation | Wrong move | Right move |
|---|---|---|
| Edited `@patina/utils`/`@patina/api-routes`/`@patina/types` src | Assume the portal picks it up (it's in transpilePackages) | Its `main`→dist; `pnpm turbo build --filter=@patina/<pkg>` first |
| Conditional data needs an early `return` | Return before a hook runs | Put every hook above all early returns; gate on `!hydrated || isLoading` |
| Flag-gated route | Render content while `isLoading` | Fail-closed: fallback/skeleton until the flag resolves; branch on `value` after |
| Landed on `/portal` not `/desk` in dev | "Fix" the redirect in page.tsx | `the-document-pilot` is off; set it via flag/override (patina-local-dev) |
| Proxying to a NestJS service | Raw `fetch(SERVICE_URL)` in a hook | `createRouteHandler` + `proxyToBackend` route (see api/projects) |
| Expecting a POST to retry | Set `maxRetries` and assume retries | Mutations need `shouldRetryMutation:true`; default is no-retry |
| Using `Button asChild` with two children | Wrap a fragment in app-local `Button` | App-local `Button` = cloneElement (one child); use design-system `Button` (Slot) for complex children |
| Reading a `@patina/types` field as a DB column | Trust the interface | Confirm the snake_case column in `database.types.ts` first |
| Editing "the" `useAuth`/`useProjects` hook | Assume one shared copy | App-local hooks are per-portal in `apps/<portal>/src/hooks/`; edit the right portal's copy |
| Zone gated content flashed to a non-pilot user | Gate only on `!enabled` | Also gate on `isLoading` (fail-closed) — never render gated content mid-load |

## Report back
State: which routes/hooks/packages changed (absolute paths); which shared packages were dist-resolved and rebuilt; the flag name and gate location; which query keys were invalidated. Give evidence the change works at runtime (driven, not just typed) or say it was not driven. Call out explicitly what was NOT verified — e.g. admin build not exercised for a shared-package change, or QA run in `auto` (possible mock) rather than `live`. Note if any prod-pointed `.env.local` was detected (defer to patina-local-dev).
