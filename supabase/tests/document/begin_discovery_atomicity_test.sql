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
  ('d6000000-0000-4000-8000-000000000005', 'begin-contractor@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6000000-0000-4000-8000-000000000006', 'begin-guest@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6000000-0000-4000-8000-000000000007', 'begin-suspended@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6000000-0000-4000-8000-000000000010', 'begin-client@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6000000-0000-4000-8000-000000000011', 'begin-progressed@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6000000-0000-4000-8000-000000000012', 'begin-invited@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('d6000000-0000-4000-8000-000000000001', 'begin-owner@test.invalid', 'Begin Owner', NOW(), NOW()),
  ('d6000000-0000-4000-8000-000000000002', 'begin-coworker@test.invalid', 'Begin Coworker', NOW(), NOW()),
  ('d6000000-0000-4000-8000-000000000003', 'begin-foreign@test.invalid', 'Begin Foreign', NOW(), NOW()),
  ('d6000000-0000-4000-8000-000000000005', 'begin-contractor@test.invalid', 'Begin Contractor', NOW(), NOW()),
  ('d6000000-0000-4000-8000-000000000006', 'begin-guest@test.invalid', 'Begin Guest', NOW(), NOW()),
  ('d6000000-0000-4000-8000-000000000007', 'begin-suspended@test.invalid', 'Begin Suspended', NOW(), NOW()),
  ('d6000000-0000-4000-8000-000000000010', 'begin-client@test.invalid', 'Repeat Client', NOW(), NOW()),
  ('d6000000-0000-4000-8000-000000000011', 'begin-progressed@test.invalid', 'Progressed Client', NOW(), NOW()),
  ('d6000000-0000-4000-8000-000000000012', 'begin-invited@test.invalid', 'Invited Client', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug)
VALUES
  ('d6100000-0000-4000-8000-000000000001', 'design_studio',
   'Begin Discovery Studio', 'begin-discovery-studio'),
  ('d6100000-0000-4000-8000-000000000002', 'contractor',
   'Begin Shared Contractor', 'begin-shared-contractor');

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES
  ('d6110000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001',
   'd6100000-0000-4000-8000-000000000001', 'owner', 'active', NOW()),
  ('d6110000-0000-4000-8000-000000000002', 'd6000000-0000-4000-8000-000000000002',
   'd6100000-0000-4000-8000-000000000001', 'member', 'active', NOW()),
  ('d6110000-0000-4000-8000-000000000003', 'd6000000-0000-4000-8000-000000000001',
   'd6100000-0000-4000-8000-000000000002', 'owner', 'active', NOW()),
  ('d6110000-0000-4000-8000-000000000004', 'd6000000-0000-4000-8000-000000000005',
   'd6100000-0000-4000-8000-000000000002', 'member', 'active', NOW()),
  ('d6110000-0000-4000-8000-000000000005', 'd6000000-0000-4000-8000-000000000006',
   'd6100000-0000-4000-8000-000000000001', 'guest', 'active', NOW()),
  ('d6110000-0000-4000-8000-000000000006', 'd6000000-0000-4000-8000-000000000007',
   'd6100000-0000-4000-8000-000000000001', 'member', 'suspended', NOW());

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
   'Rollback Lead', 'rollback-lead@test.invalid'),
  ('d6200000-0000-4000-8000-000000000006', NULL,
   'd6000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'Contractor Boundary Lead', 'contractor-boundary@test.invalid'),
  ('d6200000-0000-4000-8000-000000000007', NULL,
   'd6000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'Guest Boundary Lead', 'guest-boundary@test.invalid'),
  ('d6200000-0000-4000-8000-000000000008', NULL,
   'd6000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'Suspended Boundary Lead', 'suspended-boundary@test.invalid'),
  ('d6200000-0000-4000-8000-000000000009', 'd6000000-0000-4000-8000-000000000011',
   'd6000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'Progressed Client', 'begin-progressed@test.invalid');

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

-- A progressed profile-less direct contact may be associated with the lead,
-- but Discovery must preserve its lifecycle and identity fields.
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

-- Once the relationship advances, lead_id remains the replay key. A retry
-- returns the progressed row instead of creating a fresh lead relationship.
DO $$
DECLARE
  v_relationship_id uuid;
BEGIN
  v_relationship_id := (
    public.begin_discovery('d6200000-0000-4000-8000-000000000009')
    ->>'designerClientId'
  )::uuid;
  UPDATE public.designer_clients
  SET status = 'active', source = 'proposal', updated_at = now()
  WHERE id = v_relationship_id;

  ASSERT (
    public.begin_discovery('d6200000-0000-4000-8000-000000000009')
    ->>'designerClientId'
  )::uuid = v_relationship_id,
    'progressed registered retry must return the exact lead relationship';
  ASSERT (SELECT status = 'active' AND source = 'proposal'
          FROM public.designer_clients WHERE id = v_relationship_id),
    'progressed registered retry must not downgrade relationship state';
  ASSERT (SELECT count(*) = 1 FROM public.designer_clients
          WHERE lead_id = 'd6200000-0000-4000-8000-000000000009'),
    'progressed registered retry must not duplicate the engagement';
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

-- Arrival Ceremony is intentionally profile-bound: its threshold act creates
-- a direct thread and recipient notifications. Captured leads remain viable by
-- taking begin_discovery, and failed arrival eligibility leaves no stub/state.
DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    PERFORM public.accept_design_request(
      'd6200000-0000-4000-8000-000000000006'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error = 'arrival_requires_client_profile',
    format('profileless arrival must fail explicitly, got %L', v_error);
  ASSERT (SELECT status = 'new' AND accepted_at IS NULL
          FROM public.leads
          WHERE id = 'd6200000-0000-4000-8000-000000000006'),
    'arrival eligibility failure must not mutate the lead';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.match_ceremonies
    WHERE lead_id = 'd6200000-0000-4000-8000-000000000006'
  ), 'arrival eligibility failure must not create a ceremony stub';

  INSERT INTO public.designer_clients (
    id, designer_id, client_id, source, lead_id, status
  ) VALUES (
    'd6300000-0000-4000-8000-000000000006',
    'd6000000-0000-4000-8000-000000000001', NULL,
    'design_request', 'd6200000-0000-4000-8000-000000000006', 'lead'
  );
  ASSERT (SELECT client_name = 'Contractor Boundary Lead'
                 AND client_email = 'contractor-boundary@test.invalid'
          FROM public.designer_clients
          WHERE id = 'd6300000-0000-4000-8000-000000000006'),
    'lead-scoped relationships must preserve captured contact identity';
  ASSERT NOT has_function_privilege(
    'authenticated',
    'public._accept_design_request_profile_bound_core(uuid)', 'EXECUTE'
  ), 'the pre-eligibility arrival core must remain private';
END;
$$;

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
  v_direction_id uuid;
  v_revision_id uuid;
  v_duplicate_id uuid;
BEGIN
  v_result := public.begin_discovery('d6200000-0000-4000-8000-000000000002');
  ASSERT (v_result->>'designerClientId')::uuid =
         'd6300000-0000-4000-8000-000000000002',
    'profile-less email match must reuse the existing NULL-client row';
  ASSERT (SELECT client_id IS NULL
                 AND client_name = 'Old Name'
                 AND status = 'active'
                 AND source = 'direct'
                 AND lead_id = 'd6200000-0000-4000-8000-000000000002'
          FROM public.designer_clients
          WHERE id = 'd6300000-0000-4000-8000-000000000002'),
    'profile-less reuse must associate without rewinding progressed identity';

  -- Shape B is an intentional one-profile-leg shape: the proposal keeps the
  -- captured relationship even though that relationship has no auth profile.
  -- Exercise the real authenticated Discovery→Direction writer, then both clone
  -- modes, so the table boundary cannot regress this household to a dead end.
  INSERT INTO public.client_discovery (
    designer_client_id, designer_id, project_type, rooms,
    budget_min_cents, budget_max_cents, target_date,
    style_keywords, lifestyle
  ) VALUES (
    'd6300000-0000-4000-8000-000000000002',
    'd6000000-0000-4000-8000-000000000001',
    'full_service',
    '[{"name":"Living room","room_type":"living"}]'::jsonb,
    100000, 200000, current_date + 60,
    ARRAY['warm', 'quiet'], '["family"]'::jsonb
  );

  v_direction_id := public.begin_direction_from_discovery(
    'd6300000-0000-4000-8000-000000000002'
  );
  ASSERT (SELECT status = 'draft'
                 AND client_id IS NULL
                 AND designer_client_id = 'd6300000-0000-4000-8000-000000000002'
          FROM public.proposals WHERE id = v_direction_id),
    'authenticated begin_direction must admit the canonical profileless Shape-B draft';
  ASSERT public.begin_direction_from_discovery(
           'd6300000-0000-4000-8000-000000000002'
         ) = v_direction_id,
    'profileless begin_direction retry must remain idempotent';

  v_revision_id := public.clone_proposal(
    v_direction_id, 'revision', 'Profileless revision'
  );
  v_duplicate_id := public.clone_proposal(
    v_direction_id, 'duplicate', NULL
  );
  ASSERT (SELECT status = 'draft'
                 AND client_id IS NULL
                 AND designer_client_id = 'd6300000-0000-4000-8000-000000000002'
                 AND parent_proposal_id = v_direction_id
          FROM public.proposals WHERE id = v_revision_id),
    'profileless revision clone must preserve its Shape-B relationship';
  ASSERT (SELECT status = 'draft'
                 AND client_id IS NULL
                 AND designer_client_id = 'd6300000-0000-4000-8000-000000000002'
                 AND parent_proposal_id IS NULL
          FROM public.proposals WHERE id = v_duplicate_id),
    'profileless duplicate clone must preserve its Shape-B relationship';

  -- The invite route links the existing lead-scoped row in place. A stale
  -- begin_discovery retry must preserve that client identity and progression.
  UPDATE public.designer_clients
  SET client_id = 'd6000000-0000-4000-8000-000000000012',
      status = 'active', updated_at = now()
  WHERE id = 'd6300000-0000-4000-8000-000000000002';
  ASSERT (
    public.begin_discovery('d6200000-0000-4000-8000-000000000002')
    ->>'designerClientId'
  )::uuid = 'd6300000-0000-4000-8000-000000000002',
    'invite-linked retry must return the existing relationship';
  ASSERT (SELECT client_id = 'd6000000-0000-4000-8000-000000000012'
                 AND status = 'active'
          FROM public.designer_clients
          WHERE id = 'd6300000-0000-4000-8000-000000000002'),
    'invite-linked retry must not clear the client or downgrade status';
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

-- Sharing a contractor org, being a studio guest, or holding a suspended
-- studio membership is visibility context—not Brief→Discovery authority.
DO $$
DECLARE
  v_case record;
  v_error text;
BEGIN
  FOR v_case IN
    SELECT * FROM (VALUES
      ('d6000000-0000-4000-8000-000000000005'::uuid,
       'd6200000-0000-4000-8000-000000000006'::uuid,
       'shared contractor organization'),
      ('d6000000-0000-4000-8000-000000000006'::uuid,
       'd6200000-0000-4000-8000-000000000007'::uuid,
       'design-studio guest membership'),
      ('d6000000-0000-4000-8000-000000000007'::uuid,
       'd6200000-0000-4000-8000-000000000008'::uuid,
       'suspended design-studio membership')
    ) AS denied(actor_id, lead_id, label)
  LOOP
    PERFORM pg_temp.assume_begin_actor(v_case.actor_id);
    v_error := NULL;
    BEGIN
      PERFORM public.begin_discovery(v_case.lead_id);
    EXCEPTION WHEN insufficient_privilege THEN
      v_error := SQLERRM;
    END;
    ASSERT v_error = format(
      'lead %s not found or access denied', v_case.lead_id
    ), format('%s must not confer Discovery authority, got %L',
              v_case.label, v_error);
  END LOOP;
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
