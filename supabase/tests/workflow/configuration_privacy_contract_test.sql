-- Workflow Stage-0 privacy contract: configuration access and frozen children.
-- Runner: plain psql with ON_ERROR_STOP=1. Every fixture is transaction-local.
--
-- Expected on the pre-remediation schema: this suite is RED. It reports every
-- failing contract before exiting 1; individual gaps are never skipped merely
-- because an earlier assertion failed.
--
-- Run:
--   scripts/run-supabase-sql-test.sh supabase/tests/workflow/configuration_privacy_contract_test.sql

BEGIN;

SET LOCAL statement_timeout = '20s';

CREATE TEMP TABLE workflow_privacy_results (
  case_id text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT ON workflow_privacy_results TO authenticated, service_role;

CREATE OR REPLACE FUNCTION pg_temp.assume_workflow_actor(
  p_actor uuid,
  p_role text DEFAULT 'authenticated'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_strip_nulls(jsonb_build_object('sub', p_actor, 'role', p_role))::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_actor::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', p_role, true);
END;
$$;

-- Deterministic owner, same-studio collaborator, different-studio designer,
-- and exact project client.
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('a3600000-0000-4000-8000-000000000001', 'config-owner-contract@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a3600000-0000-4000-8000-000000000002', 'config-collaborator-contract@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a3600000-0000-4000-8000-000000000003', 'config-outsider-contract@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a3600000-0000-4000-8000-000000000004', 'config-client-contract@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a3600000-0000-4000-8000-000000000005', 'config-party-contract@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (
  id, email, full_name, is_designer, created_at, updated_at
) VALUES
  ('a3600000-0000-4000-8000-000000000001', 'config-owner-contract@test.invalid', 'Configuration Owner', true, now(), now()),
  ('a3600000-0000-4000-8000-000000000002', 'config-collaborator-contract@test.invalid', 'Configuration Collaborator', true, now(), now()),
  ('a3600000-0000-4000-8000-000000000003', 'config-outsider-contract@test.invalid', 'Configuration Outsider', true, now(), now()),
  ('a3600000-0000-4000-8000-000000000004', 'config-client-contract@test.invalid', 'Configuration Client', false, now(), now()),
  ('a3600000-0000-4000-8000-000000000005', 'config-party-contract@test.invalid', 'Configuration Project Party', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('a3610000-0000-4000-8000-000000000001', 'design_studio', 'Configuration Studio A', 'configuration-contract-a', 'active'),
  ('a3610000-0000-4000-8000-000000000002', 'design_studio', 'Configuration Studio B', 'configuration-contract-b', 'active');

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
) VALUES
  ('a3620000-0000-4000-8000-000000000001', 'a3600000-0000-4000-8000-000000000001',
   'a3610000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('a3620000-0000-4000-8000-000000000002', 'a3600000-0000-4000-8000-000000000002',
   'a3610000-0000-4000-8000-000000000001', 'member', 'active', now()),
  ('a3620000-0000-4000-8000-000000000003', 'a3600000-0000-4000-8000-000000000003',
   'a3610000-0000-4000-8000-000000000002', 'owner', 'active', now());

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
) VALUES (
  'a3630000-0000-4000-8000-000000000001',
  'a3600000-0000-4000-8000-000000000001',
  'a3600000-0000-4000-8000-000000000004',
  'Configuration Client', 'active', 'direct'
);

INSERT INTO public.projects (
  id, name, designer_id, client_id, created_by, studio_id
) VALUES (
  'a3640000-0000-4000-8000-000000000001', 'Configuration Privacy Project',
  'a3600000-0000-4000-8000-000000000001',
  'a3600000-0000-4000-8000-000000000004',
  'a3600000-0000-4000-8000-000000000001',
  'a3610000-0000-4000-8000-000000000001'
);

INSERT INTO public.project_parties (
  id, project_id, party_kind, display_name, profile_id, created_by
) VALUES (
  'a3641000-0000-4000-8000-000000000001',
  'a3640000-0000-4000-8000-000000000001',
  'client_rep', 'Opted-in configuration representative',
  'a3600000-0000-4000-8000-000000000005',
  'a3600000-0000-4000-8000-000000000001'
);

INSERT INTO public.products (
  id, name, source_url, captured_by, captured_at, layer, owner_user_id,
  status, configuration_mode, price_retail, price_trade
) VALUES (
  'a3650000-0000-4000-8000-000000000001', 'Configuration Contract Sectional',
  'https://example.invalid/configuration-contract-sectional',
  'a3600000-0000-4000-8000-000000000001', now(), 'personal',
  'a3600000-0000-4000-8000-000000000001', 'draft', 'configured', 500000, 300000
);

INSERT INTO public.product_option_groups (
  id, product_id, code, name, selection_type, required,
  min_selections, max_selections, position
) VALUES (
  'a3660000-0000-4000-8000-000000000001',
  'a3650000-0000-4000-8000-000000000001',
  'fabric', 'Fabric', 'single', true, 1, 1, 0
);

INSERT INTO public.product_option_values (
  id, option_group_id, code, label, retail_price_delta_cents,
  trade_price_delta_cents, position
) VALUES (
  'a3670000-0000-4000-8000-000000000001',
  'a3660000-0000-4000-8000-000000000001',
  'linen', 'Natural linen', 25000, 12000, 0
);

INSERT INTO public.product_components (
  id, product_id, code, name, component_type, min_quantity,
  max_quantity, default_quantity, retail_price_cents, trade_price_cents,
  position
) VALUES (
  'a3680000-0000-4000-8000-000000000001',
  'a3650000-0000-4000-8000-000000000001',
  'armless', 'Armless module', 'module', 1, 4, 1, 250000, 150000, 0
), (
  'a3680000-0000-4000-8000-000000000002',
  'a3650000-0000-4000-8000-000000000001',
  'corner', 'Corner module', 'module', 0, 2, 0, 275000, 165000, 1
);

-- An approved parent and its two frozen child rows. The parent already has an
-- UPDATE/DELETE immutability trigger; the contract requires equivalent table-
-- edge protection for the child snapshots that compose the approved truth.
INSERT INTO public.product_configurations (
  id, configuration_key, product_id, project_id, owner_user_id, studio_id,
  version, schema_revision, status, name, normalized_selection,
  component_quantities, evaluation, snapshot, snapshot_hash,
  is_complete, is_valid, retail_price_cents, trade_price_cents,
  approved_by, approved_at
) VALUES (
  'a3690000-0000-4000-8000-000000000001',
  'a3690000-0000-4000-8000-000000000099',
  'a3650000-0000-4000-8000-000000000001',
  'a3640000-0000-4000-8000-000000000001',
  'a3600000-0000-4000-8000-000000000001',
  'a3610000-0000-4000-8000-000000000001',
  1, 1, 'approved', 'Approved sectional',
  '{"fabric":["linen"]}'::jsonb, '{"armless":1}'::jsonb,
  '{"valid":true,"complete":true}'::jsonb,
  '{"name":"Approved sectional","selection":{"fabric":"linen"},"components":{"armless":1}}'::jsonb,
  repeat('a', 64), true, true, 525000, 312000,
  'a3600000-0000-4000-8000-000000000001', now()
);

INSERT INTO public.product_configuration_selections (
  configuration_id, option_group_id, option_value_id, selection_snapshot
) VALUES (
  'a3690000-0000-4000-8000-000000000001',
  'a3660000-0000-4000-8000-000000000001',
  'a3670000-0000-4000-8000-000000000001',
  '{"groupCode":"fabric","valueCode":"linen","label":"Natural linen"}'::jsonb
);

INSERT INTO public.product_configuration_components (
  configuration_id, component_id, quantity, component_snapshot
) VALUES (
  'a3690000-0000-4000-8000-000000000001',
  'a3680000-0000-4000-8000-000000000001', 1,
  '{"code":"armless","name":"Armless module","quantity":1}'::jsonb
);

-- Project clients and other studios cannot cross the working configuration
-- edge, including by querying child tables directly.
SELECT pg_temp.assume_workflow_actor('a3600000-0000-4000-8000-000000000004');
SET LOCAL ROLE authenticated;
INSERT INTO workflow_privacy_results
SELECT
  'P01_CLIENT_CANNOT_READ_WORKING_CONFIGURATION',
  count(*) = 0,
  format('client configuration row count=%s; required=0', count(*))
FROM public.product_configurations
WHERE id = 'a3690000-0000-4000-8000-000000000001';

INSERT INTO workflow_privacy_results
SELECT
  'P02_CLIENT_CANNOT_READ_CONFIGURATION_SELECTIONS',
  count(*) = 0,
  format('client selection-child row count=%s; required=0', count(*))
FROM public.product_configuration_selections
WHERE configuration_id = 'a3690000-0000-4000-8000-000000000001';

INSERT INTO workflow_privacy_results
SELECT
  'P03_CLIENT_CANNOT_READ_CONFIGURATION_COMPONENTS',
  count(*) = 0,
  format('client component-child row count=%s; required=0', count(*))
FROM public.product_configuration_components
WHERE configuration_id = 'a3690000-0000-4000-8000-000000000001';
RESET ROLE;

SELECT pg_temp.assume_workflow_actor('a3600000-0000-4000-8000-000000000005');
SET LOCAL ROLE authenticated;
INSERT INTO workflow_privacy_results
SELECT
  'P10_PROJECT_PARTY_CANNOT_READ_CONFIGURATION_OR_CHILDREN',
  (
    (SELECT count(*) FROM public.product_configurations
     WHERE id = 'a3690000-0000-4000-8000-000000000001') = 0
    AND
    (SELECT count(*) FROM public.product_configuration_selections
     WHERE configuration_id = 'a3690000-0000-4000-8000-000000000001') = 0
    AND
    (SELECT count(*) FROM public.product_configuration_components
     WHERE configuration_id = 'a3690000-0000-4000-8000-000000000001') = 0
  ),
  format(
    'party configuration=%s selections=%s components=%s; required=0/0/0',
    (SELECT count(*) FROM public.product_configurations
     WHERE id = 'a3690000-0000-4000-8000-000000000001'),
    (SELECT count(*) FROM public.product_configuration_selections
     WHERE configuration_id = 'a3690000-0000-4000-8000-000000000001'),
    (SELECT count(*) FROM public.product_configuration_components
     WHERE configuration_id = 'a3690000-0000-4000-8000-000000000001')
  );
RESET ROLE;

SELECT pg_temp.assume_workflow_actor('a3600000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
INSERT INTO workflow_privacy_results
SELECT
  'P04_DIFFERENT_STUDIO_CANNOT_READ_CONFIGURATION',
  count(*) = 0,
  format('different-studio configuration row count=%s; required=0', count(*))
FROM public.product_configurations
WHERE id = 'a3690000-0000-4000-8000-000000000001';
RESET ROLE;

-- Preserve same-studio read access, but never grant direct child mutation.
SELECT pg_temp.assume_workflow_actor('a3600000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
INSERT INTO workflow_privacy_results
SELECT
  'P05_SAME_STUDIO_CAN_READ_CONFIGURATION_CHILDREN',
  (
    (SELECT count(*) FROM public.product_configuration_selections
     WHERE configuration_id = 'a3690000-0000-4000-8000-000000000001') = 1
    AND
    (SELECT count(*) FROM public.product_configuration_components
     WHERE configuration_id = 'a3690000-0000-4000-8000-000000000001') = 1
  ),
  format(
    'same-studio selection rows=%s component rows=%s; required=1/1',
    (SELECT count(*) FROM public.product_configuration_selections
     WHERE configuration_id = 'a3690000-0000-4000-8000-000000000001'),
    (SELECT count(*) FROM public.product_configuration_components
     WHERE configuration_id = 'a3690000-0000-4000-8000-000000000001')
  );

DO $$
DECLARE
  v_denied boolean := false;
  v_rows integer := 0;
  v_detail text := '';
BEGIN
  BEGIN
    UPDATE public.product_configuration_selections
    SET selection_snapshot = '{"forged":true}'::jsonb
    WHERE configuration_id = 'a3690000-0000-4000-8000-000000000001';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_denied := v_rows = 0;
    v_detail := format('authenticated child UPDATE affected %s rows; required=0/error', v_rows);
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
    v_detail := format('authenticated child UPDATE rejected: %s', SQLERRM);
  END;

  INSERT INTO workflow_privacy_results
  VALUES ('P06_AUTHENTICATED_CANNOT_MUTATE_CONFIGURATION_CHILD', v_denied, v_detail);
END;
$$;
RESET ROLE;

-- service_role bypasses RLS. Parent and child rows therefore need equivalent
-- table-edge immutability once a configuration is approved or issued.
CREATE OR REPLACE FUNCTION pg_temp.auth_null_configuration_child_probe()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.product_configuration_components (
    configuration_id, component_id, quantity, component_snapshot
  ) VALUES (
    'a3690000-0000-4000-8000-000000000001',
    'a3680000-0000-4000-8000-000000000002', 1,
    '{"code":"corner","name":"Corner module","quantity":1}'::jsonb
  );
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.auth_null_configuration_child_probe() TO service_role;

SELECT pg_temp.assume_workflow_actor(NULL, 'service_role');
SET LOCAL ROLE service_role;

DO $$
DECLARE
  v_denied boolean := false;
  v_detail text := '';
BEGIN
  BEGIN
    PERFORM pg_temp.auth_null_configuration_child_probe();
    v_detail := 'auth-null SECURITY DEFINER inserted a child on approved truth';
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
    v_detail := format('auth-null configuration definer rejected: %s', SQLERRM);
  END;
  INSERT INTO workflow_privacy_results VALUES (
    'P11_AUTH_NULL_DEFINER_CANNOT_USE_FIXTURE_ESCAPE', v_denied, v_detail
  );
END;
$$;

DO $$
DECLARE
  v_denied boolean := false;
  v_rows integer := 0;
  v_detail text := '';
BEGIN
  BEGIN
    UPDATE public.product_configurations
    SET snapshot = '{"forged":"parent"}'::jsonb
    WHERE id = 'a3690000-0000-4000-8000-000000000001';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_denied := v_rows = 0;
    v_detail := format('service_role parent UPDATE affected %s rows; required=0/error', v_rows);
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
    v_detail := format('service_role parent UPDATE rejected: %s', SQLERRM);
  END;

  INSERT INTO workflow_privacy_results
  VALUES ('P07_SERVICE_ROLE_CANNOT_MUTATE_APPROVED_PARENT', v_denied, v_detail);
END;
$$;

DO $$
DECLARE
  v_denied boolean := false;
  v_rows integer := 0;
  v_detail text := '';
BEGIN
  BEGIN
    UPDATE public.product_configuration_selections
    SET selection_snapshot = '{"forged":"selection"}'::jsonb
    WHERE configuration_id = 'a3690000-0000-4000-8000-000000000001';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_denied := v_rows = 0;
    v_detail := format('service_role selection UPDATE affected %s rows; required=0/error', v_rows);
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
    v_detail := format('service_role selection UPDATE rejected: %s', SQLERRM);
  END;

  INSERT INTO workflow_privacy_results
  VALUES ('P08_SERVICE_ROLE_CANNOT_MUTATE_APPROVED_SELECTION', v_denied, v_detail);
END;
$$;

DO $$
DECLARE
  v_denied boolean := false;
  v_rows integer := 0;
  v_detail text := '';
BEGIN
  BEGIN
    UPDATE public.product_configuration_components
    SET quantity = 2,
        component_snapshot = '{"forged":"component","quantity":2}'::jsonb
    WHERE configuration_id = 'a3690000-0000-4000-8000-000000000001';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_denied := v_rows = 0;
    v_detail := format('service_role component UPDATE affected %s rows; required=0/error', v_rows);
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
    v_detail := format('service_role component UPDATE rejected: %s', SQLERRM);
  END;

  INSERT INTO workflow_privacy_results
  VALUES ('P09_SERVICE_ROLE_CANNOT_MUTATE_APPROVED_COMPONENT', v_denied, v_detail);
END;
$$;

RESET ROLE;

TABLE workflow_privacy_results ORDER BY case_id;

SELECT
  bool_and(passed) AS all_contracts_passed,
  count(*) FILTER (WHERE passed) AS passing_cases,
  count(*) FILTER (WHERE NOT passed) AS failing_cases
FROM workflow_privacy_results
\gset

ROLLBACK;

\if :all_contracts_passed
  \echo 'workflow configuration privacy contracts: PASS (' :passing_cases ' cases)'
\else
  \echo 'workflow configuration privacy contracts: FAIL (' :failing_cases ' failing, ' :passing_cases ' passing)'
  DO $contract_failure$
  BEGIN
    RAISE EXCEPTION 'workflow configuration privacy contract failed';
  END
  $contract_failure$;
\endif
