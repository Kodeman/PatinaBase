-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: proposal_captures inbox + consume_capture RPC
--            + list_designer_open_proposals RPC
-- Description: Wave 2 of the Proposal Builder upgrade. Designers capture
--              products from the web (extension), iOS, or other surfaces
--              into a personal "inbox" that can later be consumed into a
--              specific proposal/room/category as a fixed FF&E line item.
--
--              Surfaces:
--                - apps/extension (Plasmo)         — adds rows here
--                - apps/designer-portal/CaptureInbox — lists, dismisses,
--                                                    drag-and-drop consume
--                - apps/designer-portal/ProductPickerModal "Captures" tab
--
--              Key behaviors:
--                - RLS confines a row to its owning designer.
--                - A BEFORE UPDATE trigger blocks reassigning to a
--                  proposal owned by a different designer.
--                - consume_capture(...) is the single place that turns a
--                  capture into a proposal_items row (item_type='fixed').
--                - list_designer_open_proposals() exposes the small view
--                  the extension needs (no RLS-defeating direct table
--                  access in the extension).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS proposal_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  designer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID NULL REFERENCES products(id) ON DELETE SET NULL,
  proposal_id UUID NULL REFERENCES proposals(id) ON DELETE SET NULL,
  scope_room_id UUID NULL REFERENCES proposal_scope_rooms(id) ON DELETE SET NULL,
  ffe_category_slug TEXT NULL,
  source_url TEXT NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  thumbnail_url TEXT NULL,
  status TEXT NOT NULL DEFAULT 'inbox'
    CHECK (status IN ('inbox','assigned','consumed','dismissed')),
  consumed_proposal_item_id UUID NULL REFERENCES proposal_items(id) ON DELETE SET NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_proposal_captures_designer_status
  ON proposal_captures(designer_id, status);

CREATE INDEX IF NOT EXISTS idx_proposal_captures_proposal
  ON proposal_captures(proposal_id) WHERE proposal_id IS NOT NULL;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE proposal_captures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "proposal_captures_select"
  ON proposal_captures FOR SELECT
  USING (designer_id = auth.uid());

CREATE POLICY "proposal_captures_insert"
  ON proposal_captures FOR INSERT
  WITH CHECK (designer_id = auth.uid());

CREATE POLICY "proposal_captures_update"
  ON proposal_captures FOR UPDATE
  USING (designer_id = auth.uid())
  WITH CHECK (designer_id = auth.uid());

CREATE POLICY "proposal_captures_delete"
  ON proposal_captures FOR DELETE
  USING (designer_id = auth.uid());

-- ─── Cross-designer assignment guard ─────────────────────────────────────────
--
-- Even with RLS on proposal_captures, a designer who owned proposals A and B
-- might attempt to assign their capture to *someone else's* proposal C if
-- their session somehow saw the proposal id. The trigger short-circuits by
-- verifying that any non-null proposal_id (and any non-null scope_room_id)
-- still resolves to a proposal owned by the capture's designer_id.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION proposal_captures_guard_proposal_owner()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal_designer UUID;
  v_room_proposal     UUID;
BEGIN
  IF NEW.proposal_id IS NOT NULL THEN
    SELECT designer_id INTO v_proposal_designer
      FROM proposals
     WHERE id = NEW.proposal_id;

    IF v_proposal_designer IS NULL THEN
      RAISE EXCEPTION 'proposal_captures: proposal_id % does not exist', NEW.proposal_id;
    END IF;

    IF v_proposal_designer <> NEW.designer_id THEN
      RAISE EXCEPTION 'proposal_captures: cannot assign capture to proposal owned by a different designer';
    END IF;
  END IF;

  IF NEW.scope_room_id IS NOT NULL THEN
    SELECT proposal_id INTO v_room_proposal
      FROM proposal_scope_rooms
     WHERE id = NEW.scope_room_id;

    IF v_room_proposal IS NULL THEN
      RAISE EXCEPTION 'proposal_captures: scope_room_id % does not exist', NEW.scope_room_id;
    END IF;

    -- A scope_room must belong to the chosen proposal (when one is set).
    IF NEW.proposal_id IS NOT NULL AND v_room_proposal <> NEW.proposal_id THEN
      RAISE EXCEPTION 'proposal_captures: scope_room_id % does not belong to proposal_id %',
        NEW.scope_room_id, NEW.proposal_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_proposal_captures_guard_insert
  BEFORE INSERT ON proposal_captures
  FOR EACH ROW EXECUTE FUNCTION proposal_captures_guard_proposal_owner();

CREATE TRIGGER trg_proposal_captures_guard_update
  BEFORE UPDATE ON proposal_captures
  FOR EACH ROW EXECUTE FUNCTION proposal_captures_guard_proposal_owner();

-- ═══════════════════════════════════════════════════════════════════════════
-- consume_capture(...)
--
-- Single transactional path that turns a capture into a proposal_items row
-- with item_type='fixed'. Marks the capture status='consumed' and stamps
-- consumed_proposal_item_id + consumed_at. RLS-aware (SECURITY INVOKER) —
-- the caller must own both the capture and the target proposal.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION consume_capture(
  p_capture_id     UUID,
  p_proposal_id    UUID,
  p_scope_room_id  UUID,
  p_ffe_category_slug TEXT,
  p_qty            INTEGER DEFAULT 1
) RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_capture proposal_captures%ROWTYPE;
  v_product products%ROWTYPE;
  v_unit_price INTEGER;
  v_unit_sell  INTEGER;
  v_line_total INTEGER;
  v_qty INTEGER;
  v_position INTEGER;
  v_item_id UUID;
BEGIN
  -- Normalize qty to a positive integer.
  v_qty := COALESCE(p_qty, 1);
  IF v_qty < 1 THEN
    v_qty := 1;
  END IF;

  SELECT * INTO v_capture FROM proposal_captures WHERE id = p_capture_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'consume_capture: capture % not found (or not visible)', p_capture_id;
  END IF;

  IF v_capture.status NOT IN ('inbox', 'assigned') THEN
    RAISE EXCEPTION 'consume_capture: capture % already consumed or dismissed', p_capture_id;
  END IF;

  IF v_capture.product_id IS NULL THEN
    RAISE EXCEPTION 'consume_capture: capture % has no product_id; promote draft first', p_capture_id;
  END IF;

  SELECT * INTO v_product FROM products WHERE id = v_capture.product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'consume_capture: capture %.product_id (%) not visible', p_capture_id, v_capture.product_id;
  END IF;

  v_unit_price := COALESCE(v_product.price_retail, 0);
  v_unit_sell  := v_unit_price; -- markup defaults to 0 in 00014; client price = trade price.
  v_line_total := v_unit_sell * v_qty;

  -- Append to the end of the existing schedule.
  SELECT COALESCE(MAX(position), -1) + 1
    INTO v_position
    FROM proposal_items
   WHERE proposal_id = p_proposal_id;

  INSERT INTO proposal_items (
    proposal_id,
    product_id,
    name,
    quantity,
    unit_price,
    unit_sell_price,
    line_total,
    vendor_id,
    item_type,
    scope_room_id,
    ffe_category,
    position
  )
  VALUES (
    p_proposal_id,
    v_capture.product_id,
    COALESCE(NULLIF(TRIM(v_product.name), ''), 'Untitled product'),
    v_qty,
    v_unit_price,
    v_unit_sell,
    v_line_total,
    v_product.vendor_id,
    'fixed',
    p_scope_room_id,
    p_ffe_category_slug,
    v_position
  )
  RETURNING id INTO v_item_id;

  UPDATE proposal_captures
     SET status                    = 'consumed',
         consumed_proposal_item_id = v_item_id,
         consumed_at               = NOW(),
         proposal_id               = p_proposal_id,
         scope_room_id             = p_scope_room_id,
         ffe_category_slug         = p_ffe_category_slug
   WHERE id = p_capture_id;

  RETURN v_item_id;
END;
$$;

REVOKE ALL ON FUNCTION consume_capture(UUID, UUID, UUID, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_capture(UUID, UUID, UUID, TEXT, INTEGER) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- list_designer_open_proposals(p_designer_id UUID DEFAULT auth.uid())
--
-- Read-only listing the extension uses to populate its proposal dropdown
-- (and any other surface that needs a small "open proposals for me"
-- summary). Returns proposals where status is NOT in ('declined','expired')
-- and the designer matches. SECURITY INVOKER — RLS already filters
-- proposals by designer; we just project a small shape.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION list_designer_open_proposals(
  p_designer_id UUID DEFAULT auth.uid()
)
RETURNS TABLE (
  id                UUID,
  title             TEXT,
  project_name      TEXT,
  scope_rooms_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT p.id,
         p.title,
         pr.name AS project_name,
         (
           SELECT COUNT(*)::INTEGER
             FROM proposal_scope_rooms r
            WHERE r.proposal_id = p.id
         ) AS scope_rooms_count
    FROM proposals p
    LEFT JOIN projects pr ON pr.id = p.project_id
   WHERE p.designer_id = p_designer_id
     AND p.status NOT IN ('declined', 'expired')
   ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC;
$$;

REVOKE ALL ON FUNCTION list_designer_open_proposals(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_designer_open_proposals(UUID) TO authenticated;
