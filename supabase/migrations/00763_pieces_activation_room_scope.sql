-- ═══════════════════════════════════════════════════════════════════════════
-- 00763 · Pieces: activating a proposal with pieces in rooms goes through,
-- and a merged palette keeps its order (US-21 T-60h, SQ-706; from the T-60f
-- walk, SQ-704, QA.md "Continuation 2" F17/F18)
--
-- F18 (High). guard_project_ffe_selection_integrity (00438:266) no longer
--   derives assignment_scope (00434 did): a row with project_room_id set must
--   say assignment_scope = 'room', and the CHECK on project_ffe_items ties
--   the two together. A writer that names project_room_id but not
--   assignment_scope gets the 'unassigned' default, and the guard refuses it
--   with 23514 'non-room assignment cannot carry a room'.
--
--   Sweep of every live function that inserts into project_ffe_items (pg_proc
--   prosrc on the local DB at 00762, cross-checked with grep of migrations):
--     _activate_proposal_as_project_impl (00762)       DEFECT, fixed here
--     _apply_client_decision_authorized (00666:570)    DEFECT, fixed here
--     _execute_furnishings_authorization_authorized    ok: never sets a room
--       (00578:3621)
--     _execute_furnishings_authorization_on_paper_     ok: never sets a room
--       authorized (00578:4359)
--     _place_product_in_project_v2_00438_impl (00737)  ok: names the scope
--     add_labor_line (00737:608)                       ok: names the scope
--     apply_scope_change (00510)                       ok: names the scope
--     engage_trade_scope (00510)                       ok: names the scope
--     supersede_project_selection (00758:63)           ok: names the scope
--
--   _activate_proposal_as_project_impl: CREATE OR REPLACE base is the 00762
--   body (00762:53), copied whole. Each project_ffe_items INSERT now names
--   assignment_scope: 'room' when the mapped room is set, else 'unassigned'
--   (the Build room's "Not in a room yet"; never 'throughout'). The room loop
--   always has a room; the roomless loop never does. No placement rows are
--   written: project_room_id is the primary room, and a line in one room
--   carries no project_ffe_placements row (00734). The activate wrapper's
--   _reconcile_activated_ffe_placements (00439:445) only links board items to
--   the new lines by source_proposal_item_id and is unaffected. Grants as
--   00762 (owner only).
--
--   _apply_client_decision_authorized: CREATE OR REPLACE base is the 00666:570
--   body, copied whole. Its non-blocking feed-through writes project_room_id
--   = the decision's room in both its UPDATE and its INSERT. Both now set
--   assignment_scope: 'room' when the room is set; with no room the INSERT
--   says 'unassigned' and the UPDATE keeps the line's scope unless it was
--   'room' (then 'unassigned'). ACL unchanged (owner only; CREATE OR REPLACE
--   keeps it).
--
-- F17 (Low). When a second palette for the same room merges into the first
--   (00762 F8), its swatches' sort_order is renumbered to follow the room
--   row's highest sort_order, keeping that palette's own order. Before, the
--   appended swatches kept their source numbers (0, 1, …) and the Finishes
--   lens interleaved them with the first palette's.
--
-- No signature, grant or column change: no types diff. The re-issued REVOKE on
-- the impl is replayed by supabase/seed/00-legacy-grants.sql (regenerated; no
-- new privilege).
-- Idempotent: CREATE OR REPLACE only.
-- Test: supabase/tests/ffe/pieces_activation_room_scope_test.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. F18 + F17: activation ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._activate_proposal_as_project_impl(p_proposal_id uuid, p_start_date date DEFAULT CURRENT_DATE)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_proposal RECORD;
  v_project_id UUID;
  v_design_fee_total INTEGER := 0;
  v_ffe_budget_total INTEGER := 0;
  v_room RECORD;
  v_new_room_id UUID;
  v_item RECORD;
  v_item_notes TEXT;
  v_item_eta DATE;
  v_phase RECORD;
  v_new_phase_id UUID;
  v_milestone RECORD;
  v_new_milestone_id UUID;       -- 00274 delta
  v_kickoff_milestone_id UUID;   -- 00274 delta
  v_kickoff_amount_cents INTEGER; -- 00274 delta
  v_co_terms RECORD;
  v_team RECORD;
  v_section RECORD;
  v_palette RECORD;
  v_swatches JSONB;
  v_board RECORD;
  v_board_items JSONB;
  v_scope_room_map JSONB := '{}'::jsonb;
  v_exclusions JSONB;
  v_running_date DATE;
  v_phase_map JSONB := '{}'::jsonb;
BEGIN
  SELECT * INTO v_proposal
  FROM proposals
  WHERE id = p_proposal_id AND status = 'accepted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal % not found or not in accepted status', p_proposal_id;
  END IF;

  IF v_proposal.project_id IS NOT NULL THEN
    RAISE EXCEPTION 'Proposal % already activated as project %', p_proposal_id, v_proposal.project_id;
  END IF;

  SELECT COALESCE(SUM(fee_cents), 0) INTO v_design_fee_total
  FROM proposal_phases
  WHERE proposal_id = p_proposal_id;

  SELECT COALESCE(SUM(line_total_cents), 0) INTO v_ffe_budget_total
  FROM proposal_items
  WHERE proposal_id = p_proposal_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'description', pe.description,
    'category', pe.category
  ) ORDER BY pe.sort_order), '[]'::jsonb)
  INTO v_exclusions
  FROM proposal_exclusions pe
  WHERE pe.proposal_id = p_proposal_id;

  SELECT * INTO v_co_terms
  FROM proposal_change_order_terms
  WHERE proposal_id = p_proposal_id;

  INSERT INTO projects (
    proposal_id, designer_id, client_id, name, status, notes,
    budget_cents, total_amount_cents, design_fee_cents, start_date,
    site_address, kickoff_message, client_visibility_tier,
    scope_boundaries,
    change_order_terms,
    created_by
  ) VALUES (
    p_proposal_id,
    v_proposal.designer_id,
    v_proposal.client_id,
    v_proposal.title,
    'active',
    v_proposal.description,
    v_ffe_budget_total,
    v_proposal.total_amount,
    v_design_fee_total,
    p_start_date,
    v_proposal.project_address,
    v_proposal.personal_message,
    COALESCE(v_proposal.client_visibility_tier, 'milestone'),
    v_exclusions,
    CASE WHEN v_co_terms IS NOT NULL THEN jsonb_build_object(
      'process_description', v_co_terms.process_description,
      'hourly_rate_cents', v_co_terms.hourly_rate_cents,
      'minimum_fee_cents', v_co_terms.minimum_fee_cents,
      'approval_required', v_co_terms.approval_required
    ) ELSE '{}'::jsonb END,
    v_proposal.designer_id
  )
  RETURNING id INTO v_project_id;

  FOR v_room IN
    SELECT * FROM proposal_scope_rooms
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order
  LOOP
    INSERT INTO project_rooms (
      project_id, source_scope_room_id, room_id,
      name, room_type, dimensions, floor_area_sqft,
      budget_cents, ffe_categories, notes, sort_order
    ) VALUES (
      v_project_id, v_room.id, v_room.room_id,
      v_room.name, v_room.room_type, v_room.dimensions, v_room.floor_area_sqft,
      v_room.budget_cents, v_room.ffe_categories, v_room.notes, v_room.sort_order
    )
    RETURNING id INTO v_new_room_id;

    v_scope_room_map := v_scope_room_map || jsonb_build_object(v_room.id::text, v_new_room_id::text);

    FOR v_item IN
      SELECT * FROM proposal_items
      WHERE proposal_id = p_proposal_id AND scope_room_id = v_room.id
      ORDER BY position
    LOOP
      v_item_notes := COALESCE(v_item.notes, '');
      IF v_item.internal_notes IS NOT NULL AND length(trim(v_item.internal_notes)) > 0 THEN
        v_item_notes := CASE WHEN length(v_item_notes) > 0 THEN v_item_notes || E'\n\n' ELSE '' END
                        || 'Internal: ' || v_item.internal_notes;
      END IF;
      v_item_eta := CASE WHEN v_item.lead_time_weeks IS NOT NULL AND v_item.lead_time_weeks > 0
                         THEN p_start_date + (v_item.lead_time_weeks * 7)
                         ELSE NULL END;

      -- 00279: unit_price_cents = CLIENT price (unit_sell_price); trade price +
      -- markup carry alongside (restores the 00185 dual-pricing repair that
      -- 00199 reverted). line_total_cents was already the client total.
      -- GREATEST/COALESCE clamps mirror the 00185 tier-a backfill: negative
      -- trade/markup (writable via direct PostgREST, propagated by
      -- clone_proposal) would violate the 00185 >= 0 CHECKs and block activation.
      -- 00763 (F18): the line names its scope; the 00438 guard derives none.
      INSERT INTO project_ffe_items (
        project_id, project_room_id, assignment_scope, source_proposal_item_id,
        product_id, name, ffe_category, item_type, doc_code, custom_fields,
        status, quantity, unit_price_cents, trade_price_cents, markup_percent, line_total_cents,
        budget_min_cents, budget_max_cents,
        vendor_id, vendor_name, eta, notes, sort_order
      ) VALUES (
        v_project_id, v_new_room_id,
        CASE WHEN v_new_room_id IS NOT NULL THEN 'room' ELSE 'unassigned' END,
        v_item.id,
        v_item.product_id, v_item.name, v_item.ffe_category, v_item.item_type, v_item.doc_code, v_item.custom_fields,
        'specified',
        v_item.quantity,
        v_item.unit_sell_price,
        GREATEST(COALESCE(v_item.unit_price, 0), 0),
        GREATEST(COALESCE(v_item.markup_percent, 0), 0),
        v_item.line_total_cents,
        v_item.budget_min_cents, v_item.budget_max_cents,
        v_item.vendor_id, v_item.vendor_name, v_item_eta,
        NULLIF(v_item_notes, ''),
        v_item.position
      );
    END LOOP;
  END LOOP;

  FOR v_item IN
    SELECT * FROM proposal_items
    WHERE proposal_id = p_proposal_id AND scope_room_id IS NULL
    ORDER BY position
  LOOP
    v_item_notes := COALESCE(v_item.notes, '');
    IF v_item.internal_notes IS NOT NULL AND length(trim(v_item.internal_notes)) > 0 THEN
      v_item_notes := CASE WHEN length(v_item_notes) > 0 THEN v_item_notes || E'\n\n' ELSE '' END
                      || 'Internal: ' || v_item.internal_notes;
    END IF;
    v_item_eta := CASE WHEN v_item.lead_time_weeks IS NOT NULL AND v_item.lead_time_weeks > 0
                       THEN p_start_date + (v_item.lead_time_weeks * 7)
                       ELSE NULL END;

    -- 00279: same dual-pricing mapping as the room loop above (restores 00185).
    -- 00763 (F18): no room is "Not in a room yet" ('unassigned'), never
    -- 'throughout'.
    INSERT INTO project_ffe_items (
      project_id, project_room_id, assignment_scope, source_proposal_item_id,
      product_id, name, ffe_category, item_type, doc_code, custom_fields,
      status, quantity, unit_price_cents, trade_price_cents, markup_percent, line_total_cents,
      budget_min_cents, budget_max_cents,
      vendor_id, vendor_name, eta, notes, sort_order
    ) VALUES (
      v_project_id, NULL, 'unassigned', v_item.id,
      v_item.product_id, v_item.name, v_item.ffe_category, v_item.item_type, v_item.doc_code, v_item.custom_fields,
      'specified',
      v_item.quantity,
      v_item.unit_sell_price,
      GREATEST(COALESCE(v_item.unit_price, 0), 0),
      GREATEST(COALESCE(v_item.markup_percent, 0), 0),
      v_item.line_total_cents,
      v_item.budget_min_cents, v_item.budget_max_cents,
      v_item.vendor_id, v_item.vendor_name, v_item_eta,
      NULLIF(v_item_notes, ''),
      v_item.position
    );
  END LOOP;

  -- Custom field DEFS (S6, 00268): copy the proposal's schedule columns onto
  -- project-owned rows (same field_key/name/kind/sort). The per-line VALUES ride
  -- along in project_ffe_items.custom_fields above, keyed by field_key —
  -- verbatim, no id remap.
  INSERT INTO spec_field_defs (project_id, field_key, name, kind, sort_order)
  SELECT v_project_id, field_key, name, kind, sort_order
  FROM spec_field_defs
  WHERE proposal_id = p_proposal_id;

  -- 00324 delta (1): TWO-PASS phase copy. Pass 1 inserts every project_phase
  -- with follows_phase_id NULL (a forward chain reference cannot be resolved in
  -- a single pass), carrying the chain columns duration_days / anchor_date /
  -- lane, and builds v_phase_map. The legacy start/target cascade is KEPT but
  -- now advances by duration_days when present (delta 2) — a naive compat
  -- approximation the gated Spine UI never reads (the resolver is TS-only).
  v_running_date := p_start_date;
  FOR v_phase IN
    SELECT * FROM proposal_phases
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order
  LOOP
    INSERT INTO project_phases (
      project_id, source_proposal_phase_id,
      name, phase_key, status,
      start_date, target_end_date, duration_weeks,
      duration_days, anchor_date, lane, follows_phase_id,   -- 00324: chain columns
      fee_cents, revision_limit, gate_condition,
      deliverables, sort_order
    ) VALUES (
      v_project_id, v_phase.id,
      v_phase.name, v_phase.phase_key,
      CASE v_phase.sort_order WHEN 0 THEN 'in_progress' ELSE 'pending' END,
      v_running_date,
      v_running_date + COALESCE(v_phase.duration_days, v_phase.duration_weeks * 7, 14),  -- 00324 delta (2)
      v_phase.duration_weeks,
      v_phase.duration_days, v_phase.anchor_date, v_phase.lane, NULL,   -- 00324: follows remapped in pass 2
      v_phase.fee_cents, v_phase.revision_limit, v_phase.gate_condition,
      v_phase.deliverables, v_phase.sort_order
    )
    RETURNING id INTO v_new_phase_id;

    v_phase_map := v_phase_map || jsonb_build_object(v_phase.id::text, v_new_phase_id::text);
    v_running_date := v_running_date + COALESCE(v_phase.duration_days, v_phase.duration_weeks * 7, 14);  -- 00324 delta (2)
  END LOOP;

  -- 00324 delta (1), pass 2: remap the follows chain now that v_phase_map holds
  -- every source→new phase pairing. Resolves forward references a single-pass
  -- insertion cannot.
  UPDATE project_phases pp
  SET follows_phase_id = (v_phase_map ->> src.follows_phase_id::text)::uuid
  FROM proposal_phases src
  WHERE pp.source_proposal_phase_id = src.id
    AND pp.project_id = v_project_id
    AND src.follows_phase_id IS NOT NULL;

  -- 00324 delta (3): translate anchored proposal milestones into project-side
  -- schedule_milestones. phase_id remaps through v_phase_map; anchor_date / kind
  -- / name / sort_order carry; offset_days is NULL and status is 'upcoming'
  -- (activation stamps the working status — R101.3). No schedule_revisions
  -- write (Slice 05).
  INSERT INTO schedule_milestones (phase_id, name, kind, offset_days, anchor_date, status, sort_order)
  SELECT (v_phase_map ->> psm.phase_id::text)::uuid,
         psm.name, psm.kind, NULL, psm.anchor_date, 'upcoming', psm.sort_order
  FROM proposal_schedule_milestones psm
  JOIN proposal_phases pp ON pp.id = psm.phase_id
  WHERE pp.proposal_id = p_proposal_id;

  -- 00326: Slice 05 memory — freeze the baseline. project_phases +
  -- schedule_milestones are now fully written (the two-pass follows remap
  -- above and this milestone insert are the last touches to either table),
  -- so cut the v1 revision snapshot. cut_schedule_revision is SECURITY
  -- DEFINER and derives its actor from auth.uid() INTERNALLY (deliberately
  -- not a parameter — banner §1); inside this DEFINER function auth.uid()
  -- STILL resolves to the signing session user (SECURITY DEFINER swaps the
  -- role, never the request.jwt GUC that auth.uid() reads), and that user is
  -- the proposal's client (sign_proposal, 00210) or designer
  -- (record_offline_signature, 00254) — the cut's designer-OR-client guard
  -- accepts either. NOT wrapped in an exception block (unlike the deposit
  -- auto-draft): the baseline is a hard guarantee of activation, not a
  -- best-effort side effect.
  PERFORM cut_schedule_revision(v_project_id, 'Baseline v1 — cut at signature');

  UPDATE projects SET target_end_date = v_running_date WHERE id = v_project_id;
  UPDATE projects SET current_phase = (
    SELECT phase_key FROM project_phases
    WHERE project_id = v_project_id
    ORDER BY sort_order LIMIT 1
  ) WHERE id = v_project_id;

  -- 00274: the kickoff milestone (sort_order = 0, seeded 'outstanding' at
  -- signing) is stamped trigger_kind = 'on_signing'. The NOT EXISTS guard is
  -- defensive-only — v_project_id is fresh from the INSERT above, so no
  -- project_payment_milestones row for it can already exist — but it keeps
  -- the invariant "at most one on_signing milestone per project" true even
  -- if this function is ever reached a second time for the same project.
  FOR v_milestone IN
    SELECT * FROM proposal_payment_milestones
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order
  LOOP
    INSERT INTO project_payment_milestones (
      project_id, phase_id, label, percentage,
      amount_cents, trigger_condition,
      status, due_date, sort_order,
      trigger_kind
    ) VALUES (
      v_project_id,
      CASE WHEN v_milestone.phase_id IS NOT NULL
        THEN (v_phase_map ->> v_milestone.phase_id::text)::UUID
        ELSE NULL
      END,
      v_milestone.label, v_milestone.percentage,
      v_milestone.amount_cents, v_milestone.trigger_condition,
      CASE v_milestone.sort_order WHEN 0 THEN 'outstanding' ELSE 'pending' END,
      CASE v_milestone.sort_order WHEN 0 THEN p_start_date ELSE NULL END,
      v_milestone.sort_order,
      CASE
        WHEN v_milestone.sort_order = 0
             AND NOT EXISTS (
               SELECT 1 FROM project_payment_milestones existing
               WHERE existing.project_id = v_project_id
                 AND existing.trigger_kind = 'on_signing'
             )
        THEN 'on_signing'
        ELSE NULL
      END
    )
    RETURNING id INTO v_new_milestone_id;

    IF v_milestone.sort_order = 0 THEN
      v_kickoff_milestone_id := v_new_milestone_id;
      v_kickoff_amount_cents := v_milestone.amount_cents;
    END IF;
  END LOOP;

  -- 00274: auto-draft the deposit invoice. Draft only (review-then-send per
  -- R26/R11 stands — the designer still uses Issue & Send). Guarded to
  -- amount_cents > 0 because draft_invoice_from_milestone (00204) has no
  -- zero-amount special case of its own. Wrapped so drafting can NEVER fail
  -- activation — a client signature must succeed even if this hits an edge
  -- case; the milestone simply stays undrafted for the designer to pick up
  -- manually via Generate-invoice (00204).
  IF v_kickoff_milestone_id IS NOT NULL AND v_kickoff_amount_cents > 0 THEN
    BEGIN
      PERFORM draft_invoice_from_milestone(v_kickoff_milestone_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'activate_proposal_as_project: deposit auto-draft failed for milestone % (project %): %',
        v_kickoff_milestone_id, v_project_id, SQLERRM;
    END;
  END IF;

  FOR v_team IN
    SELECT * FROM proposal_team_members
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order, created_at
  LOOP
    INSERT INTO project_team_members (
      project_id, user_id, role, permissions,
      assigned_by, assigned_at
    ) VALUES (
      v_project_id, v_team.user_id, v_team.role, COALESCE(v_team.permissions, '{}'::jsonb),
      v_proposal.designer_id, NOW()
    )
    ON CONFLICT (project_id, user_id, role) DO NOTHING;
  END LOOP;

  FOR v_section IN
    SELECT * FROM proposal_sections
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order
  LOOP
    INSERT INTO project_narrative_sections (
      project_id, source_section_id,
      type, title, body, metadata, sort_order
    ) VALUES (
      v_project_id, v_section.id,
      v_section.type, v_section.title, v_section.body,
      COALESCE(v_section.metadata, '{}'::jsonb), v_section.sort_order
    );
  END LOOP;

  FOR v_palette IN
    SELECT * FROM proposal_palettes
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order, created_at, id  -- 00762 (F8): the first palette for a room is fixed
  LOOP
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'hex', ps.hex,
      'name', ps.name,
      'role', ps.role,
      'paint_color_id', ps.paint_color_id,
      'brand', ps.brand,
      'brand_code', ps.brand_code,
      'sort_order', ps.sort_order
    ) ORDER BY ps.sort_order), '[]'::jsonb)
    INTO v_swatches
    FROM palette_swatches ps
    WHERE ps.palette_id = v_palette.id;

    INSERT INTO project_palettes (
      project_id, source_palette_id,
      name, is_primary, source_image_url, notes,
      scope_room_id, swatches, sort_order
    ) VALUES (
      v_project_id, v_palette.id,
      v_palette.name, COALESCE(v_palette.is_primary, FALSE),
      v_palette.source_image_url, v_palette.notes,
      CASE WHEN v_palette.scope_room_id IS NOT NULL
        THEN (v_scope_room_map ->> v_palette.scope_room_id::text)::UUID
        ELSE NULL END,
      v_swatches, v_palette.sort_order
    )
    -- 00762 (F8): one row per room (project_palettes_one_per_room, 00760).
    -- A later palette for the same room merges into the first: its swatches
    -- append in order, and its name and notes append. A palette with no room
    -- never conflicts (NULLs stay distinct), so it keeps its own row.
    -- 00763 (F17): the appended swatches are renumbered to follow the room
    -- row's highest sort_order, in their own palette's order.
    ON CONFLICT (project_id, scope_room_id) DO UPDATE SET
      swatches   = project_palettes.swatches || COALESCE((
        SELECT jsonb_agg(
                 appended.swatch || jsonb_build_object('sort_order', kept_max.sort_order + appended.ordinality)
                 ORDER BY appended.ordinality)
        FROM jsonb_array_elements(EXCLUDED.swatches) WITH ORDINALITY AS appended(swatch, ordinality)
        CROSS JOIN (
          SELECT COALESCE(max((kept.swatch ->> 'sort_order')::integer), -1) AS sort_order
          FROM jsonb_array_elements(project_palettes.swatches) AS kept(swatch)
        ) AS kept_max
      ), '[]'::jsonb),
      name       = concat_ws(' · ', project_palettes.name, EXCLUDED.name),
      notes      = NULLIF(concat_ws(E'\n\n', project_palettes.notes, EXCLUDED.notes), ''),
      updated_at = now();
  END LOOP;

  -- Mood boards (00180): snapshot each proposal board into project_boards
  -- with its items embedded as an ordered JSONB array. The board's scope
  -- room is remapped to the new project_rooms row the same way palettes are.
  FOR v_board IN
    SELECT * FROM proposal_boards
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order
  LOOP
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'type', bi.type,
      'x', bi.x,
      'y', bi.y,
      'width', bi.width,
      'height', bi.height,
      'z_index', bi.z_index,
      'rotation', bi.rotation,
      'product_id', bi.product_id,
      'image_url', bi.image_url,
      'content', bi.content,
      'data', bi.data
    ) ORDER BY bi.z_index, bi.created_at), '[]'::jsonb)
    INTO v_board_items
    FROM proposal_board_items bi
    WHERE bi.board_id = v_board.id;

    INSERT INTO project_boards (
      project_id, source_board_id, name, project_room_id,
      cover_image_url, canvas_width, canvas_height, background_color,
      items, sort_order
    ) VALUES (
      v_project_id, v_board.id, v_board.name,
      CASE WHEN v_board.scope_room_id IS NOT NULL
        THEN (v_scope_room_map ->> v_board.scope_room_id::text)::UUID
        ELSE NULL END,
      v_board.cover_image_url, v_board.canvas_width, v_board.canvas_height,
      v_board.background_color,
      v_board_items, v_board.sort_order
    );
  END LOOP;

  UPDATE proposals SET project_id = v_project_id WHERE id = p_proposal_id;

  -- 00331 delta (Arrival Arc): idx_designer_clients_unique_profile now covers
  -- only NON-LEAD rows, and a pair may hold one engaged row plus per-engagement
  -- 'lead' rows. Promote exactly ONE relationship row — preferring the
  -- proposal's own engagement row (designer_client_id, 00327) — and never
  -- promote a 'lead' row when an engaged row already exists for the pair
  -- (that would 23505 against the re-scoped unique index). For every
  -- pre-00331 data shape (at most one row per pair) this is behaviorally
  -- identical to the old pair-wide UPDATE.
  UPDATE designer_clients dc
  SET status = 'active', updated_at = NOW()
  WHERE dc.designer_id = v_proposal.designer_id
    AND dc.client_id = v_proposal.client_id
    AND dc.status IN ('lead', 'proposal')
    AND dc.id = (
      SELECT dc3.id FROM designer_clients dc3
       WHERE dc3.designer_id = v_proposal.designer_id
         AND dc3.client_id   = v_proposal.client_id
         AND dc3.status IN ('lead', 'proposal')
       ORDER BY (dc3.id IS NOT DISTINCT FROM v_proposal.designer_client_id) DESC,
                dc3.created_at
       LIMIT 1)
    AND (dc.status = 'proposal'
         OR NOT EXISTS (
              SELECT 1 FROM designer_clients dc2
               WHERE dc2.designer_id = dc.designer_id
                 AND dc2.client_id   = dc.client_id
                 AND dc2.id <> dc.id
                 AND dc2.status <> 'lead'));

  RETURN v_project_id;
END;
$function$;

REVOKE ALL ON FUNCTION public._activate_proposal_as_project_impl(uuid, date)
  FROM PUBLIC, anon, authenticated, service_role;

-- ─── 2. F18: client decision feed-through ─────────────────────────────────

CREATE OR REPLACE FUNCTION public._apply_client_decision_authorized(
  p_decision_id uuid,
  p_selected_option_id uuid,
  p_actor uuid,
  p_client_consent_method text DEFAULT NULL,
  p_client_signature text DEFAULT NULL,
  p_client_note text DEFAULT NULL,
  p_quantity integer DEFAULT NULL
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
  v_option public.client_decision_options%ROWTYPE;
  v_receipt public.project_approval_action_receipts%ROWTYPE;
  v_selected_option_id uuid;
  v_selected_outcome text;
  v_requested_signature text := NULLIF(
    btrim(COALESCE(p_client_signature, '')), ''
  );
  v_stored_signature text;
  v_room_id uuid;
  v_trade_price integer;
  v_markup numeric(5,2);
BEGIN
  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision % not found', p_decision_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_decision.approval_contract = 'project_artifact_v1' THEN
    IF p_actor IS DISTINCT FROM auth.uid()
       OR p_client_note IS NOT NULL
       OR (p_quantity IS NOT NULL AND p_quantity <> 1)
    THEN
      RAISE EXCEPTION
        'Stage-2 installed option response cannot carry comment or quantity evidence'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_decision.status = 'responded' THEN
      SELECT option.id, option.approval_outcome
      INTO v_selected_option_id, v_selected_outcome
      FROM public.client_decision_options AS option
      WHERE option.decision_id = p_decision_id
        AND option.selected
      ORDER BY option.id
      LIMIT 1;
      IF v_selected_option_id IS DISTINCT FROM p_selected_option_id THEN
        RAISE EXCEPTION 'decision % was already resolved with another option',
          p_decision_id
          USING ERRCODE = 'serialization_failure';
      END IF;

      SELECT * INTO v_receipt
      FROM public.project_approval_action_receipts AS receipt
      WHERE receipt.decision_id = p_decision_id
        AND receipt.action_kind = 'responded'
        AND receipt.idempotency_key =
            'installed-option:' || p_selected_option_id::text;
      v_stored_signature := NULLIF(
        btrim(COALESCE(v_decision.client_signature, '')), ''
      );
      IF v_receipt.id IS NULL
         OR v_receipt.actor_id IS DISTINCT FROM p_actor
         OR v_receipt.project_id IS DISTINCT FROM v_decision.project_id
         OR v_receipt.result->>'decisionId' IS DISTINCT FROM p_decision_id::text
         OR v_receipt.result->>'projectId' IS DISTINCT FROM v_decision.project_id::text
         OR v_receipt.result->>'optionId' IS DISTINCT FROM p_selected_option_id::text
         OR v_receipt.result->>'outcome' IS DISTINCT FROM v_selected_outcome
         OR v_decision.selected_by IS DISTINCT FROM p_actor
         OR v_decision.answered_by IS DISTINCT FROM p_actor
         OR v_decision.answer IS DISTINCT FROM v_selected_outcome
         OR p_client_consent_method IS DISTINCT FROM
            v_decision.client_consent_method
         OR v_requested_signature IS DISTINCT FROM v_stored_signature
      THEN
        RAISE EXCEPTION
          'installed Stage-2 response replay conflicts with immutable evidence'
          USING ERRCODE = 'unique_violation';
      END IF;
      RETURN v_decision;
    END IF;

    PERFORM public._respond_project_approval_checked(
      p_decision_id, NULL, p_selected_option_id, v_decision.updated_at,
      'installed-option:' || p_selected_option_id::text,
      p_client_consent_method, p_client_signature
    );
    SELECT * INTO STRICT v_decision
    FROM public.client_decisions
    WHERE id = p_decision_id;
    RETURN v_decision;
  END IF;

  -- Deterministic replay: repeating the same winning option returns the same
  -- terminal row; trying to overwrite a different winner is a stale conflict.
  IF v_decision.status = 'responded' THEN
    SELECT id INTO v_selected_option_id
    FROM public.client_decision_options
    WHERE decision_id = p_decision_id AND selected = true
    ORDER BY id
    LIMIT 1;
    IF v_selected_option_id IS NOT DISTINCT FROM p_selected_option_id THEN
      PERFORM public._enqueue_decision_notification(
        p_decision_id, 'decision_resolved'
      );
      RETURN v_decision;
    END IF;
    RAISE EXCEPTION 'decision % was already resolved with another option', p_decision_id
      USING ERRCODE = 'serialization_failure';
  END IF;

  IF v_decision.status <> 'pending' THEN
    RAISE EXCEPTION 'decision % cannot be applied from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.client_decision_options
  WHERE decision_id = p_decision_id
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_option
  FROM public.client_decision_options
  WHERE id = p_selected_option_id
    AND decision_id = p_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'option % does not belong to decision %',
      p_selected_option_id, p_decision_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_quantity IS NOT NULL AND p_quantity < 1 THEN
    RAISE EXCEPTION 'decision option quantity must be at least 1'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_client_consent_method IS NOT NULL
     AND p_client_consent_method NOT IN ('electronic_signature', 'click_through')
  THEN
    RAISE EXCEPTION 'invalid client consent method %', p_client_consent_method
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_client_consent_method = 'electronic_signature'
     AND char_length(btrim(COALESCE(p_client_signature, ''))) < 2
  THEN
    RAISE EXCEPTION 'an electronic signature of at least 2 characters is required'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);

  UPDATE public.client_decision_options
  SET selected = (id = p_selected_option_id),
      client_note = CASE WHEN id = p_selected_option_id
        THEN COALESCE(p_client_note, client_note) ELSE client_note END,
      quantity = CASE WHEN id = p_selected_option_id
        THEN COALESCE(p_quantity, quantity) ELSE quantity END
  WHERE decision_id = p_decision_id;

  SELECT * INTO v_option
  FROM public.client_decision_options
  WHERE id = p_selected_option_id;

  UPDATE public.client_decisions
  SET status = 'responded',
      responded_at = now(),
      selected_by = p_actor,
      client_consent_method = p_client_consent_method,
      client_signature = CASE WHEN p_client_consent_method IS NULL
        THEN NULL ELSE NULLIF(btrim(COALESCE(p_client_signature, '')), '') END,
      client_consented_at = CASE WHEN p_client_consent_method IS NULL
        THEN NULL ELSE now() END,
      updated_at = now()
  WHERE id = p_decision_id
  RETURNING * INTO v_decision;

  UPDATE public.project_ffe_items
  SET blocked = false,
      blocked_reason = NULL,
      blocked_by_decision_id = NULL,
      last_status_change_at = now(),
      updated_at = now()
  WHERE blocked_by_decision_id = p_decision_id
    AND project_id = v_decision.project_id;

  -- Preserve 00175/00185's one-line-per-decision dual-pricing feed-through.
  IF v_decision.project_id IS NOT NULL
     AND v_option.product_id IS NOT NULL
     AND v_decision.blocking_status = 'non_blocking'
  THEN
    v_room_id := (
      SELECT room.id
      FROM public.project_rooms AS room
      WHERE room.id = v_decision.room_id
        AND room.project_id = v_decision.project_id
    );

    SELECT product.price_trade INTO v_trade_price
    FROM public.products AS product
    WHERE product.id = v_option.product_id;

    IF v_trade_price IS NULL OR v_trade_price < 0 THEN
      v_trade_price := GREATEST(COALESCE(v_option.price, 0), 0);
      v_markup := 0;
    ELSIF v_trade_price > 0
          AND COALESCE(v_option.price, 0) > v_trade_price
    THEN
      v_markup := LEAST(
        round(((COALESCE(v_option.price, 0)::numeric / v_trade_price) - 1) * 100, 2),
        999.99
      );
    ELSE
      v_markup := 0;
    END IF;

    -- 00763 (F18): the scope follows the room. With no room, a 'room' line
    -- becomes 'unassigned'; 'throughout' and 'unassigned' stay as they are.
    UPDATE public.project_ffe_items
    SET product_id = v_option.product_id,
        name = v_option.name,
        project_room_id = v_room_id,
        assignment_scope = CASE
          WHEN v_room_id IS NOT NULL THEN 'room'
          WHEN assignment_scope = 'room' THEN 'unassigned'
          ELSE assignment_scope
        END,
        quantity = COALESCE(v_option.quantity, 1),
        unit_price_cents = COALESCE(v_option.price, 0),
        trade_price_cents = v_trade_price,
        markup_percent = v_markup,
        line_total_cents = COALESCE(v_option.price, 0)
          * COALESCE(v_option.quantity, 1),
        currency = 'USD',
        updated_at = now()
    WHERE source_decision_id = p_decision_id;

    IF NOT FOUND THEN
      INSERT INTO public.project_ffe_items (
        project_id, project_room_id, assignment_scope, product_id, source_decision_id,
        name, item_type, status, quantity, unit_price_cents,
        trade_price_cents, markup_percent, line_total_cents
      ) VALUES (
        v_decision.project_id, v_room_id,
        CASE WHEN v_room_id IS NOT NULL THEN 'room' ELSE 'unassigned' END,
        v_option.product_id, p_decision_id,
        v_option.name, 'fixed', 'specified', COALESCE(v_option.quantity, 1),
        COALESCE(v_option.price, 0), v_trade_price, v_markup,
        COALESCE(v_option.price, 0) * COALESCE(v_option.quantity, 1)
      );
    END IF;

    IF jsonb_typeof(v_option.selection_snapshot) = 'array'
       AND jsonb_array_length(v_option.selection_snapshot) > 0
    THEN
      UPDATE public.project_ffe_specs AS spec
      SET material = COALESCE((
            SELECT string_agg(chosen.selection->>'valueLabel', ', '
                              ORDER BY chosen.ordinality)
            FROM jsonb_array_elements(v_option.selection_snapshot)
                 WITH ORDINALITY AS chosen(selection, ordinality)
            WHERE lower(chosen.selection->>'groupCode') = 'material'
          ), spec.material),
          finish = COALESCE((
            SELECT string_agg(chosen.selection->>'valueLabel', ', '
                              ORDER BY chosen.ordinality)
            FROM jsonb_array_elements(v_option.selection_snapshot)
                 WITH ORDINALITY AS chosen(selection, ordinality)
            WHERE lower(chosen.selection->>'groupCode') = 'finish'
          ), spec.finish),
          color_fabric = COALESCE((
            SELECT string_agg(chosen.selection->>'valueLabel', ', '
                              ORDER BY chosen.ordinality)
            FROM jsonb_array_elements(v_option.selection_snapshot)
                 WITH ORDINALITY AS chosen(selection, ordinality)
            WHERE lower(chosen.selection->>'groupCode')
                  IN ('color', 'colour', 'fabric', 'color_fabric', 'upholstery')
          ), spec.color_fabric),
          updated_at = now()
      WHERE spec.ffe_item_id IN (
              SELECT item.id
              FROM public.project_ffe_items AS item
              WHERE item.source_decision_id = p_decision_id
                AND item.project_id = v_decision.project_id
            )
        AND spec.configuration_locked_at IS NULL;
    END IF;
  END IF;

  PERFORM set_config('app.client_decision_write_id', '', true);
  PERFORM public._enqueue_decision_notification(
    p_decision_id, 'decision_resolved'
  );
  RETURN v_decision;
END;
$$;
