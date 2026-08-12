-- Materialized from Strata's migration ledger (applied out-of-band 2026-08-10;
-- git had no source file on main). Do not re-run manually.
-- 00440 — Fix-forward trigger polymorphism and release-command edge cases.

CREATE OR REPLACE FUNCTION public.guard_ffe_media_project_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $$
DECLARE v_row jsonb:=to_jsonb(NEW); v_project_id uuid:=(v_row->>'project_id')::uuid;
  v_related_id uuid; v_related_project uuid;
BEGIN
  IF TG_TABLE_NAME='project_ffe_media_assets' THEN
    v_related_id:=NULLIF(v_row->>'ffe_item_id','')::uuid;
    IF v_related_id IS NULL THEN RETURN NEW; END IF;
    SELECT project_id INTO v_related_project FROM public.project_ffe_items WHERE id=v_related_id;
  ELSIF TG_TABLE_NAME IN ('project_review_media_assets','project_ffe_import_batches') THEN
    v_related_id:=NULLIF(v_row->>'source_asset_id','')::uuid;
    IF v_related_id IS NULL THEN RETURN NEW; END IF;
    SELECT project_id INTO v_related_project FROM public.project_ffe_media_assets WHERE id=v_related_id;
  ELSE RETURN NEW;
  END IF;
  IF v_related_project IS NULL OR v_related_project IS DISTINCT FROM v_project_id THEN
    RAISE EXCEPTION 'media source and target must belong to the same project'
      USING ERRCODE='integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_ffe_media_project_identity()
FROM PUBLIC,anon,authenticated,service_role;
