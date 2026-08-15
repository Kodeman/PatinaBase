\set ON_ERROR_STOP on

DO $$
BEGIN
  IF session_user <> 'postgres' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION
      'SQL test did not restore postgres before the pg_temp ACL postlude';
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
      'SQL test changed a persistent postgres default ACL';
  END IF;

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
      JOIN LATERAL aclexplode(defaults.defaclacl) AS acl ON true
     WHERE defaults.defaclnamespace = pg_my_temp_schema()
       AND acl.grantee = 0
  ) THEN
    RAISE EXCEPTION 'SQL test widened its pg_temp helper default ACL';
  END IF;
END
$$;

\echo PATINA_TEST_SESSION_ACL_OK
