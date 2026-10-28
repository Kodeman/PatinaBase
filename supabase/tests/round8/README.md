Use `*_test.sql` on a reset database (CI); use `*_isolated.psql` via host psql on an un-reset shared database to apply the migration and run its assertions inside a rolled-back transaction.

Replay horizon: a runner that re-applies migration M must then re-apply, in numeric order, every later migration up to the head that redefines anything M (re)creates — a function body, a function or table grant, a policy, a trigger, or a CHECK/vocabulary constraint — and apply the same rule to each migration that adds. Otherwise the transaction ends at M's older horizon while the bodies assert the cumulative chain (re-applying 00868 alone revokes the authenticated EXECUTE that 00871 grants). Find redefiners with a grep over `CREATE OR REPLACE FUNCTION`, `CREATE POLICY`/`DROP POLICY`, `GRANT`/`REVOKE` and constraint names; a new migration that redefines an earlier round-8 object must be added to every runner that replays the earlier one. Replayed migrations still need their own prerequisites, so runners assume a database at or near the head.

## C4 consumer separation and activation rehearsal (owned stack)

`service_acceptance_x08_test.sql` checks the designer `get_project_decision_reviews` and client `list_my_project_decision_reviews` artifact-only lists against a nonempty baseline while service requests are added. It exercises required/optional signers, project-client observer, studio/comember, another household, GC, maker, second studio and anon. Draft and sent cannot coexist as open requests on one project: the fixture checks draft invisibility first, then supersedes it. Sent superseded history remains visible; unsent superseded history does not.

`service_acceptance_activation_plan_test.sql` rehearses exactly C4 §2.8's six authenticated grants and service-role-only hash stamp, dynamically checks all service-acceptance functions (including the authenticated storage predicate exception and PUBLIC denial), then applies inverse revokes and compares the shipped ACL census. Neither suite leaves activation behind; both raise on failure, print PASS counts and end in `ROLLBACK`.

These two suites refuse anything except `127.0.0.1:55322`. Use a freshly reset **owned** CLI stack with a unique project ID and +1000 port offset (API 55321, DB 55322, shadow 55320, pooler 55329), following the isolation, pin, cron and teardown instructions below. Never point them at shared 54322. Example, from the repository root:

```sh
psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -X -v ON_ERROR_STOP=1 -f supabase/tests/round8/service_acceptance_x08_test.sql
psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -X -v ON_ERROR_STOP=1 -f supabase/tests/round8/service_acceptance_activation_plan_test.sql
```

## Concurrency suites on a second local stack

Every guard defaults to the shared stack (`127.0.0.1:54322`). Pointing a suite elsewhere is a parameter, never a relaxed guard:

| Parameter | Used by | Default | Refuses |
| --- | --- | --- | --- |
| `ROUND8_DB_URL` | the eight `*_concurrency.test.mjs` host-psql suites | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` | any host other than `127.0.0.1`/`localhost`, query or fragment (`?host=`, `?hostaddr=`, `?service=`), comma host lists, socket form, a non-plain database path |
| `API_URL` | `fabrication_instruction` | none | anything but `http://127.0.0.1:<port>/` |
| `-v expected_port=<n>` | `fill_locked_current_concurrency.psql`, `fill_locked_current_isolated.psql`, `scope_composition_concurrency_test.sql`, `scope_consumer_projection_test.sql`, `service_acceptance_test.sql`, `service_acceptance_isolated.psql` | `54322` | `HOST` must still equal `127.0.0.1` |
| `ROUND8_OWNER_TICKET` | `scope_reconciliation_concurrency.test.mjs` | none: unset refuses | any value not exactly equal to the owned container's `sidequest.ticket` label |
| `ROUND8_CLONE_DB` | `owned_psql.mjs`, `owned_seed.mjs`, `scope_reconciliation` | `round8_clone` | anything but a plain lowercase identifier |

`owned_psql.test.mjs` proves each parameter unset, wrong and right.

Two guards default to an owned port instead: `service_completion_test.sql` (C6, 00888) to `-v expected_port=56322`, the owned +2000 stack its ticket verifier names, and `service_acceptance_client_evidence_test.sql` (00889) to `57322`, which also refuses 54322 outright; its concurrency suite reads `SQ_DB_PORT` (default `57322`) instead of `ROUND8_DB_URL`. Pass `-v expected_port=<n>` to run either on another local stack. It enables `scope_editions` inside its own rolled-back transaction, so it needs no capability change.

`service_completion_concurrency.test.mjs` (C6 §2.11 F7 races) is a window suite: it commits an `f88e` fixture built from the shared sections of `service_completion_test.sql`, removes it at the end. It enables `scope_editions` for its window and restores the value it found, so it runs straight after `service_completion_test.sql`, which asserts that the capability ships off. A completion that refuses releases its locks at the error, not at `ROLLBACK`, so the suite runs those orders without a wait. Its three-session schedule also holds the service-obligation key from a fourth session, to place one resolution's row lock between another's key wait and its completion update:

```
ROUND8_DB_URL=postgresql://postgres:postgres@127.0.0.1:56322/postgres SERVICE_COMPLETION_DB_WINDOW=owned \
  node --test --test-concurrency=1 supabase/tests/round8/service_completion_concurrency.test.mjs
```

### Isolated CLI stack

1. Copy `supabase/config.toml`, `migrations/`, `seed/` and `templates/` into a scratch workdir outside the repo. Copy no `.env*` file.
2. Set `project_id` to your own name (never `supabase`) and move every port by an offset no other local stack holds. The X08 and activation-plan suites above accept only +1000 (API 55321, DB 55322, shadow 55320, pooler 55329); the examples below use +3000 (API 57321, DB 57322, shadow 57320, pooler 57329). Disable studio, inbucket, analytics and edge runtime.
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

The guarded psql entry points above fail closed: an off-target connection raises under `ON_ERROR_STOP` before migration replay or fixture work, so psql exits 3 with zero assertions. `scope_composition_concurrency_test.sql` also raises when rehearsal approval or dblink is missing. Do not use `\quit 3` for refusal: psql ignores its argument and exits 0.

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
