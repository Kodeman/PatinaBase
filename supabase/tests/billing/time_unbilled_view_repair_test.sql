-- ═══════════════════════════════════════════════════════════════════════════
-- project_unbilled_time repair (migration 00596, HT-6)
--
-- Two live money defects, asserted:
--   (a) the INNER JOIN on profiles under security_invoker dropped any entry
--       whose AUTHOR the caller cannot read — a silent understatement of the
--       studio's unbilled balance. The fixture author is a roster `vendor` who
--       is NOT an organization member and shares no other relationship, so
--       can_view_profile() is false for the project's own designer: case (a1)
--       pins that precondition, (a2) pins that the entry is in the view anyway.
--       00596 removes the profiles join outright rather than outer-joining it —
--       it selected nothing and could filter nothing — so (a2) holds for a
--       stronger reason than the plan first described.
--   (b) resolved_rate_cents came from the legacy change-order chain while
--       amount_cents preferred the rated snapshot — the rate printed did not
--       price the line. Case (b) reconciles the two on EVERY row of the view.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/billing/time_unbilled_view_repair_test.sql
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('a7200000-0000-4000-8000-000000000001', 'unbilled-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a7200000-0000-4000-8000-000000000002', 'unbilled-vendor@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('a7200000-0000-4000-8000-000000000001', 'unbilled-designer@test.invalid', 'Unbilled Designer', NOW(), NOW()),
  ('a7200000-0000-4000-8000-000000000002', 'unbilled-vendor@test.invalid',   'Unbilled Vendor',   NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
UPDATE profiles SET is_designer = true WHERE id = 'a7200000-0000-4000-8000-000000000001';

INSERT INTO organizations (id, type, name, slug)
VALUES ('a7200000-0000-4000-8000-0000000000a1', 'design_studio', 'Unbilled Studio', 'unbilled-studio-test');

-- The designer owns the studio. The vendor is DELIBERATELY not a member of it.
INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('a7200000-0000-4000-8000-0000000000c1', 'a7200000-0000-4000-8000-000000000001',
        'a7200000-0000-4000-8000-0000000000a1', 'owner', 'active', NOW());

INSERT INTO projects (id, name, designer_id, created_by)
VALUES ('a7200000-0000-4000-8000-0000000000e1', 'Unbilled House',
        'a7200000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000001');

-- The vendor holds a roster seat (so they may author time) and nothing else.
-- The designer deliberately gets NO project_team_members row — a seat of their
-- own would make can_view_profile()'s "same project team" leg true and the
-- precondition in case (a1) would stop being true.
INSERT INTO project_team_members (id, project_id, user_id, role, assigned_by)
VALUES ('a7200000-0000-4000-8000-0000000000f1', 'a7200000-0000-4000-8000-0000000000e1',
        'a7200000-0000-4000-8000-000000000002', 'vendor', 'a7200000-0000-4000-8000-000000000001');

-- One rated entry and one rate-less entry, both authored by the vendor.
INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, hourly_rate_cents, source)
VALUES
  ('a7200000-0000-4000-8000-0000000000b1', 'a7200000-0000-4000-8000-0000000000e1',
   'a7200000-0000-4000-8000-000000000002', NOW() - INTERVAL '2 days', 90, true, 15000, 'field_manual'),
  ('a7200000-0000-4000-8000-0000000000b2', 'a7200000-0000-4000-8000-0000000000e1',
   'a7200000-0000-4000-8000-000000000002', NOW() - INTERVAL '1 day', 30, true, NULL, 'manual_entry');

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

-- ─── (a) the dropped-profiles-join payoff ──────────────────────────────────
DO $$
DECLARE
  v_profiles INTEGER;
  v_rows     INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('a7200000-0000-4000-8000-000000000001');

  SELECT count(*) INTO v_profiles FROM profiles
   WHERE id = 'a7200000-0000-4000-8000-000000000002';
  ASSERT v_profiles = 0,
    'FAIL a1 (precondition): the designer must NOT be able to read the vendor''s profile, got ' || v_profiles;

  SELECT count(*) INTO v_rows FROM project_unbilled_time
   WHERE project_id = 'a7200000-0000-4000-8000-0000000000e1';

  PERFORM pg_temp.reset_role();

  ASSERT v_rows = 2,
    'FAIL a2: both vendor entries must appear in project_unbilled_time (the INNER JOIN on profiles dropped them), got ' || v_rows;

  RAISE NOTICE 'time_unbilled_view_repair: case (a) passed.';
END
$$;

-- ─── (b) one rate source — the printed rate priced the line ────────────────
DO $$
DECLARE
  v_bad      INTEGER;
  v_rate     INTEGER;
  v_amount   INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('a7200000-0000-4000-8000-000000000001');

  SELECT count(*) INTO v_bad FROM project_unbilled_time
   WHERE round(duration_minutes / 60.0 * resolved_rate_cents)::int IS DISTINCT FROM amount_cents;
  ASSERT v_bad = 0,
    'FAIL b1: every row''s resolved_rate_cents × duration must reconcile with amount_cents, offending rows: ' || v_bad;

  SELECT resolved_rate_cents, amount_cents INTO v_rate, v_amount
  FROM project_unbilled_time WHERE id = 'a7200000-0000-4000-8000-0000000000b1';
  ASSERT v_rate = 15000,
    'FAIL b2: the rated entry must print its own snapshot rate, got ' || COALESCE(v_rate::text, 'NULL');
  ASSERT v_amount = 22500,
    'FAIL b3: 90 min at $150/h is 22500 cents, got ' || COALESCE(v_amount::text, 'NULL');

  SELECT resolved_rate_cents, amount_cents INTO v_rate, v_amount
  FROM project_unbilled_time WHERE id = 'a7200000-0000-4000-8000-0000000000b2';
  ASSERT v_rate = 0 AND v_amount = 0,
    'FAIL b4: a rate-less entry must read 0/0, not a legacy chain value, got '
    || COALESCE(v_rate::text, 'NULL') || '/' || COALESCE(v_amount::text, 'NULL');

  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'time_unbilled_view_repair: case (b) passed.';
  RAISE NOTICE 'All time_unbilled_view_repair assertions passed.';
END
$$;

ROLLBACK;
