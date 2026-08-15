-- Run through the password-bearing fresh/RLS connection after remote_acl_postflight.
-- Required psql variables: expected_login and test_user_id. URLs stay outside SQL.

\set ON_ERROR_STOP on
\if :{?expected_login}
\else
  \echo 'rls_login_probe.sql requires -v expected_login=<role>'
  \quit 2
\endif
\if :{?test_user_id}
\else
  \echo 'rls_login_probe.sql requires -v test_user_id=<synthetic UUID>'
  \quit 2
\endif

SELECT current_user = :'expected_login' AS rls_identity_ok \gset
\if :rls_identity_ok
\else
  \echo 'RLS login identity mismatch'
  \quit 3
\endif

SELECT (
  SELECT role.rolcanlogin
     AND NOT role.rolinherit
     AND NOT role.rolsuper
     AND NOT role.rolcreatedb
     AND NOT role.rolcreaterole
     AND NOT role.rolreplication
     AND NOT role.rolbypassrls
     AND role.rolconfig @> ARRAY['search_path=pg_catalog, public, extensions']
    FROM pg_roles AS role
   WHERE role.rolname = current_user
) AND (
  SELECT count(*) = 1
     AND bool_and(
       granted.rolname = 'edge_rls_user'
       AND NOT membership.admin_option
       AND NOT membership.inherit_option
       AND membership.set_option
     )
    FROM pg_auth_members AS membership
    JOIN pg_roles AS granted ON granted.oid = membership.roleid
   WHERE membership.member = (SELECT oid FROM pg_roles WHERE rolname = current_user)
) AND has_database_privilege(current_user, current_database(), 'CONNECT')
  AND NOT has_database_privilege(current_user, current_database(), 'CREATE')
  AND NOT has_database_privilege(current_user, current_database(), 'TEMP')
  AND current_setting('search_path') = 'pg_catalog, public, extensions'
  AND nullif(current_setting('request.jwt.claims', true), '') IS NULL
  AND NOT EXISTS (
    SELECT 1
      FROM pg_namespace AS n
     WHERE n.nspname !~ '^pg_'
       AND n.nspname <> 'information_schema'
       AND (
         has_schema_privilege(current_user, n.oid, 'CREATE')
         OR has_schema_privilege(current_user, n.oid, 'USAGE')
       )
  ) AS rls_base_capability_ok
\gset

\if :rls_base_capability_ok
\else
  \echo 'RLS login base role exceeds the SET-only contract'
  \quit 3
\endif

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'test_user_id', 'role', 'authenticated')::text,
  true
);
SELECT current_user = 'authenticated'
   AND auth.uid() = :'test_user_id'::uuid AS rls_claim_ok
\gset
\if :rls_claim_ok
\else
  \echo 'RLS login did not assume authenticated synthetic claims'
  \quit 3
\endif
COMMIT;

SELECT current_user = :'expected_login'
   AND nullif(current_setting('request.jwt.claims', true), '') IS NULL
  AS rls_commit_reset_ok
\gset
\if :rls_commit_reset_ok
\else
  \echo 'RLS login leaked role or claims after commit'
  \quit 3
\endif

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'test_user_id', 'role', 'authenticated')::text,
  true
);
\set ON_ERROR_STOP off
SELECT 1 / 0;
\if :ERROR
\else
  \echo 'RLS rollback probe did not force a transaction error'
  \quit 3
\endif
ROLLBACK;
\set ON_ERROR_STOP on

SELECT current_user = :'expected_login'
   AND nullif(current_setting('request.jwt.claims', true), '') IS NULL
  AS rls_rollback_reset_ok
\gset
\if :rls_rollback_reset_ok
\else
  \echo 'RLS login leaked role or claims after rollback'
  \quit 3
\endif

\echo 'edge_api/rls_login_probe.sql: actual fresh/RLS LOGIN passed'
