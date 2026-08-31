-- ═══════════════════════════════════════════════════════════════════════════
-- project_tasks.field_capture_id + the Field punch item's landing
-- (the punch back-reference migration — 005NN_project_task_field_capture_ref.sql)
--
-- Ruling FC-R7: a Field punch item is a project_tasks row owned by the GC,
-- riding the party-anchored SMS rail — never a client_decisions row. This file
-- pins the six facts that landing rests on.
--
-- 1. THE PUNCH INSERT   → owner='gc' + owner_party_id + section_key='install'
--                         + status='todo' + field_capture_id, as a PLAIN INSERT
--                         with a client-minted id. No RPC, no DEFINER.
-- 2. NO DRAFT STATE     → project_tasks.status still admits exactly
--                         ('todo','done','blocked'). FC-R7's whole argument
--                         against client_decisions was that 'draft' lands in a
--                         collapsed "Drafts · N" fold nobody opens; a task has
--                         no such state to fall into.
-- 3. THE COURT EXISTS   → project_tasks.owner still admits 'gc' (widened by
--                         00281:158-163). If it ever stops, every Field punch
--                         item stops inserting.
-- 4. THE RAIL IS WIRED  → the AFTER INSERT OR UPDATE OF owner_party_id trigger
--                         fc_task_assignment_dispatch (00284:207-210) is still
--                         attached, and its function still gates on
--                         sms_consent_status = 'granted'. THAT is why no
--                         automated external send comes from the device: the
--                         device writes a row; the database's own consent gate
--                         decides whether a text goes out.
-- 5. EVIDENCE OUTLIVES  → deleting the capture nulls field_capture_id and
--    THE CAPTURE          leaves the task standing (ON DELETE SET NULL).
-- 6. NO JSONB CREPT IN  → project_tasks still carries zero jsonb columns, so
--                         the "nullable FK, not a routing_source bag" decision
--                         is still the shape of the table.
--
-- How to run:
--   scripts/run-sql-tests.sh -f project_task_field_capture_ref
-- and the FULL suite for the wave report (22 documented known failures).
--
-- 7. AS authenticated   → cases 1-6 run as the connecting superuser. Case 7
--                         switches role and proves the punch item INSERTs and
--                         reads back — with its capture joined — under the
--                         designer's own policies, and that a different
--                         designer reads neither.
--
-- ⚠ Cases 1-6 run as `postgres` (superuser), so RLS is BYPASSED there. They
-- prove the COLUMN, the CONSTRAINTS and the TRIGGER. Case 7 adds the owner's
-- and an outsider's paths; the STUDIO CO-MEMBER degrade (FC-R8) is still not
-- covered here and is device-verified in Task 18.
--
-- ⚠ The fixture party is deliberately sms_consent_status='not_asked' so the
-- dispatch trigger returns early and no edge function is invoked from a test.
-- Case 4 reads the trigger's own source instead of firing it. Two consequences,
-- stated rather than discovered: this file proves NOTHING about the granted
-- path — that a consented GC really receives a text is the device pass's claim
-- (Task 18 step 4.3, verified against an sms_messages row) — and case 4's
-- assertions are STRING MATCHES on function source, so a refactor that keeps
-- the strings and breaks the logic still passes. They are a tripwire on
-- deletion, not a proof of behaviour.
--
-- Transaction-wrapped + ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('fbb00000-0000-4000-8000-000000000001', 'fbb-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('fbb00000-0000-4000-8000-000000000001', 'fbb-designer@test.invalid', 'FBB Designer', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO projects (id, name, designer_id, created_by)
VALUES ('fbb00000-0000-4000-8000-0000000000a1', 'FBB Maple St',
        'fbb00000-0000-4000-8000-000000000001', 'fbb00000-0000-4000-8000-000000000001');

INSERT INTO project_parties (id, project_id, party_kind, display_name, phone, sms_consent_status)
VALUES ('fbb00000-0000-4000-8000-0000000000b1', 'fbb00000-0000-4000-8000-0000000000a1',
        'gc', 'Delaney Build Co', '5551230000', 'not_asked');

INSERT INTO field_captures (
  id, client_capture_id, designer_id, status, destination, project_id,
  voice_transcript, photos, primary_photo_path)
VALUES (
  'fbb00000-0000-4000-8000-0000000000f1',
  'fbb00000-0000-4000-8000-0000000000c1',
  'fbb00000-0000-4000-8000-000000000001',
  'inbox', 'inbox', 'fbb00000-0000-4000-8000-0000000000a1',
  'the base cabinet scribe is short on the left return',
  '[{"path": "fbb/ct/photo-0.heic", "isPrimary": true}]'::jsonb,
  'fbb/ct/photo-0.heic');

-- A second capture, for case 7's role-switched insert. Case 5 deletes f1.
INSERT INTO field_captures (
  id, client_capture_id, designer_id, status, destination, project_id,
  voice_transcript, photos, primary_photo_path)
VALUES (
  'fbb00000-0000-4000-8000-0000000000f2',
  'fbb00000-0000-4000-8000-0000000000c2',
  'fbb00000-0000-4000-8000-000000000001',
  'inbox', 'inbox', 'fbb00000-0000-4000-8000-0000000000a1',
  'the range filler needs re-cutting',
  '[{"path": "fbb/ct/photo-1.heic", "isPrimary": true}]'::jsonb,
  'fbb/ct/photo-1.heic');

-- A second designer, for case 7c: another authenticated user must not read
-- this project's punch items.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('fbb00000-0000-4000-8000-000000000002', 'fbb-outsider@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('fbb00000-0000-4000-8000-000000000002', 'fbb-outsider@test.invalid', 'FBB Outsider', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

DO $$
DECLARE
  v_task      RECORD;
  v_status_ck TEXT;
  v_owner_ck  TEXT;
  v_trigger   BOOLEAN;
  v_trig_def  TEXT;
  v_fn_src    TEXT;
  v_jsonb     INTEGER;
  v_after     UUID;
BEGIN
  -- 1 ---------------------------------------------------------------------
  INSERT INTO project_tasks (
    id, project_id, title, description, status, owner, owner_party_id,
    section_key, created_by, field_capture_id)
  VALUES (
    'fbb00000-0000-4000-8000-0000000000d1',
    'fbb00000-0000-4000-8000-0000000000a1',
    'Base cabinet scribe short on the left return',
    'the base cabinet scribe is short on the left return' || E'\n' || 'Kitchen',
    'todo', 'gc', 'fbb00000-0000-4000-8000-0000000000b1',
    'install',
    'fbb00000-0000-4000-8000-000000000001',
    'fbb00000-0000-4000-8000-0000000000f1');

  SELECT * INTO v_task FROM project_tasks
   WHERE id = 'fbb00000-0000-4000-8000-0000000000d1';

  ASSERT v_task.owner = 'gc', 'FAIL 1a: owner must be gc, got ' || v_task.owner;
  ASSERT v_task.owner_party_id = 'fbb00000-0000-4000-8000-0000000000b1',
    'FAIL 1b: owner_party_id must carry the GC party';
  ASSERT v_task.section_key = 'install',
    'FAIL 1c: section_key must be install, got ' || COALESCE(v_task.section_key, 'NULL');
  ASSERT v_task.status = 'todo',
    'FAIL 1d: a punch item is born todo, got ' || v_task.status;
  ASSERT v_task.field_capture_id = 'fbb00000-0000-4000-8000-0000000000f1',
    'FAIL 1e: field_capture_id must carry the capture';

  -- 2 ---------------------------------------------------------------------
  SELECT pg_get_constraintdef(oid) INTO v_status_ck
    FROM pg_constraint
   WHERE conrelid = 'public.project_tasks'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%''blocked''%';
  ASSERT v_status_ck LIKE '%''todo''%' AND v_status_ck LIKE '%''done''%',
    'FAIL 2a: status CHECK lost a value: ' || COALESCE(v_status_ck, 'NULL');
  ASSERT v_status_ck NOT LIKE '%''draft''%',
    'FAIL 2b: a draft status appeared on project_tasks — FC-R7 exists to avoid one: ' || v_status_ck;

  -- 3 ---------------------------------------------------------------------
  -- By NAME first (00281:158-163 names it project_tasks_owner_check), with a
  -- content fallback. Matching any CHECK on the table that merely mentions
  -- 'gc' would pass on a constraint that has nothing to do with `owner`.
  SELECT pg_get_constraintdef(oid) INTO v_owner_ck
    FROM pg_constraint
   WHERE conrelid = 'public.project_tasks'::regclass
     AND contype = 'c'
     AND conname = 'project_tasks_owner_check';
  IF v_owner_ck IS NULL THEN
    SELECT pg_get_constraintdef(oid) INTO v_owner_ck
      FROM pg_constraint
     WHERE conrelid = 'public.project_tasks'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%(owner)%'
       AND pg_get_constraintdef(oid) LIKE '%''designer''%'
     LIMIT 1;
  END IF;
  ASSERT v_owner_ck IS NOT NULL,
    'FAIL 3a: the project_tasks owner CHECK is gone entirely';
  ASSERT v_owner_ck LIKE '%''gc''%',
    'FAIL 3b: project_tasks.owner no longer admits ''gc'' — FC-R7''s landing is gone: ' || v_owner_ck;

  -- 4 ---------------------------------------------------------------------
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.project_tasks'::regclass
       AND tgname = 'fc_task_assignment_dispatch'
       AND NOT tgisinternal
  ) INTO v_trigger;
  ASSERT v_trigger,
    'FAIL 4a: fc_task_assignment_dispatch is gone — a punch item would reach no GC';

  -- ⚠ F13: `tgname` existing is not enough — a trigger narrowed to UPDATE-only
  -- (dropping the INSERT event entirely) would still pass the assertion above
  -- while every Field punch INSERT silently stops dispatching. Pin the actual
  -- event list and the column the UPDATE is scoped to.
  SELECT pg_get_triggerdef(oid) INTO v_trig_def
    FROM pg_trigger
   WHERE tgrelid = 'public.project_tasks'::regclass
     AND tgname = 'fc_task_assignment_dispatch'
     AND NOT tgisinternal;
  ASSERT v_trig_def LIKE '%AFTER INSERT OR UPDATE OF owner_party_id%',
    'FAIL 4a2: fc_task_assignment_dispatch is no longer AFTER INSERT OR UPDATE OF owner_party_id — a punch INSERT would silently stop dispatching, got ' ||
    COALESCE(v_trig_def, 'NULL');

  SELECT pg_get_functiondef('public.fc_dispatch_task_assignment()'::regprocedure)
    INTO v_fn_src;
  ASSERT v_fn_src LIKE '%sms_consent_status%' AND v_fn_src LIKE '%granted%',
    'FAIL 4b: the dispatch trigger lost its consent gate — the device would be causing an unconsented send';
  ASSERT v_fn_src LIKE '%sms_court_assignment%',
    'FAIL 4c: the dispatch trigger no longer sends sms_court_assignment';
  -- The gate that actually decides the send is the party-kind allow-list. The
  -- trigger reads project_parties.party_kind and sms_consent_status and never
  -- reads project_tasks.owner at all — so `owner` is a label for the portal and
  -- `owner_party_id` is the routing. Pin the list, not just the consent word.
  ASSERT v_fn_src LIKE '%party_kind%',
    'FAIL 4d: the dispatch trigger no longer gates on party_kind — the allow-list is the send decision';

  -- 5 ---------------------------------------------------------------------
  DELETE FROM field_captures WHERE id = 'fbb00000-0000-4000-8000-0000000000f1';
  SELECT field_capture_id INTO v_after FROM project_tasks
   WHERE id = 'fbb00000-0000-4000-8000-0000000000d1';
  ASSERT v_after IS NULL,
    'FAIL 5a: deleting the capture must NULL field_capture_id, not cascade';
  ASSERT EXISTS (SELECT 1 FROM project_tasks WHERE id = 'fbb00000-0000-4000-8000-0000000000d1'),
    'FAIL 5b: the task must survive its capture';

  -- 6 ---------------------------------------------------------------------
  SELECT count(*) INTO v_jsonb FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'project_tasks'
     AND data_type IN ('jsonb', 'json');
  ASSERT v_jsonb = 0,
    'FAIL 6: project_tasks grew a jsonb column — re-open the FK-vs-routing_source decision, got ' || v_jsonb;

  RAISE NOTICE 'project_tasks field-capture back-reference: all 6 cases passed.';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7 — AS `authenticated`, not as the superuser the runner connects as.
--
-- Cases 1-6 run as `postgres`: RLS bypassed, table privileges never checked.
-- The device writes this row as `authenticated` through PostgREST, so the
-- landing FC-R7 rests on is only really proven under that role. Role-switching
-- idiom copied from supabase/tests/security/extension_execute_authenticated_test.sql.
--
--   7a  the designer INSERTs her own punch item (project_tasks "Designers
--       manage their project tasks", 00169:61-62) and reads it back with the
--       field_capture_id intact.
--   7b  the back-reference resolves to a capture she can also read
--       (field_captures_owner_select) — the two grants the punch surface needs
--       are both present under the same role in the same statement.
--   7c  a different authenticated designer reads neither the task nor the
--       capture. That is FC-R8's per-designer posture at the SQL layer.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION pg_temp.assume_user(
  p_user_id uuid,
  p_role text DEFAULT 'authenticated'
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_user_id, 'role', p_role)::text,
    true
  );
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(uuid, text) TO PUBLIC;

DO $$
DECLARE
  v_task            RECORD;
  v_join            RECORD;
  v_others          INTEGER;
  v_others_captures INTEGER;
BEGIN
  -- 7a ---------------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assume_user('fbb00000-0000-4000-8000-000000000001');

  INSERT INTO project_tasks (
    id, project_id, title, description, status, owner, owner_party_id,
    section_key, created_by, field_capture_id)
  VALUES (
    'fbb00000-0000-4000-8000-0000000000d2',
    'fbb00000-0000-4000-8000-0000000000a1',
    'Range filler needs re-cutting',
    'the range filler needs re-cutting' || E'\n' || 'Kitchen',
    'todo', 'gc', 'fbb00000-0000-4000-8000-0000000000b1',
    'install',
    'fbb00000-0000-4000-8000-000000000001',
    'fbb00000-0000-4000-8000-0000000000f2');

  SELECT * INTO v_task FROM project_tasks
   WHERE id = 'fbb00000-0000-4000-8000-0000000000d2';

  -- 7b ---------------------------------------------------------------------
  SELECT t.id AS task_id, fc.id AS capture_id, fc.primary_photo_path
    INTO v_join
    FROM project_tasks t
    LEFT JOIN field_captures fc ON fc.id = t.field_capture_id
   WHERE t.id = 'fbb00000-0000-4000-8000-0000000000d2';

  RESET ROLE;

  ASSERT v_task.id IS NOT NULL,
    'FAIL 7a1: the designer must be able to INSERT and read back her own punch item as authenticated';
  ASSERT v_task.field_capture_id = 'fbb00000-0000-4000-8000-0000000000f2',
    'FAIL 7a2: field_capture_id must survive the authenticated INSERT';
  ASSERT v_task.owner = 'gc' AND v_task.status = 'todo',
    'FAIL 7a3: the punch item must land owner=gc / status=todo under RLS too';
  ASSERT v_join.capture_id = 'fbb00000-0000-4000-8000-0000000000f2',
    'FAIL 7b1: the owner must read the capture the back-reference points at — without SELECT on field_captures the punch thumbnail has nothing to sign';
  ASSERT v_join.primary_photo_path = 'fbb/ct/photo-1.heic',
    'FAIL 7b2: the capture''s primary photo must reach the owner through RLS';

  -- 7c ---------------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assume_user('fbb00000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_others FROM project_tasks
   WHERE id = 'fbb00000-0000-4000-8000-0000000000d2';
  -- The capture half of the same claim. The fixture supports it: f2 carries no
  -- organization_id, so field_captures_org_inbox_select (00233:175-186) cannot
  -- match for the outsider either and owner-only is the whole policy set.
  SELECT count(*) INTO v_others_captures FROM field_captures
   WHERE id = 'fbb00000-0000-4000-8000-0000000000f2';
  RESET ROLE;

  ASSERT v_others = 0,
    'FAIL 7c1: another designer read this project''s punch item — project_tasks RLS is not per-project any more';
  ASSERT v_others_captures = 0,
    'FAIL 7c2: another designer read the capture behind this punch item — field_captures RLS is not owner-only any more (FC-R8)';

  RAISE NOTICE 'project_tasks field-capture back-reference: case 7 (authenticated) passed.';
END $$;

ROLLBACK;
