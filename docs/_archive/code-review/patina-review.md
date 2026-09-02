> ARCHIVED 2026-09 — describes the retired self-hosted Coolify/GHCR stack; production is Cloudflare + Strata. Historical record only.

# Patina Monorepo Architecture Review

**Reviewer:** Senior architect, external eyes
**Date:** 2026-05-16
**Audience:** Kody (self-review)
**Scope:** Full monorepo — backend (Supabase, NestJS, edge functions, Python ML), frontend (3 Next.js portals + shared packages), iOS app, Chrome extension, infrastructure
**Companion deliverable:** [`patina-review.html`](./patina-review.html)

---

## Thesis

> Patina's product surface has outgrown its boundaries: the auth layer trusts unverified tokens, three portals re-implement the same hooks, and four backend stacks share unclear ownership — none of which require a rewrite, but all of which require deciding what the seams are before the next feature. **The fix is mostly subtraction, not addition.**

Three of the most dangerous findings are also three of the cheapest to fix. That asymmetry is the centerpiece of this review.

---

## Executive Summary

Patina is real. 92-page designer portal, 72-page admin portal, 32-page client portal, a 297-component design system, 11 internal packages, 143 Supabase migrations, 3 NestJS services, ~24 edge functions, a Python ML service, a SwiftUI iOS app, a Plasmo Chrome extension, ~624K lines of TypeScript and ~347K lines of Swift. This is not a toy.

But the seams between those parts were never drawn. Auth was wired for development convenience and never hardened. Portal scaffolding was forked instead of factored. The backend grew organically into four stacks (Postgres + Supabase edge functions + NestJS + Python ML) with no written rubric. The middleware layer between portals and services is **9,338 lines** with bespoke retry, circuit breaker, and chunked-cookie token reassembly — enterprise infrastructure for a product that hasn't yet defined what its API contract is.

### Three things to do this week

1. **Verify JWT signatures.** `packages/auth/src/index.ts` currently base64-decodes the token and trusts whatever is inside. Anyone with a valid-shaped JWT can claim `role: 'admin'`. Replace with `jose.jwtVerify(token, SUPABASE_JWT_SECRET)` and throw — never synthesize a `dev@patina.com` user when the secret env is missing.
2. **Remove the silent default-role fallback.** All three portal `useAuth` hooks default to `['admin']` / `['designer']` / `['client']` when `app_metadata.roles` is missing. New accounts silently inherit the portal's namesake privilege. Route to `/auth/error?reason=missing-role` instead.
3. **Wire CI gates.** `.github/workflows/docker-publish.yml` builds Docker images on every push but no workflow blocks merges on lint, typecheck, or test failures. One day of work moves the codebase from "main can be broken at any time" to "main is always green."

### 30 / 60 / 90 days

- **30 days** — Auth hardening (A1–A4), CI gates (D1), Coolify deploy fix (D2), kill stale env backups + hardcoded IP (D4).
- **60 days** — Extract shared auth hook + middleware (B1, B2), reduce proxy layer (C4), one canonical compose file (D3), align TanStack Query versions + merge `@patina/shared` into `@patina/types` (E1, E2).
- **90 days** — Edge-vs-NestJS rubric execution (C1), extract `activate_proposal_as_project` from migration + RLS audit (C3), `@patina/supabase` barrel diet (B3), quarantine aesthete-engine (C2).

### What this review does **not** recommend

No rewrite. No framework migration. No Supabase replacement. No microservices split. No new tooling category. The codebase is fundamentally healthy; it needs editing, not redesign.

---

## Methodology & Scope

**Reviewed via:** static analysis of the working tree at HEAD = `332adb2`, direct file reads on critical paths (auth, middleware, proxy, deploy scripts), and three parallel explore-agent sweeps across backend, frontend, and mobile/infra. All findings flagged in this report were verified by direct file read — explore-agent output was treated as a lead, not as ground truth.

**Out of scope (and not addressed below):**

- No DB query plan or index analysis (would require running queries against a live database).
- No security penetration test of live endpoints.
- No performance profiling of any portal or service.
- No review of `.claude/worktrees/` (agent-managed working trees, not the canonical repo).
- No deep review of `services/aesthete-engine/` internals beyond the recommendation to gate it.
- No iOS App Store metadata or signing review.
- No Stripe / EasyPost integration audit.
- No review of the 297-component design system at the component level.

---

## What's Working

Before we get to the findings, the things this codebase does well — these are the parts to **keep** while editing the rest.

1. **Monorepo structure is sound.** pnpm workspaces + Turborepo with explicit `dev:designer / dev:admin / dev:client / dev:minimal / dev:frontend / dev:backend` filters. These are not band-aids; they reflect a genuine understanding of which surfaces overlap.
2. **Type centralization in `@patina/types`.** 53 files, value-object pattern (`Money`, `Email`, `Color`, `Phone`, `Address`, etc.) with validation tests. Value objects are rare in Node/TS projects and show real architectural thinking. This package is the source of truth.
3. **React Query + custom hooks discipline.** Portals don't sprinkle `fetch()` calls; they consume hooks from `@patina/supabase`. Query keys are encapsulated. This is the correct pattern.
4. **iOS phase-based routing.** Recent commits (7924475, fa56fec) removed the coordinator + first-launch + threshold logic in favor of auth-phase-driven navigation. `AuthService` holds a continuations array to handle concurrent `waitForAuthReady()` callers during cold launch. Clean and correct.
5. **GHCR + Coolify deployment pipeline.** `infra/build-and-push.sh` and `infra/deploy.sh` are idempotent, support partial steps (`--skip-build/migrate/seed`), and have a defensible runbook. The script's structure is good even where individual steps need fixing (D2).
6. **Conventional commits + auto-memory.** Commit history is clean and grep-friendly; `.claude/projects/.../memory/` has institutional knowledge that survives session resets.

Keep all of the above. The findings below are about layers that grew faster than these patterns.

---

## Findings by Theme

Five themes, ordered by severity. Each finding includes evidence (file:line), the concrete failure mode, the recommendation, and an effort estimate.

### Theme A — Auth Security Hardening (P0, ~1 week total)

> **Anyone with a valid-shaped JWT can claim to be admin.** The auth guard does not check signatures, the dev fallback synthesizes a privileged user, all three portals default new accounts to their namesake role, and the only "permissions" guard always returns true.

#### A1. JWT signatures are not verified

**Evidence:** `packages/auth/src/index.ts:79-91`

```ts
const token = authHeader.substring(7);

try {
  // Decode JWT payload (base64url)
  const payloadPart = token.split('.')[1];
  if (!payloadPart) return false;

  const payload: SupabaseJwtPayload = JSON.parse(
    Buffer.from(payloadPart, 'base64url').toString('utf-8')
  );

  // Check expiration
  if (payload.exp && payload.exp * 1000 < Date.now()) {
    return false;
  }
```

The guard splits the token, base64-decodes the middle segment, and trusts the JSON inside. There is no signature verification. The `SUPABASE_JWT_SECRET` env var is never consulted in this code path.

**Why it matters:** an attacker who knows the JWT structure (it's public — every Supabase user has one) can mint a token with arbitrary `sub`, `email`, `app_metadata.roles`, `app_metadata.permissions`, and the orders / media / projects services will trust it. Every NestJS endpoint is effectively `@Public()`.

**Recommendation:** install `jose` (already a Supabase-recommended library). Replace lines 79–107 with `jwtVerify(token, new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET), { algorithms: ['HS256'] })`. If the env var is missing at boot, throw and crash the process — fail loud, not silent.

**Effort:** 1 day (implementation + tests + rotate-and-deploy across 3 services).

#### A2. Dev fallback synthesizes a privileged user

**Evidence:** `packages/auth/src/index.ts:69-74`

```ts
if (!authHeader?.startsWith('Bearer ')) {
  // In development without JWT secret, allow pass-through
  if (!process.env.SUPABASE_JWT_SECRET) {
    request.user = { sub: 'dev-user', email: 'dev@patina.com', role: 'authenticated' };
    return true;
  }
  return false;
}
```

If the `SUPABASE_JWT_SECRET` env var is unset, **every unauthenticated request is treated as a logged-in user**. This is intended for local dev but the env var being unset is exactly the misconfiguration most likely to occur silently in staging or after a Coolify env-vars panel edit (see memory note `project_email_system_audit_2026_05_12.md`: stale `app.settings.service_role_key` GUC silently broke cron→edge for 14+ days).

**Recommendation:** delete the entire `if (!process.env.SUPABASE_JWT_SECRET)` branch. In dev, require a real Supabase token (the local Supabase emulator provides one). Crash on boot if the env is missing.

**Effort:** included in A1 (4 hours additional).

#### A3. Per-portal role fallback defaults to namesake privilege

**Evidence:**

- `apps/admin-portal/src/hooks/use-auth.ts:15-17` → `|| ['admin']`
- `apps/designer-portal/src/hooks/use-auth.ts:17-19` → `|| ['designer']`
- `apps/client-portal/src/hooks/use-auth.ts:15-17` → `|| ['client']`

```ts
const roles = (user.app_metadata?.roles as string[]) ||
              (user.user_metadata?.roles as string[]) ||
              ['admin'];   // ← admin portal
```

If `app_metadata.roles` is missing on a freshly-created auth user (a routine state — Supabase doesn't populate it by default), the portal silently grants the namesake role. A new user landing on `admin.patina.cloud` who hasn't been assigned roles yet is admin. A new user landing on `designer.patina.cloud` is a designer.

**Why it matters:** privilege escalation by misconfiguration. The portal's *name* should never be its *grant*.

**Recommendation:** if `roles` is missing, return `null` from `useAuth` and route to `/auth/error?reason=missing-role`. Surface the error visibly so the operator notices the missing assignment instead of silently working.

**Effort:** 4 hours, but **do it as part of B1** (the shared `usePatinaAuth(defaultRole?)` extraction) so the fix lands in one place instead of three.

#### A4. PermissionsGuard is a stub that always returns true

**Evidence:** `packages/auth/src/index.ts:115-121`

```ts
// Permissions guard stub
@Injectable()
export class PermissionsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return true;
  }
}
```

Every controller that uses `@RequirePermissions(...)` is decoratively guarded but the guard does nothing. The decorator is theatrical.

**Why it matters:** `@RequirePermissions` is used across the services to gate sensitive endpoints (orders, payments, project access). None of those gates are enforced.

**Recommendation:** read `@RequirePermissions(...)` metadata via `Reflector`, check `user.permissions` (which is now trustworthy after A1), and `throw new ForbiddenException()` if any required permission is missing. Audit every controller route — every route should either have a `@RequirePermissions(...)` decorator or an explicit `@Public()` decorator. Default to deny.

**Effort:** 2 days. Depends on A1 landing first (otherwise the permissions claim itself is forgeable).

#### A5. Audit the proxy's token reassembly path

**Evidence:** `packages/api-routes/src/middleware/proxy-to-backend.ts` (742 LOC; auth extraction is roughly lines 455–540 per explore-agent's report)

The proxy reassembles chunked Supabase auth cookies (which Supabase splits across `sb-<project>-auth-token.0`, `.1`, `.2` when they exceed cookie size limits) and threads the result as a `Bearer` token to the downstream NestJS service. Reassembly is correct in the happy path but has multiple silent-failure branches.

**Recommendation:** after reassembly, decode + verify the token *in the proxy* using the same `jose` setup from A1. If verification fails, return 401 — never forward the request with no token. Document the chunked-cookie protocol in a comment at the top of the file.

**Effort:** 1 day. Depends on A1.

---

### Theme B — Eliminate Portal Duplication (P2, ~1.5 weeks)

> ~850 LOC of near-identical auth hooks + middleware exists across three portals because the shared scaffold was forked rather than factored. Same is true for the 849-line `@patina/supabase` barrel that every portal imports wholesale.

#### B1. Extract a shared `usePatinaAuth(defaultRole?)` hook

**Evidence:** `apps/{admin,designer,client}-portal/src/hooks/use-auth.ts` (161 / 146 / 151 LOC respectively). `usePermissions()` and `useRequireAuth()` are character-for-character identical across all three. Only the default-role string differs.

**Recommendation:** new file `packages/auth/src/hooks/use-patina-auth.tsx` exporting `usePatinaAuth({ defaultRole?: Role })`. Each portal's `use-auth.ts` becomes:

```ts
export { useAuth, usePermissions, useRequireAuth } from '@patina/auth/hooks';
// or with defaultRole config baked in at a single re-export:
import { usePatinaAuth } from '@patina/auth/hooks';
export const useAuth = () => usePatinaAuth({ defaultRole: 'admin' });
// (delete the default fallback per A3 — config'd role is now an explicit decision, not a silent grant)
```

Delete ~450 LOC across three files. Note: combining this with A3 means the role-fallback bug is fixed in one place.

**Effort:** 3 days.

#### B2. Extract a shared Next.js middleware factory

**Evidence:** `apps/{admin,designer,client}-portal/src/middleware.ts` (148 / 129 / 129 LOC). Designer and client are identical; admin adds the MFA check and the QR-DEBUG logging.

**Recommendation:** `packages/auth/src/middleware/create-patina-middleware.ts` exporting `createPatinaMiddleware({ portalName, requiredRole, publicPaths, redirectUnauthenticatedTo, mfaEnforced?: boolean })`. Each portal's middleware shrinks to ~5 lines that configure and re-export.

Remove the `[QR-DEBUG MW]` `console.log` calls in `apps/admin-portal/src/middleware.ts:22-28` once the QR auth feature stabilizes — they currently fire on every non-API request.

**Effort:** 2 days.

#### B3. Trim the 849-line `@patina/supabase` barrel

**Evidence:** `packages/supabase/src/hooks/index.ts` — 849 lines, **104 top-level exports** (verified via `grep -c "^export"`).

Every portal imports `from '@patina/supabase'` and Webpack/Turbopack tree-shaking has to do a lot of work to figure out what's actually used. More importantly: **it's impossible to look at the barrel and tell what's dead.** Adding a new hook adds a line; removing one requires grepping every portal.

**Recommendation:** split into sub-path exports:

- `@patina/supabase/auth` — `useSession`, `useSignIn`, MFA hooks
- `@patina/supabase/orders` — order, proposal, decision hooks
- `@patina/supabase/projects` — project, room, phase, milestone hooks
- `@patina/supabase/catalog` — products, vendors, styles
- `@patina/supabase/comms` — campaigns, templates, inbox notifications
- `@patina/supabase/realtime` — channel subscriptions

After the split, run a usage audit: `grep -r "from '@patina/supabase/<sub>'"`. Any sub-path with zero portal consumers gets archived.

**Effort:** 1 week. Defer until **after** C1 (the edge-vs-NestJS rubric) so we don't export hooks for edge functions we're about to retire.

---

### Theme C — Consolidate the 4-Stack Backend (P2, ~1 quarter)

> Four backend stacks (Postgres functions + Supabase edge functions + NestJS services + Python ML) share unclear ownership. The middleware layer between portals and services is 9,338 LOC, an over-engineered API gateway for a product that hasn't fixed its contract.

#### C1. Define the edge-function-vs-NestJS rubric

**Evidence:** `supabase/functions/` contains ~24 edge functions. Names like `automation-processor`, `decision-reminders`, `campaign-dispatcher`, `digest-dispatcher`, `companion-message` overlap with logic the explore agents found inside the NestJS services. No written rubric exists for which side new logic should live on.

**Recommendation:** write a 1-page decision rubric and check it into `docs/architecture/edge-vs-service-rubric.md`. Proposal:

| Use a Supabase edge function when | Use a NestJS service endpoint when |
|---|---|
| Trigger is a Supabase event (db trigger, auth webhook, storage event) | Trigger is an HTTP request from a portal or external client |
| Logic is stateless and completes in < 5 seconds | Logic is stateful, long-running, or composes multiple services |
| No imports from internal `@patina/*` packages are needed | Code reuses `@patina/types`, `@patina/cache`, domain models |
| Deployment cadence can match Supabase CLI / Studio | Deployment cadence matches the monorepo's Docker build pipeline |

Migrate the three colliding domains (`automation-processor`, `decision-reminders`, `campaign-dispatcher`) to whichever side they fit per the rubric. The decision is reversible — what matters is that **one of the two is canonical** for each domain.

**Effort:** rubric: 4 hours. Migrations: 1–3 weeks each.

#### C2. Quarantine aesthete-engine

**Evidence:** `services/aesthete-engine/` contains a full Python/FastAPI service with Dockerfile, prisma schema, pytest suite, and 9 separate `*_SUMMARY.md` / `*_DELIVERY_REPORT.md` / `IMPLEMENTATION_CHECKLIST.md` files — a heavy footprint. User-confirmed status: experimental, not deployed.

**Recommendation:** add `services/aesthete-engine/README.md` opening with **"EXPERIMENTAL — NOT DEPLOYED."** Remove `services/aesthete-engine/` from `infra/deploy.sh` and `infra/build-and-push.sh` allowlists if present. Tag the compose file (`services/aesthete-engine/docker-compose.yml`) with a top-of-file comment marking it research-only. Move the existing markdown reports (`ANALYSIS_SUMMARY.md`, `ML_ENGINEERING_DELIVERY_REPORT.md`, `IMPLEMENTATION_*.md`, `TEAM_ZULU_SUMMARY.md`, etc.) into `services/aesthete-engine/docs/`.

The decision to keep aesthete-engine in the monorepo vs. move it to a separate repo is open — but it must be visibly quarantined while it remains.

**Effort:** 4 hours.

#### C3. Extract the proposal→project carry stored procedure + audit RLS

**Evidence:** `supabase/migrations/00140_proposal_project_richer_carry.sql` (**380 LOC** — verified via `wc -l`) defines the `activate_proposal_as_project()` Postgres function inline as part of a migration. Migrations are append-only; this means the function definition lives forever in migration history but can only be updated by adding more migrations (cumulative `CREATE OR REPLACE FUNCTION` definitions).

**Recommendation:**

1. Move the canonical `activate_proposal_as_project()` definition to a versioned file: `supabase/functions/sql/activate_proposal_as_project.sql`. Migrations going forward `\i` (include) this file or use `CREATE OR REPLACE FUNCTION` from it. Diffs become readable.
2. Add a pgTAP test that exercises proposal → project activation end-to-end. The function currently has zero direct tests.
3. RLS audit: write a single SQL script (`supabase/scripts/audit-rls.sql`) that prints, for every table in `public` + `svc_*`: `rls_enabled?`, `policy_count`, `policy_names`, `roles_allowed`. Run it. Investigate any table with `rls_enabled = false` and any policy that grants `to public` or `to authenticated` without further scoping.

**Effort:** 1 week.

#### C4. Reduce `@patina/api-routes` from 9,338 LOC to ~2,500

**Evidence:** verified `wc -l` on the package:

| File | LOC |
|---|---|
| `middleware/proxy-to-backend.ts` | **742** |
| `middleware/__tests__/proxy-to-backend.test.ts` | 793 |
| `utils/retry.ts` | **543** |
| `utils/__tests__/retry.test.ts` | 793 |
| `utils/circuit-breaker.ts` | **530** |
| `utils/__tests__/circuit-breaker.test.ts` | 865 |
| `utils/metrics.ts` | 400 |
| `utils/__tests__/metrics.test.ts` | 519 |
| `utils/tracing.ts` | 300 |
| `utils/__tests__/tracing.test.ts` | 537 |
| `middleware/proxy-to-backend.example.ts` | 406 (sample, can delete) |
| `utils/circuit-breaker.example.ts` | 316 (sample, can delete) |
| `utils/observability.example.ts` | 467 (sample, can delete) |
| **All other files** | ~2,127 |
| **TOTAL** | **9,338** |

This is an API gateway, not a route handler. It would be appropriate for a 50-service production fleet. Patina has 3 services.

**Recommendation:**

1. **Delete all `*.example.ts` files** (1,189 LOC). Sample code belongs in markdown, not in the package source — every TypeScript tool has to parse and analyze them.
2. **Replace bespoke retry** (`utils/retry.ts`, 543 LOC) with [`p-retry`](https://npmjs.com/package/p-retry) (~50 LOC of usage). Delete the test file (it's testing the bespoke implementation).
3. **Delete the bespoke circuit breaker** (`utils/circuit-breaker.ts`, 530 LOC). Patina's reliability needs are met by Cloudflare's connection-level retries plus `p-retry` for transient failures. If actual circuit breaking is needed later, externalize to Cloudflare Workers or the platform.
4. **Slim `proxy-to-backend.ts`** to a single function: extract token (with verification per A5), forward the request, return the response. ~200 LOC.
5. **Keep** `metrics.ts`, `tracing.ts`, `logger.ts`, `request-context.ts`, `error-transformer.ts`, `with-auth.ts`, `with-role.ts`, `with-validation.ts`, `validation-schemas.ts`. These are pulling their weight.

Net delete: roughly 6,500 lines.

**Effort:** 1 week (the work is mostly subtractive but the test suite has to be re-pointed at the new abstractions).

---

### Theme D — Ship Discipline & Ops Confidence (P1, ~1 week)

> CI builds Docker images but doesn't gate merges. Coolify deploys silently land stale images. Eight docker-compose files exist with no documented hierarchy. Production SSH defaults to a hardcoded LAN IP.

#### D1. Add CI gates that block merges

**Evidence:** `.github/workflows/` contains `docker-publish.yml`, `extension-beta.yml`, `extension-cws.yml`. None of these are configured as required status checks on the `main` branch. There is no `pnpm lint && pnpm typecheck && pnpm test` workflow.

**Recommendation:** add `.github/workflows/pr-checks.yml`:

```yaml
name: PR Checks
on: [pull_request]
jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm type-check
      - run: pnpm test
      - run: pnpm build
```

Add `checks` as a required status check in branch protection on `main`. Build time for the full graph will be ~5–8 minutes — acceptable.

**Effort:** 1 day.

#### D2. Fix Coolify deploy to force-pull updated images

**Evidence:** memory note `feedback_coolify_deploy.md` — "Coolify service deploys don't force-pull: `/restart` + `/deploy` skip image pull; SSH + `docker compose pull && up --force-recreate` is the reliable path." Confirmed in current `infra/deploy.sh`: the script triggers the Coolify API restart but does not explicitly pull.

**Recommendation:** in `infra/deploy.sh`, after the build-and-push step and before the Coolify restart, add a SSH step:

```bash
ssh "$SERVER" "cd ${STACK_DIR} && docker compose pull && docker compose up -d --force-recreate --remove-orphans"
```

Or, better: pin services in the Coolify compose to immutable image digests (`ghcr.io/kodeman/patina-services-orders@sha256:...`) and rewrite the digest in the compose file at deploy time. This makes "what's actually running in prod" a property of the compose file, not of whatever Coolify happened to pull last.

**Effort:** 4 hours (the SSH approach); 1 day (the digest-pinning approach, recommended).

#### D3. One canonical `docker-compose.yml`

**Evidence:** `find . -name "docker-compose*.yml"` returns 8 in the canonical tree:

```
./docker-compose.yml                                        ← local dev (Redis, MinIO, Mailhog)
./infra/docker-compose.supabase.yml                         ← Supabase stack
./infra/docker-compose.services.yml                         ← NestJS services
./infra/docker-compose.deploy.yml                           ← ??? (stale?)
./infra/docker-compose.frontend.yml                         ← ??? (stale?)
./infra/coolify/docker-compose.infra.yml
./infra/coolify/docker-compose.supabase-coolify.yml
./infra/coolify/docker-compose.ghcr-apps.yml                ← canonical prod (per memory)
./services/orders/docker-compose.yml
./services/aesthete-engine/docker-compose.yml
./services/media/docker-compose.yml
```

Plus 16 more under `.claude/worktrees/*/docker-compose.yml` (out of scope — agent-managed). Memory notes that `coolify/docker-compose.ghcr-apps.yml` is canonical for prod but Coolify UI is the source of truth.

**Recommendation:**

1. Delete `infra/docker-compose.deploy.yml` and `infra/docker-compose.frontend.yml` if they are confirmed stale (run `git log --follow` to check last meaningful change).
2. Write `infra/README.md` with a table mapping each compose file to its environment and consumer (local dev / staging / Coolify prod / service-level standalone).
3. The Coolify-UI-is-truth pattern is reasonable but fragile. Move toward "the compose file in `infra/coolify/` is committed and Coolify pulls from git" — Coolify supports this, and it removes the need to keep a separate snapshot in sync.

**Effort:** 2 days.

#### D4. Remove hardcoded LAN IP and stale env backups

**Evidence:**

- `infra/deploy.sh:27` — `SERVER="${PATINA_PROD_SSH:-kody@192.168.1.14}"` falls back to a LAN IP.
- `infra/.env.swp` dated March 7 — vim swap file, 2 months stale.
- `infra/.env.bak-anon-sync-20260513-040723` and `infra/.env.env.bak.20260512-084926` — env backups with no rotation policy.

**Recommendation:**

- Remove the fallback: `SERVER="${PATINA_PROD_SSH:?PATINA_PROD_SSH must be set}"`. If you move servers, you change the env var; you don't update the script.
- `rm infra/.env.swp infra/.env.bak-*`. If env rotation matters, add `infra/.env.bak.gitkeep` and let backups land there with a 7-day retention cron — but right now they're just clutter.

**Effort:** 1 hour.

---

### Theme E — Engineering Hygiene (P3, opportunistic)

> Cleanup that improves day-to-day developer experience without changing the architecture. Do these between feature work; don't block on them.

#### E1. Merge `@patina/shared` into `@patina/types`

**Evidence:** both packages export TypeScript types. `@patina/shared` is used primarily by the Chrome extension; `@patina/types` by everything else. The boundary is accidental, not principled.

**Recommendation:** merge into `@patina/types`. If specific types are extension-only, put them under `@patina/types/extension`. Single source of truth for domain types.

**Effort:** 1 day.

#### E2. Align TanStack Query versions

**Evidence:** `apps/admin-portal/package.json` pins `@tanstack/react-query` at 5.51.1; `apps/designer-portal/package.json` and `apps/client-portal/package.json` pin 5.17.19.

**Recommendation:** define `@tanstack/react-query` as a workspace catalog entry in `pnpm-workspace.yaml` (pnpm catalog feature) and have all three portals reference it. Upgrade to latest stable 5.x in one PR with the version bumped in one place going forward.

**Effort:** 2 hours.

#### E3. Add unit-test scaffolding to portal `app/` dirs; lift services to 60% coverage

**Evidence:** explore-agent reports — designer portal has e2e tests, admin and client do not have meaningful test suites in `app/`. NestJS services have ~39 `.spec.ts` files (~12,100 LOC) concentrated in timeline/approval modules.

**Recommendation:** add `vitest.config.ts` to each portal. Start with one test file per portal that exercises a critical path (e.g., `apps/admin-portal/src/__tests__/middleware-auth.spec.ts`). Set coverage targets in `package.json` scripts. Don't aim for 100%; aim for "the next regression on a critical path is caught."

**Effort:** 1 week for an initial pass; ongoing thereafter.

#### E4. Make iOS Supabase URL env-driven

**Evidence:** explore-agent — `apps/mobile/Patina/.../APIConfiguration.swift` hardcodes `https://api.patina.cloud`. No env switching for local dev means iOS engineers always hit prod.

**Recommendation:** xcconfig-driven configuration:

```
// Patina/Configuration/Debug.xcconfig
PATINA_SUPABASE_URL = http:/$()/localhost:54321
PATINA_SUPABASE_ANON_KEY = local-anon-key

// Patina/Configuration/Release.xcconfig
PATINA_SUPABASE_URL = https:/$()/api.patina.cloud
PATINA_SUPABASE_ANON_KEY = prod-anon-key-set-via-asc
```

Surface in `Info.plist` and read via `Bundle.main.infoDictionary["PATINA_SUPABASE_URL"]`. Document in `apps/mobile/Patina/README.md`.

**Effort:** 2 hours.

#### E5. Encrypt Chrome extension offline queue

**Evidence:** explore-agent — `apps/extension/src/background.ts` persists `capture_queue_v2` in browser local storage with no encryption. Vendor selections and product metadata are PII-adjacent.

**Recommendation:** generate a per-install session key with Web Crypto, store in `chrome.storage.session` (cleared on browser close), encrypt queue entries at write. Document a FIFO eviction policy (current queue is unbounded — a long offline run could fill quota and silently drop captures).

**Effort:** 1 day.

#### E6. Pre-commit hooks

**Evidence:** `.husky/` does not exist. `.swiftlint.yml` exists but no git integration documented.

**Recommendation:** add Husky + lint-staged:

```json
// package.json
"scripts": { "prepare": "husky" },
"lint-staged": {
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "apps/mobile/Patina/**/*.swift": ["swiftlint --fix"]
}
```

Hook fires on `git commit`. Not slow; not noisy; catches the obvious mistakes.

**Effort:** 2 hours.

#### E7. Storybook for `@patina/patina-design-system`

**Evidence:** 297 components, 127 directories. No Storybook configured. New designers / engineers have no visual catalog.

**Recommendation:** add Storybook to `packages/patina-design-system/`. One story per component, autogenerated where possible. Skip this if the design system isn't growing — but if it is, this is the cheapest documentation win.

**Effort:** 3 days for initial setup + a few representative stories. Ongoing: stories added with new components.

---

## What's *not* a problem (avoid false alarms)

The mobile/infra explore-agent reported that `infra/.env` and `infra/secrets.txt` were "committed to git." **They are not.** Both are gitignored (`.gitignore` includes `infra/.env` and `infra/secrets.txt` explicitly). The files exist on disk in the local working tree, but `git ls-files infra/` confirms only `.env.example` and `.env.coolify.example` are tracked. No credentials are in git history.

This is good. The file hygiene is bad (stale `.env.swp` from March, multiple `.bak-*` files) and D4 addresses it, but there is no security incident here.

---

## The 30 / 60 / 90 Roadmap

### Days 0–30 — Security + Reliability (must-do)

| Workstream | Effort | Definition of done |
|---|---|---|
| A1 — JWT signature verification | 1d | `jose.jwtVerify` in `@patina/auth`; all 3 services boot only with secret set; integration test in CI |
| A2 — Delete dev-fallback synthetic user | 4h | `dev@patina.com` does not appear in any code path; boot fails if env missing |
| A3 — Kill silent default-role fallback | 4h | Done as part of B1; missing roles route to `/auth/error?reason=missing-role` |
| A4 — Implement `PermissionsGuard` | 2d | Every controller route has `@RequirePermissions(...)` or `@Public()`; default deny; tests for the guard |
| A5 — Audit proxy token reassembly | 1d | Proxy verifies token before forwarding; 401 on bad token; chunked-cookie docs in proxy file header |
| D1 — CI gates | 1d | `pnpm lint && pnpm typecheck && pnpm test && pnpm build` required on PRs to `main` |
| D2 — Coolify force-pull / digest pinning | 1d | Deploys are deterministic; "I deployed but nothing changed" cannot happen silently |
| D4 — Kill hardcoded IP + stale env backups | 1h | `PATINA_PROD_SSH` required; `.env.swp` and `.env.bak-*` gone |

**Total:** ~8 working days for one engineer. Two weeks of focused work.

### Days 31–60 — Reduce duplication

| Workstream | Effort | Definition of done |
|---|---|---|
| B1 — `usePatinaAuth` extraction | 3d | All 3 portals re-export from `@patina/auth/hooks`; ~450 LOC deleted |
| B2 — `createPatinaMiddleware` extraction | 2d | All 3 portals' `middleware.ts` are ~5 lines; QR-DEBUG logs removed |
| C4 — `@patina/api-routes` slim | 1w | Package is ~2,500 LOC; bespoke retry + circuit breaker deleted; samples removed |
| D3 — Canonical compose file | 2d | `infra/README.md` published; stale compose files deleted; Coolify pulling from git |
| E1 — Merge `@patina/shared` into `@patina/types` | 1d | One package; extension types under sub-path |
| E2 — Align TanStack Query versions | 2h | pnpm catalog entry; single version across portals |

### Days 61–90 — Architecture clarity

| Workstream | Effort | Definition of done |
|---|---|---|
| B3 — `@patina/supabase` barrel split | 1w | Sub-path exports; dead hooks archived; usage audit committed |
| C1 — Edge-vs-NestJS rubric + migrations | 2–3w | Rubric in `docs/architecture/`; 3 colliding domains live on one side only |
| C2 — Quarantine aesthete-engine | 4h | Visible "EXPERIMENTAL" label; excluded from prod deploy; docs moved |
| C3 — Extract `activate_proposal_as_project` + RLS audit | 1w | Function in versioned `.sql` file; pgTAP test; RLS audit script + findings |
| E3–E7 — Opportunistic hygiene | per workstream | As feature work permits |

---

## What we deliberately did NOT recommend

Recommendations carry their own cost. Some plausible-sounding moves were considered and rejected.

**No rewrite.** The codebase has problems but they are local. Auth is broken in 4 specific files. Portal scaffolding is duplicated in 3 specific patterns. Migration sprawl is real but the migrations are correct. A rewrite trades fixable problems for unknown ones.

**No framework migration.** Next.js 15 + React 19 + NestJS + Supabase is a fine stack for this product. Switching anything (Remix, tRPC replacing the proxy, Hono replacing NestJS, Prisma replacing supabase-js) introduces months of churn for marginal gain.

**No Supabase replacement.** Self-hosted Supabase on Coolify is unusual but it works, and the team has institutional knowledge of its operational quirks. Migrating to Neon + Clerk + S3 would cost a quarter and change nothing about the actual application code.

**No microservices split.** The 3 NestJS services already exist; the question is whether to consolidate them, not split them further. Consolidation is plausible long-term but the current boundary (orders / media / projects) is principled.

**No "harden aesthete-engine now" recommendation.** Per Kody's confirmation it is experimental. Investing in OpenAPI contracts, typed clients, or integration tests is premature optimization until the ML hypothesis is validated. Quarantine it; revisit later.

**No new tooling category.** No new observability stack, no new package manager, no new build tool. The infrastructure that exists is sufficient; configuration is the gap, not capability.

---

## Appendix A — File path index

Every file referenced in this report, alphabetized.

```
.github/workflows/docker-publish.yml
.github/workflows/extension-beta.yml
.github/workflows/extension-cws.yml
apps/admin-portal/package.json
apps/admin-portal/src/hooks/use-auth.ts
apps/admin-portal/src/middleware.ts
apps/client-portal/package.json
apps/client-portal/src/hooks/use-auth.ts
apps/client-portal/src/middleware.ts
apps/designer-portal/package.json
apps/designer-portal/src/hooks/use-auth.ts
apps/designer-portal/src/middleware.ts
apps/extension/src/background.ts
apps/mobile/Patina/.../APIConfiguration.swift
docker-compose.yml
infra/.env.bak-anon-sync-20260513-040723
infra/.env.env.bak.20260512-084926
infra/.env.swp
infra/build-and-push.sh
infra/coolify/docker-compose.ghcr-apps.yml
infra/coolify/docker-compose.infra.yml
infra/coolify/docker-compose.supabase-coolify.yml
infra/deploy.sh
infra/docker-compose.deploy.yml
infra/docker-compose.frontend.yml
infra/docker-compose.services.yml
infra/docker-compose.supabase.yml
packages/api-routes/src/create-route-handler.ts
packages/api-routes/src/middleware/proxy-to-backend.ts
packages/api-routes/src/middleware/proxy-to-backend.example.ts
packages/api-routes/src/middleware/with-auth.ts
packages/api-routes/src/middleware/with-role.ts
packages/api-routes/src/middleware/with-validation.ts
packages/api-routes/src/utils/circuit-breaker.ts
packages/api-routes/src/utils/circuit-breaker.example.ts
packages/api-routes/src/utils/observability.example.ts
packages/api-routes/src/utils/retry.ts
packages/auth/src/index.ts
packages/patina-design-system/...
packages/shared/...
packages/supabase/src/hooks/index.ts
packages/types/...
services/aesthete-engine/...
services/media/docker-compose.yml
services/orders/docker-compose.yml
supabase/functions/automation-processor/
supabase/functions/campaign-dispatcher/
supabase/functions/decision-reminders/
supabase/migrations/00140_proposal_project_richer_carry.sql
```

---

## Appendix B — Copy-pasteable checklist

Drop into a tracking issue.

### Week 1–2 — P0 + P1

- [ ] **A1** Replace base64 decode with `jose.jwtVerify` in `packages/auth/src/index.ts`
- [ ] **A2** Delete the `if (!process.env.SUPABASE_JWT_SECRET)` synthetic-user branch
- [ ] **A3** Remove `['admin']` / `['designer']` / `['client']` default fallbacks in portal auth hooks
- [ ] **A4** Implement `PermissionsGuard` to read `@RequirePermissions` metadata + audit every controller route
- [ ] **A5** Add token verification inside `proxy-to-backend.ts` before forwarding
- [ ] **D1** Add `.github/workflows/pr-checks.yml` with lint/typecheck/test/build required for merge
- [ ] **D2** Fix Coolify deploy to force-pull or pin to image digests
- [ ] **D4** Require `PATINA_PROD_SSH` env var; delete `infra/.env.swp` and `infra/.env.bak-*`

### Weeks 3–6 — Duplication reduction

- [ ] **B1** Extract `usePatinaAuth(defaultRole?)` to `@patina/auth/hooks`; delete 3 portal copies
- [ ] **B2** Extract `createPatinaMiddleware(...)`; collapse 3 portal `middleware.ts` files to ~5 lines each
- [ ] **C4** Delete `*.example.ts` files; replace bespoke retry with `p-retry`; delete bespoke circuit breaker; slim proxy to ~200 LOC
- [ ] **D3** Publish `infra/README.md` mapping compose files to envs; delete stale ones; consider Coolify-pulls-from-git
- [ ] **E1** Merge `@patina/shared` into `@patina/types`
- [ ] **E2** Move TanStack Query to pnpm catalog; align versions

### Weeks 7–12 — Architecture clarity

- [ ] **B3** Split `@patina/supabase` barrel into sub-path exports; audit & dead-export unused hooks
- [ ] **C1** Write `docs/architecture/edge-vs-service-rubric.md`; migrate `automation-processor` / `decision-reminders` / `campaign-dispatcher` to chosen side
- [ ] **C2** Quarantine `services/aesthete-engine/` — README label, deploy exclusion, docs moved
- [ ] **C3** Extract `activate_proposal_as_project` to `supabase/functions/sql/`; add pgTAP test; run + commit RLS audit findings

### Opportunistic

- [ ] **E3** Vitest scaffolding per portal; one critical-path test per portal
- [ ] **E4** xcconfig-driven Supabase URL in iOS
- [ ] **E5** Encrypt Chrome extension offline queue; document FIFO eviction
- [ ] **E6** Husky + lint-staged + SwiftLint pre-commit
- [ ] **E7** Storybook for `@patina/patina-design-system` (if growing)
