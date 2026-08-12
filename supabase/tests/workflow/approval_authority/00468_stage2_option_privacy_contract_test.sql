-- Frozen-authority Stage-2 option visibility contract (00468).
\set ON_ERROR_STOP on

BEGIN;

DO $structure$
DECLARE
  v_policy text;
  v_helper text := pg_get_functiondef(
    'app_private.is_stage2_option_client(uuid)'::regprocedure
  );
BEGIN
  SELECT qual INTO v_policy
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'client_decision_options'
    AND policyname = 'Clients can view their decision options';

  ASSERT v_policy LIKE '%is_stage2_option_client%'
     AND v_policy LIKE '%is_addressed_client_decision%'
     AND v_policy LIKE '%IS DISTINCT FROM%project_artifact_v1%',
    'client option policy does not split frozen Stage-2 from legacy authority';
  ASSERT v_helper LIKE '%project_decision_authority_snapshots%'
     AND v_helper LIKE '%approval_contract = ''project_artifact_v1''%'
     AND v_helper LIKE '%decision_lead_id = auth.uid()%'
     AND v_helper LIKE '%search_path TO ''public'', ''pg_temp''%',
    'private Stage-2 option predicate is not frozen-authority coherent';
  ASSERT has_function_privilege(
    'authenticated', 'app_private.is_stage2_option_client(uuid)', 'EXECUTE'
  ) AND NOT has_function_privilege(
    'anon', 'app_private.is_stage2_option_client(uuid)', 'EXECUTE'
  ) AND NOT has_function_privilege(
    'service_role', 'app_private.is_stage2_option_client(uuid)', 'EXECUTE'
  ), 'private option predicate ACL is not authenticated-only';
  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_decision_options'
      AND policyname = 'client_decision_options_studio_select'
  ), '00468 removed the installed studio option read policy';

  ASSERT has_table_privilege(
    'authenticated', 'public.client_decision_options', 'SELECT'
  ), 'authenticated option SELECT grant was removed';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_decision_options'
      AND ('anon' = ANY(roles) OR 'public' = ANY(roles))
  ), 'anon unexpectedly received an option SELECT policy';
  ASSERT has_table_privilege(
    'service_role', 'public.client_decision_options', 'SELECT'
  ), 'service option grant changed outside the policy repair';
END
$structure$;

CREATE OR REPLACE FUNCTION pg_temp.assume_actor(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_actor::text,
      'role', 'authenticated',
      'aal', 'aal1'
    )::text,
    true
  );
END;
$$;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('a4400000-0000-4000-8000-000000000001', 'option-owner@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4400000-0000-4000-8000-000000000002', 'option-lead@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4400000-0000-4000-8000-000000000003', 'option-replacement@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4400000-0000-4000-8000-000000000004', 'option-project-client@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4400000-0000-4000-8000-000000000005', 'option-legacy@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4400000-0000-4000-8000-000000000006', 'option-peer@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4400000-0000-4000-8000-000000000007', 'option-foreign@test.invalid', '', now(), now(), now(), '00000000-0000-0000-8000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer)
VALUES
  ('a4400000-0000-4000-8000-000000000001', 'option-owner@test.invalid', 'Option Owner', true),
  ('a4400000-0000-4000-8000-000000000002', 'option-lead@test.invalid', 'Frozen Lead', false),
  ('a4400000-0000-4000-8000-000000000003', 'option-replacement@test.invalid', 'Relationship Replacement', false),
  ('a4400000-0000-4000-8000-000000000004', 'option-project-client@test.invalid', 'New Project Client', false),
  ('a4400000-0000-4000-8000-000000000005', 'option-legacy@test.invalid', 'Legacy Client', false),
  ('a4400000-0000-4000-8000-000000000006', 'option-peer@test.invalid', 'Option Studio Peer', true),
  ('a4400000-0000-4000-8000-000000000007', 'option-foreign@test.invalid', 'Foreign Actor', false)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES (
  'a4401000-0000-4000-8000-000000000001', 'design_studio',
  'Option Privacy Studio', 'option-privacy-studio', 'active'
);

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
) VALUES
  ('a4401100-0000-4000-8000-000000000001',
   'a4400000-0000-4000-8000-000000000001',
   'a4401000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('a4401100-0000-4000-8000-000000000002',
   'a4400000-0000-4000-8000-000000000006',
   'a4401000-0000-4000-8000-000000000001', 'member', 'active', now());

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
) VALUES
  ('a4402000-0000-4000-8000-000000000001',
   'a4400000-0000-4000-8000-000000000001',
   'a4400000-0000-4000-8000-000000000002',
   'Frozen Lead Relationship', 'active', 'direct'),
  ('a4402000-0000-4000-8000-000000000002',
   'a4400000-0000-4000-8000-000000000001',
   'a4400000-0000-4000-8000-000000000004',
   'New Project Client Relationship', 'active', 'direct'),
  ('a4402000-0000-4000-8000-000000000003',
   'a4400000-0000-4000-8000-000000000001',
   'a4400000-0000-4000-8000-000000000005',
   'Legacy Relationship', 'active', 'direct');

INSERT INTO public.projects (
  id, name, designer_id, client_id, created_by, studio_id, status
) VALUES (
  'a4403000-0000-4000-8000-000000000001', 'Option Privacy Project',
  'a4400000-0000-4000-8000-000000000001',
  'a4400000-0000-4000-8000-000000000002',
  'a4400000-0000-4000-8000-000000000001',
  'a4401000-0000-4000-8000-000000000001', 'active'
), (
  'a4403000-0000-4000-8000-000000000002', 'Legacy Option Project',
  'a4400000-0000-4000-8000-000000000001',
  'a4400000-0000-4000-8000-000000000005',
  'a4400000-0000-4000-8000-000000000001',
  'a4401000-0000-4000-8000-000000000001', 'active'
);

INSERT INTO public.project_phases (
  id, project_id, name, phase_key, status, sort_order
) VALUES (
  'a4403100-0000-4000-8000-000000000001',
  'a4403000-0000-4000-8000-000000000001',
  'Option privacy phase', 'design', 'in_progress', 0
);

INSERT INTO public.plan_issues (
  id, project_id, issue_number, name, idempotency_key, request_hash,
  set_checksum, sheet_count, created_by
) VALUES (
  'a4404000-0000-4000-8000-000000000001',
  'a4403000-0000-4000-8000-000000000001', 1,
  'Frozen option set', 'option-privacy-plan', repeat('1', 64),
  repeat('a', 64), 4, 'a4400000-0000-4000-8000-000000000001'
);

CREATE TEMP TABLE option_440_results (
  label text PRIMARY KEY,
  payload jsonb NOT NULL
);
GRANT SELECT, INSERT ON option_440_results TO authenticated;

SELECT pg_temp.assume_actor('a4400000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
INSERT INTO option_440_results(label, payload)
SELECT 'authority', public.set_project_decision_authority(
  'a4403000-0000-4000-8000-000000000001',
  'a4400000-0000-4000-8000-000000000002', NULL, 0
);
INSERT INTO option_440_results(label, payload)
SELECT 'stage2', public.create_project_approval_decision(
  'a4403000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'title', 'Frozen option approval',
    'question', 'Choose a frozen Stage-2 outcome?',
    'context', 'Client-safe option context.',
    'dueAt', (now() + interval '5 days')::text,
    'phaseId', 'a4403100-0000-4000-8000-000000000001',
    'sectionKey', 'project',
    'artifactKind', 'plan_issue',
    'artifactId', 'a4404000-0000-4000-8000-000000000001',
    'costCentsDelta', 0,
    'scheduleDaysDelta', 0,
    'leadTimeDaysDelta', 0
  ),
  'option-privacy-create'
);
RESET ROLE;

INSERT INTO public.client_decisions (
  id, designer_client_id, project_id, title, context, due_date, status,
  designer_id, sent_at, decision_type, decision_kind, coordination_kind,
  court, blocks_kind, blocking_status
) VALUES (
  'a4405000-0000-4000-8000-000000000001',
  'a4402000-0000-4000-8000-000000000003',
  'a4403000-0000-4000-8000-000000000002', 'Legacy finish choice',
  'Legacy client-safe context.', now() + interval '4 days', 'pending',
  'a4400000-0000-4000-8000-000000000001', now(), 'product', 'choice',
  'selection', 'client', 'none', 'non_blocking'
);
INSERT INTO public.client_decision_options (
  id, decision_id, name, selected, approves, created_at
) VALUES (
  'a4405100-0000-4000-8000-000000000001',
  'a4405000-0000-4000-8000-000000000001',
  'Legacy option', false, false, now()
);

-- The snapshot lead sees the three Stage-2 option ids before any mutable
-- relationship drift. Raw Stage-2 parent privacy remains unchanged.
SELECT pg_temp.assume_actor('a4400000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_stage2 uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM option_440_results WHERE label = 'stage2'
  );
BEGIN
  ASSERT (
    SELECT count(*) = 3
    FROM public.client_decision_options WHERE decision_id = v_stage2
  ), 'frozen lead lost the Stage-2 option-ID compatibility rail';
  ASSERT (
    SELECT count(*) = 0
    FROM public.client_decisions WHERE id = v_stage2
  ), 'option compatibility reopened raw Stage-2 parent reads';
END;
$$;
RESET ROLE;

-- Production-reachable drift: a studio changes the exact relationship row
-- referenced by the immutable decision, then separately reassigns the project.
SELECT pg_temp.assume_actor('a4400000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
UPDATE public.designer_clients
SET client_id = 'a4400000-0000-4000-8000-000000000003',
    client_name = 'Relationship Replacement'
WHERE id = 'a4402000-0000-4000-8000-000000000001';
SELECT public.set_document_client(
  'project',
  'a4403000-0000-4000-8000-000000000001',
  'a4400000-0000-4000-8000-000000000004'
);
INSERT INTO public.project_parties (
  id, project_id, party_kind, display_name, profile_id, created_by
) VALUES (
  'a4406000-0000-4000-8000-000000000001',
  'a4403000-0000-4000-8000-000000000001', 'client_rep',
  'Reassigned Project Client',
  'a4400000-0000-4000-8000-000000000004',
  'a4400000-0000-4000-8000-000000000001'
);
RESET ROLE;

-- Immutable authority wins after both relationship changes.
SELECT pg_temp.assume_actor('a4400000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_stage2 uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM option_440_results WHERE label = 'stage2'
  );
BEGIN
  ASSERT (
    SELECT count(*) = 3
    FROM public.client_decision_options WHERE decision_id = v_stage2
  ), 'frozen lead lost Stage-2 options after relationship drift';
END;
$$;
RESET ROLE;

SELECT pg_temp.assume_actor('a4400000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_stage2 uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM option_440_results WHERE label = 'stage2'
  );
BEGIN
  ASSERT (
    SELECT count(*) = 0
    FROM public.client_decision_options WHERE decision_id = v_stage2
  ), 'replacement relationship client inherited raw Stage-2 options';
END;
$$;
RESET ROLE;

SELECT pg_temp.assume_actor('a4400000-0000-4000-8000-000000000004');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_stage2 uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM option_440_results WHERE label = 'stage2'
  );
BEGIN
  ASSERT (
    SELECT count(*) = 0
    FROM public.client_decision_options WHERE decision_id = v_stage2
  ), 'new project client/project party inherited raw Stage-2 options';
END;
$$;
RESET ROLE;

-- The legacy branch remains mutable-relationship compatible.
SELECT pg_temp.assume_actor('a4400000-0000-4000-8000-000000000005');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_stage2 uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM option_440_results WHERE label = 'stage2'
  );
BEGIN
  ASSERT (
    SELECT count(*) = 1
    FROM public.client_decision_options
    WHERE decision_id = 'a4405000-0000-4000-8000-000000000001'
  ), 'legacy addressed-client option read regressed';
  ASSERT (
    SELECT count(*) = 0
    FROM public.client_decision_options WHERE decision_id = v_stage2
  ), 'unrelated legacy client received Stage-2 options';
END;
$$;
RESET ROLE;

-- Exact studio co-members retain the separate installed author policy.
SELECT pg_temp.assume_actor('a4400000-0000-4000-8000-000000000006');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_stage2 uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM option_440_results WHERE label = 'stage2'
  );
BEGIN
  ASSERT (
    SELECT count(*) = 3
    FROM public.client_decision_options WHERE decision_id = v_stage2
  ), 'studio co-member option reads regressed';
END;
$$;
RESET ROLE;

SELECT pg_temp.assume_actor('a4400000-0000-4000-8000-000000000007');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT (SELECT count(*) = 0 FROM public.client_decision_options),
    'foreign authenticated actor received option rows';
END;
$$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $$
BEGIN
  ASSERT (SELECT count(*) = 0 FROM public.client_decision_options),
    'anonymous actor received option rows';
END;
$$;
RESET ROLE;

ROLLBACK;
