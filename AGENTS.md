# AGENTS.md

## Project

Patina connects interior designers with manufacturers for custom furnishings. It is a Supabase-first hybrid monorepo: Supabase owns auth, database, realtime, and storage; the retained NestJS services (`orders`, `media`, `projects`) own complex domains through Prisma schemas.

- pnpm 9.0.0, Node 20+, Turborepo, Next.js/React/TypeScript
- Supabase Auth only; never introduce NextAuth
- Production is Cloudflare plus the Supabase Cloud project Strata
- The old Coolify host and its deployment files are retired; never deploy or SSH to it
- iOS apps live under `apps/mobile`; the Chrome extension lives under `apps/extension`

## Skills

Canonical project skills live in `.agents/skills`. Read the matching skill before database migrations, edge functions, portal features, local development, verification, testing, deploys, production operations, Stripe work, iOS work, or parallel/worktree operations. The index is `.agents/skills/README.md`.

## Safety and authority

- Production mutation requires an explicit user request in the current session. Drafts and plans are not authorization.
- Pushes, PR creation/merge, migrations, deployments, secret access, database resets, and destructive commands require approval.
- Never read, print, commit, or copy `.env*`, credential files, SSH material, or backup-secret files unless the user explicitly authorizes the exact operation.
- Before any local reset, seed, or bulk mutation, confirm the relevant portal URL is localhost/127.0.0.1. Stop if it contains `.supabase.co`.
- Service-role credentials remain server-side. Agent database writes go through the audited `agent_tasks` queue and its RPCs, never directly to business tables.
- No automated external sends. Drafts land in `awaiting_review`.

## Herdr workflow

- Herdr is the only worktree control plane. Do not use Claude `--worktree`, Codex-managed worktrees, or manual nested worktrees.
- Canonical checkout: `/Users/kody/Code/patina-merged`; canonical branch: `main` tracking `origin/main`.
- Worktrees live under `/Users/kody/Code/.herdr-worktrees/patina-merged` and use `ai/<issue>-<slug>` branches.
- Maximum active lanes: two implementation worktrees plus one serialized runtime/review lane.
- One writer per worktree. Assign disjoint paths; serialize changes to the lockfile, migrations, generated DB types, root config, CI, infrastructure, agent rules, and skills.
- Only the runtime/review lane owns Docker, Supabase, seeds/resets, fixed ports, interactive QA, and candidate review.
- Bootstrap a new checkout with `scripts/bootstrap-worktree.sh`; never share or symlink `node_modules`.
- At completion, prove ancestry, remove the Herdr checkout, and delete a merged branch. Run `scripts/repo-gc.sh` without `--apply` first.

## Essential commands

```bash
pnpm install --frozen-lockfile
docker compose up -d
pnpm supabase:start
pnpm supabase:stop
pnpm supabase:reset
pnpm dev:designer   # selective dev only; never bare `pnpm dev`
pnpm dev:admin
pnpm dev:client
pnpm verify:affected -- <base> <head>
```

Ports: portals 3000–3003; media 3014; orders 3015; projects 3016; Supabase API/DB/Studio 54321/54322/54323; Inbucket 54324; Redis 6379; MinIO 9000/9001; Mailhog 1025/8025.

## Architecture conventions

- Import domain types from `@patina/types`; do not redefine them.
- Use `@patina/design-system` and portal-local controls for UI.
- Use `@patina/supabase` hooks for Supabase data and `@patina/api-routes` proxies for retained NestJS services. Do not add ad-hoc service fetches.
- Do not add another NestJS service; use Supabase edge functions for new server capabilities.
- Migrations are hand-numbered `NNNNN_slug.sql`; never use `supabase migration new`. Reconcile provisional numbers against the integration tip immediately before merge.
- Portal deployment must use `./infra/deploy-portal.sh <name>`. A `_shared` edge-function change requires redeploying every importer when deployment is authorized.

## Git and verification

- Conventional Commits. Stage and commit explicit pathspecs only; never `git add -A` or `git add .`.
- Run the narrowest real gate first and report exact evidence plus anything not verified.
- Designer/client/manufacturer: type-check plus relevant tests. Admin: build plus tests. NestJS service: build plus relevant tests.
- Shared package: package gates plus affected consumer gates and the admin build. Migration: local reset, SQL assertions, and generated-type diff. Edge function: Deno check/test plus local behavior.
- Root Turbo commands silently skip missing scripts; lint is trustworthy only where a valid config exists. Follow `patina-verification` rather than inferring success from a green root command.
- Reviewers are findings-only. The writer resolves accepted findings and reruns affected gates before requesting push approval.
