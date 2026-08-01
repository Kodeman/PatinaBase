-- ═══════════════════════════════════════════════════════════════════════════
-- 00389 — Atomic proposal-board duplication and palette-swatch ordering
--
-- Reconciles two browser-side multi-write flows that could persist partial
-- client-copy state:
--   • duplicate board inserted the header before copying its items;
--   • swatch reorder updated one row per request.
--
-- Both mutations now execute as one PostgreSQL transaction. SECURITY DEFINER
-- is required so an active design-studio peer can author beside the proposal's
-- exact designer even though the historical table RLS policies only name the
-- exact designer. Authority remains explicit through the private 00387
-- _can_author_proposal helper (exact owner or active, non-guest co-membership
-- in an active design_studio). The RPCs independently validate every supplied
-- parent/child relationship and expose EXECUTE only to authenticated callers.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.duplicate_proposal_board(
  p_proposal_id uuid,
  p_board_id uuid
)
RETURNS public.proposal_boards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_proposal public.proposals%ROWTYPE;
  v_source public.proposal_boards%ROWTYPE;
  v_new_board public.proposal_boards%ROWTYPE;
  v_next_sort_order integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'duplicate_proposal_board requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The parent lock serializes copies within this proposal and prevents a
  -- concurrent parent delete while the complete child graph is validated.
  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_proposal.designer_id) THEN
    RAISE EXCEPTION
      'duplicate_proposal_board: proposal % not found or access denied',
      p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A proposal copy may never be sourced from a project-owned board or from a
  -- board attached to a different proposal.
  SELECT * INTO v_source
  FROM public.proposal_boards
  WHERE id = p_board_id
    AND proposal_id = p_proposal_id
    AND project_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'duplicate_proposal_board: board % does not belong to proposal %',
      p_board_id, p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_source.scope_room_id IS NOT NULL THEN
    PERFORM 1
    FROM public.proposal_scope_rooms AS room
    WHERE room.id = v_source.scope_room_id
      AND room.proposal_id = p_proposal_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'duplicate_proposal_board: board scope room does not belong to proposal %',
        p_proposal_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Freeze the exact item snapshot. The board FOR UPDATE lock also blocks new
  -- FK children until this transaction ends; these row locks block edits to
  -- existing items while validation and INSERT ... SELECT run.
  PERFORM 1
  FROM public.proposal_board_items AS item
  WHERE item.board_id = p_board_id
  ORDER BY item.id
  FOR UPDATE;

  -- Stabilize referenced proposal-scoped rows too. Without these locks a
  -- concurrent author could move a palette/capture to another proposal after
  -- validation but before the copied item rows are inserted.
  PERFORM 1
  FROM public.proposal_palettes AS palette
  WHERE palette.id IN (
    SELECT item.palette_id
    FROM public.proposal_board_items AS item
    WHERE item.board_id = p_board_id
      AND item.palette_id IS NOT NULL
  )
  ORDER BY palette.id
  FOR UPDATE;

  PERFORM 1
  FROM public.proposal_captures AS capture
  WHERE capture.id IN (
    SELECT item.capture_id
    FROM public.proposal_board_items AS item
    WHERE item.board_id = p_board_id
      AND item.capture_id IS NOT NULL
  )
  ORDER BY capture.id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.proposal_board_items AS item
    LEFT JOIN public.proposal_palettes AS palette
      ON palette.id = item.palette_id
    WHERE item.board_id = p_board_id
      AND item.palette_id IS NOT NULL
      AND (
        palette.id IS NULL
        OR palette.proposal_id IS DISTINCT FROM p_proposal_id
      )
  ) THEN
    RAISE EXCEPTION
      'duplicate_proposal_board: board contains a palette from another proposal'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.proposal_board_items AS item
    LEFT JOIN public.proposal_captures AS capture
      ON capture.id = item.capture_id
    WHERE item.board_id = p_board_id
      AND item.capture_id IS NOT NULL
      AND (
        capture.id IS NULL
        OR capture.proposal_id IS DISTINCT FROM p_proposal_id
      )
  ) THEN
    RAISE EXCEPTION
      'duplicate_proposal_board: board contains a capture from another proposal'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(max(board.sort_order), -1) + 1
  INTO v_next_sort_order
  FROM public.proposal_boards AS board
  WHERE board.proposal_id = p_proposal_id;

  INSERT INTO public.proposal_boards (
    proposal_id,
    project_id,
    name,
    scope_room_id,
    cover_image_url,
    canvas_width,
    canvas_height,
    background_color,
    sort_order,
    sections,
    status
  ) VALUES (
    p_proposal_id,
    NULL,
    v_source.name || ' (Copy)',
    v_source.scope_room_id,
    v_source.cover_image_url,
    v_source.canvas_width,
    v_source.canvas_height,
    v_source.background_color,
    v_next_sort_order,
    v_source.sections,
    'active'
  )
  RETURNING * INTO v_new_board;

  INSERT INTO public.proposal_board_items (
    board_id,
    type,
    x,
    y,
    width,
    height,
    z_index,
    rotation,
    locked,
    product_id,
    capture_id,
    palette_id,
    image_url,
    content,
    data
  )
  SELECT
    v_new_board.id,
    item.type,
    item.x,
    item.y,
    item.width,
    item.height,
    item.z_index,
    item.rotation,
    item.locked,
    item.product_id,
    item.capture_id,
    item.palette_id,
    item.image_url,
    item.content,
    item.data
  FROM public.proposal_board_items AS item
  WHERE item.board_id = p_board_id
  ORDER BY item.id;

  RETURN v_new_board;
END;
$$;

REVOKE ALL ON FUNCTION public.duplicate_proposal_board(uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.duplicate_proposal_board(uuid, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.duplicate_proposal_board(uuid, uuid) IS
  'Atomically duplicates one proposal-owned board and its exact item snapshot. '
  'Authorized for the proposal designer or an active non-guest peer in the '
  'same active design_studio; rejects cross-proposal child relationships.';


CREATE OR REPLACE FUNCTION public.reorder_palette_swatches(
  p_proposal_id uuid,
  p_palette_id uuid,
  p_ordered_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_proposal public.proposals%ROWTYPE;
  v_palette public.proposal_palettes%ROWTYPE;
  v_ids uuid[] := COALESCE(p_ordered_ids, ARRAY[]::uuid[]);
  v_expected integer;
  v_distinct integer;
  v_actual integer;
  v_matched integer;
  v_updated integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'reorder_palette_swatches requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_proposal.designer_id) THEN
    RAISE EXCEPTION
      'reorder_palette_swatches: proposal % not found or access denied',
      p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Locking the palette blocks concurrent FK inserts, making the exact-set
  -- cardinality check stable through the single-statement update.
  SELECT * INTO v_palette
  FROM public.proposal_palettes
  WHERE id = p_palette_id
    AND proposal_id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'reorder_palette_swatches: palette % does not belong to proposal %',
      p_palette_id, p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.palette_swatches AS swatch
  WHERE swatch.palette_id = p_palette_id
  ORDER BY swatch.id
  FOR UPDATE;

  v_expected := cardinality(v_ids);

  IF array_position(v_ids, NULL::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'reorder_palette_swatches: ordering contains a null id'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(DISTINCT supplied.id)
  INTO v_distinct
  FROM unnest(v_ids) AS supplied(id);

  IF v_distinct <> v_expected THEN
    RAISE EXCEPTION
      'reorder_palette_swatches: ordering contains duplicate ids'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*)
  INTO v_actual
  FROM public.palette_swatches AS swatch
  WHERE swatch.palette_id = p_palette_id;

  SELECT count(*)
  INTO v_matched
  FROM public.palette_swatches AS swatch
  WHERE swatch.palette_id = p_palette_id
    AND swatch.id = ANY(v_ids);

  IF v_expected <> v_actual OR v_matched <> v_actual THEN
    RAISE EXCEPTION
      'reorder_palette_swatches: ordering must contain the exact palette swatch set (% supplied, % matched, % required)',
      v_expected, v_matched, v_actual
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.palette_swatches AS swatch
  SET sort_order = supplied.ordinality - 1
  FROM unnest(v_ids) WITH ORDINALITY AS supplied(id, ordinality)
  WHERE swatch.id = supplied.id
    AND swatch.palette_id = p_palette_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_actual THEN
    RAISE EXCEPTION
      'reorder_palette_swatches: atomic update changed % of % rows',
      v_updated, v_actual
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_palette_swatches(uuid, uuid, uuid[])
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reorder_palette_swatches(uuid, uuid, uuid[])
  TO authenticated;

COMMENT ON FUNCTION public.reorder_palette_swatches(uuid, uuid, uuid[]) IS
  'Atomically assigns zero-based sort_order to the exact swatch set of one '
  'proposal palette. Rejects duplicate, null, missing, extra, and foreign ids; '
  'authorized for the proposal designer or an active design-studio peer.';
