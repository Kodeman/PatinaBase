-- Representative compatibility and sensitive-RPC regression checks for 00483.
-- Run as local postgres after the platform-owner artifact and migration reset.

BEGIN;

DELETE FROM public.user_roles AS ur
USING public.roles AS role
WHERE ur.role_id = role.id
  AND ur.user_id = 'cf100000-0000-4000-8000-000000000002'
  AND role.name IN ('independent_designer', 'super_admin');

SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims TO '{"role":"anon"}';

DO $$
BEGIN
  BEGIN
    PERFORM public.grant_role_to_user(
      'cf100000-0000-4000-8000-000000000002',
      'super_admin',
      'a0000000-0000-0000-0000-000000000001'
    );
    RAISE EXCEPTION 'anon unexpectedly invoked grant_role_to_user';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM public.revoke_role_from_user(
      'cf100000-0000-4000-8000-000000000002',
      'super_admin'
    );
    RAISE EXCEPTION 'anon unexpectedly invoked revoke_role_from_user';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$$;

DO $$
DECLARE
  result_count integer;
BEGIN
  SELECT count(*)
    INTO result_count
    FROM public.search_products(NULL, NULL, 1, 0, NULL, NULL, NULL, NULL);
  ASSERT result_count >= 0, 'anon public product RPC failed';
END
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub":"cf100000-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
BEGIN
  ASSERT auth.uid() = 'cf100000-0000-4000-8000-000000000001'::uuid,
    'authenticated auth.uid compatibility failed';

  BEGIN
    PERFORM public.grant_role_to_user(
      'cf100000-0000-4000-8000-000000000002',
      'super_admin',
      'a0000000-0000-0000-0000-000000000001'
    );
    RAISE EXCEPTION 'authenticated unexpectedly invoked grant_role_to_user';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM public.get_user_permissions(
      'cf100000-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'authenticated unexpectedly invoked get_user_permissions';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM public.revoke_role_from_user(
      'cf100000-0000-4000-8000-000000000002',
      'super_admin'
    );
    RAISE EXCEPTION 'authenticated unexpectedly invoked revoke_role_from_user';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$$;

RESET ROLE;
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims TO '{"role":"service_role"}';

DO $$
BEGIN
  BEGIN
    PERFORM public.grant_role_to_user(
      'cf100000-0000-4000-8000-000000000002',
      'independent_designer',
      NULL
    );
    RAISE EXCEPTION 'service_role grant accepted a missing actor';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM public.grant_role_to_user(
      'cf100000-0000-4000-8000-000000000002',
      'independent_designer',
      'cf100000-0000-4000-8000-000000000002'
    );
    RAISE EXCEPTION 'service_role grant accepted a non-admin actor';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  ASSERT public.grant_role_to_user(
    'cf100000-0000-4000-8000-000000000002',
    'independent_designer',
    'a0000000-0000-0000-0000-000000000001'
  ), 'service_role grant with the current admin actor failed';

  ASSERT EXISTS (
    SELECT 1
      FROM public.user_roles AS ur
      JOIN public.roles AS role ON role.id = ur.role_id
     WHERE ur.user_id = 'cf100000-0000-4000-8000-000000000002'
       AND role.name = 'independent_designer'
       AND ur.granted_by = 'a0000000-0000-0000-0000-000000000001'
  ), 'role grant did not preserve the verified admin actor';

  ASSERT public.revoke_role_from_user(
    'cf100000-0000-4000-8000-000000000002',
    'independent_designer'
  ), 'service_role revoke failed';

  ASSERT NOT EXISTS (
    SELECT 1
      FROM public.user_roles AS ur
      JOIN public.roles AS role ON role.id = ur.role_id
     WHERE ur.user_id = 'cf100000-0000-4000-8000-000000000002'
       AND role.name = 'independent_designer'
  ), 'service_role revoke left the role assignment behind';

  ASSERT public.get_user_permissions(
    'a0000000-0000-0000-0000-000000000001'
  ) IS NOT NULL, 'service_role permission lookup failed';

  PERFORM public.increment_campaign_counter(gen_random_uuid(), 'total_recipients');
  PERFORM public.increment_sequence_counter(gen_random_uuid(), 'total_emails_sent');
  PERFORM public.increment_bounce_count(gen_random_uuid());
END
$$;

DO $$
DECLARE
  request_id bigint;
BEGIN
  SELECT net.http_post(
    url := 'http://127.0.0.1:1/acl-compatibility-probe',
    headers := '{}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 1000
  ) INTO request_id;
  ASSERT request_id IS NOT NULL, 'service_role pg_net enqueue failed';
END
$$;

DO $$
BEGIN
  ASSERT has_schema_privilege('anon', 'auth', 'USAGE')
     AND has_schema_privilege('authenticated', 'auth', 'USAGE')
     AND has_function_privilege('authenticated', 'auth.uid()'::regprocedure, 'EXECUTE'),
    'Auth schema/function compatibility changed';

  ASSERT has_schema_privilege('service_role', 'storage', 'USAGE')
     AND has_table_privilege('service_role', 'storage.buckets', 'SELECT'),
    'Storage service-role compatibility changed';

  ASSERT has_schema_privilege('authenticated', 'realtime', 'USAGE')
     AND has_function_privilege(
       'authenticated', 'realtime.apply_rls(jsonb,integer)'::regprocedure, 'EXECUTE'
     ), 'Realtime authenticated compatibility changed';

  ASSERT has_schema_privilege('authenticated', 'extensions', 'USAGE'),
    'authenticated lost pgvector extension schema usage';

  ASSERT has_schema_privilege('service_role', 'net', 'USAGE'),
    'service_role lost pg_net schema usage';

  ASSERT (
    WITH expected(role_name, effective_temp) AS (
      SELECT expected.role_name, expected.effective_temp
        FROM (VALUES
          ('authenticator'::name, true),
          ('cli_login_postgres'::name, false),
          ('dashboard_user'::name, true),
          ('pgbouncer'::name, false),
          ('postgres'::name, true),
          ('supabase_admin'::name, true),
          ('supabase_auth_admin'::name, true),
          ('supabase_etl_admin'::name, true),
          ('supabase_functions_admin'::name, true),
          ('supabase_read_only_user'::name, true),
          ('supabase_realtime_admin'::name, true),
          ('supabase_replication_admin'::name, false),
          ('supabase_storage_admin'::name, true)
        ) AS expected(role_name, effective_temp)
        JOIN pg_roles AS role ON role.rolname = expected.role_name
       WHERE role.rolcanlogin
    ),
    actual(role_name, effective_temp) AS (
      SELECT role.rolname,
             has_database_privilege(role.rolname, current_database(), 'TEMP')
        FROM pg_roles AS role
       WHERE role.rolcanlogin
    )
    SELECT NOT EXISTS (
      (SELECT * FROM actual EXCEPT SELECT * FROM expected)
      UNION ALL
      (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    )
  ), 'LOGIN-role TEMP allowlist changed';
END
$$;

RESET ROLE;

DO $$
DECLARE
  target regprocedure;
  expected_search_path text;
  actual_owner name;
  actual_security_definer boolean;
  actual_config text[];
BEGIN
  FOR target, expected_search_path IN
    SELECT *
      FROM (VALUES
        (
          'public.grant_role_to_user(uuid,character varying,uuid)'::regprocedure,
          'search_path=""'::text
        ),
        (
          'public.revoke_role_from_user(uuid,character varying)'::regprocedure,
          'search_path=""'::text
        ),
        (
          'public.get_user_permissions(uuid)'::regprocedure,
          'search_path=public, pg_temp'::text
        ),
        (
          'public.invoke_edge_function(text,jsonb)'::regprocedure,
          'search_path=public, extensions, pg_temp'::text
        ),
        (
          'public.increment_campaign_counter(uuid,text)'::regprocedure,
          'search_path=public, pg_temp'::text
        ),
        (
          'public.increment_sequence_counter(uuid,text)'::regprocedure,
          'search_path=public, pg_temp'::text
        ),
        (
          'public.increment_bounce_count(uuid)'::regprocedure,
          'search_path=public, pg_temp'::text
        )
      ) AS expected(signature, search_path)
  LOOP
    SELECT pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
      INTO actual_owner, actual_security_definer, actual_config
      FROM pg_proc AS p
     WHERE p.oid = target;

    ASSERT actual_owner = 'postgres'
       AND actual_security_definer
       AND actual_config = ARRAY[expected_search_path],
      format('owner/SECURITY DEFINER/search_path changed for %s', target);

    ASSERT (
      WITH actual(grantee, privilege_type, is_grantable) AS (
        SELECT role.rolname, acl.privilege_type, acl.is_grantable
          FROM pg_proc AS p
          JOIN LATERAL aclexplode(
            COALESCE(p.proacl, acldefault('f', p.proowner))
          ) AS acl ON true
          JOIN pg_roles AS role ON role.oid = acl.grantee
         WHERE p.oid = target
      ),
      expected(grantee, privilege_type, is_grantable) AS (
        VALUES
          ('postgres'::name, 'EXECUTE'::text, false),
          ('service_role'::name, 'EXECUTE'::text, false)
      )
      SELECT NOT EXISTS (
        (SELECT * FROM actual EXCEPT SELECT * FROM expected)
        UNION ALL
        (SELECT * FROM expected EXCEPT SELECT * FROM actual)
      )
    ), format('service-only routine ACL differs from exact allow-list for %s', target);

    ASSERT NOT EXISTS (
      SELECT 1
        FROM pg_proc AS p
        JOIN LATERAL aclexplode(
          COALESCE(p.proacl, acldefault('f', p.proowner))
        ) AS acl ON true
       WHERE p.oid = target
         AND acl.grantee = 0
         AND acl.privilege_type = 'EXECUTE'
    ), format('PUBLIC retains EXECUTE on %s', target);
  END LOOP;
END
$$;

DO $$
BEGIN
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
    'public schema create/reachability boundary changed';

  ASSERT has_schema_privilege('postgres', 'cron', 'USAGE')
     AND has_table_privilege('postgres', 'cron.job', 'SELECT'),
    'pg_cron postgres compatibility changed';

  ASSERT NOT has_function_privilege(
    'anon', 'public.invoke_edge_function(text,jsonb)'::regprocedure, 'EXECUTE'
  ) AND NOT has_function_privilege(
    'authenticated', 'public.invoke_edge_function(text,jsonb)'::regprocedure, 'EXECUTE'
  ) AND has_function_privilege(
    'service_role', 'public.invoke_edge_function(text,jsonb)'::regprocedure, 'EXECUTE'
  ), 'service-only invoke_edge_function ACL changed';
END
$$;

ROLLBACK;

\echo 'edge_api/platform_compatibility_test.sql: all assertions passed'
