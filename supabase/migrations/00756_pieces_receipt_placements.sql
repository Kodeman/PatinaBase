-- ═══════════════════════════════════════════════════════════════════════════
-- 00756: the line-by-line check-in names the rooms a delivery covers
-- (US-21 T-54, SQ-660; D7 phase 3, case 2)
--
-- record_project_ffe_inspection   base 00700:373 (the only body; 00754 did not
--                                  touch it)
--
-- The desktop receiving drawer sends a condition on every line, so every
-- desktop receipt goes through record_project_ffe_inspection. Its key
-- allow-list refused the 00754 `placements` key, so the drawer could never
-- say which rooms a delivery covered. This body is 00700's, verbatim, with
-- two changes:
--   1. `placements` joins the line-key allow-list. The pass-through to
--      record_project_ffe_receipt_batch already strips only condition and
--      notedOnBol, so the key reaches the 00754 allocation unchanged. The
--      batch checks its shape, that each room is one of the line's
--      placements, and that no room receives more than is placed there.
--   2. A line that names its rooms must account for the whole delivery: the
--      rooms add up to this delivery's receipt for the line (receivedQuantity
--      minus the line's received_quantity before the batch). When the rooms
--      cannot take that much (the waste, 913 over 830), they add up to all
--      they still lack. A reused request is not re-checked; it allocated when
--      it first ran.
-- A line without `placements` keeps the placement-order allocation (00754).
-- Same signature, so the grants and the generated types are unchanged.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.record_project_ffe_inspection(
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
AS $$
DECLARE
  v_result jsonb;
  v_inspection_id uuid;
  -- 00756: the rooms add up to the delivery.
  v_received_before jsonb;
  v_entry jsonb;
  v_item_id uuid;
  v_receipt bigint;
  v_given_total bigint;
  v_lacking bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'record_project_ffe_inspection: authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_lines) = 0
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_lines) entry
                WHERE jsonb_typeof(entry) IS DISTINCT FROM 'object') THEN
    RAISE EXCEPTION 'record_project_ffe_inspection: lines must be a nonempty array of objects'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) entry
    WHERE jsonb_typeof(entry->'condition') IS DISTINCT FROM 'string'
       OR entry->>'condition' NOT IN ('good', 'damaged', 'short', 'wrong')
       OR (entry ? 'notedOnBol' AND jsonb_typeof(entry->'notedOnBol') <> 'boolean')
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(entry) AS key
                  WHERE key NOT IN ('selectionId', 'receivedQuantity', 'condition', 'notedOnBol', 'placements'))
  ) THEN
    RAISE EXCEPTION 'record_project_ffe_inspection: each line takes selectionId, receivedQuantity, a condition of good, damaged, short or wrong, an optional boolean notedOnBol and optional placements'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_outcome = 'clean' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) entry WHERE entry->>'condition' <> 'good'
  ) THEN
    RAISE EXCEPTION 'record_project_ffe_inspection: a clean receipt requires every line in good condition'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00756: each roomed line's count before this delivery. Read only to size
  -- the delivery once the batch below has passed its access checks.
  SELECT COALESCE(jsonb_object_agg(item.id::text, COALESCE(item.received_quantity, 0)), '{}'::jsonb)
  INTO v_received_before
  FROM public.project_ffe_items item
  WHERE item.purchase_order_id = p_purchase_order_id
    AND item.id::text IN (SELECT entry->>'selectionId'
                            FROM jsonb_array_elements(p_lines) entry
                           WHERE entry ? 'placements');

  -- Access, PO state, counts, photos and idempotency stay with the batch RPC.
  v_result := public.record_project_ffe_receipt_batch(
    p_purchase_order_id,
    (SELECT jsonb_agg(entry - ARRAY['condition', 'notedOnBol']) FROM jsonb_array_elements(p_lines) entry),
    p_outcome,
    p_notes,
    p_photo_asset_ids
  );
  v_inspection_id := (v_result->>'inspectionId')::uuid;

  -- 00756: a line that names its rooms names the whole delivery.
  IF NOT COALESCE((v_result->>'reused')::boolean, false) THEN
    FOR v_entry IN
      SELECT entry FROM jsonb_array_elements(p_lines) entry WHERE entry ? 'placements'
    LOOP
      v_item_id := (v_entry->>'selectionId')::uuid;
      v_receipt := (v_entry->>'receivedQuantity')::bigint
                   - COALESCE((v_received_before->>v_item_id::text)::bigint, 0);
      SELECT COALESCE(sum((given->>'quantity')::bigint), 0) INTO v_given_total
        FROM jsonb_array_elements(v_entry->'placements') given;
      -- What the rooms lacked before this batch.
      SELECT COALESCE(sum(GREATEST(placement.quantity - COALESCE((
               SELECT sum(earlier.quantity)
                 FROM public.project_ffe_placement_receipts earlier
                WHERE earlier.placement_id = placement.id
                  AND earlier.receipt_batch_id <> v_inspection_id), 0), 0)), 0)
        INTO v_lacking
        FROM public.project_ffe_placements placement
       WHERE placement.ffe_item_id = v_item_id;
      IF v_given_total <> LEAST(GREATEST(v_receipt, 0), v_lacking) THEN
        RAISE EXCEPTION 'The rooms add up to %, but this delivery brought % to place.',
          v_given_total, LEAST(GREATEST(v_receipt, 0), v_lacking)
          USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
  END IF;

  IF EXISTS (SELECT 1 FROM public.receiving_inspection_lines WHERE inspection_id = v_inspection_id) THEN
    -- A replay of a receipt already recorded: the lines must agree.
    IF EXISTS (
      SELECT 1
      FROM (SELECT (entry->>'selectionId')::uuid AS ffe_item_id,
                   entry->>'condition' AS condition,
                   COALESCE((entry->>'notedOnBol')::boolean, false) AS noted_on_bol
              FROM jsonb_array_elements(p_lines) entry) AS requested
      FULL JOIN (SELECT ffe_item_id, condition, noted_on_bol
                   FROM public.receiving_inspection_lines
                  WHERE inspection_id = v_inspection_id) AS stored
        ON stored.ffe_item_id = requested.ffe_item_id
      WHERE requested.ffe_item_id IS NULL
         OR stored.ffe_item_id IS NULL
         OR stored.condition <> requested.condition
         OR stored.noted_on_bol <> requested.noted_on_bol
    ) THEN
      RAISE EXCEPTION 'record_project_ffe_inspection: this receipt was already recorded with different line conditions'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    INSERT INTO public.receiving_inspection_lines (
      inspection_id, ffe_item_id, received_quantity, condition, noted_on_bol
    )
    SELECT v_inspection_id,
           (entry->>'selectionId')::uuid,
           (entry->>'receivedQuantity')::integer,
           entry->>'condition',
           COALESCE((entry->>'notedOnBol')::boolean, false)
      FROM jsonb_array_elements(p_lines) entry;
  END IF;

  RETURN v_result || jsonb_build_object('lines', (
    SELECT jsonb_agg(line || jsonb_build_object(
             'condition', recorded.condition,
             'notedOnBol', recorded.noted_on_bol
           ) ORDER BY line->>'selectionId')
      FROM jsonb_array_elements(v_result->'lines') AS line
      LEFT JOIN public.receiving_inspection_lines AS recorded
        ON recorded.inspection_id = v_inspection_id
       AND recorded.ffe_item_id = (line->>'selectionId')::uuid
  ));
END;
$$;

COMMENT ON FUNCTION public.record_project_ffe_inspection(uuid, jsonb, public.receiving_inspection_outcome, text, uuid[]) IS
  'Check in a delivery line by line (00700, C-19; 00756): each line carries selectionId, receivedQuantity, '
  'condition (good | damaged | short | wrong), an optional notedOnBol and optional placements '
  '[{placementId, quantity}] naming the rooms this delivery covers, which must add up to the delivery '
  '(or to all the rooms still lack). Delegates the receipt and the room allocation to '
  'record_project_ffe_receipt_batch (access, PO state, counts, photos, idempotency, 00754 rooms), then '
  'records receiving_inspection_lines. A clean outcome requires every line good; a replay must match the '
  'stored lines.';
