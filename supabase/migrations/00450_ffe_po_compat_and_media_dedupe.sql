-- 00450 — Preserve PO validation semantics and deduplicate frozen media resolution.

ALTER FUNCTION public.create_purchase_order(
  uuid, uuid, public.purchase_order_payment_pattern, uuid[], text, date,
  boolean, date, integer, jsonb, text, text
) RENAME TO _create_purchase_order_00449_impl;
REVOKE ALL ON FUNCTION public._create_purchase_order_00449_impl(
  uuid, uuid, public.purchase_order_payment_pattern, uuid[], text, date,
  boolean, date, integer, jsonb, text, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_purchase_order(
  p_project_id uuid, p_vendor_id uuid,
  p_payment_pattern public.purchase_order_payment_pattern, p_ffe_item_ids uuid[],
  p_vendor_po_number text DEFAULT NULL, p_confirmed_eta date DEFAULT NULL,
  p_is_patina_catalog boolean DEFAULT false, p_deposit_due_date date DEFAULT NULL,
  p_deposit_amount_cents integer DEFAULT NULL,
  p_custom_milestones jsonb DEFAULT '[]'::jsonb,
  p_sidemark text DEFAULT NULL, p_notes text DEFAULT NULL
)
RETURNS public.purchase_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_requested integer := COALESCE(cardinality(p_ffe_item_ids), 0);
BEGIN
  PERFORM public._ffe_require_studio_project(p_project_id);
  IF v_requested = 0 THEN
    RAISE EXCEPTION 'create_purchase_order: at least one FF&E item is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(*) FROM public.project_ffe_items item
      WHERE item.id = ANY(p_ffe_item_ids) AND item.project_id = p_project_id) <> v_requested THEN
    RAISE EXCEPTION 'create_purchase_order: FF&E items not found in project % (missing, duplicate, or cross-project ids)', p_project_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF (SELECT count(*) FROM public.project_ffe_items item
      WHERE item.id = ANY(p_ffe_item_ids) AND item.project_id = p_project_id
        AND item.vendor_id = p_vendor_id AND item.removed_at IS NULL
        AND item.design_disposition = 'selected') <> v_requested THEN
    RAISE EXCEPTION 'every PO line must be an active selected line for the PO project and vendor'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN public._create_purchase_order_00449_impl(
    p_project_id, p_vendor_id, p_payment_pattern, p_ffe_item_ids,
    p_vendor_po_number, p_confirmed_eta, p_is_patina_catalog,
    p_deposit_due_date, p_deposit_amount_cents, p_custom_milestones,
    p_sidemark, p_notes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.authorize_project_review_media(p_edition_id uuid, p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_edition public.project_review_editions%ROWTYPE; v_expected integer; v_media jsonb;
BEGIN
  SELECT edition.* INTO v_edition FROM public.project_review_editions edition
  JOIN public.project_review_access access ON access.edition_id = edition.id AND access.actor_id = p_actor_id
  WHERE edition.id = p_edition_id AND edition.status IN ('published','superseded','finalized')
    AND access.status = 'active' AND (access.expires_at IS NULL OR access.expires_at > now());
  IF NOT FOUND THEN RAISE EXCEPTION 'review media not accessible' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT count(DISTINCT asset_id) INTO v_expected FROM (
    SELECT (media->>'id')::uuid AS asset_id
    FROM public.project_review_items item
    CROSS JOIN LATERAL jsonb_array_elements(item.media_manifest) media
    WHERE item.edition_id = p_edition_id
    UNION ALL
    SELECT asset_id FROM public.project_review_board_media_assets WHERE edition_id = p_edition_id
  ) frozen;
  v_media := public.get_project_review_media_manifest(p_edition_id, p_actor_id);
  IF jsonb_array_length(v_media) <> v_expected THEN
    RAISE EXCEPTION 'published review media no longer matches its frozen manifest'
      USING ERRCODE = 'data_exception';
  END IF;
  RETURN jsonb_build_object('editionId', p_edition_id, 'projectId', v_edition.project_id,
    'actorId', p_actor_id, 'media', v_media);
END;
$$;

REVOKE ALL ON FUNCTION public.create_purchase_order(
  uuid, uuid, public.purchase_order_payment_pattern, uuid[], text, date,
  boolean, date, integer, jsonb, text, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_purchase_order(
  uuid, uuid, public.purchase_order_payment_pattern, uuid[], text, date,
  boolean, date, integer, jsonb, text, text
) TO authenticated;
