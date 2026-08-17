# Patina Admin Portal

The admin portal is Patina's operator interface. It is a Next.js App Router application deployed to Cloudflare Workers and uses Supabase Auth exclusively. Server routes validate the current Supabase user and apply database authorization or retained-service proxy policy for each operation.

## Local development

From the monorepo root:

```bash
pnpm install
cp apps/admin-portal/.env.example apps/admin-portal/.env.local
pnpm supabase:start
pnpm --filter @patina/admin-portal dev
```

Before starting, confirm `NEXT_PUBLIC_SUPABASE_URL` points to the intended local environment. The browser uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; server proxy deployments also configure `SUPABASE_JWT_ISSUER` and `SUPABASE_PROJECT_REF`. `SUPABASE_SERVICE_ROLE_KEY` is server-only.

The portal listens on `http://localhost:3001`. Retained local services use their standard ports: orders `3015`, media `3014`, and projects `3016`.

## Verification

The production build is the strict type gate for this portal:

```bash
pnpm --filter @patina/admin-portal type-check
pnpm --filter @patina/admin-portal test
pnpm --filter @patina/admin-portal build
```

## Production

Production variables are committed in `wrangler.jsonc`; secrets are configured out of band. The only supported portal deployment entry point is:

```bash
./infra/deploy-portal.sh admin
```

See `AGENTS.md`, `.agents/skills/patina-local-dev/SKILL.md`, and `.agents/skills/patina-deploy/SKILL.md` for repository-wide procedures.
