-- Read-only Cloudflare Phase 1 database ACL postflight.
-- Run as the migration operator after 00483 and before any edge LOGIN exists.

\set ON_ERROR_STOP on
\ir platform_acl_preflight.sql

DO $$
DECLARE
  target regprocedure;
  expected_search_path text;
  actual_owner name;
  actual_security_definer boolean;
  actual_config text[];
  violation text;
BEGIN
  IF NOT EXISTS (
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
  ) OR NOT EXISTS (
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
  ) THEN
    RAISE EXCEPTION 'remote postflight: unsafe edge capability-role attributes';
  END IF;

  IF EXISTS (
    WITH actual(granted, member, grantor, admin_option, inherit_option, set_option) AS (
      SELECT granted.rolname, member.rolname, grantor.rolname,
             membership.admin_option, membership.inherit_option,
             membership.set_option
        FROM pg_auth_members AS membership
        JOIN pg_roles AS granted ON granted.oid = membership.roleid
        JOIN pg_roles AS member ON member.oid = membership.member
        JOIN pg_roles AS grantor ON grantor.oid = membership.grantor
       WHERE granted.rolname IN ('edge_catalog_reader', 'edge_rls_user')
          OR member.rolname IN ('edge_catalog_reader', 'edge_rls_user')
    ),
    expected(granted, member, grantor, admin_option, inherit_option, set_option) AS (
      VALUES
        ('authenticated'::name, 'edge_rls_user'::name, 'postgres'::name,
         false, false, true),
        ('edge_catalog_reader'::name, 'postgres'::name, 'supabase_admin'::name,
         true, false, false),
        ('edge_rls_user'::name, 'postgres'::name, 'supabase_admin'::name,
         true, false, false)
    )
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
    UNION ALL
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
  ) THEN
    RAISE EXCEPTION 'remote postflight: edge capability-role memberships changed';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_database AS database
      JOIN LATERAL aclexplode(
        COALESCE(database.datacl, acldefault('d', database.datdba))
      ) AS acl ON true
     WHERE database.datname = current_database()
       AND acl.grantee = 0
       AND acl.privilege_type IN ('CREATE', 'TEMPORARY')
  ) OR has_database_privilege(
    'edge_catalog_reader', current_database(), 'CREATE'
  ) OR has_database_privilege(
    'edge_catalog_reader', current_database(), 'TEMP'
  ) OR has_database_privilege(
    'edge_rls_user', current_database(), 'CREATE'
  ) OR has_database_privilege(
    'edge_rls_user', current_database(), 'TEMP'
  ) THEN
    RAISE EXCEPTION 'remote postflight: database creation boundary changed';
  END IF;

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
    INTO violation
    FROM difference;

  IF violation IS NOT NULL OR EXISTS (
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
      'remote postflight: public schema ACL differs from allowlist: %',
      COALESCE(violation, 'PUBLIC grant remains');
  END IF;

  IF EXISTS (
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
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
    UNION ALL
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
  ) THEN
    RAISE EXCEPTION 'remote postflight: edge_api schema ACL changed';
  END IF;

  IF to_regclass('public.edge_catalog_products') IS NOT NULL
     OR to_regclass('edge_api.catalog_products') IS NULL THEN
    RAISE EXCEPTION 'remote postflight: catalog view placement changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_class AS relation
     WHERE relation.oid = 'edge_api.catalog_products'::regclass
       AND pg_get_userbyid(relation.relowner) = 'postgres'
       AND relation.reloptions @> ARRAY[
         'security_barrier=true', 'security_invoker=false'
       ]
  ) THEN
    RAISE EXCEPTION 'remote postflight: catalog view owner/security options changed';
  END IF;

  IF (
    SELECT array_agg(attribute.attname ORDER BY attribute.attnum)
      FROM pg_attribute AS attribute
     WHERE attribute.attrelid = 'edge_api.catalog_products'::regclass
       AND attribute.attnum > 0
       AND NOT attribute.attisdropped
  ) IS DISTINCT FROM ARRAY[
    'id', 'name', 'brand', 'category', 'price_retail', 'images',
    'short_description', 'patina_managed', 'status'
  ]::name[] THEN
    RAISE EXCEPTION 'remote postflight: catalog view column allowlist changed';
  END IF;

  IF pg_get_viewdef('edge_api.catalog_products'::regclass, true)
       NOT LIKE '%layer = ''catalog''::text%'
     OR pg_get_viewdef('edge_api.catalog_products'::regclass, true)
       NOT LIKE '%status = ''published''::text%' THEN
    RAISE EXCEPTION 'remote postflight: catalog view predicates changed';
  END IF;

  IF EXISTS (
    WITH actual(grantee, privilege_type, is_grantable) AS (
      SELECT role.rolname, acl.privilege_type, acl.is_grantable
        FROM pg_class AS relation
        JOIN LATERAL aclexplode(relation.relacl) AS acl ON true
        JOIN pg_roles AS role ON role.oid = acl.grantee
       WHERE relation.oid = 'edge_api.catalog_products'::regclass
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
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
    UNION ALL
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
  ) THEN
    RAISE EXCEPTION 'remote postflight: catalog view ACL changed';
  END IF;

  IF EXISTS (
    WITH actual(grantee, privilege_type, is_grantable) AS (
      SELECT role.rolname, acl.privilege_type, acl.is_grantable
        FROM pg_type AS type
        JOIN LATERAL aclexplode(
          COALESCE(type.typacl, acldefault('T', type.typowner))
        ) AS acl ON true
        JOIN pg_roles AS role ON role.oid = acl.grantee
       WHERE type.typrelid = 'edge_api.catalog_products'::regclass
    ),
    expected(grantee, privilege_type, is_grantable) AS (
      VALUES ('postgres'::name, 'USAGE'::text, false)
    )
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
    UNION ALL
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
  ) THEN
    RAISE EXCEPTION 'remote postflight: catalog row-type ACL changed';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_namespace AS n
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND (
         has_schema_privilege('edge_catalog_reader', n.oid, 'CREATE')
         OR (
           has_schema_privilege('edge_catalog_reader', n.oid, 'USAGE')
           AND n.nspname <> 'edge_api'
         )
       )
  ) OR EXISTS (
    SELECT 1
      FROM pg_class AS relation
      JOIN pg_namespace AS n ON n.oid = relation.relnamespace
      CROSS JOIN LATERAL (
        VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
               ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
      ) AS privilege(name)
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
       AND has_schema_privilege('edge_catalog_reader', n.oid, 'USAGE')
       AND has_table_privilege('edge_catalog_reader', relation.oid, privilege.name)
       AND NOT (
         relation.oid = 'edge_api.catalog_products'::regclass
         AND privilege.name = 'SELECT'
       )
  ) OR EXISTS (
    SELECT 1
      FROM pg_proc AS routine
      JOIN pg_namespace AS n ON n.oid = routine.pronamespace
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND has_schema_privilege('edge_catalog_reader', n.oid, 'USAGE')
       AND has_function_privilege('edge_catalog_reader', routine.oid, 'EXECUTE')
  ) OR EXISTS (
    SELECT 1
      FROM pg_class AS relation
      JOIN pg_namespace AS n ON n.oid = relation.relnamespace
      JOIN pg_attribute AS attribute ON attribute.attrelid = relation.oid
      CROSS JOIN LATERAL (
        VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')
      ) AS privilege(name)
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
       AND attribute.attnum > 0
       AND NOT attribute.attisdropped
       AND has_schema_privilege('edge_catalog_reader', n.oid, 'USAGE')
       AND has_column_privilege(
         'edge_catalog_reader', relation.oid, attribute.attnum, privilege.name
       )
       AND NOT (
         relation.oid = 'edge_api.catalog_products'::regclass
         AND privilege.name = 'SELECT'
       )
  ) OR EXISTS (
    SELECT 1
      FROM pg_class AS sequence
      JOIN pg_namespace AS n ON n.oid = sequence.relnamespace
      CROSS JOIN LATERAL (
        VALUES ('USAGE'), ('SELECT'), ('UPDATE')
      ) AS privilege(name)
     WHERE sequence.relkind = 'S'
       AND n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND has_schema_privilege('edge_catalog_reader', n.oid, 'USAGE')
       AND has_sequence_privilege(
         'edge_catalog_reader', sequence.oid, privilege.name
       )
  ) OR EXISTS (
    SELECT 1
      FROM pg_type AS type
      JOIN pg_namespace AS n ON n.oid = type.typnamespace
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND has_schema_privilege('edge_catalog_reader', n.oid, 'USAGE')
       AND has_type_privilege('edge_catalog_reader', type.oid, 'USAGE')
  ) THEN
    RAISE EXCEPTION 'remote postflight: edge catalog effective reachability widened';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_proc AS routine
      JOIN pg_namespace AS n ON n.oid = routine.pronamespace
      JOIN LATERAL aclexplode(
        COALESCE(routine.proacl, acldefault('f', routine.proowner))
      ) AS acl ON true
     WHERE n.nspname = 'public'
       AND pg_get_userbyid(routine.proowner) = 'postgres'
       AND routine.prokind IN ('f', 'p', 'a', 'w')
       AND acl.grantee = 0
       AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'remote postflight: application routine retains PUBLIC EXECUTE';
  END IF;

  FOR target, expected_search_path IN
    SELECT *
      FROM (VALUES
        ('public.grant_role_to_user(uuid,character varying,uuid)'::regprocedure,
         'search_path=""'::text),
        ('public.revoke_role_from_user(uuid,character varying)'::regprocedure,
         'search_path=""'::text),
        ('public.get_user_permissions(uuid)'::regprocedure,
         'search_path=public, pg_temp'::text),
        ('public.invoke_edge_function(text,jsonb)'::regprocedure,
         'search_path=public, extensions, pg_temp'::text),
        ('public.increment_campaign_counter(uuid,text)'::regprocedure,
         'search_path=public, pg_temp'::text),
        ('public.increment_sequence_counter(uuid,text)'::regprocedure,
         'search_path=public, pg_temp'::text),
        ('public.increment_bounce_count(uuid)'::regprocedure,
         'search_path=public, pg_temp'::text)
      ) AS expected(signature, search_path)
  LOOP
    SELECT pg_get_userbyid(routine.proowner), routine.prosecdef, routine.proconfig
      INTO actual_owner, actual_security_definer, actual_config
      FROM pg_proc AS routine
     WHERE routine.oid = target;

    IF actual_owner IS DISTINCT FROM 'postgres'
       OR actual_security_definer IS DISTINCT FROM true
       OR actual_config IS DISTINCT FROM ARRAY[expected_search_path] THEN
      RAISE EXCEPTION
        'remote postflight: sensitive routine metadata changed for %', target;
    END IF;

    IF EXISTS (
      WITH actual(grantee, privilege_type, is_grantable) AS (
        SELECT role.rolname, acl.privilege_type, acl.is_grantable
          FROM pg_proc AS routine
          JOIN LATERAL aclexplode(
            COALESCE(routine.proacl, acldefault('f', routine.proowner))
          ) AS acl ON true
          JOIN pg_roles AS role ON role.oid = acl.grantee
         WHERE routine.oid = target
      ),
      expected(grantee, privilege_type, is_grantable) AS (
        VALUES
          ('postgres'::name, 'EXECUTE'::text, false),
          ('service_role'::name, 'EXECUTE'::text, false)
      )
      (SELECT * FROM actual EXCEPT SELECT * FROM expected)
      UNION ALL
      (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    ) OR EXISTS (
      SELECT 1
        FROM pg_proc AS routine
        JOIN LATERAL aclexplode(
          COALESCE(routine.proacl, acldefault('f', routine.proowner))
        ) AS acl ON true
       WHERE routine.oid = target
         AND acl.grantee = 0
         AND acl.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION
        'remote postflight: sensitive routine ACL changed for %', target;
    END IF;
  END LOOP;

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
    RAISE EXCEPTION 'remote postflight: global routine default ACL changed';
  END IF;

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
    INTO violation
    FROM difference;

  IF violation IS NOT NULL THEN
    RAISE EXCEPTION
      'remote postflight: LOGIN-role TEMP allowlist changed: %', violation;
  END IF;
END
$$;

\echo 'edge_api/remote_acl_postflight.sql: all read-only postconditions passed'
