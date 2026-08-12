-- Materialized from Strata's migration ledger (applied out-of-band 2026-08-10;
-- git had no source file on main). Do not re-run manually.
-- 00441 — Final N-1 key and provider delivery receipt contract.

CREATE OR REPLACE FUNCTION public.place_product_in_project(
  p_project_id uuid,p_product_id uuid,p_room_id uuid DEFAULT NULL,p_slot_id uuid DEFAULT NULL,
  p_category text DEFAULT NULL,p_source jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public','extensions','pg_temp' AS $$
DECLARE v_key text;
BEGIN
  v_key:=NULLIF(p_source->>'idempotencyKey','');
  IF v_key IS NULL AND NULLIF(p_source->>'captureId','') IS NOT NULL THEN
    v_key:='n1:capture:'||(p_source->>'captureId')||':'||p_project_id::text||':'
      ||COALESCE(p_room_id::text,'unsorted')||':'||COALESCE(p_slot_id::text,'new');
  ELSIF v_key IS NULL THEN
    v_key:='n1:request:'||extensions.gen_random_uuid()::text;
  END IF;
  RETURN public.place_product_in_project_v2(jsonb_strip_nulls(jsonb_build_object(
    'projectId',p_project_id,'productId',p_product_id,'roomId',p_room_id,
    'assignmentScope',CASE WHEN p_room_id IS NULL THEN 'unassigned' ELSE 'room' END,
    'placeholderSelectionId',p_slot_id,'category',p_category,
    'duplicateMode',CASE WHEN p_slot_id IS NULL THEN 'create' ELSE 'reuse' END,
    'disposition','candidate','source',COALESCE(NULLIF(p_source->>'client',''),NULLIF(p_source->>'source',''),'chrome-n-1'),
    'sourceMetadata',p_source,'captureId',p_source->>'captureId','idempotencyKey',v_key
  )));
END;
$$;

DROP FUNCTION IF EXISTS public.mark_project_review_delivery_sent(uuid,uuid,text);
CREATE OR REPLACE FUNCTION public.mark_project_review_delivery_sent(
  p_attempt_id uuid,
  p_actor_id uuid,
  p_provider_message_id text DEFAULT NULL,
  p_error_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_attempt public.project_review_delivery_attempts%ROWTYPE;
  v_edition public.project_review_editions%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_status text;
BEGIN
  SELECT * INTO v_attempt FROM public.project_review_delivery_attempts WHERE id=p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review delivery attempt not found' USING ERRCODE='no_data_found'; END IF;
  SELECT * INTO STRICT v_edition FROM public.project_review_editions WHERE id=v_attempt.edition_id;
  SELECT * INTO STRICT v_project FROM public.projects WHERE id=v_edition.project_id;
  IF NOT public._ffe_is_studio_actor(v_project.designer_id,p_actor_id) THEN
    RAISE EXCEPTION 'review delivery attempt not accessible' USING ERRCODE='insufficient_privilege';
  END IF;
  IF v_attempt.status='sent' THEN
    IF NULLIF(btrim(p_error_code),'') IS NOT NULL
       OR NULLIF(btrim(p_provider_message_id),'') IS DISTINCT FROM v_attempt.provider_message_id THEN
      RAISE EXCEPTION 'a sent delivery receipt is immutable' USING ERRCODE='check_violation';
    END IF;
    RETURN jsonb_build_object('attemptId',v_attempt.id,'editionId',v_edition.id,'projectId',v_project.id,
      'status','sent','providerMessageId',v_attempt.provider_message_id,'reused',true);
  END IF;
  IF v_attempt.status<>'pending' THEN
    RAISE EXCEPTION 'delivery attempt must be claimed before completion' USING ERRCODE='check_violation';
  END IF;
  IF NULLIF(btrim(p_error_code),'') IS NULL AND NULLIF(btrim(p_provider_message_id),'') IS NULL THEN
    RAISE EXCEPTION 'successful delivery requires a provider message ID' USING ERRCODE='check_violation';
  END IF;
  IF NULLIF(btrim(p_error_code),'') IS NOT NULL AND NULLIF(btrim(p_provider_message_id),'') IS NOT NULL THEN
    RAISE EXCEPTION 'failed delivery cannot carry a provider message ID' USING ERRCODE='check_violation';
  END IF;
  v_status:=CASE WHEN NULLIF(btrim(p_error_code),'') IS NULL THEN 'sent' ELSE 'failed' END;
  UPDATE public.project_review_delivery_attempts
  SET status=v_status,error_code=CASE WHEN v_status='failed' THEN left(btrim(p_error_code),120) END,
    provider_message_id=CASE WHEN v_status='sent' THEN left(btrim(p_provider_message_id),240) END,
    completed_at=now()
  WHERE id=v_attempt.id RETURNING * INTO v_attempt;
  RETURN jsonb_build_object('attemptId',v_attempt.id,'editionId',v_edition.id,'projectId',v_project.id,
    'status',v_status,'providerMessageId',v_attempt.provider_message_id,'reused',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_client_project_selections(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_actor uuid:=auth.uid(); v_project public.projects%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT * INTO v_project FROM public.projects WHERE id=p_project_id;
  IF NOT FOUND OR NOT(v_project.client_id=v_actor OR public.is_studio_comember(v_project.designer_id)) THEN
    RAISE EXCEPTION 'project not found or not accessible' USING ERRCODE='insufficient_privilege';
  END IF;
  RETURN jsonb_build_object('projectId',v_project.id,'projectName',v_project.name,'selections',COALESCE((
    SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id',item.id,'threadId',item.selection_thread_id,'name',item.name,
      'category',item.ffe_category,'assignmentScope',item.assignment_scope,
      'roomId',item.project_room_id,'roomName',room.name,'quantity',item.quantity,
      'productId',item.product_id,'logisticsStatus',item.status
    )) ORDER BY room.sort_order NULLS FIRST,item.sort_order,item.created_at,item.id)
    FROM public.project_ffe_items item
    LEFT JOIN public.project_rooms room ON room.id=item.project_room_id
    WHERE item.project_id=p_project_id AND item.removed_at IS NULL
      AND item.design_disposition='selected'
  ),'[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.mark_project_review_delivery_sent(uuid,uuid,text,text)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mark_project_review_delivery_sent(uuid,uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.place_product_in_project(uuid,uuid,uuid,uuid,text,jsonb)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.place_product_in_project(uuid,uuid,uuid,uuid,text,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.get_client_project_selections(uuid)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_client_project_selections(uuid) TO authenticated,service_role;
