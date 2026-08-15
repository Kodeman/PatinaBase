# AGENTS.md

## Project Overview

Patina connects interior designers with manufacturers for custom home furnishings. **Supabase-first hybrid monorepo**: Supabase owns auth/database/realtime/storage; 3 retained NestJS services (orders, media, projects) own complex domains via Prisma in `svc_*` schemas.

- pnpm workspaces + Turborepo — pnpm `9.0.0` exact (corepack pin), node ≥20; Next.js 15 (App Router), React 19, TS, Tailwind, TanStack Query
- **Auth = Supabase Auth (GoTrue) only — never NextAuth**
- Prod DB = Supabase Cloud project **"Strata"** (ref `bkvcixdmuyejfzcijpdg`, CLI-linked); local dev via the Supabase CLI
- Prod infra = **Cloudflare**: 4 portals on Workers (OpenNext), services on Containers. The self-hosted Coolify box is **RETIRED** — never deploy, SSH, or point anything at it, whatever older docs say. [retired-deploy-reference-allow: canonical repository retirement policy]
- Native: 2 Swift/SwiftUI iOS apps — Patina (client, `apps/mobile/Patina`), Patina Field (designer/trades, `apps/mobile/Capture`) — plus a Plasmo Chrome extension

## Project skills

Eleven engineering `patina-*` skills in `.agents/skills/` carry the verified procedures and footguns this file only summarizes. Load the matching skill before: DB migrations, edge functions, portal features, local dev, verification, testing, deploys, prod ops, Stripe payments, parallel/multi-agent work, iOS. Index: `.agents/skills/README.md`.

## Agent OS rules

- Task queue = `agent_tasks` via `@patina/agent-queue` + its RPCs (docs/agent-os/). Never a parallel queue; `cowork_tasks` is frozen (00298).
- service_role stays server-side; agent DB access = `agent_reader`/`agent_writer`. Agents read broadly, write ONLY via `enqueue_agent_task` — never directly to business tables. `agent_reader`/`agent_writer` are NOLOGIN privilege roles (docs/agent-os/agent-roles-runbook.md) — never login roles.
- Every queue transition is audited (`agent_task_audit`, actor from `app.actor`).
- No automated external sends — drafts land `awaiting_review`.
- Internal payable-state tables are the source of truth: reconcile Stripe toward them, never the reverse.
- Scheduled jobs = pg_cron (SQL RPC or `public.invoke_edge_function`); run history = `job_runs`.

## Essential Commands

```bash
pnpm install
docker compose up -d      # local infra: Redis, MinIO, Mailhog
pnpm supabase:start       # Postgres/Auth/Realtime/Storage/Studio (:54323)
pnpm supabase:stop
pnpm supabase:reset       # replay migrations + seeds wired in config.toml [db.seed]
pnpm dev:minimal          # designer portal + 3 services. Use a selective dev:* script,
                          # NEVER `pnpm dev` — other variants in patina-local-dev
pnpm build; pnpm test; pnpm type-check; pnpm lint
# turbo silently SKIPS workspaces lacking the script; only designer-portal has a working
# ESLint config — green proves less than it looks (patina-verification)
```

## Structure

```
apps/      designer-portal :3000 · admin-portal :3001 (strictest — build enforces types)
           client-portal :3002 (PWA) · manufacturer-portal :3003 (scaffold, deployed)
           extension/ (Plasmo) · mobile/ (Patina + Capture)
services/  orders :3015 · media :3014 (storage = Cloudflare R2, MinIO locally) ·
           projects :3016 (realtime = Supabase broadcast, NOT WebSockets) · aesthete-inference (Python)
packages/  16; load-bearing: supabase (data layer — clients, ~88 React Query hook modules,
           generated types) · types (hand-authored camelCase domain types, NOT DB rows)
           patina-design-system · api-routes · auth
supabase/  migrations/ (hand-numbered NNNNN_slug.sql — NEVER `supabase migration new`)
           functions/ (~45 Deno edge functions) · seed/ · config.toml
infra/     deploy-portal.sh = THE ONLY portal deploy path · *-worker/ Cloudflare units
           Coolify/tunnel/GHCR files are LEGACY (dead box) — do not run them
studios/   help-system (Sanity Studio CMS — distinct from packages/help-system)
```

Detail: **patina-portal-features** (packages, routes, data access), **patina-local-dev** (ports, env, boot).

## Environment

Portals need `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, server-side `SUPABASE_SERVICE_ROLE_KEY` (see each `.env.example`). `NEXT_PUBLIC_*` is inlined at build/dev start. Never commit `.env`.

- **Prod portal env lives in `apps/*/wrangler.jsonc` `vars` blocks** (committed literals), not `.env` — a prod value change means editing wrangler.jsonc and redeploying.
- ⚠ `apps/*/.env.local` has pointed at Strata **prod** before. Check `NEXT_PUBLIC_SUPABASE_URL` before any destructive local action (patina-local-dev).

## Deploying

Prod mutations require an explicit user request in the current session; a "ship X" request authorizes the full chain (migrate → functions/services → portals → verify) without per-step re-asking. Procedures: **patina-deploy**.

- **Portals**: always `./infra/deploy-portal.sh <name>` — never `opennextjs-cloudflare build` directly. The script rebuilds workspace-package dists first; skipping that bundles a stale dist (it shipped `TypeError: proposalTierVisibility is not a function` to prod).
- **Services**: `cd infra/<unit>-worker && npx wrangler deploy`.
- **Migrations / edge functions** (Strata): `supabase db push` / `supabase functions deploy <name>`. A `_shared/*` edit requires redeploying EVERY importing function.
- Verify with `wrangler deployments list` (oldest-first — read the bottom row) + behavior probes — `/version` returns static defaults on the live path, so version strings prove nothing.

## Model dispatch (Fable orchestration)

- **When the session model is Fable**: Fable plans, architects, orchestrates, and adversarially reviews returned work — it never executes, even for tasks that look quick. All execution — code, migrations, tests, deploys, debugging legwork, bulk research — goes to subagents; Fable reviews, then returns to the user or re-instructs. (Non-Fable sessions execute directly; the ladder below still guides subagent choice.)
- **Standing authorization**: Kody's standing instruction is that orchestration runs through subagents — dispatching them per this section is user-requested, never a model-initiated liberty.
- **Opus** — hardest multi-file implementation, deep debugging, cross-cutting refactors, work where the first attempt must be right. Opus 5 briefs must say: deliver exactly what's asked — no unrequested features, refactors, or abstractions; do NOT include generic "verify/double-check your work" padding (Opus 5 self-verifies; such lines cause over-verification) — but DO name the exact gate command the change must pass (patina-verification); comments only for constraints the code can't show; concise, evidence-grounded report-back. Security-flavored tasks (auth probing, scan-like work) can hit safety refusals — re-scope narrower or Fable analyzes directly.
- **Sonnet** — default executor: standard feature/hook/edge-function implementation, tests, most execution. Sonnet 5 follows briefs literally — state scope and coverage explicitly ("all N files", "only X"), and don't rely on it generalizing intent. Its tokenizer spends ~30% more tokens on the same text (Anthropic migration notes, 2026-08) — budget accordingly on very-long-context reads.
- **Haiku** — mechanical edits, renames, bulk changes, file searches, simple lookups.
- **Adversarial review**: always a separate context; the implementer never reviews its own work. Reviewer briefs: report every finding with confidence + severity — never "only report high-severity issues" (severity filters depress recall on Claude 5 models); Fable filters at synthesis.

## Conventions

- **Auth**: always Supabase Auth, never NextAuth. **Types**: import from `@patina/types`, never redefine. **Components**: `@patina/design-system` + the portal-local `ui/controls` (form controls).
- **Data access**: `@patina/supabase` hooks for Supabase data, `@patina/api-routes` proxy routes for NestJS service data. No ad-hoc `fetch` to a service.
- **NestJS services**: only orders, media, projects — add no new ones; use Supabase edge functions.
- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`). Group logical changes; push at task end (feature branches included).
- **Git hygiene**: NEVER `git add -A` (untracked landmines) — stage explicit pathspecs. Concurrent agents/sessions each get their own worktree (**patina-parallel-work**), retired at task end; `scripts/repo-gc.sh` (dry-run) sweeps stragglers. Compress large screenshots under `docs/` before committing (`sips -Z`/pngquant — docs history already carries 138 MB of PNGs).
- **No CI gates exist**: nothing runs tests/types/lint on push or PR — local verification is the only verification (**patina-verification**).
