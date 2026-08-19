-- ═══════════════════════════════════════════════════════════════════════════
-- Field parties tests (migration 00281)
--
-- Covers:
--   1. party_kind CHECK admits the new field kinds (sub/installer/receiver) and
--      still rejects a bogus kind.
--   2. phone_e164 normalization trigger (10-digit → +1, 1+10 → +1, intl → +, junk
--      → NULL) on INSERT and re-derivation on UPDATE.
--   3. sms_consent_status default + transitions; bogus status rejected.
--   4. project_tasks.owner + client_decisions.court CHECKs admit the field kinds.
--   5. RLS: the owning designer SELECTs their party; an outsider designer cannot.
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/rls/field_parties_test.sql
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('fa000000-0000-4000-8000-000000000001', 'fa-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('fa000000-0000-4000-8000-000000000002', 'fa-outsider@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('fa000000-0000-4000-8000-000000000001', 'fa-designer@test.invalid', 'FA Designer', NOW(), NOW()),
  ('fa000000-0000-4000-8000-000000000002', 'fa-outsider@test.invalid', 'FA Outsider', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO designer_clients (id, designer_id, client_name, status)
VALUES ('fa000000-0000-4000-8000-0000000000c1', 'fa000000-0000-4000-8000-000000000001', 'FA Household', 'active');

INSERT INTO projects (id, name, designer_id, created_by)
VALUES
  ('fa000000-0000-4000-8000-0000000000a1', 'FA Project',       'fa000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001'),
  ('fa000000-0000-4000-8000-0000000000a2', 'FA Rival Project', 'fa000000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000002');

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
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- ─── assertions ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_kind   TEXT;
  v_e164   TEXT;
  v_status TEXT;
  v_count  INTEGER;
  v_raised BOOLEAN;
BEGIN
  -- ── Case 1: party_kind CHECK admits the new field kinds ──────────────────
  INSERT INTO project_parties (id, project_id, party_kind, display_name, phone)
  VALUES
    ('fa000000-0000-4000-8000-0000000000b1', 'fa000000-0000-4000-8000-0000000000a1', 'sub',       'Sal Sub',      '(555) 123-4567'),
    ('fa000000-0000-4000-8000-0000000000b2', 'fa000000-0000-4000-8000-0000000000a1', 'installer', 'Ivy Installer', '555.987.6543'),
    ('fa000000-0000-4000-8000-0000000000b3', 'fa000000-0000-4000-8000-0000000000a1', 'receiver',  'Rex Receiver',  '1-555-000-1111');
  SELECT count(*) INTO v_count FROM project_parties
   WHERE project_id = 'fa000000-0000-4000-8000-0000000000a1'
     AND party_kind IN ('sub', 'installer', 'receiver');
  ASSERT v_count = 3, 'FAIL 1: expected 3 field-kind parties, got ' || v_count;

  -- Bogus kind rejected.
  v_raised := false;
  BEGIN
    INSERT INTO project_parties (id, project_id, party_kind, display_name)
    VALUES ('fa000000-0000-4000-8000-0000000000bf', 'fa000000-0000-4000-8000-0000000000a1', 'plumber_bogus', 'Nope');
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL 1b: bogus party_kind should violate the CHECK';

  -- ── Case 2: phone_e164 normalization on INSERT ───────────────────────────
  SELECT phone_e164 INTO v_e164 FROM project_parties WHERE id = 'fa000000-0000-4000-8000-0000000000b1';
  ASSERT v_e164 = '+15551234567', 'FAIL 2a: 10-digit US → +1, got ' || COALESCE(v_e164, 'NULL');
  SELECT phone_e164 INTO v_e164 FROM project_parties WHERE id = 'fa000000-0000-4000-8000-0000000000b2';
  ASSERT v_e164 = '+15559876543', 'FAIL 2b: dotted 10-digit → +1, got ' || COALESCE(v_e164, 'NULL');
  SELECT phone_e164 INTO v_e164 FROM project_parties WHERE id = 'fa000000-0000-4000-8000-0000000000b3';
  ASSERT v_e164 = '+15550001111', 'FAIL 2c: 1+10-digit → +1, got ' || COALESCE(v_e164, 'NULL');

  -- International 11+ digits → +digits.
  INSERT INTO project_parties (id, project_id, party_kind, display_name, phone)
  VALUES ('fa000000-0000-4000-8000-0000000000b4', 'fa000000-0000-4000-8000-0000000000a1', 'sub', 'Intl', '+44 20 7946 0958');
  SELECT phone_e164 INTO v_e164 FROM project_parties WHERE id = 'fa000000-0000-4000-8000-0000000000b4';
  ASSERT v_e164 = '+442079460958', 'FAIL 2d: intl → +digits, got ' || COALESCE(v_e164, 'NULL');

  -- Junk phone → NULL (no reach, no failed write).
  INSERT INTO project_parties (id, project_id, party_kind, display_name, phone)
  VALUES ('fa000000-0000-4000-8000-0000000000b5', 'fa000000-0000-4000-8000-0000000000a1', 'sub', 'Junk', 'call me maybe');
  SELECT phone_e164 INTO v_e164 FROM project_parties WHERE id = 'fa000000-0000-4000-8000-0000000000b5';
  ASSERT v_e164 IS NULL, 'FAIL 2e: unparseable phone → NULL, got ' || COALESCE(v_e164, 'NULL');

  -- Re-derivation on UPDATE.
  UPDATE project_parties SET phone = '5552223333' WHERE id = 'fa000000-0000-4000-8000-0000000000b5';
  SELECT phone_e164 INTO v_e164 FROM project_parties WHERE id = 'fa000000-0000-4000-8000-0000000000b5';
  ASSERT v_e164 = '+15552223333', 'FAIL 2f: UPDATE re-derives phone_e164, got ' || COALESCE(v_e164, 'NULL');

  -- ── Case 3: sms_consent_status default + transitions ─────────────────────
  SELECT sms_consent_status INTO v_status FROM project_parties WHERE id = 'fa000000-0000-4000-8000-0000000000b1';
  ASSERT v_status = 'not_asked', 'FAIL 3a: default consent should be not_asked, got ' || v_status;

  UPDATE project_parties SET sms_consent_status = 'pending' WHERE id = 'fa000000-0000-4000-8000-0000000000b1';
  UPDATE project_parties SET sms_consent_status = 'granted', sms_consented_at = now()
   WHERE id = 'fa000000-0000-4000-8000-0000000000b1';
  SELECT sms_consent_status INTO v_status FROM project_parties WHERE id = 'fa000000-0000-4000-8000-0000000000b1';
  ASSERT v_status = 'granted', 'FAIL 3b: consent should transition to granted, got ' || v_status;

  v_raised := false;
  BEGIN
    UPDATE project_parties SET sms_consent_status = 'maybe_later' WHERE id = 'fa000000-0000-4000-8000-0000000000b1';
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL 3c: bogus consent status should violate the CHECK';

  -- ── Case 4: owner / court CHECKs admit the field kinds ───────────────────
  INSERT INTO project_tasks (id, project_id, title, owner, owner_party_id)
  VALUES ('fa000000-0000-4000-8000-0000000000d1', 'fa000000-0000-4000-8000-0000000000a1', 'Rough-in', 'sub', 'fa000000-0000-4000-8000-0000000000b1');
  SELECT owner INTO v_kind FROM project_tasks WHERE id = 'fa000000-0000-4000-8000-0000000000d1';
  ASSERT v_kind = 'sub', 'FAIL 4a: task owner should accept sub, got ' || v_kind;

  INSERT INTO client_decisions (id, designer_client_id, designer_id, project_id, title, decision_type, court, court_party_id, status)
  VALUES ('fa000000-0000-4000-8000-0000000000e1', 'fa000000-0000-4000-8000-0000000000c1', 'fa000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-0000000000a1', 'Field item', 'product', 'installer', 'fa000000-0000-4000-8000-0000000000b2', 'pending');
  SELECT court INTO v_kind FROM client_decisions WHERE id = 'fa000000-0000-4000-8000-0000000000e1';
  ASSERT v_kind = 'installer', 'FAIL 4b: decision court should accept installer, got ' || v_kind;

  RAISE NOTICE 'field_parties: cases 1–4 passed.';
END
$$;

-- ── Case 5: RLS — owner sees the party, outsider does not ──────────────────
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('fa000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_count FROM project_parties WHERE id = 'fa000000-0000-4000-8000-0000000000b1';
  ASSERT v_count = 1, 'FAIL 5a: owning designer should SELECT their party, got ' || v_count;
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('fa000000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_count FROM project_parties WHERE id = 'fa000000-0000-4000-8000-0000000000b1';
  ASSERT v_count = 0, 'FAIL 5b: outsider designer must NOT SELECT the party, got ' || v_count;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'field_parties: case 5 (RLS) passed.';
  RAISE NOTICE 'All field_parties assertions passed.';
END
$$;

ROLLBACK;
