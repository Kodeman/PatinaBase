# Platform Infrastructure — Consolidated PRD

## Status

Production is Supabase Cloud project **Strata** (`bkvcixdmuyejfzcijpdg`) plus Cloudflare. Portals run on Cloudflare Workers through OpenNext; the orders, media, and projects services run on Cloudflare Containers. The retained Aesthete inference service is packaged by `infra/inference-worker`.

This document was reconciled on 2026-08-15. Historical deployment material is isolated under `docs/_archive/` and is not operational guidance.

## Authoritative references

- `AGENTS.md`
- `docs/engineering/patina-cloudflare-plan.md`
- `docs/engineering/patina-cloudflare-phase-1-runbook.md`
- `infra/runbooks/portal-ops.md`
- `infra/runbooks/service-ops.md`
- `infra/runbooks/email-ops.md`
- `infra/inference-worker/README.md`
- `supabase/config.toml`
- portal and service `wrangler.jsonc` units

## Runtime topology

```text
Web / iOS / Extension
        |
        v
api.patina.cloud
        |-- Supabase Auth / Realtime / REST / Functions compatibility paths
        |-- typed Worker-native routes through Hyperdrive
        `-- retained Cloudflare Containers through service bindings

assets.patina.cloud --> policy Worker --> private R2
```

Supabase owns Auth, Postgres, Realtime, Storage during Phase 1, and Edge Functions. The three NestJS services retain Prisma and connect through Supavisor. Worker-native SQL uses fresh or explicitly public-cache Hyperdrive bindings according to the Cloudflare roadmap. Auth is Supabase Auth only.

## Repository source of truth

- Portals: `apps/{designer,admin,client,manufacturer}-portal/wrangler.jsonc`
- Portal deploy entrypoint: `./infra/deploy-portal.sh <portal>`
- Container Workers: `infra/{orders,media-svc,projects}-worker/`
- Inference Container Worker: `infra/inference-worker/`
- Database and RLS: `supabase/migrations/`
- Function configuration: `supabase/config.toml`
- Edge Functions: `supabase/functions/`
- Local-only Redis, MinIO, and Mailhog: root `docker-compose.yml`

No other compose stack, tunnel, image-publishing workflow, or host-specific volume configuration is an active production source of truth.

## Supported operations

### Portals

```bash
./infra/deploy-portal.sh designer-portal
./infra/deploy-portal.sh admin-portal
./infra/deploy-portal.sh client-portal
./infra/deploy-portal.sh manufacturer-portal
```

The script rebuilds workspace package artifacts before OpenNext packaging. Portal production variables live in each committed `wrangler.jsonc` `vars` block; secrets remain Wrangler secrets.

### Container services

```bash
cd infra/orders-worker && npx wrangler deploy
cd infra/media-svc-worker && npx wrangler deploy
cd infra/projects-worker && npx wrangler deploy
cd infra/inference-worker && npx wrangler deploy
```

Run only the unit affected by an approved release. Verify with the bottom row of `wrangler deployments list` and a behavior probe; static version defaults prove liveness, not freshness.

### Database and Edge Functions

```bash
supabase db push
supabase functions deploy <name>
```

The linked production project must be Strata before any approved production mutation. Deploy every function importing a changed `_shared` module. Public functions keep their declarative `verify_jwt` setting in `supabase/config.toml` and use the matching CLI flag where required.

## Security and cache boundaries

- `service_role` remains server-side.
- Authenticated SQL preserves Supabase RLS with verified, transaction-local JWT claims.
- Authenticated proxy/API responses default to `private, no-store`.
- Public caching requires an explicit reviewed opt-in and is limited to approved public views.
- R2 origins are private; policy Workers authorize before serving bytes.
- Secrets, bearer tokens, cookies, SQL parameters, and user content are excluded from logs.

## Local development

The root compose file starts only Redis, MinIO, and Mailhog. Supabase local services are started with the Supabase CLI. Production URLs in portal `.env.local` files must be checked before any destructive local command.

```bash
docker compose up -d
pnpm supabase:start
pnpm dev:minimal
```

## Verification

There is no remote CI quality gate; affected local verification is mandatory. Use `.agents/skills/patina-verification/SKILL.md` to select checks. At minimum, build/type-check/test the changed package or service and every changed consumer. Production releases also require deployment-list evidence and behavior probes.

## Open roadmap

The decision-complete sequence lives in `docs/engineering/patina-cloudflare-plan.md`:

1. Phase 1: edge router, compatibility paths, dual Hyperdrive bindings, catalog canary.
2. Phase 2: private R2 media registry, upload/delivery contracts, verified copy and cutover.
3. Phase 3: capture enrichment ledger/outbox, Queues, Workers AI, retained Nomic vectors.
4. Phase 4: typed API strangler and retirement of unused compatibility paths.
