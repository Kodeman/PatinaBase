-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: Schedule Spine Acceptance Specimen (Slice 01, package §2)
--
-- Paints the picture the ScheduleSpine's first screenshot renders on top of
-- decisions.sql's Aspen Loft Refresh project (designer@patina.dev):
--   - 5 chained project_phases (00323 chain columns): a completed Schematic
--     Design, an in-progress Design Development, a thread-lane Procurement &
--     Orders phase that overlaps DD (same predecessor, different lane — R99
--     "overlap is legal"), an anchored Installation & Styling phase with
--     ~12 days of slack against the computed chain date, and a trailing
--     Completion phase.
--   - 3 schedule_milestones (00323): a due DD sign-off, an upcoming delivery
--     milestone on the procurement thread, and an anchored install-day event.
--   - 1 overdue blocking sign-off item (client_decisions, coordination_kind
--     'signoff') that blocks the DD sign-off milestone via blocks_milestone_id
--     (00323) — every coordination axis set explicitly.
--   - Enrichment UPDATEs attaching 3 of decisions.sql's existing decisions to
--     phases via client_decisions.phase_id (00084).
--
-- Idempotent: safe to re-run on `supabase db reset`. Delete order: the item
-- row, then milestones, then phases (schedule_milestones CASCADE off
-- project_phases anyway; deleting the item row first avoids any FK ordering
-- surprise even though blocks_milestone_id/phase_id are ON DELETE SET NULL).
--
-- Prerequisite: decisions.sql must have run first (creates the Aspen Loft
-- project + the 5 decisions this file enriches). Wired immediately after
-- decisions.sql in config.toml [db.seed] sql_paths.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  uid_designer UUID := 'a0000000-0000-0000-0000-000000000004';
  uid_client   UUID := 'a0000000-0000-0000-0000-000000000005';
  v_dc_id      UUID;
  v_project_id UUID := 'b0000000-0000-0000-0000-0000000000d1';

  -- Phases
  v_phase_sd    UUID := 'b0000000-0000-0000-0000-00000005c101'; -- Schematic Design
  v_phase_dd    UUID := 'b0000000-0000-0000-0000-00000005c102'; -- Design Development
  v_phase_proc  UUID := 'b0000000-0000-0000-0000-00000005c103'; -- Procurement & Orders (thread)
  v_phase_inst  UUID := 'b0000000-0000-0000-0000-00000005c104'; -- Installation & Styling (anchored)
  v_phase_comp  UUID := 'b0000000-0000-0000-0000-00000005c105'; -- Completion

  -- Milestones
  v_ms_dd_signoff UUID := 'b0000000-0000-0000-0000-00000005c201'; -- DD sign-off
  v_ms_delivery   UUID := 'b0000000-0000-0000-0000-00000005c202'; -- Fabric & casegoods delivered
  v_ms_install    UUID := 'b0000000-0000-0000-0000-00000005c203'; -- Install day

  -- Blocking item
  v_item_blocking UUID := 'b0000000-0000-0000-0000-00000005c301'; -- DD sign-off — drawing set B

  -- Existing decisions.sql ids being enriched with phase_id
  v_dec_pending   UUID := 'b0000000-0000-0000-0000-0000000d2c02'; -- 'Dining chairs...' — linked_phase 'Procurement'
  v_dec_overdue   UUID := 'b0000000-0000-0000-0000-0000000d2c03'; -- 'Rug color...' — linked_phase 'Procurement'
  v_dec_responded UUID := 'b0000000-0000-0000-0000-0000000d2c04'; -- 'Concept direction approval' — linked_phase 'Concept'
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = v_project_id) THEN
    RAISE NOTICE 'schedule.sql: Aspen Loft project missing - run decisions.sql first';
    RETURN;
  END IF;

  SELECT id INTO v_dc_id
  FROM public.designer_clients
  WHERE designer_id = uid_designer AND client_id = uid_client
  LIMIT 1;

  IF v_dc_id IS NULL THEN
    RAISE NOTICE 'schedule.sql: designer_clients row missing - run designer-clients.sql first';
    RETURN;
  END IF;

  -- Idempotent: item row, then milestones, then phases.
  DELETE FROM public.client_decisions WHERE id = v_item_blocking;
  DELETE FROM public.schedule_milestones
   WHERE id IN (v_ms_dd_signoff, v_ms_delivery, v_ms_install);
  DELETE FROM public.project_phases
   WHERE id IN (v_phase_sd, v_phase_dd, v_phase_proc, v_phase_inst, v_phase_comp);

  -- ── Phases (insert in chain order so follows_phase_id resolves) ──────────

  -- 1. Schematic Design — completed, unanchored-chain-wise but carries an
  --    anchor_date at the tip of the trunk (the chain's origin).
  INSERT INTO public.project_phases (
    id, project_id, name, phase_key, status,
    start_date, target_end_date,
    duration_days, follows_phase_id, anchor_date, lane, sort_order
  ) VALUES (
    v_phase_sd, v_project_id, 'Schematic Design', 'schematic_design', 'completed',
    CURRENT_DATE - 35, CURRENT_DATE - 14,
    21, NULL, CURRENT_DATE - 35, 'main', 0
  );

  -- 2. Design Development — main trunk, follows Schematic Design.
  INSERT INTO public.project_phases (
    id, project_id, name, phase_key, status,
    start_date, target_end_date,
    duration_days, follows_phase_id, anchor_date, lane, sort_order
  ) VALUES (
    v_phase_dd, v_project_id, 'Design Development', 'design_development', 'in_progress',
    CURRENT_DATE - 14, CURRENT_DATE + 14,
    28, v_phase_sd, NULL, 'main', 1
  );

  -- 3. Procurement & Orders — thread lane, SAME predecessor as DD (Schematic
  --    Design) so it computes an overlap with DD rather than following it —
  --    R99 "overlap is legal".
  INSERT INTO public.project_phases (
    id, project_id, name, phase_key, status,
    start_date, target_end_date,
    duration_days, follows_phase_id, anchor_date, lane, sort_order
  ) VALUES (
    v_phase_proc, v_project_id, 'Procurement & Orders', 'procurement', 'in_progress',
    CURRENT_DATE - 14, CURRENT_DATE + 28,
    42, v_phase_sd, NULL, 'thread', 2
  );

  -- 4. Installation & Styling — anchored start (CURRENT_DATE + 40); the
  --    computed chain date off Procurement's end (+28) would be +28, so the
  --    anchor holds ~12 days of slack against the chain per R100.
  INSERT INTO public.project_phases (
    id, project_id, name, phase_key, status,
    start_date, target_end_date,
    duration_days, follows_phase_id, anchor_date, lane, sort_order
  ) VALUES (
    v_phase_inst, v_project_id, 'Installation & Styling', 'installation', 'pending',
    CURRENT_DATE + 40, CURRENT_DATE + 45,
    5, v_phase_proc, CURRENT_DATE + 40, 'main', 3
  );

  -- 5. Completion — trailing main-trunk phase, follows Installation.
  INSERT INTO public.project_phases (
    id, project_id, name, phase_key, status,
    start_date, target_end_date,
    duration_days, follows_phase_id, anchor_date, lane, sort_order
  ) VALUES (
    v_phase_comp, v_project_id, 'Completion', 'completion', 'pending',
    CURRENT_DATE + 45, CURRENT_DATE + 52,
    7, v_phase_inst, NULL, 'main', 4
  );

  -- ── schedule_milestones ────────────────────────────────────────────────

  INSERT INTO public.schedule_milestones (
    id, phase_id, name, kind, offset_days, anchor_date, status, sort_order
  ) VALUES (
    v_ms_dd_signoff, v_phase_dd, 'Design Development sign-off', 'signoff',
    -3, NULL, 'due', 0
  );

  INSERT INTO public.schedule_milestones (
    id, phase_id, name, kind, offset_days, anchor_date, status, sort_order
  ) VALUES (
    v_ms_delivery, v_phase_proc, 'Fabric & casegoods delivered', 'delivery',
    -14, NULL, 'upcoming', 0
  );

  INSERT INTO public.schedule_milestones (
    id, phase_id, name, kind, offset_days, anchor_date, status, sort_order
  ) VALUES (
    v_ms_install, v_phase_inst, 'Install day', 'event',
    NULL, CURRENT_DATE + 40, 'upcoming', 0
  );

  -- ── The overdue blocking sign-off item ────────────────────────────────
  -- Every coordination axis set explicitly (decision_type, decision_kind,
  -- coordination_kind, court, blocks_kind, blocks_milestone_id).
  -- blocking_status = 'blocks_phase' mirrors the app's own creation path:
  -- blockingStatusFor(blocksKind) (use-coordination.ts) derives it from
  -- blocks_kind='phase' on every composer-created item, and live surfaces
  -- (decision-card's "Blocks phase advancement" callout, decisions-panel's
  -- "· blocks phase" tag) render from blocking_status, not blocks_kind.
  INSERT INTO public.client_decisions (
    id, designer_client_id, designer_id, project_id, phase_id,
    title, context, due_date,
    decision_type, decision_kind, coordination_kind, court,
    blocks_kind, blocks_milestone_id, blocking_status,
    status, sent_at
  ) VALUES (
    v_item_blocking, v_dc_id, uid_designer, v_project_id, v_phase_dd,
    'Design Development sign-off — drawing set B',
    'Drawing set B needs your sign-off before Procurement can release the long-lead casegoods on order.',
    (NOW() - INTERVAL '4 days'),
    'approval', 'approval', 'signoff', 'client',
    'phase', v_ms_dd_signoff, 'blocks_phase',
    'pending', NOW() - INTERVAL '10 days'
  );

  -- ── Enrichment: attach existing decisions.sql decisions to phases ──────
  -- Only ids confirmed present in decisions.sql (v_dec_pending/v_dec_overdue
  -- carry linked_phase 'Procurement'; v_dec_responded carries 'Concept').
  UPDATE public.client_decisions
     SET phase_id = v_phase_proc
   WHERE id IN (v_dec_pending, v_dec_overdue);

  UPDATE public.client_decisions
     SET phase_id = v_phase_sd
   WHERE id = v_dec_responded;

  RAISE NOTICE 'schedule.sql: seeded 5 chained phases + 3 milestones + 1 overdue blocking sign-off on project %', v_project_id;
END $$;
