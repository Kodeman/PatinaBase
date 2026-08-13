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
--   8. The manual door is unchanged: commit_schedule_edit still takes three
--      arguments and returns the revision's v.
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
    ARRAY['_accept_trade_scope_authorized', 'ceremony:trade-scope-accepted']
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

  RAISE NOTICE 'PASS 8: schedule_proposals is RLS-enabled, studio-only, and closed to anon';
END $$;

-- ─── 9. The operational fact: a first delivery proposes, never writes ─────

INSERT INTO vendors (id, name) VALUES ('c0ffee00-0000-4000-8000-0000000000e1', 'Ceremony Probe Vendor');
INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, status, payment_pattern, total_cents)
VALUES ('c0ffee00-0000-4000-8000-0000000000f1', 'c0ffee00-0000-4000-8000-000000000001',
        'c0ffee00-0000-4000-8000-0000000000a1', 'c0ffee00-0000-4000-8000-0000000000e1',
        'confirmed', 'net_30', 100000);

INSERT INTO receiving_inspections (purchase_order_id, inspected_by, inspected_at, outcome)
VALUES ('c0ffee00-0000-4000-8000-0000000000f1', 'c0ffee00-0000-4000-8000-000000000001', NOW(), 'clean');

DO $$
DECLARE v_row schedule_proposals%ROWTYPE; v_anchor date; v_count int;
BEGIN
  SELECT * INTO v_row FROM schedule_proposals
   WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1' AND source_event = 'delivered';
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'FAIL 9a: a first delivery recorded no proposal';
  END IF;
  IF v_row.target_phase_id <> 'c0ffee00-0000-4000-8000-0000000000b2'
     OR v_row.state <> 'proposed'
     OR v_row.source_ref <> 'c0ffee00-0000-4000-8000-0000000000f1' THEN
    RAISE EXCEPTION 'FAIL 9b: the delivery proposal does not carry the fact (%)', to_jsonb(v_row);
  END IF;

  -- The fact proposed; it did not move the anchor case 4 committed.
  SELECT anchor_date INTO v_anchor FROM project_phases
   WHERE id = 'c0ffee00-0000-4000-8000-0000000000b2';
  IF v_anchor IS DISTINCT FROM DATE '2026-03-15' THEN
    RAISE EXCEPTION 'FAIL 9c: a delivery moved a committed anchor (got %)', v_anchor;
  END IF;

  -- A re-inspection stacks nothing.
  INSERT INTO receiving_inspections (purchase_order_id, inspected_by, inspected_at, outcome)
  VALUES ('c0ffee00-0000-4000-8000-0000000000f1', 'c0ffee00-0000-4000-8000-000000000001', NOW(), 'clean');
  SELECT count(*) INTO v_count FROM schedule_proposals
   WHERE project_id = 'c0ffee00-0000-4000-8000-0000000000a1' AND source_event = 'delivered';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 9d: % delivery proposals after a re-inspection', v_count;
  END IF;

  RAISE NOTICE 'PASS 9: a first delivery proposes the thread anchor and never writes one';
END $$;

ROLLBACK;
