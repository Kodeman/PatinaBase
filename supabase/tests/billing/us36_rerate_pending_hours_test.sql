-- ═══════════════════════════════════════════════════════════════════════════
-- 00797 — US-36 R1: re-rate pending hours on set (K8, amends P-4)
--
--   (k8a) nothing to price: with no rate in force, the owner's re-rate returns
--         0 and every pending hour stays 'none' with no trace and no
--         updated_by. An admin is admitted the same way.
--   (k8b) refusals: the member whose hours they are, and an outsider who
--         owns another studio, are refused with 42501 and nothing moves.
--   (k8c) the owner sets a rate today and re-rates. Hours logged before any
--         rate take the rate just set. An hour a rate covered at started_at
--         takes that rate (the chain's own answer). The count is exact. Each
--         re-priced hour leaves one audit_logs row, with the owner as actor, and
--         is stamped updated_by = the owner. Untouched, with no trace: a priced
--         hour, an invoiced pending hour, and the same member's pending hour on
--         a project another studio prices. A second run returns 0.
--   (k8d) P-4 stands afterwards: an owner's direct rate UPDATE of a priced
--         hour and of a re-priced hour is refused (aab_), even with the GUC
--         forged. A later edit by the member keeps the K8 price.
--   (k8e) the carve-out is the RPC's alone: a member who forges the GUC on his
--         own pending hour, with a rate in force, stays pending. The admin's
--         re-rate then prices it.
--   (k8f) the refusal is per studio: the outsider is admitted to re-rate in
--         her own studio.
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
-- member N; 5 outsider (owner of studio B); 6 a client for the invoice.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c7970000-0000-4000-8000-000000000001', 'us36r-owner@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c7970000-0000-4000-8000-000000000002', 'us36r-admin@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c7970000-0000-4000-8000-000000000003', 'us36r-member-m@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c7970000-0000-4000-8000-000000000004', 'us36r-member-n@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c7970000-0000-4000-8000-000000000005', 'us36r-outsider@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c7970000-0000-4000-8000-000000000006', 'us36r-client@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

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
  ('c7970000-0000-4000-8000-000000000005', 'c7970000-0000-4000-8000-0000000000a2', 'owner',  'active', NOW());

-- A non-services project studio A prices (its owner leads it), and one studio
-- B prices.
INSERT INTO public.projects (id, name, designer_id, created_by, studio_id, status)
VALUES
  ('c7970000-0000-4000-8000-0000000000e1', 'US36R House',
   'c7970000-0000-4000-8000-000000000001', 'c7970000-0000-4000-8000-000000000001',
   'c7970000-0000-4000-8000-0000000000a1', 'active'),
  ('c7970000-0000-4000-8000-0000000000e2', 'US36R Outside House',
   'c7970000-0000-4000-8000-000000000005', 'c7970000-0000-4000-8000-000000000005',
   'c7970000-0000-4000-8000-0000000000a2', 'active');

INSERT INTO public.invoices (id, project_id, designer_id, client_id, status, currency, memo)
VALUES ('c7970000-0000-4000-8000-0000000000f1', 'c7970000-0000-4000-8000-0000000000e1',
        'c7970000-0000-4000-8000-000000000001', 'c7970000-0000-4000-8000-000000000006',
        'draft', 'USD', 'US36R draft');

-- Hours logged before ANY rate exists, so every one prices 'none':
--   b1, b2  M, 50 and 40 days ago   → the K8 case: priced at the rate set today
--   b4      M, 45 days ago          → then invoiced (the pre-00617 claim shape)
--   b7      M, 25 days ago          → a rate written later covers its started_at
--   b8      N, 10 days ago          → N has no rate until (k8e)
--   b6      M, on studio B's project
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
   'c7970000-0000-4000-8000-000000000003', NOW() - INTERVAL '10 days', 60, true, 'manual_entry');

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

-- rerate_pending_time_entries as p_actor: the count, or 'ERR|SQLSTATE|message'.
CREATE OR REPLACE FUNCTION pg_temp.rerate_as(p_actor UUID, p_studio UUID, p_designer UUID)
RETURNS TEXT AS $$
DECLARE
  v_out TEXT;
BEGIN
  PERFORM pg_temp.assume_user(p_actor);
  BEGIN
    v_out := public.rerate_pending_time_entries(p_studio, p_designer)::text;
  EXCEPTION WHEN OTHERS THEN v_out := 'ERR|' || SQLSTATE || '|' || SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
  RETURN v_out;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.rerate_as(UUID, UUID, UUID) TO PUBLIC;

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

-- ─── preconditions ─────────────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.project_time_entries
           WHERE id::text LIKE 'c7970000-%' AND rate_source = 'none' AND hourly_rate_cents IS NULL) = 6,
    'FAIL p0 (precondition): all six fixture hours start rate pending';
  ASSERT (SELECT billing_state FROM public.project_time_entries
           WHERE id = 'c7970000-0000-4000-8000-0000000000b1') = 'authorized',
    'FAIL p0b (precondition): a non-services hour is authorized (what the composer lists)';
  ASSERT (SELECT invoice_id FROM public.project_time_entries
           WHERE id = 'c7970000-0000-4000-8000-0000000000b4') = 'c7970000-0000-4000-8000-0000000000f1',
    'FAIL p0c (precondition): b4 is an invoiced pending hour';
  RAISE NOTICE 'us36r: preconditions passed.';
END
$$;

-- ─── (k8a) nothing to price stays untouched ────────────────────────────────
DO $$
DECLARE
  v_out TEXT;
BEGIN
  v_out := pg_temp.rerate_as('c7970000-0000-4000-8000-000000000001',
                             'c7970000-0000-4000-8000-0000000000a1', 'c7970000-0000-4000-8000-000000000003');
  ASSERT pg_temp.untouched('c7970000-0000-4000-8000-0000000000b4'),
    'FAIL k8a0: an invoiced pending hour is never touched';
  ASSERT (SELECT bool_and(rate_source = 'none' AND hourly_rate_cents IS NULL)
          FROM public.project_time_entries
          WHERE id IN ('c7970000-0000-4000-8000-0000000000b1', 'c7970000-0000-4000-8000-0000000000b2',
                       'c7970000-0000-4000-8000-0000000000b7')),
    'FAIL k8a2: an unresolvable hour stays ''none''';
  ASSERT pg_temp.untouched('c7970000-0000-4000-8000-0000000000b1')
     AND pg_temp.untouched('c7970000-0000-4000-8000-0000000000b2')
     AND pg_temp.untouched('c7970000-0000-4000-8000-0000000000b7'),
    'FAIL k8a3: a still-pending hour is skipped, not written: no trace, no updated_by';
  ASSERT v_out = '0',
    'FAIL k8a1: with no rate in force the owner''s re-rate prices nothing; got ' || COALESCE(v_out, 'NULL');

  v_out := pg_temp.rerate_as('c7970000-0000-4000-8000-000000000002',
                             'c7970000-0000-4000-8000-0000000000a1', 'c7970000-0000-4000-8000-000000000004');
  ASSERT v_out = '0',
    'FAIL k8a4: an admin is admitted, and N''s hour (no rate) stays pending; got ' || COALESCE(v_out, 'NULL');
  ASSERT pg_temp.untouched('c7970000-0000-4000-8000-0000000000b8'),
    'FAIL k8a5: N''s still-pending hour carries no trace';

  RAISE NOTICE 'us36r: case (k8a) passed — nothing to price, nothing written.';
END
$$;

-- A rate that started 30 days ago (so b7 at 25 days falls inside it), then
-- the hour M logs under it.
INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES ('c7970000-0000-4000-8000-0000000000a1', 'c7970000-0000-4000-8000-000000000003',
        9000, (NOW() AT TIME ZONE 'UTC')::date - 30, 'c7970000-0000-4000-8000-000000000001');

INSERT INTO public.project_time_entries
  (id, project_id, user_id, started_at, duration_minutes, billable, source)
VALUES ('c7970000-0000-4000-8000-0000000000b3', 'c7970000-0000-4000-8000-0000000000e1',
        'c7970000-0000-4000-8000-000000000003', NOW() - INTERVAL '20 days', 60, true, 'manual_entry');

DO $$
BEGIN
  ASSERT (SELECT hourly_rate_cents = 9000 AND rate_source = 'studio_member'
          FROM public.project_time_entries WHERE id = 'c7970000-0000-4000-8000-0000000000b3'),
    'FAIL p1 (precondition): b3 is a priced hour at 9000 / studio_member';
  ASSERT (SELECT rate_source = 'none' FROM public.project_time_entries
          WHERE id = 'c7970000-0000-4000-8000-0000000000b7'),
    'FAIL p1b (precondition): b7 is still stored pending — a rate written later does not reach it by itself';
END
$$;

-- ─── (k8b) refusals ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_out TEXT;
BEGIN
  v_out := pg_temp.rerate_as('c7970000-0000-4000-8000-000000000003',
                             'c7970000-0000-4000-8000-0000000000a1', 'c7970000-0000-4000-8000-000000000003');
  -- the RPC's own refusal, not a 42501 raised further down the resolver
  ASSERT v_out LIKE 'ERR|42501|rerate_pending_time_entries: only an owner or admin%',
    'FAIL k8b1: a plain member (the subject herself) is refused; got ' || COALESCE(v_out, 'NULL');

  v_out := pg_temp.rerate_as('c7970000-0000-4000-8000-000000000005',
                             'c7970000-0000-4000-8000-0000000000a1', 'c7970000-0000-4000-8000-000000000003');
  ASSERT v_out LIKE 'ERR|42501|rerate_pending_time_entries: only an owner or admin%',
    'FAIL k8b2: an outsider (owner of another studio) is refused; got ' || COALESCE(v_out, 'NULL');

  ASSERT (SELECT bool_and(rate_source = 'none') FROM public.project_time_entries
          WHERE id IN ('c7970000-0000-4000-8000-0000000000b1', 'c7970000-0000-4000-8000-0000000000b7')),
    'FAIL k8b3: a refused re-rate moves nothing';

  RAISE NOTICE 'us36r: case (k8b) passed — member and outsider refused.';
END
$$;

-- ─── (k8c) the owner sets today's rate, then re-rates ──────────────────────
-- Set through RLS as the owner, the way useSetStudioMemberRate writes it.
SELECT pg_temp.assume_user('c7970000-0000-4000-8000-000000000001');
INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES ('c7970000-0000-4000-8000-0000000000a1', 'c7970000-0000-4000-8000-000000000003',
        15000, (NOW() AT TIME ZONE 'UTC')::date, 'c7970000-0000-4000-8000-000000000001');
SELECT pg_temp.reset_role();

DO $$
DECLARE
  v_out TEXT;
  v_row RECORD;
BEGIN
  v_out := pg_temp.rerate_as('c7970000-0000-4000-8000-000000000001',
                             'c7970000-0000-4000-8000-0000000000a1', 'c7970000-0000-4000-8000-000000000003');

  -- untouched
  ASSERT (SELECT hourly_rate_cents = 9000 AND rate_source = 'studio_member'
          FROM public.project_time_entries WHERE id = 'c7970000-0000-4000-8000-0000000000b3')
     AND pg_temp.untouched('c7970000-0000-4000-8000-0000000000b3'),
    'FAIL k8c8: a priced hour is never re-priced or touched';
  ASSERT (SELECT rate_source = 'none' AND hourly_rate_cents IS NULL
                 AND invoice_id = 'c7970000-0000-4000-8000-0000000000f1'
          FROM public.project_time_entries WHERE id = 'c7970000-0000-4000-8000-0000000000b4')
     AND pg_temp.untouched('c7970000-0000-4000-8000-0000000000b4'),
    'FAIL k8c9: an invoiced pending hour is never re-priced or touched';
  ASSERT (SELECT rate_source = 'none' FROM public.project_time_entries
          WHERE id = 'c7970000-0000-4000-8000-0000000000b6')
     AND pg_temp.untouched('c7970000-0000-4000-8000-0000000000b6'),
    'FAIL k8c10: the member''s hour on a project another studio prices is not this studio''s to price';
  ASSERT (SELECT rate_source = 'none' FROM public.project_time_entries
          WHERE id = 'c7970000-0000-4000-8000-0000000000b8')
     AND pg_temp.untouched('c7970000-0000-4000-8000-0000000000b8'),
    'FAIL k8c11: another member''s pending hour is not re-rated';

  SELECT hourly_rate_cents, rate_source, rated_amount_cents, updated_by INTO v_row
  FROM public.project_time_entries WHERE id = 'c7970000-0000-4000-8000-0000000000b1';
  ASSERT v_row.hourly_rate_cents = 15000 AND v_row.rate_source = 'studio_member'
     AND v_row.rated_amount_cents = 30000,
    'FAIL k8c2: an hour logged before any rate takes the rate just set; got '
    || COALESCE(v_row.hourly_rate_cents::text, 'NULL') || ' / ' || COALESCE(v_row.rate_source, 'NULL')
    || ' / ' || COALESCE(v_row.rated_amount_cents::text, 'NULL');
  ASSERT v_row.updated_by = 'c7970000-0000-4000-8000-000000000001',
    'FAIL k8c3: the re-priced hour is stamped updated_by = the owner';
  ASSERT (SELECT hourly_rate_cents = 15000 AND rate_source = 'studio_member' AND rated_amount_cents = 15000
          FROM public.project_time_entries WHERE id = 'c7970000-0000-4000-8000-0000000000b2'),
    'FAIL k8c4: b2 takes the rate just set';

  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_row
  FROM public.project_time_entries WHERE id = 'c7970000-0000-4000-8000-0000000000b7';
  ASSERT v_row.hourly_rate_cents = 9000 AND v_row.rate_source = 'studio_member'
     AND v_row.rated_amount_cents = 13500,
    'FAIL k8c5: an hour a rate covers at started_at takes THAT rate (the chain''s own answer); got '
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
    'FAIL k8c6: one audit_logs trace per re-priced hour, actor = the owner';
  ASSERT (SELECT count(*) FROM public.audit_logs
          WHERE resource_type = 'project_time_entries'
            AND user_id = 'c7970000-0000-4000-8000-000000000001'
            AND resource_id::text LIKE 'c7970000-%') = 3,
    'FAIL k8c7: exactly three traces for three re-priced hours';
  ASSERT v_out = '3',
    'FAIL k8c1: the owner''s re-rate prices exactly b1, b2 and b7; got ' || COALESCE(v_out, 'NULL');

  v_out := pg_temp.rerate_as('c7970000-0000-4000-8000-000000000001',
                             'c7970000-0000-4000-8000-0000000000a1', 'c7970000-0000-4000-8000-000000000003');
  ASSERT v_out = '0',
    'FAIL k8c12: a second re-rate has nothing left to price; got ' || COALESCE(v_out, 'NULL');

  RAISE NOTICE 'us36r: case (k8c) passed — pending hours priced, count exact, one trace each, everything else untouched.';
END
$$;

-- ─── (k8d) P-4 stands afterwards ───────────────────────────────────────────
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
  ASSERT v_raised, 'FAIL k8d1: an owner''s direct rate UPDATE of a priced hour is still refused';

  v_raised := false;
  PERFORM pg_temp.assume_user('c7970000-0000-4000-8000-000000000001');
  PERFORM set_config('app.rerate_time_entry_id', 'c7970000-0000-4000-8000-0000000000b3', true);
  BEGIN
    UPDATE public.project_time_entries SET hourly_rate_cents = 1
     WHERE id = 'c7970000-0000-4000-8000-0000000000b3';
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  PERFORM set_config('app.rerate_time_entry_id', '', true);
  PERFORM pg_temp.reset_role();
  ASSERT v_raised, 'FAIL k8d2: the GUC opens nothing on a priced hour — aab_ still refuses';

  v_raised := false;
  PERFORM pg_temp.assume_user('c7970000-0000-4000-8000-000000000001');
  BEGIN
    UPDATE public.project_time_entries SET hourly_rate_cents = 1, rate_source = 'studio_member'
     WHERE id = 'c7970000-0000-4000-8000-0000000000b1';
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_raised, 'FAIL k8d3: a re-priced hour is frozen against callers like any priced hour';
  ASSERT (SELECT hourly_rate_cents FROM public.project_time_entries
          WHERE id = 'c7970000-0000-4000-8000-0000000000b3') = 9000,
    'FAIL k8d4: b3 keeps 9000';

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
    'FAIL k8d5: a later edit keeps the K8 price; got '
    || COALESCE(v_row.duration_minutes::text, 'NULL') || ' / ' || COALESCE(v_row.hourly_rate_cents::text, 'NULL')
    || ' / ' || COALESCE(v_row.rate_source, 'NULL');

  RAISE NOTICE 'us36r: case (k8d) passed — P-4''s refusal stands for owner and GUC alike.';
END
$$;

-- ─── (k8e) the carve-out is the RPC's alone ────────────────────────────────
SELECT pg_temp.assume_user('c7970000-0000-4000-8000-000000000001');
INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES ('c7970000-0000-4000-8000-0000000000a1', 'c7970000-0000-4000-8000-000000000004',
        12000, (NOW() AT TIME ZONE 'UTC')::date, 'c7970000-0000-4000-8000-000000000001');
SELECT pg_temp.reset_role();

DO $$
DECLARE
  v_out TEXT;
  v_count INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('c7970000-0000-4000-8000-000000000004');
  PERFORM set_config('app.rerate_time_entry_id', 'c7970000-0000-4000-8000-0000000000b8', true);
  UPDATE public.project_time_entries SET duration_minutes = 75
   WHERE id = 'c7970000-0000-4000-8000-0000000000b8';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('app.rerate_time_entry_id', '', true);
  PERFORM pg_temp.reset_role();
  ASSERT v_count = 1, 'FAIL k8e0 (precondition): N may edit his own hour';
  ASSERT (SELECT duration_minutes = 75 AND rate_source = 'none' AND hourly_rate_cents IS NULL
          FROM public.project_time_entries WHERE id = 'c7970000-0000-4000-8000-0000000000b8'),
    'FAIL k8e1: a member who forges the GUC on his own pending hour stays pending';

  v_out := pg_temp.rerate_as('c7970000-0000-4000-8000-000000000002',
                             'c7970000-0000-4000-8000-0000000000a1', 'c7970000-0000-4000-8000-000000000004');
  ASSERT v_out = '1',
    'FAIL k8e2: the admin''s re-rate prices N''s hour; got ' || COALESCE(v_out, 'NULL');
  ASSERT (SELECT hourly_rate_cents = 12000 AND rate_source = 'studio_member' AND rated_amount_cents = 15000
                 AND updated_by = 'c7970000-0000-4000-8000-000000000002'
          FROM public.project_time_entries WHERE id = 'c7970000-0000-4000-8000-0000000000b8'),
    'FAIL k8e3: N''s hour takes his rate, stamped by the admin';

  RAISE NOTICE 'us36r: case (k8e) passed — a forged GUC prices nothing.';
END
$$;

-- ─── (k8f) the refusal is per studio ───────────────────────────────────────
DO $$
DECLARE
  v_out TEXT;
BEGIN
  v_out := pg_temp.rerate_as('c7970000-0000-4000-8000-000000000005',
                             'c7970000-0000-4000-8000-0000000000a2', 'c7970000-0000-4000-8000-000000000003');
  ASSERT v_out = '0',
    'FAIL k8f1: the outsider re-rates in her own studio (M has no rate there); got ' || COALESCE(v_out, 'NULL');
  RAISE NOTICE 'us36r: case (k8f) passed.';
END
$$;

DO $$ BEGIN RAISE NOTICE 'All us36_rerate_pending_hours assertions passed.'; END $$;

ROLLBACK;
