-- Supabase platform ACL compatibility after the 00483 PUBLIC lockdown.
-- Run locally after a full reset:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 \
--     -f supabase/tests/edge_api/platform_acl_compatibility_test.sql
--
-- There is no privileged second phase to run first; the platform-admin artifact
-- was retired as unrunnable on Supabase Cloud. See the $public_lockdown$ block
-- below for what replaced its assertions.
--
-- This is the named, DIAGNOSTIC companion to the aggregate-only remote gate.
-- It is NOT a provisioning gate and nothing blocks on it. It is read-only:
-- platform functions are inspected, never invoked, because several are
-- mutating administrative or trigger routines. The \ir below creates
-- session-local temporary objects only, before the read-only transaction opens.
--
-- ⚠ EXPECTED-RED, measured 2026-08-17 on a fresh local reset: 6 of the 14 DO
-- blocks pass, 8 fail. The two blocks re-scoped under Kody's PUBLIC-residual
-- ruling ($public_lockdown$, $platform_schema_usage$) pass. The other eight
-- assert the END STATE OF THE RETIRED PRIVILEGED PHASE and cannot be satisfied
-- by the ordinary `postgres` principal:
--
--   $auth_helpers$        named EXECUTE on auth.uid/role/email/jwt — auth is
--                         owned by supabase_auth_admin
--   $storage_routines$    named EXECUTE on storage routines — supabase_storage_admin
--   $extension_helpers$   named EXECUTE on extensions.gen_random_uuid() etc.
--   $cron_routines$       "no generic role may execute" — true only via PUBLIC
--   $graphql_routines$    same, for graphql_public
--   $realtime_routines$   same, for realtime.topic()
--   $net_contract$        same, for internal pg_net routines
--   $public_rpc_surface$  drift baselines (>=310/597/635 named grants) recorded
--                         against a database that had the privileged phase
--                         applied; this database measures 294/591/612
--
-- Re-scoping those eight is a separate, un-ruled piece of work. Until it is
-- done, read this file's output per block, not as a pass/fail.

\set ON_ERROR_STOP on

\ir public_acl_exception_registry.sql

BEGIN READ ONLY;

DO $platform_roles$
DECLARE
  required_roles constant text[] := ARRAY[
    'anon',
    'authenticated',
    'service_role',
    'postgres',
    'dashboard_user',
    'supabase_admin',
    'supabase_auth_admin',
    'supabase_storage_admin',
    'supabase_functions_admin',
    'supabase_realtime_admin',
    'agent_reader',
    'agent_writer',
    'edge_catalog_reader',
    'edge_rls_user'
  ];
BEGIN
  ASSERT (
    SELECT count(*) = cardinality(required_roles)
    FROM pg_roles
    WHERE rolname = ANY(required_roles)
  ), 'required platform or edge role is missing';

  ASSERT (
    SELECT count(*) FILTER (
             WHERE acl.grantee = 0 AND acl.privilege_type = 'CONNECT'
           ) = 1
       AND count(*) FILTER (
             WHERE acl.grantee = 0 AND acl.privilege_type <> 'CONNECT'
           ) = 0
    FROM pg_database AS d
    CROSS JOIN LATERAL aclexplode(
      COALESCE(d.datacl, acldefault('d', d.datdba))
    ) AS acl
    WHERE d.datname = current_database()
  ), 'PUBLIC must retain only CONNECT on the current database';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_roles AS role
    CROSS JOIN pg_database AS database
    WHERE database.datname = current_database()
      AND role.rolname IN (
        'anon', 'authenticated', 'service_role',
        'edge_catalog_reader', 'edge_rls_user'
      )
      AND (
        has_database_privilege(role.oid, database.oid, 'TEMP')
        OR has_database_privilege(role.oid, database.oid, 'CREATE')
      )
  ), 'application and edge roles must not have database TEMP or CREATE';

  ASSERT (
    WITH expected(role_name) AS (
      SELECT owner.rolname
      FROM pg_database AS d
      JOIN pg_roles AS owner ON owner.oid = d.datdba
      WHERE d.datname = current_database()
      UNION
      SELECT 'dashboard_user'
      WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dashboard_user')
    ),
    actual AS (
      SELECT role.rolname AS role_name
      FROM pg_database AS d
      CROSS JOIN LATERAL aclexplode(
        COALESCE(d.datacl, acldefault('d', d.datdba))
      ) AS acl
      JOIN pg_roles AS role ON role.oid = acl.grantee
      WHERE d.datname = current_database()
        AND acl.privilege_type = 'TEMPORARY'
    )
    SELECT NOT EXISTS (
      (SELECT role_name FROM expected EXCEPT SELECT role_name FROM actual)
      UNION ALL
      (SELECT role_name FROM actual EXCEPT SELECT role_name FROM expected)
    )
  ), 'database TEMP grants differ from the reviewed platform-login allow-list';
END
$platform_roles$;

-- ── PUBLIC residual, re-scoped to what this principal can actually assert ──
--
-- This block used to assert that PUBLIC held ZERO non-system schema, relation,
-- sequence, column and routine privileges. That is unreachable on Supabase
-- Cloud: schema `net`, its two tables, its sequence and its twelve routines are
-- owned by supabase_admin, `postgres` is rolsuper = false and cannot become
-- supabase_admin, and the platform-admin script that was supposed to close them
-- was retired as unrunnable through any customer channel. The assertions were
-- therefore red by construction, which is how a mandatory gate turns into a
-- waived one.
--
-- What replaces them is the same predicate the two conformance gates assert:
-- PUBLIC privileges are counted only where PUBLIC can enter the schema, and
-- only when they are not an exact, signed row in the exception registry.
-- Sources: supabase/tests/edge_api/public_acl_exception_registry.sql and
-- docs/engineering/public-acl-residual-census.md.
DO $public_lockdown$
DECLARE
  unregistered_public_grants integer;
  out_of_band_reachable integer;
  public_writable_relations integer;
BEGIN
  SELECT count(*) INTO unregistered_public_grants
    FROM public_acl_public_grant_finding;
  ASSERT unregistered_public_grants = 0,
    'PUBLIC holds a reachable schema, relation, sequence or column privilege that is not a signed registry exception';

  SELECT
    count(*) FILTER (WHERE invariant = 'A'),
    count(*) FILTER (WHERE invariant = 'B')
    INTO out_of_band_reachable, public_writable_relations
    FROM public_acl_capability_findings;
  ASSERT out_of_band_reachable = 0,
    'a PUBLIC-reachable routine can act outside the caller privilege and is not a signed registry exception';
  ASSERT public_writable_relations = 0,
    'a PUBLIC-writable relation is reachable and is not a signed registry exception';
END
$public_lockdown$;

DO $platform_schema_usage$
BEGIN
  ASSERT (
    WITH expected(role_name) AS (
      SELECT *
      FROM unnest(ARRAY[
        'anon',
        'authenticated',
        'service_role',
        'postgres',
        'agent_reader',
        'agent_writer',
        'edge_catalog_reader',
        'dashboard_user'
      ]::text[])
      UNION
      SELECT owner.rolname
      FROM pg_namespace AS n
      JOIN pg_roles AS owner ON owner.oid = n.nspowner
      WHERE n.nspname = 'public'
    ),
    actual(role_name) AS (
      SELECT role.rolname
      FROM pg_namespace AS n
      CROSS JOIN LATERAL aclexplode(
        COALESCE(n.nspacl, acldefault('n', n.nspowner))
      ) AS acl
      JOIN pg_roles AS role ON role.oid = acl.grantee
      WHERE n.nspname = 'public'
        AND acl.privilege_type = 'USAGE'
    )
    SELECT NOT EXISTS (
      (SELECT role_name FROM expected EXCEPT SELECT role_name FROM actual)
      UNION ALL
      (SELECT role_name FROM actual EXCEPT SELECT role_name FROM expected)
    )
  ), 'public schema USAGE differs from the named role allow-list';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_namespace AS n
    CROSS JOIN LATERAL aclexplode(
      COALESCE(n.nspacl, acldefault('n', n.nspowner))
    ) AS acl
    WHERE n.nspname = 'public'
      AND acl.privilege_type = 'CREATE'
      AND acl.grantee <> n.nspowner
  ), 'a non-owner role can CREATE in the public schema';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM (VALUES
      ('public', 'anon'),
      ('public', 'authenticated'),
      ('public', 'service_role'),
      ('public', 'edge_catalog_reader'),
      ('auth', 'anon'),
      ('auth', 'authenticated'),
      ('auth', 'service_role'),
      ('storage', 'anon'),
      ('storage', 'authenticated'),
      ('storage', 'service_role'),
      ('realtime', 'anon'),
      ('realtime', 'authenticated'),
      ('realtime', 'service_role'),
      ('graphql', 'anon'),
      ('graphql', 'authenticated'),
      ('graphql', 'service_role'),
      ('graphql_public', 'anon'),
      ('graphql_public', 'authenticated'),
      ('graphql_public', 'service_role'),
      ('extensions', 'anon'),
      ('extensions', 'authenticated'),
      ('extensions', 'service_role'),
      ('net', 'anon'),
      ('net', 'authenticated'),
      ('net', 'service_role'),
      ('net', 'supabase_functions_admin'),
      ('cron', 'postgres')
    ) AS required(schema_name, role_name)
    WHERE NOT has_schema_privilege(
      required.role_name, required.schema_name, 'USAGE'
    )
  ), 'a required platform role cannot use its helper schema';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_namespace AS n
    WHERE n.nspname <> 'public'
      AND n.nspname !~ '^pg_'
      AND n.nspname <> 'information_schema'
      AND (
        has_schema_privilege('edge_catalog_reader', n.oid, 'USAGE')
        OR has_schema_privilege('edge_rls_user', n.oid, 'USAGE')
      )
      -- A schema whose PUBLIC USAGE is a signed registry exception reaches
      -- every role, the edge roles included. That is the accepted residual,
      -- not a grant made to these roles; the objects inside it are covered by
      -- $public_lockdown$ above.
      AND NOT EXISTS (
        SELECT 1 FROM public_acl_exception_registry AS x
         WHERE x.kind = 'schema'
           AND x.schema_name = n.nspname
           AND x.object_signature = n.nspname
      )
  ), 'an edge capability role can use a non-public helper schema';
END
$platform_schema_usage$;

DO $auth_helpers$
DECLARE
  expected_roles constant text[] := ARRAY[
    'anon', 'authenticated', 'service_role'
  ];
BEGIN
  ASSERT (
    SELECT count(*) = 4
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth'
      AND p.proname = ANY(ARRAY['uid', 'role', 'email', 'jwt'])
      AND p.pronargs = 0
  ), 'the four required Auth/RLS helpers are not present';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    CROSS JOIN unnest(expected_roles) AS expected(role_name)
    JOIN pg_roles AS role ON role.rolname = expected.role_name
    WHERE n.nspname = 'auth'
      AND p.proname = ANY(ARRAY['uid', 'role', 'email', 'jwt'])
      AND p.pronargs = 0
      AND NOT EXISTS (
        SELECT 1
        FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
        WHERE acl.grantee = role.oid
          AND acl.privilege_type = 'EXECUTE'
      )
  ), 'an Auth/RLS helper is missing a required named EXECUTE grant';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth'
      AND p.proname = ANY(ARRAY['uid', 'role', 'email', 'jwt'])
      AND p.pronargs = 0
      AND (
        has_function_privilege('edge_catalog_reader', p.oid, 'EXECUTE')
        OR has_function_privilege('edge_rls_user', p.oid, 'EXECUTE')
      )
  ), 'an edge capability role can execute an Auth/RLS helper';
END
$auth_helpers$;

DO $public_rpc_surface$
BEGIN
  -- These aggregate baselines are drift signals for the broad generated RPC
  -- grant surface. They deliberately exclude the two role-management helpers
  -- removed from anon/authenticated by the ACL allow-list. The signatures
  -- below are high-risk caller sentinels across anonymous sharing/catalog,
  -- authenticated workflows, and service-only queue/marketplace operations.
  ASSERT (
    SELECT count(DISTINCT p.oid) >= 310
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(p.proacl, acldefault('f', p.proowner))
    ) AS acl
    WHERE n.nspname = 'public'
      AND acl.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'anon')
      AND acl.privilege_type = 'EXECUTE'
  ), 'the audited anon public-RPC surface lost named EXECUTE grants';

  ASSERT (
    SELECT count(DISTINCT p.oid) >= 597
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(p.proacl, acldefault('f', p.proowner))
    ) AS acl
    WHERE n.nspname = 'public'
      AND acl.grantee = (
        SELECT oid FROM pg_roles WHERE rolname = 'authenticated'
      )
      AND acl.privilege_type = 'EXECUTE'
  ), 'the audited authenticated public-RPC surface lost named EXECUTE grants';

  ASSERT (
    SELECT count(DISTINCT p.oid) >= 635
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(p.proacl, acldefault('f', p.proowner))
    ) AS acl
    WHERE n.nspname = 'public'
      AND acl.grantee = (
        SELECT oid FROM pg_roles WHERE rolname = 'service_role'
      )
      AND acl.privilege_type = 'EXECUTE'
  ), 'the audited service public-RPC surface lost named EXECUTE grants';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.resolve_board_share(text)', 'anon'),
      (
        'public.search_products(text,text,integer,integer,text,text,integer,integer)',
        'anon'
      ),
      ('public.find_products_similar_to(uuid,integer)', 'anon'),
      ('public.accept_workspace_invitation(text)', 'authenticated'),
      ('public.aesthete_search(text,jsonb)', 'authenticated'),
      (
        'public.create_board_share(uuid,text,timestamp with time zone,boolean)',
        'authenticated'
      ),
      ('public.create_direct_order(uuid,integer)', 'authenticated'),
      ('public.get_user_permissions(uuid)', 'authenticated'),
      ('public.resolve_document_share(text)', 'authenticated'),
      ('public.resolve_field_link(text)', 'authenticated'),
      ('public.resolve_spec_book_share(text)', 'authenticated'),
      ('public.resolve_trade_rfq_link(text)', 'authenticated'),
      ('public.rpc_start_direct_thread(uuid)', 'authenticated'),
      (
        'public.claim_agent_tasks(text[],integer,text,interval)',
        'service_role'
      ),
      (
        'public.complete_agent_task(uuid,text,jsonb,numeric,text,boolean,text)',
        'service_role'
      ),
      (
        'public.enqueue_agent_task(text,jsonb,text,integer,text,text,uuid,text,timestamp with time zone,integer,text,text,text,uuid,numeric,jsonb,text)',
        'service_role'
      ),
      ('public.get_marketplace_vitals()', 'service_role'),
      (
        'public.submit_trade_rfq_response(text,integer,text)',
        'service_role'
      )
    ) AS required(signature, role_name)
    LEFT JOIN pg_roles AS role ON role.rolname = required.role_name
    LEFT JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(required.signature)
    WHERE CASE
      WHEN role.oid IS NULL OR routine.oid IS NULL THEN true
      ELSE NOT EXISTS (
        SELECT 1
        FROM aclexplode(
          COALESCE(
            routine.proacl,
            acldefault('f', routine.proowner)
          )
        ) AS acl
        WHERE acl.grantee = role.oid
          AND acl.privilege_type = 'EXECUTE'
      )
    END
  ), 'a high-risk public RPC caller lost its direct named EXECUTE grant';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (
        has_function_privilege('edge_catalog_reader', p.oid, 'EXECUTE')
        OR has_function_privilege('edge_rls_user', p.oid, 'EXECUTE')
      )
  ), 'an edge capability role can execute a public application RPC directly';
END
$public_rpc_surface$;

DO $role_helpers$
BEGIN
  ASSERT (
    SELECT count(*) = 2 AND bool_and(p.proowner = owner.oid)
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    CROSS JOIN pg_roles AS owner
    WHERE n.nspname = 'public'
      AND owner.rolname = 'postgres'
      AND p.oid IN (
        to_regprocedure(
          'public.grant_role_to_user(uuid,character varying,uuid)'
        ),
        to_regprocedure(
          'public.revoke_role_from_user(uuid,character varying)'
        )
      )
  ), 'role-management helper inventory or ownership is wrong';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'public.grant_role_to_user(uuid,character varying,uuid)',
      'public.revoke_role_from_user(uuid,character varying)'
    ]::text[]) AS helper(signature)
    WHERE NOT has_function_privilege(
      'service_role', helper.signature, 'EXECUTE'
    )
  ), 'service_role lost a role-management helper EXECUTE grant';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(p.proacl, acldefault('f', p.proowner))
    ) AS acl
    WHERE n.nspname = 'public'
      AND p.oid IN (
        to_regprocedure(
          'public.grant_role_to_user(uuid,character varying,uuid)'
        ),
        to_regprocedure(
          'public.revoke_role_from_user(uuid,character varying)'
        )
      )
      AND acl.privilege_type = 'EXECUTE'
      AND acl.grantee NOT IN (
        p.proowner,
        (SELECT oid FROM pg_roles WHERE rolname = 'service_role')
      )
  ), 'a role-management helper is executable outside service_role and its owner';
END
$role_helpers$;

DO $storage_routines$
DECLARE
  expected_roles constant text[] := ARRAY[
    'anon', 'authenticated', 'service_role'
  ];
BEGIN
  -- All-routine grants are a conservative compatibility boundary for the
  -- external Storage service binary. Repository RLS directly proves
  -- foldername(text); the service may depend on helpers without SQL callers.
  ASSERT (
    SELECT count(*) > 0
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'storage'
  ), 'Storage routine inventory is empty';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    CROSS JOIN unnest(expected_roles) AS expected(role_name)
    JOIN pg_roles AS role ON role.rolname = expected.role_name
    WHERE n.nspname = 'storage'
      AND NOT EXISTS (
        SELECT 1
        FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
        WHERE acl.grantee = role.oid
          AND acl.privilege_type = 'EXECUTE'
      )
  ), 'a Storage routine is missing a required named EXECUTE grant';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'storage'
      AND (
        has_function_privilege('edge_catalog_reader', p.oid, 'EXECUTE')
        OR has_function_privilege('edge_rls_user', p.oid, 'EXECUTE')
      )
  ), 'an edge capability role can execute a Storage routine';
END
$storage_routines$;

DO $realtime_routines$
DECLARE
  existing_app_routines constant text[] := ARRAY[
    'cast',
    'apply_rls',
    'build_prepared_statement_sql',
    'check_equality_op',
    'is_visible_through_filters',
    'list_changes',
    'quote_wal2json',
    'subscription_check_filters',
    'to_regrole'
  ];
  existing_app_roles constant text[] := ARRAY[
    'anon', 'authenticated', 'service_role'
  ];
BEGIN
  ASSERT (
    SELECT count(*) = 12
       AND count(DISTINCT p.proname) = 12
       AND bool_and(
         p.proname = ANY(
           existing_app_routines
           || ARRAY['topic', 'broadcast_changes', 'send']::text[]
         )
       )
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'realtime'
  ), 'Realtime routine inventory drifted from the reviewed 12-routine surface';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    CROSS JOIN unnest(existing_app_roles) AS expected(role_name)
    JOIN pg_roles AS role ON role.rolname = expected.role_name
    WHERE n.nspname = 'realtime'
      AND p.proname = ANY(existing_app_routines)
      AND NOT EXISTS (
        SELECT 1
        FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
        WHERE acl.grantee = role.oid
          AND acl.privilege_type = 'EXECUTE'
      )
  ), 'an existing Realtime app helper lost a required named EXECUTE grant';

  ASSERT has_function_privilege(
    'authenticated', 'realtime.topic()', 'EXECUTE'
  ), 'authenticated lost the Realtime topic() helper required by RLS policies';
  ASSERT NOT has_function_privilege('anon', 'realtime.topic()', 'EXECUTE')
     AND NOT has_function_privilege('service_role', 'realtime.topic()', 'EXECUTE'),
    'Realtime topic() widened beyond authenticated and platform-admin roles';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    CROSS JOIN unnest(ARRAY[
      'anon', 'authenticated', 'service_role',
      'edge_catalog_reader', 'edge_rls_user'
    ]::text[]) AS denied(role_name)
    WHERE n.nspname = 'realtime'
      AND p.proname IN ('broadcast_changes', 'send')
      AND has_function_privilege(denied.role_name, p.oid, 'EXECUTE')
  ), 'Realtime broadcast/send helpers widened to a generic application or edge role';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'realtime'
      AND (
        has_function_privilege('edge_catalog_reader', p.oid, 'EXECUTE')
        OR has_function_privilege('edge_rls_user', p.oid, 'EXECUTE')
      )
  ), 'an edge capability role can execute a Realtime routine';
END
$realtime_routines$;

DO $graphql_routines$
DECLARE
  expected_roles constant text[] := ARRAY[
    'anon', 'authenticated', 'service_role', 'postgres'
  ];
BEGIN
  ASSERT (
    SELECT count(*) > 0
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('graphql', 'graphql_public')
  ), 'GraphQL routine inventory is empty';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    CROSS JOIN unnest(expected_roles) AS expected(role_name)
    JOIN pg_roles AS role ON role.rolname = expected.role_name
    WHERE n.nspname IN ('graphql', 'graphql_public')
      AND NOT EXISTS (
        SELECT 1
        FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
        WHERE acl.grantee = role.oid
          AND acl.privilege_type = 'EXECUTE'
      )
  ), 'a GraphQL routine is missing a required named EXECUTE grant';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('graphql', 'graphql_public')
      AND (
        has_function_privilege('edge_catalog_reader', p.oid, 'EXECUTE')
        OR has_function_privilege('edge_rls_user', p.oid, 'EXECUTE')
      )
  ), 'an edge capability role can execute a GraphQL routine';
END
$graphql_routines$;

DO $cron_routines$
DECLARE
  expected_roles constant text[] := ARRAY['postgres'];
BEGIN
  ASSERT (
    SELECT count(*) > 0
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'cron'
  ), 'cron routine inventory is empty';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'cron'
      AND NOT EXISTS (
        SELECT 1
        FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
        WHERE acl.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'postgres')
          AND acl.privilege_type = 'EXECUTE'
      )
  ), 'a cron routine is missing its named postgres EXECUTE grant';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    CROSS JOIN unnest(ARRAY[
      'anon', 'authenticated', 'service_role',
      'edge_catalog_reader', 'edge_rls_user'
    ]::text[]) AS denied(role_name)
    WHERE n.nspname = 'cron'
      AND has_function_privilege(denied.role_name, p.oid, 'EXECUTE')
  ), 'a cron routine is executable by a generic application or edge role';
END
$cron_routines$;

DO $net_contract$
DECLARE
  endpoint_roles constant text[] := ARRAY[
    'anon', 'authenticated', 'service_role', 'postgres',
    'supabase_functions_admin'
  ];
BEGIN
  ASSERT (
    SELECT count(*) = 12
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'net'
  ), 'pg_net routine inventory is empty';

  ASSERT (
    SELECT count(*) = 2
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'net'
      AND p.proname IN ('http_get', 'http_post')
  ), 'pg_net HTTP endpoint routine inventory is incomplete';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    CROSS JOIN unnest(endpoint_roles) AS expected(role_name)
    JOIN pg_roles AS role ON role.rolname = expected.role_name
    WHERE n.nspname = 'net'
      AND p.proname IN ('http_get', 'http_post')
      AND NOT EXISTS (
        SELECT 1
        FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
        WHERE acl.grantee = role.oid
          AND acl.privilege_type = 'EXECUTE'
      )
  ), 'a pg_net HTTP endpoint is missing a required named EXECUTE grant';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(p.proacl, acldefault('f', p.proowner))
    ) AS acl
    WHERE n.nspname = 'net'
      AND p.proname IN ('http_get', 'http_post')
      AND acl.privilege_type = 'EXECUTE'
      AND acl.grantee <> p.proowner
      AND acl.grantee NOT IN (
        SELECT oid FROM pg_roles WHERE rolname = ANY(endpoint_roles)
      )
  ), 'a pg_net HTTP endpoint grants EXECUTE outside its named-role allow-list';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(p.proacl, acldefault('f', p.proowner))
    ) AS acl
    WHERE n.nspname = 'net'
      AND p.proname NOT IN ('http_get', 'http_post')
      AND acl.privilege_type = 'EXECUTE'
      AND acl.grantee <> p.proowner
  ), 'an internal pg_net routine is executable by a non-owner role';

  ASSERT has_table_privilege(
    'postgres', 'net._http_response', 'SELECT'
  ), 'postgres lost the required pg_net response read grant';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(
        c.relacl,
        acldefault(
          (CASE WHEN c.relkind = 'S' THEN 'S' ELSE 'r' END)::"char",
          c.relowner
        )
      )
    ) AS acl
    WHERE n.nspname = 'net'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
      AND acl.grantee <> c.relowner
      AND NOT (
        c.relname = '_http_response'
        AND c.relkind <> 'S'
        AND acl.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'postgres')
        AND acl.privilege_type = 'SELECT'
      )
  ), 'pg_net relations or sequence grant privileges outside the reviewed surface';
END
$net_contract$;

DO $extension_helpers$
BEGIN
  ASSERT (
    SELECT count(*) > 0
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'extensions'
  ), 'extension helper inventory is empty';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS expected(role_name)
    JOIN pg_roles AS role ON role.rolname = expected.role_name
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_proc AS p
      CROSS JOIN LATERAL aclexplode(
        COALESCE(p.proacl, acldefault('f', p.proowner))
      ) AS acl
      WHERE p.oid = to_regprocedure('extensions.gen_random_uuid()')
        AND acl.grantee = role.oid
        AND acl.privilege_type = 'EXECUTE'
    )
  ), 'gen_random_uuid() is missing a required application-role EXECUTE grant';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY['service_role']) AS expected(role_name)
    JOIN pg_roles AS role ON role.rolname = expected.role_name
    CROSS JOIN unnest(ARRAY[
      'extensions.digest(bytea,text)',
      'extensions.digest(text,text)'
    ]::text[]) AS item(signature)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_proc AS p
      CROSS JOIN LATERAL aclexplode(
        COALESCE(p.proacl, acldefault('f', p.proowner))
      ) AS acl
      WHERE p.oid = to_regprocedure(item.signature)
        AND acl.grantee = role.oid
        AND acl.privilege_type = 'EXECUTE'
    )
  ), 'an application digest helper is missing a required named EXECUTE grant';

  -- Only service_role has repository-proven digest callers. Generic app and
  -- edge roles remain excluded from both overloads.
  ASSERT NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY['anon', 'authenticated']) AS denied(role_name)
    CROSS JOIN unnest(ARRAY[
      'extensions.digest(bytea,text)',
      'extensions.digest(text,text)'
    ]::text[]) AS item(signature)
    WHERE has_function_privilege(
      denied.role_name, item.signature, 'EXECUTE'
    )
  ), 'digest helpers widened beyond service_role';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    CROSS JOIN unnest(ARRAY[
      'anon', 'authenticated', 'service_role'
    ]::text[]) AS app_role(role_name)
    WHERE n.nspname = 'extensions'
      AND has_function_privilege(app_role.role_name, p.oid, 'EXECUTE')
      AND NOT (
        p.proname = 'gen_random_uuid'
        AND p.pronargs = 0
      )
      AND NOT (
        p.proname = 'digest'
        AND pg_get_function_identity_arguments(p.oid) IN ('bytea, text', 'text, text')
        AND app_role.role_name = 'service_role'
      )
  ), 'an extension helper widened beyond the reviewed application-role surface';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'extensions'
      AND (
        has_function_privilege('edge_catalog_reader', p.oid, 'EXECUTE')
        OR has_function_privilege('edge_rls_user', p.oid, 'EXECUTE')
      )
  ), 'an edge capability role can execute an extension helper';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY['pg_stat_statements', 'pg_stat_statements_info']) AS view_name
    CROSS JOIN unnest(ARRAY['dashboard_user', 'postgres']) AS role_name
    WHERE NOT has_table_privilege(
      role_name,
      format('extensions.%I', view_name),
      'SELECT'
    )
  ), 'a pg_stat view is missing a required dashboard/postgres SELECT grant';

  -- dashboard_user access is Studio/platform compatibility, not an app caller
  -- requirement; postgres retains owner/operational parity.

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(c.relacl, acldefault('r', c.relowner))
    ) AS acl
    WHERE n.nspname = 'extensions'
      AND c.relname IN ('pg_stat_statements', 'pg_stat_statements_info')
      AND acl.grantee <> c.relowner
      AND acl.grantee NOT IN (
        SELECT oid
        FROM pg_roles
        WHERE rolname IN ('dashboard_user', 'postgres')
      )
  ), 'a pg_stat view grants relation access outside dashboard/postgres';
END
$extension_helpers$;

DO $service_triggers$
DECLARE
  service_schema text;
  expected_triggers integer;
  function_oid oid;
  function_owner oid;
BEGIN
  FOR service_schema, expected_triggers IN
    SELECT *
    FROM (VALUES
      ('svc_media'::text, 4),
      ('svc_orders'::text, 8),
      ('svc_projects'::text, 14)
    ) AS expected(schema_name, minimum_triggers)
  LOOP
    SELECT p.oid, p.proowner
      INTO STRICT function_oid, function_owner
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = service_schema
      AND p.proname = 'set_updated_at'
      AND p.pronargs = 0;

    ASSERT (
      SELECT count(*) >= expected_triggers AND bool_and(t.tgenabled <> 'D')
      FROM pg_trigger AS t
      WHERE t.tgfoid = function_oid
        AND NOT t.tgisinternal
    ), format('%s trigger coverage is missing or disabled', service_schema);

    ASSERT NOT EXISTS (
      SELECT 1
      FROM aclexplode(
        COALESCE(
          (SELECT proacl FROM pg_proc WHERE oid = function_oid),
          acldefault('f', function_owner)
        )
      ) AS acl
      WHERE acl.privilege_type = 'EXECUTE'
        AND acl.grantee <> function_owner
    ), format('%s trigger helper is executable by a non-owner role', service_schema);
  END LOOP;
END
$service_triggers$;

DO $default_privileges$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_default_acl AS d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) AS acl
    WHERE acl.grantee = 0
  ), 'a default ACL explicitly grants a future privilege to PUBLIC';

  -- EXPECTED-RED, permanently. Three of the six owners below cannot be
  -- hardened: ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin /
  -- supabase_auth_admin / supabase_storage_admin needs membership in that role,
  -- which `postgres` does not hold on Supabase Cloud and cannot grant itself,
  -- and the privileged runner that once did it is deleted as unrunnable. The
  -- three owners 00483 CAN set are asserted by the two conformance gates; this
  -- assertion is kept unmodified as the standing record of what the platform
  -- still owes. Current routines are independently covered by
  -- $public_lockdown$ above, so a later platform upgrade that ships a PUBLIC
  -- default reopens provisioning immediately through those gates.
  ASSERT NOT EXISTS (
    SELECT 1
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
       )
  ), 'a platform routine owner lacks future-function PUBLIC EXECUTE hardening';
END
$default_privileges$;

ROLLBACK;

\echo 'edge_api/platform_acl_compatibility_test.sql: all platform ACL assertions passed'
