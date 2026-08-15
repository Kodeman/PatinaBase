-- ═══════════════════════════════════════════════════════════════════════════
-- Studio contacts (the shared rolodex) tests — migration 00417
--
-- Covers:
--   1. A plain MEMBER can INSERT / SELECT / UPDATE live cards in their studio.
--   2. A GUEST seat sees 0 rows (deliberate guest exclusion in
--      is_active_studio_member, mirroring 00315).
--   3. An OUTSIDER (member of another studio) sees 0 rows.
--   4. A member cannot ARCHIVE (WITH CHECK blocks the write) and cannot
--      UNARCHIVE (USING hides the archived row → 0 rows).
--   5. An owner/admin CAN archive and unarchive (the admin_update leg).
--   6. DELETE as authenticated fails — no DELETE policy AND no DELETE grant.
--   7. The (organization_id, vendor_id) partial unique index is enforced.
--   8. The reused normalize_party_phone_e164 trigger derives phone_e164.
--   9. Both entity CHECKs reject bad shapes (nameless person, nameless company,
--      company hung off a company).
--  10. organizations.rolodex_seed_skipped_at is writable by an owner through the
--      EXISTING 00021 org UPDATE policy, and not by a plain member.
--
-- How to run:
--   scripts/run-supabase-sql-test.sh supabase/tests/rls/studio_contacts_test.sql
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('5c000000-0000-4000-8000-000000000001', 'sc-owner@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('5c000000-0000-4000-8000-000000000002', 'sc-member@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('5c000000-0000-4000-8000-000000000003', 'sc-guest@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('5c000000-0000-4000-8000-000000000004', 'sc-outsider@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('5c000000-0000-4000-8000-000000000001', 'sc-owner@test.invalid',    'SC Owner',    NOW(), NOW()),
  ('5c000000-0000-4000-8000-000000000002', 'sc-member@test.invalid',   'SC Member',   NOW(), NOW()),
  ('5c000000-0000-4000-8000-000000000003', 'sc-guest@test.invalid',    'SC Guest',    NOW(), NOW()),
  ('5c000000-0000-4000-8000-000000000004', 'sc-outsider@test.invalid', 'SC Outsider', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES
  ('5c000000-0000-4000-8000-0000000000a1', 'design_studio', 'SC Studio',  'sc-studio-test'),
  ('5c000000-0000-4000-8000-0000000000a2', 'design_studio', 'SC Rival',   'sc-rival-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('5c000000-0000-4000-8000-0000000000c1', '5c000000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-0000000000a1', 'owner',  'active', NOW()),
  ('5c000000-0000-4000-8000-0000000000c2', '5c000000-0000-4000-8000-000000000002', '5c000000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('5c000000-0000-4000-8000-0000000000c3', '5c000000-0000-4000-8000-000000000003', '5c000000-0000-4000-8000-0000000000a1', 'guest',  'active', NOW()),
  ('5c000000-0000-4000-8000-0000000000c4', '5c000000-0000-4000-8000-000000000004', '5c000000-0000-4000-8000-0000000000a2', 'owner',  'active', NOW());

INSERT INTO vendors (id, name, primary_category)
VALUES
  ('5c000000-0000-4000-8000-0000000000d1', 'SC Vendor One', 'lighting'),
  ('5c000000-0000-4000-8000-0000000000d2', 'SC Vendor Two', 'textiles');

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

GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO authenticated;

-- ─── (1) member CRUD on live cards ─────────────────────────────────────────
DO $$
DECLARE
  v_count INTEGER;
  v_notes TEXT;
BEGIN
  PERFORM pg_temp.assume_user('5c000000-0000-4000-8000-000000000002');

  INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, phone, created_by)
  VALUES ('5c000000-0000-4000-8000-0000000000f1', '5c000000-0000-4000-8000-0000000000a1',
          'person', 'sub', 'Sal Sub', '(555) 123-4567', '5c000000-0000-4000-8000-000000000002');

  SELECT count(*) INTO v_count FROM studio_contacts WHERE id = '5c000000-0000-4000-8000-0000000000f1';
  ASSERT v_count = 1, 'FAIL 1a: member should SELECT the card they inserted, got ' || v_count;

  UPDATE studio_contacts SET notes = 'reliable' WHERE id = '5c000000-0000-4000-8000-0000000000f1';
  SELECT notes INTO v_notes FROM studio_contacts WHERE id = '5c000000-0000-4000-8000-0000000000f1';
  ASSERT v_notes = 'reliable', 'FAIL 1b: member UPDATE of a live card should stick, got ' || COALESCE(v_notes, 'NULL');

  PERFORM pg_temp.reset_role();
  RAISE NOTICE 'studio_contacts: case 1 (member CRUD) passed.';
END
$$;

-- ─── (8) phone trigger derives phone_e164 (reused 00281 trigger fn) ─────────
DO $$
DECLARE
  v_e164 TEXT;
BEGIN
  SELECT phone_e164 INTO v_e164 FROM studio_contacts WHERE id = '5c000000-0000-4000-8000-0000000000f1';
  ASSERT v_e164 = '+15551234567',
    'FAIL 8: phone trigger should derive +15551234567, got ' || COALESCE(v_e164, 'NULL');

  -- Re-derivation on UPDATE, and junk → NULL (never a failed write).
  UPDATE studio_contacts SET phone = 'call me maybe' WHERE id = '5c000000-0000-4000-8000-0000000000f1';
  SELECT phone_e164 INTO v_e164 FROM studio_contacts WHERE id = '5c000000-0000-4000-8000-0000000000f1';
  ASSERT v_e164 IS NULL, 'FAIL 8b: unparseable phone → NULL phone_e164, got ' || COALESCE(v_e164, 'NULL');

  UPDATE studio_contacts SET phone = '(555) 123-4567' WHERE id = '5c000000-0000-4000-8000-0000000000f1';
  SELECT phone_e164 INTO v_e164 FROM studio_contacts WHERE id = '5c000000-0000-4000-8000-0000000000f1';
  ASSERT v_e164 = '+15551234567', 'FAIL 8c: UPDATE should re-derive phone_e164, got ' || COALESCE(v_e164, 'NULL');

  RAISE NOTICE 'studio_contacts: case 8 (phone trigger) passed.';
END
$$;

-- ─── (2) guest sees nothing · (3) outsider sees nothing ────────────────────
DO $$
DECLARE
  v_count INTEGER;
  v_raised BOOLEAN;
BEGIN
  PERFORM pg_temp.assume_user('5c000000-0000-4000-8000-000000000003');
  SELECT count(*) INTO v_count FROM studio_contacts
   WHERE organization_id = '5c000000-0000-4000-8000-0000000000a1';
  ASSERT v_count = 0, 'FAIL 2: a guest seat must see 0 rolodex rows, got ' || v_count;

  -- ...and cannot write one either.
  v_raised := false;
  BEGIN
    INSERT INTO studio_contacts (organization_id, entity_kind, contact_kind, full_name)
    VALUES ('5c000000-0000-4000-8000-0000000000a1', 'person', 'sub', 'Guest Smuggle');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL 2b: a guest INSERT should violate the RLS WITH CHECK';
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('5c000000-0000-4000-8000-000000000004');
  SELECT count(*) INTO v_count FROM studio_contacts
   WHERE organization_id = '5c000000-0000-4000-8000-0000000000a1';
  ASSERT v_count = 0, 'FAIL 3: an outsider studio must see 0 rows, got ' || v_count;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'studio_contacts: cases 2,3 (guest + outsider) passed.';
END
$$;

-- ─── (4) member cannot archive, cannot unarchive ───────────────────────────
DO $$
DECLARE
  v_rows    INTEGER := -1;
  v_raised  BOOLEAN := false;
  v_archived TIMESTAMPTZ;
BEGIN
  -- 4a: archive attempt on a LIVE row. USING passes (row is live) but WITH
  -- CHECK requires the POST-image to stay live, so Postgres raises 42501
  -- rather than silently updating 0 rows. Accept either outcome; what matters
  -- is that the row is still live afterwards.
  PERFORM pg_temp.assume_user('5c000000-0000-4000-8000-000000000002');
  BEGIN
    UPDATE studio_contacts SET archived_at = now()
     WHERE id = '5c000000-0000-4000-8000-0000000000f1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_raised OR v_rows = 0,
    'FAIL 4a: a member archiving should be refused (0 rows or 42501), got rows=' || v_rows;

  SELECT archived_at INTO v_archived FROM studio_contacts WHERE id = '5c000000-0000-4000-8000-0000000000f1';
  ASSERT v_archived IS NULL, 'FAIL 4a2: the card must still be live after a member archive attempt';

  RAISE NOTICE 'studio_contacts: case 4a (member cannot archive) passed.';
END
$$;

-- Archive the card as postgres so case 4b has an archived row to poke at.
UPDATE studio_contacts SET archived_at = now() WHERE id = '5c000000-0000-4000-8000-0000000000f1';

DO $$
DECLARE
  v_rows  INTEGER;
  v_count INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('5c000000-0000-4000-8000-000000000002');

  -- Archived rows stay VISIBLE to members (owner review needs them; the UI filters).
  SELECT count(*) INTO v_count FROM studio_contacts WHERE id = '5c000000-0000-4000-8000-0000000000f1';
  ASSERT v_count = 1, 'FAIL 4b0: an archived card must still be SELECTable by a member, got ' || v_count;

  -- 4b: unarchive attempt — member_update.USING excludes archived rows and the
  -- admin leg does not apply, so this is a clean 0-row no-op.
  UPDATE studio_contacts SET archived_at = NULL WHERE id = '5c000000-0000-4000-8000-0000000000f1';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, 'FAIL 4b: a member unarchiving should update 0 rows, got ' || v_rows;

  -- ...and an ordinary edit of an archived row is equally invisible.
  UPDATE studio_contacts SET notes = 'sneaky' WHERE id = '5c000000-0000-4000-8000-0000000000f1';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, 'FAIL 4c: a member editing an archived row should update 0 rows, got ' || v_rows;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE 'studio_contacts: case 4b/4c (member cannot unarchive or edit archived) passed.';
END
$$;

-- ─── (5) owner archives + unarchives ───────────────────────────────────────
DO $$
DECLARE
  v_rows     INTEGER;
  v_archived TIMESTAMPTZ;
BEGIN
  PERFORM pg_temp.assume_user('5c000000-0000-4000-8000-000000000001');

  UPDATE studio_contacts SET archived_at = NULL WHERE id = '5c000000-0000-4000-8000-0000000000f1';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1, 'FAIL 5a: an owner unarchiving should update 1 row, got ' || v_rows;

  UPDATE studio_contacts SET archived_at = now() WHERE id = '5c000000-0000-4000-8000-0000000000f1';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1, 'FAIL 5b: an owner archiving should update 1 row, got ' || v_rows;

  PERFORM pg_temp.reset_role();

  SELECT archived_at INTO v_archived FROM studio_contacts WHERE id = '5c000000-0000-4000-8000-0000000000f1';
  ASSERT v_archived IS NOT NULL, 'FAIL 5c: the card should read archived after the owner archived it';

  RAISE NOTICE 'studio_contacts: case 5 (owner archive/unarchive) passed.';
END
$$;

-- Put the card back live for the remaining cases.
UPDATE studio_contacts SET archived_at = NULL WHERE id = '5c000000-0000-4000-8000-0000000000f1';

-- ─── (6) DELETE as authenticated fails (no policy, no grant) ───────────────
DO $$
DECLARE
  v_raised BOOLEAN := false;
  v_count  INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('5c000000-0000-4000-8000-000000000001');
  BEGIN
    DELETE FROM studio_contacts WHERE id = '5c000000-0000-4000-8000-0000000000f1';
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_raised, 'FAIL 6: DELETE as authenticated must raise insufficient_privilege (no grant, no policy)';

  SELECT count(*) INTO v_count FROM studio_contacts WHERE id = '5c000000-0000-4000-8000-0000000000f1';
  ASSERT v_count = 1, 'FAIL 6b: the card must survive the refused DELETE, got ' || v_count;

  RAISE NOTICE 'studio_contacts: case 6 (no DELETE) passed.';
END
$$;

-- ─── (7) partial unique (organization_id, vendor_id) ───────────────────────
DO $$
DECLARE
  v_raised BOOLEAN := false;
  v_count  INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('5c000000-0000-4000-8000-000000000002');

  INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, company_name, vendor_id)
  VALUES ('5c000000-0000-4000-8000-0000000000f2', '5c000000-0000-4000-8000-0000000000a1',
          'company', 'vendor', 'SC Vendor One', '5c000000-0000-4000-8000-0000000000d1');

  BEGIN
    INSERT INTO studio_contacts (organization_id, entity_kind, contact_kind, company_name, vendor_id)
    VALUES ('5c000000-0000-4000-8000-0000000000a1', 'company', 'vendor', 'Dupe', '5c000000-0000-4000-8000-0000000000d1');
  EXCEPTION WHEN unique_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL 7a: a second card for the same (org, vendor) must violate the partial unique index';

  -- The predicate is partial: many vendor-less cards coexist freely.
  INSERT INTO studio_contacts (organization_id, entity_kind, contact_kind, company_name)
  VALUES
    ('5c000000-0000-4000-8000-0000000000a1', 'company', 'gc', 'Nameless Co A'),
    ('5c000000-0000-4000-8000-0000000000a1', 'company', 'gc', 'Nameless Co B');
  SELECT count(*) INTO v_count FROM studio_contacts
   WHERE organization_id = '5c000000-0000-4000-8000-0000000000a1' AND vendor_id IS NULL AND entity_kind = 'company';
  ASSERT v_count = 2, 'FAIL 7b: vendor-less company cards must not collide, got ' || v_count;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE 'studio_contacts: case 7 (partial unique) passed.';
END
$$;

-- ─── (9) entity-shape CHECKs ───────────────────────────────────────────────
DO $$
DECLARE
  v_raised BOOLEAN;
BEGIN
  PERFORM pg_temp.assume_user('5c000000-0000-4000-8000-000000000002');

  -- 9a: a person with no full_name.
  v_raised := false;
  BEGIN
    INSERT INTO studio_contacts (organization_id, entity_kind, contact_kind, company_name)
    VALUES ('5c000000-0000-4000-8000-0000000000a1', 'person', 'sub', 'Only A Company Name');
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL 9a: a person card without full_name must violate the entity-name CHECK';

  -- 9b: a company with no company_name.
  v_raised := false;
  BEGIN
    INSERT INTO studio_contacts (organization_id, entity_kind, contact_kind, full_name)
    VALUES ('5c000000-0000-4000-8000-0000000000a1', 'company', 'vendor', 'Only A Person Name');
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL 9b: a company card without company_name must violate the entity-name CHECK';

  -- 9c: a company hung off another company.
  v_raised := false;
  BEGIN
    INSERT INTO studio_contacts (organization_id, entity_kind, contact_kind, company_name, company_id)
    VALUES ('5c000000-0000-4000-8000-0000000000a1', 'company', 'vendor', 'Subsidiary', '5c000000-0000-4000-8000-0000000000f2');
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL 9c: a company card carrying company_id must violate the company-link CHECK';

  -- 9d: a PERSON hung off a company is the supported shape.
  INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, company_id)
  VALUES ('5c000000-0000-4000-8000-0000000000f3', '5c000000-0000-4000-8000-0000000000a1',
          'person', 'vendor', 'Vera Rep', '5c000000-0000-4000-8000-0000000000f2');

  -- 9e: a bogus entity_kind is refused.
  v_raised := false;
  BEGIN
    INSERT INTO studio_contacts (organization_id, entity_kind, contact_kind, full_name)
    VALUES ('5c000000-0000-4000-8000-0000000000a1', 'robot', 'sub', 'Bleep');
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL 9e: a bogus entity_kind must violate the CHECK';

  PERFORM pg_temp.reset_role();
  RAISE NOTICE 'studio_contacts: case 9 (entity CHECKs) passed.';
END
$$;

-- ─── (10) organizations.rolodex_seed_skipped_at ────────────────────────────
DO $$
DECLARE
  v_rows    INTEGER;
  v_skipped TIMESTAMPTZ;
BEGIN
  -- Owner writes it through the existing 00021 "Org admins can update
  -- organization" policy — no new policy or grant was added for this column.
  PERFORM pg_temp.assume_user('5c000000-0000-4000-8000-000000000001');
  UPDATE organizations SET rolodex_seed_skipped_at = now()
   WHERE id = '5c000000-0000-4000-8000-0000000000a1';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM pg_temp.reset_role();
  ASSERT v_rows = 1, 'FAIL 10a: an owner should stamp rolodex_seed_skipped_at (1 row), got ' || v_rows;

  SELECT rolodex_seed_skipped_at INTO v_skipped FROM organizations
   WHERE id = '5c000000-0000-4000-8000-0000000000a1';
  ASSERT v_skipped IS NOT NULL, 'FAIL 10b: the SKIP stamp should be persisted';

  -- A plain member is not an org admin → the 00021 UPDATE policy hides the row.
  UPDATE organizations SET rolodex_seed_skipped_at = NULL
   WHERE id = '5c000000-0000-4000-8000-0000000000a1';

  PERFORM pg_temp.assume_user('5c000000-0000-4000-8000-000000000002');
  UPDATE organizations SET rolodex_seed_skipped_at = now()
   WHERE id = '5c000000-0000-4000-8000-0000000000a1';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM pg_temp.reset_role();
  ASSERT v_rows = 0, 'FAIL 10c: a plain member should not stamp rolodex_seed_skipped_at, got ' || v_rows;

  RAISE NOTICE 'studio_contacts: case 10 (rolodex_seed_skipped_at) passed.';
  RAISE NOTICE 'All studio_contacts assertions passed.';
END
$$;

ROLLBACK;
