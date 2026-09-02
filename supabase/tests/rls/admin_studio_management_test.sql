-- ═══════════════════════════════════════════════════════════════════════════
-- Admin studio management tests (migration 00556)
--
-- Covers:
--   (a1) neither `authenticated` nor `anon` holds EXECUTE on ANY of the six
--        admin_* RPCs (service-role-only GRANTs).
--   (a2) neither role holds SELECT on the admin_studio_overview read model.
--   (a3) even service_role holds no EXECUTE on the definer-internal helpers
--        _assert_admin_actor / _lock_studio.
--   (b) service_role + a p_actor holding no admin-domain role →
--       actor_not_platform_admin.
--   (c) admin_add_studio_member into a suspended studio →
--       organization_not_active.
--   (d) admin_remove_studio_member on the sole active owner →
--       owner_remove_requires_transfer.
--   (e) admin_transfer_studio_ownership: the old owner lands on 'admin' and
--       exactly one active owner remains.
--   (f) suspending the studio makes is_studio_comember(other) false for a
--       co-member while the self-branch still answers true; reactivating
--       restores co-membership.
--   (g) an org admin's direct UPDATE organizations SET status = 'active'
--       raises organization_admin_column_protected (the self-reactivation hole
--       left by 00021's USING-only policy).
--   (h) admin_create_studio_for_user flips is_designer and still leaves the
--       user with exactly ONE organization (00295's provision trigger must not
--       mint a second, spurious studio).
--   (i) admin_transfer_studio_ownership REPAIRS a two-active-owner org when the
--       target is already one of those owners (no already_owner).
--   (j) admin_set_studio_status with a NULL p_status raises
--       invalid_status_transition.
--
-- How to run:
--   scripts/run-sql-tests.sh -f admin_studio_management -v
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
-- 01 platform admin (support_agent → roles.domain = 'admin')
-- 02 studio owner        03 co-member        04 transfer target
-- 05 non-admin actor     06 studio-less user (case h)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('a5560000-0000-4000-8000-000000000001', 'as-admin@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a5560000-0000-4000-8000-000000000002', 'as-owner@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a5560000-0000-4000-8000-000000000003', 'as-member@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a5560000-0000-4000-8000-000000000004', 'as-target@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a5560000-0000-4000-8000-000000000005', 'as-nonadmin@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a5560000-0000-4000-8000-000000000006', 'as-fresh@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('a5560000-0000-4000-8000-000000000001', 'as-admin@test.invalid',    'AS Admin',    NOW(), NOW()),
  ('a5560000-0000-4000-8000-000000000002', 'as-owner@test.invalid',    'AS Owner',    NOW(), NOW()),
  ('a5560000-0000-4000-8000-000000000003', 'as-member@test.invalid',   'AS Member',   NOW(), NOW()),
  ('a5560000-0000-4000-8000-000000000004', 'as-target@test.invalid',   'AS Target',   NOW(), NOW()),
  ('a5560000-0000-4000-8000-000000000005', 'as-nonadmin@test.invalid', 'AS NonAdmin', NOW(), NOW()),
  ('a5560000-0000-4000-8000-000000000006', 'as-fresh@test.invalid',    'AS Fresh',    NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Only user 01 is a platform admin.
INSERT INTO user_roles (user_id, role_id)
SELECT 'a5560000-0000-4000-8000-000000000001', id FROM roles WHERE name = 'support_agent';

INSERT INTO organizations (id, type, name, slug)
VALUES ('a5560000-0000-4000-8000-0000000000a1', 'design_studio', 'AS Studio', 'as-studio-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('a5560000-0000-4000-8000-0000000000c1', 'a5560000-0000-4000-8000-000000000002', 'a5560000-0000-4000-8000-0000000000a1', 'owner',  'active', NOW()),
  ('a5560000-0000-4000-8000-0000000000c2', 'a5560000-0000-4000-8000-000000000003', 'a5560000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('a5560000-0000-4000-8000-0000000000c3', 'a5560000-0000-4000-8000-000000000004', 'a5560000-0000-4000-8000-0000000000a1', 'member', 'active', NOW());

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
  PERFORM set_config('role', 'none', true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- The trusted server-side path: PostgREST's service_role connection.
CREATE OR REPLACE FUNCTION pg_temp.assume_service_role()
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'service_role', true);
  EXECUTE 'SET LOCAL ROLE service_role';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_service_role() TO PUBLIC;

-- ─── (a): the admin surface is service_role-only, end to end ──────────────
DO $$
DECLARE
  v_sig  TEXT;
  v_role TEXT;
BEGIN
  -- (a1) six admin_* RPCs × {authenticated, anon}: no EXECUTE anywhere.
  FOREACH v_sig IN ARRAY ARRAY[
    'public.admin_create_studio_for_user(uuid, uuid, text, subscription_tier, boolean)',
    'public.admin_add_studio_member(uuid, uuid, uuid, member_role, text, text, text)',
    'public.admin_set_studio_member_role(uuid, uuid, uuid, member_role)',
    'public.admin_remove_studio_member(uuid, uuid, uuid, boolean)',
    'public.admin_transfer_studio_ownership(uuid, uuid, uuid, member_role)',
    'public.admin_set_studio_status(uuid, uuid, organization_status)'
  ] LOOP
    FOREACH v_role IN ARRAY ARRAY['authenticated', 'anon'] LOOP
      ASSERT has_function_privilege(v_role, v_sig, 'EXECUTE') = false,
        'FAIL a1: ' || v_role || ' should hold no EXECUTE on ' || v_sig;
    END LOOP;
  END LOOP;

  -- (a2) the definer-rights read model is service_role-only.
  ASSERT has_table_privilege('anon', 'public.admin_studio_overview', 'SELECT') = false,
    'FAIL a2: anon should hold no SELECT on admin_studio_overview';
  ASSERT has_table_privilege('authenticated', 'public.admin_studio_overview', 'SELECT') = false,
    'FAIL a2b: authenticated should hold no SELECT on admin_studio_overview';

  -- (a3) the definer-internal helpers are not callable even by service_role —
  -- the admin_* RPCs reach them through their own definer rights.
  ASSERT has_function_privilege('service_role', 'public._assert_admin_actor(uuid)', 'EXECUTE') = false,
    'FAIL a3: service_role should hold no EXECUTE on _assert_admin_actor';
  ASSERT has_function_privilege('service_role', 'public._lock_studio(uuid)', 'EXECUTE') = false,
    'FAIL a3b: service_role should hold no EXECUTE on _lock_studio';

  RAISE NOTICE 'admin_studio_management: case (a) passed.';
END
$$;

-- ─── (b): service_role but a non-admin p_actor ────────────────────────────
DO $$
DECLARE
  v_msg TEXT;
BEGIN
  PERFORM pg_temp.assume_service_role();
  BEGIN
    PERFORM public.admin_set_studio_status(
      'a5560000-0000-4000-8000-000000000005',
      'a5560000-0000-4000-8000-0000000000a1',
      'suspended'
    );
    v_msg := 'no_error';
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_msg = 'actor_not_platform_admin',
    'FAIL b: a non-admin p_actor should raise actor_not_platform_admin, got ' || v_msg;
  RAISE NOTICE 'admin_studio_management: case (b) passed.';
END
$$;

-- ─── (d): the sole active owner cannot be removed ─────────────────────────
DO $$
DECLARE
  v_msg TEXT;
BEGIN
  PERFORM pg_temp.assume_service_role();
  BEGIN
    PERFORM public.admin_remove_studio_member(
      'a5560000-0000-4000-8000-000000000001',
      'a5560000-0000-4000-8000-0000000000a1',
      'a5560000-0000-4000-8000-000000000002'
    );
    v_msg := 'no_error';
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_msg = 'owner_remove_requires_transfer',
    'FAIL d: removing the sole active owner should raise owner_remove_requires_transfer, got ' || v_msg;
  RAISE NOTICE 'admin_studio_management: case (d) passed.';
END
$$;

-- ─── (e): ownership transfer demotes the old owner, leaves exactly one ────
DO $$
DECLARE
  v_old_role TEXT;
  v_new_role TEXT;
  v_owners   INTEGER;
BEGIN
  PERFORM pg_temp.assume_service_role();
  PERFORM public.admin_transfer_studio_ownership(
    'a5560000-0000-4000-8000-000000000001',
    'a5560000-0000-4000-8000-0000000000a1',
    'a5560000-0000-4000-8000-000000000004'
  );
  PERFORM pg_temp.reset_role();

  SELECT role::text INTO v_old_role FROM organization_members WHERE id = 'a5560000-0000-4000-8000-0000000000c1';
  SELECT role::text INTO v_new_role FROM organization_members WHERE id = 'a5560000-0000-4000-8000-0000000000c3';
  SELECT count(*) INTO v_owners
  FROM organization_members
  WHERE organization_id = 'a5560000-0000-4000-8000-0000000000a1'
    AND role = 'owner' AND status = 'active';

  ASSERT v_old_role = 'admin', 'FAIL e: the demoted owner should be admin, got ' || v_old_role;
  ASSERT v_new_role = 'owner', 'FAIL e2: the transfer target should be owner, got ' || v_new_role;
  ASSERT v_owners = 1, 'FAIL e3: exactly one active owner should remain, got ' || v_owners;
  RAISE NOTICE 'admin_studio_management: case (e) passed.';
END
$$;

-- ─── (f): suspension withdraws co-membership; the self-branch survives ────
DO $$
DECLARE
  v_before_comember BOOLEAN;
  v_after_comember  BOOLEAN;
  v_after_self      BOOLEAN;
  v_after_reactive  BOOLEAN;
BEGIN
  PERFORM pg_temp.assume_user('a5560000-0000-4000-8000-000000000003');
  v_before_comember := public.is_studio_comember('a5560000-0000-4000-8000-000000000002');
  PERFORM pg_temp.reset_role();
  ASSERT v_before_comember, 'FAIL f0: an active studio should confer co-membership';

  PERFORM pg_temp.assume_service_role();
  PERFORM public.admin_set_studio_status(
    'a5560000-0000-4000-8000-000000000001',
    'a5560000-0000-4000-8000-0000000000a1',
    'suspended'
  );
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('a5560000-0000-4000-8000-000000000003');
  v_after_comember := public.is_studio_comember('a5560000-0000-4000-8000-000000000002');
  v_after_self     := public.is_studio_comember('a5560000-0000-4000-8000-000000000003');
  PERFORM pg_temp.reset_role();

  ASSERT NOT v_after_comember,
    'FAIL f: a suspended studio should confer no co-membership';
  ASSERT v_after_self,
    'FAIL f2: the self-branch must still answer true inside a suspended studio';

  PERFORM pg_temp.assume_service_role();
  PERFORM public.admin_set_studio_status(
    'a5560000-0000-4000-8000-000000000001',
    'a5560000-0000-4000-8000-0000000000a1',
    'active'
  );
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('a5560000-0000-4000-8000-000000000003');
  v_after_reactive := public.is_studio_comember('a5560000-0000-4000-8000-000000000002');
  PERFORM pg_temp.reset_role();

  ASSERT v_after_reactive, 'FAIL f3: reactivation should restore co-membership';
  RAISE NOTICE 'admin_studio_management: case (f) passed.';
END
$$;

-- ─── (c): no roster additions into a suspended studio ─────────────────────
DO $$
DECLARE
  v_msg TEXT;
BEGIN
  PERFORM pg_temp.assume_service_role();
  PERFORM public.admin_set_studio_status(
    'a5560000-0000-4000-8000-000000000001',
    'a5560000-0000-4000-8000-0000000000a1',
    'suspended'
  );
  BEGIN
    PERFORM public.admin_add_studio_member(
      'a5560000-0000-4000-8000-000000000001',
      'a5560000-0000-4000-8000-0000000000a1',
      'a5560000-0000-4000-8000-000000000006'
    );
    v_msg := 'no_error';
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_msg = 'organization_not_active',
    'FAIL c: adding a member to a suspended studio should raise organization_not_active, got ' || v_msg;
  RAISE NOTICE 'admin_studio_management: case (c) passed.';
END
$$;

-- ─── (g): a studio admin cannot self-reactivate ───────────────────────────
DO $$
DECLARE
  v_msg    TEXT;
  v_status TEXT;
BEGIN
  -- User 02 is now an 'admin' of the (suspended) studio after case (e).
  PERFORM pg_temp.assume_user('a5560000-0000-4000-8000-000000000002');
  BEGIN
    UPDATE organizations
    SET status = 'active'
    WHERE id = 'a5560000-0000-4000-8000-0000000000a1';
    v_msg := 'no_error';
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_msg = 'organization_admin_column_protected',
    'FAIL g: a studio admin self-reactivating should raise organization_admin_column_protected, got ' || v_msg;

  SELECT status::text INTO v_status FROM organizations WHERE id = 'a5560000-0000-4000-8000-0000000000a1';
  ASSERT v_status = 'suspended', 'FAIL g2: the studio should still read suspended, got ' || v_status;
  RAISE NOTICE 'admin_studio_management: case (g) passed.';
END
$$;

-- ─── (h): create-for-user leaves exactly one studio, is_designer true ─────
DO $$
DECLARE
  v_org_id      UUID;
  v_org_count   INTEGER;
  v_is_designer BOOLEAN;
  v_owner_rows  INTEGER;
BEGIN
  PERFORM pg_temp.assume_service_role();
  SELECT id INTO v_org_id FROM public.admin_create_studio_for_user(
    'a5560000-0000-4000-8000-000000000001',
    'a5560000-0000-4000-8000-000000000006',
    'AS Fresh Studio'
  );
  PERFORM pg_temp.reset_role();

  SELECT count(*) INTO v_org_count
  FROM organization_members
  WHERE user_id = 'a5560000-0000-4000-8000-000000000006';
  SELECT count(*) INTO v_owner_rows
  FROM organization_members
  WHERE user_id = 'a5560000-0000-4000-8000-000000000006'
    AND organization_id = v_org_id
    AND role = 'owner' AND status = 'active';
  SELECT is_designer INTO v_is_designer
  FROM profiles WHERE id = 'a5560000-0000-4000-8000-000000000006';

  ASSERT v_org_count = 1,
    'FAIL h: the user should belong to exactly one organization, got ' || v_org_count;
  ASSERT v_owner_rows = 1, 'FAIL h2: the user should own the new studio, got ' || v_owner_rows;
  ASSERT v_is_designer, 'FAIL h3: is_designer should be true after create-for-user';

  RAISE NOTICE 'admin_studio_management: case (h) passed.';
END
$$;

-- ─── (i): a two-active-owner org is REPAIRED, not rejected ────────────────
-- The guard trigger bypasses service_role, so seeding the second owner row
-- directly is exactly how the anomaly reaches prod in the first place.
DO $$
DECLARE
  v_owners     INTEGER;
  v_kept_role  TEXT;
  v_other_role TEXT;
BEGIN
  PERFORM pg_temp.assume_service_role();
  -- After case (e), 04 owns the studio and 02 sits at 'admin'. Put 02 back to
  -- 'owner' so the org carries two active owners.
  UPDATE organization_members
  SET role = 'owner'
  WHERE id = 'a5560000-0000-4000-8000-0000000000c1';

  SELECT count(*) INTO v_owners
  FROM organization_members
  WHERE organization_id = 'a5560000-0000-4000-8000-0000000000a1'
    AND role = 'owner' AND status = 'active';
  ASSERT v_owners = 2, 'FAIL i0: the fixture should carry two active owners, got ' || v_owners;

  -- Target 04 — ALREADY an owner. Must repair rather than raise already_owner.
  PERFORM public.admin_transfer_studio_ownership(
    'a5560000-0000-4000-8000-000000000001',
    'a5560000-0000-4000-8000-0000000000a1',
    'a5560000-0000-4000-8000-000000000004'
  );
  PERFORM pg_temp.reset_role();

  SELECT count(*) INTO v_owners
  FROM organization_members
  WHERE organization_id = 'a5560000-0000-4000-8000-0000000000a1'
    AND role = 'owner' AND status = 'active';
  SELECT role::text INTO v_kept_role  FROM organization_members WHERE id = 'a5560000-0000-4000-8000-0000000000c3';
  SELECT role::text INTO v_other_role FROM organization_members WHERE id = 'a5560000-0000-4000-8000-0000000000c1';

  ASSERT v_owners = 1, 'FAIL i: exactly one active owner should remain, got ' || v_owners;
  ASSERT v_kept_role = 'owner', 'FAIL i2: the target should still be owner, got ' || v_kept_role;
  ASSERT v_other_role = 'admin', 'FAIL i3: the co-owner should be demoted to admin, got ' || v_other_role;
  RAISE NOTICE 'admin_studio_management: case (i) passed.';
END
$$;

-- ─── (j): a NULL status is rejected, not written ──────────────────────────
DO $$
DECLARE
  v_msg TEXT;
BEGIN
  PERFORM pg_temp.assume_service_role();
  BEGIN
    PERFORM public.admin_set_studio_status(
      'a5560000-0000-4000-8000-000000000001',
      'a5560000-0000-4000-8000-0000000000a1',
      NULL
    );
    v_msg := 'no_error';
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_msg = 'invalid_status_transition',
    'FAIL j: a NULL p_status should raise invalid_status_transition, got ' || v_msg;
  RAISE NOTICE 'admin_studio_management: case (j) passed.';
  RAISE NOTICE 'All admin_studio_management assertions passed.';
END
$$;

ROLLBACK;
