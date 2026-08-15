-- Cloudflare Phase 1 database contract conformance (migrations 00481 + 00483).
-- Run with psql -v ON_ERROR_STOP=1 after pnpm supabase:reset.

DO $$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1
      FROM pg_default_acl AS defaults
      JOIN LATERAL aclexplode(defaults.defaclacl) AS acl ON true
     WHERE pg_get_userbyid(defaults.defaclrole) = 'postgres'
       AND defaults.defaclnamespace = 0
       AND defaults.defaclobjtype = 'f'
       AND acl.grantee = 0
       AND acl.privilege_type = 'EXECUTE'
  ), 'seed replay restored global PUBLIC routine EXECUTE';

  ASSERT EXISTS (
    SELECT 1
      FROM pg_default_acl AS defaults
      JOIN LATERAL aclexplode(defaults.defaclacl) AS acl ON true
     WHERE pg_get_userbyid(defaults.defaclrole) = 'postgres'
       AND defaults.defaclnamespace = 0
       AND defaults.defaclobjtype = 'f'
       AND acl.grantee = defaults.defaclrole
       AND acl.privilege_type = 'EXECUTE'
  ), 'postgres global routine defaults lost owner EXECUTE';

  ASSERT NOT EXISTS (
    SELECT 1
      FROM pg_default_acl AS defaults
      JOIN pg_namespace AS n ON n.oid = defaults.defaclnamespace
      JOIN LATERAL aclexplode(defaults.defaclacl) AS acl ON true
      JOIN pg_roles AS role ON role.oid = acl.grantee
     WHERE pg_get_userbyid(defaults.defaclrole) = 'postgres'
       AND n.nspname = 'public'
       AND defaults.defaclobjtype = 'r'
       AND role.rolname = 'authenticated'
       AND acl.privilege_type IN (
         'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
       )
  ), 'seed replay dropped the 00438 authenticated table-default revoke';
END
$$;

ALTER ROLE edge_catalog_reader
  CREATEDB CREATEROLE INHERIT LOGIN REPLICATION BYPASSRLS;
ALTER ROLE edge_rls_user
  CREATEDB CREATEROLE INHERIT LOGIN REPLICATION BYPASSRLS;
CREATE ROLE edge_membership_probe_cf481 NOLOGIN;
GRANT service_role TO edge_catalog_reader;
GRANT edge_catalog_reader TO edge_membership_probe_cf481
  WITH ADMIN FALSE, INHERIT TRUE, SET TRUE;

\ir ../../migrations/00481_edge_catalog_roles.sql
\ir ../../migrations/00483_edge_public_acl_boundary.sql

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
      FROM pg_namespace AS n
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND (
         has_schema_privilege('edge_rls_user', n.oid, 'USAGE')
         OR has_schema_privilege('edge_rls_user', n.oid, 'CREATE')
       )
  ), 'edge_rls_user must have no application schema capability before SET ROLE';

  ASSERT NOT has_database_privilege(
    'edge_rls_user', current_database(), 'CREATE'
  ) AND NOT has_database_privilege(
    'edge_rls_user', current_database(), 'TEMP'
  ), 'edge_rls_user must have no database creation capability before SET ROLE';

  ASSERT NOT EXISTS (
    SELECT 1
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL (
        VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
               ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
      ) AS privilege(name)
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND has_schema_privilege('edge_rls_user', n.oid, 'USAGE')
       AND has_table_privilege('edge_rls_user', c.oid, privilege.name)
  ), 'edge_rls_user must have no effective relation capability before SET ROLE';

  ASSERT NOT EXISTS (
    SELECT 1
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      JOIN pg_attribute AS a ON a.attrelid = c.oid
      CROSS JOIN LATERAL (
        VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')
      ) AS privilege(name)
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND a.attnum > 0
       AND NOT a.attisdropped
       AND has_schema_privilege('edge_rls_user', n.oid, 'USAGE')
       AND has_column_privilege(
         'edge_rls_user', c.oid, a.attnum, privilege.name
       )
  ), 'edge_rls_user must have no effective column capability before SET ROLE';

  ASSERT NOT EXISTS (
    SELECT 1
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL (VALUES ('USAGE'), ('SELECT'), ('UPDATE')) AS privilege(name)
     WHERE c.relkind = 'S'
       AND has_schema_privilege('edge_rls_user', n.oid, 'USAGE')
       AND has_sequence_privilege('edge_rls_user', c.oid, privilege.name)
  ), 'edge_rls_user must have no effective sequence capability before SET ROLE';

  ASSERT NOT EXISTS (
    SELECT 1
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND has_schema_privilege('edge_rls_user', n.oid, 'USAGE')
       AND has_function_privilege('edge_rls_user', p.oid, 'EXECUTE')
  ), 'edge_rls_user must have no callable routine before SET ROLE';

  ASSERT has_table_privilege(
    'edge_catalog_reader', 'edge_api.catalog_products', 'SELECT'
  ), 'edge_catalog_reader must be able to SELECT the catalog projection';
  ASSERT NOT has_table_privilege('edge_catalog_reader', 'public.products', 'SELECT'),
    'edge_catalog_reader must not SELECT products directly';
  ASSERT NOT has_table_privilege(
    'edge_catalog_reader', 'edge_api.catalog_products', 'INSERT'
  ), 'edge_catalog_reader must not INSERT through the catalog projection';
  ASSERT NOT has_table_privilege('edge_rls_user', 'public.products', 'SELECT'),
    'edge_rls_user must have no direct products privilege before SET ROLE';
  ASSERT NOT has_table_privilege(
    'edge_rls_user', 'edge_api.catalog_products', 'SELECT'
  ), 'edge_rls_user must not inherit the public-cache projection';
  ASSERT NOT has_table_privilege(
    'authenticated', 'edge_api.catalog_products', 'SELECT'
  ), 'authenticated must not receive the public-cache projection directly';
  ASSERT NOT has_table_privilege('anon', 'edge_api.catalog_products', 'SELECT'),
    'anon must not receive the public-cache projection directly';

  ASSERT NOT EXISTS (
    SELECT 1
      FROM pg_namespace AS n
      JOIN LATERAL aclexplode(
        COALESCE(n.nspacl, acldefault('n', n.nspowner))
      ) AS acl ON true
     WHERE n.nspname = 'public'
       AND acl.grantee = 0
       AND acl.privilege_type IN ('CREATE', 'USAGE')
  ) AND NOT has_schema_privilege('anon', 'public', 'CREATE')
     AND NOT has_schema_privilege('authenticated', 'public', 'CREATE'),
    'public schema creation/reachability boundary is not explicit';

  SELECT array_agg(column_name ORDER BY ordinal_position)
    INTO actual_columns
    FROM information_schema.columns
   WHERE table_schema = 'edge_api'
     AND table_name = 'catalog_products';

  ASSERT actual_columns = ARRAY[
    'id', 'name', 'brand', 'category', 'price_retail', 'images',
    'short_description', 'patina_managed', 'status'
  ]::text[], 'edge catalog projection exposes an unexpected column set';

  SELECT reloptions
    INTO relation_options
    FROM pg_class
   WHERE oid = 'edge_api.catalog_products'::regclass;
  ASSERT 'security_barrier=true' = ANY(relation_options),
    'edge_api.catalog_products must be a security-barrier view';

  ASSERT NOT EXISTS (
    SELECT 1
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'edge_catalog_products'
  ), 'legacy public.edge_catalog_products must not remain';

  ASSERT (
    SELECT pg_get_userbyid(c.relowner) = 'postgres'
      FROM pg_class AS c
     WHERE c.oid = 'edge_api.catalog_products'::regclass
  ), 'edge catalog view owner must be postgres';

  ASSERT (
    WITH actual(grantee, privilege_type, is_grantable) AS (
      SELECT role.rolname, acl.privilege_type, acl.is_grantable
        FROM pg_class AS c
        JOIN LATERAL aclexplode(c.relacl) AS acl ON true
        JOIN pg_roles AS role ON role.oid = acl.grantee
       WHERE c.oid = 'edge_api.catalog_products'::regclass
    ),
    expected(grantee, privilege_type, is_grantable) AS (
      VALUES
        ('postgres'::name, 'DELETE'::text, false),
        ('postgres'::name, 'INSERT'::text, false),
        ('postgres'::name, 'MAINTAIN'::text, false),
        ('postgres'::name, 'REFERENCES'::text, false),
        ('postgres'::name, 'SELECT'::text, false),
        ('postgres'::name, 'TRIGGER'::text, false),
        ('postgres'::name, 'TRUNCATE'::text, false),
        ('postgres'::name, 'UPDATE'::text, false),
        ('edge_catalog_reader'::name, 'SELECT'::text, false)
    )
    SELECT NOT EXISTS (
      (SELECT * FROM actual EXCEPT SELECT * FROM expected)
      UNION ALL
      (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    )
  ), 'edge catalog view ACL differs from the exact allow-list';

  ASSERT (
    WITH actual(grantee, privilege_type, is_grantable) AS (
      SELECT role.rolname, acl.privilege_type, acl.is_grantable
        FROM pg_namespace AS n
        JOIN LATERAL aclexplode(
          COALESCE(n.nspacl, acldefault('n', n.nspowner))
        ) AS acl ON true
        JOIN pg_roles AS role ON role.oid = acl.grantee
       WHERE n.nspname = 'edge_api'
    ),
    expected(grantee, privilege_type, is_grantable) AS (
      VALUES
        ('postgres'::name, 'CREATE'::text, false),
        ('postgres'::name, 'USAGE'::text, false),
        ('edge_catalog_reader'::name, 'USAGE'::text, false)
    )
    SELECT NOT EXISTS (
      (SELECT * FROM actual EXCEPT SELECT * FROM expected)
      UNION ALL
      (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    )
  ), 'edge_api schema ACL differs from owner plus edge reader USAGE';

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

BEGIN;
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
    FROM edge_api.catalog_products
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
ROLLBACK;

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

SELECT CASE WHEN EXISTS (
  SELECT 1 FROM pg_extension WHERE extname = 'dblink'
) THEN 'true' ELSE 'false' END AS cf481_dblink_preexisting \gset

CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

SELECT replace(gen_random_uuid()::text, '-', '') AS cf481_login_password \gset

CREATE ROLE edge_catalog_login_cf481
  NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT LOGIN NOREPLICATION NOBYPASSRLS
  PASSWORD :'cf481_login_password';
CREATE ROLE edge_rls_login_cf481
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT LOGIN NOREPLICATION NOBYPASSRLS
  PASSWORD :'cf481_login_password';

ALTER ROLE edge_catalog_login_cf481
  SET search_path TO pg_catalog, edge_api;
ALTER ROLE edge_catalog_login_cf481
  SET default_transaction_read_only TO on;
ALTER ROLE edge_rls_login_cf481
  SET search_path TO pg_catalog, public, extensions;

GRANT edge_catalog_reader TO edge_catalog_login_cf481
  WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
GRANT edge_rls_user TO edge_rls_login_cf481
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;

DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1
      FROM pg_roles
     WHERE rolname = 'edge_catalog_login_cf481'
       AND rolinherit
       AND rolcanlogin
       AND NOT rolsuper
       AND NOT rolcreatedb
       AND NOT rolcreaterole
       AND NOT rolreplication
       AND NOT rolbypassrls
       AND rolconfig @> ARRAY[
         'search_path=pg_catalog, edge_api',
         'default_transaction_read_only=on'
       ]
  ), 'catalog LOGIN must be INHERIT with no elevated attributes';

  ASSERT (
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
  ), 'catalog LOGIN must have exactly one inherited, non-SET capability membership';

  ASSERT EXISTS (
    SELECT 1
      FROM pg_roles
     WHERE rolname = 'edge_rls_login_cf481'
       AND rolconfig @> ARRAY['search_path=pg_catalog, public, extensions']
  ), 'RLS LOGIN must pin its qualified application/extension search path';

  ASSERT (
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
  ), 'RLS LOGIN must have exactly one SET-only capability membership';
END
$$;

SELECT extensions.dblink_connect(
  'cf481_catalog',
  format(
    'host=%s port=54322 dbname=postgres user=edge_catalog_login_cf481 password=%s connect_timeout=5',
    host(network(set_masklen(inet_server_addr(), 16)) + 1),
    :'cf481_login_password'
  )
);

DO $$
DECLARE
  inherited_select boolean;
  catalog_result jsonb;
  session_role text;
  login_contract jsonb;
  forbidden_ddl text;
BEGIN
  SELECT value
    INTO inherited_select
    FROM extensions.dblink(
      'cf481_catalog',
      $remote$SELECT has_table_privilege(
        current_user, 'edge_api.catalog_products', 'SELECT'
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
          FROM edge_api.catalog_products
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

  SELECT value
    INTO login_contract
    FROM extensions.dblink(
      'cf481_catalog',
      $remote$
        SELECT jsonb_build_object(
          'connect', has_database_privilege(current_user, current_database(), 'CONNECT'),
          'create', has_database_privilege(current_user, current_database(), 'CREATE'),
          'temp', has_database_privilege(current_user, current_database(), 'TEMP'),
          'read_only', current_setting('default_transaction_read_only'),
          'search_path', current_setting('search_path')
        )
      $remote$
    ) AS result(value jsonb);
  ASSERT login_contract = jsonb_build_object(
    'connect', true,
    'create', false,
    'temp', false,
    'read_only', 'on',
    'search_path', 'pg_catalog, edge_api'
  ), 'catalog LOGIN ACL contract or advisory connection settings changed';

  SELECT extensions.dblink_exec(
    'cf481_catalog',
    'CREATE TEMP TABLE cf481_forbidden_temp(id integer)',
    false
  ) INTO forbidden_ddl;
  ASSERT forbidden_ddl = 'ERROR',
    'catalog LOGIN unexpectedly created a temporary table';
END
$$;

SELECT extensions.dblink_disconnect('cf481_catalog');

SELECT extensions.dblink_connect(
  'cf481_auth',
  format(
    'host=%s port=54322 dbname=postgres user=edge_rls_login_cf481 password=%s connect_timeout=5',
    host(network(set_masklen(inet_server_addr(), 16)) + 1),
    :'cf481_login_password'
  )
);

DO $$
DECLARE
  first_result jsonb;
  second_result jsonb;
  reset_result jsonb;
  abuse_result text;
  error_result text;
  error_role text;
BEGIN
  PERFORM extensions.dblink_exec('cf481_auth', 'BEGIN');
  PERFORM extensions.dblink_exec('cf481_auth', 'SET LOCAL ROLE authenticated');
  PERFORM extensions.dblink_exec(
    'cf481_auth',
    $remote$SET LOCAL request.jwt.claims TO
      '{"sub":"cf100000-0000-4000-8000-000000000001","role":"service_role"}'$remote$
  );
  SELECT extensions.dblink_exec(
    'cf481_auth',
    $remote$
      DO $abuse$
      BEGIN
        PERFORM public.grant_role_to_user(
          'cf100000-0000-4000-8000-000000000002',
          'super_admin',
          'a0000000-0000-0000-0000-000000000001'
        );
      END
      $abuse$
    $remote$,
    false
  ) INTO abuse_result;
  ASSERT abuse_result = 'ERROR',
    'authenticated LOGIN invoked grant_role_to_user with forged service claims';
  PERFORM extensions.dblink_exec('cf481_auth', 'ROLLBACK');

  ASSERT NOT EXISTS (
    SELECT 1
      FROM public.user_roles AS ur
      JOIN public.roles AS role ON role.id = ur.role_id
     WHERE ur.user_id = 'cf100000-0000-4000-8000-000000000002'
       AND role.name = 'super_admin'
  ), 'real authenticated LOGIN created an elevated role assignment';

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
END
$$;

SELECT extensions.dblink_disconnect('cf481_auth');

REVOKE edge_catalog_reader FROM edge_catalog_login_cf481;
REVOKE edge_rls_user FROM edge_rls_login_cf481;
DROP ROLE edge_catalog_login_cf481;
DROP ROLE edge_rls_login_cf481;

\if :cf481_dblink_preexisting
\else
DROP EXTENSION dblink;
\endif

\echo 'edge_api/catalog_roles_test.sql: functional assertions passed; running provisioning guard'

DO $$
DECLARE
  unexpected_database integer;
  unexpected_schemas integer;
  unexpected_relations integer;
  unexpected_columns integer;
  unexpected_sequences integer;
  raw_routines integer;
  raw_application_routines integer;
  callable_routines integer;
  callable_definers integer;
  effective_types integer;
  raw_platform_relations integer;
  raw_platform_sequences integer;
  unsafe_role_grant boolean;
BEGIN
  SELECT count(*)
    INTO unexpected_database
    FROM (VALUES ('CREATE'), ('TEMP')) AS privilege(name)
   WHERE has_database_privilege(
     'edge_catalog_reader', current_database(), privilege.name
   );

  SELECT count(*)
    INTO unexpected_schemas
    FROM pg_namespace AS n
   WHERE n.nspname !~ '^pg_'
     AND n.nspname <> 'information_schema'
     AND (
       has_schema_privilege('edge_catalog_reader', n.oid, 'CREATE')
       OR (
         has_schema_privilege('edge_catalog_reader', n.oid, 'USAGE')
         AND n.nspname <> 'edge_api'
       )
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
     AND has_schema_privilege('edge_catalog_reader', n.oid, 'USAGE')
     AND has_table_privilege('edge_catalog_reader', c.oid, privilege.name)
     AND NOT (
       c.oid = 'edge_api.catalog_products'::regclass
       AND privilege.name = 'SELECT'
     );

  SELECT count(DISTINCT format('%s:%s', c.oid, a.attnum))
    INTO unexpected_columns
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    JOIN pg_attribute AS a ON a.attrelid = c.oid
    CROSS JOIN LATERAL (
      VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')
    ) AS privilege(name)
   WHERE n.nspname !~ '^pg_'
     AND n.nspname <> 'information_schema'
     AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND has_schema_privilege('edge_catalog_reader', n.oid, 'USAGE')
     AND has_column_privilege(
       'edge_catalog_reader', c.oid, a.attnum, privilege.name
     )
     AND NOT (
       c.oid = 'edge_api.catalog_products'::regclass
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
     AND has_schema_privilege('edge_catalog_reader', n.oid, 'USAGE')
     AND has_sequence_privilege('edge_catalog_reader', c.oid, privilege.name);

  SELECT count(*),
         count(*) FILTER (
           WHERE has_schema_privilege('edge_catalog_reader', n.oid, 'USAGE')
         ),
         count(*) FILTER (
           WHERE has_schema_privilege('edge_catalog_reader', n.oid, 'USAGE')
             AND p.prosecdef
         )
    INTO raw_routines, callable_routines, callable_definers
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
   WHERE n.nspname !~ '^pg_'
     AND n.nspname <> 'information_schema'
     AND has_function_privilege('edge_catalog_reader', p.oid, 'EXECUTE');

  SELECT count(*)
    INTO raw_application_routines
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    JOIN LATERAL aclexplode(
      COALESCE(p.proacl, acldefault('f', p.proowner))
    ) AS acl ON true
   WHERE n.nspname = 'public'
     AND pg_get_userbyid(p.proowner) = 'postgres'
     AND p.prokind IN ('f', 'p', 'a', 'w')
     AND acl.grantee = 0
     AND acl.privilege_type = 'EXECUTE';

  SELECT count(*)
    INTO effective_types
    FROM pg_type AS t
    JOIN pg_namespace AS n ON n.oid = t.typnamespace
   WHERE n.nspname !~ '^pg_'
     AND n.nspname <> 'information_schema'
     AND has_schema_privilege('edge_catalog_reader', n.oid, 'USAGE')
     AND has_type_privilege('edge_catalog_reader', t.oid, 'USAGE');

  SELECT count(DISTINCT c.oid)
    INTO raw_platform_relations
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(c.relacl, acldefault('r', c.relowner))
    ) AS acl
   WHERE n.nspname !~ '^pg_'
     AND n.nspname <> 'information_schema'
     AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
     AND acl.grantee = 0;

  SELECT count(DISTINCT c.oid)
    INTO raw_platform_sequences
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(c.relacl, acldefault('S', c.relowner))
    ) AS acl
   WHERE n.nspname !~ '^pg_'
     AND n.nspname <> 'information_schema'
     AND c.relkind = 'S'
     AND acl.grantee = 0;

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
     OR callable_routines <> 0
     OR raw_application_routines <> 0
     OR effective_types <> 0
     OR unsafe_role_grant THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'PROVISIONING BLOCKED: edge catalog capability exceeds connect/read-only-view contract: database=%s schemas=%s relations=%s columns=%s sequences=%s callable_routines=%s callable_definers=%s application_public_routines=%s effective_types=%s grant_role_to_user=%s; raw drift routines=%s relations=%s sequences=%s',
      unexpected_database,
      unexpected_schemas,
      unexpected_relations,
      unexpected_columns,
      unexpected_sequences,
      callable_routines,
      callable_definers,
      raw_application_routines,
      effective_types,
      unsafe_role_grant,
      raw_routines,
      raw_platform_relations,
      raw_platform_sequences
    );
  END IF;
END
$$;

\echo 'edge_api/catalog_roles_test.sql: all assertions and provisioning guard passed'
