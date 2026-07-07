-- 00260_clone_proposal_carry_boards.sql
--
-- clone_proposal deep-copies a proposal and all its child tables, but the
-- original definition (00176) predates mood boards (00179) and so silently
-- DROPPED proposal_boards / proposal_board_items — revising (cloning) a sent
-- proposal lost every board it carried.
--
-- This re-defines clone_proposal with the FULL 00176 body (00185/00210 only
-- CALL it; neither redefines it, so 00176 is the latest definition) plus a
-- boards deep-copy block that runs AFTER the palettes block (it reuses the
-- old→new maps that block builds).
--
-- Remaps, mirroring how the function already remaps items:
--   • proposal_boards.scope_room_id → v_room_map (old→new scope room)
--   • proposal_board_items.palette_id → v_palette_map (palettes ARE cloned, so
--     the item's palette reference follows the clone; orphans NULL out, same
--     as items handle scope_room_id).
--
-- Kept as-is:
--   • product_id — points at the global `products` catalog (proposal-agnostic).
--   • capture_id — captures are DELIBERATELY not cloned by 00176 (designer
--     inbox tied to the source). The board render reads the snapshotted `data`
--     JSONB (name/price/vendor/image — written by the board editor's handlePick
--     and read by the client board-block + shared BoardsBlock renderers; the
--     FK is never dereferenced for display), so keeping capture_id preserves
--     provenance with zero display risk. Its FK is ON DELETE SET NULL, so if
--     the source proposal's captures are ever removed the cloned item quietly
--     drops to NULL and still renders from the snapshot. NULLing would lose
--     provenance for no benefit.
--
-- SECURITY INVOKER, search_path, and grants are preserved EXACTLY as 00176
-- (the function relies on RLS — "Designers can manage own proposals" /
-- "Designers manage their proposal boards" — to authorize every read/write, so
-- only the owning designer can clone; both source proposal and clone share the
-- same designer_id, so the boards copy passes the WITH CHECK).

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
    item_type, scope_room_id, budget_min_cents, budget_max_cents, ffe_category
  )
  SELECT
    v_new_id, product_id, name, description, image_url, room, category,
    quantity, unit_price, markup_percent, unit_sell_price, line_total_cents,
    vendor_id, vendor_name, lead_time_weeks, notes, internal_notes, position,
    item_type,
    CASE WHEN scope_room_id IS NOT NULL AND v_room_map ? scope_room_id::text
         THEN (v_room_map ->> scope_room_id::text)::uuid
         ELSE NULL END,
    budget_min_cents, budget_max_cents, ffe_category
  FROM proposal_items
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
      canvas_width, canvas_height, background_color, sort_order
    )
    VALUES (
      v_new_id, v_board.name,
      CASE WHEN v_board.scope_room_id IS NOT NULL AND v_room_map ? v_board.scope_room_id::text
           THEN (v_room_map ->> v_board.scope_room_id::text)::uuid
           ELSE NULL END,
      v_board.cover_image_url,
      v_board.canvas_width, v_board.canvas_height, v_board.background_color, v_board.sort_order
    )
    RETURNING id INTO v_new_child_id;
    v_board_map := v_board_map || jsonb_build_object(v_board.id::text, v_new_child_id::text);
  END LOOP;

  -- Board items — copy geometry + snapshot verbatim; remap board_id (new board)
  -- and palette_id (cloned palettes). product_id and capture_id are kept (see
  -- the header note): the render uses the `data` snapshot, not those FKs.
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
