-- ═══════════════════════════════════════════════════════════════════════════
-- 00481 — Edge API catalog roles and public projection
--
-- Creates only NOLOGIN capability roles. Environment-specific LOGIN roles
-- and passwords are provisioned out of band and never enter migrations.
-- The cacheable catalog role can read one security-barrier projection; the
-- fresh authenticated role can only SET ROLE to Supabase's authenticated
-- role, preserving the existing products RLS policies and JWT-claim contract.
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  role_name text;
  membership record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edge_catalog_reader') THEN
    CREATE ROLE edge_catalog_reader
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOLOGIN NOREPLICATION NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edge_rls_user') THEN
    CREATE ROLE edge_rls_user
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOLOGIN NOREPLICATION NOBYPASSRLS;
  END IF;

  FOREACH role_name IN ARRAY ARRAY['edge_catalog_reader', 'edge_rls_user']
  LOOP
    IF (SELECT rolsuper FROM pg_roles WHERE rolname = role_name) THEN
      IF (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
        EXECUTE format('ALTER ROLE %I NOSUPERUSER', role_name);
      ELSE
        RAISE EXCEPTION
          '00481 cannot safely reconcile pre-existing SUPERUSER role %; a platform administrator must demote it before retrying',
          role_name;
      END IF;
    END IF;

    EXECUTE format(
      'ALTER ROLE %I NOCREATEDB NOCREATEROLE NOINHERIT NOLOGIN NOREPLICATION NOBYPASSRLS',
      role_name
    );
  END LOOP;

  FOR membership IN
    SELECT granted.rolname AS granted_role, member.rolname AS member_role
      FROM pg_auth_members AS am
      JOIN pg_roles AS granted ON granted.oid = am.roleid
      JOIN pg_roles AS member ON member.oid = am.member
     WHERE am.grantor = (SELECT oid FROM pg_roles WHERE rolname = current_user)
       AND (
         member.rolname IN ('edge_catalog_reader', 'edge_rls_user')
         OR granted.rolname IN ('edge_catalog_reader', 'edge_rls_user')
       )
  LOOP
    EXECUTE format(
      'REVOKE %I FROM %I GRANTED BY %I',
      membership.granted_role,
      membership.member_role,
      current_user
    );
  END LOOP;

  IF EXISTS (
    SELECT 1
      FROM pg_auth_members AS am
      JOIN pg_roles AS granted ON granted.oid = am.roleid
      JOIN pg_roles AS member ON member.oid = am.member
      JOIN pg_roles AS grantor ON grantor.oid = am.grantor
     WHERE (
       member.rolname IN ('edge_catalog_reader', 'edge_rls_user')
       OR granted.rolname IN ('edge_catalog_reader', 'edge_rls_user')
     )
       AND NOT (
         granted.rolname IN ('edge_catalog_reader', 'edge_rls_user')
         AND member.rolname = current_user
         AND grantor.rolname = 'supabase_admin'
         AND am.admin_option
         AND NOT am.inherit_option
         AND NOT am.set_option
       )
  ) THEN
    RAISE EXCEPTION
      '00481 found an edge capability membership granted by another administrator; remove it before retrying';
  END IF;
END
$$;

CREATE OR REPLACE VIEW public.edge_catalog_products
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  p.id,
  p.name,
  p.brand,
  p.category,
  p.price_retail,
  p.images,
  p.short_description,
  p.patina_managed,
  p.status
FROM public.products AS p
WHERE p.layer = 'catalog'
  AND p.status = 'published';

COMMENT ON VIEW public.edge_catalog_products IS
  '00481: approved public catalog projection for the Cloudflare Edge API; hard-filtered to catalog/published products.';

REVOKE ALL PRIVILEGES ON TABLE public.edge_catalog_products
  FROM PUBLIC, anon, authenticated, service_role, edge_rls_user;
REVOKE ALL PRIVILEGES ON TABLE public.products FROM edge_catalog_reader, edge_rls_user;

GRANT USAGE ON SCHEMA public TO edge_catalog_reader;
GRANT SELECT ON TABLE public.edge_catalog_products TO edge_catalog_reader;

GRANT authenticated TO edge_rls_user WITH INHERIT FALSE, SET TRUE;

COMMENT ON ROLE edge_catalog_reader IS
  '00481: NOLOGIN/NOBYPASSRLS capability role. Provisioning is blocked until the effective-PUBLIC-ACL preflight proves that only public.edge_catalog_products is reachable. Environment LOGIN is out of band.';
COMMENT ON ROLE edge_rls_user IS
  '00481: NOLOGIN/NOBYPASSRLS capability role; may SET ROLE authenticated for transaction-local Supabase JWT claims. Environment LOGIN is out of band.';
