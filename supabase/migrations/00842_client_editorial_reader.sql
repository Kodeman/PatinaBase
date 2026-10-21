-- ═══════════════════════════════════════════════════════════════════════════
-- 00842 — The House Issue: the client page's editorial reader (US-49 Phase 1)
-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 1 restyles the homeowner's page on today's data (PLAN.md v2 §Image
-- system, R-v2-9). This migration adds:
--
--   projects.show_makers        the studio's switch for naming makers on the
--                               homeowner page (Q2). Off by default.
--   set_project_show_makers     the studio's act on that switch. Guard:
--                               public.can_buy_for_project(project) — the
--                               project-team authority (00702 → 00813) the
--                               studio-side RPCs ask, e.g. 00833:26
--                               (vendor quote job lock) and 00830:40.
--   get_client_project_editorial
--                               the plate reader. Guard copied verbatim from
--                               get_client_project_threshold (00840:36-47):
--                               the project's client, or can_buy_for_project.
--
-- The envelope (camelCase) is the US-49 contract's:
--   {project:{id,name,phase,targetDate,showMakers,studio:{name,town}},
--    rooms:[{id,name,anchor,conceptAssetId,scanAssetIds,items:[{id,
--      nameAsSigned,category,status,makerName,madeIn,material,finish,
--      dimensions,descriptionAsSigned,assetIds,silhouetteKind}]}],
--    assets:[{id,sha256,sourceKind,width,height,ground,dominantHex,lqip,focal,
--      subjectBox,crops,caption:{what,whose,when},alt}],
--    palette:[{hex,brand,name}], boards:[{id,name,assetId}],
--    sheets:[{id,title,assetId}]}
--
-- What the reader shows is what the threshold reader already shows the
-- client: the furnishings lines she signed (name from the frozen snapshot,
-- 00840) and the trade lines under an executed trade scope, with the same
-- removal and disposition filters; the job's rooms (their concept renders and
-- scans are already hers to read, 00580); its signed board snapshots
-- (project_boards); its shared drawing sheets (00429 client gate). Items with
-- no room are not in rooms[] (the envelope has no room-less slot).
--
-- Never in the envelope: prices or any *_cents, SKU, notes, site address,
-- purchase-order fields, and no name of the household other than the
-- project's own name. makerName and madeIn are null unless show_makers.
-- material, finish, dimensions and descriptionAsSigned are null: no item
-- table carries them today (project_ffe_items and the frozen authorization
-- snapshot have none of the four; products has live library copy, which is
-- not what she signed). silhouetteKind is the line's category slug.
--
-- Plates come from client_plate_assets (00843; plpgsql resolves the table at
-- call time). A source shows a plate only once its copy request is done, so a
-- replaced concept render or board cover never shows the previous picture
-- while the new one is being copied. A source's plate is the asset its done
-- request names (client_plate_requests.asset_id): two sources with the same
-- bytes share one asset (UNIQUE project_id, sha256), and each still finds it.
-- An asset's sourceKind is the kind of the source its caption describes,
-- except that bytes any of the project's sources produced as a concept render
-- stay 'concept' (R142: a concept is never the hero), whichever source the
-- caption describes. The asset's concept_seen keeps that after the concept
-- request is re-queued or moves to other bytes. The alt's kind word follows
-- sourceKind.
--
-- Captions are code: what = the line's name as signed (room name for a concept
-- render or scan, board name, sheet title); whose = the maker when
-- show_makers and the plate is a line's picture, else the studio; when = the
-- source row's created_at as DD Month YYYY (a concept render's upload time,
-- since its source row is the room). alt = what · whose · <kind word>.
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS show_makers boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.projects.show_makers IS
  'US-49 Q2: when true the homeowner page names the maker and where it was made on a line (get_client_project_editorial makerName/madeIn, caption whose). Set by set_project_show_makers.';

-- ─── 1. The studio's switch ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_project_show_makers(p_project_id uuid, p_show boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_show IS NULL THEN
    RAISE EXCEPTION 'show_makers must be true or false' USING ERRCODE = 'check_violation';
  END IF;
  -- The project-team authority every studio-side job act asks (00813).
  IF NOT public.can_buy_for_project(p_project_id) THEN
    RAISE EXCEPTION 'project not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.projects
  SET show_makers = p_show
  WHERE id = p_project_id
    AND show_makers IS DISTINCT FROM p_show;
END;
$$;

REVOKE ALL ON FUNCTION public.set_project_show_makers(uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_project_show_makers(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.set_project_show_makers(uuid, boolean) IS
  'US-49: the studio turns maker names on or off for the homeowner page. Caller must hold can_buy_for_project (the project owner or its studio team).';

-- ─── 2. The editorial reader ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_client_project_editorial(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_studio_id uuid;
  v_studio_name text;
  v_studio_town text;
  v_result jsonb;
BEGIN
  -- 00840's preamble, verbatim.
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

  SELECT studio.studio_id, studio.name
  INTO v_studio_id, v_studio_name
  FROM public.resolve_studio_identity(p_project_id => v_project.id) AS studio;
  IF v_studio_id IS NOT NULL THEN
    SELECT NULLIF(btrim(org.address ->> 'city'), '')
    INTO v_studio_town
    FROM public.organizations AS org
    WHERE org.id = v_studio_id;
  END IF;

  WITH
  -- The lines the client page already shows her (00840, both branches).
  line AS (
    SELECT item.id, item.project_room_id, item.ffe_category, item.status,
           item.sort_order, item.created_at,
           COALESCE(authorization_item.snapshot ->> 'clientName', item.name) AS name_as_signed,
           COALESCE(vendor.name, item.vendor_name) AS maker_name,
           vendor.made_in
    FROM public.project_ffe_items AS item
    JOIN public.furnishing_authorization_items AS authorization_item
      ON authorization_item.id = item.source_authorization_item_id
    JOIN public.project_commercial_documents AS doc
      ON doc.id = authorization_item.commercial_document_id
     AND doc.executed_at IS NOT NULL
    JOIN public.proposals AS proposal
      ON proposal.id = doc.proposal_id
     AND proposal.commercial_state = 'executed'
    LEFT JOIN public.vendors AS vendor ON vendor.id = item.vendor_id
    WHERE item.project_id = p_project_id
      AND item.removed_at IS NULL
      AND item.design_disposition NOT IN ('not_selected', 'superseded')
    UNION ALL
    SELECT item.id, item.project_room_id, item.ffe_category, item.status,
           item.sort_order, item.created_at,
           item.name,
           COALESCE(vendor.name, item.vendor_name),
           vendor.made_in
    FROM public.project_ffe_items AS item
    JOIN public.project_commercial_documents AS doc
      ON doc.id = item.trade_scope_document_id
     AND doc.executed_at IS NOT NULL
    JOIN public.proposals AS proposal
      ON proposal.id = doc.proposal_id
     AND proposal.commercial_state = 'executed'
    JOIN public.trade_scope_terms AS terms ON terms.proposal_id = proposal.id
    LEFT JOIN public.vendors AS vendor ON vendor.id = item.vendor_id
    WHERE item.project_id = p_project_id
      AND item.removed_at IS NULL
      AND item.design_disposition NOT IN ('not_selected', 'superseded')
  ),
  -- A source's plate: the asset its copy request produced, once it is done.
  plate AS (
    SELECT request.source_kind, request.source_ref, request.asset_id AS id
    FROM public.client_plate_requests AS request
    JOIN public.client_plate_assets AS asset
      ON asset.id = request.asset_id
     AND asset.project_id = request.project_id
    WHERE request.project_id = p_project_id
      AND request.status = 'done'
  ),
  -- Each picture of a shown line that has its plate.
  line_picture AS (
    SELECT picture.id AS picture_id, picture.item_id, picture.is_primary,
           picture.position, picture.created_at, plate.id AS asset_id,
           plate.source_kind
    FROM public.project_ffe_item_images AS picture
    JOIN line ON line.id = picture.item_id
    JOIN plate
      ON plate.source_kind IN ('upload', 'maker')
     AND plate.source_ref = jsonb_build_object(
           'table', 'project_ffe_item_images', 'id', picture.id::text)
    WHERE picture.project_id = p_project_id
  ),
  line_plate AS (
    SELECT DISTINCT ON (line_picture.item_id, line_picture.asset_id)
           line_picture.item_id, line_picture.asset_id, line_picture.is_primary,
           line_picture.position, line_picture.created_at, line_picture.source_kind
    FROM line_picture
    ORDER BY line_picture.item_id, line_picture.asset_id,
             line_picture.is_primary DESC, line_picture.position, line_picture.created_at
  ),
  room AS (
    SELECT project_room.id, project_room.name, project_room.sort_order,
           project_room.created_at, project_room.concept_render_url,
           project_room.concept_render_uploaded_at
    FROM public.project_rooms AS project_room
    WHERE project_room.project_id = p_project_id
  ),
  concept_plate AS (
    SELECT room.id AS room_id, plate.id AS asset_id
    FROM room
    JOIN plate
      ON plate.source_kind = 'concept'
     AND plate.source_ref = jsonb_build_object('table', 'project_rooms', 'id', room.id::text)
    WHERE room.concept_render_url IS NOT NULL
  ),
  scan_plate AS (
    SELECT scan.project_room_id AS room_id, plate.id AS asset_id,
           still.display_order, still.created_at, still.id AS still_id
    FROM public.room_scans AS scan
    JOIN public.room_scan_images AS still ON still.scan_id = scan.id
    JOIN plate
      ON plate.source_kind = 'scan'
     AND plate.source_ref = jsonb_build_object('table', 'room_scan_images', 'id', still.id::text)
    WHERE scan.project_id = p_project_id
      AND scan.project_room_id IN (SELECT room.id FROM room)
  ),
  board AS (
    SELECT project_board.id, project_board.name, project_board.sort_order,
           project_board.created_at, plate.id AS asset_id
    FROM public.project_boards AS project_board
    LEFT JOIN plate
      ON project_board.cover_image_url IS NOT NULL
     AND plate.source_kind = 'board'
     AND plate.source_ref = jsonb_build_object('table', 'project_boards', 'id', project_board.id::text)
    WHERE project_board.project_id = p_project_id
  ),
  sheet AS (
    SELECT plan_sheet.id, plan_sheet.title, plan_sheet.sort_order,
           print.created_at, plate.id AS asset_id
    FROM public.plan_sheets AS plan_sheet
    LEFT JOIN public.plan_prints AS print ON print.id = plan_sheet.current_print_id
    LEFT JOIN plate
      ON plate.source_kind = 'sheet'
     AND plate.source_ref = jsonb_build_object('table', 'plan_prints', 'id', print.id::text)
    WHERE plan_sheet.project_id = p_project_id
      AND plan_sheet.state = 'shared'
  ),
  -- Every plate the envelope names, with what its caption says about it.
  -- One caption per asset: a line's picture first, then room, board, sheet.
  caption_source AS (
    SELECT line_plate.asset_id, line.name_as_signed AS what, line.maker_name,
           line_plate.created_at AS taken, line_plate.source_kind AS kind, 1 AS precedence
    FROM line_plate JOIN line ON line.id = line_plate.item_id
    UNION ALL
    SELECT concept_plate.asset_id, room.name, NULL,
           COALESCE(room.concept_render_uploaded_at, room.created_at), 'concept', 2
    FROM concept_plate JOIN room ON room.id = concept_plate.room_id
    UNION ALL
    SELECT scan_plate.asset_id, room.name, NULL, scan_plate.created_at, 'scan', 3
    FROM scan_plate JOIN room ON room.id = scan_plate.room_id
    UNION ALL
    SELECT board.asset_id, board.name, NULL, board.created_at, 'board', 4
    FROM board WHERE board.asset_id IS NOT NULL
    UNION ALL
    SELECT sheet.asset_id, sheet.title, NULL, sheet.created_at, 'sheet', 5
    FROM sheet WHERE sheet.asset_id IS NOT NULL
  ),
  caption AS (
    SELECT DISTINCT ON (caption_source.asset_id)
           caption_source.asset_id,
           caption_source.kind,
           caption_source.what,
           CASE WHEN v_project.show_makers AND NULLIF(btrim(caption_source.maker_name), '') IS NOT NULL
                THEN btrim(caption_source.maker_name)
                ELSE v_studio_name END AS whose,
           to_char(caption_source.taken, 'DD FMMonth YYYY') AS taken_on
    FROM caption_source
    ORDER BY caption_source.asset_id, caption_source.precedence, caption_source.taken
  )
  SELECT jsonb_build_object(
    'project', jsonb_build_object(
      'id', v_project.id,
      'name', v_project.name,
      'phase', v_project.current_phase,
      'targetDate', COALESCE(v_project.target_end_date, v_project.expected_completion_date),
      'showMakers', v_project.show_makers,
      'studio', jsonb_build_object('name', v_studio_name, 'town', v_studio_town)
    ),
    'rooms', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', room.id,
        'name', room.name,
        'anchor', 'room-' || room.id::text,
        'conceptAssetId', (SELECT concept_plate.asset_id FROM concept_plate
                           WHERE concept_plate.room_id = room.id),
        'scanAssetIds', COALESCE((
          SELECT jsonb_agg(scan_plate.asset_id
                           ORDER BY scan_plate.display_order, scan_plate.created_at, scan_plate.still_id)
          FROM scan_plate WHERE scan_plate.room_id = room.id
        ), '[]'::jsonb),
        'items', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', line.id,
            'nameAsSigned', line.name_as_signed,
            'category', line.ffe_category,
            'status', line.status,
            'makerName', CASE WHEN v_project.show_makers THEN line.maker_name END,
            'madeIn', CASE WHEN v_project.show_makers THEN line.made_in END,
            -- No item table carries these four today (see header).
            'material', NULL,
            'finish', NULL,
            'dimensions', NULL,
            'descriptionAsSigned', NULL,
            'assetIds', COALESCE((
              SELECT jsonb_agg(line_plate.asset_id
                               ORDER BY line_plate.is_primary DESC, line_plate.position,
                                        line_plate.created_at, line_plate.asset_id)
              FROM line_plate WHERE line_plate.item_id = line.id
            ), '[]'::jsonb),
            'silhouetteKind', line.ffe_category
          ) ORDER BY line.sort_order, line.created_at, line.id)
          FROM line WHERE line.project_room_id = room.id
        ), '[]'::jsonb)
      ) ORDER BY room.sort_order NULLS FIRST, room.created_at, room.id)
      FROM room
    ), '[]'::jsonb),
    'assets', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', asset.id,
        'sha256', asset.sha256,
        'sourceKind', provenance.kind,
        'width', asset.width,
        'height', asset.height,
        'ground', asset.ground,
        'dominantHex', asset.dominant_hex,
        'lqip', asset.lqip,
        'focal', to_jsonb(asset.focal),
        'subjectBox', to_jsonb(asset.subject_box),
        'crops', asset.crops,
        'caption', jsonb_build_object(
          'what', caption.what,
          'whose', caption.whose,
          'when', caption.taken_on
        ),
        'alt', concat_ws(' · ', caption.what, caption.whose,
          CASE provenance.kind
            WHEN 'maker' THEN 'product photograph'
            WHEN 'upload' THEN 'studio photograph'
            WHEN 'installed' THEN 'installed photograph'
            WHEN 'scan' THEN 'room scan'
            WHEN 'board' THEN 'studio board'
            WHEN 'sheet' THEN 'drawing'
            WHEN 'concept' THEN 'concept render, not installed'
          END)
      ) ORDER BY caption.asset_id)
      FROM caption
      JOIN public.client_plate_assets AS asset
        ON asset.id = caption.asset_id
       AND asset.project_id = p_project_id
      CROSS JOIN LATERAL (
        SELECT CASE
                 WHEN asset.concept_seen
                   OR asset.source_kind = 'concept'
                   OR EXISTS (SELECT 1 FROM plate
                              WHERE plate.id = asset.id AND plate.source_kind = 'concept')
                 THEN 'concept'
                 ELSE caption.kind
               END AS kind
      ) AS provenance
    ), '[]'::jsonb),
    'palette', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'hex', swatch.value ->> 'hex',
        'brand', swatch.value ->> 'brand',
        'name', swatch.value ->> 'name'
      ) ORDER BY swatch.ordinality)
      FROM (
        SELECT palette.swatches
        FROM public.project_palettes AS palette
        WHERE palette.project_id = p_project_id
        ORDER BY palette.is_primary DESC, palette.sort_order, palette.created_at, palette.id
        LIMIT 1
      ) AS chosen
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(chosen.swatches) = 'array' THEN chosen.swatches ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS swatch(value, ordinality)
      WHERE NULLIF(btrim(swatch.value ->> 'hex'), '') IS NOT NULL
    ), '[]'::jsonb),
    'boards', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', board.id, 'name', board.name, 'assetId', board.asset_id
      ) ORDER BY board.sort_order, board.created_at, board.id)
      FROM board
    ), '[]'::jsonb),
    'sheets', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', sheet.id, 'title', sheet.title, 'assetId', sheet.asset_id
      ) ORDER BY sheet.sort_order, sheet.id)
      FROM sheet
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_project_editorial(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_project_editorial(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_client_project_editorial(uuid) IS
  'US-49 Phase 1 plate reader for the homeowner page (The House Issue). Guard: the project''s client or can_buy_for_project (00840 verbatim). Envelope: project{id,name,phase,targetDate,showMakers,studio{name,town}}, rooms[{id,name,anchor,conceptAssetId,scanAssetIds,items[…]}], assets[{id,sha256,sourceKind,width,height,ground,dominantHex,lqip,focal,subjectBox,crops,caption{what,whose,when},alt}], palette[{hex,brand,name}], boards[{id,name,assetId}], sheets[{id,title,assetId}]. Lines are the ones the threshold reader shows (signed furnishings snapshot names, executed trade scope). makerName/madeIn only when projects.show_makers. material, finish, dimensions and descriptionAsSigned are null (no item column). Never prices, SKU, notes, site address or storage paths; plates are addressed by sha256 through client_can_read_plate.';
