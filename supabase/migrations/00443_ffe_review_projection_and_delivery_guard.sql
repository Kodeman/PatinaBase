-- Materialized from Strata's migration ledger (applied out-of-band 2026-08-10;
-- git had no source file on main). Do not re-run manually.
-- 00443 — Keep private derivative paths out of client projections and bind delivery to live access.

CREATE OR REPLACE FUNCTION public.sanitize_project_review_item_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','extensions','pg_temp' AS $$
DECLARE v_safe_media jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',media->>'id','kind',media->>'kind','checksumSha256',media->>'checksumSha256'
  )) ORDER BY media->>'kind',media->>'id'),'[]'::jsonb)
  INTO v_safe_media FROM jsonb_array_elements(NEW.media_manifest) media;
  NEW.item_snapshot:=jsonb_set(NEW.item_snapshot,'{media}',v_safe_media,true);
  NEW.content_hash:=encode(extensions.digest(NEW.item_snapshot::text,'sha256'),'hex');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sanitize_project_review_item_snapshot_trg ON public.project_review_items;
CREATE TRIGGER sanitize_project_review_item_snapshot_trg
BEFORE INSERT ON public.project_review_items FOR EACH ROW
EXECUTE FUNCTION public.sanitize_project_review_item_snapshot();

CREATE OR REPLACE FUNCTION public.get_client_project_review_bundle(p_edition_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_actor uuid:=auth.uid(); v_edition public.project_review_editions%ROWTYPE;
  v_project public.projects%ROWTYPE; v_studio boolean;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT * INTO v_edition FROM public.project_review_editions
  WHERE id=p_edition_id AND status IN ('published','superseded','finalized');
  IF NOT FOUND THEN RAISE EXCEPTION 'published review not found' USING ERRCODE='no_data_found'; END IF;
  SELECT * INTO STRICT v_project FROM public.projects WHERE id=v_edition.project_id;
  v_studio:=public.is_studio_comember(v_project.designer_id);
  IF NOT v_studio AND NOT EXISTS(SELECT 1 FROM public.project_review_access access
    WHERE access.edition_id=v_edition.id AND access.actor_id=v_actor AND access.status='active'
      AND (access.expires_at IS NULL OR access.expires_at>now())) THEN
    RAISE EXCEPTION 'review not accessible' USING ERRCODE='insufficient_privilege'; END IF;
  RETURN jsonb_build_object(
    'edition',jsonb_build_object('id',v_edition.id,'number',v_edition.edition_number,
      'title',v_edition.title,'status',v_edition.status,'publishedAt',v_edition.published_at,
      'priceMode',v_edition.client_price_mode,'snapshotHash',v_edition.snapshot_hash),
    'project',jsonb_build_object('id',v_project.id,'name',v_project.name),
    'rooms',v_edition.room_snapshot,'boards',v_edition.board_snapshot,
    'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',item.id,'selectionId',item.source_ffe_item_id,'threadId',item.selection_thread_id,
      'snapshot',(item.item_snapshot-'media')||jsonb_build_object('media',COALESCE((
        SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'id',media->>'id','kind',media->>'kind','checksumSha256',media->>'checksumSha256'
        )) ORDER BY media->>'kind',media->>'id') FROM jsonb_array_elements(item.media_manifest) media
      ),'[]'::jsonb)),'contentHash',item.content_hash,
      'feedback',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',feedback.id,'verdict',feedback.verdict,'body',feedback.body,'createdAt',feedback.created_at
      ) ORDER BY feedback.created_at) FROM public.item_feedback feedback
      WHERE feedback.project_review_item_id=item.id AND (v_studio OR feedback.client_id=v_actor)),'[]'::jsonb)
    ) ORDER BY item.sort_order,item.id) FROM public.project_review_items item
    WHERE item.edition_id=v_edition.id),'[]'::jsonb)
  );
END;
$$;

ALTER FUNCTION public.prepare_project_review_delivery(uuid,uuid,text)
  RENAME TO _prepare_project_review_delivery_00442_impl;
REVOKE ALL ON FUNCTION public._prepare_project_review_delivery_00442_impl(uuid,uuid,text)
FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.prepare_project_review_delivery(
  p_edition_id uuid,p_actor_id uuid,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_project public.projects%ROWTYPE;
BEGIN
  SELECT project.* INTO v_project FROM public.project_review_editions edition
  JOIN public.projects project ON project.id=edition.project_id
  JOIN public.project_review_access access ON access.edition_id=edition.id AND access.actor_id=project.client_id
  WHERE edition.id=p_edition_id AND edition.status='published' AND project.client_id IS NOT NULL
    AND access.status='active' AND (access.expires_at IS NULL OR access.expires_at>now());
  IF NOT FOUND OR NOT public._ffe_is_studio_actor(v_project.designer_id,p_actor_id) THEN
    RAISE EXCEPTION 'published review delivery is not accessible' USING ERRCODE='insufficient_privilege';
  END IF;
  RETURN public._prepare_project_review_delivery_00442_impl(p_edition_id,p_actor_id,p_idempotency_key);
END;
$$;

ALTER FUNCTION public.mark_project_review_delivery_sent(uuid,uuid,text,text)
  RENAME TO _mark_project_review_delivery_sent_00442_impl;
REVOKE ALL ON FUNCTION public._mark_project_review_delivery_sent_00442_impl(uuid,uuid,text,text)
FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.mark_project_review_delivery_sent(
  p_attempt_id uuid,p_actor_id uuid,p_provider_message_id text DEFAULT NULL,p_error_code text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_project public.projects%ROWTYPE;
BEGIN
  SELECT project.* INTO v_project FROM public.project_review_delivery_attempts attempt
  JOIN public.project_review_editions edition ON edition.id=attempt.edition_id
  JOIN public.projects project ON project.id=edition.project_id
  JOIN public.project_review_access access ON access.edition_id=edition.id AND access.actor_id=project.client_id
  WHERE attempt.id=p_attempt_id AND attempt.status IN ('pending','sent') AND edition.status='published'
    AND project.client_id IS NOT NULL AND access.status='active'
    AND (access.expires_at IS NULL OR access.expires_at>now());
  IF NOT FOUND OR NOT public._ffe_is_studio_actor(v_project.designer_id,p_actor_id) THEN
    RAISE EXCEPTION 'claimed review delivery is not accessible' USING ERRCODE='insufficient_privilege';
  END IF;
  RETURN public._mark_project_review_delivery_sent_00442_impl(
    p_attempt_id,p_actor_id,p_provider_message_id,p_error_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sanitize_project_review_item_snapshot()
FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.prepare_project_review_delivery(uuid,uuid,text),
  public.mark_project_review_delivery_sent(uuid,uuid,text,text),
  public.get_client_project_review_bundle(uuid)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.prepare_project_review_delivery(uuid,uuid,text),
  public.mark_project_review_delivery_sent(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_client_project_review_bundle(uuid) TO authenticated,service_role;
