-- ═══════════════════════════════════════════════════════════════════════════
-- Internal and admin time — the project-less hour (migrations 00610-00613, HT-15)
--
-- Asserted PER ROLE, every write through RLS as the named actor (plan-v2 §5 and
-- §12 risk 2: "all nine policies resolve through project_id; a NULL makes every
-- one false", so the POSITIVE, the NEGATIVE and the INVISIBILITY cases are all
-- asserted here, before any portal is touched):
--
--   (a) the AUTHOR logs an internal hour with no project and reads it back, and
--       00613's short-circuit owns every derived column: nonbillable, no rate,
--       amount 0, rate_source 'none', rate_role NULL, no authority. Her own
--       caller-supplied hourly_rate_cents and rate_role are DISCARDED, not
--       refused (HT-1 — the same shape 00600/00601 chose for the project case).
--   (b) a member of ANOTHER studio reads NOTHING of it, and neither does that
--       studio's owner. 00612's policies key on the row's own studio_id.
--   (c) its own studio's OWNER and ADMIN read it (internal_time_owner_admin_read);
--       a plain COLLEAGUE in the same studio does NOT (HT-10's narrowing holds
--       for internal time too — there is no studio-wide read of it), and neither
--       does a GUEST co-member.
--   (d) studio_id CANNOT be aimed at another organization — 00611's guard, on the
--       INSERT and on the UPDATE repoint, replicating 00317:31-47. And a GUEST of
--       the row's own studio is refused by RLS rather than by the guard, which is
--       the division of labour 00611's banner describes.
--   (e) a BILLABLE project-less hour is refused by 00610's CHECK — asserted
--       without RLS in the way (as the migration-context session owner), because
--       "RLS can be bypassed by service_role, a CHECK cannot" is the reason the
--       constraint exists.
--   (f) the internal hour is ABSENT from every project-scoped read:
--       project_unbilled_time, project_hours_total, margin_items' time branch,
--       and studio_hours_rollup's project scope. It IS present in the studio
--       scope, in internal_minutes and in its own 'internal' project bucket
--       (plan-v2 §5's Done-when), and in time_entry_ledger carrying its own
--       studio_id (00613's ledger CASE — without it the rollup's
--       `ledger.studio_id = p_studio_id` filter could never see it, which is the
--       edit 00607's banner hands to W4 by name).
--   (g) it CANNOT be invoiced: the aad_ authority guard refuses the attach
--       because a nonbillable hour is not authorized, and claim_time_entries
--       returns no id for it.
--   (h) 00597's auto-roster seats NOBODY for an internal hour, and the hour does
--       not appear on the project roster.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rls/internal_time_test.sql
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c6130000-0000-4000-8000-000000000001', 'internal-owner@test.invalid',     '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6130000-0000-4000-8000-000000000002', 'internal-admin@test.invalid',     '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6130000-0000-4000-8000-000000000003', 'internal-author@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6130000-0000-4000-8000-000000000004', 'internal-guest@test.invalid',     '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6130000-0000-4000-8000-000000000005', 'internal-colleague@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6130000-0000-4000-8000-000000000006', 'internal-outside@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6130000-0000-4000-8000-000000000007', 'internal-outowner@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6130000-0000-4000-8000-000000000008', 'internal-client@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('c6130000-0000-4000-8000-000000000001', 'internal-owner@test.invalid',     'IT Owner',     NOW(), NOW()),
  ('c6130000-0000-4000-8000-000000000002', 'internal-admin@test.invalid',     'IT Admin',     NOW(), NOW()),
  ('c6130000-0000-4000-8000-000000000003', 'internal-author@test.invalid',    'IT Author',    NOW(), NOW()),
  ('c6130000-0000-4000-8000-000000000004', 'internal-guest@test.invalid',     'IT Guest',     NOW(), NOW()),
  ('c6130000-0000-4000-8000-000000000005', 'internal-colleague@test.invalid', 'IT Colleague', NOW(), NOW()),
  ('c6130000-0000-4000-8000-000000000006', 'internal-outside@test.invalid',   'IT Outside',   NOW(), NOW()),
  ('c6130000-0000-4000-8000-000000000007', 'internal-outowner@test.invalid',  'IT OutOwner',  NOW(), NOW()),
  ('c6130000-0000-4000-8000-000000000008', 'internal-client@test.invalid',    'IT Client',    NOW(), NOW())
-- DO UPDATE, not DO NOTHING: handle_new_user has already written a profiles row
-- with a NULL full_name for each auth.users row above.
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO organizations (id, type, name, slug, status)
VALUES
  ('c6130000-0000-4000-8000-0000000000a1', 'design_studio', 'IT Studio',  'it-studio-test',  'active'),
  ('c6130000-0000-4000-8000-0000000000a2', 'design_studio', 'IT Outside', 'it-outside-test', 'active');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('c6130000-0000-4000-8000-0000000000c1', 'c6130000-0000-4000-8000-000000000001',
   'c6130000-0000-4000-8000-0000000000a1', 'owner',  'active', NOW()),
  ('c6130000-0000-4000-8000-0000000000c2', 'c6130000-0000-4000-8000-000000000002',
   'c6130000-0000-4000-8000-0000000000a1', 'admin',  'active', NOW()),
  ('c6130000-0000-4000-8000-0000000000c3', 'c6130000-0000-4000-8000-000000000003',
   'c6130000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('c6130000-0000-4000-8000-0000000000c4', 'c6130000-0000-4000-8000-000000000004',
   'c6130000-0000-4000-8000-0000000000a1', 'guest',  'active', NOW()),
  ('c6130000-0000-4000-8000-0000000000c5', 'c6130000-0000-4000-8000-000000000005',
   'c6130000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  -- IT Outside's OWNER row goes in FIRST: guard_org_membership_changes (00484)
  -- raises owner_insert_requires_owner for an owner INSERT into an organization
  -- that already carries any membership row.
  ('c6130000-0000-4000-8000-0000000000c7', 'c6130000-0000-4000-8000-000000000007',
   'c6130000-0000-4000-8000-0000000000a2', 'owner',  'active', NOW()),
  ('c6130000-0000-4000-8000-0000000000c6', 'c6130000-0000-4000-8000-000000000006',
   'c6130000-0000-4000-8000-0000000000a2', 'member', 'active', NOW());

-- The project NAMES its studio, so project_pricing_studio_id answers IT Studio
-- and the project-scoped reads in case (f) are live rather than vacuous.
INSERT INTO projects (id, name, designer_id, client_id, created_by, studio_id)
VALUES ('c6130000-0000-4000-8000-0000000000e1', 'IT House',
        'c6130000-0000-4000-8000-000000000001', 'c6130000-0000-4000-8000-000000000008',
        'c6130000-0000-4000-8000-000000000001', 'c6130000-0000-4000-8000-0000000000a1');

INSERT INTO project_team_members (project_id, user_id, role, assigned_by)
VALUES ('c6130000-0000-4000-8000-0000000000e1', 'c6130000-0000-4000-8000-000000000003',
        'support_designer', 'c6130000-0000-4000-8000-000000000001');

INSERT INTO invoices (id, project_id, designer_id, client_id, status, currency, memo)
VALUES ('c6130000-0000-4000-8000-0000000000a9', 'c6130000-0000-4000-8000-0000000000e1',
        'c6130000-0000-4000-8000-000000000001', 'c6130000-0000-4000-8000-000000000008',
        'draft', 'USD', 'IT draft');

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

-- ─── (a) the author logs an hour with no project ───────────────────────────
DO $$
DECLARE
  v_rows     integer;
  v_project  uuid;
  v_studio   uuid;
  v_state    text;
  v_rate     integer;
  v_amount   integer;
  v_source   text;
  v_role     text;
  v_auth     uuid;
  v_visible  integer;
BEGIN
  PERFORM pg_temp.assume_user('c6130000-0000-4000-8000-000000000003');
  -- hourly_rate_cents and rate_role are deliberately supplied: HT-1 says the
  -- server owns the rate on every path, and 00600's INSERT branch refuses only
  -- rate_source / rated_amount_cents / updated_by, so this INSERT must SUCCEED
  -- and the values must be discarded.
  INSERT INTO project_time_entries
    (id, project_id, studio_id, user_id, started_at, duration_minutes, billable,
     source, activity, hourly_rate_cents, rate_role, notes)
  VALUES
    ('c6130000-0000-4000-8000-0000000000b1', NULL,
     'c6130000-0000-4000-8000-0000000000a1', 'c6130000-0000-4000-8000-000000000003',
     NOW() - INTERVAL '2 hours', 45, false, 'internal', 'admin', 99999, 'vendor',
     'the studio books');
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  SELECT count(*) INTO v_visible FROM project_time_entries
   WHERE id = 'c6130000-0000-4000-8000-0000000000b1';
  PERFORM pg_temp.reset_role();

  ASSERT v_rows = 1,
    'FAIL a1 (HT-15): a studio member must be able to log an hour with NO project '
    '— project_id was NOT NULL until 00610 and the add row refused without a '
    'project; rows = ' || v_rows;
  ASSERT v_visible = 1,
    'FAIL a2 (§12 risk 2): the author must be able to READ the row back through '
    'internal_time_own_read. Zero here is the whole failure this wave was written '
    'against — every pre-00612 policy resolves through project_id, so a NULL made '
    'all nine false and internal time was written and then invisible';

  SELECT project_id, studio_id, billing_state, hourly_rate_cents,
         rated_amount_cents, rate_source, rate_role, billing_authority_id
    INTO v_project, v_studio, v_state, v_rate, v_amount, v_source, v_role, v_auth
  FROM project_time_entries WHERE id = 'c6130000-0000-4000-8000-0000000000b1';

  ASSERT v_project IS NULL,
    'FAIL a3: the stored project_id must be NULL';
  ASSERT v_studio = 'c6130000-0000-4000-8000-0000000000a1',
    'FAIL a4: the hour must carry its own studio_id; got '
    || COALESCE(v_studio::text, 'NULL');
  ASSERT v_state = 'nonbillable',
    'FAIL a5 (00613): an internal hour is nonbillable; got '
    || COALESCE(v_state, 'NULL');
  ASSERT v_rate IS NULL,
    'FAIL a6 (HT-1 + 00613): the caller''s 99999 must be DISCARDED and the hour '
    'left with no rate — an internal hour is never priced; got '
    || COALESCE(v_rate::text, 'NULL');
  ASSERT v_amount = 0,
    'FAIL a7 (00613): rated_amount_cents must be 0; got '
    || COALESCE(v_amount::text, 'NULL');
  ASSERT v_source = 'none',
    'FAIL a8 (00613 + HT-26): rate_source must be ''none'' — the row prints "rate '
    'pending" honestly rather than blank; got ' || COALESCE(v_source, 'NULL');
  ASSERT v_role IS NULL,
    'FAIL a9 (00613): the caller''s rate_role pick must be discarded, NOT raised '
    '— the short-circuit sits above 00601 delta 1, whose roster read would refuse '
    'a role nobody can hold on a project that does not exist; got '
    || COALESCE(v_role, 'NULL');
  ASSERT v_auth IS NULL,
    'FAIL a10: an internal hour binds no billing authority';

  RAISE NOTICE 'internal_time: case (a) passed — the hour with no project.';
END
$$;

-- ─── (b) another studio sees nothing ───────────────────────────────────────
DO $$
DECLARE
  v_member integer;
  v_owner  integer;
BEGIN
  PERFORM pg_temp.assume_user('c6130000-0000-4000-8000-000000000006');
  SELECT count(*) INTO v_member FROM project_time_entries
   WHERE id = 'c6130000-0000-4000-8000-0000000000b1';
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('c6130000-0000-4000-8000-000000000007');
  SELECT count(*) INTO v_owner FROM project_time_entries
   WHERE id = 'c6130000-0000-4000-8000-0000000000b1';
  PERFORM pg_temp.reset_role();

  ASSERT v_member = 0,
    'FAIL b1: a member of another studio must read NOTHING of this hour; got '
    || v_member;
  ASSERT v_owner = 0,
    'FAIL b2: and neither must that studio''s OWNER — 00612 keys on the row''s own '
    'studio_id, and is_org_admin_or_owner answers for HER studio, not this one; '
    'got ' || v_owner;

  RAISE NOTICE 'internal_time: case (b) passed — the hour is not the other studio''s.';
END
$$;

-- ─── (c) the studio's owner and admin read it; a colleague and a guest do not ─
DO $$
DECLARE
  v_owner     integer;
  v_admin     integer;
  v_colleague integer;
  v_guest     integer;
  v_notes     text;
BEGIN
  PERFORM pg_temp.assume_user('c6130000-0000-4000-8000-000000000001');
  SELECT count(*), max(notes) INTO v_owner, v_notes FROM project_time_entries
   WHERE id = 'c6130000-0000-4000-8000-0000000000b1';
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('c6130000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_admin FROM project_time_entries
   WHERE id = 'c6130000-0000-4000-8000-0000000000b1';
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('c6130000-0000-4000-8000-000000000005');
  SELECT count(*) INTO v_colleague FROM project_time_entries
   WHERE id = 'c6130000-0000-4000-8000-0000000000b1';
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('c6130000-0000-4000-8000-000000000004');
  SELECT count(*) INTO v_guest FROM project_time_entries
   WHERE id = 'c6130000-0000-4000-8000-0000000000b1';
  PERFORM pg_temp.reset_role();

  ASSERT v_owner = 1,
    'FAIL c1 (HT-15): the studio OWNER must read her studio''s internal hours — '
    'without internal_time_owner_admin_read the studio scope under-reports '
    '(plan-v2 §12 risk 15 names this policy as the droppable piece, which only '
    'means it must be asserted, not assumed); got ' || v_owner;
  ASSERT v_notes = 'the studio books',
    'FAIL c2: and she reads the row itself, not a husk';
  ASSERT v_admin = 1,
    'FAIL c3: so must an ADMIN (is_org_admin_or_owner, §0.14); got ' || v_admin;
  ASSERT v_colleague = 0,
    'FAIL c4 (HT-10): a plain COLLEAGUE in the same studio must read NOTHING of '
    'it — there is no studio-wide read of internal time, exactly as 00606 left '
    'none for project hours; got ' || v_colleague;
  ASSERT v_guest = 0,
    'FAIL c5: and a GUEST co-member reads nothing — is_active_studio_member '
    'requires role <> ''guest'' (00417:48); got ' || v_guest;

  RAISE NOTICE 'internal_time: case (c) passed — owner and admin, and nobody else.';
END
$$;

-- ─── (d) studio_id cannot be aimed at another organization (00611) ─────────
DO $$
DECLARE
  v_insert_state text;
  v_insert_msg   text;
  v_update_state text;
  v_update_msg   text;
  v_guest_state  text;
  v_studio       uuid;
  v_left         integer;
BEGIN
  -- (d1) the author aims a NEW hour at IT Outside.
  PERFORM pg_temp.assume_user('c6130000-0000-4000-8000-000000000003');
  BEGIN
    INSERT INTO project_time_entries
      (id, project_id, studio_id, user_id, started_at, duration_minutes, billable, source)
    VALUES
      ('c6130000-0000-4000-8000-0000000000b9', NULL,
       'c6130000-0000-4000-8000-0000000000a2', 'c6130000-0000-4000-8000-000000000003',
       NOW() - INTERVAL '1 hour', 30, false, 'internal');
  EXCEPTION WHEN OTHERS THEN
    v_insert_state := SQLSTATE;
    v_insert_msg   := SQLERRM;
  END;

  -- (d2) and repoints the hour she already owns at IT Outside.
  BEGIN
    UPDATE project_time_entries
       SET studio_id = 'c6130000-0000-4000-8000-0000000000a2'
     WHERE id = 'c6130000-0000-4000-8000-0000000000b1';
  EXCEPTION WHEN OTHERS THEN
    v_update_state := SQLSTATE;
    v_update_msg   := SQLERRM;
  END;
  PERFORM pg_temp.reset_role();

  -- (d3) a GUEST of the row's OWN studio passes 00611's status-only membership
  --      test and is refused by RLS instead — the division of labour 00611's
  --      banner describes.
  PERFORM pg_temp.assume_user('c6130000-0000-4000-8000-000000000004');
  BEGIN
    INSERT INTO project_time_entries
      (id, project_id, studio_id, user_id, started_at, duration_minutes, billable, source)
    VALUES
      ('c6130000-0000-4000-8000-0000000000b8', NULL,
       'c6130000-0000-4000-8000-0000000000a1', 'c6130000-0000-4000-8000-000000000004',
       NOW() - INTERVAL '1 hour', 30, false, 'internal');
  EXCEPTION WHEN OTHERS THEN
    v_guest_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_insert_msg LIKE '%time_entry_studio_id_not_member%',
    'FAIL d1 (00611, §0.13): aiming studio_id at an organization the writer holds '
    'no active seat in must RAISE the guard 00611 replicates from 00317:31-47 — '
    'it is what makes this column admissible as a policy key at all; got '
    || COALESCE(v_insert_state || ' ' || v_insert_msg, 'NO RAISE');
  ASSERT NOT EXISTS (SELECT 1 FROM project_time_entries
                      WHERE id = 'c6130000-0000-4000-8000-0000000000b9'),
    'FAIL d2: the refused INSERT must leave no row behind';

  ASSERT v_update_msg LIKE '%time_entry_studio_id_not_member%',
    'FAIL d3 (00611): the UPDATE repoint must raise too — an INSERT-only guard '
    'leaves the same primitive open in one more statement; got '
    || COALESCE(v_update_state || ' ' || v_update_msg, 'NO RAISE');
  SELECT studio_id INTO v_studio FROM project_time_entries
   WHERE id = 'c6130000-0000-4000-8000-0000000000b1';
  ASSERT v_studio = 'c6130000-0000-4000-8000-0000000000a1',
    'FAIL d4: and the hour must still belong to its own studio; got '
    || COALESCE(v_studio::text, 'NULL');

  ASSERT v_guest_state = '42501',
    'FAIL d5: a GUEST must be refused by RLS (internal_time_own_insert goes '
    'through is_active_studio_member, which excludes guests) — 00611 deliberately '
    'replicates 00317''s status-only test and does not duplicate that leg; got '
    || COALESCE(v_guest_state, 'NO RAISE');
  SELECT count(*) INTO v_left FROM project_time_entries
   WHERE id = 'c6130000-0000-4000-8000-0000000000b8';
  ASSERT v_left = 0, 'FAIL d6: the guest''s refused INSERT must leave no row';

  RAISE NOTICE 'internal_time: case (d) passed — the hour cannot be aimed elsewhere.';
END
$$;

-- ─── (e) a billable project-less hour is refused by the CHECK ──────────────
-- Run WITHOUT impersonation: as the migration-context session owner RLS is not in
-- the way, so the refusal can only be 00610's CHECK. That is the reason the
-- constraint exists rather than only a policy — service_role and postgres bypass
-- RLS and cannot bypass a CHECK.
DO $$
DECLARE
  v_state text;
BEGIN
  BEGIN
    INSERT INTO project_time_entries
      (id, project_id, studio_id, user_id, started_at, duration_minutes, billable, source)
    VALUES
      ('c6130000-0000-4000-8000-0000000000b7', NULL,
       'c6130000-0000-4000-8000-0000000000a1', 'c6130000-0000-4000-8000-000000000003',
       NOW() - INTERVAL '1 hour', 30, true, 'internal');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;

  ASSERT v_state = '23514',
    'FAIL e1 (HT-15, 00610): a BILLABLE hour with no project must be refused by '
    'project_time_entries_internal_scope_ck even where RLS is not in the way; got '
    || COALESCE(v_state, 'NO RAISE');

  -- The other half of the same constraint: a project-less hour naming NO studio.
  v_state := NULL;
  BEGIN
    INSERT INTO project_time_entries
      (id, project_id, studio_id, user_id, started_at, duration_minutes, billable, source)
    VALUES
      ('c6130000-0000-4000-8000-0000000000b6', NULL, NULL,
       'c6130000-0000-4000-8000-000000000003',
       NOW() - INTERVAL '1 hour', 30, false, 'internal');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  ASSERT v_state = '23514',
    'FAIL e2 (00610): an hour with neither a project nor a studio belongs to '
    'nobody — no 00612 policy could ever reach it; got '
    || COALESCE(v_state, 'NO RAISE');

  RAISE NOTICE 'internal_time: case (e) passed — non-billable, and owned by a studio.';
END
$$;

-- ─── (f) absent from every project-scoped read, present in the studio's ────
DO $$
DECLARE
  v_unbilled     integer;
  v_margin       integer;
  v_ledger_cnt   integer;
  v_ledger_stud  uuid;
  v_total_min    integer;
  v_studio_int   integer;
  v_studio_bill  bigint;
  v_bucket_key   text;
  v_bucket_label text;
  v_project_rows integer;
BEGIN
  -- A billable project hour by the same author, so every project-scoped read
  -- below has something to return and "absent" is not vacuous.
  PERFORM pg_temp.assume_user('c6130000-0000-4000-8000-000000000003');
  INSERT INTO project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source, activity)
  VALUES
    ('c6130000-0000-4000-8000-0000000000b2', 'c6130000-0000-4000-8000-0000000000e1',
     'c6130000-0000-4000-8000-000000000003', NOW() - INTERVAL '3 hours', 60, true,
     'manual_entry', 'design');
  PERFORM pg_temp.reset_role();

  SELECT count(*) INTO v_unbilled FROM project_unbilled_time
   WHERE id = 'c6130000-0000-4000-8000-0000000000b1';
  ASSERT v_unbilled = 0,
    'FAIL f1: an internal hour must be absent from project_unbilled_time — it is '
    'nonbillable, and the view filters billing_state = ''authorized'' '
    '(00412:2687-2688); got ' || v_unbilled;

  SELECT count(*) INTO v_margin FROM margin_items
   WHERE kind = 'time' AND project_id IS NULL;
  ASSERT v_margin = 0,
    'FAIL f2 (00613): the margin_items time branch must exclude project-less '
    'hours — an hour with no project has no margin, and without the predicate it '
    'joins the Post of whatever project the caller is looking at; got ' || v_margin;

  -- The ledger view carries it, with its OWN studio_id (00613's CASE).
  PERFORM pg_temp.assume_user('c6130000-0000-4000-8000-000000000001');
  SELECT count(*), max(studio_id::text)::uuid INTO v_ledger_cnt, v_ledger_stud
  FROM time_entry_ledger WHERE id = 'c6130000-0000-4000-8000-0000000000b1';
  ASSERT v_ledger_cnt = 1,
    'FAIL f3 (00604 + 00613): the internal hour must survive time_entry_ledger — '
    'both joins are LEFT for exactly this reason; got ' || v_ledger_cnt;
  ASSERT v_ledger_stud = 'c6130000-0000-4000-8000-0000000000a1',
    'FAIL f4 (00613, 00607''s handover): the ledger must report the row''s OWN '
    'studio_id for a project-less hour. project_pricing_studio_id(NULL) is NULL '
    '(00604:100-102), so without the CASE the rollup''s '
    '`ledger.studio_id = p_studio_id` filter could never see an internal hour at '
    'all, whatever its internal_minutes FILTER said; got '
    || COALESCE(v_ledger_stud::text, 'NULL');

  -- The studio scope counts it, in its own bucket and in internal_minutes.
  SELECT bucket_key, bucket_label, total_minutes, internal_minutes, billable_cents
    INTO v_bucket_key, v_bucket_label, v_total_min, v_studio_int, v_studio_bill
  FROM studio_hours_rollup('c6130000-0000-4000-8000-0000000000a1', NULL, NULL, 'project')
  WHERE bucket_key = 'internal';
  ASSERT v_bucket_key = 'internal',
    'FAIL f5 (plan-v2 §5 Done-when): the internal hour must appear in the studio '
    'scope, in 00607''s own ''internal'' project bucket';
  ASSERT v_bucket_label = 'Internal',
    'FAIL f6: and it is labelled Internal, not blank; got '
    || COALESCE(v_bucket_label, 'NULL');
  ASSERT v_total_min = 45 AND v_studio_int = 45,
    'FAIL f7: 45 minutes, counted once in the total and once as internal time '
    '(HT-30: the total is the front matter of the rows beneath it, not a '
    'different number); got ' || COALESCE(v_total_min::text, 'NULL') || ' / '
    || COALESCE(v_studio_int::text, 'NULL');
  ASSERT v_studio_bill = 0,
    'FAIL f8: and it contributes NO money — a nonbillable hour at no rate; got '
    || COALESCE(v_studio_bill::text, 'NULL');

  -- The PROJECT scope of the same rollup must not see it.
  SELECT count(*) INTO v_project_rows
  FROM studio_hours_rollup('c6130000-0000-4000-8000-0000000000a1', NULL, NULL,
                           'project', NULL, 'c6130000-0000-4000-8000-0000000000e1')
  WHERE bucket_key = 'internal';
  ASSERT v_project_rows = 0,
    'FAIL f9: the project scope must not carry internal time — `p_project_id IS '
    'NULL OR ledger.project_id = p_project_id` is NULL-safe; got ' || v_project_rows;

  SELECT minutes INTO v_total_min
  FROM project_hours_total('c6130000-0000-4000-8000-0000000000e1');
  PERFORM pg_temp.reset_role();
  ASSERT v_total_min = 60,
    'FAIL f10 (HT-10-a): the project total must count the project hour and NOT '
    'the internal one — it filters `entry.project_id = p_project_id`, which is '
    'NULL-safe; got ' || COALESCE(v_total_min::text, 'NULL');

  RAISE NOTICE 'internal_time: case (f) passed — out of the project, inside the studio.';
END
$$;

-- ─── (g) an internal hour cannot be invoiced ───────────────────────────────
DO $$
DECLARE
  v_state   text;
  v_msg     text;
  v_invoice uuid;
  v_claimed integer;
BEGIN
  PERFORM pg_temp.assume_user('c6130000-0000-4000-8000-000000000003');
  BEGIN
    UPDATE project_time_entries
       SET invoice_id = 'c6130000-0000-4000-8000-0000000000a9'
     WHERE id = 'c6130000-0000-4000-8000-0000000000b1';
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
    v_msg   := SQLERRM;
  END;

  SELECT count(*) INTO v_claimed FROM claim_time_entries(
    'c6130000-0000-4000-8000-0000000000a9',
    ARRAY['c6130000-0000-4000-8000-0000000000b1']::uuid[]);
  PERFORM pg_temp.reset_role();

  ASSERT v_msg LIKE '%not authorized for invoicing%',
    'FAIL g1 (HT-15): attaching an internal hour to an invoice must raise — '
    'aad_guard_time_entry_invoice_authority refuses anything that is not '
    'billing_state = ''authorized'', and 00613 makes every internal hour '
    'nonbillable; got ' || COALESCE(v_state || ' ' || v_msg, 'NO RAISE');
  SELECT invoice_id INTO v_invoice FROM project_time_entries
   WHERE id = 'c6130000-0000-4000-8000-0000000000b1';
  ASSERT v_invoice IS NULL,
    'FAIL g2: and the hour must still carry no invoice';
  ASSERT v_claimed = 0,
    'FAIL g3 (00595): claim_time_entries must return no id for it — it filters '
    '`billable`, which an internal hour never is; got ' || v_claimed;

  RAISE NOTICE 'internal_time: case (g) passed — internal time is never billed.';
END
$$;

-- ─── (h) the auto-roster seats nobody for an hour with no project ──────────
DO $$
DECLARE
  v_seats integer;
BEGIN
  SELECT count(*) INTO v_seats FROM project_team_members
   WHERE user_id = 'c6130000-0000-4000-8000-000000000003'
     AND removed_at IS NULL;
  ASSERT v_seats = 1,
    'FAIL h1 (00597): an internal hour must seat NOBODY — time_entry_auto_roster '
    'returns early on a NULL project_id, and a seat it could not compute would '
    'otherwise appear on the Call Sheet. Expected the one fixture seat; got '
    || v_seats;

  RAISE NOTICE 'internal_time: case (h) passed — no phantom roster seat.';
END
$$;

ROLLBACK;
