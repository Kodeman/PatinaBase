-- Atomic project-phase delete/topology regression (00398)
-- Run with:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/document/delete_project_phase_atomicity_test.sql

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('b9000000-0000-4000-8000-000000000001', 'topology-owner@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b9000000-0000-4000-8000-000000000002', 'topology-peer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-8000-000000000000', 'authenticated', 'authenticated'),
  ('b9000000-0000-4000-8000-000000000003', 'topology-outsider@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-8000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('b9000000-0000-4000-8000-000000000001', 'topology-owner@test.invalid', 'Topology Owner', now(), now()),
  ('b9000000-0000-4000-8000-000000000002', 'topology-peer@test.invalid', 'Topology Peer', now(), now()),
  ('b9000000-0000-4000-8000-000000000003', 'topology-outsider@test.invalid', 'Topology Outsider', now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    updated_at = EXCLUDED.updated_at;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('b9100000-0000-4000-8000-000000000001', 'design_studio',
   'Topology Studio', 'topology-studio', 'active'),
  ('b9100000-0000-4000-8000-000000000002', 'contractor',
   'Topology Contractor', 'topology-contractor', 'active');

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES
  ('b9110000-0000-4000-8000-000000000001',
   'b9000000-0000-4000-8000-000000000001',
   'b9100000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('b9110000-0000-4000-8000-000000000002',
   'b9000000-0000-4000-8000-000000000002',
   'b9100000-0000-4000-8000-000000000001', 'member', 'active', now()),
  ('b9110000-0000-4000-8000-000000000003',
   'b9000000-0000-4000-8000-000000000001',
   'b9100000-0000-4000-8000-000000000002', 'member', 'active', now()),
  ('b9110000-0000-4000-8000-000000000004',
   'b9000000-0000-4000-8000-000000000003',
   'b9100000-0000-4000-8000-000000000002', 'member', 'active', now());

INSERT INTO public.projects (
  id, name, designer_id, created_by, status, current_phase
)
VALUES
  ('b9300000-0000-4000-8000-000000000001', 'Safe legacy roots',
   'b9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'active', 'legacy-live'),
  ('b9300000-0000-4000-8000-000000000002', 'Ambiguous legacy roots',
   'b9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'active', NULL),
  ('b9300000-0000-4000-8000-000000000003', 'Atomic delete',
   'b9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'active', NULL),
  ('b9300000-0000-4000-8000-000000000004', 'Checked create update',
   'b9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'active', NULL),
  ('b9300000-0000-4000-8000-000000000005', 'Nonpending history',
   'b9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'active', 'active'),
  ('b9300000-0000-4000-8000-000000000006', 'Cycle rollback',
   'b9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'active', NULL),
  ('b9300000-0000-4000-8000-000000000007', 'Ambiguous create rollback',
   'b9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'active', NULL),
  ('b9300000-0000-4000-8000-000000000008', 'Ambiguous delete rollback',
   'b9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'active', NULL),
  ('b9300000-0000-4000-8000-000000000009', 'Cross project A',
   'b9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'active', NULL),
  ('b9300000-0000-4000-8000-00000000000a', 'Cross project B',
   'b9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'active', NULL),
  ('b9300000-0000-4000-8000-00000000000b', 'Template target',
   'b9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'active', NULL),
  ('b9300000-0000-4000-8000-00000000000c', 'As built target',
   'b9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'active', NULL);

-- These rows predate the migration boundary. Owner maintenance is deliberately
-- available so the test can replay 00398 over both repairable and ambiguous
-- legacy candidates without weakening authenticated runtime writes.
INSERT INTO public.project_phases (
  id, project_id, name, phase_key, status, progress, sort_order,
  follows_phase_id, lane
)
VALUES
  ('b9400000-0000-4000-8000-000000000001', 'b9300000-0000-4000-8000-000000000001',
   'Legacy done', 'legacy-done', 'completed', 100, 0, NULL, 'main'),
  ('b9400000-0000-4000-8000-000000000002', 'b9300000-0000-4000-8000-000000000001',
   'Legacy live', 'legacy-live', 'in_progress', 50, 1, NULL, 'main'),
  ('b9400000-0000-4000-8000-000000000003', 'b9300000-0000-4000-8000-000000000001',
   'Legacy pending', 'legacy-pending', 'pending', 0, 2, NULL, 'main'),

  -- Duplicate order and pending→completed lifecycle inversion: never infer.
  ('b9400000-0000-4000-8000-000000000011', 'b9300000-0000-4000-8000-000000000002',
   'Ambiguous pending', 'ambiguous-pending', 'pending', 0, 0, NULL, 'main'),
  ('b9400000-0000-4000-8000-000000000012', 'b9300000-0000-4000-8000-000000000002',
   'Ambiguous done', 'ambiguous-done', 'completed', 100, 0, NULL, 'main'),

  ('b9400000-0000-4000-8000-000000000021', 'b9300000-0000-4000-8000-000000000003',
   'Delete predecessor', 'delete-predecessor', 'completed', 100, 0, NULL, 'main'),
  ('b9400000-0000-4000-8000-000000000022', 'b9300000-0000-4000-8000-000000000003',
   'Delete target thread', 'delete-target', 'pending', 0, 1,
   'b9400000-0000-4000-8000-000000000021', 'thread'),
  ('b9400000-0000-4000-8000-000000000023', 'b9300000-0000-4000-8000-000000000003',
   'Delete main follower', 'delete-main-follower', 'pending', 0, 2,
   'b9400000-0000-4000-8000-000000000022', 'main'),
  ('b9400000-0000-4000-8000-000000000024', 'b9300000-0000-4000-8000-000000000003',
   'Delete thread follower', 'delete-thread-follower', 'pending', 0, 3,
   'b9400000-0000-4000-8000-000000000022', 'thread'),

  ('b9400000-0000-4000-8000-000000000031', 'b9300000-0000-4000-8000-000000000005',
   'Active immutable history', 'active', 'in_progress', 25, 0, NULL, 'main'),

  ('b9400000-0000-4000-8000-000000000041', 'b9300000-0000-4000-8000-000000000006',
   'Cycle A', 'cycle-a', 'pending', 0, 0, NULL, 'thread'),
  ('b9400000-0000-4000-8000-000000000042', 'b9300000-0000-4000-8000-000000000006',
   'Cycle B', 'cycle-b', 'pending', 0, 1,
   'b9400000-0000-4000-8000-000000000041', 'thread'),

  ('b9400000-0000-4000-8000-000000000051', 'b9300000-0000-4000-8000-000000000007',
   'Ambiguous root', 'ambiguous-root', 'completed', 100, 0, NULL, 'main'),
  ('b9400000-0000-4000-8000-000000000052', 'b9300000-0000-4000-8000-000000000007',
   'Existing main child', 'existing-main', 'pending', 0, 1,
   'b9400000-0000-4000-8000-000000000051', 'main'),

  ('b9400000-0000-4000-8000-000000000061', 'b9300000-0000-4000-8000-000000000008',
   'Delete ambiguity root', 'delete-ambiguity-root', 'completed', 100, 0, NULL, 'main'),
  ('b9400000-0000-4000-8000-000000000062', 'b9300000-0000-4000-8000-000000000008',
   'Existing main branch', 'existing-main-branch', 'pending', 0, 1,
   'b9400000-0000-4000-8000-000000000061', 'main'),
  ('b9400000-0000-4000-8000-000000000063', 'b9300000-0000-4000-8000-000000000008',
   'Pending thread to delete', 'pending-thread-delete', 'pending', 0, 2,
   'b9400000-0000-4000-8000-000000000061', 'thread'),
  ('b9400000-0000-4000-8000-000000000064', 'b9300000-0000-4000-8000-000000000008',
   'Main behind thread', 'main-behind-thread', 'pending', 0, 3,
   'b9400000-0000-4000-8000-000000000063', 'main'),

  ('b9400000-0000-4000-8000-000000000071', 'b9300000-0000-4000-8000-000000000009',
   'Cross target', 'cross-target', 'pending', 0, 0, NULL, 'main'),
  ('b9400000-0000-4000-8000-000000000072', 'b9300000-0000-4000-8000-00000000000a',
   'Foreign follower', 'foreign-follower', 'pending', 0, 0, NULL, 'main');

-- Preserve one corrupt legacy foreign edge. The runtime guard is immediately
-- restored; delete must detect the inbound foreign follower and fail closed.
ALTER TABLE public.project_phases
  DISABLE TRIGGER a_guard_project_phase_chain_write_trg;
UPDATE public.project_phases
SET follows_phase_id = 'b9400000-0000-4000-8000-000000000071'
WHERE id = 'b9400000-0000-4000-8000-000000000072';
ALTER TABLE public.project_phases
  ENABLE TRIGGER a_guard_project_phase_chain_write_trg;

-- Replaying this idempotent migration inside the test makes legacy repair and
-- diagnostic behavior observable instead of merely inspecting SQL text.
\ir ../../migrations/00398_delete_project_phase_atomic_rpc.sql

DO $$
BEGIN
  ASSERT (SELECT follows_phase_id IS NULL
          FROM public.project_phases
          WHERE id = 'b9400000-0000-4000-8000-000000000001'),
    'safe legacy chain root must stay root';
  ASSERT (SELECT follows_phase_id = 'b9400000-0000-4000-8000-000000000001'
          FROM public.project_phases
          WHERE id = 'b9400000-0000-4000-8000-000000000002'),
    'safe legacy live row must follow stable completed predecessor';
  ASSERT (SELECT follows_phase_id = 'b9400000-0000-4000-8000-000000000002'
          FROM public.project_phases
          WHERE id = 'b9400000-0000-4000-8000-000000000003'),
    'safe legacy pending row must follow stable live predecessor';
  ASSERT (SELECT bool_and(follows_phase_id IS NULL)
          FROM public.project_phases
          WHERE project_id = 'b9300000-0000-4000-8000-000000000002'),
    'ambiguous legacy roots must remain untouched';
  ASSERT EXISTS (
    SELECT 1
    FROM public.project_phase_topology_diagnostics
    WHERE project_id = 'b9300000-0000-4000-8000-000000000002'
      AND diagnostic_code = 'ambiguous_legacy_main_chain'
      AND details->>'sort_order_is_unique' = 'false'
      AND details->>'lifecycle_is_monotone' = 'false'
  ), 'ambiguous legacy candidate must record exact diagnostic reasons';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assume_topology_actor(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_actor, 'role', 'authenticated')::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_topology_failure(
  p_sql text,
  p_expected_state text,
  p_message_fragment text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_state text;
  v_message text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_state = RETURNED_SQLSTATE,
      v_message = MESSAGE_TEXT;
  END;

  ASSERT v_state = p_expected_state,
    format('expected SQLSTATE %s, got %L (%L)',
           p_expected_state, v_state, v_message);
  ASSERT position(p_message_fragment IN COALESCE(v_message, '')) > 0,
    format('expected error containing %L, got %L',
           p_message_fragment, v_message);
END;
$$;

-- ACLs are explicit in both directions; private helpers and diagnostic writes
-- are never callable by an authenticated browser.
DO $$
BEGIN
  ASSERT has_function_privilege(
    'authenticated',
    'public.create_project_phase(uuid,text,text,integer,integer,date,uuid,text,integer,integer,integer,jsonb)',
    'EXECUTE'
  ), 'authenticated must execute checked create';
  ASSERT has_function_privilege(
    'authenticated',
    'public.update_project_phase(uuid,uuid,timestamptz,jsonb)',
    'EXECUTE'
  ), 'authenticated must execute checked update';
  ASSERT has_function_privilege(
    'authenticated',
    'public.delete_project_phase(uuid,uuid)',
    'EXECUTE'
  ), 'authenticated must execute atomic delete';
  ASSERT NOT has_function_privilege(
    'anon', 'public.delete_project_phase(uuid,uuid)', 'EXECUTE'
  ), 'anon must not execute delete';
  ASSERT NOT has_function_privilege(
    'service_role', 'public.delete_project_phase(uuid,uuid)', 'EXECUTE'
  ), 'service_role must not execute browser phase delete';
  ASSERT NOT has_function_privilege(
    'authenticated',
    'public._assert_project_phase_topology(uuid,text)',
    'EXECUTE'
  ), 'topology assertion must stay private';
  ASSERT has_table_privilege(
    'authenticated', 'public.project_phase_topology_diagnostics', 'SELECT'
  ), 'authenticated authors need diagnostic SELECT';
  ASSERT NOT has_table_privilege(
    'authenticated', 'public.project_phase_topology_diagnostics', 'INSERT'
  ), 'authenticated callers must not forge diagnostics';
  ASSERT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.project_phases'::regclass
      AND tgname = 'c_guard_project_phase_topology_write_trg'
      AND tgenabled = 'O'
  ), 'direct topology guard trigger must be enabled';
  ASSERT position(
    'FOR UPDATE' IN pg_get_functiondef(
      'public.delete_project_phase(uuid,uuid)'::regprocedure
    )
  ) > 0, 'delete boundary must carry row locks';
  ASSERT position(
    'follower.follows_phase_id = p_phase_id' IN pg_get_functiondef(
      'public.delete_project_phase(uuid,uuid)'::regprocedure
    )
  ) > 0, 'delete boundary must derive exact followers on the server';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_topology_actor('b9000000-0000-4000-8000-000000000001');

-- Atomic delete relinks every direct follower to the server-read predecessor,
-- preserves each cross-lane label, and returns exactly three deterministic keys.
DO $$
DECLARE
  v_receipt jsonb;
  v_keys text[];
BEGIN
  v_receipt := public.delete_project_phase(
    'b9300000-0000-4000-8000-000000000003',
    'b9400000-0000-4000-8000-000000000022'
  );

  SELECT array_agg(key ORDER BY key)
  INTO v_keys
  FROM jsonb_object_keys(v_receipt) AS key;

  ASSERT v_keys = ARRAY[
    'deleted_phase_id', 'predecessor_phase_id', 'relinked_phase_ids'
  ], format('delete receipt keys drifted: %s', v_receipt);
  ASSERT v_receipt = jsonb_build_object(
    'deleted_phase_id', 'b9400000-0000-4000-8000-000000000022'::uuid,
    'predecessor_phase_id', 'b9400000-0000-4000-8000-000000000021'::uuid,
    'relinked_phase_ids', ARRAY[
      'b9400000-0000-4000-8000-000000000023'::uuid,
      'b9400000-0000-4000-8000-000000000024'::uuid
    ]
  ), format('delete receipt values drifted: %s', v_receipt);
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.project_phases
    WHERE id = 'b9400000-0000-4000-8000-000000000022'
  ), 'delete target must be absent';
  ASSERT (SELECT follows_phase_id = 'b9400000-0000-4000-8000-000000000021'
                 AND lane = 'main'
          FROM public.project_phases
          WHERE id = 'b9400000-0000-4000-8000-000000000023'),
    'main follower must be relinked without lane rewrite';
  ASSERT (SELECT follows_phase_id = 'b9400000-0000-4000-8000-000000000021'
                 AND lane = 'thread'
          FROM public.project_phases
          WHERE id = 'b9400000-0000-4000-8000-000000000024'),
    'thread follower must be relinked without lane rewrite';
END;
$$;

-- Browser-direct topology writes and even a forged GUC remain closed.
SELECT pg_temp.expect_topology_failure(
  $$INSERT INTO public.project_phases (
      project_id, phase_key, name, status, progress, lane
    ) VALUES (
      'b9300000-0000-4000-8000-000000000004', 'direct', 'Direct',
      'pending', 0, 'main'
    )$$,
  '42501',
  'topology inserts are writable only through create_project_phase'
);
SELECT pg_temp.expect_topology_failure(
  $$UPDATE public.project_phases
    SET phase_key = 'rewritten'
    WHERE id = 'b9400000-0000-4000-8000-000000000031'$$,
  '42501',
  'writable only through checked phase RPCs'
);
SELECT pg_temp.expect_topology_failure(
  $$DELETE FROM public.project_phases
    WHERE id = 'b9400000-0000-4000-8000-000000000031'$$,
  '42501',
  'non-pending lifecycle rows cannot be deleted directly'
);

-- Exact owner and exact active design-studio peer can create. A contractor-
-- only co-member cannot. New lifecycle state is server-derived pending/zero.
SELECT pg_temp.assume_topology_actor('b9000000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v_created public.project_phases%ROWTYPE;
BEGIN
  v_created := public.create_project_phase(
    p_project_id => 'b9300000-0000-4000-8000-000000000004',
    p_phase_key => 'peer-root',
    p_name => 'Peer root',
    p_sort_order => 0,
    p_duration_days => 5,
    p_lane => 'main'
  );
  ASSERT v_created.project_id = 'b9300000-0000-4000-8000-000000000004'
     AND v_created.status = 'pending'
     AND v_created.progress = 0
     AND v_created.completed_at IS NULL,
    format('create lifecycle/result mismatch: %s', v_created);
END;
$$;

SELECT pg_temp.assume_topology_actor('b9000000-0000-4000-8000-000000000003');
SELECT pg_temp.expect_topology_failure(
  $$SELECT public.create_project_phase(
      'b9300000-0000-4000-8000-000000000004',
      'outsider', 'Outsider phase'
    )$$,
  '42501',
  'project not found or access denied'
);

SELECT pg_temp.assume_topology_actor('b9000000-0000-4000-8000-000000000001');

-- Caller-observed updated_at is a real CAS. The first patch advances it; the
-- stale second tab gets serialization_failure and cannot overwrite the row.
DO $$
DECLARE
  v_phase_id uuid;
  v_before timestamptz;
  v_after public.project_phases%ROWTYPE;
  v_state text;
  v_message text;
BEGIN
  SELECT id, updated_at
  INTO v_phase_id, v_before
  FROM public.project_phases
  WHERE project_id = 'b9300000-0000-4000-8000-000000000004'
    AND phase_key = 'peer-root';

  v_after := public.update_project_phase(
    'b9300000-0000-4000-8000-000000000004',
    v_phase_id,
    v_before,
    '{"anchor_date":"2027-01-15"}'::jsonb
  );
  ASSERT v_after.anchor_date = DATE '2027-01-15'
     AND v_after.updated_at > v_before,
    format('first CAS update mismatch: %s', v_after);

  BEGIN
    PERFORM public.update_project_phase(
      'b9300000-0000-4000-8000-000000000004',
      v_phase_id,
      v_before,
      '{"anchor_date":"2027-02-01"}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_state = RETURNED_SQLSTATE,
      v_message = MESSAGE_TEXT;
  END;

  ASSERT v_state = '40001'
     AND position('phase changed since it was read' IN v_message) > 0,
    format('stale CAS must fail serialization: %L %L', v_state, v_message);
  ASSERT (SELECT anchor_date = DATE '2027-01-15'
          FROM public.project_phases WHERE id = v_phase_id),
    'stale CAS must preserve the winning value';
END;
$$;

-- Active/delayed/completed history cannot have phase_key/lane/follows
-- rewritten even through the checked RPC. Non-topology anchor edits remain
-- legitimate and advance the CAS token.
DO $$
DECLARE
  v_before timestamptz;
  v_after public.project_phases%ROWTYPE;
  v_state text;
  v_message text;
BEGIN
  SELECT updated_at INTO v_before
  FROM public.project_phases
  WHERE id = 'b9400000-0000-4000-8000-000000000031';

  BEGIN
    PERFORM public.update_project_phase(
      'b9300000-0000-4000-8000-000000000005',
      'b9400000-0000-4000-8000-000000000031',
      v_before,
      '{"lane":"thread"}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_state = RETURNED_SQLSTATE,
      v_message = MESSAGE_TEXT;
  END;
  ASSERT v_state = '23514'
     AND position('immutable after pending' IN v_message) > 0,
    format('nonpending topology rewrite must fail: %L %L', v_state, v_message);

  v_after := public.update_project_phase(
    'b9300000-0000-4000-8000-000000000005',
    'b9400000-0000-4000-8000-000000000031',
    v_before,
    '{"anchor_date":"2027-03-01"}'::jsonb
  );
  ASSERT v_after.anchor_date = DATE '2027-03-01'
     AND v_after.lane = 'main',
    'non-topology live edit must not rewrite history';
END;
$$;

SELECT pg_temp.expect_topology_failure(
  $$SELECT public.delete_project_phase(
      'b9300000-0000-4000-8000-000000000005',
      'b9400000-0000-4000-8000-000000000031'
    )$$,
  '23514',
  'only pending phases may be deleted'
);

-- Cycle, cross-project, and ambiguous-main outcomes all roll back exactly.
DO $$
DECLARE
  v_before timestamptz;
  v_state text;
  v_message text;
BEGIN
  SELECT updated_at INTO v_before
  FROM public.project_phases
  WHERE id = 'b9400000-0000-4000-8000-000000000041';
  BEGIN
    PERFORM public.update_project_phase(
      'b9300000-0000-4000-8000-000000000006',
      'b9400000-0000-4000-8000-000000000041',
      v_before,
      '{"follows_phase_id":"b9400000-0000-4000-8000-000000000042"}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_state = RETURNED_SQLSTATE,
      v_message = MESSAGE_TEXT;
  END;
  ASSERT v_state = '23514' AND position('cyclic' IN v_message) > 0,
    format('cycle must fail closed: %L %L', v_state, v_message);
  ASSERT (SELECT follows_phase_id IS NULL
          FROM public.project_phases
          WHERE id = 'b9400000-0000-4000-8000-000000000041'),
    'cycle rejection must roll back the exact edge';
END;
$$;

SELECT pg_temp.expect_topology_failure(
  $$SELECT public.create_project_phase(
      p_project_id => 'b9300000-0000-4000-8000-000000000007',
      p_phase_key => 'second-main',
      p_name => 'Second main',
      p_sort_order => 2,
      p_follows_phase_id => 'b9400000-0000-4000-8000-000000000051',
      p_lane => 'main'
    )$$,
  '23514',
  'canonical main successor is ambiguous'
);
DO $$ BEGIN
  ASSERT (SELECT count(*) = 2
          FROM public.project_phases
          WHERE project_id = 'b9300000-0000-4000-8000-000000000007'),
    'ambiguous create must roll back its inserted row';
END $$;

SELECT pg_temp.expect_topology_failure(
  $$SELECT public.delete_project_phase(
      'b9300000-0000-4000-8000-000000000008',
      'b9400000-0000-4000-8000-000000000063'
    )$$,
  '23514',
  'canonical main successor is ambiguous'
);
DO $$ BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM public.project_phases
    WHERE id = 'b9400000-0000-4000-8000-000000000063'
  ), 'ambiguous delete must restore its target';
  ASSERT (SELECT follows_phase_id = 'b9400000-0000-4000-8000-000000000063'
          FROM public.project_phases
          WHERE id = 'b9400000-0000-4000-8000-000000000064'),
    'ambiguous delete must roll its follower relink back';
END $$;

SELECT pg_temp.expect_topology_failure(
  $$SELECT public.delete_project_phase(
      'b9300000-0000-4000-8000-000000000009',
      'b9400000-0000-4000-8000-000000000071'
    )$$,
  '23514',
  'cross-project phase topology is unsupported'
);
DO $$ BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM public.project_phases
    WHERE id = 'b9400000-0000-4000-8000-000000000071'
  ), 'cross-project corruption must leave delete target untouched';
END $$;

-- R100 template and project-copy birth paths still work through checked create.
RESET ROLE;
INSERT INTO public.phase_templates (
  id, slug, label, description, is_system, designer_id, phases
) VALUES (
  'b9600000-0000-4000-8000-000000000001',
  'topology_atomic_test',
  'Topology atomic test',
  'Transactional fixture',
  true,
  NULL,
  '[{"name":"Brief","phase_key":"brief","duration_days":5,"lane":"main"},
    {"name":"Source","phase_key":"source","duration_days":7,"lane":"thread"}]'::jsonb
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_topology_actor('b9000000-0000-4000-8000-000000000001');

DO $$
DECLARE
  v_seeded uuid[];
  v_copied uuid[];
BEGIN
  SELECT array_agg(phase_id)
  INTO v_seeded
  FROM public.seed_project_schedule_from_template(
    'b9300000-0000-4000-8000-00000000000b',
    'topology_atomic_test'
  ) AS phase_id;
  ASSERT cardinality(v_seeded) = 2,
    format('template seed returned wrong ids: %s', v_seeded);
  ASSERT (SELECT follows_phase_id = v_seeded[1] AND lane = 'thread'
          FROM public.project_phases WHERE id = v_seeded[2]),
    'template seed must cross checked create with a linear cross-lane chain';

  SELECT array_agg(phase_id)
  INTO v_copied
  FROM public.copy_schedule_as_built(
    'b9300000-0000-4000-8000-00000000000b',
    NULL,
    'b9300000-0000-4000-8000-00000000000c'
  ) AS phase_id;
  ASSERT cardinality(v_copied) = 2,
    format('project as-built copy returned wrong ids: %s', v_copied);
  ASSERT (SELECT follows_phase_id = v_copied[1]
          FROM public.project_phases WHERE id = v_copied[2]),
    'project copy must cross checked create and preserve linear birth order';
END;
$$;

-- Diagnostics are visible only to the exact owner/design-studio peer.
SELECT pg_temp.assume_topology_actor('b9000000-0000-4000-8000-000000000002');
DO $$ BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM public.project_phase_topology_diagnostics
    WHERE project_id = 'b9300000-0000-4000-8000-000000000002'
  ), 'exact design-studio peer must see author diagnostics';
END $$;

SELECT pg_temp.assume_topology_actor('b9000000-0000-4000-8000-000000000003');
DO $$ BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.project_phase_topology_diagnostics
    WHERE project_id = 'b9300000-0000-4000-8000-000000000002'
  ), 'contractor-only co-member must not see author diagnostics';
END $$;

RESET ROLE;
ROLLBACK;
