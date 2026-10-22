-- ═══════════════════════════════════════════════════════════════════════════
-- 00845 — The House Issue: edition RPCs, compose dispatcher, feature row (US-49 P2)
-- ═══════════════════════════════════════════════════════════════════════════
-- The acts on the 00844 edition record.
--
-- Service role (the client-edition-compose edge function):
--   claim_client_edition_requests(p_limit)   lease queued, available requests,
--                         at most one per project, only for a project with no
--                         compose in flight, fewer than two editions today and
--                         no frozen edition. A frozen project's queued
--                         requests are closed (done, close_reason) instead.
--   begin_client_edition(p_request_id, p_lease_token) → edition id
--                         a new drafting row (next seq) holding the lease; any
--                         awaiting_review or drafting row of the project is
--                         superseded by it; the request, and every other queued
--                         request of the project already available, is done.
--                         Refuses (54000, message token
--                         'client_edition_daily_limit') when two editions were
--                         created today.
--   Frozen projects       begin, finish and approve take the per-project lock,
--                         then refuse (55000, message token
--                         'client_edition_frozen') when the edition or the
--                         project's approved edition has frozen_at set.
--   close_client_edition_request(p_request_id, p_lease_token, p_reason)
--                         a claimed request that ends without an edition
--                         (facts unchanged, daily limit): done, close_reason.
--                         Needs its token and an unexpired lease (55000).
--   finish_client_edition(…) → the status the edition landed in
--                         p_lease_token is the request's (begin hands it to the
--                         draft); composition.sourceHash → source_hash; p_images
--                         rows {asset_id, plate_role, crop_key, rank,
--                         chapter_key, alt, caption_what, caption_whose,
--                         caption_when} (SQ-1587, story log US-49 seq 34).
--                         'failed' keeps p_error in facts.error; 'full' lands
--                         awaiting_review; 'plates_only' + 'approved'
--                         auto-publishes (C3 always): auto_published, approved
--                         now, the previous approved edition superseded by it,
--                         that edition's chapter/caption overrides carried
--                         over. The database checks the C3 premise itself:
--                         there is an approved edition, the prose (chapters'
--                         key/headline/standing and the doorstep) is the same,
--                         and the hero is no concept render (R142). When it is
--                         not, the edition lands awaiting_review instead and
--                         facts.autoPublishRefused says why.
--   record_plate_perception(…)  subject box, focal, flags, alt (at most 125
--                         characters, perceived_alt) and prompt version on the
--                         asset (focal_origin 'model'). A designer focal is
--                         never overwritten: its box and focal stay, flags,
--                         alt and prompt version still land. Changed model
--                         geometry re-queues the asset's latest source, as
--                         set_plate_focal does, so the crops follow the frame.
--   get_project_editorial_facts(p_project_id)  the editorial envelope with no
--                         membership check, for the composer, plus service-only
--                         fields: project.studio.id, assets[].perceivedPromptVersion,
--                         assets[].focalOrigin, assets[].perceivedAlt (null when
--                         absent), assets[].perceivedFlags ([] when none).
--
-- Studio (can_buy_for_project, the set_project_show_makers guard, 00842:90):
--   approve_client_edition(p_edition_id, p_overrides)  awaiting_review only;
--                         overrides deep-merged and validated; the previous
--                         approved edition superseded; reviewed_by = caller.
--   hold_client_edition(p_edition_id)   awaiting_review stays, facts.held.
--   undo_client_edition(p_edition_id)   approved → superseded; the most recent
--                         approved edition it superseded is approved again.
--                         Refused when the edition is frozen.
--   set_plate_focal(p_asset_id, p_subject_box, p_focal)  designer focal on the
--                         asset (focal_origin 'designer'; the box may be NULL)
--                         and the asset's source re-queued so the media worker
--                         re-crops. Both re-crop writers lock that source
--                         request before the asset, the order 00843's
--                         record_client_plate_asset settles in.
--   list_client_editions(p_project_id)  every edition, newest first. An
--                         image's sourceKind, sourceUrl and sourceTable come
--                         from one request row of its asset (address
--                         provenance); its attributionKind is the kind
--                         00846's reader captions and masks by (the frozen
--                         fact's, concept kept); ground is the asset's.
--
-- Overrides (approve_client_edition; SQ-1588 sends this shape):
--   {heroAssetId?: uuid, chapters?: {<key>: {headline?, standing?}},
--    captions?: {<assetId>: {whose?, when?}}}
--   headline ≤ 60, standing ≤ 160, whose/when ≤ 80 characters (PLAN Call B);
--   null clears a field back to the composed text.
--
-- The editorial builder: 00842's get_client_project_editorial body moves into
-- _build_project_editorial(p_project_id) (no guard), called by the unchanged
-- client reader after its guard and by get_project_editorial_facts. One
-- predicate changes: a source's plate is the asset its request names
-- (request.asset_id), no longer only while the request is 'done'. Under 00843
-- the two are the same — every path that leaves 'done' (a changed address or
-- revision, 00843 _enqueue_client_plate_request) clears asset_id — but
-- set_plate_focal re-queues a done request keeping its asset_id, and the
-- plate must stay on the page (and in the composer's facts) while the worker
-- re-crops, or after a failed re-crop.
--
-- Compose dispatcher (00677 shape): dispatch_client_edition_compose() every
-- minute expires leases (a leased request whose reason was queued again
-- meanwhile is absorbed by that row; a drafting edition whose run never
-- finished fails), closes runs that never reported back, and — only while the
-- llm_feature_controls row 'client-edition-compose' is enabled and a request
-- is claimable — opens a job_runs row and invokes the edge function with
-- {job_run_id}. begin/finish_client_edition_compose_run as 00677:779-830; the
-- composer sends its summed cost as p_detail.cost_usd (p_cost_usd wins when
-- given).
-- Feature row: ('client-edition-compose', enabled, $5 daily cap).
--
-- Lineage:
--   get_client_project_editorial   00842 → 00845 (body → _build_project_editorial)
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, guarded cron,
-- ON CONFLICT DO NOTHING.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Who set the focal point; what perception saw ───────────────────────

ALTER TABLE public.client_plate_assets
  ADD COLUMN IF NOT EXISTS focal_origin text CHECK (focal_origin IN ('model', 'designer'));

COMMENT ON COLUMN public.client_plate_assets.focal_origin IS
  'US-49 Phase 2: who set subject_box/focal — ''model'' (record_plate_perception) or ''designer'' (set_plate_focal). A designer focal is never overwritten by perception.';

ALTER TABLE public.client_plate_assets
  ADD COLUMN IF NOT EXISTS perceived_alt text
    CHECK (perceived_alt IS NULL OR char_length(perceived_alt) BETWEEN 1 AND 125);

COMMENT ON COLUMN public.client_plate_assets.perceived_alt IS
  'US-49 Phase 2: the accessible description perception (Call A1) wrote for these bytes, at most 125 characters, so later editions keep it (get_project_editorial_facts).';

-- ─── 2. The editorial envelope, shared ──────────────────────────────────────

-- A plate's alt text from its caption: what · whose · what kind of picture
-- (00842's wording). The builder and the edition reader (00846) both use it.
CREATE OR REPLACE FUNCTION public._client_plate_alt(p_what text, p_whose text, p_kind text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT concat_ws(' · ', p_what, p_whose,
    CASE p_kind
      WHEN 'maker' THEN 'product photograph'
      WHEN 'upload' THEN 'studio photograph'
      WHEN 'installed' THEN 'installed photograph'
      WHEN 'scan' THEN 'room scan'
      WHEN 'board' THEN 'studio board'
      WHEN 'sheet' THEN 'drawing'
      WHEN 'concept' THEN 'concept render, not installed'
    END);
$$;

REVOKE ALL ON FUNCTION public._client_plate_alt(text, text, text) FROM PUBLIC, anon, authenticated;

-- 00842's body after its guard, verbatim except the plate predicate (header)
-- and the alt wording, which now lives in _client_plate_alt.
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

-- The Phase 1 client reader: 00842's guard, verbatim; the envelope is shared.
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

  RETURN public._build_project_editorial(p_project_id);
END;
$$;

-- The composer's facts: the same envelope, no membership check, plus the
-- studio id (spend caps) and each asset's perception state (SQ-1587).
CREATE OR REPLACE FUNCTION public.get_project_editorial_facts(p_project_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_set(
           envelope,
           '{project,studio,id}',
           COALESCE((SELECT to_jsonb(studio.studio_id)
                     FROM public.resolve_studio_identity(p_project_id => p_project_id) AS studio),
                    'null'::jsonb))
         || jsonb_build_object('assets', COALESCE((
              SELECT jsonb_agg(entry.value || jsonb_build_object(
                       'perceivedPromptVersion', asset.perceived_prompt_version,
                       'focalOrigin', asset.focal_origin,
                       'perceivedAlt', asset.perceived_alt,
                       'perceivedFlags', to_jsonb(COALESCE(asset.flags, '{}'::text[])))
                     ORDER BY entry.ordinality)
              FROM jsonb_array_elements(envelope -> 'assets') WITH ORDINALITY AS entry(value, ordinality)
              LEFT JOIN public.client_plate_assets AS asset
                ON asset.id::text = entry.value ->> 'id'
            ), '[]'::jsonb))
  FROM (SELECT public._build_project_editorial(p_project_id) AS envelope) AS built
  WHERE built.envelope IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public._build_project_editorial(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_client_project_editorial(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_project_editorial(uuid)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_project_editorial_facts(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_editorial_facts(uuid) TO service_role;

COMMENT ON FUNCTION public.get_project_editorial_facts(uuid) IS
  'US-49 Phase 2: the editorial envelope of get_client_project_editorial (shared builder _build_project_editorial) with no membership check, for the client-edition-compose function, plus project.studio.id, assets[].perceivedPromptVersion, assets[].focalOrigin, assets[].perceivedAlt (null when absent) and assets[].perceivedFlags (text[], [] when none). NULL for an unknown project. Service role only.';

-- ─── 3. Helpers ─────────────────────────────────────────────────────────────

-- One edition writer per project at a time (seq, today's count, the one
-- approved row). An advisory lock: no projects row lock (00843 lock order).
CREATE OR REPLACE FUNCTION public._client_edition_lock(p_project_id uuid)
RETURNS void
LANGUAGE sql
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('client_editions:' || p_project_id::text, 0));
$$;

-- A closed-out job: the given edition or the project's approved edition has
-- frozen_at set. Nothing composes, finishes or publishes over it.
CREATE OR REPLACE FUNCTION public._client_edition_frozen(p_project_id uuid, p_edition_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.client_editions AS edition
    WHERE edition.project_id = p_project_id
      AND edition.frozen_at IS NOT NULL
      AND (edition.status = 'approved' OR edition.id = p_edition_id));
$$;

-- The refusal, taken under the per-project lock by begin, finish and approve.
CREATE OR REPLACE FUNCTION public._client_edition_refuse_frozen(p_project_id uuid, p_edition_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF public._client_edition_frozen(p_project_id, p_edition_id) THEN
    RAISE EXCEPTION 'client_edition_frozen: this job is closed out and its edition is frozen'
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'client_edition_frozen';
  END IF;
END;
$$;

-- A re-crop locks the asset's latest source request before it writes the
-- asset: the order record_client_plate_asset (00843) settles in, request then
-- asset, so a re-crop waits behind a settling copy instead of deadlocking
-- with it (SQ-1644 R2). Returns that request, or NULL when none.
CREATE OR REPLACE FUNCTION public._client_plate_lock_source(p_asset_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT latest.id
  FROM public.client_plate_requests AS latest
  JOIN public.client_plate_assets AS asset
    ON asset.id = latest.asset_id AND asset.project_id = latest.project_id
  WHERE latest.asset_id = p_asset_id
  ORDER BY latest.updated_at DESC, latest.id
  LIMIT 1
  FOR UPDATE OF latest;
$$;

-- Re-crop a plate: the source request its caller locked goes back to the
-- media worker, keeping its asset, so the plate stays on the page meanwhile.
CREATE OR REPLACE FUNCTION public._client_plate_requeue(p_request_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  UPDATE public.client_plate_requests
  SET status = 'queued',
      attempts = 0,
      last_error = NULL,
      lease_token = NULL,
      lease_expires_at = NULL,
      updated_at = now()
  WHERE id = p_request_id;
$$;

-- A project's queued request may be claimed: the job exists and is not
-- frozen, no compose of it is in flight, and it has fewer than two editions
-- created today.
CREATE OR REPLACE FUNCTION public._client_edition_project_ready(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects AS project WHERE project.id = p_project_id)
    AND NOT public._client_edition_frozen(p_project_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.client_edition_requests AS request
      WHERE request.project_id = p_project_id AND request.status = 'leased')
    AND NOT EXISTS (
      SELECT 1 FROM public.client_editions AS edition
      WHERE edition.project_id = p_project_id
        AND edition.status = 'drafting'
        AND edition.lease_expires_at > now())
    AND (SELECT count(*) FROM public.client_editions AS edition
         WHERE edition.project_id = p_project_id
           AND edition.created_at::date = current_date) < 2;
$$;

-- Objects merge key by key, all the way down; anything else is replaced.
CREATE OR REPLACE FUNCTION public._client_edition_merge(p_base jsonb, p_delta jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF p_delta IS NULL THEN
    RETURN p_base;
  END IF;
  IF jsonb_typeof(p_base) = 'object' AND jsonb_typeof(p_delta) = 'object' THEN
    RETURN p_base || COALESCE((
      SELECT jsonb_object_agg(delta.key, public._client_edition_merge(p_base -> delta.key, delta.value))
      FROM jsonb_each(p_delta) AS delta
    ), '{}'::jsonb);
  END IF;
  RETURN p_delta;
END;
$$;

-- The prose of a composition: every chapter's key, headline and standing
-- sentence, and the doorstep. A plates-only edition has the same prose as the
-- approved one.
CREATE OR REPLACE FUNCTION public._client_edition_prose(p_composition jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
    'chapters', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'key', chapter.value -> 'key',
               'headline', chapter.value -> 'headline',
               'standing', chapter.value -> 'standing')
             ORDER BY chapter.value ->> 'key', chapter.ordinality)
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(p_composition -> 'chapters') = 'array'
             THEN p_composition -> 'chapters' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS chapter(value, ordinality)
    ), '[]'::jsonb),
    'doorstep', p_composition -> 'doorstep'
  );
$$;

-- The hero an edition opens on (an override first) is a plate of the project
-- and no concept render (R142). No hero (the drawn cover) is fine.
CREATE OR REPLACE FUNCTION public._client_edition_hero_ok(
  p_project_id uuid,
  p_composition jsonb,
  p_overrides jsonb
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN hero.id IS NULL THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.client_plate_assets AS asset
      WHERE asset.id::text = hero.id
        AND asset.project_id = p_project_id
        AND NOT asset.concept_seen
        AND asset.source_kind <> 'concept')
  END
  FROM (SELECT lower(NULLIF(btrim(COALESCE(
    p_overrides ->> 'heroAssetId', p_composition -> 'hero' ->> 'assetId')), '')) AS id) AS hero;
$$;

-- A normalised subject box [x, y, w, h] inside the frame and a focal [x, y].
CREATE OR REPLACE FUNCTION public._client_plate_frame_valid(p_subject_box numeric[], p_focal numeric[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT (p_subject_box IS NULL OR (
            cardinality(p_subject_box) = 4
            AND array_position(p_subject_box, NULL) IS NULL
            AND p_subject_box[1] >= 0 AND p_subject_box[2] >= 0
            AND p_subject_box[3] > 0 AND p_subject_box[4] > 0
            AND p_subject_box[1] + p_subject_box[3] <= 1
            AND p_subject_box[2] + p_subject_box[4] <= 1))
     AND (p_focal IS NULL OR (
            cardinality(p_focal) = 2
            AND array_position(p_focal, NULL) IS NULL
            AND p_focal[1] BETWEEN 0 AND 1
            AND p_focal[2] BETWEEN 0 AND 1));
$$;

-- The studio's overrides: only the three keys, short strings (or null).
CREATE OR REPLACE FUNCTION public._client_edition_check_overrides(p_overrides jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_entry record;
  v_field record;
BEGIN
  IF jsonb_typeof(p_overrides) IS DISTINCT FROM 'object'
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_overrides) AS key
                WHERE key NOT IN ('heroAssetId', 'chapters', 'captions'))
     OR (p_overrides ? 'heroAssetId'
         AND jsonb_typeof(p_overrides -> 'heroAssetId') NOT IN ('string', 'null'))
     OR (p_overrides ? 'chapters' AND jsonb_typeof(p_overrides -> 'chapters') <> 'object')
     OR (p_overrides ? 'captions' AND jsonb_typeof(p_overrides -> 'captions') <> 'object') THEN
    RAISE EXCEPTION 'overrides take heroAssetId, chapters and captions only'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_entry IN
    SELECT 'chapters' AS part, entry.key, entry.value
    FROM jsonb_each(COALESCE(p_overrides -> 'chapters', '{}'::jsonb)) AS entry
    UNION ALL
    SELECT 'captions', entry.key, entry.value
    FROM jsonb_each(COALESCE(p_overrides -> 'captions', '{}'::jsonb)) AS entry
  LOOP
    IF jsonb_typeof(v_entry.value) <> 'object'
       OR (v_entry.part = 'captions'
           AND v_entry.key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION 'override % % is not an object of fields', v_entry.part, v_entry.key
        USING ERRCODE = 'check_violation';
    END IF;
    FOR v_field IN SELECT field.key, field.value FROM jsonb_each(v_entry.value) AS field LOOP
      IF v_field.key <> ALL (CASE v_entry.part WHEN 'chapters' THEN ARRAY['headline', 'standing']
                                               ELSE ARRAY['whose', 'when'] END)
         OR jsonb_typeof(v_field.value) NOT IN ('string', 'null')
         OR length(v_field.value #>> '{}') > (CASE v_field.key WHEN 'headline' THEN 60
                                                               WHEN 'standing' THEN 160
                                                               ELSE 80 END) THEN
        RAISE EXCEPTION 'override % % field % is not allowed or too long',
          v_entry.part, v_entry.key, v_field.key
          USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- The studio guard for an edition: the edition, locked, when the caller may
-- act for its project; one refusal for missing and not accessible.
CREATE OR REPLACE FUNCTION public._client_edition_for_studio(p_edition_id uuid)
RETURNS public.client_editions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_edition public.client_editions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_edition FROM public.client_editions WHERE id = p_edition_id;
  IF NOT FOUND OR NOT COALESCE(public.can_buy_for_project(v_edition.project_id), false) THEN
    RAISE EXCEPTION 'project not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._client_edition_lock(v_edition.project_id);
  SELECT * INTO v_edition FROM public.client_editions WHERE id = p_edition_id FOR UPDATE;
  RETURN v_edition;
END;
$$;

REVOKE ALL ON FUNCTION public._client_edition_lock(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._client_edition_frozen(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._client_edition_refuse_frozen(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._client_plate_lock_source(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._client_plate_requeue(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._client_edition_project_ready(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._client_edition_merge(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._client_edition_prose(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._client_edition_hero_ok(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._client_plate_frame_valid(numeric[], numeric[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._client_edition_check_overrides(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._client_edition_for_studio(uuid) FROM PUBLIC, anon, authenticated;

-- ─── 4. The compose lane (service role) ─────────────────────────────────────

-- Lease up to p_limit available requests (10 minutes each), one per project.
-- A frozen project's queued requests are closed, never leased.
CREATE OR REPLACE FUNCTION public.claim_client_edition_requests(p_limit int DEFAULT 5)
RETURNS SETOF public.client_edition_requests
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  UPDATE public.client_edition_requests AS request
  SET status = 'done',
      close_reason = 'project closed out: its edition is frozen'
  WHERE request.status = 'queued'
    AND public._client_edition_frozen(request.project_id);

  WITH candidate AS (
    SELECT DISTINCT ON (request.project_id) request.id, request.available_at, request.created_at
    FROM public.client_edition_requests AS request
    WHERE request.status = 'queued'
      AND request.available_at <= now()
      AND public._client_edition_project_ready(request.project_id)
    ORDER BY request.project_id, request.available_at, request.created_at, request.id
  ),
  picked AS (
    SELECT request.id
    FROM public.client_edition_requests AS request
    JOIN candidate ON candidate.id = request.id
    WHERE request.status = 'queued'
    ORDER BY candidate.available_at, candidate.created_at, request.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 5), 1), 20)
    FOR UPDATE OF request SKIP LOCKED
  )
  UPDATE public.client_edition_requests AS request
  SET status = 'leased',
      lease_token = extensions.gen_random_uuid(),
      lease_expires_at = now() + interval '10 minutes',
      attempts = request.attempts + 1
  FROM picked
  WHERE request.id = picked.id
  RETURNING request.*;
$$;

-- Open a drafting edition for a leased request.
CREATE OR REPLACE FUNCTION public.begin_client_edition(p_request_id uuid, p_lease_token uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_request public.client_edition_requests%ROWTYPE;
  v_edition_id uuid;
BEGIN
  SELECT * INTO v_request
  FROM public.client_edition_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_request.status <> 'leased'
     OR v_request.lease_token IS DISTINCT FROM p_lease_token
     OR v_request.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'edition request % is not leased to this token', p_request_id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  PERFORM public._client_edition_lock(v_request.project_id);
  PERFORM public._client_edition_refuse_frozen(v_request.project_id);

  IF (SELECT count(*) FROM public.client_editions AS edition
      WHERE edition.project_id = v_request.project_id
        AND edition.created_at::date = current_date) >= 2 THEN
    RAISE EXCEPTION 'client_edition_daily_limit: project % already has two editions today',
      v_request.project_id
      USING ERRCODE = 'program_limit_exceeded', HINT = 'client_edition_daily_limit';
  END IF;

  INSERT INTO public.client_editions (project_id, seq, status, lease_token, lease_expires_at)
  SELECT v_request.project_id,
         COALESCE(max(edition.seq), 0) + 1,
         'drafting',
         p_lease_token,
         now() + interval '10 minutes'
  FROM public.client_editions AS edition
  WHERE edition.project_id = v_request.project_id
  RETURNING id INTO v_edition_id;

  -- A new draft supersedes one the studio has not reviewed (held included).
  UPDATE public.client_editions
  SET status = 'superseded',
      superseded_at = now(),
      superseded_by = v_edition_id,
      lease_token = NULL,
      lease_expires_at = NULL
  WHERE project_id = v_request.project_id
    AND id <> v_edition_id
    AND status IN ('awaiting_review', 'drafting');

  -- This edition answers the request and every change already due.
  UPDATE public.client_edition_requests
  SET status = 'done',
      lease_token = NULL,
      lease_expires_at = NULL
  WHERE id = p_request_id
     OR (project_id = v_request.project_id
         AND status = 'queued'
         AND available_at <= now());

  RETURN v_edition_id;
END;
$$;

-- End a claimed request that makes no edition (facts unchanged, daily limit).
CREATE OR REPLACE FUNCTION public.close_client_edition_request(
  p_request_id uuid,
  p_lease_token text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'closing an edition request needs a reason' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.client_edition_requests
  SET status = 'done',
      close_reason = left(btrim(p_reason), 200),
      lease_token = NULL,
      lease_expires_at = NULL
  WHERE id = p_request_id
    AND status = 'leased'
    AND lease_token::text = lower(btrim(p_lease_token))
    AND lease_expires_at > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'edition request % is not leased to this token', p_request_id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
END;
$$;

-- Close a drafting edition. Returns the status it landed in.
CREATE OR REPLACE FUNCTION public.finish_client_edition(
  p_edition_id uuid,
  p_lease_token uuid,
  p_status text,
  p_kind text,
  p_composition jsonb,
  p_facts jsonb,
  p_images jsonb,
  p_prompt_version text,
  p_model text,
  p_cost_usd numeric,
  p_error text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_edition public.client_editions%ROWTYPE;
  v_current public.client_editions%ROWTYPE;
  v_overrides jsonb := '{}'::jsonb;
  v_refused text;
  v_count int;
BEGIN
  SELECT * INTO v_edition FROM public.client_editions WHERE id = p_edition_id;
  IF FOUND THEN
    PERFORM public._client_edition_lock(v_edition.project_id);
    SELECT * INTO v_edition FROM public.client_editions WHERE id = p_edition_id FOR UPDATE;
  END IF;
  IF NOT FOUND
     OR v_edition.status <> 'drafting'
     OR v_edition.lease_token IS DISTINCT FROM p_lease_token
     OR v_edition.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'edition % is not drafting under this token', p_edition_id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  PERFORM public._client_edition_refuse_frozen(v_edition.project_id, v_edition.id);
  IF p_status IS NULL OR p_status NOT IN ('approved', 'awaiting_review', 'failed') THEN
    RAISE EXCEPTION 'an edition finishes approved, awaiting_review or failed, not %', p_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_status = 'failed' THEN
    UPDATE public.client_editions
    SET status = 'failed',
        kind = CASE WHEN p_kind IN ('full', 'plates_only') THEN p_kind END,
        composition = p_composition,
        source_hash = p_composition ->> 'sourceHash',
        facts = (CASE WHEN jsonb_typeof(p_facts) = 'object' THEN p_facts ELSE '{}'::jsonb END)
                || jsonb_build_object('error', left(COALESCE(NULLIF(btrim(p_error), ''), 'compose failed'), 500)),
        prompt_version = p_prompt_version,
        model = p_model,
        cost_usd = p_cost_usd,
        lease_token = NULL,
        lease_expires_at = NULL
    WHERE id = p_edition_id;
    RETURN 'failed';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('full', 'plates_only') THEN
    RAISE EXCEPTION 'an edition is full or plates_only, not %', p_kind
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_status = 'approved' AND p_kind <> 'plates_only' THEN
    RAISE EXCEPTION 'only a plates-only edition publishes without review'
      USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_typeof(p_composition) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_facts) IS DISTINCT FROM 'object'
     OR (p_images IS NOT NULL AND jsonb_typeof(p_images) <> 'array') THEN
    RAISE EXCEPTION 'composition and facts are objects, images an array'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.client_edition_images (
    edition_id, asset_id, plate_role, crop_key, rank, chapter_key, alt,
    caption_what, caption_whose, caption_when
  )
  SELECT p_edition_id, asset.id, image.value ->> 'plate_role',
         COALESCE(NULLIF(btrim(image.value ->> 'crop_key'), ''), 'none'),
         COALESCE((image.value ->> 'rank')::int, image.ordinality::int),
         image.value ->> 'chapter_key', image.value ->> 'alt',
         image.value ->> 'caption_what', image.value ->> 'caption_whose', image.value ->> 'caption_when'
  FROM jsonb_array_elements(COALESCE(p_images, '[]'::jsonb)) WITH ORDINALITY AS image(value, ordinality)
  JOIN public.client_plate_assets AS asset
    ON asset.id::text = lower(image.value ->> 'asset_id')
   AND asset.project_id = v_edition.project_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> jsonb_array_length(COALESCE(p_images, '[]'::jsonb)) THEN
    RAISE EXCEPTION 'an edition image names no plate of project %', v_edition.project_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_status = 'approved' THEN
    SELECT * INTO v_current
    FROM public.client_editions
    WHERE project_id = v_edition.project_id AND status = 'approved'
    FOR UPDATE;
    IF NOT FOUND THEN
      v_refused := 'no approved edition';
    ELSIF public._client_edition_prose(v_current.composition)
          IS DISTINCT FROM public._client_edition_prose(p_composition) THEN
      v_refused := 'prose changed';
    ELSE
      -- The studio's words carry over; its hero pick does not (the new
      -- plates are the point of the edition, and Undo is in the Press band).
      v_overrides := v_current.overrides - 'heroAssetId';
      IF NOT public._client_edition_hero_ok(v_edition.project_id, p_composition, v_overrides) THEN
        v_refused := 'hero is not a publishable plate';
      END IF;
    END IF;

    IF v_refused IS NULL THEN
      UPDATE public.client_editions
      SET status = 'superseded',
          superseded_at = now(),
          superseded_by = p_edition_id
      WHERE id = v_current.id;

      UPDATE public.client_editions
      SET status = 'approved',
          kind = p_kind,
          composition = p_composition,
          source_hash = p_composition ->> 'sourceHash',
          facts = p_facts,
          overrides = v_overrides,
          prompt_version = p_prompt_version,
          model = p_model,
          cost_usd = p_cost_usd,
          auto_published = true,
          approved_at = now(),
          lease_token = NULL,
          lease_expires_at = NULL
      WHERE id = p_edition_id;
      RETURN 'approved';
    END IF;
  END IF;

  UPDATE public.client_editions
  SET status = 'awaiting_review',
      kind = p_kind,
      composition = p_composition,
      source_hash = p_composition ->> 'sourceHash',
      facts = p_facts || CASE WHEN v_refused IS NULL THEN '{}'::jsonb
                              ELSE jsonb_build_object('autoPublishRefused', v_refused) END,
      prompt_version = p_prompt_version,
      model = p_model,
      cost_usd = p_cost_usd,
      lease_token = NULL,
      lease_expires_at = NULL
  WHERE id = p_edition_id;
  RETURN 'awaiting_review';
END;
$$;

-- Perception (Call A1) lands on the asset, once per sha256.
CREATE OR REPLACE FUNCTION public.record_plate_perception(
  p_asset_id uuid,
  p_subject_box numeric[],
  p_focal numeric[],
  p_flags text[],
  p_alt text,
  p_prompt_version text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_before public.client_plate_assets%ROWTYPE;
  v_source uuid;
BEGIN
  IF NOT public._client_plate_frame_valid(p_subject_box, p_focal) THEN
    RAISE EXCEPTION 'subject box and focal must be normalised 0-1 inside the frame'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(p_flags, '{}'::text[])) AS flag
             WHERE flag IS NULL OR flag NOT IN ('watermark', 'people', 'text_overlay')) THEN
    RAISE EXCEPTION 'plate flags are watermark, people or text_overlay'
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(btrim(p_alt)) > 125 THEN
    RAISE EXCEPTION 'perceived alt is at most 125 characters' USING ERRCODE = 'check_violation';
  END IF;
  IF NULLIF(btrim(p_prompt_version), '') IS NULL THEN
    RAISE EXCEPTION 'perception needs its prompt version' USING ERRCODE = 'check_violation';
  END IF;

  -- The source request before the asset (00843 settlement order).
  v_source := public._client_plate_lock_source(p_asset_id);
  SELECT * INTO v_before FROM public.client_plate_assets WHERE id = p_asset_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plate asset % not found', p_asset_id USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.client_plate_assets
  SET subject_box = CASE WHEN focal_origin = 'designer' THEN subject_box ELSE p_subject_box END,
      focal = CASE WHEN focal_origin = 'designer' THEN focal ELSE p_focal END,
      focal_origin = CASE
        WHEN focal_origin = 'designer' THEN 'designer'
        WHEN p_subject_box IS NULL AND p_focal IS NULL THEN focal_origin
        ELSE 'model'
      END,
      flags = COALESCE(p_flags, '{}'::text[]),
      perceived_alt = NULLIF(btrim(p_alt), ''),
      perceived_prompt_version = btrim(p_prompt_version),
      updated_at = now()
  WHERE id = p_asset_id;

  -- New model framing needs new crops; designer framing is never touched.
  IF v_before.focal_origin IS DISTINCT FROM 'designer'
     AND (v_before.subject_box IS DISTINCT FROM p_subject_box
          OR v_before.focal IS DISTINCT FROM p_focal) THEN
    PERFORM public._client_plate_requeue(v_source);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_client_edition_requests(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_client_edition(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.close_client_edition_request(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_client_edition(uuid, uuid, text, text, jsonb, jsonb, jsonb, text, text, numeric, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_plate_perception(uuid, numeric[], numeric[], text[], text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_client_edition_requests(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_client_edition(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.close_client_edition_request(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_client_edition(uuid, uuid, text, text, jsonb, jsonb, jsonb, text, text, numeric, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_plate_perception(uuid, numeric[], numeric[], text[], text, text)
  TO service_role;

-- ─── 5. The studio's acts ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_client_edition(
  p_edition_id uuid,
  p_overrides jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_edition public.client_editions%ROWTYPE := public._client_edition_for_studio(p_edition_id);
  v_overrides jsonb;
BEGIN
  PERFORM public._client_edition_refuse_frozen(v_edition.project_id, v_edition.id);
  IF v_edition.status <> 'awaiting_review' THEN
    RAISE EXCEPTION 'edition % is %, not awaiting review', p_edition_id, v_edition.status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  PERFORM public._client_edition_check_overrides(COALESCE(p_overrides, '{}'::jsonb));
  v_overrides := public._client_edition_merge(v_edition.overrides, COALESCE(p_overrides, '{}'::jsonb));
  IF NOT public._client_edition_hero_ok(v_edition.project_id, v_edition.composition, v_overrides) THEN
    RAISE EXCEPTION 'the hero must be a photograph of this job, never a concept render'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.client_editions
  SET status = 'superseded',
      superseded_at = now(),
      superseded_by = p_edition_id
  WHERE project_id = v_edition.project_id
    AND status = 'approved'
    AND id <> p_edition_id;

  UPDATE public.client_editions
  SET status = 'approved',
      overrides = v_overrides,
      auto_published = false,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      approved_at = now()
  WHERE id = p_edition_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.hold_client_edition(p_edition_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_edition public.client_editions%ROWTYPE := public._client_edition_for_studio(p_edition_id);
BEGIN
  IF v_edition.status <> 'awaiting_review' THEN
    RAISE EXCEPTION 'edition % is %, not awaiting review', p_edition_id, v_edition.status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  UPDATE public.client_editions
  SET facts = jsonb_set(COALESCE(facts, '{}'::jsonb), '{held}', 'true'::jsonb)
  WHERE id = p_edition_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_client_edition(p_edition_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_edition public.client_editions%ROWTYPE := public._client_edition_for_studio(p_edition_id);
  v_previous uuid;
BEGIN
  IF v_edition.status <> 'approved' THEN
    RAISE EXCEPTION 'edition % is %, not approved', p_edition_id, v_edition.status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF v_edition.frozen_at IS NOT NULL THEN
    RAISE EXCEPTION 'edition % is frozen', p_edition_id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  SELECT edition.id INTO v_previous
  FROM public.client_editions AS edition
  WHERE edition.superseded_by = p_edition_id
    AND edition.status = 'superseded'
    AND edition.approved_at IS NOT NULL
  ORDER BY edition.approved_at DESC, edition.seq DESC
  LIMIT 1
  FOR UPDATE;

  UPDATE public.client_editions
  SET status = 'superseded',
      superseded_at = now(),
      superseded_by = NULL
  WHERE id = p_edition_id;

  IF v_previous IS NOT NULL THEN
    UPDATE public.client_editions
    SET status = 'approved',
        superseded_at = NULL,
        superseded_by = NULL
    WHERE id = v_previous;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_plate_focal(
  p_asset_id uuid,
  p_subject_box numeric[],
  p_focal numeric[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_project_id uuid;
  v_source uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT asset.project_id INTO v_project_id
  FROM public.client_plate_assets AS asset WHERE asset.id = p_asset_id;
  IF NOT FOUND OR NOT COALESCE(public.can_buy_for_project(v_project_id), false) THEN
    RAISE EXCEPTION 'project not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_focal IS NULL OR NOT public._client_plate_frame_valid(p_subject_box, p_focal) THEN
    RAISE EXCEPTION 'subject box and focal must be normalised 0-1 inside the frame'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The source request before the asset (00843 settlement order).
  v_source := public._client_plate_lock_source(p_asset_id);
  UPDATE public.client_plate_assets
  SET subject_box = p_subject_box,
      focal = p_focal,
      focal_origin = 'designer',
      updated_at = now()
  WHERE id = p_asset_id;

  PERFORM public._client_plate_requeue(v_source);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_client_editions(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR NOT COALESCE(public.can_buy_for_project(v_project.id), false) THEN
    RAISE EXCEPTION 'project not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'showMakers', v_project.show_makers,
    'editions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', edition.id,
        'seq', edition.seq,
        'status', edition.status,
        'kind', edition.kind,
        'autoPublished', edition.auto_published,
        'held', COALESCE((edition.facts ->> 'held')::boolean, false),
        'approvedAt', edition.approved_at,
        'reviewedAt', edition.reviewed_at,
        'reviewedBy', CASE WHEN edition.reviewed_by IS NOT NULL THEN
          jsonb_build_object('id', edition.reviewed_by, 'name', reviewer.full_name) END,
        'createdAt', edition.created_at,
        'supersededAt', edition.superseded_at,
        'supersededBy', edition.superseded_by,
        'frozenAt', edition.frozen_at,
        'promptVersion', edition.prompt_version,
        'hero', edition.composition -> 'hero',
        'headlines', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'key', chapter.value -> 'key', 'headline', chapter.value -> 'headline')
                 ORDER BY chapter.ordinality)
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(edition.composition -> 'chapters') = 'array'
                 THEN edition.composition -> 'chapters' ELSE '[]'::jsonb END
          ) WITH ORDINALITY AS chapter(value, ordinality)
        ), '[]'::jsonb),
        'composition', edition.composition,
        'overrides', edition.overrides,
        'images', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'assetId', image.asset_id,
            'plateRole', image.plate_role,
            'cropKey', image.crop_key,
            'rank', image.rank,
            'chapterKey', image.chapter_key,
            'alt', image.alt,
            'captionWhat', image.caption_what,
            'captionWhose', image.caption_whose,
            'captionWhen', image.caption_when,
            'sourceKind', COALESCE(source.source_kind,
                            CASE WHEN asset.concept_seen OR asset.source_kind = 'concept'
                                 THEN 'concept' ELSE asset.source_kind END),
            'sourceUrl', source.source_url,
            'sourceTable', source.source_ref ->> 'table',
            -- 00846 get_client_project_edition's kind, the one its makers-off
            -- masking keys on: concept once any concept render produced the
            -- bytes, else the edition's frozen fact, else the first source.
            'attributionKind', CASE WHEN asset.concept_seen OR asset.source_kind = 'concept' THEN 'concept'
                                    ELSE COALESCE(fact.source_kind, asset.source_kind) END,
            'ground', asset.ground,
            'width', asset.width,
            'height', asset.height,
            'focal', to_jsonb(asset.focal),
            'subjectBox', to_jsonb(asset.subject_box),
            'focalOrigin', asset.focal_origin
          ) ORDER BY image.rank NULLS LAST, image.id)
          FROM public.client_edition_images AS image
          JOIN public.client_plate_assets AS asset ON asset.id = image.asset_id
          -- Kind, URL and table from one source row (the preview signs the URL
          -- in the kind's bucket); a concept source first (R142), then latest.
          LEFT JOIN LATERAL (
            SELECT request.source_kind, request.source_url, request.source_ref
            FROM public.client_plate_requests AS request
            WHERE request.asset_id = asset.id
            ORDER BY request.source_kind = 'concept' DESC, request.updated_at DESC, request.id
            LIMIT 1
          ) AS source ON true
          -- The asset's first entry in the edition's facts, as 00846 reads it.
          LEFT JOIN LATERAL (
            SELECT entry.value ->> 'sourceKind' AS source_kind
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(edition.facts -> 'assets') = 'array'
                   THEN edition.facts -> 'assets' ELSE '[]'::jsonb END
            ) WITH ORDINALITY AS entry(value, ordinality)
            WHERE lower(entry.value ->> 'id') = image.asset_id::text
            ORDER BY entry.ordinality
            LIMIT 1
          ) AS fact ON true
          WHERE image.edition_id = edition.id
        ), '[]'::jsonb)
      ) ORDER BY edition.seq DESC)
      FROM public.client_editions AS edition
      LEFT JOIN public.profiles AS reviewer ON reviewer.id = edition.reviewed_by
      WHERE edition.project_id = p_project_id
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_client_edition(uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hold_client_edition(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.undo_client_edition(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_plate_focal(uuid, numeric[], numeric[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_client_editions(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_client_edition(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hold_client_edition(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_client_edition(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_plate_focal(uuid, numeric[], numeric[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_client_editions(uuid) TO authenticated;

COMMENT ON FUNCTION public.list_client_editions(uuid) IS
  'US-49 Press band: {showMakers, editions:[{id,seq,status,kind,autoPublished,held,approvedAt,reviewedAt,reviewedBy{id,name},createdAt,supersededAt,supersededBy,frozenAt,promptVersion,hero,headlines[{key,headline}],composition,overrides,images[{assetId,plateRole,cropKey,rank,chapterKey,alt,captionWhat,captionWhose,captionWhen,sourceKind,sourceUrl,sourceTable,attributionKind,ground,width,height,focal,subjectBox,focalOrigin}]}]} newest first. Caller must hold can_buy_for_project.';

-- ─── 6. job_runs: begin (manual), finish, dispatch (cron) — 00677 shape ─────

CREATE OR REPLACE FUNCTION public.begin_client_edition_compose_run()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  INSERT INTO public.job_runs (job_name, status, detail)
  VALUES ('client-edition-compose', 'running', jsonb_build_object('trigger', 'manual'))
  RETURNING id;
$$;

CREATE OR REPLACE FUNCTION public.finish_client_edition_compose_run(
  p_run_id bigint,
  p_status text,
  p_detail jsonb DEFAULT '{}'::jsonb,
  p_error text DEFAULT NULL,
  p_cost_usd numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  -- The composer sends its summed cost as p_detail.cost_usd (SQ-1587).
  v_cost numeric := COALESCE(
    p_cost_usd,
    CASE WHEN jsonb_typeof(p_detail -> 'cost_usd') = 'number'
         THEN (p_detail ->> 'cost_usd')::numeric END);
BEGIN
  IF p_status NOT IN ('succeeded', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'invalid edition compose terminal status %', p_status
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.job_runs
  SET status = p_status,
      finished_at = now(),
      -- job_runs.cost_usd is numeric(8,2); the exact figure stays in detail.
      cost_usd = CASE WHEN v_cost IS NULL THEN cost_usd ELSE round(v_cost, 2) END,
      detail = detail || COALESCE(p_detail, '{}'::jsonb)
        || CASE WHEN v_cost IS NULL THEN '{}'::jsonb
                ELSE jsonb_build_object('cost_usd_exact', v_cost) END,
      error = CASE WHEN p_status = 'failed' THEN left(p_error, 500) ELSE NULL END
  WHERE id = p_run_id
    AND job_name = 'client-edition-compose'
    AND status = 'running';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'running edition compose job % not found', p_run_id
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

-- Every minute: expire leases, close runs that never reported back, then —
-- only while composition is enabled and a request is claimable — open a
-- job_runs row and invoke the function.
CREATE OR REPLACE FUNCTION public.dispatch_client_edition_compose()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_run_id bigint;
  v_request_id bigint;
BEGIN
  -- An expired lease whose reason was queued again meanwhile is answered by
  -- that queued row; the rest go back to the queue (failed after three).
  UPDATE public.client_edition_requests AS request
  SET status = 'done',
      lease_token = NULL,
      lease_expires_at = NULL
  WHERE request.status = 'leased'
    AND request.lease_expires_at <= now()
    AND EXISTS (
      SELECT 1 FROM public.client_edition_requests AS queued
      WHERE queued.debounce_key = request.debounce_key
        AND queued.status = 'queued');

  UPDATE public.client_edition_requests
  SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END,
      lease_token = NULL,
      lease_expires_at = NULL
  WHERE status = 'leased'
    AND lease_expires_at <= now();

  -- A draft whose run never finished.
  UPDATE public.client_editions
  SET status = 'failed',
      facts = COALESCE(facts, '{}'::jsonb) || jsonb_build_object('error', 'lease expired'),
      lease_token = NULL,
      lease_expires_at = NULL
  WHERE status = 'drafting'
    AND lease_expires_at <= now();

  -- A run that never reported back is closed so it does not pile up.
  UPDATE public.job_runs
  SET status = 'failed', finished_at = now(), error = 'no completion reported'
  WHERE job_name = 'client-edition-compose'
    AND status = 'running'
    AND started_at < now() - interval '10 minutes';

  -- Kill switch: composition off → requests wait, approved editions still render.
  IF NOT EXISTS (
    SELECT 1 FROM public.llm_feature_controls AS control
    WHERE control.feature = 'client-edition-compose' AND control.enabled
  ) THEN
    RETURN NULL;
  END IF;

  -- Billing guard: nothing claimable → no row, no request.
  IF NOT EXISTS (
    SELECT 1
    FROM public.client_edition_requests AS request
    WHERE request.status = 'queued'
      AND request.available_at <= now()
      AND public._client_edition_project_ready(request.project_id)
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.job_runs (job_name, status, detail)
  VALUES (
    'client-edition-compose',
    'running',
    jsonb_build_object('trigger', 'cron', 'dispatch_state', 'starting')
  )
  RETURNING id INTO v_run_id;

  BEGIN
    SELECT public.invoke_edge_function(
      'client-edition-compose',
      jsonb_build_object('job_run_id', v_run_id)
    )
    INTO v_request_id;

    IF v_request_id IS NULL THEN
      UPDATE public.job_runs
      SET status = 'failed',
          finished_at = now(),
          error = 'edge dispatch skipped: Supabase URL/service key unavailable',
          detail = detail || jsonb_build_object('dispatch_state', 'not_sent')
      WHERE id = v_run_id;
    ELSE
      UPDATE public.job_runs
      SET detail = detail || jsonb_build_object('dispatch_state', 'sent', 'request_id', v_request_id)
      WHERE id = v_run_id;
      -- The edge function owns the terminal update via
      -- finish_client_edition_compose_run(). Enqueue success is not job success.
    END IF;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.job_runs
    SET status = 'failed',
        finished_at = now(),
        error = SQLERRM,
        detail = detail || jsonb_build_object('dispatch_state', 'error')
    WHERE id = v_run_id;
  END;

  RETURN v_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_client_edition_compose_run()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_client_edition_compose_run(bigint, text, jsonb, text, numeric)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dispatch_client_edition_compose()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_client_edition_compose_run() TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_client_edition_compose_run(bigint, text, jsonb, text, numeric)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_client_edition_compose() TO service_role;

-- ─── 7. Feature row + every-minute cron ─────────────────────────────────────

INSERT INTO public.llm_feature_controls (feature, enabled, daily_cap_usd)
VALUES ('client-edition-compose', true, 5)
ON CONFLICT (feature) DO NOTHING;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $cron$
DECLARE
  v_job_id bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR v_job_id IN
      SELECT jobid FROM cron.job WHERE jobname = 'client-edition-compose-dispatch'
    LOOP
      PERFORM cron.unschedule(v_job_id);
    END LOOP;

    PERFORM cron.schedule(
      'client-edition-compose-dispatch',
      '* * * * *',
      $command$SELECT public.dispatch_client_edition_compose();$command$
    );
  END IF;
END
$cron$;
