-- ═══════════════════════════════════════════════════════════════════════════
-- Studio buying Phase 1 margin visibility + owner-seat sync tests
-- (migration 00713; US-16 C-36, R1, R-PB6; SQ-402)
--
-- Studio A (owner O, admin AD, member M, guest G) and an outsider X. Cases:
--   A. margin_visibility defaults to 'everyone'; can_see_studio_margin is true
--      for O, AD and M, false for G and X.
--   B. A member cannot change it (RPC refused, direct UPDATE changes nothing);
--      guest and outsider refused; an invalid value refused; an admin can
--      switch to owners_admins, after which M stops seeing margin.
--   C. trade_discount_pct follows it: under owners_admins M reads NULL through
--      get_studio_vendor_accounts and cannot set it, but can still edit other
--      keys without wiping it; O reads and sets it.
--   D. user_roles.studio_owner follows owner-seat moves, at commit (deferred
--      constraint trigger; the test fires it with SET CONSTRAINTS): a new
--      owner seat is not a sync event, so a provisioned owner whose designer
--      role is removed holds no designer-domain role; nothing moves before
--      commit; transfer_studio_ownership moves it to the new owner and removes it
--      from the old one (who keeps a designer role); an owner who transfers
--      away and whose only designer-domain role is studio_owner keeps it (no
--      portal lockout); promotion grants it; deleting an owner seat removes
--      it; the internal helper is not executable by clients.
--   E. Grants: anon cannot execute the new RPCs.
--
-- How to run (after `supabase db reset`):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 -f supabase/tests/procurement/phase1_margin_visibility_test.sql
--
-- One transaction, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('69300000-0000-4000-8000-0000000000a1', 'p1mv-owner@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- O
  ('69300000-0000-4000-8000-0000000000a2', 'p1mv-admin@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- AD
  ('69300000-0000-4000-8000-0000000000a3', 'p1mv-member@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- M
  ('69300000-0000-4000-8000-0000000000a4', 'p1mv-guest@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- G
  ('69300000-0000-4000-8000-0000000000a5', 'p1mv-outsider@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- X
  ('69300000-0000-4000-8000-0000000000a6', 'p1mv-solo@test.invalid',     '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- Z
  ('69300000-0000-4000-8000-0000000000a7', 'p1mv-heir@test.invalid',     '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'); -- Z2

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('69300000-0000-4000-8000-0000000000a1', 'p1mv-owner@test.invalid',    'MV Owner',    NOW(), NOW()),
  ('69300000-0000-4000-8000-0000000000a2', 'p1mv-admin@test.invalid',    'MV Admin',    NOW(), NOW()),
  ('69300000-0000-4000-8000-0000000000a3', 'p1mv-member@test.invalid',   'MV Member',   NOW(), NOW()),
  ('69300000-0000-4000-8000-0000000000a4', 'p1mv-guest@test.invalid',    'MV Guest',    NOW(), NOW()),
  ('69300000-0000-4000-8000-0000000000a5', 'p1mv-outsider@test.invalid', 'MV Outsider', NOW(), NOW()),
  ('69300000-0000-4000-8000-0000000000a6', 'p1mv-solo@test.invalid',     'MV Solo',     NOW(), NOW()),
  ('69300000-0000-4000-8000-0000000000a7', 'p1mv-heir@test.invalid',     'MV Heir',     NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES
  ('69300000-0000-4000-8000-0000000000f1', 'design_studio', 'MV Studio A', 'p1-mv-studio-a-test'),
  ('69300000-0000-4000-8000-0000000000f2', 'design_studio', 'MV Studio Z', 'p1-mv-studio-z-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('69300000-0000-4000-8000-0000000000e1', '69300000-0000-4000-8000-0000000000a1', '69300000-0000-4000-8000-0000000000f1', 'owner',  'active', NOW()),
  ('69300000-0000-4000-8000-0000000000e2', '69300000-0000-4000-8000-0000000000a2', '69300000-0000-4000-8000-0000000000f1', 'admin',  'active', NOW()),
  ('69300000-0000-4000-8000-0000000000e3', '69300000-0000-4000-8000-0000000000a3', '69300000-0000-4000-8000-0000000000f1', 'member', 'active', NOW()),
  ('69300000-0000-4000-8000-0000000000e4', '69300000-0000-4000-8000-0000000000a4', '69300000-0000-4000-8000-0000000000f1', 'guest',  'active', NOW());

-- O also holds a plain designer role, so losing studio_owner keeps portal
-- access. Granted after the seats: a designer role on a seatless user makes
-- provision_studio_on_designer mint them a studio of their own.
INSERT INTO user_roles (user_id, role_id)
SELECT '69300000-0000-4000-8000-0000000000a1', id FROM roles WHERE name = 'studio_designer'
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO vendors (id, name)
VALUES ('69300000-0000-4000-8000-000000000011', 'MV Vendor');

-- Runs p_sql and returns the SQLSTATE + message it raised, or NULL.
CREATE OR REPLACE FUNCTION pg_temp.raised(p_sql text)
RETURNS text AS $$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ' ' || SQLERRM;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.raised(text) TO authenticated;

-- Whether p_user holds the named System A role.
CREATE OR REPLACE FUNCTION pg_temp.has_role(p_user uuid, p_role text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user AND r.name = p_role
  );
$$ LANGUAGE sql;

-- Runs can_see_studio_margin(A) as p_user.
CREATE OR REPLACE FUNCTION pg_temp.sees_margin(p_user uuid)
RETURNS boolean AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  RETURN public.can_see_studio_margin('69300000-0000-4000-8000-0000000000f1');
END;
$$ LANGUAGE plpgsql;

-- ─── A. default: everyone ───────────────────────────────────────────────────

DO $$
BEGIN
  ASSERT (SELECT margin_visibility FROM organizations WHERE id = '69300000-0000-4000-8000-0000000000f1') = 'everyone',
    'FAIL A1: a new studio should show margin to everyone';
  ASSERT pg_temp.sees_margin('69300000-0000-4000-8000-0000000000a1'), 'FAIL A2: owner should see margin';
  ASSERT pg_temp.sees_margin('69300000-0000-4000-8000-0000000000a2'), 'FAIL A2: admin should see margin';
  ASSERT pg_temp.sees_margin('69300000-0000-4000-8000-0000000000a3'), 'FAIL A2: member should see margin under everyone';
  ASSERT NOT pg_temp.sees_margin('69300000-0000-4000-8000-0000000000a4'), 'FAIL A3: guest should never see margin';
  ASSERT NOT pg_temp.sees_margin('69300000-0000-4000-8000-0000000000a5'), 'FAIL A3: outsider should never see margin';
  RAISE NOTICE 'Case A1–A3 (default everyone; guest and outsider never): ok';
END $$;

-- ─── B. who may change it ───────────────────────────────────────────────────

SET LOCAL "request.jwt.claims" TO '{"sub": "69300000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_err text;
BEGIN
  v_err := pg_temp.raised($q$
    SELECT public.set_studio_margin_visibility('69300000-0000-4000-8000-0000000000f1', 'owners_admins')
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL B1: member should not change margin visibility, got ' || COALESCE(v_err, 'no error');
  -- The table path: the 00021 update policy admits owner/admin only.
  UPDATE organizations SET margin_visibility = 'owners_admins' WHERE id = '69300000-0000-4000-8000-0000000000f1';
  ASSERT (SELECT margin_visibility FROM organizations WHERE id = '69300000-0000-4000-8000-0000000000f1') = 'everyone',
    'FAIL B2: a member''s direct UPDATE should change nothing';
  RAISE NOTICE 'Case B1–B2 (member cannot change it): ok';
END $$;

RESET ROLE;
SET LOCAL "request.jwt.claims" TO '{"sub": "69300000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_err text;
BEGIN
  v_err := pg_temp.raised($q$
    SELECT public.set_studio_margin_visibility('69300000-0000-4000-8000-0000000000f1', 'owners_admins')
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL B3: guest should not change margin visibility, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'Case B3 (guest refused): ok';
END $$;

RESET ROLE;
SET LOCAL "request.jwt.claims" TO '{"sub": "69300000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_err text;
BEGIN
  v_err := pg_temp.raised($q$
    SELECT public.set_studio_margin_visibility('69300000-0000-4000-8000-0000000000f1', 'owners_admins')
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL B4: outsider should not change margin visibility, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'Case B4 (outsider refused): ok';
END $$;

RESET ROLE;
SET LOCAL "request.jwt.claims" TO '{"sub": "69300000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_err text; v_now text;
BEGIN
  v_err := pg_temp.raised($q$
    SELECT public.set_studio_margin_visibility('69300000-0000-4000-8000-0000000000f1', 'nobody')
  $q$);
  ASSERT v_err LIKE '23514 %', 'FAIL B5: an invalid value should fail 23514, got ' || COALESCE(v_err, 'no error');
  v_now := public.set_studio_margin_visibility('69300000-0000-4000-8000-0000000000f1', 'owners_admins');
  ASSERT v_now = 'owners_admins', 'FAIL B6: admin should switch to owners_admins, got ' || COALESCE(v_now, 'NULL');
  RAISE NOTICE 'Case B5–B6 (admin changes it; invalid value refused): ok';
END $$;

RESET ROLE;

DO $$
BEGIN
  ASSERT (SELECT margin_visibility FROM organizations WHERE id = '69300000-0000-4000-8000-0000000000f1') = 'owners_admins',
    'FAIL B7: the setting should be stored';
  ASSERT pg_temp.sees_margin('69300000-0000-4000-8000-0000000000a1'), 'FAIL B7: owner should still see margin';
  ASSERT pg_temp.sees_margin('69300000-0000-4000-8000-0000000000a2'), 'FAIL B7: admin should still see margin';
  ASSERT NOT pg_temp.sees_margin('69300000-0000-4000-8000-0000000000a3'), 'FAIL B7: member should stop seeing margin';
  RAISE NOTICE 'Case B7 (owners_admins hides margin from members): ok';
END $$;

-- ─── C. trade discount follows the setting ──────────────────────────────────

SET LOCAL "request.jwt.claims" TO '{"sub": "69300000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_acct public.studio_vendor_accounts;
BEGIN
  v_acct := public.upsert_studio_vendor_account('69300000-0000-4000-8000-0000000000f1', '69300000-0000-4000-8000-000000000011',
    '{"tradeDiscountPct": 12.5, "netDays": 30}'::jsonb);
  ASSERT v_acct.trade_discount_pct = 12.5, 'FAIL C1: owner should set and read the trade discount';
  RAISE NOTICE 'Case C1 (owner sets trade discount): ok';
END $$;

RESET ROLE;
SET LOCAL "request.jwt.claims" TO '{"sub": "69300000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_err text; v_acct public.studio_vendor_accounts;
BEGIN
  SELECT * INTO v_acct FROM public.get_studio_vendor_accounts('69300000-0000-4000-8000-0000000000f1');
  ASSERT FOUND AND v_acct.net_days = 30, 'FAIL C2: member should still read the account';
  ASSERT v_acct.trade_discount_pct IS NULL, 'FAIL C2: member should read a NULL trade discount under owners_admins';

  v_err := pg_temp.raised($q$
    SELECT public.upsert_studio_vendor_account('69300000-0000-4000-8000-0000000000f1', '69300000-0000-4000-8000-000000000011', '{"tradeDiscountPct": 40}'::jsonb)
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL C3: member should not set the trade discount under owners_admins, got ' || COALESCE(v_err, 'no error');

  v_acct := public.upsert_studio_vendor_account('69300000-0000-4000-8000-0000000000f1', '69300000-0000-4000-8000-000000000011',
    '{"notes": "member note"}'::jsonb);
  ASSERT v_acct.notes = 'member note' AND v_acct.trade_discount_pct IS NULL,
    'FAIL C4: member edit should land and return the discount masked';
  RAISE NOTICE 'Case C2–C4 (member masked and refused, other edits allowed): ok';
END $$;

RESET ROLE;

DO $$
BEGIN
  ASSERT (SELECT trade_discount_pct FROM studio_vendor_accounts
          WHERE organization_id = '69300000-0000-4000-8000-0000000000f1') = 12.5,
    'FAIL C5: a member edit should not wipe the stored trade discount';
  RAISE NOTICE 'Case C5 (stored discount kept): ok';
END $$;

-- ─── D. studio_owner follows owner-seat moves ───────────────────────────────
-- The sync is a deferred constraint trigger: it runs at commit. This
-- transaction never commits, so it asks for the queued events with
-- SET CONSTRAINTS ... IMMEDIATE.

SET CONSTRAINTS sync_studio_owner_role_from_seat IMMEDIATE;

DO $$
DECLARE v_seats int; v_n int;
BEGIN
  -- O was seated as owner by a plain INSERT, which is not a sync event.
  ASSERT NOT pg_temp.has_role('69300000-0000-4000-8000-0000000000a1', 'studio_owner'), 'FAIL D1: a new owner seat should not put O on studio_owner';
  ASSERT NOT pg_temp.has_role('69300000-0000-4000-8000-0000000000a2', 'studio_owner'), 'FAIL D1: an admin seat should not put AD on studio_owner';

  -- A provisioned owner (provision_studio_on_designer) whose designer role is
  -- then removed holds no designer-domain role (public_sd_hardening race).
  UPDATE profiles SET is_designer = true WHERE id = '69300000-0000-4000-8000-0000000000a5';
  SELECT count(*) INTO v_seats FROM organization_members
  WHERE user_id = '69300000-0000-4000-8000-0000000000a5' AND role = 'owner' AND status = 'active';
  ASSERT v_seats = 1, 'FAIL D1: fixture expects X to be provisioned an owner seat, got ' || v_seats;
  INSERT INTO user_roles (user_id, role_id)
  SELECT '69300000-0000-4000-8000-0000000000a5', id FROM roles WHERE name = 'studio_designer'
  ON CONFLICT (user_id, role_id) DO NOTHING;
  DELETE FROM user_roles ur USING roles r
  WHERE r.id = ur.role_id AND ur.user_id = '69300000-0000-4000-8000-0000000000a5' AND r.name = 'studio_designer';
  SELECT count(*) INTO v_n FROM user_roles ur JOIN roles r ON r.id = ur.role_id
  WHERE ur.user_id = '69300000-0000-4000-8000-0000000000a5' AND r.domain = 'designer';
  ASSERT v_n = 0, 'FAIL D1: a provisioned owner whose designer role was removed should hold no designer-domain role, got ' || v_n;
  RAISE NOTICE 'Case D1 (a new owner seat is not a sync event): ok';
END $$;

-- O holds studio_owner the way the 00713 backfill leaves a current owner.
INSERT INTO user_roles (user_id, role_id)
SELECT '69300000-0000-4000-8000-0000000000a1', id FROM roles WHERE name = 'studio_owner'
ON CONFLICT (user_id, role_id) DO NOTHING;

SET CONSTRAINTS sync_studio_owner_role_from_seat DEFERRED;
SET LOCAL "request.jwt.claims" TO '{"sub": "69300000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
SET LOCAL ROLE authenticated;
SELECT public.transfer_studio_ownership('69300000-0000-4000-8000-0000000000f1', '69300000-0000-4000-8000-0000000000a2');
RESET ROLE;

DO $$
BEGIN
  ASSERT NOT pg_temp.has_role('69300000-0000-4000-8000-0000000000a2', 'studio_owner'), 'FAIL D0: the sync should wait for commit';
  ASSERT pg_temp.has_role('69300000-0000-4000-8000-0000000000a1', 'studio_owner'), 'FAIL D0: the old owner keeps studio_owner until commit';
  RAISE NOTICE 'Case D0 (sync deferred to commit): ok';
END $$;

SET CONSTRAINTS sync_studio_owner_role_from_seat IMMEDIATE;

DO $$
BEGIN
  ASSERT pg_temp.has_role('69300000-0000-4000-8000-0000000000a2', 'studio_owner'), 'FAIL D2: the new owner should gain studio_owner';
  ASSERT NOT pg_temp.has_role('69300000-0000-4000-8000-0000000000a1', 'studio_owner'), 'FAIL D3: the old owner should lose studio_owner';
  ASSERT pg_temp.has_role('69300000-0000-4000-8000-0000000000a1', 'studio_designer'), 'FAIL D3: the old owner should keep their designer role';
  RAISE NOTICE 'Case D2–D3 (transfer moves studio_owner): ok';
END $$;

-- Studio Z: owner Z, whose only designer-domain role is studio_owner (as the
-- backfill leaves a current owner), and member Z2.
INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('69300000-0000-4000-8000-0000000000e6', '69300000-0000-4000-8000-0000000000a6', '69300000-0000-4000-8000-0000000000f2', 'owner',  'active', NOW()),
  ('69300000-0000-4000-8000-0000000000e7', '69300000-0000-4000-8000-0000000000a7', '69300000-0000-4000-8000-0000000000f2', 'member', 'active', NOW());
INSERT INTO user_roles (user_id, role_id)
SELECT '69300000-0000-4000-8000-0000000000a6', id FROM roles WHERE name = 'studio_owner'
ON CONFLICT (user_id, role_id) DO NOTHING;

DO $$
DECLARE v_n int;
BEGIN
  ASSERT pg_temp.has_role('69300000-0000-4000-8000-0000000000a6', 'studio_owner'), 'FAIL D4: fixture expects Z on studio_owner';
  SELECT count(*) INTO v_n FROM user_roles ur JOIN roles r ON r.id = ur.role_id
  WHERE ur.user_id = '69300000-0000-4000-8000-0000000000a6' AND r.domain IN ('designer', 'admin') AND r.name <> 'studio_owner';
  ASSERT v_n = 0, 'FAIL D4: fixture expects Z to hold no other designer- or admin-domain role, got ' || v_n;
END $$;

SET LOCAL "request.jwt.claims" TO '{"sub": "69300000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
SET LOCAL ROLE authenticated;
SELECT public.transfer_studio_ownership('69300000-0000-4000-8000-0000000000f2', '69300000-0000-4000-8000-0000000000a7');
RESET ROLE;

DO $$
BEGIN
  ASSERT pg_temp.has_role('69300000-0000-4000-8000-0000000000a7', 'studio_owner'), 'FAIL D5: Z2 should gain studio_owner';
  ASSERT pg_temp.has_role('69300000-0000-4000-8000-0000000000a6', 'studio_owner'),
    'FAIL D5: a demoted owner whose only designer role is studio_owner should keep it (portal access)';

  -- Promotion by a plain role change, by the current owner AD, grants it.
  PERFORM set_config('request.jwt.claims', '{"sub": "69300000-0000-4000-8000-0000000000a2", "role": "authenticated"}', true);
  UPDATE organization_members SET role = 'owner' WHERE id = '69300000-0000-4000-8000-0000000000e3';
  ASSERT pg_temp.has_role('69300000-0000-4000-8000-0000000000a3', 'studio_owner'), 'FAIL D6: promotion to owner should grant studio_owner';

  -- AD (with a designer role to fall back on) leaves: deleting the owner seat removes it.
  INSERT INTO user_roles (user_id, role_id)
  SELECT '69300000-0000-4000-8000-0000000000a2', id FROM roles WHERE name = 'studio_designer'
  ON CONFLICT (user_id, role_id) DO NOTHING;
  DELETE FROM organization_members WHERE id = '69300000-0000-4000-8000-0000000000e2';
  ASSERT NOT pg_temp.has_role('69300000-0000-4000-8000-0000000000a2', 'studio_owner'), 'FAIL D7: deleting an owner seat should remove studio_owner';
  ASSERT pg_temp.has_role('69300000-0000-4000-8000-0000000000a3', 'studio_owner'), 'FAIL D7: the remaining owner keeps studio_owner';

  ASSERT NOT has_function_privilege('authenticated', 'public._sync_studio_owner_role(uuid)', 'EXECUTE'),
    'FAIL D8: clients should not execute _sync_studio_owner_role';
  ASSERT NOT has_function_privilege('anon', 'public._sync_studio_owner_role(uuid)', 'EXECUTE'),
    'FAIL D8: anon should not execute _sync_studio_owner_role';
  RAISE NOTICE 'Case D4–D8 (no lockout on demotion; delete and promotion sync; helper internal): ok';
END $$;

-- ─── E. grants ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.can_see_studio_margin(uuid)', 'EXECUTE'), 'FAIL E1: anon should not execute can_see_studio_margin';
  ASSERT NOT has_function_privilege('anon', 'public.set_studio_margin_visibility(uuid, text)', 'EXECUTE'), 'FAIL E1: anon should not execute set_studio_margin_visibility';
  ASSERT has_function_privilege('authenticated', 'public.can_see_studio_margin(uuid)', 'EXECUTE'), 'FAIL E2: authenticated should execute can_see_studio_margin';
  ASSERT has_function_privilege('authenticated', 'public.set_studio_margin_visibility(uuid, text)', 'EXECUTE'), 'FAIL E2: authenticated should execute set_studio_margin_visibility';
  RAISE NOTICE 'Case E1–E2 (grants): ok';
END $$;

ROLLBACK;
