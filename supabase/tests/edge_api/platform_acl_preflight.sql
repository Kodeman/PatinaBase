-- Platform-owner gate for Cloudflare Phase 1 blocker 1.
-- Run after supabase/platform-admin/00483_platform_public_acl.sql and before
-- the application migration or any edge LOGIN provisioning.

DO $$
DECLARE
  role_name text;
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_namespace AS n
      JOIN LATERAL aclexplode(
        COALESCE(n.nspacl, acldefault('n', n.nspowner))
      ) AS acl ON true
     WHERE n.nspname = 'net'
       AND acl.grantee = 0
       AND acl.privilege_type IN ('CREATE', 'USAGE')
  ) THEN
    RAISE EXCEPTION
      'platform preflight: PUBLIC retains CREATE or USAGE on net';
  END IF;

  FOREACH role_name IN ARRAY ARRAY[
    'postgres', 'anon', 'authenticated', 'service_role',
    'supabase_functions_admin'
  ]
  LOOP
    IF NOT has_schema_privilege(role_name, 'net', 'USAGE') THEN
      RAISE EXCEPTION
        'platform preflight: named pg_net caller % lost USAGE', role_name;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edge_catalog_reader')
     AND (
       has_schema_privilege('edge_catalog_reader', 'net', 'CREATE')
       OR has_schema_privilege('edge_catalog_reader', 'net', 'USAGE')
     ) THEN
    RAISE EXCEPTION
      'platform preflight: catalog capability can still create or use net';
  END IF;
END
$$;

\echo 'edge_api/platform_acl_preflight.sql: all assertions passed'
