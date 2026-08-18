-- Cloudflare Phase 1 remote effective-ACL provisioning gate.
--
-- Runner:
--   psql "$REMOTE_DB_URL" -X -v ON_ERROR_STOP=1 \
--     -f supabase/tests/edge_api/catalog_roles_remote_conformance_test.sql
--
-- Run after migrations 00481-00485 have been applied to the target database.
-- There is no privileged second phase to wait for: the platform-admin artifact
-- that this gate used to require was retired as unrunnable on Supabase Cloud
-- (`postgres` is rolsuper = false and cannot become supabase_admin), and its
-- surviving record is the signed exception registry plus
-- docs/engineering/public-acl-residual-census.md.
--
-- The gate reads the catalog only. It creates three session-local temporary
-- objects (the registry and its two derived views, via the \ir below) before
-- the read-only transaction opens, and nothing persistent: no role, no data, no
-- ACL, no seed. The temporary objects need database TEMP, which the database
-- owner holds intrinsically — 00483's revoke of TEMPORARY from PUBLIC does not
-- affect the `postgres` connection this gate is run on. Failures report
-- aggregate counts only; no catalog object or customer identifier is emitted.
--
-- ── WHAT CHANGED, AND WHY ───────────────────────────────────────────────────
--
-- This gate used to compute twelve counters, two of which could never reach
-- zero on Supabase Cloud. A gate that is red by construction is a gate that
-- gets waived, so the two were re-scoped rather than deleted:
--
--   • `owner_default_recurrence` required a pg_default_acl row for each of six
--     reserved owners. `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin`
--     needs membership in that role, which `postgres` does not have and cannot
--     grant itself. 00483 hardens the three owners it can lawfully SET
--     (postgres, supabase_functions_admin, supabase_realtime_admin) and that is
--     the whole of what this principal can assert. The counter now covers those
--     three; the other three are the platform's, not ours.
--
--   • `routine_public` counted every PUBLIC EXECUTE privilege in every
--     non-system schema, reachable or not. Post-00483 the residual is entirely
--     supabase_admin-owned and permanent from this side. The raw count is
--     replaced by two capability-shaped invariants (below), and the reachable,
--     unregistered part of it is what those invariants measure.
--
-- Everything else is kept, including all six *_effective counters — they are
-- the only proof that `edge_catalog_reader` reaches exactly one view — plus
-- membership_shape, required_rls_membership and catalog_shape.
--
-- Every check now filters on schema USAGE as well as the object grant. A PUBLIC
-- privilege inside a schema PUBLIC cannot enter is inert; counting it overstates
-- the exposure by roughly an order of magnitude and buries the real residual.
--
-- ── THE TWO NEW INVARIANTS ──────────────────────────────────────────────────
--
--   A. Zero PUBLIC-reachable routines that can act outside the caller's own
--      privilege: every SECURITY DEFINER routine, plus a named
--      out-of-band-effect set. `net.http_post` is SECURITY INVOKER, yet the
--      request it enqueues is performed by the privileged pg_net background
--      worker, outside the caller's transaction and outside RLS. Keying this
--      gate on `prosecdef` would bless the actual hole, so it keys on effect.
--
--   B. Zero PUBLIC-writable relations.
--
--   C. Zero storage.objects policies with role list {public} outside the
--      registry. Storage policies are not schema-gated, so they cannot ride A's
--      reachability filter; `anon` holds its own explicit privileges on
--      storage.objects and a {public} role list applies to it. Added because
--      the 28 storage_policy registry rows were otherwise decorative — nothing
--      referenced them — and that is the class that produced this programme's
--      earlier false pass.
--
-- Both are defined once in public_acl_exception_registry.sql and are counted
-- identically by catalog_roles_test.sql, so the local gate and this one cannot
-- diverge — a divergence is how a green local becomes a broken staging.
--
-- The registry is the exception list, matched by exact signature and signed.
-- Its companion catalog_roles_remote_conformance_negative_test.sql proves this
-- predicate still fails against a deliberately broken database.

\set ON_ERROR_STOP on
\set QUIET 1

\ir public_acl_exception_registry.sql

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
-- ── PUBLIC-derived counters, reachability-filtered and registry-exempt ──────
public_grants AS (
  SELECT
    count(*) FILTER (WHERE object_class = 'schema') AS schema_public,
    count(*) FILTER (WHERE object_class = 'relation') AS relation_public,
    count(*) FILTER (WHERE object_class = 'sequence') AS sequence_public,
    count(*) FILTER (WHERE object_class = 'column') AS column_public
  FROM public_acl_public_grant_finding
),
-- ── Effective-ACL counters for the two capability roles ─────────────────────
role_effective AS (
  SELECT
    count(*) FILTER (WHERE object_class = 'schema') AS schema_effective,
    count(*) FILTER (WHERE object_class = 'relation') AS relation_effective,
    count(*) FILTER (WHERE object_class = 'sequence') AS sequence_effective,
    count(*) FILTER (WHERE object_class = 'column') AS column_effective,
    count(*) FILTER (WHERE object_class = 'routine') AS routine_effective
  FROM public_acl_role_effective_finding
),
-- ── Invariants A and B ──────────────────────────────────────────────────────
capability AS (
  SELECT
    count(*) FILTER (WHERE invariant = 'A') AS out_of_band_reachable,
    count(*) FILTER (WHERE invariant = 'B') AS public_writable,
    count(*) FILTER (WHERE invariant = 'C') AS unregistered_storage_policies
  FROM public_acl_capability_findings
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
  -- Re-scoped twice. The original form demanded a pg_default_acl row for six
  -- reserved owners including supabase_auth_admin, supabase_storage_admin and
  -- supabase_admin; ALTER DEFAULT PRIVILEGES FOR ROLE <owner> requires
  -- membership `postgres` does not hold on Supabase Cloud, so those three were
  -- unsatisfiable and were dropped.
  --
  -- The second re-scope applies the SAME platform discriminator 00483 itself
  -- uses. 00483 hardens the future-default of an owner only when `postgres`
  -- holds SET on it; on a hosted branch `postgres` is not a member of
  -- supabase_functions_admin / supabase_realtime_admin, so 00483 records those
  -- two as accepted residuals and leaves their future-default intact. A gate
  -- that then demanded the hardening would fail a migration that behaved
  -- correctly and did exactly what Kody's Blocker-1 ruling requires. So an
  -- owner is scored red only if `postgres` COULD have hardened it and it is
  -- still unhardened. A missing reserved role stays red unconditionally.
  --
  -- Local behaviour is unchanged: locally `postgres` holds SET on all three,
  -- the discriminator admits all three, and 00483 hardened all three, so this
  -- counter is 0 exactly as before. On a hosted branch only postgres is
  -- required, postgres is hardened, and the counter is 0 there too.
  SELECT count(*) AS unexpected
  FROM unnest(ARRAY[
    'postgres',
    'supabase_functions_admin',
    'supabase_realtime_admin'
  ]::text[]) AS expected(role_name)
  LEFT JOIN pg_roles AS owner ON owner.rolname = expected.role_name
  LEFT JOIN pg_default_acl AS d
    ON d.defaclrole = owner.oid
   AND d.defaclnamespace = 0
   AND d.defaclobjtype = 'f'
  WHERE owner.oid IS NULL
     OR (
       pg_has_role('postgres', expected.role_name, 'SET')
       AND (
         d.oid IS NULL
         OR EXISTS (
           SELECT 1
           FROM aclexplode(d.defaclacl) AS acl
           WHERE acl.grantee = 0
             AND acl.privilege_type = 'EXECUTE'
         )
       )
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
    public_grants.schema_public + role_effective.schema_effective
      + catalog_required.schema_missing AS schema_acl,
    public_grants.relation_public + role_effective.relation_effective
      + catalog_required.relation_missing AS relation_acl,
    public_grants.column_public + role_effective.column_effective AS column_acl,
    catalog_shape.unexpected AS surface_shape,
    public_grants.sequence_public + role_effective.sequence_effective
      AS sequence_acl,
    role_effective.routine_effective AS routine_acl,
    membership_shape.unexpected
      + (required_rls_membership.actual <> 1)::integer AS membership_acl,
    default_acl_public.unexpected
      + owner_default_recurrence.unexpected AS default_acl,
    capability.out_of_band_reachable AS capability_acl,
    capability.public_writable AS writable_acl,
    capability.unregistered_storage_policies AS policy_acl
  FROM role_oids
  CROSS JOIN surface
  CROSS JOIN role_shape
  CROSS JOIN database_public
  CROSS JOIN database_effective
  CROSS JOIN catalog_required
  CROSS JOIN public_grants
  CROSS JOIN role_effective
  CROSS JOIN capability
  CROSS JOIN catalog_shape
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
    AND capability_acl = 0
    AND writable_acl = 0
    AND policy_acl = 0
  ) AS cf_remote_acl_ok,
  format(
    'REMOTE ACL CONFORMANCE FAILED: missing_roles=%s missing_surfaces=%s role_shape=%s database_acl=%s schema_acl=%s relation_acl=%s column_acl=%s surface_shape=%s sequence_acl=%s routine_acl=%s membership_acl=%s default_acl=%s capability_acl=%s writable_acl=%s policy_acl=%s',
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
    default_acl,
    capability_acl,
    writable_acl,
    policy_acl
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
