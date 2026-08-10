-- 00444 — Keep historical ACL replay fail-closed after the delivery signature upgrade.

CREATE OR REPLACE FUNCTION public.mark_project_review_delivery_sent(
  p_attempt_id uuid,
  p_actor_id uuid,
  p_error_code text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF NULLIF(btrim(p_error_code),'') IS NULL THEN
    RAISE EXCEPTION 'provider message ID is required by the current delivery contract'
      USING ERRCODE='check_violation';
  END IF;
  RETURN public.mark_project_review_delivery_sent(p_attempt_id,p_actor_id,NULL,p_error_code);
END;
$$;

REVOKE ALL ON FUNCTION public.authorize_project_review_media(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_project_ffe_extract_upload(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.stage_project_ffe_document_extraction(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.prepare_project_review_delivery(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.mark_project_review_delivery_sent(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.mark_project_review_delivery_sent(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_project_review_media_manifest(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.authorize_project_review_media(uuid,uuid),
  public.get_project_ffe_extract_upload(uuid,uuid,uuid),
  public.stage_project_ffe_document_extraction(uuid,uuid,uuid,text,jsonb),
  public.prepare_project_review_delivery(uuid,uuid,text),
  public.mark_project_review_delivery_sent(uuid,uuid,text),
  public.mark_project_review_delivery_sent(uuid,uuid,text,text),
  public.get_project_review_media_manifest(uuid,uuid)
TO service_role;
