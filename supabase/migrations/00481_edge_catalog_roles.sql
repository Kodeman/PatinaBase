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
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edge_catalog_reader') THEN
    CREATE ROLE edge_catalog_reader
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOLOGIN NOREPLICATION NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edge_rls_user') THEN
    CREATE ROLE edge_rls_user
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOLOGIN NOREPLICATION NOBYPASSRLS;
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

GRANT edge_catalog_reader TO postgres WITH INHERIT FALSE, SET TRUE;
GRANT edge_rls_user TO postgres WITH INHERIT FALSE, SET TRUE;

COMMENT ON ROLE edge_catalog_reader IS
  '00481: NOLOGIN/NOBYPASSRLS capability role; SELECT only on public.edge_catalog_products. Environment LOGIN is out of band.';
COMMENT ON ROLE edge_rls_user IS
  '00481: NOLOGIN/NOBYPASSRLS capability role; may SET ROLE authenticated for transaction-local Supabase JWT claims. Environment LOGIN is out of band.';
