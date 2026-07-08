-- ═══════════════════════════════════════════════════════════════════════════
-- 00270 — Auto-draft the deposit invoice at proposal signature
--
-- Decision reversal: 00206 (R34) wired on_date milestones to
-- draft_invoice_from_milestone and left a note — "on_signing stays a
-- designer act (config stored, drafting manual)". Product has now reversed
-- that call: signature AUTO-DRAFTS the deposit invoice. Still draft-only —
-- the designer reviews and sends through the existing Issue & Send flow
-- (issue_invoice, 00178); nothing about the review-then-send state machine
-- changes.
--
-- CREATE OR REPLACE's the LATEST activate_proposal_as_project body
-- (00199_activation_carry_vendor_id — the vendor_id carry; later files
-- 00210/00237/00254 only CALL the function, they don't redefine it). Body is
-- 00199 verbatim except:
--   1. The kickoff milestone INSERT (sort_order = 0, the row seeded
--      'outstanding' at signing — 00204's language for the same row) now
--      stamps trigger_kind = 'on_signing' and captures its id via RETURNING.
--   2. Immediately after the milestone loop (projects + the milestone row
--      are the only rows draft_invoice_from_milestone reads, and both exist
--      by this point), PERFORM draft_invoice_from_milestone(<kickoff id>) —
--      guarded to amount_cents > 0 (draft_invoice_from_milestone itself does
--      NOT special-case a zero-amount milestone; left alone it would happily
--      draft a $0 invoice, so the guard lives here at the call site) and
--      wrapped in BEGIN/EXCEPTION WHEN OTHERS so a client signature always
--      succeeds even if drafting hits an edge case.
--
-- Both signature paths run through this one function, so this migration
-- covers both without touching either caller:
--   · sign_proposal (00210, client-invoked)          → PERFORM activate_proposal_as_project
--   · record_offline_signature (00254, designer-invoked) → RETURN public.activate_proposal_as_project(...)
-- Verified by reading both bodies before writing this migration — neither
-- duplicates activation logic.
--
-- Backfill-safety note: 00204's idx_milestones_trigger on
-- (project_id, trigger_kind) WHERE trigger_kind IS NOT NULL is a plain
-- index, NOT a unique one (checked — no `unique` keyword in 00204's DDL),
-- so there is no DB constraint to ON CONFLICT against. A collision is
-- structurally near-impossible anyway (v_project_id is a brand-new row from
-- the INSERT INTO projects earlier in this same call, so no
-- project_payment_milestones row for it can already exist) — but the stamp
-- is still guarded with an explicit NOT EXISTS check so a second on_signing
-- row silently gets trigger_kind = NULL (falls back to a plain legacy
-- milestone) instead of ever creating two on_signing rows for one project.
--
-- No retroactive backfill: existing already-activated projects keep their
-- un-stamped kickoff milestone and continue through the designer's manual
-- Generate-invoice act (00204). Auto-drafting invoices for historical
-- projects behind the designer's back is not this migration's call.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.activate_proposal_as_project(p_proposal_id uuid, p_start_date date DEFAULT CURRENT_DATE)
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
  v_new_milestone_id UUID;
  v_kickoff_milestone_id UUID;
  v_kickoff_amount_cents INTEGER;
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

      INSERT INTO project_ffe_items (
        project_id, project_room_id, source_proposal_item_id,
        product_id, name, ffe_category, item_type,
        status, quantity, unit_price_cents, line_total_cents,
        budget_min_cents, budget_max_cents,
        vendor_id, vendor_name, eta, notes, sort_order
      ) VALUES (
        v_project_id, v_new_room_id, v_item.id,
        v_item.product_id, v_item.name, v_item.ffe_category, v_item.item_type,
        'specified',
        v_item.quantity,
        v_item.unit_price,
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

    INSERT INTO project_ffe_items (
      project_id, project_room_id, source_proposal_item_id,
      product_id, name, ffe_category, item_type,
      status, quantity, unit_price_cents, line_total_cents,
      budget_min_cents, budget_max_cents,
      vendor_id, vendor_name, eta, notes, sort_order
    ) VALUES (
      v_project_id, NULL, v_item.id,
      v_item.product_id, v_item.name, v_item.ffe_category, v_item.item_type,
      'specified',
      v_item.quantity,
      v_item.unit_price,
      v_item.line_total_cents,
      v_item.budget_min_cents, v_item.budget_max_cents,
      v_item.vendor_id, v_item.vendor_name, v_item_eta,
      NULLIF(v_item_notes, ''),
      v_item.position
    );
  END LOOP;

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
      fee_cents, revision_limit, gate_condition,
      deliverables, sort_order
    ) VALUES (
      v_project_id, v_phase.id,
      v_phase.name, v_phase.phase_key,
      CASE v_phase.sort_order WHEN 0 THEN 'in_progress' ELSE 'pending' END,
      v_running_date,
      v_running_date + (COALESCE(v_phase.duration_weeks, 2) * 7),
      v_phase.duration_weeks,
      v_phase.fee_cents, v_phase.revision_limit, v_phase.gate_condition,
      v_phase.deliverables, v_phase.sort_order
    )
    RETURNING id INTO v_new_phase_id;

    v_phase_map := v_phase_map || jsonb_build_object(v_phase.id::text, v_new_phase_id::text);
    v_running_date := v_running_date + (COALESCE(v_phase.duration_weeks, 2) * 7);
  END LOOP;

  UPDATE projects SET target_end_date = v_running_date WHERE id = v_project_id;
  UPDATE projects SET current_phase = (
    SELECT phase_key FROM project_phases
    WHERE project_id = v_project_id
    ORDER BY sort_order LIMIT 1
  ) WHERE id = v_project_id;

  -- 00270: the kickoff milestone (sort_order = 0, seeded 'outstanding' at
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

  -- 00270: auto-draft the deposit invoice. Draft only (review-then-send per
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
    ORDER BY sort_order
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
    );
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

  UPDATE designer_clients
  SET status = 'active', updated_at = NOW()
  WHERE designer_id = v_proposal.designer_id
    AND client_id = v_proposal.client_id
    AND status IN ('lead', 'proposal');

  RETURN v_project_id;
END;
$function$;

COMMENT ON FUNCTION public.activate_proposal_as_project(uuid, date) IS
  'Bridges an accepted proposal into an active project (body lineage: 00140 → 00167 → 00180 → 00199 → 00270). '
  '00270 delta: the kickoff (sort_order=0) payment milestone is stamped trigger_kind=''on_signing'' and, when its '
  'amount_cents > 0, immediately drafts its invoice via draft_invoice_from_milestone (00204) — draft only, guarded '
  'so drafting can never fail activation. Supersedes 00206''s "on_signing stays a designer act" note.';
