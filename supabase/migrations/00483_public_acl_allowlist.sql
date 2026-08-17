-- ═══════════════════════════════════════════════════════════════════════════
-- 00483 — PUBLIC ACL allow-list, ordinary migration phase
--
-- PostgreSQL's PUBLIC role is additive and cannot be denied per role. 00481's
-- edge_catalog_reader therefore cannot be least-privilege while PUBLIC owns
-- database TEMP or can execute application routines.
--
-- The Supabase migration principal (`postgres`) is deliberately not a
-- superuser and cannot change objects/defaults owned by the reserved
-- supabase_admin, supabase_auth_admin, or supabase_storage_admin roles. Those
-- changes live in the separately reviewed, idempotent platform-admin phase:
--   supabase/platform-admin/00483_public_acl_allowlist.sql
-- A local-only runner applies that phase after reset. Staging/production must
-- use an explicitly authorized platform administrator and must pass the same
-- effective-ACL conformance gate before any Edge login is provisioned.
--
-- This ordinary phase performs only changes for which its principal has real
-- authority. It never treats PostgreSQL's warning-only GRANT/REVOKE no-op as
-- success.
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $preflight$
DECLARE
  role_name text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION
      '00483 ordinary phase must run as postgres; got %', current_user;
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
    'supabase_functions_admin',
    'supabase_realtime_admin'
  ]
  LOOP
    IF to_regrole(role_name) IS NULL THEN
      RAISE EXCEPTION '00483 required role % is missing', role_name;
    END IF;
  END LOOP;

  IF NOT pg_has_role(current_user, 'postgres', 'SET')
     OR NOT pg_has_role(current_user, 'supabase_functions_admin', 'SET')
     OR NOT pg_has_role(current_user, 'supabase_realtime_admin', 'SET') THEN
    RAISE EXCEPTION
      '00483 migration principal % cannot harden the ordinary-phase owner defaults',
      current_user;
  END IF;

  IF (
    SELECT count(*) <> 1
        OR NOT bool_and(pg_get_userbyid(p.proowner) = 'postgres')
        OR NOT bool_and(p.prosecdef)
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'grant_role_to_user'
       AND p.oid = to_regprocedure(
         'public.grant_role_to_user(uuid,character varying,uuid)'
       )
  ) THEN
    RAISE EXCEPTION
      '00483 grant_role_to_user signature/owner/security contract drifted';
  END IF;

  IF (
    SELECT count(*) <> 1
        OR NOT bool_and(pg_get_userbyid(p.proowner) = 'postgres')
        OR NOT bool_and(p.prosecdef)
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'revoke_role_from_user'
       AND p.oid = to_regprocedure(
         'public.revoke_role_from_user(uuid,character varying)'
       )
  ) THEN
    RAISE EXCEPTION
      '00483 revoke_role_from_user signature/owner/security contract drifted';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE pg_get_userbyid(p.proowner) = 'postgres'
       AND n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND n.nspname NOT IN (
         '_realtime', 'app_private', 'extensions', 'public', 'storage',
         'svc_media', 'svc_orders', 'svc_projects', 'supabase_migrations'
       )
  ) THEN
    RAISE EXCEPTION
      '00483 found a postgres-owned routine in an unreviewed non-system schema';
  END IF;
END
$preflight$;

-- PUBLIC keeps CONNECT, but not scratch-table authority. The database owner
-- retains intrinsic TEMP and the pre-existing dashboard_user grant is left
-- untouched. No API or Edge capability role receives a named TEMP grant.
DO $database_acl$
BEGIN
  EXECUTE format(
    'REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC',
    current_database()
  );
END
$database_acl$;

-- PUBLIC schema USAGE is also additive. Replace it with the reviewed direct
-- role allow-list; pg_database_owner keeps its intrinsic owner rights.
REVOKE ALL PRIVILEGES ON SCHEMA public
FROM PUBLIC, anon, authenticated, service_role, postgres,
     agent_reader, agent_writer, edge_catalog_reader, dashboard_user;

GRANT USAGE ON SCHEMA public
TO anon, authenticated, service_role, postgres,
   agent_reader, agent_writer, edge_catalog_reader, dashboard_user;

-- These two unguarded definer-rights helpers are server-admin operations.
-- Keep the statements top-level so the generated local ACL seed replays the
-- narrowing after its legacy named-role baseline.
REVOKE EXECUTE ON FUNCTION
  public.grant_role_to_user(uuid, character varying, uuid),
  public.revoke_role_from_user(uuid, character varying)
FROM PUBLIC, anon, authenticated, dashboard_user,
     edge_catalog_reader, edge_rls_user;

GRANT EXECUTE ON FUNCTION
  public.grant_role_to_user(uuid, character varying, uuid),
  public.revoke_role_from_user(uuid, character varying)
TO service_role;

-- Remove any unexpected direct EXECUTE grantee from the two helpers. The
-- function owner is intrinsic and service_role is the sole named caller.
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

-- Revoke intrinsic PUBLIC EXECUTE only where this principal is the actual
-- owner. Reserved Supabase-owner objects are intentionally left for the
-- platform-admin phase; warning/no-op REVOKEs are never issued here.
DO $owned_routines$
DECLARE
  routine_identity regprocedure;
BEGIN
  FOR routine_identity IN
    SELECT p.oid::regprocedure
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE pg_get_userbyid(p.proowner) = current_user
       AND n.nspname !~ '^pg_'
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
$owned_routines$;

-- Private-by-default for every future routine created by an owner this
-- migration principal can lawfully SET. Existing named default ACLs remain.
DO $ordinary_defaults$
DECLARE
  owner_name text;
BEGIN
  FOREACH owner_name IN ARRAY ARRAY[
    'postgres',
    'supabase_functions_admin',
    'supabase_realtime_admin'
  ]
  LOOP
    IF NOT pg_has_role(current_user, owner_name, 'SET') THEN
      RAISE EXCEPTION
        '00483 lost SET authority for routine owner %', owner_name;
    END IF;

    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I '
      'REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',
      owner_name
    );
  END LOOP;
END
$ordinary_defaults$;

DO $postconditions$
DECLARE
  owner_name text;
  owner_oid oid;
  public_owned_remaining integer;
  schema_role_name text;
BEGIN
  IF (
    SELECT count(*) FILTER (WHERE acl.privilege_type = 'CONNECT') <> 1
        OR count(*) FILTER (WHERE acl.privilege_type <> 'CONNECT') <> 0
      FROM pg_database AS d
      CROSS JOIN LATERAL aclexplode(
        COALESCE(d.datacl, acldefault('d', d.datdba))
      ) AS acl
     WHERE d.datname = current_database()
       AND acl.grantee = 0
  ) THEN
    RAISE EXCEPTION
      '00483 database PUBLIC ACL is not CONNECT-only';
  END IF;

  IF NOT has_database_privilege('dashboard_user', current_database(), 'TEMPORARY')
     OR has_database_privilege('anon', current_database(), 'TEMPORARY')
     OR has_database_privilege('authenticated', current_database(), 'TEMPORARY')
     OR has_database_privilege('service_role', current_database(), 'TEMPORARY')
     OR has_database_privilege('edge_catalog_reader', current_database(), 'TEMPORARY')
     OR has_database_privilege('edge_rls_user', current_database(), 'TEMPORARY') THEN
    RAISE EXCEPTION
      '00483 database TEMP named-role allow-list is wrong';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_namespace AS n
      CROSS JOIN LATERAL aclexplode(
        COALESCE(n.nspacl, acldefault('n', n.nspowner))
      ) AS acl
     WHERE n.nspname = 'public'
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
    RAISE EXCEPTION '00483 public schema direct-role allow-list failed';
  END IF;

  FOREACH schema_role_name IN ARRAY ARRAY[
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
         AND acl.grantee = to_regrole(schema_role_name)::oid
         AND acl.privilege_type = 'USAGE'
    ) OR EXISTS (
      SELECT 1
        FROM pg_namespace AS n
        CROSS JOIN LATERAL aclexplode(
          COALESCE(n.nspacl, acldefault('n', n.nspowner))
        ) AS acl
       WHERE n.nspname = 'public'
         AND acl.grantee = to_regrole(schema_role_name)::oid
         AND acl.privilege_type <> 'USAGE'
    ) THEN
      RAISE EXCEPTION
        '00483 public schema direct grant is wrong for %', schema_role_name;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(
        COALESCE(p.proacl, acldefault('f', p.proowner))
      ) AS acl
     WHERE pg_get_userbyid(p.proowner) = current_user
       AND n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND acl.grantee = 0
       AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      '00483 left PUBLIC EXECUTE on a migration-owned non-system routine';
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
    RAISE EXCEPTION
      '00483 role-helper RPCs are not owner + service_role only';
  END IF;

  FOREACH owner_name IN ARRAY ARRAY[
    'postgres',
    'supabase_functions_admin',
    'supabase_realtime_admin'
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

  SELECT count(*)
    INTO public_owned_remaining
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
   WHERE n.nspname !~ '^pg_'
     AND n.nspname <> 'information_schema'
     AND EXISTS (
       SELECT 1
         FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
        WHERE acl.grantee = 0
          AND acl.privilege_type = 'EXECUTE'
     );

  IF public_owned_remaining > 0 THEN
    RAISE NOTICE
      '00483 ordinary phase complete; % platform-phase PUBLIC routines remain blocked pending the mandatory platform-admin phase',
      public_owned_remaining;
  END IF;
END
$postconditions$;

COMMIT;
