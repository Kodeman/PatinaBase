-- ═══════════════════════════════════════════════════════════════════════════
-- Schedule ceremony hardening tests (migration 00475 — R109 / R110, I130)
--
-- Exercises the mechanism Wave 2 installs:
--   1. A ceremony-sourced commit WITH a disclosed impact hardens: exactly one
--      anchor, one revision, zero proposals — and the revision's reason
--      carries what the ceremony stated.
--   2. A ceremony-sourced commit with a NULL disclosed impact PROPOSES: zero
--      anchors, zero revisions, one schedule_proposals row (the R110
--      downgrade, enforced server-side).
--   3. The partial unique index refuses to stack a second live proposal for
--      the same (project, phase, event) — no nag-stacking.
--   4. The proposal commit path: commit_schedule_edit applies the anchor and
--      cuts a revision; the proposal ratchets to 'committed'.
--   5. The milestone-anchor edit kind pins anchor_date and CLEARS offset_days
--      (the mirror of milestone-offset clearing anchor_date).
--   6. ACL: _commit_schedule_edit_authorized carries ZERO grants — PUBLIC,
--      anon, authenticated and service_role all lack EXECUTE, so po-send can
--      never call it and an operational fact can only ever propose.
--   7. Every re-cut ceremony body actually carries its graft, and
--      _execute_trade_scope_authorized deliberately carries none.
--   8. The table's grants and RLS: studio SELECT+UPDATE, service_role
--      SELECT+INSERT, nobody else — and no service_role at the manual door.
--   9. R109's third class: a date contradicting a committed anchor reports as
--      a flagged proposal and never overwrites; agreeing with it hardens.
--  10. R110 is a DISCLOSURE check — '{}'::jsonb proposes; a later fact
--      refreshes the live proposal rather than stacking a second.
--  11. The state ratchet, the server-derived resolved_by, and the proposal
--      branch's project scoping.
--  12. An unpin is an act: a missing anchor_date raises, "clear": true unpins.
--  13. R112's release shape: an undisclosed clear proposes a DATELESS unpin.
--  14. THE LIVE RPC PROBE — engage_trade_scope called as a real comember
--      session, asserting the anchor, the revision and its actor.
--  15. The same live RPC with nothing stated: proposes, never pins.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/schedule/ceremony_hardening_test.sql
--
-- Single transaction, ROLLBACK at the end — re-runnable with no side effects.
-- Runs as superuser: the focus is the mechanism, not RLS (the studio-only
-- policy on schedule_proposals is asserted structurally at the end).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('c0ffee00-0000-4000-8000-000000000001', 'ceremony-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('c0ffee00-0000-4000-8000-000000000001', 'ceremony-designer@test.invalid', 'Ceremony Designer', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO projects (id, name, designer_id, created_by, start_date)
VALUES ('c0ffee00-0000-4000-8000-0000000000a1', 'Ceremony Hardening Project',
        'c0ffee00-0000-4000-8000-000000000001', 'c0ffee00-0000-4000-8000-000000000001',
        DATE '2026-01-01');

INSERT INTO project_phases (id, project_id, name, phase_key, status, sort_order, lane, duration_days)
VALUES
  ('c0ffee00-0000-4000-8000-0000000000b1', 'c0ffee00-0000-4000-8000-0000000000a1',
   'Design development', 'design_refinement', 'in_progress', 0, 'main', 14),
  ('c0ffee00-0000-4000-8000-0000000000b2', 'c0ffee00-0000-4000-8000-0000000000a1',
   'Procurement thread', 'procurement', 'pending', 1, 'thread', 30);

INSERT INTO schedule_milestones (id, phase_id, name, kind, offset_days, sort_order)
VALUES ('c0ffee00-0000-4000-8000-0000000000c1', 'c0ffee00-0000-4000-8000-0000000000b2',
        'Thread complete', 'event', 0, 0);

-- cut_schedule_revision derives its actor from auth.uid() (never a parameter).
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c0ffee00-0000-4000-8000-000000000001', 'role', 'authenticated')::text,
  true
);

-- ─── 1. A ceremony WITH a disclosed impact hardens ─────────────────────────

SELECT public._commit_schedule_edit_authorized(
  'c0ffee00-0000-4000-8000-0000000000a1',
  jsonb_build_array(jsonb_build_object(
    'kind', 'phase-anchor',
    'phase_id', 'c0ffee00-0000-4000-8000-0000000000b2',
    'anchor_date', '2026-02-01',
    'source_ref', 'c0ffee00-0000-4000-8000-0000000000d1'
  )),
  'Furnishings authorization executed',
  jsonb_build_object('sentence', 'Procurement thread anchored Feb 1.'),
  'ceremony:furnishings-authorization-executed'
) AS harden_v \gset

DO $$
DECLARE v_anchor date; v_revisions int; v_proposals int; v_reason text;
BEGIN
  SELECT anchor_date INTO v_anchor FROM project_phases
   WHERE id = 'c0ffee00-0000-4000-8000-0000000000b2';
  IF v_anchor IS DISTINCT FROM DATE '2026-02-01' THEN
    RAISE EXCEPTION 'FAIL 1a: disclosed ceremony did not set the anchor (got %)', v_anchor;
  END IF;

  SELECT count(*) INTO v_revisions FROM schedule_revisions
   WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1';
  IF v_revisions <> 1 THEN
    RAISE EXCEPTION 'FAIL 1b: expected exactly one revision, got %', v_revisions;
  END IF;

  SELECT count(*) INTO v_proposals FROM schedule_proposals
   WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1';
  IF v_proposals <> 0 THEN
    RAISE EXCEPTION 'FAIL 1c: a disclosed ceremony must write no proposal, got %', v_proposals;
  END IF;

  SELECT reason INTO v_reason FROM schedule_revisions
   WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1';
  IF v_reason NOT LIKE '%Procurement thread anchored Feb 1.%' THEN
    RAISE EXCEPTION 'FAIL 1d: the revision does not carry what the ceremony stated (%)', v_reason;
  END IF;

  RAISE NOTICE 'PASS 1: a stated impact hardens — one anchor, one revision, no proposal';
END $$;

-- Reset the anchor so case 2 measures itself, not case 1.
UPDATE project_phases SET anchor_date = NULL
 WHERE id = 'c0ffee00-0000-4000-8000-0000000000b2';
DELETE FROM schedule_revisions WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1';

-- ─── 2. A ceremony with NO disclosed impact proposes (R110 downgrade) ──────

DO $$
DECLARE v_result integer;
BEGIN
  v_result := public._commit_schedule_edit_authorized(
    'c0ffee00-0000-4000-8000-0000000000a1',
    jsonb_build_array(jsonb_build_object(
      'kind', 'phase-anchor',
      'phase_id', 'c0ffee00-0000-4000-8000-0000000000b2',
      'anchor_date', '2026-03-15',
      'source_ref', 'c0ffee00-0000-4000-8000-0000000000d1'
    )),
    'Furnishings authorization executed',
    NULL,
    'ceremony:furnishings-authorization-executed'
  );
  IF v_result IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 2a: an undisclosed ceremony must cut no revision, got v=%', v_result;
  END IF;
END $$;

DO $$
DECLARE v_anchor date; v_revisions int; v_row schedule_proposals%ROWTYPE;
BEGIN
  SELECT anchor_date INTO v_anchor FROM project_phases
   WHERE id = 'c0ffee00-0000-4000-8000-0000000000b2';
  IF v_anchor IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 2b: an undisclosed ceremony must NOT write an anchor (got %)', v_anchor;
  END IF;

  SELECT count(*) INTO v_revisions FROM schedule_revisions
   WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1';
  IF v_revisions <> 0 THEN
    RAISE EXCEPTION 'FAIL 2c: an undisclosed ceremony must cut no revision, got %', v_revisions;
  END IF;

  SELECT * INTO v_row FROM schedule_proposals
   WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1';
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'FAIL 2d: no proposal was recorded';
  END IF;
  IF v_row.source_event <> 'furnishings-authorization-executed'
     OR v_row.target_phase_id <> 'c0ffee00-0000-4000-8000-0000000000b2'
     OR v_row.proposed_anchor_date <> DATE '2026-03-15'
     OR v_row.state <> 'proposed'
     OR v_row.source_ref <> 'c0ffee00-0000-4000-8000-0000000000d1' THEN
    RAISE EXCEPTION 'FAIL 2e: the proposal row does not carry the act (%)', to_jsonb(v_row);
  END IF;

  RAISE NOTICE 'PASS 2: an undisclosed ceremony proposes — no anchor, no revision, one proposal';
END $$;

-- ─── 3. No nag-stacking ────────────────────────────────────────────────────

DO $$
DECLARE v_count int;
BEGIN
  BEGIN
    INSERT INTO schedule_proposals (
      project_id, source_event, target_phase_id, proposed_anchor_date
    ) VALUES (
      'c0ffee00-0000-4000-8000-0000000000a1', 'furnishings-authorization-executed',
      'c0ffee00-0000-4000-8000-0000000000b2', DATE '2026-04-01'
    );
    RAISE EXCEPTION 'FAIL 3a: a second live proposal for the same target was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  SELECT count(*) INTO v_count FROM schedule_proposals
   WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1' AND state = 'proposed';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 3b: expected exactly one live proposal, got %', v_count;
  END IF;

  RAISE NOTICE 'PASS 3: the partial unique index refuses to stack a second live proposal';
END $$;

-- ─── 4. The designer commits the proposal in one act ──────────────────────

DO $$
DECLARE v_proposal_id uuid; v_v integer; v_anchor date; v_state text; v_revisions int;
BEGIN
  SELECT id INTO v_proposal_id FROM schedule_proposals
   WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1' AND state = 'proposed';

  v_v := public.commit_schedule_edit(
    'c0ffee00-0000-4000-8000-0000000000a1',
    jsonb_build_array(jsonb_build_object(
      'kind', 'phase-anchor',
      'phase_id', 'c0ffee00-0000-4000-8000-0000000000b2',
      'anchor_date', '2026-03-15'
    )),
    'Furnishings authorization executed — proposed anchor committed'
  );
  IF v_v IS NULL THEN
    RAISE EXCEPTION 'FAIL 4a: the manual door must return the revision v';
  END IF;

  UPDATE schedule_proposals
     SET state = 'committed', resolved_at = now(),
         resolved_by = 'c0ffee00-0000-4000-8000-000000000001'
   WHERE id = v_proposal_id AND state = 'proposed';

  SELECT anchor_date INTO v_anchor FROM project_phases
   WHERE id = 'c0ffee00-0000-4000-8000-0000000000b2';
  IF v_anchor IS DISTINCT FROM DATE '2026-03-15' THEN
    RAISE EXCEPTION 'FAIL 4b: the committed proposal did not set the anchor (got %)', v_anchor;
  END IF;

  SELECT count(*) INTO v_revisions FROM schedule_revisions
   WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1';
  IF v_revisions <> 1 THEN
    RAISE EXCEPTION 'FAIL 4c: the commit must cut exactly one revision, got %', v_revisions;
  END IF;

  SELECT state INTO v_state FROM schedule_proposals WHERE id = v_proposal_id;
  IF v_state <> 'committed' THEN
    RAISE EXCEPTION 'FAIL 4d: the proposal did not ratchet to committed (got %)', v_state;
  END IF;

  RAISE NOTICE 'PASS 4: committing a proposal writes the anchor, cuts a revision, ratchets the row';
END $$;

-- ─── 5. milestone-anchor pins the date and clears the offset ──────────────

DO $$
DECLARE v_anchor date; v_offset integer;
BEGIN
  PERFORM public.commit_schedule_edit(
    'c0ffee00-0000-4000-8000-0000000000a1',
    jsonb_build_array(jsonb_build_object(
      'kind', 'milestone-anchor',
      'milestone_id', 'c0ffee00-0000-4000-8000-0000000000c1',
      'anchor_date', '2026-05-20'
    )),
    'Trade scope accepted'
  );

  SELECT anchor_date, offset_days INTO v_anchor, v_offset
    FROM schedule_milestones WHERE id = 'c0ffee00-0000-4000-8000-0000000000c1';
  IF v_anchor IS DISTINCT FROM DATE '2026-05-20' THEN
    RAISE EXCEPTION 'FAIL 5a: milestone-anchor did not pin the date (got %)', v_anchor;
  END IF;
  IF v_offset IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 5b: milestone-anchor must clear offset_days (got %)', v_offset;
  END IF;

  -- Foreign milestone ids are refused, project-scoped like every other kind.
  BEGIN
    PERFORM public.commit_schedule_edit(
      'c0ffee00-0000-4000-8000-0000000000a1',
      jsonb_build_array(jsonb_build_object(
        'kind', 'milestone-anchor',
        'milestone_id', 'c0ffee00-0000-4000-8000-0000000000ff',
        'anchor_date', '2026-05-20'
      )),
      NULL
    );
    RAISE EXCEPTION 'FAIL 5c: a foreign milestone id was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL 5c%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'PASS 5: milestone-anchor pins the date, clears the offset, and stays project-scoped';
END $$;

-- ─── 6. ACL: the internal is reachable by nobody ──────────────────────────

DO $$
DECLARE v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['public', 'anon', 'authenticated', 'service_role']
  LOOP
    IF has_function_privilege(
         v_role,
         'public._commit_schedule_edit_authorized(uuid,jsonb,text,jsonb,text)',
         'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL 6a: % can execute _commit_schedule_edit_authorized — R109 is not enforced by the ACL', v_role;
    END IF;
  END LOOP;

  -- The three target helpers carry the same posture.
  FOREACH v_role IN ARRAY ARRAY['public', 'anon', 'authenticated', 'service_role']
  LOOP
    IF has_function_privilege(v_role, 'public._schedule_thread_phase(uuid)', 'EXECUTE')
       OR has_function_privilege(v_role, 'public._schedule_engagement_start_phase(uuid)', 'EXECUTE')
       OR has_function_privilege(v_role, 'public._schedule_thread_completion_milestone(uuid)', 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL 6b: % can execute a schedule target helper', v_role;
    END IF;
  END LOOP;

  -- The public door stays exactly as it was.
  IF NOT has_function_privilege('authenticated', 'public.commit_schedule_edit(uuid,jsonb,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 6c: authenticated lost EXECUTE on commit_schedule_edit';
  END IF;
  IF has_function_privilege('anon', 'public.commit_schedule_edit(uuid,jsonb,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 6d: anon gained EXECUTE on commit_schedule_edit';
  END IF;

  RAISE NOTICE 'PASS 6: the internal and its helpers carry zero grants; the public door is unchanged';
END $$;

-- ─── 7. Every graft is present, and the one deliberate omission holds ─────

DO $$
DECLARE
  v_src text;
  v_pairs text[][] := ARRAY[
    ARRAY['_countersign_design_services_agreement_impl', 'ceremony:design-services-executed'],
    ARRAY['_execute_furnishings_authorization_authorized', 'ceremony:furnishings-authorization-executed'],
    ARRAY['_execute_furnishings_authorization_on_paper_authorized', 'ceremony:furnishings-authorization-executed'],
    ARRAY['engage_trade_scope', 'ceremony:trade-scope-engaged'],
    ARRAY['_accept_trade_scope_authorized', 'ceremony:trade-scope-accepted'],
    -- The paper rail is an independent copy of the acceptance body, not a
    -- wrapper: the same act must propose wherever it was signed.
    ARRAY['record_paper_trade_acceptance', 'ceremony:trade-scope-accepted']
  ];
  v_pair text[];
BEGIN
  FOREACH v_pair SLICE 1 IN ARRAY v_pairs
  LOOP
    SELECT p.prosrc INTO v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_pair[1];
    IF v_src IS NULL THEN
      RAISE EXCEPTION 'FAIL 7a: % does not exist', v_pair[1];
    END IF;
    IF v_src NOT LIKE '%_commit_schedule_edit_authorized%' THEN
      RAISE EXCEPTION 'FAIL 7b: % lost its schedule graft', v_pair[1];
    END IF;
    IF v_src NOT LIKE '%' || v_pair[2] || '%' THEN
      RAISE EXCEPTION 'FAIL 7c: % does not name the source event %', v_pair[1], v_pair[2];
    END IF;
  END LOOP;

  -- Execution is not engagement: _execute_trade_scope_authorized carries no
  -- graft, and 00424's RFQ closeout must still be there (the stale-body revert
  -- this migration deliberately avoided).
  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '_execute_trade_scope_authorized';
  IF v_src LIKE '%_commit_schedule_edit_authorized%' THEN
    RAISE EXCEPTION 'FAIL 7d: _execute_trade_scope_authorized grew a schedule graft';
  END IF;
  IF v_src NOT LIKE '%_close_trade_rfqs_for_scope%' THEN
    RAISE EXCEPTION 'FAIL 7e: _execute_trade_scope_authorized lost 00424''s RFQ closeout';
  END IF;

  -- The 00462 capability wrappers still mint their token.
  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'countersign_design_services_agreement';
  IF v_src NOT LIKE '%app.commercial_signature_capability%' THEN
    RAISE EXCEPTION 'FAIL 7f: the countersign capability wrapper lost its token';
  END IF;
  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'execute_furnishings_authorization_on_paper';
  IF v_src NOT LIKE '%app.commercial_signature_capability%' THEN
    RAISE EXCEPTION 'FAIL 7g: the on-paper capability wrapper lost its token';
  END IF;

  RAISE NOTICE 'PASS 7: every graft is present, execution carries none, the capability wrappers are intact';
END $$;

-- ─── 8. schedule_proposals is studio-only scaffolding (R101) ──────────────

DO $$
DECLARE v_policies int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'schedule_proposals' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'FAIL 8a: schedule_proposals has no row level security';
  END IF;

  SELECT count(*) INTO v_policies FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'schedule_proposals';
  IF v_policies <> 1 THEN
    RAISE EXCEPTION 'FAIL 8b: expected exactly one (studio) policy, got %', v_policies;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'schedule_proposals'
       AND qual LIKE '%is_studio_comember%'
  ) THEN
    RAISE EXCEPTION 'FAIL 8c: the schedule_proposals policy does not gate on is_studio_comember';
  END IF;

  IF has_table_privilege('anon', 'public.schedule_proposals', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL 8d: anon can read schedule_proposals';
  END IF;

  -- A studio member reads and ratchets. It never fabricates a fact, never
  -- erases one, and never wipes the table (TRUNCATE is not RLS-filtered).
  IF has_table_privilege('authenticated', 'public.schedule_proposals', 'INSERT')
     OR has_table_privilege('authenticated', 'public.schedule_proposals', 'DELETE')
     OR has_table_privilege('authenticated', 'public.schedule_proposals', 'TRUNCATE') THEN
    RAISE EXCEPTION 'FAIL 8e: authenticated holds more than SELECT + UPDATE on schedule_proposals';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.schedule_proposals', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.schedule_proposals', 'UPDATE') THEN
    RAISE EXCEPTION 'FAIL 8f: authenticated lost the reads/ratchet it needs';
  END IF;
  -- po-send records facts; it resolves nothing and deletes nothing.
  IF NOT has_table_privilege('service_role', 'public.schedule_proposals', 'INSERT')
     OR has_table_privilege('service_role', 'public.schedule_proposals', 'UPDATE')
     OR has_table_privilege('service_role', 'public.schedule_proposals', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL 8g: service_role does not hold exactly SELECT + INSERT';
  END IF;
  -- The manual door is the designer''s.
  IF has_function_privilege('service_role', 'public.commit_schedule_edit(uuid,jsonb,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 8h: service_role can execute the manual commit door';
  END IF;

  RAISE NOTICE 'PASS 8: schedule_proposals is RLS-enabled, studio-only, and narrowly granted';
END $$;

-- ─── 9. R109's third class: a contradiction reports, it never overwrites ──

DO $$
DECLARE v_anchor date; v_row schedule_proposals%ROWTYPE; v_revisions int;
BEGIN
  SELECT count(*) INTO v_revisions FROM schedule_revisions
   WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1';

  -- The thread phase carries 2026-03-15, committed in case 4. A ceremony now
  -- states a different date, fully disclosed.
  PERFORM public._commit_schedule_edit_authorized(
    'c0ffee00-0000-4000-8000-0000000000a1',
    jsonb_build_array(jsonb_build_object(
      'kind', 'phase-anchor',
      'phase_id', 'c0ffee00-0000-4000-8000-0000000000b2',
      'anchor_date', '2026-06-01',
      'source_ref', 'c0ffee00-0000-4000-8000-0000000000d2'
    )),
    'Trade scope engaged',
    jsonb_build_object('sentence', 'Procurement thread anchored Jun 1.'),
    'ceremony:trade-scope-engaged'
  );

  SELECT anchor_date INTO v_anchor FROM project_phases
   WHERE id = 'c0ffee00-0000-4000-8000-0000000000b2';
  IF v_anchor IS DISTINCT FROM DATE '2026-03-15' THEN
    RAISE EXCEPTION 'FAIL 9a: a contradicting ceremony overwrote a committed anchor (got %)', v_anchor;
  END IF;
  IF (SELECT count(*) FROM schedule_revisions
       WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1') <> v_revisions THEN
    RAISE EXCEPTION 'FAIL 9b: a contradiction cut a revision';
  END IF;

  SELECT * INTO v_row FROM schedule_proposals
   WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1'
     AND source_event = 'trade-scope-engaged';
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'FAIL 9c: the contradiction was not reported as a proposal';
  END IF;
  IF NOT v_row.conflicts_with_committed THEN
    RAISE EXCEPTION 'FAIL 9d: the proposal does not carry the contradiction flag';
  END IF;
  IF v_row.disclosed_context->>'statedImpact' IS NULL THEN
    RAISE EXCEPTION 'FAIL 9e: the downgraded proposal lost what the ceremony stated';
  END IF;

  -- Re-stating the SAME committed date is agreement, not contradiction: it
  -- hardens (a no-op write) and cuts a revision.
  PERFORM public._commit_schedule_edit_authorized(
    'c0ffee00-0000-4000-8000-0000000000a1',
    jsonb_build_array(jsonb_build_object(
      'kind', 'phase-anchor',
      'phase_id', 'c0ffee00-0000-4000-8000-0000000000b2',
      'anchor_date', '2026-03-15'
    )),
    'Trade scope engaged',
    jsonb_build_object('sentence', 'Procurement thread holds Mar 15.'),
    'ceremony:trade-scope-engaged'
  );
  IF (SELECT count(*) FROM schedule_revisions
       WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1') <> v_revisions + 1 THEN
    RAISE EXCEPTION 'FAIL 9f: agreeing with the committed anchor did not harden';
  END IF;

  RAISE NOTICE 'PASS 9: a contradicting date reports and never overwrites; agreement hardens';
END $$;

-- ─── 10. An empty disclosure is not a disclosure (R110) ──────────────────

DO $$
DECLARE v_anchor date; v_count int;
BEGIN
  UPDATE project_phases SET anchor_date = NULL
   WHERE id = 'c0ffee00-0000-4000-8000-0000000000b1';
  DELETE FROM schedule_proposals
   WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1';

  PERFORM public._commit_schedule_edit_authorized(
    'c0ffee00-0000-4000-8000-0000000000a1',
    jsonb_build_array(jsonb_build_object(
      'kind', 'phase-anchor',
      'phase_id', 'c0ffee00-0000-4000-8000-0000000000b1',
      'anchor_date', '2026-02-02'
    )),
    'Design services agreement executed',
    '{}'::jsonb,
    'ceremony:design-services-executed'
  );

  SELECT anchor_date INTO v_anchor FROM project_phases
   WHERE id = 'c0ffee00-0000-4000-8000-0000000000b1';
  IF v_anchor IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 10a: an empty jsonb hardened the anchor (got %)', v_anchor;
  END IF;
  SELECT count(*) INTO v_count FROM schedule_proposals
   WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1'
     AND source_event = 'design-services-executed';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 10b: an empty disclosure did not propose (got % rows)', v_count;
  END IF;

  -- A later, better date refreshes the LIVE row rather than stacking a second.
  PERFORM public._commit_schedule_edit_authorized(
    'c0ffee00-0000-4000-8000-0000000000a1',
    jsonb_build_array(jsonb_build_object(
      'kind', 'phase-anchor',
      'phase_id', 'c0ffee00-0000-4000-8000-0000000000b1',
      'anchor_date', '2026-02-09'
    )),
    'Design services agreement executed',
    NULL,
    'ceremony:design-services-executed'
  );
  SELECT count(*) INTO v_count FROM schedule_proposals
   WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1'
     AND source_event = 'design-services-executed';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 10c: a later fact stacked a second proposal (got %)', v_count;
  END IF;
  IF (SELECT proposed_anchor_date FROM schedule_proposals
       WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1'
         AND source_event = 'design-services-executed') <> DATE '2026-02-09' THEN
    RAISE EXCEPTION 'FAIL 10d: the live proposal kept the stale date';
  END IF;

  RAISE NOTICE 'PASS 10: an empty disclosure proposes, and a later fact refreshes the live row';
END $$;

-- ─── 11. The ratchet, the derived actor, and the project scope ───────────

DO $$
DECLARE v_id uuid; v_err text; v_resolved uuid;
BEGIN
  SELECT id INTO v_id FROM schedule_proposals
   WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1' AND state = 'proposed'
   LIMIT 1;

  -- resolved_by is derived, never taken from the caller.
  UPDATE schedule_proposals
     SET state = 'dismissed',
         resolved_by = 'c0ffee00-0000-4000-8000-0000000000ff'
   WHERE id = v_id;
  SELECT resolved_by INTO v_resolved FROM schedule_proposals WHERE id = v_id;
  IF v_resolved IS DISTINCT FROM 'c0ffee00-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'FAIL 11a: resolved_by was taken from the caller (got %)', v_resolved;
  END IF;
  IF (SELECT resolved_at FROM schedule_proposals WHERE id = v_id) IS NULL THEN
    RAISE EXCEPTION 'FAIL 11b: resolved_at was not stamped';
  END IF;

  -- History does not reopen.
  BEGIN
    UPDATE schedule_proposals SET state = 'proposed' WHERE id = v_id;
    RAISE EXCEPTION 'FAIL 11c: a dismissed proposal was resurrected';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  IF v_err NOT LIKE '%history%' THEN
    RAISE EXCEPTION 'FAIL 11d: unexpected ratchet refusal (%)', v_err;
  END IF;

  -- What a proposal names is fixed at the act.
  INSERT INTO schedule_proposals (project_id, source_event, target_phase_id, proposed_anchor_date)
  VALUES ('c0ffee00-0000-4000-8000-0000000000a1', 'po-sent',
          'c0ffee00-0000-4000-8000-0000000000b1', DATE '2026-04-01')
  RETURNING id INTO v_id;
  BEGIN
    UPDATE schedule_proposals SET source_event = 'trade-scope-engaged' WHERE id = v_id;
    RAISE EXCEPTION 'FAIL 11e: a live proposal was re-pointed at another act';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- The proposal branch is project-scoped like every write branch beside it.
  BEGIN
    PERFORM public._commit_schedule_edit_authorized(
      'c0ffee00-0000-4000-8000-0000000000a1',
      jsonb_build_array(jsonb_build_object(
        'kind', 'phase-anchor',
        'phase_id', 'c0ffee00-0000-4000-8000-0000000000ff',
        'anchor_date', '2026-02-02'
      )),
      NULL, NULL, 'ceremony:design-services-executed'
    );
    RAISE EXCEPTION 'FAIL 11f: a foreign phase was proposed against';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL 11f%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'PASS 11: the ratchet holds, the actor is derived, the proposal branch is scoped';
END $$;

-- ─── 12. An unpin is an act: the clear marker ────────────────────────────

DO $$
DECLARE v_err text;
BEGIN
  BEGIN
    PERFORM public.commit_schedule_edit(
      'c0ffee00-0000-4000-8000-0000000000a1',
      jsonb_build_array(jsonb_build_object(
        'kind', 'phase-anchor',
        'phase_id', 'c0ffee00-0000-4000-8000-0000000000b2'
      )),
      NULL
    );
    RAISE EXCEPTION 'FAIL 12a: a phase-anchor edit with no date silently unpinned';
  EXCEPTION WHEN raise_exception THEN
    v_err := SQLERRM;
    IF v_err LIKE 'FAIL 12a%' THEN RAISE; END IF;
  END;
  IF v_err NOT LIKE '%"clear": true%' THEN
    RAISE EXCEPTION 'FAIL 12b: unexpected refusal (%)', v_err;
  END IF;

  PERFORM public.commit_schedule_edit(
    'c0ffee00-0000-4000-8000-0000000000a1',
    jsonb_build_array(jsonb_build_object(
      'kind', 'phase-anchor',
      'phase_id', 'c0ffee00-0000-4000-8000-0000000000b2',
      'clear', true
    )),
    'Anchor released'
  );
  IF (SELECT anchor_date FROM project_phases
       WHERE id = 'c0ffee00-0000-4000-8000-0000000000b2') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 12c: an explicit clear did not unpin';
  END IF;

  RAISE NOTICE 'PASS 12: a missing date raises; only an explicit clear unpins';
END $$;

-- ─── 13. A proposed unpin (R112's release, undisclosed) ──────────────────

DO $$
DECLARE v_row schedule_proposals%ROWTYPE; v_anchor date;
BEGIN
  UPDATE project_phases SET anchor_date = DATE '2026-03-15'
   WHERE id = 'c0ffee00-0000-4000-8000-0000000000b2';
  DELETE FROM schedule_proposals WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1';

  -- Undisclosed clear ⇒ a dateless proposal, and the pin holds.
  PERFORM public._commit_schedule_edit_authorized(
    'c0ffee00-0000-4000-8000-0000000000a1',
    jsonb_build_array(jsonb_build_object(
      'kind', 'phase-anchor',
      'phase_id', 'c0ffee00-0000-4000-8000-0000000000b2',
      'clear', true
    )),
    'Install window released',
    NULL,
    'ceremony:install-window-released'
  );
  SELECT anchor_date INTO v_anchor FROM project_phases
   WHERE id = 'c0ffee00-0000-4000-8000-0000000000b2';
  IF v_anchor IS DISTINCT FROM DATE '2026-03-15' THEN
    RAISE EXCEPTION 'FAIL 13a: an undisclosed release unpinned the anchor';
  END IF;
  SELECT * INTO v_row FROM schedule_proposals
   WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1'
     AND source_event = 'install-window-released';
  IF v_row.id IS NULL OR v_row.proposed_anchor_date IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 13b: no dateless unpin proposal was recorded (%)', to_jsonb(v_row);
  END IF;
  IF v_row.conflicts_with_committed THEN
    RAISE EXCEPTION 'FAIL 13c: a release was read as a contradiction';
  END IF;

  -- Disclosed clear ⇒ the unpin lands and cuts a revision.
  PERFORM public._commit_schedule_edit_authorized(
    'c0ffee00-0000-4000-8000-0000000000a1',
    jsonb_build_array(jsonb_build_object(
      'kind', 'phase-anchor',
      'phase_id', 'c0ffee00-0000-4000-8000-0000000000b2',
      'clear', true
    )),
    'Install window released',
    jsonb_build_object('sentence', 'The procurement thread returns to the chain.'),
    'ceremony:install-window-released'
  );
  SELECT anchor_date INTO v_anchor FROM project_phases
   WHERE id = 'c0ffee00-0000-4000-8000-0000000000b2';
  IF v_anchor IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 13d: a disclosed release did not unpin (got %)', v_anchor;
  END IF;

  RAISE NOTICE 'PASS 13: an undisclosed release proposes a dateless unpin; a disclosed one lands';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 14. THE LIVE RPC PROBE — engage_trade_scope end to end
--
-- PLAN's Wave 2 gate: call the PUBLIC ceremony as a real comember session and
-- SELECT the resulting anchor and revision. §7's prosrc scan proves the graft
-- is present; only this proves it fires, targets the right phase, and lands.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id uuid, p_role text DEFAULT 'authenticated')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user_id, 'role', p_role
  )::text, true);
END;
$$;

-- Studio identity: _can_author_proposal requires an ACTIVE design_studio
-- membership, which is strictly narrower than is_studio_comember.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('c0ffee00-0000-4000-8000-000000000002', 'ceremony-client@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('c0ffee00-0000-4000-8000-000000000002', 'ceremony-client@test.invalid', 'Ceremony Client', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('c0ffee00-0000-4000-8000-000000000011', 'design_studio',
        'Ceremony Hardening Studio', 'ceremony-hardening-test', 'active');
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('c0ffee00-0000-4000-8000-000000000012',
        'c0ffee00-0000-4000-8000-000000000001',
        'c0ffee00-0000-4000-8000-000000000011', 'owner', 'active', now());

-- Two trade scopes: one for the disclosed probe, one for the downgrade probe.
-- Both are composed while their proposal is still DRAFT (trade_scope_terms and
-- _sections are immutable after that, by 00423/00425's own guards), then
-- ratcheted to executed the way their real rails would leave them.
INSERT INTO public.proposals (
  id, designer_id, client_id, title, status, document_kind, commercial_state,
  project_id, total_amount
) VALUES
  ('c0ffee00-0000-4000-8000-000000000021',
   'c0ffee00-0000-4000-8000-000000000001', 'c0ffee00-0000-4000-8000-000000000002',
   'Kitchen millwork', 'draft', 'trade_scope', 'draft',
   'c0ffee00-0000-4000-8000-0000000000a1', 900000),
  ('c0ffee00-0000-4000-8000-000000000022',
   'c0ffee00-0000-4000-8000-000000000001', 'c0ffee00-0000-4000-8000-000000000002',
   'Bath millwork', 'draft', 'trade_scope', 'draft',
   'c0ffee00-0000-4000-8000-0000000000a1', 400000);

INSERT INTO public.trade_scope_terms (
  proposal_id, client_price_cents, currency, progress_state
) VALUES
  ('c0ffee00-0000-4000-8000-000000000021', 900000, 'USD', 'none'),
  ('c0ffee00-0000-4000-8000-000000000022', 400000, 'USD', 'none');

INSERT INTO public.trade_scope_sections (id, proposal_id, room_name, prose, sort_order, allocation_cents)
VALUES
  ('c0ffee00-0000-4000-8000-000000000051',
   'c0ffee00-0000-4000-8000-000000000021', 'Kitchen', 'Kitchen millwork.', 0, 900000),
  ('c0ffee00-0000-4000-8000-000000000052',
   'c0ffee00-0000-4000-8000-000000000022', 'Bath', 'Bath millwork.', 0, 400000);

-- The execution ratchet carries the same exact-row capability the real rails
-- mint (00412), one proposal at a time.
SELECT set_config('app.proposal_accept_id', 'c0ffee00-0000-4000-8000-000000000021', true);
SELECT set_config('app.commercial_document_id', 'c0ffee00-0000-4000-8000-000000000021', true);
UPDATE public.proposals SET status = 'accepted', commercial_state = 'executed'
 WHERE id = 'c0ffee00-0000-4000-8000-000000000021';
SELECT set_config('app.proposal_accept_id', 'c0ffee00-0000-4000-8000-000000000022', true);
SELECT set_config('app.commercial_document_id', 'c0ffee00-0000-4000-8000-000000000022', true);
UPDATE public.proposals SET status = 'accepted', commercial_state = 'executed'
 WHERE id = 'c0ffee00-0000-4000-8000-000000000022';
SELECT set_config('app.proposal_accept_id', '', true);
SELECT set_config('app.commercial_document_id', '', true);

INSERT INTO public.invoices (
  id, project_id, designer_id, client_id, status, currency, invoice_number,
  subtotal_cents, tax_rate, tax_cents, total_cents, amount_paid_cents, paid_at, memo
) VALUES
  ('c0ffee00-0000-4000-8000-000000000031',
   'c0ffee00-0000-4000-8000-0000000000a1',
   'c0ffee00-0000-4000-8000-000000000001', 'c0ffee00-0000-4000-8000-000000000002',
   'paid', 'USD', 'CEREMONY-DEP-1', 300000, 0, 0, 300000, 300000, now(),
   'Trade scope deposit'),
  ('c0ffee00-0000-4000-8000-000000000032',
   'c0ffee00-0000-4000-8000-0000000000a1',
   'c0ffee00-0000-4000-8000-000000000001', 'c0ffee00-0000-4000-8000-000000000002',
   'paid', 'USD', 'CEREMONY-DEP-2', 130000, 0, 0, 130000, 130000, now(),
   'Trade scope deposit');

-- project_commercial_documents rows are minted only under their own
-- signature-authority GUC (00412), one document at a time.
SELECT set_config('app.commercial_document_id', 'c0ffee00-0000-4000-8000-000000000021', true);
INSERT INTO public.project_commercial_documents (
  id, project_id, proposal_id, document_kind, executed_at, deposit_invoice_id, created_by
) VALUES (
  'c0ffee00-0000-4000-8000-000000000041',
  'c0ffee00-0000-4000-8000-0000000000a1', 'c0ffee00-0000-4000-8000-000000000021',
  'trade_scope', now(), 'c0ffee00-0000-4000-8000-000000000031',
  'c0ffee00-0000-4000-8000-000000000001'
);
SELECT set_config('app.commercial_document_id', 'c0ffee00-0000-4000-8000-000000000022', true);
INSERT INTO public.project_commercial_documents (
  id, project_id, proposal_id, document_kind, executed_at, deposit_invoice_id, created_by
) VALUES (
  'c0ffee00-0000-4000-8000-000000000042',
  'c0ffee00-0000-4000-8000-0000000000a1', 'c0ffee00-0000-4000-8000-000000000022',
  'trade_scope', now(), 'c0ffee00-0000-4000-8000-000000000032',
  'c0ffee00-0000-4000-8000-000000000001'
);
SELECT set_config('app.commercial_document_id', '', true);

DO $$
DECLARE
  v_result jsonb;
  v_anchor date;
  v_revision record;
  v_before int;
BEGIN
  -- The thread phase is unpinned after case 13; give the ceremony a clean field.
  UPDATE project_phases SET anchor_date = NULL
   WHERE id = 'c0ffee00-0000-4000-8000-0000000000b2';
  DELETE FROM schedule_proposals WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1';
  SELECT count(*) INTO v_before FROM schedule_revisions
   WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1';

  PERFORM pg_temp.assume_user('c0ffee00-0000-4000-8000-000000000001');

  -- The real public RPC, with the impact the sheet would have stated.
  v_result := public.engage_trade_scope(
    'c0ffee00-0000-4000-8000-000000000021',
    jsonb_build_object('sentence', 'Procurement thread anchored today. 2 phases follow.')
  );
  IF NOT (v_result->>'newlyEngaged')::boolean THEN
    RAISE EXCEPTION 'FAIL 14a: the ceremony did not engage';
  END IF;

  -- The ceremony's own effect is intact.
  IF (SELECT progress_state FROM trade_scope_terms
       WHERE proposal_id = 'c0ffee00-0000-4000-8000-000000000021') <> 'engaged' THEN
    RAISE EXCEPTION 'FAIL 14b: the progress ratchet did not move';
  END IF;
  IF (SELECT count(*) FROM project_ffe_items
       WHERE trade_scope_document_id = 'c0ffee00-0000-4000-8000-000000000041') <> 1 THEN
    RAISE EXCEPTION 'FAIL 14c: the presence line was not minted';
  END IF;

  -- And the anchor landed, on the thread phase, with a revision to show for it.
  SELECT anchor_date INTO v_anchor FROM project_phases
   WHERE id = 'c0ffee00-0000-4000-8000-0000000000b2';
  IF v_anchor IS DISTINCT FROM current_date THEN
    RAISE EXCEPTION 'FAIL 14d: the live ceremony wrote no anchor (got %)', v_anchor;
  END IF;
  IF (SELECT anchor_date FROM project_phases
       WHERE id = 'c0ffee00-0000-4000-8000-0000000000b1') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 14e: the ceremony anchored a main-lane phase';
  END IF;

  SELECT * INTO v_revision FROM schedule_revisions
   WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1'
   ORDER BY v DESC LIMIT 1;
  IF (SELECT count(*) FROM schedule_revisions
       WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1') <> v_before + 1 THEN
    RAISE EXCEPTION 'FAIL 14f: the live ceremony cut no revision';
  END IF;
  IF v_revision.actor IS DISTINCT FROM 'c0ffee00-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'FAIL 14g: the revision was not attributed to the signing studio (got %)', v_revision.actor;
  END IF;
  IF v_revision.reason NOT LIKE '%Procurement thread anchored today%' THEN
    RAISE EXCEPTION 'FAIL 14h: the revision does not carry what the ceremony stated (%)', v_revision.reason;
  END IF;
  IF EXISTS (SELECT 1 FROM schedule_proposals
              WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1') THEN
    RAISE EXCEPTION 'FAIL 14i: a disclosed live ceremony also proposed';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', 'c0ffee00-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
  RAISE NOTICE 'PASS 14: the live engage_trade_scope RPC hardens the thread anchor and cuts an attributed revision';
END $$;

-- ─── 15. The same live RPC, undisclosed, downgrades ──────────────────────

DO $$
DECLARE v_row schedule_proposals%ROWTYPE; v_anchor date; v_before int;
BEGIN
  -- The second scope, on the same project, with nothing pinned.
  UPDATE project_phases SET anchor_date = NULL
   WHERE id = 'c0ffee00-0000-4000-8000-0000000000b2';
  DELETE FROM schedule_proposals WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1';
  SELECT count(*) INTO v_before FROM schedule_revisions
   WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1';

  PERFORM pg_temp.assume_user('c0ffee00-0000-4000-8000-000000000001');
  PERFORM public.engage_trade_scope('c0ffee00-0000-4000-8000-000000000022');

  SELECT anchor_date INTO v_anchor FROM project_phases
   WHERE id = 'c0ffee00-0000-4000-8000-0000000000b2';
  IF v_anchor IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 15a: an undisclosed live ceremony hardened (got %)', v_anchor;
  END IF;
  IF (SELECT count(*) FROM schedule_revisions
       WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1') <> v_before THEN
    RAISE EXCEPTION 'FAIL 15b: an undisclosed live ceremony cut a revision';
  END IF;
  SELECT * INTO v_row FROM schedule_proposals
   WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1';
  IF v_row.id IS NULL OR v_row.source_event <> 'trade-scope-engaged'
     OR v_row.target_phase_id <> 'c0ffee00-0000-4000-8000-0000000000b2'
     OR v_row.source_ref <> 'c0ffee00-0000-4000-8000-000000000022' THEN
    RAISE EXCEPTION 'FAIL 15c: the live downgrade did not record the act (%)', to_jsonb(v_row);
  END IF;

  RAISE NOTICE 'PASS 15: the live RPC with no stated impact proposes and never pins';
END $$;

ROLLBACK;
