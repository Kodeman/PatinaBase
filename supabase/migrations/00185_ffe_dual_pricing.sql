-- ============================================================================
-- Migration 00185: FF&E Dual Pricing (trade cost + markup + activation repair)
--
-- `project_ffe_items` carried a single `unit_price_cents`. Real designer
-- procurement is cost-plus: vendor (trade) cost vs client price vs markup.
-- Decision (approved): `unit_price_cents` stays = CLIENT price — every
-- existing consumer is client-facing money (budget recompute,
-- useProjectFinancials, allowance midpoints). This migration adds the
-- trade side, mirroring `proposal_items`, which has had the full dual model
-- since 00014:
--   proposal_items.unit_price        = TRADE  unit cents
--   proposal_items.markup_percent    = advisory markup (NUMERIC(5,2))
--   proposal_items.unit_sell_price   = CLIENT unit cents
--   proposal_items.line_total_cents  = quantity × unit_sell_price (00142 rename)
--
-- KNOWN BUG REPAIRED HERE (verified by two reviewers): the FF&E insert
-- blocks of activate_proposal_as_project (latest body 00180) copied
-- `pi.unit_price` (TRADE cents) into `project_ffe_items.unit_price_cents`
-- while copying `pi.line_total_cents` (CLIENT total) into
-- `line_total_cents` — internally inconsistent for any markup ≠ 0 proposal
-- (line_total ≠ qty × unit). The redefine below maps:
--   unit_price_cents  := pi.unit_sell_price   (client unit — was pi.unit_price)
--   trade_price_cents := pi.unit_price        (trade unit — NEW)
--   markup_percent    := pi.markup_percent    (NEW)
--   line_total_cents  := pi.line_total_cents  (unchanged — already client total)
-- and the tier-a backfill repairs rows the buggy revisions already created.
--
-- Contents:
--   1. ADD COLUMN trade_price_cents / markup_percent + column comments
--   2. Three-tier idempotent backfill (proposal provenance → product trade
--      price → conservative zero-margin remainder)
--   3. Redefine activate_proposal_as_project (00180 body verbatim except the
--      two FF&E insert blocks' pricing columns)
--   4. Redefine apply_decision (00175 body + dual pricing on the step-4
--      feed-through INSERT/UPDATE)
--   5. COMMENT ON purchase_orders.total_cents documenting the upcoming 00186
--      semantic flip (comment-only here)
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. COLUMNS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Re-run safe: when the column already exists, IF NOT EXISTS skips the whole
-- clause including the inline CHECK, so no duplicate-constraint error.

ALTER TABLE public.project_ffe_items
  ADD COLUMN IF NOT EXISTS trade_price_cents INTEGER CHECK (trade_price_cents >= 0),
  ADD COLUMN IF NOT EXISTS markup_percent NUMERIC(5,2) CHECK (markup_percent >= 0);

COMMENT ON COLUMN public.project_ffe_items.unit_price_cents IS
  'CLIENT unit price in cents — what the client is charged per unit. Source '
  'of truth for client-facing money (line_total_cents = quantity × this; '
  'budget recompute, useProjectFinancials, allowance midpoints all read the '
  'client side). Trade cost lives in trade_price_cents (00185).';

COMMENT ON COLUMN public.project_ffe_items.trade_price_cents IS
  'Vendor (trade) unit cost in cents (00185). Mirrors proposal_items.unit_price. '
  'NULL = unknown (e.g. rows seeded/created without a trade quote); UI must '
  'tolerate NULL. Margin = line_total_cents − trade_price_cents × quantity.';

COMMENT ON COLUMN public.project_ffe_items.markup_percent IS
  'Advisory designer markup percentage (00185). Mirrors '
  'proposal_items.markup_percent. Client price is the source of truth — this '
  'records intent and need not exactly equal unit_price/trade − 1.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. BACKFILL — three tiers, each idempotent via `trade_price_cents IS NULL`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Tier (a) — proposal-sourced FIXED items: restore the full dual model from
-- the originating proposal_items row. This also REPAIRS the 00180-and-earlier
-- activation bug: unit_price_cents currently holds the TRADE price on these
-- rows; reset it to the client price. line_total_cents is left untouched —
-- it was always the client total. Only item_type = 'fixed': allowance/tbd
-- proposal items carry budget ranges, not negotiated unit pricing.
-- GREATEST guards keep legacy garbage (negative prices/markup, no CHECK on
-- proposal_items) from violating the new CHECKs and failing the migration.

UPDATE public.project_ffe_items f
   SET unit_price_cents  = pi.unit_sell_price,
       trade_price_cents = GREATEST(pi.unit_price, 0),
       markup_percent    = GREATEST(COALESCE(pi.markup_percent, 0), 0)
  FROM public.proposal_items pi
 WHERE pi.id = f.source_proposal_item_id
   AND f.trade_price_cents IS NULL
   AND f.item_type = 'fixed';

-- Tier (b) — product-linked items without proposal provenance: take the
-- catalog trade price (products.price_trade, integer cents since 00001).
-- markup_percent stays NULL — the client price didn't come from a recorded
-- markup, so none is asserted.

UPDATE public.project_ffe_items f
   SET trade_price_cents = p.price_trade
  FROM public.products p
 WHERE p.id = f.product_id
   AND f.trade_price_cents IS NULL
   AND p.price_trade IS NOT NULL
   AND p.price_trade >= 0;

-- Tier (c) — remainder: conservative ZERO-MARGIN assumption. We have no
-- trade signal, so assume trade = client price (markup 0) rather than invent
-- margin that would overstate profitability in any future margin rollup.
-- Rows with NULL unit_price_cents are deliberately left NULL/NULL (unknown).

UPDATE public.project_ffe_items
   SET trade_price_cents = GREATEST(unit_price_cents, 0),
       markup_percent    = 0
 WHERE trade_price_cents IS NULL
   AND unit_price_cents IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. activate_proposal_as_project — dual-pricing repair
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Body is the live 00180 revision VERBATIM (boards carry on top of the
-- 00167 created_by fix on top of the 00140/00141 richer-carry rewrite),
-- except the two project_ffe_items INSERT blocks now map:
--   unit_price_cents  := v_item.unit_sell_price  (was v_item.unit_price — BUG)
--   trade_price_cents := v_item.unit_price       (new)
--   markup_percent    := v_item.markup_percent   (new)
-- line_total_cents is unchanged (was already the client total).
-- CREATE OR REPLACE preserves the function's existing ACLs.

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

      -- 00185: unit_price_cents = CLIENT price (unit_sell_price); the trade
      -- price + markup carry alongside. line_total_cents was already the
      -- client total.
      -- Clamp trade/markup to >= 0: mirrors the tier-a backfill GREATEST
      -- guards; negative values (writable via direct PostgREST, propagated by
      -- clone_proposal) would violate the new CHECKs and block activation of
      -- an accepted proposal. Supporting negative markup requires deliberately
      -- relaxing those CHECKs in a later migration.
      INSERT INTO project_ffe_items (
        project_id, project_room_id, source_proposal_item_id,
        product_id, name, ffe_category, item_type,
        status, quantity, unit_price_cents, trade_price_cents, markup_percent,
        line_total_cents,
        budget_min_cents, budget_max_cents,
        vendor_name, eta, notes, sort_order
      ) VALUES (
        v_project_id, v_new_room_id, v_item.id,
        v_item.product_id, v_item.name, v_item.ffe_category, v_item.item_type,
        'specified',
        v_item.quantity,
        v_item.unit_sell_price,
        GREATEST(COALESCE(v_item.unit_price, 0), 0),
        GREATEST(COALESCE(v_item.markup_percent, 0), 0),
        v_item.line_total_cents,
        v_item.budget_min_cents, v_item.budget_max_cents,
        v_item.vendor_name, v_item_eta,
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

    -- 00185: same dual-pricing mapping as the room loop above.
    -- Clamp trade/markup to >= 0: mirrors the tier-a backfill GREATEST
    -- guards; negative values (writable via direct PostgREST, propagated by
    -- clone_proposal) would violate the new CHECKs and block activation of
    -- an accepted proposal. Supporting negative markup requires deliberately
    -- relaxing those CHECKs in a later migration.
    INSERT INTO project_ffe_items (
      project_id, project_room_id, source_proposal_item_id,
      product_id, name, ffe_category, item_type,
      status, quantity, unit_price_cents, trade_price_cents, markup_percent,
      line_total_cents,
      budget_min_cents, budget_max_cents,
      vendor_name, eta, notes, sort_order
    ) VALUES (
      v_project_id, NULL, v_item.id,
      v_item.product_id, v_item.name, v_item.ffe_category, v_item.item_type,
      'specified',
      v_item.quantity,
      v_item.unit_sell_price,
      GREATEST(COALESCE(v_item.unit_price, 0), 0),
      GREATEST(COALESCE(v_item.markup_percent, 0), 0),
      v_item.line_total_cents,
      v_item.budget_min_cents, v_item.budget_max_cents,
      v_item.vendor_name, v_item_eta,
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. apply_decision — dual pricing on the FF&E feed-through (step 4)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Body is the live 00175 revision verbatim except:
--   • two new DECLAREs (v_trade_price, v_markup),
--   • step 4 resolves the trade price from products.price_trade for the
--     winning option's product; when the product has no trade price, falls
--     back to the option's (client) price with markup 0 — the same
--     conservative zero-margin assumption as the tier-c backfill,
--   • the step-4 UPDATE and INSERT both write trade_price_cents +
--     markup_percent.
-- Idempotency semantics (source_decision_id UNIQUE; UPDATE-then-INSERT) and
-- grants are unchanged.

CREATE OR REPLACE FUNCTION apply_decision(
  p_decision_id UUID,
  p_selected_option_id UUID,
  p_selected_by UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision RECORD;
  v_option   RECORD;
  v_room_id  UUID;
  v_trade_price INTEGER;
  v_markup      NUMERIC(5,2);
BEGIN
  SELECT * INTO v_decision
  FROM client_decisions
  WHERE id = p_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision % not found', p_decision_id;
  END IF;

  IF v_decision.status NOT IN ('pending', 'open', 'draft') THEN
    RAISE EXCEPTION 'Decision % already in status %', p_decision_id, v_decision.status;
  END IF;

  SELECT * INTO v_option
  FROM client_decision_options
  WHERE id = p_selected_option_id AND decision_id = p_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Option % does not belong to decision %', p_selected_option_id, p_decision_id;
  END IF;

  -- 1. Mark decision responded
  UPDATE client_decisions
  SET status = 'responded',
      responded_at = NOW(),
      selected_by = COALESCE(p_selected_by, auth.uid()),
      updated_at = NOW()
  WHERE id = p_decision_id;

  -- 2. Mark the chosen option as selected (others as not)
  UPDATE client_decision_options
  SET selected = (id = p_selected_option_id)
  WHERE decision_id = p_decision_id;

  -- 3. Clear blocked status on FF&E items that referenced this decision
  UPDATE project_ffe_items
  SET blocked = false,
      blocked_reason = NULL,
      blocked_by_decision_id = NULL,
      last_status_change_at = NOW(),
      updated_at = NOW()
  WHERE blocked_by_decision_id = p_decision_id
    AND project_id = v_decision.project_id;

  -- 4. Feed the winning product onto the project's FF&E schedule.
  --    Net-new (non-blocking) product decisions only; blocking decisions gate
  --    existing items and must not spawn a duplicate line. The blocking_status
  --    gate is stable across re-applies, so this never duplicates on reopen.
  IF v_decision.project_id IS NOT NULL
     AND v_option.product_id IS NOT NULL
     AND v_decision.blocking_status = 'non_blocking' THEN

    -- Drop the room link if it doesn't belong to this project (latent 00172
    -- room_id has no cross-project constraint).
    v_room_id := (
      SELECT id FROM project_rooms
      WHERE id = v_decision.room_id AND project_id = v_decision.project_id
    );

    -- Dual pricing (00185): the option's price is the CLIENT price. The
    -- trade side comes from the product's catalog trade price when present
    -- (with the advisory markup derived from client/trade, clamped to the
    -- NUMERIC(5,2) ceiling and the >= 0 CHECK); otherwise fall back to the
    -- client price with markup 0 — the conservative zero-margin assumption
    -- used by the 00185 tier-c backfill.
    SELECT p.price_trade INTO v_trade_price
    FROM products p
    WHERE p.id = v_option.product_id;

    IF v_trade_price IS NULL OR v_trade_price < 0 THEN
      v_trade_price := GREATEST(COALESCE(v_option.price, 0), 0);
      v_markup      := 0;
    ELSIF v_trade_price > 0 AND COALESCE(v_option.price, 0) > v_trade_price THEN
      v_markup := LEAST(
        ROUND(((COALESCE(v_option.price, 0)::numeric / v_trade_price) - 1) * 100, 2),
        999.99
      );
    ELSE
      v_markup := 0;
    END IF;

    -- Re-apply: update the single line we previously created for this decision.
    UPDATE project_ffe_items
    SET product_id        = v_option.product_id,
        name              = v_option.name,
        project_room_id   = v_room_id,
        quantity          = COALESCE(v_option.quantity, 1),
        unit_price_cents  = COALESCE(v_option.price, 0),
        trade_price_cents = v_trade_price,
        markup_percent    = v_markup,
        line_total_cents  = COALESCE(v_option.price, 0) * COALESCE(v_option.quantity, 1),
        updated_at        = NOW()
    WHERE source_decision_id = p_decision_id;

    -- First resolution: create the line.
    IF NOT FOUND THEN
      INSERT INTO project_ffe_items (
        project_id, project_room_id, product_id, source_decision_id,
        name, item_type, status, quantity,
        unit_price_cents, trade_price_cents, markup_percent, line_total_cents
      ) VALUES (
        v_decision.project_id,
        v_room_id,
        v_option.product_id,
        p_decision_id,
        v_option.name,
        'fixed',
        'specified',
        COALESCE(v_option.quantity, 1),
        COALESCE(v_option.price, 0),
        v_trade_price,
        v_markup,
        COALESCE(v_option.price, 0) * COALESCE(v_option.quantity, 1)
      );
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION apply_decision(UUID, UUID, UUID) TO authenticated;

COMMENT ON FUNCTION apply_decision(UUID, UUID, UUID) IS
  'Resolves a decision: marks it responded, selects the chosen option, clears '
  'blocked_by_decision_id on gated FF&E items, AND (00175) feeds a winning '
  'product-linked option from a NON-blocking decision onto the project FF&E '
  'schedule — idempotent per decision via source_decision_id (UNIQUE), skipped '
  'for blocking decisions. Does not mutate project budget columns. 00185: the '
  'fed-through line carries dual pricing — trade_price_cents from '
  'products.price_trade (markup derived) or the client price with markup 0 '
  'when no trade price exists.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. purchase_orders.total_cents — document the upcoming 00186 semantic flip
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN public.purchase_orders.total_cents IS
  'PO total in cents. SEMANTIC FLIP AT 00186: rows created before 00186 (UI '
  'summed project_ffe_items.unit_price_cents = client prices) hold '
  'CLIENT-price totals; rows created from 00186 on (create_purchase_order '
  'RPC) hold vendor-facing TRADE totals (trade_price_cents). Comment-only '
  'marker added in 00185.';
