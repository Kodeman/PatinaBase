-- 00880 — Bounded readiness transport; singleton remains the rule/authority owner.
-- Lineage: get_project_ffe_readiness 00834 (unchanged by external parity 00876).
-- Preserve order and duplicates. Each input has either exact singleton JSON or
-- a typed refusal, never fabricated ready=false or aggregate success. text[]
-- permits malformed IDs to fail individually rather than rejecting the RPC cast.
-- Read-only, no row locks, no activation: all API execution remains revoked.

CREATE OR REPLACE FUNCTION public.get_project_ffe_readiness_batch(p_ffe_item_ids text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_input text;
  v_id uuid;
  v_result jsonb := '[]'::jsonb;
  v_readiness jsonb;
  v_error jsonb;
BEGIN
  IF p_ffe_item_ids IS NULL
     OR cardinality(p_ffe_item_ids) > 100
     OR COALESCE(array_ndims(p_ffe_item_ids), 1) <> 1 THEN
    RAISE EXCEPTION 'readiness batch requires a one-dimensional array of at most 100 IDs'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOREACH v_input IN ARRAY p_ffe_item_ids LOOP
    v_readiness := NULL;
    v_error := NULL;
    BEGIN
      IF v_input IS NULL THEN
        RAISE EXCEPTION 'selection ID must not be null'
          USING ERRCODE = 'invalid_text_representation';
      END IF;
      v_id := v_input::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'selectionId', v_input, 'readiness', NULL,
        'error', jsonb_build_object('code', SQLSTATE, 'message', SQLERRM)));
      CONTINUE;
    END;

    BEGIN
      v_readiness := public.get_project_ffe_readiness(v_id);
    EXCEPTION WHEN no_data_found OR insufficient_privilege THEN
      v_error := jsonb_build_object('code', SQLSTATE, 'message', SQLERRM);
    END;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'selectionId', v_input, 'readiness', v_readiness, 'error', v_error));
  END LOOP;
  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_project_ffe_readiness_batch(text[])
  FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.get_project_ffe_readiness_batch(text[]) IS
  'Inactive readiness transport: 0–100 ordered IDs, duplicates retained. Each entry has '
  'selectionId (input), readiness (exact singleton JSON or null), error (SQLSTATE/message '
  'or null). NULL/malformed IDs fail individually; NULL/multidimensional/oversize arrays '
  'raise 22023. Unexpected singleton failures abort. No rules, locks or grants added.';
