-- ═══════════════════════════════════════════════════════════════════════════
-- Install window tests (migration 00476 — R112, I126)
--
-- Exercises the ceremony Wave 3 installs:
--   1. A hold writes no anchor and cuts no revision.
--   2. A second live window on the same project is refused, by name.
--   3. A comember can hold; a stranger cannot.
--   4. RLS: a client never sees a held window, and does see a confirmed one.
--   5. hold → confirm WITH a stated impact: exactly one anchor, one revision,
--      zero proposals — and the window carries the evidence.
--   6. Releasing a CONFIRMED window unpins the anchor and cuts a revision
--      (I126: anchors refuse silent movement, and that reaches releases).
--   7. Confirming with a NULL impact proposes: zero anchors, one proposal,
--      window still confirmed (the R110 downgrade).
--   8. Releasing with a NULL impact proposes the UNPIN — a proposal with no
--      date (00476's contract extension).
--   9. Releasing a merely HELD window is a state flip and nothing else.
--  10. An omitted anchor_date key is a malformed edit, never a silent unpin.
--  11. ACLs, pinned search_path, RLS and the two policies are as authored.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/schedule/install_window_test.sql
--
-- Single transaction, ROLLBACK at the end — re-runnable with no side effects.
-- Runs as superuser except where a case explicitly assumes a role.
--
-- RPC-minted ids live in pg_temp.ids rather than psql \gset variables: psql
-- does not interpolate :'var' inside a dollar-quoted DO body, and every
-- assertion here is a DO body.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('b1a5e000-0000-4000-8000-000000000001', 'install-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1a5e000-0000-4000-8000-000000000002', 'install-comember@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1a5e000-0000-4000-8000-000000000003', 'install-client@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1a5e000-0000-4000-8000-000000000004', 'install-stranger@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('b1a5e000-0000-4000-8000-000000000001', 'install-designer@test.invalid', 'Install Designer', NOW(), NOW()),
  ('b1a5e000-0000-4000-8000-000000000002', 'install-comember@test.invalid', 'Install Comember', NOW(), NOW()),
  ('b1a5e000-0000-4000-8000-000000000003', 'install-client@test.invalid',   'Install Client',   NOW(), NOW()),
  ('b1a5e000-0000-4000-8000-000000000004', 'install-stranger@test.invalid', 'Install Stranger', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- The studio the designer and the comember share (is_studio_comember's join).
INSERT INTO organizations (id, type, name, slug)
VALUES ('b1a5e000-0000-4000-8000-00000000000f', 'design_studio', 'Install Window Studio', 'install-window-studio');

INSERT INTO organization_members (user_id, organization_id, role, status)
VALUES
  ('b1a5e000-0000-4000-8000-000000000001', 'b1a5e000-0000-4000-8000-00000000000f', 'owner',  'active'),
  ('b1a5e000-0000-4000-8000-000000000002', 'b1a5e000-0000-4000-8000-00000000000f', 'member', 'active');

INSERT INTO projects (id, name, designer_id, client_id, created_by, start_date)
VALUES ('b1a5e000-0000-4000-8000-0000000000a1', 'Install Window Project',
        'b1a5e000-0000-4000-8000-000000000001', 'b1a5e000-0000-4000-8000-000000000003',
        'b1a5e000-0000-4000-8000-000000000001', DATE '2026-01-01');

INSERT INTO project_phases (id, project_id, name, phase_key, status, sort_order, lane, duration_days)
VALUES
  ('b1a5e000-0000-4000-8000-0000000000b1', 'b1a5e000-0000-4000-8000-0000000000a1',
   'Design development', 'design_refinement', 'in_progress', 0, 'main', 14),
  ('b1a5e000-0000-4000-8000-0000000000b2', 'b1a5e000-0000-4000-8000-0000000000a1',
   'Installation', 'installation', 'pending', 1, 'main', 7);

-- ─── helpers ───────────────────────────────────────────────────────────────

CREATE TEMPORARY TABLE ids (name text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.wid(p_name text)
RETURNS uuid AS $$
  SELECT id FROM ids WHERE name = p_name;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id uuid)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.assume_role(p_user_id uuid)
RETURNS VOID AS $$
BEGIN
  PERFORM pg_temp.assume_user(p_user_id);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.anchor_of(p_phase_id uuid)
RETURNS date AS $$
  SELECT anchor_date FROM public.project_phases WHERE id = p_phase_id;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION pg_temp.revision_count()
RETURNS integer AS $$
  SELECT count(*)::integer FROM public.schedule_revisions
   WHERE project_id = 'b1a5e000-0000-4000-8000-0000000000a1';
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION pg_temp.proposal_count()
RETURNS integer AS $$
  SELECT count(*)::integer FROM public.schedule_proposals
   WHERE project_id = 'b1a5e000-0000-4000-8000-0000000000a1';
$$ LANGUAGE sql;

SELECT pg_temp.assume_user('b1a5e000-0000-4000-8000-000000000001');

-- ─── 1. A hold is not a commitment ─────────────────────────────────────────

INSERT INTO ids (name, id)
SELECT 'first-hold', public.hold_install_window(
  'b1a5e000-0000-4000-8000-0000000000a1', DATE '2026-06-01', DATE '2026-06-05');

DO $$
DECLARE v_row public.install_windows%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.install_windows WHERE id = pg_temp.wid('first-hold');
  IF v_row.state <> 'held' THEN
    RAISE EXCEPTION 'FAIL 1a: a fresh window must be held, got %', v_row.state;
  END IF;
  IF v_row.held_by <> 'b1a5e000-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'FAIL 1b: the hold did not record its actor (%)', v_row.held_by;
  END IF;
  IF v_row.phase_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 1c: a hold names no phase until it is confirmed (%)', v_row.phase_id;
  END IF;
  IF pg_temp.anchor_of('b1a5e000-0000-4000-8000-0000000000b2') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 1d: a hold must write no anchor';
  END IF;
  IF pg_temp.revision_count() <> 0 THEN
    RAISE EXCEPTION 'FAIL 1e: a hold must cut no revision, got %', pg_temp.revision_count();
  END IF;
  RAISE NOTICE 'PASS 1: a hold records the window and moves nothing';
END $$;

-- ─── 2. One window stands at a time ────────────────────────────────────────

DO $$
DECLARE v_message text;
BEGIN
  BEGIN
    PERFORM public.hold_install_window(
      'b1a5e000-0000-4000-8000-0000000000a1', DATE '2026-07-01', DATE '2026-07-05'
    );
    RAISE EXCEPTION 'FAIL 2a: a second live window was accepted';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message LIKE 'FAIL 2a%' THEN RAISE; END IF;
    IF v_message NOT LIKE '%already held%' OR v_message NOT LIKE '%2026-06-01%' THEN
      RAISE EXCEPTION 'FAIL 2b: the refusal does not name the live window (%)', v_message;
    END IF;
  END;
  RAISE NOTICE 'PASS 2: a second live window is refused by name';
END $$;

-- ─── 3. A comember can hold; a stranger cannot ─────────────────────────────

DO $$
DECLARE v_message text;
BEGIN
  PERFORM pg_temp.assume_user('b1a5e000-0000-4000-8000-000000000004');
  BEGIN
    PERFORM public.hold_install_window(
      'b1a5e000-0000-4000-8000-0000000000a1', DATE '2026-08-01', DATE '2026-08-05'
    );
    RAISE EXCEPTION 'FAIL 3a: a stranger held a window on another studio''s project';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message LIKE 'FAIL 3a%' THEN RAISE; END IF;
    IF v_message NOT LIKE '%not found or not owned by caller%' THEN
      RAISE EXCEPTION 'FAIL 3b: unexpected refusal for a stranger (%)', v_message;
    END IF;
  END;
  RAISE NOTICE 'PASS 3a: a stranger is refused';
END $$;

-- The comember shares the studio, so the guard admits them. Release the
-- designer's window first — the single-live-window rule is not the subject
-- here, and the release doubles as case 9's held-release evidence.
SELECT pg_temp.assume_user('b1a5e000-0000-4000-8000-000000000002');

SELECT public.release_install_window(
  pg_temp.wid('first-hold'), 'Install window released');

INSERT INTO ids (name, id)
SELECT 'window', public.hold_install_window(
  'b1a5e000-0000-4000-8000-0000000000a1', DATE '2026-06-01', DATE '2026-06-05');

DO $$
BEGIN
  IF pg_temp.wid('window') IS NULL THEN
    RAISE EXCEPTION 'FAIL 3c: a studio comember could not hold a window';
  END IF;
  RAISE NOTICE 'PASS 3b: a comember holds';
END $$;

-- ─── 9. Releasing a merely HELD window is a state flip ─────────────────────

DO $$
BEGIN
  IF pg_temp.revision_count() <> 0 OR pg_temp.proposal_count() <> 0 THEN
    RAISE EXCEPTION 'FAIL 9a: releasing a HELD window moved the schedule (rev %, prop %)',
      pg_temp.revision_count(), pg_temp.proposal_count();
  END IF;
  IF pg_temp.anchor_of('b1a5e000-0000-4000-8000-0000000000b2') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 9b: releasing a HELD window touched an anchor';
  END IF;
  IF (SELECT state FROM public.install_windows WHERE id = pg_temp.wid('first-hold')) <> 'released' THEN
    RAISE EXCEPTION 'FAIL 9c: the released window did not flip state';
  END IF;
  RAISE NOTICE 'PASS 9: releasing a held window is a state flip and nothing else';
END $$;

-- ─── 4a. RLS — a client never sees a held window ───────────────────────────

DO $$
DECLARE v_visible integer;
BEGIN
  PERFORM pg_temp.assume_role('b1a5e000-0000-4000-8000-000000000003');
  SELECT count(*) INTO v_visible FROM public.install_windows
   WHERE project_id = 'b1a5e000-0000-4000-8000-0000000000a1';
  PERFORM pg_temp.reset_role();
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'FAIL 4a: a client saw % window(s) that are not confirmed', v_visible;
  END IF;
  RAISE NOTICE 'PASS 4a: a held window is studio-only';
END $$;

-- ─── 5. hold → confirm WITH a stated impact hardens ────────────────────────

SELECT pg_temp.assume_user('b1a5e000-0000-4000-8000-000000000001');

SELECT public.confirm_install_window(
  pg_temp.wid('window'),
  jsonb_build_object('sentence', 'The install phase moves to Jun 1; two lines follow it.'));

DO $$
DECLARE v_row public.install_windows%ROWTYPE; v_reason text;
BEGIN
  SELECT * INTO v_row FROM public.install_windows WHERE id = pg_temp.wid('window');
  IF v_row.state <> 'confirmed' THEN
    RAISE EXCEPTION 'FAIL 5a: the window did not confirm (%)', v_row.state;
  END IF;
  IF v_row.phase_id <> 'b1a5e000-0000-4000-8000-0000000000b2' THEN
    RAISE EXCEPTION 'FAIL 5b: the confirmation resolved the wrong phase (%)', v_row.phase_id;
  END IF;
  IF v_row.confirmed_by <> 'b1a5e000-0000-4000-8000-000000000001'
     OR v_row.confirmed_at IS NULL THEN
    RAISE EXCEPTION 'FAIL 5c: the confirmation did not record its actor or moment';
  END IF;
  IF v_row.disclosed_impact->>'sentence' IS NULL THEN
    RAISE EXCEPTION 'FAIL 5d: the window does not carry the stated impact';
  END IF;

  IF pg_temp.anchor_of('b1a5e000-0000-4000-8000-0000000000b2') IS DISTINCT FROM DATE '2026-06-01' THEN
    RAISE EXCEPTION 'FAIL 5e: the confirmation did not set the anchor (got %)',
      pg_temp.anchor_of('b1a5e000-0000-4000-8000-0000000000b2');
  END IF;
  IF pg_temp.revision_count() <> 1 THEN
    RAISE EXCEPTION 'FAIL 5f: expected exactly one revision, got %', pg_temp.revision_count();
  END IF;
  IF pg_temp.proposal_count() <> 0 THEN
    RAISE EXCEPTION 'FAIL 5g: a stated confirmation must write no proposal, got %',
      pg_temp.proposal_count();
  END IF;

  SELECT reason INTO v_reason FROM public.schedule_revisions
   WHERE project_id = 'b1a5e000-0000-4000-8000-0000000000a1';
  IF v_reason NOT LIKE '%Install window confirmed%'
     OR v_reason NOT LIKE '%two lines follow it.%' THEN
    RAISE EXCEPTION 'FAIL 5h: the revision does not carry what was stated (%)', v_reason;
  END IF;
  RAISE NOTICE 'PASS 5: a stated confirmation hardens — one anchor, one revision, no proposal';
END $$;

-- ─── 4b. RLS — a client sees the confirmed window, a stranger sees none ────

DO $$
DECLARE v_visible integer;
BEGIN
  PERFORM pg_temp.assume_role('b1a5e000-0000-4000-8000-000000000003');
  SELECT count(*) INTO v_visible FROM public.install_windows
   WHERE project_id = 'b1a5e000-0000-4000-8000-0000000000a1';
  PERFORM pg_temp.reset_role();
  IF v_visible <> 1 THEN
    RAISE EXCEPTION 'FAIL 4b: a client saw % window(s), expected exactly the confirmed one', v_visible;
  END IF;

  PERFORM pg_temp.assume_role('b1a5e000-0000-4000-8000-000000000004');
  SELECT count(*) INTO v_visible FROM public.install_windows
   WHERE project_id = 'b1a5e000-0000-4000-8000-0000000000a1';
  PERFORM pg_temp.reset_role();
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'FAIL 4c: a stranger saw % window(s)', v_visible;
  END IF;
  RAISE NOTICE 'PASS 4b: a confirmed window reaches the client; a stranger sees none';
END $$;

-- ─── 6. Releasing a CONFIRMED window unpins, with disclosure (I126) ────────

SELECT pg_temp.assume_user('b1a5e000-0000-4000-8000-000000000001');

SELECT public.release_install_window(
  pg_temp.wid('window'),
  'Install window released',
  jsonb_build_object('sentence', 'Removing the anchor returns the install phase to the chain.'));

DO $$
DECLARE v_row public.install_windows%ROWTYPE; v_reason text;
BEGIN
  SELECT * INTO v_row FROM public.install_windows WHERE id = pg_temp.wid('window');
  IF v_row.state <> 'released' OR v_row.released_at IS NULL
     OR v_row.released_by <> 'b1a5e000-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'FAIL 6a: the release did not record itself (%)', to_jsonb(v_row);
  END IF;
  IF pg_temp.anchor_of('b1a5e000-0000-4000-8000-0000000000b2') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 6b: the release did not unpin the anchor (got %)',
      pg_temp.anchor_of('b1a5e000-0000-4000-8000-0000000000b2');
  END IF;
  IF pg_temp.revision_count() <> 2 THEN
    RAISE EXCEPTION 'FAIL 6c: the release must cut a revision, total is %', pg_temp.revision_count();
  END IF;
  IF pg_temp.proposal_count() <> 0 THEN
    RAISE EXCEPTION 'FAIL 6d: a stated release must write no proposal, got %', pg_temp.proposal_count();
  END IF;

  SELECT reason INTO v_reason FROM public.schedule_revisions
   WHERE project_id = 'b1a5e000-0000-4000-8000-0000000000a1' ORDER BY v DESC LIMIT 1;
  IF v_reason NOT LIKE '%returns the install phase to the chain.%' THEN
    RAISE EXCEPTION 'FAIL 6e: the release revision does not carry what was stated (%)', v_reason;
  END IF;
  RAISE NOTICE 'PASS 6: releasing a confirmed window unpins with disclosure and cuts a revision';
END $$;

-- ─── 7. Confirming with NO stated impact proposes (R110 downgrade) ─────────

INSERT INTO ids (name, id)
SELECT 'undisclosed', public.hold_install_window(
  'b1a5e000-0000-4000-8000-0000000000a1', DATE '2026-09-07', DATE '2026-09-11');

SELECT public.confirm_install_window(pg_temp.wid('undisclosed'), NULL);

DO $$
DECLARE v_row public.install_windows%ROWTYPE; v_proposal public.schedule_proposals%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.install_windows WHERE id = pg_temp.wid('undisclosed');
  IF v_row.state <> 'confirmed' THEN
    RAISE EXCEPTION 'FAIL 7a: an undisclosed confirmation must still confirm the window (%)', v_row.state;
  END IF;
  IF v_row.disclosed_impact IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 7b: an undisclosed confirmation must claim no evidence';
  END IF;
  IF pg_temp.anchor_of('b1a5e000-0000-4000-8000-0000000000b2') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 7c: an undisclosed confirmation must write no anchor (got %)',
      pg_temp.anchor_of('b1a5e000-0000-4000-8000-0000000000b2');
  END IF;
  IF pg_temp.revision_count() <> 2 THEN
    RAISE EXCEPTION 'FAIL 7d: an undisclosed confirmation must cut no revision, total is %',
      pg_temp.revision_count();
  END IF;

  SELECT * INTO v_proposal FROM public.schedule_proposals
   WHERE project_id = 'b1a5e000-0000-4000-8000-0000000000a1'
     AND source_event = 'install-window-confirmed';
  IF v_proposal.id IS NULL THEN
    RAISE EXCEPTION 'FAIL 7e: no proposal was recorded';
  END IF;
  IF v_proposal.target_phase_id <> 'b1a5e000-0000-4000-8000-0000000000b2'
     OR v_proposal.proposed_anchor_date <> DATE '2026-09-07'
     OR v_proposal.state <> 'proposed'
     OR v_proposal.source_ref <> pg_temp.wid('undisclosed') THEN
    RAISE EXCEPTION 'FAIL 7f: the proposal does not carry the act (%)', to_jsonb(v_proposal);
  END IF;
  RAISE NOTICE 'PASS 7: an undisclosed confirmation proposes — no anchor, no revision, one proposal';
END $$;

-- ─── 8. Releasing with NO stated impact proposes the UNPIN ─────────────────

SELECT public.release_install_window(
  pg_temp.wid('undisclosed'), 'Install window released', NULL);

DO $$
DECLARE v_proposal public.schedule_proposals%ROWTYPE;
BEGIN
  IF (SELECT state FROM public.install_windows WHERE id = pg_temp.wid('undisclosed')) <> 'released' THEN
    RAISE EXCEPTION 'FAIL 8a: the window did not release';
  END IF;
  IF pg_temp.revision_count() <> 2 THEN
    RAISE EXCEPTION 'FAIL 8b: an undisclosed release must cut no revision, total is %',
      pg_temp.revision_count();
  END IF;

  SELECT * INTO v_proposal FROM public.schedule_proposals
   WHERE project_id = 'b1a5e000-0000-4000-8000-0000000000a1'
     AND source_event = 'install-window-released';
  IF v_proposal.id IS NULL THEN
    RAISE EXCEPTION 'FAIL 8c: no unpin proposal was recorded';
  END IF;
  IF v_proposal.proposed_anchor_date IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 8d: a proposed unpin carries no date, got %', v_proposal.proposed_anchor_date;
  END IF;
  IF v_proposal.target_phase_id <> 'b1a5e000-0000-4000-8000-0000000000b2' THEN
    RAISE EXCEPTION 'FAIL 8e: the unpin proposal names the wrong phase (%)', v_proposal.target_phase_id;
  END IF;
  RAISE NOTICE 'PASS 8: an undisclosed release proposes the unpin — a proposal with no date';
END $$;

-- ─── 10. The phase-anchor contract extension, directly ────────────────────

DO $$
DECLARE v_message text;
BEGIN
  BEGIN
    PERFORM public._commit_schedule_edit_authorized(
      'b1a5e000-0000-4000-8000-0000000000a1',
      jsonb_build_array(jsonb_build_object(
        'kind', 'phase-anchor',
        'phase_id', 'b1a5e000-0000-4000-8000-0000000000b2'
      )),
      'A malformed edit',
      jsonb_build_object('sentence', 'stated'),
      'manual'
    );
    RAISE EXCEPTION 'FAIL 10a: a phase-anchor edit with no anchor_date key was accepted';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message LIKE 'FAIL 10a%' THEN RAISE; END IF;
    IF v_message NOT LIKE '%requires an anchor_date key%' THEN
      RAISE EXCEPTION 'FAIL 10b: unexpected refusal (%)', v_message;
    END IF;
  END;
  RAISE NOTICE 'PASS 10: an omitted anchor_date is a malformed edit, never a silent unpin';
END $$;

-- ─── 11. ACL + RLS structure ───────────────────────────────────────────────

DO $$
DECLARE v_bad text;
BEGIN
  -- The three ceremony doors are reachable by an authenticated session and by
  -- nobody else.
  SELECT string_agg(p.proname, ', ') INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('hold_install_window', 'confirm_install_window', 'release_install_window')
     AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 11a: authenticated cannot execute %', v_bad;
  END IF;

  SELECT string_agg(p.proname, ', ') INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('hold_install_window', 'confirm_install_window', 'release_install_window')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 11b: anon can execute %', v_bad;
  END IF;

  -- The selector stays inside the DEFINER chain.
  IF has_function_privilege('authenticated', 'public._install_window_phase(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public._install_window_phase(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 11c: _install_window_phase carries a grant it should not';
  END IF;

  -- Wave 2's zero-grant posture survives the re-cut.
  IF has_function_privilege('service_role', 'public._commit_schedule_edit_authorized(uuid, jsonb, text, jsonb, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._commit_schedule_edit_authorized(uuid, jsonb, text, jsonb, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 11d: _commit_schedule_edit_authorized lost its zero-grant posture';
  END IF;

  -- All four new DEFINER doors pin search_path.
  SELECT string_agg(p.proname, ', ') INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('hold_install_window', 'confirm_install_window',
                       'release_install_window', '_install_window_phase')
     AND (NOT p.prosecdef OR NOT ('search_path=public' = ANY (p.proconfig)));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 11e: % is not a search_path-pinned SECURITY DEFINER', v_bad;
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.install_windows'::regclass) THEN
    RAISE EXCEPTION 'FAIL 11f: RLS is not enabled on install_windows';
  END IF;

  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'install_windows') <> 2 THEN
    RAISE EXCEPTION 'FAIL 11g: install_windows does not carry exactly its two policies';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'install_windows'
       AND policyname = 'install_windows_client_select'
       AND cmd = 'SELECT' AND qual LIKE '%confirmed%'
  ) THEN
    RAISE EXCEPTION 'FAIL 11h: the client policy does not restrict to confirmed';
  END IF;

  RAISE NOTICE 'PASS 11: ACLs, search_path, RLS and the two policies are as authored';
END $$;

ROLLBACK;
