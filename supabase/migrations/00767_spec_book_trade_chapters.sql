-- ═══════════════════════════════════════════════════════════════════════════
-- 00767 — Spec book chapters by trade (US-28 S7c, SQ-841)
-- ═══════════════════════════════════════════════════════════════════════════
-- Why: V20 U-Q18 (docs/vision/VISION-DECISIONS.md, the Grouping bullet). Kody
-- ruled on 2026-10-12 that the spec book is organised in real trade chapters,
-- seeded from each piece's FF&E category, and that the screen and the issued
-- editions both read by trade. The room stays a fact on each line. Until now
-- ensure_project_spec_book made one chapter per project room and filed each
-- line into its room's chapter (00380:844-866; SPEC §S7b.5.1).
--
-- ── THE CHAPTER SHAPE ───────────────────────────────────────────────────────
-- spec_book_chapters gains `trade` (text, nullable). A chapter is one of:
--   * a trade chapter: trade IS NOT NULL, project_room_id IS NULL. Unique per
--     book (idx_spec_book_chapters_trade, mirroring the room index);
--   * a room chapter (legacy): project_room_id IS NOT NULL, trade IS NULL. No
--     path creates one any more; the re-file below retires them once empty;
--   * a studio chapter: both NULL. A chapter a studio made by hand. Kept, and
--     a line the studio put there stays there.
-- A CHECK keeps room and trade exclusive.
--
-- A line's trade is the top-level category of its ffe_category in the 00128
-- taxonomy (_spec_book_trade_for). The value matches a category slug (or,
-- leniently, its label) among the system rows, the project designer's own rows
-- and the project proposal's rows, in that order of preference after an exact
-- slug match; parent_id is walked to the top within those scopes only, so a
-- studio never files under, or reads the label of, another studio's category.
--   trade     the top-level slug           title  its label
--   position  its sort_order (system rows: 10..130); a studio category sorts
--             after the system ones at 1000 + its sort_order
-- A category that matches no taxonomy row still has a chapter of its own:
-- trade = the lower-cased value, title = the value in title case, position
-- 1000 (ties order by title, as the renderer already does). A line with no
-- category files into the Unsorted chapter: trade 'unsorted', title
-- 'Unsorted', position 2147483647 (last). Unsorted exists only while it holds
-- lines (trg_spec_book_prune_unsorted). Trade chapters are created on demand,
-- when a line first needs one, and are not removed when they empty: they may
-- carry a studio's title, inclusion or review state.
--
-- ── FILING PATHS (every function that creates, files into or orders by
--    chapters; latest bodies found with grep | sort | tail -1) ──────────────
--   ensure_project_spec_book        00380:795 (only body). Room-chapter seed
--                                   removed; a line without a setting files
--                                   by trade; then _spec_book_refile.
--   spec_book_attach_ffe_line       00380:555 → 00694:108. A new line files
--                                   by trade instead of by room.
--   (new) spec_book_refile_ffe_line AFTER UPDATE OF ffe_category on
--                                   project_ffe_items: a category change
--                                   refiles the line (not one in a studio
--                                   chapter).
--   _spec_book_current_item_snapshots 00380 → 00403 → 00667 → 00714 → 00735
--                                   → 00737 → 00751:277. Orders by chapter
--                                   position (unchanged). Adds `chapterId` to
--                                   each item snapshot so an issued edition's
--                                   renderer files the line into its trade
--                                   chapter: spec-book-render matches an item
--                                   to a chapter by chapterId, else by room
--                                   (render-model.ts itemChapterId), and a
--                                   trade chapter has no room. content_hash is
--                                   taken over the snapshot WITHOUT chapterId,
--                                   so an unchanged line keeps its hash (00735
--                                   rule) and the re-file alone never reads as
--                                   a revision in an internal addendum.
--   Read but unchanged: _prepare_spec_book_issue_00403 (00380:1558, chapters
--   JSON of included chapters ordered by position, id) and
--   spec_book_validate_working_links (00380:313, the chapter's room must be
--   in the book's project; a trade chapter has none).
--   supersede_project_selection (00758) carries a predecessor's setting but
--   not its chapter; the successor files through spec_book_attach_ffe_line.
--
-- ── RE-FILE OF EXISTING BOOKS (idempotent) ──────────────────────────────────
-- For every book, _spec_book_refile re-points each line setting whose chapter
-- is NULL or a room chapter to the trade chapter for its category, then
-- deletes room chapters that hold no line. The only foreign key to
-- spec_book_chapters is spec_book_item_settings.chapter_id (ON DELETE SET
-- NULL, checked in pg_constraint), so an empty room chapter is referenced by
-- nothing. Issued editions do not reference working chapters: a revision
-- freezes its chapters as JSON in render_snapshot and each line's
-- chapter_position in spec_book_revision_items, both immutable (00380
-- triggers). Nothing here writes either table, so a past edition keeps the
-- room grouping it was issued with. A line leaving a room chapter the studio
-- had excluded (included = false) carries that exclusion onto its own
-- setting, so the next edition prints exactly what the last would have. Lines
-- already in a trade or studio chapter are not touched, so a second run
-- changes nothing.
--
-- Security: every new function is SECURITY DEFINER with search_path pinned;
-- the helpers and trigger functions are revoked from PUBLIC, anon and
-- authenticated (trigger functions also from service_role, per 00381).
-- ensure_project_spec_book keeps its 00380 auth check and grant unchanged.
-- Adds REVOKE → the next reset owner regenerates
-- supabase/seed/00-legacy-grants.sql (00758 practice).
--
-- Revert (unapplied-on-prod remediation only; after prod apply, fix forward):
--   DROP TRIGGER trg_spec_book_refile_ffe_line ON public.project_ffe_items;
--   DROP TRIGGER trg_spec_book_prune_unsorted ON public.spec_book_item_settings;
--   re-run the bodies of ensure_project_spec_book (00380:795),
--   spec_book_attach_ffe_line (00694:108) and
--   _spec_book_current_item_snapshots (00751:277);
--   per book, re-create room chapters as 00380:844-852 does and re-point every
--   setting in a trade chapter to its line's room chapter; then
--   DELETE FROM public.spec_book_chapters WHERE trade IS NOT NULL;
--   DROP FUNCTION public.spec_book_refile_ffe_line(),
--     public.spec_book_prune_unsorted_chapter(),
--     public._spec_book_refile(uuid, uuid[]),
--     public._spec_book_trade_chapter(uuid, text),
--     public._spec_book_trade_for(uuid, text);
--   ALTER TABLE public.spec_book_chapters
--     DROP CONSTRAINT spec_book_chapters_room_or_trade, DROP COLUMN trade;
--   (DROP COLUMN also drops idx_spec_book_chapters_trade.)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. The trade key ───────────────────────────────────────────────────────

ALTER TABLE public.spec_book_chapters
  ADD COLUMN IF NOT EXISTS trade text;

ALTER TABLE public.spec_book_chapters
  DROP CONSTRAINT IF EXISTS spec_book_chapters_room_or_trade;
ALTER TABLE public.spec_book_chapters
  ADD CONSTRAINT spec_book_chapters_room_or_trade
  CHECK (
    trade IS NULL
    OR (project_room_id IS NULL AND length(btrim(trade)) > 0)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_spec_book_chapters_trade
  ON public.spec_book_chapters(spec_book_id, trade)
  WHERE trade IS NOT NULL;

COMMENT ON COLUMN public.spec_book_chapters.trade IS
  'Trade chapter key (00767, V20 U-Q18): the top-level FF&E category slug of the lines filed here, '
  'the lower-cased category for one outside the taxonomy, or ''unsorted'' for lines with no category. '
  'NULL on a legacy room chapter (project_room_id set) and on a chapter a studio made by hand.';

-- ─── 2. _spec_book_trade_for: a line's trade ────────────────────────────────

CREATE OR REPLACE FUNCTION public._spec_book_trade_for(
  p_project_id uuid,
  p_category text
)
RETURNS TABLE (
  trade text,
  title text,
  chapter_position integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH RECURSIVE
  wanted AS (
    SELECT NULLIF(lower(btrim(p_category)), '') AS k
  ),
  project AS (
    SELECT pr.designer_id, pr.proposal_id
    FROM public.projects pr
    WHERE pr.id = p_project_id
  ),
  hit AS (
    SELECT c.id
    FROM wanted
    JOIN public.ffe_categories c
      ON lower(c.slug) = wanted.k OR lower(btrim(c.label)) = wanted.k
    LEFT JOIN project ON true
    WHERE c.is_system
       OR (c.proposal_id IS NULL AND c.designer_id = project.designer_id)
       OR (c.proposal_id IS NOT NULL AND c.proposal_id = project.proposal_id)
    ORDER BY (lower(c.slug) = wanted.k) DESC, c.is_system DESC,
             (c.proposal_id IS NULL) DESC, c.id
    LIMIT 1
  ),
  chain AS (
    SELECT c.id, c.slug, c.label, c.parent_id, c.is_system, c.sort_order,
           0 AS depth
    FROM hit
    JOIN public.ffe_categories c ON c.id = hit.id
    UNION ALL
    SELECT p.id, p.slug, p.label, p.parent_id, p.is_system, p.sort_order,
           chain.depth + 1
    FROM chain
    JOIN public.ffe_categories p ON p.id = chain.parent_id
    LEFT JOIN project ON true
    WHERE chain.depth < 16
      AND (
        p.is_system
        OR (p.proposal_id IS NULL AND p.designer_id = project.designer_id)
        OR (p.proposal_id IS NOT NULL AND p.proposal_id = project.proposal_id)
      )
  ),
  top AS (
    SELECT * FROM chain ORDER BY depth DESC LIMIT 1
  )
  SELECT
    CASE
      WHEN wanted.k IS NULL THEN 'unsorted'
      WHEN top.id IS NULL THEN wanted.k
      ELSE lower(top.slug)
    END,
    CASE
      WHEN wanted.k IS NULL THEN 'Unsorted'
      WHEN top.id IS NULL THEN initcap(replace(wanted.k, '_', ' '))
      ELSE top.label
    END,
    CASE
      WHEN wanted.k IS NULL THEN 2147483647
      WHEN top.id IS NULL THEN 1000
      WHEN top.is_system THEN top.sort_order
      ELSE 1000 + LEAST(GREATEST(top.sort_order, 0), 1000000)
    END
  FROM wanted
  LEFT JOIN top ON true;
$$;

COMMENT ON FUNCTION public._spec_book_trade_for(uuid, text) IS
  'The spec-book trade for a line category in a project (00767, V20 U-Q18): the top-level 00128 '
  'category (system, the project designer''s, or the project proposal''s) as trade key, label and '
  'chapter position; an unknown category as its own title-cased trade at 1000; no category as '
  '''unsorted'' / ''Unsorted'' at 2147483647. Internal.';

-- ─── 3. _spec_book_trade_chapter: get or create a book's trade chapter ──────

CREATE OR REPLACE FUNCTION public._spec_book_trade_chapter(
  p_spec_book_id uuid,
  p_category text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trade text;
  v_title text;
  v_position integer;
  v_chapter_id uuid;
BEGIN
  SELECT t.trade, t.title, t.chapter_position
    INTO v_trade, v_title, v_position
  FROM public.spec_books b
  CROSS JOIN LATERAL public._spec_book_trade_for(b.project_id, p_category) t
  WHERE b.id = p_spec_book_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'spec book not found' USING errcode = 'foreign_key_violation';
  END IF;

  -- Insert, or read the existing chapter under a key-share lock so a
  -- concurrent prune of an empty Unsorted chapter waits for this transaction.
  -- If a prune already removed it between the two statements, the next pass
  -- creates it again.
  FOR v_attempt IN 1..3 LOOP
    INSERT INTO public.spec_book_chapters (spec_book_id, trade, title, position)
    VALUES (p_spec_book_id, v_trade, v_title, v_position)
    ON CONFLICT (spec_book_id, trade) WHERE trade IS NOT NULL DO NOTHING
    RETURNING id INTO v_chapter_id;
    IF v_chapter_id IS NOT NULL THEN
      RETURN v_chapter_id;
    END IF;

    SELECT c.id INTO v_chapter_id
    FROM public.spec_book_chapters c
    WHERE c.spec_book_id = p_spec_book_id AND c.trade = v_trade
    FOR KEY SHARE;
    IF v_chapter_id IS NOT NULL THEN
      RETURN v_chapter_id;
    END IF;
  END LOOP;

  RAISE EXCEPTION 'spec book trade chapter % could not be filed', v_trade
    USING errcode = 'serialization_failure';
END;
$$;

COMMENT ON FUNCTION public._spec_book_trade_chapter(uuid, text) IS
  'Returns the book''s trade chapter for a line category, creating it on first use (00767). Internal.';

-- ─── 4. _spec_book_refile: re-point line settings to trade chapters ─────────

CREATE OR REPLACE FUNCTION public._spec_book_refile(
  p_spec_book_id uuid,
  p_ffe_item_ids uuid[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row record;
  v_chapter_id uuid;
  v_moved integer := 0;
BEGIN
  -- Book-wide (p_ffe_item_ids NULL): lines with no chapter or in a room
  -- chapter. Named lines (a category change): also lines in a trade chapter.
  -- A line in a studio chapter is never moved.
  FOR v_row IN
    SELECT
      s.id,
      s.chapter_id,
      i.ffe_category,
      c.project_room_id AS old_room_id,
      c.included AS old_included
    FROM public.spec_book_item_settings s
    JOIN public.project_ffe_items i ON i.id = s.ffe_item_id
    LEFT JOIN public.spec_book_chapters c ON c.id = s.chapter_id
    WHERE s.spec_book_id = p_spec_book_id
      AND (p_ffe_item_ids IS NULL OR s.ffe_item_id = ANY (p_ffe_item_ids))
      AND (
        s.chapter_id IS NULL
        OR c.project_room_id IS NOT NULL
        OR (p_ffe_item_ids IS NOT NULL AND c.trade IS NOT NULL)
      )
    ORDER BY s.id
    FOR UPDATE OF s
  LOOP
    v_chapter_id := public._spec_book_trade_chapter(p_spec_book_id, v_row.ffe_category);
    IF v_chapter_id IS DISTINCT FROM v_row.chapter_id THEN
      UPDATE public.spec_book_item_settings
         SET chapter_id = v_chapter_id,
             included = included
               AND (v_row.old_room_id IS NULL OR v_row.old_included)
       WHERE id = v_row.id;
      v_moved := v_moved + 1;
    END IF;
  END LOOP;

  -- A room chapter retires once no line setting points at it.
  DELETE FROM public.spec_book_chapters c
   WHERE c.spec_book_id = p_spec_book_id
     AND c.project_room_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.spec_book_item_settings s
       WHERE s.chapter_id = c.id
     );

  RETURN v_moved;
END;
$$;

COMMENT ON FUNCTION public._spec_book_refile(uuid, uuid[]) IS
  'Files line settings into trade chapters (00767, V20 U-Q18). Book-wide: settings with no chapter or a '
  'room chapter; named lines: also settings in a trade chapter. Never moves a line out of a studio '
  'chapter. Carries an excluded room chapter''s exclusion onto the line, then deletes room chapters no '
  'setting points at. Idempotent. Returns the number of settings re-pointed. Internal.';

-- ─── 5. Unsorted exists only while it holds lines ───────────────────────────

CREATE OR REPLACE FUNCTION public.spec_book_prune_unsorted_chapter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_left uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_left := OLD.chapter_id;
  ELSIF NEW.chapter_id IS DISTINCT FROM OLD.chapter_id THEN
    v_left := OLD.chapter_id;
  END IF;

  IF v_left IS NOT NULL THEN
    DELETE FROM public.spec_book_chapters c
     WHERE c.id = v_left
       AND c.trade = 'unsorted'
       AND NOT EXISTS (
         SELECT 1 FROM public.spec_book_item_settings s
         WHERE s.chapter_id = c.id
       );
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_spec_book_prune_unsorted ON public.spec_book_item_settings;
CREATE TRIGGER trg_spec_book_prune_unsorted
  AFTER UPDATE OF chapter_id OR DELETE ON public.spec_book_item_settings
  FOR EACH ROW EXECUTE FUNCTION public.spec_book_prune_unsorted_chapter();

-- ─── 6. spec_book_attach_ffe_line (00694 body; a new line files by trade) ───
-- Lineage 00380:555 → 00694:108. The body is 00694's verbatim apart from the
-- chapter lookup, which now asks _spec_book_trade_chapter for the line's
-- category instead of reading the room chapter.
CREATE OR REPLACE FUNCTION public.spec_book_attach_ffe_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_book_id uuid;
  v_chapter_id uuid;
BEGIN
  -- 00694: seed the spec columns from the line's product. The LEFT JOIN keeps
  -- the row when the line has no product (a named need): all seed columns
  -- NULL and field_provenance '{}', exactly the 00380 row.
  INSERT INTO public.project_ffe_specs (
    ffe_item_id, routing_source,
    sku, finish, material, color_fabric, selected_dimensions, field_provenance
  )
  SELECT
    NEW.id,
    jsonb_strip_nulls(jsonb_build_object('source', NEW.added_via)),
    seed.sku, seed.finish, seed.material, seed.color_fabric, seed.selected_dimensions,
    COALESCE(seed.field_provenance, '{}'::jsonb)
  FROM (SELECT 1) AS one
  LEFT JOIN LATERAL public._ffe_spec_seed_from_product(NEW.product_id) AS seed ON true
  ON CONFLICT (ffe_item_id) DO NOTHING;

  SELECT id INTO v_book_id FROM public.spec_books WHERE project_id = NEW.project_id;
  IF v_book_id IS NOT NULL THEN
    -- 00767: the chapter for the line's trade (its ffe_category), not its room.
    v_chapter_id := public._spec_book_trade_chapter(v_book_id, NEW.ffe_category);

    INSERT INTO public.spec_book_item_settings (
      spec_book_id, ffe_item_id, chapter_id, position
    )
    VALUES (v_book_id, NEW.id, v_chapter_id, NEW.sort_order)
    ON CONFLICT (spec_book_id, ffe_item_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 7. A category change refiles the line ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.spec_book_refile_ffe_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_book_id uuid;
BEGIN
  SELECT id INTO v_book_id FROM public.spec_books WHERE project_id = NEW.project_id;
  IF v_book_id IS NOT NULL THEN
    PERFORM public._spec_book_refile(v_book_id, ARRAY[NEW.id]);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_spec_book_refile_ffe_line ON public.project_ffe_items;
CREATE TRIGGER trg_spec_book_refile_ffe_line
  AFTER UPDATE OF ffe_category ON public.project_ffe_items
  FOR EACH ROW
  WHEN (OLD.ffe_category IS DISTINCT FROM NEW.ffe_category)
  EXECUTE FUNCTION public.spec_book_refile_ffe_line();

-- ─── 8. ensure_project_spec_book (00380 body; trade chapters) ───────────────
-- Lineage: 00380:795 (the only body). Verbatim through the book upsert; the
-- room-chapter seed and room filing (00380:844-867) are replaced by trade
-- filing.
CREATE OR REPLACE FUNCTION public.ensure_project_spec_book(p_project_id uuid)
RETURNS public.spec_books
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_project public.projects;
  v_template_id uuid;
  v_book public.spec_books;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING errcode = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR SHARE;

  IF NOT FOUND OR NOT public.is_studio_comember(v_project.designer_id) THEN
    RAISE EXCEPTION 'project not found or not accessible'
      USING errcode = 'insufficient_privilege';
  END IF;

  SELECT id INTO v_template_id
  FROM public.spec_book_templates
  WHERE template_key = 'residential'
    AND studio_id IS NULL
    AND is_active
  ORDER BY version DESC
  LIMIT 1;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'residential spec-book template is unavailable'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;

  INSERT INTO public.spec_books (
    project_id, title, template_id, default_audiences, created_by
  )
  VALUES (
    p_project_id, v_project.name || ' — Spec Book', v_template_id,
    ARRAY['client']::text[], auth.uid()
  )
  ON CONFLICT (project_id) DO NOTHING;

  SELECT * INTO v_book FROM public.spec_books WHERE project_id = p_project_id;

  -- 00767: trade chapters (V20 U-Q18). No room chapters are made. A line
  -- without a working setting gets one, filed into the chapter for its
  -- trade; then any line with no chapter, or still in a room chapter, files
  -- by trade and empty room chapters retire.
  INSERT INTO public.spec_book_item_settings (
    spec_book_id, ffe_item_id, chapter_id, position
  )
  SELECT
    v_book.id,
    i.id,
    public._spec_book_trade_chapter(v_book.id, i.ffe_category),
    i.sort_order
  FROM public.project_ffe_items i
  WHERE i.project_id = p_project_id
    AND NOT EXISTS (
      SELECT 1 FROM public.spec_book_item_settings s
      WHERE s.spec_book_id = v_book.id AND s.ffe_item_id = i.id
    )
  ON CONFLICT (spec_book_id, ffe_item_id) DO NOTHING;

  PERFORM public._spec_book_refile(v_book.id, NULL);

  RETURN v_book;
END;
$$;

-- ─── 9. _spec_book_current_item_snapshots (base 00751:277) ──────────────────
-- Lineage 00380 → 00403 → 00667 → 00714 → 00735 → 00737 → 00751 → 00767.
-- 00751's body verbatim apart from two edits: the snapshot carries
-- 'chapterId' (c.id, dropped by jsonb_strip_nulls when the line has no
-- chapter), and content_hash digests the snapshot minus 'chapterId'.
-- Grants restated unchanged (00380:2016-2024): service_role only.
CREATE OR REPLACE FUNCTION public._spec_book_current_item_snapshots(p_spec_book_id uuid)
RETURNS TABLE (
  ffe_item_id uuid,
  item_type text,
  document_code text,
  chapter_position integer,
  item_position integer,
  item_snapshot jsonb,
  content_hash text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  WITH source AS (
    SELECT
      i.id AS ffe_item_id,
      i.item_type,
      i.doc_code,
      COALESCE(c.position, 2147483647) AS chapter_position,
      s.position AS item_position,
      jsonb_strip_nulls(jsonb_build_object(
        'ffeItemId', i.id,
        'itemType', i.item_type,
        'documentCode', i.doc_code,
        'name', i.name,
        'needLabel', CASE WHEN t.primary_ffe_item_id = i.id THEN NULLIF(t.need_label, i.name) END,
        'projectId', i.project_id,
        'chapterId', c.id,
        'room', CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', r.id, 'name', r.name
        ) END,
        'lineGroup', CASE WHEN lg.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', lg.id, 'name', lg.name
        ) END,
        'placements', pl.placements,
        'quantity', i.quantity,
        'unit', NULLIF(i.unit, 'each'),
        'lineKind', NULLIF(i.line_kind, 'goods'),
        'parentFfeItemId', CASE WHEN i.line_kind = 'labor' THEN i.parent_ffe_item_id END,
        'category', i.ffe_category,
        'selectedMedia', CASE
          WHEN jsonb_array_length(sp.selected_media) > 0 THEN sp.selected_media
          ELSE COALESCE(to_jsonb(p.images), '[]'::jsonb)
        END,
        'selection', jsonb_build_object(
          'sku', public._spec_book_resolve_field(
            to_jsonb(sp.sku), i.custom_fields->'sku', to_jsonb(p.sku),
            p.capture_provenance#>'{studioCustom,sku}', sp.na_declarations->'sku',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'sku', '')::timestamptz,
            sp.field_provenance->>'sku'
          ),
          'finish', public._spec_book_resolve_field(
            to_jsonb(sp.finish), i.custom_fields->'finish', to_jsonb(p.finish),
            p.capture_provenance#>'{studioCustom,finish}', sp.na_declarations->'finish',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'finish', '')::timestamptz,
            sp.field_provenance->>'finish'
          ),
          'material', public._spec_book_resolve_field(
            to_jsonb(sp.material), i.custom_fields->'material', to_jsonb(p.materials),
            p.capture_provenance#>'{studioCustom,material}', sp.na_declarations->'material',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'material', '')::timestamptz,
            sp.field_provenance->>'material'
          ),
          'colorFabric', public._spec_book_resolve_field(
            to_jsonb(sp.color_fabric), i.custom_fields->'colorFabric', to_jsonb(p.colors),
            p.capture_provenance#>'{studioCustom,colorFabric}', sp.na_declarations->'colorFabric',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'colorFabric', '')::timestamptz,
            sp.field_provenance->>'colorFabric'
          ),
          'dimensions', public._spec_book_resolve_field(
            sp.selected_dimensions, i.custom_fields->'dimensions', p.dimensions,
            p.capture_provenance#>'{studioCustom,dimensions}', sp.na_declarations->'dimensions',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'dimensions', '')::timestamptz,
            sp.field_provenance->>'dimensions'
          ),
          'exactLocation', public._spec_book_resolve_field(
            to_jsonb(sp.exact_location), i.custom_fields->'exactLocation', NULL,
            p.capture_provenance#>'{studioCustom,exactLocation}', sp.na_declarations->'exactLocation',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'exactLocation', '')::timestamptz,
            sp.field_provenance->>'exactLocation'
          )
        ),
        'notes', jsonb_build_object(
          'client', sp.client_notes,
          'trade', sp.trade_notes,
          'install', sp.install_notes,
          'private', i.notes,
          'care', sp.care_notes,
          'warranty', sp.warranty_notes
        ),
        'pricing', jsonb_build_object(
          'clientPriceCents', i.unit_price_cents,
          'tradePriceCents', i.trade_price_cents,
          'markupPercent', i.markup_percent,
          'currency', i.currency
        ),
        'vendor', jsonb_build_object(
          'id', i.vendor_id,
          'name', i.vendor_name,
          'internalContact', p.vendor_contact
        ),
        'configuration', CASE WHEN sp.configuration_id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', sp.configuration_id,
          'snapshot', sp.configuration_snapshot,
          'snapshotHash', sp.configuration_snapshot_hash,
          'lockedAt', sp.configuration_locked_at
        ) END,
        'provenance', sp.field_provenance,
        'sourceVerification', sp.source_verifications,
        'naDeclarations', sp.na_declarations,
        'readinessStatus', sp.readiness_status,
        'rowVersion', sp.row_version
      )) AS snapshot
    FROM public.spec_book_item_settings s
    JOIN public.spec_books b ON b.id = s.spec_book_id
    JOIN public.project_ffe_items i ON i.id = s.ffe_item_id
    JOIN public.project_ffe_specs sp ON sp.ffe_item_id = i.id
    LEFT JOIN public.spec_book_chapters c ON c.id = s.chapter_id
    LEFT JOIN public.project_rooms r ON r.id = i.project_room_id
    LEFT JOIN public.products p ON p.id = i.product_id
    LEFT JOIN public.project_ffe_selection_threads t ON t.id = i.selection_thread_id
    LEFT JOIN public.project_line_groups lg ON lg.id = i.line_group_id
    LEFT JOIN LATERAL (
      SELECT CASE WHEN count(*) > 1 THEN jsonb_agg(jsonb_build_object(
          'roomName', pr.name,
          'quantity', fp.quantity,
          'areaNote', fp.area_note
        ) ORDER BY fp.sort_order, fp.created_at, fp.id)
      END AS placements
      FROM public.project_ffe_placements fp
      JOIN public.project_rooms pr ON pr.id = fp.project_room_id
      WHERE fp.ffe_item_id = i.id
    ) pl ON true
    WHERE s.spec_book_id = p_spec_book_id
      AND s.included
      AND (c.id IS NULL OR c.included)
      AND i.removed_at IS NULL
  )
  SELECT
    source.ffe_item_id,
    source.item_type,
    source.doc_code,
    source.chapter_position,
    source.item_position,
    source.snapshot,
    encode(
      extensions.digest(public._spec_book_canonical_json(source.snapshot - 'chapterId'), 'sha256'),
      'hex'
    )
  FROM source
  ORDER BY source.chapter_position, source.item_position, source.ffe_item_id;
$$;

REVOKE ALL ON FUNCTION public._spec_book_current_item_snapshots(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._spec_book_current_item_snapshots(uuid) TO service_role;

-- ─── 10. Re-file existing books ─────────────────────────────────────────────

DO $$
DECLARE
  v_book record;
  v_moved integer := 0;
BEGIN
  FOR v_book IN SELECT id FROM public.spec_books ORDER BY id LOOP
    v_moved := v_moved + public._spec_book_refile(v_book.id, NULL);
  END LOOP;
  RAISE NOTICE '00767: % spec-book line settings re-filed into trade chapters', v_moved;
END;
$$;

-- ─── 11. Grants ─────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public._spec_book_trade_for(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._spec_book_trade_chapter(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._spec_book_refile(uuid, uuid[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.spec_book_prune_unsorted_chapter()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.spec_book_refile_ffe_line()
  FROM PUBLIC, anon, authenticated, service_role;
