-- Real-Postgres contract tests for retained Container authorization (00482).
-- Run after a clean local reset:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/retained_services/authorization_contract_test.sql

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('c4820000-0000-4000-8000-000000000001', 'retained-owner@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c4820000-0000-4000-8000-000000000002', 'retained-other@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c4820000-0000-4000-8000-000000000003', 'retained-member@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c4820000-0000-4000-8000-000000000004', 'retained-removed@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c4820000-0000-4000-8000-000000000005', 'retained-admin@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c4820000-0000-4000-8000-000000000006', 'retained-unassigned@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c4820000-0000-4000-8000-000000000007', 'retained-role-change@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c4820000-0000-4000-8000-000000000008', 'retained-unknown-role@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('c4820000-0000-4000-8000-000000000001', 'retained-owner@test.invalid', 'Retained Owner', now(), now()),
  ('c4820000-0000-4000-8000-000000000002', 'retained-other@test.invalid', 'Retained Other', now(), now()),
  ('c4820000-0000-4000-8000-000000000003', 'retained-member@test.invalid', 'Retained Member', now(), now()),
  ('c4820000-0000-4000-8000-000000000004', 'retained-removed@test.invalid', 'Retained Removed', now(), now()),
  ('c4820000-0000-4000-8000-000000000005', 'retained-admin@test.invalid', 'Retained Admin', now(), now()),
  ('c4820000-0000-4000-8000-000000000006', 'retained-unassigned@test.invalid', 'Retained Unassigned', now(), now()),
  ('c4820000-0000-4000-8000-000000000007', 'retained-role-change@test.invalid', 'Retained Role Change', now(), now()),
  ('c4820000-0000-4000-8000-000000000008', 'retained-unknown-role@test.invalid', 'Retained Unknown Role', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('c4820000-0000-4000-8000-0000000000a1', 'design_studio', 'Retained Active Studio', 'retained-active-studio', 'active'),
  ('c4820000-0000-4000-8000-0000000000b1', 'design_studio', 'Retained Inactive Studio', 'retained-inactive-studio', 'suspended');

INSERT INTO public.organization_members (
  user_id, organization_id, role, status, joined_at
)
VALUES
  ('c4820000-0000-4000-8000-000000000003', 'c4820000-0000-4000-8000-0000000000a1', 'member', 'active', now()),
  ('c4820000-0000-4000-8000-000000000004', 'c4820000-0000-4000-8000-0000000000a1', 'member', 'removed', now()),
  ('c4820000-0000-4000-8000-000000000003', 'c4820000-0000-4000-8000-0000000000b1', 'member', 'active', now());

INSERT INTO public.roles (name, display_name, domain, is_system)
VALUES ('retained_unknown', 'Retained Unknown', 'admin', false)
ON CONFLICT (name) DO NOTHING;

-- The auth-user trigger assigns app_user. Remove it for the explicit missing,
-- role-change, and unknown-role cases before constructing their state.
DELETE FROM public.user_roles
WHERE user_id IN (
  'c4820000-0000-4000-8000-000000000006',
  'c4820000-0000-4000-8000-000000000007',
  'c4820000-0000-4000-8000-000000000008'
);

INSERT INTO public.user_roles (user_id, role_id)
SELECT fixture.user_id, role_row.id
FROM (
  VALUES
    ('c4820000-0000-4000-8000-000000000001'::uuid, 'app_user'),
    ('c4820000-0000-4000-8000-000000000001'::uuid, 'client'),
    ('c4820000-0000-4000-8000-000000000002'::uuid, 'app_user'),
    ('c4820000-0000-4000-8000-000000000002'::uuid, 'independent_designer'),
    ('c4820000-0000-4000-8000-000000000003'::uuid, 'brand_admin'),
    ('c4820000-0000-4000-8000-000000000003'::uuid, 'studio_designer'),
    ('c4820000-0000-4000-8000-000000000004'::uuid, 'brand_admin'),
    ('c4820000-0000-4000-8000-000000000004'::uuid, 'studio_designer'),
    ('c4820000-0000-4000-8000-000000000005'::uuid, 'super_admin'),
    ('c4820000-0000-4000-8000-000000000008'::uuid, 'retained_unknown')
) AS fixture(user_id, role_name)
JOIN public.roles AS role_row ON role_row.name = fixture.role_name
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO public.projects (
  id, name, designer_id, client_id, created_by, studio_id
)
VALUES (
  'c4820000-0000-4000-8000-000000000201',
  'Retained Public Project',
  'c4820000-0000-4000-8000-000000000002',
  'c4820000-0000-4000-8000-000000000001',
  'c4820000-0000-4000-8000-000000000002',
  'c4820000-0000-4000-8000-0000000000a1'
);

INSERT INTO public.project_team_members (
  project_id, user_id, role, assigned_by
)
VALUES (
  'c4820000-0000-4000-8000-000000000201',
  'c4820000-0000-4000-8000-000000000003',
  'support_designer',
  'c4820000-0000-4000-8000-000000000002'
);

INSERT INTO public.products (
  id, name, source_url, captured_by, captured_at, layer, owner_user_id
)
VALUES (
  'c4820000-0000-4000-8000-000000000401',
  'Retained Personal Product',
  'https://test.invalid/retained-personal',
  'c4820000-0000-4000-8000-000000000001',
  now(),
  'personal',
  'c4820000-0000-4000-8000-000000000001'
);

INSERT INTO public.products (
  id, name, source_url, captured_by, captured_at, layer, studio_id,
  vendor_contact, lead_time_weeks, payment_terms, category, usage_notes
)
VALUES (
  'c4820000-0000-4000-8000-000000000402',
  'Retained Studio Product',
  'https://test.invalid/retained-studio',
  'c4820000-0000-4000-8000-000000000003',
  now(),
  'studio',
  'c4820000-0000-4000-8000-0000000000a1',
  '{"name":"Retained Rep","email":"rep@test.invalid"}'::jsonb,
  6,
  'net_30',
  'furniture',
  'authorization fixture'
);

INSERT INTO svc_orders.orders (
  id, order_number, user_id, organization_id, subtotal, total, snapshot
)
VALUES
  ('c4820000-0000-4000-8000-000000000101', 'CF82-OWN', 'c4820000-0000-4000-8000-000000000001', NULL, 100, 100, '{}'::jsonb),
  ('c4820000-0000-4000-8000-000000000102', 'CF82-OTHER', 'c4820000-0000-4000-8000-000000000002', NULL, 100, 100, '{}'::jsonb),
  ('c4820000-0000-4000-8000-000000000103', 'CF82-ORG', 'c4820000-0000-4000-8000-000000000002', 'c4820000-0000-4000-8000-0000000000a1', 100, 100, '{}'::jsonb);

INSERT INTO svc_projects.projects (
  id, public_project_id, title, client_id, designer_id
)
VALUES
  ('c4820000-0000-4000-8000-000000000301', 'c4820000-0000-4000-8000-000000000201', 'Retained Linked Project', 'c4820000-0000-4000-8000-000000000001', 'c4820000-0000-4000-8000-000000000002'),
  ('c4820000-0000-4000-8000-000000000302', NULL, 'Retained Foreign Project', 'c4820000-0000-4000-8000-000000000006', 'c4820000-0000-4000-8000-000000000006');

INSERT INTO svc_media.media_assets (
  id, kind, raw_key, product_id, uploaded_by
)
VALUES
  ('c4820000-0000-4000-8000-000000000501', 'IMAGE', 'retained/own.jpg', NULL, 'c4820000-0000-4000-8000-000000000001'),
  ('c4820000-0000-4000-8000-000000000502', 'IMAGE', 'retained/other.jpg', NULL, 'c4820000-0000-4000-8000-000000000002'),
  ('c4820000-0000-4000-8000-000000000503', 'IMAGE', 'retained/org.jpg', 'c4820000-0000-4000-8000-000000000402', 'c4820000-0000-4000-8000-000000000002');

-- These temporary functions intentionally take the verified subject as an
-- explicit argument. They model the parameterized state and object predicates
-- used by the Containers without setting connection-local authorization state.
CREATE FUNCTION pg_temp.current_permissions(p_subject uuid)
RETURNS text[]
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(array_agg(DISTINCT permission_row.name), ARRAY[]::text[])
  FROM public.user_roles AS user_role
  JOIN public.roles AS role_row ON role_row.id = user_role.role_id
  JOIN public.role_permissions AS role_permission ON role_permission.role_id = role_row.id
  JOIN public.permissions AS permission_row ON permission_row.id = role_permission.permission_id
  WHERE user_role.user_id = p_subject
$$;

CREATE FUNCTION pg_temp.current_organizations(p_subject uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(array_agg(DISTINCT membership.organization_id), ARRAY[]::uuid[])
  FROM public.organization_members AS membership
  JOIN public.organizations AS organization_row ON organization_row.id = membership.organization_id
  WHERE membership.user_id = p_subject
    AND membership.status = 'active'
    AND organization_row.status = 'active'
$$;

CREATE FUNCTION pg_temp.visible_orders(p_subject uuid, p_manage boolean DEFAULT false)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
AS $$
  WITH authorization_state AS (
    SELECT
      pg_temp.current_permissions(p_subject) AS permissions,
      pg_temp.current_organizations(p_subject) AS organizations
  )
  SELECT order_row.id
  FROM svc_orders.orders AS order_row
  CROSS JOIN authorization_state
  WHERE 'order.admin.all' = ANY (authorization_state.permissions)
     OR (
       order_row.user_id = p_subject::text
       AND CASE WHEN p_manage
         THEN 'order.manage.own' = ANY (authorization_state.permissions)
         ELSE 'order.read.own' = ANY (authorization_state.permissions)
       END
     )
     OR (
       order_row.organization_id = ANY (authorization_state.organizations)
       AND CASE WHEN p_manage
         THEN 'order.manage.org' = ANY (authorization_state.permissions)
         ELSE 'order.read.org' = ANY (authorization_state.permissions)
       END
     )
$$;

CREATE FUNCTION pg_temp.visible_projects(p_subject uuid, p_manage boolean DEFAULT false)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
AS $$
  WITH authorization_state AS (
    SELECT
      pg_temp.current_permissions(p_subject) AS permissions,
      pg_temp.current_organizations(p_subject) AS organizations
  )
  SELECT service_project.id
  FROM svc_projects.projects AS service_project
  LEFT JOIN public.projects AS public_project
    ON public_project.id = service_project.public_project_id
  CROSS JOIN authorization_state
  WHERE 'project.admin.all' = ANY (authorization_state.permissions)
     OR (
       CASE WHEN p_manage
         THEN 'project.manage.own' = ANY (authorization_state.permissions)
         ELSE (
           'project.read.assigned' = ANY (authorization_state.permissions)
           OR 'project.manage.own' = ANY (authorization_state.permissions)
         )
       END
       AND (
         service_project.client_id = p_subject::text
         OR service_project.designer_id = p_subject::text
         OR public_project.client_id = p_subject
         OR public_project.designer_id = p_subject
         OR EXISTS (
           SELECT 1
           FROM public.project_team_members AS team_member
           WHERE team_member.project_id = public_project.id
             AND team_member.user_id = p_subject
             AND team_member.removed_at IS NULL
         )
       )
     )
     OR (
       public_project.studio_id = ANY (authorization_state.organizations)
       AND CASE WHEN p_manage
         THEN 'project.manage.org' = ANY (authorization_state.permissions)
         ELSE 'project.read.org' = ANY (authorization_state.permissions)
       END
     )
$$;

CREATE FUNCTION pg_temp.visible_media(p_subject uuid, p_manage boolean DEFAULT false)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
AS $$
  WITH authorization_state AS (
    SELECT
      pg_temp.current_permissions(p_subject) AS permissions,
      pg_temp.current_organizations(p_subject) AS organizations
  )
  SELECT asset.id
  FROM svc_media.media_assets AS asset
  LEFT JOIN public.products AS product_row
    ON product_row.id::text = asset.product_id
  CROSS JOIN authorization_state
  WHERE 'media.admin.all' = ANY (authorization_state.permissions)
     OR (
       (asset.uploaded_by = p_subject::text OR product_row.owner_user_id = p_subject)
       AND CASE WHEN p_manage
         THEN 'media.manage.own' = ANY (authorization_state.permissions)
         ELSE 'media.read.own' = ANY (authorization_state.permissions)
       END
     )
     OR (
       product_row.studio_id = ANY (authorization_state.organizations)
       AND CASE WHEN p_manage
         THEN 'media.manage.org' = ANY (authorization_state.permissions)
         ELSE (
           'media.read.org' = ANY (authorization_state.permissions)
           OR 'media.manage.org' = ANY (authorization_state.permissions)
         )
       END
     )
$$;

DO $$
DECLARE
  v_count integer;
  v_updated integer;
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'svc_orders'
      AND table_name = 'orders'
      AND column_name = 'organization_id'
      AND data_type = 'uuid'
  ), 'orders organization bridge is missing';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'svc_projects'
      AND table_name = 'projects'
      AND column_name = 'public_project_id'
      AND data_type = 'uuid'
  ), 'projects public-project bridge is missing';

  ASSERT to_regclass('svc_orders.stripe_webhook_receipts') IS NOT NULL,
    'Stripe webhook receipt relation is missing';
  ASSERT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'svc_orders.stripe_webhook_receipts'::regclass
      AND contype = 'p'
      AND conname = 'stripe_webhook_receipts_pkey'
  ), 'Stripe webhook event identity is not unique';
  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'svc_orders'
      AND table_name = 'stripe_webhook_receipts'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated')
  ), 'Stripe webhook receipt privileges were widened';

  INSERT INTO svc_orders.stripe_webhook_receipts (
    event_id, event_type, claim_token
  ) VALUES (
    'evt_retained_contract',
    'payment_intent.succeeded',
    'c4820000-0000-4000-8000-000000000601'
  );
  BEGIN
    INSERT INTO svc_orders.stripe_webhook_receipts (
      event_id, event_type, claim_token
    ) VALUES (
      'evt_retained_contract',
      'payment_intent.succeeded',
      'c4820000-0000-4000-8000-000000000602'
    );
    RAISE EXCEPTION 'duplicate Stripe event identity was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  UPDATE svc_orders.stripe_webhook_receipts
  SET status = 'succeeded', succeeded_at = now()
  WHERE event_id = 'evt_retained_contract'
    AND claim_token = 'c4820000-0000-4000-8000-000000000601';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  ASSERT v_updated = 1, 'token-fenced Stripe receipt transition failed';

  ASSERT (
    SELECT count(*) = 8
    FROM public.permissions
    WHERE name IN (
      'order.manage.own',
      'project.read.org',
      'project.manage.org',
      'project.admin.all',
      'media.read.own',
      'media.manage.own',
      'media.read.org',
      'media.admin.all'
    )
  ), 'canonical retained-service permission set is incomplete';

  -- Own rows are visible and another subject's rows are not.
  ASSERT EXISTS (
    SELECT 1 FROM pg_temp.visible_orders('c4820000-0000-4000-8000-000000000001')
    WHERE visible_orders = 'c4820000-0000-4000-8000-000000000101'
  ), 'order own read denied';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_temp.visible_orders('c4820000-0000-4000-8000-000000000001')
    WHERE visible_orders = 'c4820000-0000-4000-8000-000000000102'
  ), 'order cross-user read leaked';
  ASSERT EXISTS (
    SELECT 1 FROM pg_temp.visible_projects('c4820000-0000-4000-8000-000000000001')
    WHERE visible_projects = 'c4820000-0000-4000-8000-000000000301'
  ), 'project assigned read denied';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_temp.visible_projects('c4820000-0000-4000-8000-000000000001')
    WHERE visible_projects = 'c4820000-0000-4000-8000-000000000302'
  ), 'project cross-user read leaked';
  ASSERT EXISTS (
    SELECT 1 FROM pg_temp.visible_media('c4820000-0000-4000-8000-000000000001')
    WHERE visible_media = 'c4820000-0000-4000-8000-000000000501'
  ), 'media own read denied';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_temp.visible_media('c4820000-0000-4000-8000-000000000001')
    WHERE visible_media = 'c4820000-0000-4000-8000-000000000502'
  ), 'media cross-user read leaked';

  -- Active organization membership permits only linked organization rows.
  ASSERT EXISTS (
    SELECT 1 FROM pg_temp.visible_orders('c4820000-0000-4000-8000-000000000003')
    WHERE visible_orders = 'c4820000-0000-4000-8000-000000000103'
  ), 'active organization order read denied';
  ASSERT EXISTS (
    SELECT 1 FROM pg_temp.visible_projects('c4820000-0000-4000-8000-000000000003')
    WHERE visible_projects = 'c4820000-0000-4000-8000-000000000301'
  ), 'active organization project read denied';
  ASSERT EXISTS (
    SELECT 1 FROM pg_temp.visible_media('c4820000-0000-4000-8000-000000000003')
    WHERE visible_media = 'c4820000-0000-4000-8000-000000000503'
  ), 'active organization media read denied';

  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_temp.visible_orders('c4820000-0000-4000-8000-000000000004')
    WHERE visible_orders = 'c4820000-0000-4000-8000-000000000103'
  ), 'inactive membership leaked order';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_temp.visible_projects('c4820000-0000-4000-8000-000000000004')
    WHERE visible_projects = 'c4820000-0000-4000-8000-000000000301'
  ), 'inactive membership leaked project';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_temp.visible_media('c4820000-0000-4000-8000-000000000004')
    WHERE visible_media = 'c4820000-0000-4000-8000-000000000503'
  ), 'inactive membership leaked media';

  -- Revocation affects the very next query; no permission or membership cache.
  UPDATE public.organization_members
  SET status = 'removed'
  WHERE user_id = 'c4820000-0000-4000-8000-000000000003'
    AND organization_id = 'c4820000-0000-4000-8000-0000000000a1';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_temp.visible_orders('c4820000-0000-4000-8000-000000000003')
    WHERE visible_orders = 'c4820000-0000-4000-8000-000000000103'
  ), 'membership revocation was stale for orders';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_temp.visible_media('c4820000-0000-4000-8000-000000000003')
    WHERE visible_media = 'c4820000-0000-4000-8000-000000000503'
  ), 'membership revocation was stale for media';
  UPDATE public.organization_members
  SET status = 'active'
  WHERE user_id = 'c4820000-0000-4000-8000-000000000003'
    AND organization_id = 'c4820000-0000-4000-8000-0000000000a1';

  -- Missing and unknown roles remain empty; a current role grant is observed
  -- on the immediately following query, independent of any JWT metadata.
  ASSERT cardinality(pg_temp.current_permissions('c4820000-0000-4000-8000-000000000006')) = 0,
    'missing role unexpectedly granted permissions';
  ASSERT cardinality(pg_temp.current_permissions('c4820000-0000-4000-8000-000000000008')) = 0,
    'unknown role unexpectedly granted permissions';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_temp.visible_orders('c4820000-0000-4000-8000-000000000007')
  ), 'unassigned user unexpectedly read orders';
  INSERT INTO public.user_roles (user_id, role_id)
  SELECT 'c4820000-0000-4000-8000-000000000007', id
  FROM public.roles
  WHERE name = 'app_user';
  ASSERT 'order.read.own' = ANY (
    pg_temp.current_permissions('c4820000-0000-4000-8000-000000000007')
  ), 'role grant was not visible on the next query';
  DELETE FROM public.user_roles
  WHERE user_id = 'c4820000-0000-4000-8000-000000000007';
  ASSERT cardinality(pg_temp.current_permissions('c4820000-0000-4000-8000-000000000007')) = 0,
    'role removal was not visible on the next query';

  -- Explicit all-scope permissions expose the reviewed platform operation.
  SELECT count(*) INTO v_count
  FROM pg_temp.visible_orders('c4820000-0000-4000-8000-000000000005')
  WHERE visible_orders IN (
    'c4820000-0000-4000-8000-000000000101',
    'c4820000-0000-4000-8000-000000000102',
    'c4820000-0000-4000-8000-000000000103'
  );
  ASSERT v_count = 3, 'order admin did not receive all reviewed rows';
  SELECT count(*) INTO v_count
  FROM pg_temp.visible_projects('c4820000-0000-4000-8000-000000000005')
  WHERE visible_projects IN (
    'c4820000-0000-4000-8000-000000000301',
    'c4820000-0000-4000-8000-000000000302'
  );
  ASSERT v_count = 2, 'project admin did not receive all reviewed rows';
  SELECT count(*) INTO v_count
  FROM pg_temp.visible_media('c4820000-0000-4000-8000-000000000005')
  WHERE visible_media IN (
    'c4820000-0000-4000-8000-000000000501',
    'c4820000-0000-4000-8000-000000000502',
    'c4820000-0000-4000-8000-000000000503'
  );
  ASSERT v_count = 3, 'media admin did not receive all reviewed rows';

  -- List/count/page and batch predicates operate on the scoped relation.
  SELECT count(*) INTO v_count
  FROM (
    SELECT order_row.id
    FROM svc_orders.orders AS order_row
    JOIN pg_temp.visible_orders('c4820000-0000-4000-8000-000000000001') AS visible
      ON visible = order_row.id
    ORDER BY order_row.created_at DESC
    LIMIT 1 OFFSET 0
  ) AS page;
  ASSERT v_count = 1, 'authorized order page size is wrong';
  SELECT count(*) INTO v_count
  FROM pg_temp.visible_orders('c4820000-0000-4000-8000-000000000001');
  ASSERT v_count = 1, 'authorized order count includes foreign rows';
  SELECT count(*) INTO v_count
  FROM pg_temp.visible_orders('c4820000-0000-4000-8000-000000000001') AS visible
  WHERE visible IN (
    'c4820000-0000-4000-8000-000000000101',
    'c4820000-0000-4000-8000-000000000102',
    'c4820000-0000-4000-8000-000000000103'
  );
  ASSERT v_count = 1, 'order batch revealed inaccessible IDs';

  -- Writes use the same scope as reads and affect zero inaccessible rows.
  UPDATE svc_orders.orders AS order_row
  SET status = 'canceled'
  FROM pg_temp.visible_orders('c4820000-0000-4000-8000-000000000001', true) AS visible
  WHERE order_row.id = visible
    AND order_row.id IN (
      'c4820000-0000-4000-8000-000000000101',
      'c4820000-0000-4000-8000-000000000102'
    );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  ASSERT v_updated = 1, 'order write scope affected a foreign row';

  UPDATE svc_projects.projects AS project_row
  SET description = 'authorized'
  FROM pg_temp.visible_projects('c4820000-0000-4000-8000-000000000002', true) AS visible
  WHERE project_row.id = visible
    AND project_row.id IN (
      'c4820000-0000-4000-8000-000000000301',
      'c4820000-0000-4000-8000-000000000302'
    );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  ASSERT v_updated = 1, 'project write scope affected a foreign row';

  UPDATE svc_media.media_assets AS asset
  SET processed = true
  FROM pg_temp.visible_media('c4820000-0000-4000-8000-000000000001', true) AS visible
  WHERE asset.id = visible
    AND asset.id IN (
      'c4820000-0000-4000-8000-000000000501',
      'c4820000-0000-4000-8000-000000000502'
    );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  ASSERT v_updated = 1, 'media write scope affected a foreign row';

  -- Successive requests on one pooled connection cannot retain subject state:
  -- every predicate is parameterized with the current verified subject.
  ASSERT EXISTS (
    SELECT 1 FROM pg_temp.visible_orders('c4820000-0000-4000-8000-000000000001')
    WHERE visible_orders = 'c4820000-0000-4000-8000-000000000101'
  ), 'first pooled subject lost own row';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_temp.visible_orders('c4820000-0000-4000-8000-000000000002')
    WHERE visible_orders = 'c4820000-0000-4000-8000-000000000101'
  ), 'second pooled subject inherited prior scope';

  BEGIN
    PERFORM 1 / 0;
  EXCEPTION WHEN division_by_zero THEN
    NULL;
  END;
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_temp.visible_media('c4820000-0000-4000-8000-000000000002')
    WHERE visible_media = 'c4820000-0000-4000-8000-000000000501'
  ), 'error path retained the previous media subject';

  RAISE NOTICE 'retained service authorization contract assertions passed';
END
$$;

ROLLBACK;
