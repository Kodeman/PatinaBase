-- ═══════════════════════════════════════════════════════════════════════════
-- 00390 — Immutable proposal copies after issue
--
-- A proposal is an editable workspace only while status='draft'. Once sent,
-- every client-visible authored row becomes an immutable edition; lifecycle,
-- engagement, feedback, nudges, and project activation continue through their
-- own authorities. Child writers lock the proposal parent before changing a
-- row, so a send and a stale editor tab have one deterministic winner.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Product provenance belongs to the proposal edition ────────────────────

ALTER TABLE public.proposal_items
  ADD COLUMN IF NOT EXISTS client_product_snapshot jsonb NOT NULL
  DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.proposal_items.client_product_snapshot IS
  'Proposal-owned product provenance captured when product_id is associated. '
  'Client/share renders use this snapshot, never mutable catalog fields.';

-- The one-time backfill sees one stable catalog state. ALTER TABLE already
-- excludes concurrent proposal-item writes; these locks also exclude product
-- and teaching edits while every historical draft/issued item is snapshotted.
LOCK TABLE public.products IN SHARE MODE;
LOCK TABLE public.product_styles IN SHARE MODE;

UPDATE public.proposal_items AS item
SET client_product_snapshot = COALESCE((
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'product_id', product.id,
    'name', product.name,
    'images', product.images,
    'brand', product.brand,
    'source_url', product.source_url,
    'dimensions', product.dimensions,
    'materials', product.materials,
    'price_retail', product.price_retail,
    'has_teaching', EXISTS (
      SELECT 1
      FROM public.product_styles AS teaching
      WHERE teaching.product_id = product.id
    )
  ))
  FROM public.products AS product
  WHERE product.id = item.product_id
), '{}'::jsonb)
WHERE item.product_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_proposal_item_product_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_snapshot jsonb;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.product_id IS NOT DISTINCT FROM OLD.product_id
  THEN
    IF NEW.client_product_snapshot IS DISTINCT FROM OLD.client_product_snapshot THEN
      RAISE EXCEPTION 'client product snapshots are system-managed'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.product_id IS NULL THEN
    -- ON DELETE SET NULL is an operational catalog detach. Preserve the
    -- already-issued product copy rather than freezing catalog deletion or
    -- erasing provenance. A direct draft edit runs at trigger depth 1 and
    -- intentionally clears the snapshot.
    IF TG_OP = 'UPDATE'
       AND OLD.product_id IS NOT NULL
       AND pg_trigger_depth() > 1
    THEN
      NEW.client_product_snapshot := OLD.client_product_snapshot;
    ELSE
      NEW.client_product_snapshot := '{}'::jsonb;
    END IF;
    RETURN NEW;
  END IF;

  -- SECURITY DEFINER is required to read the immutable catalog copy even when
  -- the product is later hidden/deleted, but it must not become an oracle for
  -- attacker-chosen private product UUIDs. End-user calls must satisfy the
  -- same three-layer visibility law as products RLS; no-JWT postgres/service
  -- maintenance remains the narrow trusted path.
  IF auth.uid() IS NULL
     AND session_user IS DISTINCT FROM 'postgres'
     AND auth.role() IS DISTINCT FROM 'service_role'
  THEN
    RAISE EXCEPTION 'proposal item product snapshots require an authenticated or trusted caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.products AS visible_product
    WHERE visible_product.id = NEW.product_id
      AND (
        visible_product.layer = 'catalog'
        OR (
          visible_product.layer = 'personal'
          AND visible_product.owner_user_id = auth.uid()
        )
        OR (
          visible_product.layer = 'studio'
          AND EXISTS (
            SELECT 1
            FROM public.organization_members AS membership
            WHERE membership.organization_id = visible_product.studio_id
              AND membership.user_id = auth.uid()
              AND membership.status = 'active'
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'proposal item product % is not visible to the caller',
      NEW.product_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Hold product fields against concurrent UPDATE/DELETE until the proposal
  -- item statement commits. Teaching membership is deliberately sampled from
  -- this statement's MVCC snapshot: the association-time copy is the edition,
  -- and later catalog/style edits never flow into draft review or issued copy.
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'product_id', product.id,
    'name', product.name,
    'images', product.images,
    'brand', product.brand,
    'source_url', product.source_url,
    'dimensions', product.dimensions,
    'materials', product.materials,
    'price_retail', product.price_retail,
    'has_teaching', EXISTS (
      SELECT 1
      FROM public.product_styles AS teaching
      WHERE teaching.product_id = product.id
    )
  ))
  INTO v_snapshot
  FROM public.products AS product
  WHERE product.id = NEW.product_id
  FOR SHARE;

  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'proposal item product % does not exist', NEW.product_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  NEW.client_product_snapshot := v_snapshot;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_proposal_item_product_snapshot()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS a_set_proposal_item_product_snapshot_trg
  ON public.proposal_items;
CREATE TRIGGER a_set_proposal_item_product_snapshot_trg
BEFORE INSERT OR UPDATE OF product_id, client_product_snapshot
ON public.proposal_items
FOR EACH ROW
EXECUTE FUNCTION public.set_proposal_item_product_snapshot();

-- ── Exact reviewed-copy fingerprint ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._proposal_review_fingerprint(
  p_proposal_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT md5(jsonb_build_object(
    'proposal', COALESCE((
      SELECT jsonb_build_array(
        proposal.id, proposal.designer_id, proposal.client_id,
        proposal.designer_client_id, proposal.title, proposal.description,
        proposal.project_address, proposal.cover_image, proposal.subtotal,
        proposal.discount_amount, proposal.discount_percent,
        proposal.tax_rate, proposal.tax_amount, proposal.total_amount,
        proposal.deposit_percent, proposal.payment_terms,
        proposal.payment_notes, proposal.valid_until, proposal.version,
        proposal.parent_proposal_id, proposal.template_id,
        proposal.revision_summary, proposal.personal_message,
        proposal.cc_email, proposal.client_visibility_tier,
        proposal.feedback_enabled, proposal.created_at
      )
      FROM public.proposals AS proposal
      WHERE proposal.id = p_proposal_id
    ), 'null'::jsonb),
    'sections', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        section.id, section.type, section.title, section.body,
        section.metadata, section.sort_order
      ) ORDER BY section.sort_order, section.id)
      FROM public.proposal_sections AS section
      WHERE section.proposal_id = p_proposal_id
    ), '[]'::jsonb),
    'scope_rooms', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        room.id, room.room_id, room.name, room.room_type, room.dimensions,
        room.floor_area_sqft, room.budget_cents, room.ffe_categories,
        room.notes, room.sort_order
      ) ORDER BY room.sort_order, room.id)
      FROM public.proposal_scope_rooms AS room
      WHERE room.proposal_id = p_proposal_id
    ), '[]'::jsonb),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        item.id, item.product_id, item.name, item.description, item.image_url, item.room,
        item.category, item.quantity, item.unit_price, item.line_total_cents,
        item.unit_sell_price, item.markup_percent, item.vendor_id,
        item.vendor_name, item.lead_time_weeks, item.notes,
        item.internal_notes, item.position,
        item.item_type, item.scope_room_id, item.budget_min_cents,
        item.budget_max_cents, item.ffe_category, item.doc_code,
        item.custom_fields, item.client_product_snapshot
      ) ORDER BY item.position, item.id)
      FROM public.proposal_items AS item
      WHERE item.proposal_id = p_proposal_id
    ), '[]'::jsonb),
    'palettes', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        palette.id, palette.name, palette.scope_room_id, palette.is_primary,
        palette.source_image_url, palette.notes, palette.sort_order
      ) ORDER BY palette.sort_order, palette.id)
      FROM public.proposal_palettes AS palette
      WHERE palette.proposal_id = p_proposal_id
    ), '[]'::jsonb),
    'palette_swatches', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        swatch.id, swatch.palette_id, swatch.hex, swatch.name, swatch.role,
        swatch.paint_color_id, swatch.brand, swatch.brand_code,
        swatch.source_pixel, swatch.sort_order
      ) ORDER BY palette.sort_order, palette.id, swatch.sort_order, swatch.id)
      FROM public.palette_swatches AS swatch
      JOIN public.proposal_palettes AS palette ON palette.id = swatch.palette_id
      WHERE palette.proposal_id = p_proposal_id
    ), '[]'::jsonb),
    'boards', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        board.id, board.name, board.scope_room_id, board.cover_image_url,
        board.canvas_width, board.canvas_height, board.background_color,
        board.sort_order, board.sections, board.status
      ) ORDER BY board.sort_order, board.id)
      FROM public.proposal_boards AS board
      WHERE board.proposal_id = p_proposal_id
    ), '[]'::jsonb),
    'board_items', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        board_item.id, board_item.board_id, board_item.type, board_item.x,
        board_item.y, board_item.width, board_item.height, board_item.z_index,
        board_item.rotation, board_item.locked, board_item.product_id,
        board_item.capture_id, board_item.palette_id, board_item.image_url,
        board_item.content, board_item.data
      ) ORDER BY board.sort_order, board.id, board_item.z_index, board_item.id)
      FROM public.proposal_board_items AS board_item
      JOIN public.proposal_boards AS board ON board.id = board_item.board_id
      WHERE board.proposal_id = p_proposal_id
    ), '[]'::jsonb),
    'phases', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        phase.id, phase.name, phase.phase_key, phase.duration_weeks,
        phase.fee_cents, phase.revision_limit, phase.gate_condition,
        phase.deliverables, phase.sort_order, phase.duration_days,
        phase.follows_phase_id, phase.anchor_date, phase.lane
      ) ORDER BY phase.sort_order, phase.id)
      FROM public.proposal_phases AS phase
      WHERE phase.proposal_id = p_proposal_id
    ), '[]'::jsonb),
    'phase_deliverables', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        deliverable.id, deliverable.phase_id, deliverable.label,
        deliverable.description, deliverable.is_required,
        deliverable.completed_at, deliverable.completed_by,
        deliverable.sort_order
      ) ORDER BY phase.sort_order, phase.id, deliverable.sort_order, deliverable.id)
      FROM public.proposal_phase_deliverables AS deliverable
      JOIN public.proposal_phases AS phase ON phase.id = deliverable.phase_id
      WHERE phase.proposal_id = p_proposal_id
    ), '[]'::jsonb),
    'phase_gates', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        gate.id, gate.phase_id, gate.gate_kind, gate.payload,
        gate.satisfied_at, gate.satisfied_by, gate.override_reason,
        gate.sort_order
      ) ORDER BY phase.sort_order, phase.id, gate.sort_order, gate.id)
      FROM public.proposal_phase_gates AS gate
      JOIN public.proposal_phases AS phase ON phase.id = gate.phase_id
      WHERE phase.proposal_id = p_proposal_id
    ), '[]'::jsonb),
    'schedule_milestones', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        milestone.id, milestone.phase_id, milestone.name, milestone.kind,
        milestone.anchor_date, milestone.sort_order
      ) ORDER BY phase.sort_order, phase.id, milestone.sort_order, milestone.id)
      FROM public.proposal_schedule_milestones AS milestone
      JOIN public.proposal_phases AS phase ON phase.id = milestone.phase_id
      WHERE phase.proposal_id = p_proposal_id
    ), '[]'::jsonb),
    'exclusions', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        exclusion.id, exclusion.description, exclusion.category,
        exclusion.sort_order
      ) ORDER BY exclusion.sort_order, exclusion.id)
      FROM public.proposal_exclusions AS exclusion
      WHERE exclusion.proposal_id = p_proposal_id
    ), '[]'::jsonb),
    'change_order_terms', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        terms.id, terms.process_description, terms.hourly_rate_cents,
        terms.minimum_fee_cents, terms.approval_required
      ) ORDER BY terms.id)
      FROM public.proposal_change_order_terms AS terms
      WHERE terms.proposal_id = p_proposal_id
    ), '[]'::jsonb),
    'payment_milestones', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        milestone.id, milestone.phase_id, milestone.label,
        milestone.percentage, milestone.trigger_condition,
        milestone.sort_order
      ) ORDER BY milestone.sort_order, milestone.id)
      FROM public.proposal_payment_milestones AS milestone
      WHERE milestone.proposal_id = p_proposal_id
    ), '[]'::jsonb),
    'team_members', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        member.id, member.user_id, member.role, member.permissions,
        member.sort_order, member.created_at
      ) ORDER BY member.sort_order, member.created_at, member.id)
      FROM public.proposal_team_members AS member
      WHERE member.proposal_id = p_proposal_id
    ), '[]'::jsonb),
    'spec_field_defs', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        definition.id, definition.field_key, definition.name,
        definition.kind, definition.sort_order
      ) ORDER BY definition.sort_order, definition.id)
      FROM public.spec_field_defs AS definition
      WHERE definition.proposal_id = p_proposal_id
    ), '[]'::jsonb)
  )::text);
$$;

REVOKE ALL ON FUNCTION public._proposal_review_fingerprint(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._proposal_review_fingerprint(uuid) IS
  'Canonical authored client-copy token: proposal payload, narrative sections, '
  'scope/items with product snapshots, palettes/swatches, boards/items, phases, '
  'phase details/schedule, exclusions, terms, payment schedule, team, and spec '
  'definitions. Operational lifecycle/engagement fields and derived payment '
  'amount_cents are intentionally excluded.';

COMMENT ON FUNCTION public.get_proposal_send_snapshot(uuid) IS
  'Explicitly studio-authorized reviewed-copy token covering the proposal '
  'payload and every proposal-owned row rendered into the client edition.';

-- ── Parent-lock protocol for every proposal-owned authored child ───────────

CREATE OR REPLACE FUNCTION public.guard_proposal_child_draft_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE NULL END;
  v_new jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE NULL END;
  v_parent_ids uuid[] := ARRAY[]::uuid[];
  v_parent record;
  v_system_detach boolean := false;
BEGIN
  IF TG_TABLE_NAME = 'proposal_board_items' THEN
    SELECT COALESCE(array_agg(DISTINCT board.proposal_id ORDER BY board.proposal_id), ARRAY[]::uuid[])
    INTO v_parent_ids
    FROM public.proposal_boards AS board
    WHERE board.proposal_id IS NOT NULL
      AND board.id IN (
        CASE WHEN TG_OP <> 'INSERT' THEN (v_old->>'board_id')::uuid END,
        CASE WHEN TG_OP <> 'DELETE' THEN (v_new->>'board_id')::uuid END
      );
  ELSIF TG_TABLE_NAME = 'palette_swatches' THEN
    SELECT COALESCE(array_agg(DISTINCT palette.proposal_id ORDER BY palette.proposal_id), ARRAY[]::uuid[])
    INTO v_parent_ids
    FROM public.proposal_palettes AS palette
    WHERE palette.id IN (
      CASE WHEN TG_OP <> 'INSERT' THEN (v_old->>'palette_id')::uuid END,
      CASE WHEN TG_OP <> 'DELETE' THEN (v_new->>'palette_id')::uuid END
    );
  ELSIF TG_TABLE_NAME IN (
    'proposal_phase_deliverables',
    'proposal_phase_gates',
    'proposal_schedule_milestones'
  ) THEN
    SELECT COALESCE(array_agg(DISTINCT phase.proposal_id ORDER BY phase.proposal_id), ARRAY[]::uuid[])
    INTO v_parent_ids
    FROM public.proposal_phases AS phase
    WHERE phase.id IN (
      CASE WHEN TG_OP <> 'INSERT' THEN (v_old->>'phase_id')::uuid END,
      CASE WHEN TG_OP <> 'DELETE' THEN (v_new->>'phase_id')::uuid END
    );
  ELSE
    SELECT COALESCE(array_agg(DISTINCT value::uuid ORDER BY value::uuid), ARRAY[]::uuid[])
    INTO v_parent_ids
    FROM unnest(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN v_old->>'proposal_id' END,
      CASE WHEN TG_OP <> 'DELETE' THEN v_new->>'proposal_id' END
    ]) AS candidate(value)
    WHERE value IS NOT NULL;
  END IF;

  -- External catalog/source rows use ON DELETE SET NULL. Let the FK trigger
  -- detach only that live pointer after issue while retaining the proposal's
  -- copied display fields/data. Trigger depth makes these exceptions
  -- unavailable to a direct browser UPDATE that merely imitates a detach.
  IF TG_OP = 'UPDATE' AND pg_trigger_depth() > 1 THEN
    v_system_detach :=
      (
        TG_TABLE_NAME = 'proposal_items'
        AND v_old->>'product_id' IS NOT NULL
        AND v_new->>'product_id' IS NULL
        AND v_new->'client_product_snapshot'
            IS NOT DISTINCT FROM v_old->'client_product_snapshot'
        AND (v_new - ARRAY['product_id', 'updated_at'])
            = (v_old - ARRAY['product_id', 'updated_at'])
      )
      OR (
        TG_TABLE_NAME = 'proposal_items'
        AND v_old->>'vendor_id' IS NOT NULL
        AND v_new->>'vendor_id' IS NULL
        AND (v_new - ARRAY['vendor_id', 'updated_at'])
            = (v_old - ARRAY['vendor_id', 'updated_at'])
      )
      OR (
        TG_TABLE_NAME = 'proposal_board_items'
        AND v_old->>'product_id' IS NOT NULL
        AND v_new->>'product_id' IS NULL
        AND (v_new - ARRAY['product_id', 'updated_at'])
            = (v_old - ARRAY['product_id', 'updated_at'])
      )
      OR (
        TG_TABLE_NAME = 'proposal_board_items'
        AND v_old->>'capture_id' IS NOT NULL
        AND v_new->>'capture_id' IS NULL
        AND (v_new - ARRAY['capture_id', 'updated_at'])
            = (v_old - ARRAY['capture_id', 'updated_at'])
      )
      OR (
        TG_TABLE_NAME = 'palette_swatches'
        AND v_old->>'paint_color_id' IS NOT NULL
        AND v_new->>'paint_color_id' IS NULL
        AND (v_new - 'paint_color_id') = (v_old - 'paint_color_id')
      )
      OR (
        TG_TABLE_NAME = 'proposal_scope_rooms'
        AND v_old->>'room_id' IS NOT NULL
        AND v_new->>'room_id' IS NULL
        AND (v_new - ARRAY['room_id', 'updated_at'])
            = (v_old - ARRAY['room_id', 'updated_at'])
      );
  END IF;

  -- One ordered SELECT locks old and new owners without deadlocking moves.
  FOR v_parent IN
    SELECT proposal.id, proposal.status
    FROM public.proposals AS proposal
    WHERE proposal.id = ANY(v_parent_ids)
    ORDER BY proposal.id
    FOR UPDATE
  LOOP
    IF v_parent.status <> 'draft' AND NOT v_system_detach THEN
      RAISE EXCEPTION
        'proposal % is %, so its authored copy is immutable',
        v_parent.id, v_parent.status
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_proposal_child_draft_only()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.guard_proposal_child_draft_only() IS
  'Locks every old/new proposal parent before child DML and permits it only '
  'while draft. This linearizes stale-tab writes against send_proposal. Project '
  'boards are outside this proposal-edition boundary.';

DROP TRIGGER IF EXISTS z_guard_proposal_copy_draft_only_trg ON public.proposal_items;
CREATE TRIGGER z_guard_proposal_copy_draft_only_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_items
FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_child_draft_only();

DROP TRIGGER IF EXISTS z_guard_proposal_copy_draft_only_trg ON public.proposal_sections;
CREATE TRIGGER z_guard_proposal_copy_draft_only_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_sections
FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_child_draft_only();

DROP TRIGGER IF EXISTS z_guard_proposal_copy_draft_only_trg ON public.proposal_scope_rooms;
CREATE TRIGGER z_guard_proposal_copy_draft_only_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_scope_rooms
FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_child_draft_only();

DROP TRIGGER IF EXISTS z_guard_proposal_copy_draft_only_trg ON public.proposal_phases;
CREATE TRIGGER z_guard_proposal_copy_draft_only_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_phases
FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_child_draft_only();

DROP TRIGGER IF EXISTS z_guard_proposal_copy_draft_only_trg ON public.proposal_phase_deliverables;
CREATE TRIGGER z_guard_proposal_copy_draft_only_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_phase_deliverables
FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_child_draft_only();

DROP TRIGGER IF EXISTS z_guard_proposal_copy_draft_only_trg ON public.proposal_phase_gates;
CREATE TRIGGER z_guard_proposal_copy_draft_only_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_phase_gates
FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_child_draft_only();

DROP TRIGGER IF EXISTS z_guard_proposal_copy_draft_only_trg ON public.proposal_schedule_milestones;
CREATE TRIGGER z_guard_proposal_copy_draft_only_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_schedule_milestones
FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_child_draft_only();

DROP TRIGGER IF EXISTS z_guard_proposal_copy_draft_only_trg ON public.proposal_exclusions;
CREATE TRIGGER z_guard_proposal_copy_draft_only_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_exclusions
FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_child_draft_only();

DROP TRIGGER IF EXISTS z_guard_proposal_copy_draft_only_trg ON public.proposal_payment_milestones;
CREATE TRIGGER z_guard_proposal_copy_draft_only_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_payment_milestones
FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_child_draft_only();

DROP TRIGGER IF EXISTS z_guard_proposal_copy_draft_only_trg ON public.proposal_change_order_terms;
CREATE TRIGGER z_guard_proposal_copy_draft_only_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_change_order_terms
FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_child_draft_only();

DROP TRIGGER IF EXISTS z_guard_proposal_copy_draft_only_trg ON public.proposal_palettes;
CREATE TRIGGER z_guard_proposal_copy_draft_only_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_palettes
FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_child_draft_only();

DROP TRIGGER IF EXISTS z_guard_proposal_copy_draft_only_trg ON public.palette_swatches;
CREATE TRIGGER z_guard_proposal_copy_draft_only_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.palette_swatches
FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_child_draft_only();

DROP TRIGGER IF EXISTS z_guard_proposal_copy_draft_only_trg ON public.proposal_boards;
CREATE TRIGGER z_guard_proposal_copy_draft_only_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_boards
FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_child_draft_only();

DROP TRIGGER IF EXISTS z_guard_proposal_copy_draft_only_trg ON public.proposal_board_items;
CREATE TRIGGER z_guard_proposal_copy_draft_only_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_board_items
FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_child_draft_only();

DROP TRIGGER IF EXISTS z_guard_proposal_copy_draft_only_trg ON public.proposal_team_members;
CREATE TRIGGER z_guard_proposal_copy_draft_only_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_team_members
FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_child_draft_only();

DROP TRIGGER IF EXISTS z_guard_proposal_copy_draft_only_trg ON public.spec_field_defs;
CREATE TRIGGER z_guard_proposal_copy_draft_only_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.spec_field_defs
FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_child_draft_only();

-- ── Client lifecycle RPC return boundaries ────────────────────────────────

-- RLS can hide the proposal row, but a SECURITY DEFINER function returning
-- public.proposals serializes every parent column through PostgREST. Keep the
-- already-audited mutation authorities private and expose only explicit,
-- forward-compatible lifecycle receipts to client callers.
ALTER FUNCTION public.mark_proposal_viewed(uuid)
  RENAME TO _mark_proposal_viewed_impl;
ALTER FUNCTION public.decline_proposal(uuid, text)
  RENAME TO _decline_proposal_impl;

REVOKE ALL ON FUNCTION public._mark_proposal_viewed_impl(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._decline_proposal_impl(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.mark_proposal_viewed(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals;
BEGIN
  v_proposal := public._mark_proposal_viewed_impl(p_proposal_id);
  RETURN jsonb_build_object(
    'id', v_proposal.id,
    'status', v_proposal.status,
    'viewed_at', v_proposal.viewed_at
  );
END;
$$;

CREATE FUNCTION public.decline_proposal(
  p_proposal_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals;
BEGIN
  v_proposal := public._decline_proposal_impl(p_proposal_id, p_reason);
  RETURN jsonb_build_object(
    'id', v_proposal.id,
    'status', v_proposal.status,
    'declined_at', v_proposal.declined_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_proposal_viewed(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.mark_proposal_viewed(uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public.decline_proposal(uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.decline_proposal(uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.mark_proposal_viewed(uuid) IS
  'Client-owned sent→viewed authority returning only id, status, and viewed_at.';
COMMENT ON FUNCTION public.decline_proposal(uuid, text) IS
  'Client-owned sent/viewed→declined authority returning only id, status, and declined_at.';

-- The historical feedback routing helper is SECURITY DEFINER and returns the
-- proposal/client/designer identity tuple for any known proposal-item or board
-- anchor. Those anchor UUIDs are intentionally present in the client DTO, so
-- direct EXECUTE would bypass its identity allowlist. Keep the full record
-- private for trusted feedback operations and give RLS only boolean predicates.
ALTER FUNCTION public.item_feedback_gate(uuid, uuid, uuid)
  RENAME TO _item_feedback_gate_impl;

REVOKE ALL ON FUNCTION public._item_feedback_gate_impl(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Existing SECURITY DEFINER feedback operations resolve this name at runtime.
-- The invoker-only relay is executable by its postgres owner, never an API role.
CREATE FUNCTION public.item_feedback_gate(
  p_proposal_item_id uuid,
  p_ffe_item_id uuid,
  p_board_item_id uuid
)
RETURNS TABLE (
  proposal_id uuid,
  client_id uuid,
  designer_id uuid,
  status text,
  feedback_enabled boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT *
  FROM public._item_feedback_gate_impl(
    p_proposal_item_id,
    p_ffe_item_id,
    p_board_item_id
  )
$$;

REVOKE ALL ON FUNCTION public.item_feedback_gate(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.can_access_item_feedback_anchor(
  p_proposal_item_id uuid,
  p_ffe_item_id uuid,
  p_board_item_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public._item_feedback_gate_impl(
         p_proposal_item_id,
         p_ffe_item_id,
         p_board_item_id
       ) AS gate
       WHERE gate.client_id = auth.uid()
          OR gate.designer_id = auth.uid()
     )
$$;

CREATE FUNCTION public.can_submit_item_feedback_anchor(
  p_proposal_item_id uuid,
  p_ffe_item_id uuid,
  p_board_item_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public._item_feedback_gate_impl(
         p_proposal_item_id,
         p_ffe_item_id,
         p_board_item_id
       ) AS gate
       WHERE gate.client_id = auth.uid()
         AND gate.status IN ('sent', 'viewed', 'accepted', 'declined', 'expired')
         AND gate.feedback_enabled
     )
$$;

REVOKE ALL ON FUNCTION public.can_access_item_feedback_anchor(uuid, uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_item_feedback_anchor(uuid, uuid, uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public.can_submit_item_feedback_anchor(uuid, uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.can_submit_item_feedback_anchor(uuid, uuid, uuid)
  TO authenticated;

DROP POLICY IF EXISTS item_feedback_client_insert ON public.item_feedback;
CREATE POLICY item_feedback_client_insert
  ON public.item_feedback FOR INSERT
  TO authenticated
  WITH CHECK (
    client_id = auth.uid()
    AND public.can_submit_item_feedback_anchor(
      proposal_item_id, ffe_item_id, board_item_id
    )
  );

DROP POLICY IF EXISTS item_feedback_designer_select ON public.item_feedback;
CREATE POLICY item_feedback_designer_select
  ON public.item_feedback FOR SELECT
  TO authenticated
  USING (
    public.can_access_item_feedback_anchor(
      proposal_item_id, ffe_item_id, board_item_id
    )
  );

DROP POLICY IF EXISTS item_feedback_events_select ON public.item_feedback_events;
CREATE POLICY item_feedback_events_select
  ON public.item_feedback_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.item_feedback AS feedback
      WHERE feedback.id = item_feedback_events.feedback_id
        AND public.can_access_item_feedback_anchor(
          feedback.proposal_item_id,
          feedback.ffe_item_id,
          feedback.board_item_id
        )
    )
  );

-- Notification dispatch is trigger-internal; proposal nudge/change RPCs retain
-- authenticated access but no ambient PUBLIC/anon/service-role execution.
REVOKE ALL ON FUNCTION public.notify_item_feedback(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.nudge_proposal(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.nudge_proposal(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.request_proposal_change(uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.request_proposal_change(uuid, text)
  TO authenticated;

-- ── Canonical proposal → project linkage authority ────────────────────────

-- Keep the long-lived activation implementation byte-for-byte intact, but
-- make it private. The public RPC wrapper supplies a row-scoped authority
-- token only for the duration of that implementation's transaction.
ALTER FUNCTION public.activate_proposal_as_project(uuid, date)
  RENAME TO _activate_proposal_as_project_impl;

REVOKE ALL ON FUNCTION public._activate_proposal_as_project_impl(uuid, date)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public._activate_proposal_as_project_authorized(
  p_proposal_id uuid,
  p_start_date date DEFAULT current_date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous_authority text := current_setting(
    'app.proposal_activation_id', true
  );
  v_project_id uuid;
BEGIN
  PERFORM set_config(
    'app.proposal_activation_id', p_proposal_id::text, true
  );

  v_project_id := public._activate_proposal_as_project_impl(
    p_proposal_id,
    p_start_date
  );

  PERFORM set_config(
    'app.proposal_activation_id', COALESCE(v_previous_authority, ''), true
  );
  RETURN v_project_id;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.proposal_activation_id', COALESCE(v_previous_authority, ''), true
  );
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public._activate_proposal_as_project_authorized(uuid, date)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.activate_proposal_as_project(
  p_proposal_id uuid,
  p_start_date date DEFAULT current_date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_designer_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'activate_proposal_as_project requires an authenticated studio author'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Authorization and activation share this row lock. No caller can swap the
  -- proposal owner/status/link after the check but before the private bridge.
  SELECT proposal.designer_id
  INTO v_designer_id
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_designer_id) THEN
    RAISE EXCEPTION
      'activate_proposal_as_project: proposal % not found or access denied',
      p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN public._activate_proposal_as_project_authorized(
    p_proposal_id,
    p_start_date
  );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_proposal_as_project(uuid, date)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.activate_proposal_as_project(uuid, date)
  TO authenticated;

COMMENT ON FUNCTION public.activate_proposal_as_project(uuid, date) IS
  'Canonical studio-author activation wrapper. Locks and authorizes the exact '
  'designer or active design-studio co-member before the private bridge sets '
  'app.proposal_activation_id. Clients activate only inside sign_proposal.';

-- The client signature path has already locked the proposal, proved exact
-- client ownership, and performed the canonical accepted transition. It calls
-- the private activation authority directly so clients never receive general
-- execute authority over arbitrary accepted proposal UUIDs.
DROP FUNCTION public.sign_proposal(uuid, text, text, boolean, date);

CREATE FUNCTION public.sign_proposal(
  p_proposal_id uuid,
  p_signed_name text,
  p_signed_ip text DEFAULT NULL,
  p_auto_activate boolean DEFAULT true,
  p_start_date date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals;
  v_designer_client_id uuid;
  v_project_id uuid;
  v_signed_name text := btrim(COALESCE(p_signed_name, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign_proposal requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF char_length(v_signed_name) < 2 THEN
    RAISE EXCEPTION 'a signature name of at least 2 characters is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal % not found', p_proposal_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_proposal.client_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'proposal % may only be signed by its client', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_proposal.status = 'accepted' THEN
    RETURN jsonb_build_object(
      'id', v_proposal.id,
      'status', v_proposal.status,
      'signed_at', v_proposal.signed_at,
      'accepted_at', v_proposal.accepted_at,
      'project_id', v_proposal.project_id
    );
  END IF;

  IF v_proposal.status NOT IN ('sent', 'viewed') THEN
    RAISE EXCEPTION 'proposal % is not in a signable status (%)',
      p_proposal_id, v_proposal.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_proposal.valid_until IS NOT NULL AND v_proposal.valid_until < now() THEN
    RAISE EXCEPTION 'proposal % has expired', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT id INTO v_designer_client_id
  FROM public.designer_clients
  WHERE designer_id = v_proposal.designer_id
    AND client_id = v_proposal.client_id;

  IF v_designer_client_id IS NULL THEN
    RAISE EXCEPTION 'no designer↔client relationship for proposal %', p_proposal_id
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.client_decisions (
    designer_client_id,
    designer_id,
    project_id,
    linked_proposal_id,
    title,
    decision_type,
    blocking_status,
    status,
    client_consent_method,
    client_signature,
    client_consented_at,
    sent_at,
    responded_at,
    selected_by
  )
  VALUES (
    v_designer_client_id,
    v_proposal.designer_id,
    v_proposal.project_id,
    p_proposal_id,
    'Proposal approval',
    'approval',
    'non_blocking',
    'responded',
    'electronic_signature',
    v_signed_name,
    now(),
    now(),
    now(),
    auth.uid()
  )
  ON CONFLICT (linked_proposal_id)
    WHERE decision_type = 'approval' AND linked_proposal_id IS NOT NULL
    DO NOTHING;

  PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
  UPDATE public.proposals
  SET status = 'accepted',
      signed_at = now(),
      signed_by_name = v_signed_name,
      signed_ip = p_signed_ip,
      accepted_at = now(),
      updated_at = now()
  WHERE id = p_proposal_id
  RETURNING * INTO v_proposal;
  PERFORM set_config('app.proposal_accept_id', '', true);

  INSERT INTO public.proposal_engagement (
    proposal_id, viewer_id, event_type, metadata
  )
  VALUES (
    p_proposal_id,
    auth.uid(),
    'signed',
    jsonb_build_object(
      'via', 'sign_proposal',
      'signed_by_name', v_signed_name,
      'signed_ip', p_signed_ip
    )
  );

  IF p_auto_activate AND v_proposal.project_id IS NULL THEN
    v_project_id := public._activate_proposal_as_project_authorized(
      p_proposal_id,
      p_start_date
    );
    v_proposal.project_id := v_project_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_proposal.id,
    'status', v_proposal.status,
    'signed_at', v_proposal.signed_at,
    'accepted_at', v_proposal.accepted_at,
    'project_id', v_proposal.project_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sign_proposal(uuid, text, text, boolean, date)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.sign_proposal(uuid, text, text, boolean, date)
  TO authenticated;

COMMENT ON FUNCTION public.sign_proposal(uuid, text, text, boolean, date) IS
  'Client-owned signature authority. Locks and validates a live proposal, '
  'records canonical consent, and delegates optional activation directly to '
  'the private row-scoped authority without granting clients activation RPC access.';

-- Both sides of the proposal↔project pair share the same activation authority.
-- A browser cannot pre-create a project that claims proposal provenance, and
-- the source pointer cannot be cleared or moved after canonical activation.
CREATE OR REPLACE FUNCTION public.guard_project_completion_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_user IS DISTINCT FROM 'postgres'
       AND (
         NEW.status IS NULL
         OR NEW.status NOT IN ('active', 'draft', 'on_hold')
         OR NEW.completed_at IS NOT NULL
       )
    THEN
      RAISE EXCEPTION
        'project inserts cannot start in terminal or completed state'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.proposal_id IS NOT NULL AND NOT (
      current_user IS NOT DISTINCT FROM 'postgres'
      AND current_setting('app.proposal_activation_id', true)
          IS NOT DISTINCT FROM NEW.proposal_id::text
      AND EXISTS (
        SELECT 1
        FROM public.proposals AS proposal
        WHERE proposal.id = NEW.proposal_id
          AND proposal.status = 'accepted'
          AND proposal.project_id IS NULL
          AND proposal.designer_id IS NOT DISTINCT FROM NEW.designer_id
          AND proposal.client_id IS NOT DISTINCT FROM NEW.client_id
      )
    ) THEN
      RAISE EXCEPTION
        'project proposal provenance may only be created by activate_proposal_as_project'
        USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.proposal_id IS DISTINCT FROM OLD.proposal_id THEN
    RAISE EXCEPTION 'project proposal provenance is immutable after activation'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'completed'
     AND OLD.status IS DISTINCT FROM 'completed'
     AND (
       current_user IS DISTINCT FROM 'postgres'
       OR current_setting('app.project_completion_id', true)
          IS DISTINCT FROM NEW.id::text
     )
  THEN
    RAISE EXCEPTION
      'projects may only enter completed through close_project'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.completed_at IS DISTINCT FROM OLD.completed_at
     AND (
       current_user IS DISTINCT FROM 'postgres'
       OR current_setting('app.project_completion_id', true)
          IS DISTINCT FROM NEW.id::text
     )
  THEN
    RAISE EXCEPTION
      'project completed_at may only change through close_project'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.client_id IS DISTINCT FROM OLD.client_id
     AND (
       current_user IS DISTINCT FROM 'postgres'
       OR current_setting('app.project_identity_id', true)
          IS DISTINCT FROM NEW.id::text
     )
  THEN
    RAISE EXCEPTION
      'project client identity may only change through set_document_client'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_project_completion_authority()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.guard_project_completion_authority() IS
  'Guards project completion/client state and the reciprocal proposal source '
  'pointer. A non-null proposal_id is activation-only and immutable thereafter.';

DROP TRIGGER IF EXISTS guard_project_completion_authority_trg
  ON public.projects;
CREATE TRIGGER guard_project_completion_authority_trg
BEFORE UPDATE OF status, completed_at, client_id, proposal_id ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.guard_project_completion_authority();

-- ── Parent payload immutability and delete protection ──────────────────────

CREATE OR REPLACE FUNCTION public.guard_proposal_copy_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project_link_authorized boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'non-draft proposals are immutable editions and cannot be deleted'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    v_project_link_authorized :=
      OLD.project_id IS NULL
      AND NEW.project_id IS NOT NULL
      AND OLD.status = 'accepted'
      AND NEW.status = 'accepted'
      AND current_user IS NOT DISTINCT FROM 'postgres'
      AND current_setting('app.proposal_activation_id', true)
          IS NOT DISTINCT FROM NEW.id::text
      AND EXISTS (
        SELECT 1
        FROM public.projects AS project
        WHERE project.id = NEW.project_id
          AND project.proposal_id = NEW.id
      );

    IF NOT v_project_link_authorized THEN
      RAISE EXCEPTION
        'proposal project linkage may only be set once through activate_proposal_as_project'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF OLD.status <> 'draft' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.designer_id IS DISTINCT FROM OLD.designer_id
    OR NEW.client_id IS DISTINCT FROM OLD.client_id
    OR NEW.designer_client_id IS DISTINCT FROM OLD.designer_client_id
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.project_address IS DISTINCT FROM OLD.project_address
    OR NEW.cover_image IS DISTINCT FROM OLD.cover_image
    OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
    OR NEW.discount_percent IS DISTINCT FROM OLD.discount_percent
    OR NEW.tax_rate IS DISTINCT FROM OLD.tax_rate
    OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
    OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
    OR NEW.deposit_percent IS DISTINCT FROM OLD.deposit_percent
    OR NEW.payment_terms IS DISTINCT FROM OLD.payment_terms
    OR NEW.payment_notes IS DISTINCT FROM OLD.payment_notes
    OR NEW.valid_until IS DISTINCT FROM OLD.valid_until
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.parent_proposal_id IS DISTINCT FROM OLD.parent_proposal_id
    OR NEW.template_id IS DISTINCT FROM OLD.template_id
    OR NEW.revision_summary IS DISTINCT FROM OLD.revision_summary
    OR NEW.personal_message IS DISTINCT FROM OLD.personal_message
    OR NEW.cc_email IS DISTINCT FROM OLD.cc_email
    OR NEW.client_visibility_tier IS DISTINCT FROM OLD.client_visibility_tier
    OR NEW.feedback_enabled IS DISTINCT FROM OLD.feedback_enabled
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'non-draft proposal authored payload is immutable; create a revision draft'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_proposal_copy_immutability()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.guard_proposal_copy_immutability() IS
  'Freezes authored proposal payload after draft and rejects deletion of every '
  'issued/signed/revised edition, including writes that bypass RLS. Lifecycle, '
  'nudges, feedback, engagement, dispatch linkage, and exact canonical project '
  'activation remain; project links cannot be directly set, cleared, or relinked.';

DROP TRIGGER IF EXISTS guard_proposal_copy_immutability_trg ON public.proposals;
CREATE TRIGGER guard_proposal_copy_immutability_trg
BEFORE UPDATE OR DELETE ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_copy_immutability();

-- The canonical send implementation already locks the proposal and every
-- top-level authored source. Add the three phase-leaf rows it fingerprints so
-- a concurrent phase A→B move cannot let a stale leaf write land after B sends.
ALTER FUNCTION public.send_proposal(
  uuid, timestamptz, integer, text, text, text, timestamptz
) RENAME TO _send_proposal_with_dispatch;

REVOKE ALL ON FUNCTION public._send_proposal_with_dispatch(
  uuid, timestamptz, integer, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.send_proposal(
  p_proposal_id uuid,
  p_expected_updated_at timestamptz,
  p_expected_total_amount integer,
  p_expected_schedule_fingerprint text,
  p_personal_message text DEFAULT NULL,
  p_cc_email text DEFAULT NULL,
  p_valid_until timestamptz DEFAULT NULL
)
RETURNS public.proposals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_designer_id uuid;
  v_result public.proposals;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'send_proposal requires an authenticated studio author'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT proposal.designer_id
  INTO v_designer_id
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_designer_id) THEN
    RAISE EXCEPTION 'send_proposal: proposal % not found or access denied',
      p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM deliverable.id
  FROM public.proposal_phase_deliverables AS deliverable
  JOIN public.proposal_phases AS phase ON phase.id = deliverable.phase_id
  WHERE phase.proposal_id = p_proposal_id
  ORDER BY deliverable.id
  FOR UPDATE OF deliverable;

  PERFORM gate.id
  FROM public.proposal_phase_gates AS gate
  JOIN public.proposal_phases AS phase ON phase.id = gate.phase_id
  WHERE phase.proposal_id = p_proposal_id
  ORDER BY gate.id
  FOR UPDATE OF gate;

  PERFORM milestone.id
  FROM public.proposal_schedule_milestones AS milestone
  JOIN public.proposal_phases AS phase ON phase.id = milestone.phase_id
  WHERE phase.proposal_id = p_proposal_id
  ORDER BY milestone.id
  FOR UPDATE OF milestone;

  SELECT sent.* INTO v_result
  FROM public._send_proposal_with_dispatch(
    p_proposal_id,
    p_expected_updated_at,
    p_expected_total_amount,
    p_expected_schedule_fingerprint,
    p_personal_message,
    p_cc_email,
    p_valid_until
  ) AS sent;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.send_proposal(
  uuid, timestamptz, integer, text, text, text, timestamptz
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.send_proposal(
  uuid, timestamptz, integer, text, text, text, timestamptz
) TO authenticated;

COMMENT ON FUNCTION public.send_proposal(
  uuid, timestamptz, integer, text, text, text, timestamptz
) IS
  'Canonical 00388 send plus proposal→phase-leaf row locks. Serializes '
  'deliverables, gates, and schedule milestones before fingerprint/transition.';

-- ── Guest links never address superseded editions ──────────────────────────

CREATE OR REPLACE FUNCTION public.create_document_share(
  p_proposal_id uuid,
  p_label text DEFAULT NULL,
  p_visibility jsonb DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS TABLE (id uuid, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_token text;
  v_hash text;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.proposals AS proposal
    WHERE proposal.id = p_proposal_id
      AND proposal.designer_id = auth.uid()
      AND proposal.status IN ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired')
  ) THEN
    RAISE EXCEPTION 'proposal % is superseded or is not owned',
      p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_visibility IS NULL THEN
    RAISE EXCEPTION 'visibility is required'
      USING ERRCODE = 'check_violation';
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.document_shares (
    proposal_id, token_hash, label, visibility, expires_at, created_by
  )
  VALUES (
    p_proposal_id,
    v_hash,
    NULLIF(btrim(p_label), ''),
    p_visibility,
    p_expires_at,
    auth.uid()
  )
  RETURNING document_shares.id INTO v_id;

  RETURN QUERY SELECT v_id, v_token;
END;
$$;

COMMENT ON FUNCTION public.create_document_share(uuid, text, jsonb, timestamptz) IS
  'Mints a view-only link for an exact proposal edition. Intentional draft '
  'preview is supported; superseded revised proposals fail closed.';

CREATE OR REPLACE FUNCTION public.resolve_document_share(p_token text)
RETURNS TABLE (
  proposal_id uuid,
  visibility jsonb,
  label text,
  studio_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hash text;
  v_share public.document_shares;
BEGIN
  IF p_token IS NULL OR length(btrim(p_token)) = 0 THEN
    RETURN;
  END IF;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  SELECT share.* INTO v_share
  FROM public.document_shares AS share
  JOIN public.proposals AS proposal ON proposal.id = share.proposal_id
  WHERE share.token_hash = v_hash
    AND share.proposal_id IS NOT NULL
    AND share.status = 'active'
    AND (share.expires_at IS NULL OR share.expires_at > now())
    AND proposal.status IN ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired')
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.document_shares
  SET view_count = view_count + 1,
      last_viewed_at = now()
  WHERE id = v_share.id;

  RETURN QUERY
  SELECT
    v_share.proposal_id,
    v_share.visibility,
    v_share.label,
    COALESCE(profile.full_name, profile.email, 'the studio')::text
  FROM public.proposals AS proposal
  LEFT JOIN public.profiles AS profile ON profile.id = proposal.designer_id
  WHERE proposal.id = v_share.proposal_id
    AND proposal.status IN ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired');
END;
$$;

COMMENT ON FUNCTION public.resolve_document_share(text) IS
  'Resolves only active, unexpired tokens whose proposal remains a current '
  'draft or issued edition. Revised links return no row and do not increment stats.';

REVOKE ALL ON FUNCTION public.resolve_document_share(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_document_share(text)
  TO authenticated, service_role;

-- ── Client-safe proposal read boundary ─────────────────────────────────────

-- Client portals receive purpose-built JSON DTOs. Authenticated clients have
-- no raw SELECT policy on proposal parents or authored children, because RLS
-- filters rows, not columns: a full-row policy would expose trade pricing,
-- internal notes, dispatch state, and every future column by default.
CREATE OR REPLACE FUNCTION public.list_client_proposals()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'list_client_proposals requires authentication'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', proposal.id,
        'project_id', proposal.project_id,
        'project', CASE
          WHEN project.id IS NULL THEN NULL
          ELSE jsonb_build_object('id', project.id, 'name', project.name)
        END,
        'designer_id', proposal.designer_id,
        'title', proposal.title,
        'description', proposal.description,
        'total_amount', proposal.total_amount,
        'payment_terms', proposal.payment_terms,
        'payment_notes', proposal.payment_notes,
        'status', proposal.status,
        'valid_until', proposal.valid_until,
        'sent_at', proposal.sent_at,
        'signed_at', proposal.signed_at,
        'signed_by_name', proposal.signed_by_name,
        'declined_at', proposal.declined_at,
        'decline_reason', proposal.decline_reason,
        'created_at', proposal.created_at,
        'updated_at', proposal.updated_at,
        'version', proposal.version,
        'client_visibility_tier', proposal.client_visibility_tier,
        'feedback_enabled', proposal.feedback_enabled,
        'payment_milestones', CASE
          WHEN proposal.client_visibility_tier = 'curated' THEN '[]'::jsonb
          ELSE COALESCE((
            SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
              'id', milestone.id,
              'proposal_id', milestone.proposal_id,
              'phase_id', milestone.phase_id,
              'label', milestone.label,
              'percentage', milestone.percentage,
              'amount_cents', CASE
                WHEN proposal.client_visibility_tier IS DISTINCT FROM 'curated'
                  THEN milestone.amount_cents
                ELSE NULL
              END,
              'trigger_condition', milestone.trigger_condition,
              'sort_order', milestone.sort_order
            )) ORDER BY milestone.sort_order, milestone.id)
            FROM public.proposal_payment_milestones AS milestone
            WHERE milestone.proposal_id = proposal.id
          ), '[]'::jsonb)
        END
      )) ORDER BY proposal.updated_at DESC, proposal.id), '[]'::jsonb)
  INTO v_payload
  FROM public.proposals AS proposal
  LEFT JOIN public.projects AS project ON project.id = proposal.project_id
  WHERE proposal.client_id = auth.uid()
    AND proposal.status IN ('sent', 'viewed', 'accepted', 'declined', 'expired');

  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.list_client_proposals()
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.list_client_proposals()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_client_proposal_bundle(
  p_proposal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'get_client_proposal_bundle requires authentication'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT jsonb_build_object(
    'proposal', jsonb_strip_nulls(jsonb_build_object(
      'id', proposal.id,
      'project_id', proposal.project_id,
      'project', CASE
        WHEN project.id IS NULL THEN NULL
        ELSE jsonb_build_object('id', project.id, 'name', project.name)
      END,
      'designer_id', proposal.designer_id,
      'title', proposal.title,
      'description', proposal.description,
      'project_address', proposal.project_address,
      'cover_image', proposal.cover_image,
      'total_amount', proposal.total_amount,
      'payment_terms', proposal.payment_terms,
      'payment_notes', proposal.payment_notes,
      'status', proposal.status,
      'valid_until', proposal.valid_until,
      'sent_at', proposal.sent_at,
      'signed_at', proposal.signed_at,
      'signed_by_name', proposal.signed_by_name,
      'declined_at', proposal.declined_at,
      'decline_reason', proposal.decline_reason,
      'created_at', proposal.created_at,
      'updated_at', proposal.updated_at,
      'version', proposal.version,
      'parent_proposal_id', proposal.parent_proposal_id,
      'revision_summary', proposal.revision_summary,
      'personal_message', proposal.personal_message,
      'client_visibility_tier', proposal.client_visibility_tier,
      'feedback_enabled', proposal.feedback_enabled,
      'client', jsonb_strip_nulls(jsonb_build_object(
        'full_name', client.full_name
      )),
      'items', CASE
        WHEN proposal.client_visibility_tier = 'curated' THEN '[]'::jsonb
        ELSE COALESCE((
          SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
            'id', item.id,
            'proposal_id', item.proposal_id,
            'name', item.name,
            'description', item.description,
            'image_url', item.image_url,
            'room', item.room,
            'category', item.category,
            'quantity', item.quantity,
            'unit_sell_price', CASE
              WHEN proposal.client_visibility_tier = 'full'
                THEN item.unit_sell_price
              ELSE NULL
            END,
            'line_total_cents', CASE
              WHEN proposal.client_visibility_tier = 'full'
                THEN item.line_total_cents
              ELSE NULL
            END,
            'vendor_name', CASE
              WHEN proposal.client_visibility_tier = 'full'
                THEN item.vendor_name
              ELSE NULL
            END,
            'lead_time_weeks', item.lead_time_weeks,
            'notes', item.notes,
            'position', item.position,
            'item_type', item.item_type,
            'scope_room_id', item.scope_room_id,
            'budget_min_cents', CASE
              WHEN proposal.client_visibility_tier = 'full'
                THEN item.budget_min_cents
              ELSE NULL
            END,
            'budget_max_cents', CASE
              WHEN proposal.client_visibility_tier = 'full'
                THEN item.budget_max_cents
              ELSE NULL
            END,
            'ffe_category', item.ffe_category,
            'doc_code', item.doc_code,
            'created_at', item.created_at,
            'updated_at', item.updated_at,
            'client_product_snapshot', jsonb_strip_nulls(jsonb_build_object(
              'name', item.client_product_snapshot->'name',
              'images', item.client_product_snapshot->'images',
              'brand', CASE
                WHEN proposal.client_visibility_tier = 'full'
                  THEN item.client_product_snapshot->'brand'
                ELSE NULL
              END,
              'source_url', CASE
                WHEN proposal.client_visibility_tier = 'full'
                  THEN item.client_product_snapshot->'source_url'
                ELSE NULL
              END,
              'dimensions', item.client_product_snapshot->'dimensions',
              'materials', item.client_product_snapshot->'materials',
              'price_retail', CASE
                WHEN proposal.client_visibility_tier = 'full'
                  THEN item.client_product_snapshot->'price_retail'
                ELSE NULL
              END,
              'has_teaching', item.client_product_snapshot->'has_teaching',
              'record_completeness_hidden', CASE
                WHEN proposal.client_visibility_tier = 'full' THEN NULL
                ELSE 'true'::jsonb
              END
            ))
          )) ORDER BY item.position, item.id)
          FROM public.proposal_items AS item
          WHERE item.proposal_id = proposal.id
            AND item.item_type <> 'tbd'
        ), '[]'::jsonb)
      END
    )),
    'sections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', section.id,
        'proposal_id', section.proposal_id,
        'type', section.type,
        'title', section.title,
        'body', section.body,
        'metadata', CASE
          WHEN section.type = 'concept' THEN jsonb_strip_nulls(jsonb_build_object(
            'mood_board_urls', CASE
              WHEN jsonb_typeof(section.metadata->'mood_board_urls') = 'array'
                THEN COALESCE((
                  SELECT jsonb_agg(entry.value ORDER BY entry.ordinality)
                  FROM jsonb_array_elements(section.metadata->'mood_board_urls')
                    WITH ORDINALITY AS entry(value, ordinality)
                  WHERE jsonb_typeof(entry.value) = 'string'
                ), '[]'::jsonb)
              ELSE NULL
            END,
            'color_palette', CASE
              WHEN jsonb_typeof(section.metadata->'color_palette') = 'array'
                THEN COALESCE((
                  SELECT jsonb_agg(
                    jsonb_build_object('hex', swatch.value->'hex')
                    ORDER BY swatch.ordinality
                  )
                  FROM jsonb_array_elements(section.metadata->'color_palette')
                    WITH ORDINALITY AS swatch(value, ordinality)
                  WHERE jsonb_typeof(swatch.value) = 'object'
                    AND jsonb_typeof(swatch.value->'hex') = 'string'
                ), '[]'::jsonb)
              ELSE NULL
            END
          ))
          WHEN section.type = 'space_plan' THEN jsonb_strip_nulls(jsonb_build_object(
            'floor_plan_url', CASE
              WHEN jsonb_typeof(section.metadata->'floor_plan_url') = 'string'
                THEN section.metadata->'floor_plan_url'
              ELSE NULL
            END
          ))
          ELSE '{}'::jsonb
        END,
        'sort_order', section.sort_order
      ) ORDER BY section.sort_order, section.id)
      FROM public.proposal_sections AS section
      WHERE section.proposal_id = proposal.id
    ), '[]'::jsonb),
    'payment_milestones', CASE
      WHEN proposal.client_visibility_tier = 'curated' THEN '[]'::jsonb
      ELSE COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', milestone.id,
          'proposal_id', milestone.proposal_id,
          'phase_id', milestone.phase_id,
          'label', milestone.label,
          'percentage', milestone.percentage,
          'amount_cents', CASE
            WHEN proposal.client_visibility_tier IS DISTINCT FROM 'curated'
              THEN milestone.amount_cents
            ELSE NULL
          END,
          'trigger_condition', milestone.trigger_condition,
          'sort_order', milestone.sort_order
        ) ORDER BY milestone.sort_order, milestone.id)
        FROM public.proposal_payment_milestones AS milestone
        WHERE milestone.proposal_id = proposal.id
      ), '[]'::jsonb)
    END,
    'phases', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', phase.id,
        'proposal_id', phase.proposal_id,
        'name', phase.name,
        'duration_weeks', phase.duration_weeks,
        'sort_order', phase.sort_order
      ) ORDER BY phase.sort_order, phase.id)
      FROM public.proposal_phases AS phase
      WHERE phase.proposal_id = proposal.id
    ), '[]'::jsonb),
    'exclusions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', exclusion.id,
        'proposal_id', exclusion.proposal_id,
        'description', exclusion.description,
        'category', exclusion.category,
        'sort_order', exclusion.sort_order
      ) ORDER BY exclusion.sort_order, exclusion.id)
      FROM public.proposal_exclusions AS exclusion
      WHERE exclusion.proposal_id = proposal.id
    ), '[]'::jsonb),
    'scope_rooms', COALESCE((
      SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', room.id,
        'proposal_id', room.proposal_id,
        'name', room.name,
        'room_type', room.room_type,
        'budget_cents', CASE
          WHEN proposal.client_visibility_tier = 'full'
            THEN room.budget_cents
          ELSE NULL
        END,
        'sort_order', room.sort_order
      )) ORDER BY room.sort_order, room.id)
      FROM public.proposal_scope_rooms AS room
      WHERE room.proposal_id = proposal.id
    ), '[]'::jsonb),
    'boards', CASE
      WHEN proposal.client_visibility_tier = 'curated' THEN '[]'::jsonb
      ELSE COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', board.id,
          'name', board.name,
          'cover_image_url', board.cover_image_url,
          'sort_order', board.sort_order,
          'canvas_width', board.canvas_width,
          'canvas_height', board.canvas_height,
          'background_color', board.background_color,
          'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', board_item.id,
              'type', board_item.type,
              'x', board_item.x,
              'y', board_item.y,
              'width', board_item.width,
              'height', board_item.height,
              'z_index', board_item.z_index,
              'rotation', board_item.rotation,
              'image_url', board_item.image_url,
              'content', board_item.content,
              'data', jsonb_strip_nulls(jsonb_build_object(
                'name', board_item.data->'name',
                'image_url', board_item.data->'image_url',
                'room_type', board_item.data->'room_type',
                'swatches', CASE
                  WHEN board_item.type = 'palette' THEN COALESCE((
                    SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                      'hex', swatch.value->'hex',
                      'name', CASE
                        WHEN jsonb_typeof(swatch.value->'name') = 'string'
                          THEN swatch.value->'name'
                        ELSE NULL
                      END,
                      'role', CASE
                        WHEN jsonb_typeof(swatch.value->'role') = 'string'
                          THEN swatch.value->'role'
                        ELSE NULL
                      END
                    )) ORDER BY swatch.ordinality)
                    FROM jsonb_array_elements(
                      CASE
                        WHEN jsonb_typeof(board_item.data->'swatches') = 'array'
                          THEN board_item.data->'swatches'
                        ELSE '[]'::jsonb
                      END
                    ) WITH ORDINALITY AS swatch(value, ordinality)
                    WHERE jsonb_typeof(swatch.value) = 'object'
                      AND jsonb_typeof(swatch.value->'hex') = 'string'
                  ), '[]'::jsonb)
                  ELSE NULL
                END,
                'price_cents', CASE
                  WHEN proposal.client_visibility_tier = 'full'
                    THEN board_item.data->'price_cents'
                  ELSE NULL
                END,
                'vendor_name', CASE
                  WHEN proposal.client_visibility_tier = 'full'
                    THEN board_item.data->'vendor_name'
                  ELSE NULL
                END,
                'source_url', CASE
                  WHEN proposal.client_visibility_tier = 'full'
                    THEN board_item.data->'source_url'
                  ELSE NULL
                END,
                'lead_time_weeks', board_item.data->'lead_time_weeks'
              ))
            ) ORDER BY board_item.z_index, board_item.id)
            FROM public.proposal_board_items AS board_item
            WHERE board_item.board_id = board.id
          ), '[]'::jsonb)
        ) ORDER BY board.sort_order, board.id)
        FROM public.proposal_boards AS board
        WHERE board.proposal_id = proposal.id
          AND board.status = 'active'
      ), '[]'::jsonb)
    END
  )
  INTO v_payload
  FROM public.proposals AS proposal
  LEFT JOIN public.profiles AS client ON client.id = proposal.client_id
  LEFT JOIN public.projects AS project ON project.id = proposal.project_id
  WHERE proposal.id = p_proposal_id
    AND proposal.client_id = auth.uid()
    AND proposal.status IN ('sent', 'viewed', 'accepted', 'declined', 'expired');

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_proposal_bundle(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_proposal_bundle(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_client_proposal_feedback(
  p_proposal_id uuid,
  p_board_items boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  proposal_item_id uuid,
  ffe_item_id uuid,
  board_item_id uuid,
  client_id uuid,
  verdict text,
  body text,
  resolved_at timestamptz,
  resolved_by uuid,
  decision_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    feedback.id,
    feedback.proposal_item_id,
    feedback.ffe_item_id,
    feedback.board_item_id,
    feedback.client_id,
    feedback.verdict::text,
    feedback.body,
    feedback.resolved_at,
    feedback.resolved_by,
    feedback.decision_id,
    feedback.created_at,
    feedback.updated_at
  FROM public.item_feedback AS feedback
  WHERE feedback.client_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.proposals AS proposal
      WHERE proposal.id = p_proposal_id
        AND proposal.client_id = auth.uid()
        AND proposal.status IN ('sent', 'viewed', 'accepted', 'declined', 'expired')
    )
    AND (
      (
        NOT p_board_items
        AND EXISTS (
          SELECT 1
          FROM public.proposal_items AS item
          WHERE item.id = feedback.proposal_item_id
            AND item.proposal_id = p_proposal_id
        )
      )
      OR (
        p_board_items
        AND EXISTS (
          SELECT 1
          FROM public.proposal_board_items AS board_item
          JOIN public.proposal_boards AS board ON board.id = board_item.board_id
          WHERE board_item.id = feedback.board_item_id
            AND board.proposal_id = p_proposal_id
        )
      )
    )
  ORDER BY feedback.created_at, feedback.id;
$$;

REVOKE ALL ON FUNCTION public.get_client_proposal_feedback(uuid, boolean)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_proposal_feedback(uuid, boolean)
  TO authenticated;

-- ── Remove legacy writes; stage installed-iOS read compatibility ───────────

DROP POLICY IF EXISTS "Clients can update proposal status" ON public.proposals;
DROP POLICY IF EXISTS "Clients can view their proposals" ON public.proposals;

DROP POLICY IF EXISTS "Inherit proposal access" ON public.proposal_items;
DROP POLICY IF EXISTS "Clients can view non-draft proposal items" ON public.proposal_items;

DROP POLICY IF EXISTS "Inherit proposal access for sections" ON public.proposal_sections;
DROP POLICY IF EXISTS proposal_sections_studio_rw ON public.proposal_sections;
CREATE POLICY proposal_sections_studio_rw
  ON public.proposal_sections FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.proposals AS proposal
      WHERE proposal.id = proposal_sections.proposal_id
        AND public.is_studio_comember(proposal.designer_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.proposals AS proposal
      WHERE proposal.id = proposal_sections.proposal_id
        AND public.is_studio_comember(proposal.designer_id)
    )
  );

DROP POLICY IF EXISTS "Clients can view non-draft proposal sections" ON public.proposal_sections;

DROP POLICY IF EXISTS "Clients can view non-draft proposal payment milestones"
  ON public.proposal_payment_milestones;
DROP POLICY IF EXISTS "Clients can view non-draft proposal phases"
  ON public.proposal_phases;
DROP POLICY IF EXISTS "Clients can view non-draft proposal exclusions"
  ON public.proposal_exclusions;
DROP POLICY IF EXISTS "Clients can view non-draft proposal scope rooms"
  ON public.proposal_scope_rooms;
DROP POLICY IF EXISTS "Clients can view non-draft proposal boards"
  ON public.proposal_boards;
DROP POLICY IF EXISTS "Clients can view items on non-draft proposal boards"
  ON public.proposal_board_items;
DROP POLICY IF EXISTS "Clients can view non-draft proposal palettes"
  ON public.proposal_palettes;
DROP POLICY IF EXISTS "Clients can view swatches on non-draft proposal palettes"
  ON public.palette_swatches;
DROP POLICY IF EXISTS "proposal_schedule_milestones_client_select"
  ON public.proposal_schedule_milestones;
DROP POLICY IF EXISTS "Clients can view non-draft proposal CO terms"
  ON public.proposal_change_order_terms;

-- Installed Patina iOS and rollback web bundles still request these raw row
-- sets. Replace
-- the former broad/loosely-scoped policies with temporary SELECT-only policies
-- for the addressed client and an issued terminal/active proposal. The new app
-- and portal use list_client_proposals/get_client_proposal_bundle. Remove only
-- these *_legacy_ios_client_select policies after adoption is measured.
CREATE POLICY proposals_legacy_ios_client_select
ON public.proposals FOR SELECT TO authenticated
USING (
  client_id = (SELECT auth.uid())
  AND status IN ('sent', 'viewed', 'accepted', 'declined', 'expired')
);

CREATE POLICY proposal_items_legacy_ios_client_select
ON public.proposal_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposals AS proposal
    WHERE proposal.id = proposal_items.proposal_id
      AND proposal.client_id = (SELECT auth.uid())
      AND proposal.status IN ('sent', 'viewed', 'accepted', 'declined', 'expired')
  )
);

CREATE POLICY proposal_sections_legacy_ios_client_select
ON public.proposal_sections FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposals AS proposal
    WHERE proposal.id = proposal_sections.proposal_id
      AND proposal.client_id = (SELECT auth.uid())
      AND proposal.status IN ('sent', 'viewed', 'accepted', 'declined', 'expired')
  )
);

CREATE POLICY proposal_payment_milestones_legacy_ios_client_select
ON public.proposal_payment_milestones FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposals AS proposal
    WHERE proposal.id = proposal_payment_milestones.proposal_id
      AND proposal.client_id = (SELECT auth.uid())
      AND proposal.status IN ('sent', 'viewed', 'accepted', 'declined', 'expired')
  )
);

CREATE POLICY proposal_phases_legacy_ios_client_select
ON public.proposal_phases FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposals AS proposal
    WHERE proposal.id = proposal_phases.proposal_id
      AND proposal.client_id = (SELECT auth.uid())
      AND proposal.status IN ('sent', 'viewed', 'accepted', 'declined', 'expired')
  )
);

CREATE POLICY proposal_exclusions_legacy_ios_client_select
ON public.proposal_exclusions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposals AS proposal
    WHERE proposal.id = proposal_exclusions.proposal_id
      AND proposal.client_id = (SELECT auth.uid())
      AND proposal.status IN ('sent', 'viewed', 'accepted', 'declined', 'expired')
  )
);

CREATE POLICY proposal_scope_rooms_legacy_ios_client_select
ON public.proposal_scope_rooms FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposals AS proposal
    WHERE proposal.id = proposal_scope_rooms.proposal_id
      AND proposal.client_id = (SELECT auth.uid())
      AND proposal.status IN ('sent', 'viewed', 'accepted', 'declined', 'expired')
  )
);

CREATE POLICY proposal_boards_legacy_ios_client_select
ON public.proposal_boards FOR SELECT TO authenticated
USING (
  status = 'active'
  AND EXISTS (
    SELECT 1 FROM public.proposals AS proposal
    WHERE proposal.id = proposal_boards.proposal_id
      AND proposal.client_id = (SELECT auth.uid())
      AND proposal.status IN ('sent', 'viewed', 'accepted', 'declined', 'expired')
  )
);

CREATE POLICY proposal_board_items_legacy_ios_client_select
ON public.proposal_board_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.proposal_boards AS board
    JOIN public.proposals AS proposal ON proposal.id = board.proposal_id
    WHERE board.id = proposal_board_items.board_id
      AND board.status = 'active'
      AND proposal.client_id = (SELECT auth.uid())
      AND proposal.status IN ('sent', 'viewed', 'accepted', 'declined', 'expired')
  )
);

CREATE POLICY proposal_palettes_legacy_client_select
ON public.proposal_palettes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposals AS proposal
    WHERE proposal.id = proposal_palettes.proposal_id
      AND proposal.client_id = (SELECT auth.uid())
      AND proposal.status IN ('sent', 'viewed', 'accepted', 'declined', 'expired')
  )
);

CREATE POLICY palette_swatches_legacy_client_select
ON public.palette_swatches FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.proposal_palettes AS palette
    JOIN public.proposals AS proposal ON proposal.id = palette.proposal_id
    WHERE palette.id = palette_swatches.palette_id
      AND proposal.client_id = (SELECT auth.uid())
      AND proposal.status IN ('sent', 'viewed', 'accepted', 'declined', 'expired')
  )
);

CREATE POLICY proposal_schedule_milestones_legacy_client_select
ON public.proposal_schedule_milestones FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.proposal_phases AS phase
    JOIN public.proposals AS proposal ON proposal.id = phase.proposal_id
    WHERE phase.id = proposal_schedule_milestones.phase_id
      AND proposal.client_id = (SELECT auth.uid())
      AND proposal.status IN ('sent', 'viewed', 'accepted', 'declined', 'expired')
  )
);

CREATE POLICY proposal_change_order_terms_legacy_client_select
ON public.proposal_change_order_terms FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposals AS proposal
    WHERE proposal.id = proposal_change_order_terms.proposal_id
      AND proposal.client_id = (SELECT auth.uid())
      AND proposal.status IN ('sent', 'viewed', 'accepted', 'declined', 'expired')
  )
);

COMMIT;
