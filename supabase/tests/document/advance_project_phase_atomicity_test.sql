-- advance_project_phase atomicity, authority, graph, and ACL regression (00393)
-- Run:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/document/advance_project_phase_atomicity_test.sql

CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('a9000000-0000-4000-8000-000000000001', 'phase-owner@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a9000000-0000-4000-8000-000000000002', 'phase-peer@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a9000000-0000-4000-8000-000000000003', 'phase-outsider@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a9000000-0000-4000-8000-000000000004', 'phase-client@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('a9000000-0000-4000-8000-000000000001', 'phase-owner@test.invalid', 'Phase Owner', NOW(), NOW()),
  ('a9000000-0000-4000-8000-000000000002', 'phase-peer@test.invalid', 'Phase Peer', NOW(), NOW()),
  ('a9000000-0000-4000-8000-000000000003', 'phase-outsider@test.invalid', 'Phase Outsider', NOW(), NOW()),
  ('a9000000-0000-4000-8000-000000000004', 'phase-client@test.invalid', 'Phase Client', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('a9100000-0000-4000-8000-000000000001', 'design_studio',
   'Atomic Phase Studio', 'atomic-phase-studio', 'active'),
  ('a9100000-0000-4000-8000-000000000002', 'contractor',
   'Atomic Phase Contractor', 'atomic-phase-contractor', 'active');

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES
  ('a9110000-0000-4000-8000-000000000001',
   'a9000000-0000-4000-8000-000000000001',
   'a9100000-0000-4000-8000-000000000001', 'owner', 'active', NOW()),
  ('a9110000-0000-4000-8000-000000000002',
   'a9000000-0000-4000-8000-000000000002',
   'a9100000-0000-4000-8000-000000000001', 'member', 'active', NOW()),
  -- Sharing only a contractor organization must not confer lifecycle authority.
  ('a9110000-0000-4000-8000-000000000003',
   'a9000000-0000-4000-8000-000000000001',
   'a9100000-0000-4000-8000-000000000002', 'member', 'active', NOW()),
  ('a9110000-0000-4000-8000-000000000004',
   'a9000000-0000-4000-8000-000000000003',
   'a9100000-0000-4000-8000-000000000002', 'member', 'active', NOW());

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
)
VALUES (
  'a9200000-0000-4000-8000-000000000001',
  'a9000000-0000-4000-8000-000000000001',
  'a9000000-0000-4000-8000-000000000004',
  'Phase Client', 'active', 'direct'
);

INSERT INTO public.projects (
  id, name, designer_id, client_id, created_by, status, current_phase
)
VALUES
  ('a9300000-0000-4000-8000-000000000001', 'Canonical chain',
   'a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000004',
   'a9000000-0000-4000-8000-000000000001', 'active', 'duplicate-key'),
  ('a9300000-0000-4000-8000-000000000002', 'Resume delayed',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'stale-pointer'),
  ('a9300000-0000-4000-8000-000000000003', 'Terminal main',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'last'),
  ('a9300000-0000-4000-8000-000000000004', 'Terminal thread',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'main-live'),
  ('a9300000-0000-4000-8000-000000000005', 'Track-five blocker',
   'a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000004',
   'a9000000-0000-4000-8000-000000000001', 'active', 'blocked'),
  ('a9300000-0000-4000-8000-000000000006', 'Legacy blocker',
   'a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000004',
   'a9000000-0000-4000-8000-000000000001', 'active', 'legacy-blocked'),
  ('a9300000-0000-4000-8000-000000000007', 'On hold',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'on_hold', 'paused'),
  ('a9300000-0000-4000-8000-000000000008', 'Completed project',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'completed', NULL),
  ('a9300000-0000-4000-8000-000000000009', 'Ambiguous graph',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'ambiguous'),
  ('a9300000-0000-4000-8000-00000000000a', 'Missing graph',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'missing'),
  ('a9300000-0000-4000-8000-00000000000b', 'Cyclic graph',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'cyclic'),
  ('a9300000-0000-4000-8000-00000000000c', 'Outsider target',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'owned'),
  ('a9300000-0000-4000-8000-00000000000d', 'Studio peer target',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'peer-delayed'),
  ('a9300000-0000-4000-8000-00000000000e', 'Cross-project phase source',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'cross'),
  ('a9300000-0000-4000-8000-00000000000f', 'Successor rollback',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'before-successor-failure'),
  ('a9300000-0000-4000-8000-000000000010', 'Project rollback',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'before-project-failure'),
  ('a9300000-0000-4000-8000-000000000011', 'Double CAS',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'double'),
  ('a9300000-0000-4000-8000-000000000012', 'Responded configured gate',
   'a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000004',
   'a9000000-0000-4000-8000-000000000001', 'active', 'gate');

INSERT INTO public.project_phases (
  id, project_id, name, phase_key, status, progress, sort_order,
  follows_phase_id, lane, gate_condition
)
VALUES
  -- Exact follows beats sort_order. Duplicate/NULL keys must never widen writes.
  ('aa000000-0000-4000-8000-000000000000', 'a9300000-0000-4000-8000-000000000001',
   'Completed predecessor', 'duplicate-key', 'completed', 100, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000001', 'a9300000-0000-4000-8000-000000000001',
   'Canonical target', 'duplicate-key', 'in_progress', 40, 500,
   'aa000000-0000-4000-8000-000000000000', 'main', NULL),
  ('aa000000-0000-4000-8000-000000000002', 'a9300000-0000-4000-8000-000000000001',
   'Canonical successor', NULL, 'pending', 0, -500,
   'aa000000-0000-4000-8000-000000000001', 'main', NULL),
  ('aa000000-0000-4000-8000-000000000003', 'a9300000-0000-4000-8000-000000000001',
   'Later successor', 'later', 'pending', 0, -1000,
   'aa000000-0000-4000-8000-000000000002', 'main', NULL),
  ('aa000000-0000-4000-8000-000000000004', 'a9300000-0000-4000-8000-000000000001',
   'Live parallel thread', NULL, 'in_progress', 50, -2000,
   'aa000000-0000-4000-8000-000000000001', 'thread', NULL),
  ('aa000000-0000-4000-8000-000000000005', 'a9300000-0000-4000-8000-000000000001',
   'Thread successor sharing NULL key', NULL, 'pending', 0, -3000,
   'aa000000-0000-4000-8000-000000000004', 'thread', NULL),

  ('aa000000-0000-4000-8000-000000000010', 'a9300000-0000-4000-8000-000000000002',
   'Resume by name', NULL, 'delayed', 35, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000020', 'a9300000-0000-4000-8000-000000000003',
   'Last main phase', 'last', 'in_progress', 80, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000030', 'a9300000-0000-4000-8000-000000000004',
   'Live main', 'main-live', 'in_progress', 50, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000031', 'a9300000-0000-4000-8000-000000000004',
   'Last thread', 'thread-last', 'in_progress', 90, 1,
   'aa000000-0000-4000-8000-000000000030', 'thread', NULL),
  ('aa000000-0000-4000-8000-000000000040', 'a9300000-0000-4000-8000-000000000005',
   'Blocked Track Five', 'blocked', 'in_progress', 70, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000050', 'a9300000-0000-4000-8000-000000000006',
   'Blocked legacy', 'legacy-blocked', 'in_progress', 70, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000060', 'a9300000-0000-4000-8000-000000000007',
   'Paused project phase', 'paused', 'in_progress', 70, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000070', 'a9300000-0000-4000-8000-000000000008',
   'Completed project phase', 'closed', 'in_progress', 70, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000080', 'a9300000-0000-4000-8000-000000000009',
   'Ambiguous target', 'ambiguous', 'in_progress', 70, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000081', 'a9300000-0000-4000-8000-000000000009',
   'Ambiguous child A', 'ambiguous-a', 'pending', 0, 1,
   'aa000000-0000-4000-8000-000000000080', 'main', NULL),
  ('aa000000-0000-4000-8000-000000000082', 'a9300000-0000-4000-8000-000000000009',
   'Ambiguous child B', 'ambiguous-b', 'pending', 0, 2,
   'aa000000-0000-4000-8000-000000000080', 'main', NULL),
  ('aa000000-0000-4000-8000-000000000090', 'a9300000-0000-4000-8000-00000000000a',
   'Missing target', 'missing', 'in_progress', 70, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000091', 'a9300000-0000-4000-8000-00000000000a',
   'Dangling pending root', 'dangling', 'pending', 0, -100, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-0000000000a0', 'a9300000-0000-4000-8000-00000000000b',
   'Cycle target', 'cyclic', 'in_progress', 70, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-0000000000a1', 'a9300000-0000-4000-8000-00000000000b',
   'Cycle B', 'cycle-b', 'pending', 0, 1,
   'aa000000-0000-4000-8000-0000000000a0', 'main', NULL),
  ('aa000000-0000-4000-8000-0000000000a2', 'a9300000-0000-4000-8000-00000000000b',
   'Cycle C', 'cycle-c', 'pending', 0, 2,
   'aa000000-0000-4000-8000-0000000000a1', 'main', NULL),
  ('aa000000-0000-4000-8000-0000000000b0', 'a9300000-0000-4000-8000-00000000000c',
   'Outsider phase', 'owned', 'in_progress', 70, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-0000000000c0', 'a9300000-0000-4000-8000-00000000000d',
   'Peer delayed phase', 'peer-delayed', 'delayed', 20, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-0000000000d0', 'a9300000-0000-4000-8000-00000000000e',
   'Cross-project phase', 'cross', 'in_progress', 20, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-0000000000e0', 'a9300000-0000-4000-8000-00000000000f',
   'Successor rollback target', 'before-successor-failure', 'in_progress', 20, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-0000000000e1', 'a9300000-0000-4000-8000-00000000000f',
   'Injected successor', 'after-successor-failure', 'pending', 0, 1,
   'aa000000-0000-4000-8000-0000000000e0', 'main', NULL),
  ('aa000000-0000-4000-8000-0000000000f0', 'a9300000-0000-4000-8000-000000000010',
   'Project rollback target', 'before-project-failure', 'in_progress', 20, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-0000000000f1', 'a9300000-0000-4000-8000-000000000010',
   'Project rollback successor', 'after-project-failure', 'pending', 0, 1,
   'aa000000-0000-4000-8000-0000000000f0', 'main', NULL),
  ('aa000000-0000-4000-8000-000000000100', 'a9300000-0000-4000-8000-000000000011',
   'Double CAS target', 'double', 'in_progress', 20, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000110', 'a9300000-0000-4000-8000-000000000012',
   'Configured gate with resolved runtime item', 'gate', 'in_progress', 90, 0,
   NULL, 'main', 'Client sign-off recorded');

-- Close the cycle only after every referenced row exists.
UPDATE public.project_phases
SET follows_phase_id = 'aa000000-0000-4000-8000-0000000000a2'
WHERE id = 'aa000000-0000-4000-8000-0000000000a0';

INSERT INTO public.client_decisions (
  id, designer_client_id, designer_id, project_id, phase_id, title,
  decision_type, status, blocks_kind, blocking_status
)
VALUES
  ('ab000000-0000-4000-8000-000000000001',
   'a9200000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000001',
   'a9300000-0000-4000-8000-000000000005', 'aa000000-0000-4000-8000-000000000040',
   'Pending Track Five phase blocker', 'approval', 'pending', 'phase', 'non_blocking'),
  ('ab000000-0000-4000-8000-000000000002',
   'a9200000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000001',
   'a9300000-0000-4000-8000-000000000006', 'aa000000-0000-4000-8000-000000000050',
   'Pending legacy phase blocker', 'approval', 'pending', 'none', 'blocks_phase'),
  ('ab000000-0000-4000-8000-000000000003',
   'a9200000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000001',
   'a9300000-0000-4000-8000-000000000012', 'aa000000-0000-4000-8000-000000000110',
   'Responded runtime gate', 'approval', 'responded', 'phase', 'blocks_phase');

CREATE OR REPLACE FUNCTION pg_temp.assume_phase_actor(
  p_actor uuid,
  p_role text DEFAULT 'authenticated'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    CASE
      WHEN p_actor IS NULL THEN json_build_object('role', p_role)::text
      ELSE json_build_object('sub', p_actor, 'role', p_role)::text
    END,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_phase_failure(
  p_project_id uuid,
  p_phase_id uuid,
  p_expected_status text,
  p_expected_state text,
  p_expected_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_state text;
  v_message text;
BEGIN
  BEGIN
    PERFORM public.advance_project_phase(
      p_project_id, p_phase_id, p_expected_status
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_state = RETURNED_SQLSTATE,
      v_message = MESSAGE_TEXT;
  END;

  ASSERT v_state = p_expected_state,
    format('expected SQLSTATE %s, got %L (%L)', p_expected_state, v_state, v_message);
  ASSERT v_message = p_expected_message,
    format('expected error %L, got %L', p_expected_message, v_message);
END;
$$;

-- Browser ACL: authenticated only. PUBLIC would make anon true, so the anon
-- assertion also proves no inherited PUBLIC execute; service_role is explicit.
DO $$
BEGIN
  ASSERT has_function_privilege(
    'authenticated', 'public.advance_project_phase(uuid,uuid,text)', 'EXECUTE'
  ), 'authenticated must execute advance_project_phase';
  ASSERT NOT has_function_privilege(
    'anon', 'public.advance_project_phase(uuid,uuid,text)', 'EXECUTE'
  ), 'anon/PUBLIC must not execute advance_project_phase';
  ASSERT NOT has_function_privilege(
    'service_role', 'public.advance_project_phase(uuid,uuid,text)', 'EXECUTE'
  ), 'service_role must not execute advance_project_phase';
  ASSERT (
    SELECT prosecdef
    FROM pg_proc
    WHERE oid = 'public.advance_project_phase(uuid,uuid,text)'::regprocedure
  ), 'advance_project_phase must remain SECURITY DEFINER';
  ASSERT (
    SELECT proconfig = ARRAY['search_path=public, pg_temp']
    FROM pg_proc
    WHERE oid = 'public.advance_project_phase(uuid,uuid,text)'::regprocedure
  ), 'advance_project_phase must pin public, pg_temp search_path';
END;
$$;

SET LOCAL ROLE authenticated;

-- A database role without a user subject remains unauthorized.
SELECT pg_temp.assume_phase_actor(NULL);
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000001',
  'aa000000-0000-4000-8000-000000000001',
  'in_progress', '42501',
  'advance_project_phase requires an authenticated user'
);

-- Contractor co-membership and an unrelated user never confer project acts.
SELECT pg_temp.assume_phase_actor('a9000000-0000-4000-8000-000000000003');
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-00000000000c',
  'aa000000-0000-4000-8000-0000000000b0',
  'in_progress', '42501',
  'advance_project_phase: project not found or access denied'
);
DO $$ BEGIN
  ASSERT (SELECT status = 'in_progress' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-0000000000b0'),
    'outsider denial must preserve the target';
END $$;

-- An active non-guest design-studio peer may resume. Resume uses the same RPC
-- and exact three-key receipt, with the resumed phase named as next_phase_id.
SELECT pg_temp.assume_phase_actor('a9000000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v_receipt jsonb;
BEGIN
  v_receipt := public.advance_project_phase(
    'a9300000-0000-4000-8000-00000000000d',
    'aa000000-0000-4000-8000-0000000000c0',
    'delayed'
  );
  ASSERT v_receipt = jsonb_build_object(
    'completed_phase_id', NULL,
    'next_phase_id', 'aa000000-0000-4000-8000-0000000000c0'::uuid,
    'terminal', false
  ), format('unexpected peer resume receipt: %s', v_receipt);
  ASSERT (SELECT status = 'in_progress' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-0000000000c0'),
    'peer resume must activate the exact delayed row';
END;
$$;

SELECT pg_temp.assume_phase_actor('a9000000-0000-4000-8000-000000000001');

-- Invalid expected status and cross-project phase pairing both fail before a
-- write. The latter does not fall through to any phase belonging to the project.
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000001',
  'aa000000-0000-4000-8000-000000000001',
  'pending', '22023',
  'advance_project_phase expected status must be in_progress or delayed'
);
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000001',
  'aa000000-0000-4000-8000-0000000000d0',
  'in_progress', '23514',
  'advance_project_phase: phase does not belong to project'
);

-- Inactive projects reject without changing their in-progress phase.
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000007',
  'aa000000-0000-4000-8000-000000000060',
  'in_progress', '23514',
  'advance_project_phase: project is not active'
);
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000008',
  'aa000000-0000-4000-8000-000000000070',
  'in_progress', '23514',
  'advance_project_phase: project is not active'
);

-- Both runtime blocker spellings reject and roll back every phase/project row.
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000005',
  'aa000000-0000-4000-8000-000000000040',
  'in_progress', '23514',
  'advance_project_phase: 1 unresolved phase blocker(s)'
);
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000006',
  'aa000000-0000-4000-8000-000000000050',
  'in_progress', '23514',
  'advance_project_phase: 1 unresolved phase blocker(s)'
);
DO $$ BEGIN
  ASSERT (SELECT status = 'in_progress' FROM public.project_phases
          WHERE id IN ('aa000000-0000-4000-8000-000000000040',
                       'aa000000-0000-4000-8000-000000000050')
          GROUP BY status HAVING count(*) = 2),
    'blocker rejection must roll back both targets';
END $$;

-- A responded blocker is history. gate_condition text is descriptive, while
-- this resolved runtime row is the actual unlock state.
DO $$
DECLARE v_receipt jsonb;
BEGIN
  v_receipt := public.advance_project_phase(
    'a9300000-0000-4000-8000-000000000012',
    'aa000000-0000-4000-8000-000000000110',
    'in_progress'
  );
  ASSERT v_receipt->>'terminal' = 'true'
     AND v_receipt->>'next_phase_id' IS NULL,
    format('resolved runtime gate should allow lane terminal: %s', v_receipt);
END;
$$;

-- Ambiguous, missing/dangling, and cyclic lane graphs reject deterministically.
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000009',
  'aa000000-0000-4000-8000-000000000080',
  'in_progress', '23514',
  'advance_project_phase: canonical successor is ambiguous'
);
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-00000000000a',
  'aa000000-0000-4000-8000-000000000090',
  'in_progress', '23514',
  'advance_project_phase: canonical successor is missing'
);
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-00000000000b',
  'aa000000-0000-4000-8000-0000000000a0',
  'in_progress', '23514',
  'advance_project_phase: canonical successor chain is cyclic'
);

-- Canonical main transition: exact follows edge wins despite inverse sort,
-- active thread survives, NULL/duplicate phase keys never widen either write.
DO $$
DECLARE
  v_receipt jsonb;
  v_keys text[];
BEGIN
  v_receipt := public.advance_project_phase(
    'a9300000-0000-4000-8000-000000000001',
    'aa000000-0000-4000-8000-000000000001',
    'in_progress'
  );
  SELECT array_agg(key ORDER BY key) INTO v_keys
  FROM jsonb_object_keys(v_receipt) AS key;

  ASSERT v_keys = ARRAY['completed_phase_id', 'next_phase_id', 'terminal'],
    format('receipt leaked keys: %s', v_keys);
  ASSERT v_receipt = jsonb_build_object(
    'completed_phase_id', 'aa000000-0000-4000-8000-000000000001'::uuid,
    'next_phase_id', 'aa000000-0000-4000-8000-000000000002'::uuid,
    'terminal', false
  ), format('unexpected canonical receipt: %s', v_receipt);
  ASSERT (SELECT status = 'completed' AND progress = 100 AND completed_at IS NOT NULL
          FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-000000000001'),
    'exact target must complete';
  ASSERT (SELECT status = 'in_progress' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-000000000002'),
    'exact follows successor must activate';
  ASSERT (SELECT status = 'pending' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-000000000003'),
    'later lower-sort descendant must remain pending';
  ASSERT (SELECT status = 'in_progress' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-000000000004'),
    'parallel active thread must remain active';
  ASSERT (SELECT status = 'pending' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-000000000005'),
    'NULL-key thread successor must not be widened by main successor update';
  ASSERT (SELECT current_phase = 'Canonical successor' FROM public.projects
          WHERE id = 'a9300000-0000-4000-8000-000000000001'),
    'NULL successor key must use its name for the main display pointer';
END;
$$;

-- Main resume fallback and its receipt are exact.
DO $$
DECLARE v_receipt jsonb;
BEGIN
  v_receipt := public.advance_project_phase(
    'a9300000-0000-4000-8000-000000000002',
    'aa000000-0000-4000-8000-000000000010',
    'delayed'
  );
  ASSERT v_receipt = jsonb_build_object(
    'completed_phase_id', NULL,
    'next_phase_id', 'aa000000-0000-4000-8000-000000000010'::uuid,
    'terminal', false
  ), format('unexpected resume receipt: %s', v_receipt);
  ASSERT (SELECT current_phase = 'Resume by name' FROM public.projects
          WHERE id = 'a9300000-0000-4000-8000-000000000002'),
    'main resume with NULL phase_key must use phase name';
END;
$$;

-- Lane-terminal is not project closeout. Main terminal clears current_phase;
-- thread terminal leaves the main pointer and main status untouched.
DO $$
DECLARE
  v_main_receipt jsonb;
  v_thread_receipt jsonb;
BEGIN
  v_main_receipt := public.advance_project_phase(
    'a9300000-0000-4000-8000-000000000003',
    'aa000000-0000-4000-8000-000000000020',
    'in_progress'
  );
  ASSERT v_main_receipt = jsonb_build_object(
    'completed_phase_id', 'aa000000-0000-4000-8000-000000000020'::uuid,
    'next_phase_id', NULL,
    'terminal', true
  ), format('unexpected main terminal receipt: %s', v_main_receipt);
  ASSERT (SELECT current_phase IS NULL AND status = 'active'
          FROM public.projects
          WHERE id = 'a9300000-0000-4000-8000-000000000003'),
    'main lane terminal must clear pointer without closing project';

  v_thread_receipt := public.advance_project_phase(
    'a9300000-0000-4000-8000-000000000004',
    'aa000000-0000-4000-8000-000000000031',
    'in_progress'
  );
  ASSERT v_thread_receipt = jsonb_build_object(
    'completed_phase_id', 'aa000000-0000-4000-8000-000000000031'::uuid,
    'next_phase_id', NULL,
    'terminal', true
  ), format('unexpected thread terminal receipt: %s', v_thread_receipt);
  ASSERT (SELECT current_phase = 'main-live' AND status = 'active'
          FROM public.projects
          WHERE id = 'a9300000-0000-4000-8000-000000000004'),
    'thread terminal must preserve the main project pointer';
  ASSERT (SELECT status = 'in_progress' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-000000000030'),
    'thread terminal must preserve the active main phase';
END;
$$;

-- Successor-write failure occurs after target UPDATE inside the RPC, but the
-- caught statement error must restore target, successor, and project pointer.
RESET ROLE;
CREATE OR REPLACE FUNCTION pg_temp.reject_injected_successor()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id = 'aa000000-0000-4000-8000-0000000000e1'::uuid
     AND NEW.status = 'in_progress' THEN
    RAISE EXCEPTION 'injected successor update failure'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER reject_injected_successor_trg
  BEFORE UPDATE ON public.project_phases
  FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_injected_successor();
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_phase_actor('a9000000-0000-4000-8000-000000000001');
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-00000000000f',
  'aa000000-0000-4000-8000-0000000000e0',
  'in_progress', '23514', 'injected successor update failure'
);
DO $$ BEGIN
  ASSERT (SELECT status = 'in_progress' AND completed_at IS NULL
          FROM public.project_phases WHERE id = 'aa000000-0000-4000-8000-0000000000e0'),
    'successor failure must roll target back';
  ASSERT (SELECT status = 'pending' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-0000000000e1'),
    'successor failure must preserve successor';
  ASSERT (SELECT current_phase = 'before-successor-failure' FROM public.projects
          WHERE id = 'a9300000-0000-4000-8000-00000000000f'),
    'successor failure must preserve project pointer';
END $$;
RESET ROLE;
DROP TRIGGER reject_injected_successor_trg ON public.project_phases;

-- Project-pointer failure occurs after both phase writes; all three still roll
-- back because no receipt is returned before every dependent write succeeds.
CREATE OR REPLACE FUNCTION pg_temp.reject_injected_project_pointer()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id = 'a9300000-0000-4000-8000-000000000010'::uuid THEN
    RAISE EXCEPTION 'injected project update failure'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER reject_injected_project_pointer_trg
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_injected_project_pointer();
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_phase_actor('a9000000-0000-4000-8000-000000000001');
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000010',
  'aa000000-0000-4000-8000-0000000000f0',
  'in_progress', '23514', 'injected project update failure'
);
DO $$ BEGIN
  ASSERT (SELECT status = 'in_progress' AND completed_at IS NULL
          FROM public.project_phases WHERE id = 'aa000000-0000-4000-8000-0000000000f0'),
    'project failure must roll target back';
  ASSERT (SELECT status = 'pending' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-0000000000f1'),
    'project failure must roll successor back';
  ASSERT (SELECT current_phase = 'before-project-failure' FROM public.projects
          WHERE id = 'a9300000-0000-4000-8000-000000000010'),
    'project failure must preserve old pointer';
END $$;
RESET ROLE;
DROP TRIGGER reject_injected_project_pointer_trg ON public.projects;

-- Sequential retry: first completion wins; stale second attempt gets 40001 and
-- cannot disturb the terminal state.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_phase_actor('a9000000-0000-4000-8000-000000000001');
SELECT public.advance_project_phase(
  'a9300000-0000-4000-8000-000000000011',
  'aa000000-0000-4000-8000-000000000100',
  'in_progress'
);
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000011',
  'aa000000-0000-4000-8000-000000000100',
  'in_progress', '40001',
  'advance_project_phase: phase status changed (expected in_progress, found completed)'
);
DO $$ BEGIN
  ASSERT (SELECT status = 'completed' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-000000000100'),
    'stale retry must preserve winner';
  ASSERT (SELECT current_phase IS NULL FROM public.projects
          WHERE id = 'a9300000-0000-4000-8000-000000000011'),
    'stale retry must preserve terminal pointer';
END $$;
RESET ROLE;

-- True two-session race. Remote setup is committed because dblink sessions
-- cannot see the rollback-scoped fixtures above. End that transaction first so
-- its trigger DDL locks cannot block the remote fixture; cleanup is explicit
-- and idempotent.
ROLLBACK;

DO $$
DECLARE
  v_conninfo text := format(
    'hostaddr=%s port=%s dbname=postgres user=postgres password=postgres',
    inet_server_addr(), inet_server_port()
  );
  v_receipt_a text;
  v_receipt_b text;
  v_error_a text;
  v_error_b text;
  v_successes integer;
  v_state record;
BEGIN
  PERFORM extensions.dblink_connect('phase_setup', v_conninfo);
  PERFORM extensions.dblink_exec(
    'phase_setup',
    'SET lock_timeout = ''5s''; SET statement_timeout = ''30s'''
  );
  PERFORM extensions.dblink_exec(
    'phase_setup',
    $setup$
      DELETE FROM public.projects WHERE id = 'ad300000-0000-4000-8000-000000000001';
      DELETE FROM public.profiles WHERE id = 'ad000000-0000-4000-8000-000000000001';
      DELETE FROM auth.users WHERE id = 'ad000000-0000-4000-8000-000000000001';
      INSERT INTO auth.users (
        id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
        instance_id, aud, role
      ) VALUES (
        'ad000000-0000-4000-8000-000000000001', 'phase-race@test.invalid', '',
        now(), now(), now(), '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated'
      );
      INSERT INTO public.projects (
        id, name, designer_id, created_by, status, current_phase
      ) VALUES (
        'ad300000-0000-4000-8000-000000000001', 'Concurrent phase project',
        'ad000000-0000-4000-8000-000000000001',
        'ad000000-0000-4000-8000-000000000001', 'active', 'race-a'
      );
      INSERT INTO public.project_phases (
        id, project_id, name, phase_key, status, progress, sort_order,
        follows_phase_id, lane
      ) VALUES
        ('ad400000-0000-4000-8000-000000000001',
         'ad300000-0000-4000-8000-000000000001', 'Race A', 'race-a',
         'in_progress', 50, 0, NULL, 'main'),
        ('ad400000-0000-4000-8000-000000000002',
         'ad300000-0000-4000-8000-000000000001', 'Race B', 'race-b',
         'pending', 0, 1, 'ad400000-0000-4000-8000-000000000001', 'main');
    $setup$
  );

  PERFORM extensions.dblink_connect('phase_locker', v_conninfo);
  PERFORM extensions.dblink_connect('phase_racer_a', v_conninfo);
  PERFORM extensions.dblink_connect('phase_racer_b', v_conninfo);

  PERFORM extensions.dblink_exec(
    'phase_locker',
    'SET lock_timeout = ''10s''; SET statement_timeout = ''30s'''
  );
  PERFORM extensions.dblink_exec(
    'phase_racer_a',
    'SET lock_timeout = ''10s''; SET statement_timeout = ''30s'''
  );
  PERFORM extensions.dblink_exec(
    'phase_racer_b',
    'SET lock_timeout = ''10s''; SET statement_timeout = ''30s'''
  );

  PERFORM extensions.dblink_exec('phase_locker', 'BEGIN');
  PERFORM locked.id
  FROM extensions.dblink(
    'phase_locker',
    $lock$SELECT id::text FROM public.projects
      WHERE id = 'ad300000-0000-4000-8000-000000000001' FOR UPDATE$lock$
  ) AS locked(id text);

  PERFORM extensions.dblink_exec('phase_racer_a', 'SET ROLE authenticated');
  PERFORM extensions.dblink_exec(
    'phase_racer_a',
    $claim$SET request.jwt.claims =
      '{"sub":"ad000000-0000-4000-8000-000000000001","role":"authenticated"}'$claim$
  );
  PERFORM extensions.dblink_exec('phase_racer_b', 'SET ROLE authenticated');
  PERFORM extensions.dblink_exec(
    'phase_racer_b',
    $claim$SET request.jwt.claims =
      '{"sub":"ad000000-0000-4000-8000-000000000001","role":"authenticated"}'$claim$
  );

  PERFORM extensions.dblink_send_query(
    'phase_racer_a',
    $race$SELECT public.advance_project_phase(
      'ad300000-0000-4000-8000-000000000001',
      'ad400000-0000-4000-8000-000000000001',
      'in_progress'
    )::text$race$
  );
  PERFORM extensions.dblink_send_query(
    'phase_racer_b',
    $race$SELECT public.advance_project_phase(
      'ad300000-0000-4000-8000-000000000001',
      'ad400000-0000-4000-8000-000000000001',
      'in_progress'
    )::text$race$
  );
  PERFORM pg_sleep(0.2);
  ASSERT extensions.dblink_is_busy('phase_racer_a') = 1
     AND extensions.dblink_is_busy('phase_racer_b') = 1,
    'both racers must wait behind the held project lock';

  PERFORM extensions.dblink_exec('phase_locker', 'COMMIT');

  SELECT result.receipt INTO v_receipt_a
  FROM extensions.dblink_get_result('phase_racer_a', false)
    AS result(receipt text);
  v_error_a := extensions.dblink_error_message('phase_racer_a');
  SELECT result.receipt INTO v_receipt_b
  FROM extensions.dblink_get_result('phase_racer_b', false)
    AS result(receipt text);
  v_error_b := extensions.dblink_error_message('phase_racer_b');

  v_successes := (v_error_a = 'OK')::integer + (v_error_b = 'OK')::integer;
  ASSERT v_successes = 1,
    format('exactly one concurrent call must succeed: a=%L b=%L', v_error_a, v_error_b);
  ASSERT (v_error_a = 'OK' AND position('phase status changed' IN v_error_b) > 0)
      OR (v_error_b = 'OK' AND position('phase status changed' IN v_error_a) > 0),
    format('loser must be the CAS rejection: a=%L b=%L', v_error_a, v_error_b);

  SELECT remote.* INTO STRICT v_state
  FROM extensions.dblink(
    'phase_setup',
    $state$SELECT target.status, successor.status, project.current_phase
      FROM public.projects AS project
      JOIN public.project_phases AS target
        ON target.id = 'ad400000-0000-4000-8000-000000000001'
      JOIN public.project_phases AS successor
        ON successor.id = 'ad400000-0000-4000-8000-000000000002'
      WHERE project.id = 'ad300000-0000-4000-8000-000000000001'$state$
  ) AS remote(target_status text, successor_status text, current_phase text);
  ASSERT v_state.target_status = 'completed'
     AND v_state.successor_status = 'in_progress'
     AND v_state.current_phase = 'race-b',
    format('concurrent winner must leave one coherent handoff: %s', v_state);

  PERFORM extensions.dblink_disconnect('phase_racer_b');
  PERFORM extensions.dblink_disconnect('phase_racer_a');
  PERFORM extensions.dblink_disconnect('phase_locker');
  PERFORM extensions.dblink_exec(
    'phase_setup',
    $cleanup$
      DELETE FROM public.projects WHERE id = 'ad300000-0000-4000-8000-000000000001';
      DELETE FROM public.profiles WHERE id = 'ad000000-0000-4000-8000-000000000001';
      DELETE FROM auth.users WHERE id = 'ad000000-0000-4000-8000-000000000001';
    $cleanup$
  );
  PERFORM extensions.dblink_disconnect('phase_setup');
END;
$$;
