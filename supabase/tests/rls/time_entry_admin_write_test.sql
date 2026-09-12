-- ═══════════════════════════════════════════════════════════════════════════
-- The owner/admin write widening and its trace (migration 00605, HT-22 + HT-23)
--
-- Asserted PER ROLE, every write through RLS as the named actor:
--   (a) an `admin` of the studio may ADJUST another member's unbilled entry, the
--       row's updated_by becomes the admin, and ONE audit_logs row appears
--       carrying BOTH old_values and new_values and the right organization_id.
--       The adjust and its trace are asserted TOGETHER — that is what makes a
--       SECURITY DEFINER regression on the audit trigger fail this suite instead
--       of failing Leah (§0.18, risk 4: audit_logs has RLS with no INSERT
--       policy, so an INVOKER trigger rolls the correction back with it).
--   (b) a plain `member` may NOT adjust a colleague's entry.
--   (c) a plain `member` may NOT delete a colleague's entry.
--   (d) a `guest` co-member may neither read, adjust nor delete it.
--   (e) an owner/admin of ANOTHER studio may not touch it.
--   (f) the `owner` may DELETE an unbilled entry, and the delete writes one audit
--       row with old_values and a NULL new_values.
--   (g) THE INVOICED LOCK IS UNTOUCHED (§0.12): neither the admin nor the author
--       may delete an invoiced entry or move its frozen columns —
--       guard_invoiced_time_entry (00177:51-84) still raises for both.
--   (h) a server-side write (auth.uid() NULL: cron, migration, service_role)
--       leaves the last human in updated_by rather than blanking it.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rls/time_entry_admin_write_test.sql
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c6050000-0000-4000-8000-000000000001', 'adminwrite-owner@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6050000-0000-4000-8000-000000000002', 'adminwrite-admin@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6050000-0000-4000-8000-000000000003', 'adminwrite-worker@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6050000-0000-4000-8000-000000000004', 'adminwrite-peer@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6050000-0000-4000-8000-000000000005', 'adminwrite-guest@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6050000-0000-4000-8000-000000000006', 'adminwrite-outside@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6050000-0000-4000-8000-000000000007', 'adminwrite-client@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('c6050000-0000-4000-8000-000000000001', 'adminwrite-owner@test.invalid',   'AW Owner',   NOW(), NOW()),
  ('c6050000-0000-4000-8000-000000000002', 'adminwrite-admin@test.invalid',   'AW Admin',   NOW(), NOW()),
  ('c6050000-0000-4000-8000-000000000003', 'adminwrite-worker@test.invalid',  'AW Worker',  NOW(), NOW()),
  ('c6050000-0000-4000-8000-000000000004', 'adminwrite-peer@test.invalid',    'AW Peer',    NOW(), NOW()),
  ('c6050000-0000-4000-8000-000000000005', 'adminwrite-guest@test.invalid',   'AW Guest',   NOW(), NOW()),
  ('c6050000-0000-4000-8000-000000000006', 'adminwrite-outside@test.invalid', 'AW Outside', NOW(), NOW()),
  ('c6050000-0000-4000-8000-000000000007', 'adminwrite-client@test.invalid',  'AW Client',  NOW(), NOW())
-- DO UPDATE, not DO NOTHING: handle_new_user has already inserted a profile
-- row for each auth.users row above, with a NULL full_name — so DO NOTHING
-- would leave every name NULL and the member-name asserts below would pass
-- for the wrong reason.
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO organizations (id, type, name, slug, status)
VALUES
  ('c6050000-0000-4000-8000-0000000000a1', 'design_studio', 'AW Studio',  'aw-studio-test',  'active'),
  ('c6050000-0000-4000-8000-0000000000a2', 'design_studio', 'AW Outside', 'aw-outside-test', 'active');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('c6050000-0000-4000-8000-0000000000c1', 'c6050000-0000-4000-8000-000000000001',
   'c6050000-0000-4000-8000-0000000000a1', 'owner',  'active', NOW()),
  ('c6050000-0000-4000-8000-0000000000c2', 'c6050000-0000-4000-8000-000000000002',
   'c6050000-0000-4000-8000-0000000000a1', 'admin',  'active', NOW()),
  ('c6050000-0000-4000-8000-0000000000c3', 'c6050000-0000-4000-8000-000000000003',
   'c6050000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('c6050000-0000-4000-8000-0000000000c4', 'c6050000-0000-4000-8000-000000000004',
   'c6050000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('c6050000-0000-4000-8000-0000000000c5', 'c6050000-0000-4000-8000-000000000005',
   'c6050000-0000-4000-8000-0000000000a1', 'guest',  'active', NOW()),
  ('c6050000-0000-4000-8000-0000000000c6', 'c6050000-0000-4000-8000-000000000006',
   'c6050000-0000-4000-8000-0000000000a2', 'owner',  'active', NOW());

-- The project is the studio owner's, and NAMES its studio: the admin's standing
-- in 00605's policy and the resolver's own ASSERT 2 must land on the SAME studio,
-- or the classifier refuses an adjust the policy allowed (00605's banner).
INSERT INTO projects (id, name, designer_id, client_id, created_by, studio_id)
VALUES ('c6050000-0000-4000-8000-0000000000e1', 'AW House',
        'c6050000-0000-4000-8000-000000000001', 'c6050000-0000-4000-8000-000000000007',
        'c6050000-0000-4000-8000-000000000001', 'c6050000-0000-4000-8000-0000000000a1');

INSERT INTO invoices (id, project_id, designer_id, client_id, status, currency, memo)
VALUES ('c6050000-0000-4000-8000-0000000000a9', 'c6050000-0000-4000-8000-0000000000e1',
        'c6050000-0000-4000-8000-000000000001', 'c6050000-0000-4000-8000-000000000007',
        'draft', 'USD', 'AW draft');

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

-- ─── the worker logs three of her own hours ────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.assume_user('c6050000-0000-4000-8000-000000000003');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source, notes)
  VALUES
    ('c6050000-0000-4000-8000-0000000000b1', 'c6050000-0000-4000-8000-0000000000e1',
     'c6050000-0000-4000-8000-000000000003', NOW() - INTERVAL '3 hours', 60, true, 'manual_entry', 'the adjust case'),
    ('c6050000-0000-4000-8000-0000000000b2', 'c6050000-0000-4000-8000-0000000000e1',
     'c6050000-0000-4000-8000-000000000003', NOW() - INTERVAL '4 hours', 60, true, 'manual_entry', 'the delete case'),
    ('c6050000-0000-4000-8000-0000000000b3', 'c6050000-0000-4000-8000-0000000000e1',
     'c6050000-0000-4000-8000-000000000003', NOW() - INTERVAL '5 hours', 60, true, 'manual_entry', 'the invoiced case');
  PERFORM pg_temp.reset_role();
END
$$;

-- The third is invoiced (as postgres — the claim path has its own suite in
-- supabase/tests/billing/time_claim_atomicity_test.sql).
UPDATE project_time_entries
   SET invoice_id = 'c6050000-0000-4000-8000-0000000000a9'
 WHERE id = 'c6050000-0000-4000-8000-0000000000b3';

-- ─── (a) the admin adjusts, and the trace exists ───────────────────────────
DO $$
DECLARE
  v_rows     integer;
  v_duration integer;
  v_updated  uuid;
  v_audits   integer;
  v_old      jsonb;
  v_new      jsonb;
  v_org      uuid;
  v_actor    uuid;
BEGIN
  PERFORM pg_temp.assume_user('c6050000-0000-4000-8000-000000000002');
  UPDATE project_time_entries SET duration_minutes = 90
   WHERE id = 'c6050000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM pg_temp.reset_role();

  ASSERT v_rows = 1,
    'FAIL a1 (HT-22): an admin of the studio must be able to adjust a member''s '
    'unbilled entry — before 00605 only the project''s own designer could '
    '(00177:136-137); rows affected = ' || v_rows;

  SELECT duration_minutes, updated_by INTO v_duration, v_updated
  FROM project_time_entries WHERE id = 'c6050000-0000-4000-8000-0000000000b1';
  ASSERT v_duration = 90,
    'FAIL a2: the adjust must persist; duration = ' || COALESCE(v_duration::text, 'NULL');
  ASSERT v_updated = 'c6050000-0000-4000-8000-000000000002',
    'FAIL a3 (HT-23): updated_by must be the admin who made the edit; got '
    || COALESCE(right(v_updated::text, 4), 'NULL');

  SELECT count(*) INTO v_audits FROM audit_logs
   WHERE resource_type = 'project_time_entries'
     AND resource_id = 'c6050000-0000-4000-8000-0000000000b1';
  ASSERT v_audits = 1,
    'FAIL a4 (HT-23 + §0.18): exactly ONE audit row per edit. Zero here means '
    'the DEFINER trigger is gone and the audit insert is being swallowed or is '
    'rolling the adjust back; got ' || v_audits;

  SELECT old_values, new_values, organization_id, user_id
    INTO v_old, v_new, v_org, v_actor
  FROM audit_logs
   WHERE resource_type = 'project_time_entries'
     AND resource_id = 'c6050000-0000-4000-8000-0000000000b1';
  ASSERT (v_old->>'duration_minutes')::int = 60,
    'FAIL a5: the trace must carry the value BEFORE the edit; old = '
    || COALESCE(v_old->>'duration_minutes', 'NULL');
  ASSERT (v_new->>'duration_minutes')::int = 90,
    'FAIL a6: the trace must carry the value AFTER the edit; new = '
    || COALESCE(v_new->>'duration_minutes', 'NULL');
  ASSERT v_org = 'c6050000-0000-4000-8000-0000000000a1',
    'FAIL a7: organization_id must be the studio that prices the work, or '
    '"Org admins can view org audit logs" (00021:423) never shows the owner her '
    'own studio''s edits; got ' || COALESCE(v_org::text, 'NULL');
  ASSERT v_actor = 'c6050000-0000-4000-8000-000000000002',
    'FAIL a8: the trace must name the actor; got ' || COALESCE(right(v_actor::text, 4), 'NULL');

  RAISE NOTICE 'time_entry_admin_write: case (a) passed — the adjust and its trace together.';
END
$$;

-- ─── (b) + (c) a plain member may not ──────────────────────────────────────
DO $$
DECLARE
  v_rows   integer;
  v_audits integer;
BEGIN
  SELECT count(*) INTO v_audits FROM audit_logs WHERE resource_type = 'project_time_entries';

  PERFORM pg_temp.assume_user('c6050000-0000-4000-8000-000000000004');
  BEGIN
    UPDATE project_time_entries SET duration_minutes = 600
     WHERE id = 'c6050000-0000-4000-8000-0000000000b1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN v_rows := 0;
  END;
  ASSERT v_rows = 0,
    'FAIL b (HT-22 is ONE widening, for owner/admin only): a plain member must '
    'not adjust a colleague''s hour; rows affected = ' || v_rows;

  BEGIN
    DELETE FROM project_time_entries WHERE id = 'c6050000-0000-4000-8000-0000000000b1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN v_rows := 0;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_rows = 0,
    'FAIL c: a plain member must not delete a colleague''s hour; rows affected = ' || v_rows;

  ASSERT (SELECT count(*) FROM audit_logs WHERE resource_type = 'project_time_entries') = v_audits,
    'FAIL bc2: a refused write must leave no audit row behind';
  ASSERT (SELECT duration_minutes = 90 FROM project_time_entries
           WHERE id = 'c6050000-0000-4000-8000-0000000000b1'),
    'FAIL bc3: the row must still carry the admin''s 90';

  RAISE NOTICE 'time_entry_admin_write: cases (b) and (c) passed.';
END
$$;

-- ─── (d) a guest co-member, and (e) another studio's owner ─────────────────
DO $$
DECLARE
  v_rows    integer;
  v_visible integer;
BEGIN
  PERFORM pg_temp.assume_user('c6050000-0000-4000-8000-000000000005');
  SELECT count(*) INTO v_visible FROM project_time_entries
   WHERE id = 'c6050000-0000-4000-8000-0000000000b1';
  BEGIN
    UPDATE project_time_entries SET duration_minutes = 601
     WHERE id = 'c6050000-0000-4000-8000-0000000000b1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN v_rows := 0;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_visible = 0,
    'FAIL d1: a guest co-member reads no time entry (is_studio_comember excludes '
    'guests, 00556); rows = ' || v_visible;
  ASSERT v_rows = 0,
    'FAIL d2: a guest co-member writes none either; rows affected = ' || v_rows;

  PERFORM pg_temp.assume_user('c6050000-0000-4000-8000-000000000006');
  SELECT count(*) INTO v_visible FROM project_time_entries
   WHERE id = 'c6050000-0000-4000-8000-0000000000b1';
  BEGIN
    UPDATE project_time_entries SET duration_minutes = 602
     WHERE id = 'c6050000-0000-4000-8000-0000000000b1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN v_rows := 0;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_visible = 0,
    'FAIL e1: an owner of ANOTHER studio reads nothing here; rows = ' || v_visible;
  ASSERT v_rows = 0,
    'FAIL e2: an owner of another studio writes nothing here — 00605''s predicate '
    'requires admin/owner standing in a studio the PROJECT''S designer belongs '
    'to; rows affected = ' || v_rows;

  RAISE NOTICE 'time_entry_admin_write: cases (d) and (e) passed.';
END
$$;

-- ─── (f) the owner deletes, and the trace says so ──────────────────────────
DO $$
DECLARE
  v_rows   integer;
  v_old    jsonb;
  v_new    jsonb;
  v_action text;
BEGIN
  PERFORM pg_temp.assume_user('c6050000-0000-4000-8000-000000000001');
  DELETE FROM project_time_entries WHERE id = 'c6050000-0000-4000-8000-0000000000b2';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM pg_temp.reset_role();

  ASSERT v_rows = 1,
    'FAIL f1 (HT-22): the studio owner must be able to delete a member''s '
    'unbilled hour; rows affected = ' || v_rows;
  ASSERT NOT EXISTS (SELECT 1 FROM project_time_entries
                      WHERE id = 'c6050000-0000-4000-8000-0000000000b2'),
    'FAIL f2: the delete must persist';

  SELECT action, old_values, new_values INTO v_action, v_old, v_new
  FROM audit_logs
   WHERE resource_type = 'project_time_entries'
     AND resource_id = 'c6050000-0000-4000-8000-0000000000b2';
  ASSERT v_action = 'time_entry.deleted',
    'FAIL f3: a delete must be traced as a delete; action = ' || COALESCE(v_action, 'NO ROW');
  ASSERT (v_old->>'duration_minutes')::int = 60,
    'FAIL f4: a deleted row''s own values are the whole trace; old = '
    || COALESCE(v_old->>'duration_minutes', 'NULL');
  ASSERT v_new IS NULL,
    'FAIL f5: a delete has no after-state; new_values must be NULL';

  RAISE NOTICE 'time_entry_admin_write: case (f) passed.';
END
$$;

-- ─── (g) the invoiced lock is untouched (§0.12) ────────────────────────────
DO $$
DECLARE
  v_state   text;
  v_message text;
  v_rows    integer;
BEGIN
  -- g1: the admin may not delete an invoiced row.
  v_state := NULL;
  PERFORM pg_temp.assume_user('c6050000-0000-4000-8000-000000000002');
  BEGIN
    DELETE FROM project_time_entries WHERE id = 'c6050000-0000-4000-8000-0000000000b3';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_message := SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_state IS NOT NULL,
    'FAIL g1 (§0.12): guard_invoiced_time_entry must still RAISE on a delete of '
    'an invoiced entry, for the admin as for anyone else. HT-22 widened the write, '
    'not the lock';
  ASSERT EXISTS (SELECT 1 FROM project_time_entries
                  WHERE id = 'c6050000-0000-4000-8000-0000000000b3'),
    'FAIL g1b: the invoiced row must survive';

  -- g2: nor may the admin move a frozen column on it.
  v_state := NULL;
  PERFORM pg_temp.assume_user('c6050000-0000-4000-8000-000000000002');
  BEGIN
    UPDATE project_time_entries SET duration_minutes = 120
     WHERE id = 'c6050000-0000-4000-8000-0000000000b3';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_message := SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_state IS NOT NULL,
    'FAIL g2 (§0.12): the invoiced row''s duration_minutes is frozen '
    '(00177:51-84) — an admin adjust must not be a way around it';
  ASSERT (SELECT duration_minutes = 60 FROM project_time_entries
           WHERE id = 'c6050000-0000-4000-8000-0000000000b3'),
    'FAIL g2b: the invoiced row must keep its duration';

  -- g3: and the author cannot either — the lock predates the widening.
  v_state := NULL;
  PERFORM pg_temp.assume_user('c6050000-0000-4000-8000-000000000003');
  BEGIN
    UPDATE project_time_entries SET duration_minutes = 121
     WHERE id = 'c6050000-0000-4000-8000-0000000000b3';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_message := SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_state IS NOT NULL,
    'FAIL g3 (§0.12): the author may not move a frozen column on an invoiced row '
    'either';

  RAISE NOTICE 'time_entry_admin_write: case (g) passed — the lock is where it was.';
END
$$;

-- ─── (h) a server-side write keeps the last human ──────────────────────────
DO $$
DECLARE
  v_updated uuid;
BEGIN
  -- No JWT claims: auth.uid() is NULL, which is what a cron job, a migration and
  -- service_role all look like.
  UPDATE project_time_entries SET notes = 'touched by the server'
   WHERE id = 'c6050000-0000-4000-8000-0000000000b1';

  SELECT updated_by INTO v_updated FROM project_time_entries
   WHERE id = 'c6050000-0000-4000-8000-0000000000b1';
  ASSERT v_updated = 'c6050000-0000-4000-8000-000000000002',
    'FAIL h: a server-side write must leave the last human in updated_by rather '
    'than blanking the trace; got ' || COALESCE(right(v_updated::text, 4), 'NULL');

  RAISE NOTICE 'time_entry_admin_write: case (h) passed.';
END
$$;

ROLLBACK;
