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
-- The Field Line delivery vocabulary (migration 00641, contract S3):
--  12. confirm_availability     → the proposed window lands on
--      field_delivery_reports, and NOTHING is marked received.
--  13. report_arrival           → arrived_at stamped, condition untouched.
--  14. report_condition (ok)    → condition_ok true, no review opened.
--  15. report_condition (not ok)→ condition_ok false + the message opens for
--      review with owner_user_id = the project lead.
--  16. report_departure         → left_at stamped.
--  17. NO AUTHORITY             → a seat with no in-force project_party_authority
--      grant for the effect's scope is refused with the stable code
--      `field_effect_no_authority` (SQLSTATE 42501) and writes nothing.
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

-- ── Field Line fixtures (00641) ────────────────────────────────────────────
-- b2 is the same shape of seat as b1 with ONE difference: no authority grant.
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone)
VALUES ('ef000000-0000-4000-8000-0000000000b2', 'ef000000-0000-4000-8000-0000000000a1', 'receiver', 'Del Driver', '5559876543');

-- b1 holds the two scopes the delivery effects name; b2 holds none.
INSERT INTO project_party_authority (engagement_id, scope, effective_from)
VALUES
  ('ef000000-0000-4000-8000-0000000000b1', 'schedule',    CURRENT_DATE - 1),
  ('ef000000-0000-4000-8000-0000000000b1', 'site_access', CURRENT_DATE - 1);

-- The delivery the prompt is about: d6 is b1's, d7 is b2's.
INSERT INTO project_tasks (id, project_id, title, owner, owner_party_id, status)
VALUES
  ('ef000000-0000-4000-8000-0000000000d6', 'ef000000-0000-4000-8000-0000000000a1', 'Deliver sofa',  'receiver', 'ef000000-0000-4000-8000-0000000000b1', 'todo'),
  ('ef000000-0000-4000-8000-0000000000d7', 'ef000000-0000-4000-8000-0000000000a1', 'Deliver chairs','receiver', 'ef000000-0000-4000-8000-0000000000b2', 'todo');

-- The inbound text a condition report arrives on.
INSERT INTO sms_messages (id, conversation_id, direction, body, party_id, project_id, parsed_intent, needs_review)
VALUES ('ef000000-0000-4000-8000-0000000000f4', 'ef000000-0000-4000-8000-0000000000f1', 'inbound', 'one carton is scratched', 'ef000000-0000-4000-8000-0000000000b1', 'ef000000-0000-4000-8000-0000000000a1', NULL, false);

-- SMS-origin guards require an actual provider identity (triage remains unchanged).
UPDATE sms_messages SET twilio_sid='SM'||replace(id::text,'-','')
 WHERE conversation_id='ef000000-0000-4000-8000-0000000000f1';

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
END
$$;

-- ── Cases 12–18: the Field Line delivery vocabulary (00641) ────────────────
DO $$
DECLARE
  v_res      JSONB;
  v_rep      public.field_delivery_reports;
  v_status   TEXT;
  v_done     TIMESTAMPTZ;
  v_first    TIMESTAMPTZ;
  v_review   BOOLEAN;
  v_owner    UUID;
  v_raised   BOOLEAN;
  v_detail   TEXT;
  v_sqlstate TEXT;
  v_count    INTEGER;
BEGIN
  -- ── Case 12: confirm_availability writes the proposed window ─────────────
  v_res := public.apply_field_effect(
    'ef000000-0000-4000-8000-0000000000b1',
    jsonb_build_object(
      'type', 'confirm_availability',
      'target', jsonb_build_object('kind', 'task', 'id', 'ef000000-0000-4000-8000-0000000000d6'),
      'availability', jsonb_build_object('date', '2030-06-18', 'window', '2-4')));
  SELECT * INTO v_rep FROM field_delivery_reports
   WHERE party_id = 'ef000000-0000-4000-8000-0000000000b1'
     AND subject_id = 'ef000000-0000-4000-8000-0000000000d6';
  ASSERT v_rep.proposed_date = DATE '2030-06-18',
    'FAIL 12a: proposed_date should be 2030-06-18, got ' || COALESCE(v_rep.proposed_date::text, 'NULL');
  ASSERT v_rep.proposed_window = '2-4',
    'FAIL 12b: proposed_window should be 2-4, got ' || COALESCE(v_rep.proposed_window, 'NULL');
  ASSERT v_rep.availability_at IS NOT NULL, 'FAIL 12c: availability_at should be stamped';
  ASSERT (v_res->>'applied')::boolean, 'FAIL 12d: result.applied should be true';

  -- ── Case 13: AVAILABILITY IS NOT RECEIPT ─────────────────────────────────
  SELECT status, completed_at INTO v_status, v_done
    FROM project_tasks WHERE id = 'ef000000-0000-4000-8000-0000000000d6';
  ASSERT v_status = 'todo',
    'FAIL 13a: availability must not close the delivery task, got ' || v_status;
  ASSERT v_done IS NULL, 'FAIL 13b: availability must not stamp completed_at';
  ASSERT v_rep.arrived_at IS NULL, 'FAIL 13c: availability must not stamp arrived_at';
  ASSERT v_rep.condition_ok IS NULL, 'FAIL 13d: availability must not state a condition';
  ASSERT v_res->>'summary_text' LIKE '%Nothing is marked received%',
    'FAIL 13e: the confirmation must say nothing is received, got ' || (v_res->>'summary_text');

  -- ── Case 14: report_arrival is distinct from condition, first arrival wins ─
  v_res := public.apply_field_effect(
    'ef000000-0000-4000-8000-0000000000b1',
    jsonb_build_object('type', 'report_arrival',
      'target', jsonb_build_object('kind', 'task', 'id', 'ef000000-0000-4000-8000-0000000000d6')));
  SELECT * INTO v_rep FROM field_delivery_reports
   WHERE party_id = 'ef000000-0000-4000-8000-0000000000b1'
     AND subject_id = 'ef000000-0000-4000-8000-0000000000d6';
  ASSERT v_rep.arrived_at IS NOT NULL, 'FAIL 14a: arrived_at should be stamped';
  ASSERT v_rep.condition_ok IS NULL, 'FAIL 14b: arrival must not state a condition';
  SELECT status INTO v_status FROM project_tasks WHERE id = 'ef000000-0000-4000-8000-0000000000d6';
  ASSERT v_status = 'todo', 'FAIL 14c: arrival must not close the task, got ' || v_status;
  v_first := v_rep.arrived_at;
  PERFORM public.apply_field_effect(
    'ef000000-0000-4000-8000-0000000000b1',
    jsonb_build_object('type', 'report_arrival',
      'target', jsonb_build_object('kind', 'task', 'id', 'ef000000-0000-4000-8000-0000000000d6')));
  SELECT arrived_at INTO v_rep.arrived_at FROM field_delivery_reports
   WHERE party_id = 'ef000000-0000-4000-8000-0000000000b1'
     AND subject_id = 'ef000000-0000-4000-8000-0000000000d6';
  ASSERT v_rep.arrived_at = v_first, 'FAIL 14d: a second "here" must not restate when the visit began';

  -- ── Case 15: report_condition (ok) opens no review ───────────────────────
  v_res := public.apply_field_effect(
    'ef000000-0000-4000-8000-0000000000b1',
    jsonb_build_object('type', 'report_condition',
      'target', jsonb_build_object('kind', 'task', 'id', 'ef000000-0000-4000-8000-0000000000d6'),
      'condition', jsonb_build_object('ok', true, 'note', 'all good')));
  SELECT * INTO v_rep FROM field_delivery_reports
   WHERE party_id = 'ef000000-0000-4000-8000-0000000000b1'
     AND subject_id = 'ef000000-0000-4000-8000-0000000000d6';
  ASSERT v_rep.condition_ok, 'FAIL 15a: condition_ok should be true';
  ASSERT v_rep.condition_note = 'all good',
    'FAIL 15b: the note should be kept, got ' || COALESCE(v_rep.condition_note, 'NULL');
  SELECT needs_review INTO v_review FROM sms_messages WHERE id = 'ef000000-0000-4000-8000-0000000000f4';
  ASSERT NOT v_review, 'FAIL 15c: an ok condition must not open a review';

  -- ── Case 16: report_condition (not ok) opens the review + names the owner ─
  v_res := public.apply_field_effect(
    'ef000000-0000-4000-8000-0000000000b1',
    jsonb_build_object('type', 'report_condition',
      'target', jsonb_build_object('kind', 'task', 'id', 'ef000000-0000-4000-8000-0000000000d6'),
      'condition', jsonb_build_object('ok', false, 'note', 'one carton is scratched')),
    'sms', 'ef000000-0000-4000-8000-0000000000f4');
  SELECT condition_ok INTO v_rep.condition_ok FROM field_delivery_reports
   WHERE party_id = 'ef000000-0000-4000-8000-0000000000b1'
     AND subject_id = 'ef000000-0000-4000-8000-0000000000d6';
  ASSERT NOT v_rep.condition_ok, 'FAIL 16a: condition_ok should be false';
  SELECT needs_review, owner_user_id INTO v_review, v_owner
    FROM sms_messages WHERE id = 'ef000000-0000-4000-8000-0000000000f4';
  ASSERT v_review, 'FAIL 16b: a not-ok condition must open the message for review';
  ASSERT v_owner = 'ef000000-0000-4000-8000-000000000001',
    'FAIL 16c: the review owner should be the project lead, got ' || COALESCE(v_owner::text, 'NULL');
  SELECT status INTO v_status FROM project_tasks WHERE id = 'ef000000-0000-4000-8000-0000000000d6';
  ASSERT v_status = 'todo', 'FAIL 16d: a condition report must not close the task, got ' || v_status;

  -- ── Case 17: report_departure ────────────────────────────────────────────
  v_res := public.apply_field_effect(
    'ef000000-0000-4000-8000-0000000000b1',
    jsonb_build_object('type', 'report_departure',
      'target', jsonb_build_object('kind', 'task', 'id', 'ef000000-0000-4000-8000-0000000000d6')));
  SELECT left_at INTO v_rep.left_at FROM field_delivery_reports
   WHERE party_id = 'ef000000-0000-4000-8000-0000000000b1'
     AND subject_id = 'ef000000-0000-4000-8000-0000000000d6';
  ASSERT v_rep.left_at IS NOT NULL, 'FAIL 17: left_at should be stamped';

  -- ── Case 18: NO AUTHORITY — the DB refuses, and writes nothing ───────────
  -- b2 holds no project_party_authority row at all.
  v_raised := false;
  BEGIN
    PERFORM public.apply_field_effect(
      'ef000000-0000-4000-8000-0000000000b2',
      jsonb_build_object('type', 'confirm_availability',
        'target', jsonb_build_object('kind', 'task', 'id', 'ef000000-0000-4000-8000-0000000000d7'),
        'availability', jsonb_build_object('date', '2030-06-19', 'window', 'morning')));
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL, v_sqlstate = RETURNED_SQLSTATE;
  END;
  ASSERT v_raised, 'FAIL 18a: a seat with no schedule grant must be refused';
  ASSERT v_detail = 'field_effect_no_authority',
    'FAIL 18b: the refusal must carry the stable code, got ' || COALESCE(v_detail, 'NULL');
  ASSERT v_sqlstate = '42501',
    'FAIL 18c: the refusal must be insufficient_privilege, got ' || COALESCE(v_sqlstate, 'NULL');
  SELECT count(*) INTO v_count FROM field_delivery_reports
   WHERE party_id = 'ef000000-0000-4000-8000-0000000000b2';
  ASSERT v_count = 0, 'FAIL 18d: a refused effect must write no report row, got ' || v_count;

  -- ── Case 18e: the gate is scoped, not blanket ────────────────────────────
  -- The same ungranted seat may still say what it is looking at: a condition
  -- report is a statement of fact and is never refused for want of a grant.
  v_res := public.apply_field_effect(
    'ef000000-0000-4000-8000-0000000000b2',
    jsonb_build_object('type', 'report_condition',
      'target', jsonb_build_object('kind', 'task', 'id', 'ef000000-0000-4000-8000-0000000000d7'),
      'condition', jsonb_build_object('ok', false, 'note', 'leg is cracked')));
  SELECT count(*) INTO v_count FROM field_delivery_reports
   WHERE party_id = 'ef000000-0000-4000-8000-0000000000b2' AND condition_ok = false;
  ASSERT v_count = 1, 'FAIL 18e: a condition report needs no grant, got ' || v_count;

  RAISE NOTICE 'apply_field_effect: cases 12-18 (Field Line delivery effects) passed.';
  RAISE NOTICE 'All apply_field_effect assertions passed.';
END
$$;

ROLLBACK;
