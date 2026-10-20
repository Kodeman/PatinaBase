-- ═══════════════════════════════════════════════════════════════════════════
-- 00841 — The iOS project screen names a line as the client signed it (US-41)
-- ═══════════════════════════════════════════════════════════════════════════
-- Kody 2026-10-20: the iOS Patina app must show a line's Pieces rename, as the
-- web wall does since 00840. The app reads get_client_project_selections
-- (ProjectsAPIClient.swift:249 → ProjectDetailView), which printed the live
-- line name: for a library-filled line that stays the product title (D2: a
-- rename lands on the thread's need label).
--
-- The reader now prints the frozen clientName of the authorization row it
-- already joins (item.source_authorization_item_id, written only by the
-- execution rails, 00835:820/:1230), so the app shows the name the client
-- signed, beside the frozen room and quantity it already reads from that row.
-- It never reads the live need label: that stays studio-side (00745 N3) until
-- a designer previews and sends it. Lines signed before 00839 carry no
-- clientName and keep their working name.
--
-- Redefined (body verbatim from its head, one expression changed):
--   get_client_project_selections   00441 → 00745:127 → 00755:432 → 00807:697 (+clientName)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_client_project_selections(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_actor uuid:=auth.uid(); v_project public.projects%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT * INTO v_project FROM public.projects WHERE id=p_project_id;
  -- SQ-1128 F1/F2: null-safe (a NULL client_id never passes) and bound to the
  -- job's own studio. 00755 asked is_studio_comember(designer_id).
  IF NOT FOUND OR NOT COALESCE(
    v_project.client_id=v_actor OR public.can_buy_for_project(v_project.id), false
  ) THEN
    RAISE EXCEPTION 'project not found or not accessible' USING ERRCODE='insufficient_privilege';
  END IF;
  RETURN jsonb_build_object('projectId',v_project.id,'projectName',v_project.name,'selections',COALESCE((
    SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id',item.id,'threadId',item.selection_thread_id,
      -- 00841: the name the client signed (00839 clientName), else the working name.
      'name',COALESCE(authorization_item.snapshot->>'clientName', item.name),
      'category',item.ffe_category,'assignmentScope',item.assignment_scope,
      'roomId',item.project_room_id,'roomName',room.name,'quantity',item.quantity,
      'productId',item.product_id,'logisticsStatus',item.status,
      -- 00745: additive.
      'unit',line_unit.unit,
      -- 00807: additive. The item's own pictures: the primary, and all in order.
      'primaryImageUrl',public.primary_image_url(item),
      'imageUrls',to_jsonb(public.image_urls(item)),
      'rooms',public._client_line_rooms(
        item.id, authorization_item.id IS NOT NULL, authorization_item.snapshot,
        -- 00755 (F-E3): the frozen room name first.
        COALESCE(authorization_item.room_name, room.name),
        COALESCE(authorization_item.quantity, item.quantity), line_unit.unit)
    )) ORDER BY room.sort_order NULLS FIRST,item.sort_order,item.created_at,item.id)
    FROM public.project_ffe_items item
    LEFT JOIN public.project_rooms room ON room.id=item.project_room_id
    LEFT JOIN public.furnishing_authorization_items authorization_item
      ON authorization_item.id=item.source_authorization_item_id
    -- 00755 (F-E4): a frozen line's unit is the snapshot's, defaulting to 'each'.
    CROSS JOIN LATERAL (SELECT CASE WHEN authorization_item.id IS NOT NULL
      THEN COALESCE(authorization_item.snapshot->>'unit', 'each') ELSE item.unit END AS unit) line_unit
    WHERE item.project_id=p_project_id AND item.removed_at IS NULL
      AND item.design_disposition='selected'
  ),'[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_project_selections(uuid)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_client_project_selections(uuid) TO authenticated,service_role;
