-- ═══════════════════════════════════════════════════════════════════════════
-- 00483 — Edge catalog PUBLIC-ACL boundary
--
-- 00482 is reserved by the concurrent retained-service authorization contract
-- on the same Cloudflare Phase 1 integration target.
--
-- Moves the cacheable catalog projection out of public, removes database
-- TEMP and public-schema reachability inherited through PUBLIC, and converts
-- legacy application routine execution from an implicit PUBLIC grant to the
-- same explicit Supabase application roles. Platform-owned pg_net ACLs are
-- reconciled separately by supabase/platform-admin/00483_platform_public_acl.sql;
-- its owner-level preflight is mandatory before any edge LOGIN is provisioned.
--
-- Function lineage:
--   grant_role_to_user: 00023 → 00483
--   revoke_role_from_user: 00023 → 00483
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  role_name text;
BEGIN
  EXECUTE format(
    'REVOKE CREATE, TEMPORARY ON DATABASE %I FROM PUBLIC',
    current_database()
  );

  FOREACH role_name IN ARRAY ARRAY[
    'postgres',
    'anon',
    'authenticated',
    'service_role',
    'authenticator',
    'dashboard_user',
    'agent_reader',
    'agent_writer',
    'supabase_auth_admin',
    'supabase_storage_admin',
    'supabase_realtime_admin',
    'supabase_functions_admin',
    'supabase_etl_admin',
    'supabase_read_only_user'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'GRANT TEMPORARY ON DATABASE %I TO %I',
        current_database(),
        role_name
      );
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  unexpected_acl text;
BEGIN
  SELECT string_agg(
           format('%s:%s', role.rolname, acl.privilege_type), ', '
           ORDER BY role.rolname, acl.privilege_type
         )
    INTO unexpected_acl
    FROM pg_namespace AS n
    JOIN LATERAL aclexplode(
      COALESCE(n.nspacl, acldefault('n', n.nspowner))
    ) AS acl ON true
    JOIN pg_roles AS role ON role.oid = acl.grantee
   WHERE n.nspname = 'public'
     AND (
       role.rolname <> ALL(ARRAY[
         'postgres', 'anon', 'authenticated', 'service_role',
         'authenticator', 'dashboard_user', 'agent_reader', 'agent_writer',
         'supabase_auth_admin', 'supabase_storage_admin',
         'supabase_realtime_admin', 'supabase_functions_admin',
         'supabase_etl_admin', 'supabase_read_only_user',
         'supabase_replication_admin', 'supabase_privileged_role',
         'edge_catalog_reader', 'edge_rls_user', pg_get_userbyid(n.nspowner)
       ])
       OR (
         acl.privilege_type <> 'USAGE'
         AND NOT (
           acl.grantee = n.nspowner
           AND acl.privilege_type IN ('CREATE', 'USAGE')
         )
       )
     );

  IF unexpected_acl IS NOT NULL THEN
    RAISE EXCEPTION
      '00483 public schema precondition found unreviewed named ACLs: %',
      unexpected_acl;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public
  TO postgres, anon, authenticated, service_role, agent_reader, agent_writer;

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'authenticator',
    'dashboard_user',
    'supabase_auth_admin',
    'supabase_storage_admin',
    'supabase_realtime_admin',
    'supabase_functions_admin',
    'supabase_etl_admin',
    'supabase_read_only_user',
    'supabase_replication_admin',
    'supabase_privileged_role'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', role_name);
    END IF;
  END LOOP;
END
$$;

REVOKE CREATE, USAGE ON SCHEMA public
  FROM PUBLIC, edge_catalog_reader, edge_rls_user;

DO $$
DECLARE
  acl_difference text;
BEGIN
  WITH reviewed(role_name) AS (
    SELECT unnest(ARRAY[
      'postgres', 'anon', 'authenticated', 'service_role',
      'authenticator', 'dashboard_user', 'agent_reader', 'agent_writer',
      'supabase_auth_admin', 'supabase_storage_admin',
      'supabase_realtime_admin', 'supabase_functions_admin',
      'supabase_etl_admin', 'supabase_read_only_user',
      'supabase_replication_admin', 'supabase_privileged_role'
    ]::text[])
  ),
  expected(grantee, privilege_type, is_grantable) AS (
    SELECT pg_get_userbyid(n.nspowner), privilege_type, false
      FROM pg_namespace AS n
      CROSS JOIN (VALUES ('CREATE'::text), ('USAGE'::text)) AS owner_acl(privilege_type)
     WHERE n.nspname = 'public'
    UNION
    SELECT role.rolname, 'USAGE'::text, false
      FROM reviewed
      JOIN pg_roles AS role ON role.rolname = reviewed.role_name
  ),
  actual(grantee, privilege_type, is_grantable) AS (
    SELECT role.rolname, acl.privilege_type, acl.is_grantable
      FROM pg_namespace AS n
      JOIN LATERAL aclexplode(
        COALESCE(n.nspacl, acldefault('n', n.nspowner))
      ) AS acl ON true
      JOIN pg_roles AS role ON role.oid = acl.grantee
     WHERE n.nspname = 'public'
  ),
  difference AS (
    (SELECT 'unexpected ' || row(actual.*)::text AS item
       FROM actual
     EXCEPT
     SELECT 'unexpected ' || row(expected.*)::text FROM expected)
    UNION ALL
    (SELECT 'missing ' || row(expected.*)::text AS item
       FROM expected
     EXCEPT
     SELECT 'missing ' || row(actual.*)::text FROM actual)
  )
  SELECT string_agg(item, ', ' ORDER BY item)
    INTO acl_difference
    FROM difference;

  IF acl_difference IS NOT NULL THEN
    RAISE EXCEPTION
      '00483 public schema ACL postcondition differs from reviewed allowlist: %',
      acl_difference;
  END IF;
END
$$;

DO $$
DECLARE
  routine record;
BEGIN
  FOR routine IN
    SELECT p.oid::regprocedure AS signature,
           CASE WHEN p.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END AS kind
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
      JOIN LATERAL aclexplode(
        COALESCE(p.proacl, acldefault('f', p.proowner))
      ) AS acl ON true
     WHERE n.nspname = 'public'
       AND pg_get_userbyid(p.proowner) = 'postgres'
       AND p.prokind IN ('f', 'p', 'a', 'w')
       AND acl.grantee = 0
       AND acl.privilege_type = 'EXECUTE'
  LOOP
    EXECUTE format(
      'GRANT EXECUTE ON %s %s TO anon, authenticated, service_role',
      routine.kind,
      routine.signature
    );
    EXECUTE format(
      'REVOKE EXECUTE ON %s %s FROM PUBLIC',
      routine.kind,
      routine.signature
    );
  END LOOP;
END
$$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE SCHEMA IF NOT EXISTS edge_api AUTHORIZATION postgres;
ALTER SCHEMA edge_api OWNER TO postgres;
REVOKE ALL ON SCHEMA edge_api FROM PUBLIC;

DO $$
DECLARE
  grantee_name text;
BEGIN
  FOR grantee_name IN
    SELECT role.rolname
      FROM aclexplode(
        COALESCE(
          (SELECT nspacl FROM pg_namespace WHERE nspname = 'edge_api'),
          acldefault('n', (SELECT oid FROM pg_roles WHERE rolname = 'postgres'))
        )
      ) AS acl
      JOIN pg_roles AS role ON role.oid = acl.grantee
     WHERE role.rolname <> 'postgres'
  LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA edge_api FROM %I', grantee_name);
  END LOOP;
END
$$;

DROP VIEW IF EXISTS public.edge_catalog_products;
DROP VIEW IF EXISTS edge_api.catalog_products;

CREATE VIEW edge_api.catalog_products
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  p.id,
  p.name,
  p.brand,
  p.category,
  p.price_retail,
  p.images,
  p.short_description,
  p.patina_managed,
  p.status
FROM public.products AS p
WHERE p.layer = 'catalog'
  AND p.status = 'published';

ALTER VIEW edge_api.catalog_products OWNER TO postgres;
REVOKE ALL PRIVILEGES ON TABLE edge_api.catalog_products
  FROM PUBLIC, anon, authenticated, service_role, edge_catalog_reader, edge_rls_user;

DO $$
DECLARE
  target_type regtype;
BEGIN
  FOR target_type IN
    SELECT t.oid::regtype
      FROM pg_type AS t
     WHERE t.typrelid = 'edge_api.catalog_products'::regclass
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TYPE %s FROM PUBLIC, edge_catalog_reader, edge_rls_user',
      target_type
    );
  END LOOP;
END
$$;

GRANT USAGE ON SCHEMA edge_api TO edge_catalog_reader;
GRANT SELECT ON TABLE edge_api.catalog_products TO edge_catalog_reader;

COMMENT ON SCHEMA edge_api IS
  '00483: private Worker-native SQL surfaces; no PostgREST or general application access.';
COMMENT ON VIEW edge_api.catalog_products IS
  '00483: sole cacheable SQL surface for edge_catalog_reader; catalog/published rows and approved columns only.';

CREATE OR REPLACE FUNCTION public.grant_role_to_user(
  p_user_id uuid,
  p_role_name varchar,
  p_granted_by uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_role_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'grant_role_to_user requires service_role'
      USING ERRCODE = '42501';
  END IF;

  IF p_granted_by IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.user_roles AS ur
      JOIN public.roles AS actor_role ON actor_role.id = ur.role_id
     WHERE ur.user_id = p_granted_by
       AND actor_role.domain = 'admin'
  ) THEN
    RAISE EXCEPTION 'grant_role_to_user requires a current admin actor'
      USING ERRCODE = '42501';
  END IF;

  SELECT role.id
    INTO v_role_id
    FROM public.roles AS role
   WHERE role.name = p_role_name
     AND role.is_assignable = true;

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Role % not found or not assignable', p_role_name;
  END IF;

  INSERT INTO public.user_roles (user_id, role_id, granted_by)
  VALUES (p_user_id, v_role_id, p_granted_by)
  ON CONFLICT (user_id, role_id) DO NOTHING;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_role_from_user(
  p_user_id uuid,
  p_role_name varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_role_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'revoke_role_from_user requires service_role'
      USING ERRCODE = '42501';
  END IF;

  SELECT role.id
    INTO v_role_id
    FROM public.roles AS role
   WHERE role.name = p_role_name;

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Role % not found', p_role_name;
  END IF;

  DELETE FROM public.user_roles
   WHERE user_id = p_user_id
     AND role_id = v_role_id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_role_to_user(uuid, varchar, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.revoke_role_from_user(uuid, varchar)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_role_to_user(uuid, varchar, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_role_from_user(uuid, varchar)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_user_permissions(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.invoke_edge_function(text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_campaign_counter(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_sequence_counter(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_bounce_count(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_user_permissions(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.invoke_edge_function(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_campaign_counter(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_sequence_counter(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_bounce_count(uuid) TO service_role;

DO $$
DECLARE
  routine record;
  extra_grantee name;
BEGIN
  FOR routine IN
    SELECT p.oid,
           format(
             '%I.%I(%s)', n.nspname, p.proname, oidvectortypes(p.proargtypes)
           ) AS signature
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE p.oid = ANY(ARRAY[
       'public.grant_role_to_user(uuid,character varying,uuid)'::regprocedure::oid,
       'public.revoke_role_from_user(uuid,character varying)'::regprocedure::oid,
       'public.get_user_permissions(uuid)'::regprocedure::oid,
       'public.invoke_edge_function(text,jsonb)'::regprocedure::oid,
       'public.increment_campaign_counter(uuid,text)'::regprocedure::oid,
       'public.increment_sequence_counter(uuid,text)'::regprocedure::oid,
       'public.increment_bounce_count(uuid)'::regprocedure::oid
     ])
  LOOP
    FOR extra_grantee IN
      SELECT role.rolname
        FROM pg_proc AS p
        JOIN LATERAL aclexplode(
          COALESCE(p.proacl, acldefault('f', p.proowner))
        ) AS acl ON true
        JOIN pg_roles AS role ON role.oid = acl.grantee
       WHERE p.oid = routine.oid
         AND acl.privilege_type = 'EXECUTE'
         AND role.rolname NOT IN ('postgres', 'service_role')
    LOOP
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION %s FROM %I',
        routine.signature,
        extra_grantee
      );
    END LOOP;
  END LOOP;
END
$$;

ALTER FUNCTION public.get_user_permissions(uuid)
  SET search_path TO public, pg_temp;
ALTER FUNCTION public.invoke_edge_function(text, jsonb)
  SET search_path TO public, extensions, pg_temp;
ALTER FUNCTION public.increment_campaign_counter(uuid, text)
  SET search_path TO public, pg_temp;
ALTER FUNCTION public.increment_sequence_counter(uuid, text)
  SET search_path TO public, pg_temp;
ALTER FUNCTION public.increment_bounce_count(uuid)
  SET search_path TO public, pg_temp;

DO $$
DECLARE
  mismatch text;
BEGIN
  WITH expected_routine(oid, signature, expected_search_path) AS (
    VALUES
      (
        'public.grant_role_to_user(uuid,character varying,uuid)'::regprocedure::oid,
        'public.grant_role_to_user(uuid,character varying,uuid)'::text,
        'search_path=""'::text
      ),
      (
        'public.revoke_role_from_user(uuid,character varying)'::regprocedure::oid,
        'public.revoke_role_from_user(uuid,character varying)'::text,
        'search_path=""'::text
      ),
      (
        'public.get_user_permissions(uuid)'::regprocedure::oid,
        'public.get_user_permissions(uuid)'::text,
        'search_path=public, pg_temp'::text
      ),
      (
        'public.invoke_edge_function(text,jsonb)'::regprocedure::oid,
        'public.invoke_edge_function(text,jsonb)'::text,
        'search_path=public, extensions, pg_temp'::text
      ),
      (
        'public.increment_campaign_counter(uuid,text)'::regprocedure::oid,
        'public.increment_campaign_counter(uuid,text)'::text,
        'search_path=public, pg_temp'::text
      ),
      (
        'public.increment_sequence_counter(uuid,text)'::regprocedure::oid,
        'public.increment_sequence_counter(uuid,text)'::text,
        'search_path=public, pg_temp'::text
      ),
      (
        'public.increment_bounce_count(uuid)'::regprocedure::oid,
        'public.increment_bounce_count(uuid)'::text,
        'search_path=public, pg_temp'::text
      )
  ),
  metadata_mismatch(item) AS (
    SELECT format(
             '%s metadata owner=%s security_definer=%s config=%s',
             expected.signature,
             pg_get_userbyid(proc.proowner),
             proc.prosecdef,
             proc.proconfig
           )
      FROM expected_routine AS expected
      JOIN pg_proc AS proc ON proc.oid = expected.oid
     WHERE pg_get_userbyid(proc.proowner) <> 'postgres'
        OR NOT proc.prosecdef
        OR proc.proconfig IS DISTINCT FROM ARRAY[expected.expected_search_path]
  ),
  expected_acl(oid, signature, grantee, privilege_type, is_grantable) AS (
    SELECT expected.oid,
           expected.signature,
           grantee,
           'EXECUTE'::text,
           false
      FROM expected_routine AS expected
      CROSS JOIN (VALUES ('postgres'::name), ('service_role'::name)) AS grants(grantee)
  ),
  actual_acl(oid, signature, grantee, privilege_type, is_grantable) AS (
    SELECT expected.oid,
           expected.signature,
           role.rolname,
           acl.privilege_type,
           acl.is_grantable
      FROM expected_routine AS expected
      JOIN pg_proc AS proc ON proc.oid = expected.oid
      JOIN LATERAL aclexplode(
        COALESCE(proc.proacl, acldefault('f', proc.proowner))
      ) AS acl ON true
      JOIN pg_roles AS role ON role.oid = acl.grantee
  ),
  acl_mismatch(item) AS (
    SELECT 'unexpected sensitive routine ACL ' || row(actual_acl.*)::text
      FROM actual_acl
    EXCEPT
    SELECT 'unexpected sensitive routine ACL ' || row(expected_acl.*)::text
      FROM expected_acl
    UNION ALL
    SELECT 'missing sensitive routine ACL ' || row(expected_acl.*)::text
      FROM expected_acl
    EXCEPT
    SELECT 'missing sensitive routine ACL ' || row(actual_acl.*)::text
      FROM actual_acl
  ),
  all_mismatch AS (
    SELECT item FROM metadata_mismatch
    UNION ALL
    SELECT item FROM acl_mismatch
  )
  SELECT string_agg(item, ', ' ORDER BY item)
    INTO mismatch
    FROM all_mismatch;

  IF mismatch IS NOT NULL THEN
    RAISE EXCEPTION
      '00483 sensitive routine postcondition failed: %',
      mismatch;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_database AS database
      JOIN LATERAL aclexplode(
        COALESCE(database.datacl, acldefault('d', database.datdba))
      ) AS acl ON true
     WHERE database.datname = current_database()
       AND acl.grantee = 0
       AND acl.privilege_type IN ('CREATE', 'TEMPORARY')
  ) THEN
    RAISE EXCEPTION
      '00483 postcondition failed: PUBLIC retains database CREATE or TEMPORARY';
  END IF;

  IF has_database_privilege('edge_catalog_reader', current_database(), 'CREATE')
     OR has_database_privilege('edge_catalog_reader', current_database(), 'TEMP')
     OR has_database_privilege('edge_rls_user', current_database(), 'CREATE')
     OR has_database_privilege('edge_rls_user', current_database(), 'TEMP') THEN
    RAISE EXCEPTION
      '00483 postcondition failed: an edge capability retains database creation privileges';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_namespace AS n
      JOIN LATERAL aclexplode(
        COALESCE(n.nspacl, acldefault('n', n.nspowner))
      ) AS acl ON true
     WHERE n.nspname = 'public'
       AND acl.grantee = 0
       AND acl.privilege_type IN ('CREATE', 'USAGE')
  ) THEN
    RAISE EXCEPTION
      '00483 postcondition failed: PUBLIC retains public schema CREATE or USAGE';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
      JOIN LATERAL aclexplode(
        COALESCE(p.proacl, acldefault('f', p.proowner))
      ) AS acl ON true
     WHERE n.nspname = 'public'
       AND pg_get_userbyid(p.proowner) = 'postgres'
       AND p.prokind IN ('f', 'p', 'a', 'w')
       AND acl.grantee = 0
       AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      '00483 postcondition failed: postgres-owned public routine retains PUBLIC EXECUTE';
  END IF;

  IF EXISTS (
    WITH actual(grantee, privilege_type, is_grantable) AS (
      SELECT role.rolname, acl.privilege_type, acl.is_grantable
        FROM pg_default_acl AS defaults
        JOIN LATERAL aclexplode(defaults.defaclacl) AS acl ON true
        JOIN pg_roles AS role ON role.oid = acl.grantee
       WHERE pg_get_userbyid(defaults.defaclrole) = 'postgres'
         AND defaults.defaclnamespace = 0
         AND defaults.defaclobjtype = 'f'
    ),
    expected(grantee, privilege_type, is_grantable) AS (
      VALUES ('postgres'::name, 'EXECUTE'::text, false)
    )
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
    UNION ALL
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
  ) THEN
    RAISE EXCEPTION
      '00483 postcondition failed: postgres global routine defaults are not owner-only';
  END IF;
END
$$;

COMMENT ON ROLE edge_catalog_reader IS
  '00483: NOLOGIN/NOBYPASSRLS capability role. May use edge_api and select edge_api.catalog_products only; environment LOGIN is out of band after both ACL preflights pass.';

COMMIT;
