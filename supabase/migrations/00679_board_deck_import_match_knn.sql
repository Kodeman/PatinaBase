-- ═══════════════════════════════════════════════════════════════════════════
-- 00679 — Bring in a Deck: the look tier (US-15 W4a, SQ-360)
--
--   board_deck_import_match_knn   T2 "by look". A service-role-only SECURITY
--       DEFINER twin of aesthete_ask_knn (00247): the same kNN over
--       products.aesthete_vector, the same rank (cosine similarity) and
--       ordering, deleted and merged products excluded, but visibility is the
--       00152 SELECT policies applied for the IMPORTING user
--       (board_deck_imports.created_by) through 00677's
--       _board_deck_import_visible_for. aesthete_ask_knn is INVOKER and the
--       resolver's cron path runs as service_role, which bypasses products
--       RLS; the 00008 DEFINER similarity RPCs predate the layer law and are
--       never used. supabase/tests/deck_import/match_knn_parity.test.sql
--       asserts row-for-row parity with aesthete_ask_knn under that user's
--       JWT. The envelope is aesthete_ask_knn's (product_id, rank,
--       match_source) plus the product's layer, which the resolver needs to
--       rank "From your library" first; p_category is aesthete_ask_knn's
--       category filter.
--   board_deck_import_look_gate   whether the import asked for photo match
--       (options.photo_match, set by the browser only while the
--       board-photo-match flag is on) and how many products with a vector the
--       importer can see (capped at 1000). The resolver compares that count
--       with its single LOOK_MIN_VISIBLE_VECTORS constant; below it, only the
--       look tier is skipped (links and words still run).
--   register_board_deck_import    gains the single-pin "Find this piece" job
--       (source_format 'pin', keyed by board_item_id, 00676 table shape).
--       The deck branch is 00676's body unchanged.
--
-- Lineage: register_board_deck_import 00676 → 00679 (body copied verbatim from
-- 00676, the grep|sort|tail -1 winner; 00677/00678 do not redefine it; the pin
-- branch is grafted ahead of the deck branch). Everything else is new.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. T2 kNN twin ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.board_deck_import_match_knn(
  p_import_id uuid,
  p_embedding vector(768),
  p_limit integer DEFAULT 10,
  p_category text DEFAULT NULL
)
RETURNS TABLE (product_id uuid, rank real, match_source text, layer text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_user uuid;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 200);
  v_category text := NULLIF(btrim(COALESCE(p_category, '')), '');
BEGIN
  SELECT deck_import.created_by INTO v_user
  FROM public.board_deck_imports AS deck_import
  WHERE deck_import.id = p_import_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deck import not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_embedding IS NULL THEN
    RETURN;
  END IF;

  -- Same expression, filter and order as aesthete_ask_knn (00247), so the
  -- ranks are bit-identical; only the visibility predicate differs.
  RETURN QUERY
  SELECT product.id,
         (1 - (product.aesthete_vector <=> p_embedding))::real,
         'vector'::text,
         product.layer
  FROM public.products AS product
  WHERE product.aesthete_vector IS NOT NULL
    AND product.deleted_at IS NULL
    AND product.merged_into_id IS NULL
    AND (v_category IS NULL OR product.category = v_category)
    AND public._board_deck_import_visible_for(
      v_user, product.layer, product.owner_user_id, product.studio_id)
  ORDER BY product.aesthete_vector <=> p_embedding, product.id
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.board_deck_import_match_knn(uuid, vector, integer, text) IS
  'Deck import T2 (00679): kNN over products.aesthete_vector as the importing user '
  '(board_deck_imports.created_by) sees it under the 00152 rules. Service-role twin '
  'of the INVOKER aesthete_ask_knn (00247); parity asserted by '
  'supabase/tests/deck_import/match_knn_parity.test.sql.';

-- ── 2. Look gate ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.board_deck_import_look_gate(p_import_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_import public.board_deck_imports%ROWTYPE;
  v_count integer;
BEGIN
  SELECT * INTO v_import FROM public.board_deck_imports WHERE id = p_import_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deck import not found' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT count(*)::integer INTO v_count
  FROM (
    SELECT 1
    FROM public.products AS product
    WHERE product.aesthete_vector IS NOT NULL
      AND product.deleted_at IS NULL
      AND product.merged_into_id IS NULL
      AND public._board_deck_import_visible_for(
        v_import.created_by, product.layer, product.owner_user_id, product.studio_id)
    LIMIT 1000
  ) AS visible;
  RETURN jsonb_build_object(
    'photo_match', COALESCE(v_import.options->'photo_match' = 'true'::jsonb, false),
    'visible_vectors', v_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.board_deck_import_match_knn(uuid, vector, integer, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.board_deck_import_look_gate(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.board_deck_import_match_knn(uuid, vector, integer, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.board_deck_import_look_gate(uuid) TO service_role;

-- ── 3. Register: the single-pin "Find this piece" job ───────────────────────

-- Deck: unchanged (00676). Pin: p_manifest = { source_format: 'pin',
-- board_item_id, options?, extracted? } with no file (p_file_sha256 and
-- p_file_name empty or NULL). The pin must be a picture pin on this board.
-- One job per pin (uq_board_deck_imports_pin): asking again re-opens a piece
-- that was found or not found, for the caller's library and options; a kept
-- or referenced piece is left as decided.
CREATE OR REPLACE FUNCTION public.register_board_deck_import(
  p_board_id uuid,
  p_file_sha256 text,
  p_file_name text,
  p_manifest jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sha text := lower(btrim(COALESCE(p_file_sha256, '')));
  v_file_name text := NULLIF(btrim(COALESCE(p_file_name, '')), '');
  v_manifest jsonb := COALESCE(p_manifest, '{}'::jsonb);
  v_items jsonb;
  v_options jsonb;
  v_slide_count integer;
  v_element jsonb;
  v_import_id uuid;
  v_resumed boolean := false;
  v_pin_id uuid;
  v_pin record;
  v_extracted jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.can_manage_board_deck_import(p_board_id) THEN
    RAISE EXCEPTION 'board unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_manifest) <> 'object' THEN
    RAISE EXCEPTION 'manifest must be an object' USING ERRCODE = 'check_violation';
  END IF;

  -- ── Pin job (00679) ──
  IF v_manifest->>'source_format' = 'pin' THEN
    IF v_sha <> '' OR v_file_name IS NOT NULL THEN
      RAISE EXCEPTION 'a pin job has no file' USING ERRCODE = 'check_violation';
    END IF;
    IF COALESCE(v_manifest->>'board_item_id', '')
       !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'manifest board_item_id must be a uuid' USING ERRCODE = 'check_violation';
    END IF;
    v_pin_id := (v_manifest->>'board_item_id')::uuid;
    v_options := COALESCE(v_manifest->'options', '{}'::jsonb);
    IF jsonb_typeof(v_options) <> 'object' OR octet_length(v_options::text) > 16384 THEN
      RAISE EXCEPTION 'manifest options must be a small object' USING ERRCODE = 'check_violation';
    END IF;
    v_extracted := COALESCE(v_manifest->'extracted', '{}'::jsonb);
    IF jsonb_typeof(v_extracted) <> 'object' OR octet_length(v_extracted::text) > 16384 THEN
      RAISE EXCEPTION 'manifest extracted must be a small object' USING ERRCODE = 'check_violation';
    END IF;

    SELECT pin.type, COALESCE(pin.image_url, pin.data->>'image_url') AS image_url
    INTO v_pin
    FROM public.proposal_board_items AS pin
    WHERE pin.id = v_pin_id AND pin.board_id = p_board_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'board item belongs to another board'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_pin.type <> 'image' OR v_pin.image_url IS NULL THEN
      RAISE EXCEPTION 'only a picture pin can be found' USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.board_deck_imports (
      board_id, created_by, source_format, board_item_id, options, status
    )
    VALUES (p_board_id, v_uid, 'pin', v_pin_id, v_options, 'resolving')
    ON CONFLICT (board_item_id) WHERE source_format = 'pin' DO NOTHING
    RETURNING id INTO v_import_id;

    IF v_import_id IS NULL THEN
      SELECT id INTO v_import_id
      FROM public.board_deck_imports
      WHERE source_format = 'pin' AND board_item_id = v_pin_id AND board_id = p_board_id
      FOR UPDATE;
      IF v_import_id IS NULL THEN
        RAISE EXCEPTION 'board item belongs to another board'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      v_resumed := true;
      -- Ask again: an undecided, unleased piece goes back to pending.
      UPDATE public.board_deck_import_items
      SET state = 'pending',
          found_by = NULL,
          candidates = '[]'::jsonb,
          extracted = v_extracted,
          attempts = 0,
          next_attempt_at = NULL,
          lease_owner = NULL,
          lease_until = NULL
      WHERE import_id = v_import_id
        AND state IN ('pending', 'found', 'not_found')
        AND (lease_until IS NULL OR lease_until <= now());
      UPDATE public.board_deck_imports
      SET created_by = v_uid,
          options = v_options,
          status = 'resolving',
          finished_at = NULL
      WHERE id = v_import_id;
      PERFORM public._board_deck_import_settle(v_import_id);
    ELSE
      INSERT INTO public.board_deck_import_items (
        import_id, element_key, board_item_id, slide_index, role, extracted, state
      )
      VALUES (v_import_id, 'pin:' || v_pin_id::text, v_pin_id, 0, 'product', v_extracted, 'pending');
    END IF;

  -- ── Deck (00676, unchanged) ──
  ELSE
    IF v_sha !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'file_sha256 must be a hex sha-256' USING ERRCODE = 'check_violation';
    END IF;
    IF v_file_name IS NULL OR length(v_file_name) > 255 THEN
      RAISE EXCEPTION 'file_name must be 1 to 255 characters' USING ERRCODE = 'check_violation';
    END IF;

    v_items := COALESCE(v_manifest->'items', '[]'::jsonb);
    IF jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) > 2000 THEN
      RAISE EXCEPTION 'manifest items must be an array of at most 2000'
        USING ERRCODE = 'check_violation';
    END IF;
    v_options := COALESCE(v_manifest->'options', '{}'::jsonb);
    IF jsonb_typeof(v_options) <> 'object' OR octet_length(v_options::text) > 16384 THEN
      RAISE EXCEPTION 'manifest options must be a small object' USING ERRCODE = 'check_violation';
    END IF;
    IF v_manifest ? 'slide_count'
       AND (v_manifest->>'slide_count') !~ '^[0-9]{1,4}$' THEN
      RAISE EXCEPTION 'manifest slide_count must be a whole number' USING ERRCODE = 'check_violation';
    END IF;
    v_slide_count := COALESCE((v_manifest->>'slide_count')::integer, 0);

    INSERT INTO public.board_deck_imports (
      board_id, created_by, source_format, file_name, file_sha256, slide_count, options, links
    )
    VALUES (
      p_board_id, v_uid, 'deck', v_file_name, v_sha, v_slide_count, v_options,
      public._board_deck_import_manifest_links(v_manifest)
    )
    ON CONFLICT ON CONSTRAINT board_deck_imports_board_sha_key DO NOTHING
    RETURNING id INTO v_import_id;

    IF v_import_id IS NULL THEN
      SELECT id INTO v_import_id
      FROM public.board_deck_imports
      WHERE board_id = p_board_id AND file_sha256 = v_sha;
      v_resumed := true;
    ELSE
      FOR v_element IN SELECT value FROM jsonb_array_elements(v_items) LOOP
        IF jsonb_typeof(v_element) <> 'object'
           OR length(btrim(COALESCE(v_element->>'element_key', ''))) NOT BETWEEN 1 AND 200
           OR COALESCE(v_element->>'role', '') NOT IN ('product', 'reference')
           OR COALESCE(v_element->>'slide_index', '0') !~ '^[0-9]{1,4}$'
           OR length(COALESCE(v_element->>'slide_title', '')) > 500
           OR jsonb_typeof(COALESCE(v_element->'extracted', '{}'::jsonb)) <> 'object'
           OR octet_length(COALESCE(v_element->'extracted', '{}'::jsonb)::text) > 16384 THEN
          RAISE EXCEPTION 'invalid manifest item'
            USING ERRCODE = 'check_violation',
                  DETAIL = left(v_element::text, 200);
        END IF;
      END LOOP;

      INSERT INTO public.board_deck_import_items (
        import_id, element_key, slide_index, slide_title, role, extracted, state
      )
      SELECT v_import_id,
             btrim(element->>'element_key'),
             COALESCE((element->>'slide_index')::integer, 0),
             NULLIF(btrim(element->>'slide_title'), ''),
             element->>'role',
             COALESCE(element->'extracted', '{}'::jsonb),
             CASE WHEN element->>'role' = 'reference' THEN 'reference' ELSE 'pending' END
      FROM jsonb_array_elements(v_items) AS element;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'import_id', v_import_id,
    'resumed', v_resumed,
    'status', (SELECT status FROM public.board_deck_imports WHERE id = v_import_id),
    'items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'item_id', item.id,
          'element_key', item.element_key,
          'board_item_id', item.board_item_id,
          'state', item.state
        )
        ORDER BY item.slide_index, item.element_key
      )
      FROM public.board_deck_import_items AS item
      WHERE item.import_id = v_import_id
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_board_deck_import(uuid, text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_board_deck_import(uuid, text, text, jsonb)
  TO authenticated;
