-- Cloudflare Phase 1 database contract conformance (migration 00481).
-- Run only against the local CLI database after pnpm supabase:reset and the
-- verified local runner has applied
-- supabase/platform-admin/00483_public_acl_allowlist.sql as supabase_admin:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 -f supabase/tests/edge_api/catalog_roles_test.sql
--
-- Every direct role/data/extension mutation is enclosed by the outer
-- transaction and rolled back. The two disposable LOGIN roles must commit so
-- separate backends can authenticate; their complete lifecycle instead lives
-- in one exception-cleaned dblink block below.

\set ON_ERROR_STOP on

SELECT (
  :'HOST' IN ('127.0.0.1', 'localhost', '::1')
  AND :'PORT' = '54322'
  AND current_database() = 'postgres'
) AS cf481_local_target
\gset

\if :cf481_local_target
\else
  \warn 'catalog_roles_test.sql refused: destructive reconciliation probes are local-only'
  SELECT 1 / 0 AS cf481_local_target_required;
\endif

BEGIN;
SAVEPOINT cf481_role_reconciliation;

ALTER ROLE edge_catalog_reader
  CREATEDB CREATEROLE INHERIT LOGIN REPLICATION BYPASSRLS;
ALTER ROLE edge_rls_user
  CREATEDB CREATEROLE INHERIT LOGIN REPLICATION BYPASSRLS;
CREATE ROLE edge_membership_probe_cf481 NOLOGIN;
GRANT service_role TO edge_catalog_reader;
GRANT edge_catalog_reader TO edge_membership_probe_cf481
  WITH ADMIN FALSE, INHERIT TRUE, SET TRUE;

\ir ../../migrations/00481_edge_catalog_roles.sql

DROP ROLE edge_membership_probe_cf481;

DO $$
DECLARE
  actual_columns text[];
  relation_options text[];
BEGIN
  ASSERT EXISTS (
    SELECT 1
      FROM pg_roles
     WHERE rolname = 'edge_catalog_reader'
       AND NOT rolsuper
       AND NOT rolcreatedb
       AND NOT rolcreaterole
       AND NOT rolinherit
       AND NOT rolcanlogin
       AND NOT rolreplication
       AND NOT rolbypassrls
  ), 'edge_catalog_reader has unsafe role attributes';

  ASSERT EXISTS (
    SELECT 1
      FROM pg_roles
     WHERE rolname = 'edge_rls_user'
       AND NOT rolsuper
       AND NOT rolcreatedb
       AND NOT rolcreaterole
       AND NOT rolinherit
       AND NOT rolcanlogin
       AND NOT rolreplication
       AND NOT rolbypassrls
  ), 'edge_rls_user has unsafe role attributes';

  ASSERT NOT EXISTS (
    SELECT 1
      FROM pg_auth_members AS am
      JOIN pg_roles AS granted ON granted.oid = am.roleid
      JOIN pg_roles AS member ON member.oid = am.member
     WHERE member.rolname = 'edge_catalog_reader'
  ), 'edge_catalog_reader must not be a member of another role';

  ASSERT (
    SELECT count(*) = 1
       AND bool_and(
         granted.rolname = 'authenticated'
         AND NOT am.admin_option
         AND NOT am.inherit_option
         AND am.set_option
       )
      FROM pg_auth_members AS am
      JOIN pg_roles AS granted ON granted.oid = am.roleid
      JOIN pg_roles AS member ON member.oid = am.member
     WHERE member.rolname = 'edge_rls_user'
  ), 'edge_rls_user must have exactly one SET-only authenticated membership';

  ASSERT NOT EXISTS (
    SELECT 1
      FROM pg_auth_members AS am
      JOIN pg_roles AS granted ON granted.oid = am.roleid
      JOIN pg_roles AS member ON member.oid = am.member
      JOIN pg_roles AS grantor ON grantor.oid = am.grantor
     WHERE granted.rolname IN ('edge_catalog_reader', 'edge_rls_user')
       AND NOT (
         member.rolname = current_user
         AND grantor.rolname = 'supabase_admin'
         AND am.admin_option
         AND NOT am.inherit_option
         AND NOT am.set_option
       )
  ), 'an edge capability role has an unexpected inbound membership';

  ASSERT NOT EXISTS (
    SELECT 1
      FROM pg_database AS d
      CROSS JOIN LATERAL (VALUES ('CREATE'), ('TEMP')) AS privilege(name)
     WHERE d.datname = current_database()
       AND has_database_privilege('edge_rls_user', d.oid, privilege.name)
       AND NOT has_database_privilege('authenticated', d.oid, privilege.name)
  ), 'edge_rls_user has a database privilege broader than authenticated';

  ASSERT NOT EXISTS (
    SELECT 1
      FROM pg_namespace AS n
     WHERE (
       has_schema_privilege('edge_rls_user', n.oid, 'USAGE')
       AND NOT has_schema_privilege('authenticated', n.oid, 'USAGE')
     ) OR (
       has_schema_privilege('edge_rls_user', n.oid, 'CREATE')
       AND NOT has_schema_privilege('authenticated', n.oid, 'CREATE')
     )
  ), 'edge_rls_user has a schema privilege broader than authenticated';

  ASSERT NOT EXISTS (
    SELECT 1
      FROM pg_attribute AS a
      CROSS JOIN LATERAL (
        VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')
      ) AS privilege(name)
     WHERE a.attnum > 0
       AND NOT a.attisdropped
       AND has_column_privilege(
         'edge_rls_user', a.attrelid, a.attnum, privilege.name
       )
       AND NOT has_column_privilege(
         'authenticated', a.attrelid, a.attnum, privilege.name
       )
  ), 'edge_rls_user has a column privilege broader than authenticated';

  ASSERT NOT EXISTS (
    SELECT 1
      FROM pg_class AS c
      CROSS JOIN LATERAL (
        VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
               ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
      ) AS privilege(name)
     WHERE has_table_privilege('edge_rls_user', c.oid, privilege.name)
       AND NOT has_table_privilege('authenticated', c.oid, privilege.name)
  ), 'edge_rls_user has a relation privilege broader than authenticated';

  ASSERT NOT EXISTS (
    SELECT 1
      FROM pg_class AS c
      CROSS JOIN LATERAL (VALUES ('USAGE'), ('SELECT'), ('UPDATE')) AS privilege(name)
     WHERE c.relkind = 'S'
       AND has_sequence_privilege('edge_rls_user', c.oid, privilege.name)
       AND NOT has_sequence_privilege('authenticated', c.oid, privilege.name)
  ), 'edge_rls_user has a sequence privilege broader than authenticated';

  ASSERT NOT EXISTS (
    SELECT 1
      FROM pg_proc AS p
     WHERE has_function_privilege('edge_rls_user', p.oid, 'EXECUTE')
       AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ), 'edge_rls_user has a routine privilege broader than authenticated';

  ASSERT has_table_privilege(
    'edge_catalog_reader', 'public.edge_catalog_products', 'SELECT'
  ), 'edge_catalog_reader must be able to SELECT the catalog projection';
  ASSERT has_schema_privilege('edge_catalog_reader', 'public', 'USAGE'),
    'edge_catalog_reader must be able to use the public schema';
  ASSERT NOT has_table_privilege('edge_catalog_reader', 'public.products', 'SELECT'),
    'edge_catalog_reader must not SELECT products directly';
  ASSERT NOT has_table_privilege(
    'edge_catalog_reader', 'public.edge_catalog_products', 'INSERT'
  ), 'edge_catalog_reader must not INSERT through the catalog projection';
  ASSERT NOT has_table_privilege('edge_rls_user', 'public.products', 'SELECT'),
    'edge_rls_user must have no direct products privilege before SET ROLE';
  ASSERT NOT has_table_privilege(
    'edge_rls_user', 'public.edge_catalog_products', 'SELECT'
  ), 'edge_rls_user must not inherit the public-cache projection';
  ASSERT NOT has_table_privilege(
    'authenticated', 'public.edge_catalog_products', 'SELECT'
  ), 'authenticated must not receive the public-cache projection directly';
  ASSERT NOT has_table_privilege('anon', 'public.edge_catalog_products', 'SELECT'),
    'anon must not receive the public-cache projection directly';

  SELECT array_agg(column_name ORDER BY ordinal_position)
    INTO actual_columns
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'edge_catalog_products';

  ASSERT actual_columns = ARRAY[
    'id', 'name', 'brand', 'category', 'price_retail', 'images',
    'short_description', 'patina_managed', 'status'
  ]::text[], 'edge catalog projection exposes an unexpected column set';

  SELECT reloptions
    INTO relation_options
    FROM pg_class
   WHERE oid = 'public.edge_catalog_products'::regclass;
  ASSERT 'security_barrier=true' = ANY(relation_options),
    'edge_catalog_products must be a security-barrier view';

  ASSERT (
    SELECT count(*) = 2
       AND bool_and(encrypted_password IS NULL)
       AND bool_and(email_confirmed_at IS NULL)
       AND bool_and(banned_until = 'infinity'::timestamptz)
      FROM auth.users
     WHERE id IN (
       'cf100000-0000-4000-8000-000000000001',
       'cf100000-0000-4000-8000-000000000002'
     )
       AND email LIKE 'cf-phase1-%@patina.invalid'
  ), 'synthetic Auth users must be passwordless and disabled';

  ASSERT (
    SELECT count(*) = 1
      FROM public.organizations
     WHERE id = 'cf120000-0000-4000-8000-000000000001'
       AND slug = 'cf-phase1-synthetic-studio'
       AND status = 'active'
  ), 'synthetic Phase 1 organization is missing';

  ASSERT (
    SELECT count(*) = 1
      FROM svc_media.media_assets
     WHERE id = 'cf140000-0000-4000-8000-000000000001'
       AND raw_key = 'phase1/catalog-published/original.jpg'
       AND mime_type = 'image/jpeg'
  ), 'synthetic media metadata fixture is missing';

  ASSERT (
    SELECT count(*) = 1
      FROM public.proposal_captures
     WHERE id = 'cf150000-0000-4000-8000-000000000001'
       AND designer_id = 'cf100000-0000-4000-8000-000000000001'
       AND status = 'inbox'
  ), 'synthetic proposal capture fixture is missing';

  ASSERT (
    SELECT count(*) = 1
      FROM public.field_captures
     WHERE id = 'cf160000-0000-4000-8000-000000000001'
       AND designer_id = 'cf100000-0000-4000-8000-000000000001'
       AND status = 'inbox'
  ), 'synthetic field capture fixture is missing';
END
$$;

ROLLBACK TO SAVEPOINT cf481_role_reconciliation;
RELEASE SAVEPOINT cf481_role_reconciliation;

SAVEPOINT cf481_projection_probe;
ALTER TABLE public.products
  DROP CONSTRAINT products_catalog_requires_management;
UPDATE public.products
   SET patina_managed = false
 WHERE id = 'cf130000-0000-4000-8000-000000000005';
DO $$
DECLARE
  projected jsonb;
BEGIN
  SELECT jsonb_build_object(
           'ids', jsonb_agg(id ORDER BY id),
           'managed', jsonb_agg(patina_managed ORDER BY id),
           'published', bool_and(status = 'published')
         )
    INTO projected
    FROM public.edge_catalog_products
   WHERE id::text LIKE 'cf130000-%';

  ASSERT projected = jsonb_build_object(
    'ids', jsonb_build_array(
      'cf130000-0000-4000-8000-000000000001',
      'cf130000-0000-4000-8000-000000000005'
    ),
    'managed', jsonb_build_array(true, false),
    'published', true
  ), 'catalog projection must use only layer/status and preserve patina_managed';
END
$$;
ROLLBACK TO SAVEPOINT cf481_projection_probe;
RELEASE SAVEPOINT cf481_projection_probe;

UPDATE public.aesthete_jobs
   SET status = 'done',
       attempts = 4,
       run_after = '2026-01-16 01:00:00+00',
       last_error = 'synthetic completed state',
       completed_at = '2026-01-16 02:00:00+00',
       claimed_at = '2026-01-16 00:30:00+00'
 WHERE dedupe_key = 'cf130000-0000-4000-8000-000000000001:embed_text:r1';

CREATE TEMP TABLE cf481_seed_before AS
SELECT 'aesthete_jobs'::text AS source,
       jsonb_agg(to_jsonb(j) ORDER BY j.id) AS snapshot
  FROM public.aesthete_jobs AS j
 WHERE j.product_id::text LIKE 'cf130000-%'
UNION ALL
SELECT 'teaching_queue', jsonb_agg(to_jsonb(q) ORDER BY q.product_id)
  FROM public.teaching_queue AS q
 WHERE q.product_id::text LIKE 'cf130000-%'
UNION ALL
SELECT 'products', jsonb_agg(
         jsonb_build_object(
           'id', p.id,
           'layer', p.layer,
           'status', p.status,
           'images', p.images,
           'updated_at', p.updated_at
         ) ORDER BY p.id
       )
  FROM public.products AS p
 WHERE p.id::text LIKE 'cf130000-%';

\ir ../../seed/cloudflare-phase1-staging.sql

DO $$
BEGIN
  ASSERT (
    SELECT snapshot = (
      SELECT jsonb_agg(to_jsonb(j) ORDER BY j.id)
        FROM public.aesthete_jobs AS j
       WHERE j.product_id::text LIKE 'cf130000-%'
    )
      FROM cf481_seed_before
     WHERE source = 'aesthete_jobs'
  ), 'seed replay changed or requeued an Aesthete job';

  ASSERT (
    SELECT snapshot = (
      SELECT jsonb_agg(to_jsonb(q) ORDER BY q.product_id)
        FROM public.teaching_queue AS q
       WHERE q.product_id::text LIKE 'cf130000-%'
    )
      FROM cf481_seed_before
     WHERE source = 'teaching_queue'
  ), 'seed replay changed triggered teaching work';

  ASSERT (
    SELECT snapshot = (
      SELECT jsonb_agg(
               jsonb_build_object(
                 'id', p.id,
                 'layer', p.layer,
                 'status', p.status,
                 'images', p.images,
                 'updated_at', p.updated_at
               ) ORDER BY p.id
             )
        FROM public.products AS p
       WHERE p.id::text LIKE 'cf130000-%'
    )
      FROM cf481_seed_before
     WHERE source = 'products'
  ), 'seed replay changed fixture product state or timestamps';
END
$$;

CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

DO $cf481_login_lifecycle$
DECLARE
  login_password text := replace(gen_random_uuid()::text, '-', '');
  gateway_host text := host(network(set_masklen(inet_server_addr(), 16)) + 1);
  admin_dsn text;
  catalog_dsn text;
  auth_dsn text;
  admin_connected boolean := false;
  catalog_connected boolean := false;
  auth_connected boolean := false;
  cleanup_connection text;
  live_connections text[];
  catalog_role_ok boolean;
  catalog_membership_ok boolean;
  auth_membership_ok boolean;
  inherited_select boolean;
  catalog_result jsonb;
  session_role text;
  first_result jsonb;
  second_result jsonb;
  reset_result jsonb;
  error_result text;
  error_role text;
BEGIN
  admin_dsn := format(
    'host=%s port=54322 dbname=%s user=postgres password=postgres connect_timeout=5',
    gateway_host,
    current_database()
  );
  catalog_dsn := format(
    'host=%s port=54322 dbname=%s user=edge_catalog_login_cf481 password=%s connect_timeout=5',
    gateway_host,
    current_database(),
    login_password
  );
  auth_dsn := format(
    'host=%s port=54322 dbname=%s user=edge_rls_login_cf481 password=%s connect_timeout=5',
    gateway_host,
    current_database(),
    login_password
  );

  admin_connected := extensions.dblink_connect('cf481_admin', admin_dsn) = 'OK';

  -- Remove only fixed, local test-role names left by an older interrupted
  -- version of this test, then commit production-shaped disposable logins.
  PERFORM extensions.dblink_exec(
    'cf481_admin',
    $cleanup$
      DO $terminate$
      BEGIN
        PERFORM pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE usename IN (
          'edge_catalog_login_cf481', 'edge_rls_login_cf481'
        )
          AND pid <> pg_backend_pid();
      END
      $terminate$
    $cleanup$
  );
  PERFORM extensions.dblink_exec(
    'cf481_admin', 'DROP ROLE IF EXISTS edge_catalog_login_cf481'
  );
  PERFORM extensions.dblink_exec(
    'cf481_admin', 'DROP ROLE IF EXISTS edge_rls_login_cf481'
  );
  PERFORM extensions.dblink_exec(
    'cf481_admin',
    format(
      'CREATE ROLE edge_catalog_login_cf481 NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT LOGIN NOREPLICATION NOBYPASSRLS PASSWORD %L',
      login_password
    )
  );
  PERFORM extensions.dblink_exec(
    'cf481_admin',
    format(
      'CREATE ROLE edge_rls_login_cf481 NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT LOGIN NOREPLICATION NOBYPASSRLS PASSWORD %L',
      login_password
    )
  );
  PERFORM extensions.dblink_exec(
    'cf481_admin',
    'GRANT edge_catalog_reader TO edge_catalog_login_cf481 WITH ADMIN FALSE, INHERIT TRUE, SET FALSE'
  );
  PERFORM extensions.dblink_exec(
    'cf481_admin',
    'GRANT edge_rls_user TO edge_rls_login_cf481 WITH ADMIN FALSE, INHERIT FALSE, SET TRUE'
  );

  SELECT value
    INTO catalog_role_ok
    FROM extensions.dblink(
      'cf481_admin',
      $remote$
        SELECT rolinherit
           AND rolcanlogin
           AND NOT rolsuper
           AND NOT rolcreatedb
           AND NOT rolcreaterole
           AND NOT rolreplication
           AND NOT rolbypassrls
          FROM pg_roles
         WHERE rolname = 'edge_catalog_login_cf481'
      $remote$
    ) AS result(value boolean);
  ASSERT catalog_role_ok,
    'catalog LOGIN must be INHERIT with no elevated attributes';

  SELECT value
    INTO catalog_membership_ok
    FROM extensions.dblink(
      'cf481_admin',
      $remote$
        SELECT count(*) = 1
           AND bool_and(
             granted.rolname = 'edge_catalog_reader'
             AND NOT am.admin_option
             AND am.inherit_option
             AND NOT am.set_option
           )
          FROM pg_auth_members AS am
          JOIN pg_roles AS granted ON granted.oid = am.roleid
          JOIN pg_roles AS member ON member.oid = am.member
         WHERE member.rolname = 'edge_catalog_login_cf481'
      $remote$
    ) AS result(value boolean);
  ASSERT catalog_membership_ok,
    'catalog LOGIN must have exactly one inherited, non-SET capability membership';

  SELECT value
    INTO auth_membership_ok
    FROM extensions.dblink(
      'cf481_admin',
      $remote$
        SELECT count(*) = 1
           AND bool_and(
             granted.rolname = 'edge_rls_user'
             AND NOT am.admin_option
             AND NOT am.inherit_option
             AND am.set_option
           )
          FROM pg_auth_members AS am
          JOIN pg_roles AS granted ON granted.oid = am.roleid
          JOIN pg_roles AS member ON member.oid = am.member
         WHERE member.rolname = 'edge_rls_login_cf481'
      $remote$
    ) AS result(value boolean);
  ASSERT auth_membership_ok,
    'RLS LOGIN must have exactly one SET-only capability membership';

  catalog_connected := extensions.dblink_connect(
    'cf481_catalog', catalog_dsn
  ) = 'OK';

  SELECT value
    INTO inherited_select
    FROM extensions.dblink(
      'cf481_catalog',
      $remote$SELECT has_table_privilege(
        current_user, 'public.edge_catalog_products', 'SELECT'
      )$remote$
    ) AS result(value boolean);
  ASSERT inherited_select,
    'INHERIT catalog LOGIN did not inherit the view grant';

  SELECT value
    INTO catalog_result
    FROM extensions.dblink(
      'cf481_catalog',
      $remote$
        SELECT jsonb_build_object(
          'ids', jsonb_agg(id ORDER BY id),
          'managed', jsonb_agg(patina_managed ORDER BY id),
          'published', bool_and(status = 'published')
        )
          FROM public.edge_catalog_products
         WHERE id::text LIKE 'cf130000-%'
      $remote$
    ) AS result(value jsonb);
  ASSERT catalog_result = jsonb_build_object(
    'ids', jsonb_build_array(
      'cf130000-0000-4000-8000-000000000001',
      'cf130000-0000-4000-8000-000000000005'
    ),
    'managed', jsonb_build_array(true, true),
    'published', true
  ), 'production-shaped catalog LOGIN returned wrong layer/status visibility';

  SELECT value
    INTO session_role
    FROM extensions.dblink(
      'cf481_catalog', 'SELECT current_user::text'
    ) AS result(value text);
  ASSERT session_role = 'edge_catalog_login_cf481',
    'catalog direct SELECT changed the LOGIN role';

  PERFORM extensions.dblink_disconnect('cf481_catalog');
  catalog_connected := false;

  auth_connected := extensions.dblink_connect('cf481_auth', auth_dsn) = 'OK';

  PERFORM extensions.dblink_exec('cf481_auth', 'BEGIN');
  PERFORM extensions.dblink_exec('cf481_auth', 'SET LOCAL ROLE authenticated');
  PERFORM extensions.dblink_exec(
    'cf481_auth',
    $remote$SET LOCAL request.jwt.claims TO
      '{"sub":"cf100000-0000-4000-8000-000000000001","role":"authenticated"}'$remote$
  );
  SELECT value
    INTO first_result
    FROM extensions.dblink(
      'cf481_auth',
      $remote$
        SELECT jsonb_build_object(
          'role', current_user,
          'uid', auth.uid(),
          'personal', count(*) FILTER (
            WHERE id = 'cf130000-0000-4000-8000-000000000003'
          ),
          'studio', count(*) FILTER (
            WHERE id = 'cf130000-0000-4000-8000-000000000004'
          ),
          'catalog', count(*) FILTER (
            WHERE id = 'cf130000-0000-4000-8000-000000000001'
          ),
          'vector_zero', bool_and(
            CASE
              WHEN id = 'cf130000-0000-4000-8000-000000000001'
              THEN abs(embedding <=> embedding) < 0.000000001
            END
          )
        )
          FROM public.products
         WHERE id::text LIKE 'cf130000-%'
      $remote$
    ) AS result(value jsonb);
  ASSERT first_result = jsonb_build_object(
    'role', 'authenticated',
    'uid', 'cf100000-0000-4000-8000-000000000001',
    'personal', 1,
    'studio', 1,
    'catalog', 1,
    'vector_zero', true
  ), 'first authenticated caller visibility or pgvector behavior is wrong';
  PERFORM extensions.dblink_exec('cf481_auth', 'COMMIT');

  SELECT value
    INTO reset_result
    FROM extensions.dblink(
      'cf481_auth',
      $remote$
        SELECT jsonb_build_object(
          'role', current_user,
          'claims', nullif(current_setting('request.jwt.claims', true), '')
        )
      $remote$
    ) AS result(value jsonb);
  ASSERT reset_result = jsonb_build_object(
    'role', 'edge_rls_login_cf481', 'claims', NULL
  ), 'role or Alice claims leaked after commit';

  PERFORM extensions.dblink_exec('cf481_auth', 'BEGIN');
  PERFORM extensions.dblink_exec('cf481_auth', 'SET LOCAL ROLE authenticated');
  PERFORM extensions.dblink_exec(
    'cf481_auth',
    $remote$SET LOCAL request.jwt.claims TO
      '{"sub":"cf100000-0000-4000-8000-000000000001","role":"authenticated"}'$remote$
  );
  SELECT role
    INTO error_role
    FROM extensions.dblink(
      'cf481_auth',
      'SELECT current_user'
    ) AS result(role text);
  ASSERT error_role = 'authenticated',
    'errored transaction did not assume authenticated directly';
  SELECT extensions.dblink_exec(
    'cf481_auth',
    'DO $remote_error$ BEGIN RAISE EXCEPTION ''cf481 forced rollback''; END $remote_error$',
    false
  ) INTO error_result;
  ASSERT error_result = 'ERROR', 'forced remote transaction error did not occur';
  PERFORM extensions.dblink_exec('cf481_auth', 'ROLLBACK');

  SELECT value
    INTO reset_result
    FROM extensions.dblink(
      'cf481_auth',
      $remote$
        SELECT jsonb_build_object(
          'role', current_user,
          'claims', nullif(current_setting('request.jwt.claims', true), '')
        )
      $remote$
    ) AS result(value jsonb);
  ASSERT reset_result = jsonb_build_object(
    'role', 'edge_rls_login_cf481', 'claims', NULL
  ), 'role or claims leaked after an errored transaction rollback';

  PERFORM extensions.dblink_exec('cf481_auth', 'BEGIN');
  PERFORM extensions.dblink_exec('cf481_auth', 'SET LOCAL ROLE authenticated');
  PERFORM extensions.dblink_exec(
    'cf481_auth',
    $remote$SET LOCAL request.jwt.claims TO
      '{"sub":"cf100000-0000-4000-8000-000000000002","role":"authenticated"}'$remote$
  );
  SELECT value
    INTO second_result
    FROM extensions.dblink(
      'cf481_auth',
      $remote$
        SELECT jsonb_build_object(
          'role', current_user,
          'uid', auth.uid(),
          'personal', count(*) FILTER (
            WHERE id = 'cf130000-0000-4000-8000-000000000003'
          ),
          'studio', count(*) FILTER (
            WHERE id = 'cf130000-0000-4000-8000-000000000004'
          ),
          'catalog', count(*) FILTER (
            WHERE id = 'cf130000-0000-4000-8000-000000000001'
          )
        )
          FROM public.products
         WHERE id::text LIKE 'cf130000-%'
      $remote$
    ) AS result(value jsonb);
  ASSERT second_result = jsonb_build_object(
    'role', 'authenticated',
    'uid', 'cf100000-0000-4000-8000-000000000002',
    'personal', 0,
    'studio', 0,
    'catalog', 1
  ), 'second caller saw the first caller data or wrong catalog visibility';
  PERFORM extensions.dblink_exec('cf481_auth', 'COMMIT');

  SELECT value
    INTO reset_result
    FROM extensions.dblink(
      'cf481_auth',
      $remote$
        SELECT jsonb_build_object(
          'role', current_user,
          'claims', nullif(current_setting('request.jwt.claims', true), '')
        )
      $remote$
    ) AS result(value jsonb);
  ASSERT reset_result = jsonb_build_object(
    'role', 'edge_rls_login_cf481', 'claims', NULL
  ), 'role or Bob claims leaked after the second caller';

  PERFORM extensions.dblink_disconnect('cf481_auth');
  auth_connected := false;
  PERFORM extensions.dblink_exec(
    'cf481_admin', 'DROP ROLE edge_catalog_login_cf481'
  );
  PERFORM extensions.dblink_exec(
    'cf481_admin', 'DROP ROLE edge_rls_login_cf481'
  );
  PERFORM extensions.dblink_disconnect('cf481_admin');
  admin_connected := false;
EXCEPTION WHEN OTHERS THEN
  IF catalog_connected THEN
    BEGIN
      PERFORM extensions.dblink_disconnect('cf481_catalog');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  IF auth_connected THEN
    BEGIN
      PERFORM extensions.dblink_disconnect('cf481_auth');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  -- Do not trust the boolean connection flags after a dblink error. Resolve a
  -- live admin connection by name, or create a fresh cleanup connection.
  live_connections := COALESCE(
    extensions.dblink_get_connections(), ARRAY[]::text[]
  );
  IF 'cf481_admin' = ANY(live_connections) THEN
    cleanup_connection := 'cf481_admin';
  ELSIF 'cf481_admin_cleanup' = ANY(live_connections) THEN
    cleanup_connection := 'cf481_admin_cleanup';
  ELSE
    BEGIN
      IF extensions.dblink_connect('cf481_admin_cleanup', admin_dsn) = 'OK' THEN
        cleanup_connection := 'cf481_admin_cleanup';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      cleanup_connection := NULL;
    END;
  END IF;
  IF cleanup_connection IS NOT NULL THEN
    BEGIN
      PERFORM extensions.dblink_exec(
        cleanup_connection,
        $cleanup$
          DO $terminate$
          BEGIN
            PERFORM pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE usename IN (
              'edge_catalog_login_cf481', 'edge_rls_login_cf481'
            )
              AND pid <> pg_backend_pid();
          END
          $terminate$
        $cleanup$
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    BEGIN
      PERFORM extensions.dblink_exec(
        cleanup_connection,
        'DROP ROLE IF EXISTS edge_catalog_login_cf481'
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    BEGIN
      PERFORM extensions.dblink_exec(
        cleanup_connection,
        'DROP ROLE IF EXISTS edge_rls_login_cf481'
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    BEGIN
      PERFORM extensions.dblink_disconnect(
        cleanup_connection
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RAISE;
END
$cf481_login_lifecycle$;

\echo 'edge_api/catalog_roles_test.sql: functional assertions passed; running provisioning guard'

DO $$
DECLARE
  unexpected_database integer;
  unexpected_schemas integer;
  unexpected_relations integer;
  unexpected_columns integer;
  unexpected_sequences integer;
  executable_routines integer;
  callable_routines integer;
  callable_definers integer;
  unexpected_memberships integer;
  public_default_privileges integer;
  unhardened_owner_defaults integer;
  unsafe_role_grant boolean;
BEGIN
  SELECT count(*) FILTER (
           WHERE has_database_privilege(
             'edge_catalog_reader', d.oid, privilege.name
           )
         )
         + (
           NOT has_database_privilege(
             'edge_catalog_reader', d.oid, 'CONNECT'
           )
         )::integer
    INTO unexpected_database
    FROM pg_database AS d
    CROSS JOIN LATERAL (VALUES ('CREATE'), ('TEMP')) AS privilege(name)
   WHERE d.datname = current_database();

  SELECT count(*)
         + (
           NOT has_schema_privilege(
             'edge_catalog_reader', 'public', 'USAGE'
           )
         )::integer
    INTO unexpected_schemas
    FROM pg_namespace AS n
   WHERE n.nspname !~ '^pg_'
     AND n.nspname <> 'information_schema'
     AND (
       has_schema_privilege('edge_catalog_reader', n.oid, 'CREATE')
       OR (
         has_schema_privilege('edge_catalog_reader', n.oid, 'USAGE')
         AND n.nspname <> 'public'
       )
     );

  SELECT count(*)
    INTO unexpected_columns
    FROM pg_attribute AS a
    JOIN pg_class AS c ON c.oid = a.attrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL (
      VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')
    ) AS privilege(name)
   WHERE a.attnum > 0
     AND NOT a.attisdropped
     AND n.nspname !~ '^pg_'
     AND n.nspname <> 'information_schema'
     AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
     AND has_column_privilege(
       'edge_catalog_reader', c.oid, a.attnum, privilege.name
     )
     AND NOT (
       c.oid = 'public.edge_catalog_products'::regclass
       AND privilege.name = 'SELECT'
     );

  SELECT count(DISTINCT c.oid)
    INTO unexpected_relations
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL (
      VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
             ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
    ) AS privilege(name)
   WHERE n.nspname !~ '^pg_'
     AND n.nspname <> 'information_schema'
     AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
     AND has_table_privilege('edge_catalog_reader', c.oid, privilege.name)
     AND NOT (
       c.oid = 'public.edge_catalog_products'::regclass
       AND privilege.name = 'SELECT'
     );

  SELECT count(DISTINCT c.oid)
    INTO unexpected_sequences
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL (VALUES ('USAGE'), ('SELECT'), ('UPDATE')) AS privilege(name)
   WHERE c.relkind = 'S'
     AND n.nspname !~ '^pg_'
     AND n.nspname <> 'information_schema'
     AND has_sequence_privilege('edge_catalog_reader', c.oid, privilege.name);

  SELECT count(*),
         count(*) FILTER (
           WHERE has_schema_privilege('edge_catalog_reader', n.oid, 'USAGE')
         ),
         count(*) FILTER (
           WHERE has_schema_privilege('edge_catalog_reader', n.oid, 'USAGE')
             AND p.prosecdef
         )
    INTO executable_routines, callable_routines, callable_definers
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
   WHERE n.nspname !~ '^pg_'
     AND n.nspname <> 'information_schema'
     AND has_function_privilege('edge_catalog_reader', p.oid, 'EXECUTE');

  SELECT count(*)
    INTO unexpected_memberships
    FROM pg_auth_members AS am
    JOIN pg_roles AS granted ON granted.oid = am.roleid
    JOIN pg_roles AS member ON member.oid = am.member
    JOIN pg_roles AS grantor ON grantor.oid = am.grantor
   WHERE (
     member.rolname = 'edge_catalog_reader'
   ) OR (
     member.rolname = 'edge_rls_user'
     AND NOT (
       granted.rolname = 'authenticated'
       AND NOT am.admin_option
       AND NOT am.inherit_option
       AND am.set_option
     )
   ) OR (
     granted.rolname IN ('edge_catalog_reader', 'edge_rls_user')
     AND NOT (
       member.rolname = current_user
       AND grantor.rolname = 'supabase_admin'
       AND am.admin_option
       AND NOT am.inherit_option
       AND NOT am.set_option
     )
   );

  SELECT count(*)
    INTO public_default_privileges
    FROM pg_default_acl AS d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) AS acl
   WHERE acl.grantee = 0;

  SELECT count(*)
    INTO unhardened_owner_defaults
    FROM unnest(ARRAY[
      'postgres',
      'supabase_admin',
      'supabase_auth_admin',
      'supabase_storage_admin',
      'supabase_realtime_admin',
      'supabase_functions_admin'
    ]::text[]) AS expected(role_name)
    LEFT JOIN pg_roles AS owner ON owner.rolname = expected.role_name
    LEFT JOIN pg_default_acl AS d
      ON d.defaclrole = owner.oid
     AND d.defaclnamespace = 0
     AND d.defaclobjtype = 'f'
   WHERE owner.oid IS NULL
      OR d.oid IS NULL
      OR EXISTS (
        SELECT 1
        FROM aclexplode(d.defaclacl) AS acl
        WHERE acl.grantee = 0
          AND acl.privilege_type = 'EXECUTE'
      );

  SELECT has_schema_privilege('edge_catalog_reader', 'public', 'USAGE')
         AND has_function_privilege(
           'edge_catalog_reader',
           'public.grant_role_to_user(uuid,character varying,uuid)'::regprocedure,
           'EXECUTE'
         )
    INTO unsafe_role_grant;

  IF unexpected_database <> 0
     OR unexpected_schemas <> 0
     OR unexpected_relations <> 0
     OR unexpected_columns <> 0
     OR unexpected_sequences <> 0
     OR executable_routines <> 0
     OR unexpected_memberships <> 0
     OR public_default_privileges <> 0
     OR unhardened_owner_defaults <> 0
     OR unsafe_role_grant THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'PROVISIONING BLOCKED: edge_catalog_reader is not SELECT-only because ACL drift exposes database=%s, schemas=%s, relation_objects=%s, column_privileges=%s, sequence_objects=%s, executable_routines=%s, callable_routines=%s, callable_security_definers=%s, memberships=%s, public_default_privileges=%s, unhardened_owner_defaults=%s, grant_role_to_user=%s',
      unexpected_database,
      unexpected_schemas,
      unexpected_relations,
      unexpected_columns,
      unexpected_sequences,
      executable_routines,
      callable_routines,
      callable_definers,
      unexpected_memberships,
      public_default_privileges,
      unhardened_owner_defaults,
      unsafe_role_grant
    );
  END IF;
END
$$;

ROLLBACK;

\echo 'edge_api/catalog_roles_test.sql: all assertions and provisioning guard passed'
