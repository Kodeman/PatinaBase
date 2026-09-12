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
--   (c5) the SAME "every row reconciles" sweep as (b1), run a second time as the
--        SERVICES studio's designer. Added in review round 2 (finding m3):
--        project_unbilled_time is security_invoker and the two studios are
--        deliberately separate, so (b1)'s sweep sees TWO rows, not four — it is
--        not the "every row" guard its message implies. This is the other half.
--
-- Case (d) is the LEGACY RATE-LESS arm, added in review round 2 (finding B1).
-- 00596's "one rate source" is a repair for authority-rated rows and a WRITE-DOWN
-- for legacy ones. An un-invoiced, authorized, billable, rate-less entry on a
-- project carrying change_order_terms.hourly_rate_cents used to report
-- resolved_rate = that rate and amount = duration x that rate through 00412's
-- chain; after 00596 it reports 0/0, because the classifier's non-services branch
-- (00578:2648-2654) leaves both hourly_rate_cents and rated_amount_cents NULL
-- when no rate was supplied, and useCreateTimeEntry cannot supply one. The Hours
-- ledger, useStudioTimeReport's studio balance and the invoice composer's time
-- line all read this view, so such a row now bills $0 — and claim_time_entries
-- then invoice-locks it.
--
-- Measured on Strata read-only, 2026-09-11: 88 entries total, 14 unbilled +
-- authorized + billable + completed, 4 of them rate-less, 8 projects carrying a
-- change-order rate, 0 profiles carrying default_hourly_rate_cents. Exactly ONE
-- row intersects — 60 min on "Kodys Test Project" at $175/h, i.e. $175.00 — so
-- today's live exposure is one row on a test project, not a studio's money.
--
-- WHICH answer is correct is governance, not code, and is recorded as OWED ruling
-- HT-6-a in artifacts/hour-tracking-2026-09-11/rulings.md: either stamp
-- hourly_rate_cents once on exactly those rows from the change-order rate
-- (PRESERVING the amount, arguably what P-4's "unbilled history keep their
-- amounts" requires), or accept $0 explicitly with Leah told before the deploy.
-- Case (d) pins TODAY'S SHIPPED BEHAVIOUR (0/0) and names the pre-00596 figures
-- in its own assert messages, so a ruling the other way flips one assert rather
-- than discovering an untested path:
--   (d1) precondition — the project carries change_order_terms.hourly_rate_cents
--        and the entry carries no rate of its own, yet is authorized.
--   (d2) the view reports resolved_rate_cents = 0 and amount_cents = 0.
--   (d3) the size of the write-down, computed from the project's own
--        change_order_terms, is stated (not asserted away) so the number is in
--        the run output.
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
  ('a7200000-0000-4000-8000-000000000002', 'unbilled-vendor@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  -- Review round 1 (W1-R1-16): an active studio member who logs through the LIVE
  -- write path, so case (b)'s reconciliation is proved against a SERVER-RATED row
  -- and not only against pre-W1 snapshots written with the classifier disabled.
  ('a7200000-0000-4000-8000-000000000003', 'unbilled-member@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('a7200000-0000-4000-8000-000000000001', 'unbilled-designer@test.invalid', 'Unbilled Designer', NOW(), NOW()),
  ('a7200000-0000-4000-8000-000000000002', 'unbilled-vendor@test.invalid',   'Unbilled Vendor',   NOW(), NOW()),
  ('a7200000-0000-4000-8000-000000000003', 'unbilled-member@test.invalid',   'Unbilled Member',   NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
UPDATE profiles SET is_designer = true WHERE id = 'a7200000-0000-4000-8000-000000000001';

INSERT INTO organizations (id, type, name, slug)
VALUES ('a7200000-0000-4000-8000-0000000000a1', 'design_studio', 'Unbilled Studio', 'unbilled-studio-test');

-- The designer owns the studio. The vendor is DELIBERATELY not a member of it.
INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('a7200000-0000-4000-8000-0000000000c1', 'a7200000-0000-4000-8000-000000000001',
        'a7200000-0000-4000-8000-0000000000a1', 'owner', 'active', NOW()),
       ('a7200000-0000-4000-8000-0000000000c3', 'a7200000-0000-4000-8000-000000000003',
        'a7200000-0000-4000-8000-0000000000a1', 'member', 'active', NOW());

-- Her studio rate, so the classifier has an answer for her. Written as postgres:
-- studio_member_rates' own authorization is asserted per role in
-- supabase/tests/rls/studio_member_rates_test.sql, not here.
INSERT INTO studio_member_rates (id, studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES ('a7200000-0000-4000-8000-0000000000d3', 'a7200000-0000-4000-8000-0000000000a1',
        'a7200000-0000-4000-8000-000000000003', 12000, CURRENT_DATE - 60,
        'a7200000-0000-4000-8000-000000000001');

-- studio_id is NAMED (HT-3-a step 1, the shape every project created since 00563
-- carries). Without it the `UPDATE profiles SET is_designer = true` above — which
-- fires 00295's fc_provision_studio_on_designer while she belongs to no
-- organization — leaves her owning TWO studios whose owner seats carry the identical
-- transaction timestamp, so HT-3-a's "oldest owner membership" key ties and the
-- studio.id determinism backstop decides between a fixed uuid and a generated one.
-- The live0 assert below would then be a coin flip rather than a measurement.
INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES ('a7200000-0000-4000-8000-0000000000e1', 'Unbilled House',
        'a7200000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000001',
        'a7200000-0000-4000-8000-0000000000a1');

-- The vendor holds a roster seat (so they may author time) and nothing else.
-- The designer deliberately gets NO project_team_members row — a seat of their
-- own would make can_view_profile()'s "same project team" leg true and the
-- precondition in case (a1) would stop being true.
INSERT INTO project_team_members (id, project_id, user_id, role, assigned_by)
VALUES ('a7200000-0000-4000-8000-0000000000f1', 'a7200000-0000-4000-8000-0000000000e1',
        'a7200000-0000-4000-8000-000000000002', 'vendor', 'a7200000-0000-4000-8000-000000000001');

-- One rated entry and one rate-less entry, both authored by the vendor.
--
-- AMENDED BY W1 (00601): the classifier now owns hourly_rate_cents on every
-- branch (HT-1 — "a client-supplied rate is discarded"), so a supplied 15000 on
-- a non-services project is replaced by the resolver's answer, and the vendor has
-- no studio rate card. These two rows are therefore written with the classifier
-- switched off for the insert, which is what a PRE-W1 row actually is: a snapshot
-- rate of its own, already on the row. That is exactly the state case (b) is
-- about — whether the VIEW prints the rate that priced the line — and it keeps
-- (b4)'s rate-less row rate-less. Giving the vendor a studio_member_rates row
-- instead would have rated BOTH entries and destroyed (b4). ALTER TABLE …
-- DISABLE TRIGGER is transactional, so the file's ROLLBACK restores it.
ALTER TABLE project_time_entries
  DISABLE TRIGGER aac_classify_project_time_entry_authority_trg;
INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, hourly_rate_cents, rated_amount_cents, billing_state, source)
VALUES
  ('a7200000-0000-4000-8000-0000000000b1', 'a7200000-0000-4000-8000-0000000000e1',
   'a7200000-0000-4000-8000-000000000002', NOW() - INTERVAL '2 days', 90, true, 15000, 22500, 'authorized', 'field_manual'),
  ('a7200000-0000-4000-8000-0000000000b2', 'a7200000-0000-4000-8000-0000000000e1',
   'a7200000-0000-4000-8000-000000000002', NOW() - INTERVAL '1 day', 30, true, NULL, NULL, 'authorized', 'manual_entry');
ALTER TABLE project_time_entries
  ENABLE TRIGGER aac_classify_project_time_entry_authority_trg;

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

-- ─── legacy rate-less fixtures (case d) ───────────────────────────────────
-- A THIRD studio, so neither (a)'s profile-visibility precondition nor (b1)'s
-- sweep changes meaning. A NON-services project (no project_commercial_documents
-- row) carrying the scope builder's DEFAULT change-order rate — 17500, the
-- literal in change-order-terms-editor.tsx's DEFAULT_TERMS, which
-- activate_proposal_as_project carries into projects.change_order_terms on every
-- activation. The entry sends NO hourly_rate_cents, which is what
-- useCreateTimeEntry does today (CreateTimeEntryInput has no rate field at all).
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('a7220000-0000-4000-8000-000000000001', 'unbilled-legacy-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('a7220000-0000-4000-8000-000000000001', 'unbilled-legacy-designer@test.invalid', 'Legacy Designer', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
UPDATE profiles SET is_designer = true WHERE id = 'a7220000-0000-4000-8000-000000000001';

INSERT INTO organizations (id, type, name, slug)
VALUES ('a7220000-0000-4000-8000-0000000000a1', 'design_studio', 'Legacy Studio', 'unbilled-legacy-studio-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('a7220000-0000-4000-8000-0000000000c1', 'a7220000-0000-4000-8000-000000000001',
        'a7220000-0000-4000-8000-0000000000a1', 'owner', 'active', NOW());

INSERT INTO projects (id, name, designer_id, created_by, change_order_terms)
VALUES ('a7220000-0000-4000-8000-0000000000e1', 'Legacy House',
        'a7220000-0000-4000-8000-000000000001', 'a7220000-0000-4000-8000-000000000001',
        jsonb_build_object(
          'hourly_rate_cents', 17500,
          'minimum_fee_cents', 25000,
          'approval_required', true
        ));

-- 120 billable minutes, no rate of any kind supplied.
INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
VALUES ('a7220000-0000-4000-8000-0000000000b1', 'a7220000-0000-4000-8000-0000000000e1',
        'a7220000-0000-4000-8000-000000000001', NOW() - INTERVAL '4 days', 120, true, 'timer_auto');

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

-- ─── the LIVE-PATH sibling row (W1-R1-16) ──────────────────────────────────
-- Case (b)'s two rows are written with aac_classify_project_time_entry_authority_trg
-- DISABLED, which is the honest way to write a PRE-W1 snapshot — but it means case
-- (b) no longer exercises a live write path and can no longer fail on a classifier
-- regression. This row is the other half: the studio member logs it HERSELF,
-- through every trigger, and the classifier rates it from her studio_member_rates
-- row. 45 min at $120/h = 9000 cents, so (b1)'s reconciliation sweep now covers a
-- server-rated row as well as two snapshots.
DO $$
BEGIN
  PERFORM pg_temp.assume_user('a7200000-0000-4000-8000-000000000003');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('a7200000-0000-4000-8000-0000000000b3', 'a7200000-0000-4000-8000-0000000000e1',
          'a7200000-0000-4000-8000-000000000003', NOW() - INTERVAL '3 days', 45, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  ASSERT (SELECT hourly_rate_cents FROM project_time_entries
           WHERE id = 'a7200000-0000-4000-8000-0000000000b3') = 12000,
    'FAIL live0 (W1-R1-16): the live path must rate this row from studio_member_rates, got '
    || COALESCE((SELECT hourly_rate_cents::text FROM project_time_entries
                  WHERE id = 'a7200000-0000-4000-8000-0000000000b3'), 'NULL');
  ASSERT (SELECT rate_source FROM project_time_entries
           WHERE id = 'a7200000-0000-4000-8000-0000000000b3') = 'studio_member',
    'FAIL live1 (W1-R1-16): the server-rated row must carry its provenance';

  RAISE NOTICE 'time_unbilled_view_repair: live-path sibling row written.';
END
$$;

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

  ASSERT v_rows = 3,
    'FAIL a2: both vendor entries must appear in project_unbilled_time (the INNER JOIN on '
    'profiles dropped them), alongside the live-path member row, got ' || v_rows;

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

  -- W1-R1-16: the same reconciliation, on the row the LIVE path rated.
  SELECT resolved_rate_cents, amount_cents INTO v_rate, v_amount
  FROM project_unbilled_time WHERE id = 'a7200000-0000-4000-8000-0000000000b3';
  ASSERT v_rate = 12000 AND v_amount = 9000,
    'FAIL b5 (W1-R1-16): the server-rated row must print the rate that priced it — 45 min at '
    '12000/h is 9000 cents; got ' || COALESCE(v_rate::text, 'NULL') || '/'
    || COALESCE(v_amount::text, 'NULL');

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

  -- (c5) the (b1) sweep again, from inside THIS studio. (b1) runs as the
  -- non-services designer and security_invoker narrows it to that studio's rows,
  -- so without this the authority-rated rows were never in an "every row" sweep.
  SELECT count(*) INTO v_rows FROM project_unbilled_time
   WHERE round(duration_minutes / 60.0 * resolved_rate_cents)::int IS DISTINCT FROM amount_cents;
  ASSERT v_rows = 0,
    'FAIL c5a: every row visible to the SERVICES designer must reconcile, offending rows: ' || v_rows;

  -- …and prove the sweep actually saw something, so c5a cannot pass on an empty
  -- result set (which is exactly how (b1) silently missed this studio).
  SELECT count(*) INTO v_rows FROM project_unbilled_time;
  ASSERT v_rows >= 1,
    'FAIL c5b: the services designer must see at least her own authorized row, got ' || v_rows;

  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'time_unbilled_view_repair: case (c) passed.';
END
$$;

-- ─── (d) the legacy rate-less arm — a WRITE-DOWN, pinned to owed HT-6-a ─────
DO $$
DECLARE
  v_co_rate  INTEGER;
  v_rate     INTEGER;
  v_amount   INTEGER;
  v_stored   INTEGER;
  v_state    TEXT;
  v_pre_rate INTEGER;
  v_pre_amt  INTEGER;
BEGIN
  -- (d1) preconditions: a change-order rate on the project, none on the row.
  SELECT NULLIF((p.change_order_terms->>'hourly_rate_cents')::int, 0) INTO v_co_rate
  FROM projects p WHERE p.id = 'a7220000-0000-4000-8000-0000000000e1';
  ASSERT v_co_rate = 17500,
    'FAIL d1a: the project must carry the DEFAULT_TERMS change-order rate, got '
    || COALESCE(v_co_rate::text, 'NULL');

  SELECT hourly_rate_cents, rated_amount_cents, billing_state
    INTO v_rate, v_stored, v_state
  FROM project_time_entries WHERE id = 'a7220000-0000-4000-8000-0000000000b1';
  ASSERT v_rate IS NULL,
    'FAIL d1b: the entry must carry NO rate of its own (useCreateTimeEntry cannot send one), got '
    || v_rate::text;
  ASSERT v_stored IS NULL,
    'FAIL d1c: the non-services classifier branch leaves rated_amount_cents NULL when no rate was supplied, got '
    || v_stored::text;
  ASSERT v_state = 'authorized',
    'FAIL d1d: a non-services entry is authorized (00578:2648-2650), got ' || COALESCE(v_state, 'NULL');

  PERFORM pg_temp.assume_user('a7220000-0000-4000-8000-000000000001');

  -- (d2) TODAY'S SHIPPED ANSWER. 00596 cut the change-order leg, so the view
  -- reports nothing for this row. If HT-6-a is ruled the other way — stamp
  -- hourly_rate_cents on exactly these rows from the change-order rate — these
  -- two asserts become 17500 / 35000 and nothing else in this file moves.
  SELECT resolved_rate_cents, amount_cents INTO v_rate, v_amount
  FROM project_unbilled_time WHERE id = 'a7220000-0000-4000-8000-0000000000b1';
  ASSERT v_rate = 0,
    'FAIL d2a (HT-6-a, unruled): 00596 reports no rate for a legacy rate-less entry; expected 0, got '
    || COALESCE(v_rate::text, 'NULL');
  ASSERT v_amount = 0,
    'FAIL d2b (HT-6-a, unruled): 00596 reports no money for a legacy rate-less entry; expected 0, got '
    || COALESCE(v_amount::text, 'NULL');

  PERFORM pg_temp.reset_role();

  -- (d3) state the write-down rather than asserting it away: this is what 00412's
  -- chain reported for the same row, and what the Hours ledger, the studio
  -- unbilled balance and the composer's time line printed before 00596.
  v_pre_rate := v_co_rate;
  v_pre_amt  := round(120 / 60.0 * v_co_rate)::int;
  RAISE NOTICE 'time_unbilled_view_repair (d3): pre-00596 this row read rate=% amount=%; post-00596 it reads 0/0 — owed ruling HT-6-a.',
    v_pre_rate, v_pre_amt;

  RAISE NOTICE 'time_unbilled_view_repair: case (d) passed.';
  RAISE NOTICE 'All time_unbilled_view_repair assertions passed.';
END
$$;

ROLLBACK;
