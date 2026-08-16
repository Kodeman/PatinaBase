-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: Schedule Rule — Phase-Count Extreme Specimens (Slice 02, package §5)
--
-- Two more projects for the seed designer (designer@patina.dev), alongside
-- schedule.sql's 5-phase Aspen Loft Refresh, purposely at the LOW and HIGH
-- ends of phase count so the Rule's natural-width label staggering
-- (assignLabelRows — greedy lowest-free-row) has real long-named specimens
-- to render against, not just synthetic width-array fixtures:
--
--   - "Birch Hollow" (…d3) — 3 long-named phases, 1 of them thread-lane,
--     overlapping the main trunk (R99 "overlap is legal", same pattern as
--     schedule.sql's Procurement & Orders). 3 milestones, one of each of
--     signed/due/upcoming so the diamond stamp colors have a spread even at
--     the low end.
--   - "Marrow & Vale Residence" (…d4) — 7 chained long-named phases: 2 of
--     them thread-lane (Procurement & Orders, Millwork & Fabrication, both
--     overlapping Design Development off the same predecessor), 1 anchored
--     (Installation & Styling, anchor_date set ~12 days past its computed
--     chain arrival — the same slack magnitude as schedule.sql's specimen,
--     so both projects read as "the same kind of project" at a glance). 5
--     milestones spanning all 4 MilestoneStatus values (signed/due/upcoming/
--     slipped) plus an anchored "Install Day" event tied to the anchored
--     phase.
--
-- Neither root phase (Schematic Design / Consultation) carries an
-- anchor_date — both resolve via the resolver's OTHER unanchored-root path
-- (own legacy start_date + duration_days, R100 semantic 5: "root.start = own
-- anchor ?? projectStartDate ?? own legacy startDate"). This is deliberate:
-- useResolvedSchedule (packages/supabase/src/hooks/use-schedule.ts) does not
-- thread projectStartDate yet, and it keeps the phase-level anchor COUNT
-- exactly matching this file's own claims (0 for Birch Hollow, 1 for Marrow
-- & Vale) rather than also counting the root as "anchored" the way
-- schedule.sql's specimen does (a different, equally valid, choice made
-- there — see its own header comment).
--
-- Idempotent: safe to re-run on `supabase db reset`. Delete order: milestones
-- before phases (schedule_milestones CASCADEs off project_phases anyway;
-- explicit delete keeps the file symmetric with schedule.sql's convention).
-- Wired immediately after schedule.sql in config.toml [db.seed] sql_paths.
--
-- Prerequisite: decisions.sql + designer-clients.sql must have run first
-- (the designer↔client relationship this file's projects reuse).
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  uid_designer UUID := 'a0000000-0000-0000-0000-000000000004';
  uid_client   UUID := 'a0000000-0000-0000-0000-000000000005';
  v_dc_id      UUID;

  -- ── Project D3 — "Birch Hollow" (low extreme: 3 phases, 1 thread) ────────
  v_proj_d3      UUID := 'b0000000-0000-0000-0000-0000000000d3';
  v_d3_phase_sd  UUID := 'b0000000-0000-0000-0000-00000005c601'; -- Schematic Design & Space Planning
  v_d3_phase_dd  UUID := 'b0000000-0000-0000-0000-00000005c602'; -- Design Development & Construction Documentation
  v_d3_phase_pr  UUID := 'b0000000-0000-0000-0000-00000005c603'; -- Procurement, Fabrication & White-Glove Delivery (thread)

  v_d3_ms_walk   UUID := 'b0000000-0000-0000-0000-00000005c801'; -- Site Walkthrough & Field Verification (anchored, signed)
  v_d3_ms_signoff UUID := 'b0000000-0000-0000-0000-00000005c802'; -- Design Development Sign-Off (due)
  v_d3_ms_deliv  UUID := 'b0000000-0000-0000-0000-00000005c803'; -- Fabric & Casegoods Delivery (upcoming, on the thread)

  -- ── Project D4 — "Marrow & Vale Residence" (high extreme: 7 phases,
  --    2 thread, 1 anchored) ─────────────────────────────────────────────
  v_proj_d4      UUID := 'b0000000-0000-0000-0000-0000000000d4';
  v_d4_phase_c   UUID := 'b0000000-0000-0000-0000-00000005c701'; -- Consultation
  v_d4_phase_sd  UUID := 'b0000000-0000-0000-0000-00000005c702'; -- Schematic Design & Space Planning
  v_d4_phase_dd  UUID := 'b0000000-0000-0000-0000-00000005c703'; -- Design Development
  v_d4_phase_pr  UUID := 'b0000000-0000-0000-0000-00000005c704'; -- Procurement & Orders (thread)
  v_d4_phase_mw  UUID := 'b0000000-0000-0000-0000-00000005c705'; -- Millwork & Fabrication (thread)
  v_d4_phase_in  UUID := 'b0000000-0000-0000-0000-00000005c706'; -- Installation & Styling (anchored)
  v_d4_phase_co  UUID := 'b0000000-0000-0000-0000-00000005c707'; -- Completion & Close-Out

  v_d4_ms_sd_signed  UUID := 'b0000000-0000-0000-0000-00000005c804'; -- Schematic Design Approval (signed)
  v_d4_ms_dd_due     UUID := 'b0000000-0000-0000-0000-00000005c805'; -- Design Development Sign-Off (due, overdue)
  v_d4_ms_pr_upcoming UUID := 'b0000000-0000-0000-0000-00000005c806'; -- Fabric & Casegoods Ordered (upcoming)
  v_d4_ms_mw_slipped UUID := 'b0000000-0000-0000-0000-00000005c807'; -- Custom Millwork Delivery (slipped)
  v_d4_ms_install    UUID := 'b0000000-0000-0000-0000-00000005c808'; -- Install Day (anchored event, upcoming)
BEGIN
  SELECT id INTO v_dc_id
  FROM public.designer_clients
  WHERE designer_id = uid_designer AND client_id = uid_client
  LIMIT 1;

  IF v_dc_id IS NULL THEN
    RAISE NOTICE 'schedule-extremes.sql: designer_clients row missing - run designer-clients.sql first';
    RETURN;
  END IF;

  -- ── D3 "Birch Hollow" — the project row (idempotent create-once) ────────
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = v_proj_d3) THEN
    INSERT INTO public.projects (
      id, name, status, budget_cents, design_fee_cents,
      client_visibility_tier, client_id, designer_id, created_by
    ) VALUES (
      v_proj_d3, 'Birch Hollow', 'active', 18500000, 320000,
      'milestone', uid_client, uid_designer, uid_designer
    );
  END IF;

  -- ── D4 "Marrow & Vale Residence" — the project row ──────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = v_proj_d4) THEN
    INSERT INTO public.projects (
      id, name, status, budget_cents, design_fee_cents,
      client_visibility_tier, client_id, designer_id, created_by
    ) VALUES (
      v_proj_d4, 'Marrow & Vale Residence', 'active', 42000000, 610000,
      'milestone', uid_client, uid_designer, uid_designer
    );
  END IF;

  -- ── Idempotent re-seed: milestones then phases, both projects ──────────
  DELETE FROM public.schedule_milestones
   WHERE id IN (
     v_d3_ms_walk, v_d3_ms_signoff, v_d3_ms_deliv,
     v_d4_ms_sd_signed, v_d4_ms_dd_due, v_d4_ms_pr_upcoming, v_d4_ms_mw_slipped, v_d4_ms_install
   );
  DELETE FROM public.project_phases
   WHERE id IN (
     v_d3_phase_sd, v_d3_phase_dd, v_d3_phase_pr,
     v_d4_phase_c, v_d4_phase_sd, v_d4_phase_dd, v_d4_phase_pr, v_d4_phase_mw, v_d4_phase_in, v_d4_phase_co
   );

  -- ═══════════════════════════════════════════════════════════════════════
  -- D3 "Birch Hollow" — 3 phases (1 thread)
  -- ═══════════════════════════════════════════════════════════════════════

  PERFORM set_config(
    'app.project_phase_batch_token',
    format('project_phase_batch:%s:%s', v_proj_d3, pg_catalog.txid_current()),
    true
  );

  -- 1. Schematic Design & Space Planning — completed root. Resolves via the
  --    resolver's unanchored-root path: own start_date + duration_days
  --    (R100 semantic 5) — no anchor_date, so `anchored` reads false.
  INSERT INTO public.project_phases (
    id, project_id, name, phase_key, status,
    start_date, target_end_date,
    duration_days, follows_phase_id, anchor_date, lane, sort_order
  ) VALUES (
    v_d3_phase_sd, v_proj_d3, 'Schematic Design & Space Planning', NULL, 'completed',
    CURRENT_DATE - 40, CURRENT_DATE - 20,
    20, NULL, NULL, 'main', 0
  );

  -- 2. Design Development & Construction Documentation — main trunk.
  INSERT INTO public.project_phases (
    id, project_id, name, phase_key, status,
    start_date, target_end_date,
    duration_days, follows_phase_id, anchor_date, lane, sort_order
  ) VALUES (
    v_d3_phase_dd, v_proj_d3, 'Design Development & Construction Documentation', NULL, 'in_progress',
    CURRENT_DATE - 20, CURRENT_DATE + 15,
    35, v_d3_phase_sd, NULL, 'main', 1
  );

  -- 3. Procurement, Fabrication & White-Glove Delivery — thread lane, SAME
  --    predecessor as DD (Schematic Design) so it computes an overlap with
  --    DD rather than following it — R99 "overlap is legal".
  INSERT INTO public.project_phases (
    id, project_id, name, phase_key, status,
    start_date, target_end_date,
    duration_days, follows_phase_id, anchor_date, lane, sort_order
  ) VALUES (
    v_d3_phase_pr, v_proj_d3, 'Procurement, Fabrication & White-Glove Delivery', 'procurement', 'in_progress',
    CURRENT_DATE - 20, CURRENT_DATE + 35,
    55, v_d3_phase_sd, NULL, 'thread', 2
  );

  -- ── D3 milestones — one signed, one due, one upcoming (on the thread) ──

  INSERT INTO public.schedule_milestones (
    id, phase_id, name, kind, offset_days, anchor_date, status, sort_order
  ) VALUES (
    v_d3_ms_walk, v_d3_phase_dd, 'Site Walkthrough & Field Verification', 'event',
    NULL, CURRENT_DATE - 8, 'signed', 0
  );

  INSERT INTO public.schedule_milestones (
    id, phase_id, name, kind, offset_days, anchor_date, status, sort_order
  ) VALUES (
    v_d3_ms_signoff, v_d3_phase_dd, 'Design Development sign-off', 'signoff',
    -20, NULL, 'due', 1
  );

  INSERT INTO public.schedule_milestones (
    id, phase_id, name, kind, offset_days, anchor_date, status, sort_order
  ) VALUES (
    v_d3_ms_deliv, v_d3_phase_pr, 'Fabric & casegoods delivered', 'delivery',
    -15, NULL, 'upcoming', 0
  );

  -- ═══════════════════════════════════════════════════════════════════════
  -- D4 "Marrow & Vale Residence" — 7 phases (2 thread, 1 anchored)
  -- ═══════════════════════════════════════════════════════════════════════

  PERFORM set_config(
    'app.project_phase_batch_token',
    format('project_phase_batch:%s:%s', v_proj_d4, pg_catalog.txid_current()),
    true
  );

  -- 1. Consultation — completed root. Same unanchored-root path as D3's
  --    Schematic Design (own start_date + duration_days, anchor_date NULL).
  INSERT INTO public.project_phases (
    id, project_id, name, phase_key, status,
    start_date, target_end_date,
    duration_days, follows_phase_id, anchor_date, lane, sort_order
  ) VALUES (
    v_d4_phase_c, v_proj_d4, 'Consultation', NULL, 'completed',
    CURRENT_DATE - 60, CURRENT_DATE - 53,
    7, NULL, NULL, 'main', 0
  );

  -- 2. Schematic Design & Space Planning — main trunk, follows Consultation.
  INSERT INTO public.project_phases (
    id, project_id, name, phase_key, status,
    start_date, target_end_date,
    duration_days, follows_phase_id, anchor_date, lane, sort_order
  ) VALUES (
    v_d4_phase_sd, v_proj_d4, 'Schematic Design & Space Planning', NULL, 'completed',
    CURRENT_DATE - 53, CURRENT_DATE - 32,
    21, v_d4_phase_c, NULL, 'main', 1
  );

  -- 3. Design Development — main trunk, follows Schematic Design.
  INSERT INTO public.project_phases (
    id, project_id, name, phase_key, status,
    start_date, target_end_date,
    duration_days, follows_phase_id, anchor_date, lane, sort_order
  ) VALUES (
    v_d4_phase_dd, v_proj_d4, 'Design Development', NULL, 'in_progress',
    CURRENT_DATE - 32, CURRENT_DATE - 4,
    28, v_d4_phase_sd, NULL, 'main', 2
  );

  -- 4. Procurement & Orders — thread #1, SAME predecessor as Design
  --    Development (Schematic Design) so it overlaps DD — R99.
  INSERT INTO public.project_phases (
    id, project_id, name, phase_key, status,
    start_date, target_end_date,
    duration_days, follows_phase_id, anchor_date, lane, sort_order
  ) VALUES (
    v_d4_phase_pr, v_proj_d4, 'Procurement & Orders', 'procurement', 'in_progress',
    CURRENT_DATE - 32, CURRENT_DATE + 28,
    60, v_d4_phase_sd, NULL, 'thread', 3
  );

  -- 5. Millwork & Fabrication — thread #2, chains off Procurement & Orders
  --    (still thread lane — a thread phase may itself have a thread
  --    predecessor; lane is a storage/rendering attribute, not a graph
  --    constraint).
  INSERT INTO public.project_phases (
    id, project_id, name, phase_key, status,
    start_date, target_end_date,
    duration_days, follows_phase_id, anchor_date, lane, sort_order
  ) VALUES (
    v_d4_phase_mw, v_proj_d4, 'Millwork & Fabrication', 'millwork', 'pending',
    CURRENT_DATE + 28, CURRENT_DATE + 73,
    45, v_d4_phase_pr, NULL, 'thread', 4
  );

  -- 6. Installation & Styling — anchored start (CURRENT_DATE + 85); the
  --    computed chain date off Millwork's end (+73) would be +73, so the
  --    anchor holds ~12 days of slack against the chain per R100 — the same
  --    slack magnitude as schedule.sql's own Installation & Styling phase.
  INSERT INTO public.project_phases (
    id, project_id, name, phase_key, status,
    start_date, target_end_date,
    duration_days, follows_phase_id, anchor_date, lane, sort_order
  ) VALUES (
    v_d4_phase_in, v_proj_d4, 'Installation & Styling', 'installation', 'pending',
    CURRENT_DATE + 85, CURRENT_DATE + 95,
    10, v_d4_phase_mw, CURRENT_DATE + 85, 'main', 5
  );

  -- 7. Completion & Close-Out — trailing main-trunk phase, follows
  --    Installation.
  INSERT INTO public.project_phases (
    id, project_id, name, phase_key, status,
    start_date, target_end_date,
    duration_days, follows_phase_id, anchor_date, lane, sort_order
  ) VALUES (
    v_d4_phase_co, v_proj_d4, 'Completion & Close-Out', NULL, 'pending',
    CURRENT_DATE + 95, CURRENT_DATE + 109,
    14, v_d4_phase_in, NULL, 'main', 6
  );

  PERFORM set_config('app.project_phase_batch_token', '', true);

  -- ── D4 milestones — signed / due (overdue) / upcoming / slipped, plus an
  --    anchored "Install Day" event on the anchored phase ────────────────

  INSERT INTO public.schedule_milestones (
    id, phase_id, name, kind, offset_days, anchor_date, status, sort_order
  ) VALUES (
    v_d4_ms_sd_signed, v_d4_phase_sd, 'Schematic Design approval', 'signoff',
    0, NULL, 'signed', 0
  );

  INSERT INTO public.schedule_milestones (
    id, phase_id, name, kind, offset_days, anchor_date, status, sort_order
  ) VALUES (
    v_d4_ms_dd_due, v_d4_phase_dd, 'Design Development sign-off', 'signoff',
    -2, NULL, 'due', 0
  );

  INSERT INTO public.schedule_milestones (
    id, phase_id, name, kind, offset_days, anchor_date, status, sort_order
  ) VALUES (
    v_d4_ms_pr_upcoming, v_d4_phase_pr, 'Fabric & casegoods ordered', 'delivery',
    -10, NULL, 'upcoming', 0
  );

  INSERT INTO public.schedule_milestones (
    id, phase_id, name, kind, offset_days, anchor_date, status, sort_order
  ) VALUES (
    v_d4_ms_mw_slipped, v_d4_phase_mw, 'Custom millwork delivery', 'delivery',
    -5, NULL, 'slipped', 0
  );

  INSERT INTO public.schedule_milestones (
    id, phase_id, name, kind, offset_days, anchor_date, status, sort_order
  ) VALUES (
    v_d4_ms_install, v_d4_phase_in, 'Install day', 'event',
    NULL, CURRENT_DATE + 87, 'upcoming', 1
  );

  RAISE NOTICE 'schedule-extremes.sql: seeded Birch Hollow (3 phases / 1 thread / 3 milestones) on project %', v_proj_d3;
  RAISE NOTICE 'schedule-extremes.sql: seeded Marrow & Vale Residence (7 phases / 2 thread / 1 anchored / 5 milestones) on project %', v_proj_d4;
END $$;
