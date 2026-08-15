# Patina Cloudflare Phase 1 runbook

Status: execution runbook  
Owner: Platform  
Alert recipient: `kody@patina.cloud`  
Rollback objective: restore the catalog path within five minutes

## Outcome

Phase 1 ends when current Supabase SDK traffic is compatible through the edge router and the public product catalog can run through a least-privilege, dual-Hyperdrive path with a reviewed, measured, reversible production canary.

This runbook authorizes no hidden credentials. Password-bearing database logins, Cloudflare resource creation, Supabase branch creation, DNS/Worker route changes, migrations, and deploys are performed only from an explicitly authorized execution session with the correct account already authenticated.

## Scope

Included:

- the Cloudflare Edge API Worker;
- Supabase compatibility proxying;
- the typed public catalog endpoint;
- cache-disabled and public-cached Hyperdrive bindings;
- migration-owned group roles and public catalog view;
- a data-less persistent staging branch with synthetic fixtures;
- cache/auth cleanup, Aesthete image-fetch hardening, and retired deployment cleanup;
- a client-portal catalog hydration pilot;
- contracts and sanitized inventories needed by media/capture phases;
- staging verification, production shadowing, catalog canary, and rollback drill.

Excluded:

- moving retained Prisma Containers to Hyperdrive;
- changing Supabase Auth or Realtime providers;
- migrating owned media bytes;
- creating the capture Queue/AI pipeline;
- retiring `/rest/v1` or `/storage/v1` compatibility;
- copying production customer data to staging.

## Resource names

| Resource                 | Local                   | Staging                                | Production                                                          |
| ------------------------ | ----------------------- | -------------------------------------- | ------------------------------------------------------------------- |
| Worker                   | `patina-edge-api-local` | `patina-edge-api-staging`              | `patina-edge-api`                                                   |
| Host                     | `localhost`             | `api-staging.patina.cloud`             | `api.patina.cloud`                                                  |
| Fresh binding            | local direct Postgres   | `strata-staging-fresh`                 | `strata-prod-fresh`                                                 |
| Public-cache binding     | local direct Postgres   | `strata-staging-public-cache`          | `strata-prod-public-cache`                                          |
| Supabase environment     | local CLI               | persistent branch `staging`            | Strata `bkvcixdmuyejfzcijpdg`                                       |
| Catalog group role       | `edge_catalog_reader`   | same                                   | same                                                                |
| Authenticated group role | `edge_rls_user`         | same                                   | same                                                                |
| Password login           | local disposable        | `edge_catalog_login`, `edge_rls_login` | same role names in the separate database; production-only passwords |

Never reuse a password or connection string across staging and production. Hyperdrive configuration IDs are deployment outputs and are committed only as Wrangler binding IDs if project policy permits; connection strings and passwords never enter Git.

## Binding policy

| Binding           | Caching                | Permitted                                                                         | Forbidden                                                                        |
| ----------------- | ---------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `DB_FRESH`        | disabled               | authenticated reads, RLS, permissions, writes, read-after-write, status, pgvector | migrations, Prisma, locks, `LISTEN`/`NOTIFY`, admin sessions                     |
| `DB_PUBLIC_CACHE` | 60s max age, 15s stale | exact approved public catalog-view query                                          | user-scoped data, permissions, writes, fresh-after-write, vectors, arbitrary SQL |

Cloudflare local mode does not prove remote Hyperdrive pooling or caching. Pool/cache evidence must come from a deployed staging Worker.

## Database ownership and grants

### Migration-owned objects

The migration creates or reconciles:

```sql
CREATE ROLE edge_catalog_reader NOLOGIN NOBYPASSRLS NOINHERIT;
CREATE ROLE edge_rls_user       NOLOGIN NOBYPASSRLS NOINHERIT;

GRANT USAGE ON SCHEMA public TO edge_catalog_reader;
GRANT SELECT ON public.edge_catalog_products TO edge_catalog_reader;
REVOKE ALL ON public.products FROM edge_catalog_reader;

GRANT authenticated TO edge_rls_user;
```

The exact idempotent form lives in the numbered migration. The catalog view is `security_barrier`, contains only approved columns, and fixes `layer = 'catalog'` plus `status = 'published'` inside its definition. `edge_rls_user` receives no direct service-role membership, no `BYPASSRLS`, and no database ownership.

PostgreSQL role privileges are additive and every login is a member of `PUBLIC`. Before either password login exists, the SQL gate must enumerate effective schema, table, sequence, and routine privileges for both group roles. `edge_catalog_reader` must have no effective capability beyond database connection plus usage/select on the approved catalog surface; `edge_rls_user` must have no capability broader than the reviewed `authenticated` role chain. Any inherited `PUBLIC` privilege that breaks those allow-lists is a provisioning blocker, not a warning.

### Out-of-band login creation

Run once per environment from an administrative `psql` session. Supply passwords through `psql` variables or a password manager, never shell history or a checked-in file.

```sql
CREATE ROLE edge_catalog_login LOGIN INHERIT NOBYPASSRLS PASSWORD :'catalog_password';
CREATE ROLE edge_rls_login     LOGIN NOINHERIT NOBYPASSRLS PASSWORD :'rls_password';
GRANT edge_catalog_reader TO edge_catalog_login
  WITH INHERIT TRUE, SET FALSE;
GRANT edge_rls_user TO edge_rls_login
  WITH INHERIT FALSE, SET TRUE;
```

If a login already exists, rotate its password out of band and reconcile only the intended memberships. Confirm:

```sql
SELECT rolname, rolcanlogin, rolinherit, rolbypassrls
FROM pg_roles
WHERE rolname IN (
  'edge_catalog_reader', 'edge_rls_user',
  'edge_catalog_login', 'edge_rls_login'
)
ORDER BY rolname;
```

Expected: group roles cannot log in; login roles can; all four are `NOBYPASSRLS`. The catalog login inherits only the audited catalog-reader membership. The RLS login inherits nothing and can enter only the reviewed role chain with `SET LOCAL ROLE`.

### Authenticated request transaction

After the Worker verifies a Supabase JWT, every authenticated operation follows one transaction:

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', $1, true);
-- parameterized domain SQL
COMMIT;
```

On any error, issue `ROLLBACK`, close the client, and return a redacted error. Never use session-level `SET ROLE` or `set_config(..., false)`. Tests execute two different callers successively and prove the second cannot observe the first caller's claims or role.

## Route matrix

| Route                      | Auth                    | Upstream/binding                | Cache                        | Failure behavior                          |
| -------------------------- | ----------------------- | ------------------------------- | ---------------------------- | ----------------------------------------- |
| `/auth/v1/*`               | Supabase protocol       | Supabase Auth                   | no-store                     | preserve upstream status/body             |
| `/realtime/v1/*`           | Supabase protocol       | Supabase Realtime               | no-store                     | preserve WebSocket status/frames          |
| `/rest/v1/*`               | Supabase protocol       | Supabase REST                   | no-store                     | preserve upstream status/body/CORS        |
| `/graphql/v1/*`            | Supabase protocol       | Supabase GraphQL                | no-store                     | preserve upstream status/body             |
| `/functions/v1/*`          | function-specific JWT   | Supabase Functions              | no-store                     | preserve upstream status/body             |
| `/storage/v1/*`            | Supabase protocol       | Supabase Storage                | no-store                     | preserve upstream status/body             |
| `GET /v1/catalog/products` | public                  | public view via selected source | public 60s + 15s stale       | legacy public result on HD error/mismatch |
| `GET /_internal/health`    | Access or service token | probe both bindings             | private, no-store            | generic binding readiness only            |
| other `/v1/*`              | route-defined           | `DB_FRESH` or Container binding | private, no-store by default | fail closed                               |
| unmatched                  | none                    | none                            | no-store                     | 404                                       |

Compatibility responses must preserve Supabase CORS headers and cookies. The Worker must not forward to a hostname that routes back to itself. Logging is allow-list based and excludes authorization, API keys, cookies, query contents, SQL, PII, and bodies.

## Public catalog contract

Request:

```http
GET /v1/catalog/products?ids=<uuid>,<uuid>
```

Rules:

- `ids` is required;
- split on commas, trim, validate UUIDs, deduplicate, then enforce 1–50;
- SQL uses a typed UUID array parameter, never interpolated identifiers/values;
- view predicate and grants provide defense in depth;
- response order is ascending ID;
- empty authorized result is `200 []`;
- malformed input is `400`; over-limit input is `400`;
- ETag is computed from canonical normalized output;
- successful public results emit `public, max-age=60, stale-while-revalidate=15`;
- errors and authenticated responses emit `private, no-store`.

Canary configuration supports `legacy`, `shadow`, and `hyperdrive` catalog sources plus deterministic percentage bucketing. In shadow mode, the response is normalized legacy data while Hyperdrive is compared asynchronously by count and stable hash. A mismatch or Hyperdrive failure records a redacted alert event and returns only the legacy public-catalog result.

## Agent and path ownership

| Owner                | Exclusive paths                                                                                                                      | Required evidence                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| database/staging     | numbered migration, `supabase/tests/**`, `supabase/config.toml`, staging seeds, generated grants/types                               | clean reset, SQL assertions, object probes, type diff          |
| edge router          | `infra/edge-api-worker/**`, catalog shared type, client hydration adapter/tests                                                      | Worker tests/types/dry-run, shared/client gates                |
| security/legacy      | `@patina/api-routes`, cache callsites, active Supabase auth consumers, Aesthete fetch/tests, retired executable infra/reference gate | package/portal tests, hostile fetch cases, reference inventory |
| coordinator          | these two documents, integration merges, live preflight, staging/prod execution, rollback                                            | merge/review record, account/resource outputs, canary log      |
| independent reviewer | read-only diff and commits                                                                                                           | every finding with severity and confidence                     |

Only the database agent resets/seeds local Supabase and owns migration numbering. Each implementation branch uses an `agent-*` worktree, explicit pathspec staging, Conventional Commits, and mandatory worktree retirement.

## Local implementation sequence

From the isolated integration worktree:

```bash
corepack enable
pnpm install
pnpm turbo build --filter=@patina/types --filter=@patina/api-routes
```

Database owner:

```bash
ls supabase/migrations/*.sql | sort | tail
python3 scripts/generate-legacy-grants.py
pnpm supabase:reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 -f supabase/tests/edge_api/catalog_roles_test.sql
pnpm db:generate
```

Edge owner, from `infra/edge-api-worker`:

```bash
npm ci
npx wrangler types
npm run type-check
npm test
npx wrangler deploy --dry-run
```

Shared/portal gates:

```bash
pnpm --filter @patina/types build
pnpm --filter @patina/types type-check
pnpm --filter @patina/api-routes build
pnpm --filter @patina/api-routes type-check
pnpm --filter @patina/api-routes test
pnpm --filter @patina/client-portal type-check
pnpm --filter @patina/client-portal test -- <targeted-catalog-adapter-test>
pnpm --filter @patina/admin-portal build
```

Aesthete gates:

```bash
cd services/aesthete-inference
make test
```

Also run the focused hostile URL/redirect/rebinding/oversize/timeout suite and the active-deployment-reference gate added by Phase 1. Do not use repository-wide lint outside designer-portal as completion evidence.

## Staging provisioning

### Preflight

Stop before mutation unless all are true:

- the current session explicitly authorizes staging/prod execution;
- `git status --short` is clean in the integration worktree;
- the reviewed commit is checked out;
- `supabase projects list` shows the intended organization/project;
- `npx wrangler whoami` shows the intended Cloudflare account;
- the password manager contains new staging login secrets;
- `api-staging.patina.cloud` ownership/routing is available;
- no customer data export or filename list is present in the worktree.

### Persistent branch

Current Supabase CLI branching commands are experimental. Create the persistent branch interactively so its name is exactly `staging`, then record its branch project ID:

```bash
supabase --experimental branches create --persistent
supabase --experimental branches list
```

Add that branch project ID to:

```toml
[remotes.staging]
project_id = "<staging-branch-project-id>"

[remotes.staging.db.seed]
enabled = true
sql_paths = ["./seed/<phase-1-staging-seed>.sql"]
```

The remote cannot be configured before the branch exists. Load `STAGING_PROJECT_REF` and the percent-encoded `STAGING_DB_URL` from the password manager without printing them. Abort unless the URL contains the branch ref and the ref is not the production ref:

```bash
set -euo pipefail
: "${STAGING_PROJECT_REF:?load the staging branch ref}"
: "${STAGING_DB_URL:?load the percent-encoded staging direct URL}"

STAGING_DB_HOST="$(
  STAGING_DB_URL="$STAGING_DB_URL" node -e \
    'process.stdout.write(new URL(process.env.STAGING_DB_URL).hostname)'
)"
test "$STAGING_PROJECT_REF" != "bkvcixdmuyejfzcijpdg"
test "$STAGING_DB_HOST" != "db.bkvcixdmuyejfzcijpdg.supabase.co"
case "$STAGING_DB_HOST" in
  "db.${STAGING_PROJECT_REF}.supabase.co") ;;
  *) echo "staging direct host/ref mismatch" >&2; exit 1 ;;
esac
printf 'validated staging database host: %s\n' "$STAGING_DB_HOST"

pnpm exec supabase db push --dry-run --db-url "$STAGING_DB_URL"
pnpm exec supabase db push --db-url "$STAGING_DB_URL"
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/seed/cloudflare-phase1-staging.sql
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/edge_api/catalog_roles_test.sql
```

The explicit `--db-url` is mandatory: a bare `supabase db push` targets linked production Strata. Never point `pnpm supabase:reset` at a remote URL. Record the sanitized branch ref and direct role/view probes before proceeding.

The committed staging seed contains deterministic IDs and non-secret fixture identities only. Seeded Auth users are passwordless, unconfirmed, and indefinitely banned. Activate only the accounts needed for the compatibility test by calling `supabase.auth.admin.updateUserById` from a server-only operator script using the staging service-role credential:

```ts
await stagingAdmin.auth.admin.updateUserById(userId, {
  password: passwordLoadedFromThePasswordManager,
  email_confirm: true,
  ban_duration: "none",
});
```

Never expose the service-role credential to a browser or commit the password. After the test window, set a new discarded random password and restore a long ban through the same Admin API, then prove sign-in fails. Record only the synthetic user ID, activation/deactivation timestamps, and pass/fail result.

### Hyperdrive

Use the branch's direct Supabase database endpoint and its environment-specific logins:

```bash
read -s STAGING_EDGE_RLS_URL
npx wrangler hyperdrive create strata-staging-fresh \
  --connection-string="$STAGING_EDGE_RLS_URL" \
  --caching-disabled
unset STAGING_EDGE_RLS_URL

read -s STAGING_CATALOG_URL
npx wrangler hyperdrive create strata-staging-public-cache \
  --connection-string="$STAGING_CATALOG_URL"
unset STAGING_CATALOG_URL
```

The URL values do not enter shell history, but Wrangler necessarily expands them into a short-lived process argument. Run this on the private operator host, ensure no process tracing is active, and unset each variable immediately. Confirm the public-cache defaults are `max_age=60` and `stale_while_revalidate=15`; update explicitly if the live account differs. Put the returned configuration IDs into the staging Wrangler environment's `DB_FRESH` and `DB_PUBLIC_CACHE` bindings. Set secrets with `wrangler secret put`; never pass values in a report.

### Worker and host

```bash
cd infra/edge-api-worker
npx wrangler deploy --env staging
npx wrangler deployments list --name patina-edge-api-staging
```

Attach `api-staging.patina.cloud` only after direct `workers.dev` probes pass. Verify the bottom deployment-list row and behavior; static `/version` values are not freshness evidence.

## Staging verification matrix

Record each row as pass/fail with trace ID, timestamp, and sanitized evidence:

| Area      | Required cases                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------------- |
| Auth      | sign-in, refresh, OAuth callback, expired JWT, wrong issuer, wrong audience                                           |
| Claims    | two successive users through pooled connections; no role/JWT retention                                                |
| Catalog   | catalog visible; personal/studio absent; 1/50/51 IDs; duplicate/malformed/injection-shaped input; deterministic order |
| Sources   | normalized legacy = fresh = cached for fixtures; cache expiry observed remotely                                       |
| REST      | select, filtered select, RPC, error/status/CORS preservation                                                          |
| Functions | authenticated function and deliberate upstream error                                                                  |
| Storage   | authorized read/upload protocol and error preservation                                                                |
| Realtime  | WebSocket upgrade, auth, subscribe, event, reconnect                                                                  |
| Proxy     | cookies, refresh headers, redirects, route-loop prevention                                                            |
| Health    | Access/service-token allow; anonymous deny; both binding failures redacted                                            |
| Failure   | DB unavailable, timeout, pool pressure/exhaustion, malformed DB result, upstream timeout                              |
| Logging   | no tokens, API keys, cookies, SQL parameters, URLs/PII, or bodies                                                     |

Local mode is insufficient for the cache/pool rows.

## Read-only production census

The census is aggregate-only and creates no customer artifact in Git.

Collect:

- object count and total bytes by store/bucket, MIME class, age band, and path class;
- database tables/columns that contain media keys, URLs, object IDs, or signed-URL shapes;
- aggregate URL-shape counts for bare keys, public Supabase URLs, signed URLs, R2 keys, and external URLs;
- aggregate `vendor-logos` coverage;
- counts for unledgered objects, empty `rawKey` sessions, missing renditions, and the known R2 physical-view discrepancy.

Do not record customer filenames, object contents, complete object keys, signed URLs, tokens, user identities, or unredacted source URLs. Commit only aggregate tables and decision implications.

## Phase 2 media decision matrix

| Access/lifecycle           | Authorization owner              | URL                              | Cache                               | Retention/transform                         |
| -------------------------- | -------------------------------- | -------------------------------- | ----------------------------------- | ------------------------------------------- |
| public catalog             | catalog publication rules        | stable versioned                 | public immutable                    | original retained; fixed presets            |
| authenticated project      | project/RLS/domain policy        | short capability                 | auth before cache                   | lifecycle follows project/registry          |
| guest share                | share ledger, expiry, revocation | short capability                 | auth before cache                   | share does not change ownership             |
| released deliverable       | release ledger                   | stable or capability per release | immutable after auth classification | audit artifact retained                     |
| legal hold                 | domain + legal hold              | never broadens access            | no accidental public cache          | blocks GC                                   |
| third-party product source | catalog/license provenance       | delivered from owned R2 copy     | policy-derived                      | original fetch retained with license/source |

Canonical domain references contain registry object ID/version, not signed URLs. Upload intents are idempotent and domain-authorized; confirmation matches actor, route/body IDs, and R2-observed checksum/type/size before enqueue.

## Phase 3 capture contracts and golden set

The committed schema/message contract is:

```ts
type CaptureEnrichmentMessageV1 = {
  schemaVersion: 1;
  enrichmentRunId: string;
  contentRevision: number;
  traceId: string;
};
```

Golden-set cases must include:

- one extension URL capture with a valid public product image;
- redirect to a private/reserved address;
- duplicate delivery and stale content revision;
- deleted/dismissed/superseded capture;
- personal, studio, and catalog source semantics;
- multilingual OCR with English normalization and original text retention;
- Field audio success, unsupported media, and timeout/partial completion;
- empty versus designer-entered fields proving suggestions never overwrite confirmed data;
- matched and unmatched controlled-vocabulary candidates;
- terminal model/config error and manual retry;
- Nomic job key changing with content revision/hash.

The database ledger, not Queue delivery order, decides idempotency and current revision.

## Production preparation

An independent reviewer must sign off on every Wave 1 commit and staging evidence before production resource creation. Findings cover authorization bypass, cross-user claim leakage, cache disclosure, SQL injection, SSRF, proxy loops, secret logging, and accidental removal of live paths; each carries severity and confidence.

Before production mutation:

- integration branch reviewed and clean;
- migration head reconciled with Strata; undeployed collisions renumbered;
- all required local and staging gates pass;
- zero unexplained authorization or normalized shadow mismatches;
- production logins are new, least-privilege, and distinct from staging;
- current `api.patina.cloud` DNS target is confirmed as the direct Supabase endpoint;
- Cloudflare Worker route addition/removal procedure is tested;
- alert delivery to `kody@patina.cloud` is tested without exposing customer content;
- rollback operator and timer are assigned.

## Production rollout

Execute in this order:

1. apply the reviewed migration to Strata and probe roles/view/grants directly;
2. create/rotate out-of-band production logins;
3. create `strata-prod-fresh` with caching disabled;
4. create `strata-prod-public-cache` and confirm 60s/15s policy;
5. deploy `patina-edge-api` in compatibility/legacy mode;
6. attach `api.patina.cloud/*` as a Worker route without changing the Supabase CNAME;
7. validate compatibility routes and log redaction;
8. enable catalog shadow queries and require zero unexplained mismatches;
9. run the rollback drill;
10. promote Hyperdrive catalog source to 10%, hold one hour;
11. promote to 50%, hold one hour;
12. promote to 100%, hold one hour;
13. merge/deploy only the independently reviewed commit and archive sanitized evidence.

At every canary level, a mismatch or Hyperdrive failure returns the legacy public-catalog result and alerts. It never returns a broader direct-table query.

## Promotion checklist

All functional boxes block promotion. Metrics are recorded but latency/cache/connection values are observational in Phase 1.

- [ ] no personal or studio product returned;
- [ ] no authenticated response has public cache headers;
- [ ] compatibility Auth sign-in/refresh/OAuth works;
- [ ] Realtime WebSocket connects and recovers;
- [ ] REST/RPC/Functions/Storage passthrough matches upstream;
- [ ] no secrets or user content in sampled logs;
- [ ] shadow count/hash has zero unexplained mismatches;
- [ ] Hyperdrive failures fall back to normalized legacy output;
- [ ] alerts reach `kody@patina.cloud` without sensitive payloads;
- [ ] DB/query/upstream failure probes fail closed;
- [ ] current deployment verified by deployment list plus behavior;
- [ ] one-hour observation window completed at the current percentage;
- [ ] p50/p95/p99 latency, cache hit ratio, connection errors, fallback count, and mismatch count recorded.

## Rollback

### Catalog-only rollback

1. set catalog source to `legacy` using the pre-approved configuration mechanism;
2. verify a known catalog request returns the normalized legacy result;
3. verify no personal/studio fixtures or production records appear;
4. confirm mismatch/fallback metrics stop increasing;
5. keep compatibility proxying active while diagnosing.

### Router rollback

If the router itself is unsafe or incompatible:

1. remove the `api.patina.cloud/*` Worker route;
2. do not change DNS—the retained CNAME resumes direct Supabase service;
3. probe Auth refresh, REST, Storage, and Realtime directly;
4. revoke or disable the new database login if compromise is suspected;
5. preserve sanitized logs/trace IDs and open the incident record.

### Database containment

```sql
ALTER ROLE edge_catalog_login NOLOGIN;
ALTER ROLE edge_rls_login NOLOGIN;
```

Use only when required and from an authorized administrative session. Hyperdrive may retain connections briefly, so also disable/delete the affected configuration if credentials are compromised. Migrations are append-only: fix forward with a new migration rather than editing an applied production migration.

### Timed drill

Start the timer at the rollback decision. Catalog source must be legacy, or the Worker route removed with direct Supabase compatibility restored, within five minutes. Record the operator, timestamps, exact command/config revision, deployment/route evidence, and four behavior probes. Do not call the drill successful based on `/version`.

## Evidence record

For each execution, retain a sanitized record containing:

- reviewed commit SHA and branch;
- migration number and direct object/grant probes;
- Supabase branch project ID (not credentials);
- Hyperdrive configuration IDs/names and cache mode;
- Worker deployment ID and bottom-row timestamp;
- compatibility and canary case results with trace IDs;
- mismatch/fallback counts;
- observed metrics;
- rollback drill duration and behavior probes;
- reviewer findings/disposition.

Never store secret values, connection strings, JWTs, cookies, customer filenames/content, signed URLs, SQL parameters, or PII in this record.

## References

- [Supabase persistent-branch configuration](https://supabase.com/docs/guides/deployment/branching/configuration)
- [Supabase Branching](https://supabase.com/docs/guides/deployment/branching)
- [Cloudflare Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Hyperdrive query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/)
- [Hyperdrive Supabase guide](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/)
- [Cloudflare Container connections](https://developers.cloudflare.com/containers/platform-details/workers-connections/)
