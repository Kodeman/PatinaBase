-- begin_discovery atomic authority regression (00386)
-- Run:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/document/begin_discovery_atomicity_test.sql

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('d6000000-0000-4000-8000-000000000001', 'begin-owner@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6000000-0000-4000-8000-000000000002', 'begin-coworker@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6000000-0000-4000-8000-000000000003', 'begin-foreign@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6000000-0000-4000-8000-000000000010', 'begin-client@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('d6000000-0000-4000-8000-000000000001', 'begin-owner@test.invalid', 'Begin Owner', NOW(), NOW()),
  ('d6000000-0000-4000-8000-000000000002', 'begin-coworker@test.invalid', 'Begin Coworker', NOW(), NOW()),
  ('d6000000-0000-4000-8000-000000000003', 'begin-foreign@test.invalid', 'Begin Foreign', NOW(), NOW()),
  ('d6000000-0000-4000-8000-000000000010', 'begin-client@test.invalid', 'Repeat Client', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug)
VALUES (
  'd6100000-0000-4000-8000-000000000001', 'design_studio',
  'Begin Discovery Studio', 'begin-discovery-studio'
);

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES
  ('d6110000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001',
   'd6100000-0000-4000-8000-000000000001', 'owner', 'active', NOW()),
  ('d6110000-0000-4000-8000-000000000002', 'd6000000-0000-4000-8000-000000000002',
   'd6100000-0000-4000-8000-000000000001', 'member', 'active', NOW());

INSERT INTO public.leads (
  id, homeowner_id, designer_id, project_type, status, contact_name, contact_email
)
VALUES
  ('d6200000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000010',
   'd6000000-0000-4000-8000-000000000001', 'consultation', 'new', NULL, NULL),
  ('d6200000-0000-4000-8000-000000000002', NULL,
   'd6000000-0000-4000-8000-000000000001', 'consultation', 'viewed',
   'Profile-less Client', 'profileless@test.invalid'),
  ('d6200000-0000-4000-8000-000000000003', NULL,
   'd6000000-0000-4000-8000-000000000003', 'consultation', 'new',
   'Foreign Lead', 'foreign-lead@test.invalid'),
  ('d6200000-0000-4000-8000-000000000004', NULL,
   'd6000000-0000-4000-8000-000000000001', 'consultation', 'contacted',
   'Studio Lead', 'studio-lead@test.invalid'),
  ('d6200000-0000-4000-8000-000000000005', NULL,
   'd6000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'Rollback Lead', 'rollback-lead@test.invalid');

-- A repeat-client canonical relationship must survive unchanged while the new
-- lead receives its own Discovery-stage engagement (00331 duplicate policy).
INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
)
VALUES (
  'd6300000-0000-4000-8000-000000000001',
  'd6000000-0000-4000-8000-000000000001',
  'd6000000-0000-4000-8000-000000000010',
  'Repeat Client', 'active', 'direct'
);

-- Profile-less email reuse is preserved, including its prior status-to-lead
-- behavior and NULL client_id partial-index identity.
INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_email, client_name, status, source
)
VALUES (
  'd6300000-0000-4000-8000-000000000002',
  'd6000000-0000-4000-8000-000000000001', NULL,
  'profileless@test.invalid', 'Old Name', 'active', 'direct'
);

CREATE OR REPLACE FUNCTION pg_temp.assume_begin_actor(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_actor, 'role', 'authenticated')::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.reject_rollback_relationship()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.lead_id = 'd6200000-0000-4000-8000-000000000005'::uuid THEN
    RAISE EXCEPTION 'forced relationship failure';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER test_reject_rollback_relationship
BEFORE INSERT OR UPDATE ON public.designer_clients
FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_rollback_relationship();

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_begin_actor('d6000000-0000-4000-8000-000000000001');

DO $$
DECLARE
  v_result jsonb;
  v_relationship_id uuid;
BEGIN
  v_result := public.begin_discovery('d6200000-0000-4000-8000-000000000001');
  v_relationship_id := (v_result->>'designerClientId')::uuid;

  ASSERT v_result->'lead'->>'status' = 'accepted',
    'RPC must return the accepted lead, not the stale pre-transition row';
  ASSERT v_relationship_id <> 'd6300000-0000-4000-8000-000000000001',
    'repeat-client discovery must not reuse the engaged canonical row';
  ASSERT (SELECT status = 'active'
          FROM public.designer_clients
          WHERE id = 'd6300000-0000-4000-8000-000000000001'),
    'repeat-client canonical relationship must never be downgraded';
  ASSERT (SELECT status = 'lead'
                 AND lead_id = 'd6200000-0000-4000-8000-000000000001'
          FROM public.designer_clients WHERE id = v_relationship_id),
    'new relationship must be the lead-scoped Discovery engagement';

  -- Idempotency is rooted in the lead lock + exact lead_id relationship.
  ASSERT (public.begin_discovery('d6200000-0000-4000-8000-000000000001')
          ->>'designerClientId')::uuid = v_relationship_id,
    'retry must return the same Discovery relationship';
  ASSERT (SELECT count(*) = 1 FROM public.designer_clients
          WHERE lead_id = 'd6200000-0000-4000-8000-000000000001'),
    'retry must not create a duplicate engagement';
END;
$$;

DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.begin_discovery('d6200000-0000-4000-8000-000000000002');
  ASSERT (v_result->>'designerClientId')::uuid =
         'd6300000-0000-4000-8000-000000000002',
    'profile-less email match must reuse the existing NULL-client row';
  ASSERT (SELECT client_id IS NULL
                 AND client_name = 'Profile-less Client'
                 AND status = 'lead'
                 AND lead_id = 'd6200000-0000-4000-8000-000000000002'
          FROM public.designer_clients
          WHERE id = 'd6300000-0000-4000-8000-000000000002'),
    'profile-less reuse must preserve NULL client_id and refresh contact fields';
END;
$$;

-- An authenticated non-member cannot use the definer boundary to cross studios.
DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    PERFORM public.begin_discovery('d6200000-0000-4000-8000-000000000003');
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
    'lead d6200000-0000-4000-8000-000000000003 not found or access denied',
    format('foreign lead should be denied, got %L', v_error);
END;
$$;

-- A real active, non-guest studio co-member has the same workspace authority
-- as the lead owner and receives the owner-scoped relationship identity.
SELECT pg_temp.assume_begin_actor('d6000000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.begin_discovery('d6200000-0000-4000-8000-000000000004');
  ASSERT v_result->'lead'->>'status' = 'accepted',
    'studio co-member should be able to begin Discovery';
  ASSERT (SELECT designer_id = 'd6000000-0000-4000-8000-000000000001'
          FROM public.designer_clients
          WHERE id = (v_result->>'designerClientId')::uuid),
    'studio act must keep the relationship owned by the lead designer';
END;
$$;

-- Force the relationship write to fail after authorization. The statement's
-- transaction must roll back the lead acceptance as well.
SELECT pg_temp.assume_begin_actor('d6000000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    PERFORM public.begin_discovery('d6200000-0000-4000-8000-000000000005');
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error = 'forced relationship failure',
    format('expected forced relationship failure, got %L', v_error);
  ASSERT (SELECT status = 'new' AND accepted_at IS NULL
          FROM public.leads
          WHERE id = 'd6200000-0000-4000-8000-000000000005'),
    'relationship failure must roll back the accepted lead stamp';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.designer_clients
    WHERE lead_id = 'd6200000-0000-4000-8000-000000000005'
  ), 'relationship failure must leave no partial Discovery row';
END;
$$;

DO $$
BEGIN
  ASSERT has_function_privilege(
    'authenticated', 'public.begin_discovery(uuid)', 'EXECUTE'
  ), 'authenticated must be able to execute begin_discovery';
  ASSERT NOT has_function_privilege(
    'anon', 'public.begin_discovery(uuid)', 'EXECUTE'
  ), 'anon must not execute begin_discovery';
  ASSERT NOT has_function_privilege(
    'public', 'public.begin_discovery(uuid)', 'EXECUTE'
  ), 'PUBLIC must not execute begin_discovery';
END;
$$;

ROLLBACK;
