-- ═══════════════════════════════════════════════════════════════════════════
-- 00759 — W5 residuals (US-21 T-55c, SQ-695; from T-55a, SQ-691, and the W5
-- review, SQ-661)
-- ═══════════════════════════════════════════════════════════════════════════
-- CREATE OR REPLACE bases, each the newest body, full copy plus the change:
--   set_line_placements        00758:696
--   triage_project_ffe_items   00758:935
-- Signatures, return shapes and grants are unchanged: no type or grants regen.
--
-- S2 (triage keeps received rooms). Moving a line (or a piece's carried
--   children) to no room drops its placement, and ON DELETE CASCADE would take
--   the placement's receipts with it. As set_line_placements does (00758 F12),
--   a placement that has received refuses: "<Room> has already received N.
--   Record a change instead." With no receipts the placement is dropped as
--   before.
-- S3 (one open draft at a time) is not done: several open drafts are an
--   established pattern (design-services waves, SD hardening), and
--   draft_release_for_project returns the newest open draft, so once it is
--   sent or voided the Release lens recovers the next. Every locked line stays
--   reachable.
-- S4 (set_line_placements). The caller is authorized before any existence
--   error: an unknown line raises 'project not found or access denied'
--   (42501), as set_line_group does (00758 F16).
--
-- Idempotent: CREATE OR REPLACE FUNCTION.
-- Test: supabase/tests/commercial/pieces_w5_residuals_test.sql.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. S4: set_line_placements (base 00758:696) ───────────────────────────

CREATE OR REPLACE FUNCTION public.set_line_placements(p_ffe_item_id uuid, p_placements jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_item     public.project_ffe_items%ROWTYPE;
  v_elem     jsonb;
  v_ord      bigint;
  v_room_id  uuid;
  v_qty      numeric;
  v_note     text;
  v_rooms    uuid[] := ARRAY[]::uuid[];
  v_sum      bigint := 0;
  v_primary  uuid;
  v_locked   boolean;
  v_before   jsonb;
  v_after    jsonb;
  v_piece_rooms uuid[];
  v_received   record;  -- 00758 (F12)
BEGIN
  IF p_placements IS NULL OR jsonb_typeof(p_placements) <> 'array' THEN
    RAISE EXCEPTION 'Placements are a list of rooms.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_item
  FROM public.project_ffe_items
  WHERE id = p_ffe_item_id
  FOR UPDATE;

  -- 00759 (S4): authorize before any existence error. An unknown line leaves
  -- v_item.project_id NULL, so the gate refuses it exactly as it refuses a
  -- line in a project the caller cannot reach.
  PERFORM public._ffe_require_studio_project(v_item.project_id);

  -- 00737 (F13): a removed line has no rooms to change.
  IF v_item.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This line was removed.' USING ERRCODE = 'check_violation';
  END IF;
  -- 00758 (F3/F17): a line on any open draft keeps its rooms until the
  -- draft is sent or voided.
  IF EXISTS (
    SELECT 1 FROM public.furnishing_authorization_items a
    JOIN public.project_commercial_documents d ON d.id = a.commercial_document_id
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE a.source_ffe_item_id = v_item.id
      AND COALESCE(p.commercial_state, 'draft') = 'draft'
  ) THEN
    RAISE EXCEPTION 'This line is on a drafted release. Send it or void the draft first.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00737 (F13): labor is placed only where its piece is assigned or placed.
  IF v_item.line_kind = 'labor' THEN
    SELECT COALESCE(array_agg(DISTINCT piece_room.room_id), ARRAY[]::uuid[]) INTO v_piece_rooms
    FROM (
      SELECT piece.project_room_id AS room_id FROM public.project_ffe_items piece
      WHERE piece.id = v_item.parent_ffe_item_id AND piece.project_room_id IS NOT NULL
      UNION
      SELECT placement.project_room_id FROM public.project_ffe_placements placement
      WHERE placement.ffe_item_id = v_item.parent_ffe_item_id
    ) piece_room;
  END IF;

  -- Validate every element before writing anything.
  FOR v_elem, v_ord IN
    SELECT e.value, e.ordinality FROM jsonb_array_elements(p_placements) WITH ORDINALITY AS e
  LOOP
    IF jsonb_typeof(v_elem) <> 'object'
       OR jsonb_typeof(v_elem -> 'roomId') IS DISTINCT FROM 'string'
       OR (v_elem ->> 'roomId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN
      RAISE EXCEPTION 'Each placement names a room.'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    v_room_id := (v_elem ->> 'roomId')::uuid;

    IF jsonb_typeof(v_elem -> 'quantity') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Each room''s quantity is a whole number above zero.'
        USING ERRCODE = 'check_violation';
    END IF;
    v_qty := (v_elem ->> 'quantity')::numeric;
    IF v_qty <= 0 OR v_qty <> trunc(v_qty) OR v_qty > 2147483647 THEN
      RAISE EXCEPTION 'Each room''s quantity is a whole number above zero.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.project_rooms room
      WHERE room.id = v_room_id AND room.project_id = v_item.project_id
    ) THEN
      RAISE EXCEPTION 'That room is not in this project.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_item.line_kind = 'labor' AND NOT (v_room_id = ANY (v_piece_rooms)) THEN
      RAISE EXCEPTION 'Labor goes where its piece goes.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_room_id = ANY (v_rooms) THEN
      RAISE EXCEPTION 'A room appears twice in the placements.'
        USING ERRCODE = 'unique_violation';
    END IF;

    v_rooms := v_rooms || v_room_id;
    v_sum := v_sum + v_qty::integer;
  END LOOP;

  IF v_sum > v_item.quantity THEN
    RAISE EXCEPTION 'The rooms add up to %, more than the % on the line.', v_sum, v_item.quantity
      USING ERRCODE = 'check_violation',
            HINT = 'Change the line''s quantity first; once released, through Record a change.';
  END IF;

  v_primary := CASE WHEN cardinality(v_rooms) > 0 THEN v_rooms[1] ELSE v_item.project_room_id END;

  -- 00754 (D7 phase 3): the primary room may change while the line is on a
  -- PO; the change is recorded below like any locked change.

  v_locked := v_item.purchase_order_id IS NOT NULL
              OR public.ffe_line_authorization_state(v_item.id) IS NOT NULL;

  SELECT jsonb_build_object(
           'primaryRoomId', v_item.project_room_id,
           'placements', COALESCE(jsonb_agg(jsonb_build_object(
             'roomId', p.project_room_id, 'quantity', p.quantity, 'areaNote', p.area_note)
             ORDER BY p.sort_order, p.created_at), '[]'::jsonb))
  INTO v_before
  FROM public.project_ffe_placements p
  WHERE p.ffe_item_id = v_item.id;

  -- 00758 (F12): a room keeps what it has received. Dropping it, or setting
  -- it below its receipts, would delete them (ON DELETE CASCADE).
  SELECT room.name, received.total INTO v_received
  FROM public.project_ffe_placements p
  JOIN public.project_rooms room ON room.id = p.project_room_id
  CROSS JOIN LATERAL (
    SELECT sum(r.quantity) AS total
    FROM public.project_ffe_placement_receipts r WHERE r.placement_id = p.id
  ) received
  WHERE p.ffe_item_id = v_item.id
    AND received.total > 0
    AND COALESCE((
      SELECT (e.value ->> 'quantity')::numeric
      FROM jsonb_array_elements(p_placements) e
      WHERE (e.value ->> 'roomId')::uuid = p.project_room_id), 0) < received.total
  ORDER BY p.sort_order, p.created_at, p.id
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION '% has already received %. Record a change instead.',
      v_received.name, v_received.total
      USING ERRCODE = 'check_violation';
  END IF;

  -- Replace the set: drop rooms no longer named, upsert the rest.
  DELETE FROM public.project_ffe_placements p
  WHERE p.ffe_item_id = v_item.id
    AND NOT (p.project_room_id = ANY (v_rooms));

  FOR v_elem, v_ord IN
    SELECT e.value, e.ordinality FROM jsonb_array_elements(p_placements) WITH ORDINALITY AS e
  LOOP
    v_note := NULLIF(btrim(v_elem ->> 'areaNote'), '');
    INSERT INTO public.project_ffe_placements AS p
      (ffe_item_id, project_id, project_room_id, quantity, area_note, sort_order)
    VALUES
      (v_item.id, v_item.project_id, (v_elem ->> 'roomId')::uuid,
       (v_elem ->> 'quantity')::numeric::integer, v_note, (v_ord - 1)::integer)
    ON CONFLICT (ffe_item_id, project_room_id) DO UPDATE
      SET quantity   = EXCLUDED.quantity,
          area_note  = EXCLUDED.area_note,
          sort_order = EXCLUDED.sort_order
      WHERE (p.quantity, p.area_note, p.sort_order)
            IS DISTINCT FROM (EXCLUDED.quantity, EXCLUDED.area_note, EXCLUDED.sort_order);
  END LOOP;

  -- The first placement is the primary room. Only quantity-free columns move.
  IF cardinality(v_rooms) > 0
     AND (v_item.project_room_id IS DISTINCT FROM v_primary
          OR v_item.assignment_scope IS DISTINCT FROM 'room') THEN
    PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
    UPDATE public.project_ffe_items
    SET project_room_id = v_primary,
        assignment_scope = 'room'
    WHERE id = v_item.id;
  END IF;

  -- 00758 (F15): a group sits in one room (00751, Q9). A line whose primary
  -- room is now another leaves its group; a group left empty is deleted.
  IF v_item.line_group_id IS NOT NULL AND cardinality(v_rooms) > 0 AND EXISTS (
    SELECT 1 FROM public.project_line_groups g
    WHERE g.id = v_item.line_group_id AND g.project_room_id IS DISTINCT FROM v_primary
  ) THEN
    PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
    UPDATE public.project_ffe_items SET line_group_id = NULL WHERE id = v_item.id;
    DELETE FROM public.project_line_groups g
    WHERE g.id = v_item.line_group_id
      AND NOT EXISTS (SELECT 1 FROM public.project_ffe_items i WHERE i.line_group_id = g.id);
  END IF;

  SELECT jsonb_build_object(
           'primaryRoomId', v_primary,
           'placements', COALESCE(jsonb_agg(jsonb_build_object(
             'roomId', p.project_room_id, 'quantity', p.quantity, 'areaNote', p.area_note)
             ORDER BY p.sort_order, p.created_at), '[]'::jsonb))
  INTO v_after
  FROM public.project_ffe_placements p
  WHERE p.ffe_item_id = v_item.id;

  IF v_locked AND v_after IS DISTINCT FROM v_before THEN
    INSERT INTO public.project_ffe_placement_events
      (ffe_item_id, project_id, changed_by, before, after)
    VALUES
      (v_item.id, v_item.project_id, auth.uid(), v_before, v_after);
  END IF;

  RETURN jsonb_build_object(
    'placements', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'placementId', p.id,
               'roomId', p.project_room_id,
               'roomName', room.name,
               'quantity', p.quantity,
               'areaNote', p.area_note,
               'sortOrder', p.sort_order)
             ORDER BY p.sort_order, p.created_at)
      FROM public.project_ffe_placements p
      JOIN public.project_rooms room ON room.id = p.project_room_id
      WHERE p.ffe_item_id = v_item.id), '[]'::jsonb),
    'wasteQuantity', v_item.quantity - v_sum
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_line_placements(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_line_placements(uuid, jsonb) TO authenticated;

-- ─── 2. S2: triage_project_ffe_items (base 00758:935) ──────────────────────

CREATE OR REPLACE FUNCTION public.triage_project_ffe_items(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_project_id uuid:=NULLIF(p_request->>'projectId','')::uuid; v_ids uuid[]; v_scope text:=p_request->>'assignmentScope'; v_room uuid:=NULLIF(p_request->>'roomId','')::uuid; v_disposition text:=NULLIF(p_request->>'disposition',''); v_count integer;
  v_moving  uuid[];
  v_carried uuid[];
  v_crowded record;
  v_before  jsonb;
  v_left_groups uuid[];  -- 00758 (F15)
  v_received record;     -- 00759 (S2)
BEGIN
  PERFORM public._ffe_require_studio_project(v_project_id);
  SELECT array_agg(value::uuid) INTO v_ids FROM jsonb_array_elements_text(p_request->'selectionIds');
  IF COALESCE(cardinality(v_ids),0)=0 OR v_scope NOT IN ('room','throughout','unassigned')
     OR (v_scope='room')<>(v_room IS NOT NULL)
     OR (v_disposition IS NOT NULL AND v_disposition NOT IN ('candidate','selected','alternate','not_selected'))
  THEN RAISE EXCEPTION 'invalid triage request' USING ERRCODE='check_violation'; END IF;
  IF v_room IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.project_rooms WHERE id=v_room AND project_id=v_project_id) THEN
    RAISE EXCEPTION 'room does not belong to project' USING ERRCODE='integrity_constraint_violation';
  END IF;

  -- 00755 (F-D1): Move keeps placements and labor coherent. A named line
  -- moves when its room or scope changes; a disposition-only call moves none.
  PERFORM 1 FROM public.project_ffe_items
  WHERE project_id = v_project_id AND id = ANY (v_ids) ORDER BY id FOR UPDATE;

  SELECT COALESCE(array_agg(item.id ORDER BY item.id), '{}'::uuid[]) INTO v_moving
  FROM public.project_ffe_items item
  WHERE item.project_id = v_project_id AND item.id = ANY (v_ids) AND item.removed_at IS NULL
    AND (item.project_room_id IS DISTINCT FROM v_room OR item.assignment_scope IS DISTINCT FROM v_scope);

  IF EXISTS (
    SELECT 1 FROM public.project_ffe_items item
    WHERE item.id = ANY (v_moving) AND item.line_kind = 'labor'
      AND NOT COALESCE(item.parent_ffe_item_id = ANY (v_ids), false)
  ) THEN
    RAISE EXCEPTION 'Labor moves with its piece.' USING ERRCODE = 'check_violation';
  END IF;

  -- A moving piece carries its active labor and COM children.
  SELECT COALESCE(array_agg(child.id ORDER BY child.id), '{}'::uuid[]) INTO v_carried
  FROM public.project_ffe_items child
  WHERE child.project_id = v_project_id
    AND child.parent_ffe_item_id = ANY (v_moving)
    AND child.link_kind IN ('labor', 'com')
    AND child.removed_at IS NULL
    AND NOT (child.id = ANY (v_ids));
  PERFORM 1 FROM public.project_ffe_items WHERE id = ANY (v_carried) ORDER BY id FOR UPDATE;
  v_moving := v_moving || v_carried;

  SELECT placement.ffe_item_id, count(*) AS rooms INTO v_crowded
  FROM public.project_ffe_placements placement
  WHERE placement.ffe_item_id = ANY (v_moving)
  GROUP BY placement.ffe_item_id
  HAVING count(*) > 1
  ORDER BY placement.ffe_item_id
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'This line sits in % rooms. Change its rooms instead.', v_crowded.rooms
      USING ERRCODE = 'check_violation';
  END IF;

  -- Released or ordered lines record the change, as set_line_placements does.
  SELECT COALESCE(jsonb_object_agg(item.id::text, jsonb_build_object(
           'primaryRoomId', item.project_room_id,
           'placements', COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'roomId', p.project_room_id, 'quantity', p.quantity, 'areaNote', p.area_note)
               ORDER BY p.sort_order, p.created_at)
             FROM public.project_ffe_placements p WHERE p.ffe_item_id = item.id), '[]'::jsonb))),
         '{}'::jsonb)
  INTO v_before
  FROM public.project_ffe_items item
  WHERE item.id = ANY (v_moving)
    AND (item.purchase_order_id IS NOT NULL
         OR public.ffe_line_authorization_state(item.id) IS NOT NULL);

  PERFORM set_config('app.ffe_mutation_rpc','on',true);
  UPDATE public.project_ffe_items SET project_room_id=v_room,assignment_scope=v_scope,
    design_disposition=COALESCE(v_disposition,design_disposition),updated_at=now()
  WHERE project_id=v_project_id AND id=ANY(v_ids) AND removed_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>cardinality(v_ids) THEN RAISE EXCEPTION 'one or more selections are missing or cross-project' USING ERRCODE='integrity_constraint_violation'; END IF;

  -- 00755: the carried children, then the one placement of every moving line.
  UPDATE public.project_ffe_items
  SET project_room_id = v_room, assignment_scope = v_scope, updated_at = now()
  WHERE id = ANY (v_carried);

  IF v_room IS NULL THEN
    -- 00759 (S2): a room keeps what it has received. Dropping the placement
    -- would delete its receipts (ON DELETE CASCADE), as in 00758 F12.
    SELECT room.name, received.total INTO v_received
    FROM public.project_ffe_placements p
    JOIN public.project_rooms room ON room.id = p.project_room_id
    CROSS JOIN LATERAL (
      SELECT sum(r.quantity) AS total
      FROM public.project_ffe_placement_receipts r WHERE r.placement_id = p.id
    ) received
    WHERE p.ffe_item_id = ANY (v_moving)
      AND received.total > 0
    ORDER BY p.ffe_item_id, p.sort_order, p.created_at, p.id
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION '% has already received %. Record a change instead.',
        v_received.name, v_received.total
        USING ERRCODE = 'check_violation';
    END IF;
    DELETE FROM public.project_ffe_placements WHERE ffe_item_id = ANY (v_moving);
  ELSE
    UPDATE public.project_ffe_placements SET project_room_id = v_room
    WHERE ffe_item_id = ANY (v_moving) AND project_room_id <> v_room;
  END IF;

  -- 00758 (F15): a group sits in one room (00751, Q9; NULL, the unassigned
  -- pile, counts as a room). A moved line in another room leaves its group;
  -- a group left empty is deleted.
  WITH cleared AS (
    UPDATE public.project_ffe_items item SET line_group_id = NULL
    FROM public.project_line_groups g
    WHERE item.id = ANY (v_moving) AND g.id = item.line_group_id
      AND g.project_room_id IS DISTINCT FROM item.project_room_id
    RETURNING g.id
  )
  SELECT array_agg(DISTINCT cleared.id) INTO v_left_groups FROM cleared;
  DELETE FROM public.project_line_groups g
  WHERE g.id = ANY (COALESCE(v_left_groups, '{}'::uuid[]))
    AND NOT EXISTS (SELECT 1 FROM public.project_ffe_items i WHERE i.line_group_id = g.id);

  INSERT INTO public.project_ffe_placement_events (ffe_item_id, project_id, changed_by, before, after)
  SELECT item.id, item.project_id, auth.uid(), v_before -> (item.id::text), after_state.state
  FROM public.project_ffe_items item
  CROSS JOIN LATERAL (
    SELECT jsonb_build_object(
      'primaryRoomId', item.project_room_id,
      'placements', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'roomId', p.project_room_id, 'quantity', p.quantity, 'areaNote', p.area_note)
          ORDER BY p.sort_order, p.created_at)
        FROM public.project_ffe_placements p WHERE p.ffe_item_id = item.id), '[]'::jsonb)) AS state
  ) after_state
  WHERE v_before ? (item.id::text)
    AND after_state.state IS DISTINCT FROM v_before -> (item.id::text);

  RETURN jsonb_build_object('updatedCount',v_count,'assignmentScope',v_scope,'roomId',v_room);
END;
$$;

REVOKE ALL ON FUNCTION public.triage_project_ffe_items(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.triage_project_ffe_items(jsonb) TO authenticated;

COMMIT;
