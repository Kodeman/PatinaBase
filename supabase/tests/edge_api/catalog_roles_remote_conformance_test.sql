-- Cloudflare Phase 1 remote effective-ACL provisioning gate.
--
-- Runner:
--   psql "$REMOTE_DB_URL" -X -v ON_ERROR_STOP=1 \
--     -f supabase/tests/edge_api/catalog_roles_remote_conformance_test.sql
--
-- Run only after the normal migration and separately authorized platform-admin
-- ACL step have both completed. This script is intentionally SELECT-only. It
-- is safe for staging/production
-- preflight because it creates no objects, changes no roles or data, includes no
-- seed, and derives its target database from the active connection. Failures
-- report aggregate counts only; no catalog object or customer identifier is
-- emitted.

\set ON_ERROR_STOP on
\set QUIET 1

BEGIN READ ONLY;

WITH
role_oids AS (
  SELECT
    max(oid) FILTER (WHERE rolname = 'edge_catalog_reader') AS catalog_oid,
    max(oid) FILTER (WHERE rolname = 'edge_rls_user') AS rls_oid,
    max(oid) FILTER (WHERE rolname = 'authenticated') AS authenticated_oid,
    count(*) FILTER (
      WHERE rolname IN (
        'edge_catalog_reader', 'edge_rls_user', 'authenticated'
      )
    ) AS found_roles
  FROM pg_roles
),
surface AS (
  SELECT
    max(c.oid) FILTER (
      WHERE n.nspname = 'public'
        AND c.relname = 'edge_catalog_products'
        AND c.relkind = 'v'
    ) AS catalog_view_oid,
    count(*) FILTER (
      WHERE n.nspname = 'public'
        AND c.relname = 'edge_catalog_products'
        AND c.relkind = 'v'
    ) AS found_surfaces
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
),
role_shape AS (
  SELECT count(*) AS unexpected
  FROM pg_roles
  WHERE rolname IN ('edge_catalog_reader', 'edge_rls_user')
    AND (
      rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolcanlogin
      OR rolreplication OR rolbypassrls
    )
),
database_public AS (
  SELECT
    count(*) FILTER (
      WHERE acl.grantee = 0 AND acl.privilege_type = 'CONNECT'
    ) AS connect_grants,
    count(*) FILTER (
      WHERE acl.grantee = 0 AND acl.privilege_type <> 'CONNECT'
    ) AS unexpected
  FROM pg_database AS d
  CROSS JOIN LATERAL aclexplode(
    COALESCE(d.datacl, acldefault('d', d.datdba))
  ) AS acl
  WHERE d.oid = (SELECT oid FROM pg_database WHERE datname = current_database())
),
database_effective AS (
  SELECT count(*) AS unexpected
  FROM role_oids AS r
  CROSS JOIN pg_database AS d
  CROSS JOIN LATERAL (VALUES ('CREATE'), ('TEMP')) AS privilege(name)
  WHERE d.datname = current_database()
    AND (
      COALESCE(
        has_database_privilege(r.catalog_oid, d.oid, privilege.name), false
      )
      OR (
        COALESCE(
          has_database_privilege(r.rls_oid, d.oid, privilege.name), false
        )
        AND NOT COALESCE(
          has_database_privilege(
            r.authenticated_oid, d.oid, privilege.name
          ),
          false
        )
      )
    )
),
catalog_required AS (
  SELECT
    (
      NOT COALESCE(
        has_database_privilege(r.catalog_oid, d.oid, 'CONNECT'), false
      )
    )::integer AS database_missing,
    (
      NOT COALESCE(
        has_schema_privilege(r.catalog_oid, 'public', 'USAGE'), false
      )
    )::integer AS schema_missing,
    (
      NOT COALESCE(
        has_table_privilege(r.catalog_oid, s.catalog_view_oid, 'SELECT'),
        false
      )
    )::integer AS relation_missing
  FROM role_oids AS r
  CROSS JOIN surface AS s
  CROSS JOIN pg_database AS d
  WHERE d.datname = current_database()
),
schema_public AS (
  SELECT count(*) AS unexpected
  FROM pg_namespace AS n
  CROSS JOIN LATERAL aclexplode(
    COALESCE(n.nspacl, acldefault('n', n.nspowner))
  ) AS acl
  WHERE n.nspname !~ '^pg_'
    AND n.nspname <> 'information_schema'
    AND acl.grantee = 0
),
schema_effective AS (
  SELECT count(*) AS unexpected
  FROM role_oids AS r
  CROSS JOIN pg_namespace AS n
  CROSS JOIN LATERAL (VALUES ('USAGE'), ('CREATE')) AS privilege(name)
  WHERE n.nspname !~ '^pg_'
    AND n.nspname <> 'information_schema'
    AND (
      (
        COALESCE(
          has_schema_privilege(r.catalog_oid, n.oid, privilege.name), false
        )
        AND NOT (
          n.nspname = 'public' AND privilege.name = 'USAGE'
        )
      )
      OR (
        COALESCE(
          has_schema_privilege(r.rls_oid, n.oid, privilege.name), false
        )
        AND NOT COALESCE(
          has_schema_privilege(
            r.authenticated_oid, n.oid, privilege.name
          ),
          false
        )
      )
    )
),
relation_public AS (
  SELECT count(*) AS unexpected
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(
    COALESCE(c.relacl, acldefault('r', c.relowner))
  ) AS acl
  WHERE n.nspname !~ '^pg_'
    AND n.nspname <> 'information_schema'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND acl.grantee = 0
),
relation_effective AS (
  SELECT count(*) AS unexpected
  FROM role_oids AS r
  CROSS JOIN surface AS s
  CROSS JOIN pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL unnest(
    CASE
      WHEN current_setting('server_version_num')::integer >= 170000 THEN
        ARRAY[
          'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
          'REFERENCES', 'TRIGGER', 'MAINTAIN'
        ]::text[]
      ELSE
        ARRAY[
          'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
          'REFERENCES', 'TRIGGER'
        ]::text[]
    END
  ) AS privilege(name)
  WHERE n.nspname !~ '^pg_'
    AND n.nspname <> 'information_schema'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND (
      (
        COALESCE(
          has_table_privilege(r.catalog_oid, c.oid, privilege.name), false
        )
        AND NOT (
          c.oid = s.catalog_view_oid AND privilege.name = 'SELECT'
        )
      )
      OR (
        COALESCE(
          has_table_privilege(r.rls_oid, c.oid, privilege.name), false
        )
        AND NOT COALESCE(
          has_table_privilege(
            r.authenticated_oid, c.oid, privilege.name
          ),
          false
        )
      )
    )
),
column_public AS (
  SELECT count(*) AS unexpected
  FROM pg_attribute AS a
  JOIN pg_class AS c ON c.oid = a.attrelid
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(a.attacl) AS acl
  WHERE a.attnum > 0
    AND NOT a.attisdropped
    AND a.attacl IS NOT NULL
    AND n.nspname !~ '^pg_'
    AND n.nspname <> 'information_schema'
    AND acl.grantee = 0
),
column_effective AS (
  SELECT count(*) AS unexpected
  FROM role_oids AS r
  CROSS JOIN surface AS s
  CROSS JOIN pg_attribute AS a
  JOIN pg_class AS c ON c.oid = a.attrelid
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL (
    VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')
  ) AS privilege(name)
  WHERE a.attnum > 0
    AND NOT a.attisdropped
    AND n.nspname !~ '^pg_'
    AND n.nspname <> 'information_schema'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND (
      (
        COALESCE(
          has_column_privilege(
            r.catalog_oid, c.oid, a.attnum, privilege.name
          ),
          false
        )
        AND NOT (
          c.oid = s.catalog_view_oid AND privilege.name = 'SELECT'
        )
      )
      OR (
        COALESCE(
          has_column_privilege(r.rls_oid, c.oid, a.attnum, privilege.name),
          false
        )
        AND NOT COALESCE(
          has_column_privilege(
            r.authenticated_oid, c.oid, a.attnum, privilege.name
          ),
          false
        )
      )
    )
),
catalog_shape AS (
  SELECT
    (
      (
        SELECT array_agg(a.attname ORDER BY a.attnum)
        FROM pg_attribute AS a
        WHERE a.attrelid = s.catalog_view_oid
          AND a.attnum > 0
          AND NOT a.attisdropped
      ) IS DISTINCT FROM ARRAY[
        'id', 'name', 'brand', 'category', 'price_retail', 'images',
        'short_description', 'patina_managed', 'status'
      ]::name[]
    )::integer
    + (
      COALESCE('security_barrier=true' = ANY(c.reloptions), false) IS NOT TRUE
    )::integer
    + (
      COALESCE('security_invoker=false' = ANY(c.reloptions), false) IS NOT TRUE
    )::integer AS unexpected
  FROM surface AS s
  LEFT JOIN pg_class AS c ON c.oid = s.catalog_view_oid
),
sequence_public AS (
  SELECT count(*) AS unexpected
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(
    COALESCE(c.relacl, acldefault('S', c.relowner))
  ) AS acl
  WHERE c.relkind = 'S'
    AND n.nspname !~ '^pg_'
    AND n.nspname <> 'information_schema'
    AND acl.grantee = 0
),
sequence_effective AS (
  SELECT count(*) AS unexpected
  FROM role_oids AS r
  CROSS JOIN pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL (VALUES ('USAGE'), ('SELECT'), ('UPDATE')) AS privilege(name)
  WHERE c.relkind = 'S'
    AND n.nspname !~ '^pg_'
    AND n.nspname <> 'information_schema'
    AND (
      COALESCE(
        has_sequence_privilege(r.catalog_oid, c.oid, privilege.name), false
      )
      OR (
        COALESCE(
          has_sequence_privilege(r.rls_oid, c.oid, privilege.name), false
        )
        AND NOT COALESCE(
          has_sequence_privilege(
            r.authenticated_oid, c.oid, privilege.name
          ),
          false
        )
      )
    )
),
routine_public AS (
  SELECT count(*) AS unexpected
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(
    COALESCE(p.proacl, acldefault('f', p.proowner))
  ) AS acl
  WHERE n.nspname !~ '^pg_'
    AND n.nspname <> 'information_schema'
    AND acl.grantee = 0
    AND acl.privilege_type = 'EXECUTE'
),
routine_effective AS (
  SELECT count(*) AS unexpected
  FROM role_oids AS r
  CROSS JOIN pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname !~ '^pg_'
    AND n.nspname <> 'information_schema'
    AND (
      COALESCE(has_function_privilege(r.catalog_oid, p.oid, 'EXECUTE'), false)
      OR (
        COALESCE(has_function_privilege(r.rls_oid, p.oid, 'EXECUTE'), false)
        AND NOT COALESCE(
          has_function_privilege(
            r.authenticated_oid, p.oid, 'EXECUTE'
          ),
          false
        )
      )
    )
),
membership_shape AS (
  SELECT count(*) AS unexpected
  FROM role_oids AS r
  CROSS JOIN pg_auth_members AS am
  WHERE (
    am.member = r.catalog_oid
  ) OR (
    am.member = r.rls_oid
    AND NOT (
      am.roleid = r.authenticated_oid
      AND NOT am.admin_option
      AND NOT am.inherit_option
      AND am.set_option
    )
  ) OR (
    am.roleid IN (r.catalog_oid, r.rls_oid)
    AND NOT (
      am.member = (SELECT oid FROM pg_roles WHERE rolname = current_user)
      AND am.grantor = (
        SELECT oid FROM pg_roles WHERE rolname = 'supabase_admin'
      )
      AND am.admin_option
      AND NOT am.inherit_option
      AND NOT am.set_option
    )
  )
),
required_rls_membership AS (
  SELECT count(*) AS actual
  FROM role_oids AS r
  JOIN pg_auth_members AS am
    ON am.member = r.rls_oid
   AND am.roleid = r.authenticated_oid
   AND NOT am.admin_option
   AND NOT am.inherit_option
   AND am.set_option
),
default_acl_public AS (
  SELECT count(*) AS unexpected
  FROM pg_default_acl AS d
  CROSS JOIN LATERAL aclexplode(d.defaclacl) AS acl
  WHERE acl.grantee = 0
),
owner_default_recurrence AS (
  -- This full remote gate is expected-red until the separately reviewed
  -- platform-admin step hardens reserved Supabase owners that the normal
  -- migration principal cannot alter.
  SELECT count(*) AS unexpected
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
),
counts AS (
  SELECT
    3 - role_oids.found_roles AS missing_roles,
    1 - surface.found_surfaces AS missing_surfaces,
    role_shape.unexpected AS role_shape,
    (database_public.connect_grants <> 1)::integer
      + database_public.unexpected + database_effective.unexpected
      + catalog_required.database_missing AS database_acl,
    schema_public.unexpected + schema_effective.unexpected
      + catalog_required.schema_missing AS schema_acl,
    relation_public.unexpected + relation_effective.unexpected
      + catalog_required.relation_missing AS relation_acl,
    column_public.unexpected + column_effective.unexpected AS column_acl,
    catalog_shape.unexpected AS surface_shape,
    sequence_public.unexpected + sequence_effective.unexpected AS sequence_acl,
    routine_public.unexpected + routine_effective.unexpected AS routine_acl,
    membership_shape.unexpected
      + (required_rls_membership.actual <> 1)::integer AS membership_acl,
    default_acl_public.unexpected
      + owner_default_recurrence.unexpected AS default_acl
  FROM role_oids
  CROSS JOIN surface
  CROSS JOIN role_shape
  CROSS JOIN database_public
  CROSS JOIN database_effective
  CROSS JOIN catalog_required
  CROSS JOIN schema_public
  CROSS JOIN schema_effective
  CROSS JOIN relation_public
  CROSS JOIN relation_effective
  CROSS JOIN column_public
  CROSS JOIN column_effective
  CROSS JOIN catalog_shape
  CROSS JOIN sequence_public
  CROSS JOIN sequence_effective
  CROSS JOIN routine_public
  CROSS JOIN routine_effective
  CROSS JOIN membership_shape
  CROSS JOIN required_rls_membership
  CROSS JOIN default_acl_public
  CROSS JOIN owner_default_recurrence
)
SELECT
  (
    missing_roles = 0
    AND missing_surfaces = 0
    AND role_shape = 0
    AND database_acl = 0
    AND schema_acl = 0
    AND relation_acl = 0
    AND column_acl = 0
    AND surface_shape = 0
    AND sequence_acl = 0
    AND routine_acl = 0
    AND membership_acl = 0
    AND default_acl = 0
  ) AS cf_remote_acl_ok,
  format(
    'REMOTE ACL CONFORMANCE FAILED: missing_roles=%s missing_surfaces=%s role_shape=%s database_acl=%s schema_acl=%s relation_acl=%s column_acl=%s surface_shape=%s sequence_acl=%s routine_acl=%s membership_acl=%s default_acl=%s',
    missing_roles,
    missing_surfaces,
    role_shape,
    database_acl,
    schema_acl,
    relation_acl,
    column_acl,
    surface_shape,
    sequence_acl,
    routine_acl,
    membership_acl,
    default_acl
  ) AS cf_remote_acl_failure
FROM counts
\gset

\if :cf_remote_acl_ok
\else
  \warn :cf_remote_acl_failure
  -- psql 15 does not accept an exit code for \quit. A SELECT-only arithmetic
  -- error gives ON_ERROR_STOP a portable nonzero exit without exposing a
  -- catalog identifier or mutating the target.
  SELECT 1 / 0 AS cf_remote_acl_gate_failed;
\endif

COMMIT;

\set QUIET 0
\echo 'edge_api/catalog_roles_remote_conformance_test.sql: aggregate ACL conformance passed'
