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
--   (5)  A client never touches the parts table, and neither does the studio:
--        the table grants SELECT and the RPC is the only write door (N4).
--        The client's edge is the bundle, client-visible parts and no more.
--   (6)  N1. MONEY IS READ BY SHAPE, NOT BY KEY. The composer mints
--        `custom.<uuid>` for every part added from the rail, so the
--        projection, the R4 floor and the send refusal all read kind +
--        variant under whatever key the composition gave them — and one of
--        each money shape, so the money row never picks between two.
--   (7)  N3. R4's floor is the same height at every door OUT OF DRAFT — send,
--        sign, the paper issue — and is asked at neither of the doors that
--        merely write a draft (the parts write, the seeding). A draft is
--        allowed to be unfinished.
--   (8)  F-2's fourth reader: a billable hour logged against an UNCAPPED
--        authority is authorized, not parked forever.
--   (9)  R21. The floor asks its question over TWO scopes and refuses on
--        either: the parts the homeowner reads (a cap on no page she signs
--        caps nothing) and every part (a rate card she never sees still
--        reaches the authority). Probes C1 and C2.
--   (10) N-8. The composing door opens both ways. Merely opening the room
--        composes the draft; discard_agreement_parts takes it back, moves no
--        money, and restores the fingerprint and the flag-off door.
--   (11) The save hands back the rows it wrote, re-keyed, in order.
--   (12) B-7 / B-8. Composing a RETIRED agreement widens its kind the way
--        saving does, and the retired bundle answers the `parts` key too.
--   (13) B-9. A rate carries the date it took effect through the parts door,
--        so a back-dated rate is not re-stamped to today by merely opening
--        the room.
--   (14) R3-5. A furnishings deposit nobody set is not seeded as a term of
--        the agreement the homeowner signs.
--   (15) R22. R4's OTHER half: an agreement that bills has to name a fee on
--        the page the homeowner reads. Reviewer probes R3 (prose only) and Q5
--        (a rate card and a ceiling both kept from the client) save, and then
--        refuse at the send door and the paper door; a ceiling is not a fee.
--   (16) R28. No AMOUNT the designer did not type is seeded as a term: a
--        retainer of 0 was invented for a draft with no terms row. The
--        cadence is not an amount and carries what its editor shows.
--   (17) R25. The bundle says `composed` itself, read over EVERY part — the
--        client shell cannot count it off an array filtered to what she sees.
--   (18) M4. The paper door the studio is offered can open: a composed
--        flat-fee agreement, which carries no role rate at all, records the
--        homeowner's printed signature.
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
-- (13)-(15) RLS AND GRANTS. The co-member READS the table and writes it only
--           through the RPC; the outsider reaches nothing at all; the client
--           never touches the table.
--
--           N4: the write grant is withheld from `authenticated` on purpose.
--           The money projection and the document fingerprint both live
--           INSIDE upsert_agreement_parts, so a direct UPDATE would move the
--           figure the client signs on the rendered page without moving the
--           figure countersign snapshots into the billing authority — two
--           parties bound to different numbers, refused by nothing.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
DO $$ BEGIN PERFORM public.materialize_standard_parts('a5300000-0000-4000-8000-000000000001'); END $$;

DO $$
DECLARE v_seen integer; v_touched integer; v_err text; v_ceiling integer; v_digest text;
BEGIN
  -- (13) the co-member is the studio: it reads every part …
  PERFORM pg_temp.assume_role('a5000000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_seen FROM public.proposal_agreement_parts
  WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001';
  ASSERT v_seen = 9, format('a co-member must read all nine parts, saw %s', v_seen);
  PERFORM pg_temp.reset_role();

  -- … and writes none of them directly. THE N4 PROBE: the ceiling part edited
  -- straight on the table would have moved the digest and left the money row
  -- holding the old figure.
  v_ceiling := (SELECT t.billing_ceiling_cents FROM public.proposal_service_terms t
                WHERE t.proposal_id = 'a5300000-0000-4000-8000-000000000001');
  v_digest := pg_temp.fingerprint('a5300000-0000-4000-8000-000000000001');

  PERFORM pg_temp.assume_role('a5000000-0000-4000-8000-000000000002');
  v_err := NULL;
  BEGIN
    UPDATE public.proposal_agreement_parts
    SET payload = jsonb_build_object('cents', 99000000)
    WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001'
      AND part_key = 'patina.ceiling';
    ASSERT false, 'a co-member must not be able to edit a part directly';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err IS NOT NULL, 'the direct co-member UPDATE must be refused';

  v_err := NULL;
  BEGIN
    INSERT INTO public.proposal_agreement_parts (
      proposal_id, position, kind, part_key, title
    ) VALUES (
      'a5300000-0000-4000-8000-000000000001', 60, 'clause', 'custom.sideload', 'Sideload'
    );
    ASSERT false, 'a co-member must not be able to add a part directly';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err IS NOT NULL, 'the direct co-member INSERT must be refused';

  v_err := NULL;
  BEGIN
    DELETE FROM public.proposal_agreement_parts
    WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001'
      AND part_key = 'patina.exclusions';
    ASSERT false, 'a co-member must not be able to remove a part directly';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err IS NOT NULL, 'the direct co-member DELETE must be refused';
  PERFORM pg_temp.reset_role();

  ASSERT pg_temp.fingerprint('a5300000-0000-4000-8000-000000000001') = v_digest,
    'N4: no direct write may move the digest the client signs';
  ASSERT (SELECT t.billing_ceiling_cents FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a5300000-0000-4000-8000-000000000001')
         IS NOT DISTINCT FROM v_ceiling,
    'N4: the money row is unmoved because nothing was written';
  ASSERT (SELECT count(*) FROM public.proposal_agreement_parts
          WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001') = 9,
    'the nine parts stand exactly as the RPC left them';

  -- The RPC is the door, and it is open to the same co-member.
  PERFORM pg_temp.assume_role('a5000000-0000-4000-8000-000000000002');
  PERFORM public.upsert_agreement_parts(
    'a5300000-0000-4000-8000-000000000001',
    (SELECT jsonb_agg(jsonb_build_object(
       'kind', ap.kind, 'variant', ap.variant, 'partKey', ap.part_key,
       'title', CASE WHEN ap.part_key = 'patina.services' THEN 'Services' ELSE ap.title END,
       'payload', ap.payload, 'required', ap.required,
       'clientVisible', ap.client_visible
     ) ORDER BY ap.position)
     FROM public.proposal_agreement_parts ap
     WHERE ap.proposal_id = 'a5300000-0000-4000-8000-000000000001')
  );
  PERFORM pg_temp.reset_role();
  ASSERT (SELECT ap.title FROM public.proposal_agreement_parts ap
          WHERE ap.proposal_id = 'a5300000-0000-4000-8000-000000000001'
            AND ap.part_key = 'patina.services') = 'Services',
    'a co-member composes through the RPC';

  -- (14) the outsider is nobody
  PERFORM pg_temp.assume_role('a5000000-0000-4000-8000-000000000003');
  SELECT count(*) INTO v_seen FROM public.proposal_agreement_parts
  WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001';
  ASSERT v_seen = 0, format('an outsider must see no parts, saw %s', v_seen);
  -- Three independent walls now stand between the outsider and this row — the
  -- withheld grant, the RLS policy, and guard_commercial_authored_child. What
  -- matters is that no row lands, so this asserts the refusal, not its code.
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
  v_err := NULL;
  BEGIN
    UPDATE public.proposal_agreement_parts SET title = 'Hijacked'
    WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001';
    GET DIAGNOSTICS v_touched = ROW_COUNT;
    ASSERT v_touched = 0, 'an outsider UPDATE must reach no rows';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  v_err := NULL;
  BEGIN
    DELETE FROM public.proposal_agreement_parts
    WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001';
    GET DIAGNOSTICS v_touched = ROW_COUNT;
    ASSERT v_touched = 0, 'an outsider DELETE must reach no rows';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
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

  RAISE NOTICE 'PASS 13-15: the studio composes through the RPC only, the outsider not at all, the client reads elsewhere';
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
  -- (9) a rate card with no ceiling SAVES — a draft is allowed to be
  -- unfinished — and does not leave draft. The floor is asked at the doors
  -- out of draft and nowhere else: a composition refused at Save could never
  -- be composed at all, because the ceiling is typed into a draft that has to
  -- be saveable first (walk r1, B1).
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
  ASSERT (SELECT count(*) FROM public.proposal_agreement_parts
          WHERE proposal_id = 'a5300000-0000-4000-8000-000000000002') = 3,
    'an unfinished draft saves';
  ASSERT public._agreement_floor_unmet('a5300000-0000-4000-8000-000000000002'),
    'and it is below the floor while it stands there';
  BEGIN
    PERFORM pg_temp.send_agreement('a5300000-0000-4000-8000-000000000002');
    ASSERT false, 'a rate card with no ceiling must not leave draft';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'an agreement that bills time needs a ceiling',
    format('R4 floor refusal at the door out of draft: %L', v_err);
  ASSERT (SELECT commercial_state FROM public.proposals
          WHERE id = 'a5300000-0000-4000-8000-000000000002') = 'draft',
    'the refused document stays a draft';

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

  RAISE NOTICE 'PASS 9-10: R4 holds at the door out of draft, the draft still saves, and an uncapped agreement is legal';
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
-- (22) THE COMPOSER'S OWN KEYS. N1: the rail mints `custom.<uuid>` for every
--      part a designer adds, so if the money projection read the nine
--      patina.* names, every rate card, ceiling, retainer, cadence and
--      deposit composed from the rail would render on the client's page and
--      reach the money row not at all — and the document would execute into
--      a billing authority with no rates, parking every billable hour in
--      'pending_authorization' forever.
--
--      Money is read by SHAPE. This case composes exactly what the rail
--      emits — every money part under a custom key — and asserts the figures
--      land, that the floor and the send refusal read the same shapes, and
--      that a second part of one shape is refused rather than picked between.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_agreement('a5300000-0000-4000-8000-000000000006', 'The composed agreement');

DO $$
DECLARE
  v_err text;
  v_rate_key text := 'custom.' || extensions.gen_random_uuid()::text;
  v_ceiling_key text := 'custom.' || extensions.gen_random_uuid()::text;
  v_retainer_key text := 'custom.' || extensions.gen_random_uuid()::text;
  v_cadence_key text := 'custom.' || extensions.gen_random_uuid()::text;
  v_deposit_key text := 'custom.' || extensions.gen_random_uuid()::text;
  v_prose jsonb;
  v_money jsonb;
BEGIN
  v_prose := jsonb_build_array(
    jsonb_build_object('kind', 'clause', 'partKey', 'patina.services',
      'title', 'Services', 'required', true,
      'payload', jsonb_build_object('body', 'Full-service interior design.')),
    jsonb_build_object('kind', 'clause', 'partKey', 'patina.terms',
      'title', 'Terms', 'required', true,
      'payload', jsonb_build_object('body', 'Billed at actual hours.'))
  );
  v_money := jsonb_build_array(
    jsonb_build_object('kind', 'schedule', 'variant', 'rate_card',
      'partKey', v_rate_key, 'title', 'Role rates',
      'payload', jsonb_build_object('roles', jsonb_build_array(
        jsonb_build_object('roleName', 'Principal', 'hourlyRateCents', 22500, 'sortOrder', 0)))),
    jsonb_build_object('kind', 'schedule', 'variant', 'ceiling',
      'partKey', v_ceiling_key, 'title', 'Ceiling',
      'payload', jsonb_build_object('cents', 2400000)),
    jsonb_build_object('kind', 'schedule', 'variant', 'retainer',
      'partKey', v_retainer_key, 'title', 'Retainer',
      'payload', jsonb_build_object(
        'cents', 500000, 'creditRule', 'credited', 'activationPolicy', 'retainer_paid')),
    jsonb_build_object('kind', 'schedule', 'variant', 'cadence',
      'partKey', v_cadence_key, 'title', 'Billing cadence',
      'payload', jsonb_build_object('cadence', 'biweekly')),
    jsonb_build_object('kind', 'schedule', 'variant', 'procurement',
      'partKey', v_deposit_key, 'title', 'Furnishings deposit',
      'payload', jsonb_build_object('depositPercent', 25))
  );

  -- (22a) A composer-keyed rate card with no ceiling meets the same floor a
  -- patina-keyed one meets. It used to sail through. The floor is read where
  -- the document leaves draft, not where the draft is written, so the save is
  -- the thing that must NOT refuse here.
  PERFORM public.upsert_agreement_parts(
    'a5300000-0000-4000-8000-000000000006',
    v_prose || jsonb_build_array(v_money->0)
  );
  ASSERT public._agreement_floor_unmet('a5300000-0000-4000-8000-000000000006'),
    'N1: the floor must read the shape, not the key';
  BEGIN
    PERFORM pg_temp.send_agreement('a5300000-0000-4000-8000-000000000006');
    ASSERT false, 'a composer-keyed rate card with no ceiling must not send';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'an agreement that bills time needs a ceiling',
    format('N1: the send door must read the shape, not the key: %L', v_err);
  -- Back to nothing, so (22b)'s "leaves no parts behind" says what it means.
  PERFORM public.discard_agreement_parts('a5300000-0000-4000-8000-000000000006');

  -- (22b) Two ceilings, however keyed, is not a document the money row can
  -- read. It is refused in the designer's words, not the table's.
  v_err := NULL;
  BEGIN
    PERFORM public.upsert_agreement_parts(
      'a5300000-0000-4000-8000-000000000006',
      v_prose || v_money || jsonb_build_array(
        jsonb_build_object('kind', 'schedule', 'variant', 'ceiling',
          'partKey', 'studio.second_ceiling', 'title', 'An internal cap',
          'payload', jsonb_build_object('cents', 111)))
    );
    ASSERT false, 'a second ceiling must be refused';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'an agreement carries only one ceiling',
    format('duplicate refusal: %L', v_err);
  ASSERT (SELECT count(*) FROM public.proposal_agreement_parts
          WHERE proposal_id = 'a5300000-0000-4000-8000-000000000006') = 0,
    'a refused upsert leaves no parts behind';

  -- (22c) The whole composition, every money part under the rail's own key.
  PERFORM public.upsert_agreement_parts(
    'a5300000-0000-4000-8000-000000000006', v_prose || v_money);

  ASSERT (SELECT count(*) FROM public.proposal_service_rates
          WHERE proposal_id = 'a5300000-0000-4000-8000-000000000006') = 1,
    'N1: a rate card the designer added must project its rate';
  ASSERT (SELECT r.hourly_rate_cents FROM public.proposal_service_rates r
          WHERE r.proposal_id = 'a5300000-0000-4000-8000-000000000006') = 22500,
    'the figure on the page is the figure in the money row';
  ASSERT (SELECT t.billing_ceiling_cents FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a5300000-0000-4000-8000-000000000006') = 2400000,
    'N1: a composer-keyed ceiling must become the ceiling';
  ASSERT (SELECT t.retainer_amount_cents FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a5300000-0000-4000-8000-000000000006') = 500000,
    'N1: a composer-keyed retainer must become the retainer';
  ASSERT (SELECT t.retainer_activation_policy FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a5300000-0000-4000-8000-000000000006') = 'retainer_paid',
    'N1: and its activation policy travels with it';
  ASSERT (SELECT t.billing_cadence FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a5300000-0000-4000-8000-000000000006') = 'biweekly',
    'N1: a composer-keyed cadence must become the cadence';
  ASSERT (SELECT t.furnishings_deposit_percent FROM public.proposal_service_terms t
          WHERE t.proposal_id = 'a5300000-0000-4000-8000-000000000006') = 25,
    'N1: a composer-keyed deposit must become the deposit percent';
  ASSERT public._agreement_requires_rate_card('a5300000-0000-4000-8000-000000000006'),
    'the send refusal reads the same rate card the projection read';
  ASSERT NOT public._agreement_floor_unmet('a5300000-0000-4000-8000-000000000006'),
    'a capped hourly composition meets the floor';
END $$;

SELECT pg_temp.send_agreement('a5300000-0000-4000-8000-000000000006');
DO $$
BEGIN
  ASSERT (SELECT commercial_state FROM public.proposals
          WHERE id = 'a5300000-0000-4000-8000-000000000006') = 'sent',
    'the composed agreement sends';
  RAISE NOTICE 'PASS 22: money is read by shape — the composer''s own keys project, and one of each';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (24) N3 — THE FLOOR STANDS AT EVERY DOOR OUT OF DRAFT. Q3's exact route:
--      a co-member clears the ceiling on the terms row while the document is
--      a draft (proposal_service_terms_studio_rw, 00412:318 — case 23 does
--      this too), materialize_standard_parts lays that state out as parts,
--      and the document SENDS, because send only ever asked whether rate ROWS
--      existed. Seeding still lays it out — the room must be able to show a
--      studio the state it is in — but nothing lets it out of draft, and
--      nothing lets the composition be saved that way either.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_agreement('a5300000-0000-4000-8000-000000000008', 'The cleared-ceiling agreement');

DO $$
DECLARE v_err text; v_touched integer; v_seeded jsonb;
BEGIN
  -- R17(c). Q3's route began with a co-member clearing the ceiling by hand on
  -- the terms row. 00575 takes the write set away, so that first step no
  -- longer exists — and the fixture stands in as the table owner for the
  -- state a pre-00575 co-member could already have left behind.
  PERFORM pg_temp.assume_role('a5000000-0000-4000-8000-000000000001');
  BEGIN
    UPDATE public.proposal_service_terms SET billing_ceiling_cents = NULL
    WHERE proposal_id = 'a5300000-0000-4000-8000-000000000008';
    ASSERT false, 'the studio must not hold the write set on the money row';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_err LIKE 'permission denied%',
    format('R17(c): the money row is not writable by hand: %L', v_err);
  v_err := NULL;

  UPDATE public.proposal_service_terms SET billing_ceiling_cents = NULL
  WHERE proposal_id = 'a5300000-0000-4000-8000-000000000008';
  GET DIAGNOSTICS v_touched = ROW_COUNT;
  ASSERT v_touched = 1, 'the fixture stands up the cleared ceiling';
  ASSERT (SELECT count(*) FROM public.proposal_service_rates
          WHERE proposal_id = 'a5300000-0000-4000-8000-000000000008') = 1,
    'the fixture still bills time';

  -- Seeding shows the studio the state it is in, cap and all.
  v_seeded := public.materialize_standard_parts('a5300000-0000-4000-8000-000000000008');
  ASSERT (v_seeded->>'materialized')::boolean,
    'the room must be able to open on a cleared-ceiling draft';
  ASSERT (SELECT jsonb_typeof(ap.payload->'cents') FROM public.proposal_agreement_parts ap
          WHERE ap.proposal_id = 'a5300000-0000-4000-8000-000000000008'
            AND ap.part_key = 'patina.ceiling') = 'null',
    'the seeded ceiling part is empty, because the terms row is';
  ASSERT public._agreement_floor_unmet('a5300000-0000-4000-8000-000000000008'),
    'the seeded composition is below the floor';

  -- And it does not leave draft. THE Q3 REGRESSION.
  BEGIN
    PERFORM pg_temp.send_agreement('a5300000-0000-4000-8000-000000000008');
    ASSERT false, 'a seeded uncapped hourly agreement must not send';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'an agreement that bills time needs a ceiling',
    format('N3: the send door must ask the floor: %L', v_err);
  ASSERT (SELECT commercial_state FROM public.proposals
          WHERE id = 'a5300000-0000-4000-8000-000000000008') = 'draft',
    'the refused document stays a draft';

  -- And it CAN be saved as it stands. This is the seeded state the studio has
  -- to work from — a co-member cleared the cap and the room opened on it — so
  -- refusing the save would leave the designer no way to type the cap the send
  -- door is asking for.
  PERFORM public.upsert_agreement_parts(
    'a5300000-0000-4000-8000-000000000008',
    (SELECT jsonb_agg(jsonb_build_object(
       'kind', ap.kind, 'variant', ap.variant, 'partKey', ap.part_key,
       'title', ap.title, 'payload', ap.payload, 'required', ap.required,
       'clientVisible', ap.client_visible
     ) ORDER BY ap.position)
     FROM public.proposal_agreement_parts ap
     WHERE ap.proposal_id = 'a5300000-0000-4000-8000-000000000008'));
  ASSERT public._agreement_floor_unmet('a5300000-0000-4000-8000-000000000008'),
    'N3: saving an unfinished draft does not lower the floor';
  ASSERT (SELECT commercial_state FROM public.proposals
          WHERE id = 'a5300000-0000-4000-8000-000000000008') = 'draft',
    'N3: and it is still a draft';
END $$;

-- And the send door holds for a composition that reached draft by the other
-- road: parts saved while capped, then the cap emptied underneath.
SELECT pg_temp.mint_agreement('a5300000-0000-4000-8000-000000000009', 'The hollowed agreement');

DO $$
DECLARE v_err text;
BEGIN
  PERFORM public.upsert_agreement_parts(
    'a5300000-0000-4000-8000-000000000009',
    jsonb_build_array(
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.services',
        'title', 'Services', 'required', true,
        'payload', jsonb_build_object('body', 'Full-service interior design.')),
      jsonb_build_object('kind', 'schedule', 'variant', 'rate_card',
        'partKey', 'patina.role_rates', 'title', 'Role rates',
        'payload', jsonb_build_object('roles', jsonb_build_array(
          jsonb_build_object('roleName', 'Principal', 'hourlyRateCents', 22500, 'sortOrder', 0)))),
      jsonb_build_object('kind', 'schedule', 'variant', 'ceiling',
        'partKey', 'patina.ceiling', 'title', 'Ceiling',
        'payload', jsonb_build_object('cents', 2400000)),
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.terms',
        'title', 'Terms', 'required', true,
        'payload', jsonb_build_object('body', 'Billed at actual hours.'))
    )
  );

  -- The cap is emptied on the part itself, the only way left: as the owner of
  -- the table, standing in for a future writer this grant does not yet allow.
  UPDATE public.proposal_agreement_parts
  SET payload = jsonb_build_object('cents', NULL)
  WHERE proposal_id = 'a5300000-0000-4000-8000-000000000009'
    AND part_key = 'patina.ceiling';

  ASSERT public._agreement_floor_unmet('a5300000-0000-4000-8000-000000000009'),
    'the floor predicate sees the emptied cap';
  BEGIN
    PERFORM pg_temp.send_agreement('a5300000-0000-4000-8000-000000000009');
    ASSERT false, 'an uncapped hourly agreement must not send';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'an agreement that bills time needs a ceiling',
    format('N3: the send door must ask the floor: %L', v_err);
  ASSERT (SELECT commercial_state FROM public.proposals
          WHERE id = 'a5300000-0000-4000-8000-000000000009') = 'draft',
    'the refused document stays a draft';

  RAISE NOTICE 'PASS 24: R4''s floor stands at the door out of draft, by either road in, and the unfinished draft still saves';
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
  -- Owner-side, for the same reason as case 24: R17(c) took the money row's
  -- write set away from authenticated, and this fixture is standing up a
  -- state, not exercising a door.
  UPDATE public.proposal_service_terms SET billing_ceiling_cents = NULL
  WHERE proposal_id = 'a5300000-0000-4000-8000-000000000007';
  GET DIAGNOSTICS v_touched = ROW_COUNT;
  ASSERT v_touched = 1, 'the fixture stands up the uncapped agreement';
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

-- ═══════════════════════════════════════════════════════════════════════════
-- (25) R17 — ONE SOURCE OF TRUTH PER DOCUMENT. Reviewer probes P16 and P3b.
--      A composed agreement's money row is a PROJECTION. The flag-off
--      seven-facet room may not author over it, and no hand may move it —
--      not even a hand that still holds the grant. Before 00575's R17 block,
--      a flag-off co-member saved 500,000/monthly over a composition the
--      client signed at 2,400,000/biweekly, the document sent, was signed and
--      countersigned, and the two parties ended up bound to different money
--      with no refusal anywhere. The fingerprint cannot catch it: it hashes
--      both halves.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION pg_temp.base_parts() RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_array(
    jsonb_build_object('kind', 'clause', 'partKey', 'patina.services',
      'title', 'Services', 'required', true,
      'payload', jsonb_build_object('body', 'Full-service interior design.')),
    jsonb_build_object('kind', 'schedule', 'variant', 'rate_card',
      'partKey', 'patina.role_rates', 'title', 'Role rates',
      'payload', jsonb_build_object('roles', jsonb_build_array(
        jsonb_build_object('roleName', 'Lead Designer', 'hourlyRateCents', 22500, 'sortOrder', 0)))),
    jsonb_build_object('kind', 'schedule', 'variant', 'ceiling',
      'partKey', 'patina.ceiling', 'title', 'Ceiling',
      'payload', jsonb_build_object('cents', 2400000)),
    jsonb_build_object('kind', 'schedule', 'variant', 'cadence',
      'partKey', 'patina.cadence', 'title', 'Billing cadence',
      'payload', jsonb_build_object('cadence', 'biweekly')),
    jsonb_build_object('kind', 'clause', 'partKey', 'patina.terms',
      'title', 'Terms', 'required', true,
      'payload', jsonb_build_object('body', 'Billed at actual hours.'))
  );
$$;
GRANT EXECUTE ON FUNCTION pg_temp.base_parts() TO PUBLIC;

-- Saves a composition and hands back the refusal's own words, so a case can
-- assert the sentence a designer would read rather than an error class.
CREATE OR REPLACE FUNCTION pg_temp.save_parts_err(p_id uuid, p_parts jsonb)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.upsert_agreement_parts(p_id, p_parts);
  RETURN NULL;
EXCEPTION WHEN check_violation THEN RETURN SQLERRM;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.save_parts_err(uuid, jsonb) TO PUBLIC;

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_agreement('a5300000-0000-4000-8000-00000000000a', 'The one-source agreement');

DO $$
DECLARE
  v_err text;
  v_detail text;
  v_terms public.proposal_service_terms%ROWTYPE;
BEGIN
  PERFORM public.upsert_agreement_parts(
    'a5300000-0000-4000-8000-00000000000a', pg_temp.base_parts());

  SELECT * INTO v_terms FROM public.proposal_service_terms
  WHERE proposal_id = 'a5300000-0000-4000-8000-00000000000a';
  ASSERT v_terms.billing_ceiling_cents = 2400000
     AND v_terms.billing_cadence = 'biweekly',
    'the composition must have projected before the probes mean anything';
  ASSERT (SELECT hourly_rate_cents FROM public.proposal_service_rates
          WHERE proposal_id = 'a5300000-0000-4000-8000-00000000000a') = 22500,
    'the composed rate card must have projected';

  -- P16. The flag-off door, over a composed draft, by a co-member with every
  -- right to author a seven-facet agreement of their own.
  PERFORM pg_temp.assume_user('a5000000-0000-4000-8000-000000000002');
  BEGIN
    PERFORM public.upsert_design_services_draft(
      'a5300000-0000-4000-8000-00000000000a',
      jsonb_build_object(
        'scope', 'Whole-home interior design services.',
        'deliverables', jsonb_build_array('Concept'),
        'exclusions', jsonb_build_array(),
        'billingCeilingCents', 500000,
        'retainerAmountCents', 0,
        'billingCadence', 'monthly', 'currency', 'USD',
        'currentRateVersion', 1),
      jsonb_build_array(jsonb_build_object(
        'roleName', 'Lead Designer', 'hourlyRateCents', 9900, 'sortOrder', 0)));
    ASSERT false, 'the flag-off room must not author over a composition';
  EXCEPTION WHEN check_violation THEN
    v_err := SQLERRM;
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  END;
  PERFORM pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
  ASSERT v_err = 'This agreement is composed from parts. Open it in the Contract Room with parts on to change it.',
    format('R17(b): the flag-off room reads one plain sentence: %L', v_err);
  ASSERT v_detail = 'agreement_composed',
    format('R17(b): the refusal is typed for the caller too: %L', v_detail);

  -- Nothing moved. The page the client would sign and the row the authority
  -- snapshots are still the same money.
  SELECT * INTO v_terms FROM public.proposal_service_terms
  WHERE proposal_id = 'a5300000-0000-4000-8000-00000000000a';
  ASSERT v_terms.billing_ceiling_cents = 2400000, 'the refused save moved the ceiling';
  ASSERT v_terms.billing_cadence = 'biweekly', 'the refused save moved the cadence';
  ASSERT (SELECT count(*) FROM public.proposal_service_rates
          WHERE proposal_id = 'a5300000-0000-4000-8000-00000000000a'
            AND hourly_rate_cents = 22500) = 1,
    'the refused save moved the rate card';
  ASSERT (SELECT count(*) FROM public.proposal_agreement_parts
          WHERE proposal_id = 'a5300000-0000-4000-8000-00000000000a') = 5,
    'the refused save touched the parts';
END $$;

DO $$
DECLARE v_err text; v_detail text;
BEGIN
  -- P3b. A hand on the money row directly, standing as the TABLE OWNER —
  -- past RLS, past the grant, the strongest writer this database has short
  -- of disabling triggers. The wall is the trigger, not the ACL.
  BEGIN
    UPDATE public.proposal_service_terms SET billing_ceiling_cents = NULL
    WHERE proposal_id = 'a5300000-0000-4000-8000-00000000000a';
    ASSERT false, 'a composed money row must not be updatable by hand';
  EXCEPTION WHEN check_violation THEN
    v_err := SQLERRM;
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  END;
  ASSERT v_err = 'This agreement is composed from parts. Open it in the Contract Room with parts on to change it.',
    format('R17(a): the trigger refuses in the same sentence: %L', v_err);
  ASSERT v_detail = 'agreement_composed',
    format('R17(a): and with the same token: %L', v_detail);

  v_err := NULL;
  BEGIN
    DELETE FROM public.proposal_service_rates
    WHERE proposal_id = 'a5300000-0000-4000-8000-00000000000a';
    ASSERT false, 'a composed rate row must not be deletable by hand';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err IS NOT NULL, 'the rates half of the wall is missing';

  v_err := NULL;
  BEGIN
    INSERT INTO public.proposal_service_rates (
      proposal_id, version, role_name, hourly_rate_cents, sort_order
    ) VALUES ('a5300000-0000-4000-8000-00000000000a', 1, 'Smuggled Role', 100, 9);
    ASSERT false, 'a rate must not be insertable into a composed agreement';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err IS NOT NULL, 'the rates INSERT half of the wall is missing';

  -- The GUC is the only key, and it is transaction-local: naming a DIFFERENT
  -- proposal does not open this one.
  v_err := NULL;
  PERFORM set_config('app.agreement_projection',
    'a5300000-0000-4000-8000-000000000001', true);
  BEGIN
    UPDATE public.proposal_service_terms SET billing_ceiling_cents = 1
    WHERE proposal_id = 'a5300000-0000-4000-8000-00000000000a';
    ASSERT false, 'another document''s projection must not open this one';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  PERFORM set_config('app.agreement_projection', '', true);
  ASSERT v_err IS NOT NULL, 'the guard compares the GUC to THIS proposal';

  -- R17(c). And the grant that made all of this reachable from a browser is
  -- gone: the studio reads the money row and writes it nowhere.
  ASSERT has_table_privilege('authenticated'::name,
    'public.proposal_service_terms'::regclass, 'SELECT'),
    'the studio still reads its own terms row';
  ASSERT has_table_privilege('authenticated'::name,
    'public.proposal_service_rates'::regclass, 'SELECT'),
    'the studio still reads its own rate rows';
  ASSERT NOT (
    has_table_privilege('authenticated'::name, 'public.proposal_service_terms'::regclass, 'INSERT')
    OR has_table_privilege('authenticated'::name, 'public.proposal_service_terms'::regclass, 'UPDATE')
    OR has_table_privilege('authenticated'::name, 'public.proposal_service_terms'::regclass, 'DELETE')
    OR has_table_privilege('authenticated'::name, 'public.proposal_service_rates'::regclass, 'INSERT')
    OR has_table_privilege('authenticated'::name, 'public.proposal_service_rates'::regclass, 'UPDATE')
    OR has_table_privilege('authenticated'::name, 'public.proposal_service_rates'::regclass, 'DELETE')
  ), 'R17(c): authenticated must hold no write on either projection table';
  ASSERT NOT (
    has_table_privilege('anon'::name, 'public.proposal_service_terms'::regclass, 'UPDATE')
    OR has_table_privilege('anon'::name, 'public.proposal_service_rates'::regclass, 'UPDATE')
  ), 'R17(c): anon must hold no write on either projection table';

  -- TRUNCATE is the write the trigger cannot see: it fires no row trigger and
  -- observes no RLS, so the ACL is the ONLY wall standing in front of it
  -- (re-gate 2, F6). The grant is gone, and the act itself is refused.
  ASSERT NOT (
    has_table_privilege('authenticated'::name, 'public.proposal_service_terms'::regclass, 'TRUNCATE')
    OR has_table_privilege('authenticated'::name, 'public.proposal_service_rates'::regclass, 'TRUNCATE')
    OR has_table_privilege('anon'::name, 'public.proposal_service_terms'::regclass, 'TRUNCATE')
    OR has_table_privilege('anon'::name, 'public.proposal_service_rates'::regclass, 'TRUNCATE')
  ), 'R17(c): neither authenticated nor anon may TRUNCATE a projection table';

  v_err := NULL;
  PERFORM pg_temp.assume_role('a5000000-0000-4000-8000-000000000001');
  BEGIN
    EXECUTE 'TRUNCATE public.proposal_service_terms';
    ASSERT false, 'authenticated must not be able to empty the terms projection';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err IS NOT NULL, 'R17(c): TRUNCATE on the terms projection was accepted';

  v_err := NULL;
  BEGIN
    EXECUTE 'TRUNCATE public.proposal_service_rates';
    ASSERT false, 'authenticated must not be able to empty the rates projection';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_err IS NOT NULL, 'R17(c): TRUNCATE on the rates projection was accepted';

  -- And the money is still where it was.
  ASSERT (SELECT count(*) FROM public.proposal_service_terms
          WHERE proposal_id = 'a5300000-0000-4000-8000-00000000000a') = 1,
    'the refused TRUNCATE emptied the terms projection';
  ASSERT (SELECT count(*) FROM public.proposal_service_rates
          WHERE proposal_id = 'a5300000-0000-4000-8000-00000000000a') > 0,
    'the refused TRUNCATE emptied the rates projection';

  RAISE NOTICE 'PASS 25: one source of truth — the flag-off door, the direct hand, the grant and TRUNCATE all refuse (R17)';
END $$;

-- The legacy contract is unmoved by all three walls: a document with NO parts
-- is still authored by the seven-facet room, and its money row still moves.
SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_agreement('a5300000-0000-4000-8000-00000000000b', 'The uncomposed agreement');

DO $$
DECLARE v_result jsonb;
BEGIN
  ASSERT (SELECT count(*) FROM public.proposal_agreement_parts
          WHERE proposal_id = 'a5300000-0000-4000-8000-00000000000b') = 0,
    'the control must carry no parts';
  v_result := public.upsert_design_services_draft(
    'a5300000-0000-4000-8000-00000000000b',
    jsonb_build_object(
      'scope', 'Whole-home interior design services.',
      'deliverables', jsonb_build_array('Concept'),
      'exclusions', jsonb_build_array(),
      'billingCeilingCents', 500000,
      'retainerAmountCents', 0,
      'billingCadence', 'monthly', 'currency', 'USD',
      'currentRateVersion', 1),
    jsonb_build_array(jsonb_build_object(
      'roleName', 'Lead Designer', 'hourlyRateCents', 9900, 'sortOrder', 0)));
  ASSERT v_result->>'commercialState' = 'draft',
    'the seven-facet room still authors a document that has no parts';
  ASSERT (SELECT billing_ceiling_cents FROM public.proposal_service_terms
          WHERE proposal_id = 'a5300000-0000-4000-8000-00000000000b') = 500000,
    'the flag-off write still lands when nothing is composed';

  RAISE NOTICE 'PASS 26: the flag-off contract is byte-for-byte unmoved on a parts-less document';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (27) R2 — MONEY IS TYPED AT THE DOOR. The floor asks jsonb_typeof before it
--      counts a figure; the projection used to cast with ->> and ask nothing.
--      A rate card whose rate arrived as the STRING "22500" therefore billed
--      real hours against a ceiling the floor could not see and SENT, and a
--      ceiling stated as a string earned the floor's sentence — a red for the
--      wrong reason. Both halves now read one payload one way.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_agreement('a5300000-0000-4000-8000-00000000000c', 'The stringly-typed agreement');

DO $$
DECLARE v_err text;
BEGIN
  -- P17: a string rate and no ceiling at all. This used to save, report the
  -- floor as met, write hourly_rate_cents = 22500 beside a NULL ceiling, and
  -- send.
  v_err := pg_temp.save_parts_err(
    'a5300000-0000-4000-8000-00000000000c',
    jsonb_build_array(
      jsonb_build_object('kind', 'schedule', 'variant', 'rate_card',
        'partKey', 'patina.role_rates', 'title', 'Role rates',
        'payload', jsonb_build_object('roles', jsonb_build_array(
          jsonb_build_object('roleName', 'Lead Designer',
                             'hourlyRateCents', '22500', 'sortOrder', 0))))));
  ASSERT v_err = 'the hourly rate needs an amount in dollars and cents',
    format('R2: a rate that is not a number is not a rate: %L', v_err);
  ASSERT (SELECT count(*) FROM public.proposal_agreement_parts
          WHERE proposal_id = 'a5300000-0000-4000-8000-00000000000c') = 0,
    'nothing may be written before the money is legible';

  -- P18, the mirror: a ceiling stated as a string beside a real rate card.
  -- It must earn its OWN sentence, not "an agreement that bills time needs a
  -- ceiling" — the cap is stated, it is only unreadable.
  v_err := pg_temp.save_parts_err(
    'a5300000-0000-4000-8000-00000000000c',
    jsonb_build_array(
      jsonb_build_object('kind', 'schedule', 'variant', 'rate_card',
        'partKey', 'patina.role_rates', 'title', 'Role rates',
        'payload', jsonb_build_object('roles', jsonb_build_array(
          jsonb_build_object('roleName', 'Lead Designer',
                             'hourlyRateCents', 22500, 'sortOrder', 0)))),
      jsonb_build_object('kind', 'schedule', 'variant', 'ceiling',
        'partKey', 'patina.ceiling', 'title', 'Ceiling',
        'payload', jsonb_build_object('cents', '2400000'))));
  ASSERT v_err = 'the ceiling needs an amount in dollars and cents',
    format('R2: an unreadable cap is not a missing cap: %L', v_err);

  -- A fractional figure is not cents either, and a negative one is not money.
  v_err := pg_temp.save_parts_err(
    'a5300000-0000-4000-8000-00000000000c',
    jsonb_build_array(jsonb_build_object('kind', 'schedule', 'variant', 'retainer',
      'partKey', 'patina.retainer', 'title', 'Retainer',
      'payload', jsonb_build_object('cents', 1500.5))));
  ASSERT v_err = 'the retainer needs an amount in dollars and cents',
    format('R2: half a cent is not a retainer: %L', v_err);

  -- And the legal shapes still save: a real number, and "not yet set". The
  -- flat fee is here because R22's floor asks every saved composition to name
  -- a fee; it is not what this case is about.
  PERFORM public.upsert_agreement_parts(
    'a5300000-0000-4000-8000-00000000000c',
    jsonb_build_array(
      jsonb_build_object('kind', 'schedule', 'variant', 'flat',
        'partKey', 'patina.flat', 'title', 'Flat fee',
        'payload', jsonb_build_object('cents', 1800000)),
      jsonb_build_object('kind', 'schedule', 'variant', 'ceiling',
        'partKey', 'patina.ceiling', 'title', 'Ceiling',
        'payload', jsonb_build_object('cents', NULL)),
      jsonb_build_object('kind', 'schedule', 'variant', 'retainer',
        'partKey', 'patina.retainer', 'title', 'Retainer',
        'payload', jsonb_build_object('cents', 500000))));
  ASSERT (SELECT billing_ceiling_cents FROM public.proposal_service_terms
          WHERE proposal_id = 'a5300000-0000-4000-8000-00000000000c') IS NULL,
    'R21: an unset ceiling is still a legal state of a draft';
  ASSERT (SELECT retainer_amount_cents FROM public.proposal_service_terms
          WHERE proposal_id = 'a5300000-0000-4000-8000-00000000000c') = 500000,
    'a real figure still projects';

  RAISE NOTICE 'PASS 27: money is typed at the door — the floor and the projection read one payload one way (R2)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (28) R7 — NO DATABASE IDENTIFIER REACHES THE ROOM. The composer prints the
--      RPC's error text as its save note. Each of these six used to answer
--      with the name of a constraint, a column or a table.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_agreement('a5300000-0000-4000-8000-00000000000d', 'The ill-formed agreement');

DO $$
DECLARE
  v_err text;
  v_errs text[] := ARRAY[]::text[];
  v_one text;
BEGIN
  -- (a) two parts under one name — was: duplicate key value violates unique
  --     constraint "uniq_agreement_part_key".
  v_err := pg_temp.save_parts_err(
    'a5300000-0000-4000-8000-00000000000d',
    jsonb_build_array(
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.terms',
        'title', 'Terms', 'payload', jsonb_build_object('body', 'One.')),
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.terms',
        'title', 'Terms', 'payload', jsonb_build_object('body', 'Two.'))));
  ASSERT v_err = 'this agreement lists the part titled "Terms" twice',
    format('R7(a): %L', v_err);
  v_errs := v_errs || v_err;

  -- (b) a role with no name — was: violates check constraint
  --     "proposal_service_rates_role_name_check".
  v_err := pg_temp.save_parts_err(
    'a5300000-0000-4000-8000-00000000000d',
    jsonb_build_array(jsonb_build_object('kind', 'schedule', 'variant', 'rate_card',
      'partKey', 'patina.role_rates', 'title', 'Role rates',
      'payload', jsonb_build_object('roles', jsonb_build_array(
        jsonb_build_object('roleName', '   ', 'hourlyRateCents', 22500))))));
  ASSERT v_err = 'every role on the rate card needs a name', format('R7(b): %L', v_err);
  v_errs := v_errs || v_err;

  -- (c) a role with no rate — was: null value in column "hourly_rate_cents"
  --     of relation "proposal_service_rates".
  v_err := pg_temp.save_parts_err(
    'a5300000-0000-4000-8000-00000000000d',
    jsonb_build_array(jsonb_build_object('kind', 'schedule', 'variant', 'rate_card',
      'partKey', 'patina.role_rates', 'title', 'Role rates',
      'payload', jsonb_build_object('roles', jsonb_build_array(
        jsonb_build_object('roleName', 'Lead Designer'))))));
  ASSERT v_err = 'every role on the rate card needs an hourly rate', format('R7(c): %L', v_err);
  v_errs := v_errs || v_err;

  -- (d) a cadence the money row has no column state for — was: violates check
  --     constraint "proposal_service_terms_billing_cadence_check".
  --     00578 WIDENED BOTH cadence CHECKs with 'per_draw' for the turnkey
  --     class, so the value W1 refused here is now legal and the refusal moved
  --     to the next word that is not. The sentence gained its fourth clause in
  --     the same change.
  v_err := pg_temp.save_parts_err(
    'a5300000-0000-4000-8000-00000000000d',
    jsonb_build_array(jsonb_build_object('kind', 'schedule', 'variant', 'cadence',
      'partKey', 'patina.cadence', 'title', 'Billing cadence',
      'payload', jsonb_build_object('cadence', 'on_handshake'))));
  ASSERT v_err = 'billing runs monthly, every two weeks, at milestones, or on each draw',
    format('R7(d): %L', v_err);
  v_errs := v_errs || v_err;

  -- (d2) and 'per_draw' itself now SAVES — the money row can hold it.
  v_err := pg_temp.save_parts_err(
    'a5300000-0000-4000-8000-00000000000d',
    jsonb_build_array(jsonb_build_object('kind', 'schedule', 'variant', 'cadence',
      'partKey', 'patina.cadence', 'title', 'Billing cadence',
      'payload', jsonb_build_object('cadence', 'per_draw'))));
  ASSERT v_err IS NULL, format('R7(d2): per_draw must save from 00578 on: %L', v_err);
  ASSERT (SELECT billing_cadence FROM public.proposal_service_terms
          WHERE proposal_id = 'a5300000-0000-4000-8000-00000000000d') = 'per_draw',
    'R7(d2): per_draw must reach the money row';
  -- Put the bench back the way the cases below expect to find it.
  PERFORM public.upsert_agreement_parts(
    'a5300000-0000-4000-8000-00000000000d', '[]'::jsonb);

  -- (e) a negative ceiling — was: violates check constraint
  --     "proposal_service_terms_billing_ceiling_cents_check".
  v_err := pg_temp.save_parts_err(
    'a5300000-0000-4000-8000-00000000000d',
    jsonb_build_array(jsonb_build_object('kind', 'schedule', 'variant', 'ceiling',
      'partKey', 'patina.ceiling', 'title', 'Ceiling',
      'payload', jsonb_build_object('cents', -1))));
  ASSERT v_err = 'a ceiling cannot be less than zero', format('R7(e): %L', v_err);
  v_errs := v_errs || v_err;

  -- (f) a deposit of 150% — was: violates check constraint
  --     "proposal_service_terms_furnishings_deposit_check".
  v_err := pg_temp.save_parts_err(
    'a5300000-0000-4000-8000-00000000000d',
    jsonb_build_array(jsonb_build_object('kind', 'schedule', 'variant', 'procurement',
      'partKey', 'patina.deposit', 'title', 'Furnishings deposit',
      'payload', jsonb_build_object('depositPercent', 150))));
  ASSERT v_err = 'a furnishings deposit is a percentage between 0 and 100',
    format('R7(f): %L', v_err);
  v_errs := v_errs || v_err;

  -- (g) two rows for one role on the rate card — was: duplicate key value
  --     violates unique constraint
  --     "proposal_service_rates_proposal_id_version_role_name_key".
  v_err := pg_temp.save_parts_err(
    'a5300000-0000-4000-8000-00000000000d',
    jsonb_build_array(jsonb_build_object('kind', 'schedule', 'variant', 'rate_card',
      'partKey', 'patina.role_rates', 'title', 'Role rates',
      'payload', jsonb_build_object('roles', jsonb_build_array(
        jsonb_build_object('roleName', 'Lead Designer', 'hourlyRateCents', 22500),
        jsonb_build_object('roleName', 'Lead Designer', 'hourlyRateCents', 19500))))));
  ASSERT v_err = 'the rate card names Lead Designer twice', format('R7(g): %L', v_err);
  v_errs := v_errs || v_err;

  -- (h) a retainer that starts on a policy the money row cannot hold — was:
  --     violates check constraint
  --     "proposal_service_terms_retainer_activation_policy_check".
  v_err := pg_temp.save_parts_err(
    'a5300000-0000-4000-8000-00000000000d',
    jsonb_build_array(jsonb_build_object('kind', 'schedule', 'variant', 'retainer',
      'partKey', 'patina.retainer', 'title', 'Retainer',
      'payload', jsonb_build_object('cents', 500000, 'activationPolicy', 'on_handshake'))));
  ASSERT v_err = 'a retainer starts either right away or once it is paid',
    format('R7(h): %L', v_err);
  v_errs := v_errs || v_err;

  -- (i) the client-visibility flag as a word — was: invalid input syntax for
  --     type boolean: "maybe".
  v_err := pg_temp.save_parts_err(
    'a5300000-0000-4000-8000-00000000000d',
    jsonb_build_array(jsonb_build_object('kind', 'clause',
      'partKey', 'patina.services', 'title', 'Services',
      'clientVisible', 'maybe',
      'payload', jsonb_build_object('body', 'Interior design services.'))));
  ASSERT v_err = 'whether the client sees the part titled "Services" is a yes or a no',
    format('R7(i): %L', v_err);
  v_errs := v_errs || v_err;

  -- (j) a source part that is not an id — was: invalid input syntax for type
  --     uuid: "not-a-uuid".
  v_err := pg_temp.save_parts_err(
    'a5300000-0000-4000-8000-00000000000d',
    jsonb_build_array(jsonb_build_object('kind', 'clause',
      'partKey', 'patina.services', 'title', 'Services',
      'sourcePartId', 'not-a-uuid',
      'payload', jsonb_build_object('body', 'Interior design services.'))));
  ASSERT v_err = 'the part that "Services" was copied from could not be read',
    format('R7(j): %L', v_err);
  v_errs := v_errs || v_err;

  -- (k) a rate card ordered by a word — was: invalid input syntax for type
  --     integer: "first".
  v_err := pg_temp.save_parts_err(
    'a5300000-0000-4000-8000-00000000000d',
    jsonb_build_array(jsonb_build_object('kind', 'schedule', 'variant', 'rate_card',
      'partKey', 'patina.role_rates', 'title', 'Role rates',
      'payload', jsonb_build_object('roles', jsonb_build_array(
        jsonb_build_object('roleName', 'Lead Designer',
          'hourlyRateCents', 22500, 'sortOrder', 'first'))))));
  ASSERT v_err = 'the rate card''s order could not be read at Lead Designer',
    format('R7(k): %L', v_err);
  v_errs := v_errs || v_err;

  -- (l) a date the money row cannot read (B-9's new field) — was: invalid
  --     input syntax for type timestamp with time zone.
  v_err := pg_temp.save_parts_err(
    'a5300000-0000-4000-8000-00000000000d',
    jsonb_build_array(jsonb_build_object('kind', 'schedule', 'variant', 'rate_card',
      'partKey', 'patina.role_rates', 'title', 'Role rates',
      'payload', jsonb_build_object('roles', jsonb_build_array(
        jsonb_build_object('roleName', 'Lead Designer',
          'hourlyRateCents', 22500, 'effectiveAt', 'last spring'))))));
  ASSERT v_err = 'the date Lead Designer takes effect could not be read',
    format('R7(l): %L', v_err);
  v_errs := v_errs || v_err;

  -- And not one of the twelve names a constraint, a column or a table. This is
  -- the assertion that survives a reworded refusal.
  FOREACH v_one IN ARRAY v_errs LOOP
    ASSERT v_one !~* '(violates|constraint|column|relation|proposal_service|proposal_agreement|uniq_agreement)',
      format('R7: a database identifier reached the room: %L', v_one);
  END LOOP;

  -- Nothing was written by any of them.
  ASSERT (SELECT count(*) FROM public.proposal_agreement_parts
          WHERE proposal_id = 'a5300000-0000-4000-8000-00000000000d') = 0,
    'a refused composition writes no parts';

  RAISE NOTICE 'PASS 28: every refusal is worded for the designer — no identifier reaches the room (R7)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (29) R21. THE FLOOR READS THE HOMEOWNER'S COPY AS WELL AS EVERY PART.
--
-- The floor used to ask its question once, over every part. That let a rate
-- card on the client's page stand beside a ceiling marked studio-only: the
-- document passed the floor and SENT, and the composed client body renders
-- parts and never the terms row, so the homeowner signed a page naming an
-- hourly rate with no cap anywhere on it while the studio's authority was
-- capped. Probe C1 below is that document.
--
-- The all-parts question is deliberately KEPT as the second half (probe C2):
-- a rate card the homeowner never reads still projects role rates into
-- proposal_service_rates, and countersign snapshots those into the billing
-- authority — rates with no ceiling are uncapped time whatever the page says.
-- The readiness panel asks both in the same order and blocks on either, so
-- no composition the room calls ready ever meets a refusal here.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_agreement('a5300000-0000-4000-8000-00000000000e', 'The cap she never sees');

DO $$
DECLARE v_err text; v_state text;
BEGIN
  -- C1. A rate card she reads, a ceiling she does not — composed through the
  -- save door, which writes an unfinished draft without judging it.
  PERFORM public.upsert_agreement_parts(
    'a5300000-0000-4000-8000-00000000000e',
    jsonb_build_array(
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.services',
        'title', 'Services', 'required', true, 'clientVisible', true,
        'payload', jsonb_build_object('body', 'Full-service interior design.')),
      jsonb_build_object('kind', 'schedule', 'variant', 'rate_card',
        'partKey', 'patina.role_rates', 'title', 'Role rates', 'clientVisible', true,
        'payload', jsonb_build_object('roles', jsonb_build_array(
          jsonb_build_object('roleName', 'Lead Designer', 'hourlyRateCents', 22500, 'sortOrder', 0)))),
      jsonb_build_object('kind', 'schedule', 'variant', 'ceiling',
        'partKey', 'patina.ceiling', 'title', 'Ceiling', 'clientVisible', false,
        'payload', jsonb_build_object('cents', 2400000)),
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.terms',
        'title', 'Terms', 'required', true, 'clientVisible', true,
        'payload', jsonb_build_object('body', 'Billed at actual hours.'))));

  ASSERT public._agreement_floor_unmet('a5300000-0000-4000-8000-00000000000e'),
    'R21/C1: the floor reads the parts the homeowner reads';

  v_err := NULL;
  BEGIN
    PERFORM pg_temp.send_agreement('a5300000-0000-4000-8000-00000000000e');
    ASSERT false, 'an agreement whose cap is on no page she reads must not send';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'an agreement that bills time needs a ceiling',
    format('R21/C1: the send door must read the client copy: %L', v_err);
  ASSERT (SELECT commercial_state FROM public.proposals
          WHERE id = 'a5300000-0000-4000-8000-00000000000e') = 'draft',
    'the refused document stays a draft';

  -- And the same document, with the cap put on the page she signs, is ready.
  UPDATE public.proposal_agreement_parts SET client_visible = true
  WHERE proposal_id = 'a5300000-0000-4000-8000-00000000000e'
    AND part_key = 'patina.ceiling';
  ASSERT NOT public._agreement_floor_unmet('a5300000-0000-4000-8000-00000000000e'),
    'a cap on the page she signs is a cap';
  PERFORM pg_temp.send_agreement('a5300000-0000-4000-8000-00000000000e');
  SELECT commercial_state INTO v_state FROM public.proposals
  WHERE id = 'a5300000-0000-4000-8000-00000000000e';
  ASSERT v_state <> 'draft', format('a capped hourly agreement sends: %L', v_state);
END $$;

-- C2, the mirror. A rate card the homeowner never reads and no ceiling at
-- all: the stricter all-parts bar is kept, because hidden rates still reach
-- the authority. The room reds on this too, so it is not a refusal a designer
-- can walk into from a panel that called the composition ready.
SELECT pg_temp.mint_agreement('a5300000-0000-4000-8000-00000000000f', 'The studio-only rate card');

DO $$
DECLARE v_err text;
BEGIN
  INSERT INTO public.proposal_agreement_parts (
    proposal_id, position, kind, variant, part_key, title, payload,
    required, client_visible
  ) VALUES
    ('a5300000-0000-4000-8000-00000000000f', 1, 'clause', NULL, 'patina.services',
     'Services', jsonb_build_object('body', 'Full-service interior design.'), true, true),
    ('a5300000-0000-4000-8000-00000000000f', 2, 'schedule', 'rate_card', 'patina.role_rates',
     'Role rates', jsonb_build_object('roles', jsonb_build_array(
       jsonb_build_object('roleName', 'Lead Designer', 'hourlyRateCents', 22500, 'sortOrder', 0))),
     false, false),
    ('a5300000-0000-4000-8000-00000000000f', 3, 'clause', NULL, 'patina.terms',
     'Terms', jsonb_build_object('body', 'Billed at actual hours.'), true, true);

  ASSERT public._agreement_floor_unmet('a5300000-0000-4000-8000-00000000000f'),
    'R21/C2: a rate card nobody reads still bills time';

  BEGIN
    PERFORM pg_temp.send_agreement('a5300000-0000-4000-8000-00000000000f');
    ASSERT false, 'an uncapped studio-only rate card must not send';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'an agreement that bills time needs a ceiling',
    format('R21/C2: %L', v_err);

  -- A cap the homeowner cannot read does not answer for a rate card she can,
  -- but it does answer for one she cannot: both halves of the question, and
  -- both scopes satisfied, is what clears the floor.
  INSERT INTO public.proposal_agreement_parts (
    proposal_id, position, kind, variant, part_key, title, payload,
    required, client_visible
  ) VALUES
    ('a5300000-0000-4000-8000-00000000000f', 4, 'schedule', 'ceiling', 'patina.ceiling',
     'Ceiling', jsonb_build_object('cents', 2400000), false, false);
  ASSERT NOT public._agreement_floor_unmet('a5300000-0000-4000-8000-00000000000f'),
    'a studio-only cap answers a studio-only rate card';

  RAISE NOTICE 'PASS 29: R4''s floor reads the homeowner''s copy and every part, and refuses on either (R21)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (30) N-8. THE DOOR OPENS BOTH WAYS.
--
-- Opening the Contract Room composes the draft with no act from the designer
-- — the room's mount effect calls materialize_standard_parts. From that
-- instant R17's walls stand and the seven-facet room's Save is shut, and
-- `agreement-parts` is a per-person rollout, so without a way back a
-- co-member the flag has not reached could never save that agreement again.
-- discard_agreement_parts is the handle on the inside: the parts go, the
-- money row stays exactly as the last projection left it, and the document
-- hashes what it hashed before the room was ever opened.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.mint_agreement('a5300000-0000-4000-8000-000000000010', 'The room merely opened');

DO $$
DECLARE
  v_seeded jsonb;
  v_left jsonb;
  v_err text;
  v_terms_before jsonb;
  v_terms_after jsonb;
  v_rates_before jsonb;
  v_rates_after jsonb;
  v_fingerprint_before text;
BEGIN
  v_fingerprint_before := pg_temp.fingerprint('a5300000-0000-4000-8000-000000000010');
  SELECT to_jsonb(t) INTO v_terms_before FROM public.proposal_service_terms t
  WHERE t.proposal_id = 'a5300000-0000-4000-8000-000000000010';
  SELECT jsonb_agg(to_jsonb(r) ORDER BY r.role_name) INTO v_rates_before
  FROM public.proposal_service_rates r
  WHERE r.proposal_id = 'a5300000-0000-4000-8000-000000000010';

  -- Merely opening the room.
  v_seeded := public.materialize_standard_parts('a5300000-0000-4000-8000-000000000010');
  ASSERT (v_seeded->>'materialized')::boolean AND (v_seeded->>'partCount')::integer = 9,
    'the mount effect composes the draft with no act from the designer';

  -- And the seven-facet door is shut, for every caller, flag or no flag.
  BEGIN
    PERFORM public.upsert_design_services_draft(
      'a5300000-0000-4000-8000-000000000010',
      jsonb_build_object('scope', 'Rewritten by the co-member', 'billingCeilingCents', 999900,
        'billingCadence', 'monthly', 'currency', 'USD', 'currentRateVersion', 1),
      jsonb_build_array(jsonb_build_object(
        'version', 1, 'roleName', 'Lead Designer', 'hourlyRateCents', 15000, 'sortOrder', 0)));
    ASSERT false, 'a composed draft must refuse the flag-off door';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'This agreement is composed from parts. Open it in the Contract Room with parts on to change it.',
    format('R17(b) still stands: %L', v_err);

  -- The handle.
  v_left := public.discard_agreement_parts('a5300000-0000-4000-8000-000000000010');
  ASSERT (v_left->>'discarded')::integer = 9 AND (v_left->>'partCount')::integer = 0,
    format('discard reports what it removed: %s', v_left::text);
  ASSERT (SELECT count(*) FROM public.proposal_agreement_parts
          WHERE proposal_id = 'a5300000-0000-4000-8000-000000000010') = 0,
    'the parts are gone';

  -- The money row is untouched — it is the state the seven-facet room reads.
  SELECT to_jsonb(t) INTO v_terms_after FROM public.proposal_service_terms t
  WHERE t.proposal_id = 'a5300000-0000-4000-8000-000000000010';
  SELECT jsonb_agg(to_jsonb(r) ORDER BY r.role_name) INTO v_rates_after
  FROM public.proposal_service_rates r
  WHERE r.proposal_id = 'a5300000-0000-4000-8000-000000000010';
  ASSERT v_terms_after = v_terms_before, 'leaving the parts behind moves no money';
  ASSERT v_rates_after = v_rates_before, 'leaving the parts behind moves no rate';

  -- And the document hashes what it hashed before the room was opened (F-1).
  ASSERT pg_temp.fingerprint('a5300000-0000-4000-8000-000000000010') = v_fingerprint_before,
    'the parts key is conditional, so the discarded document hashes as before';
  ASSERT (v_left->>'documentFingerprint') = v_fingerprint_before,
    'discard returns the fingerprint the document now carries';

  -- The seven-facet door opens again.
  PERFORM public.upsert_design_services_draft(
    'a5300000-0000-4000-8000-000000000010',
    jsonb_build_object('scope', 'Rewritten by the co-member', 'billingCeilingCents', 999900,
      'billingCadence', 'monthly', 'currency', 'USD', 'currentRateVersion', 1),
    jsonb_build_array(jsonb_build_object(
      'version', 1, 'roleName', 'Lead Designer', 'hourlyRateCents', 15000, 'sortOrder', 0)));
  ASSERT (SELECT scope FROM public.proposal_service_terms
          WHERE proposal_id = 'a5300000-0000-4000-8000-000000000010') = 'Rewritten by the co-member',
    'the flag-off room authors again once the parts are gone';
END $$;

-- The handle is on the inside of the studio's door only, and only while the
-- agreement is a draft: R6 freezes the parts at send, and a sent agreement's
-- parts are the parts that bind.
DO $$
DECLARE v_err text;
BEGIN
  PERFORM pg_temp.assume_role('a5000000-0000-4000-8000-000000000003');
  BEGIN
    PERFORM public.discard_agreement_parts('a5300000-0000-4000-8000-000000000010');
    ASSERT false, 'an outsider must not discard a studio''s parts';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_err LIKE 'draft proposal % not found or access denied',
    format('the outsider learns nothing else: %L', v_err);

  PERFORM pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
  v_err := NULL;
  BEGIN
    -- 'a5…0001' was sent in (7)(8) above and still carries its nine parts.
    PERFORM public.discard_agreement_parts('a5300000-0000-4000-8000-000000000001');
    ASSERT false, 'a sent agreement''s parts must not be discardable';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE 'draft proposal % not found or access denied',
    format('R6: the parts freeze at send: %L', v_err);
  ASSERT (SELECT count(*) FROM public.proposal_agreement_parts
          WHERE proposal_id = 'a5300000-0000-4000-8000-000000000001') > 0,
    'the sent agreement keeps every part it was sent with';

  RAISE NOTICE 'PASS 30: the composing door opens both ways — draft-only, author-only, and it moves no money (N-8)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (31) THE SAVE HANDS BACK WHAT IT WROTE.
--
-- upsert_agreement_parts is DELETE-then-INSERT: every part comes back
-- re-keyed. A room that kept the array it sent would be holding ids the table
-- no longer has, and the next save would read as a rename of every part. So
-- the RPC returns the saved rows in order, the way materialize_standard_parts
-- already did — one round trip, one truth, and no second fetch to reconcile.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_agreement('a5300000-0000-4000-8000-000000000011', 'The saved composition');

DO $$
DECLARE v_saved jsonb; v_returned uuid[]; v_stored uuid[];
BEGIN
  v_saved := public.upsert_agreement_parts(
    'a5300000-0000-4000-8000-000000000011',
    jsonb_build_array(
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.services',
        'title', 'Services', 'required', true,
        'payload', jsonb_build_object('body', 'Full-service interior design.')),
      jsonb_build_object('kind', 'schedule', 'variant', 'flat',
        'partKey', 'custom.flat-fee', 'title', 'Design fee',
        'payload', jsonb_build_object('cents', 4500000)),
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.terms',
        'title', 'Terms', 'required', true,
        'payload', jsonb_build_object('body', 'Paid in three instalments.'))));

  ASSERT jsonb_typeof(v_saved->'parts') = 'array'
     AND jsonb_array_length(v_saved->'parts') = 3,
    format('the save hands back the parts it wrote: %s', v_saved::text);

  SELECT array_agg((e.part->>'id')::uuid ORDER BY (e.part->>'position')::integer)
  INTO v_returned FROM jsonb_array_elements(v_saved->'parts') AS e(part);
  SELECT array_agg(ap.id ORDER BY ap.position) INTO v_stored
  FROM public.proposal_agreement_parts ap
  WHERE ap.proposal_id = 'a5300000-0000-4000-8000-000000000011';
  ASSERT v_returned = v_stored,
    'the ids handed back are the ids the table now holds';

  ASSERT (SELECT e.part->>'title' FROM jsonb_array_elements(v_saved->'parts') AS e(part)
          WHERE (e.part->>'position')::integer = 2) = 'Design fee',
    'the returned rows carry the composition''s own order';

  RAISE NOTICE 'PASS 31: the save returns the saved rows, re-keyed, in order';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (32) (33) B-7 AND B-8 — THE RETIRED DOOR.
--
-- Seeding is the act that makes a document composed. materialize_standard_parts
-- did not widen 'legacy' -> 'design_services' the way upsert_agreement_parts
-- does, and the client's bundle takes a RETIRED early-return for a legacy
-- kind — so the nine parts were hashed into the fingerprint she signs against
-- and shown on no page she reads. And that early-return omitted `parts`
-- entirely, against contract §2.4's "always present, [] when there are none".
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');

INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, description,
  total_amount, status, valid_until, document_kind
) VALUES
  ('a5300000-0000-4000-8000-000000000012',
   'a5000000-0000-4000-8000-000000000001',
   'a5200000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000004',
   'The retired agreement, opened', 'Authored before parts.', 0, 'draft',
   DATE '2027-06-01', 'legacy'),
  ('a5300000-0000-4000-8000-000000000013',
   'a5000000-0000-4000-8000-000000000001',
   'a5200000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000004',
   'The retired agreement, untouched', 'Authored before parts.', 0, 'draft',
   DATE '2027-06-01', 'legacy');

-- A retired document that the client can read is one that was SENT before
-- 00412 existed. `send_proposal` is the only legal road into 'sent' today
-- (guard_proposal_authority), and it is not the road this fixture travelled,
-- so the fixture is placed the way this file already places profiles.
SET LOCAL session_replication_role = replica;
UPDATE public.proposals
SET status = 'sent', sent_at = now()
WHERE id = 'a5300000-0000-4000-8000-000000000013';
SET LOCAL session_replication_role = origin;

DO $$
DECLARE v_seeded jsonb; v_kind text;
BEGIN
  ASSERT (SELECT p.document_kind FROM public.proposals p
          WHERE p.id = 'a5300000-0000-4000-8000-000000000012') = 'legacy',
    'the fixture must start on the retired kind';

  v_seeded := public.materialize_standard_parts('a5300000-0000-4000-8000-000000000012');
  ASSERT (v_seeded->>'materialized')::boolean, 'a retired draft still composes';
  ASSERT (v_seeded->>'partCount')::integer = 9, 'nine parts either way';

  SELECT p.document_kind INTO v_kind FROM public.proposals p
  WHERE p.id = 'a5300000-0000-4000-8000-000000000012';
  ASSERT v_kind = 'design_services',
    format('B-7: seeding must widen the kind the way saving does, got %L', v_kind);

  RAISE NOTICE 'PASS 32: composing a retired agreement widens its kind (B-7)';
END $$;

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000004');

DO $$
DECLARE v_bundle jsonb;
BEGIN
  v_bundle := public.get_client_commercial_document_bundle(
    'a5300000-0000-4000-8000-000000000013');
  ASSERT (v_bundle->'document'->>'retired')::boolean,
    'the untouched fixture must still take the retired early-return';
  ASSERT v_bundle ? 'parts',
    format('B-8: the parts key is present on every document: %s', v_bundle::text);
  ASSERT v_bundle->'parts' = '[]'::jsonb,
    format('B-8: a document with no parts answers []: %s', (v_bundle->'parts')::text);

  RAISE NOTICE 'PASS 33: the retired bundle answers the parts key too (B-8)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (34) B-9 — A BACK-DATED RATE STAYS BACK-DATED.
--
-- classify_project_time_entry_authority filters authority rates on
-- `effective_at <= started_at`. v_rates built only version / roleName /
-- hourlyRateCents / sortOrder, so the projection fell to now() for every
-- role: a rate written for January stopped applying to January's hours the
-- first time the agreement was opened in the Contract Room and saved.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_agreement('a5300000-0000-4000-8000-000000000014', 'The back-dated rate');

DO $$
DECLARE v_before timestamptz; v_after timestamptz; v_parts jsonb; v_seeded text;
BEGIN
  SELECT r.effective_at INTO v_before FROM public.proposal_service_rates r
  WHERE r.proposal_id = 'a5300000-0000-4000-8000-000000000014';
  ASSERT v_before = TIMESTAMPTZ '2026-01-01 00:00:00',
    format('the fixture must carry a back-dated rate, got %L', v_before);

  PERFORM public.materialize_standard_parts('a5300000-0000-4000-8000-000000000014');

  SELECT ap.payload->'roles'->0->>'effectiveAt' INTO v_seeded
  FROM public.proposal_agreement_parts ap
  WHERE ap.proposal_id = 'a5300000-0000-4000-8000-000000000014'
    AND ap.part_key = 'patina.role_rates';
  ASSERT v_seeded IS NOT NULL AND v_seeded::timestamptz = v_before,
    format('B-9: the seeded rate card must carry the date beside the rate, got %L', v_seeded);

  -- The composition the room would send back, unchanged.
  SELECT jsonb_agg(jsonb_build_object(
    'kind', ap.kind, 'variant', ap.variant, 'partKey', ap.part_key,
    'title', ap.title, 'payload', ap.payload,
    'required', ap.required, 'clientVisible', ap.client_visible
  ) ORDER BY ap.position) INTO v_parts
  FROM public.proposal_agreement_parts ap
  WHERE ap.proposal_id = 'a5300000-0000-4000-8000-000000000014';

  PERFORM public.upsert_agreement_parts('a5300000-0000-4000-8000-000000000014', v_parts);

  SELECT r.effective_at INTO v_after FROM public.proposal_service_rates r
  WHERE r.proposal_id = 'a5300000-0000-4000-8000-000000000014';
  ASSERT v_after = v_before,
    format('B-9: the parts door re-stamped a back-dated rate: %L -> %L', v_before, v_after);

  RAISE NOTICE 'PASS 34: a rate carries the date it took effect through the parts door (B-9)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (35) R3-5 — A DEPOSIT NOBODY SET IS NOT A TERM.
--
-- materialize_standard_parts fell back to the literal 50 — the percentage the
-- separate furnishings authorization defaults to, a house constant nobody
-- typed on THIS agreement. Seeded client-visible, it printed "50% deposit" on
-- the page the homeowner signs, three paragraphs above the sentence saying
-- furnishings require a separate named authorization.
--
-- This case runs last: it clears the studio's default deposit so that neither
-- source has anything to say.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE public.studio_agreement_defaults SET deposit_percent = NULL
WHERE studio_id = 'a5100000-0000-4000-8000-000000000001';

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');

INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, description,
  total_amount, status, valid_until, document_kind
) VALUES (
  'a5300000-0000-4000-8000-000000000015',
  'a5000000-0000-4000-8000-000000000001',
  'a5200000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000004',
  'The agreement nobody priced', 'No terms row yet.', 0, 'draft',
  DATE '2027-06-01', 'design_services');

DO $$
DECLARE v_percent jsonb; v_stored numeric;
BEGIN
  PERFORM public.materialize_standard_parts('a5300000-0000-4000-8000-000000000015');

  SELECT ap.payload->'depositPercent' INTO v_percent
  FROM public.proposal_agreement_parts ap
  WHERE ap.proposal_id = 'a5300000-0000-4000-8000-000000000015'
    AND ap.part_key = 'patina.deposit';
  ASSERT jsonb_typeof(v_percent) = 'null',
    format('R3-5: an unset deposit must stay unset, got %s', v_percent::text);

  -- And the studio's own default still seeds when the studio HAS one.
  UPDATE public.studio_agreement_defaults SET deposit_percent = 30
  WHERE studio_id = 'a5100000-0000-4000-8000-000000000001';
  PERFORM public.discard_agreement_parts('a5300000-0000-4000-8000-000000000015');
  PERFORM public.materialize_standard_parts('a5300000-0000-4000-8000-000000000015');

  SELECT (ap.payload->>'depositPercent')::numeric INTO v_stored
  FROM public.proposal_agreement_parts ap
  WHERE ap.proposal_id = 'a5300000-0000-4000-8000-000000000015'
    AND ap.part_key = 'patina.deposit';
  ASSERT v_stored = 30,
    format('R3-5: a percent the studio DID set still seeds, got %s', v_stored);

  RAISE NOTICE 'PASS 35: a furnishings deposit nobody set is not seeded as a term (R3-5)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (36) R22 — THE FEE HALF OF R4'S FLOOR.
--
-- R4 is "one typed money part for a class that bills; a ceiling part is
-- required whenever a rate card is present". 00575 implemented the ceiling
-- clause at every door and the fee clause nowhere, so the reviewer's two
-- probes both went out:
--
--   R3 · a composition of two clause parts and NO money part at all → SENT.
--   Q5 · a rate card AND a ceiling, both client_visible = false → SENT: the
--        homeowner signed a page with no money on it while countersign
--        snapshotted an hourly authority behind it.
--
-- Both are pinned here at the send door, in the readiness panel's own
-- sentence. A ceiling is a cap on a fee and not a fee, so it does not answer
-- the question on its own; a flat fee does. Each of them SAVES first: an
-- agreement is composed one part at a time and the fee may be the last one
-- typed, so the save door judges nothing (walk r1, B1).
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_agreement('a5300000-0000-4000-8000-000000000016', 'The agreement that names no fee');

DO $$
DECLARE v_err text;
BEGIN
  -- R3 · prose only. It saves, and it does not leave draft.
  PERFORM public.upsert_agreement_parts(
    'a5300000-0000-4000-8000-000000000016',
    jsonb_build_array(
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.services',
        'title', 'Services', 'required', true,
        'payload', jsonb_build_object('body', 'Full-service interior design.')),
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.terms',
        'title', 'Terms', 'required', true,
        'payload', jsonb_build_object('body', 'Billed as agreed.'))));
  ASSERT (SELECT count(*) FROM public.proposal_agreement_parts
          WHERE proposal_id = 'a5300000-0000-4000-8000-000000000016') = 2,
    'R22: a composition with no money part yet is a draft, and drafts save';
  BEGIN
    PERFORM pg_temp.send_agreement('a5300000-0000-4000-8000-000000000016');
    ASSERT false, 'R3: a composition with no money part must not send';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.',
    format('R22: the send door asks the fee floor in the room''s words: %L', v_err);
  ASSERT (SELECT commercial_state FROM public.proposals
          WHERE id = 'a5300000-0000-4000-8000-000000000016') = 'draft',
    'R22: the refused document stays a draft';

  -- A ceiling is a cap on a fee, not a fee. Alone it answers nothing.
  v_err := NULL;
  PERFORM public.upsert_agreement_parts(
    'a5300000-0000-4000-8000-000000000016',
    jsonb_build_array(
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.services',
        'title', 'Services', 'required', true,
        'payload', jsonb_build_object('body', 'Full-service interior design.')),
      jsonb_build_object('kind', 'schedule', 'variant', 'ceiling',
        'partKey', 'patina.ceiling', 'title', 'Ceiling',
        'payload', jsonb_build_object('cents', 2400000))));
  ASSERT public._agreement_fee_unnamed('a5300000-0000-4000-8000-000000000016'),
    'R22: a ceiling is not a fee';
  BEGIN
    PERFORM pg_temp.send_agreement('a5300000-0000-4000-8000-000000000016');
    ASSERT false, 'R22: a lone ceiling must not satisfy the fee floor';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.',
    format('R22: a ceiling is not a fee: %L', v_err);

  -- Q5 · a rate card and a ceiling the studio kept to itself. The ceiling half
  -- of the floor is satisfied (both parts exist, and both are hidden together),
  -- so this is the fee half or nothing.
  v_err := NULL;
  PERFORM public.upsert_agreement_parts(
    'a5300000-0000-4000-8000-000000000016',
    jsonb_build_array(
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.services',
        'title', 'Services', 'required', true,
        'payload', jsonb_build_object('body', 'Full-service interior design.')),
      jsonb_build_object('kind', 'schedule', 'variant', 'rate_card',
        'partKey', 'patina.role_rates', 'title', 'Role rates',
        'clientVisible', false,
        'payload', jsonb_build_object('roles', jsonb_build_array(
          jsonb_build_object('roleName', 'Lead Designer', 'hourlyRateCents', 22500, 'sortOrder', 0)))),
      jsonb_build_object('kind', 'schedule', 'variant', 'ceiling',
        'partKey', 'patina.ceiling', 'title', 'Ceiling',
        'clientVisible', false,
        'payload', jsonb_build_object('cents', 2400000))));
  ASSERT NOT public._agreement_floor_unmet('a5300000-0000-4000-8000-000000000016'),
    'R22: the ceiling half is quiet here — this refusal is the fee half''s alone';
  BEGIN
    PERFORM pg_temp.send_agreement('a5300000-0000-4000-8000-000000000016');
    ASSERT false, 'Q5: money the homeowner never reads is not a fee she agreed to';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.',
    format('R22: the client-visible scope is what the fee floor reads: %L', v_err);

  -- A flat fee answers it, and the agreement leaves draft.
  PERFORM public.upsert_agreement_parts(
    'a5300000-0000-4000-8000-000000000016',
    jsonb_build_array(
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.services',
        'title', 'Services', 'required', true,
        'payload', jsonb_build_object('body', 'Full-service interior design.')),
      jsonb_build_object('kind', 'schedule', 'variant', 'flat',
        'partKey', 'patina.flat', 'title', 'Flat fee',
        'payload', jsonb_build_object('cents', 1800000))));
  ASSERT NOT public._agreement_fee_unnamed('a5300000-0000-4000-8000-000000000016'),
    'R22: a flat fee names the fee';
  PERFORM pg_temp.send_agreement('a5300000-0000-4000-8000-000000000016');
  ASSERT (SELECT commercial_state FROM public.proposals
          WHERE id = 'a5300000-0000-4000-8000-000000000016') = 'sent',
    'R22: an agreement that names its fee still sends';
END $$;

-- And the send door asks it too, for a composition that reached draft naming a
-- fee and then had that fee taken off the homeowner's page.
SELECT pg_temp.mint_agreement('a5300000-0000-4000-8000-000000000017', 'The agreement whose fee went quiet');
SELECT pg_temp.mint_agreement('a5300000-0000-4000-8000-000000000018', 'The seven-facet agreement');

DO $$
DECLARE v_err text;
BEGIN
  PERFORM public.upsert_agreement_parts(
    'a5300000-0000-4000-8000-000000000017', pg_temp.base_parts());

  -- Hidden on the parts themselves, as the owner of the table — the only hand
  -- left once R17(c) took the write set, standing in for a writer a later wave
  -- may grant.
  UPDATE public.proposal_agreement_parts SET client_visible = false
  WHERE proposal_id = 'a5300000-0000-4000-8000-000000000017'
    AND kind = 'schedule' AND variant IN ('rate_card', 'ceiling');

  ASSERT public._agreement_fee_unnamed('a5300000-0000-4000-8000-000000000017'),
    'R22: the predicate sees a page with no money on it';
  BEGIN
    PERFORM pg_temp.send_agreement('a5300000-0000-4000-8000-000000000017');
    ASSERT false, 'R22: an agreement naming no fee must not send';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.',
    format('R22: the send door asks the fee floor: %L', v_err);
  ASSERT (SELECT commercial_state FROM public.proposals
          WHERE id = 'a5300000-0000-4000-8000-000000000017') = 'draft',
    'R22: the refused document stays a draft';

  -- The paper door is the same issuance by another route.
  v_err := NULL;
  BEGIN
    PERFORM public._issue_design_services_agreement_on_paper(
      'a5300000-0000-4000-8000-000000000017');
    ASSERT false, 'R22: the paper door refuses on the same ground';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.',
    format('R22: the paper door asks the fee floor: %L', v_err);

  -- And a document with NO parts is never asked: the flag-off contract is
  -- exactly what it was.
  ASSERT NOT public._agreement_fee_unnamed('a5300000-0000-4000-8000-000000000018'),
    'R22: a parts-less document is not asked the fee question';

  RAISE NOTICE 'PASS 36: R4''s fee floor stands at the send and paper doors, and the unfinished draft still saves (R22)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (37) R28 — NOTHING THE DESIGNER DID NOT TYPE IS SEEDED AS A TERM.
--
-- materialize_standard_parts fell back to a retainer of 0 and a billing
-- cadence of 'monthly' for a draft that carries no terms row at all. The
-- cadence in particular printed "Monthly" on the page the homeowner signs,
-- under a schedule nobody had chosen. Every seeded money part now comes from
-- a value somebody set — this document's terms row, or the studio's defaults —
-- or is left unset.
-- ═══════════════════════════════════════════════════════════════════════════

-- `cadence` is NOT NULL on the defaults row, so "the studio has not said" is
-- the absence of the row itself. This case runs after every other use of it.
DELETE FROM public.studio_agreement_defaults
WHERE studio_id = 'a5100000-0000-4000-8000-000000000001';

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');

INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, description,
  total_amount, status, valid_until, document_kind
) VALUES (
  'a5300000-0000-4000-8000-000000000019',
  'a5000000-0000-4000-8000-000000000001',
  'a5200000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000004',
  'The agreement with no terms row', 'Nothing typed yet.', 0, 'draft',
  DATE '2027-06-01', 'design_services');

DO $$
DECLARE v_retainer jsonb; v_cadence jsonb; v_stored text;
BEGIN
  PERFORM public.materialize_standard_parts('a5300000-0000-4000-8000-000000000019');

  SELECT ap.payload->'cents' INTO v_retainer
  FROM public.proposal_agreement_parts ap
  WHERE ap.proposal_id = 'a5300000-0000-4000-8000-000000000019'
    AND ap.part_key = 'patina.retainer';
  ASSERT jsonb_typeof(v_retainer) = 'null',
    format('R28: a retainer nobody typed stays unset, got %s', v_retainer::text);

  -- R28 amended: a cadence is not an amount. The composed room's select shows
  -- Monthly preselected and the seven-facet room writes 'monthly' onto exactly
  -- this draft, so the part carries what the editor shows — otherwise readiness
  -- asked for a cadence the designer could see was already chosen, and
  -- re-picking the selected option fires no change event to clear it (walk r1,
  -- M3).
  SELECT ap.payload->'cadence' INTO v_cadence
  FROM public.proposal_agreement_parts ap
  WHERE ap.proposal_id = 'a5300000-0000-4000-8000-000000000019'
    AND ap.part_key = 'patina.cadence';
  ASSERT v_cadence = to_jsonb('monthly'::text),
    format('R28 amended: the cadence part says what the editor shows, got %s', v_cadence::text);

  -- A cadence the studio DID set still seeds.
  INSERT INTO public.studio_agreement_defaults (studio_id, cadence)
  VALUES ('a5100000-0000-4000-8000-000000000001', 'biweekly');
  PERFORM public.discard_agreement_parts('a5300000-0000-4000-8000-000000000019');
  PERFORM public.materialize_standard_parts('a5300000-0000-4000-8000-000000000019');

  SELECT ap.payload->>'cadence' INTO v_stored
  FROM public.proposal_agreement_parts ap
  WHERE ap.proposal_id = 'a5300000-0000-4000-8000-000000000019'
    AND ap.part_key = 'patina.cadence';
  ASSERT v_stored = 'biweekly',
    format('R28: a cadence the studio set still seeds, got %L', v_stored);

  RAISE NOTICE 'PASS 37: a retainer nobody typed is not seeded as a term, and the cadence says what the editor shows (R28)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (38) R25 — THE BUNDLE SAYS WHETHER THE DOCUMENT IS COMPOSED.
--
-- The client shell branches on `composed`, and until now nothing in the stack
-- produced the key: the `??` fell through to `parts.length > 0`, which is a
-- different question. `parts` is filtered to client_visible, so an agreement
-- whose every part the studio kept arrives with `parts: []` and would have
-- rendered from the terms row — the very figures the studio hid.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.mint_agreement('a5300000-0000-4000-8000-000000000020', 'The uncomposed agreement');

DO $$
BEGIN
  PERFORM pg_temp.send_agreement('a5300000-0000-4000-8000-000000000020');
END $$;

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000004');

DO $$
DECLARE v_composed jsonb; v_plain jsonb; v_retired jsonb;
BEGIN
  v_composed := public.get_client_commercial_document_bundle(
    'a5300000-0000-4000-8000-000000000001');
  ASSERT v_composed ? 'composed', 'R25: the key is on every bundle';
  ASSERT (v_composed->>'composed')::boolean,
    'R25: an agreement with parts is composed';

  v_plain := public.get_client_commercial_document_bundle(
    'a5300000-0000-4000-8000-000000000020');
  ASSERT v_plain ? 'composed', 'R25: the key is on every bundle';
  ASSERT NOT (v_plain->>'composed')::boolean,
    'R25: an agreement with no parts is not composed';

  v_retired := public.get_client_commercial_document_bundle(
    'a5300000-0000-4000-8000-000000000013');
  ASSERT v_retired ? 'composed' AND NOT (v_retired->>'composed')::boolean,
    'R25: the retired early-return answers the key too';

  RAISE NOTICE 'PASS 38: the bundle says composed, over every part and not only the visible ones (R25)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (39) M4 — THE PAPER DOOR THE STUDIO IS OFFERED CAN OPEN.
--
-- Three of the four paper/portal doors learned _agreement_requires_rate_card
-- in this file; _record_paper_client_signature_impl (00425:416, renamed at
-- 00462:1797) did not, so a composed FLAT-FEE agreement — legal, sendable,
-- signable in the portal — could be sent and then never recorded on paper:
-- 'design services agreement requires terms and at least one role rate', for
-- an agreement that correctly carries none. The walk could not complete the
-- flat-fee half of the paper act at all.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.assume_user('a5000000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_agreement('a5300000-0000-4000-8000-000000000021', 'The flat-fee agreement on paper');

DO $$
DECLARE v_recorded jsonb;
BEGIN
  PERFORM public.upsert_agreement_parts(
    'a5300000-0000-4000-8000-000000000021',
    jsonb_build_array(
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.services',
        'title', 'Services', 'required', true,
        'payload', jsonb_build_object('body', 'A fixed scope, for a fixed fee.')),
      jsonb_build_object('kind', 'schedule', 'variant', 'flat',
        'partKey', 'custom.flat_fee', 'title', 'Flat fee',
        'payload', jsonb_build_object('cents', 1800000)),
      jsonb_build_object('kind', 'clause', 'partKey', 'patina.terms',
        'title', 'Terms', 'required', true,
        'payload', jsonb_build_object('body', 'Payable on the agreed cadence.'))));
  ASSERT (SELECT count(*) FROM public.proposal_service_rates
          WHERE proposal_id = 'a5300000-0000-4000-8000-000000000021') = 0,
    'M4: the fixture is exactly the shape that used to be stranded — no role rate';

  PERFORM pg_temp.send_agreement('a5300000-0000-4000-8000-000000000021');

  v_recorded := public.record_paper_client_signature(
    'a5300000-0000-4000-8000-000000000021', 'Paper Client', DATE '2026-09-01');
  ASSERT (v_recorded->>'recorded')::boolean,
    'M4: a composed flat-fee agreement records the printed signature';
  ASSERT (v_recorded->>'commercialState') = 'client_signed',
    format('M4: and reaches client_signed, got %L', v_recorded->>'commercialState');

  RAISE NOTICE 'M4: the paper signature door asks for a rate card only when the agreement carries one';
END $$;

-- And the four doors ask ONE question. The walk found this by catalog: three
-- routines carried the predicate and the fourth did not, which is exactly how
-- an agreement could pass three doors and be stopped at the last one. A
-- parts-less document still owes its rates everywhere — the predicate answers
-- TRUE for one — so the contract before 00575 is unmoved at every door.
DO $$
DECLARE v_doors text[];
BEGIN
  SELECT array_agg(p.proname ORDER BY p.proname) INTO v_doors
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'send_commercial_document',
      '_sign_design_services_agreement_authorized',
      '_issue_design_services_agreement_on_paper',
      '_record_paper_client_signature_impl')
    AND position('_agreement_requires_rate_card' IN p.prosrc) > 0;
  ASSERT v_doors = ARRAY[
    '_issue_design_services_agreement_on_paper',
    '_record_paper_client_signature_impl',
    '_sign_design_services_agreement_authorized',
    'send_commercial_document'],
    format('M4: every door asks the rate-card question, got %s', v_doors::text);

  ASSERT public._agreement_requires_rate_card('a5300000-0000-4000-8000-000000000020'),
    'M4: a parts-less document still owes a rate card at every one of them';

  RAISE NOTICE 'PASS 39: the paper signature door opens for a composed flat fee, and all four doors ask one question (M4)';
END $$;

ROLLBACK;
