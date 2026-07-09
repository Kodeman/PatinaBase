---
name: patina-local-dev
description: Use when starting or debugging Patina locally — pnpm dev:* scripts, supabase start/reset, docker compose — or when a local dev server misbehaves (port in use, stale UI, orphaned next dev, missing-vendor-chunk), flag-gated UI is missing in dev, auth or app emails don't arrive, signing into one portal logs out another, or before any destructive action against a local database.
---
# Patina Local Development

Last verified: 2026-07-09 (main @ c4de810d, migrations head 00284). Re-verify load-bearing claims if the repo has moved.

## Use when / Don't use when
- USE when: booting the stack locally; a dev server is wrong/stale/orphaned or a port is taken; gated UI is missing in dev; auth or app emails don't show; a sign-in on one portal logs you out of another; before `supabase db reset`, seed edits, or any bulk local mutation.
- DON'T use for: writing portal source/hooks (patina-portal-features), migrations (patina-db-migrations), edge functions (patina-edge-functions), proving a change works by driving the app (patina-verification), tests (patina-testing), or anything touching prod (patina-deploy/patina-prod-ops).
- Scope boundary: this skill boots and troubleshoots the local environment. Feature code and the flag-gating pattern live in patina-portal-features.

## Procedure
Startup order (all three layers):
1. `docker compose up -d` — Redis (`:6379`, password-protected), MinIO (`:9000` API / `:9001` console), Mailhog (`:1025` SMTP / `:8025` web).
2. `pnpm supabase:start` — Postgres/Auth/Realtime/Storage/Studio via the CLI (API `:54321`, DB `:54322`, Studio `:54323`, Inbucket `:54324`).
3. A selective dev script (never `pnpm dev` — it fans out to everything):
   - `pnpm dev:designer` ≡ `pnpm dev:minimal` → designer-portal `:3000` + orders `:3015` + media `:3014` + projects `:3016`.
   - `pnpm dev:admin` → admin-portal `:3001` + orders + media (admin's dev script sets `NODE_OPTIONS='--max-http-header-size=32768'`).
   - `pnpm dev:client` → client-portal `:3002` + orders + projects.
   - `pnpm dev:frontend` → all four `@patina/*-portal` (adds manufacturer `:3003`), no backend.
   - `pnpm dev:backend` → the three NestJS services only. It does NOT start `services/aesthete-inference` (Python, own `Makefile`, no `package.json` → invisible to pnpm/turbo).

Port map (verified):

| Service | Port | Service | Port |
|---|---|---|---|
| designer-portal | 3000 | media | 3014 |
| admin-portal | 3001 | orders | 3015 |
| client-portal | 3002 | projects | 3016 |
| manufacturer-portal | 3003 | Supabase API | 54321 |
| Redis | 6379 | Supabase DB | 54322 |
| MinIO API / console | 9000 / 9001 | Supabase Studio | 54323 |
| Mailhog SMTP / web | 1025 / 8025 | Inbucket (auth mail) | 54324 |

Toolchain: pnpm `9.0.0` **exact** (`packageManager: pnpm@9.0.0`, corepack-pinned — not "any 9.x"), node ≥20. Install with `pnpm install`; use `pnpm install --frozen-lockfile` for a reproducible/CI install (`pnpm-lock.yaml` is committed).

BEFORE any destructive local action (db reset, seed edits, bulk UI/hook-driven mutations), confirm the portal is pointed at LOCAL, not Strata prod:
```bash
grep NEXT_PUBLIC_SUPABASE_URL apps/designer-portal/.env.local
# 127.0.0.1:54321 (or localhost) = local, safe
# *.supabase.co  = Strata PROD (bkvcixdmuyejfzcijpdg) — STOP, do not reset/seed/bulk-mutate
```
`apps/*/.env.local` has legitimately pointed at Strata prod for e2e before. If prod-pointed, stop and say so; prod mutations require an explicit user request this session (read-only prod is always fine). The old Coolify box is DEAD — never touch it.

Restarting a dev server (orphan gotcha): killing the `pnpm dev:*` wrapper orphans the underlying `next dev`, which keeps serving stale code/env. Kill by port, confirm free, relaunch:
```bash
lsof -ti :3000 | xargs kill      # repeat per occupied port (3001/3002/3014/3015/3016...)
lsof -ti :3000                   # expect NO output before relaunching
```

Never `next build` / `pnpm --filter <app> build` while that app's `next dev` is running — they share `.next` and corrupt it (`Cannot find module './xxxx.js'` / missing-vendor-chunk). While dev runs, the compile signal is `pnpm --filter <app> type-check`. Recovery: kill dev, `rm -rf apps/<app>/.next`, restart dev.

Flag-gated UI missing in dev: PostHog flags fail closed, so with no PostHog configured every flag is `false` and gated UI is invisible. Two fixes:
- Real flags: add to the app's `.env.local` — `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_POSTHOG_ENABLE_IN_DEV=true`. A `PreToolUse` hook in `.claude/settings.json` warns on `dev:designer|minimal|client|admin|frontend` when `apps/designer-portal/.env.local` is missing these.
- Deterministic override (no PostHog): `NEXT_PUBLIC_FLAG_OVERRIDES='<flag>:true'` in `.env.local`. It passes through turbo's strict env because `turbo.json` lists it in `globalPassThroughEnv`. `NEXT_PUBLIC_*` vars are inlined at dev start, so a change needs a restart.
- Known flags: `the-document-pilot` gates `/desk` (off ⇒ you land on `/portal` — not a bug); `procurement-workspace-pilot` gates the procurement zone.

Two-portal cookie collision: `:3000` and `:3002` share ONE host-only `sb-*` auth cookie on `localhost` (`packages/supabase/src/lib/cookie-domain.ts` returns `undefined` for localhost/IP/.local, and cookies aren't scoped by port). Signing into one portal evicts the other's session. Do all designer steps, then all client steps — or use separate browser profiles. Seed accounts (`supabase/seed/dev-accounts.sql`): `designer@patina.dev`, `client@patina.dev`, `admin@patina.dev`, plus `manufacturer@`, `studio_manager@`, `superadmin@`, `support@patina.dev`.

Mock-data mask: designer portal `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE` defaults to `auto`, which silently falls back to mock data on ANY error (`src/lib/mock-data.ts`). Set `=live` in `.env.local` when QA-ing real data paths or you get false greens (cross-ref patina-verification).

Local email — TWO separate inboxes, check the right one:
- GoTrue/auth email (magic links, confirmations, password resets) → **Inbucket** `http://localhost:54324`.
- App-sent SMTP (transactional/app mail) → **Mailhog** `http://localhost:8025`.

DB lifecycle:
- `pnpm supabase:reset` (= `cd supabase && supabase db reset`) replays all migration files then runs ONLY the seed files listed in `supabase/config.toml` `[db.seed] sql_paths` (15 files — the FIRST is the generated `00-legacy-grants.sql` ACL replay for Supabase's 2026-05-30 grant-default flip [regenerate via `python3 scripts/generate-legacy-grants.py`, never hand-edit]; then `dev-accounts.sql`, `organizations.sql`, `procurement_workspace_dev.sql`, `aesthete_demo.sql`, …). If a fresh stack throws 42501 permission errors on long-existing objects, that seed is stale — regenerate it (patina-db-migrations). The top-level `supabase/seed.sql` is orphaned (not in `sql_paths` — it does NOT run), and some files in `supabase/seed/` (e.g. `messages.sql`, `leads_room_scans.sql`) are also not wired in. To seed something on reset, add it to `sql_paths`.
- `pnpm supabase:stop` to stop. Regenerate types after a schema change — cross-ref patina-db-migrations.

Repo hygiene:
- Root `package.json` has `"type": "module"` → a new `.js` file at repo root parses as ESM. Use `.cjs` for a CommonJS script.
- `deno.lock` pollution: a bare `deno` run from repo root writes an untracked `./deno.lock`. Run edge-function `deno` with `--config supabase/functions/deno.json` (cross-ref patina-edge-functions).
- NEVER `git add -A` — the tree carries untracked landmines (`infra/.env.bak-*`, `deno.lock`, `.build/`, `.serena/`). Stage by explicit pathspec only (cross-ref patina-parallel-work).

## Commands
```bash
# Full local bring-up
docker compose up -d && pnpm supabase:start && pnpm dev:designer

# Confirm a portal points at LOCAL before anything destructive
grep NEXT_PUBLIC_SUPABASE_URL apps/designer-portal/.env.local   # want 127.0.0.1:54321

# Recover a corrupted dev build (missing-vendor-chunk), or clear an orphan
lsof -ti :3000 | xargs kill; rm -rf apps/designer-portal/.next; pnpm dev:designer

# Reset local DB (replays migrations + the 15 wired seed files) — LOCAL ONLY
pnpm supabase:reset
```
Expected: Supabase CLI prints an `API URL: http://127.0.0.1:54321` / `Studio URL: http://127.0.0.1:54323` block; a portal reports `Ready on http://localhost:3000`.

## Quality bar
- The env-URL check was run and showed local before any reset/seed/bulk mutation.
- Only a selective `dev:*` script was used (not `pnpm dev`).
- After any restart, the old server was killed by port and the port confirmed free.
- No `build` was run against an app with a live `dev`.
- Gated UI verified via a real PostHog key or `NEXT_PUBLIC_FLAG_OVERRIDES`, not assumed.

## Verification checklist
- [ ] `docker compose ps` shows redis/minio/mailhog up; `supabase status` shows the stack up.
- [ ] `grep NEXT_PUBLIC_SUPABASE_URL apps/<portal>/.env.local` = local before destructive work.
- [ ] Auth email found in Inbucket (`:54324`); app email found in Mailhog (`:8025`).
- [ ] Gated feature visible only with flag/override set.
- [ ] Real-data QA run with `DESIGNER_PORTAL_DATA_MODE=live`.
- [ ] No stray `next dev` on a port after a restart (`lsof -ti :<port>` empty pre-relaunch).

## Common mistakes
| Situation | Wrong move | Right move |
|---|---|---|
| About to `supabase db reset` / seed | Run it without checking env | `grep NEXT_PUBLIC_SUPABASE_URL .env.local`; abort if `*.supabase.co` (Strata prod) |
| Dev server serving stale code after "restarting" | Kill the `pnpm dev:*` wrapper only | `lsof -ti :<port> | xargs kill`, confirm free, relaunch (the child `next dev` orphans) |
| Want a compile check while dev runs | `pnpm --filter <app> build` | `pnpm --filter <app> type-check` (build shares `.next` → corruption) |
| Missing-vendor-chunk error | Keep restarting dev | Kill dev, `rm -rf apps/<app>/.next`, restart |
| Gated UI absent in dev | Assume it's broken | Flags fail-closed; set PostHog trio or `NEXT_PUBLIC_FLAG_OVERRIDES='<flag>:true'` |
| Landed on `/portal` not `/desk` | Debug the redirect | `the-document-pilot` is off — enable via flag/override |
| Signed into client, designer now logged out | Chase an auth bug | One shared localhost cookie; do designer then client, or separate profiles |
| Auth magic link "not sent" | Check Mailhog | GoTrue email is in Inbucket `:54324`, not Mailhog |
| Added a seed file, not seeding | Expect `supabase/seed.sql` to run | Add the path to `config.toml` `[db.seed] sql_paths` |
| Committing local artifacts | `git add -A` | Explicit pathspec only (untracked `.env.bak-*`, `deno.lock`, `.build/`, `.serena/`) |
| Expecting `dev:backend` to start Aesthete | Wait for the Python worker | It's not in pnpm/turbo; run its `Makefile` separately |

## Report back
State: which layers you started (docker / supabase / which `dev:*`) and the ports in use; the result of the env-URL check (local vs Strata) BEFORE any destructive step; which inbox you checked for email; how flags were made visible (real key vs override). Give observed evidence (Ready line, `supabase status`, screenshot/console). Call out explicitly what was NOT verified and flag immediately if any `.env.local` was prod-pointed — do not reset/seed/bulk-mutate a prod-pointed environment without an explicit user request this session.
