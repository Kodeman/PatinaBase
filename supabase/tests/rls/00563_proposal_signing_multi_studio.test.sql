-- ═══════════════════════════════════════════════════════════════════════════
-- 00563 — signing a proposal resolves a studio instead of counting memberships
--
-- NOTE ON STYLE: supabase/tests/** is not pgTAP. Every file in that tree is a
-- plain psql script — BEGIN, fixtures, pg_temp role-assumption helpers, DO
-- blocks of ASSERTs, ROLLBACK — run under ON_ERROR_STOP=1. This file follows
-- rls/00557_increment_scan_upload_attempt.test.sql.
--
-- Run (single file, for iteration):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rls/00563_proposal_signing_multi_studio.test.sql
--
-- Run (the actual gate — whole suite against KNOWN_FAILURES.md):
--   bash scripts/run-sql-tests.sh
--
-- Fixture: the seeded designer↔client pair every local reset carries
-- (designer@patina.dev a0000000-…-0004, client@patina.dev a0000000-…-0005,
-- proposal b0000000-…-0002 in status 'sent'). The test adds ONE extra active
-- design studio and a non-owner active membership in it, so the designer is
-- unambiguously in two or more active studios — the exact state that made
-- sign_proposal raise `studio_id_not_designer_studio` before 00563 (L07-01).
-- Every section runs inside a SAVEPOINT and the file ROLLBACKs.
--
-- Covers:
--   1. the regression: with the designer in ≥2 active studios the client's
--      signature lands, and the activated project is stamped with a studio the
--      lead designer actively belongs to — not left NULL and not refused
--   2. the tie-break is the documented one. AMENDED 2026-09-12 by 00603 (hour
--      tracking, HT-3-b ruled 2026-09-12): where the caller NAMED no studio,
--      the lead designer's ONE employer-tier seat (active, non-guest,
--      role <> 'owner') decides, and 00317's order decides only when that tier
--      is empty or ambiguous. This fixture gives her exactly one employer seat
--      — the extra studio added below — so that is what section 2 now measures,
--      and the section computes whichever rule the fixture actually puts in
--      charge. Before 00603 the activation bridge's own
--      `(membership.role = 'owner') DESC` preference decided and stamped the
--      workspace a hire OWNS on her employer's project (W1-R11-02, measured).
--   3. the relationship wins over that order: point an existing project for
--      this exact (designer_id, client_id) pair at the extra studio and the
--      activation follows the relationship. Section 3 seats the designer in a
--      SECOND extra studio first, so her employer tier is AMBIGUOUS and 00603
--      leaves the bridge's own preference in charge — otherwise the employer
--      tier would reach the same studio for a different reason and this section
--      would measure nothing.
--   4. zero candidates still fails closed: suspend every candidate studio and
--      the same signature raises `studio_id_not_designer_studio` again
--   5. the relaxation does not leak: a direct authenticated project INSERT by
--      the same ambiguous designer (no proposal, no client) still fails closed,
--      and the branch's source still names the two tokens that confine it
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ─── helpers (same shape as products_three_layer_test.sql) ─────────────────
-- The GRANT after each definition is required: 00483 revokes database
-- TEMPORARY from authenticated/anon/service_role, so a restricted role cannot
-- reach a pg_temp function without it.

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
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

-- The candidate set the 00511 guard computes, as a view over the fixture
-- designer, so every assertion below reads the same definition the trigger does.
CREATE OR REPLACE FUNCTION pg_temp.candidate_studios()
RETURNS TABLE (studio_id uuid, is_owner boolean, joined_at timestamptz, created_at timestamptz)
AS $$
  SELECT membership.organization_id,
         (membership.role = 'owner'),
         membership.joined_at,
         membership.created_at
  FROM public.organization_members AS membership
  JOIN public.organizations AS studio
    ON studio.id = membership.organization_id
  WHERE membership.user_id = 'a0000000-0000-0000-0000-000000000004'
    AND membership.status = 'active'
    AND membership.role <> 'guest'
    AND studio.type = 'design_studio'
    AND studio.status = 'active'
    AND public.has_designer_domain_role('a0000000-0000-0000-0000-000000000004');
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION pg_temp.candidate_studios() TO PUBLIC;

-- ─── fixture preconditions ─────────────────────────────────────────────────

DO $$
DECLARE
  v_status text;
  v_project_id uuid;
  v_relationship uuid;
  v_anchored integer;
BEGIN
  SELECT status, project_id, designer_client_id
    INTO v_status, v_project_id, v_relationship
    FROM public.proposals
   WHERE id = 'b0000000-0000-0000-0000-000000000002'::uuid;

  ASSERT v_status = 'sent',
    'FIXTURE: seeded proposal b0000000-…-0002 must be in status sent, got '
      || COALESCE(v_status, '<missing>');
  ASSERT v_project_id IS NULL,
    'FIXTURE: seeded proposal b0000000-…-0002 must not already be activated';
  ASSERT v_relationship IS NOT NULL,
    'FIXTURE: seeded proposal b0000000-…-0002 must carry a designer_client_id';

  -- 00602 (hour tracking, HT-3-a ruled 2026-09-12) stamps projects.studio_id at
  -- INSERT from a studio the lead designer OWNS, so the seeded projects for this
  -- pair now anchor a studio and section 2 below would measure the activation
  -- bridge's sibling-project PREFERENCE instead of 00317's order. Clear it for this
  -- pair only, which restores the fixture shape this section was written against —
  -- 00602's trigger is BEFORE INSERT only, so the UPDATE sticks (and 00563's own
  -- discovery leaves it NULL too: this designer has more than one candidate studio
  -- and the ambiguity arm is INSERT-only).
  UPDATE public.projects SET studio_id = NULL
   WHERE designer_id = 'a0000000-0000-0000-0000-000000000004'
     AND client_id = 'a0000000-0000-0000-0000-000000000005'
     AND studio_id IS NOT NULL;

  SELECT count(*) INTO v_anchored
    FROM public.projects
   WHERE designer_id = 'a0000000-0000-0000-0000-000000000004'
     AND client_id = 'a0000000-0000-0000-0000-000000000005'
     AND studio_id IS NOT NULL;
  ASSERT v_anchored = 0,
    'FIXTURE: section 2 measures the ORDER, so no seeded project for this pair '
    'may already anchor a studio; got ' || v_anchored;
END $$;

-- One extra active design studio, joined as a plain member. Non-owner and
-- newest, so it is LAST on 00317's order — section 3 can only pass by way of
-- the relationship preference.

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('59000000-0000-4000-8000-000000000001'::uuid,
        'design_studio', 'p559 Second Studio', 'p559-second-studio', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organization_members
  (id, user_id, organization_id, role, status, joined_at)
VALUES ('59000000-0000-4000-8000-000000000002'::uuid,
        'a0000000-0000-0000-0000-000000000004',
        '59000000-0000-4000-8000-000000000001'::uuid,
        'member', 'active', now())
ON CONFLICT (user_id, organization_id) DO NOTHING;

DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_temp.candidate_studios();
  ASSERT n >= 2,
    'FIXTURE: the designer must be in two or more active studios or nothing '
    'below is the L07-01 case; got ' || n;
  RAISE NOTICE '00563 fixture: % candidate studios', n;
END $$;

-- ─── 1 + 2. the signature lands, and the winner is 00317's order ───────────

SAVEPOINT s_order;

DO $$
DECLARE
  v_result    jsonb;
  v_project   uuid;
  v_studio    uuid;
  v_expected  uuid;
  v_rule      text;
  v_employers uuid[];
BEGIN
  -- 00603 (HT-3-b): a single employer-tier seat outranks the bridge's own
  -- preference whenever the caller named no studio. Compute whichever rule this
  -- fixture actually puts in charge, so the section keeps measuring the live
  -- answer rather than a remembered one.
  SELECT array_agg(studio_id) INTO v_employers
    FROM pg_temp.candidate_studios() WHERE NOT is_owner;

  IF COALESCE(array_length(v_employers, 1), 0) = 1 THEN
    v_expected := v_employers[1];
    v_rule := 'HT-3-b''s employer tier (00603): the designer''s ONE active '
              'non-guest seat with role <> ''owner''';
  ELSE
    SELECT studio_id INTO v_expected
      FROM pg_temp.candidate_studios()
     ORDER BY is_owner DESC, joined_at NULLS LAST, created_at, studio_id
     LIMIT 1;
    v_rule := '00317''s order (owner first, earliest joined, organization_id '
              'last), which 00603 leaves in charge for an empty or ambiguous '
              'employer tier';
  END IF;

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
  v_result := public.sign_proposal(
    'b0000000-0000-0000-0000-000000000002'::uuid,
    'Client User'
  );
  PERFORM pg_temp.reset_role();

  ASSERT v_result ->> 'status' = 'accepted',
    'FAIL 1a: sign_proposal must accept the proposal, got '
      || COALESCE(v_result ->> 'status', '<null>');
  ASSERT (v_result ->> 'newly_signed')::boolean,
    'FAIL 1b: this is a first signature and must report newly_signed';

  v_project := (v_result ->> 'project_id')::uuid;
  ASSERT v_project IS NOT NULL,
    'FAIL 1c: an accepted proposal must activate a project';

  SELECT studio_id INTO v_studio FROM public.projects WHERE id = v_project;
  ASSERT v_studio IS NOT NULL,
    'FAIL 1d: the activated project must be stamped with a studio';
  ASSERT EXISTS (SELECT 1 FROM pg_temp.candidate_studios() c
                  WHERE c.studio_id = v_studio),
    'FAIL 1e: the stamped studio must be one the lead designer actively '
    'belongs to (00511''s predicate), got ' || v_studio;

  ASSERT v_studio = v_expected,
    'FAIL 2: with no project anchoring the relationship and no studio named by '
    'the caller, the winner is ' || v_rule || '; expected '
      || v_expected || ' got ' || v_studio;

  RAISE NOTICE '00563 section 1+2 passed: project % stamped studio % by %',
    v_project, v_studio, v_rule;
END $$;

ROLLBACK TO SAVEPOINT s_order;

-- ─── 3. the proposal's own relationship outranks that order ────────────────

SAVEPOINT s_relationship;

-- A SECOND non-owner seat, so the designer's employer tier holds two candidates.
-- 00603 (HT-3-b) never chooses between two, so it leaves the activation bridge's
-- own preference in charge — which is the thing this section exists to measure.
-- With one employer seat the tier would reach 59000000-…-0001 for its own reason
-- and the assert below would pass without proving anything about the bridge.
INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('59000000-0000-4000-8000-000000000003'::uuid,
        'design_studio', 'p559 Third Studio', 'p559-third-studio', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organization_members
  (id, user_id, organization_id, role, status, joined_at)
VALUES ('59000000-0000-4000-8000-000000000004'::uuid,
        'a0000000-0000-0000-0000-000000000004',
        '59000000-0000-4000-8000-000000000003'::uuid,
        'member', 'active', now())
ON CONFLICT (user_id, organization_id) DO NOTHING;

UPDATE public.projects
SET studio_id = '59000000-0000-4000-8000-000000000001'::uuid
WHERE id = (
  SELECT id FROM public.projects
   WHERE designer_id = 'a0000000-0000-0000-0000-000000000004'
     AND client_id = 'a0000000-0000-0000-0000-000000000005'
   ORDER BY id
   LIMIT 1
);

DO $$
DECLARE
  v_result    jsonb;
  v_studio    uuid;
  v_last      uuid;
  v_employers integer;
BEGIN
  SELECT studio_id INTO v_last
    FROM pg_temp.candidate_studios()
   ORDER BY is_owner DESC, joined_at NULLS LAST, created_at, studio_id
   LIMIT 1;
  ASSERT v_last <> '59000000-0000-4000-8000-000000000001'::uuid,
    'FIXTURE: the extra studio must NOT win 00317''s order, or section 3 '
    'proves nothing';

  SELECT count(*) INTO v_employers
    FROM pg_temp.candidate_studios() WHERE NOT is_owner;
  ASSERT v_employers > 1,
    'FIXTURE: the designer''s employer tier must be AMBIGUOUS here, or 00603 '
    'stamps that tier''s single candidate and the bridge''s relationship '
    'preference is never exercised; got ' || v_employers;

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
  v_result := public.sign_proposal(
    'b0000000-0000-0000-0000-000000000002'::uuid,
    'Client User'
  );
  PERFORM pg_temp.reset_role();

  SELECT studio_id INTO v_studio
    FROM public.projects WHERE id = (v_result ->> 'project_id')::uuid;

  ASSERT v_studio = '59000000-0000-4000-8000-000000000001'::uuid,
    'FAIL 3: the activation must follow the studio that already holds a '
    'project for this designer-client pair, expected 59000000-…-0001 got '
      || COALESCE(v_studio::text, '<null>');

  RAISE NOTICE '00563 section 3 passed: relationship studio % chosen over %',
    v_studio, v_last;
END $$;

ROLLBACK TO SAVEPOINT s_relationship;

-- ─── 4. zero candidates still fails closed ─────────────────────────────────

SAVEPOINT s_zero;

UPDATE public.organizations
SET status = 'suspended'
WHERE id IN (SELECT studio_id FROM pg_temp.candidate_studios());

DO $$
DECLARE
  n         integer;
  v_state   text := NULL;
  v_message text := NULL;
BEGIN
  SELECT count(*) INTO n FROM pg_temp.candidate_studios();
  ASSERT n = 0, 'FIXTURE: every candidate studio must be suspended, got ' || n;

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
  BEGIN
    PERFORM public.sign_proposal(
      'b0000000-0000-0000-0000-000000000002'::uuid,
      'Client User'
    );
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
    v_message := SQLERRM;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_message = 'studio_id_not_designer_studio',
    'FAIL 4: with no qualified studio the activation must still fail closed, '
    'got ' || COALESCE(v_state || ' ' || v_message, 'no error at all');

  ASSERT (SELECT status FROM public.proposals
           WHERE id = 'b0000000-0000-0000-0000-000000000002'::uuid) = 'sent',
    'FAIL 4b: a failed activation must roll the signature back';

  RAISE NOTICE '00563 section 4 passed: % still raised', v_message;
END $$;

ROLLBACK TO SAVEPOINT s_zero;

-- ─── 5. the relaxation is confined to the activation bridge ────────────────

SAVEPOINT s_confined;

DO $$
DECLARE
  v_message text := NULL;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  BEGIN
    INSERT INTO public.projects (designer_id, created_by, name, status)
    VALUES ('a0000000-0000-0000-0000-000000000004',
            'a0000000-0000-0000-0000-000000000004',
            'p559 direct draft', 'active');
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_message = 'studio_id_not_designer_studio',
    'FAIL 5a: a direct authenticated INSERT carries no proposal and must keep '
    '00511''s fail-closed behaviour, got ' || COALESCE(v_message, 'no error');

  RAISE NOTICE '00563 section 5a passed: direct INSERT still fails closed';
END $$;

DO $$
DECLARE
  v_src text;
BEGIN
  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'set_project_studio_id';

  ASSERT v_src LIKE '%v_candidate_studio_count > 1%',
    'FAIL 5b: the ambiguity branch is missing — 00563 was not applied';
  ASSERT v_src LIKE '%NEW.proposal_id IS NOT NULL%'
     AND v_src LIKE '%app.proposal_activation_id%',
    'FAIL 5c: the ambiguity branch must stay gated on a proposal-backed INSERT '
    'inside the activation bridge';

  RAISE NOTICE '00563 section 5b passed: the branch names both gates';
END $$;

ROLLBACK TO SAVEPOINT s_confined;

-- ROLLBACK so the test is idempotent.
ROLLBACK;
