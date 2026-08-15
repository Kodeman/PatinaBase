-- ═══════════════════════════════════════════════════════════════════════════
-- 00483 — Platform-owner PUBLIC ACL cleanup
--
-- Apply as supabase_admin before 00483_edge_public_acl_boundary.sql is pushed.
-- The normal postgres migration role cannot alter the supabase_admin-owned net
-- schema. This artifact is idempotent and contains no credentials.
--
-- pg_net 0.19.x HTTP functions are SECURITY INVOKER in Strata and depend on
-- direct queue, sequence, and internal-helper privileges. Their object ACLs
-- remain unchanged; removing PUBLIC schema USAGE makes them unreachable to a
-- new ungranted login without breaking the named managed-service callers.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_namespace
     WHERE nspname = 'net'
       AND pg_get_userbyid(nspowner) = current_user
  ) THEN
    RAISE EXCEPTION
      '00483 platform ACL cleanup must run as the owner of schema net';
  END IF;
END
$$;

DO $$
DECLARE
  expected_acl text[];
  actual_acl text[];
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_namespace AS n
      JOIN LATERAL aclexplode(
        COALESCE(n.nspacl, acldefault('n', n.nspowner))
      ) AS acl ON true
     WHERE n.nspname = 'net'
       AND acl.grantee = 0
       AND acl.privilege_type = 'CREATE'
  ) THEN
    RAISE EXCEPTION
      '00483 precondition failed: unexpected PUBLIC CREATE on schema net';
  END IF;

  SELECT array_agg(
           format(
             '%s:%s:%s:%s:%s',
             pg_get_userbyid(n.nspowner),
             role.rolname,
             acl.privilege_type,
             acl.is_grantable,
             pg_get_userbyid(acl.grantor)
           )
           ORDER BY role.rolname, acl.privilege_type,
                    acl.is_grantable, pg_get_userbyid(acl.grantor)
         )
    INTO expected_acl
    FROM pg_namespace AS n
    JOIN LATERAL aclexplode(
      COALESCE(n.nspacl, acldefault('n', n.nspowner))
    ) AS acl ON true
    JOIN pg_roles AS role ON role.oid = acl.grantee
   WHERE n.nspname = 'net';

  REVOKE USAGE ON SCHEMA net FROM PUBLIC;

  SELECT array_agg(
           format(
             '%s:%s:%s:%s:%s',
             pg_get_userbyid(n.nspowner),
             role.rolname,
             acl.privilege_type,
             acl.is_grantable,
             pg_get_userbyid(acl.grantor)
           )
           ORDER BY role.rolname, acl.privilege_type,
                    acl.is_grantable, pg_get_userbyid(acl.grantor)
         )
    INTO actual_acl
    FROM pg_namespace AS n
    JOIN LATERAL aclexplode(
      COALESCE(n.nspacl, acldefault('n', n.nspowner))
    ) AS acl ON true
    JOIN pg_roles AS role ON role.oid = acl.grantee
   WHERE n.nspname = 'net';

  IF expected_acl IS DISTINCT FROM actual_acl THEN
    RAISE EXCEPTION
      '00483 postcondition failed: a named net schema grant changed';
  END IF;

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
      '00483 postcondition failed: PUBLIC retains CREATE or USAGE on net';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edge_catalog_reader')
     AND (
       has_schema_privilege('edge_catalog_reader', 'net', 'CREATE')
       OR has_schema_privilege('edge_catalog_reader', 'net', 'USAGE')
     ) THEN
    RAISE EXCEPTION
      '00483 postcondition failed: edge_catalog_reader can still use net';
  END IF;

END
$$;

COMMIT;
