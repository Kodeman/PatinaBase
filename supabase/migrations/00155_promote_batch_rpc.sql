-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00155: promote_batch_to_studio
--
-- Atomic bulk promotion. Loops over an array of per-product input objects
-- and delegates each item to `promote_to_studio` (from 00154). Because
-- PL/pgSQL functions are themselves transactional, any item that raises
-- rolls back the entire batch — exactly the all-or-nothing semantics the
-- PRD §5.4 BulkPromoteToStudioModal "Promote N items" button calls for.
--
-- Skip-needs-info mode (PRD: "each successfully-promoted item commits
-- independently") is handled client-side by issuing N single-item
-- promote_to_studio RPC calls instead of routing through this batch
-- function. That keeps the SQL surface small.
--
-- Input shape (JSONB array):
--   [
--     {
--       "product_id":      "uuid",
--       "studio_id":       "uuid",
--       "vendor_contact":  { "name": "...", "email": "...", "phone": null },
--       "payment_terms":   "net_30",
--       "category":        "lighting",
--       "subcategory":     null,
--       "usage_notes":     "Studio-wide note",
--       "lead_time_weeks": 8
--     }, …
--   ]
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION promote_batch_to_studio(p_items JSONB)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor    UUID := auth.uid();
  v_item     JSONB;
  v_result   UUID;
  v_ids      UUID[] := ARRAY[]::UUID[];
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'promote_batch_to_studio: unauthenticated';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'promote_batch_to_studio: items must be a JSON array';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RETURN v_ids;
  END IF;

  -- Soft cap: PRD §16 open question recommends 200 hard / 50 soft.
  -- Hard-fail above 200 — it's almost certainly a UI bug.
  IF jsonb_array_length(p_items) > 200 THEN
    RAISE EXCEPTION 'promote_batch_to_studio: batch too large (%, max 200)', jsonb_array_length(p_items);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_result := promote_to_studio(
      p_product_id      => (v_item ->> 'product_id')::UUID,
      p_studio_id       => (v_item ->> 'studio_id')::UUID,
      p_vendor_contact  => v_item -> 'vendor_contact',
      p_payment_terms   =>  v_item ->> 'payment_terms',
      p_category        =>  v_item ->> 'category',
      p_usage_notes     =>  v_item ->> 'usage_notes',
      p_lead_time_weeks => (v_item ->> 'lead_time_weeks')::INTEGER,
      p_subcategory     =>  v_item ->> 'subcategory'
    );
    v_ids := array_append(v_ids, v_result);
  END LOOP;

  RETURN v_ids;
END;
$$;

REVOKE ALL      ON FUNCTION promote_batch_to_studio FROM PUBLIC;
GRANT EXECUTE   ON FUNCTION promote_batch_to_studio TO authenticated;

COMMENT ON FUNCTION promote_batch_to_studio IS
  'Atomic bulk personal→studio promotion. Delegates each item to promote_to_studio; any failure rolls back the entire batch. Hard caps at 200 items per call.';

COMMIT;
