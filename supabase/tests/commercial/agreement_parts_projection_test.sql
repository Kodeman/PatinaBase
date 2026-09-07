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
-- Then R5: a removed part is ABSENT rather than sticky; the money row is read
-- by SHAPE (kind + variant) under whatever key the composition gave the part,
-- because the composer mints `custom.<uuid>` for everything a designer adds
-- (N1) — with exactly one part of each money shape allowed, so nothing is
-- ever ranked; a variant with no Wave-1 column (flat, per_phase, …) is
-- recorded and hashed and projects nothing; and the shape is REQUIRED, so a
-- clause keyed patina.ceiling stays prose however many cents it names.
--
-- Last, the flag-off door: upsert_design_services_draft still turns an omitted
-- or JSON-null ceiling into 0, exactly as 00422 did.
--
-- RULING R20 (rulings-2026-09-06.md, "Wave 1 integration rulings"). Cases 6
-- and 7 pin MONEY PROJECTED BY KIND + VARIANT, not by part_key. The build
-- sheet's §3.7 step 6 and its §6.2 originally specified the opposite — "derive
-- the projection by part_key" — and the deviation is accepted and recorded as
-- R20 rather than left silent: the composer mints `custom.<uuid>` for every
-- part added from the rail, so a key-derived projection would render a rate
-- card, a ceiling, a retainer, a cadence or a deposit on the page the client
-- signs and write none of it to the money row the authority snapshots. The
-- single-instance refusal ("an agreement carries only one %") is what makes
-- shape-derived projection unambiguous, and it is pinned here too. The build
-- sheet's §3.7 and §6.2 are amended to match.
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

-- effective_at IS compared (B-9): both doors now carry the date a rate took
-- effect, so a back-dated rate that projects to now() through one door and to
-- its own date through the other is exactly the fork this file exists to
-- catch.
CREATE OR REPLACE FUNCTION pg_temp.rates_shape(p_id uuid) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT COALESCE(jsonb_agg(
    to_jsonb(r) - 'id' - 'proposal_id' - 'created_at'
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
          jsonb_build_object('roleName', 'Principal', 'hourlyRateCents', 22500,
            'sortOrder', 0, 'effectiveAt', DATE '2026-01-01'),
          jsonb_build_object('roleName', 'Senior Designer', 'hourlyRateCents', 15000,
            'sortOrder', 1, 'effectiveAt', DATE '2026-01-01'),
          jsonb_build_object('roleName', 'Junior Designer', 'hourlyRateCents', 9500,
            'sortOrder', 2, 'effectiveAt', DATE '2026-01-01')))),
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
-- (6)-(7) R5 — WHAT PROJECTS IS A SHAPE, AND THERE IS ONE OF EACH.
--
-- (6) A money part under the composer's own `custom.<uuid>` key projects: the
--     rail mints a fresh key for everything a designer adds, so a projection
--     keyed on the patina.* names would print the figure on the client's page
--     and write nothing to the money row (N1).
-- (7) A SECOND part of the same money shape is refused instead — the money
--     row is never left picking between two ceilings.
-- Variants outside the five that project — flat, per_phase, percent_of_cost —
-- are recorded and hashed and reach the money row not at all.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE v_before jsonb; v_after jsonb; v_err text; v_custom uuid := extensions.gen_random_uuid();
BEGIN
  v_before := pg_temp.terms_shape('a6300000-0000-4000-8000-00000000000b');

  -- (7) two ceilings — the seeded one and a studio-keyed second — is refused,
  -- and nothing is written.
  BEGIN
    PERFORM public.upsert_agreement_parts(
      'a6300000-0000-4000-8000-00000000000b',
      jsonb_build_array(
        jsonb_build_object('kind', 'clause', 'partKey', 'patina.services',
          'title', 'Services', 'required', true,
          'payload', jsonb_build_object('body', 'Full-service interior design.')),
        jsonb_build_object('kind', 'schedule', 'variant', 'ceiling',
          'partKey', 'patina.ceiling', 'title', 'Ceiling',
          'payload', jsonb_build_object('cents', 2400000)),
        jsonb_build_object('kind', 'schedule', 'variant', 'ceiling',
          'partKey', 'studio.second_ceiling', 'title', 'An internal cap',
          'payload', jsonb_build_object('cents', 111))
      )
    );
    ASSERT false, 'a second ceiling must be refused, not silently ranked';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'an agreement carries only one ceiling',
    format('duplicate refusal: %L', v_err);
  ASSERT pg_temp.terms_shape('a6300000-0000-4000-8000-00000000000b') = v_before,
    'a refused upsert writes nothing to the money row';

  -- (6) the money parts, under the composer's keys
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
      -- The retainer the designer added from the rail, under the key the rail
      -- minted. It IS the engagement's retainer.
      jsonb_build_object('kind', 'schedule', 'variant', 'retainer',
        'partKey', 'custom.' || v_custom::text, 'title', 'Retainer',
        'payload', jsonb_build_object(
          'cents', 9900000, 'activationPolicy', 'retainer_paid')),
      -- A flat fee: a real schedule variant with nowhere on the money row to
      -- land until R9's Wave-2 columns exist. Recorded, hashed, projecting
      -- nothing.
      jsonb_build_object('kind', 'schedule', 'variant', 'flat',
        'partKey', 'studio.flat_uplift', 'title', 'Concept fee',
        'payload', jsonb_build_object('cents', 350000))
    )
  );

  ASSERT (SELECT t.retainer_amount_cents FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a6300000-0000-4000-8000-00000000000b') = 9900000,
    'N1: a retainer under the composer''s key IS the engagement''s retainer';
  ASSERT (SELECT t.retainer_activation_policy FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a6300000-0000-4000-8000-00000000000b') = 'retainer_paid',
    'N1: and the policy stated beside it travels with it';
  ASSERT (SELECT t.billing_ceiling_cents FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a6300000-0000-4000-8000-00000000000b') = 2400000,
    'the one ceiling is the ceiling';
  ASSERT (SELECT count(*) FROM public.proposal_service_rates
          WHERE proposal_id = 'a6300000-0000-4000-8000-00000000000b') = 3,
    'the rate card projects its three roles';

  -- The flat fee reaches no column, because Wave 1 has none for it.
  v_after := pg_temp.terms_shape('a6300000-0000-4000-8000-00000000000b');
  ASSERT NOT (v_after::text LIKE '%350000%'),
    format('R9: a flat variant has no Wave-1 column to land in: %s', v_after);

  -- Every part IS recorded, and IS hashed — recorded is not the same as read.
  ASSERT (SELECT count(*) FROM public.proposal_agreement_parts
          WHERE proposal_id = 'a6300000-0000-4000-8000-00000000000b') = 7,
    'the composed parts are stored on the document';

  RAISE NOTICE 'PASS 6-7: money reads by shape under any key, one of each, and only the five that have a column (R5/R9)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (8) R5 — A STANDARD KEY IS NOT ENOUGH. A part must also have the shape its
--     key promises. A clause keyed patina.ceiling is prose, and prose never
--     carries money, however many cents someone puts in its payload.
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
      -- Prose about the cap, keyed as the cap, carrying a number.
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.ceiling',
        'title', 'On our fee cap',
        'payload', jsonb_build_object(
          'body', 'We will talk before we approach the cap.', 'cents', 7777777)),
      -- Prose about billing, keyed as the cadence, naming a cadence.
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.cadence',
        'title', 'On billing',
        'payload', jsonb_build_object(
          'body', 'We invoice as the work reaches its marks.', 'cadence', 'milestone')),
      -- A list keyed as the retainer, carrying retainer money.
      jsonb_build_object('kind', 'list', 'partKey', 'patina.retainer',
        'title', 'What the retainer covers',
        'payload', jsonb_build_object(
          'items', jsonb_build_array(jsonb_build_object('id', 'r1', 'text', 'Kickoff')),
          'cents', 4200000, 'activationPolicy', 'retainer_paid')),
      -- A list keyed as the rate card, carrying roles.
      jsonb_build_object('kind', 'list', 'partKey', 'patina.role_rates',
        'title', 'Who works on this',
        'payload', jsonb_build_object(
          'items', jsonb_build_array(jsonb_build_object('id', 'w1', 'text', 'The principal')),
          'roles', jsonb_build_array(jsonb_build_object(
            'roleName', 'Principal', 'hourlyRateCents', 22500, 'sortOrder', 0)))),
      -- A clause keyed as the furnishings deposit, quoting a percent.
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.deposit',
        'title', 'On deposits',
        'payload', jsonb_build_object(
          'body', 'Furnishings are ordered on deposit.', 'depositPercent', 99)),
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.terms',
        'title', 'Terms', 'required', true,
        'payload', jsonb_build_object(
          'body', 'Billed at actual hours against the signed ceiling.'))
    )
  );

  ASSERT (SELECT t.billing_ceiling_cents FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a6300000-0000-4000-8000-00000000000b') IS NULL,
    'a clause keyed patina.ceiling must not become the ceiling (R5)';
  ASSERT (SELECT t.billing_cadence FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a6300000-0000-4000-8000-00000000000b') = 'monthly',
    'a clause keyed patina.cadence must not set the cadence (R5)';
  ASSERT (SELECT t.retainer_amount_cents FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a6300000-0000-4000-8000-00000000000b') = 0,
    'a list keyed patina.retainer must not become the retainer (R5)';
  ASSERT (SELECT t.retainer_activation_policy FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a6300000-0000-4000-8000-00000000000b') = 'immediate',
    'a list keyed patina.retainer must not set the activation policy (R5)';
  ASSERT (SELECT t.furnishings_deposit_percent FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a6300000-0000-4000-8000-00000000000b') IS NULL,
    'a clause keyed patina.deposit must not set the deposit percent (R5)';
  ASSERT (SELECT count(*) FROM public.proposal_service_rates
          WHERE proposal_id = 'a6300000-0000-4000-8000-00000000000b') = 0,
    'a list keyed patina.role_rates must not become the rate card (R5)';
  -- The prose parts ARE recorded; refusing to read them as money is not
  -- refusing to keep them.
  ASSERT (SELECT count(*) FROM public.proposal_agreement_parts
          WHERE proposal_id = 'a6300000-0000-4000-8000-00000000000b') = 7,
    'every part is still stored on the document';
  -- The one part that DID keep its shape still projects.
  ASSERT (SELECT t.scope FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a6300000-0000-4000-8000-00000000000b')
         = 'Full-service interior design for the whole house.',
    'a part with the shape its key promises still projects';

  RAISE NOTICE 'PASS 8: a standard key only projects when the part has its shape (R5)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (9) THE FLAG-OFF DOOR IS UNMOVED. 00422 wrote COALESCE(ceiling, 0), and
--     upsert_design_services_draft still does — an omitted key and an explicit
--     JSON null both land 0, exactly as they did before 00575. Only the parts
--     door may write NULL, and it asks for that in the call.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_rates jsonb := jsonb_build_array(jsonb_build_object(
    'version', 1, 'roleName', 'Principal', 'hourlyRateCents', 22500,
    'sortOrder', 0, 'effectiveAt', DATE '2026-01-01'));
BEGIN
  -- The key is absent altogether.
  PERFORM public.upsert_design_services_draft(
    'a6300000-0000-4000-8000-00000000000a',
    jsonb_build_object(
      'scope', 'Full-service interior design for the whole house.',
      'retainerAmountCents', 500000, 'currency', 'USD', 'currentRateVersion', 1),
    v_rates
  );
  ASSERT (SELECT t.billing_ceiling_cents FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a6300000-0000-4000-8000-00000000000a') = 0,
    'flag-off: an omitted ceiling still lands 0, as it did under 00422';

  -- The key is present and JSON null — what Math.round(undefined) serializes to.
  PERFORM public.upsert_design_services_draft(
    'a6300000-0000-4000-8000-00000000000a',
    jsonb_build_object(
      'scope', 'Full-service interior design for the whole house.',
      'billingCeilingCents', NULL,
      'retainerAmountCents', 500000, 'currency', 'USD', 'currentRateVersion', 1),
    v_rates
  );
  ASSERT (SELECT t.billing_ceiling_cents FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a6300000-0000-4000-8000-00000000000a') = 0,
    'flag-off: an explicit JSON null still lands 0, as it did under 00422';

  -- And a real number still lands whole.
  PERFORM public.upsert_design_services_draft(
    'a6300000-0000-4000-8000-00000000000a',
    jsonb_build_object(
      'scope', 'Full-service interior design for the whole house.',
      'billingCeilingCents', 2400000,
      'retainerAmountCents', 500000, 'currency', 'USD', 'currentRateVersion', 1),
    v_rates
  );
  ASSERT (SELECT t.billing_ceiling_cents FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a6300000-0000-4000-8000-00000000000a') = 2400000,
    'flag-off: a stated ceiling still lands whole';

  RAISE NOTICE 'PASS 9: the flag-off write path is byte-for-byte 00422';
END $$;

ROLLBACK;
