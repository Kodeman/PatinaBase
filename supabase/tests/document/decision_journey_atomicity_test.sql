-- Atomic decision / coordination authority regression (00399)
-- Run:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/document/decision_journey_atomicity_test.sql

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
SELECT id, email, '', now(), now(), now(),
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
FROM (VALUES
  ('fa000000-0000-4000-8000-000000000001'::uuid, 'atomic-owner@test.invalid'),
  ('fa000000-0000-4000-8000-000000000002'::uuid, 'atomic-client@test.invalid'),
  ('fa000000-0000-4000-8000-000000000003'::uuid, 'atomic-peer@test.invalid'),
  ('fa000000-0000-4000-8000-000000000004'::uuid, 'atomic-other-client@test.invalid')
) AS fixture(id, email);

INSERT INTO public.profiles (
  id, email, full_name, is_designer, created_at, updated_at
)
VALUES
  ('fa000000-0000-4000-8000-000000000001', 'atomic-owner@test.invalid', 'Atomic Owner', true, now(), now()),
  ('fa000000-0000-4000-8000-000000000002', 'atomic-client@test.invalid', 'Atomic Client', false, now(), now()),
  ('fa000000-0000-4000-8000-000000000003', 'atomic-peer@test.invalid', 'Atomic Peer', true, now(), now()),
  ('fa000000-0000-4000-8000-000000000004', 'atomic-other-client@test.invalid', 'Atomic Other Client', false, now(), now())
ON CONFLICT (id) DO UPDATE SET is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES (
  'fa010000-0000-4000-8000-000000000001', 'design_studio',
  'Atomic Studio', 'journey-atomic-studio', 'active'
);
INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES
  ('fa020000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001', 'fa010000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('fa020000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000003', 'fa010000-0000-4000-8000-000000000001', 'member', 'active', now());

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, client_email, status, source
)
VALUES
  ('fa030000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000002', 'Atomic Client', 'atomic-client@test.invalid', 'active', 'direct'),
  ('fa030000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000004', 'Other Client', 'atomic-other-client@test.invalid', 'active', 'direct');

INSERT INTO public.projects (
  id, name, designer_id, created_by, client_id, studio_id, status
)
VALUES
  ('fa040000-0000-4000-8000-000000000001', 'Atomic Project A', 'fa000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000002', 'fa010000-0000-4000-8000-000000000001', 'active'),
  ('fa040000-0000-4000-8000-000000000002', 'Atomic Project B', 'fa000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000002', 'fa010000-0000-4000-8000-000000000001', 'active'),
  ('fa040000-0000-4000-8000-000000000003', 'Atomic Terminal', 'fa000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000002', 'fa010000-0000-4000-8000-000000000001', 'completed'),
  ('fa040000-0000-4000-8000-000000000004', 'Other Client Project', 'fa000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000004', 'fa010000-0000-4000-8000-000000000001', 'active');

INSERT INTO public.project_phases (id, project_id, name, phase_key, status, sort_order)
VALUES
  ('fa050000-0000-4000-8000-000000000001', 'fa040000-0000-4000-8000-000000000001', 'A phase', 'design', 'pending', 0),
  ('fa050000-0000-4000-8000-000000000002', 'fa040000-0000-4000-8000-000000000002', 'B phase', 'design', 'pending', 0);
INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES
  ('fa060000-0000-4000-8000-000000000001', 'fa040000-0000-4000-8000-000000000001', 'A room', 0),
  ('fa060000-0000-4000-8000-000000000002', 'fa040000-0000-4000-8000-000000000002', 'B room', 0);
INSERT INTO public.schedule_milestones (id, phase_id, name, kind, status, sort_order)
VALUES
  ('fa070000-0000-4000-8000-000000000001', 'fa050000-0000-4000-8000-000000000001', 'A milestone', 'decision', 'upcoming', 0),
  ('fa070000-0000-4000-8000-000000000002', 'fa050000-0000-4000-8000-000000000002', 'B milestone', 'decision', 'upcoming', 0);
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, created_by)
VALUES
  ('fa080000-0000-4000-8000-000000000001', 'fa040000-0000-4000-8000-000000000001', 'vendor', 'A Vendor', 'fa000000-0000-4000-8000-000000000001'),
  ('fa080000-0000-4000-8000-000000000002', 'fa040000-0000-4000-8000-000000000002', 'vendor', 'B Vendor', 'fa000000-0000-4000-8000-000000000001');

INSERT INTO public.project_ffe_items (id, project_id, name, status, sort_order)
VALUES
  ('fa090000-0000-4000-8000-000000000001', 'fa040000-0000-4000-8000-000000000001', 'A line 1', 'specified', 0),
  ('fa090000-0000-4000-8000-000000000002', 'fa040000-0000-4000-8000-000000000001', 'A line 2', 'specified', 1),
  ('fa090000-0000-4000-8000-000000000003', 'fa040000-0000-4000-8000-000000000001', 'A line 3', 'specified', 2),
  ('fa090000-0000-4000-8000-000000000004', 'fa040000-0000-4000-8000-000000000002', 'B line', 'specified', 0);
INSERT INTO public.project_tasks (id, project_id, title, status, sort_order)
VALUES
  ('fa0a0000-0000-4000-8000-000000000001', 'fa040000-0000-4000-8000-000000000001', 'A task 1', 'todo', 0),
  ('fa0a0000-0000-4000-8000-000000000002', 'fa040000-0000-4000-8000-000000000001', 'A task 2', 'todo', 1),
  ('fa0a0000-0000-4000-8000-000000000003', 'fa040000-0000-4000-8000-000000000001', 'A task 3', 'todo', 2),
  ('fa0a0000-0000-4000-8000-000000000004', 'fa040000-0000-4000-8000-000000000002', 'B task', 'todo', 0);

INSERT INTO public.proposals (
  id, project_id, designer_id, designer_client_id, client_id,
  title, total_amount, status
)
VALUES
  ('fa0b0000-0000-4000-8000-000000000001', 'fa040000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001', 'fa030000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000002', 'A Proposal', 10000, 'draft'),
  ('fa0b0000-0000-4000-8000-000000000002', 'fa040000-0000-4000-8000-000000000004', 'fa000000-0000-4000-8000-000000000001', 'fa030000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000004', 'Other Proposal', 10000, 'draft');

-- Resolution fixtures are trusted inserts. The linked row deliberately carries
-- a non-approval decision_type to prove reopen cannot be bypassed by taxonomy.
INSERT INTO public.client_decisions (
  id, designer_client_id, designer_id, project_id, linked_proposal_id,
  title, decision_type, coordination_kind, court, status, sent_at
)
VALUES
  ('fa0c0000-0000-4000-8000-000000000001', 'fa030000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001', 'fa040000-0000-4000-8000-000000000001', NULL, 'RFI fixture', 'product', 'rfi', 'designer', 'pending', now()),
  ('fa0c0000-0000-4000-8000-000000000002', 'fa030000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001', 'fa040000-0000-4000-8000-000000000001', NULL, 'Submittal fixture', 'product', 'submittal', 'designer', 'pending', now()),
  ('fa0c0000-0000-4000-8000-000000000003', 'fa030000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001', 'fa040000-0000-4000-8000-000000000001', NULL, 'Client signoff fixture', 'approval', 'signoff', 'client', 'pending', now()),
  ('fa0c0000-0000-4000-8000-000000000004', 'fa030000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001', 'fa040000-0000-4000-8000-000000000001', NULL, 'Peer punch fixture', 'product', 'punch', 'designer', 'pending', now()),
  ('fa0c0000-0000-4000-8000-000000000005', 'fa030000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001', 'fa040000-0000-4000-8000-000000000001', NULL, 'Viewed draft fixture', 'product', 'selection', 'client', 'draft', NULL),
  ('fa0c0000-0000-4000-8000-000000000006', 'fa030000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001', 'fa040000-0000-4000-8000-000000000001', 'fa0b0000-0000-4000-8000-000000000001', 'Tampered proposal approval', 'product', 'selection', 'client', 'responded', now()),
  ('fa0c0000-0000-4000-8000-000000000007', 'fa030000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001', 'fa040000-0000-4000-8000-000000000001', NULL, 'Expired extension fixture', 'product', 'selection', 'client', 'expired', now()),
  ('fa0c0000-0000-4000-8000-000000000008', 'fa030000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001', 'fa040000-0000-4000-8000-000000000001', NULL, 'Stale extension fixture', 'product', 'selection', 'client', 'expired', now());

UPDATE public.client_decisions
SET due_date = now() - interval '1 day',
    responded_at = now() - interval '2 days',
    viewed_at = now() - interval '3 days',
    reminder_sent_at = now() - interval '3 hours',
    selected_by = 'fa000000-0000-4000-8000-000000000002',
    answer = 'stale answer',
    answered_at = now() - interval '2 days',
    answered_by = 'fa000000-0000-4000-8000-000000000002'
WHERE id IN (
  'fa0c0000-0000-4000-8000-000000000007',
  'fa0c0000-0000-4000-8000-000000000008'
);

INSERT INTO public.client_decision_options (
  id, decision_id, name, selected, client_note, sort_order
) VALUES (
  'fa0e0000-0000-4000-8000-000000000001',
  'fa0c0000-0000-4000-8000-000000000007',
  'Stale selection', true, 'stale note', 0
);

CREATE OR REPLACE FUNCTION pg_temp.assume_atomic_actor(
  p_actor uuid,
  p_role text DEFAULT 'authenticated'
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_actor, 'role', p_role)::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.decision_notice_count(
  p_decision_id uuid,
  p_kind text DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*)
  FROM public.decision_notifications
  WHERE decision_id = p_decision_id
    AND (p_kind IS NULL OR kind::text = p_kind)
$$;

CREATE OR REPLACE FUNCTION pg_temp.reminder_log_count(p_decision_id uuid)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*)
  FROM public.notification_log
  WHERE type = 'decision_reminder'
    AND metadata->>'decision_id' = p_decision_id::text
    AND user_id = 'fa000000-0000-4000-8000-000000000002'
    AND channel = 'in_app'
    AND status = 'delivered'
$$;

CREATE OR REPLACE FUNCTION pg_temp.decision_viewed_at(p_decision_id uuid)
RETURNS timestamptz
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT viewed_at
  FROM public.client_decisions
  WHERE id = p_decision_id
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_atomic_actor('fa000000-0000-4000-8000-000000000001');

DO $$
DECLARE
  v_error text;
BEGIN
  ASSERT has_function_privilege(
    'authenticated',
    'public.assert_client_decision_reference_integrity(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ), 'authenticated trigger callers need invoker-helper execution';
  ASSERT NOT has_table_privilege('authenticated', 'public.client_decisions', 'INSERT'),
    'authenticated direct decision INSERT must remain revoked';
  ASSERT NOT has_table_privilege('authenticated', 'public.client_decision_options', 'INSERT'),
    'authenticated direct option INSERT must remain revoked';
  ASSERT has_function_privilege(
    'authenticated',
    'public.create_client_decision(uuid,jsonb,jsonb,uuid[],uuid[])', 'EXECUTE'
  ), 'canonical create RPC must be callable';
  ASSERT NOT has_function_privilege(
    'authenticated', 'public.notify_decision_required(uuid)', 'EXECUTE'
  ), 'authenticated callers cannot spoof lifecycle notices';

  BEGIN
    PERFORM public.notify_decision_required(
      'fa0c0000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'notice spoof RPC must reject authenticated callers';
END;
$$;

-- Expired Extend is one CAS act. It clears the prior response round, installs
-- the new deadline, reopens, and enqueues exactly one required notice. Exact
-- retries return the receipt; changed or stale retries have no partial effect.
DO $$
DECLARE
  v_row public.client_decisions;
  v_before timestamptz;
  v_stale_before timestamptz;
  v_due timestamptz := now() + interval '7 days';
  v_error text;
BEGIN
  SELECT updated_at INTO v_before
  FROM public.client_decisions
  WHERE id = 'fa0c0000-0000-4000-8000-000000000007';

  v_row := public.extend_and_reopen_client_decision(
    'fa0c0000-0000-4000-8000-000000000007', v_due, v_before
  );
  ASSERT v_row.status = 'pending' AND v_row.due_date = v_due,
    'expired Extend must set its deadline and reopen atomically';
  ASSERT v_row.responded_at IS NULL
         AND v_row.viewed_at IS NULL
         AND v_row.reminder_sent_at IS NULL
         AND v_row.selected_by IS NULL
         AND v_row.answer IS NULL
         AND v_row.answered_at IS NULL
         AND v_row.answered_by IS NULL,
    'expired Extend must clear all prior response-round evidence';
  ASSERT (SELECT NOT selected AND client_note IS NULL
          FROM public.client_decision_options
          WHERE id = 'fa0e0000-0000-4000-8000-000000000001'),
    'expired Extend must clear option response evidence';
  ASSERT pg_temp.decision_notice_count(v_row.id, 'decision_required') = 1,
    'expired Extend must enqueue one required notice in the same act';

  PERFORM public.extend_and_reopen_client_decision(
    v_row.id, v_due, v_before
  );
  ASSERT pg_temp.decision_notice_count(v_row.id, 'decision_required') = 1,
    'exact Extend replay must return its receipt without a duplicate notice';

  BEGIN
    PERFORM public.extend_and_reopen_client_decision(
      v_row.id, v_due + interval '1 day', v_before
    );
  EXCEPTION WHEN serialization_failure THEN v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'changed Extend retry must conflict';
  ASSERT (SELECT due_date = v_due FROM public.client_decisions
          WHERE id = v_row.id),
    'changed Extend retry must preserve the committed deadline';

  SELECT updated_at INTO v_stale_before
  FROM public.client_decisions
  WHERE id = 'fa0c0000-0000-4000-8000-000000000008';
  v_error := NULL;
  BEGIN
    PERFORM public.extend_and_reopen_client_decision(
      'fa0c0000-0000-4000-8000-000000000008',
      now() + interval '8 days', v_stale_before - interval '1 microsecond'
    );
  EXCEPTION WHEN serialization_failure THEN v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'stale expired Extend CAS must reject';
  ASSERT (SELECT status = 'expired' FROM public.client_decisions
          WHERE id = 'fa0c0000-0000-4000-8000-000000000008'),
    'stale Extend must not reopen the row';
  ASSERT pg_temp.decision_notice_count(
    'fa0c0000-0000-4000-8000-000000000008', 'decision_required'
  ) = 0, 'stale Extend must not leave a notice';
END;
$$;

-- Exact atomic create: parent, references, options, blockers and notice commit
-- together; exact replay is a receipt and any changed effect conflicts.
DO $$
DECLARE
  v_row public.client_decisions;
  v_error text;
  v_payload jsonb := jsonb_build_object(
    'designer_client_id', 'fa030000-0000-4000-8000-000000000001',
    'project_id', 'fa040000-0000-4000-8000-000000000001',
    'title', 'Atomic referenced choice',
    'context', 'Every reference belongs to A',
    'status', 'pending',
    'phase_id', 'fa050000-0000-4000-8000-000000000001',
    'room_id', 'fa060000-0000-4000-8000-000000000001',
    'blocks_milestone_id', 'fa070000-0000-4000-8000-000000000001',
    'court', 'vendor',
    'court_party_id', 'fa080000-0000-4000-8000-000000000001',
    'blocks_kind', 'task',
    'blocking_status', 'non_blocking'
  );
  v_options jsonb := '[
    {"name":"A","price":1000,"is_recommended":true,"sort_order":0},
    {"name":"B","price":2000,"sort_order":1}
  ]'::jsonb;
BEGIN
  v_row := public.create_client_decision(
    'fa0d0000-0000-4000-8000-000000000001', v_payload, v_options,
    ARRAY['fa090000-0000-4000-8000-000000000001'::uuid],
    ARRAY['fa0a0000-0000-4000-8000-000000000001'::uuid]
  );
  ASSERT v_row.status = 'pending' AND v_row.sent_at IS NOT NULL,
    'atomic create must publish the requested pending row';
  ASSERT (SELECT count(*) = 2 FROM public.client_decision_options
          WHERE decision_id = v_row.id), 'options must commit in the same act';
  ASSERT (SELECT blocked AND blocked_by_decision_id = v_row.id
          FROM public.project_ffe_items
          WHERE id = 'fa090000-0000-4000-8000-000000000001'),
    'FF&E dependency must commit in the same act';
  ASSERT (SELECT status = 'blocked' AND blocked_by_item_id = v_row.id
          FROM public.project_tasks
          WHERE id = 'fa0a0000-0000-4000-8000-000000000001'),
    'task dependency must commit in the same act';
  ASSERT pg_temp.decision_notice_count(v_row.id, 'decision_required') = 1,
    'pending create must durably notify in the same act';

  PERFORM public.create_client_decision(
    'fa0d0000-0000-4000-8000-000000000001', v_payload, v_options,
    ARRAY['fa090000-0000-4000-8000-000000000001'::uuid],
    ARRAY['fa0a0000-0000-4000-8000-000000000001'::uuid]
  );
  ASSERT pg_temp.decision_notice_count(v_row.id, 'decision_required') = 1,
    'exact create replay must not duplicate notice truth';

  BEGIN
    PERFORM public.create_client_decision(
      'fa0d0000-0000-4000-8000-000000000001',
      v_payload || '{"title":"Changed retry"}'::jsonb, v_options,
      ARRAY['fa090000-0000-4000-8000-000000000001'::uuid],
      ARRAY['fa0a0000-0000-4000-8000-000000000001'::uuid]
    );
  EXCEPTION WHEN serialization_failure THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'changed payload retry must conflict';

  v_error := NULL;
  BEGIN
    PERFORM public.create_client_decision(
      'fa0d0000-0000-4000-8000-000000000001', v_payload,
      '[{"name":"changed"}]'::jsonb,
      ARRAY['fa090000-0000-4000-8000-000000000001'::uuid],
      ARRAY['fa0a0000-0000-4000-8000-000000000001'::uuid]
    );
  EXCEPTION WHEN serialization_failure THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'changed option retry must conflict';

  v_error := NULL;
  BEGIN
    PERFORM public.create_client_decision(
      'fa0d0000-0000-4000-8000-000000000001', v_payload, v_options,
      ARRAY[]::uuid[], ARRAY[]::uuid[]
    );
  EXCEPTION WHEN serialization_failure THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'changed dependency retry must conflict';
END;
$$;

-- Cross-project, already-claimed, terminal and relationship mismatches must
-- roll the entire create back (including options and notifications).
DO $$
DECLARE
  v_case record;
  v_error text;
BEGIN
  FOR v_case IN
    SELECT * FROM (VALUES
      ('fa0d0000-0000-4000-8000-000000000010'::uuid,
       jsonb_build_object('designer_client_id','fa030000-0000-4000-8000-000000000001','project_id','fa040000-0000-4000-8000-000000000001','title','cross phase','status','pending','phase_id','fa050000-0000-4000-8000-000000000002'), ARRAY[]::uuid[], ARRAY[]::uuid[]),
      ('fa0d0000-0000-4000-8000-000000000011'::uuid,
       jsonb_build_object('designer_client_id','fa030000-0000-4000-8000-000000000001','project_id','fa040000-0000-4000-8000-000000000001','title','cross room','status','pending','room_id','fa060000-0000-4000-8000-000000000002'), ARRAY[]::uuid[], ARRAY[]::uuid[]),
      ('fa0d0000-0000-4000-8000-000000000012'::uuid,
       jsonb_build_object('designer_client_id','fa030000-0000-4000-8000-000000000001','project_id','fa040000-0000-4000-8000-000000000001','title','cross milestone','status','pending','blocks_milestone_id','fa070000-0000-4000-8000-000000000002'), ARRAY[]::uuid[], ARRAY[]::uuid[]),
      ('fa0d0000-0000-4000-8000-000000000013'::uuid,
       jsonb_build_object('designer_client_id','fa030000-0000-4000-8000-000000000001','project_id','fa040000-0000-4000-8000-000000000001','title','cross party','status','pending','court_party_id','fa080000-0000-4000-8000-000000000002'), ARRAY[]::uuid[], ARRAY[]::uuid[]),
      ('fa0d0000-0000-4000-8000-000000000014'::uuid,
       jsonb_build_object('designer_client_id','fa030000-0000-4000-8000-000000000002','project_id','fa040000-0000-4000-8000-000000000001','title','wrong household','status','pending'), ARRAY[]::uuid[], ARRAY[]::uuid[]),
      ('fa0d0000-0000-4000-8000-000000000015'::uuid,
       jsonb_build_object('designer_client_id','fa030000-0000-4000-8000-000000000001','project_id','fa040000-0000-4000-8000-000000000003','title','terminal open','status','draft'), ARRAY[]::uuid[], ARRAY[]::uuid[]),
      ('fa0d0000-0000-4000-8000-000000000016'::uuid,
       jsonb_build_object('designer_client_id','fa030000-0000-4000-8000-000000000001','project_id','fa040000-0000-4000-8000-000000000001','title','cross FFE','status','pending'), ARRAY['fa090000-0000-4000-8000-000000000004'::uuid], ARRAY[]::uuid[]),
      ('fa0d0000-0000-4000-8000-000000000017'::uuid,
       jsonb_build_object('designer_client_id','fa030000-0000-4000-8000-000000000001','project_id','fa040000-0000-4000-8000-000000000001','title','claimed FFE','status','pending'), ARRAY['fa090000-0000-4000-8000-000000000001'::uuid], ARRAY[]::uuid[]),
      ('fa0d0000-0000-4000-8000-000000000018'::uuid,
       jsonb_build_object('designer_client_id','fa030000-0000-4000-8000-000000000001','project_id','fa040000-0000-4000-8000-000000000001','title','cross task','status','pending'), ARRAY[]::uuid[], ARRAY['fa0a0000-0000-4000-8000-000000000004'::uuid])
    ) AS cases(id, payload, ffe_ids, task_ids)
  LOOP
    v_error := NULL;
    BEGIN
      PERFORM public.create_client_decision(
        v_case.id, v_case.payload, '[{"name":"must roll back"}]'::jsonb,
        v_case.ffe_ids, v_case.task_ids
      );
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
    END;
    ASSERT v_error IS NOT NULL, format('invalid create %s must reject', v_case.id);
    ASSERT NOT EXISTS (SELECT 1 FROM public.client_decisions WHERE id = v_case.id),
      format('invalid create %s must not leave a parent', v_case.id);
    ASSERT NOT EXISTS (SELECT 1 FROM public.client_decision_options WHERE decision_id = v_case.id),
      format('invalid create %s must not leave options', v_case.id);
    ASSERT pg_temp.decision_notice_count(v_case.id) = 0,
      format('invalid create %s must not leave a notice', v_case.id);
  END LOOP;
END;
$$;

-- Draft coordination retagging is one CAS transaction. Invalid/stale retags
-- leave both the payload and dependency web untouched.
DO $$
DECLARE
  v_row public.client_decisions;
  v_before timestamptz;
  v_error text;
BEGIN
  v_row := public.create_client_decision(
    'fa0d0000-0000-4000-8000-000000000020',
    jsonb_build_object('designer_client_id','fa030000-0000-4000-8000-000000000001','project_id','fa040000-0000-4000-8000-000000000001','title','Retag draft','status','draft'),
    '[]'::jsonb,
    ARRAY['fa090000-0000-4000-8000-000000000002'::uuid],
    ARRAY['fa0a0000-0000-4000-8000-000000000002'::uuid]
  );
  v_before := v_row.updated_at;
  v_row := public.update_coordination_item(
    v_row.id, '{"title":"Retag winner"}'::jsonb, NULL,
    ARRAY['fa090000-0000-4000-8000-000000000003'::uuid],
    ARRAY['fa0a0000-0000-4000-8000-000000000003'::uuid], v_before
  );
  ASSERT v_row.title = 'Retag winner', 'coordination patch must commit';
  ASSERT (SELECT NOT blocked AND blocked_by_decision_id IS NULL
          FROM public.project_ffe_items WHERE id = 'fa090000-0000-4000-8000-000000000002'),
    'old FF&E gate must clear atomically';
  ASSERT (SELECT blocked_by_decision_id = v_row.id
          FROM public.project_ffe_items WHERE id = 'fa090000-0000-4000-8000-000000000003'),
    'new FF&E gate must land atomically';

  BEGIN
    PERFORM public.update_coordination_item(
      v_row.id, '{"title":"stale"}'::jsonb, NULL,
      ARRAY[]::uuid[], ARRAY[]::uuid[], v_before - interval '1 microsecond'
    );
  EXCEPTION WHEN serialization_failure THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'stale coordination CAS must reject';
  ASSERT (SELECT title = 'Retag winner' FROM public.client_decisions WHERE id = v_row.id),
    'stale coordination update must preserve payload';
  ASSERT (SELECT blocked_by_decision_id = v_row.id
          FROM public.project_ffe_items WHERE id = 'fa090000-0000-4000-8000-000000000003'),
    'stale coordination update must preserve gates';

  v_error := NULL;
  BEGIN
    PERFORM public.update_coordination_item(
      v_row.id, '{"title":"cross project"}'::jsonb, NULL,
      ARRAY['fa090000-0000-4000-8000-000000000004'::uuid], NULL, v_row.updated_at
    );
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'cross-project retag must reject';
  ASSERT (SELECT title = 'Retag winner' FROM public.client_decisions WHERE id = v_row.id),
    'invalid retag must roll payload back';

  v_error := NULL;
  BEGIN
    PERFORM public.update_coordination_item(
      v_row.id,
      '{"project_id":"fa040000-0000-4000-8000-000000000002"}'::jsonb,
      NULL, NULL, NULL, v_row.updated_at
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error = 'decision project is immutable after creation',
    'coordination edit must reject project movement even without dependency arrays';
  ASSERT (SELECT project_id = 'fa040000-0000-4000-8000-000000000001'
          FROM public.client_decisions WHERE id = v_row.id),
    'rejected project move must preserve decision identity';
  ASSERT (SELECT blocked_by_decision_id = v_row.id
          FROM public.project_ffe_items
          WHERE id = 'fa090000-0000-4000-8000-000000000003'),
    'rejected project move must preserve its existing FF&E dependency';
  ASSERT (SELECT blocked_by_item_id = v_row.id
          FROM public.project_tasks
          WHERE id = 'fa0a0000-0000-4000-8000-000000000003'),
    'rejected project move must preserve its existing task dependency';

  v_error := NULL;
  BEGIN
    PERFORM public.update_client_decision(
      v_row.id, '{"title":"missing CAS"}'::jsonb, NULL, NULL
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'null decision CAS must reject';
END;
$$;

-- Canonical assertion covers linked proposal reciprocity and remains visible
-- only through the caller's RLS. Proposal-linked generic edits/reopens are
-- terminal regardless of a tampered decision_type.
DO $$
DECLARE
  v_error text;
  v_updated timestamptz;
BEGIN
  PERFORM public.assert_client_decision_reference_integrity(
    gen_random_uuid(), 'fa030000-0000-4000-8000-000000000001',
    'fa000000-0000-4000-8000-000000000001',
    'fa040000-0000-4000-8000-000000000001', 'pending',
    NULL, NULL, NULL, NULL, 'fa0b0000-0000-4000-8000-000000000001', NULL
  );
  BEGIN
    PERFORM public.assert_client_decision_reference_integrity(
      gen_random_uuid(), 'fa030000-0000-4000-8000-000000000001',
      'fa000000-0000-4000-8000-000000000001',
      'fa040000-0000-4000-8000-000000000002', 'pending',
      NULL, NULL, NULL, NULL, 'fa0b0000-0000-4000-8000-000000000001', NULL
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'linked proposal project mismatch must reject';

  SELECT updated_at INTO v_updated FROM public.client_decisions
  WHERE id = 'fa0c0000-0000-4000-8000-000000000006';
  v_error := NULL;
  BEGIN
    PERFORM public.update_client_decision(
      'fa0c0000-0000-4000-8000-000000000006',
      '{"decision_type":"approval"}'::jsonb, NULL, v_updated
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'proposal-linked generic edit must reject';

  v_error := NULL;
  BEGIN
    PERFORM public.reopen_client_decision(
      'fa0c0000-0000-4000-8000-000000000006'
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error = 'proposal approval decisions are terminal',
    'linked proposal must be terminal independent of decision_type';
END;
$$;

-- Lifecycle updates own notices; reminder delivery is distinct, durable and
-- rate-limited in the same transaction.
DO $$
DECLARE
  v_row public.client_decisions;
  v_error text;
  v_before timestamptz;
BEGIN
  SELECT * INTO v_row FROM public.client_decisions
  WHERE id = 'fa0d0000-0000-4000-8000-000000000001';
  v_before := v_row.updated_at;
  v_row := public.update_client_decision(
    v_row.id, '{"context":"material update"}'::jsonb, NULL, v_before
  );
  ASSERT pg_temp.decision_notice_count(v_row.id, 'decision_updated') = 1,
    'pending edit must enqueue its updated notice atomically';

  v_row := public.stamp_client_decision_reminder(v_row.id);
  ASSERT v_row.reminder_sent_at IS NOT NULL, 'reminder must stamp its row';
  ASSERT pg_temp.reminder_log_count(v_row.id) = 1,
    'reminder must create a distinct durable inbox event';
  BEGIN
    PERFORM public.stamp_client_decision_reminder(v_row.id);
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'reminder cooldown must reject duplicate delivery';
  ASSERT pg_temp.reminder_log_count(v_row.id) = 1,
    'cooldown rejection must not duplicate reminder delivery';
END;
$$;

-- RFI, submittal and ball-in-court resolution preserve exact evidence.
DO $$
DECLARE
  v_row public.client_decisions;
  v_revision public.coordination_item_revisions;
  v_error text;
BEGIN
  BEGIN
    PERFORM public.resolve_coordination_item(
      'fa0c0000-0000-4000-8000-000000000001', NULL, '   '
    );
  EXCEPTION WHEN check_violation THEN v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'RFI blank answer must reject';
  v_row := public.resolve_coordination_item(
    'fa0c0000-0000-4000-8000-000000000001', NULL, 'Field answer'
  );
  ASSERT v_row.status = 'responded' AND v_row.answer = 'Field answer',
    'RFI answer must resolve atomically';
  PERFORM public.resolve_coordination_item(
    'fa0c0000-0000-4000-8000-000000000001', NULL, 'Field answer'
  );
  v_error := NULL;
  BEGIN
    PERFORM public.resolve_coordination_item(
      'fa0c0000-0000-4000-8000-000000000001', NULL, 'Changed answer'
    );
  EXCEPTION WHEN serialization_failure THEN v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'conflicting RFI retry must reject';

  v_error := NULL;
  BEGIN
    PERFORM public.submit_coordination_revision(
      'fa0c0000-0000-4000-8000-000000000002', '[]'::jsonb,
      'forged approval', 'approved'
    );
  EXCEPTION WHEN check_violation THEN v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'browser cannot submit an approved revision';
  v_revision := public.submit_coordination_revision(
    'fa0c0000-0000-4000-8000-000000000002', '[]'::jsonb,
    'Submitted revision', 'submitted'
  );
  v_error := NULL;
  BEGIN
    PERFORM public.resolve_coordination_item(
      'fa0c0000-0000-4000-8000-000000000002', NULL, 'Approved as noted'
    );
  EXCEPTION WHEN check_violation THEN v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'submittal cannot resolve without a revision';
  v_row := public.resolve_coordination_item(
    'fa0c0000-0000-4000-8000-000000000002', NULL,
    'Approved as noted', v_revision.id, 'vendor'
  );
  ASSERT v_row.status = 'responded' AND v_row.court = 'vendor',
    'eligible revision and studio court override must resolve';
  PERFORM public.resolve_coordination_item(
    'fa0c0000-0000-4000-8000-000000000002', NULL,
    'Approved as noted', v_revision.id, 'vendor'
  );
  v_error := NULL;
  BEGIN
    PERFORM public.resolve_coordination_item(
      'fa0c0000-0000-4000-8000-000000000002', NULL,
      'Changed approval note', v_revision.id, 'vendor'
    );
  EXCEPTION WHEN serialization_failure THEN v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'changed submittal retry evidence must reject';
END;
$$;

SELECT pg_temp.assume_atomic_actor('fa000000-0000-4000-8000-000000000003');
DO $$
DECLARE v_row public.client_decisions;
BEGIN
  v_row := public.resolve_coordination_item(
    'fa0c0000-0000-4000-8000-000000000004', NULL,
    'Punch verified', NULL, 'vendor'
  );
  ASSERT v_row.status = 'responded' AND v_row.court = 'vendor'
         AND v_row.selected_by = 'fa000000-0000-4000-8000-000000000003',
    'active same-studio peer may author and choose next court';
END;
$$;

SELECT pg_temp.assume_atomic_actor('fa000000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v_row public.client_decisions;
  v_error text;
BEGIN
  BEGIN
    PERFORM public.resolve_coordination_item(
      'fa0c0000-0000-4000-8000-000000000003', NULL,
      'Client approved', NULL, 'vendor'
    );
  EXCEPTION WHEN insufficient_privilege THEN v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'client cannot override next court';
  v_row := public.resolve_coordination_item(
    'fa0c0000-0000-4000-8000-000000000003', NULL, 'Client approved'
  );
  ASSERT v_row.status = 'responded' AND v_row.court = 'designer',
    'client resolution must use the server next-court default';
  PERFORM public.resolve_coordination_item(
    'fa0c0000-0000-4000-8000-000000000003', NULL, 'Client approved'
  );
  v_error := NULL;
  BEGIN
    PERFORM public.resolve_coordination_item(
      'fa0c0000-0000-4000-8000-000000000003'
    );
  EXCEPTION WHEN serialization_failure THEN v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'null retry cannot erase signoff answer evidence';

  v_error := NULL;
  BEGIN
    PERFORM public.mark_client_decision_viewed(
      'fa0c0000-0000-4000-8000-000000000005'
    );
  EXCEPTION WHEN check_violation THEN v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'draft decisions cannot be stamped viewed';
  ASSERT pg_temp.decision_viewed_at(
    'fa0c0000-0000-4000-8000-000000000005'
  ) IS NULL,
    'rejected viewed stamp must leave the draft untouched';
END;
$$;

ROLLBACK;
