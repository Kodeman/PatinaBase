-- ═══════════════════════════════════════════════════════════════════════════
-- apply_field_effect + review_sms_message tests (migration 00282)
--
-- Covers every effect kind through the single choke point:
--   1. mark_done (task)         → task done.
--   2. mark_done (coordination) → resolve_coordination_item cascade: item
--      responded + downstream blocked task flips blocked→todo.
--   3. report_delay (task)      → due_date moved + note appended.
--   4. flag_blocker (task)      → RFI (coordination_kind='rfi', court='designer')
--      inserted + target task blocked.
--   5. punch_report             → coordination_kind='punch', court='designer'.
--   6. confirm_delivery (note)  → applied=false, summary present.
--   7. note                     → applied=false, summary = the note text.
--   8. CROSS-PROJECT FORGERY    → a target on another project is rejected and
--      leaves that target untouched.
--   9. sms_message stamping     → applied_effect + matched_task_id written back.
--  10. remaining_count          → reflects the party's still-open work.
--  11. review_sms_message('apply') applies the parked effect + clears the flag.
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/field/apply_field_effect_test.sql
--
-- Runs as postgres (superuser): apply_field_effect is REVOKEd from authenticated
-- by design, so only service-role/DEFINER callers reach it — the test exercises
-- it directly. Transaction-wrapped + ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('ef000000-0000-4000-8000-000000000001', 'ef-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('ef000000-0000-4000-8000-000000000001', 'ef-designer@test.invalid', 'EF Designer', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO designer_clients (id, designer_id, client_name, status)
VALUES ('ef000000-0000-4000-8000-0000000000c1', 'ef000000-0000-4000-8000-000000000001', 'EF Household', 'active');

-- p1 = the party's project; p2 = a different project (cross-project forgery).
INSERT INTO projects (id, name, designer_id, created_by)
VALUES
  ('ef000000-0000-4000-8000-0000000000a1', 'EF Project',  'ef000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001'),
  ('ef000000-0000-4000-8000-0000000000a2', 'EF Project 2', 'ef000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001');

-- Team membership so review_sms_message authorizes the designer as a member too.
INSERT INTO project_team_members (project_id, user_id, role)
VALUES ('ef000000-0000-4000-8000-0000000000a1', 'ef000000-0000-4000-8000-000000000001', 'lead_designer')
ON CONFLICT DO NOTHING;

INSERT INTO project_parties (id, project_id, party_kind, display_name, phone)
VALUES ('ef000000-0000-4000-8000-0000000000b1', 'ef000000-0000-4000-8000-0000000000a1', 'sub', 'Sal Sub', '5551234567');

-- Tasks: t1 owned+open, t2 owned+open (remaining-count), tblk blocked by a signoff,
-- tdelay for report_delay, trival on p2 (forgery target).
INSERT INTO project_tasks (id, project_id, title, owner, owner_party_id, status)
VALUES
  ('ef000000-0000-4000-8000-0000000000d1', 'ef000000-0000-4000-8000-0000000000a1', 'Install vanity', 'sub', 'ef000000-0000-4000-8000-0000000000b1', 'todo'),
  ('ef000000-0000-4000-8000-0000000000d2', 'ef000000-0000-4000-8000-0000000000a1', 'Set tile',       'sub', 'ef000000-0000-4000-8000-0000000000b1', 'todo'),
  ('ef000000-0000-4000-8000-0000000000d3', 'ef000000-0000-4000-8000-0000000000a1', 'Rough-in plumb', 'sub', 'ef000000-0000-4000-8000-0000000000b1', 'todo'),
  ('ef000000-0000-4000-8000-0000000000d4', 'ef000000-0000-4000-8000-0000000000a2', 'Rival task',     'designer', NULL, 'todo');

-- A signoff coordination item in the party's court, blocking tblk.
INSERT INTO client_decisions (id, designer_client_id, designer_id, project_id, title, decision_type, coordination_kind, court, court_party_id, blocks_kind, status)
VALUES ('ef000000-0000-4000-8000-0000000000e1', 'ef000000-0000-4000-8000-0000000000c1', 'ef000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-0000000000a1', 'Rough-in signoff', 'approval', 'signoff', 'sub', 'ef000000-0000-4000-8000-0000000000b1', 'task', 'pending');

-- tblk waits on the signoff.
INSERT INTO project_tasks (id, project_id, title, owner, owner_party_id, status, blocked_by_item_id)
VALUES ('ef000000-0000-4000-8000-0000000000d5', 'ef000000-0000-4000-8000-0000000000a1', 'Close walls', 'sub', 'ef000000-0000-4000-8000-0000000000b1', 'blocked', 'ef000000-0000-4000-8000-0000000000e1');

-- A conversation + inbound message for the stamping + triage cases.
INSERT INTO sms_conversations (id, twilio_number, phone_e164, party_id, active_project_id, state)
VALUES ('ef000000-0000-4000-8000-0000000000f1', '+15550000000', '+15551234567', 'ef000000-0000-4000-8000-0000000000b1', 'ef000000-0000-4000-8000-0000000000a1', 'idle');

INSERT INTO sms_messages (id, conversation_id, direction, body, party_id, project_id, parsed_intent, needs_review)
VALUES
  ('ef000000-0000-4000-8000-0000000000f2', 'ef000000-0000-4000-8000-0000000000f1', 'inbound', 'done with the tile', 'ef000000-0000-4000-8000-0000000000b1', 'ef000000-0000-4000-8000-0000000000a1', NULL, false),
  ('ef000000-0000-4000-8000-0000000000f3', 'ef000000-0000-4000-8000-0000000000f1', 'inbound', 'vanity is in', 'ef000000-0000-4000-8000-0000000000b1', 'ef000000-0000-4000-8000-0000000000a1',
    jsonb_build_object('type', 'mark_done', 'target', jsonb_build_object('kind', 'task', 'id', 'ef000000-0000-4000-8000-0000000000d1')), true);

-- ─── assertions ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_res     JSONB;
  v_status  TEXT;
  v_count   INTEGER;
  v_due     DATE;
  v_desc    TEXT;
  v_raised  BOOLEAN;
  v_kind    TEXT;
  v_court   TEXT;
BEGIN
  -- ── Case 1: mark_done (task) ─────────────────────────────────────────────
  v_res := public.apply_field_effect(
    'ef000000-0000-4000-8000-0000000000b1',
    jsonb_build_object('type', 'mark_done',
      'target', jsonb_build_object('kind', 'task', 'id', 'ef000000-0000-4000-8000-0000000000d2')));
  SELECT status INTO v_status FROM project_tasks WHERE id = 'ef000000-0000-4000-8000-0000000000d2';
  ASSERT v_status = 'done', 'FAIL 1: task should be done, got ' || v_status;
  ASSERT (v_res->>'applied')::boolean, 'FAIL 1: result.applied should be true';
  ASSERT length(v_res->>'summary_text') > 0, 'FAIL 1: summary_text should be present';

  -- ── Case 2: mark_done (coordination) — resolve cascade ───────────────────
  v_res := public.apply_field_effect(
    'ef000000-0000-4000-8000-0000000000b1',
    jsonb_build_object('type', 'mark_done',
      'target', jsonb_build_object('kind', 'coordination', 'id', 'ef000000-0000-4000-8000-0000000000e1')));
  SELECT status INTO v_status FROM client_decisions WHERE id = 'ef000000-0000-4000-8000-0000000000e1';
  ASSERT v_status = 'responded', 'FAIL 2a: coordination item should be responded, got ' || v_status;
  SELECT status INTO v_status FROM project_tasks WHERE id = 'ef000000-0000-4000-8000-0000000000d5';
  ASSERT v_status = 'todo', 'FAIL 2b: blocked task should cascade to todo, got ' || v_status;

  -- ── Case 3: report_delay (task) ──────────────────────────────────────────
  v_res := public.apply_field_effect(
    'ef000000-0000-4000-8000-0000000000b1',
    jsonb_build_object('type', 'report_delay',
      'target', jsonb_build_object('kind', 'task', 'id', 'ef000000-0000-4000-8000-0000000000d3'),
      'new_date', '2030-06-15', 'note', 'valve backordered'));
  SELECT due_date, description INTO v_due, v_desc FROM project_tasks WHERE id = 'ef000000-0000-4000-8000-0000000000d3';
  ASSERT v_due = DATE '2030-06-15', 'FAIL 3a: due_date should move, got ' || COALESCE(v_due::text, 'NULL');
  ASSERT v_desc LIKE '%valve backordered%', 'FAIL 3b: note should be appended, got ' || COALESCE(v_desc, 'NULL');

  -- ── Case 4: flag_blocker (task) ──────────────────────────────────────────
  v_res := public.apply_field_effect(
    'ef000000-0000-4000-8000-0000000000b1',
    jsonb_build_object('type', 'flag_blocker',
      'target', jsonb_build_object('kind', 'task', 'id', 'ef000000-0000-4000-8000-0000000000d1'),
      'note', 'cannot start until inspection'));
  SELECT coordination_kind, court INTO v_kind, v_court
    FROM client_decisions WHERE id = (v_res->>'item_id')::uuid;
  ASSERT v_kind = 'rfi', 'FAIL 4a: flag_blocker should raise an rfi, got ' || v_kind;
  ASSERT v_court = 'designer', 'FAIL 4b: rfi court should be designer, got ' || v_court;
  SELECT status INTO v_status FROM project_tasks WHERE id = 'ef000000-0000-4000-8000-0000000000d1';
  ASSERT v_status = 'blocked', 'FAIL 4c: target task should be blocked, got ' || v_status;

  -- ── Case 5: punch_report ─────────────────────────────────────────────────
  v_res := public.apply_field_effect(
    'ef000000-0000-4000-8000-0000000000b1',
    jsonb_build_object('type', 'punch_report', 'note', 'chip in the counter',
      'media', jsonb_build_array('project/x/sms/y/1.jpg', 'project/x/sms/y/2.jpg')));
  SELECT coordination_kind, court INTO v_kind, v_court
    FROM client_decisions WHERE id = (v_res->>'item_id')::uuid;
  ASSERT v_kind = 'punch', 'FAIL 5a: punch_report should raise a punch, got ' || v_kind;
  ASSERT v_court = 'designer', 'FAIL 5b: punch court should be designer, got ' || v_court;
  ASSERT v_res->>'summary_text' LIKE '%2 photo%', 'FAIL 5c: summary should count photos, got ' || (v_res->>'summary_text');

  -- ── Case 6: confirm_delivery (note-only) ─────────────────────────────────
  v_res := public.apply_field_effect(
    'ef000000-0000-4000-8000-0000000000b1',
    jsonb_build_object('type', 'confirm_delivery', 'note', 'sofa arrived clean'));
  ASSERT (v_res->>'applied')::boolean = false, 'FAIL 6a: note-only confirm should be applied=false';
  ASSERT v_res->>'summary_text' LIKE '%confirmed%', 'FAIL 6b: summary should mention confirmed';

  -- ── Case 7: note ─────────────────────────────────────────────────────────
  v_res := public.apply_field_effect(
    'ef000000-0000-4000-8000-0000000000b1',
    jsonb_build_object('type', 'note', 'note', 'running 20 min late'));
  ASSERT (v_res->>'applied')::boolean = false, 'FAIL 7a: note should be applied=false';
  ASSERT v_res->>'summary_text' = 'running 20 min late', 'FAIL 7b: summary should echo the note';

  -- ── Case 8: cross-project forgery rejection ──────────────────────────────
  v_raised := false;
  BEGIN
    PERFORM public.apply_field_effect(
      'ef000000-0000-4000-8000-0000000000b1',
      jsonb_build_object('type', 'mark_done',
        'target', jsonb_build_object('kind', 'task', 'id', 'ef000000-0000-4000-8000-0000000000d4')));
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL 8a: a cross-project target must be rejected';
  SELECT status INTO v_status FROM project_tasks WHERE id = 'ef000000-0000-4000-8000-0000000000d4';
  ASSERT v_status = 'todo', 'FAIL 8b: the forged target must be untouched, got ' || v_status;

  -- ── Case 9: sms_message stamping ─────────────────────────────────────────
  v_res := public.apply_field_effect(
    'ef000000-0000-4000-8000-0000000000b1',
    jsonb_build_object('type', 'note', 'note', 'stamp me'),
    'sms', 'ef000000-0000-4000-8000-0000000000f2');
  SELECT (applied_effect->>'summary_text') INTO v_desc FROM sms_messages WHERE id = 'ef000000-0000-4000-8000-0000000000f2';
  ASSERT v_desc = 'stamp me', 'FAIL 9: applied_effect should be stamped on the message, got ' || COALESCE(v_desc, 'NULL');

  -- ── Case 10: remaining_count reflects open work ──────────────────────────
  -- d3 open (delayed), d1 blocked-not-done, d5 open, d2 done, plus court items.
  v_res := public.apply_field_effect(
    'ef000000-0000-4000-8000-0000000000b1',
    jsonb_build_object('type', 'note', 'note', 'count check'));
  ASSERT (v_res->>'remaining_count')::int >= 1, 'FAIL 10: remaining_count should be >= 1, got ' || (v_res->>'remaining_count');

  RAISE NOTICE 'apply_field_effect: cases 1–10 passed.';
END
$$;

-- ── Case 11: review_sms_message('apply') applies the parked effect ─────────
DO $$
DECLARE
  v_status TEXT;
  v_res    JSONB;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', 'ef000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);

  v_res := public.review_sms_message('ef000000-0000-4000-8000-0000000000f3', 'apply');

  SELECT status INTO v_status FROM project_tasks WHERE id = 'ef000000-0000-4000-8000-0000000000d1';
  -- d1 was 'blocked' from case 4's flag_blocker; the parked mark_done now closes it.
  ASSERT v_status = 'done', 'FAIL 11a: triage-apply should mark the task done, got ' || v_status;

  SELECT needs_review INTO v_status FROM sms_messages WHERE id = 'ef000000-0000-4000-8000-0000000000f3';
  ASSERT v_status = 'false', 'FAIL 11b: reviewed message should clear needs_review';

  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'apply_field_effect: case 11 (review_sms_message) passed.';
  RAISE NOTICE 'All apply_field_effect assertions passed.';
END
$$;

ROLLBACK;
