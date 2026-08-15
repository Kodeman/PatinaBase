-- Run through the password-bearing catalog connection after remote_acl_postflight.
-- Required psql variable: expected_login. The connection URL stays outside SQL.

\set ON_ERROR_STOP on
\if :{?expected_login}
\else
  \echo 'catalog_login_probe.sql requires -v expected_login=<role>'
  \quit 2
\endif

SELECT current_user = :'expected_login' AS catalog_identity_ok \gset
\if :catalog_identity_ok
\else
  \echo 'catalog login identity mismatch'
  \quit 3
\endif

SELECT (
  SELECT role.rolcanlogin
     AND role.rolinherit
     AND NOT role.rolsuper
     AND NOT role.rolcreatedb
     AND NOT role.rolcreaterole
     AND NOT role.rolreplication
     AND NOT role.rolbypassrls
     AND role.rolconfig @> ARRAY[
       'search_path=pg_catalog, edge_api',
       'default_transaction_read_only=on'
     ]
    FROM pg_roles AS role
   WHERE role.rolname = current_user
) AND (
  SELECT count(*) = 1
     AND bool_and(
       granted.rolname = 'edge_catalog_reader'
       AND NOT membership.admin_option
       AND membership.inherit_option
       AND NOT membership.set_option
     )
    FROM pg_auth_members AS membership
    JOIN pg_roles AS granted ON granted.oid = membership.roleid
   WHERE membership.member = (SELECT oid FROM pg_roles WHERE rolname = current_user)
) AND has_database_privilege(current_user, current_database(), 'CONNECT')
  AND NOT has_database_privilege(current_user, current_database(), 'CREATE')
  AND NOT has_database_privilege(current_user, current_database(), 'TEMP')
  AND current_setting('search_path') = 'pg_catalog, edge_api'
  AND current_setting('default_transaction_read_only') = 'on'
  AND has_schema_privilege(current_user, 'edge_api', 'USAGE')
  AND NOT has_schema_privilege(current_user, 'edge_api', 'CREATE')
  AND NOT has_schema_privilege(current_user, 'public', 'USAGE')
  AND NOT has_schema_privilege(current_user, 'net', 'USAGE')
  AND has_table_privilege(
    current_user, 'edge_api.catalog_products', 'SELECT'
  )
  AND NOT has_table_privilege(
    current_user,
    (
      SELECT relation.oid
        FROM pg_class AS relation
        JOIN pg_namespace AS n ON n.oid = relation.relnamespace
       WHERE n.nspname = 'public'
         AND relation.relname = 'products'
    ),
    'SELECT'
  )
  AND NOT EXISTS (
    SELECT 1
      FROM pg_namespace AS n
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND (
         has_schema_privilege(current_user, n.oid, 'CREATE')
         OR (
           has_schema_privilege(current_user, n.oid, 'USAGE')
           AND n.nspname <> 'edge_api'
         )
       )
  )
  AND NOT EXISTS (
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
       AND has_schema_privilege(current_user, n.oid, 'USAGE')
       AND has_table_privilege(current_user, relation.oid, privilege.name)
       AND NOT (
         relation.oid = 'edge_api.catalog_products'::regclass
         AND privilege.name = 'SELECT'
       )
  )
  AND NOT EXISTS (
    SELECT 1
      FROM pg_proc AS routine
      JOIN pg_namespace AS n ON n.oid = routine.pronamespace
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND has_schema_privilege(current_user, n.oid, 'USAGE')
       AND has_function_privilege(current_user, routine.oid, 'EXECUTE')
  )
  AND NOT EXISTS (
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
       AND has_schema_privilege(current_user, n.oid, 'USAGE')
       AND has_column_privilege(
         current_user, relation.oid, attribute.attnum, privilege.name
       )
       AND NOT (
         relation.oid = 'edge_api.catalog_products'::regclass
         AND privilege.name = 'SELECT'
       )
  )
  AND NOT EXISTS (
    SELECT 1
      FROM pg_class AS sequence
      JOIN pg_namespace AS n ON n.oid = sequence.relnamespace
      CROSS JOIN LATERAL (
        VALUES ('USAGE'), ('SELECT'), ('UPDATE')
      ) AS privilege(name)
     WHERE sequence.relkind = 'S'
       AND n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND has_schema_privilege(current_user, n.oid, 'USAGE')
       AND has_sequence_privilege(current_user, sequence.oid, privilege.name)
  )
  AND NOT EXISTS (
    SELECT 1
      FROM pg_type AS type
      JOIN pg_namespace AS n ON n.oid = type.typnamespace
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND has_schema_privilege(current_user, n.oid, 'USAGE')
       AND has_type_privilege(current_user, type.oid, 'USAGE')
  ) AS catalog_capability_ok
\gset

\if :catalog_capability_ok
\else
  \echo 'catalog login exceeds the connection plus SELECT-only view contract'
  \quit 3
\endif

SELECT count(*) AS catalog_rows
  FROM edge_api.catalog_products;

SELECT NOT EXISTS (
  SELECT 1 FROM edge_api.catalog_products WHERE status <> 'published'
) AS catalog_status_ok \gset
\if :catalog_status_ok
\else
  \echo 'catalog login observed a non-published row'
  \quit 3
\endif

\set ON_ERROR_STOP off
CREATE TEMP TABLE edge_catalog_forbidden_temp(id integer);
\if :ERROR
\else
  DROP TABLE edge_catalog_forbidden_temp;
  \echo 'catalog login unexpectedly created a temporary table'
  \quit 3
\endif

SELECT 1 FROM public.products LIMIT 0;
\if :ERROR
\else
  \echo 'catalog login unexpectedly selected public.products'
  \quit 3
\endif
\set ON_ERROR_STOP on

\echo 'edge_api/catalog_login_probe.sql: actual catalog LOGIN passed'
