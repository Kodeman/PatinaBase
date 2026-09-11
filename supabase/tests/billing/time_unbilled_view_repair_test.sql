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
-- Case (c) is the DESIGN-SERVICES arm, added in review round 1 (finding m1).
-- Cases (a) and (b) only carry non-services fixtures, where
-- rated_amount_cents is always duration x the row's own hourly_rate_cents
-- (00578:2648-2654). The rows the repair is riskiest for are the AUTHORITY-rated
-- ones, where hourly_rate_cents comes from a signed
-- project_billing_authority_rates row and a row over the signed ceiling is sent
-- to pending_authorization. The only test that guarded that arm —
-- supabase/tests/commercial/design_services_authority_test.sql:221,349,362 —
-- never reaches its project_unbilled_time asserts: it aborts ~44 lines earlier
-- inside _countersign_design_services_agreement_impl (a pre-existing failure,
-- documented in supabase/tests/KNOWN_FAILURES.md). So the guard lives here, in a
-- suite that runs, and does not depend on that file being repaired:
--   (c1) precondition — the entry really is authority-rated (billing_authority_id
--        and authority_rate_id are stamped, hourly_rate_cents is the signed rate,
--        and nothing client-supplied was sent).
--   (c2) it appears in project_unbilled_time.
--   (c3) on it, round(duration_minutes/60.0 * resolved_rate_cents) = amount_cents.
--   (c4) an over-ceiling sibling is pending_authorization and does NOT appear.
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

-- ─── design-services fixtures (case c) ────────────────────────────────────
-- A second studio, so case (a)'s profile-visibility precondition is untouched.
-- Written directly rather than through the countersign ceremony: the commercial
-- ledger's write guard (00414's guard_commercial_ledger_write) admits
-- current_user = 'postgres', which is this file's session role, and the ceremony
-- is what the commercial suite exercises.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('a7210000-0000-4000-8000-000000000001', 'unbilled-svc-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a7210000-0000-4000-8000-000000000002', 'unbilled-svc-support@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('a7210000-0000-4000-8000-000000000001', 'unbilled-svc-designer@test.invalid', 'Services Designer', NOW(), NOW()),
  ('a7210000-0000-4000-8000-000000000002', 'unbilled-svc-support@test.invalid',  'Services Support',  NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
UPDATE profiles SET is_designer = true WHERE id = 'a7210000-0000-4000-8000-000000000001';

INSERT INTO organizations (id, type, name, slug)
VALUES ('a7210000-0000-4000-8000-0000000000a1', 'design_studio', 'Services Studio', 'unbilled-services-studio-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('a7210000-0000-4000-8000-0000000000c1', 'a7210000-0000-4000-8000-000000000001',
   'a7210000-0000-4000-8000-0000000000a1', 'owner',  'active', NOW()),
  ('a7210000-0000-4000-8000-0000000000c2', 'a7210000-0000-4000-8000-000000000002',
   'a7210000-0000-4000-8000-0000000000a1', 'member', 'active', NOW());

INSERT INTO projects (id, name, designer_id, created_by)
VALUES ('a7210000-0000-4000-8000-0000000000e1', 'Services House',
        'a7210000-0000-4000-8000-000000000001', 'a7210000-0000-4000-8000-000000000001');

-- The author is a rostered support designer: the role the signed rate card names.
INSERT INTO project_team_members (id, project_id, user_id, role, assigned_by)
VALUES ('a7210000-0000-4000-8000-0000000000f1', 'a7210000-0000-4000-8000-0000000000e1',
        'a7210000-0000-4000-8000-000000000002', 'support_designer',
        'a7210000-0000-4000-8000-000000000001');

-- The proposal stays `draft`: guard_commercial_authored_child (00575) freezes
-- proposal_service_rates the moment it leaves draft, and nothing in the rate
-- path the classifier walks reads proposals.status.
INSERT INTO proposals (id, designer_id, client_id, title, status, total_amount)
VALUES ('a7210000-0000-4000-8000-0000000000d1', 'a7210000-0000-4000-8000-000000000001',
        NULL, 'Services agreement', 'draft', 0);

-- The signed rate card: $100/h for a support designer, effective before the work.
INSERT INTO proposal_service_rates (id, proposal_id, version, role_name, hourly_rate_cents, sort_order, effective_at)
VALUES ('a7210000-0000-4000-8000-0000000000d2', 'a7210000-0000-4000-8000-0000000000d1',
        1, 'Support designer', 10000, 0, NOW() - INTERVAL '30 days');

INSERT INTO project_commercial_documents (
  id, project_id, proposal_id, document_kind, is_origin, created_by, bound_at, executed_at
) VALUES (
  'a7210000-0000-4000-8000-0000000000d3', 'a7210000-0000-4000-8000-0000000000e1',
  'a7210000-0000-4000-8000-0000000000d1', 'design_services', true,
  'a7210000-0000-4000-8000-000000000001', NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days'
);

-- The ceiling is deliberately tight: it authorizes the first 120-minute entry
-- ($200) and sends the second over the top, which is case (c4).
INSERT INTO project_billing_authorities (
  id, project_id, commercial_document_id, source_proposal_id, billing_ceiling_cents,
  retainer_amount_cents, retainer_activation_policy, billing_cadence, effective_at, status
) VALUES (
  'a7210000-0000-4000-8000-0000000000d4', 'a7210000-0000-4000-8000-0000000000e1',
  'a7210000-0000-4000-8000-0000000000d3', 'a7210000-0000-4000-8000-0000000000d1',
  25000, 0, 'immediate', 'monthly', NOW() - INTERVAL '30 days', 'active'
);

INSERT INTO project_billing_authority_rates (
  id, billing_authority_id, source_rate_id, version, role_name, hourly_rate_cents
) VALUES (
  'a7210000-0000-4000-8000-0000000000d5', 'a7210000-0000-4000-8000-0000000000d4',
  'a7210000-0000-4000-8000-0000000000d2', 1, 'Support designer', 10000
);

-- Two entries, NEITHER carrying a client-supplied rate: the only rate available
-- to the classifier is the signed authority rate.
INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
VALUES
  ('a7210000-0000-4000-8000-0000000000b1', 'a7210000-0000-4000-8000-0000000000e1',
   'a7210000-0000-4000-8000-000000000002', NOW() - INTERVAL '3 days', 120, true, 'manual_entry'),
  ('a7210000-0000-4000-8000-0000000000b2', 'a7210000-0000-4000-8000-0000000000e1',
   'a7210000-0000-4000-8000-000000000002', NOW() - INTERVAL '2 days', 120, true, 'manual_entry');

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
END
$$;

-- ─── (c) the authority-rated arm (design services) ─────────────────────────
DO $$
DECLARE
  v_authority UUID;
  v_rate_id   UUID;
  v_rate      INTEGER;
  v_amount    INTEGER;
  v_state     TEXT;
  v_rows      INTEGER;
BEGIN
  -- (c1) precondition: the row is priced by the SIGNED authority, not by
  -- anything the caller sent (no hourly_rate_cents was supplied at all).
  SELECT billing_authority_id, authority_rate_id, hourly_rate_cents, rated_amount_cents, billing_state
    INTO v_authority, v_rate_id, v_rate, v_amount, v_state
  FROM project_time_entries WHERE id = 'a7210000-0000-4000-8000-0000000000b1';
  ASSERT v_authority = 'a7210000-0000-4000-8000-0000000000d4',
    'FAIL c1a: the entry must bind the signed authority, got ' || COALESCE(v_authority::text, 'NULL');
  ASSERT v_rate_id = 'a7210000-0000-4000-8000-0000000000d5',
    'FAIL c1b: the entry must bind the signed rate row, got ' || COALESCE(v_rate_id::text, 'NULL');
  ASSERT v_rate = 10000,
    'FAIL c1c: the rate must be the authority rate, got ' || COALESCE(v_rate::text, 'NULL');
  ASSERT v_state = 'authorized',
    'FAIL c1d: the under-ceiling entry must be authorized, got ' || COALESCE(v_state, 'NULL');
  ASSERT v_amount = 20000,
    'FAIL c1e: 120 min at $100/h is 20000 cents, got ' || COALESCE(v_amount::text, 'NULL');

  -- (c4) precondition: its sibling is over the signed ceiling.
  SELECT billing_state INTO v_state
  FROM project_time_entries WHERE id = 'a7210000-0000-4000-8000-0000000000b2';
  ASSERT v_state = 'pending_authorization',
    'FAIL c4a: the over-ceiling entry must be pending_authorization, got ' || COALESCE(v_state, 'NULL');

  PERFORM pg_temp.assume_user('a7210000-0000-4000-8000-000000000001');

  -- (c2) the authority-rated entry is in the view.
  SELECT count(*) INTO v_rows FROM project_unbilled_time
   WHERE id = 'a7210000-0000-4000-8000-0000000000b1';
  ASSERT v_rows = 1,
    'FAIL c2: the authority-rated entry must appear in project_unbilled_time, got ' || v_rows;

  -- (c3) the rate printed priced the line — on an AUTHORITY rate, not a
  -- duration x client-supplied rate.
  SELECT resolved_rate_cents, amount_cents INTO v_rate, v_amount
  FROM project_unbilled_time WHERE id = 'a7210000-0000-4000-8000-0000000000b1';
  ASSERT v_rate = 10000,
    'FAIL c3a: the view must print the authority rate, got ' || COALESCE(v_rate::text, 'NULL');
  ASSERT round(120 / 60.0 * v_rate)::int = v_amount,
    'FAIL c3b: round(duration/60 * resolved_rate_cents) must equal amount_cents, got '
    || COALESCE(v_amount::text, 'NULL');

  -- (c4) the over-ceiling entry is filtered out by billing_state.
  SELECT count(*) INTO v_rows FROM project_unbilled_time
   WHERE id = 'a7210000-0000-4000-8000-0000000000b2';
  ASSERT v_rows = 0,
    'FAIL c4b: an over-ceiling entry must not appear in project_unbilled_time, got ' || v_rows;

  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'time_unbilled_view_repair: case (c) passed.';
  RAISE NOTICE 'All time_unbilled_view_repair assertions passed.';
END
$$;

ROLLBACK;
