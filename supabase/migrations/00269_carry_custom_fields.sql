-- 00269_carry_custom_fields.sql
-- Track S² · S6 (Schedule & Boards Wave 2): carry custom fields + their column
-- definitions through the two proposal_items copy paths.
--
-- 00268 added spec_field_defs (owned by a proposal OR project) and a slug-keyed
-- custom_fields jsonb on proposal_items + project_ffe_items. A new column does
-- NOT flow through activation/clone unless the copying function is redefined —
-- both list EXPLICIT columns. So:
--
--   • activate_proposal_as_project — base body is 00262's VERBATIM (the TRUE
--     latest: 00185 dual-pricing → 00199 vendor_id → 00262 doc_code). Surgical
--     additions: `custom_fields` in BOTH project_ffe_items inserts (roomed +
--     room-less, column + value), and a copy of the proposal's spec_field_defs
--     onto project-owned rows (same field_key/name/kind/sort).
--
--   • clone_proposal — base body is 00264's VERBATIM (the TRUE latest: 00176 →
--     00260 boards carry → 00264 board sections/status). Surgical additions:
--     `custom_fields` in the proposal_items copy (column + SELECT), and a
--     deep-copy of the source's spec_field_defs onto the new proposal.
--
-- Values are keyed by field_key, so both copies carry the jsonb VERBATIM with no
-- id remap. Byte-diff proof (normalized: strip `^\s*--` comment lines, `tr -s
-- ' \t'`) is in the Wave-2 report; the ONLY deltas from each base are the
-- additions named above. Idempotent (CREATE OR REPLACE); re-runnable.

-- ── activate_proposal_as_project (00262 body verbatim + custom_fields carry) ──

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
        product_id, name, ffe_category, item_type, doc_code, custom_fields,
        status, quantity, unit_price_cents, line_total_cents,
        budget_min_cents, budget_max_cents,
        vendor_id, vendor_name, eta, notes, sort_order
      ) VALUES (
        v_project_id, v_new_room_id, v_item.id,
        v_item.product_id, v_item.name, v_item.ffe_category, v_item.item_type, v_item.doc_code, v_item.custom_fields,
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
      product_id, name, ffe_category, item_type, doc_code, custom_fields,
      status, quantity, unit_price_cents, line_total_cents,
      budget_min_cents, budget_max_cents,
      vendor_id, vendor_name, eta, notes, sort_order
    ) VALUES (
      v_project_id, NULL, v_item.id,
      v_item.product_id, v_item.name, v_item.ffe_category, v_item.item_type, v_item.doc_code, v_item.custom_fields,
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

  -- Custom field DEFS (S6, 00268): copy the proposal's schedule columns onto
  -- project-owned rows (same field_key/name/kind/sort). The per-line VALUES ride
  -- along in project_ffe_items.custom_fields above, keyed by field_key —
  -- verbatim, no id remap.
  INSERT INTO spec_field_defs (project_id, field_key, name, kind, sort_order)
  SELECT v_project_id, field_key, name, kind, sort_order
  FROM spec_field_defs
  WHERE proposal_id = p_proposal_id;

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

  FOR v_milestone IN
    SELECT * FROM proposal_payment_milestones
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order
  LOOP
    INSERT INTO project_payment_milestones (
      project_id, phase_id, label, percentage,
      amount_cents, trigger_condition,
      status, due_date, sort_order
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
      v_milestone.sort_order
    );
  END LOOP;

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

-- ── clone_proposal (00264 body verbatim + custom_fields carry) ───────────────

CREATE OR REPLACE FUNCTION clone_proposal(
  p_source_id UUID,
  p_mode TEXT DEFAULT 'revision',
  p_revision_summary TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source       proposals%ROWTYPE;
  v_new_id       UUID;
  v_root_id      UUID;
  v_room_map     JSONB := '{}'::jsonb;
  v_phase_map    JSONB := '{}'::jsonb;
  v_palette_map  JSONB := '{}'::jsonb;
  v_board_map    JSONB := '{}'::jsonb;
  v_room         RECORD;
  v_phase        RECORD;
  v_palette      RECORD;
  v_board        RECORD;
  v_new_child_id UUID;
BEGIN
  IF p_mode NOT IN ('revision', 'duplicate') THEN
    RAISE EXCEPTION 'clone_proposal: invalid mode %, expected revision|duplicate', p_mode;
  END IF;

  -- RLS-filtered read: returns nothing unless the caller can see the proposal.
  SELECT * INTO v_source FROM proposals WHERE id = p_source_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'clone_proposal: proposal % not found or access denied', p_source_id;
  END IF;

  v_root_id := COALESCE(v_source.parent_proposal_id, v_source.id);

  -- ── Header row (explicit columns; status/signing/sending state reset) ──
  INSERT INTO proposals (
    designer_id, client_id, project_id, template_id,
    title, description, project_address, cover_image,
    client_visibility_tier,
    subtotal, tax_rate, tax_amount, total_amount,
    discount_percent, discount_amount, deposit_percent,
    payment_terms, payment_notes,
    personal_message, cc_email, valid_until,
    status, version, parent_proposal_id,
    revision_summary, client_feedback,
    sent_at, viewed_at, accepted_at, declined_at, decline_reason,
    signed_at, signed_by_name, signed_ip
  )
  VALUES (
    v_source.designer_id,
    v_source.client_id,
    NULL,                                  -- a fresh draft is never pre-linked to a project
    v_source.template_id,
    CASE WHEN p_mode = 'duplicate' THEN v_source.title || ' (Copy)' ELSE v_source.title END,
    v_source.description,
    v_source.project_address,
    v_source.cover_image,
    v_source.client_visibility_tier,
    v_source.subtotal, v_source.tax_rate, v_source.tax_amount, v_source.total_amount,
    v_source.discount_percent, v_source.discount_amount, v_source.deposit_percent,
    v_source.payment_terms, v_source.payment_notes,
    v_source.personal_message, v_source.cc_email, v_source.valid_until,
    'draft',
    CASE WHEN p_mode = 'revision' THEN COALESCE(v_source.version, 1) + 1 ELSE 1 END,
    CASE WHEN p_mode = 'revision' THEN v_root_id ELSE NULL END,
    CASE WHEN p_mode = 'revision' THEN p_revision_summary ELSE NULL END,
    CASE WHEN p_mode = 'revision' THEN v_source.client_feedback ELSE NULL END,
    NULL, NULL, NULL, NULL, NULL,          -- sent/viewed/accepted/declined/decline_reason
    NULL, NULL, NULL                       -- signed_at/signed_by_name/signed_ip
  )
  RETURNING id INTO v_new_id;

  -- ── Scope rooms (build old→new id map for items/palettes/boards remap) ──
  FOR v_room IN
    SELECT * FROM proposal_scope_rooms WHERE proposal_id = p_source_id ORDER BY sort_order
  LOOP
    INSERT INTO proposal_scope_rooms (
      proposal_id, room_id, name, room_type, dimensions, floor_area_sqft,
      budget_cents, ffe_categories, notes, sort_order
    )
    VALUES (
      v_new_id, v_room.room_id, v_room.name, v_room.room_type, v_room.dimensions,
      v_room.floor_area_sqft, v_room.budget_cents, v_room.ffe_categories,
      v_room.notes, v_room.sort_order
    )
    RETURNING id INTO v_new_child_id;
    v_room_map := v_room_map || jsonb_build_object(v_room.id::text, v_new_child_id::text);
  END LOOP;

  -- ── Phases (build old→new id map for deliverables/gates/milestones remap) ──
  FOR v_phase IN
    SELECT * FROM proposal_phases WHERE proposal_id = p_source_id ORDER BY sort_order
  LOOP
    INSERT INTO proposal_phases (
      proposal_id, name, phase_key, duration_weeks, fee_cents,
      revision_limit, gate_condition, deliverables, sort_order
    )
    VALUES (
      v_new_id, v_phase.name, v_phase.phase_key, v_phase.duration_weeks,
      v_phase.fee_cents, v_phase.revision_limit, v_phase.gate_condition,
      v_phase.deliverables, v_phase.sort_order
    )
    RETURNING id INTO v_new_child_id;
    v_phase_map := v_phase_map || jsonb_build_object(v_phase.id::text, v_new_child_id::text);
  END LOOP;

  -- ── Sections ──
  INSERT INTO proposal_sections (proposal_id, type, title, body, metadata, sort_order)
  SELECT v_new_id, type, title, body, metadata, sort_order
  FROM proposal_sections
  WHERE proposal_id = p_source_id;

  -- ── Items (remap scope_room_id) ──
  INSERT INTO proposal_items (
    proposal_id, product_id, name, description, image_url, room, category,
    quantity, unit_price, markup_percent, unit_sell_price, line_total_cents,
    vendor_id, vendor_name, lead_time_weeks, notes, internal_notes, position,
    item_type, scope_room_id, budget_min_cents, budget_max_cents, ffe_category, custom_fields
  )
  SELECT
    v_new_id, product_id, name, description, image_url, room, category,
    quantity, unit_price, markup_percent, unit_sell_price, line_total_cents,
    vendor_id, vendor_name, lead_time_weeks, notes, internal_notes, position,
    item_type,
    CASE WHEN scope_room_id IS NOT NULL AND v_room_map ? scope_room_id::text
         THEN (v_room_map ->> scope_room_id::text)::uuid
         ELSE NULL END,
    budget_min_cents, budget_max_cents, ffe_category, custom_fields
  FROM proposal_items
  WHERE proposal_id = p_source_id;

  -- ── Custom field DEFS (S6, 00268): deep-copy the source's schedule columns
  -- onto the new proposal (same field_key/name/kind/sort). The per-line VALUES
  -- ride along in proposal_items.custom_fields above, keyed by field_key —
  -- verbatim, no id remap. ──
  INSERT INTO spec_field_defs (proposal_id, field_key, name, kind, sort_order)
  SELECT v_new_id, field_key, name, kind, sort_order
  FROM spec_field_defs
  WHERE proposal_id = p_source_id;

  -- ── Phase deliverables (remap phase_id, reset completion) ──
  INSERT INTO proposal_phase_deliverables (
    phase_id, label, description, is_required, completed_at, completed_by, sort_order
  )
  SELECT
    (v_phase_map ->> d.phase_id::text)::uuid,
    d.label, d.description, d.is_required, NULL, NULL, d.sort_order
  FROM proposal_phase_deliverables d
  JOIN proposal_phases ph ON ph.id = d.phase_id
  WHERE ph.proposal_id = p_source_id
    AND v_phase_map ? d.phase_id::text;

  -- ── Phase gates (remap phase_id, reset satisfaction) ──
  INSERT INTO proposal_phase_gates (
    phase_id, gate_kind, payload, satisfied_at, satisfied_by, override_reason, sort_order
  )
  SELECT
    (v_phase_map ->> g.phase_id::text)::uuid,
    g.gate_kind, g.payload, NULL, NULL, NULL, g.sort_order
  FROM proposal_phase_gates g
  JOIN proposal_phases ph ON ph.id = g.phase_id
  WHERE ph.proposal_id = p_source_id
    AND v_phase_map ? g.phase_id::text;

  -- ── Payment milestones (remap phase_id; phase_id is nullable) ──
  INSERT INTO proposal_payment_milestones (
    proposal_id, phase_id, label, percentage, amount_cents, trigger_condition, sort_order
  )
  SELECT
    v_new_id,
    CASE WHEN phase_id IS NOT NULL AND v_phase_map ? phase_id::text
         THEN (v_phase_map ->> phase_id::text)::uuid
         ELSE NULL END,
    label, percentage, amount_cents, trigger_condition, sort_order
  FROM proposal_payment_milestones
  WHERE proposal_id = p_source_id;

  -- ── Exclusions ──
  INSERT INTO proposal_exclusions (proposal_id, description, category, sort_order)
  SELECT v_new_id, description, category, sort_order
  FROM proposal_exclusions
  WHERE proposal_id = p_source_id;

  -- ── Change order terms (UNIQUE(proposal_id) — at most one row) ──
  INSERT INTO proposal_change_order_terms (
    proposal_id, process_description, hourly_rate_cents, minimum_fee_cents, approval_required
  )
  SELECT v_new_id, process_description, hourly_rate_cents, minimum_fee_cents, approval_required
  FROM proposal_change_order_terms
  WHERE proposal_id = p_source_id;

  -- ── Team members ──
  INSERT INTO proposal_team_members (proposal_id, user_id, role, permissions, sort_order)
  SELECT v_new_id, user_id, role, permissions, sort_order
  FROM proposal_team_members
  WHERE proposal_id = p_source_id
  ON CONFLICT (proposal_id, user_id, role) DO NOTHING;

  -- ── Palettes (build map, remap scope_room_id) then swatches ──
  FOR v_palette IN
    SELECT * FROM proposal_palettes WHERE proposal_id = p_source_id ORDER BY sort_order
  LOOP
    INSERT INTO proposal_palettes (
      proposal_id, name, scope_room_id, is_primary, source_image_url, notes, sort_order
    )
    VALUES (
      v_new_id, v_palette.name,
      CASE WHEN v_palette.scope_room_id IS NOT NULL AND v_room_map ? v_palette.scope_room_id::text
           THEN (v_room_map ->> v_palette.scope_room_id::text)::uuid
           ELSE NULL END,
      v_palette.is_primary, v_palette.source_image_url, v_palette.notes, v_palette.sort_order
    )
    RETURNING id INTO v_new_child_id;
    v_palette_map := v_palette_map || jsonb_build_object(v_palette.id::text, v_new_child_id::text);
  END LOOP;

  INSERT INTO palette_swatches (
    palette_id, hex, name, role, paint_color_id, brand, brand_code, source_pixel, sort_order
  )
  SELECT
    (v_palette_map ->> s.palette_id::text)::uuid,
    s.hex, s.name, s.role, s.paint_color_id, s.brand, s.brand_code, s.source_pixel, s.sort_order
  FROM palette_swatches s
  JOIN proposal_palettes pal ON pal.id = s.palette_id
  WHERE pal.proposal_id = p_source_id
    AND v_palette_map ? s.palette_id::text;

  -- ── Boards (build old→new id map, remap scope_room_id) then board items ──
  -- New in 00260. Ordered by (sort_order, created_at) to match useBoards.
  FOR v_board IN
    SELECT * FROM proposal_boards WHERE proposal_id = p_source_id ORDER BY sort_order, created_at
  LOOP
    INSERT INTO proposal_boards (
      proposal_id, name, scope_room_id, cover_image_url,
      canvas_width, canvas_height, background_color, sort_order,
      sections, status
    )
    VALUES (
      v_new_id, v_board.name,
      CASE WHEN v_board.scope_room_id IS NOT NULL AND v_room_map ? v_board.scope_room_id::text
           THEN (v_room_map ->> v_board.scope_room_id::text)::uuid
           ELSE NULL END,
      v_board.cover_image_url,
      v_board.canvas_width, v_board.canvas_height, v_board.background_color, v_board.sort_order,
      v_board.sections, v_board.status
    )
    RETURNING id INTO v_new_child_id;
    v_board_map := v_board_map || jsonb_build_object(v_board.id::text, v_new_child_id::text);
  END LOOP;

  -- Board items — copy geometry + snapshot verbatim; remap board_id (new board)
  -- and palette_id (cloned palettes). product_id and capture_id are kept (see
  -- the header note): the render uses the `data` snapshot, not those FKs. The
  -- item's data.section_id needs NO remap — the whole sections array is carried
  -- verbatim onto the new board, so its ids stay internally consistent.
  INSERT INTO proposal_board_items (
    board_id, type, x, y, width, height, z_index, rotation, locked,
    product_id, capture_id, palette_id, image_url, content, data
  )
  SELECT
    (v_board_map ->> bi.board_id::text)::uuid,
    bi.type, bi.x, bi.y, bi.width, bi.height, bi.z_index, bi.rotation, bi.locked,
    bi.product_id, bi.capture_id,
    CASE WHEN bi.palette_id IS NOT NULL AND v_palette_map ? bi.palette_id::text
         THEN (v_palette_map ->> bi.palette_id::text)::uuid
         ELSE NULL END,
    bi.image_url, bi.content, bi.data
  FROM proposal_board_items bi
  JOIN proposal_boards pb ON pb.id = bi.board_id
  WHERE pb.proposal_id = p_source_id
    AND v_board_map ? bi.board_id::text;

  -- NOT cloned (deliberate): proposal_captures (designer inbox tied to the
  -- original), proposal_engagement (per-version audit trail).

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION clone_proposal(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clone_proposal(UUID, TEXT, TEXT) TO authenticated;
