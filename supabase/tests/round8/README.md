Use `*_test.sql` on a reset database (CI); use `*_isolated.psql` via host psql on an un-reset shared database to apply the migration and run its assertions inside a rolled-back transaction.

## Concurrency suites on a second local stack

Every guard defaults to the shared stack (`127.0.0.1:54322`). Pointing a suite elsewhere is a parameter, never a relaxed guard:

| Parameter | Used by | Default | Refuses |
| --- | --- | --- | --- |
| `ROUND8_DB_URL` | the seven `*_concurrency.test.mjs` host-psql suites | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` | any host other than `127.0.0.1`/`localhost`, query or fragment (`?host=`, `?hostaddr=`, `?service=`), comma host lists, socket form, a non-plain database path |
| `API_URL` | `fabrication_instruction` | none | anything but `http://127.0.0.1:<port>/` |
| `-v expected_port=<n>` | `fill_locked_current_concurrency.psql`, `fill_locked_current_isolated.psql`, `scope_composition_concurrency_test.sql` | `54322` | `HOST` must still equal `127.0.0.1` |
| `ROUND8_OWNER_TICKET` | `scope_reconciliation_concurrency.test.mjs` | none: unset refuses | any value not exactly equal to the owned container's `sidequest.ticket` label |
| `ROUND8_CLONE_DB` | `owned_psql.mjs`, `owned_seed.mjs`, `scope_reconciliation` | `round8_clone` | anything but a plain lowercase identifier |

`owned_psql.test.mjs` proves each parameter unset, wrong and right.

### Isolated CLI stack

1. Copy `supabase/config.toml`, `migrations/`, `seed/` and `templates/` into a scratch workdir outside the repo. Copy no `.env*` file.
2. Set `project_id` to your own name (never `supabase`) and move every port by +3000 (API 57321, DB 57322, shadow 57320, pooler 57329). Disable studio, inbucket, analytics and edge runtime.
3. Write only the five version pins into `<workdir>/supabase/.temp`: `postgres-version`, `gotrue-version`, `rest-version`, `storage-version`, `storage-migration`. Never copy `project-ref`, `linked-project` or `pooler-url`.
4. `supabase start --workdir <workdir>`, or `supabase db reset --local --workdir <workdir>`. Never `--linked`.

### Disable cron after every reset

`supabase/seed/99-local-edge-settings.sql` points the edge-function URL at `http://supabase_kong_supabase:8000`, which is only right for `project_id = "supabase"`. On any second stack, pg_cron would fire the seeded jobs at that address, so turn the launcher off straight after reset or start:

1. Prove the target first. `docker inspect supabase_db_<project_id>` must carry the label `com.supabase.cli.project=<project_id>` and publish `5432/tcp` on your port. Then `SELECT host(inet_server_addr())` through `127.0.0.1:<port>` must return that container's network IP.
2. In that proven container, as `supabase_admin` (`docker exec supabase_db_<project_id> psql -h 127.0.0.1 -U supabase_admin -d postgres`), run `ALTER SYSTEM SET cron.launch_active_jobs = off; SELECT pg_reload_conf();`
3. Read it back: `SELECT current_setting('cron.launch_active_jobs')` must return `off`.

The seed file stays unchanged.

### Prerequisites the suites check but never install

- `scope_composition_concurrency_test.sql` needs `dblink`. Install it on that local stack only (`CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;`), never in a migration or seed. The rehearsal refuses with a `REFUSED: prerequisite dblink` notice when it is missing. Its dblink sessions connect to `host(inet_server_addr())`, the container address, which uses scram password auth. Loopback inside the container uses `trust`, which dblink refuses for a non-superuser.
- Window suites need `*_DB_WINDOW=owned`. On an isolated stack only, they also need `scope_editions` enabled in `public.server_capabilities`, plus `EXECUTE` granted to `authenticated` on `record_fabrication_instruction` and `record_external_fulfilment_event`.

Example run:

```
ROUND8_DB_URL=postgresql://postgres:postgres@127.0.0.1:57322/postgres API_URL=http://127.0.0.1:57321 \
  BILLING_LOCK_ORDER_DB_WINDOW=owned node --test --test-concurrency=1 supabase/tests/round8/billing_lock_order_concurrency.test.mjs
psql postgresql://postgres:postgres@127.0.0.1:57322/postgres -X -v ON_ERROR_STOP=1 -v scope_concurrency_rehearsal=on \
  -v expected_port=57322 -f supabase/tests/round8/scope_composition_concurrency_test.sql
```

Note: `\quit 3` in these psql scripts ignores its argument, so a refusal prints `REFUSED` and still exits 0. Read the output, not only the exit code.

## Owned container seeded from the isolated stack

`scope_reconciliation_concurrency.test.mjs` runs only through the `docker-exec` transport against a container labelled with your ticket and owner. `owned_seed.mjs` builds and seeds that container:

```
export ROUND8_OWNED_OWNER=<claim id> ROUND8_OWNED_TICKET=SQ-<n>
node supabase/tests/round8/owned_seed.mjs create        # prints {container, nativeTarSha256, ...}
ROUND8_SEED_SOURCE_PROJECT=<project_id> ROUND8_OWNED_CONTAINER=<id> node supabase/tests/round8/owned_seed.mjs seed
ROUND8_PSQL_TRANSPORT=docker-exec ROUND8_OWNED_CONTAINER=<id> ROUND8_OWNER_TICKET=SQ-<n> SCOPE_RECONCILIATION_DB_WINDOW=owned \
  node --test --test-concurrency=1 supabase/tests/round8/scope_reconciliation_concurrency.test.mjs
```

- `create` runs the pinned `supabase/postgres` image with no network, a read-only root, tmpfs data, `no-new-privileges`, and the two labels. It copies the image's native `/etc/postgresql-custom` out of a created container that is never started, restores it byte for byte before postgres starts, and checks every file hash after start. Cron stays off, pinned to the clone database.
- `seed` refuses unless the source is the running `supabase_db_<project_id>` CLI container on the pinned image (never `supabase`), and the target passes `assertOwnedContainer`. It streams `pg_dumpall --roles-only` and `pg_dump` of the source into a 0600 temp directory outside the repo, then pipes them into the target through `docker exec -i`. It never uses `docker cp` into tmpfs or a network. It deletes the dumps and fails unless the clone's relation, function, migration and extension probe matches the source.
- The only tolerated restore error is the ACL on `graphql_public.graphql(text, text, jsonb, jsonb)`. pg_dump replays event triggers last, so that function does not exist yet when its grants run. Any other error fails the seed.

Tear down the owned container, the stack (`supabase stop --no-backup --workdir <workdir>`) and its volumes when done.
