-- ═══════════════════════════════════════════════════════════════════════════
-- 00755 — W4 review fixes (US-21 T-43a, SQ-686; from the T-43 review, SQ-649)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRACT (artifacts/pieces-building-room-2026-10-08/build/CONTRACT.md);
-- the orchestrator's triage of the W4 review (SQ-649), rulings final.
--
-- CREATE OR REPLACE bases, each the newest body, full copy plus the change:
--   make_ffe_line_allowance               00743:37
--   set_labor_line_price                  00737:777
--   triage_project_ffe_items              00435:494
--   get_client_project_selections         00745:127
--   get_client_project_threshold          00745:168
--   get_client_commercial_document_bundle 00745:372
-- New: draft_release_for_project, guard_project_room_handbacks_append_only.
-- Adds GRANT/REVOKE → regenerate supabase/seed/00-legacy-grants.sql (the
-- next reset owner does it; CONTRACT §4).
--
-- ── F-B1: a line on a DRAFT release ─────────────────────────────────────────
-- ffe_line_authorization_state (00705) ignores drafts, so a drafted line read
-- as unreleased and the price acts edited it under its frozen row.
--   - make_ffe_line_allowance and set_labor_line_price refuse a line named by
--     a draft furnishing authorization: "This line is on a drafted release.
--     Send it or void the draft first."
--   - draft_release_for_project(p_project_id) → {documentId, proposalId,
--     itemIds[]} or NULL: the project's newest draft furnishing authorization
--     and the lines it names (labor included). SECURITY INVOKER: the caller's
--     RLS on the three tables applies, and can_buy_for_project gates the
--     answer. proposalId is what the void takes. With several drafts the lens
--     voids the newest and reads again.
--   - Void: nothing added. void_furnishings_authorization(p_proposal_id,
--     p_reason) (00422:662) already exists, is granted to authenticated, and
--     is called by the portal (useVoidAuthorization). It moves the draft to
--     commercial_state 'superseded', which 00744 step (5) treats as not live;
--     it is gated by _can_author_proposal, the same gate as the release act
--     (00744 step 2); and it records superseded_at and an audited reason of at
--     least 5 characters, as the other paper transitions do.
--
-- ── F-D1: Move to room… (triage_project_ffe_items) ──────────────────────────
-- The Build room's Move (useAssignLineRoom, row drag, the Price and Rough-in
-- menus) calls triage_project_ffe_items. A named line MOVES when its room or
-- scope changes; a disposition-only call (the Release lens) moves nothing and
-- none of the rules below apply to it.
--   - A moving labor line whose piece is not named refuses: "Labor moves with
--     its piece."
--   - A moving piece carries its active (removed_at IS NULL) labor and COM
--     children (link_kind labor | com); accessories stay where they are.
--   - Any moving line (carried children included) with placements in more
--     than one room refuses: "This line sits in N rooms. Change its rooms
--     instead."
--   - A moving line's one placement follows it to the new room, keeping its
--     id (and so its receipts, 00754). Moved to no room (throughout or
--     unassigned), the placement is dropped: a placement always names a room.
--   - A line on a PO or a sent/signed authorization still moves (00754 lifted
--     the PO lock); the change is recorded in project_ffe_placement_events as
--     set_line_placements records it.
--
-- ── F-E2: project_room_handbacks is append-only ─────────────────────────────
-- A BEFORE UPDATE OR DELETE trigger refuses both. The one DELETE it lets
-- through is the ON DELETE CASCADE from a deleted project or room (00742's
-- FKs), recognised by the parent row being gone. UPDATE, DELETE and TRUNCATE
-- are revoked from service_role, authenticated and anon.
--
-- ── F-E3 / F-E4: the frozen room name and unit win ──────────────────────────
-- In the client readers, a frozen (authorized) line's rooms fallback takes the
-- FROZEN room name first, COALESCE(frozen, live), and its unit is the
-- snapshot's, defaulting to 'each' (T-36's CONSTRAINT: 00744 writes
-- NULLIF(unit, 'each')). roomName keeps its 00423 meaning, untouched. A live
-- (unauthorized) line still reads its live unit and room.
--
-- Idempotent: CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS.
-- Test: supabase/tests/commercial/pieces_w4_review_fixes_test.sql.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. F-B1: make_ffe_line_allowance (base 00743:37) ───────────────────────

CREATE OR REPLACE FUNCTION public.make_ffe_line_allowance(
  p_item_id uuid,
  p_budget_max_cents integer
)
RETURNS public.project_ffe_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_item public.project_ffe_items%ROWTYPE;
BEGIN
  SELECT * INTO v_item FROM public.project_ffe_items
   WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._ffe_require_studio_project(v_item.project_id);

  IF p_budget_max_cents IS NULL OR p_budget_max_cents <= 0 THEN
    RAISE EXCEPTION 'An allowance needs a ceiling above $0.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_item.line_kind = 'labor' THEN
    RAISE EXCEPTION 'Labor can''t be an allowance.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_item.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This line was removed.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_item.purchase_order_id IS NOT NULL
     OR public.ffe_line_authorization_state(v_item.id) IS NOT NULL THEN
    RAISE EXCEPTION 'Released lines change through Record a change.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00755 (F-B1): a drafted line is frozen on its draft until sent or voided.
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

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.project_ffe_items
     SET item_type = 'allowance',
         budget_max_cents = p_budget_max_cents,
         budget_min_cents = LEAST(COALESCE(budget_min_cents, 0), p_budget_max_cents),
         updated_at = now()
   WHERE id = v_item.id
  RETURNING * INTO v_item;

  RETURN v_item;
END;
$$;

COMMENT ON FUNCTION public.make_ffe_line_allowance(uuid, integer) IS
  'Make it an allowance (00743, US-21 T-35): item_type allowance with a ceiling (budget_max_cents > 0); '
  'rough_cents, unit_price_cents and line_total_cents are left alone. Refuses labor, a removed line, and '
  'a released one (on a sent, signed or executed authorization, or on a PO): "Released lines change '
  'through Record a change." 00755: refuses a line on a draft authorization: "This line is on a drafted '
  'release. Send it or void the draft first." Gate: _ffe_require_studio_project. Returns the updated line.';

REVOKE ALL ON FUNCTION public.make_ffe_line_allowance(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.make_ffe_line_allowance(uuid, integer) TO authenticated;

-- ─── 2. F-B1: set_labor_line_price (base 00737:777) ─────────────────────────

CREATE OR REPLACE FUNCTION public.set_labor_line_price(
  p_ffe_item_id uuid,
  p_unit_price_cents integer
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_item public.project_ffe_items%ROWTYPE;
BEGIN
  SELECT * INTO v_item FROM public.project_ffe_items
   WHERE id = p_ffe_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._ffe_require_studio_project(v_item.project_id);

  IF p_unit_price_cents IS NULL OR p_unit_price_cents < 0 THEN
    RAISE EXCEPTION 'set_labor_line_price: the price is whole cents, 0 or more'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_item.line_kind IS DISTINCT FROM 'labor' THEN
    RAISE EXCEPTION 'Only a labor line takes a price here.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_item.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This line was removed.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Released: on a sent, signed or executed authorization (the
  -- ffe_line_authorization check, 00736 → 00705:79), or on a PO.
  IF v_item.purchase_order_id IS NOT NULL
     OR public.ffe_line_authorization_state(v_item.id) IS NOT NULL THEN
    RAISE EXCEPTION 'Released labor changes through Record a change.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00755 (F-B1): a drafted line is frozen on its draft until sent or voided.
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

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.project_ffe_items
     SET unit_price_cents = p_unit_price_cents,
         line_total_cents = quantity * p_unit_price_cents,
         updated_at = now()
   WHERE id = v_item.id
  RETURNING * INTO v_item;

  RETURN jsonb_build_object(
    'selectionId', v_item.id,
    'unitPriceCents', v_item.unit_price_cents,
    'lineTotalCents', v_item.line_total_cents
  );
END;
$$;

COMMENT ON FUNCTION public.set_labor_line_price(uuid, integer) IS
  'Sets a labor line''s client price (00737, F1; Q5: labor is billed on its own line): unit_price_cents '
  'and line_total_cents = quantity × price. Refuses a line that is not labor, a removed line, and a '
  'released one (on a sent, signed or executed authorization, or on a PO). 00755: refuses a line on a '
  'draft authorization: "This line is on a drafted release. Send it or void the draft first." '
  'Gate: _ffe_require_studio_project. Returns {selectionId, unitPriceCents, lineTotalCents}.';

REVOKE ALL ON FUNCTION public.set_labor_line_price(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_labor_line_price(uuid, integer) TO authenticated;

-- ─── 3. F-B1: draft_release_for_project (new) ───────────────────────────────

CREATE OR REPLACE FUNCTION public.draft_release_for_project(p_project_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
    'documentId', document.id,
    'proposalId', document.proposal_id,
    'itemIds', COALESCE((
      SELECT jsonb_agg(item.source_ffe_item_id ORDER BY item.sort_order, item.id)
      FROM public.furnishing_authorization_items item
      WHERE item.commercial_document_id = document.id
        AND item.source_ffe_item_id IS NOT NULL
    ), '[]'::jsonb)
  )
  FROM public.project_commercial_documents document
  JOIN public.proposals proposal ON proposal.id = document.proposal_id
  WHERE document.project_id = p_project_id
    AND document.document_kind = 'furnishings_authorization'
    AND COALESCE(proposal.commercial_state, 'draft') = 'draft'
    AND public.can_buy_for_project(p_project_id)
  ORDER BY proposal.created_at DESC, document.id DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.draft_release_for_project(uuid) IS
  'The Release lens''s draft fact (00755, F-B1): the project''s newest draft furnishing authorization as '
  '{documentId, proposalId, itemIds[]} (itemIds = the schedule lines it names, labor included), or NULL. '
  'Void it with void_furnishings_authorization(proposalId, reason). SECURITY INVOKER; gated by '
  'can_buy_for_project.';

REVOKE ALL ON FUNCTION public.draft_release_for_project(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.draft_release_for_project(uuid) TO authenticated;

-- ─── 4. F-D1: triage_project_ffe_items (base 00435:494) ─────────────────────

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
    DELETE FROM public.project_ffe_placements WHERE ffe_item_id = ANY (v_moving);
  ELSE
    UPDATE public.project_ffe_placements SET project_room_id = v_room
    WHERE ffe_item_id = ANY (v_moving) AND project_room_id <> v_room;
  END IF;

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

COMMENT ON FUNCTION public.triage_project_ffe_items(jsonb) IS
  'Files lines into a room, throughout or unassigned, and optionally sets their disposition (00435). '
  '00755 (F-D1), for a line whose room or scope changes: refuses labor moved without its piece ("Labor '
  'moves with its piece."); carries a piece''s active labor and COM children; refuses a line in more than '
  'one room ("This line sits in N rooms. Change its rooms instead."); moves a line''s one placement with '
  'it (dropped when moved to no room); records the change in project_ffe_placement_events for a line on '
  'a PO or a sent/signed authorization.';

REVOKE ALL ON FUNCTION public.triage_project_ffe_items(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.triage_project_ffe_items(jsonb) TO authenticated;

-- ─── 5. F-E2: project_room_handbacks is append-only ─────────────────────────

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
  RAISE EXCEPTION 'Hand-backs are a record: they are never changed or removed.'
    USING ERRCODE = 'check_violation';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_project_room_handbacks_append_only()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS project_room_handbacks_append_only ON public.project_room_handbacks;
CREATE TRIGGER project_room_handbacks_append_only
  BEFORE UPDATE OR DELETE ON public.project_room_handbacks
  FOR EACH ROW EXECUTE FUNCTION public.guard_project_room_handbacks_append_only();

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.project_room_handbacks
  FROM service_role, authenticated, anon;

COMMENT ON TABLE public.project_room_handbacks IS
  'Append-only internal review fact: a room handed back to the lead designer, READY FOR LEAH '
  '(00742, D18, Q13). Who and when, nothing else; never read by client payloads. '
  'Read: can_buy_for_project. Written only through hand_back_project_room. 00755: a trigger refuses '
  'UPDATE and DELETE (a deleted project or room still cascades); UPDATE, DELETE and TRUNCATE are '
  'revoked from every API role.';

-- ─── 6. F-E3/F-E4: get_client_project_selections (base 00745:127) ───────────

CREATE OR REPLACE FUNCTION public.get_client_project_selections(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_actor uuid:=auth.uid(); v_project public.projects%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT * INTO v_project FROM public.projects WHERE id=p_project_id;
  IF NOT FOUND OR NOT(v_project.client_id=v_actor OR public.is_studio_comember(v_project.designer_id)) THEN
    RAISE EXCEPTION 'project not found or not accessible' USING ERRCODE='insufficient_privilege';
  END IF;
  RETURN jsonb_build_object('projectId',v_project.id,'projectName',v_project.name,'selections',COALESCE((
    SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id',item.id,'threadId',item.selection_thread_id,'name',item.name,
      'category',item.ffe_category,'assignmentScope',item.assignment_scope,
      'roomId',item.project_room_id,'roomName',room.name,'quantity',item.quantity,
      'productId',item.product_id,'logisticsStatus',item.status,
      -- 00745: additive.
      'unit',line_unit.unit,
      'rooms',public._client_line_rooms(
        item.id, authorization_item.id IS NOT NULL, authorization_item.snapshot,
        -- 00755 (F-E3): the frozen room name first.
        COALESCE(authorization_item.room_name, room.name),
        COALESCE(authorization_item.quantity, item.quantity), line_unit.unit)
    )) ORDER BY room.sort_order NULLS FIRST,item.sort_order,item.created_at,item.id)
    FROM public.project_ffe_items item
    LEFT JOIN public.project_rooms room ON room.id=item.project_room_id
    LEFT JOIN public.furnishing_authorization_items authorization_item
      ON authorization_item.id=item.source_authorization_item_id
    -- 00755 (F-E4): a frozen line's unit is the snapshot's, defaulting to 'each'.
    CROSS JOIN LATERAL (SELECT CASE WHEN authorization_item.id IS NOT NULL
      THEN COALESCE(authorization_item.snapshot->>'unit', 'each') ELSE item.unit END AS unit) line_unit
    WHERE item.project_id=p_project_id AND item.removed_at IS NULL
      AND item.design_disposition='selected'
  ),'[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_project_selections(uuid)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_client_project_selections(uuid) TO authenticated,service_role;

-- ─── 7. F-E3/F-E4: get_client_project_threshold (base 00745:168) ────────────

CREATE OR REPLACE FUNCTION public.get_client_project_threshold(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
BEGIN
  -- 00441's preamble, verbatim.
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR NOT (
    v_project.client_id = v_actor
    OR public.is_studio_comember(v_project.designer_id)
  ) THEN
    RAISE EXCEPTION 'project not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'projectId', v_project.id,
    'projectName', v_project.name,
    -- 00423's origin test: the project stands on a signed design-services
    -- instrument, or it is a legacy project the commercial rail never touched.
    'origin', CASE WHEN EXISTS (
      SELECT 1 FROM public.project_commercial_documents AS doc
      WHERE doc.project_id = p_project_id
        AND doc.is_origin
        AND doc.document_kind IN ('design_services', 'design_build')
    ) THEN 'commercial' ELSE 'legacy' END,

    -- ── furnishings: the FROZEN authorization snapshot the client signed ──
    -- Money comes from furnishing_authorization_items.client_* — the columns
    -- the client put her name to — never from the live working row.
    'selections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', item.id,
        'kind', 'furnishings',
        'threadId', item.selection_thread_id,
        'name', item.name,
        'category', item.ffe_category,
        'assignmentScope', item.assignment_scope,
        'roomId', item.project_room_id,
        'roomName', COALESCE(room.name, authorization_item.room_name),
        'conceptRenderUrl', room.concept_render_url,
        'conceptRenderCaption', room.concept_render_caption,
        'conceptRenderUploadedAt', room.concept_render_uploaded_at,
        'conceptRenderUploadedBy', room.concept_render_uploaded_by,
        'quantity', authorization_item.quantity,
        -- 00745: additive. The rooms she signed, from the frozen snapshot.
        'unit', line_unit.unit,
        'rooms', public._client_line_rooms(
          item.id, true, authorization_item.snapshot,
          -- 00755 (F-E3): the frozen room name first.
          COALESCE(authorization_item.room_name, room.name),
          authorization_item.quantity, line_unit.unit),
        'clientUnitPriceCents', authorization_item.client_unit_price_cents,
        'clientLineTotalCents', authorization_item.client_line_total_cents,
        'itemType', item.item_type,
        'logisticsStatus', item.status,
        'updatedAt', GREATEST(item.updated_at, item.last_status_change_at, doc.executed_at),
        'tradeJourney', NULL,
        -- The block exists because the CLIENT signed an allowance — that is the
        -- frozen snapshot's business (authorization_item.item_type), and it
        -- never changes.
        --
        -- 00423 resolved it off the LIVE schedule line (item.item_type = 'fixed'
        -- → item.line_total_cents). That is the one path on which the restored
        -- payload would still have handed the client an unsigned working-row
        -- figure the studio can move under her, and it is withdrawn here: an
        -- allowance is RESOLVED when a later EXECUTED authorization snapshots the
        -- same live line as 'fixed', and the resolved figure is that snapshot's
        -- own client_line_total_cents. Until such an instrument exists the
        -- allowance is unresolved and this is null.
        'allowance', CASE WHEN authorization_item.item_type = 'allowance' THEN jsonb_build_object(
          'ceilingCents', authorization_item.client_line_total_cents,
          'resolvedCents', (
            SELECT resolution.client_line_total_cents
            FROM public.furnishing_authorization_items AS resolution
            JOIN public.project_commercial_documents AS resolution_doc
              ON resolution_doc.id = resolution.commercial_document_id
             AND resolution_doc.executed_at IS NOT NULL
            JOIN public.proposals AS resolution_proposal
              ON resolution_proposal.id = resolution_doc.proposal_id
             AND resolution_proposal.commercial_state = 'executed'
            WHERE resolution.source_ffe_item_id = item.id
              AND resolution.item_type = 'fixed'
            ORDER BY resolution_doc.executed_at DESC, resolution.id
            LIMIT 1
          )
        ) ELSE NULL END,
        'instrument', jsonb_build_object(
          'documentId', doc.id,
          'proposalId', proposal.id,
          'name', doc.wave_name,
          'executedAt', doc.executed_at
        ),
        'productId', item.product_id,
        'imageUrl', product.images[1],
        'docCode', item.doc_code
      ) ORDER BY room.sort_order NULLS FIRST, item.sort_order, item.created_at, item.id)
      FROM public.project_ffe_items AS item
      JOIN public.furnishing_authorization_items AS authorization_item
        ON authorization_item.id = item.source_authorization_item_id
      JOIN public.project_commercial_documents AS doc
        ON doc.id = authorization_item.commercial_document_id
       AND doc.executed_at IS NOT NULL
      JOIN public.proposals AS proposal
        ON proposal.id = doc.proposal_id
       AND proposal.commercial_state = 'executed'
      LEFT JOIN public.project_rooms AS room ON room.id = item.project_room_id
      LEFT JOIN public.products AS product ON product.id = item.product_id
      CROSS JOIN LATERAL (
        -- 00755 (F-E4): the snapshot's unit, defaulting to 'each'.
        SELECT COALESCE(authorization_item.snapshot->>'unit', 'each') AS unit
      ) AS line_unit
      WHERE item.project_id = p_project_id
        AND item.removed_at IS NULL
        AND item.design_disposition NOT IN ('not_selected', 'superseded')
    ), '[]'::jsonb)

    -- ── trade: the presence line under an executed trade scope ────────────
    -- clientLineTotalCents reads the live row on purpose: 00423's
    -- guard_trade_presence_line_lock freezes exactly that money once the scope
    -- is executed, which is why this branch has no snapshot table of its own.
    || COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', item.id,
        'kind', 'trade',
        'threadId', item.selection_thread_id,
        'name', item.name,
        'category', item.ffe_category,
        'assignmentScope', item.assignment_scope,
        'roomId', item.project_room_id,
        'roomName', COALESCE(room.name, section.room_name),
        'conceptRenderUrl', room.concept_render_url,
        'conceptRenderCaption', room.concept_render_caption,
        'conceptRenderUploadedAt', room.concept_render_uploaded_at,
        'conceptRenderUploadedBy', room.concept_render_uploaded_by,
        'quantity', item.quantity,
        -- 00745: additive. No snapshot table on this branch: the live line.
        'unit', item.unit,
        'rooms', public._client_line_rooms(
          item.id, false, NULL,
          COALESCE(room.name, section.room_name),
          item.quantity, item.unit),
        'clientUnitPriceCents', NULL,
        'clientLineTotalCents', item.line_total_cents,
        'itemType', item.item_type,
        'logisticsStatus', item.status,
        'updatedAt', GREATEST(item.updated_at, item.last_status_change_at, doc.executed_at),
        'tradeJourney', terms.progress_state,
        'allowance', NULL,
        'instrument', jsonb_build_object(
          'documentId', doc.id,
          'proposalId', proposal.id,
          'name', proposal.title,
          'executedAt', doc.executed_at
        ),
        'productId', item.product_id,
        'imageUrl', product.images[1],
        'docCode', item.doc_code
      ) ORDER BY room.sort_order NULLS FIRST, item.sort_order, item.created_at, item.id)
      FROM public.project_ffe_items AS item
      JOIN public.project_commercial_documents AS doc
        ON doc.id = item.trade_scope_document_id
       AND doc.executed_at IS NOT NULL
      JOIN public.proposals AS proposal
        ON proposal.id = doc.proposal_id
       AND proposal.commercial_state = 'executed'
      JOIN public.trade_scope_terms AS terms ON terms.proposal_id = proposal.id
      LEFT JOIN public.project_rooms AS room ON room.id = item.project_room_id
      LEFT JOIN public.products AS product ON product.id = item.product_id
      LEFT JOIN LATERAL (
        SELECT scope_section.room_name
        FROM public.trade_scope_sections AS scope_section
        WHERE scope_section.proposal_id = proposal.id
          AND scope_section.project_room_id IS NOT DISTINCT FROM item.project_room_id
        ORDER BY scope_section.sort_order, scope_section.id
        LIMIT 1
      ) AS section ON true
      WHERE item.project_id = p_project_id
        AND item.removed_at IS NULL
        AND item.design_disposition NOT IN ('not_selected', 'superseded')
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_project_threshold(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_project_threshold(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_client_project_threshold(uuid) IS
  'The Client Page''s reader: what a client authorized on a project — furnishings snapshot lines (kind furnishings, money from the signed furnishing_authorization_items snapshot) and trade scope presence lines (kind trade, with tradeJourney). Trade cost, vendor cost, markup, purchase-order fields and bids never appear, and no live unsigned project_ffe_items money on any path. 00580 adds four room facts to each line — conceptRenderUrl, conceptRenderCaption, conceptRenderUploadedAt, conceptRenderUploadedBy — off the project_rooms join both branches already make; conceptRenderUrl is an object path inside the PRIVATE room-renders bucket, not a URL. 00745 adds unit and rooms [{name, quantity, unit}] to each line (furnishings from the frozen snapshot''s placements, trade from the live line); roomName stays the primary room. rough_cents, need_label, line_kind, link_kind and parent_ffe_item_id never appear. Carries 00423''s client-facing payload over 00441''s authorization preamble, key names and ordering.';

-- ─── 8. F-E4: get_client_commercial_document_bundle (base 00745:372) ────────

CREATE OR REPLACE FUNCTION public.get_client_commercial_document_bundle(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
BEGIN
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT (
    v_proposal.client_id IS NOT DISTINCT FROM auth.uid()
    OR public.is_studio_comember(v_proposal.designer_id)
  ) THEN
    RAISE EXCEPTION 'commercial document % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- A client never sees an unsent document. Legacy editions carry no
  -- commercial_state, so their draft-ness lives in status.
  --
  -- 00422: nor does a client see a document that was never ISSUED. Voiding
  -- writes commercial_state 'superseded' and deliberately leaves status alone,
  -- so a never-sent draft that the studio priced and thought better of used to
  -- pass the `= 'draft'` test the moment it was retired — the void itself
  -- published it. A terminal edition is client-visible only if it was sent.
  IF v_proposal.client_id IS NOT DISTINCT FROM auth.uid()
     AND (
       (v_proposal.document_kind = 'legacy' AND v_proposal.status = 'draft')
       OR (v_proposal.document_kind <> 'legacy'
           AND COALESCE(v_proposal.commercial_state, 'draft') = 'draft')
       OR (v_proposal.document_kind <> 'legacy'
           AND COALESCE(v_proposal.commercial_state, 'draft') IN ('superseded', 'declined')
           AND v_proposal.sent_at IS NULL)
     ) THEN
    RAISE EXCEPTION 'commercial document % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 00414: a legacy edition is not an error, it is a retired document.
  -- (B-8) The `parts` key is ALWAYS present, `[]` when the document has none
  -- (contract §2.4), including on this early-return — a reader that has to
  -- branch on the key's absence is a reader with two contracts.
  IF v_proposal.document_kind = 'legacy' THEN
    RETURN jsonb_build_object(
      'parts', '[]'::jsonb,
      -- (R25) A retired document is never composed. The key is present here
      -- for the same reason `parts` is: one contract, no branch on absence.
      'composed', false,
      'document', jsonb_build_object(
        'id', v_proposal.id,
        'documentKind', 'legacy',
        'kind', 'legacy',
        'retired', true,
        'title', v_proposal.title,
        'status', v_proposal.status,
        'commercialState', v_proposal.commercial_state,
        'supersededAt', v_proposal.superseded_at,
        'replacementProposalId', v_proposal.replacement_proposal_id,
        'validUntil', v_proposal.valid_until,
        'sentAt', v_proposal.sent_at
      )
    );
  END IF;

  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE proposal_id = p_proposal_id;

  RETURN jsonb_build_object(
    'document', jsonb_build_object(
      'id', v_proposal.id, 'projectId', COALESCE(v_document.project_id, v_proposal.project_id),
      'title', v_proposal.title, 'description', v_proposal.description,
      'documentKind', v_proposal.document_kind,
      'commercialState', v_proposal.commercial_state,
      'status', v_proposal.status, 'totalAmountCents', v_proposal.total_amount,
      'depositPercent', v_proposal.deposit_percent,
      'validUntil', v_proposal.valid_until, 'sentAt', v_proposal.sent_at,
      'sent_at', v_proposal.sent_at,
      'proposalSendDispatchId', v_proposal.proposal_send_dispatch_id,
      'proposal_send_dispatch_id', v_proposal.proposal_send_dispatch_id,
      'executedAt', v_document.executed_at,
      'supersededAt', v_proposal.superseded_at,
      'replacementProposalId', v_proposal.replacement_proposal_id,
      'createdAt', v_proposal.created_at, 'updatedAt', v_proposal.updated_at
    ),
    'serviceTerms', (SELECT jsonb_build_object(
      'scope', t.scope, 'deliverables', t.deliverables, 'exclusions', t.exclusions,
      'billingCeilingCents', t.billing_ceiling_cents,
      'retainerAmountCents', t.retainer_amount_cents,
      'retainerActivationPolicy', t.retainer_activation_policy,
      'billingCadence', t.billing_cadence, 'currency', t.currency,
      'terms', t.terms, 'currentRateVersion', t.current_rate_version,
      'furnishingsDepositPercent', t.furnishings_deposit_percent
    ) FROM public.proposal_service_terms t WHERE t.proposal_id = p_proposal_id),
    'rates', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'version', r.version, 'roleName', r.role_name,
      'hourlyRateCents', r.hourly_rate_cents, 'sortOrder', r.sort_order,
      'effectiveAt', r.effective_at
    ) ORDER BY r.version DESC, r.sort_order, r.role_name)
      FROM public.proposal_service_rates r WHERE r.proposal_id = p_proposal_id), '[]'::jsonb),
    -- 00575: the client's edge onto the parts. ENUMERATED keys, not
    -- to_jsonb — the same discipline the signature projection keeps below:
    -- source_template_key, source_part_id, client_visible and the
    -- timestamps stay behind. Only client_visible rows appear (R8), and
    -- the key is present and [] on every document, so the client adapter
    -- never branches on absence.
    'parts', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', ap.id, 'position', ap.position,
      'kind', ap.kind, 'variant', ap.variant,
      'partKey', ap.part_key, 'title', ap.title,
      -- 00578 (B3, R13, RC-4): on a turnkey prime the pricing basis crosses
      -- this edge REDACTED unless the sub-disclosure clause elected open book
      -- — the derived schedule of values in place of the trades at cost, the
      -- studio's fee and its markup. Every other part, and every other kind of
      -- document, crosses byte-for-byte as before.
      'payload', CASE WHEN v_proposal.document_kind = 'design_build'
        THEN public._agreement_redact_client_payload(
               ap.kind, ap.variant, ap.payload,
               public._agreement_sub_disclosure(p_proposal_id))
        ELSE ap.payload END,
      'required', ap.required
    ) ORDER BY ap.position, ap.id)
      FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id AND ap.client_visible), '[]'::jsonb),
    -- (R25) Whether this document is composed, said by the database rather
    -- than counted off the array above. The two are different questions: the
    -- array is filtered to client_visible, so an agreement whose every part
    -- the studio kept to itself arrives with `parts: []` and is STILL
    -- composed — and the homeowner must read the composition she was shown
    -- (nothing) rather than fall back to a terms row she was never shown.
    -- Read over EVERY part, visible or not.
    'composed', EXISTS (
      SELECT 1 FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
    ),
    -- 00577 (R34): the one line the designer wrote about WHY this addendum
    -- exists. NULL on every other kind of document and on an addendum whose
    -- author wrote nothing; the whole of the change history stays behind (R8).
    'why', public._agreement_addendum_why(p_proposal_id),
    -- 00577 (P6): the sentence under the checkbox, composed by the database.
    -- The sign route reads it from HERE and never from the browser: a client
    -- that could post its own consent sentence could choose what it consented
    -- to. Recomputed at read time; the sentence she ACTUALLY ticked is frozen
    -- in the signature row's metadata, and that is what the record prints.
    'consentSentence', public.compose_agreement_consent(p_proposal_id),
    -- 00577 (R12): the frozen copy, NULL until countersign writes it. A
    -- pre-Wave-2 execution and an agreement with no parts both stay NULL and
    -- the keepsake renders exactly as it does today — no empty state, no
    -- "snapshot pending". part_set is deliberately NOT projected: the client
    -- reads the HTML she was given, not the studio's row shapes.
    'executionSnapshot', (
      SELECT jsonb_build_object(
        'html', snapshot.html,
        'documentHash', snapshot.document_hash,
        'createdAt', snapshot.created_at
      ) FROM public.agreement_execution_snapshots snapshot
      WHERE snapshot.proposal_id = p_proposal_id
    ),
    'signatures', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', s.id, 'partyRole', s.party_role,
      'signedName', s.signed_name, 'signedAt', s.signed_at,
      'evidenceFingerprint', s.evidence_fingerprint,
      -- 00425: the paper tell, projected as a BOOLEAN and nothing more. Raw
      -- metadata never crosses this edge — it carries recordedBy, which is a
      -- studio member's uuid, and the client has no business with it.
      'signedOnPaper', COALESCE((s.metadata->>'executedOnPaper')::boolean, false),
      -- 00425: THE DATE ON THE PAPER, and it is the one the client's copy must
      -- print as the signing date. signed_at is when the STUDIO wrote the act
      -- down, which on this rail is a different day — often weeks later — so a
      -- copy that renders signed_at as "SIGNED <date>" tells the client they
      -- signed on a day they did not. Projected as the bare yyyy-mm-dd text the
      -- studio typed (no timestamp, no zone: a calendar date has neither), and
      -- NULL on portal rows, which carry no such key because there the record
      -- moment IS the signing moment.
      'paperSignedOn', s.metadata->>'paperSignedOn',
      -- The scan pointer is projected ONLY when the folio row is flagged
      -- client_visible AND still anchored to THIS document. This body is
      -- SECURITY DEFINER, so project_documents RLS is not in force here; both
      -- facts have to be read explicitly or an unshared scan of the client's own
      -- signature page leaks its id, or a pointer at somebody else's folio row
      -- is handed to this client as if it were their signature page. The record
      -- rails validate the anchor at write time and the folio guard freezes it
      -- afterwards; this is the read edge saying so on its own authority rather
      -- than trusting two other seams to have held.
      'paperScanDocumentId', (
        SELECT scan.id FROM public.project_documents scan
        WHERE scan.id = (s.metadata->>'paperScanDocumentId')::uuid
          AND scan.proposal_id = p_proposal_id
          AND scan.client_visible
      ),
      -- 00577 (R36): THE SENTENCE SHE ACTUALLY TICKED, frozen with the act.
      -- Not compose_agreement_consent, which is recomputed from today's parts
      -- and would re-word a record every time an addendum moved something —
      -- the record must say what she agreed to, not what the paper says now.
      -- Projected as its own key, one scalar, in 00425's discipline: the
      -- signature's metadata carries recordedBy and other studio-side facts,
      -- and raw metadata never crosses this edge.
      'consentSentence', NULLIF(btrim(COALESCE(s.metadata->>'consentSentence', '')), '')
    ) ORDER BY s.signed_at, s.id) FROM public.commercial_document_signatures s
      WHERE s.proposal_id = p_proposal_id), '[]'::jsonb),
    'furnishings', CASE WHEN v_document.document_kind = 'furnishings_authorization'
      THEN jsonb_build_object(
        'documentId', v_document.id, 'waveName', v_document.wave_name,
        'proposalSendDispatchId', v_proposal.proposal_send_dispatch_id,
        'proposal_send_dispatch_id', v_proposal.proposal_send_dispatch_id,
        'sentAt', v_proposal.sent_at, 'sent_at', v_proposal.sent_at,
        'checkpointId', v_document.budget_checkpoint_id,
        'budgetCheckpointId', v_document.budget_checkpoint_id,
        'depositInvoiceId', v_document.deposit_invoice_id,
        'depositRequiredCents', COALESCE((SELECT i.total_cents
          FROM public.invoices i WHERE i.id = v_document.deposit_invoice_id),
          round(v_proposal.total_amount * v_proposal.deposit_percent / 100.0)::bigint),
        'deposit_required_cents', COALESCE((SELECT i.total_cents
          FROM public.invoices i WHERE i.id = v_document.deposit_invoice_id),
          round(v_proposal.total_amount * v_proposal.deposit_percent / 100.0)::bigint),
        'depositPaidCents', COALESCE((SELECT i.amount_paid_cents
          FROM public.invoices i WHERE i.id = v_document.deposit_invoice_id), 0),
        'deposit_paid_cents', COALESCE((SELECT i.amount_paid_cents
          FROM public.invoices i WHERE i.id = v_document.deposit_invoice_id), 0),
        'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', a.id, 'name', a.name, 'roomName', a.room_name,
          'category', a.category, 'itemType', a.item_type, 'quantity', a.quantity,
          -- 00745: additive. The rooms on the paper, from this row's frozen
          -- snapshot (00744 placements), else its one frozen room.
          'unit', line_unit.unit,
          'rooms', public._client_line_rooms(
            a.source_ffe_item_id, true, a.snapshot, a.room_name, a.quantity,
            line_unit.unit),
          'clientUnitPriceCents', a.client_unit_price_cents,
          'clientLineTotalCents', a.client_line_total_cents,
          'sourceFfeItemId', a.source_ffe_item_id, 'sortOrder', a.sort_order
        ) ORDER BY a.sort_order, a.id) FROM public.furnishing_authorization_items a
          CROSS JOIN LATERAL (
            -- 00755 (F-E4): the snapshot's unit, defaulting to 'each'.
            SELECT COALESCE(a.snapshot->>'unit', 'each') AS unit
          ) AS line_unit
          WHERE a.commercial_document_id = v_document.id), '[]'::jsonb)
      ) ELSE NULL END,
    'replacement', (SELECT jsonb_build_object(
      'id', replacement.id, 'title', replacement.title,
      'documentKind', replacement.document_kind,
      'commercialState', replacement.commercial_state
    ) FROM public.proposals replacement WHERE replacement.id = v_proposal.replacement_proposal_id)
  ) || CASE WHEN v_document.document_kind = 'trade_scope'
      -- COALESCE, not a bare subquery: `object || NULL` is NULL in jsonb, so a
      -- scope somehow missing its terms row would blank the WHOLE bundle rather
      -- than one key. create_trade_scope always writes one; this is the belt.
      THEN COALESCE((SELECT jsonb_build_object('tradeScope', jsonb_build_object(
        'documentId', v_document.id,
        'sentAt', v_proposal.sent_at, 'sent_at', v_proposal.sent_at,
        'proposalSendDispatchId', v_proposal.proposal_send_dispatch_id,
        'proposal_send_dispatch_id', v_proposal.proposal_send_dispatch_id,
        'partyDisplayName', t.party_display_name,
        'partyCompanyName', t.party_company_name,
        'partyTrade', t.party_trade,
        'clientPriceCents', t.client_price_cents,
        'currency', t.currency,
        'terms', t.terms,
        'depositInvoiceId', v_document.deposit_invoice_id,
        'sections', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', s.id, 'roomId', s.project_room_id, 'roomName', s.room_name,
          'prose', s.prose, 'allocationCents', s.allocation_cents,
          'sortOrder', s.sort_order
        ) ORDER BY s.sort_order, s.id)
          FROM public.trade_scope_sections s WHERE s.proposal_id = p_proposal_id), '[]'::jsonb),
        'draws', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', w.id, 'label', w.label, 'percentage', w.percentage,
          'amountCents', w.amount_cents, 'sortOrder', w.sort_order,
          'gatesOnAcceptance', w.gates_on_acceptance,
          'invoiceId', w.invoice_id,
          'invoiceStatus', (SELECT i.status FROM public.invoices i WHERE i.id = w.invoice_id),
          'invoicePaidCents', (SELECT i.amount_paid_cents FROM public.invoices i WHERE i.id = w.invoice_id)
        ) ORDER BY w.sort_order, w.id)
          FROM public.trade_scope_draws w WHERE w.proposal_id = p_proposal_id), '[]'::jsonb),
        'progress', jsonb_build_object(
          'state', t.progress_state,
          'engagedAt', t.engaged_at,
          'substantialCompletionAt', t.substantial_completion_at,
          -- 00425: on a PAPER acceptance this IS the date on the paper —
          -- record_paper_trade_acceptance writes `accepted_at =
          -- p_paper_signed_on::timestamptz`, i.e. midnight UTC on the day the
          -- client signed, not the moment of typing. So the acceptance leg
          -- needs no paper-date twin the way signatures do; it needs its
          -- readers to format the DATE COMPONENT and not shift it west.
          'acceptedAt', t.accepted_at,
          'acceptedSignedName', t.accepted_signed_name,
          -- 00425: acceptance recorded from a printed copy says so, and carries
          -- the page — scoped exactly like the signature scan above: shared, and
          -- still anchored to this document.
          'acceptedOnPaper', t.accepted_on_paper,
          'acceptanceScanDocumentId', (
            SELECT scan.id FROM public.project_documents scan
            WHERE scan.id = t.acceptance_scan_document_id
              AND scan.proposal_id = p_proposal_id
              AND scan.client_visible
          )
        )
      )) FROM public.trade_scope_terms t WHERE t.proposal_id = p_proposal_id),
      '{}'::jsonb)
      ELSE '{}'::jsonb END
  || CASE WHEN v_proposal.document_kind = 'design_build'
      THEN jsonb_build_object('designBuild', jsonb_build_object(
        'documentId', v_document.id,
        'subDisclosure', public._agreement_sub_disclosure(p_proposal_id),
        'draws', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'drawKey', d.draw_key, 'label', d.label,
          'grossCents', d.gross_cents, 'retainageCents', d.retainage_cents,
          'netCents', d.net_cents,
          'isRetainageRelease', d.is_retainage_release,
          'invoiceStatus', (SELECT i.status FROM public.invoices i
                            WHERE i.id = d.invoice_id),
          'paidAt', (SELECT i.paid_at FROM public.invoices i
                     WHERE i.id = d.invoice_id),
          -- The waiver EXCHANGE, as a type and a date. Never the amount, the
          -- trade's own paper, or the storage path.
          'lienWaiver', (SELECT jsonb_build_object(
              'type', w.waiver_type, 'receivedAt', w.received_at)
            FROM public.agreement_draw_lien_waivers w
            WHERE w.draw_id = d.id AND w.received_at IS NOT NULL
            ORDER BY w.received_at DESC, w.created_at DESC LIMIT 1)
        ) ORDER BY d.sort_order, d.id)
          FROM public.agreement_draw_invoices d
          WHERE d.proposal_id = p_proposal_id), '[]'::jsonb),
        'retainageHeldCents', COALESCE((
          SELECT sum(d.retainage_cents)
          FROM public.agreement_draw_invoices d
          WHERE d.proposal_id = p_proposal_id
            AND NOT d.is_retainage_release
            AND d.invoice_id IS NOT NULL), 0),
        -- R50 (W3R2-02): THE OFFER IS RE-DERIVED, NOT REMEMBERED.
        --
        -- The deposit offer used to exist only in the sign route's response,
        -- so it died with the page: a homeowner who signed, reloaded, and came
        -- back found the receipt region gone and the deposit reachable only
        -- two levels down under EARLIER INVOICES. It is a row, so it is read
        -- as one — the deposit draw, its live invoice, and that invoice's own
        -- link token, which is the same token the sign route handed this same
        -- client minutes earlier.
        --
        -- Null the moment it is settled: a paid or voided deposit is not an
        -- offer, and 'Your deposit is ready' printed over a paid one is the
        -- same ask repeated at her.
        --
        -- AND IT CARRIES NO ADDRESS (W4 r1 B-1 / QA-B2). This branch read
        -- invoice_links.token, which 00636 froze at NULL, so payToken has been
        -- NULL on every call since — and the client adapter's "every field or
        -- nothing" rule (R50) then nulled the whole offer. The address cannot
        -- be re-derived here: the stored value is a hash, and the one producer
        -- that emits a raw token (ensure_invoice_link) REVOKES the live link
        -- to mint it, which this STABLE read would do on every page load,
        -- killing the payer's own address under them. So the offer carries its
        -- invoice, its figure and its label, and the door names the letter in
        -- her letterbox instead of a /pay address it cannot honestly state.
        'depositOffer', (
          SELECT jsonb_build_object(
            'invoiceId', invoice.id,
            'amountCents', invoice.total_cents - invoice.amount_paid_cents,
            'label', d.label,
            'payToken', NULL::text)
          FROM public.agreement_draw_invoices d
          JOIN public.invoices invoice ON invoice.id = d.invoice_id
          WHERE d.proposal_id = p_proposal_id
            AND d.draw_key = 'deposit'
            AND invoice.status NOT IN ('void', 'paid')
            AND invoice.amount_paid_cents < invoice.total_cents
          LIMIT 1),
        -- R13, and the reason it is one function call rather than a join:
        -- studio_trade_agreements is created by the NEXT migration, and this
        -- body must not name a table that does not exist yet — a failed
        -- 00579 would otherwise break the bundle for every client of every
        -- kind. _agreement_design_build_subs is a stub returning [] here and
        -- is re-headed in 00579 once the table exists.
        'subs', public._agreement_design_build_subs(
          p_proposal_id, public._agreement_sub_disclosure(p_proposal_id))
      ))
      ELSE '{}'::jsonb END;
END;
$$;

COMMENT ON FUNCTION public.get_client_commercial_document_bundle(uuid) IS
  'The homeowner''s (or a studio co-member''s) read of one commercial document: the paper, its signatures, and the arm its kind names. designBuild.depositOffer carries the live deposit invoice, its figure and its label, and payToken NULL — since 00636 invoice_links stores only a hash, and this function is STABLE so it may not call the revoking minter (00638). 00745: each furnishings item carries unit and rooms [{name, quantity, unit}] from its frozen snapshot; roomName stays the primary room.';
REVOKE ALL ON FUNCTION public.get_client_commercial_document_bundle(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_commercial_document_bundle(uuid)
  TO authenticated;

COMMIT;
