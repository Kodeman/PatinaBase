-- ═══════════════════════════════════════════════════════════════════════════
-- 00754 — One line in several rooms, phase 3: receiving by room
--         (US-21 slice 4, W5; D7 phase 3; T-48, SQ-654)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRACT §2 W5 "00754" (artifacts/pieces-building-room-2026-10-08/build/
-- CONTRACT.md); direction.md §3.4 D7 case 2; ruling Q4 (three phases).
--
-- CREATE OR REPLACE bases:
--   public.record_project_ffe_receipt_batch  00493:83 (00447's validation
--     wrapper over _record_project_ffe_receipt_batch_00446_impl, 00446:19;
--     not redefined since). Full copy plus the change below.
--   public.set_line_placements               00737:841 (the newest body; the
--     contract names its first definer, 00734:133). Full copy plus the change.
-- Adds GRANT/REVOKE → regenerate supabase/seed/00-legacy-grants.sql (the W5
-- reset owner, T-49, does it; CONTRACT §4).
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- project_ffe_placement_receipts
--   One row per (room placement, receiving inspection): how much of that
--   delivery went to that room. receipt_batch_id is the receiving inspection
--   the batch created (receiving_inspections.id, returned as inspectionId).
--   project_ffe_items.received_quantity stays the one integer on the line
--   (D7 case 2); these rows only say where it went.
--
-- record_project_ffe_receipt_batch
--   Each p_lines element may carry placements:[{placementId, quantity}].
--   The line's receipt for this batch is receivedQuantity minus the line's
--   received_quantity before the batch.
--   - Given: every placementId is one of this line's placements, each room
--     at most once, quantity a whole number > 0; the given total is at most
--     this batch's receipt, and no room receives more than is placed there.
--     An empty list rooms nothing.
--   - Absent: the receipt fills the placements in sort_order, each up to what
--     it still lacks (its quantity minus its earlier receipts). What is left
--     over (the waste, 913 over 830) is in no room.
--   - A line without placements records nothing here.
--   - A reused (idempotent) request allocates nothing again.
--   The `placements` key is stripped before the 00446 impl, whose key
--   allow-list and request hash are unchanged. The PO row is locked before the
--   pre-batch quantities are read, the same lock the impl takes first, so two
--   batches on one PO cannot interleave.
--
-- set_line_placements
--   The "primary room is fixed while the line is on an order" refusal is
--   lifted (00734 named this file as the lift). A primary-room change on a
--   PO is recorded in project_ffe_placement_events like any locked change.
--   A room kept across edits keeps its placement id and so its receipts; a
--   room dropped from the set takes its receipt rows with it (ON DELETE
--   CASCADE, as specified).
--
-- ── ACCESS ──────────────────────────────────────────────────────────────────
-- project_ffe_placement_receipts: SELECT TO authenticated when the placement's
-- project passes can_buy_for_project (00702:60). No client policy: a client
-- JWT reads 0 rows. INSERT, UPDATE and DELETE are revoked from authenticated
-- and anon; the only writer is record_project_ffe_receipt_batch (SECURITY
-- DEFINER; its impl gates _ffe_require_studio_project, 00717:75).
--
-- Idempotent: CREATE TABLE / INDEX IF NOT EXISTS, DROP POLICY IF EXISTS,
-- CREATE OR REPLACE FUNCTION.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. project_ffe_placement_receipts ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_ffe_placement_receipts (
  id               uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  placement_id     uuid        NOT NULL REFERENCES public.project_ffe_placements(id) ON DELETE CASCADE,
  receipt_batch_id uuid        NOT NULL REFERENCES public.receiving_inspections(id) ON DELETE CASCADE,
  quantity         integer     NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_ffe_placement_receipts_quantity_check CHECK (quantity > 0),
  CONSTRAINT project_ffe_placement_receipts_placement_batch_key UNIQUE (placement_id, receipt_batch_id)
);

CREATE INDEX IF NOT EXISTS idx_project_ffe_placement_receipts_batch
  ON public.project_ffe_placement_receipts (receipt_batch_id);

COMMENT ON TABLE public.project_ffe_placement_receipts IS
  'How much of one receiving batch (receiving_inspections.id) went to one room placement (00754, D7 phase 3). '
  'project_ffe_items.received_quantity stays the one integer on the line. Read: can_buy_for_project via the '
  'placement. Written only by record_project_ffe_receipt_batch.';

ALTER TABLE public.project_ffe_placement_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_ffe_placement_receipts_studio_select ON public.project_ffe_placement_receipts;
CREATE POLICY project_ffe_placement_receipts_studio_select ON public.project_ffe_placement_receipts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.project_ffe_placements placement
    WHERE placement.id = project_ffe_placement_receipts.placement_id
      AND public.can_buy_for_project(placement.project_id)
  ));

REVOKE ALL ON TABLE public.project_ffe_placement_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.project_ffe_placement_receipts TO authenticated;
GRANT SELECT, INSERT ON TABLE public.project_ffe_placement_receipts TO service_role;

-- ─── 2. record_project_ffe_receipt_batch (base 00493:83) ────────────────────

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

COMMENT ON FUNCTION public.record_project_ffe_receipt_batch(
  uuid, jsonb, public.receiving_inspection_outcome, text, uuid[]
) IS
  'Validates receiving photo assets against whichever svc_media asset shape this '
  'database carries (00053 snake_case or Prisma "MediaAsset"), then delegates to '
  'the 00446 implementation. See 00493. 00754: each line may carry '
  'placements:[{placementId, quantity}]; the batch''s receipt per line goes to those '
  'rooms as given, else fills the placements in sort_order. received_quantity stays '
  'the one integer on the line; the rooms are in project_ffe_placement_receipts.';

REVOKE ALL ON FUNCTION public.record_project_ffe_receipt_batch(
  uuid, jsonb, public.receiving_inspection_outcome, text, uuid[]
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_project_ffe_receipt_batch(
  uuid, jsonb, public.receiving_inspection_outcome, text, uuid[]
) TO authenticated;

-- ─── 3. set_line_placements (base 00737:841) ────────────────────────────────

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
BEGIN
  IF p_placements IS NULL OR jsonb_typeof(p_placements) <> 'array' THEN
    RAISE EXCEPTION 'Placements are a list of rooms.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_item
  FROM public.project_ffe_items
  WHERE id = p_ffe_item_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'line not found' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public._ffe_require_studio_project(v_item.project_id);

  -- 00737 (F13): a removed line has no rooms to change.
  IF v_item.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This line was removed.' USING ERRCODE = 'check_violation';
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

COMMENT ON FUNCTION public.set_line_placements(uuid, jsonb) IS
  'Replaces the rooms a line is placed in (00734, D7 phase 1): [{roomId, quantity, areaNote?}]. '
  'Rooms in the line''s project, whole quantities > 0, sum <= line quantity. The first room is primary '
  '(project_room_id, assignment_scope room); [] keeps the primary and clears the rows. After release or a '
  'PO the change is recorded in project_ffe_placement_events. Never writes quantity, unit or money. '
  'Returns {placements, wasteQuantity}. 00737: refuses a removed line, and a labor line in a room its '
  'piece is neither assigned to nor placed in. 00754: the primary room may change while on a PO.';

REVOKE ALL ON FUNCTION public.set_line_placements(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_line_placements(uuid, jsonb) TO authenticated;
