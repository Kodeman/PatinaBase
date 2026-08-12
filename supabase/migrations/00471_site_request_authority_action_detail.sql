-- =====================================================================================
-- 00471 — Exact Site Request author authority and transactional action detail
--
-- Lineage: 00374 owns the Site Request read policies, private designer authority
-- helper, and public mutation signatures. This migration narrows the historical
-- any-organization co-member predicate to active design-studio authority, adds one
-- allowlisted action-detail projection, and makes close a completed-only transition.
-- Guest/token/service delivery and dispatch functions are intentionally unchanged.
-- =====================================================================================

-- The four raw tables consumed by authenticated designer clients must use the
-- same exact design-studio authority as the contextual projection. Downstream
-- media/access policies that join these rows also fail closed through their RLS.
DROP POLICY IF EXISTS site_requests_designer_read ON public.site_requests;
CREATE POLICY site_requests_designer_read
  ON public.site_requests FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.projects AS project
    WHERE project.id = site_requests.project_id
      AND public.is_design_studio_comember(project.designer_id)
  ));

DROP POLICY IF EXISTS site_request_items_designer_read
  ON public.site_request_items;
CREATE POLICY site_request_items_designer_read
  ON public.site_request_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.site_requests AS request
    JOIN public.projects AS project ON project.id = request.project_id
    WHERE request.id = site_request_items.request_id
      AND public.is_design_studio_comember(project.designer_id)
  ));

DROP POLICY IF EXISTS site_request_versions_designer_read
  ON public.site_request_item_versions;
CREATE POLICY site_request_versions_designer_read
  ON public.site_request_item_versions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.site_request_items AS item
    JOIN public.site_requests AS request ON request.id = item.request_id
    JOIN public.projects AS project ON project.id = request.project_id
    WHERE item.id = site_request_item_versions.item_id
      AND public.is_design_studio_comember(project.designer_id)
  ));

DROP POLICY IF EXISTS site_deliverables_designer_read
  ON public.site_deliverables;
CREATE POLICY site_deliverables_designer_read
  ON public.site_deliverables FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.site_requests AS request
    JOIN public.projects AS project ON project.id = request.project_id
    WHERE request.id = site_deliverables.request_id
      AND public.is_design_studio_comember(project.designer_id)
  ));

-- Every installed authenticated Site Request writer calls this private helper.
-- Restating it once preserves the public RPC names/arguments while closing the
-- contractor/manufacturer shared-organization authorization path everywhere.
CREATE OR REPLACE FUNCTION public._site_request_designer_authorized(
  p_project_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.projects AS project
       WHERE project.id = p_project_id
         AND public.is_design_studio_comember(project.designer_id)
     );
$$;

REVOKE ALL ON FUNCTION public._site_request_designer_authorized(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- One database snapshot replaces the client-side request/items/versions/
-- deliverables fan-out. The response includes only identities needed by the
-- checked mutation RPCs and safe same-project room choices. Caller-supplied IDs
-- are echoed in the stable empty shape, so missing and unauthorized sources are
-- indistinguishable. A bounded item set prevents an unbounded JSON aggregate.
CREATE OR REPLACE FUNCTION public.get_site_request_action_detail(
  p_project_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_request_status text;
  v_item_count integer;
  v_current_count integer;
  v_missing_evidence_count integer;
  v_items jsonb;
  v_rooms jsonb;
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.projects AS project
    WHERE project.id = p_project_id
      AND public.is_design_studio_comember(project.designer_id)
  ) THEN
    RETURN jsonb_build_object(
      'projectId', p_project_id,
      'requestId', p_request_id,
      'coherent', false,
      'items', '[]'::jsonb,
      'rooms', '[]'::jsonb
    );
  END IF;

  SELECT request.status
  INTO v_request_status
  FROM public.site_requests AS request
  WHERE request.id = p_request_id
    AND request.project_id = p_project_id;

  IF NOT FOUND OR v_request_status NOT IN (
    'sent', 'in_progress', 'delivered', 'completed'
  ) THEN
    RETURN jsonb_build_object(
      'projectId', p_project_id,
      'requestId', p_request_id,
      'coherent', false,
      'items', '[]'::jsonb,
      'rooms', '[]'::jsonb
    );
  END IF;

  SELECT count(*)::integer
  INTO v_item_count
  FROM public.site_request_items AS item
  WHERE item.request_id = p_request_id;

  IF v_item_count < 1 OR v_item_count > 100 THEN
    RETURN jsonb_build_object(
      'projectId', p_project_id,
      'requestId', p_request_id,
      'coherent', false,
      'items', '[]'::jsonb,
      'rooms', '[]'::jsonb
    );
  END IF;

  SELECT count(*)::integer
  INTO v_current_count
  FROM public.site_request_items AS item
  JOIN public.site_request_item_versions AS version
    ON version.id = item.current_version_id
   AND version.item_id = item.id
   AND version.version_number = item.current_version_number
  WHERE item.request_id = p_request_id;

  IF v_current_count <> v_item_count THEN
    RETURN jsonb_build_object(
      'projectId', p_project_id,
      'requestId', p_request_id,
      'coherent', false,
      'items', '[]'::jsonb,
      'rooms', '[]'::jsonb
    );
  END IF;

  SELECT count(*)::integer
  INTO v_missing_evidence_count
  FROM public.site_request_items AS item
  JOIN public.site_request_item_versions AS version
    ON version.id = item.current_version_id
   AND version.item_id = item.id
   AND version.version_number = item.current_version_number
  LEFT JOIN LATERAL (
    SELECT deliverable.id
    FROM public.site_deliverables AS deliverable
    WHERE deliverable.request_id = p_request_id
      AND deliverable.item_id = item.id
      AND deliverable.item_version_id = version.id
      AND deliverable.status = 'delivered'
    ORDER BY deliverable.attempt_number DESC, deliverable.id DESC
    LIMIT 1
  ) AS latest_delivery ON true
  WHERE item.request_id = p_request_id
    AND item.status IN ('delivered', 'approved')
    AND latest_delivery.id IS NULL;

  IF v_missing_evidence_count <> 0 THEN
    RETURN jsonb_build_object(
      'projectId', p_project_id,
      'requestId', p_request_id,
      'coherent', false,
      'items', '[]'::jsonb,
      'rooms', '[]'::jsonb
    );
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'itemId', item.id,
        'title', version.title,
        'kitCode', version.kit_code,
        'version', version.version_number,
        'roomId', version.room_id,
        'status', item.status,
        'deliverableId', latest_delivery.id
      ) ORDER BY item.sort_order, item.id
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM public.site_request_items AS item
  JOIN public.site_request_item_versions AS version
    ON version.id = item.current_version_id
   AND version.item_id = item.id
   AND version.version_number = item.current_version_number
  LEFT JOIN LATERAL (
    SELECT deliverable.id
    FROM public.site_deliverables AS deliverable
    WHERE deliverable.request_id = p_request_id
      AND deliverable.item_id = item.id
      AND deliverable.item_version_id = version.id
      AND deliverable.status = 'delivered'
    ORDER BY deliverable.attempt_number DESC, deliverable.id DESC
    LIMIT 1
  ) AS latest_delivery ON true
  WHERE item.request_id = p_request_id;

  IF jsonb_array_length(v_items) <> v_item_count THEN
    RETURN jsonb_build_object(
      'projectId', p_project_id,
      'requestId', p_request_id,
      'coherent', false,
      'items', '[]'::jsonb,
      'rooms', '[]'::jsonb
    );
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('id', room.id, 'name', room.name)
      ORDER BY room.sort_order, room.id
    ),
    '[]'::jsonb
  )
  INTO v_rooms
  FROM public.project_rooms AS room
  WHERE room.project_id = p_project_id;

  RETURN jsonb_build_object(
    'projectId', p_project_id,
    'requestId', p_request_id,
    'coherent', true,
    'items', v_items,
    'rooms', v_rooms
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_site_request_action_detail(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_site_request_action_detail(uuid,uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_site_request_action_detail(uuid,uuid) IS
  'Existence-safe exact-studio Site Request action detail: bounded coherent '
  'current items/latest delivered attempts and id/name project room choices.';

-- 00374 body preserved except that the locked source must be exactly completed.
-- This closes the stale completed-read -> concurrent redo -> close race without
-- changing the installed public signature or any guest/access cleanup behavior.
CREATE OR REPLACE FUNCTION public.site_request_close(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request public.site_requests;
  v_revoked integer;
BEGIN
  SELECT * INTO v_request
  FROM public.site_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'site request % not found', p_request_id
      USING errcode = 'no_data_found';
  END IF;
  IF NOT public._site_request_designer_authorized(v_request.project_id) THEN
    RAISE EXCEPTION 'not authorized' USING errcode = 'insufficient_privilege';
  END IF;
  IF v_request.status <> 'completed' THEN
    RAISE EXCEPTION 'request in % cannot be closed', v_request.status
      USING errcode = '55000';
  END IF;

  UPDATE public.site_requests
  SET status = 'closed',
      closed_at = COALESCE(closed_at, now()),
      unapproved_media_delete_after = COALESCE(
        unapproved_media_delete_after, now() + interval '90 days'
      )
  WHERE id = p_request_id
    AND status = 'completed';

  UPDATE public.site_request_access
  SET status = 'revoked', revoked_at = now(), revoked_reason = 'request closed'
  WHERE request_id = p_request_id AND status IN ('pending','active');
  GET DIAGNOSTICS v_revoked = ROW_COUNT;

  UPDATE public.site_request_dispatch_outbox
  SET status = 'cancelled', completed_at = now(), last_error = 'request closed'
  WHERE request_id = p_request_id AND status IN ('pending','processing');

  PERFORM public._site_request_append_event(
    p_request_id, 'request_closed', 'designer', auth.uid(), NULL,
    NULL, NULL, jsonb_build_object('revoked_access_count', v_revoked),
    'request-closed:' || p_request_id::text
  );
  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'status', 'closed',
    'closed_at', (
      SELECT closed_at FROM public.site_requests WHERE id = p_request_id
    ),
    'revoked_access_count', v_revoked
  );
END;
$$;

REVOKE ALL ON FUNCTION public.site_request_close(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_request_close(uuid) TO authenticated;
