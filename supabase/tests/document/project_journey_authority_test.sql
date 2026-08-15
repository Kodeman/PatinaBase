-- Project lifecycle / reassignment authority regression (00399)
-- Run:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/document/project_journey_authority_test.sql

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
SELECT id, email, '', now(), now(), now(),
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
FROM (VALUES
  ('f9000000-0000-4000-8000-000000000001'::uuid, 'project-owner@test.invalid'),
  ('f9000000-0000-4000-8000-000000000002'::uuid, 'project-target@test.invalid'),
  ('f9000000-0000-4000-8000-000000000003'::uuid, 'project-admin@test.invalid'),
  ('f9000000-0000-4000-8000-000000000004'::uuid, 'project-guest@test.invalid'),
  ('f9000000-0000-4000-8000-000000000005'::uuid, 'project-inactive@test.invalid'),
  ('f9000000-0000-4000-8000-000000000006'::uuid, 'project-contractor@test.invalid'),
  ('f9000000-0000-4000-8000-000000000007'::uuid, 'project-maker@test.invalid'),
  ('f9000000-0000-4000-8000-000000000008'::uuid, 'project-foreign@test.invalid'),
  ('f9000000-0000-4000-8000-000000000009'::uuid, 'project-nondesign@test.invalid'),
  ('f9000000-0000-4000-8000-000000000010'::uuid, 'project-client@test.invalid')
) AS fixture(id, email);

INSERT INTO public.profiles (
  id, email, full_name, is_designer, created_at, updated_at
)
SELECT id, email, name, is_designer, now(), now()
FROM (VALUES
  ('f9000000-0000-4000-8000-000000000001'::uuid, 'project-owner@test.invalid', 'Project Owner', true),
  ('f9000000-0000-4000-8000-000000000002'::uuid, 'project-target@test.invalid', 'Project Target', true),
  ('f9000000-0000-4000-8000-000000000003'::uuid, 'project-admin@test.invalid', 'Project Admin', true),
  ('f9000000-0000-4000-8000-000000000004'::uuid, 'project-guest@test.invalid', 'Project Guest', true),
  ('f9000000-0000-4000-8000-000000000005'::uuid, 'project-inactive@test.invalid', 'Project Inactive', true),
  ('f9000000-0000-4000-8000-000000000006'::uuid, 'project-contractor@test.invalid', 'Project Contractor', true),
  ('f9000000-0000-4000-8000-000000000007'::uuid, 'project-maker@test.invalid', 'Project Maker', true),
  ('f9000000-0000-4000-8000-000000000008'::uuid, 'project-foreign@test.invalid', 'Project Foreign', true),
  ('f9000000-0000-4000-8000-000000000009'::uuid, 'project-nondesign@test.invalid', 'Project Non-designer', false),
  ('f9000000-0000-4000-8000-000000000010'::uuid, 'project-client@test.invalid', 'Project Client', false)
) AS fixture(id, email, name, is_designer)
ON CONFLICT (id) DO UPDATE SET is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('f9010000-0000-4000-8000-000000000001', 'design_studio', 'Project Studio', 'project-studio', 'active'),
  ('f9010000-0000-4000-8000-000000000002', 'design_studio', 'Foreign Studio', 'project-foreign-studio', 'active'),
  ('f9010000-0000-4000-8000-000000000003', 'contractor', 'Shared Contractor', 'journey-project-contractor', 'active'),
  ('f9010000-0000-4000-8000-000000000004', 'manufacturer', 'Shared Maker', 'journey-project-maker', 'active');

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES
  ('f9020000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', 'f9010000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('f9020000-0000-4000-8000-000000000002', 'f9000000-0000-4000-8000-000000000002', 'f9010000-0000-4000-8000-000000000001', 'member', 'active', now()),
  ('f9020000-0000-4000-8000-000000000003', 'f9000000-0000-4000-8000-000000000003', 'f9010000-0000-4000-8000-000000000001', 'admin', 'active', now()),
  ('f9020000-0000-4000-8000-000000000004', 'f9000000-0000-4000-8000-000000000004', 'f9010000-0000-4000-8000-000000000001', 'guest', 'active', now()),
  ('f9020000-0000-4000-8000-000000000005', 'f9000000-0000-4000-8000-000000000005', 'f9010000-0000-4000-8000-000000000001', 'member', 'suspended', now()),
  ('f9020000-0000-4000-8000-000000000006', 'f9000000-0000-4000-8000-000000000009', 'f9010000-0000-4000-8000-000000000001', 'member', 'active', now()),
  ('f9020000-0000-4000-8000-000000000007', 'f9000000-0000-4000-8000-000000000008', 'f9010000-0000-4000-8000-000000000002', 'owner', 'active', now()),
  ('f9020000-0000-4000-8000-000000000008', 'f9000000-0000-4000-8000-000000000001', 'f9010000-0000-4000-8000-000000000003', 'owner', 'active', now()),
  ('f9020000-0000-4000-8000-000000000009', 'f9000000-0000-4000-8000-000000000006', 'f9010000-0000-4000-8000-000000000003', 'member', 'active', now()),
  ('f9020000-0000-4000-8000-000000000010', 'f9000000-0000-4000-8000-000000000001', 'f9010000-0000-4000-8000-000000000004', 'owner', 'active', now()),
  ('f9020000-0000-4000-8000-000000000011', 'f9000000-0000-4000-8000-000000000007', 'f9010000-0000-4000-8000-000000000004', 'member', 'active', now());

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, client_email, status, source
) VALUES (
  'f9030000-0000-4000-8000-000000000001',
  'f9000000-0000-4000-8000-000000000001',
  'f9000000-0000-4000-8000-000000000010',
  'Project Client', 'project-client@test.invalid', 'active', 'direct'
);

INSERT INTO public.projects (
  id, name, designer_id, created_by, client_id, studio_id, status
) VALUES
  ('f9040000-0000-4000-8000-000000000001', 'Authority Project',
   'f9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001',
   'f9000000-0000-4000-8000-000000000010', 'f9010000-0000-4000-8000-000000000001', 'active'),
  ('f9040000-0000-4000-8000-000000000002', 'Completed Project',
   'f9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001',
   'f9000000-0000-4000-8000-000000000010', 'f9010000-0000-4000-8000-000000000001', 'completed');

INSERT INTO public.proposals (
  id, project_id, designer_id, designer_client_id, client_id,
  title, total_amount, status
) VALUES (
  'f9050000-0000-4000-8000-000000000001',
  'f9040000-0000-4000-8000-000000000001',
  'f9000000-0000-4000-8000-000000000001',
  'f9030000-0000-4000-8000-000000000001',
  'f9000000-0000-4000-8000-000000000010',
  'Historical Proposal', 100000, 'draft'
);

INSERT INTO public.client_decisions (
  id, designer_client_id, designer_id, project_id, linked_proposal_id,
  title, status, sent_at
) VALUES
  ('f9060000-0000-4000-8000-000000000001',
   'f9030000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001',
   'f9040000-0000-4000-8000-000000000001', NULL,
   'Transfer with current lead', 'pending', now()),
  ('f9060000-0000-4000-8000-000000000002',
   'f9030000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001',
   'f9040000-0000-4000-8000-000000000001', 'f9050000-0000-4000-8000-000000000001',
   'Historical signature approval', 'responded', now());

CREATE OR REPLACE FUNCTION pg_temp.assume_project_actor(p_actor uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_actor, 'role', 'authenticated')::text,
    true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.assume_project_actor(uuid) TO authenticated;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_project_actor('f9000000-0000-4000-8000-000000000001');

-- No organization adjacency outside the exact active design studio confers
-- reassignment authority. Every denial is rollback-clean.
DO $$
DECLARE
  v_actor uuid;
  v_error text;
  v_relationships integer;
  v_activities integer;
  v_audits integer;
BEGIN
  SELECT count(*) INTO v_relationships FROM public.designer_clients;
  SELECT count(*) INTO v_activities FROM public.client_activity_log;
  SELECT count(*) INTO v_audits FROM public.audit_logs;

  FOREACH v_actor IN ARRAY ARRAY[
    'f9000000-0000-4000-8000-000000000004'::uuid,
    'f9000000-0000-4000-8000-000000000005'::uuid,
    'f9000000-0000-4000-8000-000000000006'::uuid,
    'f9000000-0000-4000-8000-000000000007'::uuid,
    'f9000000-0000-4000-8000-000000000008'::uuid
  ] LOOP
    PERFORM pg_temp.assume_project_actor(v_actor);
    v_error := NULL;
    BEGIN
      PERFORM public.reassign_project_lead(
        'f9040000-0000-4000-8000-000000000001',
        'f9000000-0000-4000-8000-000000000001',
        'f9000000-0000-4000-8000-000000000002'
      );
    EXCEPTION WHEN insufficient_privilege THEN
      v_error := SQLERRM;
    END;
    ASSERT v_error IS NOT NULL,
      format('actor %s must not gain reassignment authority', v_actor);
    PERFORM pg_temp.assume_project_actor(
      'f9000000-0000-4000-8000-000000000001'
    );
    ASSERT (SELECT designer_id = 'f9000000-0000-4000-8000-000000000001'
            FROM public.projects WHERE id = 'f9040000-0000-4000-8000-000000000001'),
      'denied reassignment must preserve the project lead';
  END LOOP;

  ASSERT (SELECT count(*) = v_relationships FROM public.designer_clients),
    'denied reassignments must not create relationships';
  ASSERT (SELECT count(*) = v_activities FROM public.client_activity_log),
    'denied reassignments must not create client activity';
  ASSERT (SELECT count(*) = v_audits FROM public.audit_logs),
    'denied reassignments must not create audit rows';
END;
$$;

SELECT pg_temp.assume_project_actor('f9000000-0000-4000-8000-000000000001');

DO $$
DECLARE
  v_target uuid;
  v_error text;
BEGIN
  -- Active same-studio membership is insufficient without designer identity;
  -- guest, inactive, foreign-studio targets are also denied.
  FOREACH v_target IN ARRAY ARRAY[
    'f9000000-0000-4000-8000-000000000009'::uuid,
    'f9000000-0000-4000-8000-000000000004'::uuid,
    'f9000000-0000-4000-8000-000000000005'::uuid,
    'f9000000-0000-4000-8000-000000000008'::uuid
  ] LOOP
    v_error := NULL;
    BEGIN
      PERFORM public.reassign_project_lead(
        'f9040000-0000-4000-8000-000000000001',
        'f9000000-0000-4000-8000-000000000001', v_target
      );
    EXCEPTION WHEN insufficient_privilege THEN
      v_error := SQLERRM;
    END;
    ASSERT v_error IS NOT NULL,
      format('target %s must not be an eligible lead', v_target);
  END LOOP;

  BEGIN
    PERFORM public.reassign_project_lead(
      'f9040000-0000-4000-8000-000000000001',
      'f9000000-0000-4000-8000-000000000003',
      'f9000000-0000-4000-8000-000000000002'
    );
  EXCEPTION WHEN serialization_failure THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'stale expected lead must reject';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.designer_clients
    WHERE designer_id = 'f9000000-0000-4000-8000-000000000002'
      AND client_id = 'f9000000-0000-4000-8000-000000000010'
  ), 'stale CAS must have no relationship side effects';
END;
$$;

DO $$
DECLARE
  v_project public.projects;
BEGIN
  v_project := public.reassign_project_lead(
    'f9040000-0000-4000-8000-000000000001',
    'f9000000-0000-4000-8000-000000000001',
    'f9000000-0000-4000-8000-000000000002'
  );
  ASSERT v_project.designer_id = 'f9000000-0000-4000-8000-000000000002',
    'the current lead may transfer to an active same-studio designer';
  ASSERT (SELECT designer_id = 'f9000000-0000-4000-8000-000000000002'
                 AND designer_client_id <> 'f9030000-0000-4000-8000-000000000001'
          FROM public.client_decisions
          WHERE id = 'f9060000-0000-4000-8000-000000000001'),
    'ordinary project decisions must follow the current lead relationship';
  ASSERT (SELECT designer_id = 'f9000000-0000-4000-8000-000000000001'
                 AND designer_client_id = 'f9030000-0000-4000-8000-000000000001'
          FROM public.client_decisions
          WHERE id = 'f9060000-0000-4000-8000-000000000002'),
    'proposal approval evidence must preserve historical authorship';
  ASSERT (SELECT designer_id = 'f9000000-0000-4000-8000-000000000001'
          FROM public.proposals WHERE id = 'f9050000-0000-4000-8000-000000000001'),
    'project reassignment must not rewrite proposal provenance';
  ASSERT EXISTS (
    SELECT 1 FROM public.project_team_members
    WHERE project_id = 'f9040000-0000-4000-8000-000000000001'
      AND user_id = 'f9000000-0000-4000-8000-000000000001'
      AND role = 'previous_lead' AND removed_at IS NULL
  ), 'old lead must remain as historical team context';
  ASSERT EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE resource_id = 'f9040000-0000-4000-8000-000000000001'
      AND action = 'project.lead_reassigned'
  ), 'successful reassignment must be audited';
END;
$$;

SELECT pg_temp.assume_project_actor('f9000000-0000-4000-8000-000000000003');
DO $$
DECLARE
  v_project public.projects;
BEGIN
  v_project := public.reassign_project_lead(
    'f9040000-0000-4000-8000-000000000001',
    'f9000000-0000-4000-8000-000000000002',
    'f9000000-0000-4000-8000-000000000001'
  );
  ASSERT v_project.designer_id = 'f9000000-0000-4000-8000-000000000001',
    'an active exact-studio admin may transfer the lead';
END;
$$;

SELECT pg_temp.assume_project_actor('f9000000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_project public.projects;
  v_error text;
BEGIN
  v_project := public.set_project_operational_status(
    'f9040000-0000-4000-8000-000000000001', 'active', 'on_hold'
  );
  ASSERT v_project.status = 'on_hold', 'checked hold must succeed';
  v_project := public.set_project_operational_status(
    'f9040000-0000-4000-8000-000000000001', 'on_hold', 'active'
  );
  ASSERT v_project.status = 'active', 'checked resume must succeed';

  BEGIN
    UPDATE public.projects SET status = 'on_hold'
    WHERE id = 'f9040000-0000-4000-8000-000000000001';
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'direct hold must be denied';

  v_error := NULL;
  BEGIN
    UPDATE public.projects SET closure_checklist = '[]'::jsonb
    WHERE id = 'f9040000-0000-4000-8000-000000000001';
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'direct closeout evidence update must be denied';

  v_error := NULL;
  BEGIN
    INSERT INTO public.projects (
      id, name, designer_id, created_by, client_id, studio_id, status,
      closure_checklist
    ) VALUES (
      'f9040000-0000-4000-8000-000000000003', 'Forged Closeout',
      'f9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001',
      'f9000000-0000-4000-8000-000000000010', 'f9010000-0000-4000-8000-000000000001',
      'active', '[]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'closeout evidence cannot be preloaded on insert';

  v_project := public.archive_project(
    'f9040000-0000-4000-8000-000000000002', 'completed'
  );
  ASSERT v_project.status = 'archived', 'completed project may enter archive';
  v_project := public.archive_project(
    'f9040000-0000-4000-8000-000000000002', 'completed'
  );
  ASSERT v_project.status = 'archived', 'archive retry must be idempotent';

  v_error := NULL;
  BEGIN
    PERFORM public.set_project_operational_status(
      'f9040000-0000-4000-8000-000000000002', 'archived', 'active'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'archived project cannot re-enter operations';

  v_error := NULL;
  BEGIN
    PERFORM public.reassign_project_lead(
      'f9040000-0000-4000-8000-000000000002',
      'f9000000-0000-4000-8000-000000000001',
      'f9000000-0000-4000-8000-000000000002'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'archived project lead is immutable';

  v_error := NULL;
  BEGIN
    UPDATE public.projects
    SET client_id = 'f9000000-0000-4000-8000-000000000008'
    WHERE id = 'f9040000-0000-4000-8000-000000000001';
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'proposal-backed project client cannot diverge from its relationship';
END;
$$;

ROLLBACK;
