-- ═══════════════════════════════════════════════════════════════════════════
-- 00901 — Round 8 C5: client threshold carries external lines in an additive
-- field, keeping legacy `selections` byte-compatible (US-52 RC-7 defect
-- RC7-e7-1, MEDIUM). Ships INACTIVE: no capability, grant or row changes.
--
-- Defect: 00883 appended _external_presence_lines(p_project_id,true) to the
-- unversioned `selections` array. An older client-portal adapter (a supported
-- rollback) reads every `selections` row as kind 'furnishings' and its absent
-- price as $0, so a client- or GC-bought line showed as a $0 studio furnishing.
--
-- Fix: `selections` is again furnishings + trade only, exactly as 00840 shaped
-- it. External presence lines move to a new top-level key `externalSelections`
-- (the name get_project_working_budget already uses since 00883), with the
-- same client-view projection. Round-8 readers concatenate the two.
--
-- Lineage: get_client_project_threshold 00745 → 00807 → 00840 → 00883 → 00901
-- (body copied verbatim from 00883, delta grafted). ACLs restated from 00840.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_client_project_threshold(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
BEGIN
  -- 00441's preamble, with the access test repaired (SQ-1128 F1/F2): null-safe
  -- (a NULL client_id never passes) and bound to the job's own studio. 00755
  -- asked is_studio_comember(designer_id).
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR NOT COALESCE(
    v_project.client_id = v_actor
    OR public.can_buy_for_project(v_project.id),
    false
  ) THEN
    RAISE EXCEPTION 'project not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'projectId', v_project.id,
    'projectName', v_project.name,
    -- 00423's origin test: the project stands on a signed design-services
    -- instrument, or it is a legacy project the commercial rail never touched.
    'origin', CASE WHEN EXISTS (
      SELECT 1 FROM public.project_commercial_documents AS doc
      WHERE doc.project_id = p_project_id
        AND doc.is_origin
        AND doc.document_kind IN ('design_services', 'design_build')
    ) THEN 'commercial' ELSE 'legacy' END,

    -- ── furnishings: the FROZEN authorization snapshot the client signed ──
    -- Money comes from furnishing_authorization_items.client_* — the columns
    -- the client put her name to — never from the live working row.
    'selections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', item.id,
        'kind', 'furnishings',
        'threadId', item.selection_thread_id,
        -- 00840: the name she signed (00839 clientName, the Pieces lens name);
        -- a line signed before 00839 keeps its working name.
        'name', COALESCE(authorization_item.snapshot->>'clientName', item.name),
        'category', item.ffe_category,
        'assignmentScope', item.assignment_scope,
        'roomId', item.project_room_id,
        'roomName', COALESCE(room.name, authorization_item.room_name),
        'conceptRenderUrl', room.concept_render_url,
        'conceptRenderCaption', room.concept_render_caption,
        'conceptRenderUploadedAt', room.concept_render_uploaded_at,
        'conceptRenderUploadedBy', room.concept_render_uploaded_by,
        'quantity', authorization_item.quantity,
        -- 00745: additive. The rooms she signed, from the frozen snapshot.
        'unit', line_unit.unit,
        'rooms', public._client_line_rooms(
          item.id, true, authorization_item.snapshot,
          -- 00755 (F-E3): the frozen room name first.
          COALESCE(authorization_item.room_name, room.name),
          authorization_item.quantity, line_unit.unit),
        'clientUnitPriceCents', authorization_item.client_unit_price_cents,
        'clientLineTotalCents', authorization_item.client_line_total_cents,
        'itemType', item.item_type,
        'logisticsStatus', item.status,
        'updatedAt', GREATEST(item.updated_at, item.last_status_change_at, doc.executed_at),
        'tradeJourney', NULL,
        -- The block exists because the CLIENT signed an allowance — that is the
        -- frozen snapshot's business (authorization_item.item_type), and it
        -- never changes.
        --
        -- 00423 resolved it off the LIVE schedule line (item.item_type = 'fixed'
        -- → item.line_total_cents). That is the one path on which the restored
        -- payload would still have handed the client an unsigned working-row
        -- figure the studio can move under her, and it is withdrawn here: an
        -- allowance is RESOLVED when a later EXECUTED authorization snapshots the
        -- same live line as 'fixed', and the resolved figure is that snapshot's
        -- own client_line_total_cents. Until such an instrument exists the
        -- allowance is unresolved and this is null.
        'allowance', CASE WHEN authorization_item.item_type = 'allowance' THEN jsonb_build_object(
          'ceilingCents', authorization_item.client_line_total_cents,
          'resolvedCents', (
            SELECT resolution.client_line_total_cents
            FROM public.furnishing_authorization_items AS resolution
            JOIN public.project_commercial_documents AS resolution_doc
              ON resolution_doc.id = resolution.commercial_document_id
             AND resolution_doc.executed_at IS NOT NULL
            JOIN public.proposals AS resolution_proposal
              ON resolution_proposal.id = resolution_doc.proposal_id
             AND resolution_proposal.commercial_state = 'executed'
            WHERE resolution.source_ffe_item_id = item.id
              AND resolution.item_type = 'fixed'
            ORDER BY resolution_doc.executed_at DESC, resolution.id
            LIMIT 1
          )
        ) ELSE NULL END,
        'instrument', jsonb_build_object(
          'documentId', doc.id,
          'proposalId', proposal.id,
          'name', doc.wave_name,
          'executedAt', doc.executed_at
        ),
        'productId', item.product_id,
        -- 00807: the item's own primary picture, no longer the live product's
        -- first image; and every picture in order.
        'imageUrl', item_primary.url,
        'primaryImageUrl', item_primary.url,
        'imageUrls', to_jsonb(public.image_urls(item)),
        'docCode', item.doc_code
      ) ORDER BY room.sort_order NULLS FIRST, item.sort_order, item.created_at, item.id)
      FROM public.project_ffe_items AS item
      JOIN public.furnishing_authorization_items AS authorization_item
        ON authorization_item.id = item.source_authorization_item_id
      JOIN public.project_commercial_documents AS doc
        ON doc.id = authorization_item.commercial_document_id
       AND doc.executed_at IS NOT NULL
      JOIN public.proposals AS proposal
        ON proposal.id = doc.proposal_id
       AND proposal.commercial_state = 'executed'
      LEFT JOIN public.project_rooms AS room ON room.id = item.project_room_id
      CROSS JOIN LATERAL (
        -- 00755 (F-E4): the snapshot's unit, defaulting to 'each'.
        SELECT COALESCE(authorization_item.snapshot->>'unit', 'each') AS unit
      ) AS line_unit
      -- The primary picture, looked up once per line (SQ-1143).
      CROSS JOIN LATERAL (SELECT public.primary_image_url(item) AS url) AS item_primary
      WHERE item.project_id = p_project_id
        AND item.external_fulfilment_id IS NULL
        AND item.removed_at IS NULL
        AND item.design_disposition NOT IN ('not_selected', 'superseded')
    ), '[]'::jsonb)

    -- ── trade: the presence line under an executed trade scope ────────────
    -- clientLineTotalCents reads the live row on purpose: 00423's
    -- guard_trade_presence_line_lock freezes exactly that money once the scope
    -- is executed, which is why this branch has no snapshot table of its own.
    || COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', item.id,
        'kind', 'trade',
        'threadId', item.selection_thread_id,
        'name', item.name,
        'category', item.ffe_category,
        'assignmentScope', item.assignment_scope,
        'roomId', item.project_room_id,
        'roomName', COALESCE(room.name, section.room_name),
        'conceptRenderUrl', room.concept_render_url,
        'conceptRenderCaption', room.concept_render_caption,
        'conceptRenderUploadedAt', room.concept_render_uploaded_at,
        'conceptRenderUploadedBy', room.concept_render_uploaded_by,
        'quantity', item.quantity,
        -- 00745: additive. No snapshot table on this branch: the live line.
        'unit', item.unit,
        'rooms', public._client_line_rooms(
          item.id, false, NULL,
          COALESCE(room.name, section.room_name),
          item.quantity, item.unit),
        'clientUnitPriceCents', NULL,
        'clientLineTotalCents', item.line_total_cents,
        'itemType', item.item_type,
        'logisticsStatus', item.status,
        'updatedAt', GREATEST(item.updated_at, item.last_status_change_at, doc.executed_at),
        'tradeJourney', terms.progress_state,
        'allowance', NULL,
        'instrument', jsonb_build_object(
          'documentId', doc.id,
          'proposalId', proposal.id,
          'name', proposal.title,
          'executedAt', doc.executed_at
        ),
        'productId', item.product_id,
        -- 00807: the item's own primary picture, no longer the live product's
        -- first image; and every picture in order.
        'imageUrl', item_primary.url,
        'primaryImageUrl', item_primary.url,
        'imageUrls', to_jsonb(public.image_urls(item)),
        'docCode', item.doc_code
      ) ORDER BY room.sort_order NULLS FIRST, item.sort_order, item.created_at, item.id)
      FROM public.project_ffe_items AS item
      JOIN public.project_commercial_documents AS doc
        ON doc.id = item.trade_scope_document_id
       AND doc.executed_at IS NOT NULL
      JOIN public.proposals AS proposal
        ON proposal.id = doc.proposal_id
       AND proposal.commercial_state = 'executed'
      JOIN public.trade_scope_terms AS terms ON terms.proposal_id = proposal.id
      LEFT JOIN public.project_rooms AS room ON room.id = item.project_room_id
      LEFT JOIN LATERAL (
        SELECT scope_section.room_name
        FROM public.trade_scope_sections AS scope_section
        WHERE scope_section.proposal_id = proposal.id
          AND scope_section.project_room_id IS NOT DISTINCT FROM item.project_room_id
        ORDER BY scope_section.sort_order, scope_section.id
        LIMIT 1
      ) AS section ON true
      -- The primary picture, looked up once per line (SQ-1143).
      CROSS JOIN LATERAL (SELECT public.primary_image_url(item) AS url) AS item_primary
      WHERE item.project_id = p_project_id
        AND item.external_fulfilment_id IS NULL
        AND item.removed_at IS NULL
        AND item.design_disposition NOT IN ('not_selected', 'superseded')
    ), '[]'::jsonb),
    -- 00901: older readers take every `selections` row as studio money.
    'externalSelections', public._external_presence_lines(p_project_id,true)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_project_threshold(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_project_threshold(uuid)
  TO authenticated, service_role;
