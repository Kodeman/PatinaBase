-- ═══════════════════════════════════════════════════════════════════════════
-- 00846 — The House Issue: the approved-edition reader (US-49 Phase 2)
-- ═══════════════════════════════════════════════════════════════════════════
-- get_client_project_edition(p_project_id) is what the homeowner page reads
-- once an edition is approved: the facts the edition was composed from
-- (frozen at compose time), its composition with the studio's overrides
-- applied, and the plates it sets.
--
--   Guard        00842's: the project's client or can_buy_for_project
--                (42501 'authentication required' / 'project not found or
--                not accessible').
--   No edition   NULL when the project has no approved edition; the page
--                falls back to the Phase 1 envelope (get_client_project_editorial).
--   Envelope     the 00842 shape, projected key by key from the frozen facts
--                — never the composer's service-only fields (studio id,
--                perception state) — with three live readings:
--                • project.showMakers is today's switch; while it is off no
--                  item names its maker or origin and a caption names the
--                  studio, whatever was true when the edition was composed;
--                • each plate's bytes facts (sha256, size, ground, colour,
--                  LQIP, focal, subject box, crops) are the asset row now,
--                  so a designer focal and its re-crop show without a new
--                  edition, and a plate whose asset is gone is left out;
--                • a plate any concept render produced is a concept
--                  (concept_seen, R142) and is never the hero; nor is a
--                  plate perception flagged (people, watermark,
--                  text_overlay), a studio override included.
--                descriptionAsSigned is cut to 280 characters.
--   composition  {voice, hero:{assetId}|null, held:[assetId],
--                chapters:[{key,headline,standing}], doorstep:{standing}|null,
--                notice} with overrides applied (heroAssetId, chapters by key;
--                a JSON null override restores the composed text); the
--                composer's sourceHash and hero rationale stay inside.
--   images       [{assetId, plateRole, cropKey, rank, chapterKey}] by rank.
--                Captions and alt live on assets[]: an edition image's
--                caption/alt first (lowest rank), then the facts' own, then
--                captions overrides (whose, when). The live switch outranks
--                a saved whose (story seq 48): while makers are off, an
--                item picture's plate (sourceKind maker or upload — the
--                attributionKind 00845's list_client_editions returns, so
--                the designer mirror masks the same plates) is the
--                studio's whatever its override says; any other plate's
--                whose override still shows. While makers are off, an item
--                picture's alt is rebuilt from that studio caption whatever
--                the edition froze, since an alt perceived while makers
--                showed can name one (SQ-1660 N1).
--   Makers off   a consent switch over every kind (story seq 53): no alt or
--                caption field names a maker of this job.
--                The names are the vendor record's name and the line's own
--                vendor_name on every project_ffe_items row of the project
--                (00845's maker-name source, removed lines included) plus
--                each makerName the frozen facts carry; trimmed, matched
--                case-insensitively as literal substrings, names shorter
--                than 3 characters ignored. A what naming one loses each
--                occurrence (spaces collapsed, separators trimmed from its
--                ends); emptied, it is the line's category, else the kind
--                words (story seq 59). A whose override naming one is the
--                studio's. A when naming one is the facts' date, else NULL.
--                A stored or fact alt naming one is rebuilt from the
--                caption shown, as above. Any other alt is kept byte for
--                byte. The studio's own name and the kind words are trusted,
--                not maker text (seq 59 R1): a maker whose name sits inside
--                them can still read there. Makers on: unchanged.
--   Override hero  a heroAssetId the edition does not name is still a plate
--                when it is this project's and no concept: its words are the
--                builder's record-derived entry, else the studio's name and
--                the picture's kind.
--   edition      {id, seq, approvedAt, approvedBy 'studio'|'auto', notice}.
--
-- client_can_read_plate v2: p_scope_id may also be an approved edition id;
-- the edition's project then stands in for the scope. Same membership and
-- same "a plate with these bytes belongs to the project" check as 00843.
--
-- Lineage:
--   client_can_read_plate   00843 → 00846 (edition scope)
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_client_project_edition(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_edition public.client_editions%ROWTYPE;
  v_facts jsonb;
  v_composition jsonb;
  v_overrides jsonb;
  v_show_makers boolean;
  v_studio_name text;
  v_maker_pattern text;
  v_extra_hero text;
  v_extra_fact jsonb;
  v_hero text;
  v_assets jsonb;
BEGIN
  -- 00842's guard, verbatim.
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

  SELECT * INTO v_edition
  FROM public.client_editions
  WHERE project_id = p_project_id AND status = 'approved';
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_facts := CASE WHEN jsonb_typeof(v_edition.facts) = 'object' THEN v_edition.facts ELSE '{}'::jsonb END;
  v_composition := CASE WHEN jsonb_typeof(v_edition.composition) = 'object'
                        THEN v_edition.composition ELSE '{}'::jsonb END;
  v_overrides := COALESCE(v_edition.overrides, '{}'::jsonb);
  v_show_makers := COALESCE(v_project.show_makers, false);
  v_studio_name := v_facts -> 'project' -> 'studio' ->> 'name';

  -- Makers off: the names no plate's words may carry (header), as one
  -- case-insensitive alternation of literals, longest first, so one pattern
  -- both finds and removes them. NULL while makers show, so nothing below
  -- masks anything then.
  IF NOT v_show_makers THEN
    SELECT string_agg(regexp_replace(maker.name, '([.^$|?*+()\[\]{}\\])', '\\\1', 'g'), '|'
                      ORDER BY char_length(maker.name) DESC, maker.name)
    INTO v_maker_pattern
    FROM (
      SELECT DISTINCT lower(source.name) AS name
      FROM (
        SELECT btrim(vendor.name) AS name
        FROM public.project_ffe_items AS item
        JOIN public.vendors AS vendor ON vendor.id = item.vendor_id
        WHERE item.project_id = p_project_id
        UNION ALL
        SELECT btrim(item.vendor_name)
        FROM public.project_ffe_items AS item
        WHERE item.project_id = p_project_id
        UNION ALL
        SELECT btrim(item.value ->> 'makerName')
        FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(v_facts -> 'rooms') = 'array' THEN v_facts -> 'rooms' ELSE '[]'::jsonb END
             ) AS room
        CROSS JOIN LATERAL jsonb_array_elements(
               CASE WHEN jsonb_typeof(room.value -> 'items') = 'array' THEN room.value -> 'items' ELSE '[]'::jsonb END
             ) AS item
      ) AS source
      WHERE char_length(source.name) >= 3
    ) AS maker;
  END IF;

  -- An override hero the edition does not name (header).
  v_extra_hero := lower(NULLIF(btrim(v_overrides ->> 'heroAssetId'), ''));
  IF v_extra_hero IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(v_facts -> 'assets') = 'array' THEN v_facts -> 'assets' ELSE '[]'::jsonb END
       ) AS entry
       WHERE lower(entry.value ->> 'id') = v_extra_hero)
     AND NOT EXISTS (
       SELECT 1 FROM public.client_edition_images AS image
       WHERE image.edition_id = v_edition.id AND image.asset_id::text = v_extra_hero) THEN
    SELECT COALESCE(
             (SELECT entry.value
              FROM jsonb_array_elements(
                COALESCE(public._build_project_editorial(p_project_id) -> 'assets', '[]'::jsonb)) AS entry
              WHERE entry.value ->> 'id' = v_extra_hero
              LIMIT 1),
             jsonb_build_object(
               'caption', jsonb_build_object('what', NULL, 'whose', v_studio_name, 'when', NULL),
               'alt', public._client_plate_alt(NULL, v_studio_name, asset.source_kind)))
    INTO v_extra_fact
    FROM public.client_plate_assets AS asset
    WHERE asset.id::text = v_extra_hero
      AND asset.project_id = p_project_id
      AND NOT asset.concept_seen
      AND asset.source_kind <> 'concept';
  END IF;

  -- The plates: every asset the facts or the edition name that is still a
  -- plate of this project, live bytes facts, frozen words, overrides last.
  WITH named AS (
    SELECT lower(entry.value ->> 'id') AS asset_id, entry.value AS fact, entry.ordinality AS position
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_facts -> 'assets') = 'array' THEN v_facts -> 'assets' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS entry(value, ordinality)
    UNION ALL
    SELECT image.asset_id::text, NULL::jsonb, NULL::bigint
    FROM public.client_edition_images AS image
    WHERE image.edition_id = v_edition.id
    UNION ALL
    SELECT v_extra_hero, v_extra_fact, NULL::bigint
    WHERE v_extra_fact IS NOT NULL
  ),
  plate AS (
    SELECT DISTINCT ON (asset.id)
           asset.*,
           named.fact,
           min(named.position) OVER (PARTITION BY asset.id) AS position
    FROM named
    JOIN public.client_plate_assets AS asset
      ON asset.id::text = named.asset_id
     AND asset.project_id = p_project_id
    ORDER BY asset.id, named.fact IS NULL, named.position
  ),
  worded AS (
    SELECT plate.*,
           -- The attribution kind; list_client_editions' attributionKind is
           -- this expression over the same first facts entry.
           CASE WHEN plate.concept_seen OR plate.source_kind = 'concept' THEN 'concept'
                ELSE COALESCE(plate.fact ->> 'sourceKind', plate.source_kind) END AS kind,
           COALESCE(first_image.caption_what, plate.fact -> 'caption' ->> 'what') AS stored_what,
           COALESCE(first_image.alt, plate.fact ->> 'alt') AS stored_alt,
           first_image.caption_whose,
           COALESCE(
             v_overrides -> 'captions' -> plate.id::text ->> 'when',
             first_image.caption_when,
             plate.fact -> 'caption' ->> 'when') AS stored_when,
           v_overrides -> 'captions' -> plate.id::text AS caption_override
    FROM plate
    LEFT JOIN LATERAL (
      SELECT image.alt, image.caption_what, image.caption_whose, image.caption_when
      FROM public.client_edition_images AS image
      WHERE image.edition_id = v_edition.id AND image.asset_id = plate.id
      ORDER BY image.rank NULLS LAST, image.id
      LIMIT 1
    ) AS first_image ON true
  ),
  -- Which words name a maker of this job (never while makers show), and the
  -- what with each such name taken out.
  checked AS (
    SELECT worded.*,
           COALESCE(worded.stored_what ~* v_maker_pattern, false) AS what_names_maker,
           COALESCE((worded.caption_override ->> 'whose') ~* v_maker_pattern, false) AS whose_names_maker,
           COALESCE(worded.stored_alt ~* v_maker_pattern, false) AS alt_names_maker,
           COALESCE(worded.stored_when ~* v_maker_pattern, false) AS when_names_maker,
           NULLIF(regexp_replace(regexp_replace(
             regexp_replace(worded.stored_what, v_maker_pattern, '', 'gi'),
             '\s{2,}', ' ', 'g'), '^[\s·—,:-]+|[\s·—,:-]+$', '', 'g'), '') AS bare_what
    FROM worded
  ),
  shown AS (
    SELECT checked.*,
           -- Makers off: a what naming a maker keeps what is left of it (a
           -- name the removal re-formed falls through too); emptied, it is
           -- the category of the line the plate pictures, else the kind
           -- words (story seq 59), so the plate keeps its caption.
           CASE WHEN NOT checked.what_names_maker THEN checked.stored_what
                ELSE COALESCE(
                       CASE WHEN NOT COALESCE(checked.bare_what ~* v_maker_pattern, false)
                            THEN checked.bare_what END,
                       (SELECT btrim(item.value ->> 'category')
                        FROM jsonb_array_elements(
                               CASE WHEN jsonb_typeof(v_facts -> 'rooms') = 'array'
                                    THEN v_facts -> 'rooms' ELSE '[]'::jsonb END
                             ) WITH ORDINALITY AS room(value, ordinality)
                        CROSS JOIN LATERAL jsonb_array_elements(
                               CASE WHEN jsonb_typeof(room.value -> 'items') = 'array'
                                    THEN room.value -> 'items' ELSE '[]'::jsonb END
                             ) WITH ORDINALITY AS item(value, ordinality)
                        WHERE item.value -> 'assetIds' ? checked.id::text
                          AND lower(btrim(item.value ->> 'category')) NOT IN ('', 'uncategorized')
                          AND NOT COALESCE((item.value ->> 'category') ~* v_maker_pattern, false)
                        ORDER BY room.ordinality, item.ordinality
                        LIMIT 1),
                       public._client_plate_alt(NULL, NULL, checked.kind)) END AS shown_what,
           -- Makers off: an item picture is the studio's, an override
           -- notwithstanding (seq 48); other plates keep an override that
           -- names no maker (seq 53).
           CASE WHEN NOT v_show_makers
                     AND (checked.kind IN ('maker', 'upload') OR checked.whose_names_maker)
                THEN v_studio_name
                ELSE COALESCE(
                       checked.caption_override ->> 'whose',
                       CASE WHEN v_show_makers
                            THEN COALESCE(checked.caption_whose, checked.fact -> 'caption' ->> 'whose')
                            ELSE v_studio_name END) END AS shown_whose,
           -- Makers off: a when naming a maker is the facts' date, else none.
           CASE WHEN NOT checked.when_names_maker THEN checked.stored_when
                WHEN NOT COALESCE((checked.fact -> 'caption' ->> 'when') ~* v_maker_pattern, false)
                THEN checked.fact -> 'caption' ->> 'when' END AS shown_when
    FROM checked
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', shown.id,
           'sha256', shown.sha256,
           'sourceKind', shown.kind,
           'width', shown.width,
           'height', shown.height,
           'ground', shown.ground,
           'dominantHex', shown.dominant_hex,
           'lqip', shown.lqip,
           'focal', to_jsonb(shown.focal),
           'subjectBox', to_jsonb(shown.subject_box),
           'crops', shown.crops,
           'caption', jsonb_build_object(
             'what', shown.shown_what, 'whose', shown.shown_whose, 'when', shown.shown_when),
           -- Makers off: an item picture's alt may name its maker, whatever
           -- the edition froze, and any alt naming one is rebuilt too; both
           -- from the caption shown (a what that is only the kind words is
           -- left out, the alt ends on them anyway).
           -- Trusted words (story seq 59 R1): the studio's own name
           -- (resolve_studio_identity's, as the facts froze it) and
           -- _client_plate_alt's fixed kind wording are not maker text. This
           -- rebuilt alt, like the studio's whose above, is final: never
           -- re-masked and never nulled, even when a maker's name sits
           -- inside those words (vendor Nord, studio Nord Studio; vendor
           -- Studio, "studio photograph").
           'alt', CASE WHEN NOT v_show_makers
                            AND (shown.kind IN ('maker', 'upload') OR shown.alt_names_maker)
                       THEN public._client_plate_alt(
                              NULLIF(shown.shown_what, public._client_plate_alt(NULL, NULL, shown.kind)),
                              shown.shown_whose, shown.kind)
                       ELSE shown.stored_alt END
         ) ORDER BY shown.position NULLS LAST, shown.id), '[]'::jsonb)
  INTO v_assets
  FROM shown;

  -- The hero: an override first; never a concept, never a stranger's plate,
  -- never a flagged picture.
  v_hero := lower(NULLIF(btrim(COALESCE(
    v_overrides ->> 'heroAssetId', v_composition -> 'hero' ->> 'assetId')), ''));
  IF v_hero IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_assets) AS asset
    JOIN public.client_plate_assets AS plate ON plate.id::text = asset.value ->> 'id'
    WHERE asset.value ->> 'id' = v_hero
      AND asset.value ->> 'sourceKind' <> 'concept'
      AND NOT (plate.flags && ARRAY['people', 'watermark', 'text_overlay']::text[])
  ) THEN
    v_hero := NULL;
  END IF;

  RETURN jsonb_build_object(
    'project', jsonb_build_object(
      'id', v_project.id,
      'name', v_facts -> 'project' -> 'name',
      'phase', v_facts -> 'project' -> 'phase',
      'targetDate', v_facts -> 'project' -> 'targetDate',
      'showMakers', v_show_makers,
      'studio', jsonb_build_object(
        'name', v_facts -> 'project' -> 'studio' -> 'name',
        'town', v_facts -> 'project' -> 'studio' -> 'town')
    ),
    'rooms', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', room.value -> 'id',
        'name', room.value -> 'name',
        'anchor', room.value -> 'anchor',
        'conceptAssetId', room.value -> 'conceptAssetId',
        'scanAssetIds', COALESCE(room.value -> 'scanAssetIds', '[]'::jsonb),
        'items', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', item.value -> 'id',
            'nameAsSigned', item.value -> 'nameAsSigned',
            'category', item.value -> 'category',
            'status', item.value -> 'status',
            'makerName', CASE WHEN v_show_makers THEN item.value -> 'makerName' END,
            'madeIn', CASE WHEN v_show_makers THEN item.value -> 'madeIn' END,
            'material', item.value -> 'material',
            'finish', item.value -> 'finish',
            'dimensions', item.value -> 'dimensions',
            'descriptionAsSigned', to_jsonb(left(item.value ->> 'descriptionAsSigned', 280)),
            'assetIds', COALESCE(item.value -> 'assetIds', '[]'::jsonb),
            'silhouetteKind', item.value -> 'silhouetteKind'
          ) ORDER BY item.ordinality)
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(room.value -> 'items') = 'array' THEN room.value -> 'items' ELSE '[]'::jsonb END
          ) WITH ORDINALITY AS item(value, ordinality)
        ), '[]'::jsonb)
      ) ORDER BY room.ordinality)
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(v_facts -> 'rooms') = 'array' THEN v_facts -> 'rooms' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS room(value, ordinality)
    ), '[]'::jsonb),
    'assets', v_assets,
    'palette', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'hex', swatch.value -> 'hex', 'brand', swatch.value -> 'brand', 'name', swatch.value -> 'name'
      ) ORDER BY swatch.ordinality)
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(v_facts -> 'palette') = 'array' THEN v_facts -> 'palette' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS swatch(value, ordinality)
    ), '[]'::jsonb),
    'boards', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', board.value -> 'id', 'name', board.value -> 'name', 'assetId', board.value -> 'assetId'
      ) ORDER BY board.ordinality)
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(v_facts -> 'boards') = 'array' THEN v_facts -> 'boards' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS board(value, ordinality)
    ), '[]'::jsonb),
    'sheets', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', sheet.value -> 'id', 'title', sheet.value -> 'title', 'assetId', sheet.value -> 'assetId'
      ) ORDER BY sheet.ordinality)
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(v_facts -> 'sheets') = 'array' THEN v_facts -> 'sheets' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS sheet(value, ordinality)
    ), '[]'::jsonb),
    'composition', jsonb_build_object(
      'voice', v_composition -> 'voice',
      'hero', CASE WHEN v_hero IS NULL THEN 'null'::jsonb
                   ELSE jsonb_build_object('assetId', v_hero) END,
      'held', CASE WHEN jsonb_typeof(v_composition -> 'held') = 'array'
                   THEN v_composition -> 'held' ELSE '[]'::jsonb END,
      'chapters', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'key', chapter.value -> 'key',
          'headline', COALESCE(
            NULLIF(v_overrides -> 'chapters' -> (chapter.value ->> 'key') -> 'headline', 'null'::jsonb),
            chapter.value -> 'headline'),
          'standing', COALESCE(
            NULLIF(v_overrides -> 'chapters' -> (chapter.value ->> 'key') -> 'standing', 'null'::jsonb),
            chapter.value -> 'standing')
        ) ORDER BY chapter.ordinality)
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(v_composition -> 'chapters') = 'array'
               THEN v_composition -> 'chapters' ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS chapter(value, ordinality)
      ), '[]'::jsonb),
      'doorstep', CASE WHEN jsonb_typeof(v_composition -> 'doorstep') = 'object'
                       THEN jsonb_build_object('standing', v_composition -> 'doorstep' -> 'standing')
                       ELSE 'null'::jsonb END,
      'notice', v_composition -> 'notice'
    ),
    'images', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'assetId', image.asset_id,
        'plateRole', image.plate_role,
        'cropKey', image.crop_key,
        'rank', image.rank,
        'chapterKey', image.chapter_key
      ) ORDER BY image.rank NULLS LAST, image.id)
      FROM public.client_edition_images AS image
      JOIN public.client_plate_assets AS asset
        ON asset.id = image.asset_id AND asset.project_id = p_project_id
      WHERE image.edition_id = v_edition.id
    ), '[]'::jsonb),
    'edition', jsonb_build_object(
      'id', v_edition.id,
      'seq', v_edition.seq,
      'approvedAt', v_edition.approved_at,
      'approvedBy', CASE WHEN v_edition.auto_published THEN 'auto' ELSE 'studio' END,
      'notice', v_composition ->> 'notice'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_project_edition(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_project_edition(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_client_project_edition(uuid) IS
  'US-49 Phase 2 homeowner reader. Guard as get_client_project_editorial. NULL without an approved edition; else the 00842 envelope projected from the edition''s frozen facts (showMakers, plate bytes facts and concept provenance read live), composition {voice, hero{assetId}|null, held, chapters[{key,headline,standing}], doorstep{standing}|null, notice} with overrides applied, images[{assetId,plateRole,cropKey,rank,chapterKey}] and edition{id,seq,approvedAt,approvedBy studio|auto,notice}.';

-- The plate route's check, v2: an approved edition id scopes its project.
CREATE OR REPLACE FUNCTION public.client_can_read_plate(p_scope_id uuid, p_sha256 text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT project.id
  FROM public.projects AS project
  WHERE project.id = COALESCE(
      (SELECT edition.project_id FROM public.client_editions AS edition
       WHERE edition.id = p_scope_id AND edition.status = 'approved'),
      p_scope_id)
    AND COALESCE(
      project.client_id = auth.uid()
      OR public.can_buy_for_project(project.id),
      false
    )
    AND EXISTS (
      SELECT 1 FROM public.client_plate_assets AS asset
      WHERE asset.project_id = project.id
        AND asset.sha256 = p_sha256
    );
$$;

REVOKE ALL ON FUNCTION public.client_can_read_plate(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_can_read_plate(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.client_can_read_plate(uuid, text) IS
  'US-49 plate route check. p_scope_id is a project id or (Phase 2) an approved client_editions id standing for its project; returns the project id when auth.uid() is the project''s client or passes can_buy_for_project and a client_plate_assets row with p_sha256 exists for it, else NULL.';
