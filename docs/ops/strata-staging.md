# Strata staging environment

Strata staging is a persistent, data-less Supabase branch of the production
Strata project. It is not a separate Supabase project and must never be pointed
at the retired Patina Staging project.

## Fixed identities

- Parent project: Strata (`bkvcixdmuyejfzcijpdg`)
- Branch name: `staging`
- Branch ref: `vuesoyhfrjabfxbrzekd`
- Branch mode: persistent, `with_data=false`, `us-east-1`, micro compute
- Cloudflare account: `be3aaeed18a81b5d90ee2263b62219ea`

The staging branch receives the repository migration history and the
staging-safe seed list in `supabase/config.toml`. It does not copy production
rows.

## Safety contract

- Work against staging from an isolated git worktree.
- Link the Supabase CLI only inside that worktree and verify the ref before any
  database command.
- Never copy production Resend or Twilio credentials into staging.
- Staging email and SMS remain in `dry_run` mode.
- Stripe and EasyPost must use test credentials only.
- OAuth and PostHog are disabled in staging portal environments.
- `NEXT_PUBLIC_*` values are compiled into portal bundles. The portal deploy
  script rejects a staging build unless it resolves the exact staging branch
  URL.

## Public endpoints

| Surface             | URL                                                               |
| ------------------- | ----------------------------------------------------------------- |
| Designer portal     | `https://patina-designer-portal-staging.kody-be3.workers.dev`     |
| Client portal       | `https://patina-client-portal-staging.kody-be3.workers.dev`       |
| Admin portal        | `https://patina-admin-portal-staging.kody-be3.workers.dev`        |
| Manufacturer portal | `https://patina-manufacturer-portal-staging.kody-be3.workers.dev` |
| Orders service      | `https://patina-orders-worker-staging.kody-be3.workers.dev`       |
| Projects service    | `https://patina-projects-worker-staging.kody-be3.workers.dev`     |
| Media service       | `https://patina-media-svc-worker-staging.kody-be3.workers.dev`    |
| Media processor     | `https://patina-media-worker-staging.kody-be3.workers.dev`        |
| Aesthete inference  | `https://patina-inference-worker-staging.kody-be3.workers.dev`    |

Staging media uses `patina-raw-staging`, `patina-processed-staging`,
`media-jobs-staging`, and `media-jobs-staging-dlq`.

## Database and Edge Functions

From an isolated worktree:

```bash
supabase link --project-ref vuesoyhfrjabfxbrzekd
supabase db push --dry-run
supabase db push
supabase functions deploy <function-name> --project-ref vuesoyhfrjabfxbrzekd
```

Use `supabase secrets set --project-ref vuesoyhfrjabfxbrzekd` for Edge Function
secrets. Before a database push, confirm the linked ref printed by the CLI and
confirm the dry run contains only the intended migrations.

## Cloudflare deployment

Portals must use the repository deploy script. Export the branch URL and anon
key into the build environment first; the script fails closed if the resolved
URL is not the staging branch.

```bash
./infra/deploy-portal.sh designer staging
./infra/deploy-portal.sh client staging
./infra/deploy-portal.sh admin staging
./infra/deploy-portal.sh manufacturer staging
```

Services use their existing Worker directories with the staging environment:

```bash
cd infra/orders-worker && npx wrangler deploy --env staging
cd infra/projects-worker && npx wrangler deploy --env staging
cd infra/media-svc-worker && npx wrangler deploy --env staging
cd infra/media-worker && npx wrangler deploy --env staging
cd infra/inference-worker && npx wrangler deploy --env staging
```

Set server-only Worker secrets with `wrangler secret bulk --env staging` or
`wrangler secret put --env staging`. Never place secrets in `wrangler.jsonc`.

## Verification

At minimum, verify:

1. Supabase Auth health returns 200 with the branch anon key.
2. The migration ledger matches the repository and staging seed counts are
   plausible.
3. Orders `/v1/health`, Projects `/v1/health`, Media `/health`, and inference
   `/healthz` return 200.
4. Each portal sign-in or landing page returns 200.
5. Deployed portal HTML and scripts contain no production project ref.
6. `wrangler deployments list --env staging` shows the new deployment as the
   bottom/newest entry.

Production deployment remains a separate, explicitly authorized operation.
