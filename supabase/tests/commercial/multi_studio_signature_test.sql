-- ═══════════════════════════════════════════════════════════════════════════
-- 00566 — Multi-studio signature test.
-- Runner: plain psql, ON_ERROR_STOP=1. Single transaction, ROLLBACK at the end.
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/commercial/multi_studio_signature_test.sql
--
-- THE DEFECT 00566 CLOSES. guard_commercial_signature_insert asked
-- `1 = count(DISTINCT studio.id)` over the studios the lead designer and the
-- recording actor share, and _countersign_design_services_agreement_impl asked
-- the same twice more. A designer in TWO active design studios therefore could
-- not have a paper client signature recorded on an ORIGIN (project_id NULL)
-- design-services agreement, and could not countersign one.
--
--   (1) TWO STUDIOS — the case that failed. Paper signature recorded,
--       countersigned, engagement executed, and the resulting project belongs
--       to a studio the lead designer actually holds.
--   (2) ONE STUDIO — the case that already worked, unchanged.
--   (3) FALSIFIABILITY — the guard is still a guard. An actor who shares NO
--       studio with the lead is refused in the guard's own words, and the
--       refusal is shown to come from the guard rather than from the impl.
--   (4) CO-MEMBER, RESOLUTION AGREES. Lead in studios A+B, countersigned by a
--       co-member of B alone, where 00563's lead-only order picks B. The
--       countersign lands, and the project's studio_id is B exactly.
--   (5) CO-MEMBER, RESOLUTION DISAGREES. Same shape, but the lead-only order
--       picks A — the studio the co-member does not hold. 00566 resolves the
--       studio the way the project insert will, finds the countersigner has
--       no standing in it, and refuses in the impl's own access-denied words
--       instead of dying later inside set_project_studio_id. No project.
--   (6) THE ORDER IS PINNED. Lead in A+B with an existing sibling project for
--       this exact designer-client pair in B: the countersign lands studio B,
--       even though the owner/joined_at legs alone would have picked A.
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

-- guard_commercial_signature_insert short-circuits for a bare superuser session
-- (00462:1948-1953): current_user = session_user = postgres with no role GUC
-- set returns NEW unchecked. This suite is ABOUT that guard, so every signing
-- call arrives as a real caller does — role set, bypass not applicable.
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

CREATE OR REPLACE FUNCTION pg_temp.paper_date() RETURNS date
LANGUAGE sql IMMUTABLE AS $$ SELECT (DATE '2026-01-15') $$;
GRANT EXECUTE ON FUNCTION pg_temp.paper_date() TO PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════
-- (0) FIXTURE
--     · TWO-STUDIO designer, active owner of both studios, and their client.
--     · ONE-STUDIO designer and their client — the control.
--     · An outsider who holds a studio of their own and shares none.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('2b000000-0000-4000-8000-000000000001', 'ms-two-studio-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('2b000000-0000-4000-8000-000000000002', 'ms-two-studio-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('2b000000-0000-4000-8000-000000000003', 'ms-one-studio-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('2b000000-0000-4000-8000-000000000004', 'ms-one-studio-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('2b000000-0000-4000-8000-000000000005', 'ms-outsider@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

-- is_designer = true auto-provisions a personal studio (00295), which would
-- silently give every designer here one more studio than the fixture states.
-- Suppress provisioning so the studio counts below are exactly as written.
SET LOCAL session_replication_role = replica;
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('2b000000-0000-4000-8000-000000000001', 'ms-two-studio-designer@test.invalid', 'Two Studio Designer', true, now(), now()),
  ('2b000000-0000-4000-8000-000000000002', 'ms-two-studio-client@test.invalid', 'Two Studio Client', false, now(), now()),
  ('2b000000-0000-4000-8000-000000000003', 'ms-one-studio-designer@test.invalid', 'One Studio Designer', true, now(), now()),
  ('2b000000-0000-4000-8000-000000000004', 'ms-one-studio-client@test.invalid', 'One Studio Client', false, now(), now()),
  ('2b000000-0000-4000-8000-000000000005', 'ms-outsider@test.invalid', 'Outside Designer', true, now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;
SET LOCAL session_replication_role = origin;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('2b100000-0000-4000-8000-000000000001', 'design_studio', 'Multi Studio One', 'ms-studio-one-test', 'active'),
  ('2b100000-0000-4000-8000-000000000002', 'design_studio', 'Multi Studio Two', 'ms-studio-two-test', 'active'),
  ('2b100000-0000-4000-8000-000000000003', 'design_studio', 'Solo Studio', 'ms-solo-studio-test', 'active'),
  ('2b100000-0000-4000-8000-000000000004', 'design_studio', 'Outside Studio', 'ms-outside-studio-test', 'active');

SELECT pg_temp.assume_user('2b000000-0000-4000-8000-000000000001', 'service_role');
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  -- The designer at the centre of the defect: active owner of TWO studios.
  ('2b110000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001',
   '2b100000-0000-4000-8000-000000000001', 'owner', 'active', now() - interval '2 days'),
  ('2b110000-0000-4000-8000-000000000002', '2b000000-0000-4000-8000-000000000001',
   '2b100000-0000-4000-8000-000000000002', 'owner', 'active', now() - interval '1 day'),
  ('2b110000-0000-4000-8000-000000000003', '2b000000-0000-4000-8000-000000000003',
   '2b100000-0000-4000-8000-000000000003', 'owner', 'active', now()),
  ('2b110000-0000-4000-8000-000000000004', '2b000000-0000-4000-8000-000000000005',
   '2b100000-0000-4000-8000-000000000004', 'owner', 'active', now());

-- The origin-agreement legs require the agreement's designer to hold a
-- designer-domain role.
INSERT INTO public.user_roles (user_id, role_id, granted_by)
SELECT designer.id, role.id, designer.id
FROM (VALUES
  ('2b000000-0000-4000-8000-000000000001'::uuid),
  ('2b000000-0000-4000-8000-000000000003'::uuid),
  ('2b000000-0000-4000-8000-000000000005'::uuid)
) AS designer(id)
CROSS JOIN public.roles AS role
WHERE role.name = 'studio_owner';

INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, status, source)
VALUES
  ('2b200000-0000-4000-8000-000000000001',
   '2b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000002',
   'Two Studio Client', 'proposal', 'direct'),
  ('2b200000-0000-4000-8000-000000000002',
   '2b000000-0000-4000-8000-000000000003', '2b000000-0000-4000-8000-000000000004',
   'One Studio Client', 'proposal', 'direct');

-- The fixture states the defect's precondition; assert it rather than trust it.
DO $$
DECLARE v_two integer; v_one integer;
BEGIN
  SELECT count(*) INTO v_two
  FROM public.organization_members m
  JOIN public.organizations o ON o.id = m.organization_id
  WHERE m.user_id = '2b000000-0000-4000-8000-000000000001'
    AND m.status = 'active' AND m.role <> 'guest'
    AND o.type = 'design_studio' AND o.status = 'active';
  SELECT count(*) INTO v_one
  FROM public.organization_members m
  JOIN public.organizations o ON o.id = m.organization_id
  WHERE m.user_id = '2b000000-0000-4000-8000-000000000003'
    AND m.status = 'active' AND m.role <> 'guest'
    AND o.type = 'design_studio' AND o.status = 'active';
  ASSERT v_two = 2, format('the two-studio designer must hold exactly 2 studios, holds %s', v_two);
  ASSERT v_one = 1, format('the control designer must hold exactly 1 studio, holds %s', v_one);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.mint_agreement(
  p_id uuid, p_designer uuid, p_client uuid, p_designer_client uuid
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.proposals (
    id, designer_id, designer_client_id, client_id, title, description,
    total_amount, status, valid_until
  ) VALUES (
    p_id, p_designer, p_designer_client, p_client,
    'Origin engagement', 'The origin document.', 0, 'draft', DATE '2027-01-01'
  );
  INSERT INTO public.proposal_phases (
    proposal_id, name, phase_key, duration_days, lane, fee_cents, sort_order
  ) VALUES (p_id, 'Design development', 'design-development', 30, 'main', 0, 0);
  PERFORM public.upsert_design_services_draft(
    p_id,
    jsonb_build_object(
      'scope', 'Whole-home interior design services.',
      'deliverables', jsonb_build_array('Concept', 'Selections', 'Installation'),
      'exclusions', jsonb_build_array('Structural engineering'),
      'billingCeilingCents', 900000,
      'retainerAmountCents', 250000,
      'retainerActivationPolicy', 'immediate',
      'billingCadence', 'monthly', 'currency', 'USD',
      'terms', 'Actual hours to the signed ceiling.',
      'currentRateVersion', 1,
      'furnishingsDepositPercent', 30
    ),
    jsonb_build_array(jsonb_build_object(
      'version', 1, 'roleName', 'Lead Designer',
      'hourlyRateCents', 15000, 'sortOrder', 0, 'effectiveAt', DATE '2026-01-01'
    ))
  );
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.mint_agreement(uuid, uuid, uuid, uuid) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.send_agreement(p_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_snapshot jsonb;
BEGIN
  v_snapshot := public.get_commercial_document_send_snapshot(p_id);
  PERFORM public.send_commercial_document(
    p_id, v_snapshot->>'documentFingerprint', NULL, TIMESTAMPTZ '2027-01-01 00:00:00+00'
  );
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.send_agreement(uuid) TO PUBLIC;

-- 01 = the two-studio designer's origin agreement. 02 = the one-studio control.
SELECT pg_temp.assume_user('2b000000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_agreement(
  '2b300000-0000-4000-8000-000000000001',
  '2b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000002',
  '2b200000-0000-4000-8000-000000000001');
SELECT pg_temp.send_agreement('2b300000-0000-4000-8000-000000000001');

SELECT pg_temp.assume_user('2b000000-0000-4000-8000-000000000003');
SELECT pg_temp.mint_agreement(
  '2b300000-0000-4000-8000-000000000002',
  '2b000000-0000-4000-8000-000000000003', '2b000000-0000-4000-8000-000000000004',
  '2b200000-0000-4000-8000-000000000002');
SELECT pg_temp.send_agreement('2b300000-0000-4000-8000-000000000002');

-- Both agreements are ORIGIN documents: project_id NULL and no binding row.
-- That is the branch 00566 changes; if this ever stops holding, the suite is
-- exercising the exact-project leg instead and proves nothing.
DO $$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id IN ('2b300000-0000-4000-8000-000000000001',
                   '2b300000-0000-4000-8000-000000000002')
      AND (p.project_id IS NOT NULL OR p.commercial_state <> 'sent')
  ), 'both fixtures must be sent origin agreements with no project';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    WHERE d.proposal_id IN ('2b300000-0000-4000-8000-000000000001',
                            '2b300000-0000-4000-8000-000000000002')
  ), 'an origin agreement carries no commercial-document binding yet';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (1) TWO STUDIOS — the case the count predicate refused.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_recorded jsonb;
  v_executed jsonb;
  v_project_id uuid;
  v_studio_id uuid;
BEGIN
  PERFORM pg_temp.assume_role('2b000000-0000-4000-8000-000000000001');
  v_recorded := public.record_paper_client_signature(
    '2b300000-0000-4000-8000-000000000001', 'Two Studio Client',
    pg_temp.paper_date(), NULL::uuid, false
  );
  PERFORM pg_temp.reset_role();

  ASSERT v_recorded->>'commercialState' = 'client_signed'
     AND (v_recorded->>'newlyClientSigned')::boolean
     AND (v_recorded->>'recorded')::boolean
     AND (v_recorded->>'signedOnPaper')::boolean,
    format('a designer in two studios must be able to record a paper client signature: %s', v_recorded);

  -- The countersign's own origin branch carried the same predicate twice.
  PERFORM pg_temp.assume_role('2b000000-0000-4000-8000-000000000001');
  v_executed := public.countersign_design_services_agreement(
    '2b300000-0000-4000-8000-000000000001', 'Two Studio Designer'
  );
  PERFORM pg_temp.reset_role();

  ASSERT (v_executed->>'newlyExecuted')::boolean,
    format('a designer in two studios must be able to countersign: %s', v_executed);
  v_project_id := (v_executed->>'projectId')::uuid;
  ASSERT v_project_id IS NOT NULL, 'execution must land a project';

  -- Resolution, not an arbitrary pick: the project belongs to a studio the
  -- lead designer actively, non-guest holds.
  SELECT studio_id INTO v_studio_id FROM public.projects WHERE id = v_project_id;
  ASSERT v_studio_id IN ('2b100000-0000-4000-8000-000000000001',
                         '2b100000-0000-4000-8000-000000000002'),
    format('the executed project must belong to one of the lead designer''s studios, got %s', v_studio_id);
  ASSERT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = v_studio_id
      AND m.user_id = '2b000000-0000-4000-8000-000000000001'
      AND m.status = 'active' AND m.role <> 'guest'
  ), 'the resolved studio must be one the lead designer actively holds';

  RAISE NOTICE 'PASS 1: a two-studio designer records a paper signature and countersigns';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (2) ONE STUDIO — the case that already worked, unchanged.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_recorded jsonb;
  v_executed jsonb;
BEGIN
  PERFORM pg_temp.assume_role('2b000000-0000-4000-8000-000000000003');
  v_recorded := public.record_paper_client_signature(
    '2b300000-0000-4000-8000-000000000002', 'One Studio Client',
    pg_temp.paper_date(), NULL::uuid, false
  );
  PERFORM pg_temp.reset_role();

  ASSERT v_recorded->>'commercialState' = 'client_signed'
     AND (v_recorded->>'newlyClientSigned')::boolean
     AND (v_recorded->>'recorded')::boolean,
    format('the single-studio rail must be unchanged: %s', v_recorded);

  PERFORM pg_temp.assume_role('2b000000-0000-4000-8000-000000000003');
  v_executed := public.countersign_design_services_agreement(
    '2b300000-0000-4000-8000-000000000002', 'One Studio Designer'
  );
  PERFORM pg_temp.reset_role();

  ASSERT (v_executed->>'newlyExecuted')::boolean,
    format('the single-studio countersign must be unchanged: %s', v_executed);
  ASSERT (SELECT studio_id FROM public.projects WHERE id = (v_executed->>'projectId')::uuid)
         = '2b100000-0000-4000-8000-000000000003',
    'the single-studio engagement lands in that designer''s only studio';

  RAISE NOTICE 'PASS 2: the single-studio rail is unchanged';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (3) THE GUARD IS STILL A GUARD. Zero shared studios still fails closed, and
--     the refusal comes from guard_commercial_signature_insert itself — proven
--     by removing the impl's own authorship gate inside a SAVEPOINT and
--     watching the trigger refuse on its own. FALSIFY.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.assume_user('2b000000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_agreement(
  '2b300000-0000-4000-8000-000000000003',
  '2b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000002',
  '2b200000-0000-4000-8000-000000000001');
SELECT pg_temp.send_agreement('2b300000-0000-4000-8000-000000000003');

DO $$
DECLARE v_err text; v_state text;
BEGIN
  BEGIN
    PERFORM pg_temp.assume_role('2b000000-0000-4000-8000-000000000005');
    PERFORM public.record_paper_client_signature(
      '2b300000-0000-4000-8000-000000000003', 'Two Studio Client',
      pg_temp.paper_date(), NULL::uuid, false
    );
    PERFORM pg_temp.reset_role();
    ASSERT false, 'an outsider must not be able to record another studio''s paper signature';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_err := SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_err IS NOT NULL, 'the outsider call must have refused';
  SELECT commercial_state INTO v_state FROM public.proposals
  WHERE id = '2b300000-0000-4000-8000-000000000003';
  ASSERT v_state = 'sent',
    format('a refused paper record must leave the document sent, found %s', v_state);
  RAISE NOTICE 'PASS 3a: an outsider is refused (%)', v_err;
END $$;

SAVEPOINT falsify_guard;

-- Remove the impl's own authorship gate. What is left standing between the
-- outsider and the signature row is guard_commercial_signature_insert alone.
CREATE OR REPLACE FUNCTION public._can_author_proposal(p_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT true $$;

DO $$
DECLARE v_err text; v_sqlstate text;
BEGIN
  BEGIN
    PERFORM pg_temp.assume_role('2b000000-0000-4000-8000-000000000005');
    PERFORM public.record_paper_client_signature(
      '2b300000-0000-4000-8000-000000000003', 'Two Studio Client',
      pg_temp.paper_date(), NULL::uuid, false
    );
    PERFORM pg_temp.reset_role();
    ASSERT false, 'with the impl gate gone, the trigger alone must still refuse';
  EXCEPTION WHEN check_violation THEN
    v_err := SQLERRM; v_sqlstate := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_err = 'commercial signature does not match canonical signer/state/evidence',
    format('the refusal must be the guard''s own words, got %L (%s)', v_err, v_sqlstate);
  RAISE NOTICE 'PASS 3b: the guard refuses a zero-shared-studio actor on its own';
END $$;

ROLLBACK TO SAVEPOINT falsify_guard;

-- The authorship gate is back, and the guard's words are still reachable only
-- through a real refusal.
DO $$
BEGIN
  ASSERT (SELECT prosrc FROM pg_proc WHERE oid = 'public._can_author_proposal(uuid)'::regprocedure)
         <> ' SELECT true ',
    'the savepoint rollback must have restored the real _can_author_proposal';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (4)(5)(6) A CO-MEMBER COUNTERSIGNS, AND THE ORDER IS PINNED.
--
-- 00566's origin branch resolves the authority studio over the LEAD's own
-- studios, in set_project_studio_id's order (00563:255-278) — not over the
-- lead-and-actor intersection. That matters only when the two differ, which is
-- exactly the co-member case: the lead holds A and B, the countersigner holds
-- B alone. An intersection resolves B; the project insert, which asks only
-- about the lead, stamps whatever the lead's order says. These three cases
-- hold the lead's order fixed and move the co-member across it.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('2b000000-0000-4000-8000-000000000006', 'ms-comember-b@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('2b000000-0000-4000-8000-000000000007', 'ms-order-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('2b000000-0000-4000-8000-000000000008', 'ms-order-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('2b000000-0000-4000-8000-000000000009', 'ms-order-comember@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('2b000000-0000-4000-8000-00000000000a', 'ms-split-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('2b000000-0000-4000-8000-00000000000b', 'ms-split-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('2b000000-0000-4000-8000-00000000000c', 'ms-split-comember@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

SET LOCAL session_replication_role = replica;
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('2b000000-0000-4000-8000-000000000006', 'ms-comember-b@test.invalid', 'Co-member of B', true, now(), now()),
  ('2b000000-0000-4000-8000-000000000007', 'ms-order-designer@test.invalid', 'Order Designer', true, now(), now()),
  ('2b000000-0000-4000-8000-000000000008', 'ms-order-client@test.invalid', 'Order Client', false, now(), now()),
  ('2b000000-0000-4000-8000-000000000009', 'ms-order-comember@test.invalid', 'Order Co-member', true, now(), now()),
  ('2b000000-0000-4000-8000-00000000000a', 'ms-split-designer@test.invalid', 'Split Designer', true, now(), now()),
  ('2b000000-0000-4000-8000-00000000000b', 'ms-split-client@test.invalid', 'Split Client', false, now(), now()),
  ('2b000000-0000-4000-8000-00000000000c', 'ms-split-comember@test.invalid', 'Split Co-member', true, now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;
SET LOCAL session_replication_role = origin;

-- Two more A/B studio pairs, so each case owns its own resolution order and
-- the sibling project one case plants cannot reorder another.
INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('2b100000-0000-4000-8000-000000000005', 'design_studio', 'Order Studio A', 'ms-order-a-test', 'active'),
  ('2b100000-0000-4000-8000-000000000006', 'design_studio', 'Order Studio B', 'ms-order-b-test', 'active'),
  ('2b100000-0000-4000-8000-000000000007', 'design_studio', 'Split Studio A', 'ms-split-a-test', 'active'),
  ('2b100000-0000-4000-8000-000000000008', 'design_studio', 'Split Studio B', 'ms-split-b-test', 'active');

SELECT pg_temp.assume_user('2b000000-0000-4000-8000-000000000001', 'service_role');
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  -- (4) The two-studio lead's own studios already exist: owner of studio one
  -- (joined 2 days ago) and studio two (1 day ago), so the lead-only order
  -- picks studio ONE. To make the lead's order pick studio TWO for this case
  -- we use a fresh lead instead — see the Order/Split leads below. Here the
  -- co-member simply joins studio ONE, the studio the lead's order picks.
  ('2b110000-0000-4000-8000-000000000005', '2b000000-0000-4000-8000-000000000006',
   '2b100000-0000-4000-8000-000000000001', 'member', 'active', now()),

  -- (5) Split lead: owner of Split A (joined first, so the lead-only order
  -- picks A) and member of Split B. The co-member holds Split B alone.
  ('2b110000-0000-4000-8000-000000000006', '2b000000-0000-4000-8000-00000000000a',
   '2b100000-0000-4000-8000-000000000007', 'owner', 'active', now() - interval '3 days'),
  ('2b110000-0000-4000-8000-000000000007', '2b000000-0000-4000-8000-00000000000a',
   '2b100000-0000-4000-8000-000000000008', 'member', 'active', now() - interval '1 day'),
  ('2b110000-0000-4000-8000-000000000008', '2b000000-0000-4000-8000-00000000000c',
   '2b100000-0000-4000-8000-000000000008', 'member', 'active', now()),

  -- (6) Order lead: owner of Order A joined FIRST, owner of Order B joined
  -- later. Owner-role and joined_at both point at A; only the sibling-project
  -- leg can move the answer to B.
  ('2b110000-0000-4000-8000-000000000009', '2b000000-0000-4000-8000-000000000007',
   '2b100000-0000-4000-8000-000000000005', 'owner', 'active', now() - interval '3 days'),
  ('2b110000-0000-4000-8000-00000000000a', '2b000000-0000-4000-8000-000000000007',
   '2b100000-0000-4000-8000-000000000006', 'owner', 'active', now() - interval '1 day'),
  ('2b110000-0000-4000-8000-00000000000b', '2b000000-0000-4000-8000-000000000009',
   '2b100000-0000-4000-8000-000000000006', 'member', 'active', now());

INSERT INTO public.user_roles (user_id, role_id, granted_by)
SELECT designer.id, role.id, designer.id
FROM (VALUES
  ('2b000000-0000-4000-8000-000000000006'::uuid),
  ('2b000000-0000-4000-8000-000000000007'::uuid),
  ('2b000000-0000-4000-8000-000000000009'::uuid),
  ('2b000000-0000-4000-8000-00000000000a'::uuid),
  ('2b000000-0000-4000-8000-00000000000c'::uuid)
) AS designer(id)
CROSS JOIN public.roles AS role
WHERE role.name = 'studio_owner';

INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, status, source)
VALUES
  ('2b200000-0000-4000-8000-000000000003',
   '2b000000-0000-4000-8000-000000000007', '2b000000-0000-4000-8000-000000000008',
   'Order Client', 'proposal', 'direct'),
  ('2b200000-0000-4000-8000-000000000004',
   '2b000000-0000-4000-8000-00000000000a', '2b000000-0000-4000-8000-00000000000b',
   'Split Client', 'proposal', 'direct');

-- The fixtures state each lead's resolution order; assert it rather than trust
-- it. This is the 00563 order verbatim, over the LEAD's studios alone.
CREATE OR REPLACE FUNCTION pg_temp.lead_resolves_to(p_designer uuid, p_client uuid)
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT studio.id
  FROM public.organizations AS studio
  JOIN public.organization_members AS lead_membership
    ON lead_membership.organization_id = studio.id
   AND lead_membership.user_id = p_designer
  WHERE studio.type = 'design_studio'
    AND studio.status = 'active'
    AND lead_membership.status = 'active'
    AND lead_membership.role <> 'guest'
  ORDER BY
    EXISTS (
      SELECT 1 FROM public.projects AS sibling
      WHERE sibling.studio_id = studio.id
        AND sibling.designer_id = p_designer
        AND sibling.client_id = p_client
    ) DESC,
    (lead_membership.role = 'owner') DESC,
    lead_membership.joined_at NULLS LAST,
    lead_membership.created_at,
    studio.id
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.lead_resolves_to(uuid, uuid) TO PUBLIC;

DO $$
BEGIN
  ASSERT pg_temp.lead_resolves_to(
           '2b000000-0000-4000-8000-00000000000a', '2b000000-0000-4000-8000-00000000000b'
         ) = '2b100000-0000-4000-8000-000000000007',
    'case 5 needs the split lead''s order to pick Split A, the studio the co-member does NOT hold';
  ASSERT pg_temp.lead_resolves_to(
           '2b000000-0000-4000-8000-000000000007', '2b000000-0000-4000-8000-000000000008'
         ) = '2b100000-0000-4000-8000-000000000005',
    'case 6 needs the order lead to pick Order A BEFORE the sibling project exists';
END $$;

-- ── (4) The co-member countersigns the studio the lead's order picks ────────
SELECT pg_temp.assume_user('2b000000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_agreement(
  '2b300000-0000-4000-8000-000000000004',
  '2b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000002',
  '2b200000-0000-4000-8000-000000000001');
SELECT pg_temp.send_agreement('2b300000-0000-4000-8000-000000000004');

DO $$
DECLARE
  v_recorded jsonb;
  v_executed jsonb;
  v_studio_id uuid;
  v_expected uuid;
BEGIN
  v_expected := pg_temp.lead_resolves_to(
    '2b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000002');
  ASSERT v_expected = '2b100000-0000-4000-8000-000000000001',
    format('case 4 fixture: the lead''s order must pick studio one, picked %s', v_expected);

  -- The co-member holds studio one only, so the actor's studios are a strict
  -- subset of the lead's — the case an intersection would have got right by
  -- accident and the case the project insert must agree with.
  PERFORM pg_temp.assume_role('2b000000-0000-4000-8000-000000000006');
  v_recorded := public.record_paper_client_signature(
    '2b300000-0000-4000-8000-000000000004', 'Two Studio Client',
    pg_temp.paper_date(), NULL::uuid, false
  );
  PERFORM pg_temp.reset_role();
  ASSERT v_recorded->>'commercialState' = 'client_signed',
    format('a co-member must be able to record the paper client signature: %s', v_recorded);

  PERFORM pg_temp.assume_role('2b000000-0000-4000-8000-000000000006');
  v_executed := public.countersign_design_services_agreement(
    '2b300000-0000-4000-8000-000000000004', 'Co-member of B'
  );
  PERFORM pg_temp.reset_role();
  ASSERT (v_executed->>'newlyExecuted')::boolean,
    format('a co-member of the resolved studio must be able to countersign: %s', v_executed);

  SELECT studio_id INTO v_studio_id FROM public.projects
  WHERE id = (v_executed->>'projectId')::uuid;
  ASSERT v_studio_id = '2b100000-0000-4000-8000-000000000001',
    format('the engagement must land studio one exactly, landed %s', v_studio_id);

  RAISE NOTICE 'PASS 4: a co-member countersigns and the project lands the resolved studio';
END $$;

-- ── (5) The co-member holds the studio the lead's order does NOT pick ───────
SELECT pg_temp.assume_user('2b000000-0000-4000-8000-00000000000a');
SELECT pg_temp.mint_agreement(
  '2b300000-0000-4000-8000-000000000005',
  '2b000000-0000-4000-8000-00000000000a', '2b000000-0000-4000-8000-00000000000b',
  '2b200000-0000-4000-8000-000000000004');
SELECT pg_temp.send_agreement('2b300000-0000-4000-8000-000000000005');

DO $$
DECLARE
  v_recorded jsonb;
  v_err text;
  v_sqlstate text;
  v_state text;
BEGIN
  PERFORM pg_temp.assume_role('2b000000-0000-4000-8000-00000000000c');
  v_recorded := public.record_paper_client_signature(
    '2b300000-0000-4000-8000-000000000005', 'Split Client',
    pg_temp.paper_date(), NULL::uuid, false
  );
  PERFORM pg_temp.reset_role();
  -- The guard asks only whether the actor shares a live studio with the lead,
  -- which they do (Split B). Recording is not the resolution question.
  ASSERT v_recorded->>'commercialState' = 'client_signed',
    format('the shared-studio actor must still be able to record paper: %s', v_recorded);

  BEGIN
    PERFORM pg_temp.assume_role('2b000000-0000-4000-8000-00000000000c');
    PERFORM public.countersign_design_services_agreement(
      '2b300000-0000-4000-8000-000000000005', 'Split Co-member'
    );
    PERFORM pg_temp.reset_role();
    ASSERT false,
      'a countersigner with no standing in the resolved studio must be refused';
  EXCEPTION WHEN insufficient_privilege THEN
    v_err := SQLERRM; v_sqlstate := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();

  -- The impl's own access-denied words, not set_project_studio_id's opaque
  -- 'studio_id_not_designer_studio' from deep inside the project insert.
  ASSERT v_err = format(
    'design services agreement %s not found or access denied',
    '2b300000-0000-4000-8000-000000000005'
  ), format('the refusal must be the countersign''s own words, got %L (%s)', v_err, v_sqlstate);

  SELECT commercial_state INTO v_state FROM public.proposals
  WHERE id = '2b300000-0000-4000-8000-000000000005';
  ASSERT v_state = 'client_signed',
    format('a refused countersign leaves the document client_signed, found %s', v_state);
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    WHERE d.proposal_id = '2b300000-0000-4000-8000-000000000005'
  ), 'a refused countersign must land no project';

  RAISE NOTICE 'PASS 5: the resolved studio is the lead''s, and a stranger to it is refused in the impl''s words (%)', v_err;
END $$;

-- ── (6) A sibling project for this designer-client pair pins the order ──────
SELECT pg_temp.assume_user('2b000000-0000-4000-8000-000000000007');
SELECT pg_temp.mint_agreement(
  '2b300000-0000-4000-8000-000000000006',
  '2b000000-0000-4000-8000-000000000007', '2b000000-0000-4000-8000-000000000008',
  '2b200000-0000-4000-8000-000000000003');
SELECT pg_temp.send_agreement('2b300000-0000-4000-8000-000000000006');

-- The sibling: an existing project for this exact designer-client pair in
-- Order B. set_project_studio_id's first ORDER BY leg is exactly this.
SELECT pg_temp.assume_user('2b000000-0000-4000-8000-000000000007', 'service_role');
INSERT INTO public.projects (
  id, designer_id, client_id, studio_id, name, status, created_by
) VALUES (
  '2b400000-0000-4000-8000-000000000001',
  '2b000000-0000-4000-8000-000000000007', '2b000000-0000-4000-8000-000000000008',
  '2b100000-0000-4000-8000-000000000006', 'Sibling engagement', 'active',
  '2b000000-0000-4000-8000-000000000007'
);
SELECT pg_temp.reset_role();

DO $$
DECLARE
  v_recorded jsonb;
  v_executed jsonb;
  v_studio_id uuid;
  v_expected uuid;
BEGIN
  v_expected := pg_temp.lead_resolves_to(
    '2b000000-0000-4000-8000-000000000007', '2b000000-0000-4000-8000-000000000008');
  ASSERT v_expected = '2b100000-0000-4000-8000-000000000006',
    format('the sibling project must move the lead''s order to Order B, got %s', v_expected);

  PERFORM pg_temp.assume_role('2b000000-0000-4000-8000-000000000009');
  v_recorded := public.record_paper_client_signature(
    '2b300000-0000-4000-8000-000000000006', 'Order Client',
    pg_temp.paper_date(), NULL::uuid, false
  );
  PERFORM pg_temp.reset_role();
  ASSERT v_recorded->>'commercialState' = 'client_signed',
    format('the Order co-member must be able to record paper: %s', v_recorded);

  PERFORM pg_temp.assume_role('2b000000-0000-4000-8000-000000000009');
  v_executed := public.countersign_design_services_agreement(
    '2b300000-0000-4000-8000-000000000006', 'Order Co-member'
  );
  PERFORM pg_temp.reset_role();
  ASSERT (v_executed->>'newlyExecuted')::boolean,
    format('the sibling-pinned countersign must land: %s', v_executed);

  SELECT studio_id INTO v_studio_id FROM public.projects
  WHERE id = (v_executed->>'projectId')::uuid;
  ASSERT v_studio_id = '2b100000-0000-4000-8000-000000000006',
    format('the sibling project pins the engagement to Order B, landed %s', v_studio_id);

  RAISE NOTICE 'PASS 6: a sibling project for the pair pins the resolved studio';
END $$;

ROLLBACK;
