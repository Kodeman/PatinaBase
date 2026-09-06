-- ═══════════════════════════════════════════════════════════════════════════
-- 00575 — Projection parity. THE test that proves the projection was not forked.
-- Runner: plain psql, ON_ERROR_STOP=1. Single transaction, ROLLBACK at the end.
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/commercial/agreement_parts_projection_test.sql
--
-- Two agreements are authored to say the SAME THING by the two different
-- doors: A through upsert_design_services_draft (the seven-facet room, the
-- flag-off path) and B through upsert_agreement_parts (the composed part
-- list). Their proposal_service_terms rows and their proposal_service_rates
-- sets must be indistinguishable. If they ever diverge, the money rail has
-- two implementations and the one the guards enforce is a coin toss.
--
-- Then R5: a removed part is ABSENT rather than sticky, and only the nine
-- patina.* keys write the money row — a custom schedule part, even one
-- carrying cents, is recorded and hashed and projects nothing.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id uuid, p_role text DEFAULT 'authenticated')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user_id, 'role', p_role
  )::text, true);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(uuid, text) TO PUBLIC;

-- The comparable shape of a terms row: everything except its identity and its
-- clock. proposal_id differs by construction; the timestamps differ by the
-- microsecond the two calls happened to land on.
CREATE OR REPLACE FUNCTION pg_temp.terms_shape(p_id uuid) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT to_jsonb(t) - 'proposal_id' - 'created_at' - 'updated_at'
  FROM public.proposal_service_terms t WHERE t.proposal_id = p_id;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.terms_shape(uuid) TO PUBLIC;

-- effective_at is excluded for the same reason: the seven-facet room sends one
-- and a rate_card part does not, so both fall to the projection's now().
CREATE OR REPLACE FUNCTION pg_temp.rates_shape(p_id uuid) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT COALESCE(jsonb_agg(
    to_jsonb(r) - 'id' - 'proposal_id' - 'created_at' - 'effective_at'
    ORDER BY r.version, r.sort_order, r.role_name
  ), '[]'::jsonb)
  FROM public.proposal_service_rates r WHERE r.proposal_id = p_id;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.rates_shape(uuid) TO PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════
-- (0) FIXTURE — one studio, one designer, one client, two draft agreements.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('a6000000-0000-4000-8000-000000000001', 'app-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a6000000-0000-4000-8000-000000000002', 'app-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

SET LOCAL session_replication_role = replica;
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('a6000000-0000-4000-8000-000000000001', 'app-designer@test.invalid', 'Parity Designer', true, now(), now()),
  ('a6000000-0000-4000-8000-000000000002', 'app-client@test.invalid', 'Parity Client', false, now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;
SET LOCAL session_replication_role = origin;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('a6100000-0000-4000-8000-000000000001', 'design_studio',
        'Parity Studio', 'agreement-projection-test', 'active');

SELECT pg_temp.assume_user('a6000000-0000-4000-8000-000000000001', 'service_role');
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('a6110000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001',
        'a6100000-0000-4000-8000-000000000001', 'owner', 'active', now());

INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, status, source)
VALUES ('a6200000-0000-4000-8000-000000000001',
        'a6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000002',
        'Parity Client', 'proposal', 'direct');

INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, description,
  total_amount, status, valid_until
) VALUES
  ('a6300000-0000-4000-8000-00000000000a', 'a6000000-0000-4000-8000-000000000001',
   'a6200000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000002',
   'A — the seven-facet room', 'Authored the old way.', 0, 'draft', DATE '2027-06-01'),
  ('a6300000-0000-4000-8000-00000000000b', 'a6000000-0000-4000-8000-000000000001',
   'a6200000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000002',
   'B — the composed part list', 'Authored the new way.', 0, 'draft', DATE '2027-06-01');

SELECT pg_temp.assume_user('a6000000-0000-4000-8000-000000000001');

-- ═══════════════════════════════════════════════════════════════════════════
-- (1)-(4) THE SAME AGREEMENT, SAID TWICE.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE v_a jsonb; v_b jsonb;
BEGIN
  -- (1) A, through the seven-facet room.
  PERFORM public.upsert_design_services_draft(
    'a6300000-0000-4000-8000-00000000000a',
    jsonb_build_object(
      'scope', 'Full-service interior design for the whole house.',
      'deliverables', jsonb_build_array(
        'Concept presentation', 'Design documentation', 'Selection schedules'),
      'exclusions', jsonb_build_array(
        'Construction labor', 'Furnishings, freight, tax, and installation'),
      'billingCeilingCents', 2400000,
      'retainerAmountCents', 500000,
      'retainerActivationPolicy', 'retainer_paid',
      'billingCadence', 'biweekly',
      'currency', 'USD',
      'terms', 'Billed at actual hours against the signed ceiling.',
      'currentRateVersion', 1,
      'furnishingsDepositPercent', 50
    ),
    jsonb_build_array(
      jsonb_build_object('version', 1, 'roleName', 'Principal',
        'hourlyRateCents', 22500, 'sortOrder', 0, 'effectiveAt', DATE '2026-01-01'),
      jsonb_build_object('version', 1, 'roleName', 'Senior Designer',
        'hourlyRateCents', 15000, 'sortOrder', 1, 'effectiveAt', DATE '2026-01-01'),
      jsonb_build_object('version', 1, 'roleName', 'Junior Designer',
        'hourlyRateCents', 9500, 'sortOrder', 2, 'effectiveAt', DATE '2026-01-01')
    )
  );

  -- (2) B, through the nine standard parts, encoding the same values.
  PERFORM public.upsert_agreement_parts(
    'a6300000-0000-4000-8000-00000000000b',
    jsonb_build_array(
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.services',
        'title', 'Services', 'required', true,
        'payload', jsonb_build_object(
          'body', 'Full-service interior design for the whole house.')),
      jsonb_build_object('kind', 'list', 'partKey', 'patina.deliverables',
        'title', 'Deliverables',
        'payload', jsonb_build_object('items', jsonb_build_array(
          jsonb_build_object('id', 'd1', 'text', 'Concept presentation'),
          jsonb_build_object('id', 'd2', 'text', 'Design documentation'),
          jsonb_build_object('id', 'd3', 'text', 'Selection schedules')))),
      jsonb_build_object('kind', 'list', 'partKey', 'patina.exclusions',
        'title', 'Exclusions',
        'payload', jsonb_build_object('items', jsonb_build_array(
          jsonb_build_object('id', 'x1', 'text', 'Construction labor'),
          jsonb_build_object('id', 'x2', 'text', 'Furnishings, freight, tax, and installation')))),
      jsonb_build_object('kind', 'schedule', 'variant', 'rate_card',
        'partKey', 'patina.role_rates', 'title', 'Role rates',
        'payload', jsonb_build_object('roles', jsonb_build_array(
          jsonb_build_object('roleName', 'Principal', 'hourlyRateCents', 22500, 'sortOrder', 0),
          jsonb_build_object('roleName', 'Senior Designer', 'hourlyRateCents', 15000, 'sortOrder', 1),
          jsonb_build_object('roleName', 'Junior Designer', 'hourlyRateCents', 9500, 'sortOrder', 2)))),
      jsonb_build_object('kind', 'schedule', 'variant', 'ceiling',
        'partKey', 'patina.ceiling', 'title', 'Ceiling',
        'payload', jsonb_build_object('cents', 2400000)),
      jsonb_build_object('kind', 'schedule', 'variant', 'procurement',
        'partKey', 'patina.deposit', 'title', 'Furnishings deposit',
        'payload', jsonb_build_object('depositPercent', 50)),
      jsonb_build_object('kind', 'schedule', 'variant', 'retainer',
        'partKey', 'patina.retainer', 'title', 'Retainer',
        'payload', jsonb_build_object(
          'cents', 500000, 'creditRule', 'credited', 'activationPolicy', 'retainer_paid')),
      jsonb_build_object('kind', 'schedule', 'variant', 'cadence',
        'partKey', 'patina.cadence', 'title', 'Billing cadence',
        'payload', jsonb_build_object('cadence', 'biweekly')),
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.terms',
        'title', 'Terms', 'required', true,
        'payload', jsonb_build_object(
          'body', 'Billed at actual hours against the signed ceiling.'))
    )
  );

  -- (3) the terms row
  v_a := pg_temp.terms_shape('a6300000-0000-4000-8000-00000000000a');
  v_b := pg_temp.terms_shape('a6300000-0000-4000-8000-00000000000b');
  ASSERT v_a IS NOT NULL AND v_b IS NOT NULL, 'both doors must write a terms row';
  ASSERT v_a = v_b, format(
    'THE PROJECTION FORKED. seven-facet room: %s ||| composed parts: %s', v_a, v_b);

  -- (4) the rate set
  v_a := pg_temp.rates_shape('a6300000-0000-4000-8000-00000000000a');
  v_b := pg_temp.rates_shape('a6300000-0000-4000-8000-00000000000b');
  ASSERT jsonb_array_length(v_a) = 3, 'A must carry three rates';
  ASSERT v_a = v_b, format(
    'THE RATE PROJECTION FORKED. seven-facet room: %s ||| composed parts: %s', v_a, v_b);

  RAISE NOTICE 'PASS 1-4: both doors write one indistinguishable money row';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (5) A REMOVED PART IS ABSENT, NOT STICKY.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  PERFORM public.upsert_agreement_parts(
    'a6300000-0000-4000-8000-00000000000b',
    jsonb_build_array(
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.services',
        'title', 'Services', 'required', true,
        'payload', jsonb_build_object(
          'body', 'Full-service interior design for the whole house.')),
      jsonb_build_object('kind', 'list', 'partKey', 'patina.deliverables',
        'title', 'Deliverables',
        'payload', jsonb_build_object('items', jsonb_build_array(
          jsonb_build_object('id', 'd1', 'text', 'Concept presentation'),
          jsonb_build_object('id', 'd2', 'text', 'Design documentation'),
          jsonb_build_object('id', 'd3', 'text', 'Selection schedules')))),
      jsonb_build_object('kind', 'schedule', 'variant', 'rate_card',
        'partKey', 'patina.role_rates', 'title', 'Role rates',
        'payload', jsonb_build_object('roles', jsonb_build_array(
          jsonb_build_object('roleName', 'Principal', 'hourlyRateCents', 22500, 'sortOrder', 0),
          jsonb_build_object('roleName', 'Senior Designer', 'hourlyRateCents', 15000, 'sortOrder', 1),
          jsonb_build_object('roleName', 'Junior Designer', 'hourlyRateCents', 9500, 'sortOrder', 2)))),
      jsonb_build_object('kind', 'schedule', 'variant', 'ceiling',
        'partKey', 'patina.ceiling', 'title', 'Ceiling',
        'payload', jsonb_build_object('cents', 2400000)),
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.terms',
        'title', 'Terms', 'required', true,
        'payload', jsonb_build_object(
          'body', 'Billed at actual hours against the signed ceiling.'))
    )
  );

  ASSERT (SELECT t.exclusions FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a6300000-0000-4000-8000-00000000000b') = '[]'::jsonb,
    'a removed Exclusions part must empty the column, not leave the old value standing';
  ASSERT (SELECT t.retainer_amount_cents FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a6300000-0000-4000-8000-00000000000b') = 0,
    'a removed Retainer part must fall back to the projection default, not stick at 500000';
  ASSERT (SELECT t.billing_cadence FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a6300000-0000-4000-8000-00000000000b') = 'monthly',
    'a removed cadence part must fall back to monthly, not stick at biweekly';
  ASSERT (SELECT t.furnishings_deposit_percent FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a6300000-0000-4000-8000-00000000000b') IS NULL,
    'a removed deposit part must clear the column';
  ASSERT (SELECT t.billing_ceiling_cents FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a6300000-0000-4000-8000-00000000000b') = 2400000,
    'the parts that remain still project';

  RAISE NOTICE 'PASS 5: a part the studio removed is absent from the money row, not sticky';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (6)-(7) R5 — ONLY THE NINE PATINA KEYS PROJECT.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE v_before jsonb; v_after jsonb; v_custom uuid := extensions.gen_random_uuid();
BEGIN
  v_before := pg_temp.terms_shape('a6300000-0000-4000-8000-00000000000b');

  -- (6) a custom part carrying cents
  PERFORM public.upsert_agreement_parts(
    'a6300000-0000-4000-8000-00000000000b',
    jsonb_build_array(
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.services',
        'title', 'Services', 'required', true,
        'payload', jsonb_build_object(
          'body', 'Full-service interior design for the whole house.')),
      jsonb_build_object('kind', 'list', 'partKey', 'patina.deliverables',
        'title', 'Deliverables',
        'payload', jsonb_build_object('items', jsonb_build_array(
          jsonb_build_object('id', 'd1', 'text', 'Concept presentation'),
          jsonb_build_object('id', 'd2', 'text', 'Design documentation'),
          jsonb_build_object('id', 'd3', 'text', 'Selection schedules')))),
      jsonb_build_object('kind', 'schedule', 'variant', 'rate_card',
        'partKey', 'patina.role_rates', 'title', 'Role rates',
        'payload', jsonb_build_object('roles', jsonb_build_array(
          jsonb_build_object('roleName', 'Principal', 'hourlyRateCents', 22500, 'sortOrder', 0),
          jsonb_build_object('roleName', 'Senior Designer', 'hourlyRateCents', 15000, 'sortOrder', 1),
          jsonb_build_object('roleName', 'Junior Designer', 'hourlyRateCents', 9500, 'sortOrder', 2)))),
      jsonb_build_object('kind', 'schedule', 'variant', 'ceiling',
        'partKey', 'patina.ceiling', 'title', 'Ceiling',
        'payload', jsonb_build_object('cents', 2400000)),
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.terms',
        'title', 'Terms', 'required', true,
        'payload', jsonb_build_object(
          'body', 'Billed at actual hours against the signed ceiling.')),
      -- A one-off money-shaped part. Recorded, hashed, projecting nothing.
      jsonb_build_object('kind', 'schedule', 'variant', 'retainer',
        'partKey', 'custom.' || v_custom::text, 'title', 'A side retainer',
        'payload', jsonb_build_object(
          'cents', 9900000, 'activationPolicy', 'immediate')),
      -- (7) and a SECOND ceiling under a studio key
      jsonb_build_object('kind', 'schedule', 'variant', 'ceiling',
        'partKey', 'studio.second_ceiling', 'title', 'An internal cap',
        'payload', jsonb_build_object('cents', 111))
    )
  );

  v_after := pg_temp.terms_shape('a6300000-0000-4000-8000-00000000000b');
  ASSERT v_after = v_before, format(
    'R5: a custom schedule part must write NOTHING to the money row. before: %s ||| after: %s',
    v_before, v_after);
  ASSERT (SELECT t.retainer_amount_cents FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a6300000-0000-4000-8000-00000000000b') = 0,
    'a custom retainer part must not become the engagement''s retainer';
  ASSERT (SELECT t.billing_ceiling_cents FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a6300000-0000-4000-8000-00000000000b') = 2400000,
    'the patina.ceiling value stands against a second ceiling under another key';

  -- They ARE recorded, and they ARE hashed — recorded is not the same as ignored.
  ASSERT (SELECT count(*) FROM public.proposal_agreement_parts
          WHERE proposal_id = 'a6300000-0000-4000-8000-00000000000b') = 7,
    'the custom parts are stored on the document';

  RAISE NOTICE 'PASS 6-7: only the nine patina keys reach the money row (R5)';
END $$;

ROLLBACK;
