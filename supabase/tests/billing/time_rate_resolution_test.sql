-- ═══════════════════════════════════════════════════════════════════════════
-- Rate truth: the server owns the rate on every project kind
-- (migrations 00598 studio_member_rates · 00599 resolve_time_rate_cents ·
--  00600 rate provenance + the derived-field freeze · 00601 the classifier)
--
-- Covers, per the W1 plan:
--   (a) HT-1 — a browser-supplied hourly_rate_cents on a NON-SERVICES project is
--       DISCARDED and replaced by the resolver's answer (the 00578:2648-2654
--       branch, which used to price the hour from whatever the client sent).
--   (b) a caller-supplied rate_source on INSERT RAISES (§0.7c), and so does a
--       caller-supplied rated_amount_cents. hourly_rate_cents is deliberately
--       NOT a raise — see 00600's banner and case (a).
--   (c) a services entry with NO role match gets the studio rate and stays
--       pending_authorization, instead of being NULL-stranded for ever
--       (00578:2765-2772 vs the 00577:2493-2496 promotion filter).
--   (d) the no-authority-covering-started_at branch (00578:2694-2700) is
--       server-owned too.
--   (e) HT-41 — a member holding TWO roster roles who picks one is priced at
--       that role's signed card.
--   (f) HT-41 + CR-21 — the same member with NO pick falls to the studio rate
--       rather than to NULL (00578's count(DISTINCT role) = 1 collapse).
--   (g) a rate_role the member does not hold RAISES.
--   (h) §0.8 — rate_source and rate_role are immutable on an already-classified
--       row, in BOTH the watched-column list and the IS DISTINCT FROM chain.
--   (i) P-4 — an UPDATE of a legacy row whose rate the chain cannot explain
--       KEEPS its amount (the write-down 00596 taught us to look for).
--
-- Every write runs as the member under `SET LOCAL ROLE authenticated` + a JWT
-- claim: the guard returns early for current_user = 'postgres' (00412:2354), so
-- a test written as postgres would assert nothing.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/billing/time_rate_resolution_test.sql
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

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

-- ─── fixtures (as postgres: the guards return early for this role) ─────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('b1100000-0000-4000-8000-000000000001', 'rate-owner@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-000000000002', 'rate-hire@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-000000000003', 'rate-twohat@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('b1100000-0000-4000-8000-000000000001', 'rate-owner@test.invalid',  'Rate Owner',  true,  NOW(), NOW()),
  ('b1100000-0000-4000-8000-000000000002', 'rate-hire@test.invalid',   'Rate Hire',   true,  NOW(), NOW()),
  ('b1100000-0000-4000-8000-000000000003', 'rate-twohat@test.invalid', 'Rate Twohat', false, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('b1100000-0000-4000-8000-0000000000a1', 'design_studio', 'Rate Studio', 'rate-truth-test', 'active');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('b1100000-0000-4000-8000-0000000000c1', 'b1100000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-0000000000a1', 'owner',  'active', NOW()),
  ('b1100000-0000-4000-8000-0000000000c2', 'b1100000-0000-4000-8000-000000000002', 'b1100000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('b1100000-0000-4000-8000-0000000000c3', 'b1100000-0000-4000-8000-000000000003', 'b1100000-0000-4000-8000-0000000000a1', 'member', 'active', NOW());

-- P1 plain (non-services) · P2 services, no card for the hire's role ·
-- P3 services, cards named for both of the two-hat member's roles.
INSERT INTO public.projects (id, name, designer_id, created_by)
VALUES
  ('b1100000-0000-4000-8000-0000000000e1', 'Plain House',    'b1100000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001'),
  ('b1100000-0000-4000-8000-0000000000e2', 'Services House', 'b1100000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001'),
  ('b1100000-0000-4000-8000-0000000000e3', 'Two-hat House',  'b1100000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001');

INSERT INTO public.proposals (id, designer_id, title, status, document_kind)
VALUES
  ('b1100000-0000-4000-8000-0000000000d2', 'b1100000-0000-4000-8000-000000000001', 'Services agreement', 'draft', 'design_services'),
  ('b1100000-0000-4000-8000-0000000000d3', 'b1100000-0000-4000-8000-000000000001', 'Two-hat agreement',  'draft', 'design_services');

-- The proposals stay in 'draft': guard_commercial_authored_child (00412:633-654)
-- forbids writing proposal_service_rates once a proposal leaves draft, and the
-- real ceremony (countersign_design_services_agreement) is not what this file
-- is testing. Nothing below reads proposals.status.

INSERT INTO public.proposal_service_rates (id, proposal_id, version, role_name, hourly_rate_cents, sort_order, effective_at)
VALUES
  ('b1100000-0000-4000-8000-00000000f201', 'b1100000-0000-4000-8000-0000000000d2', 1, 'Principal',     30000, 0, NOW() - INTERVAL '20 days'),
  ('b1100000-0000-4000-8000-00000000f202', 'b1100000-0000-4000-8000-0000000000d2', 1, 'Junior',        10000, 1, NOW() - INTERVAL '20 days'),
  ('b1100000-0000-4000-8000-00000000f301', 'b1100000-0000-4000-8000-0000000000d3', 1, 'Lead designer', 25000, 0, NOW() - INTERVAL '20 days'),
  ('b1100000-0000-4000-8000-00000000f302', 'b1100000-0000-4000-8000-0000000000d3', 1, 'Vendor',         9000, 1, NOW() - INTERVAL '20 days');

INSERT INTO public.project_commercial_documents
  (id, project_id, proposal_id, document_kind, is_origin, created_by, executed_at)
VALUES
  ('b1100000-0000-4000-8000-00000000cd02', 'b1100000-0000-4000-8000-0000000000e2', 'b1100000-0000-4000-8000-0000000000d2',
   'design_services', true, 'b1100000-0000-4000-8000-000000000001', NOW() - INTERVAL '5 days'),
  ('b1100000-0000-4000-8000-00000000cd03', 'b1100000-0000-4000-8000-0000000000e3', 'b1100000-0000-4000-8000-0000000000d3',
   'design_services', true, 'b1100000-0000-4000-8000-000000000001', NOW() - INTERVAL '5 days');

-- retainer_activation_policy 'immediate' so retainer gating is not what the
-- billing_state asserts below are measuring.
INSERT INTO public.project_billing_authorities
  (id, project_id, commercial_document_id, source_proposal_id, billing_ceiling_cents,
   retainer_amount_cents, retainer_activation_policy, billing_cadence, effective_at, status)
VALUES
  ('b1100000-0000-4000-8000-00000000ba02', 'b1100000-0000-4000-8000-0000000000e2', 'b1100000-0000-4000-8000-00000000cd02',
   'b1100000-0000-4000-8000-0000000000d2', 100000000, 0, 'immediate', 'monthly', NOW() - INTERVAL '5 days', 'active'),
  ('b1100000-0000-4000-8000-00000000ba03', 'b1100000-0000-4000-8000-0000000000e3', 'b1100000-0000-4000-8000-00000000cd03',
   'b1100000-0000-4000-8000-0000000000d3', 100000000, 0, 'immediate', 'monthly', NOW() - INTERVAL '5 days', 'active');

INSERT INTO public.project_billing_authority_rates
  (id, billing_authority_id, source_rate_id, version, role_name, hourly_rate_cents)
VALUES
  ('b1100000-0000-4000-8000-00000000aa21', 'b1100000-0000-4000-8000-00000000ba02', 'b1100000-0000-4000-8000-00000000f201', 1, 'Principal',     30000),
  ('b1100000-0000-4000-8000-00000000aa22', 'b1100000-0000-4000-8000-00000000ba02', 'b1100000-0000-4000-8000-00000000f202', 1, 'Junior',        10000),
  ('b1100000-0000-4000-8000-00000000aa31', 'b1100000-0000-4000-8000-00000000ba03', 'b1100000-0000-4000-8000-00000000f301', 1, 'Lead designer', 25000),
  ('b1100000-0000-4000-8000-00000000aa32', 'b1100000-0000-4000-8000-00000000ba03', 'b1100000-0000-4000-8000-00000000f302', 1, 'Vendor',         9000);

-- The two-hat member holds both roles on P3 (so 00597 seats nobody there).
INSERT INTO public.project_team_members (id, project_id, user_id, role, assigned_by)
VALUES
  ('b1100000-0000-4000-8000-00000000dd31', 'b1100000-0000-4000-8000-0000000000e3', 'b1100000-0000-4000-8000-000000000003', 'lead_designer', 'b1100000-0000-4000-8000-000000000001'),
  ('b1100000-0000-4000-8000-00000000dd32', 'b1100000-0000-4000-8000-0000000000e3', 'b1100000-0000-4000-8000-000000000003', 'vendor',        'b1100000-0000-4000-8000-000000000001');

-- ─── the studio's per-member rates, written by the owner through RLS ───────
DO $$
BEGIN
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000001');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES
    ('b1100000-0000-4000-8000-0000000000a1', 'b1100000-0000-4000-8000-000000000002', 15000, CURRENT_DATE - 30, 'b1100000-0000-4000-8000-000000000001'),
    ('b1100000-0000-4000-8000-0000000000a1', 'b1100000-0000-4000-8000-000000000003', 12000, CURRENT_DATE - 30, 'b1100000-0000-4000-8000-000000000001');
  PERFORM pg_temp.reset_role();
  RAISE NOTICE 'time_rate_resolution: studio rates seeded by the owner.';
END
$$;

-- ─── (a) HT-1: the browser's rate is discarded on a NON-SERVICES project ───
DO $$
DECLARE
  v_rate   INTEGER;
  v_source TEXT;
  v_amount INTEGER;
  v_state  TEXT;
  v_role   TEXT;
BEGIN
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000002');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source, hourly_rate_cents)
  VALUES ('b1100000-0000-4000-8000-0000000000b1', 'b1100000-0000-4000-8000-0000000000e1',
          'b1100000-0000-4000-8000-000000000002', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry', 99999);
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents, billing_state, rate_role
    INTO v_rate, v_source, v_amount, v_state, v_role
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000b1';

  ASSERT v_rate = 15000,
    'FAIL a1 (HT-1): the browser sent 99999 and the studio rate is 15000; stored ' || COALESCE(v_rate::text, 'NULL');
  ASSERT v_source = 'studio_member',
    'FAIL a2: rate_source must be studio_member, got ' || COALESCE(v_source, 'NULL');
  ASSERT v_amount = 30000,
    'FAIL a3: 120 min at 15000/h is 30000 cents, got ' || COALESCE(v_amount::text, 'NULL');
  ASSERT v_state = 'authorized',
    'FAIL a4: a non-services entry stays authorized, got ' || COALESCE(v_state, 'NULL');
  ASSERT v_role = 'support_designer',
    'FAIL a5 (HT-41): the row records the role that priced it — 00597 seated her as '
    'support_designer; got ' || COALESCE(v_role, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (a) passed.';
END
$$;

-- ─── (b) provenance is refused on INSERT, the rate is only discarded ───────
DO $$
DECLARE
  v_source_raised BOOLEAN := false;
  v_amount_raised BOOLEAN := false;
BEGIN
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000002');
  BEGIN
    INSERT INTO public.project_time_entries
      (id, project_id, user_id, started_at, duration_minutes, billable, source, rate_source)
    VALUES ('b1100000-0000-4000-8000-0000000000b2', 'b1100000-0000-4000-8000-0000000000e1',
            'b1100000-0000-4000-8000-000000000002', NOW(), 30, true, 'manual_entry', 'authority');
  EXCEPTION WHEN check_violation THEN v_source_raised := true;
  END;
  BEGIN
    INSERT INTO public.project_time_entries
      (id, project_id, user_id, started_at, duration_minutes, billable, source, rated_amount_cents)
    VALUES ('b1100000-0000-4000-8000-0000000000b3', 'b1100000-0000-4000-8000-0000000000e1',
            'b1100000-0000-4000-8000-000000000002', NOW(), 30, true, 'manual_entry', 777777);
  EXCEPTION WHEN check_violation THEN v_amount_raised := true;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_source_raised, 'FAIL b1 (§0.7c): a caller-supplied rate_source must raise on INSERT';
  ASSERT v_amount_raised, 'FAIL b2 (§0.7c): a caller-supplied rated_amount_cents must raise on INSERT';
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_time_entries
                      WHERE id IN ('b1100000-0000-4000-8000-0000000000b2','b1100000-0000-4000-8000-0000000000b3')),
    'FAIL b3: neither refused row may exist';

  RAISE NOTICE 'time_rate_resolution: case (b) passed.';
END
$$;

-- ─── (c) services, no card for her role: the studio rate, still pending ────
DO $$
DECLARE
  v_rate   INTEGER;
  v_source TEXT;
  v_amount INTEGER;
  v_state  TEXT;
  v_auth   UUID;
BEGIN
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000002');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000000b4', 'b1100000-0000-4000-8000-0000000000e2',
          'b1100000-0000-4000-8000-000000000002', NOW() - INTERVAL '1 day', 60, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents, billing_state, billing_authority_id
    INTO v_rate, v_source, v_amount, v_state, v_auth
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000b4';

  ASSERT v_auth IS NULL,
    'FAIL c0 (precondition): no card is named for support_designer, so no authority binds';
  ASSERT v_rate = 15000 AND v_source = 'studio_member',
    'FAIL c1: the new hire''s services hour takes the studio rate; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');
  ASSERT v_amount = 15000,
    'FAIL c2: 00578:2765-2772 nulled rate AND amount here, stranding the row against the '
    '00577:2493-2496 promotion filter; expected 15000, got ' || COALESCE(v_amount::text, 'NULL');
  ASSERT v_state = 'pending_authorization',
    'FAIL c3: the hour is not authorized by a signed card, got ' || COALESCE(v_state, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (c) passed.';
END
$$;

-- ─── (d) no authority covering started_at is server-owned too ─────────────
DO $$
DECLARE
  v_rate   INTEGER;
  v_source TEXT;
  v_state  TEXT;
  v_amount INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000002');
  -- 10 days back: before the authority's effective_at (5 days back).
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source, hourly_rate_cents)
  VALUES ('b1100000-0000-4000-8000-0000000000b5', 'b1100000-0000-4000-8000-0000000000e2',
          'b1100000-0000-4000-8000-000000000002', NOW() - INTERVAL '10 days', 30, true, 'manual_entry', 88888);
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, billing_state, rated_amount_cents
    INTO v_rate, v_source, v_state, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000b5';

  ASSERT v_rate = 15000 AND v_source = 'studio_member',
    'FAIL d1 (00578:2694-2700): the caller''s 88888 survived this branch before 00601; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');
  ASSERT v_amount = 7500,
    'FAIL d2: 30 min at 15000/h is 7500 cents, got ' || COALESCE(v_amount::text, 'NULL');
  ASSERT v_state = 'pending_authorization',
    'FAIL d3: no authority covers the instant, got ' || COALESCE(v_state, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (d) passed.';
END
$$;

-- ─── (e) HT-41: two roles, one pick, the picked card prices the hour ──────
DO $$
DECLARE
  v_rate   INTEGER;
  v_source TEXT;
  v_role   TEXT;
  v_state  TEXT;
BEGIN
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000003');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source, rate_role)
  VALUES ('b1100000-0000-4000-8000-0000000000b6', 'b1100000-0000-4000-8000-0000000000e3',
          'b1100000-0000-4000-8000-000000000003', NOW() - INTERVAL '1 day', 60, true, 'manual_entry', 'vendor');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rate_role, billing_state
    INTO v_rate, v_source, v_role, v_state
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000b6';

  ASSERT v_rate = 9000 AND v_source = 'authority',
    'FAIL e1 (HT-41): the Vendor card is 9000 and the Lead designer card is 25000; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');
  ASSERT v_role = 'vendor',
    'FAIL e2: the row must record the role she picked, got ' || COALESCE(v_role, 'NULL');
  ASSERT v_state = 'authorized',
    'FAIL e3: a signed card covering the instant authorizes the hour, got ' || COALESCE(v_state, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (e) passed.';
END
$$;

-- ─── (f) two roles, NO pick: the studio rate, not NULL (CR-21) ────────────
DO $$
DECLARE
  v_rate   INTEGER;
  v_source TEXT;
  v_role   TEXT;
  v_state  TEXT;
BEGIN
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000003');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000000b7', 'b1100000-0000-4000-8000-0000000000e3',
          'b1100000-0000-4000-8000-000000000003', NOW() - INTERVAL '2 days', 60, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rate_role, billing_state
    INTO v_rate, v_source, v_role, v_state
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000b7';

  ASSERT v_rate = 12000 AND v_source = 'studio_member',
    'FAIL f1 (CR-21): with two roles and no pick, 00578''s count(DISTINCT role) = 1 collapse '
    'yields no role, so the studio rate prices the hour instead of NULL; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');
  ASSERT v_role IS NULL,
    'FAIL f2: no role was picked and none can be derived, so rate_role stays NULL; got ' || v_role;
  ASSERT v_state = 'pending_authorization',
    'FAIL f3: an unpicked two-role hour is not authorized by a card, got ' || COALESCE(v_state, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (f) passed.';
END
$$;

-- ─── (g) a role the member does not hold raises ───────────────────────────
DO $$
DECLARE
  v_raised BOOLEAN := false;
BEGIN
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000003');
  BEGIN
    INSERT INTO public.project_time_entries
      (id, project_id, user_id, started_at, duration_minutes, billable, source, rate_role)
    VALUES ('b1100000-0000-4000-8000-0000000000b8', 'b1100000-0000-4000-8000-0000000000e3',
            'b1100000-0000-4000-8000-000000000003', NOW(), 30, true, 'manual_entry', 'bookkeeper');
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_raised,
    'FAIL g1 (risk 16): a client cannot claim a roster role it does not hold';
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_time_entries
                      WHERE id = 'b1100000-0000-4000-8000-0000000000b8'),
    'FAIL g2: the refused row must not exist';

  RAISE NOTICE 'time_rate_resolution: case (g) passed.';
END
$$;

-- ─── (h) §0.8: provenance is immutable once classified ────────────────────
DO $$
DECLARE
  v_source_raised BOOLEAN := false;
  v_role_raised   BOOLEAN := false;
  v_rate_raised   BOOLEAN := false;
BEGIN
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000002');
  BEGIN
    UPDATE public.project_time_entries SET rate_source = 'authority'
     WHERE id = 'b1100000-0000-4000-8000-0000000000b1';
  EXCEPTION WHEN check_violation THEN v_source_raised := true;
  END;
  BEGIN
    UPDATE public.project_time_entries SET rate_role = 'vendor'
     WHERE id = 'b1100000-0000-4000-8000-0000000000b1';
  EXCEPTION WHEN check_violation THEN v_role_raised := true;
  END;
  -- The same freeze now covers a NON-SERVICES row, which 00412:2366's early exit
  -- let through (HT-1, §0.7b).
  BEGIN
    UPDATE public.project_time_entries SET hourly_rate_cents = 1
     WHERE id = 'b1100000-0000-4000-8000-0000000000b1';
  EXCEPTION WHEN check_violation THEN v_rate_raised := true;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_source_raised, 'FAIL h1 (§0.8): rate_source must be frozen after classification';
  ASSERT v_role_raised,   'FAIL h2 (§0.8): rate_role must be frozen after classification';
  ASSERT v_rate_raised,
    'FAIL h3 (§0.7b): the derived-field freeze must now cover non-services projects too';
  ASSERT (SELECT rate_source FROM public.project_time_entries
           WHERE id = 'b1100000-0000-4000-8000-0000000000b1') = 'studio_member',
    'FAIL h4: the refused updates must not have changed the row';

  RAISE NOTICE 'time_rate_resolution: case (h) passed.';
END
$$;

-- ─── (i) P-4: a legacy rate the chain cannot explain keeps its amount ─────
DO $$
DECLARE
  v_rate   INTEGER;
  v_source TEXT;
  v_amount INTEGER;
BEGIN
  -- A genuine PRE-00601 row: the classifier is switched off for one insert, which
  -- is the only honest way to write the shape that already exists on Strata —
  -- a rate snapshot with no provenance, on a member the chain has no answer for
  -- (she has no studio rate row and the project has no signed card).
  -- ALTER TABLE … DISABLE TRIGGER is transactional, so the ROLLBACK restores it.
  ALTER TABLE public.project_time_entries
    DISABLE TRIGGER aac_classify_project_time_entry_authority_trg;
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source,
     hourly_rate_cents, rated_amount_cents, billing_state)
  VALUES ('b1100000-0000-4000-8000-0000000000b9', 'b1100000-0000-4000-8000-0000000000e1',
          'b1100000-0000-4000-8000-000000000001', NOW() - INTERVAL '40 days', 60, true,
          'manual_entry', 17500, 17500, 'authorized');
  ALTER TABLE public.project_time_entries
    ENABLE TRIGGER aac_classify_project_time_entry_authority_trg;

  ASSERT (SELECT hourly_rate_cents FROM public.project_time_entries
           WHERE id = 'b1100000-0000-4000-8000-0000000000b9') = 17500,
    'FAIL i0 (precondition): the legacy row must carry its snapshot rate';

  -- The owner edits the duration. The resolver has no answer for her (no rate
  -- card, no studio rate row) — and the amount must not be written down.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000001');
  UPDATE public.project_time_entries SET duration_minutes = 120
   WHERE id = 'b1100000-0000-4000-8000-0000000000b9';
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents
    INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000b9';

  ASSERT v_rate = 17500,
    'FAIL i1 (P-4): an edit must not destroy an unbilled row''s rate snapshot; got '
    || COALESCE(v_rate::text, 'NULL');
  ASSERT v_source IS NULL,
    'FAIL i2: a preserved legacy snapshot keeps NULL provenance — it is not ''none'' '
    '("rate pending" would be a lie about a row that has a rate); got ' || COALESCE(v_source, 'NULL');
  ASSERT v_amount = 35000,
    'FAIL i3: the preserved rate must re-price the new duration (120 min at 17500/h); got '
    || COALESCE(v_amount::text, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (i) passed.';
  RAISE NOTICE 'All time_rate_resolution assertions passed.';
END
$$;

ROLLBACK;
