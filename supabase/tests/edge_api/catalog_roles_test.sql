-- Cloudflare Phase 1 database contract conformance (migration 00481).
-- Run with psql -v ON_ERROR_STOP=1 after pnpm supabase:reset.

DO $$
DECLARE
  actual_columns text[];
  relation_options text[];
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'edge_catalog_reader'
      AND rolcanlogin = false
      AND rolbypassrls = false
      AND rolinherit = false
  ), 'edge_catalog_reader must be NOLOGIN, NOBYPASSRLS, and NOINHERIT';

  ASSERT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'edge_rls_user'
      AND rolcanlogin = false
      AND rolbypassrls = false
      AND rolinherit = false
  ), 'edge_rls_user must be NOLOGIN, NOBYPASSRLS, and NOINHERIT';

  ASSERT pg_has_role('edge_rls_user', 'authenticated', 'SET'),
    'edge_rls_user must be allowed to SET ROLE authenticated';
  ASSERT NOT pg_has_role('edge_rls_user', 'service_role', 'SET'),
    'edge_rls_user must not be allowed to SET ROLE service_role';
  ASSERT NOT pg_has_role('edge_rls_user', 'anon', 'SET'),
    'edge_rls_user must not be allowed to SET ROLE anon';
  ASSERT NOT pg_has_role('edge_rls_user', 'edge_catalog_reader', 'SET'),
    'edge_rls_user must not inherit the catalog capability';
  ASSERT NOT pg_has_role('edge_catalog_reader', 'authenticated', 'SET'),
    'edge_catalog_reader must not assume authenticated';

  ASSERT has_table_privilege('edge_catalog_reader', 'public.edge_catalog_products', 'SELECT'),
    'edge_catalog_reader must be able to SELECT the catalog projection';
  ASSERT NOT has_table_privilege('edge_catalog_reader', 'public.products', 'SELECT'),
    'edge_catalog_reader must not SELECT products directly';
  ASSERT NOT has_table_privilege('edge_catalog_reader', 'public.edge_catalog_products', 'INSERT'),
    'edge_catalog_reader must not INSERT through the catalog projection';
  ASSERT NOT has_table_privilege('edge_rls_user', 'public.products', 'SELECT'),
    'edge_rls_user must have no direct products privilege before SET ROLE';
  ASSERT NOT has_table_privilege('edge_rls_user', 'public.edge_catalog_products', 'SELECT'),
    'edge_rls_user must not inherit the public-cache projection';
  ASSERT NOT has_table_privilege('authenticated', 'public.edge_catalog_products', 'SELECT'),
    'authenticated must not receive the public-cache projection directly';
  ASSERT NOT has_table_privilege('anon', 'public.edge_catalog_products', 'SELECT'),
    'anon must not receive the public-cache projection directly';

  SELECT array_agg(column_name ORDER BY ordinal_position)
    INTO actual_columns
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'edge_catalog_products';

  ASSERT actual_columns = ARRAY[
    'id', 'name', 'brand', 'category', 'price_retail', 'images',
    'short_description', 'patina_managed', 'status'
  ]::text[], 'edge catalog projection exposes an unexpected column set';

  SELECT reloptions INTO relation_options
    FROM pg_class
   WHERE oid = 'public.edge_catalog_products'::regclass;
  ASSERT 'security_barrier=true' = ANY(relation_options),
    'edge_catalog_products must be a security-barrier view';

  ASSERT (
    SELECT count(*) = 2
      FROM auth.users
     WHERE id IN (
       'cf100000-0000-4000-8000-000000000001',
       'cf100000-0000-4000-8000-000000000002'
     )
       AND email LIKE 'cf-phase1-%@patina.invalid'
  ), 'synthetic Phase 1 accounts are missing';

  ASSERT (
    SELECT count(*) = 1
      FROM public.organizations
     WHERE id = 'cf120000-0000-4000-8000-000000000001'
       AND slug = 'cf-phase1-synthetic-studio'
       AND status = 'active'
  ), 'synthetic Phase 1 organization is missing';

  ASSERT (
    SELECT count(*) = 1
      FROM svc_media.media_assets
     WHERE id = 'cf140000-0000-4000-8000-000000000001'
       AND raw_key = 'phase1/catalog-published/original.jpg'
       AND mime_type = 'image/jpeg'
  ), 'synthetic media metadata fixture is missing';

  ASSERT (
    SELECT count(*) = 1
      FROM public.proposal_captures
     WHERE id = 'cf150000-0000-4000-8000-000000000001'
       AND designer_id = 'cf100000-0000-4000-8000-000000000001'
       AND status = 'inbox'
  ), 'synthetic proposal capture fixture is missing';

  ASSERT (
    SELECT count(*) = 1
      FROM public.field_captures
     WHERE id = 'cf160000-0000-4000-8000-000000000001'
       AND designer_id = 'cf100000-0000-4000-8000-000000000001'
       AND status = 'inbox'
  ), 'synthetic field capture fixture is missing';
END
$$;

BEGIN;
SET LOCAL ROLE edge_catalog_reader;

DO $$
DECLARE
  visible_ids uuid[];
BEGIN
  SELECT array_agg(id ORDER BY id)
    INTO visible_ids
    FROM public.edge_catalog_products
   WHERE id IN (
     'cf130000-0000-4000-8000-000000000001',
     'cf130000-0000-4000-8000-000000000002',
     'cf130000-0000-4000-8000-000000000003',
     'cf130000-0000-4000-8000-000000000004'
   );

  ASSERT visible_ids = ARRAY['cf130000-0000-4000-8000-000000000001'::uuid],
    'catalog projection must expose only the published catalog fixture';
  ASSERT (
    SELECT bool_and(status = 'published' AND patina_managed)
      FROM public.edge_catalog_products
  ), 'catalog projection returned a non-published or unmanaged row';

  BEGIN
    PERFORM count(*) FROM public.products;
    RAISE EXCEPTION 'edge_catalog_reader unexpectedly selected products directly';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM count(*) FROM public.proposal_captures;
    RAISE EXCEPTION 'edge_catalog_reader unexpectedly selected proposal captures';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM count(*) FROM public.field_captures;
    RAISE EXCEPTION 'edge_catalog_reader unexpectedly selected field captures';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM count(*) FROM svc_media.media_assets;
    RAISE EXCEPTION 'edge_catalog_reader unexpectedly selected media metadata';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$$;

COMMIT;

BEGIN;
SET LOCAL ROLE edge_rls_user;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cf100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

DO $$
DECLARE
  vector_distance double precision;
BEGIN
  ASSERT auth.uid() = 'cf100000-0000-4000-8000-000000000001'::uuid,
    'first pooled transaction did not install Alice JWT claims';
  ASSERT (
    SELECT count(*) = 1 FROM public.products
     WHERE id = 'cf130000-0000-4000-8000-000000000003'
  ), 'Alice must see her personal product';
  ASSERT (
    SELECT count(*) = 1 FROM public.products
     WHERE id = 'cf130000-0000-4000-8000-000000000004'
  ), 'Alice must see her studio product';
  ASSERT (
    SELECT count(*) = 1 FROM public.products
     WHERE id = 'cf130000-0000-4000-8000-000000000001'
  ), 'Alice must see the published catalog product';

  SELECT embedding <=> embedding INTO vector_distance
    FROM public.products
   WHERE id = 'cf130000-0000-4000-8000-000000000001';
  ASSERT abs(vector_distance) < 0.000000001,
    'authenticated pgvector self-distance must be zero';
END
$$;
COMMIT;

BEGIN;
SET LOCAL ROLE edge_rls_user;
DO $$
BEGIN
  ASSERT current_user = 'edge_rls_user',
    'SET LOCAL ROLE leaked beyond the first pooled transaction';
  ASSERT nullif(current_setting('request.jwt.claims', true), '') IS NULL,
    'Alice JWT claims leaked beyond the first pooled transaction';

  BEGIN
    PERFORM count(*) FROM public.products;
    RAISE EXCEPTION 'edge_rls_user unexpectedly retained authenticated privileges';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$$;
COMMIT;

BEGIN;
SET LOCAL ROLE edge_rls_user;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cf100000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

DO $$
BEGIN
  ASSERT auth.uid() = 'cf100000-0000-4000-8000-000000000002'::uuid,
    'second pooled transaction did not install Bob JWT claims';
  ASSERT (
    SELECT count(*) = 0 FROM public.products
     WHERE id = 'cf130000-0000-4000-8000-000000000003'
  ), 'Bob must not see Alice personal product';
  ASSERT (
    SELECT count(*) = 0 FROM public.products
     WHERE id = 'cf130000-0000-4000-8000-000000000004'
  ), 'Bob must not see Alice studio product';
  ASSERT (
    SELECT count(*) = 1 FROM public.products
     WHERE id = 'cf130000-0000-4000-8000-000000000001'
  ), 'Bob must see the published catalog product';
END
$$;
COMMIT;

BEGIN;
SET LOCAL ROLE edge_rls_user;
DO $$
BEGIN
  ASSERT current_user = 'edge_rls_user',
    'SET LOCAL ROLE leaked beyond the second pooled transaction';
  ASSERT nullif(current_setting('request.jwt.claims', true), '') IS NULL,
    'Bob JWT claims leaked beyond the second pooled transaction';
END
$$;
COMMIT;

\echo 'edge_api/catalog_roles_test.sql: all assertions passed'
