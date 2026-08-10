-- 00442 — Route canonical configured placement through the existing trusted configuration guard.

ALTER FUNCTION public.place_product_in_project_v2(jsonb)
  RENAME TO _place_product_in_project_v2_00441_wrapper;
REVOKE ALL ON FUNCTION public._place_product_in_project_v2_00441_wrapper(jsonb)
FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.place_product_in_project_v2(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_previous text:=current_setting('patina.configuration_spec_workflow',true); v_result jsonb;
BEGIN
  IF NULLIF(p_request->>'configurationId','') IS NOT NULL THEN
    PERFORM set_config('patina.configuration_spec_workflow','00403',true);
  END IF;
  v_result:=public._place_product_in_project_v2_00441_wrapper(p_request);
  PERFORM set_config('patina.configuration_spec_workflow',COALESCE(v_previous,''),true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('patina.configuration_spec_workflow',COALESCE(v_previous,''),true);
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.place_product_in_project_v2(jsonb)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.place_product_in_project_v2(jsonb) TO authenticated;
