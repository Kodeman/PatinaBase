-- Proposal policy locking / exact-authority regression (00401)
-- Run after a fresh reset:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/proposals/proposal_policy_locking_integrity_test.sql

BEGIN;

SET LOCAL statement_timeout = '20s';
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('c4010000-0000-4000-8000-000000000001', 'policy-owner@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c4010000-0000-4000-8000-000000000002', 'policy-contractor@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c4010000-0000-4000-8000-000000000003', 'policy-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-4000-8000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (
  id, email, full_name, is_designer, created_at, updated_at
)
VALUES
  ('c4010000-0000-4000-8000-000000000001', 'policy-owner@test.invalid', 'Policy Owner', true, now(), now()),
  ('c4010000-0000-4000-8000-000000000002', 'policy-contractor@test.invalid', 'Policy Contractor', false, now(), now()),
  ('c4010000-0000-4000-8000-000000000003', 'policy-client@test.invalid', 'Policy Client', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_designer = EXCLUDED.is_designer,
    updated_at = EXCLUDED.updated_at;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('c4011000-0000-4000-8000-000000000001', 'design_studio', 'Policy Design Studio', 'policy-design-studio', 'active'),
  ('c4011000-0000-4000-8000-000000000002', 'contractor', 'Policy Contractor Org', 'policy-contractor-org', 'active');

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES
  ('c4011100-0000-4000-8000-000000000001', 'c4010000-0000-4000-8000-000000000001', 'c4011000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('c4011100-0000-4000-8000-000000000002', 'c4010000-0000-4000-8000-000000000001', 'c4011000-0000-4000-8000-000000000002', 'owner', 'active', now()),
  ('c4011100-0000-4000-8000-000000000003', 'c4010000-0000-4000-8000-000000000002', 'c4011000-0000-4000-8000-000000000002', 'member', 'active', now());

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, client_email, status, source
)
VALUES (
  'c4012000-0000-4000-8000-000000000001',
  'c4010000-0000-4000-8000-000000000001',
  'c4010000-0000-4000-8000-000000000003',
  'Policy Client', 'policy-client@test.invalid', 'active', 'direct'
);

INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, total_amount, status,
  valid_until
)
VALUES
  ('c4013000-0000-4000-8000-000000000001', 'c4010000-0000-4000-8000-000000000001', 'c4012000-0000-4000-8000-000000000001', 'c4010000-0000-4000-8000-000000000003', 'Policy Lock Fixture', 0, 'draft', now() + interval '30 days'),
  ('c4013000-0000-4000-8000-000000000002', 'c4010000-0000-4000-8000-000000000001', 'c4012000-0000-4000-8000-000000000001', 'c4010000-0000-4000-8000-000000000003', 'Reparent Target', 0, 'draft', now() + interval '30 days'),
  ('c4013000-0000-4000-8000-000000000003', 'c4010000-0000-4000-8000-000000000001', 'c4012000-0000-4000-8000-000000000001', 'c4010000-0000-4000-8000-000000000003', 'Cascade Target', 0, 'draft', now() + interval '30 days');

INSERT INTO public.proposal_items (
  id, proposal_id, name, quantity, unit_price, unit_sell_price,
  line_total_cents, position
)
VALUES
  (
    'c4014000-0000-4000-8000-000000000001',
    'c4013000-0000-4000-8000-000000000001',
    'Policy item', 1, 100, 100, 100, 0
  ),
  (
    'c4014000-0000-4000-8000-000000000003',
    'c4013000-0000-4000-8000-000000000003',
    'Cascade item', 1, 25, 25, 25, 0
  );

INSERT INTO public.proposal_sections (
  id, proposal_id, type, title, body, sort_order
)
VALUES (
  'c4014100-0000-4000-8000-000000000001',
  'c4013000-0000-4000-8000-000000000001',
  'design_vision', 'Policy section', 'Original body', 0
);

INSERT INTO public.proposal_scope_rooms (
  id, proposal_id, name, budget_cents, sort_order
)
VALUES (
  'c4014200-0000-4000-8000-000000000001',
  'c4013000-0000-4000-8000-000000000001',
  'Policy room', 1000, 0
);

INSERT INTO public.proposal_phases (
  id, proposal_id, name, fee_cents, sort_order, lane
)
VALUES
  ('c4014300-0000-4000-8000-000000000001', 'c4013000-0000-4000-8000-000000000001', 'Policy phase', 200, 0, 'main'),
  ('c4014300-0000-4000-8000-000000000003', 'c4013000-0000-4000-8000-000000000003', 'Cascade phase', 50, 0, 'main');

INSERT INTO public.proposal_phase_deliverables (
  id, phase_id, label, sort_order
)
VALUES (
  'c4014400-0000-4000-8000-000000000001',
  'c4014300-0000-4000-8000-000000000001',
  'Policy deliverable', 0
);

INSERT INTO public.proposal_phase_gates (
  id, phase_id, gate_kind, payload, sort_order
)
VALUES (
  'c4014500-0000-4000-8000-000000000001',
  'c4014300-0000-4000-8000-000000000001',
  'client_signature', '{}', 0
);

INSERT INTO public.proposal_schedule_milestones (
  id, phase_id, name, kind, anchor_date, sort_order
)
VALUES (
  'c4014600-0000-4000-8000-000000000001',
  'c4014300-0000-4000-8000-000000000001',
  'Policy milestone', 'event', current_date + 7, 0
);

INSERT INTO public.proposal_exclusions (
  id, proposal_id, description, category, sort_order
)
VALUES (
  'c4014700-0000-4000-8000-000000000001',
  'c4013000-0000-4000-8000-000000000001',
  'Policy exclusion', 'services', 0
);

INSERT INTO public.proposal_payment_milestones (
  id, proposal_id, phase_id, label, percentage, amount_cents, sort_order
)
VALUES (
  'c4014800-0000-4000-8000-000000000001',
  'c4013000-0000-4000-8000-000000000001',
  'c4014300-0000-4000-8000-000000000001',
  'Policy payment', 100, 300, 0
);

INSERT INTO public.proposal_change_order_terms (
  id, proposal_id, process_description, hourly_rate_cents,
  minimum_fee_cents, approval_required
)
VALUES (
  'c4014900-0000-4000-8000-000000000001',
  'c4013000-0000-4000-8000-000000000001',
  'Policy terms', 10000, 10000, true
);

INSERT INTO public.proposal_palettes (
  id, proposal_id, name, is_primary, sort_order
)
VALUES (
  'c4014a00-0000-4000-8000-000000000001',
  'c4013000-0000-4000-8000-000000000001',
  'Policy palette', true, 0
);

INSERT INTO public.palette_swatches (
  id, palette_id, hex, name, sort_order
)
VALUES (
  'c4014b00-0000-4000-8000-000000000001',
  'c4014a00-0000-4000-8000-000000000001',
  '#AABBCC', 'Policy swatch', 0
);

INSERT INTO public.proposal_boards (
  id, proposal_id, name, sort_order
)
VALUES (
  'c4014c00-0000-4000-8000-000000000001',
  'c4013000-0000-4000-8000-000000000001',
  'Policy board', 0
);

INSERT INTO public.proposal_board_items (
  id, board_id, type, content, data
)
VALUES (
  'c4014d00-0000-4000-8000-000000000001',
  'c4014c00-0000-4000-8000-000000000001',
  'note', 'Policy board item', '{}'
);

INSERT INTO public.proposal_team_members (
  id, proposal_id, user_id, role, permissions, sort_order
)
VALUES (
  'c4014e00-0000-4000-8000-000000000001',
  'c4013000-0000-4000-8000-000000000001',
  'c4010000-0000-4000-8000-000000000001',
  'lead_designer', '{}', 0
);

INSERT INTO public.spec_field_defs (
  id, proposal_id, field_key, name, kind, sort_order
)
VALUES (
  'c4014f00-0000-4000-8000-000000000001',
  'c4013000-0000-4000-8000-000000000001',
  'policy_field', 'Policy field', 'text', 0
);

INSERT INTO public.projects (
  id, name, designer_id, created_by, client_id, studio_id, status
)
VALUES (
  'c4015000-0000-4000-8000-000000000001', 'Policy spec project',
  'c4010000-0000-4000-8000-000000000001',
  'c4010000-0000-4000-8000-000000000001',
  'c4010000-0000-4000-8000-000000000003',
  'c4011000-0000-4000-8000-000000000001', 'active'
);

INSERT INTO public.project_documents (
  id, project_id, title, doc_type, category, storage_path, status, uploaded_by
)
VALUES (
  'c4015100-0000-4000-8000-000000000001',
  'c4015000-0000-4000-8000-000000000001',
  'Policy spec artifact', 'pdf', 'spec',
  'policy/spec-artifact.pdf', 'ready',
  'c4010000-0000-4000-8000-000000000001'
);

INSERT INTO public.spec_books (
  id, project_id, title, template_id, created_by
)
VALUES (
  'c4015200-0000-4000-8000-000000000001',
  'c4015000-0000-4000-8000-000000000001',
  'Policy spec book',
  '8f6e2600-6f25-4f20-a63d-d68d49c35a01',
  'c4010000-0000-4000-8000-000000000001'
);

INSERT INTO public.spec_book_revisions (
  id, spec_book_id, revision_number, idempotency_key, issue_type, status,
  requested_audiences, template_snapshot, render_snapshot, snapshot_checksum,
  created_by, issued_at
)
VALUES (
  'c4015300-0000-4000-8000-000000000001',
  'c4015200-0000-4000-8000-000000000001',
  1, 'policy-locking-integrity', 'full', 'issued', ARRAY['client'],
  '{}', '{}', repeat('a', 64),
  'c4010000-0000-4000-8000-000000000001', now()
);

INSERT INTO public.spec_book_artifacts (
  id, revision_id, audience, format, status, project_document_id,
  storage_path, checksum_sha256, size_bytes, rendered_at
)
VALUES (
  'c4015400-0000-4000-8000-000000000001',
  'c4015300-0000-4000-8000-000000000001',
  'client', 'pdf', 'ready',
  'c4015100-0000-4000-8000-000000000001',
  'policy/spec-artifact.pdf', repeat('b', 64), 10, now()
);

INSERT INTO public.document_shares (
  id, proposal_id, token_hash, label, visibility, status, created_by
)
VALUES (
  'c4015500-0000-4000-8000-000000000001',
  'c4013000-0000-4000-8000-000000000001',
  repeat('c', 64), 'Contractor denial target', '{}', 'active',
  'c4010000-0000-4000-8000-000000000001'
);

CREATE OR REPLACE FUNCTION pg_temp.assume_policy_actor(p_actor uuid)
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

GRANT EXECUTE ON FUNCTION pg_temp.assume_policy_actor(uuid) TO authenticated;

-- Deterministic two-session send-order races.  The send session holds the
-- proposal parent first, as send_proposal does, while an authenticated phase
-- or item UPDATE begins.  Each writer must wait on the parent before locking
-- its child (proved by the send session's child NOWAIT lock), then wake after
-- the sent transition and affect zero rows.  Remote fixtures are committed
-- because dblink sessions cannot see this test transaction's fixtures.
DO $$
DECLARE
  v_conninfo text := format(
    'hostaddr=%s port=%s dbname=postgres user=postgres password=postgres',
    inet_server_addr(), inet_server_port()
  );
  v_phase_pid integer;
  v_item_pid integer;
  v_waiting boolean;
  v_status text;
  v_phase_fee integer;
  v_item_total integer;
  v_parent_status text;
  v_parent_total integer;
  v_attempt integer;
BEGIN
  PERFORM extensions.dblink_connect('policy_race_setup', v_conninfo);

  -- Idempotent cleanup for a prior interrupted test run.
  PERFORM extensions.dblink_exec(
    'policy_race_setup', 'SET session_replication_role = replica'
  );
  PERFORM extensions.dblink_exec(
    'policy_race_setup',
    $cleanup$
      DELETE FROM public.proposal_phases
      WHERE id = 'c4019200-0000-4000-8000-000000000001';
      DELETE FROM public.proposal_items
      WHERE id = 'c4019300-0000-4000-8000-000000000001';
      DELETE FROM public.proposals
      WHERE id IN (
        'c4019100-0000-4000-8000-000000000001',
        'c4019100-0000-4000-8000-000000000002'
      );
      DELETE FROM public.profiles
      WHERE id = 'c4019000-0000-4000-8000-000000000001';
      DELETE FROM auth.users
      WHERE id = 'c4019000-0000-4000-8000-000000000001';
    $cleanup$
  );
  PERFORM extensions.dblink_exec(
    'policy_race_setup', 'SET session_replication_role = origin'
  );

  PERFORM extensions.dblink_exec(
    'policy_race_setup',
    $setup$
      INSERT INTO auth.users (
        id, email, encrypted_password, email_confirmed_at, created_at,
        updated_at, instance_id, aud, role
      ) VALUES (
        'c4019000-0000-4000-8000-000000000001',
        'policy-race-owner@test.invalid', '', now(), now(), now(),
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated'
      );
      INSERT INTO public.profiles (
        id, email, full_name, is_designer, created_at, updated_at
      ) VALUES (
        'c4019000-0000-4000-8000-000000000001',
        'policy-race-owner@test.invalid', 'Policy Race Owner', true,
        now(), now()
      ) ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email, updated_at = EXCLUDED.updated_at;
      INSERT INTO public.proposals (
        id, designer_id, title, total_amount, status
      ) VALUES
        (
          'c4019100-0000-4000-8000-000000000001',
          'c4019000-0000-4000-8000-000000000001',
          'Send versus phase', 0, 'draft'
        ),
        (
          'c4019100-0000-4000-8000-000000000002',
          'c4019000-0000-4000-8000-000000000001',
          'Send versus item', 0, 'draft'
        );
      INSERT INTO public.proposal_phases (
        id, proposal_id, name, fee_cents, sort_order, lane
      ) VALUES (
        'c4019200-0000-4000-8000-000000000001',
        'c4019100-0000-4000-8000-000000000001',
        'Race phase', 200, 0, 'main'
      );
      INSERT INTO public.proposal_items (
        id, proposal_id, name, quantity, unit_price, unit_sell_price,
        line_total_cents, position
      ) VALUES (
        'c4019300-0000-4000-8000-000000000001',
        'c4019100-0000-4000-8000-000000000002',
        'Race item', 1, 100, 100, 100, 0
      );
    $setup$
  );

  PERFORM extensions.dblink_connect('policy_race_send', v_conninfo);
  PERFORM extensions.dblink_connect('policy_race_phase', v_conninfo);
  PERFORM extensions.dblink_connect('policy_race_item', v_conninfo);

  PERFORM extensions.dblink_exec(
    'policy_race_phase', 'SET ROLE authenticated'
  );
  PERFORM extensions.dblink_exec(
    'policy_race_phase',
    $claims$SET request.jwt.claims =
      '{"sub":"c4019000-0000-4000-8000-000000000001","role":"authenticated"}'$claims$
  );
  PERFORM extensions.dblink_exec(
    'policy_race_phase', $timeout$SET lock_timeout = '5s'$timeout$
  );
  SELECT remote.pid INTO v_phase_pid
  FROM extensions.dblink(
    'policy_race_phase', 'SELECT pg_backend_pid()'
  ) AS remote(pid integer);

  PERFORM extensions.dblink_exec(
    'policy_race_item', 'SET ROLE authenticated'
  );
  PERFORM extensions.dblink_exec(
    'policy_race_item',
    $claims$SET request.jwt.claims =
      '{"sub":"c4019000-0000-4000-8000-000000000001","role":"authenticated"}'$claims$
  );
  PERFORM extensions.dblink_exec(
    'policy_race_item', $timeout$SET lock_timeout = '5s'$timeout$
  );
  SELECT remote.pid INTO v_item_pid
  FROM extensions.dblink(
    'policy_race_item', 'SELECT pg_backend_pid()'
  ) AS remote(pid integer);

  -- send(parent -> phase) versus authenticated phase fee UPDATE.
  PERFORM extensions.dblink_exec('policy_race_send', 'BEGIN');
  PERFORM remote.id
  FROM extensions.dblink(
    'policy_race_send',
    $lock$SELECT id::text FROM public.proposals
      WHERE id = 'c4019100-0000-4000-8000-000000000001'
      FOR UPDATE$lock$
  ) AS remote(id text);

  PERFORM extensions.dblink_send_query(
    'policy_race_phase',
    $write$UPDATE public.proposal_phases
      SET fee_cents = 275
      WHERE id = 'c4019200-0000-4000-8000-000000000001'$write$
  );

  v_waiting := false;
  FOR v_attempt IN 1..40 LOOP
    SELECT activity.wait_event_type = 'Lock'
    INTO v_waiting
    FROM pg_stat_activity AS activity
    WHERE activity.pid = v_phase_pid;
    EXIT WHEN COALESCE(v_waiting, false);
    PERFORM pg_sleep(0.025);
  END LOOP;
  ASSERT COALESCE(v_waiting, false),
    'phase writer must wait on the proposal parent policy lock';

  PERFORM remote.id
  FROM extensions.dblink(
    'policy_race_send',
    $lock$SELECT id::text FROM public.proposal_phases
      WHERE id = 'c4019200-0000-4000-8000-000000000001'
      FOR UPDATE NOWAIT$lock$
  ) AS remote(id text);

  PERFORM extensions.dblink_exec(
    'policy_race_send',
    $guc$SET LOCAL app.proposal_send_id =
      'c4019100-0000-4000-8000-000000000001'$guc$
  );
  PERFORM extensions.dblink_exec(
    'policy_race_send',
    $send$UPDATE public.proposals SET status = 'sent'
      WHERE id = 'c4019100-0000-4000-8000-000000000001'$send$
  );
  PERFORM extensions.dblink_exec('policy_race_send', 'COMMIT');

  SELECT result.status INTO v_status
  FROM extensions.dblink_get_result('policy_race_phase', false)
    AS result(status text);
  ASSERT v_status = 'UPDATE 0',
    format('queued phase writer must wake into sent-state denial, got %L', v_status);

  SELECT remote.fee_cents, remote.status, remote.total_amount
  INTO v_phase_fee, v_parent_status, v_parent_total
  FROM extensions.dblink(
    'policy_race_setup',
    $state$SELECT phase.fee_cents, proposal.status, proposal.total_amount
      FROM public.proposal_phases AS phase
      JOIN public.proposals AS proposal ON proposal.id = phase.proposal_id
      WHERE phase.id = 'c4019200-0000-4000-8000-000000000001'$state$
  ) AS remote(fee_cents integer, status text, total_amount integer);
  ASSERT v_phase_fee = 200
     AND v_parent_status = 'sent'
     AND v_parent_total = 200,
    format(
      'send/phase race changed frozen state: fee=%s status=%s total=%s',
      v_phase_fee, v_parent_status, v_parent_total
    );

  -- send(parent -> item) versus authenticated item total UPDATE.
  PERFORM extensions.dblink_exec('policy_race_send', 'BEGIN');
  PERFORM remote.id
  FROM extensions.dblink(
    'policy_race_send',
    $lock$SELECT id::text FROM public.proposals
      WHERE id = 'c4019100-0000-4000-8000-000000000002'
      FOR UPDATE$lock$
  ) AS remote(id text);

  PERFORM extensions.dblink_send_query(
    'policy_race_item',
    $write$UPDATE public.proposal_items
      SET line_total_cents = 175
      WHERE id = 'c4019300-0000-4000-8000-000000000001'$write$
  );

  v_waiting := false;
  FOR v_attempt IN 1..40 LOOP
    SELECT activity.wait_event_type = 'Lock'
    INTO v_waiting
    FROM pg_stat_activity AS activity
    WHERE activity.pid = v_item_pid;
    EXIT WHEN COALESCE(v_waiting, false);
    PERFORM pg_sleep(0.025);
  END LOOP;
  ASSERT COALESCE(v_waiting, false),
    'item writer must wait on the proposal parent policy lock';

  PERFORM remote.id
  FROM extensions.dblink(
    'policy_race_send',
    $lock$SELECT id::text FROM public.proposal_items
      WHERE id = 'c4019300-0000-4000-8000-000000000001'
      FOR UPDATE NOWAIT$lock$
  ) AS remote(id text);

  PERFORM extensions.dblink_exec(
    'policy_race_send',
    $guc$SET LOCAL app.proposal_send_id =
      'c4019100-0000-4000-8000-000000000002'$guc$
  );
  PERFORM extensions.dblink_exec(
    'policy_race_send',
    $send$UPDATE public.proposals SET status = 'sent'
      WHERE id = 'c4019100-0000-4000-8000-000000000002'$send$
  );
  PERFORM extensions.dblink_exec('policy_race_send', 'COMMIT');

  SELECT result.status INTO v_status
  FROM extensions.dblink_get_result('policy_race_item', false)
    AS result(status text);
  ASSERT v_status = 'UPDATE 0',
    format('queued item writer must wake into sent-state denial, got %L', v_status);

  SELECT remote.line_total_cents, remote.status, remote.total_amount
  INTO v_item_total, v_parent_status, v_parent_total
  FROM extensions.dblink(
    'policy_race_setup',
    $state$SELECT item.line_total_cents, proposal.status, proposal.total_amount
      FROM public.proposal_items AS item
      JOIN public.proposals AS proposal ON proposal.id = item.proposal_id
      WHERE item.id = 'c4019300-0000-4000-8000-000000000001'$state$
  ) AS remote(line_total_cents integer, status text, total_amount integer);
  ASSERT v_item_total = 100
     AND v_parent_status = 'sent'
     AND v_parent_total = 100,
    format(
      'send/item race changed frozen state: item=%s status=%s total=%s',
      v_item_total, v_parent_status, v_parent_total
    );

  PERFORM extensions.dblink_disconnect('policy_race_item');
  PERFORM extensions.dblink_disconnect('policy_race_phase');
  PERFORM extensions.dblink_disconnect('policy_race_send');

  PERFORM extensions.dblink_exec(
    'policy_race_setup', 'SET session_replication_role = replica'
  );
  PERFORM extensions.dblink_exec(
    'policy_race_setup',
    $cleanup$
      DELETE FROM public.proposal_phases
      WHERE id = 'c4019200-0000-4000-8000-000000000001';
      DELETE FROM public.proposal_items
      WHERE id = 'c4019300-0000-4000-8000-000000000001';
      DELETE FROM public.proposals
      WHERE id IN (
        'c4019100-0000-4000-8000-000000000001',
        'c4019100-0000-4000-8000-000000000002'
      );
      DELETE FROM public.profiles
      WHERE id = 'c4019000-0000-4000-8000-000000000001';
      DELETE FROM auth.users
      WHERE id = 'c4019000-0000-4000-8000-000000000001';
    $cleanup$
  );
  PERFORM extensions.dblink_exec(
    'policy_race_setup', 'SET session_replication_role = origin'
  );
  PERFORM extensions.dblink_disconnect('policy_race_setup');
END;
$$;

-- The main fixture transaction continues through the authority regressions.

CREATE OR REPLACE FUNCTION pg_temp.expect_zero_rows(
  p_case text,
  p_sql text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows integer;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0,
    format('%s should affect zero rows, affected %s', p_case, v_rows);
END;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.expect_zero_rows(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.expect_sqlstate(
  p_case text,
  p_sql text,
  p_expected_state text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
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
    format(
      '%s expected SQLSTATE %s, got %s (%s)',
      p_case, p_expected_state, COALESCE(v_state, '<success>'), v_message
    );
END;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.expect_sqlstate(text, text, text) TO authenticated;

-- Exact owner compatibility: authored writes still work, totals follow item
-- and phase truth in the same statement, stale legacy total PATCHes are
-- successful no-ops, and share entropy remains RPC-owned.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_policy_actor(
  'c4010000-0000-4000-8000-000000000001'
);

SELECT pg_temp.expect_sqlstate(
  'owner raw proposal-share INSERT',
  $$INSERT INTO public.document_shares (
      proposal_id, token_hash, visibility, created_by
    ) VALUES (
      'c4013000-0000-4000-8000-000000000001', repeat('e', 64), '{}',
      'c4010000-0000-4000-8000-000000000001'
    )$$,
  '42501'
);
SELECT pg_temp.expect_sqlstate(
  'owner raw proposal-share UPDATE',
  $$UPDATE public.document_shares SET status = 'revoked'
    WHERE id = 'c4015500-0000-4000-8000-000000000001'$$,
  '42501'
);
SELECT pg_temp.expect_sqlstate(
  'owner raw proposal-share DELETE',
  $$DELETE FROM public.document_shares
    WHERE id = 'c4015500-0000-4000-8000-000000000001'$$,
  '42501'
);

DO $$
DECLARE
  v_proposal_share_id uuid;
  v_spec_share jsonb;
  v_spec_share_id uuid;
BEGIN
  SELECT created.id INTO v_proposal_share_id
  FROM public.create_document_share(
    'c4013000-0000-4000-8000-000000000001',
    'Owner proposal share', '{}', NULL
  ) AS created;
  ASSERT v_proposal_share_id IS NOT NULL,
    'owner proposal-share RPC must still mint an opaque token';
  ASSERT public.revoke_document_share(v_proposal_share_id),
    'owner proposal-share RPC must still revoke its share';

  v_spec_share := public.create_spec_book_share(
    'c4015400-0000-4000-8000-000000000001',
    'Owner spec share', NULL
  );
  v_spec_share_id := (v_spec_share->>'id')::uuid;
  ASSERT v_spec_share_id IS NOT NULL
     AND length(v_spec_share->>'token') = 64,
    format('owner spec-share RPC receipt is invalid: %s', v_spec_share);
  ASSERT public.revoke_document_share(v_spec_share_id),
    'owner spec-share RPC must still revoke its share';
END;
$$;

DO $$
DECLARE
  v_rows integer;
  v_error_state text;
BEGIN
  UPDATE public.proposal_items
  SET line_total_cents = 150
  WHERE id = 'c4014000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1, 'exact owner must retain proposal item UPDATE';
  ASSERT (SELECT total_amount = 350 FROM public.proposals
          WHERE id = 'c4013000-0000-4000-8000-000000000001'),
    'item total trigger must recompute item + phase total atomically';

  UPDATE public.proposal_phases
  SET fee_cents = 250
  WHERE id = 'c4014300-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1, 'exact owner must retain non-topology phase fee UPDATE';
  ASSERT (SELECT total_amount = 400 FROM public.proposals
          WHERE id = 'c4013000-0000-4000-8000-000000000001'),
    'phase total trigger must recompute item + phase total atomically';

  UPDATE public.proposals
  SET total_amount = 999999
  WHERE id = 'c4013000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0,
    'a direct authenticated total-only PATCH must be a successful no-op';
  ASSERT (SELECT total_amount = 400 FROM public.proposals
          WHERE id = 'c4013000-0000-4000-8000-000000000001'),
    'stale authenticated total PATCH must not overwrite database truth';

  UPDATE public.proposals
  SET description = 'Owner-authored draft description',
      total_amount = -1
  WHERE id = 'c4013000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1,
    'mixed parent payload edit must retain non-total owner changes';
  ASSERT (SELECT description = 'Owner-authored draft description'
                 AND total_amount = 400
          FROM public.proposals
          WHERE id = 'c4013000-0000-4000-8000-000000000001'),
    'mixed parent edit must normalize only the derived total';

  BEGIN
    UPDATE public.proposal_items
    SET proposal_id = 'c4013000-0000-4000-8000-000000000002'
    WHERE id = 'c4014000-0000-4000-8000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN
    v_error_state := SQLSTATE;
  END;
  ASSERT v_error_state = '42501',
    'direct authenticated reparent must be rejected before a new-parent lock edge';
  ASSERT (SELECT proposal_id = 'c4013000-0000-4000-8000-000000000001'
          FROM public.proposal_items
          WHERE id = 'c4014000-0000-4000-8000-000000000001'),
    'rejected reparent must preserve the original item owner';

  DELETE FROM public.proposal_items
  WHERE id = 'c4014000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1, 'exact owner must retain proposal item DELETE';
  ASSERT (SELECT total_amount = 250 FROM public.proposals
          WHERE id = 'c4013000-0000-4000-8000-000000000001'),
    'item DELETE must remove its contribution transactionally';

  INSERT INTO public.proposal_items (
    id, proposal_id, name, quantity, unit_price, unit_sell_price,
    line_total_cents, position
  ) VALUES (
    'c4014000-0000-4000-8000-000000000002',
    'c4013000-0000-4000-8000-000000000001',
    'Replacement policy item', 1, 125, 125, 125, 1
  );
  ASSERT (SELECT total_amount = 375 FROM public.proposals
          WHERE id = 'c4013000-0000-4000-8000-000000000001'),
    'item INSERT must add its contribution transactionally';

  DELETE FROM public.proposals
  WHERE id = 'c4013000-0000-4000-8000-000000000003';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1,
    'nonempty draft proposal DELETE must retain exact-owner compatibility';
END;
$$;

RESET ROLE;

DO $$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.proposals
    WHERE id = 'c4013000-0000-4000-8000-000000000003'
  ), 'draft proposal parent must be deleted';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.proposal_phases
    WHERE id = 'c4014300-0000-4000-8000-000000000003'
  ), 'draft proposal phase must cascade without legacy rewire failure';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.proposal_phases
    WHERE proposal_id = 'c4013000-0000-4000-8000-000000000003'
  ), 'draft proposal cascade must leave no phase orphan';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.proposal_items
    WHERE id = 'c4014000-0000-4000-8000-000000000003'
  ), 'draft proposal item must cascade without total recompute failure';
END;
$$;

-- The contractor deliberately shares a contractor organization with the
-- proposal owner.  Historical is_studio_comember policies admitted this
-- actor; exact design-studio authority must deny the parent and all sixteen
-- authored child families without changing their state.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_policy_actor(
  'c4010000-0000-4000-8000-000000000002'
);

DO $$
BEGIN
  ASSERT public.is_studio_comember(
    'c4010000-0000-4000-8000-000000000001'
  ), 'fixture contractor must reproduce historical broad co-membership';
  ASSERT NOT public.is_design_studio_comember(
    'c4010000-0000-4000-8000-000000000001'
  ), 'contractor organization must not confer design-studio authority';
END;
$$;

SELECT pg_temp.expect_zero_rows(
  'contractor proposal UPDATE',
  $$UPDATE public.proposals SET title = 'contractor parent write'
    WHERE id = 'c4013000-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_zero_rows(
  'contractor proposal item UPDATE',
  $$UPDATE public.proposal_items SET name = 'contractor item write', line_total_cents = 999
    WHERE id = 'c4014000-0000-4000-8000-000000000002'$$
);
SELECT pg_temp.expect_zero_rows(
  'contractor section UPDATE',
  $$UPDATE public.proposal_sections SET title = 'contractor section write'
    WHERE id = 'c4014100-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_zero_rows(
  'contractor scope room UPDATE',
  $$UPDATE public.proposal_scope_rooms SET name = 'contractor room write'
    WHERE id = 'c4014200-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_zero_rows(
  'contractor non-topology phase fee UPDATE',
  $$UPDATE public.proposal_phases SET fee_cents = 999
    WHERE id = 'c4014300-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_zero_rows(
  'contractor phase deliverable UPDATE',
  $$UPDATE public.proposal_phase_deliverables SET label = 'contractor deliverable write'
    WHERE id = 'c4014400-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_zero_rows(
  'contractor phase gate UPDATE',
  $$UPDATE public.proposal_phase_gates SET payload = '{"contractor":true}'
    WHERE id = 'c4014500-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_zero_rows(
  'contractor schedule milestone UPDATE',
  $$UPDATE public.proposal_schedule_milestones SET name = 'contractor milestone write'
    WHERE id = 'c4014600-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_zero_rows(
  'contractor exclusion UPDATE',
  $$UPDATE public.proposal_exclusions SET description = 'contractor exclusion write'
    WHERE id = 'c4014700-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_zero_rows(
  'contractor payment milestone UPDATE',
  $$UPDATE public.proposal_payment_milestones SET label = 'contractor payment write'
    WHERE id = 'c4014800-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_zero_rows(
  'contractor change-order terms UPDATE',
  $$UPDATE public.proposal_change_order_terms SET process_description = 'contractor terms write'
    WHERE id = 'c4014900-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_zero_rows(
  'contractor palette UPDATE',
  $$UPDATE public.proposal_palettes SET name = 'contractor palette write'
    WHERE id = 'c4014a00-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_zero_rows(
  'contractor swatch UPDATE',
  $$UPDATE public.palette_swatches SET name = 'contractor swatch write'
    WHERE id = 'c4014b00-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_zero_rows(
  'contractor proposal board UPDATE',
  $$UPDATE public.proposal_boards SET name = 'contractor board write'
    WHERE id = 'c4014c00-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_zero_rows(
  'contractor proposal board item UPDATE',
  $$UPDATE public.proposal_board_items SET content = 'contractor board item write'
    WHERE id = 'c4014d00-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_zero_rows(
  'contractor proposal team UPDATE',
  $$UPDATE public.proposal_team_members SET permissions = '{"contractor":true}'
    WHERE id = 'c4014e00-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_zero_rows(
  'contractor spec field UPDATE',
  $$UPDATE public.spec_field_defs SET name = 'contractor spec field write'
    WHERE id = 'c4014f00-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_zero_rows(
  'contractor representative child DELETE',
  $$DELETE FROM public.proposal_sections
    WHERE id = 'c4014100-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_sqlstate(
  'contractor representative child INSERT',
  $$INSERT INTO public.proposal_sections (
      id, proposal_id, type, title, sort_order
    ) VALUES (
      'c4014100-0000-4000-8000-000000000099',
      'c4013000-0000-4000-8000-000000000001',
      'design_vision', 'contractor insert', 99
    )$$,
  '42501'
);

SELECT pg_temp.expect_sqlstate(
  'contractor raw proposal-share INSERT',
  $$INSERT INTO public.document_shares (
      proposal_id, token_hash, visibility, created_by
    ) VALUES (
      'c4013000-0000-4000-8000-000000000001', repeat('d', 64), '{}',
      'c4010000-0000-4000-8000-000000000002'
    )$$,
  '42501'
);
SELECT pg_temp.expect_sqlstate(
  'contractor raw proposal-share UPDATE',
  $$UPDATE public.document_shares SET status = 'revoked'
    WHERE id = 'c4015500-0000-4000-8000-000000000001'$$,
  '42501'
);
SELECT pg_temp.expect_sqlstate(
  'contractor raw proposal-share DELETE',
  $$DELETE FROM public.document_shares
    WHERE id = 'c4015500-0000-4000-8000-000000000001'$$,
  '42501'
);
SELECT pg_temp.expect_sqlstate(
  'contractor create_document_share RPC',
  $$SELECT * FROM public.create_document_share(
      'c4013000-0000-4000-8000-000000000001',
      'contractor proposal share', '{}', NULL
    )$$,
  '42501'
);
SELECT pg_temp.expect_sqlstate(
  'contractor create_spec_book_share RPC',
  $$SELECT public.create_spec_book_share(
      'c4015400-0000-4000-8000-000000000001',
      'contractor spec share', NULL
    )$$,
  '42501'
);
SELECT pg_temp.expect_sqlstate(
  'contractor revoke_document_share RPC',
  $$SELECT public.revoke_document_share(
      'c4015500-0000-4000-8000-000000000001'
    )$$,
  'P0002'
);

RESET ROLE;

DO $$
BEGIN
  ASSERT (SELECT title = 'Policy Lock Fixture' AND total_amount = 375
          FROM public.proposals
          WHERE id = 'c4013000-0000-4000-8000-000000000001'),
    'contractor parent/item/phase attempts must leave title and total unchanged';
  ASSERT (SELECT name = 'Replacement policy item' AND line_total_cents = 125
          FROM public.proposal_items
          WHERE id = 'c4014000-0000-4000-8000-000000000002'),
    'contractor item attempt must be a state-preserving denial';
  ASSERT (SELECT fee_cents = 250 FROM public.proposal_phases
          WHERE id = 'c4014300-0000-4000-8000-000000000001'),
    'contractor phase fee attempt must not change fee or derived total';
  ASSERT (SELECT title = 'Policy section' FROM public.proposal_sections
          WHERE id = 'c4014100-0000-4000-8000-000000000001'),
    'contractor section UPDATE/DELETE must preserve the row';
  ASSERT (SELECT name = 'Policy room' FROM public.proposal_scope_rooms
          WHERE id = 'c4014200-0000-4000-8000-000000000001'),
    'contractor room UPDATE must preserve the row';
  ASSERT (SELECT label = 'Policy deliverable'
          FROM public.proposal_phase_deliverables
          WHERE id = 'c4014400-0000-4000-8000-000000000001'),
    'contractor phase child UPDATE must preserve the row';
  ASSERT (SELECT payload = '{}'::jsonb FROM public.proposal_phase_gates
          WHERE id = 'c4014500-0000-4000-8000-000000000001'),
    'contractor gate UPDATE must preserve the row';
  ASSERT (SELECT name = 'Policy milestone'
          FROM public.proposal_schedule_milestones
          WHERE id = 'c4014600-0000-4000-8000-000000000001'),
    'contractor milestone UPDATE must preserve the row';
  ASSERT (SELECT description = 'Policy exclusion'
          FROM public.proposal_exclusions
          WHERE id = 'c4014700-0000-4000-8000-000000000001'),
    'contractor exclusion UPDATE must preserve the row';
  ASSERT (SELECT label = 'Policy payment'
          FROM public.proposal_payment_milestones
          WHERE id = 'c4014800-0000-4000-8000-000000000001'),
    'contractor payment UPDATE must preserve the row';
  ASSERT (SELECT process_description = 'Policy terms'
          FROM public.proposal_change_order_terms
          WHERE id = 'c4014900-0000-4000-8000-000000000001'),
    'contractor terms UPDATE must preserve the row';
  ASSERT (SELECT name = 'Policy palette' FROM public.proposal_palettes
          WHERE id = 'c4014a00-0000-4000-8000-000000000001'),
    'contractor palette UPDATE must preserve the row';
  ASSERT (SELECT name = 'Policy swatch' FROM public.palette_swatches
          WHERE id = 'c4014b00-0000-4000-8000-000000000001'),
    'contractor swatch UPDATE must preserve the row';
  ASSERT (SELECT name = 'Policy board' FROM public.proposal_boards
          WHERE id = 'c4014c00-0000-4000-8000-000000000001'),
    'contractor board UPDATE must preserve the row';
  ASSERT (SELECT content = 'Policy board item'
          FROM public.proposal_board_items
          WHERE id = 'c4014d00-0000-4000-8000-000000000001'),
    'contractor board item UPDATE must preserve the row';
  ASSERT (SELECT permissions = '{}'::jsonb FROM public.proposal_team_members
          WHERE id = 'c4014e00-0000-4000-8000-000000000001'),
    'contractor team UPDATE must preserve the row';
  ASSERT (SELECT name = 'Policy field' FROM public.spec_field_defs
          WHERE id = 'c4014f00-0000-4000-8000-000000000001'),
    'contractor spec field UPDATE must preserve the row';
  ASSERT (SELECT status = 'active' FROM public.document_shares
          WHERE id = 'c4015500-0000-4000-8000-000000000001'),
    'contractor raw/RPC share attempts must preserve the share';
END;
$$;

-- Composition proof: none of the historical permissive ALL policies may
-- survive, every authored write command has exactly one operation-specific
-- policy, and every child write predicate visibly invokes the lock helper.
DO $$
DECLARE
  v_child_tables text[] := ARRAY[
    'proposal_items', 'proposal_sections', 'proposal_scope_rooms',
    'proposal_phases', 'proposal_phase_deliverables', 'proposal_phase_gates',
    'proposal_schedule_milestones', 'proposal_exclusions',
    'proposal_payment_milestones', 'proposal_change_order_terms',
    'proposal_palettes', 'palette_swatches', 'proposal_boards',
    'proposal_board_items', 'proposal_team_members', 'spec_field_defs'
  ];
  v_table text;
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(ARRAY['proposals'] || v_child_tables || ARRAY['document_shares'])
      AND cmd = 'ALL'
  ), 'targeted proposal/share tables must have no permissive ALL policy';

  FOREACH v_table IN ARRAY ARRAY['proposals'] || v_child_tables
  LOOP
    ASSERT (SELECT count(*) = 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = v_table
              AND cmd = 'INSERT'),
      format('%s must have exactly one INSERT policy', v_table);
    ASSERT (SELECT count(*) = 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = v_table
              AND cmd = 'UPDATE'),
      format('%s must have exactly one UPDATE policy', v_table);
    ASSERT (SELECT count(*) = 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = v_table
              AND cmd = 'DELETE'),
      format('%s must have exactly one DELETE policy', v_table);
  END LOOP;

  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(v_child_tables)
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
      AND position(
        'lock_proposal_authored_parent'
        IN COALESCE(qual, '') || ' ' || COALESCE(with_check, '')
      ) = 0
  ), 'every authored child write policy must invoke the parent lock helper';

  ASSERT (SELECT count(*) = 13 FROM pg_policies
          WHERE schemaname = 'public'
            AND policyname = ANY(ARRAY[
              'proposals_legacy_ios_client_select',
              'proposal_items_legacy_ios_client_select',
              'proposal_sections_legacy_ios_client_select',
              'proposal_scope_rooms_legacy_ios_client_select',
              'proposal_phases_legacy_ios_client_select',
              'proposal_exclusions_legacy_ios_client_select',
              'proposal_payment_milestones_legacy_ios_client_select',
              'proposal_change_order_terms_legacy_client_select',
              'proposal_palettes_legacy_client_select',
              'palette_swatches_legacy_client_select',
              'proposal_boards_legacy_ios_client_select',
              'proposal_board_items_legacy_ios_client_select',
              'proposal_schedule_milestones_legacy_client_select'
            ])),
    'all thirteen installed-client SELECT-only policies must remain';

  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (tablename = 'proposal_phase_deliverables'
         AND policyname = 'proposal_phase_deliverables_select')
        OR (tablename = 'proposal_phase_gates'
            AND policyname = 'proposal_phase_gates_select')
      )
  ), 'the two owner-only phase-child SELECT policies must be replaced';

  ASSERT (SELECT count(*) = 3
          FROM pg_policies
          WHERE schemaname = 'public'
            AND cmd = 'SELECT'
            AND (
              (tablename = 'proposal_boards'
               AND policyname = 'Clients view their project boards')
              OR (tablename = 'proposal_board_items'
                  AND policyname = 'Clients view items on their project boards')
              OR (tablename = 'proposal_team_members'
                  AND policyname = 'Members can view their own proposal membership')
            )),
    'the two project-client and one own-membership SELECT policies must remain';

  ASSERT NOT has_table_privilege(
    'authenticated', 'public.document_shares', 'INSERT'
  ) AND NOT has_table_privilege(
    'authenticated', 'public.document_shares', 'UPDATE'
  ) AND NOT has_table_privilege(
    'authenticated', 'public.document_shares', 'DELETE'
  ), 'authenticated document-share mutations must be RPC-only';
  ASSERT NOT has_table_privilege(
    'anon', 'public.document_shares', 'INSERT'
  ) AND NOT has_table_privilege(
    'anon', 'public.document_shares', 'UPDATE'
  ) AND NOT has_table_privilege(
    'anon', 'public.document_shares', 'DELETE'
  ), 'anonymous document-share mutations must stay closed';
  ASSERT has_function_privilege(
    'authenticated',
    'public.lock_proposal_authored_parent(uuid)', 'EXECUTE'
  ), 'authenticated RLS evaluation needs the narrow locking helper';
  ASSERT NOT has_function_privilege(
    'anon', 'public.lock_proposal_authored_parent(uuid)', 'EXECUTE'
  ) AND NOT has_function_privilege(
    'service_role', 'public.lock_proposal_authored_parent(uuid)', 'EXECUTE'
  ), 'the locking helper must not be a public/server RPC surface';
END;
$$;

ROLLBACK;
