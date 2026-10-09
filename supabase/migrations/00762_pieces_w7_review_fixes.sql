-- ═══════════════════════════════════════════════════════════════════════════
-- 00762 · Pieces: W7 review fixes in SQL (US-21 T-61a, SQ-697; from the T-61
-- adversarial review, SQ-667)
--
-- F8 (S2). Activation survives a proposal with two palettes in one room.
--   00760's plain unique index project_palettes_one_per_room (project_id,
--   scope_room_id) made the activation impl's palette INSERT fail whole with
--   23505 when two proposal_palettes rows share a scope room. The INSERT now
--   takes ON CONFLICT (project_id, scope_room_id) DO UPDATE: the first palette
--   for a room (sort_order, then created_at, id) is the room's row, and each
--   later one appends its swatches in order, its name (" · ") and its notes
--   (a blank line between). A palette with no room keeps its own row.
--   CREATE OR REPLACE base: _activate_proposal_as_project_impl, the 00331:520
--   body (activate_proposal_as_project, renamed by 00390:807; never re-created
--   since), copied whole. Grants as 00390:810 (owner only).
--
-- F13 (S3). Actor FKs no longer block deleting a user.
--   project_room_handbacks.handed_back_by (00742) and
--   project_ffe_allowance_fills.filled_by (00752:57) become nullable with
--   ON DELETE SET NULL. guard_project_room_handbacks_append_only (base
--   00755:392) lets exactly one UPDATE through: handed_back_by goes from a
--   value to NULL and every other column is unchanged. Every other UPDATE or
--   DELETE is refused as before. project_ffe_allowance_fills has no guard
--   trigger; its UPDATE and DELETE stay revoked from every API role (00752:85),
--   and the FK action runs as the table owner.
--
-- F5 (S4). record_project_ffe_receipt_batch authorizes before it locks.
--   CREATE OR REPLACE base: 00758:407. Before the PO FOR UPDATE and the photo
--   check, it runs the impl's own checks (00446 impl): the PO exists,
--   _ffe_require_studio_project(its project) and is_studio_comember(its
--   designer), each 42501. Then it locks, then validates photos.
--
-- F12 (S4). project_palettes_room_same_project() (00761:31) gains
--   SET search_path TO 'public', 'pg_temp'. _product_on_a_schedule_line
--   (base 00753:53) answers only for a product the caller's studio owns
--   (an active owner, admin or member of products.studio_id, the
--   products_studio_delete USING); for any other product it returns false.
--   EXECUTE stays with authenticated, because products_studio_delete calls it.
--   guard_products_referenced_delete (00758:363) does not call it and is
--   unchanged, so it still refuses every caller, service_role included.
--
-- Adds GRANT/REVOKE → regenerate supabase/seed/00-legacy-grants.sql (the
-- grants re-issued here match the ones in place; no new grant).
-- Nullability changes on handed_back_by and filled_by → the next types regen
-- shows them as string | null.
-- Idempotent: CREATE OR REPLACE, ALTER … DROP NOT NULL, DROP CONSTRAINT IF
-- EXISTS before ADD CONSTRAINT, ALTER FUNCTION … SET.
-- Test: supabase/tests/ffe/pieces_w7_review_fixes_test.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. F8: activation merges two palettes in one room ──────────────────────

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
      INSERT INTO project_ffe_items (
        project_id, project_room_id, source_proposal_item_id,
        product_id, name, ffe_category, item_type, doc_code, custom_fields,
        status, quantity, unit_price_cents, trade_price_cents, markup_percent, line_total_cents,
        budget_min_cents, budget_max_cents,
        vendor_id, vendor_name, eta, notes, sort_order
      ) VALUES (
        v_project_id, v_new_room_id, v_item.id,
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
    INSERT INTO project_ffe_items (
      project_id, project_room_id, source_proposal_item_id,
      product_id, name, ffe_category, item_type, doc_code, custom_fields,
      status, quantity, unit_price_cents, trade_price_cents, markup_percent, line_total_cents,
      budget_min_cents, budget_max_cents,
      vendor_id, vendor_name, eta, notes, sort_order
    ) VALUES (
      v_project_id, NULL, v_item.id,
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
    ON CONFLICT (project_id, scope_room_id) DO UPDATE SET
      swatches   = project_palettes.swatches || EXCLUDED.swatches,
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

-- ─── 2. F13: actor FKs set NULL when the profile goes ───────────────────────

ALTER TABLE public.project_room_handbacks
  ALTER COLUMN handed_back_by DROP NOT NULL;
ALTER TABLE public.project_room_handbacks
  DROP CONSTRAINT IF EXISTS project_room_handbacks_handed_back_by_fkey;
ALTER TABLE public.project_room_handbacks
  ADD CONSTRAINT project_room_handbacks_handed_back_by_fkey
  FOREIGN KEY (handed_back_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.project_ffe_allowance_fills
  ALTER COLUMN filled_by DROP NOT NULL;
ALTER TABLE public.project_ffe_allowance_fills
  DROP CONSTRAINT IF EXISTS project_ffe_allowance_fills_filled_by_fkey;
ALTER TABLE public.project_ffe_allowance_fills
  ADD CONSTRAINT project_ffe_allowance_fills_filled_by_fkey
  FOREIGN KEY (filled_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.guard_project_room_handbacks_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- The ON DELETE CASCADE from a deleted project or room (00742's FKs): the
  -- parent row is already gone when the cascade reaches this row.
  IF TG_OP = 'DELETE' AND (
       NOT EXISTS (SELECT 1 FROM public.projects WHERE id = OLD.project_id)
       OR NOT EXISTS (SELECT 1 FROM public.project_rooms WHERE id = OLD.project_room_id)
     ) THEN
    RETURN OLD;
  END IF;
  -- 00762 (F13): the ON DELETE SET NULL from a deleted profile. The one
  -- UPDATE allowed nulls handed_back_by and changes nothing else.
  IF TG_OP = 'UPDATE'
     AND OLD.handed_back_by IS NOT NULL
     AND NEW.handed_back_by IS NULL
     AND to_jsonb(NEW) - 'handed_back_by' = to_jsonb(OLD) - 'handed_back_by'
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Hand-backs are a record: they are never changed or removed.'
    USING ERRCODE = 'check_violation';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_project_room_handbacks_append_only()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.project_room_handbacks IS
  'Append-only internal review fact: a room handed back to the lead designer, READY FOR LEAH '
  '(00742, D18, Q13). Who and when, nothing else; never read by client payloads. '
  'Read: can_buy_for_project. Written only through hand_back_project_room. 00755: a trigger refuses '
  'UPDATE and DELETE (a deleted project or room still cascades); UPDATE, DELETE and TRUNCATE are '
  'revoked from every API role. 00762: handed_back_by is ON DELETE SET NULL; the trigger lets that '
  'one UPDATE through (the actor nulled, nothing else changed).';

-- ─── 3. F5: record_project_ffe_receipt_batch (base 00758:407) ───────────────

CREATE OR REPLACE FUNCTION public.record_project_ffe_receipt_batch(
  p_purchase_order_id uuid,
  p_lines jsonb,
  p_outcome public.receiving_inspection_outcome,
  p_notes text DEFAULT NULL,
  p_photo_asset_ids uuid[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_project_id  uuid;
  v_asset_rel   regclass;
  v_col_id      text;
  v_col_status  text;
  v_col_scan    text;
  v_col_upload  text;
  v_col_perms   text;
  v_col_tags    text;
  v_ambiguous   text;
  v_invalid     boolean;
  -- 00754: receiving by room.
  v_entry       jsonb;
  v_given       jsonb;
  v_given_ids   uuid[];
  v_impl_lines  jsonb;
  v_received_before jsonb;
  v_response    jsonb;
  v_batch_id    uuid;
  v_item_id     uuid;
  v_receipt     bigint;
  v_given_total bigint;
  v_left        bigint;
  v_take        bigint;
  v_placement   record;
  v_lacking     bigint;  -- 00758 (F11)
  v_designer_id uuid;    -- 00762 (F5)
BEGIN
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) entry
    WHERE entry->>'receivedQuantity' !~ '^[0-9]{1,10}$'
       OR (entry->>'receivedQuantity')::numeric > 2147483647
  ) THEN
    RAISE EXCEPTION 'receivedQuantity must be a nonnegative 32-bit integer'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00754: the optional placements key, shape only. Ownership is checked
  -- after the impl has authorized the caller.
  FOR v_entry IN SELECT entry FROM jsonb_array_elements(p_lines) entry LOOP
    CONTINUE WHEN jsonb_typeof(v_entry) IS DISTINCT FROM 'object' OR NOT (v_entry ? 'placements');
    IF jsonb_typeof(v_entry -> 'placements') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'placements must be a list of placementId and quantity entries'
        USING ERRCODE = 'check_violation';
    END IF;
    v_given_ids := ARRAY[]::uuid[];
    FOR v_given IN SELECT given FROM jsonb_array_elements(v_entry -> 'placements') given LOOP
      IF jsonb_typeof(v_given) IS DISTINCT FROM 'object'
         OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_given) key
                    WHERE key NOT IN ('placementId', 'quantity'))
         OR jsonb_typeof(v_given -> 'placementId') IS DISTINCT FROM 'string'
         OR (v_given ->> 'placementId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         OR jsonb_typeof(v_given -> 'quantity') IS DISTINCT FROM 'number'
         OR (v_given ->> 'quantity') !~ '^[0-9]{1,10}$'
      THEN
        RAISE EXCEPTION 'placements must be a list of placementId and quantity entries'
          USING ERRCODE = 'check_violation';
      END IF;
      IF (v_given ->> 'quantity')::bigint NOT BETWEEN 1 AND 2147483647 THEN
        RAISE EXCEPTION 'Each room''s receipt is a whole number above zero.'
          USING ERRCODE = 'check_violation';
      END IF;
      IF (v_given ->> 'placementId')::uuid = ANY (v_given_ids) THEN
        RAISE EXCEPTION 'A room appears twice in the receipt.'
          USING ERRCODE = 'check_violation';
      END IF;
      v_given_ids := v_given_ids || (v_given ->> 'placementId')::uuid;
    END LOOP;
  END LOOP;

  -- 00762 (F5): authorize before taking the lock, with the impl's own checks
  -- and errors (00446 impl), so an unauthorized caller never holds the PO row.
  SELECT project_id, designer_id INTO v_project_id, v_designer_id
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase order not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._ffe_require_studio_project(v_project_id);
  IF NOT public.is_studio_comember(v_designer_id) THEN
    RAISE EXCEPTION 'purchase order owner is not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 00754: lock the PO (the impl's first lock, taken earlier) so the
  -- quantities read below are the ones this batch advances from.
  SELECT project_id INTO v_project_id
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id
  FOR UPDATE;

  SELECT COALESCE(jsonb_object_agg(item.id::text, COALESCE(item.received_quantity, 0)), '{}'::jsonb)
  INTO v_received_before
  FROM public.project_ffe_items item
  WHERE item.purchase_order_id = p_purchase_order_id;

  IF cardinality(COALESCE(p_photo_asset_ids, '{}')) > 0 THEN
    v_asset_rel := COALESCE(
      to_regclass('svc_media."MediaAsset"'),
      to_regclass('svc_media.media_assets')
    );
    IF v_asset_rel IS NULL THEN
      RAISE EXCEPTION 'receiving photos cannot be validated: the svc_media asset table is absent'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    -- A key that two physical columns collapse onto (a half-finished @@map
    -- rollout leaving scan_status beside "scanStatus") must abort rather than
    -- silently bind whichever spelling sorts higher.
    SELECT
      max(col.ident) FILTER (WHERE col.key = 'id'),
      max(col.ident) FILTER (WHERE col.key = 'status'),
      max(col.ident) FILTER (WHERE col.key = 'scanstatus'),
      max(col.ident) FILTER (WHERE col.key = 'uploadedby'),
      max(col.ident) FILTER (WHERE col.key = 'permissions'),
      max(col.ident) FILTER (WHERE col.key = 'tags'),
      string_agg(DISTINCT col.key, ', ') FILTER (WHERE col.collisions > 1)
    INTO v_col_id, v_col_status, v_col_scan, v_col_upload, v_col_perms,
         v_col_tags, v_ambiguous
    FROM (
      SELECT lower(replace(attribute.attname, '_', '')) AS key,
             quote_ident(attribute.attname) AS ident,
             count(*) OVER (
               PARTITION BY lower(replace(attribute.attname, '_', ''))
             ) AS collisions
      FROM pg_attribute AS attribute
      WHERE attribute.attrelid = v_asset_rel
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
    ) AS col
    WHERE col.key IN (
      'id', 'status', 'scanstatus', 'uploadedby', 'permissions', 'tags'
    );

    IF v_ambiguous IS NOT NULL THEN
      RAISE EXCEPTION
        'receiving photos cannot be validated: % carries more than one column for: %',
        v_asset_rel::text, v_ambiguous
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF v_col_id IS NULL OR v_col_status IS NULL OR v_col_scan IS NULL
       OR v_col_upload IS NULL OR v_col_perms IS NULL OR v_col_tags IS NULL THEN
      RAISE EXCEPTION 'receiving photos cannot be validated: % is missing a required asset column',
        v_asset_rel::text
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    EXECUTE format(
      'SELECT EXISTS ('
      ||   'SELECT 1 '
      ||     'FROM unnest($1::uuid[]) AS requested(asset_id) '
      ||     'LEFT JOIN %s AS asset ON asset.%s::text = requested.asset_id::text '
      ||    'WHERE asset.%s IS NULL '
      ||       'OR asset.%s::text <> ''READY'' '
      ||       'OR asset.%s::text <> ''CLEAN'' '
      ||       'OR asset.%s::text IS DISTINCT FROM $2::text '
      ||       'OR asset.%s->>''projectId'' IS DISTINCT FROM $3::text '
      ||       'OR NOT (''receiving'' = ANY(COALESCE(asset.%s, ''{}''::text[])))'
      || ')',
      v_asset_rel::text,
      v_col_id,
      v_col_id,
      v_col_status,
      v_col_scan,
      v_col_upload,
      v_col_perms,
      v_col_tags
    )
    USING p_photo_asset_ids, auth.uid()::text, v_project_id::text
    INTO v_invalid;

    IF v_invalid THEN
      RAISE EXCEPTION 'receiving photos must be clean project receiving assets owned by the actor'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  -- 00754: the impl allows only selectionId and receivedQuantity, and hashes
  -- exactly those; the placements key is ours.
  SELECT COALESCE(jsonb_agg(
           CASE WHEN jsonb_typeof(entry) = 'object' THEN entry - 'placements' ELSE entry END
           ORDER BY ordinality), '[]'::jsonb)
  INTO v_impl_lines
  FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS lines(entry, ordinality);

  v_response := public._record_project_ffe_receipt_batch_00446_impl(
    p_purchase_order_id, v_impl_lines, p_outcome, p_notes, p_photo_asset_ids
  );

  -- 00754: allocate this batch's receipt to the line's rooms. A reused
  -- request already allocated when it first ran.
  IF COALESCE((v_response ->> 'reused')::boolean, false) THEN
    RETURN v_response;
  END IF;
  v_batch_id := (v_response ->> 'inspectionId')::uuid;

  FOR v_entry IN SELECT entry FROM jsonb_array_elements(p_lines) entry LOOP
    v_item_id := (v_entry ->> 'selectionId')::uuid;
    v_receipt := (v_entry ->> 'receivedQuantity')::bigint
                 - COALESCE((v_received_before ->> v_item_id::text)::bigint, 0);

    IF v_entry ? 'placements' THEN
      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_entry -> 'placements') given
        LEFT JOIN public.project_ffe_placements placement
          ON placement.id = (given ->> 'placementId')::uuid
         AND placement.ffe_item_id = v_item_id
        WHERE placement.id IS NULL
      ) THEN
        RAISE EXCEPTION 'That room is not one this line is placed in.'
          USING ERRCODE = 'check_violation';
      END IF;

      SELECT COALESCE(sum((given ->> 'quantity')::bigint), 0) INTO v_given_total
      FROM jsonb_array_elements(v_entry -> 'placements') given;
      IF v_given_total > v_receipt THEN
        RAISE EXCEPTION 'The rooms are given %, more than the % this delivery brought.',
          v_given_total, v_receipt
          USING ERRCODE = 'check_violation';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_entry -> 'placements') given
        JOIN public.project_ffe_placements placement
          ON placement.id = (given ->> 'placementId')::uuid
        WHERE (given ->> 'quantity')::bigint
              + COALESCE((SELECT sum(earlier.quantity)
                          FROM public.project_ffe_placement_receipts earlier
                          WHERE earlier.placement_id = placement.id), 0)
              > placement.quantity
      ) THEN
        RAISE EXCEPTION 'A room cannot receive more than is placed there.'
          USING ERRCODE = 'check_violation';
      END IF;

      -- 00758 (F11): named rooms account for the whole delivery, as 00756
      -- checks: this batch's receipt, or all the rooms still lack when that
      -- is less (the waste).
      SELECT COALESCE(sum(GREATEST(placement.quantity - COALESCE((
               SELECT sum(earlier.quantity)
                 FROM public.project_ffe_placement_receipts earlier
                WHERE earlier.placement_id = placement.id), 0), 0)), 0)
        INTO v_lacking
        FROM public.project_ffe_placements placement
       WHERE placement.ffe_item_id = v_item_id;
      IF v_given_total <> LEAST(GREATEST(v_receipt, 0), v_lacking) THEN
        RAISE EXCEPTION 'The rooms add up to %, but this delivery brought % to place.',
          v_given_total, LEAST(GREATEST(v_receipt, 0), v_lacking)
          USING ERRCODE = 'check_violation';
      END IF;

      INSERT INTO public.project_ffe_placement_receipts (placement_id, receipt_batch_id, quantity)
      SELECT (given ->> 'placementId')::uuid, v_batch_id, (given ->> 'quantity')::integer
      FROM jsonb_array_elements(v_entry -> 'placements') given;
    ELSE
      v_left := v_receipt;
      FOR v_placement IN
        SELECT placement.id,
               placement.quantity - COALESCE((SELECT sum(earlier.quantity)
                                              FROM public.project_ffe_placement_receipts earlier
                                              WHERE earlier.placement_id = placement.id), 0) AS lacking
        FROM public.project_ffe_placements placement
        WHERE placement.ffe_item_id = v_item_id
        ORDER BY placement.sort_order, placement.created_at, placement.id
      LOOP
        EXIT WHEN v_left <= 0;
        v_take := LEAST(v_left, GREATEST(v_placement.lacking, 0));
        IF v_take > 0 THEN
          INSERT INTO public.project_ffe_placement_receipts (placement_id, receipt_batch_id, quantity)
          VALUES (v_placement.id, v_batch_id, v_take::integer);
          v_left := v_left - v_take;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN v_response;
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_project_ffe_receipt_batch(
  uuid, jsonb, public.receiving_inspection_outcome, text, uuid[]
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_project_ffe_receipt_batch(
  uuid, jsonb, public.receiving_inspection_outcome, text, uuid[]
) TO authenticated;

-- ─── 4. F12: trigger search_path; a scoped product oracle ───────────────────

ALTER FUNCTION public.project_palettes_room_same_project()
  SET search_path TO 'public', 'pg_temp';

CREATE OR REPLACE FUNCTION public._product_on_a_schedule_line(p_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_ffe_items item
    WHERE item.product_id = p_product_id
  )
  -- 00762 (F12): only for a product the caller's studio owns (the
  -- products_studio_delete membership); false for any other product.
  AND EXISTS (
    SELECT 1
    FROM public.products product
    JOIN public.organization_members om ON om.organization_id = product.studio_id
    WHERE product.id = p_product_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin', 'member')
  );
$$;

COMMENT ON FUNCTION public._product_on_a_schedule_line(uuid) IS
  'True when any project_ffe_items row (active or removed) names the product. SECURITY DEFINER so '
  'products_studio_delete (00753) sees lines the caller cannot read. D11, R1 F30. 00762 (F12): answers '
  'only for a product of a studio the caller is an active owner, admin or member of; false otherwise. '
  'guard_products_referenced_delete (00758) does not use it and binds every caller.';

REVOKE ALL ON FUNCTION public._product_on_a_schedule_line(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._product_on_a_schedule_line(uuid) TO authenticated;
