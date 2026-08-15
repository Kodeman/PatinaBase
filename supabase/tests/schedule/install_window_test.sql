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
--      date (the posture 00475 established for a dateless proposal).
--   9. Releasing a merely HELD window is a state flip and nothing else.
--  10. 00475's marker contract, directly: a dateless phase-anchor edit raises
--      unless it says `"clear": true`, on the commit path and the proposal
--      path alike, and the marker is what release_install_window sends.
--  11. ACLs, pinned search_path, RLS and the two policies are as authored.
--  12. A dateless unpin proposal is an ordinary proposal row: it upserts under
--      the live-phase unique rather than stacking, and the ratchet holds it.
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

GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO authenticated;

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
--
-- The client's surface is install_windows_client_v; the table itself is not a
-- client surface at all, so both are asserted.

DO $$
DECLARE v_visible integer; v_denied boolean := false;
BEGIN
  PERFORM pg_temp.assume_role('b1a5e000-0000-4000-8000-000000000003');
  SELECT count(*) INTO v_visible FROM public.install_windows_client_v
   WHERE project_id = 'b1a5e000-0000-4000-8000-0000000000a1';
  PERFORM pg_temp.reset_role();
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'FAIL 4a: a client saw % window(s) that are not confirmed', v_visible;
  END IF;

  -- The table carries no client policy any more, so a direct read returns
  -- nothing even though the client holds SELECT on it.
  PERFORM pg_temp.assume_role('b1a5e000-0000-4000-8000-000000000003');
  BEGIN
    SELECT count(*) INTO v_visible FROM public.install_windows
     WHERE project_id = 'b1a5e000-0000-4000-8000-0000000000a1';
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  PERFORM pg_temp.reset_role();
  IF NOT v_denied AND v_visible <> 0 THEN
    RAISE EXCEPTION 'FAIL 4a2: a client read % row(s) off the table itself', v_visible;
  END IF;
  RAISE NOTICE 'PASS 4a: a held window is studio-only, and the table is not a client surface';
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
  IF NOT v_row.anchored THEN
    RAISE EXCEPTION 'FAIL 5d2: a confirmation that hardened must record anchored = true';
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
DECLARE v_visible integer; v_cols text;
BEGIN
  PERFORM pg_temp.assume_role('b1a5e000-0000-4000-8000-000000000003');
  SELECT count(*) INTO v_visible FROM public.install_windows_client_v
   WHERE project_id = 'b1a5e000-0000-4000-8000-0000000000a1';
  PERFORM pg_temp.reset_role();
  IF v_visible <> 1 THEN
    RAISE EXCEPTION 'FAIL 4b: a client saw % window(s), expected exactly the confirmed one', v_visible;
  END IF;

  PERFORM pg_temp.assume_role('b1a5e000-0000-4000-8000-000000000004');
  SELECT count(*) INTO v_visible FROM public.install_windows_client_v
   WHERE project_id = 'b1a5e000-0000-4000-8000-0000000000a1';
  PERFORM pg_temp.reset_role();
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'FAIL 4c: a stranger saw % window(s)', v_visible;
  END IF;

  -- R101: the span and the fact cross. The studio's working reasoning — the
  -- pre-consent impact above all — does not.
  SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'install_windows_client_v'
     AND column_name IN ('disclosed_impact', 'release_disclosed_impact', 'held_by',
                         'confirmed_by', 'released_by', 'phase_id', 'state',
                         'held_until', 'anchored');
  IF v_cols IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 4d: the client view exposes studio-side columns (%)', v_cols;
  END IF;
  RAISE NOTICE 'PASS 4b: a confirmed window reaches the client, span only; a stranger sees none';
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
  -- I126: release is a ceremony, so its disclosure persists on the row and not
  -- only in the revision reason.
  IF v_row.release_disclosed_impact->>'sentence' IS NULL THEN
    RAISE EXCEPTION 'FAIL 6f: the release did not record what it stated';
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
  IF v_row.anchored THEN
    RAISE EXCEPTION 'FAIL 7b2: a downgraded confirmation must record anchored = false';
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

-- ─── 8a. Releasing a window that never ANCHORED is bookkeeping ─────────────
--
-- The window from case 7 confirmed but was downgraded, so it pinned nothing.
-- Releasing it must not propose an unpin, and above all must not clear a
-- phase this window never wrote to.

SELECT public.release_install_window(
  pg_temp.wid('undisclosed'), 'Install window released', NULL);

DO $$
DECLARE v_released integer;
BEGIN
  IF (SELECT state FROM public.install_windows WHERE id = pg_temp.wid('undisclosed')) <> 'released' THEN
    RAISE EXCEPTION 'FAIL 8a: the window did not release';
  END IF;
  IF pg_temp.revision_count() <> 2 THEN
    RAISE EXCEPTION 'FAIL 8b: releasing an unanchored window must cut no revision, total is %',
      pg_temp.revision_count();
  END IF;
  SELECT count(*) INTO v_released FROM public.schedule_proposals
   WHERE project_id = 'b1a5e000-0000-4000-8000-0000000000a1'
     AND source_event = 'install-window-released';
  IF v_released <> 0 THEN
    RAISE EXCEPTION 'FAIL 8c: a window that never anchored proposed an unpin (% rows)', v_released;
  END IF;
  RAISE NOTICE 'PASS 8a: releasing a window that never anchored proposes nothing';
END $$;

-- ─── 8b. Releasing an ANCHORED window with NO stated impact proposes ───────

INSERT INTO ids (name, id)
SELECT 'anchored-then-undisclosed', public.hold_install_window(
  'b1a5e000-0000-4000-8000-0000000000a1', DATE '2026-10-05', DATE '2026-10-09');

SELECT public.confirm_install_window(
  pg_temp.wid('anchored-then-undisclosed'),
  jsonb_build_object('sentence', 'The install phase moves to Oct 5.'));

SELECT public.release_install_window(
  pg_temp.wid('anchored-then-undisclosed'), 'Install window released', NULL);

DO $$
DECLARE v_proposal public.schedule_proposals%ROWTYPE;
BEGIN
  IF (SELECT state FROM public.install_windows WHERE id = pg_temp.wid('anchored-then-undisclosed')) <> 'released' THEN
    RAISE EXCEPTION 'FAIL 8d: the window did not release';
  END IF;
  -- The confirm hardened (revision 3); the undisclosed release must not.
  IF pg_temp.revision_count() <> 3 THEN
    RAISE EXCEPTION 'FAIL 8e: an undisclosed release must cut no revision, total is %',
      pg_temp.revision_count();
  END IF;
  -- The anchor the confirm wrote is still standing: an undisclosed release
  -- PROPOSES the removal, it does not perform it.
  IF pg_temp.anchor_of('b1a5e000-0000-4000-8000-0000000000b2') IS DISTINCT FROM DATE '2026-10-05' THEN
    RAISE EXCEPTION 'FAIL 8f: an undisclosed release removed the anchor anyway (got %)',
      pg_temp.anchor_of('b1a5e000-0000-4000-8000-0000000000b2');
  END IF;

  SELECT * INTO v_proposal FROM public.schedule_proposals
   WHERE project_id = 'b1a5e000-0000-4000-8000-0000000000a1'
     AND source_event = 'install-window-released';
  IF v_proposal.id IS NULL THEN
    RAISE EXCEPTION 'FAIL 8g: no unpin proposal was recorded';
  END IF;
  IF v_proposal.proposed_anchor_date IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 8h: a proposed unpin carries no date, got %', v_proposal.proposed_anchor_date;
  END IF;
  IF v_proposal.target_phase_id <> 'b1a5e000-0000-4000-8000-0000000000b2' THEN
    RAISE EXCEPTION 'FAIL 8i: the unpin proposal names the wrong phase (%)', v_proposal.target_phase_id;
  END IF;
  IF v_proposal.conflicts_with_committed THEN
    RAISE EXCEPTION 'FAIL 8j: a proposed unpin was recorded as contradicting';
  END IF;
  RAISE NOTICE 'PASS 8b: an undisclosed release of an anchored window proposes a dateless unpin';
END $$;

-- ─── 10. 00475's marker contract, directly ────────────────────────────────
--
-- An unpin is an act, not an omission. 00475 refuses a dateless anchor edit
-- unless it carries `"clear": true` — the marker release_install_window sends
-- — and refuses it on the proposal path too, so a ceremony cannot launder a
-- malformed edit into a dateless proposal.

DO $$
DECLARE
  v_message text;
  v_anchor  date;
BEGIN
  -- 10a — commit path: no date, no marker, no unpin.
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
    RAISE EXCEPTION 'FAIL 10a: a dateless phase-anchor edit with no marker was accepted';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message LIKE 'FAIL 10a%' THEN RAISE; END IF;
    IF v_message NOT LIKE '%requires an anchor_date, or "clear": true%' THEN
      RAISE EXCEPTION 'FAIL 10b: unexpected refusal on the commit path (%)', v_message;
    END IF;
  END;

  -- 10c — proposal path: the same refusal, so an undisclosed ceremony cannot
  -- write a dateless proposal it never asked for.
  BEGIN
    PERFORM public._commit_schedule_edit_authorized(
      'b1a5e000-0000-4000-8000-0000000000a1',
      jsonb_build_array(jsonb_build_object(
        'kind', 'phase-anchor',
        'phase_id', 'b1a5e000-0000-4000-8000-0000000000b2'
      )),
      'A malformed ceremony edit',
      NULL,
      'ceremony:install-window-released'
    );
    RAISE EXCEPTION 'FAIL 10c: a dateless ceremony proposal with no marker was accepted';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message LIKE 'FAIL 10c%' THEN RAISE; END IF;
    IF v_message NOT LIKE '%requires an anchor_date, or "clear": true%' THEN
      RAISE EXCEPTION 'FAIL 10d: unexpected refusal on the proposal path (%)', v_message;
    END IF;
  END;

  -- 10e — the marker itself unpins, on the commit path, with no date present.
  UPDATE public.project_phases
     SET anchor_date = DATE '2026-10-05'
   WHERE id = 'b1a5e000-0000-4000-8000-0000000000b2';

  PERFORM public._commit_schedule_edit_authorized(
    'b1a5e000-0000-4000-8000-0000000000a1',
    jsonb_build_array(jsonb_build_object(
      'kind', 'phase-anchor',
      'phase_id', 'b1a5e000-0000-4000-8000-0000000000b2',
      'clear', true
    )),
    'A stated unpin',
    jsonb_build_object('sentence', 'stated'),
    'manual'
  );
  v_anchor := pg_temp.anchor_of('b1a5e000-0000-4000-8000-0000000000b2');
  IF v_anchor IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 10e: "clear": true did not unpin the anchor (got %)', v_anchor;
  END IF;

  RAISE NOTICE 'PASS 10: a dateless anchor edit needs the marker on both paths, and the marker unpins';
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

  -- 00476 redefines this door nowhere; 00475's zero-grant posture is intact.
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
     AND (NOT p.prosecdef
          OR NOT ('search_path=public, pg_temp' = ANY (p.proconfig)));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 11e: % is not a search_path-pinned SECURITY DEFINER', v_bad;
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.install_windows'::regclass) THEN
    RAISE EXCEPTION 'FAIL 11f: RLS is not enabled on install_windows';
  END IF;

  -- The client policy is retired: the counterparty reads a view, not the row.
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'install_windows') <> 1 THEN
    RAISE EXCEPTION 'FAIL 11g: install_windows does not carry exactly its one studio policy';
  END IF;

  -- ── table privileges, the assertion whose absence let the wide grant through
  -- (the shape ceremony_hardening_test.sql 8e–8g makes for schedule_proposals).
  -- TRUNCATE is named explicitly: it is not RLS-filtered, so a stray grant is
  -- a cross-tenant wipe rather than a policy question.
  SELECT string_agg(pr, ', ' ORDER BY pr) INTO v_bad
    FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS pr
   WHERE has_table_privilege('anon', 'public.install_windows', pr);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 11i: anon holds % on install_windows', v_bad;
  END IF;

  SELECT string_agg(pr, ', ' ORDER BY pr) INTO v_bad
    FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS pr
   WHERE has_table_privilege('authenticated', 'public.install_windows', pr);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 11j: authenticated holds % on install_windows — it may only SELECT', v_bad;
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.install_windows', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL 11k: authenticated cannot SELECT install_windows';
  END IF;
  IF has_table_privilege('authenticated', 'public.install_windows', 'TRUNCATE') THEN
    RAISE EXCEPTION 'FAIL 11l: authenticated can TRUNCATE install_windows';
  END IF;

  SELECT string_agg(pr, ', ' ORDER BY pr) INTO v_bad
    FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS pr
   WHERE has_table_privilege('service_role', 'public.install_windows', pr);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 11m: service_role holds % on install_windows — the RPCs are DEFINER-owned', v_bad;
  END IF;

  -- The client view: readable by authenticated (the view's own WHERE names the
  -- client), closed to anon.
  IF NOT has_table_privilege('authenticated', 'public.install_windows_client_v', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL 11n: authenticated cannot read the client view';
  END IF;
  IF has_table_privilege('anon', 'public.install_windows_client_v', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL 11o: anon can read the client view';
  END IF;

  -- The structural half of the state machine.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.install_windows'::regclass
       AND tgname = 'install_windows_ratchet' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'FAIL 11p: install_windows carries no ratchet trigger';
  END IF;

  -- TOCTOU: both doors take the row before they judge it, and both terminal
  -- UPDATEs are state-qualified.
  IF (SELECT prosrc FROM pg_proc WHERE proname = 'confirm_install_window') NOT LIKE '%FOR UPDATE%'
     OR (SELECT prosrc FROM pg_proc WHERE proname = 'release_install_window') NOT LIKE '%FOR UPDATE%' THEN
    RAISE EXCEPTION 'FAIL 11q: a ceremony door reads its window without FOR UPDATE';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE proname = 'confirm_install_window') NOT LIKE '%AND state = ''held''%' THEN
    RAISE EXCEPTION 'FAIL 11r: confirm''s terminal UPDATE is not state-qualified';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE proname = 'release_install_window') NOT LIKE '%AND state <> ''released''%' THEN
    RAISE EXCEPTION 'FAIL 11s: release''s terminal UPDATE is not state-qualified';
  END IF;

  RAISE NOTICE 'PASS 11: ACLs, table grants, search_path, RLS, the client view and the ratchet are as authored';
END $$;

-- ─── 12. A dateless unpin proposal is an ordinary proposal row ─────────────
--
-- The unpin proposal is the one row shape 00475's uniques and ratchet had no
-- caller for. It must nag-stack like any other (one live row per project /
-- target / event, refreshed in place) and resolve one way only.

DO $$
DECLARE
  v_wid      uuid;
  v_before   integer;
  v_row      public.schedule_proposals%ROWTYPE;
  v_message  text;
BEGIN
  SELECT count(*) INTO v_before FROM public.schedule_proposals
   WHERE project_id = 'b1a5e000-0000-4000-8000-0000000000a1'
     AND source_event = 'install-window-released'
     AND state = 'proposed';
  IF v_before <> 1 THEN
    RAISE EXCEPTION 'FAIL 12a: case 8 should have left exactly one live unpin proposal, found %', v_before;
  END IF;

  -- A second anchored confirm → undisclosed release on the same phase. The
  -- release proposal must REFRESH the standing row, not stack a second nag.
  v_wid := public.hold_install_window(
    'b1a5e000-0000-4000-8000-0000000000a1', DATE '2026-11-02', DATE '2026-11-06');
  PERFORM public.confirm_install_window(
    v_wid, jsonb_build_object('sentence', 'The install phase moves to Nov 2.'));
  PERFORM public.release_install_window(v_wid, 'Install window released', NULL);

  SELECT count(*) INTO v_before FROM public.schedule_proposals
   WHERE project_id = 'b1a5e000-0000-4000-8000-0000000000a1'
     AND source_event = 'install-window-released'
     AND state = 'proposed';
  IF v_before <> 1 THEN
    RAISE EXCEPTION 'FAIL 12b: a repeated unpin proposal stacked instead of upserting (% live)', v_before;
  END IF;

  SELECT * INTO v_row FROM public.schedule_proposals
   WHERE project_id = 'b1a5e000-0000-4000-8000-0000000000a1'
     AND source_event = 'install-window-released'
     AND state = 'proposed';
  IF v_row.proposed_anchor_date IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 12c: the refreshed unpin proposal grew a date (%)', v_row.proposed_anchor_date;
  END IF;
  -- The standing nag keeps naming the occurrence that RAISED it: 00476's
  -- ratchet coerces source_ref back, which is what lets 00475's upsert refresh
  -- a live row at all instead of deadlocking against its own freeze.
  IF v_row.source_ref = v_wid THEN
    RAISE EXCEPTION 'FAIL 12d: the upsert rewrote the standing proposal''s provenance';
  END IF;
  IF v_row.source_ref IS NULL THEN
    RAISE EXCEPTION 'FAIL 12d2: the standing proposal lost its provenance entirely';
  END IF;
  -- A removal never contradicts the anchor it removes.
  IF v_row.conflicts_with_committed THEN
    RAISE EXCEPTION 'FAIL 12e: a proposed unpin was recorded as contradicting';
  END IF;

  -- The ratchet: resolving stamps the resolution, and history is final.
  UPDATE public.schedule_proposals SET state = 'dismissed' WHERE id = v_row.id;
  SELECT * INTO v_row FROM public.schedule_proposals WHERE id = v_row.id;
  IF v_row.resolved_at IS NULL THEN
    RAISE EXCEPTION 'FAIL 12f: dismissing the unpin proposal left no resolution stamp';
  END IF;

  BEGIN
    UPDATE public.schedule_proposals SET state = 'proposed' WHERE id = v_row.id;
    RAISE EXCEPTION 'FAIL 12g: a dismissed unpin proposal was revived';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message NOT LIKE '%is history and cannot be rewritten%' THEN
      RAISE EXCEPTION 'FAIL 12h: unexpected ratchet refusal (%)', v_message;
    END IF;
  END;

  RAISE NOTICE 'PASS 12: a dateless unpin proposal upserts under the live unique and ratchets shut';
END $$;

-- ─── 13. Confirming over a CONTRADICTING committed anchor never pins ───────
--
-- R109's third class. The disclosure is perfect; the date still contradicts an
-- anchor already committed on the target, so 00475's door proposes instead of
-- writing — and `anchored` is the only thing on the row that says so.

DO $$
DECLARE
  v_wid      uuid;
  v_row      public.install_windows%ROWTYPE;
  v_proposal public.schedule_proposals%ROWTYPE;
  v_revs     integer;
BEGIN
  UPDATE public.project_phases
     SET anchor_date = DATE '2026-03-15'
   WHERE id = 'b1a5e000-0000-4000-8000-0000000000b2';
  v_revs := pg_temp.revision_count();

  v_wid := public.hold_install_window(
    'b1a5e000-0000-4000-8000-0000000000a1', DATE '2026-12-07', DATE '2026-12-11');
  PERFORM public.confirm_install_window(
    v_wid, jsonb_build_object('sentence', 'The install phase moves to Dec 7; three lines follow.'));

  SELECT * INTO v_row FROM public.install_windows WHERE id = v_wid;
  IF v_row.state <> 'confirmed' THEN
    RAISE EXCEPTION 'FAIL 13a: the ceremony must still stand (%)', v_row.state;
  END IF;
  IF v_row.anchored THEN
    RAISE EXCEPTION 'FAIL 13b: a contradicting confirmation must record anchored = false';
  END IF;
  IF v_row.disclosed_impact->>'sentence' IS NULL THEN
    RAISE EXCEPTION 'FAIL 13c: the disclosure was well-formed and must be recorded';
  END IF;
  IF pg_temp.anchor_of('b1a5e000-0000-4000-8000-0000000000b2') IS DISTINCT FROM DATE '2026-03-15' THEN
    RAISE EXCEPTION 'FAIL 13d: the committed anchor was overwritten (got %)',
      pg_temp.anchor_of('b1a5e000-0000-4000-8000-0000000000b2');
  END IF;
  IF pg_temp.revision_count() <> v_revs THEN
    RAISE EXCEPTION 'FAIL 13e: a contradiction must cut no revision';
  END IF;

  SELECT * INTO v_proposal FROM public.schedule_proposals
   WHERE project_id = 'b1a5e000-0000-4000-8000-0000000000a1'
     AND source_event = 'install-window-confirmed' AND state = 'proposed';
  IF v_proposal.id IS NULL OR NOT v_proposal.conflicts_with_committed THEN
    RAISE EXCEPTION 'FAIL 13f: the contradiction was not reported (%)', to_jsonb(v_proposal);
  END IF;

  -- And releasing it must not destroy the anchor some other act committed.
  PERFORM public.release_install_window(
    v_wid, 'Install window released',
    jsonb_build_object('sentence', 'Removing the anchor returns the install phase to the chain.'));
  IF pg_temp.anchor_of('b1a5e000-0000-4000-8000-0000000000b2') IS DISTINCT FROM DATE '2026-03-15' THEN
    RAISE EXCEPTION 'FAIL 13g: releasing an unanchored window destroyed a foreign anchor';
  END IF;

  RAISE NOTICE 'PASS 13: a contradicting confirmation reports, never pins, and its release destroys nothing';
END $$;

-- ─── 14. A release never clears an anchor another act has since moved ──────

DO $$
DECLARE v_wid uuid; v_proposals integer;
BEGIN
  UPDATE public.project_phases SET anchor_date = NULL
   WHERE id = 'b1a5e000-0000-4000-8000-0000000000b2';
  UPDATE public.schedule_proposals SET state = 'dismissed'
   WHERE project_id = 'b1a5e000-0000-4000-8000-0000000000a1' AND state = 'proposed';

  v_wid := public.hold_install_window(
    'b1a5e000-0000-4000-8000-0000000000a1', DATE '2027-01-11', DATE '2027-01-15');
  PERFORM public.confirm_install_window(
    v_wid, jsonb_build_object('sentence', 'The install phase moves to Jan 11.'));
  IF pg_temp.anchor_of('b1a5e000-0000-4000-8000-0000000000b2') IS DISTINCT FROM DATE '2027-01-11' THEN
    RAISE EXCEPTION 'FAIL 14a: the confirmation did not pin';
  END IF;

  -- Another act moves the anchor out from under the window.
  UPDATE public.project_phases SET anchor_date = DATE '2027-02-08'
   WHERE id = 'b1a5e000-0000-4000-8000-0000000000b2';

  PERFORM public.release_install_window(
    v_wid, 'Install window released',
    jsonb_build_object('sentence', 'Removing the anchor returns the install phase to the chain.'));

  IF pg_temp.anchor_of('b1a5e000-0000-4000-8000-0000000000b2') IS DISTINCT FROM DATE '2027-02-08' THEN
    RAISE EXCEPTION 'FAIL 14b: the release cleared a date it never wrote (got %)',
      pg_temp.anchor_of('b1a5e000-0000-4000-8000-0000000000b2');
  END IF;
  SELECT count(*) INTO v_proposals FROM public.schedule_proposals
   WHERE project_id = 'b1a5e000-0000-4000-8000-0000000000a1'
     AND source_event = 'install-window-released' AND state = 'proposed';
  IF v_proposals <> 1 THEN
    RAISE EXCEPTION 'FAIL 14c: the diverged release did not propose (% rows)', v_proposals;
  END IF;
  RAISE NOTICE 'PASS 14: a release whose anchor moved on proposes instead of clearing blind';
END $$;

-- ─── 15. A project with no main lane confirms, target-less ────────────────

INSERT INTO projects (id, name, designer_id, client_id, created_by, start_date)
VALUES ('b1a5e000-0000-4000-8000-0000000000a2', 'Chainless Project',
        'b1a5e000-0000-4000-8000-000000000001', 'b1a5e000-0000-4000-8000-000000000003',
        'b1a5e000-0000-4000-8000-000000000001', DATE '2026-01-01');

DO $$
DECLARE v_wid uuid; v_row public.install_windows%ROWTYPE; v_proposal public.schedule_proposals%ROWTYPE;
BEGIN
  IF public._install_window_phase('b1a5e000-0000-4000-8000-0000000000a2') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 15a: a phaseless project resolved a phase';
  END IF;

  v_wid := public.hold_install_window(
    'b1a5e000-0000-4000-8000-0000000000a2', DATE '2026-06-01', DATE '2026-06-05');
  -- The ceremony still runs (R110). It must not raise.
  PERFORM public.confirm_install_window(
    v_wid, jsonb_build_object('sentence', 'The install week is set.'));

  SELECT * INTO v_row FROM public.install_windows WHERE id = v_wid;
  IF v_row.state <> 'confirmed' THEN
    RAISE EXCEPTION 'FAIL 15b: the confirmation did not stand (%)', v_row.state;
  END IF;
  IF v_row.anchored OR v_row.phase_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 15c: a target-less confirmation claimed an anchor';
  END IF;

  SELECT * INTO v_proposal FROM public.schedule_proposals
   WHERE project_id = 'b1a5e000-0000-4000-8000-0000000000a2';
  IF v_proposal.id IS NULL THEN
    RAISE EXCEPTION 'FAIL 15d: no target-less proposal was recorded';
  END IF;
  IF v_proposal.target_phase_id IS NOT NULL OR v_proposal.target_milestone_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 15e: the proposal named a target it does not have';
  END IF;
  IF v_proposal.proposed_anchor_date <> DATE '2026-06-01'
     OR v_proposal.source_event <> 'install-window-confirmed' THEN
    RAISE EXCEPTION 'FAIL 15f: the target-less proposal does not carry the act (%)', to_jsonb(v_proposal);
  END IF;

  -- Releasing it is a state flip: there was never anything to unpin.
  PERFORM public.release_install_window(v_wid, 'Install window released', NULL);
  IF (SELECT state FROM public.install_windows WHERE id = v_wid) <> 'released' THEN
    RAISE EXCEPTION 'FAIL 15g: the target-less window did not release';
  END IF;
  RAISE NOTICE 'PASS 15: a chainless project confirms target-less rather than failing';
END $$;

-- ─── 16. The install_windows ratchet ──────────────────────────────────────

DO $$
DECLARE v_wid uuid; v_message text;
BEGIN
  v_wid := public.hold_install_window(
    'b1a5e000-0000-4000-8000-0000000000a2', DATE '2027-03-01', DATE '2027-03-05');

  -- Identity is fixed at the hold.
  BEGIN
    UPDATE public.install_windows SET starts_on = DATE '2027-04-01' WHERE id = v_wid;
    RAISE EXCEPTION 'FAIL 16a: the span was rewritten after the hold';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message NOT LIKE '%fixed when it was held%' THEN
      RAISE EXCEPTION 'FAIL 16b: unexpected refusal (%)', v_message;
    END IF;
  END;

  -- The stamps are derived, never taken from the writer.
  UPDATE public.install_windows
     SET state = 'confirmed', confirmed_by = 'b1a5e000-0000-4000-8000-000000000004'
   WHERE id = v_wid;
  IF (SELECT confirmed_by FROM public.install_windows WHERE id = v_wid)
     <> 'b1a5e000-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'FAIL 16c: a forged confirmed_by survived the ratchet';
  END IF;

  -- A confirmed window may only be released.
  BEGIN
    UPDATE public.install_windows SET state = 'held' WHERE id = v_wid;
    RAISE EXCEPTION 'FAIL 16d: a confirmed window was returned to held';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message NOT LIKE '%may only be released%' THEN
      RAISE EXCEPTION 'FAIL 16e: unexpected refusal (%)', v_message;
    END IF;
  END;

  -- The anchor claim is settled at the confirmation.
  BEGIN
    UPDATE public.install_windows SET anchored = true WHERE id = v_wid;
    RAISE EXCEPTION 'FAIL 16f: an anchor claim was invented after the fact';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Released is terminal.
  UPDATE public.install_windows SET state = 'released' WHERE id = v_wid;
  BEGIN
    UPDATE public.install_windows SET state = 'confirmed' WHERE id = v_wid;
    RAISE EXCEPTION 'FAIL 16g: a released window was revived';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message NOT LIKE '%history and cannot be rewritten%' THEN
      RAISE EXCEPTION 'FAIL 16h: unexpected refusal (%)', v_message;
    END IF;
  END;
  RAISE NOTICE 'PASS 16: the install window ratchet fixes identity, advances state, derives its stamps';
END $$;

-- ─── 17. A comember cannot write the table directly ───────────────────────
--
-- Case 16 runs as superuser, which no session is. This is the same table seen
-- from the role a studio member actually holds.

DO $$
DECLARE
  v_forged integer := 0;
  v_ok     boolean;
BEGIN
  PERFORM pg_temp.assume_role('b1a5e000-0000-4000-8000-000000000002');

  BEGIN
    INSERT INTO public.install_windows (project_id, starts_on, ends_on, state)
    VALUES ('b1a5e000-0000-4000-8000-0000000000a1', DATE '2027-05-03', DATE '2027-05-07', 'confirmed');
    v_forged := v_forged + 1;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.install_windows SET state = 'confirmed'
     WHERE project_id = 'b1a5e000-0000-4000-8000-0000000000a1';
    IF FOUND THEN v_forged := v_forged + 1; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    DELETE FROM public.install_windows
     WHERE project_id = 'b1a5e000-0000-4000-8000-0000000000a1';
    IF FOUND THEN v_forged := v_forged + 1; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    EXECUTE 'TRUNCATE public.install_windows';
    v_forged := v_forged + 1;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Reading is the one thing a comember may do.
  SELECT count(*) > 0 INTO v_ok FROM public.install_windows
   WHERE project_id = 'b1a5e000-0000-4000-8000-0000000000a1';

  PERFORM pg_temp.reset_role();

  IF v_forged <> 0 THEN
    RAISE EXCEPTION 'FAIL 17a: a comember performed % direct write(s) on the evidence table', v_forged;
  END IF;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'FAIL 17b: a comember cannot read its own studio''s windows';
  END IF;
  RAISE NOTICE 'PASS 17: a comember may read the evidence table and may not write it';
END $$;

ROLLBACK;
