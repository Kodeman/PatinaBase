-- 00253 — apply_scope_change ownership guard (Wave-1 R81 follow-up).
--
-- apply_scope_change(p_request_id) (00084) is SECURITY DEFINER but never checks
-- that the caller owns the project — any authenticated user could apply any
-- approved scope change by id (an IDOR that mutates budget/fee/timeline and
-- inserts rooms/FF&E). CREATE OR REPLACE the function verbatim from 00084 with
-- one added guard: the calling designer must own the target project. Body is
-- otherwise unchanged.

CREATE OR REPLACE FUNCTION apply_scope_change(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_new_room JSONB;
  v_new_item JSONB;
BEGIN
  SELECT * INTO v_request
  FROM scope_change_requests
  WHERE id = p_request_id AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scope change request % not found or not approved', p_request_id;
  END IF;

  IF v_request.applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'Scope change % already applied at %', p_request_id, v_request.applied_at;
  END IF;

  -- Ownership guard (00253): the caller must be the project's designer. Without
  -- this, SECURITY DEFINER lets any authed user apply any approved request.
  IF NOT EXISTS (
    SELECT 1 FROM projects
    WHERE id = v_request.project_id AND designer_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to apply scope change % for this project', p_request_id
      USING ERRCODE = '42501';
  END IF;

  -- 1. Add new rooms
  FOR v_new_room IN SELECT * FROM jsonb_array_elements(COALESCE(v_request.new_rooms, '[]'::jsonb))
  LOOP
    INSERT INTO project_rooms (
      project_id, name, room_type, dimensions, floor_area_sqft,
      budget_cents, ffe_categories, notes
    ) VALUES (
      v_request.project_id,
      v_new_room->>'name',
      v_new_room->>'room_type',
      v_new_room->>'dimensions',
      NULLIF(v_new_room->>'floor_area_sqft', '')::NUMERIC(10,2),
      COALESCE((v_new_room->>'budget_cents')::INTEGER, 0),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_new_room->'ffe_categories', '[]'::jsonb))),
      v_new_room->>'notes'
    );
  END LOOP;

  -- 2. Add new FF&E items
  FOR v_new_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_request.new_ffe_items, '[]'::jsonb))
  LOOP
    INSERT INTO project_ffe_items (
      project_id, project_room_id, name, ffe_category, item_type,
      quantity, unit_price_cents, line_total_cents,
      vendor_name, notes
    ) VALUES (
      v_request.project_id,
      NULLIF(v_new_item->>'project_room_id', '')::UUID,
      v_new_item->>'name',
      v_new_item->>'ffe_category',
      COALESCE(v_new_item->>'item_type', 'fixed'),
      COALESCE((v_new_item->>'quantity')::INTEGER, 1),
      COALESCE((v_new_item->>'unit_price_cents')::INTEGER, 0),
      COALESCE((v_new_item->>'line_total_cents')::INTEGER, 0),
      v_new_item->>'vendor_name',
      v_new_item->>'notes'
    );
  END LOOP;

  -- 3. Update project totals
  UPDATE projects
  SET
    budget_cents = budget_cents + COALESCE(v_request.additional_ffe_budget_cents, 0),
    design_fee_cents = design_fee_cents + COALESCE(v_request.additional_design_fee_cents, 0),
    target_end_date = target_end_date + (COALESCE(v_request.timeline_impact_weeks, 0) * 7),
    updated_at = NOW()
  WHERE id = v_request.project_id;

  -- 4. Mark request applied
  UPDATE scope_change_requests
  SET applied_at = NOW(),
      updated_at = NOW()
  WHERE id = p_request_id;
END;
$$;
