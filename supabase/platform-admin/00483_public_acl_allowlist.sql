-- ═══════════════════════════════════════════════════════════════════════════
-- 00483 — PUBLIC ACL allow-list, platform-administrator closure phase
--
-- Run only after migrations/00483_public_acl_allowlist.sql. This file is an
-- idempotent, transactional operator artifact for a verified Supabase
-- platform administrator. It is not part of the ordinary migration replay
-- because the normal `postgres` migration role cannot change reserved-owner
-- ACLs and PostgreSQL reports those attempts as warning-only no-ops.
--
-- The script is version-tolerant over current routine counts, but fails
-- closed on unknown schema owners, routine owners, extension provenance, or
-- PUBLIC relation targets. It never provisions an Edge LOGIN.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $preflight$
DECLARE
  role_name text;
BEGIN
  IF NOT COALESCE(
    (SELECT rolsuper FROM pg_roles WHERE rolname = current_user),
    false
  ) THEN
    RAISE EXCEPTION
      '00483 platform phase requires a superuser/platform principal; got %',
      current_user;
  END IF;

  IF (SELECT pg_get_userbyid(datdba)
        FROM pg_database
       WHERE datname = current_database()) <> 'postgres' THEN
    RAISE EXCEPTION
      '00483 expected database % to be owned by postgres', current_database();
  END IF;

  FOREACH role_name IN ARRAY ARRAY[
    'postgres',
    'anon',
    'authenticated',
    'service_role',
    'dashboard_user',
    'agent_reader',
    'agent_writer',
    'edge_catalog_reader',
    'edge_rls_user',
    'supabase_admin',
    'supabase_auth_admin',
    'supabase_functions_admin',
    'supabase_realtime_admin',
    'supabase_storage_admin'
  ]
  LOOP
    IF to_regrole(role_name) IS NULL THEN
      RAISE EXCEPTION '00483 required role % is missing', role_name;
    END IF;
  END LOOP;

  IF EXISTS (
    WITH expected(schema_name, owner_name) AS (
      VALUES
        ('auth', 'supabase_admin'),
        ('cron', 'supabase_admin'),
        ('extensions', 'postgres'),
        ('graphql', 'supabase_admin'),
        ('graphql_public', 'supabase_admin'),
        ('net', 'supabase_admin'),
        ('public', 'pg_database_owner'),
        ('realtime', 'supabase_admin'),
        ('storage', 'supabase_admin'),
        ('svc_media', 'postgres'),
        ('svc_orders', 'postgres'),
        ('svc_projects', 'postgres')
    )
    SELECT 1
      FROM expected AS e
      LEFT JOIN pg_namespace AS n ON n.nspname = e.schema_name
     WHERE n.oid IS NULL
        OR pg_get_userbyid(n.nspowner) <> e.owner_name
  ) THEN
    RAISE EXCEPTION '00483 required schema owner manifest drifted';
  END IF;

  IF EXISTS (
    WITH expected(extension_name, schema_name) AS (
      VALUES
        ('moddatetime', 'extensions'),
        ('pg_cron', 'pg_catalog'),
        ('pg_graphql', 'graphql'),
        ('pg_net', 'extensions'),
        ('pg_stat_statements', 'extensions'),
        ('pg_trgm', 'public'),
        ('pgcrypto', 'extensions'),
        ('supabase_vault', 'vault'),
        ('uuid-ossp', 'extensions'),
        ('vector', 'public')
    )
    SELECT 1
      FROM expected AS expected_extension
      LEFT JOIN pg_extension AS e
        ON e.extname = expected_extension.extension_name
      LEFT JOIN pg_namespace AS n ON n.oid = e.extnamespace
     WHERE e.oid IS NULL
        OR n.nspname <> expected_extension.schema_name
        OR pg_get_userbyid(e.extowner) NOT IN ('postgres', 'supabase_admin')
  ) THEN
    RAISE EXCEPTION '00483 required extension owner/schema manifest drifted';
  END IF;

  IF EXISTS (
    WITH allowed(owner_name, schema_name) AS (
      VALUES
        ('postgres', '_realtime'),
        ('postgres', 'app_private'),
        ('postgres', 'extensions'),
        ('postgres', 'public'),
        ('postgres', 'storage'),
        ('postgres', 'supabase_migrations'),
        ('postgres', 'svc_media'),
        ('postgres', 'svc_orders'),
        ('postgres', 'svc_projects'),
        ('supabase_admin', 'cron'),
        ('supabase_admin', 'extensions'),
        ('supabase_admin', 'graphql'),
        ('supabase_admin', 'graphql_public'),
        ('supabase_admin', 'net'),
        ('supabase_admin', 'pgbouncer'),
        ('supabase_admin', 'public'),
        ('supabase_admin', 'realtime'),
        ('supabase_admin', 'vault'),
        ('supabase_auth_admin', 'auth'),
        ('supabase_functions_admin', 'supabase_functions'),
        ('supabase_realtime_admin', 'realtime'),
        ('supabase_storage_admin', 'storage')
    )
    SELECT 1
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
      LEFT JOIN allowed AS a
        ON a.owner_name = pg_get_userbyid(p.proowner)
       AND a.schema_name = n.nspname
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND a.owner_name IS NULL
  ) THEN
    RAISE EXCEPTION '00483 found an unreviewed non-system routine owner/schema';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
      JOIN pg_depend AS d
        ON d.classid = 'pg_proc'::regclass
       AND d.objid = p.oid
       AND d.deptype = 'e'
      JOIN pg_extension AS e ON e.oid = d.refobjid
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND e.extname NOT IN (
         'moddatetime', 'pg_cron', 'pg_graphql', 'pg_net',
         'pg_stat_statements', 'pg_trgm', 'pgcrypto', 'supabase_vault',
         'uuid-ossp', 'vector'
       )
  ) THEN
    RAISE EXCEPTION '00483 found a non-system routine from an unreviewed extension';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_namespace AS n
      CROSS JOIN LATERAL aclexplode(
        COALESCE(n.nspacl, acldefault('n', n.nspowner))
      ) AS acl
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND acl.grantee = 0
       AND n.nspname NOT IN ('net', 'public')
  ) THEN
    RAISE EXCEPTION '00483 found PUBLIC privileges on an unreviewed schema';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_namespace AS n
      CROSS JOIN LATERAL aclexplode(
        COALESCE(n.nspacl, acldefault('n', n.nspowner))
      ) AS acl
      LEFT JOIN pg_roles AS r ON r.oid = acl.grantee
     WHERE n.nspname = 'public'
       AND acl.grantee <> 0
       AND COALESCE(r.rolname, '') NOT IN (
         'pg_database_owner', 'anon', 'authenticated', 'service_role',
         'postgres', 'agent_reader', 'agent_writer',
         'edge_catalog_reader', 'dashboard_user'
       )
  ) THEN
    RAISE EXCEPTION
      '00483 found an unreviewed named grantee on the public schema';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(
        c.relacl,
        acldefault(
          CASE WHEN c.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END,
          c.relowner
        )
      )) AS acl
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
       AND acl.grantee = 0
       AND (n.nspname, c.relname) NOT IN (
         ('cron', 'job'),
         ('cron', 'job_run_details'),
         ('extensions', 'pg_stat_statements'),
         ('extensions', 'pg_stat_statements_info'),
         ('net', '_http_response'),
         ('net', 'http_request_queue'),
         ('net', 'http_request_queue_id_seq')
       )
  ) THEN
    RAISE EXCEPTION '00483 found PUBLIC privileges on an unreviewed relation';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
     WHERE (n.nspname, c.relname) IN (
       ('cron', 'job'),
       ('cron', 'job_run_details'),
       ('extensions', 'pg_stat_statements'),
       ('extensions', 'pg_stat_statements_info'),
       ('net', '_http_response'),
       ('net', 'http_request_queue'),
       ('net', 'http_request_queue_id_seq')
     )
       AND pg_get_userbyid(c.relowner) <> 'supabase_admin'
  ) THEN
    RAISE EXCEPTION '00483 reviewed platform relation owner drifted';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_database AS d
      CROSS JOIN LATERAL aclexplode(
        COALESCE(d.datacl, acldefault('d', d.datdba))
      ) AS acl
     WHERE d.datname = current_database()
       AND acl.grantee = 0
       AND acl.privilege_type NOT IN ('CONNECT', 'TEMPORARY')
  ) THEN
    RAISE EXCEPTION '00483 found an unreviewed database PUBLIC privilege';
  END IF;

  -- Table-level REVOKE does not remove column ACLs. No reviewed contract gives
  -- PUBLIC or either Edge role a direct column privilege, so fail before any
  -- mutation if an operator or extension introduced one.
  IF EXISTS (
    SELECT 1
      FROM pg_attribute AS a
      JOIN pg_class AS c ON c.oid = a.attrelid
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(a.attacl) AS acl
     WHERE a.attnum > 0
       AND NOT a.attisdropped
       AND n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
       AND acl.grantee IN (
         0,
         'edge_catalog_reader'::regrole,
         'edge_rls_user'::regrole
       )
  ) THEN
    RAISE EXCEPTION
      '00483 found an unreviewed PUBLIC/Edge column privilege';
  END IF;

  IF to_regprocedure('auth.uid()') IS NULL
     OR to_regprocedure('auth.jwt()') IS NULL
     OR to_regprocedure('auth.role()') IS NULL
     OR to_regprocedure('auth.email()') IS NULL
     OR to_regprocedure('extensions.gen_random_uuid()') IS NULL
     OR to_regprocedure('extensions.digest(bytea,text)') IS NULL
     OR to_regprocedure('extensions.digest(text,text)') IS NULL
     OR to_regprocedure('net.http_get(text,jsonb,jsonb,integer)') IS NULL
     OR to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL
     OR to_regprocedure('realtime.topic()') IS NULL
     OR to_regprocedure(
       'public.grant_role_to_user(uuid,character varying,uuid)'
     ) IS NULL
     OR to_regprocedure(
       'public.revoke_role_from_user(uuid,character varying)'
     ) IS NULL THEN
    RAISE EXCEPTION '00483 required routine signature manifest drifted';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc AS p
     WHERE p.pronamespace = 'realtime'::regnamespace
       AND p.proname = 'broadcast_changes'
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_proc AS p
     WHERE p.pronamespace = 'realtime'::regnamespace
       AND p.proname = 'send'
  ) THEN
    RAISE EXCEPTION '00483 realtime restricted-routine manifest drifted';
  END IF;
END
$preflight$;

-- Keep CONNECT public, remove scratch-table authority. The database owner and
-- the pre-existing direct dashboard_user TEMP ACL remain.
DO $database_acl$
BEGIN
  EXECUTE format(
    'REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC',
    current_database()
  );
END
$database_acl$;

-- Normalize generic application access only where the audit established an
-- exact platform contract. Existing named platform/admin ACLs are preserved.
GRANT EXECUTE ON FUNCTION
  auth.uid(), auth.jwt(), auth.role(), auth.email()
TO anon, authenticated, service_role;

GRANT EXECUTE ON ALL ROUTINES IN SCHEMA storage
TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION realtime.topic()
FROM anon, service_role, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION realtime.topic() TO authenticated;

-- broadcast_changes/send are Realtime-internal entry points. Preserve their
-- existing platform/admin callers, but strip every generic API/Edge caller.
DO $realtime_restricted_routines$
DECLARE
  routine_identity regprocedure;
BEGIN
  FOR routine_identity IN
    SELECT p.oid::regprocedure
      FROM pg_proc AS p
     WHERE p.pronamespace = 'realtime'::regnamespace
       AND p.proname IN ('broadcast_changes', 'send')
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON ROUTINE %s '
      'FROM anon, authenticated, service_role, '
      'edge_catalog_reader, edge_rls_user',
      routine_identity
    );
  END LOOP;
END
$realtime_restricted_routines$;

REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA extensions
FROM anon, authenticated, service_role,
     edge_catalog_reader, edge_rls_user;

GRANT EXECUTE ON FUNCTION extensions.gen_random_uuid()
TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  extensions.digest(bytea, text),
  extensions.digest(text, text)
TO service_role;

REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA net
FROM anon, authenticated, service_role, supabase_functions_admin,
     edge_catalog_reader, edge_rls_user;

GRANT EXECUTE ON FUNCTION
  net.http_get(text, jsonb, jsonb, integer),
  net.http_post(text, jsonb, jsonb, jsonb, integer)
TO anon, authenticated, service_role, postgres, supabase_functions_admin;

GRANT SELECT ON TABLE
  extensions.pg_stat_statements,
  extensions.pg_stat_statements_info
TO dashboard_user, postgres;

GRANT SELECT ON TABLE net._http_response TO postgres;

-- Remove every direct Edge object ACL first; the one approved view grant is
-- restored after the sweep. PUBLIC-derived privileges are removed below.
DO $edge_relation_acl$
DECLARE
  relation_row record;
BEGIN
  FOR relation_row IN
    SELECT n.nspname, c.relname, c.relkind
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
  LOOP
    IF relation_row.relkind = 'S' THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON SEQUENCE %I.%I '
        'FROM edge_catalog_reader, edge_rls_user',
        relation_row.nspname,
        relation_row.relname
      );
    ELSE
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE %I.%I '
        'FROM edge_catalog_reader, edge_rls_user',
        relation_row.nspname,
        relation_row.relname
      );
    END IF;
  END LOOP;
END
$edge_relation_acl$;

GRANT SELECT ON TABLE public.edge_catalog_products TO edge_catalog_reader;

DO $schema_acl$
DECLARE
  schema_name text;
BEGIN
  FOR schema_name IN
    SELECT n.nspname
      FROM pg_namespace AS n
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON SCHEMA %I '
      'FROM edge_catalog_reader, edge_rls_user',
      schema_name
    );

    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON SCHEMA %I FROM PUBLIC',
      schema_name
    );
  END LOOP;
END
$schema_acl$;

-- Normalize the public schema's direct ACL. pg_database_owner remains the
-- intrinsic owner; every non-owner grantee gets USAGE only if reviewed here.
REVOKE ALL PRIVILEGES ON SCHEMA public
FROM anon, authenticated, service_role, postgres,
     agent_reader, agent_writer, edge_catalog_reader, dashboard_user;

GRANT USAGE ON SCHEMA public
TO anon, authenticated, service_role, postgres,
   agent_reader, agent_writer, edge_catalog_reader, dashboard_user;

DO $relation_acl$
DECLARE
  relation_row record;
BEGIN
  FOR relation_row IN
    SELECT DISTINCT n.nspname, c.relname, c.relkind
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(
        c.relacl,
        acldefault(
          CASE WHEN c.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END,
          c.relowner
        )
      )) AS acl
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
       AND acl.grantee = 0
  LOOP
    IF relation_row.relkind = 'S' THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON SEQUENCE %I.%I FROM PUBLIC',
        relation_row.nspname,
        relation_row.relname
      );
    ELSE
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM PUBLIC',
        relation_row.nspname,
        relation_row.relname
      );
    END IF;
  END LOOP;
END
$relation_acl$;

-- The superuser/platform principal has real authority over every reviewed
-- owner. Remove PUBLIC EXECUTE from every non-system routine dynamically so
-- extension-version differences cannot leave a gap.
DO $routine_acl$
DECLARE
  routine_identity regprocedure;
BEGIN
  FOR routine_identity IN
    SELECT p.oid::regprocedure
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND EXISTS (
         SELECT 1
           FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
          WHERE acl.grantee = 0
            AND acl.privilege_type = 'EXECUTE'
       )
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON ROUTINE %s FROM PUBLIC',
      routine_identity
    );
  END LOOP;
END
$routine_acl$;

-- Edge roles receive no direct routine ACL, even if a prior operator added
-- one. edge_rls_user reaches authenticated only through SET LOCAL ROLE.
DO $edge_routine_acl$
DECLARE
  routine_identity regprocedure;
BEGIN
  FOR routine_identity IN
    SELECT p.oid::regprocedure
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON ROUTINE %s '
      'FROM edge_catalog_reader, edge_rls_user',
      routine_identity
    );
  END LOOP;
END
$edge_routine_acl$;

-- Explicit exception to preserving named ACLs: these unguarded SECURITY
-- DEFINER role mutators are owner + service_role only.
REVOKE EXECUTE ON FUNCTION
  public.grant_role_to_user(uuid, character varying, uuid),
  public.revoke_role_from_user(uuid, character varying)
FROM PUBLIC, anon, authenticated, dashboard_user,
     edge_catalog_reader, edge_rls_user;

GRANT EXECUTE ON FUNCTION
  public.grant_role_to_user(uuid, character varying, uuid),
  public.revoke_role_from_user(uuid, character varying)
TO service_role;

DO $helper_acl$
DECLARE
  routine_oid oid;
  grantee_name text;
BEGIN
  FOREACH routine_oid IN ARRAY ARRAY[
    to_regprocedure('public.grant_role_to_user(uuid,character varying,uuid)')::oid,
    to_regprocedure('public.revoke_role_from_user(uuid,character varying)')::oid
  ]
  LOOP
    FOR grantee_name IN
      SELECT r.rolname
        FROM pg_proc AS p
        CROSS JOIN LATERAL aclexplode(
          COALESCE(p.proacl, acldefault('f', p.proowner))
        ) AS acl
        JOIN pg_roles AS r ON r.oid = acl.grantee
       WHERE p.oid = routine_oid
         AND acl.privilege_type = 'EXECUTE'
         AND r.rolname NOT IN ('postgres', 'service_role')
    LOOP
      EXECUTE format(
        'REVOKE EXECUTE ON ROUTINE %s FROM %I',
        routine_oid::regprocedure,
        grantee_name
      );
    END LOOP;
  END LOOP;
END
$helper_acl$;

-- Global owner defaults remove PostgreSQL's intrinsic PUBLIC EXECUTE in every
-- schema while preserving every existing named global/per-schema default ACL.
DO $owner_defaults$
DECLARE
  owner_name text;
BEGIN
  FOREACH owner_name IN ARRAY ARRAY[
    'postgres',
    'supabase_admin',
    'supabase_auth_admin',
    'supabase_functions_admin',
    'supabase_realtime_admin',
    'supabase_storage_admin'
  ]
  LOOP
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I '
      'REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',
      owner_name
    );
  END LOOP;
END
$owner_defaults$;

DO $postconditions$
DECLARE
  owner_name text;
  owner_oid oid;
  role_name text;
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_database AS d
      CROSS JOIN LATERAL aclexplode(
        COALESCE(d.datacl, acldefault('d', d.datdba))
      ) AS acl
     WHERE d.datname = current_database()
       AND acl.grantee = 0
       AND acl.privilege_type <> 'CONNECT'
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_database AS d
      CROSS JOIN LATERAL aclexplode(
        COALESCE(d.datacl, acldefault('d', d.datdba))
      ) AS acl
     WHERE d.datname = current_database()
       AND acl.grantee = 0
       AND acl.privilege_type = 'CONNECT'
  ) THEN
    RAISE EXCEPTION '00483 database PUBLIC ACL is not CONNECT-only';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_database AS d
      CROSS JOIN LATERAL aclexplode(
        COALESCE(d.datacl, acldefault('d', d.datdba))
      ) AS acl
      LEFT JOIN pg_roles AS r ON r.oid = acl.grantee
     WHERE d.datname = current_database()
       AND acl.privilege_type = 'TEMPORARY'
       AND COALESCE(r.rolname, 'PUBLIC') NOT IN ('postgres', 'dashboard_user')
  ) THEN
    RAISE EXCEPTION '00483 found a non-approved named database TEMP ACL';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_namespace AS n
      CROSS JOIN LATERAL aclexplode(
        COALESCE(n.nspacl, acldefault('n', n.nspowner))
      ) AS acl
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND acl.grantee = 0
  ) OR EXISTS (
    SELECT 1
      FROM pg_namespace AS n
      CROSS JOIN LATERAL aclexplode(
        COALESCE(n.nspacl, acldefault('n', n.nspowner))
      ) AS acl
      LEFT JOIN pg_roles AS r ON r.oid = acl.grantee
     WHERE n.nspname = 'public'
       AND acl.grantee <> 0
       AND COALESCE(r.rolname, '') NOT IN (
         'pg_database_owner', 'anon', 'authenticated', 'service_role',
         'postgres', 'agent_reader', 'agent_writer',
         'edge_catalog_reader', 'dashboard_user'
       )
  ) OR has_schema_privilege('edge_rls_user', 'public', 'USAGE') THEN
    RAISE EXCEPTION '00483 schema PUBLIC/Edge allow-list failed';
  END IF;

  FOREACH role_name IN ARRAY ARRAY[
    'anon', 'authenticated', 'service_role', 'postgres',
    'agent_reader', 'agent_writer', 'edge_catalog_reader', 'dashboard_user'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_namespace AS n
        CROSS JOIN LATERAL aclexplode(
          COALESCE(n.nspacl, acldefault('n', n.nspowner))
        ) AS acl
       WHERE n.nspname = 'public'
         AND acl.grantee = to_regrole(role_name)::oid
         AND acl.privilege_type = 'USAGE'
    ) OR EXISTS (
      SELECT 1
        FROM pg_namespace AS n
        CROSS JOIN LATERAL aclexplode(
          COALESCE(n.nspacl, acldefault('n', n.nspowner))
        ) AS acl
       WHERE n.nspname = 'public'
         AND acl.grantee = to_regrole(role_name)::oid
         AND acl.privilege_type <> 'USAGE'
    ) THEN
      RAISE EXCEPTION
        '00483 public schema direct grant is wrong for %', role_name;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(
        c.relacl,
        acldefault(
          CASE WHEN c.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END,
          c.relowner
        )
      )) AS acl
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
       AND acl.grantee = 0
  ) THEN
    RAISE EXCEPTION '00483 left PUBLIC privileges on a non-system relation';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_attribute AS a
      JOIN pg_class AS c ON c.oid = a.attrelid
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(a.attacl) AS acl
     WHERE a.attnum > 0
       AND NOT a.attisdropped
       AND n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
       AND acl.grantee IN (
         0,
         'edge_catalog_reader'::regrole,
         'edge_rls_user'::regrole
       )
  ) THEN
    RAISE EXCEPTION '00483 left a PUBLIC/Edge column privilege';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(
        COALESCE(p.proacl, acldefault('f', p.proowner))
      ) AS acl
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND acl.grantee = 0
       AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION '00483 left PUBLIC EXECUTE on a non-system routine';
  END IF;

  IF NOT has_table_privilege(
    'edge_catalog_reader', 'public.edge_catalog_products', 'SELECT'
  ) OR has_table_privilege(
    'edge_catalog_reader', 'public.products', 'SELECT'
  ) THEN
    RAISE EXCEPTION '00483 edge_catalog_reader relation allow-list failed';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_namespace AS n
     WHERE (
       has_schema_privilege('edge_catalog_reader', n.oid, 'CREATE')
       OR (
         has_schema_privilege('edge_catalog_reader', n.oid, 'USAGE')
         AND n.nspname <> 'public'
       )
     )
       AND n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
  ) OR EXISTS (
    SELECT 1
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL (
        VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
               ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
      ) AS privilege(name)
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
       AND has_table_privilege('edge_catalog_reader', c.oid, privilege.name)
       AND NOT (
         c.oid = 'public.edge_catalog_products'::regclass
         AND privilege.name = 'SELECT'
       )
  ) OR EXISTS (
    SELECT 1
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL (VALUES ('USAGE'), ('SELECT'), ('UPDATE')) AS privilege(name)
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND c.relkind = 'S'
       AND has_sequence_privilege('edge_catalog_reader', c.oid, privilege.name)
  ) OR EXISTS (
    SELECT 1
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND has_function_privilege('edge_catalog_reader', p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION '00483 edge_catalog_reader effective ACL is broader than approved';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_namespace AS n
     WHERE (
       has_schema_privilege('edge_rls_user', n.oid, 'USAGE')
       AND NOT has_schema_privilege('authenticated', n.oid, 'USAGE')
     ) OR (
       has_schema_privilege('edge_rls_user', n.oid, 'CREATE')
       AND NOT has_schema_privilege('authenticated', n.oid, 'CREATE')
     )
  ) OR EXISTS (
    SELECT 1
      FROM pg_class AS c
      CROSS JOIN LATERAL (
        VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
               ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
      ) AS privilege(name)
     WHERE has_table_privilege('edge_rls_user', c.oid, privilege.name)
       AND NOT has_table_privilege('authenticated', c.oid, privilege.name)
  ) OR EXISTS (
    SELECT 1
      FROM pg_class AS c
      CROSS JOIN LATERAL (VALUES ('USAGE'), ('SELECT'), ('UPDATE')) AS privilege(name)
     WHERE c.relkind = 'S'
       AND has_sequence_privilege('edge_rls_user', c.oid, privilege.name)
       AND NOT has_sequence_privilege('authenticated', c.oid, privilege.name)
  ) OR EXISTS (
    SELECT 1
      FROM pg_proc AS p
     WHERE has_function_privilege('edge_rls_user', p.oid, 'EXECUTE')
       AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION '00483 edge_rls_user is broader than authenticated';
  END IF;

  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF NOT has_function_privilege(role_name, 'auth.uid()', 'EXECUTE')
       OR NOT has_function_privilege(role_name, 'auth.jwt()', 'EXECUTE')
       OR NOT has_function_privilege(role_name, 'auth.role()', 'EXECUTE')
       OR NOT has_function_privilege(role_name, 'auth.email()', 'EXECUTE') THEN
      RAISE EXCEPTION '00483 auth helper grant missing for %', role_name;
    END IF;

    IF EXISTS (
      SELECT 1
        FROM pg_proc AS p
       WHERE p.pronamespace = 'storage'::regnamespace
         AND NOT has_function_privilege(role_name, p.oid, 'EXECUTE')
    ) THEN
      RAISE EXCEPTION '00483 storage compatibility grant missing for %', role_name;
    END IF;
  END LOOP;

  IF NOT has_function_privilege(
    'authenticated', 'realtime.topic()', 'EXECUTE'
  ) OR has_function_privilege(
    'anon', 'realtime.topic()', 'EXECUTE'
  ) OR has_function_privilege(
    'service_role', 'realtime.topic()', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION '00483 realtime.topic app-role ACL is wrong';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_proc AS p
      CROSS JOIN (VALUES
        ('anon'), ('authenticated'), ('service_role'),
        ('edge_catalog_reader'), ('edge_rls_user')
      ) AS generic_role(role_name)
     WHERE p.pronamespace = 'realtime'::regnamespace
       AND p.proname IN ('broadcast_changes', 'send')
       AND has_function_privilege(
         generic_role.role_name,
         p.oid,
         'EXECUTE'
       )
  ) THEN
    RAISE EXCEPTION
      '00483 restricted Realtime routine has a generic API/Edge caller';
  END IF;

  IF NOT has_function_privilege(
    'anon', 'extensions.gen_random_uuid()', 'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated', 'extensions.gen_random_uuid()', 'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role', 'extensions.gen_random_uuid()', 'EXECUTE'
  ) OR has_function_privilege(
    'anon', 'extensions.digest(bytea,text)', 'EXECUTE'
  ) OR has_function_privilege(
    'authenticated', 'extensions.digest(bytea,text)', 'EXECUTE'
  ) OR has_function_privilege(
    'authenticated', 'extensions.digest(text,text)', 'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role', 'extensions.digest(bytea,text)', 'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role', 'extensions.digest(text,text)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION '00483 refined extension app-role ACL is wrong';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_proc AS p
      CROSS JOIN (VALUES
        ('anon'), ('authenticated'), ('service_role')
      ) AS generic_role(role_name)
     WHERE p.pronamespace = 'extensions'::regnamespace
       AND has_function_privilege(
         generic_role.role_name,
         p.oid,
         'EXECUTE'
       )
       AND NOT (
         p.oid = 'extensions.gen_random_uuid()'::regprocedure
         OR (
           generic_role.role_name = 'service_role'
           AND p.oid IN (
             'extensions.digest(bytea,text)'::regprocedure,
             'extensions.digest(text,text)'::regprocedure
           )
         )
       )
  ) THEN
    RAISE EXCEPTION '00483 found an unreviewed extension app-role grant';
  END IF;

  IF NOT has_table_privilege(
    'dashboard_user', 'extensions.pg_stat_statements', 'SELECT'
  ) OR NOT has_table_privilege(
    'dashboard_user', 'extensions.pg_stat_statements_info', 'SELECT'
  ) OR NOT has_table_privilege(
    'postgres', 'net._http_response', 'SELECT'
  ) THEN
    RAISE EXCEPTION '00483 platform diagnostics relation grants are missing';
  END IF;

  FOREACH role_name IN ARRAY ARRAY[
    'anon', 'authenticated', 'service_role', 'postgres',
    'supabase_functions_admin'
  ]
  LOOP
    IF NOT has_function_privilege(
      role_name, 'net.http_get(text,jsonb,jsonb,integer)', 'EXECUTE'
    ) OR NOT has_function_privilege(
      role_name, 'net.http_post(text,jsonb,jsonb,jsonb,integer)', 'EXECUTE'
    ) THEN
      RAISE EXCEPTION '00483 pg_net approved grant missing for %', role_name;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
      FROM pg_proc AS p
      CROSS JOIN (VALUES
        ('anon'), ('authenticated'), ('service_role'),
        ('supabase_functions_admin')
      ) AS generic_role(role_name)
     WHERE p.pronamespace = 'net'::regnamespace
       AND has_function_privilege(
         generic_role.role_name,
         p.oid,
         'EXECUTE'
       )
       AND p.oid NOT IN (
         'net.http_get(text,jsonb,jsonb,integer)'::regprocedure,
         'net.http_post(text,jsonb,jsonb,jsonb,integer)'::regprocedure
       )
  ) THEN
    RAISE EXCEPTION '00483 found an unreviewed pg_net app-role grant';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_proc AS p
      CROSS JOIN LATERAL aclexplode(
        COALESCE(p.proacl, acldefault('f', p.proowner))
      ) AS acl
     WHERE p.oid IN (
       to_regprocedure('public.grant_role_to_user(uuid,character varying,uuid)'),
       to_regprocedure('public.revoke_role_from_user(uuid,character varying)')
     )
       AND acl.privilege_type = 'EXECUTE'
       AND acl.grantee NOT IN ('postgres'::regrole, 'service_role'::regrole)
  ) OR NOT has_function_privilege(
    'service_role',
    'public.grant_role_to_user(uuid,character varying,uuid)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.revoke_role_from_user(uuid,character varying)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION '00483 role-helper RPCs are not owner + service_role only';
  END IF;

  FOREACH owner_name IN ARRAY ARRAY[
    'postgres',
    'supabase_admin',
    'supabase_auth_admin',
    'supabase_functions_admin',
    'supabase_realtime_admin',
    'supabase_storage_admin'
  ]
  LOOP
    owner_oid := to_regrole(owner_name)::oid;

    IF EXISTS (
      SELECT 1
        FROM aclexplode(COALESCE(
          (
            SELECT d.defaclacl
              FROM pg_default_acl AS d
             WHERE d.defaclrole = owner_oid
               AND d.defaclnamespace = 0
               AND d.defaclobjtype = 'f'
          ),
          acldefault('f', owner_oid)
        )) AS acl
       WHERE acl.grantee = 0
         AND acl.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION
        '00483 owner % still has intrinsic PUBLIC routine defaults', owner_name;
    END IF;
  END LOOP;
END
$postconditions$;

COMMIT;
