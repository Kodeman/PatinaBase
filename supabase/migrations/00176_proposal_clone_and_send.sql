-- 00176_proposal_clone_and_send.sql
--
-- Two RPCs that make the proposal revision pipeline atomic and complete:
--
-- 1. clone_proposal(p_source_id, p_mode, p_revision_summary) — full deep copy
--    of a proposal and ALL its child tables (the old TS hooks copied only
--    sections + items, silently dropping scope rooms, phases, deliverables,
--    gates, milestones, exclusions, change-order terms, team, palettes).
--    Modes: 'revision' (version+1, parent chain) | 'duplicate' (fresh v1).
--
-- 2. send_proposal(p_proposal_id, ...) — flips the target to 'sent' AND
--    atomically supersedes sibling versions (sent/viewed → 'revised') in the
--    same transaction, closing the hole where a client could still sign a
--    stale version after a newer one was sent.
--
-- Both are SECURITY INVOKER: RLS ("Designers can manage own proposals",
-- 00014) authorizes every read/write, so only the owning designer can clone
-- or send. Mirrors the consume_capture pattern (00130).
--
-- ⚠ Column lists are explicit (no SELECT *) and must be kept in sync with
-- schema changes — same maintenance contract as activate_proposal_as_project
-- (00140/00142). If you add a column to proposals or a child table, add it
-- here too.

-- ─── clone_proposal ──────────────────────────────────────────────────────────

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
  v_room         RECORD;
  v_phase        RECORD;
  v_palette      RECORD;
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

  -- ── Scope rooms (build old→new id map for items/palettes remap) ──
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

  -- NOT cloned (deliberate): proposal_captures (designer inbox tied to the
  -- original), proposal_engagement (per-version audit trail).

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION clone_proposal(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clone_proposal(UUID, TEXT, TEXT) TO authenticated;

-- ─── send_proposal ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION send_proposal(
  p_proposal_id UUID,
  p_personal_message TEXT DEFAULT NULL,
  p_cc_email TEXT DEFAULT NULL,
  p_valid_until TIMESTAMPTZ DEFAULT NULL
)
RETURNS proposals
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target  proposals%ROWTYPE;
  v_root_id UUID;
BEGIN
  -- RLS-filtered: only the owning designer sees/updates the row.
  SELECT * INTO v_target FROM proposals WHERE id = p_proposal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'send_proposal: proposal % not found or access denied', p_proposal_id;
  END IF;

  v_root_id := COALESCE(v_target.parent_proposal_id, v_target.id);

  UPDATE proposals
  SET status           = 'sent',
      sent_at          = NOW(),
      personal_message = COALESCE(p_personal_message, personal_message),
      cc_email         = COALESCE(p_cc_email, cc_email),
      valid_until      = COALESCE(p_valid_until, valid_until),
      updated_at       = NOW()
  WHERE id = p_proposal_id
  RETURNING * INTO v_target;

  -- Supersede sibling versions in the same chain so a stale version can no
  -- longer be viewed-as-pending or signed by the client (sign route + RLS
  -- both require status IN ('sent','viewed')). Never touches accepted /
  -- declined / expired / draft — a concurrent client sign that commits first
  -- leaves that row 'accepted' and this clause skips it.
  UPDATE proposals
  SET status     = 'revised',
      updated_at = NOW()
  WHERE (id = v_root_id OR parent_proposal_id = v_root_id)
    AND id <> p_proposal_id
    AND status IN ('sent', 'viewed', 'revised');

  RETURN v_target;
END;
$$;

REVOKE ALL ON FUNCTION send_proposal(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION send_proposal(UUID, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;
