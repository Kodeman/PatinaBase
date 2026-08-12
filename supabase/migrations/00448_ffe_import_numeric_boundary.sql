-- Materialized 2026-08-12 from Strata's migration ledger (applied out-of-band; git had no source file). Do not re-run manually.

-- 00448 — Reject spreadsheet quantities before the legacy normalizer casts them.

ALTER FUNCTION public.stage_project_ffe_import(jsonb)
  RENAME TO _stage_project_ffe_import_00447_impl;

REVOKE ALL ON FUNCTION public._stage_project_ffe_import_00447_impl(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.stage_project_ffe_import(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF jsonb_typeof(p_request->'rows') IS DISTINCT FROM 'array' OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_request->'rows') row
    WHERE row->>'quantity' ~ '^[1-9][0-9]*$' AND (
      length(row->>'quantity') > 10
      OR (row->>'quantity')::numeric > 2147483647
    )
  ) THEN
    RAISE EXCEPTION 'import quantity must be a positive 32-bit integer'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN public._stage_project_ffe_import_00447_impl(p_request);
END;
$$;

REVOKE ALL ON FUNCTION public.stage_project_ffe_import(jsonb)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.stage_project_ffe_import(jsonb)
  TO authenticated;
