-- 00852 — D1: explicit Field context photos become private installed plates.
-- Lineage: ownership 00843 → 00848; builder 00842 → 00845 (00849 leaves it intact).
-- Keeps 00848's lifecycle writers/lock order and concept_seen safety unchanged.
-- The 00845 public reader delegates here; its superseded 00842 body is not live.
BEGIN;

CREATE OR REPLACE FUNCTION public.client_plate_source_owned(
  p_project_id uuid, p_table text, p_id uuid, p_source_url text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN p_table = 'field_captures' THEN EXISTS (
      SELECT 1
      FROM public.field_captures AS capture
      JOIN public.projects AS project ON project.id = capture.project_id
      JOIN public.organization_members AS member
        ON member.organization_id = project.studio_id
       AND member.user_id = capture.designer_id
       AND member.status = 'active'
      WHERE capture.id = p_id
        AND capture.project_id = p_project_id
        AND capture.capture_kind = 'context'
        AND target.path !~* '(^|/)(\.|%2e){0,2}(/|$)'
        AND target.folder[1] = capture.designer_id::text
        AND target.folder[2] = capture.client_capture_id::text
        AND target.path = COALESCE(NULLIF(btrim(capture.primary_photo_path), ''),
                                   NULLIF(btrim(capture.photos -> 0 ->> 'path'), ''))
    )
    WHEN COALESCE(p_table, '') NOT IN
      ('project_ffe_item_images', 'project_rooms', 'room_scan_images', 'project_boards') THEN false
    WHEN p_table = 'project_ffe_item_images'
      OR target.path ~* '^https?://' THEN true
    WHEN p_project_id IS NULL
      OR target.path ~* '(^|/)(\.|%2e){0,2}(/|$)' THEN false
    WHEN p_table = 'project_rooms' THEN
      target.path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.+$'
      AND lower(target.folder[1]) = p_project_id::text
    WHEN p_table = 'room_scan_images' THEN EXISTS (
      SELECT 1
      FROM public.room_scan_images AS still
      JOIN public.room_scans AS scan ON scan.id = still.scan_id
      WHERE still.id = p_id
        AND scan.project_id = p_project_id
        AND scan.user_id::text = target.folder[2]
        AND (scan.id::text = target.folder[3] OR scan.room_id::text = target.folder[3])
    )
    ELSE EXISTS (
      SELECT 1
      FROM public.proposals AS proposal
      WHERE proposal.id::text = target.folder[1]
        AND proposal.project_id = p_project_id
    )
  END
  FROM (
    SELECT address.path, storage.foldername(address.path) AS folder
    FROM (SELECT ltrim(btrim(COALESCE(p_source_url, '')), '/') AS path) AS address
  ) AS target;
$$;

-- Only explicit context photos in the owning studio cross this boundary.
-- Hold the same project-row lock as the plate lifecycle before checking closure.
CREATE OR REPLACE FUNCTION public.client_plate_enqueue_installed_capture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_path text := COALESCE(NULLIF(btrim(NEW.primary_photo_path), ''),
                          NULLIF(btrim(NEW.photos -> 0 ->> 'path'), ''));
BEGIN
  IF NEW.capture_kind <> 'context' OR NEW.project_id IS NULL OR v_path IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM 1 FROM public.projects WHERE id = NEW.project_id FOR SHARE;
  IF public._client_edition_closed(NEW.project_id)
     OR NOT public.client_plate_source_owned(NEW.project_id, 'field_captures', NEW.id, v_path) THEN
    RETURN NULL;
  END IF;
  PERFORM public._enqueue_client_plate_request(
    NEW.project_id, 'installed', 'field_captures', NEW.id, v_path);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.client_plate_enqueue_installed_capture() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_client_plate_installed_capture ON public.field_captures;
CREATE TRIGGER trg_client_plate_installed_capture
AFTER INSERT OR UPDATE ON public.field_captures
FOR EACH ROW EXECUTE FUNCTION public.client_plate_enqueue_installed_capture();

-- Existing explicitly filed context photos qualify too; never infer from specimens.
SELECT public._enqueue_client_plate_request(
  capture.project_id, 'installed', 'field_captures', capture.id, source.path)
FROM public.field_captures AS capture
JOIN public.projects AS project ON project.id = capture.project_id
CROSS JOIN LATERAL (
  SELECT COALESCE(NULLIF(btrim(capture.primary_photo_path), ''),
                  NULLIF(btrim(capture.photos -> 0 ->> 'path'), '')) AS path
) AS source
WHERE capture.capture_kind = 'context'
  AND NOT public._client_edition_closed(project.id)
  AND public.client_plate_source_owned(project.id, 'field_captures', capture.id, source.path);

CREATE OR REPLACE FUNCTION public._build_project_editorial(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_studio_id uuid;
  v_studio_name text;
  v_studio_town text;
  v_result jsonb;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RETURN NULL;
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
  -- A source's plate: the asset its copy request names (00845: also while a
  -- re-crop of that asset is queued, see header).
  plate AS (
    SELECT request.source_kind, request.source_ref, request.asset_id AS id
    FROM public.client_plate_requests AS request
    JOIN public.client_plate_assets AS asset
      ON asset.id = request.asset_id
     AND asset.project_id = request.project_id
    WHERE request.project_id = p_project_id
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
  installed_plate AS (
    SELECT capture.project_room_id AS room_id, plate.id AS asset_id,
           capture.captured_at, capture.id AS capture_id,
           COALESCE(room.name, v_project.name) AS what
    FROM public.field_captures AS capture
    JOIN plate
      ON plate.source_kind = 'installed'
     AND plate.source_ref = jsonb_build_object('table', 'field_captures', 'id', capture.id::text)
    JOIN public.client_plate_requests AS request
      ON request.project_id = p_project_id
     AND request.source_kind = 'installed'
     AND request.source_ref = plate.source_ref
    LEFT JOIN room ON room.id = capture.project_room_id
    WHERE capture.project_id = p_project_id
      AND public.client_plate_source_owned(p_project_id, 'field_captures', capture.id, request.source_url)
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
  -- Installed attribution wins shared bytes; concept provenance still forbids a hero.
  caption_source AS (
    SELECT installed_plate.asset_id, installed_plate.what, NULL::text AS maker_name,
           installed_plate.captured_at AS taken, 'installed'::text AS kind, 0 AS precedence
    FROM installed_plate
    UNION ALL
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
           CASE WHEN caption_source.kind = 'installed' THEN 'photographed ' ELSE '' END
             || to_char(caption_source.taken, 'FMDD FMMonth YYYY') AS taken_on
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
          SELECT jsonb_agg(picture.asset_id ORDER BY picture.priority, picture.display_order,
                                                   picture.created_at, picture.source_id)
          FROM (
            SELECT installed_plate.asset_id, 0 AS priority, 0 AS display_order,
                   installed_plate.captured_at AS created_at, installed_plate.capture_id AS source_id
            FROM installed_plate WHERE installed_plate.room_id = room.id
            UNION ALL
            SELECT scan_plate.asset_id, 1, scan_plate.display_order,
                   scan_plate.created_at, scan_plate.still_id
            FROM scan_plate WHERE scan_plate.room_id = room.id
          ) AS picture
        ), '[]'::jsonb),
        'items', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', line.id,
            'nameAsSigned', line.name_as_signed,
            'category', line.ffe_category,
            'status', line.status,
            'makerName', CASE WHEN v_project.show_makers THEN line.maker_name END,
            'madeIn', CASE WHEN v_project.show_makers THEN line.made_in END,
            -- No item table carries these four today (00842 header).
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
        'alt', public._client_plate_alt(caption.what, caption.whose, provenance.kind)
      ) ORDER BY (provenance.kind = 'installed') DESC, caption.asset_id)
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

COMMIT;
