-- ═══════════════════════════════════════════════════════════════════════════
-- 00684 — Bring in a Deck: picture candidates scoped to the board's studio
--         (US-15, SQ-373; follow-up to 00683 F17)
--
-- 00683 limited the deck-import candidate tiers to the board's studio through
-- _board_deck_import_candidate_scope(import_id). 00681 (written in parallel)
-- added two picture siblings that still offered every studio the importer
-- belongs to: a designer in studios A and B importing into B's board got A's
-- studio products, and A's designer_confirmed picture rows, back by look or
-- by pHash.
--
--   board_deck_import_match_image_knn   00681 → 00684
--   board_deck_import_match_phash       00681 → 00684
--
-- Each body is its 00681 one verbatim apart from the scope: the importer and
-- studio come from _board_deck_import_candidate_scope; the product predicate
-- is the 00683 inline one (catalog, the importer's personal products, the
-- board's studio products); a picture row is visible when it has no studio
-- or its studio is the board's studio (so a designer_confirmed row is only
-- ever offered on its own studio's boards). Signatures, return columns,
-- SECURITY DEFINER and grants are unchanged (CREATE OR REPLACE keeps the ACL).
-- When the board's studio is the importer's only studio the result equals the
-- RLS read under the importer's JWT (product_image_vectors.test.sql); for a
-- member of two studios it is that read minus the other studio's rows
-- (image_candidate_scope.test.sql).
--
-- _board_deck_import_row_studio_visible (00681) has no caller left; it stays
-- (no grants, definer-only).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.board_deck_import_match_image_knn(
  p_import_id uuid,
  p_embedding vector(768),
  p_limit integer DEFAULT 10,
  p_category text DEFAULT NULL
)
RETURNS TABLE (product_id uuid, rank real, layer text, source text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_user uuid;
  v_studio uuid;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 200);
  v_category text := NULLIF(btrim(COALESCE(p_category, '')), '');
BEGIN
  SELECT scope.user_id, scope.studio_id INTO v_user, v_studio
  FROM public._board_deck_import_candidate_scope(p_import_id) AS scope;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deck import not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_embedding IS NULL THEN
    RETURN;
  END IF;

  -- The nearest visible pictures (several per product at most), then the
  -- best picture per product. Ties: designer_confirmed before product_image.
  RETURN QUERY
  WITH nearest AS (
    SELECT picture.product_id,
           (1 - (picture.vector <=> p_embedding))::real AS similarity,
           picture.source,
           product.layer
    FROM public.product_image_vectors AS picture
    JOIN public.products AS product ON product.id = picture.product_id
    WHERE product.deleted_at IS NULL
      AND product.merged_into_id IS NULL
      AND (v_category IS NULL OR product.category = v_category)
      AND (
        product.layer = 'catalog'
        OR (product.layer = 'personal' AND product.owner_user_id = v_user)
        OR (product.layer = 'studio' AND product.studio_id = v_studio)
      )
      AND (picture.studio_id IS NULL OR picture.studio_id = v_studio)
    ORDER BY picture.vector <=> p_embedding, picture.id
    LIMIT v_limit * 4
  ),
  best AS (
    SELECT DISTINCT ON (nearest.product_id)
           nearest.product_id, nearest.similarity, nearest.layer, nearest.source
    FROM nearest
    ORDER BY nearest.product_id, nearest.similarity DESC,
             (nearest.source = 'designer_confirmed') DESC
  )
  SELECT best.product_id, best.similarity, best.layer, best.source
  FROM best
  ORDER BY best.similarity DESC, best.product_id
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.board_deck_import_match_image_knn(uuid, vector, integer, text) IS
  'Deck import T1/T2 (00681, scoped 00684): kNN over product_image_vectors as the importing '
  'user (board_deck_imports.created_by) sees it — 00152 product rules plus the row''s '
  'studio scope, studio products and studio rows limited to the board''s studio. Best '
  'picture per product. Parity with the RLS read asserted by '
  'supabase/tests/deck_import/product_image_vectors.test.sql; the two-studio limit by '
  'image_candidate_scope.test.sql.';

CREATE OR REPLACE FUNCTION public.board_deck_import_match_phash(
  p_import_id uuid,
  p_phash bigint,
  p_max_distance integer DEFAULT 6,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (product_id uuid, distance integer, layer text, source text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_user uuid;
  v_studio uuid;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
  v_max integer := LEAST(GREATEST(COALESCE(p_max_distance, 6), 0), 16);
BEGIN
  SELECT scope.user_id, scope.studio_id INTO v_user, v_studio
  FROM public._board_deck_import_candidate_scope(p_import_id) AS scope;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deck import not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_phash IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH near AS (
    SELECT picture.product_id,
           bit_count((picture.phash # p_phash)::bit(64))::integer AS distance,
           product.layer,
           picture.source
    FROM public.product_image_vectors AS picture
    JOIN public.products AS product ON product.id = picture.product_id
    WHERE picture.phash IS NOT NULL
      AND product.deleted_at IS NULL
      AND product.merged_into_id IS NULL
      AND (
        product.layer = 'catalog'
        OR (product.layer = 'personal' AND product.owner_user_id = v_user)
        OR (product.layer = 'studio' AND product.studio_id = v_studio)
      )
      AND (picture.studio_id IS NULL OR picture.studio_id = v_studio)
  ),
  best AS (
    SELECT DISTINCT ON (near.product_id) near.product_id, near.distance, near.layer, near.source
    FROM near
    WHERE near.distance <= v_max
    ORDER BY near.product_id, near.distance, (near.source = 'designer_confirmed') DESC
  )
  SELECT best.product_id, best.distance, best.layer, best.source
  FROM best
  ORDER BY best.distance, best.product_id
  LIMIT v_limit;
END;
$$;
