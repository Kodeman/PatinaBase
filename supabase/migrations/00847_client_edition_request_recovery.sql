-- ═══════════════════════════════════════════════════════════════════════════
-- 00847 — The House Issue: one recomposition after a swept draft (US-49 P2)
-- ═══════════════════════════════════════════════════════════════════════════
-- The gap (story log seq 54, SQ-1665). begin_client_edition (00845) marks
-- the edition request done as soon as it opens the drafting edition. When
-- finish_client_edition never confirms, the dispatcher's sweep fails the
-- draft once its lease has run out ('lease expired', 00845
-- dispatch_client_edition_compose), but nothing asks again: the project
-- waited for its next organic change (00844 triggers). The homeowner keeps
-- the last approved edition meanwhile.
--
-- Recovery (approach (a) of SQ-1678). When a drafting edition whose lease
-- had run out turns 'failed', the project gets one request,
-- reason 'recompose_after_failed_draft', queued through
-- _enqueue_client_edition_request (00844) like any change:
--   debounce      debounce_key '<project>:recompose_after_failed_draft',
--                 available after the same 30 minutes every change waits;
--                 a queued row of that key is moved on, never doubled.
--   lease         a fresh row (attempts 0, no lease). It is claimed, leased
--                 for ten minutes, counted, expired and given up after the
--                 third attempt exactly as 00845 does for every request.
--   daily cap     untouched: the swept draft is one of the project's
--                 editions today, so a project that has reached two waits
--                 for the next day before claim leases the recovery
--                 (_client_edition_project_ready), and begin still refuses
--                 a third edition (client_edition_daily_limit).
-- No recovery is queued when:
--   • the project already has an open request (queued or leased). begin
--     answered every request that was due, so an open one is a change
--     still settling or a claim in flight, and it composes the project
--     anyway;
--   • the project is closed out (_client_edition_frozen);
--   • N = 2: the project's previous edition (the highest seq below the
--     swept one) was swept too. The last two drafts both failed on an
--     expired lease, so the recovery already ran and failed as well. The
--     project composes again only on its next organic request. A draft
--     that ends any other way (awaiting_review, approved, superseded, or
--     failed by the composer through finish_client_edition) ends the
--     streak. "Swept" is the sweep's own mark, status 'failed' with
--     facts.error 'lease expired', so drafts swept before this migration
--     count as well.
--
-- Where it lives. A trigger on the transition, not a new line in
-- dispatch_client_edition_compose: SQ-1595 replaces that dispatcher, and
-- this recovery rides along whatever its body becomes. Only the sweep makes
-- this transition. finish_client_edition refuses an edition whose lease has
-- run out (55000), so a failure the composer records always has an
-- unexpired lease. begin_client_edition supersedes drafts and never fails
-- them. The trigger takes no advisory lock. finish takes the per-project
-- lock before the edition row, and the sweep already holds that row.
--
-- Also (SQ-1687 C2): get_client_project_edition (00846) trims en dashes
-- and slashes as well from the ends of a what it took a maker's name out of.
-- A what left with no letter or digit counts as empty: it falls back to the
-- line's category, else the kind words. "Harmon Bench Works – " no longer
-- reads "–". Only that expression changes. The rest of the function is
-- 00846's text, byte for byte.
--
-- Lineage:
--   get_client_project_edition   00846 → 00847 (what trim)
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- Idempotent: CREATE OR REPLACE, DROP TRIGGER IF EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. The recovery ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.client_edition_recompose_failed_draft()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- N = 2: the draft before this one was swept as well.
  IF COALESCE((
       SELECT previous.status = 'failed' AND previous.facts ->> 'error' = 'lease expired'
       FROM public.client_editions AS previous
       WHERE previous.project_id = NEW.project_id
         AND previous.seq < NEW.seq
       ORDER BY previous.seq DESC
       LIMIT 1), false)
     -- An open request composes the project anyway.
     OR EXISTS (
       SELECT 1 FROM public.client_edition_requests AS request
       WHERE request.project_id = NEW.project_id
         AND request.status IN ('queued', 'leased'))
     OR public._client_edition_frozen(NEW.project_id) THEN
    RETURN NULL;
  END IF;

  PERFORM public._enqueue_client_edition_request(NEW.project_id, 'recompose_after_failed_draft');
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.client_edition_recompose_failed_draft()
  FROM PUBLIC, anon, authenticated;

-- The sweep's transition: drafting → failed with the lease run out.
DROP TRIGGER IF EXISTS trg_client_editions_recompose_failed_draft ON public.client_editions;
CREATE TRIGGER trg_client_editions_recompose_failed_draft
  AFTER UPDATE OF status ON public.client_editions
  FOR EACH ROW
  WHEN (OLD.status = 'drafting' AND NEW.status = 'failed' AND OLD.lease_expires_at <= now())
  EXECUTE FUNCTION public.client_edition_recompose_failed_draft();

COMMENT ON FUNCTION public.client_edition_recompose_failed_draft() IS
  'US-49 Phase 2 (00847): a drafting edition the dispatcher sweep failed on an expired lease queues one request, reason recompose_after_failed_draft, through _enqueue_client_edition_request (30-minute debounce, normal lease and attempts). None when the project has an open request, is frozen, or its previous edition was swept too (N = 2).';

-- ─── 2. The approved-edition reader: what trim (SQ-1687 C2) ────────────────

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
           -- 00847 (SQ-1687 C2): en dashes and slashes trim too, and a what
           -- left with no letter or digit is empty (the category, else the kind).
           NULLIF(regexp_replace(regexp_replace(regexp_replace(
             regexp_replace(worded.stored_what, v_maker_pattern, '', 'gi'),
             '\s{2,}', ' ', 'g'), '^[\s·–—,:/-]+|[\s·–—,:/-]+$', '', 'g'),
             '^[^[:alnum:]]*$', ''), '') AS bare_what
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
