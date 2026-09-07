-- ═══════════════════════════════════════════════════════════════════════════
-- 00577 — Fee schedules, the consent sentence, the change history, and the
--         copy she keeps.
-- Runner: plain psql, ON_ERROR_STOP=1. Single transaction, ROLLBACK at the end.
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/commercial/agreement_fee_schedules_test.sql
--
-- What this file exists to prove:
--   (1)  THE CONSENT SENTENCE, byte for byte, for four part sets. The
--        literals below are reproduced verbatim from build-sheet §5.1 and are
--        the SAME STRINGS the client portal's consent-copy.test.ts pins
--        against composeConsentLine. Two implementations, one sentence: if
--        either moves, one of these two suites goes red. That is the whole
--        job of this case.
--   (2)  Zero money parts returns the legacy literal, character for
--        character — note it has no comma before "and understand", and the
--        composed form does.
--   (3)  R9. A record-only variant PROJECTS NOTHING. Written straight through
--        the RPC, not through a chip in the room.
--   (4)  One fee basis. flat beside per_phase is refused in the designer's
--        words.
--   (5)  The projection: flat, per_phase (amount AND schedule), and the
--        retainer's credit rule.
--   (6)  Countersign snapshots all four onto the billing authority.
--   (7)  R12. The execution snapshot's hash IS the fingerprint both parties
--        signed against; the HTML carries every client-visible part's title
--        and none of a hidden one's.
--   (8)  The snapshot is immutable and one per agreement; a countersign retry
--        does not mint a second.
--   (9)  P8. The change history records added/edited with the designer's why
--        and their given name, writes nothing for a no-op save, and cannot be
--        edited afterwards.
--   (10) The history is studio-only: the client reads none of it, and no key
--        of the bundle mentions it.
--   (11) The bundle carries the consent sentence always and the snapshot only
--        after execution.
--   (12) What she ticked is frozen with the act: the consent sentence and the
--        acknowledged attachments land in the signature row's metadata.
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

CREATE OR REPLACE FUNCTION pg_temp.assume_role(p_user_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.assume_user(p_user_id);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.assume_role(uuid) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.send_agreement(p_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_snapshot jsonb;
BEGIN
  v_snapshot := public.get_commercial_document_send_snapshot(p_id);
  PERFORM public.send_commercial_document(
    p_id, v_snapshot->>'documentFingerprint', NULL, TIMESTAMPTZ '2027-06-01 00:00:00+00'
  );
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.send_agreement(uuid) TO PUBLIC;

-- The four sentences the build sheet pins, reproduced VERBATIM. The TypeScript
-- suite pins the same four; diff them by eye at review.
CREATE TEMP TABLE _fs_consent (label text PRIMARY KEY, sentence text NOT NULL)
  ON COMMIT DROP;
INSERT INTO _fs_consent VALUES
  ('legacy',
   'I agree to these design-services terms and understand my signature alone does not authorize work until the studio countersigns.'),
  ('nine',
   'I agree to these design-services terms, the signed role rates, the design authorization ceiling, the retainer credited against fees, and the furnishings deposit, and understand my signature alone does not authorize work until the studio countersigns.'),
  ('consultation',
   'I agree to these design-services terms, the signed role rates, and the design authorization ceiling, and understand my signature alone does not authorize work until the studio countersigns.'),
  ('flat',
   'I agree to these design-services terms and the flat design fee, and understand my signature alone does not authorize work until the studio countersigns.'),
  ('per_phase',
   'I agree to these design-services terms, the per-phase fee schedule, and the retainer, which is not refundable, and understand my signature alone does not authorize work until the studio countersigns.'),
  ('furnishings',
   'I agree to these design-services terms and the furnishings deposit, and understand my signature alone does not authorize work until the studio countersigns.');

-- ═══════════════════════════════════════════════════════════════════════════
-- (0) FIXTURE — one studio, its owner (the lead), one co-member, one client.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('a7000000-0000-4000-8000-000000000001', 'fs-lead@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a7000000-0000-4000-8000-000000000002', 'fs-comember@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a7000000-0000-4000-8000-000000000004', 'fs-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

SET LOCAL session_replication_role = replica;
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('a7000000-0000-4000-8000-000000000001', 'fs-lead@test.invalid', 'Marguerite  Vaudrey', true, now(), now()),
  ('a7000000-0000-4000-8000-000000000002', 'fs-comember@test.invalid', 'Fee Co-member', true, now(), now()),
  ('a7000000-0000-4000-8000-000000000004', 'fs-client@test.invalid', 'Fee Client', false, now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;
SET LOCAL session_replication_role = origin;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('a7100000-0000-4000-8000-000000000001', 'design_studio', 'Fee Studio', 'agreement-fees-test', 'active');

SELECT pg_temp.assume_user('a7000000-0000-4000-8000-000000000001', 'service_role');
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('a7110000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001',
   'a7100000-0000-4000-8000-000000000001', 'owner', 'active', now() - interval '2 days'),
  ('a7110000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000002',
   'a7100000-0000-4000-8000-000000000001', 'member', 'active', now() - interval '1 day');

INSERT INTO public.user_roles (user_id, role_id, granted_by)
SELECT 'a7000000-0000-4000-8000-000000000001'::uuid, role.id,
       'a7000000-0000-4000-8000-000000000001'::uuid
FROM public.roles AS role WHERE role.name = 'studio_owner';

INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, status, source)
VALUES ('a7200000-0000-4000-8000-000000000001',
        'a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000004',
        'Fee Client', 'proposal', 'direct');

CREATE OR REPLACE FUNCTION pg_temp.mint_agreement(p_id uuid, p_title text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.proposals (
    id, designer_id, designer_client_id, client_id, title, description,
    total_amount, status, valid_until
  ) VALUES (
    p_id, 'a7000000-0000-4000-8000-000000000001',
    'a7200000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000004',
    p_title, 'A composed agreement.', 0, 'draft', DATE '2027-06-01'
  );
  INSERT INTO public.proposal_phases (
    proposal_id, name, phase_key, duration_days, lane, fee_cents, sort_order
  ) VALUES (p_id, 'Design development', 'design-development', 30, 'main', 0, 0);
  PERFORM public.upsert_design_services_draft(
    p_id,
    jsonb_build_object(
      'scope', 'Whole-home interior design services.',
      'deliverables', jsonb_build_array('Concept', 'Selections'),
      'exclusions', jsonb_build_array('Structural engineering'),
      'billingCeilingCents', 2400000,
      'retainerAmountCents', 500000,
      'retainerActivationPolicy', 'immediate',
      'billingCadence', 'monthly', 'currency', 'USD',
      'terms', 'Actual hours to the signed ceiling.',
      'currentRateVersion', 1,
      'furnishingsDepositPercent', 50
    ),
    jsonb_build_array(jsonb_build_object(
      'version', 1, 'roleName', 'Lead Designer',
      'hourlyRateCents', 15000, 'sortOrder', 0, 'effectiveAt', DATE '2026-01-01'
    ))
  );
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.mint_agreement(uuid, text) TO PUBLIC;

SELECT pg_temp.assume_user('a7000000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_agreement('a7300000-0000-4000-8000-000000000001', 'The nine standard parts');
SELECT pg_temp.mint_agreement('a7300000-0000-4000-8000-000000000002', 'The per-phase agreement');
SELECT pg_temp.mint_agreement('a7300000-0000-4000-8000-000000000003', 'The variant bench');
SELECT pg_temp.mint_agreement('a7300000-0000-4000-8000-00000000000a', 'The hidden fee');
SELECT pg_temp.mint_agreement('a7300000-0000-4000-8000-00000000000b', 'The hidden fee, alone');
SELECT pg_temp.mint_agreement('a7300000-0000-4000-8000-00000000000c', 'The duplicate variant');

-- ═══════════════════════════════════════════════════════════════════════════
-- (1) (2) THE CONSENT SENTENCE — four part sets, byte for byte, plus the
--         legacy literal on zero money parts.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_got text;
BEGIN
  -- (a) the nine standard parts
  PERFORM public.materialize_standard_parts('a7300000-0000-4000-8000-000000000001');
  v_got := public.compose_agreement_consent('a7300000-0000-4000-8000-000000000001');
  ASSERT v_got = (SELECT sentence FROM _fs_consent WHERE label = 'nine'),
    format('the nine standard parts compose the wrong sentence:%s  got: %L%s  want: %L',
           E'\n', v_got, E'\n', (SELECT sentence FROM _fs_consent WHERE label = 'nine'));

  -- (b) consultation: a rate card and a ceiling
  PERFORM public.upsert_agreement_parts(
    'a7300000-0000-4000-8000-000000000003',
    jsonb_build_array(
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.services', 'title', 'Services',
                         'payload', jsonb_build_object('body', 'Consultation.')),
      jsonb_build_object('kind', 'schedule', 'variant', 'rate_card',
                         'partKey', 'patina.role_rates', 'title', 'Role rates',
                         'payload', jsonb_build_object('roles', jsonb_build_array(
                           jsonb_build_object('roleName', 'Principal',
                                              'hourlyRateCents', 22500, 'sortOrder', 0)))),
      jsonb_build_object('kind', 'schedule', 'variant', 'ceiling',
                         'partKey', 'patina.ceiling', 'title', 'Ceiling',
                         'payload', jsonb_build_object('cents', 1200000))));
  v_got := public.compose_agreement_consent('a7300000-0000-4000-8000-000000000003');
  ASSERT v_got = (SELECT sentence FROM _fs_consent WHERE label = 'consultation'),
    format('the consultation set composes the wrong sentence: %L', v_got);

  -- (c) a flat fee alone, with seven record-only variants beside it (case 8
  --     of the drift suite: record-only contributes nothing)
  PERFORM public.upsert_agreement_parts(
    'a7300000-0000-4000-8000-000000000003',
    jsonb_build_array(
      jsonb_build_object('kind', 'schedule', 'variant', 'flat',
                         'partKey', 'custom.flat', 'title', 'Flat design fee',
                         'payload', jsonb_build_object('cents', 800000)),
      jsonb_build_object('kind', 'schedule', 'variant', 'percent_of_cost',
                         'partKey', 'custom.poc', 'title', 'Percent of cost',
                         'payload', jsonb_build_object('basis', 'cost', 'percent', 12)),
      jsonb_build_object('kind', 'schedule', 'variant', 'percent_of_spend',
                         'partKey', 'custom.pos', 'title', 'Percent of spend',
                         'payload', jsonb_build_object('basis', 'spend', 'percent', 10)),
      jsonb_build_object('kind', 'schedule', 'variant', 'cost_plus',
                         'partKey', 'custom.cp', 'title', 'Cost plus',
                         'payload', jsonb_build_object('markupPercent', 18)),
      jsonb_build_object('kind', 'schedule', 'variant', 'day_rate',
                         'partKey', 'custom.dr', 'title', 'Day rate',
                         'payload', jsonb_build_object('dayRateCents', 250000, 'minimumDays', 2)),
      jsonb_build_object('kind', 'schedule', 'variant', 'package',
                         'partKey', 'custom.pk', 'title', 'Package',
                         'payload', jsonb_build_object('name', 'Refresh', 'priceCents', 400000)),
      jsonb_build_object('kind', 'schedule', 'variant', 'pricing_basis',
                         'partKey', 'custom.pb', 'title', 'Pricing basis',
                         'payload', jsonb_build_object('basis', 'stipulated sum')),
      jsonb_build_object('kind', 'schedule', 'variant', 'draws',
                         'partKey', 'custom.dw', 'title', 'Draws',
                         'payload', jsonb_build_object('draws', jsonb_build_array())),
      jsonb_build_object('kind', 'schedule', 'variant', 'allowances',
                         'partKey', 'custom.al', 'title', 'Allowances',
                         'payload', jsonb_build_object('allowances', jsonb_build_array()))));
  v_got := public.compose_agreement_consent('a7300000-0000-4000-8000-000000000003');
  ASSERT v_got = (SELECT sentence FROM _fs_consent WHERE label = 'flat'),
    format('a flat fee beside seven record-only variants composes the wrong sentence: %L', v_got);

  -- (3) and NOTHING of those seven reached the money row.
  ASSERT (SELECT fee_basis FROM public.proposal_service_terms
          WHERE proposal_id = 'a7300000-0000-4000-8000-000000000003') = 'flat',
    'R9: the flat part names the basis';
  ASSERT (SELECT fee_amount_cents FROM public.proposal_service_terms
          WHERE proposal_id = 'a7300000-0000-4000-8000-000000000003') = 800000,
    'R9: the flat part names the amount';
  ASSERT (SELECT fee_schedule FROM public.proposal_service_terms
          WHERE proposal_id = 'a7300000-0000-4000-8000-000000000003') IS NULL,
    'R9: a flat fee has no schedule';

  -- (d) per-phase beside a non-refundable retainer
  PERFORM public.upsert_agreement_parts(
    'a7300000-0000-4000-8000-000000000003',
    jsonb_build_array(
      jsonb_build_object('kind', 'schedule', 'variant', 'per_phase',
                         'partKey', 'custom.perphase', 'title', 'Per-phase fee',
                         'payload', jsonb_build_object('phases', jsonb_build_array(
                           jsonb_build_object('key', 'a', 'label', 'Concept', 'cents', 350000),
                           jsonb_build_object('key', 'b', 'label', 'Documentation', 'cents', 450000),
                           jsonb_build_object('key', 'c', 'label', 'Selections', 'cents', 300000)))),
      jsonb_build_object('kind', 'schedule', 'variant', 'retainer',
                         'partKey', 'patina.retainer', 'title', 'Retainer',
                         'payload', jsonb_build_object(
                           'cents', 500000, 'creditRule', 'non_refundable',
                           'activationPolicy', 'immediate'))));
  v_got := public.compose_agreement_consent('a7300000-0000-4000-8000-000000000003');
  ASSERT v_got = (SELECT sentence FROM _fs_consent WHERE label = 'per_phase'),
    format('per-phase beside a non-refundable retainer composes the wrong sentence: %L', v_got);

  -- (5) the per-phase projection
  ASSERT (SELECT fee_basis FROM public.proposal_service_terms
          WHERE proposal_id = 'a7300000-0000-4000-8000-000000000003') = 'per_phase',
    'a per-phase agreement names its basis';
  ASSERT (SELECT fee_amount_cents FROM public.proposal_service_terms
          WHERE proposal_id = 'a7300000-0000-4000-8000-000000000003') = 1100000,
    'the per-phase amount is the sum of the phases';
  ASSERT (SELECT jsonb_array_length(fee_schedule) FROM public.proposal_service_terms
          WHERE proposal_id = 'a7300000-0000-4000-8000-000000000003') = 3,
    'the per-phase schedule rides across whole';
  ASSERT (SELECT retainer_credit_rule FROM public.proposal_service_terms
          WHERE proposal_id = 'a7300000-0000-4000-8000-000000000003') = 'non_refundable',
    'the retainer''s credit rule reaches the money row';

  -- (e) furnishings: a procurement deposit alone
  PERFORM public.upsert_agreement_parts(
    'a7300000-0000-4000-8000-000000000003',
    jsonb_build_array(
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.services', 'title', 'Services',
                         'payload', jsonb_build_object('body', 'Furnishings only.')),
      jsonb_build_object('kind', 'schedule', 'variant', 'procurement',
                         'partKey', 'patina.deposit', 'title', 'Furnishings deposit',
                         'payload', jsonb_build_object('depositPercent', 50))));
  v_got := public.compose_agreement_consent('a7300000-0000-4000-8000-000000000003');
  ASSERT v_got = (SELECT sentence FROM _fs_consent WHERE label = 'furnishings'),
    format('a furnishings deposit alone composes the wrong sentence: %L', v_got);

  -- and with the deposit gone, and no other money part, the legacy literal.
  PERFORM public.upsert_agreement_parts(
    'a7300000-0000-4000-8000-000000000003',
    jsonb_build_array(
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.services', 'title', 'Services',
                         'payload', jsonb_build_object('body', 'Prose only.')),
      jsonb_build_object('kind', 'schedule', 'variant', 'cadence',
                         'partKey', 'patina.cadence', 'title', 'Billing cadence',
                         'payload', jsonb_build_object('cadence', 'monthly'))));
  v_got := public.compose_agreement_consent('a7300000-0000-4000-8000-000000000003');
  ASSERT v_got = (SELECT sentence FROM _fs_consent WHERE label = 'legacy'),
    format('a cadence is not an authorization — expected the legacy literal, got %L', v_got);

  -- (3, continued) and after all of that the money row says nothing at all.
  ASSERT (SELECT fee_basis FROM public.proposal_service_terms
          WHERE proposal_id = 'a7300000-0000-4000-8000-000000000003') IS NULL,
    'no fee part means no fee basis';
  ASSERT (SELECT fee_amount_cents FROM public.proposal_service_terms
          WHERE proposal_id = 'a7300000-0000-4000-8000-000000000003') IS NULL,
    'no fee part means no fee amount';
  ASSERT (SELECT retainer_credit_rule FROM public.proposal_service_terms
          WHERE proposal_id = 'a7300000-0000-4000-8000-000000000003') = 'credited',
    'no retainer part falls back to credited';

  -- money parts the studio kept to itself contribute nothing (R8)
  PERFORM public.upsert_agreement_parts(
    'a7300000-0000-4000-8000-000000000003',
    jsonb_build_array(
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.terms', 'title', 'Terms',
                         'payload', jsonb_build_object('body', 'Terms.')),
      jsonb_build_object('kind', 'schedule', 'variant', 'flat', 'clientVisible', false,
                         'partKey', 'custom.hidden_flat', 'title', 'Flat design fee',
                         'payload', jsonb_build_object('cents', 800000))));
  v_got := public.compose_agreement_consent('a7300000-0000-4000-8000-000000000003');
  ASSERT v_got = (SELECT sentence FROM _fs_consent WHERE label = 'legacy'),
    format('a hidden money part is not consented to — expected the legacy literal, got %L', v_got);
  -- R33 — and it reaches the money row not at all. A fee she never read is
  -- not a fee she agreed to, and the row this projects into is the row that
  -- bills her. Case (16) walks the whole rail on it.
  ASSERT (SELECT fee_basis FROM public.proposal_service_terms
          WHERE proposal_id = 'a7300000-0000-4000-8000-000000000003') IS NULL,
    'a studio-only fee projects nothing — the authority cannot charge what she never saw';

  RAISE NOTICE 'PASS 1-3,5: the consent sentence is byte-exact for six part sets, and R9 projects nothing it should not';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (4) One fee basis.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE v_message text;
BEGIN
  PERFORM pg_temp.assume_user('a7000000-0000-4000-8000-000000000001');
  BEGIN
    PERFORM public.upsert_agreement_parts(
      'a7300000-0000-4000-8000-000000000003',
      jsonb_build_array(
        jsonb_build_object('kind', 'schedule', 'variant', 'flat',
                           'partKey', 'custom.flat', 'title', 'Flat design fee',
                           'payload', jsonb_build_object('cents', 800000)),
        jsonb_build_object('kind', 'schedule', 'variant', 'per_phase',
                           'partKey', 'custom.perphase', 'title', 'Per-phase fee',
                           'payload', jsonb_build_object('phases', jsonb_build_array(
                             jsonb_build_object('key', 'a', 'label', 'Concept', 'cents', 350000))))));
    RAISE EXCEPTION 'an agreement carrying two fee bases must be refused';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    ASSERT v_message = 'an agreement carries one fee basis',
      format('the refusal must be worded for the designer, got %L', v_message);
  END;

  -- Two flats are the same problem, and earn the same sentence.
  BEGIN
    PERFORM public.upsert_agreement_parts(
      'a7300000-0000-4000-8000-000000000003',
      jsonb_build_array(
        jsonb_build_object('kind', 'schedule', 'variant', 'flat',
                           'partKey', 'custom.flat_a', 'title', 'Flat design fee',
                           'payload', jsonb_build_object('cents', 800000)),
        jsonb_build_object('kind', 'schedule', 'variant', 'flat',
                           'partKey', 'custom.flat_b', 'title', 'Another flat fee',
                           'payload', jsonb_build_object('cents', 900000))));
    RAISE EXCEPTION 'two flat fees must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- A phase fee stated as a string is refused before it reaches the column.
  BEGIN
    PERFORM public.upsert_agreement_parts(
      'a7300000-0000-4000-8000-000000000003',
      jsonb_build_array(jsonb_build_object(
        'kind', 'schedule', 'variant', 'per_phase',
        'partKey', 'custom.perphase', 'title', 'Per-phase fee',
        'payload', jsonb_build_object('phases', jsonb_build_array(
          jsonb_build_object('key', 'a', 'label', 'Concept', 'cents', '350000'))))));
    RAISE EXCEPTION 'a phase fee stated as a string must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  RAISE NOTICE 'PASS 4: one fee basis, in the designer''s words, and a malformed phase fee never reaches the column';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (9) P8 — the change history.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_event public.agreement_part_events%ROWTYPE;
  v_before integer;
BEGIN
  PERFORM pg_temp.assume_user('a7000000-0000-4000-8000-000000000001');
  DELETE FROM public.agreement_part_events
  WHERE proposal_id = 'a7300000-0000-4000-8000-000000000002';

  PERFORM public.upsert_agreement_parts(
    'a7300000-0000-4000-8000-000000000002',
    jsonb_build_array(jsonb_build_object(
      'kind', 'clause', 'partKey', 'patina.services', 'title', 'Services',
      'payload', jsonb_build_object('body', 'The study is in scope.'))),
    'Added the study to the scope');

  SELECT * INTO v_event FROM public.agreement_part_events
  WHERE proposal_id = 'a7300000-0000-4000-8000-000000000002'
    AND part_key = 'patina.services';
  ASSERT v_event.action = 'added',
    format('the first save of a part is an addition, got %L', v_event.action);
  ASSERT v_event.why = 'Added the study to the scope', 'the why is kept with the change';
  ASSERT v_event.actor_name = 'Marguerite',
    format('the attribution is the first token of the full name, got %L', v_event.actor_name);
  ASSERT v_event.actor = 'a7000000-0000-4000-8000-000000000001', 'the actor is recorded';
  ASSERT v_event.before IS NULL AND v_event.after IS NOT NULL,
    'an addition has an after and no before';

  -- an edit with no why carries no attribution either
  PERFORM public.upsert_agreement_parts(
    'a7300000-0000-4000-8000-000000000002',
    jsonb_build_array(jsonb_build_object(
      'kind', 'clause', 'partKey', 'patina.services', 'title', 'Services',
      'payload', jsonb_build_object('body', 'The study and the landing.'))));

  SELECT * INTO v_event FROM public.agreement_part_events
  WHERE proposal_id = 'a7300000-0000-4000-8000-000000000002'
    AND action = 'edited';
  ASSERT v_event.id IS NOT NULL, 'a payload change is an edit';
  ASSERT v_event.why IS NULL AND v_event.actor_name IS NULL,
    'no why means no attribution — an attribution with nothing attributed to it is noise';
  ASSERT v_event.before->>'part_key' = 'patina.services'
     AND v_event.after->>'part_key' = 'patina.services',
    'an edit carries both sides';

  -- a no-op save writes nothing at all
  SELECT count(*) INTO v_before FROM public.agreement_part_events
  WHERE proposal_id = 'a7300000-0000-4000-8000-000000000002';
  PERFORM public.upsert_agreement_parts(
    'a7300000-0000-4000-8000-000000000002',
    jsonb_build_array(jsonb_build_object(
      'kind', 'clause', 'partKey', 'patina.services', 'title', 'Services',
      'payload', jsonb_build_object('body', 'The study and the landing.'))));
  ASSERT (SELECT count(*) FROM public.agreement_part_events
          WHERE proposal_id = 'a7300000-0000-4000-8000-000000000002') = v_before,
    'a no-op save writes no history';

  -- removing a part is recorded as a removal
  PERFORM public.upsert_agreement_parts(
    'a7300000-0000-4000-8000-000000000002',
    jsonb_build_array(jsonb_build_object(
      'kind', 'clause', 'partKey', 'patina.terms', 'title', 'Terms',
      'payload', jsonb_build_object('body', 'Terms.'))));
  ASSERT EXISTS (SELECT 1 FROM public.agreement_part_events
                 WHERE proposal_id = 'a7300000-0000-4000-8000-000000000002'
                   AND part_key = 'patina.services' AND action = 'removed'),
    'a removed part is recorded as removed';
  ASSERT (SELECT part_id FROM public.agreement_part_events
          WHERE proposal_id = 'a7300000-0000-4000-8000-000000000002'
            AND part_key = 'patina.services' AND action = 'removed') IS NULL,
    'a removed part''s event points at no row';

  -- the history is append-only
  BEGIN
    UPDATE public.agreement_part_events SET why = 'rewritten'
    WHERE proposal_id = 'a7300000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'the history must refuse UPDATE';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
  END;
  BEGIN
    DELETE FROM public.agreement_part_events
    WHERE proposal_id = 'a7300000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'the history must refuse DELETE';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
  END;

  RAISE NOTICE 'PASS 9: the change history records added/edited/removed with the why and the attribution, and cannot be rewritten';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (10) The history is studio-only.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE v_seen integer;
BEGIN
  PERFORM pg_temp.assume_role('a7000000-0000-4000-8000-000000000004');
  SELECT count(*) INTO v_seen FROM public.agreement_part_events;
  PERFORM pg_temp.reset_role();
  ASSERT v_seen = 0,
    format('R8: the client reads the agreement, not the studio''s revision log — saw %s rows', v_seen);

  PERFORM pg_temp.assume_role('a7000000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_seen FROM public.agreement_part_events
  WHERE proposal_id = 'a7300000-0000-4000-8000-000000000002';
  PERFORM pg_temp.reset_role();
  ASSERT v_seen > 0, 'a studio co-member reads the history';

  RAISE NOTICE 'PASS 10: the change history is studio-only';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (6) (7) (8) (11) (12) THE FULL RAIL on a per-phase agreement:
--         compose → send → sign (with consent) → countersign.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_signed jsonb;
  v_executed jsonb;
  v_authority public.project_billing_authorities%ROWTYPE;
  v_snapshot public.agreement_execution_snapshots%ROWTYPE;
  v_terms public.proposal_service_terms%ROWTYPE;
  v_bundle jsonb;
  v_sentence text;
  v_signature public.commercial_document_signatures%ROWTYPE;
  v_created timestamptz;
BEGIN
  PERFORM pg_temp.assume_user('a7000000-0000-4000-8000-000000000001');
  PERFORM public.upsert_agreement_parts(
    'a7300000-0000-4000-8000-000000000002',
    jsonb_build_array(
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.services', 'title', 'Services',
                         'payload', jsonb_build_object('body', 'Whole-home design.')),
      jsonb_build_object('kind', 'schedule', 'variant', 'per_phase',
                         'partKey', 'custom.perphase', 'title', 'Per-phase fee',
                         'payload', jsonb_build_object('phases', jsonb_build_array(
                           jsonb_build_object('key', 'a', 'label', 'Concept', 'cents', 350000),
                           jsonb_build_object('key', 'b', 'label', 'Documentation', 'cents', 450000),
                           jsonb_build_object('key', 'c', 'label', 'Selections', 'cents', 300000)))),
      jsonb_build_object('kind', 'schedule', 'variant', 'retainer',
                         'partKey', 'patina.retainer', 'title', 'Retainer',
                         'payload', jsonb_build_object(
                           'cents', 500000, 'creditRule', 'non_refundable',
                           'activationPolicy', 'immediate')),
      jsonb_build_object('kind', 'clause', 'partKey', 'custom.private_note',
                         'title', 'Internal note', 'clientVisible', false,
                         'payload', jsonb_build_object('body', 'Studio eyes only.'))),
    'Composed for execution');

  -- (11a) the bundle carries the sentence, and no snapshot yet.
  v_bundle := public.get_client_commercial_document_bundle('a7300000-0000-4000-8000-000000000002');
  v_sentence := v_bundle->>'consentSentence';
  ASSERT v_sentence = (SELECT sentence FROM _fs_consent WHERE label = 'per_phase'),
    format('the bundle must carry the composed sentence, got %L', v_sentence);
  ASSERT jsonb_typeof(v_bundle->'executionSnapshot') = 'null',
    'there is no snapshot before execution';
  ASSERT NOT (v_bundle::text ~* 'agreement_part_events|partEvents|"history"'),
    'no key of the client bundle mentions the studio''s revision log';

  PERFORM pg_temp.send_agreement('a7300000-0000-4000-8000-000000000002');

  -- (12) the client signs, and what she ticked is frozen with the act.
  PERFORM pg_temp.assume_user('a7000000-0000-4000-8000-000000000004', 'service_role');
  EXECUTE 'SET LOCAL ROLE service_role';
  v_signed := public.sign_design_services_agreement_with_trusted_ip(
    'a7300000-0000-4000-8000-000000000002', 'Fee Client',
    'a7000000-0000-4000-8000-000000000004', '203.0.113.7',
    jsonb_build_object(
      'consentSentence', v_sentence,
      'attachmentsAcknowledged', jsonb_build_array('custom.leaf_a', 'custom.leaf_b')));
  PERFORM pg_temp.reset_role();
  ASSERT (v_signed->>'newlyClientSigned')::boolean,
    format('the per-phase agreement must be signable: %s', v_signed);

  SELECT * INTO v_signature FROM public.commercial_document_signatures
  WHERE proposal_id = 'a7300000-0000-4000-8000-000000000002' AND party_role = 'client';
  ASSERT v_signature.metadata->>'consentSentence' = v_sentence,
    format('the sentence she ticked must be frozen with the signature, got %L',
           v_signature.metadata->>'consentSentence');
  ASSERT v_signature.metadata->'attachmentsAcknowledged'
         = jsonb_build_array('custom.leaf_a', 'custom.leaf_b'),
    format('the acknowledged attachments ride with the signature, got %s',
           v_signature.metadata->'attachmentsAcknowledged');
  ASSERT v_signature.metadata->>'via' = 'sign_design_services_agreement',
    'the existing metadata is not displaced by the consent';

  -- (6) countersign snapshots the four fee columns onto the authority.
  PERFORM pg_temp.assume_role('a7000000-0000-4000-8000-000000000001');
  v_executed := public.countersign_design_services_agreement(
    'a7300000-0000-4000-8000-000000000002', 'Marguerite Vaudrey');
  PERFORM pg_temp.reset_role();
  ASSERT (v_executed->>'newlyExecuted')::boolean,
    format('the per-phase agreement must countersign: %s', v_executed);

  SELECT * INTO v_terms FROM public.proposal_service_terms
  WHERE proposal_id = 'a7300000-0000-4000-8000-000000000002';
  SELECT * INTO v_authority FROM public.project_billing_authorities
  WHERE id = (v_executed->>'billingAuthorityId')::uuid;
  ASSERT v_authority.fee_basis = 'per_phase' AND v_authority.fee_basis = v_terms.fee_basis,
    format('the authority snapshots the fee basis, got %L', v_authority.fee_basis);
  ASSERT v_authority.fee_amount_cents = 1100000
     AND v_authority.fee_amount_cents = v_terms.fee_amount_cents,
    format('the authority snapshots the fee amount, got %s', v_authority.fee_amount_cents);
  ASSERT jsonb_array_length(v_authority.fee_schedule) = 3
     AND v_authority.fee_schedule = v_terms.fee_schedule,
    'the authority snapshots the per-phase schedule whole';
  ASSERT v_authority.retainer_credit_rule = 'non_refundable'
     AND v_authority.retainer_credit_rule = v_terms.retainer_credit_rule,
    format('the authority snapshots the credit rule, got %L', v_authority.retainer_credit_rule);

  -- (7) R12 — the snapshot's hash IS the fingerprint both parties signed.
  SELECT * INTO v_snapshot FROM public.agreement_execution_snapshots
  WHERE proposal_id = 'a7300000-0000-4000-8000-000000000002';
  ASSERT v_snapshot.proposal_id IS NOT NULL, 'countersign writes the copy she keeps';
  ASSERT v_snapshot.document_hash = (
    SELECT evidence_fingerprint FROM public.commercial_document_signatures
    WHERE proposal_id = 'a7300000-0000-4000-8000-000000000002' AND party_role = 'studio'),
    'the snapshot hash is the studio signature''s evidence fingerprint';
  ASSERT v_snapshot.document_hash =
    public._commercial_document_fingerprint('a7300000-0000-4000-8000-000000000002'),
    'the snapshot hash is the document fingerprint';
  ASSERT char_length(v_snapshot.html) > 0, 'the snapshot html is not empty';
  ASSERT position('Per-phase fee' IN v_snapshot.html) > 0,
    'the snapshot carries a client-visible part''s title';
  ASSERT position('Services' IN v_snapshot.html) > 0,
    'the snapshot carries every client-visible part''s title';
  ASSERT position('Internal note' IN v_snapshot.html) = 0,
    'R8: the snapshot carries NO studio-only part''s title';
  ASSERT position('Studio eyes only' IN v_snapshot.html) = 0,
    'R8: nor a studio-only part''s body';
  ASSERT jsonb_array_length(v_snapshot.part_set) = 4,
    'part_set records EVERY part, visible or not — it is the instrument, not the page';

  -- (8) immutable, and one per agreement.
  v_created := v_snapshot.created_at;
  BEGIN
    UPDATE public.agreement_execution_snapshots SET html = 'x'
    WHERE proposal_id = 'a7300000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'the snapshot must refuse UPDATE';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
  END;
  BEGIN
    DELETE FROM public.agreement_execution_snapshots
    WHERE proposal_id = 'a7300000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'the snapshot must refuse DELETE';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
  END;

  PERFORM pg_temp.assume_role('a7000000-0000-4000-8000-000000000001');
  PERFORM public.countersign_design_services_agreement(
    'a7300000-0000-4000-8000-000000000002', 'Marguerite Vaudrey');
  PERFORM pg_temp.reset_role();
  ASSERT (SELECT count(*) FROM public.agreement_execution_snapshots
          WHERE proposal_id = 'a7300000-0000-4000-8000-000000000002') = 1,
    'a countersign retry must not mint a second snapshot';
  ASSERT (SELECT created_at FROM public.agreement_execution_snapshots
          WHERE proposal_id = 'a7300000-0000-4000-8000-000000000002') = v_created,
    'a countersign retry leaves the original snapshot untouched';

  -- (11b) and the bundle hands the client the frozen copy.
  PERFORM pg_temp.assume_user('a7000000-0000-4000-8000-000000000004');
  v_bundle := public.get_client_commercial_document_bundle('a7300000-0000-4000-8000-000000000002');
  ASSERT v_bundle->'executionSnapshot'->>'documentHash' = v_snapshot.document_hash,
    'the bundle projects the snapshot hash';
  ASSERT v_bundle->'executionSnapshot'->>'html' = v_snapshot.html,
    'the bundle projects the frozen html';
  ASSERT NOT (v_bundle->'executionSnapshot' ? 'partSet'),
    'the client reads the html she was given, not the studio''s row shapes';

  RAISE NOTICE 'PASS 6-8,11-12: the rail carries the fee basis to the authority, freezes the copy she keeps, and records what she ticked';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (13) THE COPY SHE KEEPS SAYS WHAT THE PAGE SHE SIGNED SAID (R12, R27).
--
-- Every sentence asserted below is AGREEMENT_PART_COPY
-- (packages/types/src/agreement-copy.ts) reproduced verbatim, the same way
-- case (1) reproduces the consent sentence: this file and the client body are
-- two implementations of one page, and if either moves, this goes red.
--
-- The refusals are the binding vocabulary rule: no database column name, no
-- raw stored enum, and no raw integer cents on anything a homeowner reads.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.assume_user('a7000000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_agreement('a7300000-0000-4000-8000-000000000005', 'The keepsake bench');

DO $$
DECLARE
  v_html text;
BEGIN
  PERFORM pg_temp.assume_user('a7000000-0000-4000-8000-000000000001');
  PERFORM public.upsert_agreement_parts(
    'a7300000-0000-4000-8000-000000000005',
    jsonb_build_array(
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.services', 'title', 'Services',
                         'payload', jsonb_build_object('body', 'Whole-home design.')),
      -- An empty clause is nothing on the page, not a title over blank paper.
      jsonb_build_object('kind', 'clause', 'partKey', 'custom.blank', 'title', 'Blank clause',
                         'payload', jsonb_build_object('body', '   ')),
      jsonb_build_object('kind', 'schedule', 'variant', 'rate_card',
                         'partKey', 'patina.role_rates', 'title', 'Role rates',
                         'payload', jsonb_build_object('roles', jsonb_build_array(
                           jsonb_build_object('roleName', 'Principal',
                                              'hourlyRateCents', 22500, 'sortOrder', 0)))),
      -- A ceiling with no figure is a stated absence of one (F-2).
      jsonb_build_object('kind', 'schedule', 'variant', 'ceiling',
                         'partKey', 'patina.ceiling', 'title', 'Ceiling',
                         'payload', '{}'::jsonb),
      jsonb_build_object('kind', 'schedule', 'variant', 'retainer',
                         'partKey', 'patina.retainer', 'title', 'Retainer',
                         'payload', jsonb_build_object(
                           'cents', 500000, 'creditRule', 'non_refundable',
                           'activationPolicy', 'retainer_paid')),
      jsonb_build_object('kind', 'schedule', 'variant', 'cadence',
                         'partKey', 'patina.cadence', 'title', 'Billing cadence',
                         'payload', jsonb_build_object('cadence', 'monthly')),
      -- Two record-only variants (R9), each carrying exactly the payload the
      -- adversarial review found printed raw onto the keepsake.
      jsonb_build_object('kind', 'schedule', 'variant', 'day_rate',
                         'partKey', 'custom.day_rate', 'title', 'Day rate',
                         'payload', jsonb_build_object('dayRateCents', 250000,
                                                       'minimumDays', 2)),
      jsonb_build_object('kind', 'schedule', 'variant', 'cost_plus',
                         'partKey', 'custom.cost_plus', 'title', 'Cost plus',
                         'payload', jsonb_build_object(
                           'markupPercent', 18,
                           'disclosure', 'Net invoices shown on request.')),
      -- A studio's licence is between the studio and its state. Even marked
      -- client-visible it reaches her as nothing at all.
      jsonb_build_object('kind', 'attestation', 'partKey', 'custom.licence',
                         'title', 'Studio licence',
                         'payload', jsonb_build_object('licenseNumber', 'ID-1234')),
      jsonb_build_object('kind', 'attachment', 'partKey', 'custom.leaf_a',
                         'title', 'Schedule of rates',
                         'payload', jsonb_build_object(
                           'body', 'Attached.', 'acknowledgeRequired', true)),
      -- An attachment with nothing typed under it is still a notice the paper
      -- names, and AttachmentLeaf draws it. It sits BEFORE the other leaf in
      -- rail order, which is exactly what the lettering has to survive.
      jsonb_build_object('kind', 'attachment', 'partKey', 'custom.leaf_b',
                         'title', 'Lead-safe practices',
                         'payload', '{}'::jsonb),
      jsonb_build_object('kind', 'clause', 'partKey', 'custom.private_note',
                         'title', 'Internal note', 'clientVisible', false,
                         'payload', jsonb_build_object('body', 'Studio eyes only.'))),
    'The keepsake bench');

  v_html := public._render_agreement_snapshot_html('a7300000-0000-4000-8000-000000000005');

  -- The words, verbatim from AGREEMENT_PART_COPY.
  ASSERT position('No ceiling — professional time is billed as it is worked.' IN v_html) > 0,
    format('an unset ceiling must say so in words: %L', v_html);
  ASSERT position('Design work begins after the fully executed agreement and retainer payment.'
                  IN v_html) > 0,
    'a retainer_paid retainer carries its activation sentence';
  ASSERT position('Additional work requires written authorization before it can be invoiced.'
                  IN v_html) > 0,
    'a cadence always carries its note';
  ASSERT position('Recorded with your agreement.' IN v_html) > 0,
    'a record-only variant says the one line the page she signed said for it';
  ASSERT position('Day rate' IN v_html) > 0 AND position('Cost plus' IN v_html) > 0,
    'a record-only variant keeps its title';
  ASSERT position('I received this' IN v_html) > 0,
    'an attachment that asks to be acknowledged says so';
  ASSERT position('$5,000.00' IN v_html) > 0 AND position('$225.00 per hour' IN v_html) > 0,
    'every figure is money, formatted';

  -- The refusals.
  ASSERT position('dayRateCents' IN v_html) = 0
     AND position('minimumDays' IN v_html) = 0
     AND position('markupPercent' IN v_html) = 0
     AND position('licenseNumber' IN v_html) = 0
     AND position('creditRule' IN v_html) = 0,
    format('no payload key may reach the homeowner''s copy: %L', v_html);
  ASSERT position('250000' IN v_html) = 0,
    'no raw integer cents may reach the homeowner''s copy';
  ASSERT position('non_refundable' IN v_html) = 0,
    'no raw stored enum may reach the homeowner''s copy';
  ASSERT position('Studio licence' IN v_html) = 0,
    'an attestation is not drawn at all';
  ASSERT position('Blank clause' IN v_html) = 0,
    'R21: an empty clause takes its heading with it';
  ASSERT position('Internal note' IN v_html) = 0
     AND position('Studio eyes only' IN v_html) = 0,
    'R8: a studio-only part is not on the copy she keeps';

  -- R37 — LEAF FOR LEAF WHAT agreement-parts-body.tsx SAID. Two things the
  -- renderer used to lose: the closing boundary, and the attachments' place on
  -- the page. AttachmentLeaf draws them last, below the boundary, each with a
  -- rule and an `ATTACHMENT {letter} · {title}` eyebrow.
  ASSERT position(
    'This agreement authorizes design services only. Furnishings, freight, tax, installation, and purchasing require a separate named furnishings authorization.'
    IN v_html) > 0,
    'the copy she keeps closes with the boundary the page she signed closed with';
  ASSERT position('ATTACHMENT A · Schedule of rates' IN v_html) > 0,
    format('an attachment is a lettered leaf: %L', v_html);
  ASSERT position('ATTACHMENT B · Lead-safe practices' IN v_html) > 0,
    'the lettering runs in rail order, whatever else stands between them';
  ASSERT position('This agreement authorizes design services only' IN v_html)
       < position('ATTACHMENT A' IN v_html),
    'the leaves sit below the boundary that closes the agreement';
  ASSERT position('<h2>Schedule of rates</h2>' IN v_html) = 0,
    'an attachment is not another section of the body';
  ASSERT position('<h2>' IN v_html) < position('ATTACHMENT A' IN v_html),
    'every section is drawn before the first leaf';

  RAISE NOTICE 'PASS 13: the copy she keeps reads as the page she signed — no key, no cent, no enum, and the leaves sit where she saw them';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (14) THE COMPOSED SENTENCE IS NOT PUBLIC READING. compose_agreement_consent
--      is SECURITY DEFINER and granted to `authenticated`; without a check of
--      its own, any signed-in stranger reads any studio's fee shape.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('a7000000-0000-4000-8000-000000000009', 'fs-stranger@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

SET LOCAL session_replication_role = replica;
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES ('a7000000-0000-4000-8000-000000000009', 'fs-stranger@test.invalid',
        'Fee Stranger', true, now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
SET LOCAL session_replication_role = origin;

DO $$
DECLARE
  v_got text;
BEGIN
  -- The lead reads it.
  PERFORM pg_temp.assume_user('a7000000-0000-4000-8000-000000000001');
  v_got := public.compose_agreement_consent('a7300000-0000-4000-8000-000000000005');
  ASSERT v_got IS NOT NULL AND position('I agree to' IN v_got) = 1,
    format('the studio must read its own agreement''s sentence, got %L', v_got);

  -- Her co-member reads it.
  PERFORM pg_temp.assume_user('a7000000-0000-4000-8000-000000000002');
  ASSERT public.compose_agreement_consent('a7300000-0000-4000-8000-000000000005') = v_got,
    'a co-member reads the same sentence';

  -- The homeowner reads it — she is the one who ticks it.
  PERFORM pg_temp.assume_user('a7000000-0000-4000-8000-000000000004');
  ASSERT public.compose_agreement_consent('a7300000-0000-4000-8000-000000000005') = v_got,
    'the homeowner reads the sentence she is asked to agree to';

  -- Nobody else does.
  PERFORM pg_temp.assume_user('a7000000-0000-4000-8000-000000000009');
  BEGIN
    v_got := public.compose_agreement_consent('a7300000-0000-4000-8000-000000000005');
    RAISE EXCEPTION 'a stranger read the composed sentence: %', v_got;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- And an unauthenticated caller is nobody.
  PERFORM set_config('request.jwt.claims', NULL, true);
  BEGIN
    v_got := public.compose_agreement_consent('a7300000-0000-4000-8000-000000000005');
    RAISE EXCEPTION 'an unauthenticated caller read the composed sentence: %', v_got;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  RAISE NOTICE 'PASS 14: the composed sentence is read by the two parties and nobody else';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (15) THE FINGERPRINT KEEPS ITS WORD TO EVERY DOCUMENT ALREADY SIGNED.
--
-- The four columns PART 1 adds ride on proposal_service_terms, which
-- _commercial_document_fingerprint hashes whole. Folded in unconditionally
-- they change the digest of every existing document, and countersign refuses
-- (23514) when the stored client signature disagrees — every agreement
-- sitting in client_signed at push time would become uncountersignable, with
-- no flag over it, and its signature row cannot be repaired.
--
-- pg_temp.fingerprint_00575 is 00575:503's body with one switch: `true` drops
-- the four W2 keys (the digest a pre-00577 database produced), `false` keeps
-- them (the digest an unconditional fold would produce).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION pg_temp.fingerprint_00575(
  p_proposal_id uuid, p_drop_w2 boolean)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, extensions, pg_temp
AS $fp$
  SELECT encode(extensions.digest(convert_to((jsonb_build_object(
    'proposal', public._proposal_review_fingerprint(p_proposal_id),
    'documentKind', p.document_kind,
    'serviceTerms', (
      SELECT CASE WHEN p_drop_w2
             THEN to_jsonb(t) - 'created_at' - 'updated_at'
                    - 'fee_basis' - 'fee_amount_cents' - 'fee_schedule'
                    - 'retainer_credit_rule'
             ELSE to_jsonb(t) - 'created_at' - 'updated_at' END
      FROM public.proposal_service_terms t WHERE t.proposal_id = p.id
    ),
    'serviceRates', COALESCE((
      SELECT jsonb_agg(to_jsonb(r) - 'id' - 'created_at' ORDER BY r.version, r.sort_order, r.role_name)
      FROM public.proposal_service_rates r WHERE r.proposal_id = p.id
    ), '[]'::jsonb),
    'furnishings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sourceProposalItemId', i.source_proposal_item_id,
        'sourceFfeItemId', i.source_ffe_item_id,
        'projectRoomId', i.project_room_id,
        'productId', i.product_id, 'name', i.name, 'roomName', i.room_name,
        'category', i.category, 'itemType', i.item_type, 'quantity', i.quantity,
        'clientUnitPriceCents', i.client_unit_price_cents,
        'clientLineTotalCents', i.client_line_total_cents,
        'snapshot', i.snapshot, 'sortOrder', i.sort_order
      ) ORDER BY i.sort_order, i.id)
      FROM public.furnishing_authorization_items i
      JOIN public.project_commercial_documents d ON d.id = i.commercial_document_id
      WHERE d.proposal_id = p.id
    ), '[]'::jsonb)
  ) || CASE WHEN p.document_kind = 'trade_scope' THEN jsonb_build_object(
    'tradeScope', jsonb_build_object(
      'partyId', (SELECT t.party_id FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'partyDisplayName', (SELECT t.party_display_name FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'partyCompanyName', (SELECT t.party_company_name FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'partyTrade', (SELECT t.party_trade FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'clientPriceCents', (SELECT t.client_price_cents FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'currency', (SELECT t.currency FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'terms', (SELECT t.terms FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'sections', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'roomName', s.room_name, 'projectRoomId', s.project_room_id,
          'prose', s.prose, 'allocationCents', s.allocation_cents,
          'sortOrder', s.sort_order
        ) ORDER BY s.sort_order, s.id)
        FROM public.trade_scope_sections s WHERE s.proposal_id = p.id
      ), '[]'::jsonb),
      'draws', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'label', w.label, 'percentage', w.percentage,
          'amountCents', w.amount_cents, 'sortOrder', w.sort_order,
          'gatesOnAcceptance', w.gates_on_acceptance
        ) ORDER BY w.sort_order, w.id)
        FROM public.trade_scope_draws w WHERE w.proposal_id = p.id
      ), '[]'::jsonb)
    )
  ) ELSE '{}'::jsonb END
    || CASE WHEN EXISTS (
         SELECT 1 FROM public.proposal_agreement_parts ap WHERE ap.proposal_id = p.id
       ) THEN jsonb_build_object(
    'parts', (
      SELECT jsonb_agg(to_jsonb(ap) - 'created_at' - 'updated_at'
                       ORDER BY ap.position, ap.id)
      FROM public.proposal_agreement_parts ap WHERE ap.proposal_id = p.id
    )
  ) ELSE '{}'::jsonb END)::text, 'UTF8'), 'sha256'), 'hex')
  FROM public.proposals p
  WHERE p.id = p_proposal_id;
$fp$;
GRANT EXECUTE ON FUNCTION pg_temp.fingerprint_00575(uuid, boolean) TO PUBLIC;

SELECT pg_temp.assume_user('a7000000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_agreement('a7300000-0000-4000-8000-000000000006', 'The legacy agreement');
SELECT pg_temp.mint_agreement('a7300000-0000-4000-8000-000000000007', 'The legacy rail');

DO $$
DECLARE
  v_real text;
  v_pre text;
  v_uncond text;
  v_signed jsonb;
  v_executed jsonb;
  v_terms public.proposal_service_terms%ROWTYPE;
BEGIN
  PERFORM pg_temp.assume_user('a7000000-0000-4000-8000-000000000001');

  SELECT * INTO v_terms FROM public.proposal_service_terms
  WHERE proposal_id = 'a7300000-0000-4000-8000-000000000006';
  ASSERT v_terms.fee_basis IS NULL AND v_terms.fee_amount_cents IS NULL
     AND v_terms.fee_schedule IS NULL AND v_terms.retainer_credit_rule = 'credited',
    'the four columns start unwritten on a document composed the Wave 1 way';

  v_real := public._commercial_document_fingerprint('a7300000-0000-4000-8000-000000000006');
  v_pre := pg_temp.fingerprint_00575('a7300000-0000-4000-8000-000000000006', true);
  v_uncond := pg_temp.fingerprint_00575('a7300000-0000-4000-8000-000000000006', false);
  ASSERT v_real = v_pre,
    format('a document with no fee schedule written must hash exactly what it hashed before 00577'
           || E'\n  got:  %L' || E'\n  want: %L', v_real, v_pre);
  ASSERT v_real <> v_uncond,
    'and folding the four columns in unconditionally would NOT have been the same digest';

  -- The moment a fee basis is actually written, all four ride in the digest
  -- and a signature taken against the older paper is correctly refused.
  PERFORM public.upsert_agreement_parts(
    'a7300000-0000-4000-8000-000000000006',
    jsonb_build_array(
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.services', 'title', 'Services',
                         'payload', jsonb_build_object('body', 'Whole-home design.')),
      jsonb_build_object('kind', 'schedule', 'variant', 'flat',
                         'partKey', 'patina.flat_fee', 'title', 'Flat design fee',
                         'payload', jsonb_build_object('cents', 1800000))),
    'A fee basis is written');

  SELECT * INTO v_terms FROM public.proposal_service_terms
  WHERE proposal_id = 'a7300000-0000-4000-8000-000000000006';
  ASSERT v_terms.fee_basis = 'flat' AND v_terms.fee_amount_cents = 1800000,
    'the flat fee reached the money row';

  v_real := public._commercial_document_fingerprint('a7300000-0000-4000-8000-000000000006');
  ASSERT v_real = pg_temp.fingerprint_00575('a7300000-0000-4000-8000-000000000006', false),
    'a written fee basis rides in the digest, whole';
  ASSERT v_real <> pg_temp.fingerprint_00575('a7300000-0000-4000-8000-000000000006', true),
    'a written fee basis MOVES the digest — a stale signature must not survive it';

  -- End to end, the promise the hash exists to keep: an agreement composed
  -- the Wave 1 way, with all four columns unwritten, still executes.
  PERFORM pg_temp.send_agreement('a7300000-0000-4000-8000-000000000007');
  PERFORM pg_temp.assume_user('a7000000-0000-4000-8000-000000000004', 'service_role');
  EXECUTE 'SET LOCAL ROLE service_role';
  v_signed := public.sign_design_services_agreement_with_trusted_ip(
    'a7300000-0000-4000-8000-000000000007', 'Fee Client',
    'a7000000-0000-4000-8000-000000000004', '203.0.113.9');
  PERFORM pg_temp.reset_role();
  ASSERT (v_signed->>'newlyClientSigned')::boolean,
    format('the legacy agreement must be signable: %s', v_signed);

  PERFORM pg_temp.assume_role('a7000000-0000-4000-8000-000000000001');
  v_executed := public.countersign_design_services_agreement(
    'a7300000-0000-4000-8000-000000000007', 'Marguerite Vaudrey');
  PERFORM pg_temp.reset_role();
  ASSERT (v_executed->>'newlyExecuted')::boolean,
    format('a parts-less agreement with unwritten fee columns must still countersign: %s',
           v_executed);

  RAISE NOTICE 'PASS 15: the fingerprint is unmoved by four unwritten columns, and moves the moment one is written';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (16) R33 — A FEE THE HOMEOWNER NEVER SAW NEVER BILLS HER.
--      A studio-only flat fee beside a client-visible rate card used to send
--      `flat / $8,000` to the money row and onto the executed authority, while
--      the sentence she ticked named the rates and the keepsake she keeps
--      never mentioned eight thousand dollars. Three surfaces of one agreement
--      disagreeing, and the one that disagreed was the one that charged.
--
--      And its other half: hide the ONLY fee and the agreement names no fee at
--      all, so R22's floor refuses the send rather than letting a paper leave
--      the studio with a price nobody can read.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_terms public.proposal_service_terms%ROWTYPE;
  v_signed jsonb;
  v_executed jsonb;
  v_authority public.project_billing_authorities%ROWTYPE;
  v_sentence text;
  v_snapshot public.agreement_execution_snapshots%ROWTYPE;
  v_rates integer;
  v_refused boolean;
BEGIN
  PERFORM pg_temp.assume_user('a7000000-0000-4000-8000-000000000001');
  PERFORM public.upsert_agreement_parts(
    'a7300000-0000-4000-8000-00000000000a',
    jsonb_build_array(
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.services', 'title', 'Services',
                         'payload', jsonb_build_object('body', 'Whole-home design.')),
      jsonb_build_object('kind', 'schedule', 'variant', 'rate_card',
                         'partKey', 'patina.role_rates', 'title', 'Role rates',
                         'payload', jsonb_build_object('roles', jsonb_build_array(
                           jsonb_build_object('roleName', 'Principal designer',
                                              'hourlyRateCents', 22500, 'sortOrder', 0)))),
      jsonb_build_object('kind', 'schedule', 'variant', 'ceiling',
                         'partKey', 'patina.ceiling', 'title', 'Ceiling',
                         'payload', jsonb_build_object('cents', 2400000)),
      jsonb_build_object('kind', 'schedule', 'variant', 'flat',
                         'partKey', 'custom.studio_only_fee', 'title', 'Flat fee',
                         'clientVisible', false,
                         'payload', jsonb_build_object('cents', 800000))),
    'A fee the studio kept to itself');

  SELECT * INTO v_terms FROM public.proposal_service_terms
  WHERE proposal_id = 'a7300000-0000-4000-8000-00000000000a';
  ASSERT v_terms.fee_basis = 'hourly',
    format('the visible rate card is the fee basis, got %L', v_terms.fee_basis);
  ASSERT v_terms.fee_amount_cents IS NULL,
    format('a hidden flat fee sends nothing to terms, got %s', v_terms.fee_amount_cents);
  ASSERT v_terms.fee_schedule IS NULL,
    'a hidden fee writes no schedule either';

  -- The sentence she reads never named it, and neither does the keepsake.
  v_sentence := public.compose_agreement_consent('a7300000-0000-4000-8000-00000000000a');
  ASSERT v_sentence NOT LIKE '%flat design fee%',
    format('the consent sentence must not name a hidden fee, got %L', v_sentence);

  PERFORM pg_temp.send_agreement('a7300000-0000-4000-8000-00000000000a');

  PERFORM pg_temp.assume_user('a7000000-0000-4000-8000-000000000004', 'service_role');
  EXECUTE 'SET LOCAL ROLE service_role';
  v_signed := public.sign_design_services_agreement_with_trusted_ip(
    'a7300000-0000-4000-8000-00000000000a', 'Fee Client',
    'a7000000-0000-4000-8000-000000000004', '203.0.113.9',
    jsonb_build_object('consentSentence', v_sentence,
                       'attachmentsAcknowledged', '[]'::jsonb));
  PERFORM pg_temp.reset_role();
  ASSERT (v_signed->>'newlyClientSigned')::boolean,
    format('the agreement must be signable: %s', v_signed);

  PERFORM pg_temp.assume_role('a7000000-0000-4000-8000-000000000001');
  v_executed := public.countersign_design_services_agreement(
    'a7300000-0000-4000-8000-00000000000a', 'Marguerite Vaudrey');
  PERFORM pg_temp.reset_role();

  SELECT * INTO v_authority FROM public.project_billing_authorities
  WHERE id = (v_executed->>'billingAuthorityId')::uuid;
  ASSERT v_authority.fee_basis = 'hourly',
    format('the executed authority bills the rates she signed, got %L', v_authority.fee_basis);
  ASSERT v_authority.fee_amount_cents IS NULL,
    format('the executed authority carries no hidden fee, got %s', v_authority.fee_amount_cents);

  SELECT * INTO v_snapshot FROM public.agreement_execution_snapshots
  WHERE proposal_id = 'a7300000-0000-4000-8000-00000000000a';
  ASSERT v_snapshot.html NOT LIKE '%8,000.00%',
    'the copy she keeps never mentions the fee she was never shown';

  -- The rate card she CAN see still projects its rates.
  SELECT count(*) INTO v_rates FROM public.proposal_service_rates
  WHERE proposal_id = 'a7300000-0000-4000-8000-00000000000a';
  ASSERT v_rates = 1,
    format('a visible rate card still projects its roles, got %s', v_rates);

  -- ── The other half: hide the only fee and the paper names none.
  PERFORM pg_temp.assume_user('a7000000-0000-4000-8000-000000000001');
  PERFORM public.upsert_agreement_parts(
    'a7300000-0000-4000-8000-00000000000b',
    jsonb_build_array(
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.services', 'title', 'Services',
                         'payload', jsonb_build_object('body', 'Whole-home design.')),
      jsonb_build_object('kind', 'schedule', 'variant', 'flat',
                         'partKey', 'custom.studio_only_fee', 'title', 'Flat fee',
                         'clientVisible', false,
                         'payload', jsonb_build_object('cents', 800000))),
    'The only fee, hidden');

  SELECT * INTO v_terms FROM public.proposal_service_terms
  WHERE proposal_id = 'a7300000-0000-4000-8000-00000000000b';
  ASSERT v_terms.fee_basis IS NULL,
    format('a hidden fee alone leaves the basis unwritten, got %L', v_terms.fee_basis);

  v_refused := false;
  BEGIN
    PERFORM pg_temp.send_agreement('a7300000-0000-4000-8000-00000000000b');
  EXCEPTION WHEN OTHERS THEN
    v_refused := true;
    ASSERT SQLERRM LIKE '%names no fee%',
      format('the floor must refuse in its own words, got %L', SQLERRM);
  END;
  ASSERT v_refused, 'an agreement whose only fee is hidden must not send';

  RAISE NOTICE 'PASS 16: R33 — only a fee she can read reaches the money row, and a hidden one cannot send';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (17) P7 — copy_agreement_parts_from_authority, and R34's why.
--
--      P7 is the whole backend of composing an addendum from the authority the
--      studio is already working under, and it shipped with no test at all: a
--      kind guard, a draft guard, a project-binding guard, the read of the
--      active authority, verbatim ordering, and a re-run of the projection and
--      the event log, none of them asserted anywhere.
--
--      R34 rides with it. The composer tells the designer "your client reads
--      it beside the change", and until this ruling that was true of no
--      surface: the line went into the studio's change log and stopped there.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_project_id uuid;
  v_created jsonb;
  v_addendum uuid;
  v_copied integer;
  v_bundle jsonb;
  v_html text;
  v_titles text[];
  v_terms public.proposal_service_terms%ROWTYPE;
  v_refused boolean;
  v_why CONSTANT text := 'Added the study to the scope';
BEGIN
  SELECT project_id INTO v_project_id FROM public.proposals
  WHERE id = 'a7300000-0000-4000-8000-000000000002';
  ASSERT v_project_id IS NOT NULL,
    'case (6-8) must have countersigned the per-phase agreement into a project';

  PERFORM pg_temp.assume_role('a7000000-0000-4000-8000-000000000001');
  v_created := public.create_service_addendum(v_project_id, 'Addendum No. 1');
  v_addendum := (v_created->>'proposalId')::uuid;
  ASSERT v_addendum IS NOT NULL,
    format('the addendum must be created, got %s', v_created);

  -- An agreement is not an addendum, and the RPC says so before it copies.
  v_refused := false;
  BEGIN
    PERFORM public.copy_agreement_parts_from_authority(
      'a7300000-0000-4000-8000-000000000002', v_why);
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN v_refused := true;
  END;
  ASSERT v_refused, 'only a service_addendum composes from the authority';

  v_copied := public.copy_agreement_parts_from_authority(v_addendum, v_why);
  ASSERT v_copied = 4,
    format('the addendum must carry the authority''s four parts, got %s', v_copied);

  -- Verbatim, and in the order the executed paper carried them.
  SELECT array_agg(ap.title ORDER BY ap.position, ap.id)
  INTO v_titles FROM public.proposal_agreement_parts ap
  WHERE ap.proposal_id = v_addendum;
  ASSERT v_titles = ARRAY['Services', 'Per-phase fee', 'Retainer', 'Internal note'],
    format('the parts arrive in the executed paper''s own order, got %s', v_titles);

  -- The projection runs on the way in, so the addendum bills the way the
  -- agreement it amends bills.
  SELECT * INTO v_terms FROM public.proposal_service_terms
  WHERE proposal_id = v_addendum;
  ASSERT v_terms.fee_basis = 'per_phase'
     AND v_terms.fee_amount_cents = 1100000
     AND jsonb_array_length(v_terms.fee_schedule) = 3
     AND v_terms.retainer_credit_rule = 'non_refundable',
    format('the addendum''s money row must carry the copied fee, got %L / %s / %L',
           v_terms.fee_basis, v_terms.fee_amount_cents, v_terms.retainer_credit_rule);

  -- P8 — every copied part is an addition, and each one carries the why and
  -- the hand that wrote it.
  ASSERT (SELECT count(*) FROM public.agreement_part_events
          WHERE proposal_id = v_addendum AND action = 'added') = 4,
    'each copied part is recorded as an addition';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.agreement_part_events
    WHERE proposal_id = v_addendum
      AND (why IS DISTINCT FROM v_why OR actor_name IS DISTINCT FROM 'Marguerite')),
    'every event carries the designer''s why and her first name';

  -- The client's bundle opens at send, so the addendum has to leave draft
  -- before she has anything to read.
  PERFORM pg_temp.send_agreement(v_addendum);
  PERFORM pg_temp.reset_role();

  -- The homeowner's edge.
  PERFORM pg_temp.assume_user('a7000000-0000-4000-8000-000000000004');
  v_bundle := public.get_client_commercial_document_bundle(v_addendum);
  ASSERT v_bundle->>'why' = v_why,
    format('the addendum''s why must reach the client bundle, got %L', v_bundle->>'why');

  -- And nothing else of the log crosses with it (R8).
  ASSERT NOT (v_bundle::text ~* 'agreement_part_events|partEvents|"history"|"actor"|"before"|"after"'),
    'the change history itself stays studio-side';

  -- An agreement is not an addendum, and carries no why at all.
  v_bundle := public.get_client_commercial_document_bundle('a7300000-0000-4000-8000-000000000002');
  ASSERT v_bundle ? 'why', 'the key is present on every document, so the client never branches on absence';
  ASSERT jsonb_typeof(v_bundle->'why') = 'null',
    format('only an addendum carries a why, got %s', v_bundle->'why');

  -- The copy she keeps opens with it, in the designer's own words.
  v_html := public._render_agreement_snapshot_html(v_addendum);
  ASSERT position(v_why IN v_html) > 0,
    'the keepsake prints the why beside the change';
  ASSERT position(v_why IN v_html) < position('<h2>' IN v_html),
    'the why sits above the change, which is the order she reads it in';

  -- And once it has left draft, the act cannot be run again over it.
  v_refused := false;
  BEGIN
    PERFORM pg_temp.assume_role('a7000000-0000-4000-8000-000000000001');
    PERFORM public.copy_agreement_parts_from_authority(v_addendum, v_why);
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN v_refused := true;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_refused, 'R6 — a sent addendum is frozen, and this door is closed too';

  RAISE NOTICE 'PASS 17: P7 copies the authority verbatim and projects it, and R34''s why reaches the door and the keepsake';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (18) TWO PARTS OF ONE MONEY VARIANT — the twelfth parity scenario.
--
-- The eleven scenarios the SQL and TS composers were compared on all carry at
-- most one part per money variant, because upsert_agreement_parts refuses a
-- second retainer (R18) and no caller can build the set. That is exactly why
-- the two implementations could disagree on it unnoticed: SQL LOOPed every
-- matching row and said the fragment once per row, TS reads one part per
-- variant. This case builds the unreachable set by INSERTing straight into
-- the table — the guard allows it only while the proposal is draft — and
-- pins the composer to the TS side's answer: the term said ONCE, in the
-- lowest-`position` part's words, and the sentence byte-identical to the
-- one-retainer 'per_phase' literal above.
--
-- The TS twin is pinned on the same set in
-- apps/client-portal/src/components/threshold/__tests__/consent-copy.test.ts
-- ("says a money term once when a part set carries two of one variant").
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_id uuid := 'a7300000-0000-4000-8000-00000000000c';
  v_got text;
  v_refused boolean := false;
BEGIN
  PERFORM pg_temp.assume_user('a7000000-0000-4000-8000-000000000001');
  PERFORM public.upsert_agreement_parts(v_id, jsonb_build_array(
    jsonb_build_object('kind', 'schedule', 'variant', 'per_phase',
                       'partKey', 'custom.perphase', 'title', 'Per-phase fee',
                       'payload', jsonb_build_object('phases', jsonb_build_array(
                         jsonb_build_object('key', 'a', 'label', 'Concept', 'cents', 350000)))),
    jsonb_build_object('kind', 'schedule', 'variant', 'retainer',
                       'partKey', 'patina.retainer', 'title', 'Retainer',
                       'payload', jsonb_build_object(
                         'cents', 500000, 'creditRule', 'non_refundable',
                         'activationPolicy', 'immediate'))));

  -- R18 first: the door a designer actually uses refuses the set outright.
  BEGIN
    PERFORM public.upsert_agreement_parts(v_id, jsonb_build_array(
      jsonb_build_object('kind', 'schedule', 'variant', 'retainer',
                         'partKey', 'patina.retainer', 'title', 'Retainer',
                         'payload', jsonb_build_object('cents', 500000)),
      jsonb_build_object('kind', 'schedule', 'variant', 'retainer',
                         'partKey', 'custom.retainer_two', 'title', 'Second retainer',
                         'payload', jsonb_build_object('cents', 900000))));
  EXCEPTION WHEN check_violation THEN v_refused := true;
  END;
  ASSERT v_refused, 'R18 — an agreement carries only one retainer';

  -- Behind that door, the state the two composers must still agree on.
  INSERT INTO public.proposal_agreement_parts (
    proposal_id, position, kind, variant, part_key, title, payload, client_visible
  ) VALUES (
    v_id, 99, 'schedule', 'retainer', 'custom.retainer_two', 'Second retainer',
    jsonb_build_object('cents', 900000, 'creditRule', 'replenishing'), true
  );
  ASSERT (SELECT count(*) FROM public.proposal_agreement_parts
          WHERE proposal_id = v_id AND kind = 'schedule' AND variant = 'retainer') = 2,
    'the unreachable set is on the table';

  v_got := public.compose_agreement_consent(v_id);
  ASSERT v_got = (SELECT sentence FROM _fs_consent WHERE label = 'per_phase'),
    format('two retainers must say the term once, in the first part''s words:%s  got:  %L%s  want: %L',
           E'\n', v_got, E'\n', (SELECT sentence FROM _fs_consent WHERE label = 'per_phase'));

  RAISE NOTICE 'PASS 18: two parts of one money variant say their term once, and the composers agree on the set no caller can build';
END $$;

ROLLBACK;
