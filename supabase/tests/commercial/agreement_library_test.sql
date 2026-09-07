-- ═══════════════════════════════════════════════════════════════════════════
-- 00576 — The Agreement Library: studio parts, studio and seeded templates.
-- Runner: plain psql, ON_ERROR_STOP=1. Single transaction, ROLLBACK at the end.
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/commercial/agreement_library_test.sql
--
-- What this file exists to prove:
--   (1)  Seeded rows are Patina's. UPDATE and DELETE refuse even to a
--        superuser, and open only under app.allow_patina_template_mutation.
--   (2)  The owner-shape CHECK holds in both directions.
--   (3)  R3 IS ENFORCED IN THE DATABASE, NOT ONLY IN THE ROOM. A plain active
--        member is refused by save_agreement_part and
--        save_agreement_as_template, and by RLS on a direct DELETE; an admin
--        and an owner are not.
--   (4)  R3's other half: EVERY active member COMPOSES. The plain member
--        reads both tables and materializes a template into a draft.
--   (5)  Cross-studio isolation, on both tables and through the RPC.
--   (6)  Owner references are stripped at every depth — nested objects and
--        array elements too — and the designer's own words survive.
--   (7)  Materialize replaces the part set WHOLESALE and stamps where each
--        part came from: source_part_id for a Library row, NULL for an inline
--        body, source_template_key on both.
--   (8)  A DELETED Library part does not brick a template that names it.
--   (9)  R6. A template composes only into a DRAFT.
--   (10) The three seeded templates exist, patina.design_services carries the
--        nine standard keys in PATINA_STANDARD_AGREEMENT_PARTS order, and
--        patina.design_build does NOT exist (Wave 3).
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

-- ═══════════════════════════════════════════════════════════════════════════
-- (0) FIXTURE — studio A with an owner (also the lead designer), an admin and
--     a plain member; studio B with an owner of its own; one client.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('a6000000-0000-4000-8000-000000000001', 'al-owner@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a6000000-0000-4000-8000-000000000002', 'al-admin@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a6000000-0000-4000-8000-000000000003', 'al-member@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a6000000-0000-4000-8000-000000000004', 'al-outsider@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a6000000-0000-4000-8000-000000000005', 'al-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

-- is_designer = true auto-provisions a personal studio (00295), which would
-- give the lead one more studio than this fixture states and make
-- save_agreement_as_template's two-membership resolution ambiguous.
SET LOCAL session_replication_role = replica;
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('a6000000-0000-4000-8000-000000000001', 'al-owner@test.invalid', 'Library Owner', true, now(), now()),
  ('a6000000-0000-4000-8000-000000000002', 'al-admin@test.invalid', 'Library Admin', true, now(), now()),
  ('a6000000-0000-4000-8000-000000000003', 'al-member@test.invalid', 'Library Member', true, now(), now()),
  ('a6000000-0000-4000-8000-000000000004', 'al-outsider@test.invalid', 'Library Outsider', true, now(), now()),
  ('a6000000-0000-4000-8000-000000000005', 'al-client@test.invalid', 'Library Client', false, now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;
SET LOCAL session_replication_role = origin;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('a6100000-0000-4000-8000-000000000001', 'design_studio', 'Library Studio A', 'agreement-library-a', 'active'),
  ('a6100000-0000-4000-8000-000000000002', 'design_studio', 'Library Studio B', 'agreement-library-b', 'active');

SELECT pg_temp.assume_user('a6000000-0000-4000-8000-000000000001', 'service_role');
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('a6110000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001',
   'a6100000-0000-4000-8000-000000000001', 'owner', 'active', now() - interval '3 days'),
  ('a6110000-0000-4000-8000-000000000002', 'a6000000-0000-4000-8000-000000000002',
   'a6100000-0000-4000-8000-000000000001', 'admin', 'active', now() - interval '2 days'),
  ('a6110000-0000-4000-8000-000000000003', 'a6000000-0000-4000-8000-000000000003',
   'a6100000-0000-4000-8000-000000000001', 'member', 'active', now() - interval '1 day'),
  ('a6110000-0000-4000-8000-000000000004', 'a6000000-0000-4000-8000-000000000004',
   'a6100000-0000-4000-8000-000000000002', 'owner', 'active', now());

INSERT INTO public.user_roles (user_id, role_id, granted_by)
SELECT designer.id, role.id, designer.id
FROM (VALUES
  ('a6000000-0000-4000-8000-000000000001'::uuid),
  ('a6000000-0000-4000-8000-000000000004'::uuid)
) AS designer(id)
CROSS JOIN public.roles AS role
WHERE role.name = 'studio_owner';

INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, status, source)
VALUES
  ('a6200000-0000-4000-8000-000000000001',
   'a6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000005',
   'Library Client', 'proposal', 'direct'),
  ('a6200000-0000-4000-8000-000000000002',
   'a6000000-0000-4000-8000-000000000004', 'a6000000-0000-4000-8000-000000000005',
   'Library Client', 'proposal', 'direct');

CREATE OR REPLACE FUNCTION pg_temp.mint_agreement(
  p_id uuid, p_title text, p_designer uuid, p_designer_client uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.proposals (
    id, designer_id, designer_client_id, client_id, title, description,
    total_amount, status, valid_until
  ) VALUES (
    p_id, p_designer, p_designer_client, 'a6000000-0000-4000-8000-000000000005',
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
GRANT EXECUTE ON FUNCTION pg_temp.mint_agreement(uuid, text, uuid, uuid) TO PUBLIC;

SELECT pg_temp.assume_user('a6000000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_agreement('a6300000-0000-4000-8000-000000000001', 'Studio A origin',
  'a6000000-0000-4000-8000-000000000001', 'a6200000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_agreement('a6300000-0000-4000-8000-000000000002', 'Studio A second',
  'a6000000-0000-4000-8000-000000000001', 'a6200000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_agreement('a6300000-0000-4000-8000-000000000004', 'Studio A third',
  'a6000000-0000-4000-8000-000000000001', 'a6200000-0000-4000-8000-000000000001');
DO $$ BEGIN
  PERFORM public.materialize_standard_parts('a6300000-0000-4000-8000-000000000001');
END $$;

SELECT pg_temp.assume_user('a6000000-0000-4000-8000-000000000004');
SELECT pg_temp.mint_agreement('a6300000-0000-4000-8000-000000000003', 'Studio B origin',
  'a6000000-0000-4000-8000-000000000004', 'a6200000-0000-4000-8000-000000000002');

-- ═══════════════════════════════════════════════════════════════════════════
-- (10) The three seeded templates, and the one that is Wave 3.
--      Asserted first, because everything below composes from them.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_keys text[];
BEGIN
  SELECT array_agg(t.template_key ORDER BY t.template_key) INTO v_keys
  FROM public.agreement_templates t WHERE t.kind = 'seeded';
  ASSERT v_keys = ARRAY[
    'patina.consultation', 'patina.design_services', 'patina.furnishings_services'
  ], format('the seeded template set drifted: %s', v_keys);

  ASSERT NOT EXISTS (
    SELECT 1 FROM public.agreement_templates WHERE template_key = 'patina.design_build'
  ), 'patina.design_build is Wave 3 and must not be seeded here';

  SELECT array_agg(e.part->>'partKey' ORDER BY e.ord) INTO v_keys
  FROM public.agreement_templates t
  CROSS JOIN LATERAL jsonb_array_elements(t.parts) WITH ORDINALITY AS e(part, ord)
  WHERE t.template_key = 'patina.design_services';
  ASSERT v_keys = ARRAY[
    'patina.services', 'patina.deliverables', 'patina.exclusions',
    'patina.role_rates', 'patina.ceiling', 'patina.deposit',
    'patina.retainer', 'patina.cadence', 'patina.terms'
  ], format('patina.design_services must carry the nine standard keys in order, got %s', v_keys);

  ASSERT (SELECT count(*) FROM public.agreement_templates t
          CROSS JOIN LATERAL jsonb_array_elements(t.parts) AS e(part)
          WHERE t.template_key = 'patina.design_services'
            AND e.part->>'partKey' = ANY (ARRAY['patina.deposit', 'patina.retainer'])
            AND jsonb_typeof(COALESCE(e.part->'payload'->'depositPercent',
                                      e.part->'payload'->'cents')) = 'null') = 2,
    'R28: no money the designer did not type is seeded into the standard template';

  RAISE NOTICE 'PASS 10: three seeded templates, nine standard keys in order, no design_build, no invented money';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (1) Seeded rows are immutable, and open only under the maintenance GUC.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE v_state text;
BEGIN
  BEGIN
    UPDATE public.agreement_templates SET title = 'x' WHERE kind = 'seeded';
    RAISE EXCEPTION 'seeded templates must refuse UPDATE';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.agreement_templates WHERE kind = 'seeded';
    RAISE EXCEPTION 'seeded templates must refuse DELETE';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  PERFORM set_config('app.allow_patina_template_mutation', 'on', true);
  UPDATE public.agreement_templates SET title = 'Maintenance'
  WHERE template_key = 'patina.consultation';
  ASSERT (SELECT title FROM public.agreement_templates
          WHERE template_key = 'patina.consultation') = 'Maintenance',
    'the maintenance GUC must open the seeded row';
  UPDATE public.agreement_templates SET title = 'Consultation / hourly'
  WHERE template_key = 'patina.consultation';
  PERFORM set_config('app.allow_patina_template_mutation', 'off', true);

  RAISE NOTICE 'PASS 1: seeded rows refuse UPDATE and DELETE, and open only under the maintenance GUC';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (2) The owner-shape CHECK, in both directions.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  BEGIN
    INSERT INTO public.agreement_templates (template_key, kind, studio_id, class, title, parts)
    VALUES ('patina.bogus', 'seeded', 'a6100000-0000-4000-8000-000000000001',
            'design_services', 'Bogus', '[]'::jsonb);
    RAISE EXCEPTION 'a seeded row must not carry a studio';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.agreement_templates (template_key, kind, studio_id, class, title, parts)
    VALUES ('patina.stolen', 'studio', 'a6100000-0000-4000-8000-000000000001',
            'design_services', 'Stolen', '[]'::jsonb);
    RAISE EXCEPTION 'a studio row must not carry a patina.* key';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.studio_agreement_parts (studio_id, kind, part_key, title)
    VALUES ('a6100000-0000-4000-8000-000000000001', 'clause', 'patina.mine', 'Mine');
    RAISE EXCEPTION 'a Library part must be keyed studio.*';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  RAISE NOTICE 'PASS 2: the owner-shape CHECK holds in both directions, on both tables';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (3) R3 — writing the Library is owners and admins, in the DATABASE.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_part public.studio_agreement_parts%ROWTYPE;
  v_template public.agreement_templates%ROWTYPE;
BEGIN
  -- the plain member is refused at both doors
  PERFORM pg_temp.assume_user('a6000000-0000-4000-8000-000000000003');
  BEGIN
    PERFORM public.save_agreement_part(
      'a6100000-0000-4000-8000-000000000001',
      jsonb_build_object('kind', 'clause', 'title', 'Site access',
                         'payload', jsonb_build_object('body', 'Access is arranged in writing.')));
    RAISE EXCEPTION 'R3: a plain member must not write the Library';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.save_agreement_as_template(
      'a6300000-0000-4000-8000-000000000001', 'Member template');
    RAISE EXCEPTION 'R3: a plain member must not save a template';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- the admin is not
  PERFORM pg_temp.assume_user('a6000000-0000-4000-8000-000000000002');
  v_part := public.save_agreement_part(
    'a6100000-0000-4000-8000-000000000001',
    jsonb_build_object('kind', 'clause', 'partKey', 'studio.site_access',
                       'title', 'Site access',
                       'payload', jsonb_build_object('body', 'Access is arranged in writing.')));
  ASSERT v_part.id IS NOT NULL AND v_part.part_key = 'studio.site_access',
    'an admin must be able to save a Library part';

  v_template := public.save_agreement_as_template(
    'a6300000-0000-4000-8000-000000000001', 'Full-service residential');
  ASSERT v_template.kind = 'studio'
     AND v_template.studio_id = 'a6100000-0000-4000-8000-000000000001'
     AND v_template.template_key LIKE 'studio.%'
     AND v_template.class = 'design_services'
     AND jsonb_array_length(v_template.parts) = 9,
    format('an admin must be able to save a template: %s', to_jsonb(v_template));

  -- and neither is the owner
  PERFORM pg_temp.assume_user('a6000000-0000-4000-8000-000000000001');
  v_part := public.save_agreement_part(
    'a6100000-0000-4000-8000-000000000001',
    jsonb_build_object('kind', 'schedule', 'variant', 'flat',
                       'partKey', 'studio.house_flat', 'title', 'Flat design fee',
                       'payload', jsonb_build_object('cents', 800000)));
  ASSERT v_part.variant = 'flat', 'an owner must be able to save a schedule part';

  -- a schedule with no variant is refused in the designer's words
  BEGIN
    PERFORM public.save_agreement_part(
      'a6100000-0000-4000-8000-000000000001',
      jsonb_build_object('kind', 'schedule', 'title', 'Nameless',
                         'payload', '{}'::jsonb));
    RAISE EXCEPTION 'a schedule part must say which schedule it is';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  RAISE NOTICE 'PASS 3: R3 is enforced by the RPCs — a plain member is refused, an admin and an owner are not';
END $$;

-- The RLS half of R3: a plain member's direct DELETE reaches nothing.
DO $$
DECLARE v_before integer; v_after integer;
BEGIN
  SELECT count(*) INTO v_before FROM public.agreement_templates WHERE kind = 'studio';
  PERFORM pg_temp.assume_role('a6000000-0000-4000-8000-000000000003');
  DELETE FROM public.agreement_templates WHERE kind = 'studio';
  DELETE FROM public.studio_agreement_parts WHERE studio_id = 'a6100000-0000-4000-8000-000000000001';
  PERFORM pg_temp.reset_role();
  SELECT count(*) INTO v_after FROM public.agreement_templates WHERE kind = 'studio';
  ASSERT v_before = v_after AND v_after = 1,
    format('R3/RLS: a plain member''s DELETE must reach nothing (%s -> %s)', v_before, v_after);
  ASSERT (SELECT count(*) FROM public.studio_agreement_parts
          WHERE studio_id = 'a6100000-0000-4000-8000-000000000001') = 2,
    'R3/RLS: a plain member''s DELETE must not remove a Library part';
  RAISE NOTICE 'PASS 3b: RLS refuses a plain member''s direct DELETE on both tables';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (4) R3's other half — every active member COMPOSES.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_template_key text;
  v_seen integer;
  v_count integer;
BEGIN
  SELECT template_key INTO v_template_key FROM public.agreement_templates
  WHERE kind = 'studio' AND studio_id = 'a6100000-0000-4000-8000-000000000001';

  PERFORM pg_temp.assume_role('a6000000-0000-4000-8000-000000000003');

  SELECT count(*) INTO v_seen FROM public.agreement_templates;
  ASSERT v_seen = 4,
    format('a plain member reads three seeded templates and their studio''s one, got %s', v_seen);
  SELECT count(*) INTO v_seen FROM public.studio_agreement_parts;
  ASSERT v_seen = 2,
    format('a plain member reads their studio''s Library parts, got %s', v_seen);

  v_count := public.materialize_agreement_template(
    'a6300000-0000-4000-8000-000000000002', v_template_key);
  PERFORM pg_temp.reset_role();
  ASSERT v_count = 9,
    format('R3: composing is not editing — a plain member must materialize, got %s', v_count);
  ASSERT (SELECT count(*) FROM public.proposal_agreement_parts
          WHERE proposal_id = 'a6300000-0000-4000-8000-000000000002') = 9,
    'the nine parts must land on the draft';

  RAISE NOTICE 'PASS 4: every active member reads the Library and composes from it';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (5) Cross-studio isolation — through RLS and through the RPC.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_template_key text;
  v_seen integer;
BEGIN
  SELECT template_key INTO v_template_key FROM public.agreement_templates
  WHERE kind = 'studio' AND studio_id = 'a6100000-0000-4000-8000-000000000001';

  PERFORM pg_temp.assume_role('a6000000-0000-4000-8000-000000000004');
  SELECT count(*) INTO v_seen FROM public.agreement_templates WHERE kind = 'studio';
  ASSERT v_seen = 0,
    format('studio B must see none of studio A''s templates, saw %s', v_seen);
  SELECT count(*) INTO v_seen FROM public.studio_agreement_parts;
  ASSERT v_seen = 0,
    format('studio B must see none of studio A''s Library parts, saw %s', v_seen);
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('a6000000-0000-4000-8000-000000000004');
  BEGIN
    PERFORM public.materialize_agreement_template(
      'a6300000-0000-4000-8000-000000000003', v_template_key);
    RAISE EXCEPTION 'studio B must not compose from studio A''s template';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- and studio A's owner cannot write into studio B's Library
  PERFORM pg_temp.assume_user('a6000000-0000-4000-8000-000000000001');
  BEGIN
    PERFORM public.save_agreement_part(
      'a6100000-0000-4000-8000-000000000002',
      jsonb_build_object('kind', 'clause', 'title', 'Trespass',
                         'payload', jsonb_build_object('body', 'x')));
    RAISE EXCEPTION 'studio A must not write into studio B''s Library';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  RAISE NOTICE 'PASS 5: cross-studio isolation holds on both tables and at the RPC';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (6) Owner references are stripped AT EVERY DEPTH, and the words survive.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_template public.agreement_templates%ROWTYPE;
  v_payload jsonb;
BEGIN
  PERFORM pg_temp.assume_user('a6000000-0000-4000-8000-000000000001');

  PERFORM public.upsert_agreement_parts(
    'a6300000-0000-4000-8000-000000000004',
    jsonb_build_array(jsonb_build_object(
      'kind', 'clause', 'partKey', 'patina.services', 'title', 'Services',
      'clientVisible', true, 'required', true,
      'payload', jsonb_build_object(
        'body', 'Scope.',
        'proposalId', 'a6300000-0000-4000-8000-000000000004',
        'studioId', 'a6100000-0000-4000-8000-000000000001',
        'createdBy', 'a6000000-0000-4000-8000-000000000001',
        'note', 'keep me',
        'nested', jsonb_build_object(
          'studioId', 'a6100000-0000-4000-8000-000000000001',
          'client_id', 'a6000000-0000-4000-8000-000000000005',
          'deepNote', 'keep me too'),
        'arr', jsonb_build_array(jsonb_build_object(
          'clientId', 'a6000000-0000-4000-8000-000000000005',
          'created_at', '2026-01-01',
          'inArray', 'keep me three'))))));

  v_template := public.save_agreement_as_template(
    'a6300000-0000-4000-8000-000000000004', 'Stripped');

  -- Stripped on the way IN, so the template itself never holds them.
  ASSERT NOT (v_template.parts::text ~* '(proposalId|studioId|createdBy|client_id|clientId|created_at)'),
    format('the template snapshot still carries owner references: %s', v_template.parts);

  -- and stripped again on the way OUT.
  PERFORM public.materialize_agreement_template(
    'a6300000-0000-4000-8000-000000000002', v_template.template_key);

  SELECT ap.payload INTO v_payload FROM public.proposal_agreement_parts ap
  WHERE ap.proposal_id = 'a6300000-0000-4000-8000-000000000002'
    AND ap.part_key = 'patina.services';

  ASSERT NOT (v_payload::text ~* '(proposalId|studioId|createdBy|client_id|clientId|created_at)'),
    format('a materialized payload still carries owner references: %s', v_payload);
  ASSERT v_payload->>'note' = 'keep me', 'the designer''s own words must survive the scrub';
  ASSERT v_payload->'nested'->>'deepNote' = 'keep me too',
    'a NESTED object''s words must survive the scrub';
  ASSERT v_payload->'arr'->0->>'inArray' = 'keep me three',
    'an ARRAY ELEMENT''s words must survive the scrub';
  ASSERT v_payload->>'body' = 'Scope.', 'the clause body must survive the scrub';

  RAISE NOTICE 'PASS 6: owner references are stripped at every depth, in and out, and the words survive';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (7) Materialize replaces WHOLESALE and stamps where each part came from.
-- (8) A deleted Library part does not brick the template that names it.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_template public.agreement_templates%ROWTYPE;
  v_count integer;
  v_library_id uuid;
BEGIN
  PERFORM pg_temp.assume_user('a6000000-0000-4000-8000-000000000001');

  SELECT id INTO v_library_id FROM public.studio_agreement_parts
  WHERE studio_id = 'a6100000-0000-4000-8000-000000000001'
    AND part_key = 'studio.site_access';

  -- Two parts: one keyed to a LIBRARY row, one an inline patina.* body.
  PERFORM public.upsert_agreement_parts(
    'a6300000-0000-4000-8000-000000000004',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'clause', 'partKey', 'patina.services', 'title', 'Services',
        'payload', jsonb_build_object('body', 'Inline body.')),
      jsonb_build_object(
        'kind', 'clause', 'partKey', 'studio.site_access', 'title', 'Site access',
        'payload', jsonb_build_object('body', 'Access is arranged in writing.'))));

  v_template := public.save_agreement_as_template(
    'a6300000-0000-4000-8000-000000000004', 'Two-part');

  -- The target draft carries nine parts right now; materialize replaces them.
  ASSERT (SELECT count(*) FROM public.proposal_agreement_parts
          WHERE proposal_id = 'a6300000-0000-4000-8000-000000000002') = 1,
    'the target draft carries one part before this materialize';

  v_count := public.materialize_agreement_template(
    'a6300000-0000-4000-8000-000000000002', v_template.template_key);
  ASSERT v_count = 2, format('two parts must land, got %s', v_count);
  ASSERT (SELECT count(*) FROM public.proposal_agreement_parts
          WHERE proposal_id = 'a6300000-0000-4000-8000-000000000002') = 2,
    'materialize replaces the part set WHOLESALE — nothing older may survive';

  ASSERT (SELECT count(*) FROM public.proposal_agreement_parts
          WHERE proposal_id = 'a6300000-0000-4000-8000-000000000002'
            AND source_template_key = v_template.template_key) = 2,
    'every materialized part is stamped with the template it came from';
  ASSERT (SELECT source_part_id FROM public.proposal_agreement_parts
          WHERE proposal_id = 'a6300000-0000-4000-8000-000000000002'
            AND part_key = 'studio.site_access') = v_library_id,
    'a part resolved from the Library carries its source_part_id';
  ASSERT (SELECT source_part_id FROM public.proposal_agreement_parts
          WHERE proposal_id = 'a6300000-0000-4000-8000-000000000002'
            AND part_key = 'patina.services') IS NULL,
    'an inline body carries no source_part_id';

  RAISE NOTICE 'PASS 7: materialize replaces wholesale and stamps template and part provenance';

  -- (8) The studio deletes the Library part the template names.
  PERFORM pg_temp.assume_role('a6000000-0000-4000-8000-000000000001');
  DELETE FROM public.studio_agreement_parts WHERE id = v_library_id;
  PERFORM pg_temp.reset_role();
  ASSERT NOT EXISTS (SELECT 1 FROM public.studio_agreement_parts WHERE id = v_library_id),
    'an owner may delete their own Library part';

  PERFORM pg_temp.assume_user('a6000000-0000-4000-8000-000000000001');
  v_count := public.materialize_agreement_template(
    'a6300000-0000-4000-8000-000000000002', v_template.template_key);
  ASSERT v_count = 1,
    format('a deleted Library part is skipped, the rest lands, got %s', v_count);
  ASSERT (SELECT part_key FROM public.proposal_agreement_parts
          WHERE proposal_id = 'a6300000-0000-4000-8000-000000000002') = 'patina.services',
    'the inline entry survives a deleted Library reference';

  RAISE NOTICE 'PASS 8: a deleted Library part does not brick the template that names it';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (9) R6 — a template composes only into a DRAFT.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_template_key text;
  v_snapshot jsonb;
BEGIN
  SELECT template_key INTO v_template_key FROM public.agreement_templates
  WHERE kind = 'studio' AND title = 'Full-service residential';

  PERFORM pg_temp.assume_user('a6000000-0000-4000-8000-000000000001');
  v_snapshot := public.get_commercial_document_send_snapshot('a6300000-0000-4000-8000-000000000001');
  PERFORM public.send_commercial_document(
    'a6300000-0000-4000-8000-000000000001', v_snapshot->>'documentFingerprint',
    NULL, TIMESTAMPTZ '2027-06-01 00:00:00+00');

  BEGIN
    PERFORM public.materialize_agreement_template(
      'a6300000-0000-4000-8000-000000000001', v_template_key);
    RAISE EXCEPTION 'R6: a sent agreement must not be recomposed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  RAISE NOTICE 'PASS 9: R6 — a template composes only into a draft';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (11) THE TWO-STUDIO DESIGNER. R2 — a Template belongs to one studio, and so
--      does the agreement it lands in. Case (5) covers a stranger to studio A;
--      this covers the person the 00566 walk script singles out, who belongs
--      to BOTH studios and for whom every visibility predicate says yes.
--      Without materialize_agreement_template's studio check she can put
--      studio B's private paper on studio A's agreement.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('a6000000-0000-4000-8000-000000000006', 'al-both@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

SET LOCAL session_replication_role = replica;
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES ('a6000000-0000-4000-8000-000000000006', 'al-both@test.invalid',
        'Library Both', true, now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;
SET LOCAL session_replication_role = origin;

SELECT pg_temp.assume_user('a6000000-0000-4000-8000-000000000001', 'service_role');
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('a6110000-0000-4000-8000-000000000005', 'a6000000-0000-4000-8000-000000000006',
   'a6100000-0000-4000-8000-000000000001', 'admin', 'active', now()),
  ('a6110000-0000-4000-8000-000000000006', 'a6000000-0000-4000-8000-000000000006',
   'a6100000-0000-4000-8000-000000000002', 'admin', 'active', now());

INSERT INTO public.agreement_templates (
  template_key, kind, studio_id, class, title, parts, created_by
) VALUES (
  'studio.b1100000-0000-4000-8000-000000000002', 'studio',
  'a6100000-0000-4000-8000-000000000002', 'design_services',
  'Studio B private template',
  jsonb_build_array(jsonb_build_object(
    'partKey', 'patina.services', 'kind', 'clause', 'title', 'Studio B scope',
    'payload', jsonb_build_object('body', 'Studio B only.'),
    'required', true, 'clientVisible', true)),
  'a6000000-0000-4000-8000-000000000004');

DO $$
DECLARE
  v_studio_a_key text;
  v_landed integer;
BEGIN
  SELECT template_key INTO v_studio_a_key FROM public.agreement_templates
  WHERE kind = 'studio' AND studio_id = 'a6100000-0000-4000-8000-000000000001'
  LIMIT 1;

  -- She is an active member of both studios, so both Libraries are visible to
  -- her and agreement_templates_select says yes to studio B's row.
  PERFORM pg_temp.assume_role('a6000000-0000-4000-8000-000000000006');
  ASSERT (SELECT count(*) FROM public.agreement_templates
          WHERE template_key = 'studio.b1100000-0000-4000-8000-000000000002') = 1,
    'the two-studio member must be able to SEE studio B''s template';
  PERFORM pg_temp.reset_role();

  -- Studio A's agreement, composed by her. Studio B's Template must not land.
  PERFORM pg_temp.assume_user('a6000000-0000-4000-8000-000000000006');
  BEGIN
    PERFORM public.materialize_agreement_template(
      'a6300000-0000-4000-8000-000000000004',
      'studio.b1100000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'a Template from another studio must not compose into this agreement';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  ASSERT NOT EXISTS (
    SELECT 1 FROM public.proposal_agreement_parts
    WHERE proposal_id = 'a6300000-0000-4000-8000-000000000004'
      AND title = 'Studio B scope'),
    'studio B''s words must not be on studio A''s agreement';

  -- The positive control: her own studio's Template still composes.
  v_landed := public.materialize_agreement_template(
    'a6300000-0000-4000-8000-000000000004', v_studio_a_key);
  ASSERT v_landed > 0, 'studio A''s own template must still compose';

  -- And a seeded Template (studio_id IS NULL) is nobody's and everybody's.
  v_landed := public.materialize_agreement_template(
    'a6300000-0000-4000-8000-000000000004', 'patina.design_services');
  ASSERT v_landed > 0, 'a seeded template must still compose';

  RAISE NOTICE 'PASS 11: R2 — a Template from the other studio is refused for the member of both';
END $$;

ROLLBACK;
