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
-- REVIEW ROUND 1 added five cases. This file is the ONLY real gate for the
-- classifier rewrite (W1-R1-15: all six red supabase/tests/commercial files are
-- pre-existing failures that abort inside
-- _countersign_design_services_agreement_impl BEFORE any authority-rate assert,
-- so "commercial green unchanged" is never coverage of this path):
--   (j) W1-R1-02 — a BOUND row's signed rate survives a `billable` off/on round
--       trip. The classifier used to stamp the resolver's answer on the
--       non-billable branch before the bound-row handling could keep
--       OLD.hourly_rate_cents, and `billable` is not in aab_'s watched list, so a
--       signed hour could be silently re-priced and then invoice-locked.
--       Also carries (j0), W1-R1-07's comparison: on a ONE-CARD authority the
--       resolver's own answer equals the rate the classifier stored.
--   (k) W1-R1-03 — after the owner removes the roster seat a recorded rate_role
--       came from, the member can still correct her own un-invoiced entry, and
--       the recorded rate_role survives. Validating on every fire froze the row.
--   (l) W1-R1-01 — the RPC boundary: a caller with NO relationship to the project
--       cannot pull its signed rate cards out of the GRANTed DEFINER resolver, and
--       a role the member does not hold raises there too.
--   (m) W1-R1-05 — the project's own designer, a plain org member, can still
--       correct a TEAMMATE's entry (the shipped `Designers manage their project
--       time entries` ALL policy has no user_id leg); a plain studio member who
--       is neither the designer nor an admin still cannot resolve someone else's
--       rate. The first half was silently revoked by the first revision's assert.
--
-- REVIEW ROUND 2 added two cases and one assert:
--   (n) W1-R2-02 — the ORDINARY designer holds TWO active studios (00295 provisions
--       a personal one at the is_designer flip; she later joins the one that pays
--       her). Every fixture above gives its designer one, so the studio fallback in
--       00599 was never exercised where it decides anything, and its uuid tiebreak
--       was a coin flip locally and a deterministic wrong answer on Strata.
--   (o) W1-R2-05 — a W1-rated row backdated out of its rate's span keeps its
--       provenance. Case (i) cannot catch this: its row is GENUINELY legacy, so
--       OLD.rate_source is already NULL.
--   (m4) W1-R2-03 — the designer-on-behalf leg is the classifier's, not a caller's:
--       at pg_trigger_depth() = 0 a project designer who is not a studio owner/admin
--       may not resolve a colleague's pay rate.
--
-- REVIEW ROUND 3 added two cases:
--   (p) W1-R3-01 — a plain member of a multi-member studio is the OWNER of the
--       personal one-person workspace 00295 provisions for her, and the INSERT
--       policy lets an owner write her own rate there. With the resolver's first
--       key being "this studio holds a rate for her", both studios held one, the
--       key tied and `(membership.role = 'owner') DESC` handed the pricing to HER
--       number: a self-set 99900 priced a 120-minute hour at $1,998.00 authorized.
--       Case (n) could not catch it — its designer holds a rate in ONE studio, so
--       the key decides rather than ties.
--   (q) W1-R3-02 — a PRE-00600 row (rate_source NULL) whose author DOES hold a
--       studio rate: a plain duration correction used to write its 17500 snapshot
--       down to her current 15000 and erase its legacy provenance. Case (i) only
--       exercises the 'none' arm, because its member has no studio rate at all.
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
  ('b1100000-0000-4000-8000-000000000003', 'rate-twohat@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  -- review round 1: a brand-new authenticated user with NO relationship to any of
  -- these projects (W1-R1-01), and a project designer who is a PLAIN org member
  -- rather than the studio's owner (W1-R1-05).
  ('b1100000-0000-4000-8000-000000000004', 'rate-stranger@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-000000000005', 'rate-plaindes@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('b1100000-0000-4000-8000-000000000001', 'rate-owner@test.invalid',  'Rate Owner',  true,  NOW(), NOW()),
  ('b1100000-0000-4000-8000-000000000002', 'rate-hire@test.invalid',   'Rate Hire',   true,  NOW(), NOW()),
  ('b1100000-0000-4000-8000-000000000003', 'rate-twohat@test.invalid', 'Rate Twohat', false, NOW(), NOW()),
  ('b1100000-0000-4000-8000-000000000004', 'rate-stranger@test.invalid', 'Rate Stranger', false, NOW(), NOW()),
  ('b1100000-0000-4000-8000-000000000005', 'rate-plaindes@test.invalid', 'Rate PlainDes', true,  NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('b1100000-0000-4000-8000-0000000000a1', 'design_studio', 'Rate Studio', 'rate-truth-test', 'active');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('b1100000-0000-4000-8000-0000000000c1', 'b1100000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-0000000000a1', 'owner',  'active', NOW()),
  ('b1100000-0000-4000-8000-0000000000c2', 'b1100000-0000-4000-8000-000000000002', 'b1100000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('b1100000-0000-4000-8000-0000000000c3', 'b1100000-0000-4000-8000-000000000003', 'b1100000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  -- A plain 'member' on purpose (W1-R1-05): if she were owner or admin,
  -- is_org_admin_or_owner would satisfy the resolver's second assert and the
  -- designer leg under test would never be exercised. The stranger (…004) is in
  -- NO organization at all.
  ('b1100000-0000-4000-8000-0000000000c5', 'b1100000-0000-4000-8000-000000000005', 'b1100000-0000-4000-8000-0000000000a1', 'member', 'active', NOW());

-- P1 plain (non-services) · P2 services, no card for the hire's role ·
-- P3 services, cards named for both of the two-hat member's roles.
INSERT INTO public.projects (id, name, designer_id, created_by)
VALUES
  ('b1100000-0000-4000-8000-0000000000e1', 'Plain House',    'b1100000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001'),
  ('b1100000-0000-4000-8000-0000000000e2', 'Services House', 'b1100000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001'),
  ('b1100000-0000-4000-8000-0000000000e3', 'Two-hat House',  'b1100000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001'),
  -- P4 services with exactly ONE rate card (the single-card fallback, W1-R1-07 /
  -- W1-R1-02). P5 plain, owned by the plain-member designer (W1-R1-05).
  ('b1100000-0000-4000-8000-0000000000e4', 'One-card House', 'b1100000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001'),
  ('b1100000-0000-4000-8000-0000000000e5', 'Plain-des House','b1100000-0000-4000-8000-000000000005', 'b1100000-0000-4000-8000-000000000005');

INSERT INTO public.proposals (id, designer_id, title, status, document_kind)
VALUES
  ('b1100000-0000-4000-8000-0000000000d2', 'b1100000-0000-4000-8000-000000000001', 'Services agreement', 'draft', 'design_services'),
  ('b1100000-0000-4000-8000-0000000000d3', 'b1100000-0000-4000-8000-000000000001', 'Two-hat agreement',  'draft', 'design_services'),
  ('b1100000-0000-4000-8000-0000000000d4', 'b1100000-0000-4000-8000-000000000001', 'One-card agreement', 'draft', 'design_services');

-- The proposals stay in 'draft': guard_commercial_authored_child (00412:633-654)
-- forbids writing proposal_service_rates once a proposal leaves draft, and the
-- real ceremony (countersign_design_services_agreement) is not what this file
-- is testing. Nothing below reads proposals.status.

INSERT INTO public.proposal_service_rates (id, proposal_id, version, role_name, hourly_rate_cents, sort_order, effective_at)
VALUES
  ('b1100000-0000-4000-8000-00000000f201', 'b1100000-0000-4000-8000-0000000000d2', 1, 'Principal',     30000, 0, NOW() - INTERVAL '20 days'),
  ('b1100000-0000-4000-8000-00000000f202', 'b1100000-0000-4000-8000-0000000000d2', 1, 'Junior',        10000, 1, NOW() - INTERVAL '20 days'),
  ('b1100000-0000-4000-8000-00000000f301', 'b1100000-0000-4000-8000-0000000000d3', 1, 'Lead designer', 25000, 0, NOW() - INTERVAL '20 days'),
  ('b1100000-0000-4000-8000-00000000f302', 'b1100000-0000-4000-8000-0000000000d3', 1, 'Vendor',         9000, 1, NOW() - INTERVAL '20 days'),
  -- ONE card, and no role on the roster is named 'Principal': the classifier's
  -- single-card fallback (00601:278-293) is the only thing that can bind this hour.
  ('b1100000-0000-4000-8000-00000000f401', 'b1100000-0000-4000-8000-0000000000d4', 1, 'Principal',     30000, 0, NOW() - INTERVAL '20 days');

INSERT INTO public.project_commercial_documents
  (id, project_id, proposal_id, document_kind, is_origin, created_by, executed_at)
VALUES
  ('b1100000-0000-4000-8000-00000000cd02', 'b1100000-0000-4000-8000-0000000000e2', 'b1100000-0000-4000-8000-0000000000d2',
   'design_services', true, 'b1100000-0000-4000-8000-000000000001', NOW() - INTERVAL '5 days'),
  ('b1100000-0000-4000-8000-00000000cd03', 'b1100000-0000-4000-8000-0000000000e3', 'b1100000-0000-4000-8000-0000000000d3',
   'design_services', true, 'b1100000-0000-4000-8000-000000000001', NOW() - INTERVAL '5 days'),
  ('b1100000-0000-4000-8000-00000000cd04', 'b1100000-0000-4000-8000-0000000000e4', 'b1100000-0000-4000-8000-0000000000d4',
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
   'b1100000-0000-4000-8000-0000000000d3', 100000000, 0, 'immediate', 'monthly', NOW() - INTERVAL '5 days', 'active'),
  ('b1100000-0000-4000-8000-00000000ba04', 'b1100000-0000-4000-8000-0000000000e4', 'b1100000-0000-4000-8000-00000000cd04',
   'b1100000-0000-4000-8000-0000000000d4', 100000000, 0, 'immediate', 'monthly', NOW() - INTERVAL '5 days', 'active');

INSERT INTO public.project_billing_authority_rates
  (id, billing_authority_id, source_rate_id, version, role_name, hourly_rate_cents)
VALUES
  ('b1100000-0000-4000-8000-00000000aa21', 'b1100000-0000-4000-8000-00000000ba02', 'b1100000-0000-4000-8000-00000000f201', 1, 'Principal',     30000),
  ('b1100000-0000-4000-8000-00000000aa22', 'b1100000-0000-4000-8000-00000000ba02', 'b1100000-0000-4000-8000-00000000f202', 1, 'Junior',        10000),
  ('b1100000-0000-4000-8000-00000000aa31', 'b1100000-0000-4000-8000-00000000ba03', 'b1100000-0000-4000-8000-00000000f301', 1, 'Lead designer', 25000),
  ('b1100000-0000-4000-8000-00000000aa32', 'b1100000-0000-4000-8000-00000000ba03', 'b1100000-0000-4000-8000-00000000f302', 1, 'Vendor',         9000),
  ('b1100000-0000-4000-8000-00000000aa41', 'b1100000-0000-4000-8000-00000000ba04', 'b1100000-0000-4000-8000-00000000f401', 1, 'Principal',     30000);

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
  v_promotable INTEGER;
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

  -- W1-R1-04: what the repair delivers is HONEST MONEY, not promotability. The
  -- real promotion predicate — every loop in the lineage, head 00578:6584-6602 —
  -- JOINs project_billing_authorities ON prior_authority.id =
  -- entry.billing_authority_id and requires entry.authority_rate_id IS NOT NULL,
  -- and this branch sets both to NULL. The earlier revision of 00601's banner and
  -- plan-v2 §2's Done-when #4 both claimed "a later signed addendum can promote
  -- it"; it cannot. Pinned here as the shipped behaviour, and recorded as OWED
  -- RULING HT-6-b. A ruling the other way is a new promotion arm inside the
  -- countersign ceremony — not a code choice.
  SELECT count(*) INTO v_promotable
  FROM public.project_time_entries entry
  JOIN public.project_billing_authorities prior_authority
    ON prior_authority.id = entry.billing_authority_id
  WHERE entry.id = 'b1100000-0000-4000-8000-0000000000b4'
    AND entry.billing_state = 'pending_authorization'
    AND entry.billable AND entry.duration_minutes IS NOT NULL
    AND entry.rated_amount_cents IS NOT NULL
    AND entry.authority_rate_id IS NOT NULL;
  ASSERT v_promotable = 0,
    'FAIL c4 (W1-R1-04, owed ruling HT-6-b): the repaired row is NOT promotable — if this '
    'assert ever reads 1, the promotion predicate changed and HT-6-b was ruled; update the '
    'banner in 00601 and Done-when #4 with it. Got ' || v_promotable;
  ASSERT (SELECT authority_rate_id FROM public.project_time_entries
           WHERE id = 'b1100000-0000-4000-8000-0000000000b4') IS NULL,
    'FAIL c5: the unbound row carries no authority_rate_id — that is WHY it is not promotable';

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
END
$$;

-- ─── (j) W1-R1-02 + W1-R1-07: a BOUND signed rate survives billable off/on ──
DO $$
DECLARE
  v_rate    INTEGER;
  v_source  TEXT;
  v_amount  INTEGER;
  v_state   TEXT;
  v_auth    UUID;
  v_r_cents INTEGER;
  v_r_src   TEXT;
BEGIN
  -- The hire logs on the ONE-CARD services project. Her roster role is
  -- support_designer (00597 seats her), and the only card is named 'Principal', so
  -- nothing matches by role: the classifier's single-card fallback (00601:278-293)
  -- is what binds the hour at $300/h.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000002');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000000c1', 'b1100000-0000-4000-8000-0000000000e4',
          'b1100000-0000-4000-8000-000000000002', NOW() - INTERVAL '1 day', 60, true, 'manual_entry');

  SELECT hourly_rate_cents, rate_source, rated_amount_cents, billing_authority_id
    INTO v_rate, v_source, v_amount, v_auth
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000c1';
  ASSERT v_auth IS NOT NULL AND v_rate = 30000 AND v_source = 'authority' AND v_amount = 30000,
    'FAIL j0a (precondition): the single-card fallback must bind this hour at 30000/authority; got '
    || COALESCE(v_rate::text,'NULL') || ' / ' || COALESCE(v_source,'NULL')
    || ' / ' || COALESCE(v_amount::text,'NULL');

  -- W1-R1-07: the resolver must give the SAME answer the classifier stored. Before
  -- the tier-1 single-card fallback was added, this read 15000 / studio_member —
  -- a wrong preview for the row that is sitting right there, and the mechanism
  -- behind the overwrite (j) is about.
  SELECT resolved.cents, resolved.source INTO v_r_cents, v_r_src
  FROM public.resolve_time_rate_cents(
    'b1100000-0000-4000-8000-0000000000e4', 'b1100000-0000-4000-8000-000000000002',
    (SELECT started_at FROM public.project_time_entries
      WHERE id = 'b1100000-0000-4000-8000-0000000000c1'), NULL) AS resolved;
  ASSERT v_r_cents = 30000 AND v_r_src = 'authority',
    'FAIL j0b (W1-R1-07): the resolver and the classifier must not disagree about which card '
    'a role matches; resolver said ' || COALESCE(v_r_cents::text,'NULL') || ' / '
    || COALESCE(v_r_src,'NULL') || ' for a row the classifier stored at 30000 / authority';
  PERFORM pg_temp.reset_role();

  -- A SECOND version of the card, cheaper. A new hour would now be priced from it,
  -- so the resolver's answer and this bound row's signed rate genuinely diverge —
  -- which is what makes the round trip below a real test rather than a tautology.
  INSERT INTO public.proposal_service_rates
    (id, proposal_id, version, role_name, hourly_rate_cents, sort_order, effective_at)
  VALUES ('b1100000-0000-4000-8000-00000000f402', 'b1100000-0000-4000-8000-0000000000d4',
          2, 'Principal', 20000, 0, NOW() - INTERVAL '20 days');
  INSERT INTO public.project_billing_authority_rates
    (id, billing_authority_id, source_rate_id, version, role_name, hourly_rate_cents)
  VALUES ('b1100000-0000-4000-8000-00000000aa42', 'b1100000-0000-4000-8000-00000000ba04',
          'b1100000-0000-4000-8000-00000000f402', 2, 'Principal', 20000);

  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000002');
  UPDATE public.project_time_entries SET billable = false
   WHERE id = 'b1100000-0000-4000-8000-0000000000c1';

  SELECT hourly_rate_cents, rate_source, rated_amount_cents, billing_state
    INTO v_rate, v_source, v_amount, v_state
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000c1';
  ASSERT v_rate = 30000 AND v_source = 'authority',
    'FAIL j1 (W1-R1-02): a non-billable toggle must not re-price a BOUND hour — the signed '
    '30000 / authority must stand; got ' || COALESCE(v_rate::text,'NULL') || ' / '
    || COALESCE(v_source,'NULL');
  ASSERT v_state = 'nonbillable' AND v_amount = 0,
    'FAIL j2: a non-billable hour is worth 0 and says so; got '
    || COALESCE(v_state,'NULL') || ' / ' || COALESCE(v_amount::text,'NULL');

  UPDATE public.project_time_entries SET billable = true
   WHERE id = 'b1100000-0000-4000-8000-0000000000c1';
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents, billing_state
    INTO v_rate, v_source, v_amount, v_state
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000c1';
  ASSERT v_rate = 30000,
    'FAIL j3 (W1-R1-02): the way back reads OLD.hourly_rate_cents, so an overwrite on the way '
    'out is PERMANENT — a signed $300/h hour must not come back at any other rate; got '
    || COALESCE(v_rate::text,'NULL');
  ASSERT v_source = 'authority',
    'FAIL j4: provenance must still say authority, got ' || COALESCE(v_source,'NULL');
  ASSERT v_amount = 30000,
    'FAIL j5: 60 min at 30000/h is 30000 cents — this is the number claim_time_entries would '
    'invoice-lock; got ' || COALESCE(v_amount::text,'NULL');
  ASSERT v_state = 'authorized',
    'FAIL j6: the signed card authorizes the hour again, got ' || COALESCE(v_state,'NULL');

  RAISE NOTICE 'time_rate_resolution: case (j) passed.';
END
$$;

-- ─── (k) W1-R1-03: a removed roster seat must not freeze the entry ─────────
DO $$
DECLARE
  v_duration INTEGER;
  v_role     TEXT;
  v_rate     INTEGER;
BEGIN
  -- Entry b6 (case e) is bound to the Vendor card and records rate_role='vendor'.
  -- The owner now removes the vendor seat — HT-25-a's cross-role re-seat makes
  -- exactly this churn the expected case, and a designer handover does the same to
  -- 'lead_designer' rows. Done as postgres: project_team_members' write
  -- authorization is not what this case is about.
  UPDATE public.project_team_members SET removed_at = NOW()
   WHERE id = 'b1100000-0000-4000-8000-00000000dd32';

  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000003');
  UPDATE public.project_time_entries SET duration_minutes = 120
   WHERE id = 'b1100000-0000-4000-8000-0000000000b6';
  PERFORM pg_temp.reset_role();

  SELECT duration_minutes, rate_role, hourly_rate_cents
    INTO v_duration, v_role, v_rate
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000b6';

  ASSERT v_duration = 120,
    'FAIL k1 (W1-R1-03): validating rate_role on EVERY fire froze the entry the moment the seat '
    'the role came from was removed — and rate_role cannot be changed either, so DELETE was the '
    'only escape. The correction must land; duration is ' || COALESCE(v_duration::text,'NULL');
  ASSERT v_role = 'vendor',
    'FAIL k2: the recorded role survives the seat it came from, got ' || COALESCE(v_role,'NULL');
  ASSERT v_rate = 9000,
    'FAIL k3: the bound signed rate is untouched by the correction, got '
    || COALESCE(v_rate::text,'NULL');

  -- Put the seat back: later cases read this roster.
  UPDATE public.project_team_members SET removed_at = NULL
   WHERE id = 'b1100000-0000-4000-8000-00000000dd32';

  RAISE NOTICE 'time_rate_resolution: case (k) passed.';
END
$$;

-- ─── (l) W1-R1-01: the RPC boundary is not a door to the signed cards ──────
DO $$
DECLARE
  v_stranger_raised BOOLEAN := false;
  v_role_raised     BOOLEAN := false;
  v_cents           INTEGER;
BEGIN
  -- A brand-new authenticated user in no organization, rostered nowhere. Before the
  -- relationship assert, this call returned the Two-hat project's signed
  -- 'Lead designer' card (25000) out of a table otherwise gated to studio
  -- co-members and the client. p_user_id is the caller's own id, so the refusal
  -- provably comes from the RELATIONSHIP assert and not from the "someone else's
  -- rate" one.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000004');
  BEGIN
    SELECT resolved.cents INTO v_cents
    FROM public.resolve_time_rate_cents(
      'b1100000-0000-4000-8000-0000000000e3', 'b1100000-0000-4000-8000-000000000004',
      NOW() - INTERVAL '1 day', 'lead_designer') AS resolved;
  EXCEPTION WHEN insufficient_privilege THEN v_stranger_raised := true;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_stranger_raised,
    'FAIL l1 (W1-R1-01): a caller with no relationship to the project must not be able to '
    'resolve against it; the call returned ' || COALESCE(v_cents::text, 'NULL');

  -- And a role the member does not hold raises AT THE RPC BOUNDARY too — inside the
  -- classifier 00601 delta 1 owns that, and validates only a NEW pick (W1-R1-03).
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000003');
  BEGIN
    SELECT resolved.cents INTO v_cents
    FROM public.resolve_time_rate_cents(
      'b1100000-0000-4000-8000-0000000000e3', 'b1100000-0000-4000-8000-000000000003',
      NOW() - INTERVAL '1 day', 'bookkeeper') AS resolved;
  EXCEPTION WHEN check_violation THEN v_role_raised := true;
  END;

  -- A role she DOES hold still answers, so l2 is not passing by breaking the RPC.
  SELECT resolved.cents INTO v_cents
  FROM public.resolve_time_rate_cents(
    'b1100000-0000-4000-8000-0000000000e3', 'b1100000-0000-4000-8000-000000000003',
    NOW() - INTERVAL '1 day', 'vendor') AS resolved;
  PERFORM pg_temp.reset_role();

  ASSERT v_role_raised,
    'FAIL l2 (W1-R1-01): p_rate_role was taken verbatim, so a direct caller could aim the '
    'resolver at whichever signed card paid best';
  ASSERT v_cents = 9000,
    'FAIL l3: a role she holds must still resolve to its card (9000), got '
    || COALESCE(v_cents::text, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (l) passed.';
END
$$;

-- ─── (m) W1-R1-05: the project designer's shipped capability is not revoked ─
DO $$
DECLARE
  v_duration INTEGER;
  v_rate     INTEGER;
  v_raised   BOOLEAN := false;
  v_cents    INTEGER;
BEGIN
  -- The hire logs on the plain-member designer's own project.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000002');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000000c2', 'b1100000-0000-4000-8000-0000000000e5',
          'b1100000-0000-4000-8000-000000000002', NOW() - INTERVAL '3 hours', 60, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  -- The project's DESIGNER corrects it. `Designers manage their project time
  -- entries` (00177:136-137) is an ALL policy qualified only on
  -- projects.designer_id = auth.uid() — no user_id leg — so this was allowed before
  -- W1, and the first revision of the resolver's assert refused it because she is a
  -- plain org member rather than an owner/admin. An undeclared narrowing is the
  -- defect, so the designer leg is admitted.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000005');
  UPDATE public.project_time_entries SET duration_minutes = 90
   WHERE id = 'b1100000-0000-4000-8000-0000000000c2';
  PERFORM pg_temp.reset_role();

  SELECT duration_minutes, hourly_rate_cents INTO v_duration, v_rate
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000c2';
  ASSERT v_duration = 90,
    'FAIL m1 (W1-R1-05): the project designer must still be able to correct a teammate''s '
    'entry; duration is ' || COALESCE(v_duration::text, 'NULL');
  ASSERT v_rate = 15000,
    'FAIL m2: the hire''s studio rate still prices the hour, got ' || COALESCE(v_rate::text,'NULL');

  -- The narrowing that DOES stand, asserted so it is a decision: a plain studio
  -- member who is neither the author, the project's designer, nor an owner/admin
  -- cannot resolve someone else's rate.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000003');
  BEGIN
    SELECT resolved.cents INTO v_cents
    FROM public.resolve_time_rate_cents(
      'b1100000-0000-4000-8000-0000000000e5', 'b1100000-0000-4000-8000-000000000002',
      NOW() - INTERVAL '3 hours', NULL) AS resolved;
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_raised,
    'FAIL m3: resolving ANOTHER member''s rate stays an owner/admin act';

  -- W1-R2-03: the designer leg is for the CLASSIFIER, not for callers. m1/m2 above
  -- exercise it the only way it is meant to be reached — through an UPDATE, at
  -- pg_trigger_depth() >= 1. At depth 0 the same designer must be refused: ungated,
  -- any user who is the designer of any project could read any colleague's studio
  -- rate (measured 47500 for a colleague whose studio_member_rates she can read 0
  -- rows of), and user ids are on the roster and in the People room.
  v_raised := false;
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000005');
  BEGIN
    SELECT resolved.cents INTO v_cents
    FROM public.resolve_time_rate_cents(
      'b1100000-0000-4000-8000-0000000000e5', 'b1100000-0000-4000-8000-000000000002',
      NOW() - INTERVAL '3 hours', NULL) AS resolved;
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_raised,
    'FAIL m4 (W1-R2-03): a project designer who is not a studio owner/admin must not be '
    'able to resolve a colleague''s pay rate by direct call; it returned '
    || COALESCE(v_cents::text, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (m) passed.';
END
$$;

-- ─── (n) W1-R2-02: the two-studio designer — the studio choice is MEANINGFUL ─
-- Every fixture above gives its designer exactly ONE studio, so the studio
-- fallback in 00599 was never exercised where it actually decides anything. The
-- ordinary designer has TWO: 00295's provision_studio_on_designer mints a personal
-- design studio the moment is_designer flips with no membership yet, and she later
-- joins the studio that pays her. She is owner of both, active in both, and both
-- memberships carry the same now() — so before this fix every ORDER BY key above
-- `studio.id` tied and the studio that priced her hour was a random uuid (8 runs
-- over one fixture: 6 picked the auto-provisioned studio, 2 the intended one). On
-- Strata the tie is deterministic and WRONG: the personal studio joins first.
--
-- The order of these three statements is the whole point, and mirrors signup:
-- flip is_designer BEFORE any membership exists (00295 no-ops if she already
-- belongs to any organization, any status), then join the real studio.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('b1100000-0000-4000-8000-000000000006', 'rate-twostudio@test.invalid', '', NOW(), NOW(), NOW(),
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES ('b1100000-0000-4000-8000-000000000006', 'rate-twostudio@test.invalid', 'Rate TwoStudio', false, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, is_designer = false;

-- The flip that provisions the personal studio (a separate UPDATE on purpose: the
-- INSERT above lands on the row auth.users already created, so ON CONFLICT DO
-- NOTHING would leave is_designer false and the trigger would never fire — which is
-- exactly why no earlier case in this file has a two-studio designer).
UPDATE public.profiles SET is_designer = true
 WHERE id = 'b1100000-0000-4000-8000-000000000006';

-- …and then she joins the studio that actually pays her.
INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('b1100000-0000-4000-8000-0000000000a2', 'design_studio', 'Paying Studio', 'rate-paying-studio-test', 'active');
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('b1100000-0000-4000-8000-0000000000c6', 'b1100000-0000-4000-8000-000000000006',
        'b1100000-0000-4000-8000-0000000000a2', 'owner', 'active', NOW());

-- Her own project, studio_id NULL — the shape 5 of 6 seeded projects rows carry.
INSERT INTO public.projects (id, name, designer_id, created_by)
VALUES ('b1100000-0000-4000-8000-0000000000e6', 'Two-studio House',
        'b1100000-0000-4000-8000-000000000006', 'b1100000-0000-4000-8000-000000000006');

DO $$
DECLARE
  v_studios     INTEGER;
  v_personal    uuid;
  v_rate        INTEGER;
  v_source      TEXT;
  v_resolved    INTEGER;
BEGIN
  SELECT count(*) INTO v_studios
  FROM public.organizations studio
  JOIN public.organization_members m ON m.organization_id = studio.id
  WHERE m.user_id = 'b1100000-0000-4000-8000-000000000006'
    AND studio.type = 'design_studio' AND studio.status = 'active'
    AND m.status = 'active' AND m.role <> 'guest';
  ASSERT v_studios = 2,
    'FAIL n0 (precondition): the designer must hold TWO active studios or this case is '
    'vacuous — 00295''s provision trigger did not fire; got ' || v_studios;

  SELECT studio.id INTO v_personal
  FROM public.organizations studio
  JOIN public.organization_members m ON m.organization_id = studio.id
  WHERE m.user_id = 'b1100000-0000-4000-8000-000000000006'
    AND studio.id <> 'b1100000-0000-4000-8000-0000000000a2';
  ASSERT v_personal IS NOT NULL, 'FAIL n0b (precondition): the personal studio is missing';

  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'b1100000-0000-4000-8000-0000000000e6') IS NULL,
    'FAIL n0c (precondition): the project must carry studio_id NULL — the fallback is what is under test';

  -- Her rate exists in the PAYING studio only. The personal studio has none, and
  -- never will: nothing seats a rate there.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000006');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('b1100000-0000-4000-8000-0000000000a2', 'b1100000-0000-4000-8000-000000000006',
          22000, CURRENT_DATE - 10, 'b1100000-0000-4000-8000-000000000006');
  PERFORM pg_temp.reset_role();

  ASSERT NOT EXISTS (SELECT 1 FROM public.studio_member_rates
                      WHERE studio_id = v_personal),
    'FAIL n0d (precondition): the personal studio must hold no rate row';

  -- She logs an hour on her own project, through every trigger.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000006');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000000ba', 'b1100000-0000-4000-8000-0000000000e6',
          'b1100000-0000-4000-8000-000000000006', NOW() - INTERVAL '2 hours', 60, true, 'manual_entry');

  SELECT resolved.cents INTO v_resolved
  FROM public.resolve_time_rate_cents(
    'b1100000-0000-4000-8000-0000000000e6', 'b1100000-0000-4000-8000-000000000006',
    NOW() - INTERVAL '2 hours', NULL) AS resolved;
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000ba';

  ASSERT v_rate = 22000,
    'FAIL n1 (W1-R2-02): the hour must be priced from the studio that holds her rate, not '
    'from whichever studio uuid sorted first; got ' || COALESCE(v_rate::text, 'NULL');
  ASSERT v_source = 'studio_member',
    'FAIL n2 (W1-R2-02): rate_source must be ''studio_member'' — ''none'' here is the silent '
    '$0 invoice HT-1/HT-26 were ruled to end; got ' || COALESCE(v_source, 'NULL');
  ASSERT v_resolved = 22000,
    'FAIL n3: the resolver and the classifier must agree on the studio; resolver said '
    || COALESCE(v_resolved::text, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (n) passed.';
END
$$;

-- ─── (o) W1-R2-05: backdating must not erase a W1-era row's provenance ──────
-- HT-13 makes backdating a first-class act. Delta 5 keeps the rate snapshot when
-- the chain has no answer — but it used to force rate_source to NULL, and NULL is
-- DEFINED (00600's COLUMN COMMENT, and TimeRateSource's doc comment) as "a row
-- written before 00600". So a row W1 itself rated at studio_member, backdated
-- before its rate's effective_from, started reading as legacy and lane B's column
-- would render it that way. Case (i) covers a GENUINELY legacy row (OLD.rate_source
-- already NULL) and therefore could not catch this.
DO $$
DECLARE
  v_rate   INTEGER;
  v_source TEXT;
  v_amount INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000002');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000000bb', 'b1100000-0000-4000-8000-0000000000e1',
          'b1100000-0000-4000-8000-000000000002', NOW() - INTERVAL '1 day', 60, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000bb';
  ASSERT v_rate = 15000 AND v_source = 'studio_member',
    'FAIL o0 (precondition): the row must start as a W1-rated studio_member hour; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');

  -- Backdated 20 days BEFORE the studio rate's effective_from (CURRENT_DATE - 30
  -- is the rate; this lands at CURRENT_DATE - 50), so the chain answers 'none'.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000002');
  UPDATE public.project_time_entries
     SET started_at = NOW() - INTERVAL '50 days'
   WHERE id = 'b1100000-0000-4000-8000-0000000000bb';
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000bb';

  ASSERT v_rate = 15000,
    'FAIL o1 (P-4): backdating must not write the rate down; got ' || COALESCE(v_rate::text, 'NULL');
  ASSERT v_source = 'studio_member',
    'FAIL o2 (W1-R2-05): the provenance must stay with the snapshot it describes — NULL here '
    'relabels a W1-era row as pre-00600 legacy; got ' || COALESCE(v_source, 'NULL');
  ASSERT v_amount = 15000,
    'FAIL o3: the preserved rate must still price the hour; got ' || COALESCE(v_amount::text, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (o) passed.';
END
$$;

-- ─── (p) W1-R3-01: a member must not price her own hour out of her own workspace ─
-- The shape is ordinary, not adversarial: a designer carries a solo rate from
-- before she joined a studio. 00295 seats her as OWNER of a personal one-person
-- design_studio, and studio_member_rates_admin_insert (00598) asks only for
-- is_org_admin_or_owner(studio_id) plus subject membership — both true of her
-- about herself THERE. Her project carries studio_id NULL (activate_proposal_as_
-- project never sets it; 5 of 6 seeded projects rows are NULL), so 00599's
-- fallback ladder is the live path. With the rate-existence key first the two
-- studios tied and the owner tiebreak picked her workspace: measured before the
-- fix, hourly_rate_cents=99900 rated_amount_cents=199800 rate_source=studio_member
-- billing_state=authorized — $1,998.00 straight into project_unbilled_time, the
-- studio balance and the invoice composer, defeating HT-3 and HT-1.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('b1100000-0000-4000-8000-000000000007', 'rate-solo@test.invalid', '', NOW(), NOW(), NOW(),
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES ('b1100000-0000-4000-8000-000000000007', 'rate-solo@test.invalid', 'Rate Solo', false, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, is_designer = false;

-- The flip, while she belongs to no organization: this is what provisions the
-- personal workspace and seats her as its owner (00295).
UPDATE public.profiles SET is_designer = true
 WHERE id = 'b1100000-0000-4000-8000-000000000007';

-- …and only then does she join the studio that employs her — as a plain member.
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('b1100000-0000-4000-8000-0000000000c7', 'b1100000-0000-4000-8000-000000000007',
        'b1100000-0000-4000-8000-0000000000a1', 'member', 'active', NOW());

INSERT INTO public.projects (id, name, designer_id, created_by)
VALUES ('b1100000-0000-4000-8000-0000000000e7', 'Solo-rate House',
        'b1100000-0000-4000-8000-000000000007', 'b1100000-0000-4000-8000-000000000007');

DO $$
DECLARE
  v_personal uuid;
  v_peers    INTEGER;
  v_rate     INTEGER;
  v_source   TEXT;
  v_amount   INTEGER;
  v_resolved INTEGER;
BEGIN
  SELECT studio.id INTO v_personal
  FROM public.organizations studio
  JOIN public.organization_members m ON m.organization_id = studio.id
  WHERE m.user_id = 'b1100000-0000-4000-8000-000000000007'
    AND studio.id <> 'b1100000-0000-4000-8000-0000000000a1';
  ASSERT v_personal IS NOT NULL,
    'FAIL p0 (precondition): 00295 must have provisioned her personal workspace, or this case is vacuous';

  SELECT count(*) INTO v_peers FROM public.organization_members
   WHERE organization_id = v_personal AND status = 'active' AND role <> 'guest';
  ASSERT v_peers = 1,
    'FAIL p0b (precondition): the personal workspace must hold exactly one member, found ' || v_peers;

  SELECT count(*) INTO v_peers FROM public.organization_members
   WHERE organization_id = 'b1100000-0000-4000-8000-0000000000a1'
     AND status = 'active' AND role <> 'guest';
  ASSERT v_peers > 1,
    'FAIL p0c (precondition): the employing studio must hold more than one member, found ' || v_peers;

  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'b1100000-0000-4000-8000-0000000000e7') IS NULL,
    'FAIL p0d (precondition): the project must carry studio_id NULL — the fallback ladder is what is under test';

  -- She sets her OWN rate in her OWN workspace, through the real policies. This is
  -- still ALLOWED (a solo owner must be able to price her own hours), and it is the
  -- ladder — not the policy — that keeps it out of her studio's money.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000007');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES (v_personal, 'b1100000-0000-4000-8000-000000000007', 99900, CURRENT_DATE - 30,
          'b1100000-0000-4000-8000-000000000007');
  PERFORM pg_temp.reset_role();
  ASSERT EXISTS (SELECT 1 FROM public.studio_member_rates
                  WHERE studio_id = v_personal AND hourly_rate_cents = 99900),
    'FAIL p0e (precondition): the self-set rate must exist — it is the number that must never price an hour';

  -- Her studio prices her at 16000, set by the studio's owner.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000001');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('b1100000-0000-4000-8000-0000000000a1', 'b1100000-0000-4000-8000-000000000007',
          16000, CURRENT_DATE - 20, 'b1100000-0000-4000-8000-000000000001');
  PERFORM pg_temp.reset_role();

  -- Two hours on her own project, through every trigger.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000007');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000000bc', 'b1100000-0000-4000-8000-0000000000e7',
          'b1100000-0000-4000-8000-000000000007', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');

  SELECT resolved.cents INTO v_resolved
  FROM public.resolve_time_rate_cents(
    'b1100000-0000-4000-8000-0000000000e7', 'b1100000-0000-4000-8000-000000000007',
    NOW() - INTERVAL '2 hours', NULL) AS resolved;
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000bc';

  ASSERT v_rate <> 99900,
    'FAIL p1 (W1-R3-01, HT-3 + HT-1): the member''s self-set workspace rate priced the hour — '
    'she set the rate her own hours bill at';
  ASSERT v_rate = 16000,
    'FAIL p2 (W1-R3-01): the hour must be priced by the studio that employs her (16000); got '
    || COALESCE(v_rate::text, 'NULL');
  ASSERT v_source = 'studio_member',
    'FAIL p3: rate_source must be ''studio_member''; got ' || COALESCE(v_source, 'NULL');
  ASSERT v_amount = 32000,
    'FAIL p4: 120 minutes at 16000/h is 32000, not ' || COALESCE(v_amount::text, 'NULL');
  ASSERT v_resolved = 16000,
    'FAIL p5: the resolver and the classifier must agree on the studio; resolver said '
    || COALESCE(v_resolved::text, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (p) passed.';
END
$$;

-- ─── (q) W1-R3-02: a pre-00600 snapshot survives an edit even when the chain answers ─
-- Delta 5 used to fire only when the chain answered 'none', which honoured P-4
-- exactly where it cost nothing. Here the author DOES hold a studio rate (15000,
-- from CURRENT_DATE - 30) and the row is genuinely legacy: a 17500 snapshot with
-- rate_source NULL. The only edit useUpdateTimeEntry offers that touches this — a
-- duration correction — re-priced it to 15000 and erased the NULL that marks it as
-- pre-00600. Invoiced rows were never at risk (guard_invoiced_time_entry refuses a
-- duration change once invoice_id is set), so the exposure was exactly the unbilled
-- history P-4 names.
DO $$
DECLARE
  v_rate   INTEGER;
  v_source TEXT;
  v_amount INTEGER;
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM public.studio_member_rates
    WHERE user_id = 'b1100000-0000-4000-8000-000000000002'
      AND hourly_rate_cents = 15000),
    'FAIL q0a (precondition): the author must hold a studio rate, or this case degenerates into (i)';
  ASSERT EXISTS (
    SELECT 1 FROM public.project_team_members
    WHERE project_id = 'b1100000-0000-4000-8000-0000000000e1'
      AND user_id = 'b1100000-0000-4000-8000-000000000002'
      AND removed_at IS NULL),
    'FAIL q0b (precondition): she must be on the project roster to correct her own entry';

  -- The legacy shape, written with the classifier off — the only honest way to
  -- produce a snapshot with no provenance. ALTER TABLE … DISABLE TRIGGER is
  -- transactional, so the ROLLBACK restores it.
  ALTER TABLE public.project_time_entries
    DISABLE TRIGGER aac_classify_project_time_entry_authority_trg;
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source,
     hourly_rate_cents, rated_amount_cents, billing_state)
  VALUES ('b1100000-0000-4000-8000-0000000000bd', 'b1100000-0000-4000-8000-0000000000e1',
          'b1100000-0000-4000-8000-000000000002', NOW() - INTERVAL '5 days', 60, true,
          'manual_entry', 17500, 17500, 'authorized');
  ALTER TABLE public.project_time_entries
    ENABLE TRIGGER aac_classify_project_time_entry_authority_trg;

  ASSERT (SELECT rate_source FROM public.project_time_entries
           WHERE id = 'b1100000-0000-4000-8000-0000000000bd') IS NULL,
    'FAIL q0c (precondition): the legacy row must carry NULL provenance';

  -- She corrects the duration — the one edit the hook offers.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000002');
  UPDATE public.project_time_entries SET duration_minutes = 120
   WHERE id = 'b1100000-0000-4000-8000-0000000000bd';
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000bd';

  ASSERT v_rate = 17500,
    'FAIL q1 (P-4, W1-R3-02): a duration edit must not re-price a legacy snapshot to the '
    'author''s current studio rate; got ' || COALESCE(v_rate::text, 'NULL');
  ASSERT v_source IS NULL,
    'FAIL q2 (W1-R3-02): the row must stay identifiable as pre-00600; got ' || COALESCE(v_source, 'NULL');
  ASSERT v_amount = 35000,
    'FAIL q3: the preserved rate re-prices the new duration (120 min at 17500/h); got '
    || COALESCE(v_amount::text, 'NULL');

  -- The second vector named in W1-R3-02: a billable off/on round trip reaches the
  -- same overwrite through the non-billable branch.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000002');
  UPDATE public.project_time_entries SET billable = false
   WHERE id = 'b1100000-0000-4000-8000-0000000000bd';
  UPDATE public.project_time_entries SET billable = true
   WHERE id = 'b1100000-0000-4000-8000-0000000000bd';
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000bd';

  ASSERT v_rate = 17500 AND v_source IS NULL,
    'FAIL q4 (W1-R3-02): a billable off/on round trip must not re-price the legacy snapshot '
    'either; got ' || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');
  ASSERT v_amount = 35000,
    'FAIL q5: the round trip must leave the amount at 35000; got ' || COALESCE(v_amount::text, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (q) passed.';
  RAISE NOTICE 'All time_rate_resolution assertions passed.';
END
$$;

ROLLBACK;
