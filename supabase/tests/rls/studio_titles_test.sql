-- ═══════════════════════════════════════════════════════════════════════════
-- Studio staff titles tests (migration 00416)
--
-- Covers:
--   (a) set_my_member_title updates only the caller's own active membership
--       row in the named org.
--   (b) a second org's membership row for the same user is untouched.
--   (c) a >120-char title raises job_title_too_long.
--   (d) REGRESSION: a plain member's direct UPDATE
--       organization_members SET role='admin' on their OWN row updates 0 rows
--       (no own-row UPDATE policy exists — see 00416's header comment).
--   (e) an admin CAN update a co-member's staff_role via a direct UPDATE
--       (rides the 00068 admin UPDATE policy).
--   (f) the 00319 last-owner guard still blocks demoting the sole owner.
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/rls/studio_titles_test.sql
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('5e570000-0000-4000-8000-000000000001', 'st-owner@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('5e570000-0000-4000-8000-000000000002', 'st-member@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('5e570000-0000-4000-8000-000000000003', 'st-admin@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('5e570000-0000-4000-8000-000000000001', 'st-owner@test.invalid',  'ST Owner',  NOW(), NOW()),
  ('5e570000-0000-4000-8000-000000000002', 'st-member@test.invalid', 'ST Member', NOW(), NOW()),
  ('5e570000-0000-4000-8000-000000000003', 'st-admin@test.invalid',  'ST Admin',  NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Org A: the primary studio (owner + member + admin). Org B: a second studio
-- the member also belongs to, used to prove set_my_member_title scopes by org.
INSERT INTO organizations (id, type, name, slug)
VALUES
  ('5e570000-0000-4000-8000-0000000000a1', 'design_studio', 'ST Studio A', 'st-studio-a-test'),
  ('5e570000-0000-4000-8000-0000000000a2', 'design_studio', 'ST Studio B', 'st-studio-b-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('5e570000-0000-4000-8000-0000000000c1', '5e570000-0000-4000-8000-000000000001', '5e570000-0000-4000-8000-0000000000a1', 'owner',  'active', NOW()),
  ('5e570000-0000-4000-8000-0000000000c2', '5e570000-0000-4000-8000-000000000002', '5e570000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('5e570000-0000-4000-8000-0000000000c3', '5e570000-0000-4000-8000-000000000003', '5e570000-0000-4000-8000-0000000000a1', 'admin',  'active', NOW()),
  ('5e570000-0000-4000-8000-0000000000c4', '5e570000-0000-4000-8000-000000000002', '5e570000-0000-4000-8000-0000000000a2', 'member', 'active', NOW());

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

-- ─── (a) + (b): set_my_member_title scopes to the caller's row in that org ──
DO $$
DECLARE
  v_title_a TEXT;
  v_title_b TEXT;
BEGIN
  PERFORM pg_temp.assume_user('5e570000-0000-4000-8000-000000000002');
  PERFORM public.set_my_member_title('5e570000-0000-4000-8000-0000000000a1', 'Lead Designer');
  PERFORM pg_temp.reset_role();

  SELECT job_title INTO v_title_a FROM organization_members WHERE id = '5e570000-0000-4000-8000-0000000000c2';
  ASSERT v_title_a = 'Lead Designer', 'FAIL a: own-org row should carry the new title, got ' || COALESCE(v_title_a, 'NULL');

  SELECT job_title INTO v_title_b FROM organization_members WHERE id = '5e570000-0000-4000-8000-0000000000c4';
  ASSERT v_title_b IS NULL, 'FAIL b: second org row should be untouched, got ' || COALESCE(v_title_b, 'NULL');

  RAISE NOTICE 'studio_titles: cases (a),(b) passed.';
END
$$;

-- ─── (c): >120-char title raises job_title_too_long ─────────────────────────
DO $$
DECLARE
  v_raised BOOLEAN := false;
BEGIN
  PERFORM pg_temp.assume_user('5e570000-0000-4000-8000-000000000002');
  BEGIN
    PERFORM public.set_my_member_title(
      '5e570000-0000-4000-8000-0000000000a1',
      repeat('x', 121)
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'job_title_too_long' THEN
      v_raised := true;
    ELSE
      RAISE;
    END IF;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_raised, 'FAIL c: a >120-char title should raise job_title_too_long';

  RAISE NOTICE 'studio_titles: case (c) passed.';
END
$$;

-- ─── (d) REGRESSION: plain member cannot self-promote via direct UPDATE ─────
DO $$
DECLARE
  v_rows INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('5e570000-0000-4000-8000-000000000002');
  UPDATE organization_members
  SET role = 'admin'
  WHERE id = '5e570000-0000-4000-8000-0000000000c2';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM pg_temp.reset_role();

  ASSERT v_rows = 0, 'FAIL d: a member''s direct self UPDATE of role should update 0 rows, got ' || v_rows;

  -- Confirm the row genuinely did not change (belt-and-suspenders on the count).
  PERFORM 1 FROM organization_members
   WHERE id = '5e570000-0000-4000-8000-0000000000c2' AND role = 'member';
  ASSERT FOUND, 'FAIL d2: member row should still read role=member after the blocked self-UPDATE';

  RAISE NOTICE 'studio_titles: case (d) passed.';
END
$$;

-- ─── (e): admin CAN update a co-member's staff_role directly ────────────────
DO $$
DECLARE
  v_staff_role TEXT;
  v_rows INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('5e570000-0000-4000-8000-000000000003');
  UPDATE organization_members
  SET staff_role = 'bookkeeper'
  WHERE id = '5e570000-0000-4000-8000-0000000000c2';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM pg_temp.reset_role();

  ASSERT v_rows = 1, 'FAIL e: admin direct UPDATE of a co-member staff_role should update 1 row, got ' || v_rows;

  SELECT staff_role INTO v_staff_role FROM organization_members WHERE id = '5e570000-0000-4000-8000-0000000000c2';
  ASSERT v_staff_role = 'bookkeeper', 'FAIL e2: co-member staff_role should be bookkeeper, got ' || COALESCE(v_staff_role, 'NULL');

  RAISE NOTICE 'studio_titles: case (e) passed.';
END
$$;

-- ─── (f): 00319 guard still blocks demoting the sole active owner ──────────
DO $$
DECLARE
  v_raised BOOLEAN := false;
  v_role TEXT;
BEGIN
  PERFORM pg_temp.assume_user('5e570000-0000-4000-8000-000000000001');
  BEGIN
    UPDATE organization_members
    SET role = 'member'
    WHERE id = '5e570000-0000-4000-8000-0000000000c1';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'last_owner_protected' THEN
      v_raised := true;
    ELSE
      RAISE;
    END IF;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_raised, 'FAIL f: demoting the sole active owner should raise last_owner_protected';

  SELECT role INTO v_role FROM organization_members WHERE id = '5e570000-0000-4000-8000-0000000000c1';
  ASSERT v_role = 'owner', 'FAIL f2: owner row should still read role=owner, got ' || v_role;

  RAISE NOTICE 'studio_titles: case (f) passed.';
  RAISE NOTICE 'All studio_titles assertions passed.';
END
$$;

ROLLBACK;
