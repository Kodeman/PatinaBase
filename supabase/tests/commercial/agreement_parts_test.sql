-- ═══════════════════════════════════════════════════════════════════════════
-- 00575 — The Agreement, composed: parts on today's agreement.
-- Runner: plain psql, ON_ERROR_STOP=1. Single transaction, ROLLBACK at the end.
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/commercial/agreement_parts_test.sql
--
-- What this file exists to prove:
--   (1)  materialize_standard_parts seeds nine parts in order, idempotently.
--   (2)  THE F-1 REGRESSION. The fingerprint's `parts` key is CONDITIONAL: a
--        document with no parts hashes byte-for-byte what it hashed before
--        00575, so every agreement sitting in 'client_signed' at apply time
--        stays countersignable. With parts, every field of every part is in
--        the hash and the timestamps are not.
--   (3)  R6. Parts freeze at SEND, through the same guard the terms row uses.
--   (4)  R4. An agreement that bills time needs a ceiling; one that does not
--        bill time may be uncapped, and an uncapped agreement sends, signs,
--        countersigns and reads back as uncapped rather than as exhausted (F-2).
--   (5)  A client never touches the parts table. Their only edge is the bundle,
--        which shows client-visible parts and nothing else.
--   (6)  The projection, the R4 floor and the send refusal all read the SAME
--        one rate part (patina.role_rates) — a rate card under another key
--        projects nothing and demands nothing.
--   (7)  F-2's fourth reader: a billable hour logged against an UNCAPPED
--        authority is authorized, not parked forever.
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

CREATE OR REPLACE FUNCTION pg_temp.fingerprint(p_id uuid) RETURNS text
LANGUAGE sql AS $$ SELECT public._commercial_document_fingerprint(p_id) $$;
GRANT EXECUTE ON FUNCTION pg_temp.fingerprint(uuid) TO PUBLIC;

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

-- ═══════════════════════════════════════════════════════════════════════════
-- (0) FIXTURE — one studio, its owner (the lead), one co-member, one outsider
--     who holds a studio of their own, and one client.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('a5000000-0000-4000-8000-000000000001', 'ap-lead@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a5000000-0000-4000-8000-000000000002', 'ap-comember@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a5000000-0000-4000-8000-000000000003', 'ap-outsider@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a5000000-0000-4000-8000-000000000004', 'ap-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

-- is_designer = true auto-provisions a personal studio (00295), which would
-- give the lead one more studio than this fixture states and make the
-- countersign's studio resolution ambiguous. Suppress provisioning.
SET LOCAL session_replication_role = replica;
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('a5000000-0000-4000-8000-000000000001', 'ap-lead@test.invalid', 'Agreement Lead', true, now(), now()),
  ('a5000000-0000-4000-8000-000000000002', 'ap-comember@test.invalid', 'Agreement Co-member', true, now(), now()),
  ('a5000000-0000-4000-8000-000000000003', 'ap-outsider@test.invalid', 'Agreement Outsider', true, now(), now()),
  ('a5000000-0000-4000-8000-000000000004', 'ap-client@test.invalid', 'Agreement Client', false, now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;
SET LOCAL session_replication_role = origin;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('a5100000-0000-4000-8000-000000000001', 'design_studio', 'Agreement Studio', 'agreement-parts-test', 'active'),
  ('a5100000-0000-4000-8000-000000000002', 'design_studio', 'Outside Studio', 'agreement-parts-outside-test', 'active');

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000001', 'service_role');
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('a5110000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001',
   'a5100000-0000-4000-8000-000000000001', 'owner', 'active', now() - interval '2 days'),
  ('a5110000-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-000000000002',
   'a5100000-0000-4000-8000-000000000001', 'member', 'active', now() - interval '1 day'),
  ('a5110000-0000-4000-8000-000000000003', 'a5000000-0000-4000-8000-000000000003',
   'a5100000-0000-4000-8000-000000000002', 'owner', 'active', now());

-- The countersign's origin branch requires the agreement's designer to hold a
-- designer-domain role.
INSERT INTO public.user_roles (user_id, role_id, granted_by)
SELECT designer.id, role.id, designer.id
FROM (VALUES
  ('a5000000-0000-4000-8000-000000000001'::uuid),
  ('a5000000-0000-4000-8000-000000000003'::uuid)
) AS designer(id)
CROSS JOIN public.roles AS role
WHERE role.name = 'studio_owner';

INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, status, source)
VALUES ('a5200000-0000-4000-8000-000000000001',
        'a5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000004',
        'Agreement Client', 'proposal', 'direct');

CREATE OR REPLACE FUNCTION pg_temp.mint_agreement(p_id uuid, p_title text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.proposals (
    id, designer_id, designer_client_id, client_id, title, description,
    total_amount, status, valid_until
  ) VALUES (
    p_id, 'a5000000-0000-4000-8000-000000000001',
    'a5200000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000004',
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

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_agreement('a5300000-0000-4000-8000-000000000001', 'The composed agreement');

-- ═══════════════════════════════════════════════════════════════════════════
-- (1) (2) materialize_standard_parts — nine parts, in order, idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_first jsonb;
  v_second jsonb;
  v_keys text[];
BEGIN
  v_first := public.materialize_standard_parts('a5300000-0000-4000-8000-000000000001');
  ASSERT (v_first->>'materialized')::boolean, 'first materialize must seed';
  ASSERT (v_first->>'partCount')::integer = 9,
    format('first materialize must seed nine parts, got %s', v_first->>'partCount');

  SELECT array_agg(ap.part_key ORDER BY ap.position) INTO v_keys
  FROM public.proposal_agreement_parts ap
  WHERE ap.proposal_id = 'a5300000-0000-4000-8000-000000000001';
  ASSERT v_keys = ARRAY[
    'patina.services', 'patina.deliverables', 'patina.exclusions',
    'patina.role_rates', 'patina.ceiling', 'patina.deposit',
    'patina.retainer', 'patina.cadence', 'patina.terms'
  ], format('PATINA_STANDARD_AGREEMENT_PARTS order drifted: %s', v_keys);

  ASSERT (SELECT array_agg(ap.position ORDER BY ap.position)
          FROM public.proposal_agreement_parts ap
          WHERE ap.proposal_id = 'a5300000-0000-4000-8000-000000000001')
         = ARRAY[1,2,3,4,5,6,7,8,9], 'positions must be 1..9 with no gaps';

  -- Seeded FROM the terms row, not from the literals, when a terms row exists.
  ASSERT (SELECT ap.payload->>'body' FROM public.proposal_agreement_parts ap
          WHERE ap.proposal_id = 'a5300000-0000-4000-8000-000000000001'
            AND ap.part_key = 'patina.services')
         = 'Whole-home interior design services.', 'services body must come from the terms row';
  ASSERT (SELECT (ap.payload->>'cents')::integer FROM public.proposal_agreement_parts ap
          WHERE ap.proposal_id = 'a5300000-0000-4000-8000-000000000001'
            AND ap.part_key = 'patina.ceiling') = 2400000, 'ceiling must come from the terms row';
  ASSERT (SELECT jsonb_array_length(ap.payload->'roles') FROM public.proposal_agreement_parts ap
          WHERE ap.proposal_id = 'a5300000-0000-4000-8000-000000000001'
            AND ap.part_key = 'patina.role_rates') = 1, 'the rate card must come from the rate rows';
  ASSERT (SELECT ap.required FROM public.proposal_agreement_parts ap
          WHERE ap.proposal_id = 'a5300000-0000-4000-8000-000000000001'
            AND ap.part_key = 'patina.terms'), 'terms is required';
  ASSERT NOT (SELECT ap.required FROM public.proposal_agreement_parts ap
          WHERE ap.proposal_id = 'a5300000-0000-4000-8000-000000000001'
            AND ap.part_key = 'patina.exclusions'), 'exclusions is removable (R4)';

  -- (2) Two tabs opening the room must not double-seed.
  v_second := public.materialize_standard_parts('a5300000-0000-4000-8000-000000000001');
  ASSERT NOT (v_second->>'materialized')::boolean, 'second materialize must be a no-op';
  ASSERT (v_second->>'partCount')::integer = 9, 'second materialize must report the existing nine';
  ASSERT (SELECT count(*) FROM public.proposal_agreement_parts
          WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001') = 9,
    'materialize must be idempotent';

  RAISE NOTICE 'PASS 1-2: nine standard parts, in order, seeded idempotently from the terms row';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (3)-(6) THE FINGERPRINT. Conditional on parts existing; total over the parts
--         that do; blind to their timestamps.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TEMP TABLE _ap_fp (label text PRIMARY KEY, digest text NOT NULL);

-- The parts-less digest, captured by deleting the nine parts we just seeded.
-- This is exactly what this document hashed before 00575 existed.
DELETE FROM public.proposal_agreement_parts
WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001';
INSERT INTO _ap_fp VALUES
  ('no_parts', pg_temp.fingerprint('a5300000-0000-4000-8000-000000000001'));

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
DO $$ BEGIN PERFORM public.materialize_standard_parts('a5300000-0000-4000-8000-000000000001'); END $$;

DO $$
DECLARE
  v_no_parts text := (SELECT digest FROM _ap_fp WHERE label = 'no_parts');
  v_base text;
  v_now text;
  v_target uuid;
  v_other uuid;
BEGIN
  v_base := pg_temp.fingerprint('a5300000-0000-4000-8000-000000000001');
  ASSERT v_base IS DISTINCT FROM v_no_parts,
    'a document WITH parts must not hash the same as one without';

  SELECT id INTO v_target FROM public.proposal_agreement_parts
  WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001' AND part_key = 'patina.services';
  SELECT id INTO v_other FROM public.proposal_agreement_parts
  WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001' AND part_key = 'patina.terms';

  -- (4) payload
  UPDATE public.proposal_agreement_parts SET payload = jsonb_build_object('body', 'Reworded.')
  WHERE id = v_target;
  v_now := pg_temp.fingerprint('a5300000-0000-4000-8000-000000000001');
  ASSERT v_now IS DISTINCT FROM v_base, 'a payload edit must move the digest';
  v_base := v_now;

  -- (5a) title
  UPDATE public.proposal_agreement_parts SET title = 'Scope of services' WHERE id = v_target;
  v_now := pg_temp.fingerprint('a5300000-0000-4000-8000-000000000001');
  ASSERT v_now IS DISTINCT FROM v_base, 'a title edit must move the digest';
  v_base := v_now;

  -- (5b) position — swap two, through the deferrable unique
  SET CONSTRAINTS uniq_agreement_part_position DEFERRED;
  UPDATE public.proposal_agreement_parts SET position = 999 WHERE id = v_target;
  UPDATE public.proposal_agreement_parts SET position = 1 WHERE id = v_other;
  UPDATE public.proposal_agreement_parts SET position = 9 WHERE id = v_target;
  v_now := pg_temp.fingerprint('a5300000-0000-4000-8000-000000000001');
  ASSERT v_now IS DISTINCT FROM v_base, 'a reorder must move the digest';
  v_base := v_now;

  -- (5c) client_visible
  UPDATE public.proposal_agreement_parts SET client_visible = false WHERE id = v_target;
  v_now := pg_temp.fingerprint('a5300000-0000-4000-8000-000000000001');
  ASSERT v_now IS DISTINCT FROM v_base,
    'client_visible is hashed — ALL parts are in the hash, not only visible ones (F-3)';
  v_base := v_now;
  UPDATE public.proposal_agreement_parts SET client_visible = true WHERE id = v_target;
  v_base := pg_temp.fingerprint('a5300000-0000-4000-8000-000000000001');

  -- (5d) adding a part
  INSERT INTO public.proposal_agreement_parts (
    proposal_id, position, kind, part_key, title, payload
  ) VALUES (
    'a5300000-0000-4000-8000-000000000001', 10, 'clause', 'custom.extra',
    'A studio clause', jsonb_build_object('body', 'Extra.')
  );
  v_now := pg_temp.fingerprint('a5300000-0000-4000-8000-000000000001');
  ASSERT v_now IS DISTINCT FROM v_base, 'adding a part must move the digest';
  v_base := v_now;

  -- (5e) deleting a part
  DELETE FROM public.proposal_agreement_parts
  WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001' AND part_key = 'custom.extra';
  v_now := pg_temp.fingerprint('a5300000-0000-4000-8000-000000000001');
  ASSERT v_now IS DISTINCT FROM v_base, 'removing a part must move the digest';
  v_base := v_now;

  -- (6) a bare timestamp touch is NOT the document changing
  UPDATE public.proposal_agreement_parts
  SET created_at = created_at - interval '1 hour', updated_at = now() + interval '1 hour'
  WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001';
  ASSERT pg_temp.fingerprint('a5300000-0000-4000-8000-000000000001') = v_base,
    'created_at / updated_at must be outside the hash';

  -- (3) THE F-1 REGRESSION: remove every part and the document hashes exactly
  -- what it hashed before 00575 ever ran.
  DELETE FROM public.proposal_agreement_parts
  WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001';
  ASSERT pg_temp.fingerprint('a5300000-0000-4000-8000-000000000001') = v_no_parts,
    'F-1: a parts-less document must hash byte-for-byte what it hashed before 00575';

  RAISE NOTICE 'PASS 3-6: the parts key is conditional, total, and blind to timestamps';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (13)-(15) RLS. Co-member reads and writes; outsider sees nothing and may
--           write nothing; the client never touches the table at all.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
DO $$ BEGIN PERFORM public.materialize_standard_parts('a5300000-0000-4000-8000-000000000001'); END $$;

DO $$
DECLARE v_seen integer; v_touched integer; v_err text;
BEGIN
  -- (13) the co-member is the studio
  PERFORM pg_temp.assume_role('a5000000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_seen FROM public.proposal_agreement_parts
  WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001';
  ASSERT v_seen = 9, format('a co-member must read all nine parts, saw %s', v_seen);
  UPDATE public.proposal_agreement_parts SET title = 'Services'
  WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001' AND part_key = 'patina.services';
  GET DIAGNOSTICS v_touched = ROW_COUNT;
  ASSERT v_touched = 1, 'a co-member must be able to edit a part';
  PERFORM pg_temp.reset_role();

  -- (14) the outsider is nobody
  PERFORM pg_temp.assume_role('a5000000-0000-4000-8000-000000000003');
  SELECT count(*) INTO v_seen FROM public.proposal_agreement_parts
  WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001';
  ASSERT v_seen = 0, format('an outsider must see no parts, saw %s', v_seen);
  -- Two independent walls stand between the outsider and this row, and the
  -- one that fires first is guard_commercial_authored_child: it is SECURITY
  -- INVOKER, so its own `proposals` read runs under the outsider's RLS, sees
  -- nothing, and refuses in the freeze guard's words before the parts table's
  -- WITH CHECK is ever evaluated. Either refusal is correct; what matters is
  -- that no row lands, so this asserts the refusal and not its errcode.
  BEGIN
    INSERT INTO public.proposal_agreement_parts (
      proposal_id, position, kind, part_key, title
    ) VALUES (
      'a5300000-0000-4000-8000-000000000001', 50, 'clause', 'custom.trespass', 'Trespass'
    );
    ASSERT false, 'an outsider must not be able to add a part';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err IS NOT NULL, 'the outsider INSERT must be refused';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.proposal_agreement_parts ap
    WHERE ap.part_key = 'custom.trespass'
  ), 'the outsider INSERT must leave no row behind';
  UPDATE public.proposal_agreement_parts SET title = 'Hijacked'
  WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_touched = ROW_COUNT;
  ASSERT v_touched = 0, 'an outsider UPDATE must reach no rows';
  DELETE FROM public.proposal_agreement_parts
  WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_touched = ROW_COUNT;
  ASSERT v_touched = 0, 'an outsider DELETE must reach no rows';
  PERFORM pg_temp.reset_role();

  -- (15) the client's edge is the bundle, never the table
  PERFORM pg_temp.assume_role('a5000000-0000-4000-8000-000000000004');
  SELECT count(*) INTO v_seen FROM public.proposal_agreement_parts
  WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001';
  ASSERT v_seen = 0, format('the client must see no parts on the raw table, saw %s', v_seen);
  PERFORM pg_temp.reset_role();

  ASSERT (SELECT count(*) FROM public.proposal_agreement_parts
          WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001') = 9,
    'the nine parts must still stand after the RLS probes';

  RAISE NOTICE 'PASS 13-15: the studio composes, the outsider cannot, the client reads elsewhere';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (7)-(8) R6 — parts are editable while draft and frozen at send.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE v_touched integer; v_err text;
BEGIN
  -- (8) while draft, all three ops land
  INSERT INTO public.proposal_agreement_parts (
    proposal_id, position, kind, part_key, title, payload
  ) VALUES (
    'a5300000-0000-4000-8000-000000000001', 10, 'clause', 'custom.draft_only',
    'Draft only', jsonb_build_object('body', 'Editable.')
  );
  UPDATE public.proposal_agreement_parts SET title = 'Still editable'
  WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001' AND part_key = 'custom.draft_only';
  GET DIAGNOSTICS v_touched = ROW_COUNT;
  ASSERT v_touched = 1, 'a draft part must be updatable';
  DELETE FROM public.proposal_agreement_parts
  WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001' AND part_key = 'custom.draft_only';
  GET DIAGNOSTICS v_touched = ROW_COUNT;
  ASSERT v_touched = 1, 'a draft part must be deletable';
END $$;

-- One part is studio-only, so the bundle projection below has something to omit.
UPDATE public.proposal_agreement_parts SET client_visible = false
WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001' AND part_key = 'patina.deposit';

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
SELECT pg_temp.send_agreement('a5300000-0000-4000-8000-000000000001');

DO $$
DECLARE v_err text; v_expected text := 'proposal_agreement_parts is immutable after its proposal leaves draft';
BEGIN
  v_err := NULL;
  BEGIN
    INSERT INTO public.proposal_agreement_parts (
      proposal_id, position, kind, part_key, title
    ) VALUES (
      'a5300000-0000-4000-8000-000000000001', 20, 'clause', 'custom.late', 'Too late'
    );
    ASSERT false, 'a part must not be addable after send';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = v_expected, format('late INSERT refusal: %L', v_err);

  v_err := NULL;
  BEGIN
    UPDATE public.proposal_agreement_parts SET title = 'Rewritten'
    WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001' AND part_key = 'patina.services';
    ASSERT false, 'a part must not be editable after send';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = v_expected, format('late UPDATE refusal: %L', v_err);

  v_err := NULL;
  BEGIN
    DELETE FROM public.proposal_agreement_parts
    WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001' AND part_key = 'patina.services';
    ASSERT false, 'a part must not be removable after send';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = v_expected, format('late DELETE refusal: %L', v_err);

  RAISE NOTICE 'PASS 7-8: parts move freely while draft and freeze at send (R6)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (16) The client's copy: client-visible parts in order, and nothing else.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000004');
DO $$
DECLARE v_bundle jsonb; v_parts jsonb; v_keys text[];
BEGIN
  v_bundle := public.get_client_commercial_document_bundle('a5300000-0000-4000-8000-000000000001');
  v_parts := v_bundle->'parts';
  ASSERT jsonb_typeof(v_parts) = 'array', 'the bundle must always carry a parts array';
  ASSERT jsonb_array_length(v_parts) = 8,
    format('only the eight client-visible parts may cross the edge, got %s',
           jsonb_array_length(v_parts));

  SELECT array_agg(part->>'partKey' ORDER BY ord) INTO v_keys
  FROM jsonb_array_elements(v_parts) WITH ORDINALITY AS e(part, ord);
  ASSERT NOT ('patina.deposit' = ANY(v_keys)), 'a studio-only part must not reach the client';
  ASSERT v_keys[1] = 'patina.services', 'the client reads the designer''s order';

  ASSERT NOT (v_parts->0 ? 'sourceTemplateKey'), 'sourceTemplateKey must not cross the client edge';
  ASSERT NOT (v_parts->0 ? 'sourcePartId'), 'sourcePartId must not cross the client edge';
  ASSERT NOT (v_parts->0 ? 'clientVisible'), 'clientVisible must not cross the client edge';
  ASSERT NOT (v_parts->0 ? 'createdAt'), 'timestamps must not cross the client edge';
  ASSERT v_parts->0 ? 'payload' AND v_parts->0 ? 'title' AND v_parts->0 ? 'required',
    'the client needs each part''s title, payload and required flag';

  RAISE NOTICE 'PASS 16: the bundle projects client-visible parts, enumerated keys only (R8)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (9)-(11) R4 AT THE DB FLOOR, and the uncapped agreement that sends.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_agreement('a5300000-0000-4000-8000-000000000002', 'The flat-fee agreement');

DO $$
DECLARE v_err text; v_result jsonb;
BEGIN
  -- (9) a rate card with no ceiling is refused
  BEGIN
    PERFORM public.upsert_agreement_parts(
      'a5300000-0000-4000-8000-000000000002',
      jsonb_build_array(
        jsonb_build_object('kind', 'clause', 'partKey', 'patina.services',
          'title', 'Services', 'required', true,
          'payload', jsonb_build_object('body', 'Design services.')),
        jsonb_build_object('kind', 'schedule', 'variant', 'rate_card',
          'partKey', 'patina.role_rates', 'title', 'Role rates',
          'payload', jsonb_build_object('roles', jsonb_build_array(
            jsonb_build_object('roleName', 'Lead Designer', 'hourlyRateCents', 15000, 'sortOrder', 0)))),
        jsonb_build_object('kind', 'clause', 'partKey', 'patina.terms',
          'title', 'Terms', 'required', true,
          'payload', jsonb_build_object('body', 'Actual hours.'))
      )
    );
    ASSERT false, 'a rate card with no ceiling must be refused';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'an agreement that bills time needs a ceiling',
    format('R4 floor refusal: %L', v_err);
  ASSERT (SELECT count(*) FROM public.proposal_agreement_parts
          WHERE proposal_id = 'a5300000-0000-4000-8000-000000000002') = 0,
    'a refused upsert must leave no parts behind';

  -- (10) no rate card and no ceiling: uncapped, and that is legal
  v_result := public.upsert_agreement_parts(
    'a5300000-0000-4000-8000-000000000002',
    jsonb_build_array(
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.services',
        'title', 'Services', 'required', true,
        'payload', jsonb_build_object('body', 'A fixed scope, for a fixed fee.')),
      jsonb_build_object('kind', 'schedule', 'variant', 'flat',
        'partKey', 'custom.flat_fee', 'title', 'Fee',
        'payload', jsonb_build_object('cents', 1100000)),
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.terms',
        'title', 'Terms', 'required', true,
        'payload', jsonb_build_object('body', 'Payable on the agreed cadence.'))
    )
  );
  ASSERT (v_result->>'partCount')::integer = 3, 'the flat agreement carries three parts';
  ASSERT (SELECT t.billing_ceiling_cents FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a5300000-0000-4000-8000-000000000002') IS NULL,
    'a removed ceiling part means UNCAPPED, not zero-capped';
  ASSERT (SELECT count(*) FROM public.proposal_service_rates
          WHERE proposal_id = 'a5300000-0000-4000-8000-000000000002') = 0,
    'a flat agreement projects no role rates';
  -- R5: the flat schedule is recorded, and writes nothing to the money row.
  ASSERT (SELECT t.scope FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a5300000-0000-4000-8000-000000000002')
         = 'A fixed scope, for a fixed fee.', 'the services clause projects the scope';

  RAISE NOTICE 'PASS 9-10: R4 holds at the DB floor, and an uncapped agreement is legal';
END $$;

-- (11) and it sends: refusal A no longer asks for rates it has no reason to want
SELECT pg_temp.send_agreement('a5300000-0000-4000-8000-000000000002');
DO $$
BEGIN
  ASSERT (SELECT commercial_state FROM public.proposals
          WHERE id = 'a5300000-0000-4000-8000-000000000002') = 'sent',
    'an uncapped, rate-less agreement must be sendable';
  RAISE NOTICE 'PASS 11: refusal A relaxed — a flat-fee agreement leaves the studio';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (12) THE LEGACY CONTRACT IS UNMOVED. A document with NO parts and no rates
--      still refuses to send, in the same words, for the same reason.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.mint_agreement('a5300000-0000-4000-8000-000000000003', 'The bare agreement');
DELETE FROM public.proposal_service_rates
WHERE proposal_id = 'a5300000-0000-4000-8000-000000000003';

DO $$
DECLARE v_err text;
BEGIN
  ASSERT (SELECT count(*) FROM public.proposal_agreement_parts
          WHERE proposal_id = 'a5300000-0000-4000-8000-000000000003') = 0,
    'the bare fixture must carry no parts';
  ASSERT public._agreement_requires_rate_card('a5300000-0000-4000-8000-000000000003'),
    'a parts-less document still owes a rate card';
  BEGIN
    PERFORM pg_temp.send_agreement('a5300000-0000-4000-8000-000000000003');
    ASSERT false, 'a parts-less, rate-less document must not send';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'design-services send requires terms, and role rates whenever a rate card is present',
    format('bare-send refusal: %L', v_err);
  RAISE NOTICE 'PASS 12: the legacy contract holds for every document authored before parts';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (18)-(19) F-2 — an uncapped agreement countersigns, and reads back uncapped
--           rather than exhausted.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_signed jsonb;
  v_executed jsonb;
  v_authority public.project_billing_authorities%ROWTYPE;
  v_summary jsonb;
BEGIN
  PERFORM pg_temp.assume_role('a5000000-0000-4000-8000-000000000004');
  v_signed := public.sign_design_services_agreement(
    'a5300000-0000-4000-8000-000000000002', 'Agreement Client');
  PERFORM pg_temp.reset_role();
  ASSERT (v_signed->>'newlyClientSigned')::boolean,
    format('refusal B relaxed: an uncapped agreement must be signable: %s', v_signed);

  PERFORM pg_temp.assume_role('a5000000-0000-4000-8000-000000000001');
  v_executed := public.countersign_design_services_agreement(
    'a5300000-0000-4000-8000-000000000002', 'Agreement Lead');
  PERFORM pg_temp.reset_role();
  ASSERT (v_executed->>'newlyExecuted')::boolean,
    format('F-2: an uncapped agreement must countersign without a 23502: %s', v_executed);

  SELECT * INTO v_authority FROM public.project_billing_authorities
  WHERE id = (v_executed->>'billingAuthorityId')::uuid;
  ASSERT v_authority.id IS NOT NULL, 'countersign must land a billing authority';
  ASSERT v_authority.billing_ceiling_cents IS NULL,
    'the authority snapshots the NULL ceiling as NULL, not as zero';
  ASSERT v_authority.status = 'active',
    format('an uncapped authority is active, got %L', v_authority.status);

  -- (19) and the read surface says uncapped, not exhausted
  PERFORM pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
  v_summary := public.get_project_authority_summary((v_executed->>'projectId')::uuid);
  ASSERT v_summary->>'state' IS DISTINCT FROM 'exhausted',
    format('an uncapped authority must not read as exhausted, got %L', v_summary->>'state');
  ASSERT jsonb_typeof(v_summary->'remainingCents') = 'null',
    format('remainingCents must be null on an uncapped authority, got %s', v_summary->'remainingCents');
  ASSERT jsonb_typeof(v_summary->'ceilingCents') = 'null',
    format('ceilingCents must be null on an uncapped authority, got %s', v_summary->'ceilingCents');

  RAISE NOTICE 'PASS 18-19: NULL is uncapped end to end — countersign, authority, summary';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (20) THE F-1 REGRESSION AT FULL LENGTH. A document sent and client-signed
--      with no parts at all — the shape of every agreement in flight when
--      00575 applies — still countersigns.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_agreement('a5300000-0000-4000-8000-000000000004', 'The in-flight agreement');
SELECT pg_temp.send_agreement('a5300000-0000-4000-8000-000000000004');

DO $$
DECLARE v_signed jsonb; v_executed jsonb; v_err text;
BEGIN
  PERFORM pg_temp.assume_role('a5000000-0000-4000-8000-000000000004');
  v_signed := public.sign_design_services_agreement(
    'a5300000-0000-4000-8000-000000000004', 'Agreement Client');
  PERFORM pg_temp.reset_role();
  ASSERT (v_signed->>'newlyClientSigned')::boolean, 'the in-flight agreement must be signable';

  -- Parts cannot be introduced after send — the guard says so — so the
  -- signature's evidence and the countersign's recomputation must agree.
  PERFORM pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
  BEGIN
    PERFORM public.materialize_standard_parts('a5300000-0000-4000-8000-000000000004');
    ASSERT false, 'a sent agreement must not be materializable';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err IS NOT NULL, 'materialize must refuse a document that has left draft';

  PERFORM pg_temp.assume_role('a5000000-0000-4000-8000-000000000001');
  v_executed := public.countersign_design_services_agreement(
    'a5300000-0000-4000-8000-000000000004', 'Agreement Lead');
  PERFORM pg_temp.reset_role();
  ASSERT (v_executed->>'newlyExecuted')::boolean,
    format('F-1: a parts-less client-signed agreement must still countersign: %s', v_executed);

  RAISE NOTICE 'PASS 20: nothing in flight is broken by the conditional parts key';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (17) studio_agreement_defaults — every member reads, owners and admins write.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE v_seen integer; v_touched integer;
BEGIN
  -- The owner writes.
  PERFORM pg_temp.assume_role('a5000000-0000-4000-8000-000000000001');
  INSERT INTO public.studio_agreement_defaults (
    studio_id, rate_card, deposit_percent, cadence, retainer_credit_rule,
    default_exclusions, updated_by
  ) VALUES (
    'a5100000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'roleName', 'Principal', 'hourlyRateCents', 22500, 'sortOrder', 0)),
    40, 'biweekly', 'non_refundable',
    jsonb_build_array('Permit fees'),
    'a5000000-0000-4000-8000-000000000001'
  );
  PERFORM pg_temp.reset_role();

  -- Every active member reads.
  PERFORM pg_temp.assume_role('a5000000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_seen FROM public.studio_agreement_defaults
  WHERE studio_id = 'a5100000-0000-4000-8000-000000000001';
  ASSERT v_seen = 1, format('an active member must read the studio defaults, saw %s', v_seen);

  -- A plain member does not write.
  UPDATE public.studio_agreement_defaults SET cadence = 'monthly'
  WHERE studio_id = 'a5100000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_touched = ROW_COUNT;
  ASSERT v_touched = 0, 'a plain member must not be able to change the studio defaults';
  PERFORM pg_temp.reset_role();

  -- An outsider reads nothing.
  PERFORM pg_temp.assume_role('a5000000-0000-4000-8000-000000000003');
  SELECT count(*) INTO v_seen FROM public.studio_agreement_defaults
  WHERE studio_id = 'a5100000-0000-4000-8000-000000000001';
  ASSERT v_seen = 0, format('an outsider must read no studio defaults, saw %s', v_seen);
  PERFORM pg_temp.reset_role();

  ASSERT (SELECT cadence FROM public.studio_agreement_defaults
          WHERE studio_id = 'a5100000-0000-4000-8000-000000000001') = 'biweekly',
    'the owner''s write must still stand';

  RAISE NOTICE 'PASS 17: studio agreement defaults — members read, owners and admins write (R3)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (21) The defaults feed a fresh agreement's parts when the document is silent.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, description,
  total_amount, status, valid_until
) VALUES (
  'a5300000-0000-4000-8000-000000000005',
  'a5000000-0000-4000-8000-000000000001', 'a5200000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000004', 'The untouched draft', 'No terms row yet.',
  0, 'draft', DATE '2027-06-01'
);

DO $$
DECLARE v_result jsonb;
BEGIN
  v_result := public.materialize_standard_parts('a5300000-0000-4000-8000-000000000005');
  ASSERT (v_result->>'materialized')::boolean, 'a bare draft must materialize';
  ASSERT (SELECT ap.payload->>'cadence' FROM public.proposal_agreement_parts ap
          WHERE ap.proposal_id = 'a5300000-0000-4000-8000-000000000005'
            AND ap.part_key = 'patina.cadence') = 'biweekly',
    'the studio default cadence must seed the cadence part';
  ASSERT (SELECT (ap.payload->>'depositPercent')::numeric FROM public.proposal_agreement_parts ap
          WHERE ap.proposal_id = 'a5300000-0000-4000-8000-000000000005'
            AND ap.part_key = 'patina.deposit') = 40,
    'the studio default deposit must seed the deposit part';
  ASSERT (SELECT ap.payload->>'creditRule' FROM public.proposal_agreement_parts ap
          WHERE ap.proposal_id = 'a5300000-0000-4000-8000-000000000005'
            AND ap.part_key = 'patina.retainer') = 'non_refundable',
    'the studio default credit rule must ride on the retainer part (stored W1, projected W2)';
  ASSERT (SELECT ap.payload->'items'->0->>'text' FROM public.proposal_agreement_parts ap
          WHERE ap.proposal_id = 'a5300000-0000-4000-8000-000000000005'
            AND ap.part_key = 'patina.exclusions') = 'Permit fees',
    'the studio default exclusions must seed the exclusions part';
  ASSERT (SELECT ap.payload->'roles'->0->>'roleName' FROM public.proposal_agreement_parts ap
          WHERE ap.proposal_id = 'a5300000-0000-4000-8000-000000000005'
            AND ap.part_key = 'patina.role_rates') = 'Principal',
    'the studio default rate card must seed the role rates part';
  -- The Patina literal stands where the studio has said nothing.
  ASSERT (SELECT ap.payload->>'body' FROM public.proposal_agreement_parts ap
          WHERE ap.proposal_id = 'a5300000-0000-4000-8000-000000000005'
            AND ap.part_key = 'patina.services')
         = 'Interior design services, including concept development, design documentation, and selections.',
    'the Patina scope sentence must match the seven-facet room''s literal exactly';
  ASSERT (SELECT jsonb_typeof(ap.payload->'cents') FROM public.proposal_agreement_parts ap
          WHERE ap.proposal_id = 'a5300000-0000-4000-8000-000000000005'
            AND ap.part_key = 'patina.ceiling') = 'null',
    'an untouched draft invents no ceiling';

  RAISE NOTICE 'PASS 21: studio defaults, then Patina literals — in that order (P3)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (22) A RATE CARD UNDER A NON-STANDARD KEY. The projection reads exactly one
--      rate part (patina.role_rates), so _agreement_requires_rate_card must
--      read the same one — otherwise the document owes role rates that nothing
--      will ever project, and it can never be sent.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_agreement('a5300000-0000-4000-8000-000000000006', 'The trade-rate agreement');

DO $$
BEGIN
  PERFORM public.upsert_agreement_parts(
    'a5300000-0000-4000-8000-000000000006',
    jsonb_build_array(
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.services',
        'title', 'Services', 'required', true,
        'payload', jsonb_build_object('body', 'A fixed scope, for a fixed fee.')),
      -- A rate card the studio keeps for its own reference, under its own key.
      jsonb_build_object('kind', 'schedule', 'variant', 'rate_card',
        'partKey', 'custom.trade_rates', 'title', 'Trade rates',
        'payload', jsonb_build_object('roles', jsonb_build_array(
          jsonb_build_object('roleName', 'Millworker', 'hourlyRateCents', 12500, 'sortOrder', 0)))),
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.terms',
        'title', 'Terms', 'required', true,
        'payload', jsonb_build_object('body', 'Payable on the agreed cadence.'))
    )
  );

  ASSERT (SELECT count(*) FROM public.proposal_service_rates
          WHERE proposal_id = 'a5300000-0000-4000-8000-000000000006') = 0,
    'a rate card under a custom key projects no role rates (R5)';
  ASSERT (SELECT t.billing_ceiling_cents FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a5300000-0000-4000-8000-000000000006') IS NULL,
    'the R4 floor must not demand a ceiling for rates that never project';
  ASSERT NOT public._agreement_requires_rate_card('a5300000-0000-4000-8000-000000000006'),
    'the refusal and the projection must read the same one part';
END $$;

SELECT pg_temp.send_agreement('a5300000-0000-4000-8000-000000000006');
DO $$
BEGIN
  ASSERT (SELECT commercial_state FROM public.proposals
          WHERE id = 'a5300000-0000-4000-8000-000000000006') = 'sent',
    'an agreement whose only rate card is a custom part must still be sendable';
  RAISE NOTICE 'PASS 22: projection, R4 floor and send refusal all read patina.role_rates';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (23) F-2's FOURTH READER. classify_project_time_entry_authority decides, on
--      every logged hour, whether that hour is authorized. On an UNCAPPED
--      authority its comparison used to evaluate to NULL, which parked every
--      billable hour in 'pending_authorization' forever — a project that looks
--      healthy and bills nothing.
--
--      The uncapped-with-rates state is reached the way a studio reaches it:
--      the terms row is studio-writable while the document is a draft
--      (proposal_service_terms_studio_rw, 00412:318), so the ceiling is
--      cleared there and then the document is sent, signed and countersigned.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_agreement('a5300000-0000-4000-8000-000000000007', 'The uncapped hourly agreement');

DO $$
DECLARE v_touched integer;
BEGIN
  PERFORM pg_temp.assume_role('a5000000-0000-4000-8000-000000000001');
  UPDATE public.proposal_service_terms SET billing_ceiling_cents = NULL
  WHERE proposal_id = 'a5300000-0000-4000-8000-000000000007';
  GET DIAGNOSTICS v_touched = ROW_COUNT;
  PERFORM pg_temp.reset_role();
  ASSERT v_touched = 1, 'the studio may clear the ceiling on its own draft';
  ASSERT (SELECT count(*) FROM public.proposal_service_rates
          WHERE proposal_id = 'a5300000-0000-4000-8000-000000000007') = 1,
    'the uncapped agreement still carries its role rate';
END $$;

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
SELECT pg_temp.send_agreement('a5300000-0000-4000-8000-000000000007');

DO $$
DECLARE
  v_signed jsonb;
  v_executed jsonb;
  v_project_id uuid;
  v_authority public.project_billing_authorities%ROWTYPE;
  v_state text;
  v_summary jsonb;
BEGIN
  PERFORM pg_temp.assume_role('a5000000-0000-4000-8000-000000000004');
  v_signed := public.sign_design_services_agreement(
    'a5300000-0000-4000-8000-000000000007', 'Agreement Client');
  PERFORM pg_temp.reset_role();
  ASSERT (v_signed->>'newlyClientSigned')::boolean,
    format('the uncapped hourly agreement must be signable: %s', v_signed);

  PERFORM pg_temp.assume_role('a5000000-0000-4000-8000-000000000001');
  v_executed := public.countersign_design_services_agreement(
    'a5300000-0000-4000-8000-000000000007', 'Agreement Lead');
  PERFORM pg_temp.reset_role();
  ASSERT (v_executed->>'newlyExecuted')::boolean,
    format('the uncapped hourly agreement must countersign: %s', v_executed);

  v_project_id := (v_executed->>'projectId')::uuid;
  SELECT * INTO v_authority FROM public.project_billing_authorities
  WHERE id = (v_executed->>'billingAuthorityId')::uuid;
  ASSERT v_authority.billing_ceiling_cents IS NULL,
    'the authority snapshots the cleared ceiling as NULL';
  ASSERT EXISTS (SELECT 1 FROM public.project_billing_authority_rates
                 WHERE billing_authority_id = v_authority.id),
    'the uncapped authority carries the role rate the hour will bind to';

  -- THE REGRESSION. One billable hour, logged by the lead, on an authority
  -- with no ceiling. Before 00575's classifier delta this landed
  -- 'pending_authorization' and never left it.
  INSERT INTO public.project_time_entries (
    id, project_id, user_id, started_at, duration_minutes, billable, activity
  ) VALUES (
    'a5400000-0000-4000-8000-000000000001', v_project_id,
    'a5000000-0000-4000-8000-000000000001',
    TIMESTAMPTZ '2027-06-02 15:00:00+00', 60, true, 'design'
  );
  SELECT billing_state INTO v_state FROM public.project_time_entries
  WHERE id = 'a5400000-0000-4000-8000-000000000001';
  ASSERT v_state = 'authorized', format(
    'F-2: NULL is uncapped — a billable hour on an uncapped authority is authorized, got %L',
    v_state);
  ASSERT (SELECT rated_amount_cents FROM public.project_time_entries
          WHERE id = 'a5400000-0000-4000-8000-000000000001') = 15000,
    'the hour still rates against the signed role rate';

  PERFORM pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
  v_summary := public.get_project_authority_summary(v_project_id);
  ASSERT (v_summary->>'accruedCents')::bigint = 15000,
    format('the authorized hour accrues, got %s', v_summary->'accruedCents');
  ASSERT (v_summary->>'pendingAuthorizationCents')::bigint = 0,
    format('nothing is parked on an uncapped authority, got %s',
           v_summary->'pendingAuthorizationCents');
  ASSERT v_summary->>'state' = 'active',
    format('an uncapped authority with time on it is active, got %L', v_summary->>'state');

  -- And a ceiling that EXISTS still binds: the delta relaxed nothing else.
  UPDATE public.project_billing_authorities SET billing_ceiling_cents = 1
  WHERE id = v_authority.id;
  INSERT INTO public.project_time_entries (
    id, project_id, user_id, started_at, duration_minutes, billable, activity
  ) VALUES (
    'a5400000-0000-4000-8000-000000000002', v_project_id,
    'a5000000-0000-4000-8000-000000000001',
    TIMESTAMPTZ '2027-06-03 15:00:00+00', 60, true, 'design'
  );
  SELECT billing_state INTO v_state FROM public.project_time_entries
  WHERE id = 'a5400000-0000-4000-8000-000000000002';
  ASSERT v_state = 'pending_authorization', format(
    'a real ceiling still parks the hour that exceeds it, got %L', v_state);

  RAISE NOTICE 'PASS 23: an uncapped authority authorizes its hours; a cap still caps';
END $$;

ROLLBACK;
