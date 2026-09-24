-- ═══════════════════════════════════════════════════════════════════════════
-- 00664 — Capture enrichment suggests a vendor and SKU; it no longer writes
--         them onto the capture
-- Lineage:
--   record_capture_enrichment_result  00515 → here. The 00515 body is copied
--     verbatim. The only change is to the allowlist: 'vendor_name' and 'sku'
--     are removed from it. Nothing else redefines this function (grep of
--     CREATE OR REPLACE FUNCTION ... record_capture_enrichment_result).
-- Reconciles: 00515:224-229 and :250. A 'ready' run wrote a suggested
--   vendor_name/sku into an empty field_captures column. Afterwards, any
--   non-empty value was treated as designer-typed, so the model's guess could
--   not be told apart from what the designer typed.
--
-- Ruling D7b (artifacts/ios27-delivery-plan-2026-09-23/plan/DELIVERY-PLAN.md):
--   enrichment's vendor/SKU is a suggestion that needs confirming, under the
--   per-row confirmation rule D7 set for the extractor (00661, SQ-202).
--
-- Why this does not reuse 00661's envelope:
--   00661 needs an envelope because a staged import row holds the model's
--   reading and the designer's decision on the same row. Its validation_errors
--   gate then refuses a commit until a decision arrives. A field capture has
--   neither a staging row nor a commit gate. The model's reading already has
--   its own column, capture_enrichment_runs.suggestions, which 00514 defines
--   as suggestion-only and never confirmed. This migration applies the same
--   separation: the suggestion stays on the ledger, and only the designer
--   writes field_captures.vendor_name / sku. Today the designer writes them
--   through commit_field_capture's tag.vendorName / tag.sku. To confirm a
--   suggestion, the designer's own write carries the value.
--
-- Unchanged: 'category', 'subcategory' and 'finish' still prefill an empty
--   column, because D7b covers vendor/SKU only. Proposal-capture targets and
--   'failed' runs still write nothing. The signature, SECURITY DEFINER, the
--   search_path and the ACL do not change. CREATE OR REPLACE keeps 00515's
--   REVOKE/GRANT, so no GRANT/REVOKE statements appear here and
--   seed/00-legacy-grants.sql does not need regenerating. The DO block below
--   checks the ACL.
--
-- Existing data is NOT rewritten. A vendor_name/sku that enrichment already
--   wrote looks the same as one the designer typed. The device's own value is
--   recorded in field_captures.raw_payload -> tag, so a later backfill could
--   look for rows where the column equals a 'ready' run's suggestion AND
--   raw_payload's tag is missing that value. A direct owner UPDATE under RLS
--   also bypasses raw_payload, though, so that test cannot prove a row was
--   auto-filled. A backfill needs a ruling first.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.record_capture_enrichment_result(
  p_run_id         uuid,
  p_suggestions    jsonb,
  p_model_metadata jsonb,
  p_status         text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_run       public.capture_enrichment_runs%ROWTYPE;
  v_key       text;
  -- 00664 (D7b): 'vendor_name' and 'sku' are suggestion-only. They stay in
  -- capture_enrichment_runs.suggestions and are never written to the capture.
  v_allowed   CONSTANT text[] := ARRAY['category', 'subcategory', 'finish'];
  v_sql       text;
BEGIN
  IF p_status NOT IN ('ready', 'failed') THEN
    RAISE EXCEPTION 'record_capture_enrichment_result: p_status must be ready or failed, got %', p_status
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_run
    FROM public.capture_enrichment_runs
   WHERE id = p_run_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_capture_enrichment_result: run % not found', p_run_id
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.capture_enrichment_runs
     SET status         = p_status,
         suggestions    = COALESCE(p_suggestions, '{}'::jsonb),
         model_metadata = COALESCE(p_model_metadata, '{}'::jsonb)
   WHERE id = p_run_id;

  IF p_status = 'ready'
     AND v_run.target_type = 'field_capture'
     AND p_suggestions IS NOT NULL
     AND jsonb_typeof(p_suggestions) = 'object'
  THEN
    FOR v_key IN SELECT jsonb_object_keys(p_suggestions)
    LOOP
      IF v_key = ANY (v_allowed) AND jsonb_typeof(p_suggestions -> v_key) = 'string' THEN
        -- %1$I is the allowlisted, validated column name — never raw user
        -- input passed straight to format(). The WHERE guard is the
        -- never-overwrite enforcement point (see anti-vacuity test in
        -- supabase/tests/capture_enrichment/).
        v_sql := format(
          'UPDATE public.field_captures SET %1$I = $1, updated_at = now() ' ||
          'WHERE id = $2 AND (%1$I IS NULL OR %1$I = '''')',
          v_key
        );
        EXECUTE v_sql USING (p_suggestions ->> v_key), v_run.target_id;
      END IF;
    END LOOP;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.record_capture_enrichment_result(uuid, jsonb, jsonb, text) IS
  'Records a capture enrichment run''s outcome and its suggestions. For a ready '
  'field_capture run, only category/subcategory/finish may fill an empty column. '
  'vendor_name and sku are suggestion-only (00664, ruling D7b): they stay in '
  'capture_enrichment_runs.suggestions, and only the designer writes them onto '
  'the capture.';

-- ─── ACL self-verification (unchanged from 00515) ───────────────────────────
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.record_capture_enrichment_result(uuid, jsonb, jsonb, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: anon must not have EXECUTE on record_capture_enrichment_result';
  END IF;
  IF has_function_privilege('authenticated', 'public.record_capture_enrichment_result(uuid, jsonb, jsonb, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: authenticated must not have EXECUTE on record_capture_enrichment_result';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.record_capture_enrichment_result(uuid, jsonb, jsonb, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: service_role must have EXECUTE on record_capture_enrichment_result';
  END IF;
END $$;

COMMIT;
