# Patina Cloudflare Phase 1 runbook

Status: execution runbook; blocker 1 is repository-ready but not operationally closed

Owner: Platform  
Alert recipient: `kody@patina.cloud`  
Rollback objective: restore the catalog path within five minutes

## Outcome

Phase 1 ends when current Supabase SDK traffic is compatible through the edge router and the public product catalog can run through a least-privilege, dual-Hyperdrive path with a reviewed, measured, reversible production canary.

This runbook authorizes no hidden credentials. Password-bearing database logins, Cloudflare resource creation, Supabase branch creation, DNS/Worker route changes, migrations, and deploys are performed only from an explicitly authorized execution session with the correct account already authenticated.

## Current provisioning blockers

Do not create staging or production database logins, Hyperdrive configurations, Workers, or routes until both blockers below are independently reviewed and closed:

1. The catalog privilege allow-list needs two owners. The repository migration can close the `public` schema, database, application-routine, and `edge_api` boundaries, but only the Supabase platform owner can remove `PUBLIC` access from the managed `net` schema. Production remains blocked until the owner action, its preflight, migration `00483`, postconditions, and compatibility probes all pass with sanitized evidence. A ready repository commit is not operational closure.
2. Retained orders, projects, and media Containers do not yet share a trustworthy per-request Strata authorization resolver or complete object-level own/organization/admin contract. Their decorated routes remain fail-closed. Do not restore availability by trusting JWT `app_metadata` permission lists, inventing controller permission names, or allowing unscoped list/batch reads. Resolve current authorization through each Container's Supavisor path and prove own/other/organization/admin, role-change, list, and batch behavior before deploying the retained-service auth changes.

Neither blocker permits a compatibility fallback to broaden authorization. Record closure evidence in this runbook before requesting the independent production sign-off.

### Blocker 1 mandatory order

The following order is fail-closed and applies separately to staging and production:

| Step | Owner                   | Required action and gate                                                                                                                                                                                                                                                             |
| ---- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0    | coordinator             | Prove `edge_catalog_login` and `edge_rls_login` do not exist and no environment Hyperdrive configuration points at them. If either was created early, stop and follow **Premature pool/login reconciliation** below.                                                                 |
| 1    | Supabase/platform owner | Run `supabase/platform-admin/00483_platform_public_acl.sql` as the actual owner of `net`. The artifact changes only `PUBLIC` schema `USAGE`, preserves the complete named ACL snapshot, and fails unless its session owns `net`.                                                     |
| 2    | migration operator      | Run `supabase/tests/edge_api/platform_acl_preflight.sql` through the normal environment database URL. It must prove `PUBLIC` cannot use `net`, named pg_net callers still can, and the catalog role cannot. Do not continue on a warning, skipped file, or `insufficient_privilege`. |
| 3    | migration operator      | Apply reviewed migration `supabase/migrations/00483_edge_public_acl_boundary.sql`, then rerun the platform preflight and `supabase/tests/edge_api/remote_acl_postflight.sql`.                                                                                                        |
| 4    | compatibility owner     | Complete the SQL/SDK compatibility probes for Auth, REST/RPC, Functions, Storage, Realtime, cron, pg_net, and extensions. No unexplained regression may remain.                                                                                                                      |
| 5    | database operator       | Create or reconcile the actual password-bearing logins, set their exact role configuration, and pass `supabase/tests/edge_api/catalog_login_probe.sql` and `supabase/tests/edge_api/rls_login_probe.sql` through their respective real credentials.                                  |
| 6    | Cloudflare operator     | Only now create fresh Hyperdrive pools/configurations and bind them to the Worker. Never reuse a configuration that may hold a pre-closure session.                                                                                                                                  |

No edge login or Hyperdrive pool exists while steps 1–4 change and verify the ACL boundary. That ordering is part of the security control, not a scheduling preference.

### Supabase platform-owner escalation

Hosted Dashboard SQL and the normal direct connection run as `postgres`. The live Strata census found that `net` is owned by the internal `supabase_admin` role and that `postgres` is neither a member of nor able to assume that role. Schema `USAGE` does not confer owner authority, so a normal SQL Editor or migration session cannot run `REVOKE USAGE ON SCHEMA net FROM PUBLIC`; PostgreSQL must reject it with `insufficient_privilege`.

Unless Supabase supplies another supported owner context, open a platform-action request at [Supabase Support](https://supabase.com/dashboard/support/new). Include:

- project ref `bkvcixdmuyejfzcijpdg` for production, or the staging branch ref;
- the reviewed `supabase/platform-admin/00483_platform_public_acl.sql` artifact;
- sanitized evidence that `net` is owned by `supabase_admin` and normal `postgres` cannot assume it;
- the requirement that only `PUBLIC` schema `USAGE` change and the complete named ACL snapshot remain identical;
- a request for sanitized execution identity, before/after named-ACL, and postcondition evidence.

Do not include a database URL, password, token, customer row, object key, or other customer data in the ticket. Inability to obtain owner execution leaves production blocked; it is not permission to bypass the preflight or create the edge resources.

If an approved owner connection is supplied, the exact operator command is:

```bash
set -euo pipefail
: "${PLATFORM_ADMIN_DATABASE_URL:?load the owner URL from the password manager}"
psql "$PLATFORM_ADMIN_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f supabase/platform-admin/00483_platform_public_acl.sql
unset PLATFORM_ADMIN_DATABASE_URL
```

Then run the normal-session preflight before any application migration:

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f supabase/tests/edge_api/platform_acl_preflight.sql
```

The successful `all assertions passed` line and sanitized ACL evidence are the gate. A zero shell exit caused by omitted execution, a caught privilege error, or a hand-written substitute is not evidence.

### Preserve managed pg_net internals

The platform artifact must not revoke or rewrite pg_net relation, sequence, routine, helper, or default privileges. In Strata pg_net 0.19.5, `net.http_get`, `net.http_post`, and `net.http_delete` are `SECURITY INVOKER`; they use `net.http_request_queue`, its sequence, and internal encoding/wake helpers. Stripping those grants or converting managed functions would break legitimate callers and extension upgrades. Blocker 1 removes only `PUBLIC` schema `USAGE` while retaining every named schema grantee.

### Database TEMP compatibility census

Migration `00483` removes database `CREATE` and `TEMPORARY` from `PUBLIC`, then explicitly restores `TEMPORARY` only to the reviewed application/managed roles. Before and after the migration, enumerate every login—not only repository-known roles:

```sql
SELECT rolname, rolsuper, rolreplication,
       has_database_privilege(oid, current_database(), 'TEMP') AS effective_temp
FROM pg_roles
WHERE rolcanlogin
ORDER BY rolname;
```

The sanitized 2026-08-15 Strata census found 11 login roles, all with pre-migration effective TEMP through `PUBLIC`, and no custom application login. The fixed regrant covers the seven ordinary login roles that need it. `supabase_admin` remains effective through superuser authority. Any unexpected login in a later preflight blocks the migration until it receives an explicit reviewed disposition. The intentional direct-role removals are:

- `cli_login_postgres`: false as the ingress-only `NOINHERIT` role, then true after it enters the explicitly granted `postgres` role through `SET`;
- `pgbouncer`: authenticates/pools and must not issue application/temp-object SQL as itself;
- `supabase_replication_admin`: replication login with no TEMP workload.

The live routine-body census found no custom invoker application TEMP dependency. `public.get_aesthete_matches(...)` creates its temp tables as its `postgres` SECURITY DEFINER owner; `extensions.pgrst_ddl_watch()` was a comment-only text match. Staging must positively probe direct, Supavisor, and dedicated PgBouncer connections; Auth, Storage, and Realtime; and replication health. Treat a different login set, a real invoker TEMP dependency, or a failed managed-service probe as a stop condition. Any fix-forward TEMP grant must name the proven role; never restore TEMP to `PUBLIC`.

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
| `DB_PUBLIC_CACHE` | 60s max age, 15s stale | exact parameterized `edge_api.catalog_products` query                             | user-scoped data, permissions, writes, fresh-after-write, vectors, arbitrary SQL |

Cloudflare local mode does not prove remote Hyperdrive pooling or caching. Pool/cache evidence must come from a deployed staging Worker.

## Database ownership and grants

### Migration-owned objects

The migration creates or reconciles:

```sql
CREATE ROLE edge_catalog_reader NOLOGIN NOBYPASSRLS NOINHERIT;
CREATE ROLE edge_rls_user       NOLOGIN NOBYPASSRLS NOINHERIT;

CREATE SCHEMA IF NOT EXISTS edge_api AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA edge_api FROM PUBLIC;
GRANT USAGE ON SCHEMA edge_api TO edge_catalog_reader;
GRANT SELECT ON edge_api.catalog_products TO edge_catalog_reader;
REVOKE ALL ON public.products FROM edge_catalog_reader;

GRANT authenticated TO edge_rls_user;
```

The exact idempotent form lives in migrations `00481` and `00483`. The canonical view is `edge_api.catalog_products`; it is `security_barrier`, contains only approved columns, and fixes `layer = 'catalog'` plus `status = 'published'` inside its definition. The reader has no `public` or `net` schema access. `edge_rls_user` receives no direct service-role membership, no `BYPASSRLS`, and no database ownership.

PostgreSQL role privileges are additive and every login is a member of `PUBLIC`. Before either password login exists, the SQL gate must enumerate effective schema, relation, column, sequence, routine, and type privileges for both group roles. `edge_catalog_reader` must have no effective capability beyond database connection plus usage/select on the approved catalog surface; `edge_rls_user` must have no capability broader than the reviewed `authenticated` role chain. Any inherited `PUBLIC` privilege that breaks those allow-lists is a provisioning blocker, not a warning.

### Out-of-band login creation and reconciliation

Run only after the platform preflight, migration postconditions, and compatibility probes all pass in that environment. Supply passwords through `psql` variables or a password manager, never shell history or a checked-in file.

```sql
CREATE ROLE edge_catalog_login LOGIN INHERIT NOBYPASSRLS PASSWORD :'catalog_password';
CREATE ROLE edge_rls_login     LOGIN NOINHERIT NOBYPASSRLS PASSWORD :'rls_password';

ALTER ROLE edge_catalog_login SET search_path TO pg_catalog, edge_api;
ALTER ROLE edge_catalog_login SET default_transaction_read_only TO on;
ALTER ROLE edge_rls_login SET search_path TO pg_catalog, public, extensions;

GRANT edge_catalog_reader TO edge_catalog_login
  WITH INHERIT TRUE, SET FALSE;
GRANT edge_rls_user TO edge_rls_login
  WITH INHERIT FALSE, SET TRUE;
```

`default_transaction_read_only = on` is an advisory accident guard for the catalog login, not the authorization boundary: a session setting can be changed. The enforceable boundary is the role's lack of database `CREATE`/`TEMP`, lack of `public`/`net` access, lack of callable routines or types, and sole `SELECT` on `edge_api.catalog_products`. The RLS login must not be read-only because reviewed `DB_FRESH` routes may write.

#### Premature pool/login reconciliation

If a login or Hyperdrive configuration already exists before ACL closure, fail the rollout rather than updating it in place:

1. keep the catalog source on `legacy` and detach the affected binding/route;
2. delete the old Hyperdrive configuration with `wrangler hyperdrive delete <id>`;
3. `ALTER ROLE edge_catalog_login NOLOGIN;` and `ALTER ROLE edge_rls_login NOLOGIN;`, then rotate both passwords;
4. use a read-only `pg_stat_activity` census and require zero sessions for both login names;
5. finish the owner action, preflight, migration, postconditions, and compatibility probes;
6. reconcile exact attributes, settings, and memberships, then enable the logins and create fresh Hyperdrive configurations.

Never print connection strings or the application-query text column from `pg_stat_activity`; record only role names and aggregate counts. The sanitized zero-session census is:

```sql
SELECT usename, count(*) AS session_count
FROM pg_stat_activity
WHERE usename IN ('edge_catalog_login', 'edge_rls_login')
GROUP BY usename
ORDER BY usename;
```

Expected: zero rows. For a new deployment, prove the login roles are absent before step 1 of the mandatory order.

After creation/reconciliation, confirm role metadata through the administrator connection:

```sql
SELECT rolname, rolcanlogin, rolinherit, rolbypassrls, rolconfig
FROM pg_roles
WHERE rolname IN (
  'edge_catalog_reader', 'edge_rls_user',
  'edge_catalog_login', 'edge_rls_login'
)
ORDER BY rolname;
```

Expected: group roles cannot log in; login roles can; all four are `NOBYPASSRLS`. The catalog login inherits only the audited catalog-reader membership and reports `search_path=pg_catalog, edge_api` plus `default_transaction_read_only=on`. The RLS login inherits nothing, reports `search_path=pg_catalog, public, extensions`, and can enter only the reviewed role chain with `SET LOCAL ROLE`.

Finally connect with each actual password—not an administrator using `SET ROLE`. The catalog login must report `CONNECT=true`, `CREATE=false`, `TEMP=false`, the exact search path/read-only settings above, and effective capability limited to `edge_api` `USAGE` plus view `SELECT`. Every other relation/column privilege, direct `public.products` access, temp or schema creation, sequence privilege, routine execution, and type usage must fail. The RLS login must prove successive transaction-local callers do not retain role or JWT claims. Only sanitized booleans/counts belong in evidence.

### Session and pool handling

When the mandatory order is honored, no edge login or Hyperdrive session exists during ACL closure, so no blanket Supabase restart is required. Existing Supabase roles retain their explicit named schema grants. `NOTIFY pgrst, 'reload schema'` refreshes PostgREST's schema cache only; it is not a connection-pool recycle. Do not use ad-hoc `pg_terminate_backend` against managed Supabase.

If evidence shows an edge login or Hyperdrive configuration was created prematurely, use the fail-rollout reconciliation above and require zero old sessions before continuing. Create a new login password and a new Hyperdrive configuration after closure rather than updating the old pool in place. Use a Supabase-supported Dashboard/Support restart for a managed PostgREST/Supavisor pool only if Supabase Support confirms it is needed, and record that action. Compatibility probes must run after any such restart.

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

| Route                      | Auth                    | Upstream/binding                    | Cache                        | Failure behavior                          |
| -------------------------- | ----------------------- | ----------------------------------- | ---------------------------- | ----------------------------------------- |
| `/auth/v1/*`               | Supabase protocol       | Supabase Auth                       | no-store                     | preserve upstream status/body             |
| `/realtime/v1/*`           | Supabase protocol       | Supabase Realtime                   | no-store                     | preserve WebSocket status/frames          |
| `/rest/v1/*`               | Supabase protocol       | Supabase REST                       | no-store                     | preserve upstream status/body/CORS        |
| `/graphql/v1/*`            | Supabase protocol       | Supabase GraphQL                    | no-store                     | preserve upstream status/body             |
| `/functions/v1/*`          | function-specific JWT   | Supabase Functions                  | no-store                     | preserve upstream status/body             |
| `/storage/v1/*`            | Supabase protocol       | Supabase Storage                    | no-store                     | preserve upstream status/body             |
| `GET /v1/catalog/products` | public                  | `edge_api` view via selected source | public 60s + 15s stale       | legacy public result on HD error/mismatch |
| `GET /_internal/health`    | Access or service token | probe both bindings                 | private, no-store            | generic binding readiness only            |
| other `/v1/*`              | route-defined           | `DB_FRESH` or Container binding     | private, no-store by default | fail closed                               |
| unmatched                  | none                    | none                                | no-store                     | 404                                       |

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
python3 scripts/test_generate_legacy_grants.py
pnpm supabase:reset
PGPASSWORD=postgres psql \
  "postgresql://supabase_admin@127.0.0.1:54322/postgres" \
  -X -v ON_ERROR_STOP=1 \
  -f supabase/platform-admin/00483_platform_public_acl.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -X -v ON_ERROR_STOP=1 \
  -f supabase/tests/edge_api/platform_acl_preflight.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -X -v ON_ERROR_STOP=1 \
  -f supabase/tests/edge_api/remote_acl_postflight.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -X -v ON_ERROR_STOP=1 \
  -f supabase/tests/edge_api/catalog_roles_test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -X -v ON_ERROR_STOP=1 \
  -f supabase/tests/edge_api/platform_compatibility_test.sql
pnpm db:generate
```

Local reset must create the disposable database before its local `supabase_admin` owner can run the platform artifact; this bootstrap exception is not evidence for remote ordering. Staging and production must run the owner artifact and preflight before pushing `00483`.

`catalog_roles_test.sql` and `platform_compatibility_test.sql` are local-only. They deliberately alter/create/drop probe roles, touch synthetic fixtures, exercise pg_net, and use a local dblink endpoint. Never run either file against staging or production; remote environments use the read-only ACL postflight, actual-password-login probe, and protocol/managed-service checks below.

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

The remote cannot be configured before the branch exists. Load `STAGING_PROJECT_REF` and the percent-encoded `STAGING_DB_URL` from the password manager without printing them. Abort unless the URL contains the branch ref and the ref is not the production ref. Before these commands, prove both edge logins are absent, take the all-login TEMP census, and obtain successful staging owner-action evidence through Supabase Support or an approved staging owner URL.

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
```

Next, the platform owner or Supabase Support must run this exact artifact and return the required evidence:

```bash
psql "$STAGING_PLATFORM_ADMIN_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f supabase/platform-admin/00483_platform_public_acl.sql
```

Do not substitute the normal `STAGING_DB_URL`; it cannot own `net`. When Support executes the artifact, its sanitized action/postcondition evidence replaces the owner command transcript, not the normal-session preflight. Only after that evidence exists may the normal staging operator continue:

```bash
psql "$STAGING_DB_URL" -X -v ON_ERROR_STOP=1 \
  -f supabase/tests/edge_api/platform_acl_preflight.sql
pnpm exec supabase db push --dry-run --db-url "$STAGING_DB_URL"
pnpm exec supabase db push --db-url "$STAGING_DB_URL"
psql "$STAGING_DB_URL" -X -v ON_ERROR_STOP=1 \
  -f supabase/tests/edge_api/platform_acl_preflight.sql
psql "$STAGING_DB_URL" -X -v ON_ERROR_STOP=1 \
  -f supabase/tests/edge_api/remote_acl_postflight.sql
psql "$STAGING_DB_URL" -X -v ON_ERROR_STOP=1 \
  -f supabase/seed/cloudflare-phase1-staging.sql
```

The explicit `--db-url` is mandatory: a bare `supabase db push` targets linked production Strata. Never point `pnpm supabase:reset` at a remote URL. After the migration, rerun the all-login TEMP census and require the reviewed exact poststate before proceeding. Record only the sanitized branch ref, role/view booleans, named ACL metadata, and test pass lines.

The committed staging seed contains deterministic IDs and non-secret fixture identities only. Seeded Auth users are passwordless, unconfirmed, and indefinitely banned. Activate only the accounts needed for the compatibility test by calling `supabase.auth.admin.updateUserById` from a server-only operator script using the staging service-role credential:

```ts
await stagingAdmin.auth.admin.updateUserById(userId, {
  password: passwordLoadedFromThePasswordManager,
  email_confirm: true,
  ban_duration: "none",
});
```

Never expose the service-role credential to a browser or commit the password. After the test window, set a new discarded random password and restore a long ban through the same Admin API, then prove sign-in fails. Record only the synthetic user ID, activation/deactivation timestamps, and pass/fail result.

Complete the existing-role SQL/SDK and managed-service compatibility rows in the staging matrix before creating either edge login. Then run the out-of-band login SQL above and probe each login through its own password-bearing URL:

```bash
set -euo pipefail

read -s STAGING_EDGE_CATALOG_DB_URL
psql "$STAGING_EDGE_CATALOG_DB_URL" -X -v ON_ERROR_STOP=1 \
  -v expected_login=edge_catalog_login \
  -f supabase/tests/edge_api/catalog_login_probe.sql
unset STAGING_EDGE_CATALOG_DB_URL

: "${STAGING_EDGE_RLS_TEST_USER_ID:?load the deterministic synthetic user ID}"
read -s STAGING_EDGE_RLS_DB_URL
psql "$STAGING_EDGE_RLS_DB_URL" -X -v ON_ERROR_STOP=1 \
  -v expected_login=edge_rls_login \
  -v test_user_id="$STAGING_EDGE_RLS_TEST_USER_ID" \
  -f supabase/tests/edge_api/rls_login_probe.sql
unset STAGING_EDGE_RLS_DB_URL STAGING_EDGE_RLS_TEST_USER_ID
```

Do not replace either connection with an administrator plus `SET ROLE`: that would fail to test login attributes, `rolconfig`, membership options, inherited capability, and pooled caller reset under the real principal. Both probe scripts must finish successfully before Hyperdrive creation.

### Hyperdrive

This is mandatory-order step 6. Do not enter this section until the owner action, both preflight runs, `00483` postconditions, compatibility probes, out-of-band login reconciliation, and actual-password-login probes have passed. Use the branch's direct Supabase database endpoint and its new environment-specific logins:

```bash
read -s STAGING_EDGE_RLS_URL
npx wrangler hyperdrive create strata-staging-fresh \
  --connection-string="$STAGING_EDGE_RLS_URL" \
  --caching-disabled
unset STAGING_EDGE_RLS_URL

read -s STAGING_CATALOG_URL
npx wrangler hyperdrive create strata-staging-public-cache \
  --connection-string="$STAGING_CATALOG_URL" \
  --max-age=60 \
  --swr=15
unset STAGING_CATALOG_URL
```

The URL values do not enter shell history, but Wrangler necessarily expands them into a short-lived process argument. Run this on the private operator host, ensure no process tracing is active, and unset each variable immediately. Confirm the fresh config reports caching disabled and the public config reports `max_age=60` and `stale_while_revalidate=15`. Put only the new configuration IDs into the staging Wrangler environment's `DB_FRESH` and `DB_PUBLIC_CACHE` bindings. Set secrets with `wrangler secret put`; never pass values in a report.

### Worker and host

```bash
cd infra/edge-api-worker
npx wrangler deploy --env staging
npx wrangler deployments list --name patina-edge-api-staging
```

Attach `api-staging.patina.cloud` only after direct `workers.dev` probes pass. Verify the bottom deployment-list row and behavior; static `/version` values are not freshness evidence.

## Staging verification matrix

Record each row as pass/fail with trace ID, timestamp, and sanitized evidence:

| Area         | Required cases                                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Platform ACL | owner artifact identity/postcondition; `PUBLIC` lacks `net` USAGE; complete named `net` ACL snapshot unchanged before/after             |
| App ACL      | post-`00483` database/schema/relation/column/sequence/routine/type and `edge_api` allow-lists; remote-safe postflight passes read-only  |
| TEMP         | exact all-login pre/post manifest; no unexpected login; direct, Supavisor, dedicated PgBouncer, managed-service, and replication probes |
| Edge logins  | actual-password catalog/RLS connections; exact search paths; catalog advisory read-only; no capability or successive-claims leakage     |
| Auth         | sign-in, refresh, OAuth callback, expired JWT, wrong issuer, wrong audience                                                             |
| Claims       | two successive users through pooled connections; no role/JWT retention                                                                  |
| Catalog      | catalog visible; personal/studio absent; 1/50/51 IDs; duplicate/malformed/injection-shaped input; deterministic order                   |
| Sources      | normalized legacy = fresh = cached for fixtures; cache expiry observed remotely                                                         |
| REST         | select, filtered select, RPC, error/status/CORS preservation                                                                            |
| Functions    | authenticated function and deliberate upstream error                                                                                    |
| Storage      | authorized read/upload protocol and error preservation                                                                                  |
| Realtime     | WebSocket upgrade, auth, subscribe, event, reconnect                                                                                    |
| Managed DB   | Auth, Storage, Realtime, cron, pg_net, vector/extension, Supavisor, and replication health after ACL change                             |
| Proxy        | cookies, refresh headers, redirects, route-loop prevention                                                                              |
| Health       | Access/service-token allow; anonymous deny; both binding failures redacted                                                              |
| Failure      | DB unavailable, timeout, pool pressure/exhaustion, malformed DB result, upstream timeout                                                |
| Logging      | no tokens, API keys, cookies, SQL parameters, URLs/PII, or bodies                                                                       |

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
- Supabase Support/platform owner execution is scheduled and the ticket references only the exact reviewed `net` schema artifact;
- production edge logins and Hyperdrive configurations are absent until ACL closure; distinct production secret values are ready in the password manager but unused;
- the all-login TEMP census exactly matches the reviewed manifest and contains no unexpected login;
- zero unexplained authorization or normalized shadow mismatches;
- current `api.patina.cloud` DNS target is confirmed as the direct Supabase endpoint;
- Cloudflare Worker route addition/removal procedure is tested;
- alert delivery to `kody@patina.cloud` is tested without exposing customer content;
- rollback operator and timer are assigned.

## Production rollout

Execute in this order:

1. prove both production edge logins and both production Hyperdrive configurations are absent; keep catalog source `legacy` and take the exact all-login TEMP/named-ACL census;
2. have Supabase Support/platform owner execute `supabase/platform-admin/00483_platform_public_acl.sql` as the actual `net` owner and return sanitized identity, named-ACL preservation, and no-PUBLIC-USAGE evidence;
3. through normal Strata `postgres`, run `supabase/tests/edge_api/platform_acl_preflight.sql`; any failure leaves production blocked;
4. dry-run and apply `supabase/migrations/00483_edge_public_acl_boundary.sql`, then rerun `supabase/tests/edge_api/platform_acl_preflight.sql`, `supabase/tests/edge_api/remote_acl_postflight.sql`, and the all-login TEMP manifest;
5. handle sessions exactly as described above—there should be no edge pool to recycle; use a supported managed-pool restart only if Support says it is required;
6. run compatibility probes through the existing Supabase roles and hostname for Auth, refresh/OAuth, REST/RPC, Functions, Storage, Realtime, cron, pg_net, extensions, direct/Supavisor/PgBouncer paths, and replication health;
7. create/reconcile the two out-of-band production logins with fresh production-only passwords and exact settings/memberships, then run `supabase/tests/edge_api/catalog_login_probe.sql` through `EDGE_CATALOG_DB_URL` and `supabase/tests/edge_api/rls_login_probe.sql` through `EDGE_RLS_DB_URL` with a designated production test-user UUID;
8. create a fresh `strata-prod-fresh` with caching disabled and a fresh `strata-prod-public-cache` with explicit 60s/15s policy; bind only their new IDs;
9. deploy `patina-edge-api` in compatibility/legacy mode;
10. attach `api.patina.cloud/*` as a Worker route without changing the Supabase CNAME;
11. validate compatibility routes and log redaction again through the Worker;
12. enable catalog shadow queries and require zero unexplained mismatches;
13. run the rollback drill;
14. promote Hyperdrive catalog source to 10%, hold one hour;
15. promote to 50%, hold one hour;
16. promote to 100%, hold one hour;
17. merge/deploy only the independently reviewed commit and archive sanitized evidence.

At every canary level, a mismatch or Hyperdrive failure returns the legacy public-catalog result and alerts. It never returns a broader direct-table query.

Steps 2–7 are blocker 1's operational closure. Until all six pass, production status remains **blocked**, even if migration `00483` and all repository tests are green.

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

Use only when required and from an authorized administrative session. First put the catalog source on `legacy` or remove the Worker route, detach/delete both Hyperdrive configurations, set the logins `NOLOGIN`, rotate/revoke their credentials, and require the zero-session census. Do not broadly grant `public`/`net` schema access, database TEMP, or routine EXECUTE back to `PUBLIC` after an edge login or pool has existed.

If a compatibility probe identifies an omitted legitimate caller, restore only that verified named role's exact privilege through a reviewed fix-forward migration or, for `net`, a reviewed platform-owner action. Rerun owner/preflight/postflight/compatibility evidence before recreating logins or pools. Never use `GRANT ... TO PUBLIC` as a convenience rollback.

The only exception is a reversal of the owner `net` action before any edge login/pool has ever existed. If Supabase determines that reversal is necessary, only the platform owner may restore the exact captured prior `PUBLIC USAGE` entry, then prove every named ACL is unchanged. That deliberately reopens blocker 1: the platform preflight must fail, and no migration/login/Hyperdrive rollout may continue. Migrations are append-only; fix forward rather than editing an applied production migration.

### Timed drill

Start the timer at the rollback decision. Catalog source must be legacy, or the Worker route removed with direct Supabase compatibility restored, within five minutes. Record the operator, timestamps, exact command/config revision, deployment/route evidence, and four behavior probes. Do not call the drill successful based on `/version`.

## Evidence record

For each execution, retain a sanitized record containing:

- reviewed commit SHA and branch;
- migration number and direct object/grant probes;
- Supabase Support ticket/action reference, platform execution identity, and owner check;
- `net` before/after named ACL snapshot plus platform-preflight result;
- database, schema, relation, column, sequence, routine, type, `edge_api`, and all-login TEMP pre/postcondition manifests;
- Supabase branch project ID (not credentials);
- actual-password-login search-path/read-only/effective-capability probe results;
- Hyperdrive configuration IDs/names and cache mode;
- Worker deployment ID and bottom-row timestamp;
- compatibility and canary case results with trace IDs;
- mismatch/fallback counts;
- observed metrics;
- rollback drill duration and behavior probes;
- reviewer findings/disposition.

Never store secret values, connection strings, JWTs, cookies, customer filenames/content, signed URLs, SQL parameters, or PII in this record.

## References

- [Sanitized Strata PUBLIC ACL inventory](./patina-strata-public-acl-inventory.md)
- [Supabase platform support request](https://supabase.com/dashboard/support/new)
- [Supabase persistent-branch configuration](https://supabase.com/docs/guides/deployment/branching/configuration)
- [Supabase Branching](https://supabase.com/docs/guides/deployment/branching)
- [Cloudflare Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Hyperdrive query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/)
- [Hyperdrive Supabase guide](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/)
- [Cloudflare Container connections](https://developers.cloudflare.com/containers/platform-details/workers-connections/)
