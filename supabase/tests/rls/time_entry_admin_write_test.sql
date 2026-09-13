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
--   (i) THE SELF-GRANT IS NOT A KEY (W2 review round 1, finding B1). An outsider
--       who owns any organization may seat ANOTHER person in it with one INSERT
--       (`Org owners can insert members`: WITH CHECK is_org_admin_or_owner(org)
--       AND role <> 'owner'; no consent gate, status DEFAULT 'active'). So she
--       seats the victim project's DESIGNER in her own studio and then must still
--       read nothing, adjust nothing and delete nothing: the owner/admin policies
--       key on the studio that PRICES the work (project_pricing_studio_id,
--       HT-3-a), never on the designer's membership set. The INSERT itself is
--       asserted to SUCCEED — it is the attacker's one move, and if it ever stops
--       succeeding this case is measuring the wrong thing.
--   (j) HT-23'S TRACE IS NOT CALLER-SUPPLIED (W2 review round 4, finding W2-R4-07,
--       measured): the author of a brand-new row may not name somebody else as
--       its last editor. `updated_by` was in neither of
--       guard_commercial_time_entry_derived_fields' two lists, so an ordinary
--       member INSERTed her own hour with `updated_by` = the studio owner's id and
--       the never-edited row read as though he had touched it — a forged trace on
--       exactly the rows no audit_logs row exists for (the audit trigger fires on
--       UPDATE and DELETE only). 00605 now refuses it on INSERT; the UPDATE half
--       was never open, because the stamp trigger overwrites whatever is sent.
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
  ('c6050000-0000-4000-8000-000000000007', 'adminwrite-client@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6050000-0000-4000-8000-000000000008', 'adminwrite-attacker@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('c6050000-0000-4000-8000-000000000001', 'adminwrite-owner@test.invalid',   'AW Owner',   NOW(), NOW()),
  ('c6050000-0000-4000-8000-000000000002', 'adminwrite-admin@test.invalid',   'AW Admin',   NOW(), NOW()),
  ('c6050000-0000-4000-8000-000000000003', 'adminwrite-worker@test.invalid',  'AW Worker',  NOW(), NOW()),
  ('c6050000-0000-4000-8000-000000000004', 'adminwrite-peer@test.invalid',    'AW Peer',    NOW(), NOW()),
  ('c6050000-0000-4000-8000-000000000005', 'adminwrite-guest@test.invalid',   'AW Guest',   NOW(), NOW()),
  ('c6050000-0000-4000-8000-000000000006', 'adminwrite-outside@test.invalid', 'AW Outside', NOW(), NOW()),
  ('c6050000-0000-4000-8000-000000000007', 'adminwrite-client@test.invalid',  'AW Client',  NOW(), NOW()),
  ('c6050000-0000-4000-8000-000000000008', 'adminwrite-attacker@test.invalid', 'AW Attacker', NOW(), NOW())
-- DO UPDATE, not DO NOTHING: handle_new_user has already inserted a profile
-- row for each auth.users row above, with a NULL full_name — so DO NOTHING
-- would leave every name NULL and the member-name asserts below would pass
-- for the wrong reason.
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO organizations (id, type, name, slug, status)
VALUES
  ('c6050000-0000-4000-8000-0000000000a1', 'design_studio', 'AW Studio',  'aw-studio-test',  'active'),
  ('c6050000-0000-4000-8000-0000000000a2', 'design_studio', 'AW Outside', 'aw-outside-test', 'active'),
  -- Case (i): a studio with no connection to AW House at all, owned by the
  -- attacker, whose roster she therefore controls.
  ('c6050000-0000-4000-8000-0000000000a3', 'design_studio', 'AW Attacker', 'aw-attacker-test', 'active');

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
   'c6050000-0000-4000-8000-0000000000a2', 'owner',  'active', NOW()),
  ('c6050000-0000-4000-8000-0000000000c8', 'c6050000-0000-4000-8000-000000000008',
   'c6050000-0000-4000-8000-0000000000a3', 'owner',  'active', NOW());

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

-- ─── (i) the self-grant is not a key (review round 1, finding B1) ───────────
DO $$
DECLARE
  v_before   integer;
  v_after    integer;
  v_seated   integer;
  v_rows     integer;
  v_audits   integer;
  v_pricing  uuid;
BEGIN
  SELECT count(*) INTO v_audits FROM audit_logs WHERE resource_type = 'project_time_entries';

  -- The attacker owns a studio of her own and nothing else. AW House is not hers
  -- and its hours are not her business.
  PERFORM pg_temp.assume_user('c6050000-0000-4000-8000-000000000008');
  SELECT count(*) INTO v_before FROM project_time_entries
   WHERE id = 'c6050000-0000-4000-8000-0000000000b1';

  -- Her one move: as owner of her OWN org she seats AW House's designer in it.
  -- `Org owners can insert members` allows exactly this — no consent gate, and
  -- organization_members.status defaults to 'active'.
  INSERT INTO organization_members (user_id, organization_id, role)
  VALUES ('c6050000-0000-4000-8000-000000000001', 'c6050000-0000-4000-8000-0000000000a3', 'member');
  GET DIAGNOSTICS v_seated = ROW_COUNT;

  SELECT count(*) INTO v_after FROM project_time_entries
   WHERE id = 'c6050000-0000-4000-8000-0000000000b1';

  BEGIN
    UPDATE project_time_entries SET duration_minutes = 603
     WHERE id = 'c6050000-0000-4000-8000-0000000000b1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN v_rows := 0;
  END;
  ASSERT v_rows = 0,
    'FAIL i4 (B1): the seat must not buy an adjust either; rows affected = ' || v_rows;

  BEGIN
    DELETE FROM project_time_entries WHERE id = 'c6050000-0000-4000-8000-0000000000b1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN v_rows := 0;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_before = 0,
    'FAIL i1 (precondition): the attacker must start with no sight of the hour; '
    'rows = ' || v_before;
  ASSERT v_seated = 1,
    'FAIL i2 (precondition): the attacker''s seat INSERT must actually succeed — '
    'this case exists because `Org owners can insert members` permits it. If it '
    'now fails, the vector closed elsewhere and this case is measuring nothing';
  ASSERT v_after = 0,
    'FAIL i3 (B1, the leak this case exists for): seating the project''s DESIGNER '
    'in a studio the attacker owns must NOT hand her the hour. The owner/admin '
    'read keys on the studio that PRICES the work (project_pricing_studio_id, '
    'HT-3-a), not on the designer''s membership set — keyed the other way, one '
    'INSERT reopens W1-R10-03 (a colleague''s notes and per-person rate); rows = '
    || v_after;
  ASSERT v_rows = 0,
    'FAIL i5 (B1): nor may she DELETE it; rows affected = ' || v_rows;
  ASSERT EXISTS (SELECT 1 FROM project_time_entries
                  WHERE id = 'c6050000-0000-4000-8000-0000000000b1'),
    'FAIL i6 (B1): the member''s hour must survive the attempt';
  ASSERT (SELECT count(*) FROM audit_logs WHERE resource_type = 'project_time_entries') = v_audits,
    'FAIL i7: refused writes leave no audit row — and therefore no permanently '
    'readable old_values copy of the notes and rate they could not read';

  -- The pricing studio is what decides, and it is AW Studio throughout: the seat
  -- the attacker wrote changed nothing about who prices AW House (HT-3-a step 1).
  SELECT public.project_pricing_studio_id('c6050000-0000-4000-8000-0000000000e1')
    INTO v_pricing;
  ASSERT v_pricing = 'c6050000-0000-4000-8000-0000000000a1',
    'FAIL i8: AW House NAMES its studio, so HT-3-a step 1 answers and no seat '
    'written elsewhere can move it; got ' || COALESCE(v_pricing::text, 'NULL');

  RAISE NOTICE 'time_entry_admin_write: case (i) passed — the self-grant buys nothing.';
END
$$;

-- ─── (j) the trace may not be forged on INSERT (W2-R4-07) ───────────────────
DO $$
DECLARE
  v_state   text;
  v_updated uuid;
BEGIN
  PERFORM pg_temp.assume_user('c6050000-0000-4000-8000-000000000003');

  v_state := NULL;
  BEGIN
    INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source, updated_by)
    VALUES ('c6050000-0000-4000-8000-0000000000b4', 'c6050000-0000-4000-8000-0000000000e1',
            'c6050000-0000-4000-8000-000000000003', NOW() - INTERVAL '6 hours', 30, true,
            'manual_entry', 'c6050000-0000-4000-8000-000000000002');
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;

  -- The ordinary INSERT, without the forgery, must still work and must leave the
  -- trace empty: a new row has no editor (00605's column COMMENT).
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6050000-0000-4000-8000-0000000000b5', 'c6050000-0000-4000-8000-0000000000e1',
          'c6050000-0000-4000-8000-000000000003', NOW() - INTERVAL '7 hours', 30, true, 'manual_entry');
  SELECT updated_by INTO v_updated FROM project_time_entries
   WHERE id = 'c6050000-0000-4000-8000-0000000000b5';
  PERFORM pg_temp.reset_role();

  ASSERT v_state = '23514',
    'FAIL j1 (W2-R4-07, measured): a caller-supplied updated_by must be REFUSED on '
    'INSERT, the same way rate_source and rated_amount_cents are. Without it the '
    'author of a row nobody has ever edited names any profile as its last editor, '
    'and HT-23''s trace is a lie precisely where no audit_logs row exists to '
    'contradict it (the audit trigger fires on UPDATE and DELETE only); got '
    || COALESCE(v_state, 'NO RAISE');
  ASSERT NOT EXISTS (SELECT 1 FROM project_time_entries
                      WHERE id = 'c6050000-0000-4000-8000-0000000000b4'),
    'FAIL j2: the refused INSERT must leave no row behind';
  ASSERT v_updated IS NULL,
    'FAIL j3: an ordinary INSERT must still succeed and leave updated_by NULL — a '
    'new row has no editor; got ' || COALESCE(v_updated::text, 'NULL');

  RAISE NOTICE 'time_entry_admin_write: case (j) passed — the trace cannot be forged.';
END
$$;

ROLLBACK;
