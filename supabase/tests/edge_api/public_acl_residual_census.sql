-- public_acl_residual_census.sql
--
-- Read-only census of residual PUBLIC privileges.
--
-- Reachability rule enforced everywhere below: a PUBLIC object privilege only
-- matters when PUBLIC can also enter the schema that holds the object. Checks
-- that skip the schema USAGE test overstate the exposure by an order of
-- magnitude, because most Supabase-managed schemas carry PUBLIC object
-- privileges inside schemas PUBLIC cannot enter.
--
-- Safe against any database, including production: pure SELECT, no DDL, no DML.
--
-- Run:  psql "<conn>" -X -v ON_ERROR_STOP=1 -f supabase/tests/edge_api/public_acl_residual_census.sql

BEGIN READ ONLY;


-- ===========================================================================
-- SECTION 0 - schema reachability
-- Which schemas does PUBLIC actually hold USAGE on? Everything downstream
-- keys off this. Expect exactly two application-relevant schemas: net, public.
-- ===========================================================================
SELECT
  '0. schema reachability'                                     AS section,
  n.nspname                                                    AS schema,
  pg_catalog.has_schema_privilege('public', n.oid, 'USAGE')    AS public_has_usage,
  coalesce(n.nspacl::text, '(owner default)')                  AS schema_acl
FROM pg_catalog.pg_namespace n
WHERE n.nspname NOT LIKE 'pg\_%'
  AND n.nspname <> 'information_schema'
ORDER BY public_has_usage DESC, n.nspname;


-- ===========================================================================
-- SECTION A - revocable, must reach zero
-- Routines in `public` owned by `postgres` that PUBLIC can actually reach.
-- These are ours: `postgres` owns them, so the PUBLIC EXECUTE privilege on
-- them is ours to withdraw.
-- Reference: 136 reachable, 80 of them SECURITY DEFINER.
-- ===========================================================================
SELECT
  'A. revocable summary'                              AS section,
  count(*)                                            AS reachable_routines,
  count(*) FILTER (WHERE p.prosecdef)                 AS security_definer,
  count(*) FILTER (WHERE NOT p.prosecdef)             AS security_invoker
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proowner = 'postgres'::regrole
  AND pg_catalog.has_schema_privilege('public', n.oid, 'USAGE')
  AND pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE');


-- Per-routine listing for the prose census.
SELECT
  'A. revocable detail'                                        AS section,
  n.nspname                                                    AS schema,
  p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' AS object,
  pg_catalog.pg_get_userbyid(p.proowner)                       AS owner,
  p.prosecdef                                                  AS prosecdef,
  coalesce(p.proacl::text, '(null - default PUBLIC EXECUTE)')  AS acl
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proowner = 'postgres'::regrole
  AND pg_catalog.has_schema_privilege('public', n.oid, 'USAGE')
  AND pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE')
ORDER BY p.prosecdef DESC, p.proname;


-- GO / NO-GO BLOCKER.
-- Every routine in section A must already carry its own EXECUTE privilege for
-- anon / authenticated / service_role. Where that holds, withdrawing PUBLIC
-- EXECUTE costs no caller any access. This query emits the routines for which
-- it does NOT hold.
-- Expected output: zero rows. Any row here blocks the change.
WITH reachable AS (
  SELECT p.oid, n.nspname, p.proname, p.proacl, p.prosecdef
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proowner = 'postgres'::regrole
    AND pg_catalog.has_schema_privilege('public', n.oid, 'USAGE')
    AND pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE')
), explicit AS (
  SELECT
    r.oid,
    count(*) FILTER (
      WHERE a.privilege_type = 'EXECUTE'
        AND a.grantee <> 0
        AND pg_catalog.pg_get_userbyid(a.grantee)
            IN ('anon', 'authenticated', 'service_role')
    ) AS named_role_privileges
  FROM reachable r
  LEFT JOIN LATERAL pg_catalog.aclexplode(r.proacl) a ON true
  GROUP BY r.oid
)
SELECT
  'A. BLOCKER - would lose access'   AS section,
  r.nspname                          AS schema,
  r.proname                          AS object,
  r.prosecdef                        AS prosecdef,
  coalesce(r.proacl::text, '(null)') AS acl,
  e.named_role_privileges            AS named_role_privileges
FROM reachable r
JOIN explicit e ON e.oid = r.oid
WHERE e.named_role_privileges = 0
ORDER BY r.proname;


-- ===========================================================================
-- SECTION B - accepted, invoker-only
-- Reachable routines owned by `supabase_admin`. `postgres` does not own them,
-- so we cannot withdraw their PUBLIC EXECUTE privilege; only Supabase can.
-- All are SECURITY INVOKER, so they execute as the caller and inherit the
-- caller's RLS. Accepted.
-- Reference: 149 in `public` (pgvector + pg_trgm), 12 in `net`.
-- ===========================================================================
SELECT
  'B. invoker-only summary'                   AS section,
  n.nspname                                   AS schema,
  count(*)                                    AS reachable_routines,
  count(*) FILTER (WHERE p.prosecdef)         AS security_definer
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE p.proowner = 'supabase_admin'::regrole
  AND n.nspname IN ('public', 'net')
  AND pg_catalog.has_schema_privilege('public', n.oid, 'USAGE')
  AND pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE')
GROUP BY n.nspname
ORDER BY n.nspname;


-- Grouped by owning extension, which is how the prose census lists them.
SELECT
  'B. invoker-only by extension'      AS section,
  n.nspname                           AS schema,
  coalesce(e.extname, '(standalone)') AS extension,
  count(*)                            AS reachable_routines,
  count(*) FILTER (WHERE p.prosecdef) AS security_definer
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN pg_catalog.pg_depend d
       ON d.objid = p.oid
      AND d.classid = 'pg_proc'::regclass
      AND d.deptype = 'e'
LEFT JOIN pg_catalog.pg_extension e ON e.oid = d.refobjid
WHERE p.proowner = 'supabase_admin'::regrole
  AND n.nspname IN ('public', 'net')
  AND pg_catalog.has_schema_privilege('public', n.oid, 'USAGE')
  AND pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE')
GROUP BY n.nspname, coalesce(e.extname, '(standalone)')
ORDER BY n.nspname, reachable_routines DESC;


-- ===========================================================================
-- SECTION C - accepted with named risk
-- ===========================================================================

-- C1. Relations PUBLIC can read or write, in schemas PUBLIC can enter.
-- `net.http_request_queue` and `net._http_response` carry full PUBLIC DML.
-- The queue transports service_role bearer headers; see the prose census.
SELECT
  'C1. PUBLIC-accessible relations'                  AS section,
  n.nspname                                          AS schema,
  c.relname                                          AS object,
  c.relkind                                          AS relkind,
  pg_catalog.pg_get_userbyid(c.relowner)             AS owner,
  coalesce(c.relacl::text, '(owner default)')        AS acl,
  pg_catalog.has_table_privilege('public', c.oid, 'SELECT') AS pub_select,
  pg_catalog.has_table_privilege('public', c.oid, 'INSERT') AS pub_write_new_rows,
  pg_catalog.has_table_privilege('public', c.oid, 'UPDATE') AS pub_modify_rows,
  pg_catalog.has_table_privilege('public', c.oid, 'DELETE') AS pub_remove_rows,
  c.relrowsecurity                                   AS rls_enabled
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
  AND n.nspname NOT LIKE 'pg\_%'
  AND n.nspname <> 'information_schema'
  AND pg_catalog.has_schema_privilege('public', n.oid, 'USAGE')
  AND (
        pg_catalog.has_table_privilege('public', c.oid, 'SELECT')
     OR pg_catalog.has_table_privilege('public', c.oid, 'INSERT')
     OR pg_catalog.has_table_privilege('public', c.oid, 'UPDATE')
     OR pg_catalog.has_table_privilege('public', c.oid, 'DELETE')
      )
ORDER BY n.nspname, c.relname;


-- C2. Out-of-band-effect routines.
-- These are SECURITY INVOKER, so `prosecdef` reports them as harmless. It is
-- the wrong discriminator here: each one hands work to the pg_net background
-- worker, and the worker performs that work with the worker's own privilege,
-- outside the caller's transaction and outside RLS. Judge them by effect.
SELECT
  'C2. out-of-band effect'                                     AS section,
  n.nspname                                                    AS schema,
  p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' AS object,
  pg_catalog.pg_get_userbyid(p.proowner)                       AS owner,
  p.prosecdef                                                  AS prosecdef,
  coalesce(p.proacl::text, '(null - default PUBLIC EXECUTE)')  AS acl,
  CASE
    WHEN p.proname IN ('http_get', 'http_post', 'http_delete')
      THEN 'enqueues an outbound HTTP request for the pg_net worker'
    WHEN p.proname IN ('wake', 'worker_restart', 'wait_until_running', 'check_worker_is_up')
      THEN 'controls the pg_net background worker lifecycle'
    WHEN p.proname IN ('_await_response', '_http_collect_response', 'http_collect_response')
      THEN 'reads responses the worker fetched, across all callers'
    ELSE 'pg_net helper'
  END                                                          AS effect
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'net'
  AND pg_catalog.has_schema_privilege('public', n.oid, 'USAGE')
  AND pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE')
ORDER BY p.proname;


-- C3. Our own reachable routines whose body drives pg_net or pg_cron.
-- These are the service_role-disclosure carriers named in the prose census.
SELECT
  'C3. service_role carriers'                                  AS section,
  n.nspname                                                    AS schema,
  p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' AS object,
  pg_catalog.pg_get_userbyid(p.proowner)                       AS owner,
  p.prosecdef                                                  AS prosecdef,
  coalesce(p.proacl::text, '(null)')                           AS acl,
  (pg_catalog.pg_get_functiondef(p.oid) ~* 'net\.http_(get|post|delete)') AS drives_pg_net,
  (pg_catalog.pg_get_functiondef(p.oid) ~* 'cron\.schedule')             AS drives_pg_cron
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proowner = 'postgres'::regrole
  AND p.prokind = 'f'
  AND pg_catalog.has_schema_privilege('public', n.oid, 'USAGE')
  AND pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE')
  AND pg_catalog.pg_get_functiondef(p.oid) ~* '(net\.http_(get|post|delete)|cron\.schedule)'
ORDER BY p.proname;


-- C4. Standing volume behind the named risk.
-- The mitigating claim is that the queue drains, so service_role headers are
-- in transit rather than at rest. This measures that claim at census time.
SELECT
  'C4. queue depth'                                     AS section,
  (SELECT count(*) FROM net.http_request_queue)         AS request_queue_rows,
  (SELECT count(*) FROM net._http_response)             AS retained_response_rows,
  (SELECT count(*) FROM cron.job)                       AS cron_jobs_total,
  (SELECT count(*) FROM cron.job
    WHERE command ~* '(invoke_edge_function|net\.http_)') AS cron_jobs_driving_net;


-- ===========================================================================
-- SECTION D - unreachable
-- PUBLIC object privileges that sit inside schemas PUBLIC cannot enter. They
-- look alarming in a naive audit and are inert. Recorded here so a future
-- reader recognises them and does not re-open the question.
-- Note in particular: cron.schedule / cron.unschedule DO carry PUBLIC EXECUTE,
-- and are still unreachable, because `cron` withholds schema USAGE from
-- PUBLIC. Only `postgres` (and its members) can call them.
-- ===========================================================================
SELECT
  'D. unreachable routine privileges'                        AS section,
  n.nspname                                                  AS schema,
  count(*)                                                   AS public_execute_privileges,
  pg_catalog.has_schema_privilege('public', n.oid, 'USAGE')  AS public_has_usage,
  string_agg(DISTINCT p.proname, ', ' ORDER BY p.proname)    AS routines
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE NOT pg_catalog.has_schema_privilege('public', n.oid, 'USAGE')
  AND pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE')
GROUP BY n.nspname, n.oid
ORDER BY count(*) DESC, n.nspname;


SELECT
  'D. unreachable relation privileges'                       AS section,
  n.nspname                                                  AS schema,
  count(*)                                                   AS relations,
  pg_catalog.has_schema_privilege('public', n.oid, 'USAGE')  AS public_has_usage
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
  AND NOT pg_catalog.has_schema_privilege('public', n.oid, 'USAGE')
  AND (
        pg_catalog.has_table_privilege('public', c.oid, 'SELECT')
     OR pg_catalog.has_table_privilege('public', c.oid, 'INSERT')
     OR pg_catalog.has_table_privilege('public', c.oid, 'UPDATE')
     OR pg_catalog.has_table_privilege('public', c.oid, 'DELETE')
      )
GROUP BY n.nspname, n.oid
ORDER BY count(*) DESC, n.nspname;


-- ===========================================================================
-- SECTION E - storage.objects policies the repository defers and never narrows
--
-- A distinct category from sections A-D. Those are PUBLIC privileges we cannot
-- withdraw without superuser. This is a promise the repository made and did not
-- keep: migration 00484 states the PUBLIC policies on storage.objects "are
-- intentionally narrowed in the privileged 00483 platform-admin phase", but
-- supabase/platform-admin/00483_public_acl_allowlist.sql contains no policy DDL
-- at all, and that script is retired as unrunnable on Supabase Cloud
-- (`postgres` is rolsuper = false and cannot become supabase_admin). The
-- deferral therefore points at a step that cannot happen.
--
-- Reachability warning: RLS policies are NOT schema-gated the way routines are.
-- Section D concluded the 17 storage routines are unreachable because PUBLIC
-- lacks storage schema USAGE. That reasoning does NOT carry to policies, because
-- `anon` and `authenticated` hold their own explicit schema USAGE and table
-- privileges, and a policy whose role list is {public} applies to every role
-- including `anon`. E1 measures that difference rather than assuming it.
-- ===========================================================================

-- E1. Who can actually reach storage.objects.
-- PUBLIC cannot, but anon/authenticated can, via their own explicit privileges.
SELECT
  'E1. storage.objects reachability'                                  AS section,
  role_name                                                           AS role,
  pg_catalog.has_schema_privilege(role_name, 'storage', 'USAGE')      AS schema_usage,
  pg_catalog.has_table_privilege(role_name, 'storage.objects', 'SELECT') AS can_read,
  pg_catalog.has_table_privilege(role_name, 'storage.objects', 'INSERT') AS can_add,
  pg_catalog.has_table_privilege(role_name, 'storage.objects', 'UPDATE') AS can_modify,
  pg_catalog.has_table_privilege(role_name, 'storage.objects', 'DELETE') AS can_remove
FROM (VALUES ('public'), ('anon'), ('authenticated'), ('service_role')) AS r(role_name)
ORDER BY role_name;


-- E2. Policies on storage.objects whose role list is {public}, classified by
-- whether the predicate actually constrains the caller's identity.
-- `bucket_is_public` matters: on a public bucket, objects are already served
-- over the unauthenticated CDN path, so a permissive read policy adds nothing.
SELECT
  'E2. {public} policies on storage.objects'          AS section,
  p.policyname                                        AS policy,
  p.cmd                                               AS command,
  p.roles::text                                       AS roles,
  b.public                                            AS bucket_is_public,
  coalesce(p.qual, p.with_check)                      AS predicate,
  CASE
    WHEN (coalesce(p.qual,'') || coalesce(p.with_check,'')) ~* 'auth\.uid|is_org_admin_or_owner|is_studio_comember|is_design_studio_comember|is_project_team_member|user_has_role'
      THEN 'constrained - predicate binds the caller identity'
    WHEN b.public IS TRUE
      THEN 'unconstrained, but bucket is public - no exposure beyond the bucket flag'
    ELSE 'UNCONSTRAINED ON A PRIVATE BUCKET - reachable by anon'
  END                                                 AS assessment
FROM pg_catalog.pg_policies p
LEFT JOIN storage.buckets b
       ON b.id = (regexp_match(coalesce(p.qual, p.with_check), 'bucket_id = ''([^'']+)'''))[1]
WHERE p.schemaname = 'storage'
  AND p.tablename = 'objects'
  AND 'public' = ANY(string_to_array(btrim(p.roles::text, '{}'), ','))
ORDER BY
  CASE WHEN (coalesce(p.qual,'') || coalesce(p.with_check,'')) ~* 'auth\.uid|is_org_admin_or_owner|is_studio_comember|is_design_studio_comember|is_project_team_member|user_has_role' THEN 2
       WHEN b.public IS TRUE THEN 1 ELSE 0 END,
  p.policyname;


-- E3. The go/no-go line for this section.
-- Any {public} policy on a PRIVATE bucket whose predicate does not bind the
-- caller's identity is readable by `anon`. Expected: exactly one, the mood-board
-- read policy, which is the accepted exception recorded in the prose census.
SELECT
  'E3. anon-reachable on private buckets'    AS section,
  p.policyname                               AS policy,
  p.cmd                                      AS command,
  b.id                                       AS bucket,
  b.public                                   AS bucket_is_public,
  coalesce(p.qual, p.with_check)             AS predicate
FROM pg_catalog.pg_policies p
JOIN storage.buckets b
  ON b.id = (regexp_match(coalesce(p.qual, p.with_check), 'bucket_id = ''([^'']+)'''))[1]
WHERE p.schemaname = 'storage'
  AND p.tablename = 'objects'
  AND 'public' = ANY(string_to_array(btrim(p.roles::text, '{}'), ','))
  AND b.public IS FALSE
  AND (coalesce(p.qual,'') || coalesce(p.with_check,'')) !~* 'auth\.uid|is_org_admin_or_owner|is_studio_comember|is_design_studio_comember|is_project_team_member|user_has_role'
ORDER BY p.policyname;


-- E4. Totals, so a reader can see the "four" in the 00484 comment is not a
-- count this database supports under any reading.
SELECT
  'E4. policy totals'                                                    AS section,
  count(*)                                                               AS policies_total,
  count(*) FILTER (
    WHERE 'public' = ANY(string_to_array(btrim(roles::text, '{}'), ','))
  )                                                                      AS role_public_policies,
  count(*) FILTER (
    WHERE 'public' = ANY(string_to_array(btrim(roles::text, '{}'), ','))
      AND coalesce(qual,'') !~* 'auth\.uid'
      AND coalesce(with_check,'') !~* 'auth\.uid'
  )                                                                      AS role_public_without_auth_uid
FROM pg_catalog.pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects';


ROLLBACK;
