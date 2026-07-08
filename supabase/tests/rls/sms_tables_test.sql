-- ═══════════════════════════════════════════════════════════════════════════
-- sms_conversations / sms_messages RLS + idempotency tests (migration 00282)
--
-- Covers:
--   1. Team-only SELECT: the owning designer reads a project's messages.
--   2. An outsider designer reads NOTHING.
--   3. Conversation fallback: a message with no project_id is still visible via
--      the conversation→party phone_e164 join to a project the reader owns.
--   4. No authenticated writes: authenticated has no INSERT grant → INSERT raises.
--   5. twilio_sid UNIQUE = the inbound idempotency claim: a duplicate sid is
--      rejected, and ON CONFLICT (twilio_sid) DO NOTHING inserts no second row.
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/rls/sms_tables_test.sql
--
-- Transaction-wrapped + ROLLBACK. RLS SELECT cases switch to the authenticated
-- role + jwt claims (the products_three_layer_test idiom).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('ab000000-0000-4000-8000-000000000001', 'ab-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('ab000000-0000-4000-8000-000000000002', 'ab-outsider@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('ab000000-0000-4000-8000-000000000001', 'ab-designer@test.invalid', 'AB Designer', NOW(), NOW()),
  ('ab000000-0000-4000-8000-000000000002', 'ab-outsider@test.invalid', 'AB Outsider', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO projects (id, name, designer_id, created_by)
VALUES
  ('ab000000-0000-4000-8000-0000000000a1', 'AB Project',       'ab000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001'),
  ('ab000000-0000-4000-8000-0000000000a2', 'AB Rival Project', 'ab000000-0000-4000-8000-000000000002', 'ab000000-0000-4000-8000-000000000002');

INSERT INTO project_parties (id, project_id, party_kind, display_name, phone)
VALUES ('ab000000-0000-4000-8000-0000000000b1', 'ab000000-0000-4000-8000-0000000000a1', 'sub', 'AB Sub', '5551230000');

INSERT INTO sms_conversations (id, twilio_number, phone_e164, party_id, active_project_id, state)
VALUES ('ab000000-0000-4000-8000-0000000000f1', '+15550000000', '+15551230000', 'ab000000-0000-4000-8000-0000000000b1', 'ab000000-0000-4000-8000-0000000000a1', 'idle');

-- m1: project resolved. m2: project NOT resolved (fallback path).
INSERT INTO sms_messages (id, conversation_id, direction, body, party_id, project_id, twilio_sid)
VALUES
  ('ab000000-0000-4000-8000-0000000000f2', 'ab000000-0000-4000-8000-0000000000f1', 'inbound', 'tile done', 'ab000000-0000-4000-8000-0000000000b1', 'ab000000-0000-4000-8000-0000000000a1', 'SM_ab_0001'),
  ('ab000000-0000-4000-8000-0000000000f3', 'ab000000-0000-4000-8000-0000000000f1', 'inbound', 'who is this', NULL, NULL, 'SM_ab_0002');

-- ─── helpers ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;

-- ─── assertions ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count  INTEGER;
  v_raised BOOLEAN;
BEGIN
  -- ── Case 1: owner reads the project's message (+ its conversation) ───────
  PERFORM pg_temp.assume_user('ab000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_count FROM sms_messages WHERE id = 'ab000000-0000-4000-8000-0000000000f2';
  ASSERT v_count = 1, 'FAIL 1a: owner should read the project message, got ' || v_count;
  SELECT count(*) INTO v_count FROM sms_conversations WHERE id = 'ab000000-0000-4000-8000-0000000000f1';
  ASSERT v_count = 1, 'FAIL 1b: owner should read the conversation, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- ── Case 2: outsider reads nothing ───────────────────────────────────────
  PERFORM pg_temp.assume_user('ab000000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_count FROM sms_messages
   WHERE id IN ('ab000000-0000-4000-8000-0000000000f2', 'ab000000-0000-4000-8000-0000000000f3');
  ASSERT v_count = 0, 'FAIL 2a: outsider must read NO messages, got ' || v_count;
  SELECT count(*) INTO v_count FROM sms_conversations WHERE id = 'ab000000-0000-4000-8000-0000000000f1';
  ASSERT v_count = 0, 'FAIL 2b: outsider must NOT read the conversation, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- ── Case 3: conversation fallback (project_id NULL) ──────────────────────
  PERFORM pg_temp.assume_user('ab000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_count FROM sms_messages WHERE id = 'ab000000-0000-4000-8000-0000000000f3';
  ASSERT v_count = 1, 'FAIL 3: owner should read an unresolved message via the phone fallback, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- ── Case 4: authenticated has no INSERT grant ────────────────────────────
  PERFORM pg_temp.assume_user('ab000000-0000-4000-8000-000000000001');
  v_raised := false;
  BEGIN
    INSERT INTO sms_messages (conversation_id, direction, body)
    VALUES ('ab000000-0000-4000-8000-0000000000f1', 'inbound', 'sneaky write');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL 4: authenticated INSERT on sms_messages must be denied';
  PERFORM pg_temp.reset_role();

  -- ── Case 5: twilio_sid idempotency ───────────────────────────────────────
  v_raised := false;
  BEGIN
    INSERT INTO sms_messages (conversation_id, direction, body, twilio_sid)
    VALUES ('ab000000-0000-4000-8000-0000000000f1', 'inbound', 'dup', 'SM_ab_0001');
  EXCEPTION WHEN unique_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL 5a: a duplicate twilio_sid must violate UNIQUE';

  INSERT INTO sms_messages (conversation_id, direction, body, twilio_sid)
  VALUES ('ab000000-0000-4000-8000-0000000000f1', 'inbound', 'dup2', 'SM_ab_0001')
  ON CONFLICT (twilio_sid) DO NOTHING;
  SELECT count(*) INTO v_count FROM sms_messages WHERE twilio_sid = 'SM_ab_0001';
  ASSERT v_count = 1, 'FAIL 5b: ON CONFLICT DO NOTHING should keep exactly one row, got ' || v_count;

  RAISE NOTICE 'All sms_tables assertions passed.';
END
$$;

ROLLBACK;
