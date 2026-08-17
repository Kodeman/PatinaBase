# Patina Designer Portal

The designer portal is Patina's primary workspace for designers. It is a Next.js App Router application deployed to Cloudflare Workers and uses Supabase Auth, Postgres/RLS, Realtime, and Storage. Complex orders, media, and projects operations are reached through authenticated `@patina/api-routes` proxy handlers.

## Local development

From the monorepo root:

```bash
pnpm install
cp apps/designer-portal/.env.example apps/designer-portal/.env.local
pnpm supabase:start
pnpm --filter @patina/designer-portal dev
```

Before starting, confirm `NEXT_PUBLIC_SUPABASE_URL` in `.env.local` points to the intended local environment. The required auth settings are `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; server proxy deployments also configure `SUPABASE_JWT_ISSUER` and `SUPABASE_PROJECT_REF` so JWT and cookie validation remain scoped to Strata. Never expose `SUPABASE_SERVICE_ROLE_KEY` to browser code.

The portal listens on `http://localhost:3000`. Retained local services use their standard ports: orders `3015`, media `3014`, and projects `3016`.

## Verification

```bash
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/designer-portal test
pnpm --filter @patina/designer-portal build
```

## Production

Production auth remains Supabase Auth. Portal variables are committed in `wrangler.jsonc`; secrets are configured out of band. The only supported portal deployment entry point is:

```bash
./infra/deploy-portal.sh designer
```

See `AGENTS.md`, `.agents/skills/patina-local-dev/SKILL.md`, and `.agents/skills/patina-deploy/SKILL.md` for repository-wide procedures.
