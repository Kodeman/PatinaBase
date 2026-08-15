\set ON_ERROR_STOP on

DO $$
BEGIN
  IF session_user <> 'postgres' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION
      'pg_temp test ACL prelude must start as postgres (session_user=%, current_user=%)',
      session_user,
      current_user;
  END IF;
END
$$;

CREATE TEMP TABLE pg_temp._patina_persistent_default_acl_snapshot AS
SELECT defaults.defaclrole,
       defaults.defaclnamespace,
       defaults.defaclobjtype,
       defaults.defaclacl
  FROM pg_default_acl AS defaults
 WHERE defaults.defaclnamespace <> pg_my_temp_schema();

SELECT namespace.oid::text AS patina_test_temp_schema_oid,
       namespace.nspname AS patina_test_temp_schema
  FROM pg_namespace AS namespace
 WHERE namespace.oid = pg_my_temp_schema()
\gset

SELECT md5(
         COALESCE(
           string_agg(
             format(
               '%s:%s:%s:%s',
               defaults.defaclrole,
               defaults.defaclnamespace,
               defaults.defaclobjtype,
               defaults.defaclacl::text
             ),
             '|' ORDER BY defaults.defaclrole,
                          defaults.defaclnamespace,
                          defaults.defaclobjtype,
                          defaults.defaclacl::text
           ),
           ''
         )
       ) AS patina_test_persistent_default_acl_fingerprint
  FROM pg_default_acl AS defaults
 WHERE defaults.defaclnamespace <> pg_my_temp_schema()
\gset

DO $$
DECLARE
  temp_schema name;
BEGIN
  SELECT namespace.nspname
    INTO STRICT temp_schema
    FROM pg_namespace AS namespace
   WHERE namespace.oid = pg_my_temp_schema();

  IF temp_schema !~ '^pg_temp_[0-9]+$' THEN
    RAISE EXCEPTION 'unexpected temporary schema name: %', temp_schema;
  END IF;

  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role',
    temp_schema
  );
END
$$;

DO $$
BEGIN
  IF EXISTS (
    WITH actual(grantee, privilege_type, is_grantable) AS (
      SELECT role.rolname, acl.privilege_type, acl.is_grantable
        FROM pg_default_acl AS defaults
        JOIN LATERAL aclexplode(defaults.defaclacl) AS acl ON true
        JOIN pg_roles AS role ON role.oid = acl.grantee
       WHERE defaults.defaclrole = 'postgres'::regrole
         AND defaults.defaclnamespace = pg_my_temp_schema()
         AND defaults.defaclobjtype = 'f'
    ),
    expected(grantee, privilege_type, is_grantable) AS (
      VALUES
        ('anon'::name, 'EXECUTE'::text, false),
        ('authenticated'::name, 'EXECUTE'::text, false),
        ('service_role'::name, 'EXECUTE'::text, false)
    )
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
    UNION ALL
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
  ) OR EXISTS (
    SELECT 1
      FROM pg_default_acl AS defaults
     WHERE defaults.defaclnamespace = pg_my_temp_schema()
       AND (
         defaults.defaclrole <> 'postgres'::regrole
         OR defaults.defaclobjtype <> 'f'
       )
  ) OR EXISTS (
    SELECT 1
      FROM pg_default_acl AS defaults
      JOIN LATERAL aclexplode(defaults.defaclacl) AS acl ON true
     WHERE defaults.defaclnamespace = pg_my_temp_schema()
       AND acl.grantee = 0
  ) THEN
    RAISE EXCEPTION
      'test helper default EXECUTE is not scoped to the three application roles';
  END IF;

  IF EXISTS (
    (SELECT defaclrole, defaclnamespace, defaclobjtype, defaclacl
       FROM pg_default_acl
      WHERE defaclnamespace <> pg_my_temp_schema()
     EXCEPT
     SELECT * FROM pg_temp._patina_persistent_default_acl_snapshot)
    UNION ALL
    (SELECT * FROM pg_temp._patina_persistent_default_acl_snapshot
     EXCEPT
     SELECT defaclrole, defaclnamespace, defaclobjtype, defaclacl
       FROM pg_default_acl
      WHERE defaclnamespace <> pg_my_temp_schema())
  ) THEN
    RAISE EXCEPTION
      'test helper prelude changed a persistent default ACL';
  END IF;
END
$$;

\echo PATINA_TEST_TEMP_SCHEMA=:patina_test_temp_schema
\echo PATINA_TEST_TEMP_SCHEMA_OID=:patina_test_temp_schema_oid
\echo PATINA_TEST_PERSISTENT_DEFAULT_ACL_FINGERPRINT=:patina_test_persistent_default_acl_fingerprint
