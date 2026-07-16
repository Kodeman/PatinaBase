# Suggested Commands

Verified against root `package.json` scripts (source of truth) on 2026-07-02. Package manager is pinned `pnpm@9.0.0` (`engines: node>=20, pnpm>=9`); Turborepo orchestrates most tasks. Platform is macOS/Darwin, shell is zsh.

## First-time / infra setup
```bash
pnpm install
docker compose up -d          # local infra ONLY: redis, minio, mailhog (NOT supabase). Use `docker compose` (v2, space), not `docker-compose`
pnpm supabase:start           # = `cd supabase && supabase start` — Postgres/Auth/Realtime/Storage/Studio. Studio http://localhost:54323
pnpm supabase:stop
pnpm supabase:reset           # = supabase db reset — reapplies all migrations + seed (the standard "does the DB build clean" check)
pnpm supabase:migration:new <name>
```
supabase CLI is installed locally (v2.72.7).

## Dev servers — use the SELECTIVE workflows, never bare `pnpm dev`
`pnpm dev` runs everything at `--concurrency=20` (avoid; CLAUDE.md says so too).
- `pnpm dev:designer` — Designer Portal (:3000) + orders + media + projects. **Identical filter to `pnpm dev:minimal`** (most common).
- `pnpm dev:admin` — Admin Portal (:3001) + orders + media (NO projects).
- `pnpm dev:client` — Client Portal (:3002) + orders + projects (NO media).
- `pnpm dev:frontend` — all `*-portal` apps, no backend.
- `pnpm dev:backend` — all `services/*` (NestJS), no frontend.
- **`manufacturer-portal` has NO convenience script** (see Tree drift below). Run it with `turbo run dev --filter=@patina/manufacturer-portal`.

## Build / verify
```bash
pnpm build           # turbo run build (respects dependency order)
pnpm build:no-cache  # when turbo cache is suspect
pnpm type-check      # turbo run type-check
pnpm lint            # turbo run lint      ; pnpm lint:fix
pnpm test            # turbo run test
pnpm format          # prettier --write (runs DIRECTLY, not via turbo) ; pnpm format:check
```

## Database code-gen
Two distinct layers — do not confuse them:
- **Supabase (public schema, types + client)** via `@patina/supabase`:
  - `pnpm db:generate`, `pnpm db:push`, `pnpm db:studio`
- **Prisma (retained NestJS services, schema-isolated)** — runs all three sequentially:
  - `pnpm prisma:generate` → orders + media + projects `prisma generate`
  - `pnpm prisma:push` → orders + media + projects `prisma db push`

## Remote / prod DB
`pnpm supabase:remote:{bootstrap,push,pull,diff,types,psql}` — all wrap `./scripts/remote-db.sh`.

## Cleanup
`pnpm clean` (turbo clean + rm node_modules) ; `pnpm clean:cache` (also rm .turbo).

## Darwin / environment notes (only where they differ)
- Bash-tool cwd resets between calls and a `cd` inside a compound command can trigger a permission prompt — prefer the pnpm scripts above (the `supabase:*` scripts already `cd supabase` internally), or pass absolute paths.
- Node v24 is installed locally even though `engines` says `>=20`; pnpm is exactly `9.0.0`.
- Killing a backgrounded `pnpm dev:designer` can orphan the underlying `next dev` on :3000 (see `mem:` feedback on dev-server orphans). Check with `lsof -i :3000` before restarting.
- Worktree builds need turbo (the `dist/` dependency gotcha) — build via `pnpm build`, not per-package tsc, when in a `.claude/worktrees/*` checkout.

## Tree drift vs root CLAUDE.md (verified 2026-07-02)
CLAUDE.md's structure section is slightly stale — the actual tree also contains:
- `apps/manufacturer-portal` (`@patina/manufacturer-portal`) — not listed, and has no `dev:*` script.
- `packages/aesthete-quiz`, `packages/catalog-ui`, `packages/help-system` — not listed.
- `services/aesthete-inference` IS present (CLAUDE.md does mention it).
