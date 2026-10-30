-- ═══════════════════════════════════════════════════════════════════════════
-- 00797 — US-36 R1: re-rate pending hours on set (K8, amends P-4)
--
-- rerate_pending_time_entries(p_rate_id, p_expected_rate_cents) prices a
-- member's pending hours at the rate on the studio_member_rates row just saved
-- (SQ-1077, repairing SQ-1075; SQ-1081, repairing SQ-1079). Every call below
-- passes the rate the save returned as p_expected_rate_cents.
--
--   (k8a) an unknown rate id is refused like a row the caller does not run,
--         and nothing moves.
--   (k8b) refusals by actor: an outsider who owns another studio, handed this
--         studio's row (a foreign-studio row), and the member whose hours they
--         are. Both get 42501 and nothing moves.
--   (k8c) a superseded row is refused (23514). Its old rate prices nothing.
--   (k8d) the owner saves today's rate and re-rates with that row. F1 first: on
--         a services project whose signed card postdates the hour, and is in
--         force now, the hour takes the new member rate, stamped studio_member.
--         It stays unbound and pending_authorization. Hours logged before any
--         rate take the rate just set. An hour a rate covered at started_at
--         takes that rate (the chain's own answer). The count is exact. Each
--         re-priced hour leaves one audit_logs row with the owner as actor and
--         is stamped updated_by = the owner. Untouched, with no trace: a priced
--         hour, an invoiced pending hour, the member's hour on a project
--         another studio prices, and another member's hour. A second run
--         returns 0.
--   (k8e) P-4's refusal stands afterwards: an owner's direct rate UPDATE of a
--         priced hour and of a re-priced hour is refused (aab_), even with both
--         GUCs forged. A later edit by the member keeps the K8 price while the
--         hour's started_at still answers 'none'. Not claimed: once a rate is
--         later backdated over the hour, its next edit re-prices it (00618's
--         delta 5, inherited; open in DECISIONS R177).
--   (k8f) the carve-out is the RPC's alone: a member who forges both GUCs on his
--         own pending hour stays pending. The admin's re-rate then prices it.
--   (k8g) F2: the saved row is dated the studio's LOCAL tomorrow, while the
--         UTC day still belongs to the previous rate. The pending hour takes
--         the NEW rate, not the previous one.
--   (k8h) a self-written rate that tier 2 ignores (00615 HT-3-e(2)) is refused.
--         Forging the GUCs with it prices nothing.
--   (k8i) the refusal is per studio: this studio's owner is refused another
--         studio's row, and that studio's owner is admitted with it.
--   (k8j) SQ-1079 F1: a row that a tomorrow-dated save closed at today is
--         superseded (23514), though the UTC day is still inside it. The
--         successor prices the hour.
--   (k8k) SQ-1079 F2: after a second admin's same-day correction (same row id,
--         new rate), the first save's re-rate is refused (PT409) and prices
--         nothing. A re-rate that names the corrected rate prices it.
--   (k8l) SQ-1079 F3: an owner who forges both GUCs with a superseded row
--         prices nothing. Her edit itself lands.
--   (k8m) SQ-1079 F5: the count is the hours this call moved off 'none'. An
--         hour whose eligibility is lost during the walk (the self-rate's
--         member hands her ownership away) stays pending and is not counted.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/billing/us36_rerate_pending_hours_test.sql
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
-- 1 owner and 2 admin of studio A; 3 member M (the hours being priced); 4
-- member N; 5 outsider (owner of studio B); 6 a client for the invoice; 7
-- member P (the F2 case).
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c7970000-0000-4000-8000-000000000001', 'us36r-owner@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c7970000-0000-4000-8000-000000000002', 'us36r-admin@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c7970000-0000-4000-8000-000000000003', 'us36r-member-m@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c7970000-0000-4000-8000-000000000004', 'us36r-member-n@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c7970000-0000-4000-8000-000000000005', 'us36r-outsider@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c7970000-0000-4000-8000-000000000006', 'us36r-client@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c7970000-0000-4000-8000-000000000007', 'us36r-member-p@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('c7970000-0000-4000-8000-0000000000a1', 'design_studio', 'US36R Studio',         'us36r-studio-test',         'active'),
  ('c7970000-0000-4000-8000-0000000000a2', 'design_studio', 'US36R Outside Studio', 'us36r-outside-studio-test', 'active');

-- Each studio's owner seat first: 00484 admits a first owner only into an
-- empty studio.
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('c7970000-0000-4000-8000-000000000001', 'c7970000-0000-4000-8000-0000000000a1', 'owner',  'active', NOW()),
  ('c7970000-0000-4000-8000-000000000002', 'c7970000-0000-4000-8000-0000000000a1', 'admin',  'active', NOW()),
  ('c7970000-0000-4000-8000-000000000003', 'c7970000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('c7970000-0000-4000-8000-000000000004', 'c7970000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('c7970000-0000-4000-8000-000000000007', 'c7970000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('c7970000-0000-4000-8000-000000000005', 'c7970000-0000-4000-8000-0000000000a2', 'owner',  'active', NOW());

-- e1 a non-services project studio A prices (its owner leads it); e2 one
-- studio B prices; e3 a services project studio A prices.
INSERT INTO public.projects (id, name, designer_id, created_by, studio_id, status)
VALUES
  ('c7970000-0000-4000-8000-0000000000e1', 'US36R House',
   'c7970000-0000-4000-8000-000000000001', 'c7970000-0000-4000-8000-000000000001',
   'c7970000-0000-4000-8000-0000000000a1', 'active'),
  ('c7970000-0000-4000-8000-0000000000e2', 'US36R Outside House',
   'c7970000-0000-4000-8000-000000000005', 'c7970000-0000-4000-8000-000000000005',
   'c7970000-0000-4000-8000-0000000000a2', 'active'),
  ('c7970000-0000-4000-8000-0000000000e3', 'US36R Services House',
   'c7970000-0000-4000-8000-000000000001', 'c7970000-0000-4000-8000-000000000001',
   'c7970000-0000-4000-8000-0000000000a1', 'active');

-- e3's agreement, signed 5 days ago: one card, so it prices any member on the
-- project from then on (00618 tier 1's single-card leg).
INSERT INTO public.proposals (id, designer_id, title, status, document_kind)
VALUES ('c7970000-0000-4000-8000-0000000000d1', 'c7970000-0000-4000-8000-000000000001',
        'US36R agreement', 'draft', 'design_services');

INSERT INTO public.proposal_service_rates (id, proposal_id, version, role_name, hourly_rate_cents, sort_order, effective_at)
VALUES ('c7970000-0000-4000-8000-0000000000d2', 'c7970000-0000-4000-8000-0000000000d1',
        1, 'Designer', 20000, 0, NOW() - INTERVAL '20 days');

INSERT INTO public.project_commercial_documents
  (id, project_id, proposal_id, document_kind, is_origin, created_by, executed_at)
VALUES ('c7970000-0000-4000-8000-0000000000d3', 'c7970000-0000-4000-8000-0000000000e3',
        'c7970000-0000-4000-8000-0000000000d1', 'design_services', true,
        'c7970000-0000-4000-8000-000000000001', NOW() - INTERVAL '5 days');

INSERT INTO public.project_billing_authorities
  (id, project_id, commercial_document_id, source_proposal_id, billing_ceiling_cents,
   retainer_amount_cents, retainer_activation_policy, billing_cadence, effective_at, status)
VALUES ('c7970000-0000-4000-8000-0000000000d4', 'c7970000-0000-4000-8000-0000000000e3',
        'c7970000-0000-4000-8000-0000000000d3', 'c7970000-0000-4000-8000-0000000000d1',
        100000000, 0, 'immediate', 'monthly', NOW() - INTERVAL '5 days', 'active');

INSERT INTO public.project_billing_authority_rates
  (id, billing_authority_id, source_rate_id, version, role_name, hourly_rate_cents)
VALUES ('c7970000-0000-4000-8000-0000000000d5', 'c7970000-0000-4000-8000-0000000000d4',
        'c7970000-0000-4000-8000-0000000000d2', 1, 'Designer', 20000);

INSERT INTO public.invoices (id, project_id, designer_id, client_id, status, currency, memo)
VALUES ('c7970000-0000-4000-8000-0000000000f1', 'c7970000-0000-4000-8000-0000000000e1',
        'c7970000-0000-4000-8000-000000000001', 'c7970000-0000-4000-8000-000000000006',
        'draft', 'USD', 'US36R draft');

-- Hours logged before ANY rate exists, so every one prices 'none':
--   b1, b2  M, 50 and 40 days ago   → priced at the rate set today
--   b4      M, 45 days ago          → then invoiced (the pre-00617 claim shape)
--   b7      M, 25 days ago          → a rate written later covers its started_at
--   b8      N, 10 days ago          → N has no rate until (k8f)
--   b6      M, on studio B's project
--   b9      M, 35 days ago, on the services project, before its agreement (F1)
--   b10     P, 40 days ago          → the F2 case
--   b11     the admin, 15 days ago  → her own rate is one she wrote herself
INSERT INTO public.project_time_entries
  (id, project_id, user_id, started_at, duration_minutes, billable, source)
VALUES
  ('c7970000-0000-4000-8000-0000000000b1', 'c7970000-0000-4000-8000-0000000000e1',
   'c7970000-0000-4000-8000-000000000003', NOW() - INTERVAL '50 days', 120, true, 'manual_entry'),
  ('c7970000-0000-4000-8000-0000000000b2', 'c7970000-0000-4000-8000-0000000000e1',
   'c7970000-0000-4000-8000-000000000003', NOW() - INTERVAL '40 days', 60, true, 'manual_entry'),
  ('c7970000-0000-4000-8000-0000000000b4', 'c7970000-0000-4000-8000-0000000000e1',
   'c7970000-0000-4000-8000-000000000003', NOW() - INTERVAL '45 days', 30, true, 'manual_entry'),
  ('c7970000-0000-4000-8000-0000000000b7', 'c7970000-0000-4000-8000-0000000000e1',
   'c7970000-0000-4000-8000-000000000003', NOW() - INTERVAL '25 days', 90, true, 'manual_entry'),
  ('c7970000-0000-4000-8000-0000000000b8', 'c7970000-0000-4000-8000-0000000000e1',
   'c7970000-0000-4000-8000-000000000004', NOW() - INTERVAL '10 days', 60, true, 'manual_entry'),
  ('c7970000-0000-4000-8000-0000000000b6', 'c7970000-0000-4000-8000-0000000000e2',
   'c7970000-0000-4000-8000-000000000003', NOW() - INTERVAL '10 days', 60, true, 'manual_entry'),
  ('c7970000-0000-4000-8000-0000000000b9', 'c7970000-0000-4000-8000-0000000000e3',
   'c7970000-0000-4000-8000-000000000003', NOW() - INTERVAL '35 days', 60, true, 'manual_entry'),
  ('c7970000-0000-4000-8000-000000000b10', 'c7970000-0000-4000-8000-0000000000e1',
   'c7970000-0000-4000-8000-000000000007', NOW() - INTERVAL '40 days', 60, true, 'manual_entry'),
  ('c7970000-0000-4000-8000-000000000b11', 'c7970000-0000-4000-8000-0000000000e1',
   'c7970000-0000-4000-8000-000000000002', NOW() - INTERVAL '15 days', 60, true, 'manual_entry');

UPDATE public.project_time_entries
   SET invoice_id = 'c7970000-0000-4000-8000-0000000000f1'
 WHERE id = 'c7970000-0000-4000-8000-0000000000b4';

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

-- rerate_pending_time_entries(p_rate, p_expected) as p_actor: the count, or
-- 'ERR|SQLSTATE|message'.
CREATE OR REPLACE FUNCTION pg_temp.rerate_as(p_actor UUID, p_rate UUID, p_expected INTEGER)
RETURNS TEXT AS $$
DECLARE
  v_out TEXT;
BEGIN
  PERFORM pg_temp.assume_user(p_actor);
  BEGIN
    v_out := public.rerate_pending_time_entries(p_rate, p_expected)::text;
  EXCEPTION WHEN OTHERS THEN v_out := 'ERR|' || SQLSTATE || '|' || SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
  RETURN v_out;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.rerate_as(UUID, UUID, INTEGER) TO PUBLIC;

-- A row nobody has re-priced: still what it was, no updated_by, and no trace
-- written by a person (the fixture's own invoice stamp ran as postgres).
CREATE OR REPLACE FUNCTION pg_temp.untouched(p_entry UUID)
RETURNS BOOLEAN AS $$
  SELECT (SELECT updated_by IS NULL FROM public.project_time_entries WHERE id = p_entry)
     AND NOT EXISTS (
       SELECT 1 FROM public.audit_logs
       WHERE resource_type = 'project_time_entries' AND resource_id = p_entry
         AND user_id IS NOT NULL);
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION pg_temp.untouched(UUID) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.pending(p_entry UUID)
RETURNS BOOLEAN AS $$
  SELECT rate_source = 'none' AND hourly_rate_cents IS NULL
  FROM public.project_time_entries WHERE id = p_entry;
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION pg_temp.pending(UUID) TO PUBLIC;

-- ─── preconditions ─────────────────────────────────────────────────────────
DO $$
DECLARE
  v_source TEXT;
BEGIN
  ASSERT (SELECT count(*) FROM public.project_time_entries
           WHERE id::text LIKE 'c7970000-%' AND rate_source = 'none' AND hourly_rate_cents IS NULL) = 9,
    'FAIL p0 (precondition): all nine fixture hours start rate pending';
  ASSERT (SELECT billing_state FROM public.project_time_entries
           WHERE id = 'c7970000-0000-4000-8000-0000000000b1') = 'authorized',
    'FAIL p0b (precondition): a non-services hour is authorized (what the composer lists)';
  ASSERT (SELECT invoice_id FROM public.project_time_entries
           WHERE id = 'c7970000-0000-4000-8000-0000000000b4') = 'c7970000-0000-4000-8000-0000000000f1',
    'FAIL p0c (precondition): b4 is an invoiced pending hour';
  ASSERT (SELECT billing_state = 'pending_authorization' AND billing_authority_id IS NULL
          FROM public.project_time_entries WHERE id = 'c7970000-0000-4000-8000-0000000000b9'),
    'FAIL p0d (precondition): b9 predates its project''s agreement';
  -- F1's shape: asked at now(), the chain answers with the card, not a member rate
  SELECT resolved.source INTO v_source
  FROM public.resolve_time_rate_cents('c7970000-0000-4000-8000-0000000000e3',
                                      'c7970000-0000-4000-8000-000000000003', NOW(), NULL) AS resolved;
  ASSERT v_source = 'authority',
    'FAIL p0e (precondition): the card is in force now for M on e3; got ' || COALESCE(v_source, 'NULL');
  RAISE NOTICE 'us36r: preconditions passed.';
END
$$;

-- ─── (k8a) an unknown id is refused, and nothing moves ─────────────────────
DO $$
DECLARE
  v_out TEXT;
BEGIN
  v_out := pg_temp.rerate_as('c7970000-0000-4000-8000-000000000001',
                             'c7970000-0000-4000-8000-0000000000c0', 0);
  ASSERT v_out LIKE 'ERR|42501|rerate_pending_time_entries: only an owner or admin%',
    'FAIL k8a1: an unknown rate id gets the same refusal as another studio''s row; got ' || COALESCE(v_out, 'NULL');
  ASSERT pg_temp.pending('c7970000-0000-4000-8000-0000000000b1')
     AND pg_temp.untouched('c7970000-0000-4000-8000-0000000000b1'),
    'FAIL k8a2: a refused re-rate writes nothing';
  RAISE NOTICE 'us36r: case (k8a) passed — an unknown id is refused.';
END
$$;

-- c1: M's first rate, from 30 days ago, so b7 at 25 days falls inside it.
-- Then the hour M logs under it.
INSERT INTO public.studio_member_rates (id, studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES ('c7970000-0000-4000-8000-0000000000c1', 'c7970000-0000-4000-8000-0000000000a1',
        'c7970000-0000-4000-8000-000000000003', 9000, (NOW() AT TIME ZONE 'UTC')::date - 30,
        'c7970000-0000-4000-8000-000000000001');

INSERT INTO public.project_time_entries
  (id, project_id, user_id, started_at, duration_minutes, billable, source)
VALUES ('c7970000-0000-4000-8000-0000000000b3', 'c7970000-0000-4000-8000-0000000000e1',
        'c7970000-0000-4000-8000-000000000003', NOW() - INTERVAL '20 days', 60, true, 'manual_entry');

DO $$
BEGIN
  ASSERT (SELECT hourly_rate_cents = 9000 AND rate_source = 'studio_member'
          FROM public.project_time_entries WHERE id = 'c7970000-0000-4000-8000-0000000000b3'),
    'FAIL p1 (precondition): b3 is a priced hour at 9000 / studio_member';
  ASSERT pg_temp.pending('c7970000-0000-4000-8000-0000000000b7')
     AND pg_temp.pending('c7970000-0000-4000-8000-0000000000b9'),
    'FAIL p1b (precondition): b7 and b9 are still stored pending — a rate written later does not reach them by itself';
END
$$;

-- ─── (k8b) refusals by actor ───────────────────────────────────────────────
DO $$
DECLARE
  v_out TEXT;
BEGIN
  -- the RPC's own refusal, not a 42501 raised further down the resolver
  v_out := pg_temp.rerate_as('c7970000-0000-4000-8000-000000000005',
                             'c7970000-0000-4000-8000-0000000000c1', 9000);
  ASSERT v_out LIKE 'ERR|42501|rerate_pending_time_entries: only an owner or admin%',
    'FAIL k8b1: an outsider (owner of another studio) handed this studio''s row is refused; got ' || COALESCE(v_out, 'NULL');

  v_out := pg_temp.rerate_as('c7970000-0000-4000-8000-000000000003',
                             'c7970000-0000-4000-8000-0000000000c1', 9000);
  ASSERT v_out LIKE 'ERR|42501|rerate_pending_time_entries: only an owner or admin%',
    'FAIL k8b2: a plain member (the subject herself) is refused; got ' || COALESCE(v_out, 'NULL');

  ASSERT pg_temp.pending('c7970000-0000-4000-8000-0000000000b1')
     AND pg_temp.pending('c7970000-0000-4000-8000-0000000000b7'),
    'FAIL k8b3: a refused re-rate moves nothing';

  RAISE NOTICE 'us36r: case (k8b) passed — outsider and member refused.';
END
$$;

-- The owner saves today's rate, c2, through RLS, the way useSetStudioMemberRate
-- writes it. The ladder closes c1 at yesterday.
SELECT pg_temp.assume_user('c7970000-0000-4000-8000-000000000001');
INSERT INTO public.studio_member_rates (id, studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES ('c7970000-0000-4000-8000-0000000000c2', 'c7970000-0000-4000-8000-0000000000a1',
        'c7970000-0000-4000-8000-000000000003', 15000, (NOW() AT TIME ZONE 'UTC')::date,
        'c7970000-0000-4000-8000-000000000001');
SELECT pg_temp.reset_role();

-- ─── (k8c) a superseded row is refused ─────────────────────────────────────
DO $$
DECLARE
  v_out TEXT;
BEGIN
  ASSERT (SELECT effective_to FROM public.studio_member_rates
          WHERE id = 'c7970000-0000-4000-8000-0000000000c1') = (NOW() AT TIME ZONE 'UTC')::date - 1,
    'FAIL k8c0 (precondition): c2 closed c1 at yesterday';
  v_out := pg_temp.rerate_as('c7970000-0000-4000-8000-000000000001',
                             'c7970000-0000-4000-8000-0000000000c1', 9000);
  ASSERT v_out LIKE 'ERR|23514|rerate_pending_time_entries: rate % has been superseded%',
    'FAIL k8c1: a superseded row is refused; got ' || COALESCE(v_out, 'NULL');
  ASSERT pg_temp.pending('c7970000-0000-4000-8000-0000000000b1')
     AND pg_temp.pending('c7970000-0000-4000-8000-0000000000b2')
     AND pg_temp.untouched('c7970000-0000-4000-8000-0000000000b1'),
    'FAIL k8c2: a superseded rate prices nothing';
  RAISE NOTICE 'us36r: case (k8c) passed — a superseded row is refused.';
END
$$;

-- ─── (k8d) the owner re-rates with the row she just saved ──────────────────
DO $$
DECLARE
  v_out TEXT;
  v_row RECORD;
BEGIN
  v_out := pg_temp.rerate_as('c7970000-0000-4000-8000-000000000001',
                             'c7970000-0000-4000-8000-0000000000c2', 15000);

  -- F1 (SQ-1075): the card signed after the hour, and in force now, does not
  -- mask the member rate just set.
  SELECT hourly_rate_cents, rate_source, rated_amount_cents, billing_state,
         billing_authority_id, authority_rate_id
    INTO v_row
  FROM public.project_time_entries WHERE id = 'c7970000-0000-4000-8000-0000000000b9';
  ASSERT v_row.hourly_rate_cents = 15000 AND v_row.rate_source = 'studio_member'
     AND v_row.rated_amount_cents = 15000,
    'FAIL k8d1 (F1): a services hour that predates its signed card takes the member rate just set; got '
    || COALESCE(v_row.hourly_rate_cents::text, 'NULL') || ' / ' || COALESCE(v_row.rate_source, 'NULL');
  ASSERT v_row.billing_state = 'pending_authorization'
     AND v_row.billing_authority_id IS NULL AND v_row.authority_rate_id IS NULL,
    'FAIL k8d2 (F1): the hour stays unbound to the later card and pending authorization';

  -- untouched
  ASSERT (SELECT hourly_rate_cents = 9000 AND rate_source = 'studio_member'
          FROM public.project_time_entries WHERE id = 'c7970000-0000-4000-8000-0000000000b3')
     AND pg_temp.untouched('c7970000-0000-4000-8000-0000000000b3'),
    'FAIL k8d3: a priced hour is never re-priced or touched';
  ASSERT pg_temp.pending('c7970000-0000-4000-8000-0000000000b4')
     AND (SELECT invoice_id FROM public.project_time_entries
          WHERE id = 'c7970000-0000-4000-8000-0000000000b4') = 'c7970000-0000-4000-8000-0000000000f1'
     AND pg_temp.untouched('c7970000-0000-4000-8000-0000000000b4'),
    'FAIL k8d4: an invoiced pending hour is never re-priced or touched';
  ASSERT pg_temp.pending('c7970000-0000-4000-8000-0000000000b6')
     AND pg_temp.untouched('c7970000-0000-4000-8000-0000000000b6'),
    'FAIL k8d5: the member''s hour on a project another studio prices is not this studio''s to price';
  ASSERT pg_temp.pending('c7970000-0000-4000-8000-0000000000b8')
     AND pg_temp.untouched('c7970000-0000-4000-8000-0000000000b8'),
    'FAIL k8d6: another member''s pending hour is not re-rated';

  SELECT hourly_rate_cents, rate_source, rated_amount_cents, updated_by INTO v_row
  FROM public.project_time_entries WHERE id = 'c7970000-0000-4000-8000-0000000000b1';
  ASSERT v_row.hourly_rate_cents = 15000 AND v_row.rate_source = 'studio_member'
     AND v_row.rated_amount_cents = 30000,
    'FAIL k8d7: an hour logged before any rate takes the rate just set; got '
    || COALESCE(v_row.hourly_rate_cents::text, 'NULL') || ' / ' || COALESCE(v_row.rate_source, 'NULL')
    || ' / ' || COALESCE(v_row.rated_amount_cents::text, 'NULL');
  ASSERT v_row.updated_by = 'c7970000-0000-4000-8000-000000000001',
    'FAIL k8d8: the re-priced hour is stamped updated_by = the owner';
  ASSERT (SELECT hourly_rate_cents = 15000 AND rate_source = 'studio_member' AND rated_amount_cents = 15000
          FROM public.project_time_entries WHERE id = 'c7970000-0000-4000-8000-0000000000b2'),
    'FAIL k8d9: b2 takes the rate just set';

  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_row
  FROM public.project_time_entries WHERE id = 'c7970000-0000-4000-8000-0000000000b7';
  ASSERT v_row.hourly_rate_cents = 9000 AND v_row.rate_source = 'studio_member'
     AND v_row.rated_amount_cents = 13500,
    'FAIL k8d10: an hour a rate covers at started_at takes THAT rate (the chain''s own answer); got '
    || COALESCE(v_row.hourly_rate_cents::text, 'NULL') || ' / ' || COALESCE(v_row.rate_source, 'NULL');

  -- the trace: one audit row per re-priced hour, the owner as actor
  ASSERT (SELECT count(*) FROM public.audit_logs
          WHERE resource_type = 'project_time_entries'
            AND resource_id = 'c7970000-0000-4000-8000-0000000000b1') = 1
     AND EXISTS (
          SELECT 1 FROM public.audit_logs
          WHERE resource_type = 'project_time_entries'
            AND resource_id = 'c7970000-0000-4000-8000-0000000000b1'
            AND user_id = 'c7970000-0000-4000-8000-000000000001'
            AND organization_id = 'c7970000-0000-4000-8000-0000000000a1'
            AND action = 'time_entry.updated'
            AND old_values->>'rate_source' = 'none'
            AND new_values->>'rate_source' = 'studio_member'
            AND (new_values->>'hourly_rate_cents')::int = 15000),
    'FAIL k8d11: one audit_logs trace per re-priced hour, actor = the owner';
  ASSERT (SELECT count(*) FROM public.audit_logs
          WHERE resource_type = 'project_time_entries'
            AND user_id = 'c7970000-0000-4000-8000-000000000001'
            AND resource_id::text LIKE 'c7970000-%') = 4,
    'FAIL k8d12: exactly four traces for four re-priced hours';
  ASSERT v_out = '4',
    'FAIL k8d13: the owner''s re-rate prices exactly b1, b2, b7 and b9; got ' || COALESCE(v_out, 'NULL');

  v_out := pg_temp.rerate_as('c7970000-0000-4000-8000-000000000001',
                             'c7970000-0000-4000-8000-0000000000c2', 15000);
  ASSERT v_out = '0',
    'FAIL k8d14: a second re-rate has nothing left to price; got ' || COALESCE(v_out, 'NULL');

  RAISE NOTICE 'us36r: case (k8d) passed — pending hours priced at the saved row, F1 included; count exact, one trace each, everything else untouched.';
END
$$;

-- ─── (k8e) P-4 stands afterwards ───────────────────────────────────────────
DO $$
DECLARE
  v_raised BOOLEAN;
  v_row RECORD;
BEGIN
  -- the owner/admin write policy admits the row, so it is aab_ that refuses
  v_raised := false;
  PERFORM pg_temp.assume_user('c7970000-0000-4000-8000-000000000001');
  BEGIN
    UPDATE public.project_time_entries SET hourly_rate_cents = 1
     WHERE id = 'c7970000-0000-4000-8000-0000000000b3';
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_raised, 'FAIL k8e1: an owner''s direct rate UPDATE of a priced hour is still refused';

  v_raised := false;
  PERFORM pg_temp.assume_user('c7970000-0000-4000-8000-000000000001');
  PERFORM set_config('app.rerate_time_entry_id', 'c7970000-0000-4000-8000-0000000000b3', true);
  PERFORM set_config('app.rerate_rate_id', 'c7970000-0000-4000-8000-0000000000c2', true);
  BEGIN
    UPDATE public.project_time_entries SET hourly_rate_cents = 1
     WHERE id = 'c7970000-0000-4000-8000-0000000000b3';
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  PERFORM set_config('app.rerate_time_entry_id', '', true);
  PERFORM set_config('app.rerate_rate_id', '', true);
  PERFORM pg_temp.reset_role();
  ASSERT v_raised, 'FAIL k8e2: the GUCs open nothing on a priced hour — aab_ still refuses';

  v_raised := false;
  PERFORM pg_temp.assume_user('c7970000-0000-4000-8000-000000000001');
  BEGIN
    UPDATE public.project_time_entries SET hourly_rate_cents = 1, rate_source = 'studio_member'
     WHERE id = 'c7970000-0000-4000-8000-0000000000b1';
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_raised, 'FAIL k8e3: a re-priced hour is frozen against callers like any priced hour';
  ASSERT (SELECT hourly_rate_cents FROM public.project_time_entries
          WHERE id = 'c7970000-0000-4000-8000-0000000000b3') = 9000,
    'FAIL k8e4: b3 keeps 9000';

  -- the member corrects her duration: started_at still answers 'none', so
  -- delta 5 keeps the K8 snapshot
  PERFORM pg_temp.assume_user('c7970000-0000-4000-8000-000000000003');
  UPDATE public.project_time_entries SET duration_minutes = 150
   WHERE id = 'c7970000-0000-4000-8000-0000000000b1';
  PERFORM pg_temp.reset_role();
  SELECT duration_minutes, hourly_rate_cents, rate_source, rated_amount_cents INTO v_row
  FROM public.project_time_entries WHERE id = 'c7970000-0000-4000-8000-0000000000b1';
  ASSERT v_row.duration_minutes = 150 AND v_row.hourly_rate_cents = 15000
     AND v_row.rate_source = 'studio_member' AND v_row.rated_amount_cents = 37500,
    'FAIL k8e5: a later edit keeps the K8 price while started_at still answers none; got '
    || COALESCE(v_row.duration_minutes::text, 'NULL') || ' / ' || COALESCE(v_row.hourly_rate_cents::text, 'NULL')
    || ' / ' || COALESCE(v_row.rate_source, 'NULL');

  RAISE NOTICE 'us36r: case (k8e) passed — P-4''s refusal stands for owner and GUCs alike; an edit keeps the K8 price while started_at answers none.';
END
$$;

-- ─── (k8f) the carve-out is the RPC's alone ────────────────────────────────
SELECT pg_temp.assume_user('c7970000-0000-4000-8000-000000000001');
INSERT INTO public.studio_member_rates (id, studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES ('c7970000-0000-4000-8000-0000000000c3', 'c7970000-0000-4000-8000-0000000000a1',
        'c7970000-0000-4000-8000-000000000004', 12000, (NOW() AT TIME ZONE 'UTC')::date,
        'c7970000-0000-4000-8000-000000000001');
SELECT pg_temp.reset_role();

DO $$
DECLARE
  v_out TEXT;
  v_count INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('c7970000-0000-4000-8000-000000000004');
  PERFORM set_config('app.rerate_time_entry_id', 'c7970000-0000-4000-8000-0000000000b8', true);
  PERFORM set_config('app.rerate_rate_id', 'c7970000-0000-4000-8000-0000000000c3', true);
  UPDATE public.project_time_entries SET duration_minutes = 75
   WHERE id = 'c7970000-0000-4000-8000-0000000000b8';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('app.rerate_time_entry_id', '', true);
  PERFORM set_config('app.rerate_rate_id', '', true);
  PERFORM pg_temp.reset_role();
  ASSERT v_count = 1, 'FAIL k8f0 (precondition): N may edit his own hour';
  ASSERT (SELECT duration_minutes = 75 AND rate_source = 'none' AND hourly_rate_cents IS NULL
          FROM public.project_time_entries WHERE id = 'c7970000-0000-4000-8000-0000000000b8'),
    'FAIL k8f1: a member who forges both GUCs on his own pending hour stays pending';

  v_out := pg_temp.rerate_as('c7970000-0000-4000-8000-000000000002',
                             'c7970000-0000-4000-8000-0000000000c3', 12000);
  ASSERT v_out = '1',
    'FAIL k8f2: the admin''s re-rate prices N''s hour; got ' || COALESCE(v_out, 'NULL');
  ASSERT (SELECT hourly_rate_cents = 12000 AND rate_source = 'studio_member' AND rated_amount_cents = 15000
                 AND updated_by = 'c7970000-0000-4000-8000-000000000002'
          FROM public.project_time_entries WHERE id = 'c7970000-0000-4000-8000-0000000000b8'),
    'FAIL k8f3: N''s hour takes his rate, stamped by the admin';

  RAISE NOTICE 'us36r: case (k8f) passed — forged GUCs price nothing.';
END
$$;

-- ─── (k8g) F2: the saved row is dated the studio's local tomorrow ──────────
-- c4: P's rate from 10 days ago, after b10 was logged. c5: the rate the owner
-- saves in a timezone already on tomorrow (the hook's local date), through
-- RLS. The ladder closes c4 at today, so the UTC day still belongs to 9000.
INSERT INTO public.studio_member_rates (id, studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES ('c7970000-0000-4000-8000-0000000000c4', 'c7970000-0000-4000-8000-0000000000a1',
        'c7970000-0000-4000-8000-000000000007', 9000, (NOW() AT TIME ZONE 'UTC')::date - 10,
        'c7970000-0000-4000-8000-000000000001');

SELECT pg_temp.assume_user('c7970000-0000-4000-8000-000000000001');
INSERT INTO public.studio_member_rates (id, studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES ('c7970000-0000-4000-8000-0000000000c5', 'c7970000-0000-4000-8000-0000000000a1',
        'c7970000-0000-4000-8000-000000000007', 15000, (NOW() AT TIME ZONE 'UTC')::date + 1,
        'c7970000-0000-4000-8000-000000000001');
SELECT pg_temp.reset_role();

DO $$
DECLARE
  v_out TEXT;
  v_cents INTEGER;
  v_row RECORD;
BEGIN
  ASSERT (SELECT effective_to FROM public.studio_member_rates
          WHERE id = 'c7970000-0000-4000-8000-0000000000c4') = (NOW() AT TIME ZONE 'UTC')::date,
    'FAIL k8g0 (precondition): c5 closed c4 at today';
  SELECT resolved.cents INTO v_cents
  FROM public.resolve_time_rate_cents('c7970000-0000-4000-8000-0000000000e1',
                                      'c7970000-0000-4000-8000-000000000007', NOW(), NULL) AS resolved;
  ASSERT v_cents = 9000,
    'FAIL k8g0b (precondition): asked at now(), the chain still answers the previous rate; got '
    || COALESCE(v_cents::text, 'NULL');
  ASSERT pg_temp.pending('c7970000-0000-4000-8000-000000000b10'),
    'FAIL k8g0c (precondition): b10 is pending — c4 starts after it';

  v_out := pg_temp.rerate_as('c7970000-0000-4000-8000-000000000001',
                             'c7970000-0000-4000-8000-0000000000c5', 15000);
  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_row
  FROM public.project_time_entries WHERE id = 'c7970000-0000-4000-8000-000000000b10';
  ASSERT v_row.hourly_rate_cents = 15000 AND v_row.rate_source = 'studio_member'
     AND v_row.rated_amount_cents = 15000,
    'FAIL k8g1 (F2): a saved row dated the studio''s local tomorrow re-rates at the NEW rate, not the previous one; got '
    || COALESCE(v_row.hourly_rate_cents::text, 'NULL') || ' / ' || COALESCE(v_row.rate_source, 'NULL');
  ASSERT v_out = '1',
    'FAIL k8g2: the re-rate prices exactly b10; got ' || COALESCE(v_out, 'NULL');

  RAISE NOTICE 'us36r: case (k8g) passed — F2: the new rate, not the UTC day''s.';
END
$$;

-- ─── (k8h) a self-written rate tier 2 ignores is refused ───────────────────
-- c6: the admin's own rate, written by herself. She is not the studio's owner,
-- so 00615 HT-3-e(2) never lets it price her hours.
INSERT INTO public.studio_member_rates (id, studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES ('c7970000-0000-4000-8000-0000000000c6', 'c7970000-0000-4000-8000-0000000000a1',
        'c7970000-0000-4000-8000-000000000002', 99000, (NOW() AT TIME ZONE 'UTC')::date,
        'c7970000-0000-4000-8000-000000000002');

DO $$
DECLARE
  v_out TEXT;
  v_count INTEGER;
BEGIN
  v_out := pg_temp.rerate_as('c7970000-0000-4000-8000-000000000001',
                             'c7970000-0000-4000-8000-0000000000c6', 99000);
  ASSERT v_out LIKE 'ERR|42501|rerate_pending_time_entries: a rate members set for themselves%',
    'FAIL k8h1: a self-written rate of a non-owner is refused; got ' || COALESCE(v_out, 'NULL');
  ASSERT pg_temp.pending('c7970000-0000-4000-8000-000000000b11')
     AND pg_temp.untouched('c7970000-0000-4000-8000-000000000b11'),
    'FAIL k8h2: the refused re-rate leaves her hour pending';

  -- she forges both GUCs on her own hour: she is an admin of the studio, but
  -- the row is still one tier 2 ignores
  PERFORM pg_temp.assume_user('c7970000-0000-4000-8000-000000000002');
  PERFORM set_config('app.rerate_time_entry_id', 'c7970000-0000-4000-8000-000000000b11', true);
  PERFORM set_config('app.rerate_rate_id', 'c7970000-0000-4000-8000-0000000000c6', true);
  UPDATE public.project_time_entries SET duration_minutes = 90
   WHERE id = 'c7970000-0000-4000-8000-000000000b11';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('app.rerate_time_entry_id', '', true);
  PERFORM set_config('app.rerate_rate_id', '', true);
  PERFORM pg_temp.reset_role();
  ASSERT v_count = 1, 'FAIL k8h3 (precondition): the admin may edit her own hour';
  ASSERT (SELECT duration_minutes = 90 AND rate_source = 'none' AND hourly_rate_cents IS NULL
          FROM public.project_time_entries WHERE id = 'c7970000-0000-4000-8000-000000000b11'),
    'FAIL k8h4: forging the GUCs with a self-written rate prices nothing';

  RAISE NOTICE 'us36r: case (k8h) passed — a self-written rate prices no pending hour.';
END
$$;

-- ─── (k8i) the refusal is per studio ───────────────────────────────────────
-- c7: M's rate in studio B, written by B's owner.
INSERT INTO public.studio_member_rates (id, studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES ('c7970000-0000-4000-8000-0000000000c7', 'c7970000-0000-4000-8000-0000000000a2',
        'c7970000-0000-4000-8000-000000000003', 13000, (NOW() AT TIME ZONE 'UTC')::date,
        'c7970000-0000-4000-8000-000000000005');

DO $$
DECLARE
  v_out TEXT;
BEGIN
  v_out := pg_temp.rerate_as('c7970000-0000-4000-8000-000000000001',
                             'c7970000-0000-4000-8000-0000000000c7', 13000);
  ASSERT v_out LIKE 'ERR|42501|rerate_pending_time_entries: only an owner or admin%',
    'FAIL k8i1: this studio''s owner is refused another studio''s row; got ' || COALESCE(v_out, 'NULL');
  ASSERT pg_temp.pending('c7970000-0000-4000-8000-0000000000b6'),
    'FAIL k8i2: the refused re-rate leaves b6 pending';

  v_out := pg_temp.rerate_as('c7970000-0000-4000-8000-000000000005',
                             'c7970000-0000-4000-8000-0000000000c7', 13000);
  ASSERT v_out = '1',
    'FAIL k8i3: the outsider re-rates in her own studio; got ' || COALESCE(v_out, 'NULL');
  ASSERT (SELECT hourly_rate_cents = 13000 AND rate_source = 'studio_member'
                 AND updated_by = 'c7970000-0000-4000-8000-000000000005'
          FROM public.project_time_entries WHERE id = 'c7970000-0000-4000-8000-0000000000b6'),
    'FAIL k8i4: M''s hour on studio B''s project takes studio B''s rate';
  RAISE NOTICE 'us36r: case (k8i) passed.';
END
$$;

-- ─── (k8j) SQ-1079 F1: a row a later-dated save closed is superseded ───────
-- k8g's shape, asked with the older row. Q (8), a member of studio A, logged
-- b12 40 days ago. c8: Q's rate from 10 days ago. c9: the rate the owner saves
-- dated the studio's local tomorrow, through RLS. The ladder closes c8 at
-- today, so the UTC day is still c8's, but a later row supersedes it.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('c7970000-0000-4000-8000-000000000008', 'us36r-member-q@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('c7970000-0000-4000-8000-000000000008', 'c7970000-0000-4000-8000-0000000000a1', 'member', 'active', NOW());
INSERT INTO public.project_time_entries
  (id, project_id, user_id, started_at, duration_minutes, billable, source)
VALUES ('c7970000-0000-4000-8000-000000000b12', 'c7970000-0000-4000-8000-0000000000e1',
        'c7970000-0000-4000-8000-000000000008', NOW() - INTERVAL '40 days', 60, true, 'manual_entry');
INSERT INTO public.studio_member_rates (id, studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES ('c7970000-0000-4000-8000-0000000000c8', 'c7970000-0000-4000-8000-0000000000a1',
        'c7970000-0000-4000-8000-000000000008', 9000, (NOW() AT TIME ZONE 'UTC')::date - 10,
        'c7970000-0000-4000-8000-000000000001');

SELECT pg_temp.assume_user('c7970000-0000-4000-8000-000000000001');
INSERT INTO public.studio_member_rates (id, studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES ('c7970000-0000-4000-8000-0000000000c9', 'c7970000-0000-4000-8000-0000000000a1',
        'c7970000-0000-4000-8000-000000000008', 15000, (NOW() AT TIME ZONE 'UTC')::date + 1,
        'c7970000-0000-4000-8000-000000000001');
SELECT pg_temp.reset_role();

DO $$
DECLARE
  v_out TEXT;
BEGIN
  ASSERT (SELECT effective_to FROM public.studio_member_rates
          WHERE id = 'c7970000-0000-4000-8000-0000000000c8') = (NOW() AT TIME ZONE 'UTC')::date,
    'FAIL k8j0 (precondition): c9 closed c8 at today';
  ASSERT pg_temp.pending('c7970000-0000-4000-8000-000000000b12'),
    'FAIL k8j0b (precondition): b12 is pending — c8 starts after it';

  v_out := pg_temp.rerate_as('c7970000-0000-4000-8000-000000000001',
                             'c7970000-0000-4000-8000-0000000000c8', 9000);
  ASSERT v_out LIKE 'ERR|23514|rerate_pending_time_entries: rate % has been superseded%',
    'FAIL k8j1 (SQ-1079 F1): a row a later-dated save closed is superseded, though today is still inside it; got '
    || COALESCE(v_out, 'NULL');
  ASSERT pg_temp.pending('c7970000-0000-4000-8000-000000000b12')
     AND pg_temp.untouched('c7970000-0000-4000-8000-000000000b12'),
    'FAIL k8j2 (SQ-1079 F1): the superseded row prices nothing';

  v_out := pg_temp.rerate_as('c7970000-0000-4000-8000-000000000001',
                             'c7970000-0000-4000-8000-0000000000c9', 15000);
  ASSERT v_out = '1'
     AND (SELECT hourly_rate_cents = 15000 AND rate_source = 'studio_member'
          FROM public.project_time_entries WHERE id = 'c7970000-0000-4000-8000-000000000b12'),
    'FAIL k8j3: the row that superseded it prices the hour; got ' || COALESCE(v_out, 'NULL');

  RAISE NOTICE 'us36r: case (k8j) passed — SQ-1079 F1: any later-dated row supersedes.';
END
$$;

-- ─── (k8k) SQ-1079 F2: a same-day correction keeps the row's id ────────────
-- R (9), a member of studio A, logged b13 50 days ago, before any rate. The
-- owner saves ca at 15000 today through RLS. The admin then corrects it the
-- same day, the way useSetStudioMemberRate's upsert writes. The row keeps its
-- id and now carries 20000.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('c7970000-0000-4000-8000-000000000009', 'us36r-member-r@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('c7970000-0000-4000-8000-000000000009', 'c7970000-0000-4000-8000-0000000000a1', 'member', 'active', NOW());
INSERT INTO public.project_time_entries
  (id, project_id, user_id, started_at, duration_minutes, billable, source)
VALUES ('c7970000-0000-4000-8000-000000000b13', 'c7970000-0000-4000-8000-0000000000e1',
        'c7970000-0000-4000-8000-000000000009', NOW() - INTERVAL '50 days', 120, true, 'manual_entry');

SELECT pg_temp.assume_user('c7970000-0000-4000-8000-000000000001');
INSERT INTO public.studio_member_rates (id, studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES ('c7970000-0000-4000-8000-0000000000ca', 'c7970000-0000-4000-8000-0000000000a1',
        'c7970000-0000-4000-8000-000000000009', 15000, (NOW() AT TIME ZONE 'UTC')::date,
        'c7970000-0000-4000-8000-000000000001');
SELECT pg_temp.reset_role();

SELECT pg_temp.assume_user('c7970000-0000-4000-8000-000000000002');
INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES ('c7970000-0000-4000-8000-0000000000a1', 'c7970000-0000-4000-8000-000000000009', 20000,
        (NOW() AT TIME ZONE 'UTC')::date, 'c7970000-0000-4000-8000-000000000002')
ON CONFLICT (studio_id, user_id, effective_from)
DO UPDATE SET hourly_rate_cents = EXCLUDED.hourly_rate_cents, created_by = EXCLUDED.created_by;
SELECT pg_temp.reset_role();

DO $$
DECLARE
  v_out TEXT;
BEGIN
  ASSERT (SELECT hourly_rate_cents FROM public.studio_member_rates
          WHERE id = 'c7970000-0000-4000-8000-0000000000ca') = 20000
     AND (SELECT count(*) FROM public.studio_member_rates
          WHERE user_id = 'c7970000-0000-4000-8000-000000000009') = 1,
    'FAIL k8k0 (precondition): the admin''s correction rewrote the owner''s row in place';

  -- the owner's re-rate, sent with the rate her save returned
  v_out := pg_temp.rerate_as('c7970000-0000-4000-8000-000000000001',
                             'c7970000-0000-4000-8000-0000000000ca', 15000);
  ASSERT v_out = 'ERR|PT409|rerate_pending_time_entries: the rate changed since you saved it; save it again to price these hours',
    'FAIL k8k1 (SQ-1079 F2): a re-rate whose saved rate was corrected since is refused; got ' || COALESCE(v_out, 'NULL');
  ASSERT pg_temp.pending('c7970000-0000-4000-8000-000000000b13')
     AND pg_temp.untouched('c7970000-0000-4000-8000-000000000b13'),
    'FAIL k8k2 (SQ-1079 F2): the refused re-rate prices nothing, at either rate';

  v_out := pg_temp.rerate_as('c7970000-0000-4000-8000-000000000002',
                             'c7970000-0000-4000-8000-0000000000ca', 20000);
  ASSERT v_out = '1'
     AND (SELECT hourly_rate_cents = 20000 AND rate_source = 'studio_member' AND rated_amount_cents = 40000
          FROM public.project_time_entries WHERE id = 'c7970000-0000-4000-8000-000000000b13'),
    'FAIL k8k3: a re-rate that names the corrected rate prices the hour at it; got ' || COALESCE(v_out, 'NULL');

  RAISE NOTICE 'us36r: case (k8k) passed — SQ-1079 F2: the act prices the rate its caller saved, or nothing.';
END
$$;

-- ─── (k8l) SQ-1079 F3: forged GUCs with a superseded row price nothing ─────
-- S (a), a member of studio A, logged b14 50 days ago. cb: S's rate from 30
-- days ago, which does not reach b14. cc: today's rate, saved by the owner
-- through RLS, closes cb at yesterday.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('c7970000-0000-4000-8000-00000000000a', 'us36r-member-s@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('c7970000-0000-4000-8000-00000000000a', 'c7970000-0000-4000-8000-0000000000a1', 'member', 'active', NOW());
INSERT INTO public.project_time_entries
  (id, project_id, user_id, started_at, duration_minutes, billable, source)
VALUES ('c7970000-0000-4000-8000-000000000b14', 'c7970000-0000-4000-8000-0000000000e1',
        'c7970000-0000-4000-8000-00000000000a', NOW() - INTERVAL '50 days', 120, true, 'manual_entry');
INSERT INTO public.studio_member_rates (id, studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES ('c7970000-0000-4000-8000-0000000000cb', 'c7970000-0000-4000-8000-0000000000a1',
        'c7970000-0000-4000-8000-00000000000a', 9000, (NOW() AT TIME ZONE 'UTC')::date - 30,
        'c7970000-0000-4000-8000-000000000001');

SELECT pg_temp.assume_user('c7970000-0000-4000-8000-000000000001');
INSERT INTO public.studio_member_rates (id, studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES ('c7970000-0000-4000-8000-0000000000cc', 'c7970000-0000-4000-8000-0000000000a1',
        'c7970000-0000-4000-8000-00000000000a', 15000, (NOW() AT TIME ZONE 'UTC')::date,
        'c7970000-0000-4000-8000-000000000001');
SELECT pg_temp.reset_role();

DO $$
DECLARE
  v_out TEXT;
  v_count INTEGER;
  v_row RECORD;
BEGIN
  v_out := pg_temp.rerate_as('c7970000-0000-4000-8000-000000000001',
                             'c7970000-0000-4000-8000-0000000000cb', 9000);
  ASSERT v_out LIKE 'ERR|23514|rerate_pending_time_entries: rate % has been superseded%',
    'FAIL k8l0 (precondition): the RPC refuses cb as superseded; got ' || COALESCE(v_out, 'NULL');

  -- the owner sets both GUCs herself, naming cb, and corrects S's duration
  PERFORM pg_temp.assume_user('c7970000-0000-4000-8000-000000000001');
  PERFORM set_config('app.rerate_time_entry_id', 'c7970000-0000-4000-8000-000000000b14', true);
  PERFORM set_config('app.rerate_rate_id', 'c7970000-0000-4000-8000-0000000000cb', true);
  UPDATE public.project_time_entries SET duration_minutes = 121
   WHERE id = 'c7970000-0000-4000-8000-000000000b14';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('app.rerate_time_entry_id', '', true);
  PERFORM set_config('app.rerate_rate_id', '', true);
  PERFORM pg_temp.reset_role();
  ASSERT v_count = 1, 'FAIL k8l1 (precondition): the owner may correct a member''s hour';
  SELECT duration_minutes, hourly_rate_cents, rate_source INTO v_row
  FROM public.project_time_entries WHERE id = 'c7970000-0000-4000-8000-000000000b14';
  ASSERT v_row.duration_minutes = 121 AND v_row.rate_source = 'none' AND v_row.hourly_rate_cents IS NULL,
    'FAIL k8l2 (SQ-1079 F3): forged GUCs naming a superseded row price nothing, and the edit itself lands; got '
    || COALESCE(v_row.duration_minutes::text, 'NULL') || ' / ' || COALESCE(v_row.hourly_rate_cents::text, 'NULL')
    || ' / ' || COALESCE(v_row.rate_source, 'NULL');

  v_out := pg_temp.rerate_as('c7970000-0000-4000-8000-000000000001',
                             'c7970000-0000-4000-8000-0000000000cc', 15000);
  ASSERT v_out = '1'
     AND (SELECT hourly_rate_cents = 15000 AND rate_source = 'studio_member' AND rated_amount_cents = 30250
          FROM public.project_time_entries WHERE id = 'c7970000-0000-4000-8000-000000000b14'),
    'FAIL k8l3: the current row still prices the hour through the act; got ' || COALESCE(v_out, 'NULL');

  RAISE NOTICE 'us36r: case (k8l) passed — SQ-1079 F3: forged GUCs get no more than the RPC.';
END
$$;

-- ─── (k8m) SQ-1079 F5: the count is the hours that moved ───────────────────
-- Studio C: B (b) its owner, A (c) an admin, D (d) a member. B leads e4 and
-- logged b15 and b16 before any rate. cd: the rate B wrote for herself today,
-- which tier 2 honours while she owns the studio (00615). A re-rates with it.
-- The walk classifies b15, then b16. A test trigger fired by b16's touch
-- UPDATE, before the classifier, has B hand her ownership to D through
-- transfer_studio_ownership. The RPC's opening check passed, but when b16 is
-- classified, cd no longer prices B's hours.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c7970000-0000-4000-8000-00000000000b', 'us36r-owner-b@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c7970000-0000-4000-8000-00000000000c', 'us36r-admin-a@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c7970000-0000-4000-8000-00000000000d', 'us36r-member-d@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('c7970000-0000-4000-8000-0000000000a3', 'design_studio', 'US36R Studio C', 'us36r-studio-c-test', 'active');

INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('c7970000-0000-4000-8000-00000000000b', 'c7970000-0000-4000-8000-0000000000a3', 'owner', 'active', NOW());
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('c7970000-0000-4000-8000-00000000000c', 'c7970000-0000-4000-8000-0000000000a3', 'admin',  'active', NOW()),
  ('c7970000-0000-4000-8000-00000000000d', 'c7970000-0000-4000-8000-0000000000a3', 'member', 'active', NOW());

INSERT INTO public.projects (id, name, designer_id, created_by, studio_id, status)
VALUES ('c7970000-0000-4000-8000-0000000000e4', 'US36R Studio C House',
        'c7970000-0000-4000-8000-00000000000b', 'c7970000-0000-4000-8000-00000000000b',
        'c7970000-0000-4000-8000-0000000000a3', 'active');

INSERT INTO public.project_time_entries
  (id, project_id, user_id, started_at, duration_minutes, billable, source)
VALUES
  ('c7970000-0000-4000-8000-000000000b15', 'c7970000-0000-4000-8000-0000000000e4',
   'c7970000-0000-4000-8000-00000000000b', NOW() - INTERVAL '50 days', 60, true, 'manual_entry'),
  ('c7970000-0000-4000-8000-000000000b16', 'c7970000-0000-4000-8000-0000000000e4',
   'c7970000-0000-4000-8000-00000000000b', NOW() - INTERVAL '40 days', 60, true, 'manual_entry');

INSERT INTO public.studio_member_rates (id, studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES ('c7970000-0000-4000-8000-0000000000cd', 'c7970000-0000-4000-8000-0000000000a3',
        'c7970000-0000-4000-8000-00000000000b', 11000, (NOW() AT TIME ZONE 'UTC')::date,
        'c7970000-0000-4000-8000-00000000000b');

CREATE FUNCTION public.us36r_test_hand_over_ownership()
RETURNS trigger AS $$
DECLARE
  v_claims TEXT := current_setting('request.jwt.claims', true);
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', 'c7970000-0000-4000-8000-00000000000b', 'role', 'authenticated')::text, true);
  PERFORM public.transfer_studio_ownership('c7970000-0000-4000-8000-0000000000a3',
                                           'c7970000-0000-4000-8000-00000000000d');
  PERFORM set_config('request.jwt.claims', v_claims, true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER aaa_us36r_test_hand_over_ownership_trg
BEFORE UPDATE ON public.project_time_entries
FOR EACH ROW WHEN (NEW.id = 'c7970000-0000-4000-8000-000000000b16')
EXECUTE FUNCTION public.us36r_test_hand_over_ownership();

DO $$
DECLARE
  v_out TEXT;
BEGIN
  ASSERT pg_temp.pending('c7970000-0000-4000-8000-000000000b15')
     AND pg_temp.pending('c7970000-0000-4000-8000-000000000b16'),
    'FAIL k8m0 (precondition): b15 and b16 start pending';

  v_out := pg_temp.rerate_as('c7970000-0000-4000-8000-00000000000c',
                             'c7970000-0000-4000-8000-0000000000cd', 11000);

  ASSERT (SELECT role FROM public.organization_members
          WHERE organization_id = 'c7970000-0000-4000-8000-0000000000a3'
            AND user_id = 'c7970000-0000-4000-8000-00000000000b') = 'admin'
     AND (SELECT role FROM public.organization_members
          WHERE organization_id = 'c7970000-0000-4000-8000-0000000000a3'
            AND user_id = 'c7970000-0000-4000-8000-00000000000d') = 'owner',
    'FAIL k8m1 (precondition): B handed her ownership to D during the walk; got ' || COALESCE(v_out, 'NULL');
  ASSERT (SELECT hourly_rate_cents = 11000 AND rate_source = 'studio_member'
                 AND updated_by = 'c7970000-0000-4000-8000-00000000000c'
          FROM public.project_time_entries WHERE id = 'c7970000-0000-4000-8000-000000000b15'),
    'FAIL k8m2: b15, classified while B still owned the studio, takes her rate';
  ASSERT pg_temp.pending('c7970000-0000-4000-8000-000000000b16'),
    'FAIL k8m3: b16, classified after she handed it over, stays pending';
  ASSERT v_out = '1',
    'FAIL k8m4 (SQ-1079 F5): the count is the hours this call moved off none, b15 alone; got ' || COALESCE(v_out, 'NULL');

  RAISE NOTICE 'us36r: case (k8m) passed — SQ-1079 F5: only real transitions are counted.';
END
$$;

DROP TRIGGER aaa_us36r_test_hand_over_ownership_trg ON public.project_time_entries;
DROP FUNCTION public.us36r_test_hand_over_ownership();

DO $$ BEGIN RAISE NOTICE 'All us36_rerate_pending_hours assertions passed.'; END $$;

ROLLBACK;
