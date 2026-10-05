-- ═══════════════════════════════════════════════════════════════════════════
-- 00681 — Bring in a Deck: precision (US-15 W5, SQ-363)
--
--   product_image_vectors   One /embed/image vector per product picture.
--       source 'product_image': written by aesthete-embed-worker, which
--         already embeds each product's pictures (up to 3) to fuse
--         aesthete_vector and used to throw the per-picture vectors away.
--         image_hash = sha256(picture URL) hex (the worker never holds the
--         bytes); phash NULL; studio_id NULL (anyone who can see the product).
--       source 'designer_confirmed': a deck crop the designer kept, written
--         by the keep trigger below. image_hash = sha256(crop bytes) hex ||
--         ':' || studio_id, so each studio holds its own row; phash = the
--         crop's 64-bit dHash; studio_id = the board's studio, so only that
--         studio's members see it (the taught signal: the studio's next deck
--         gets an exact hit).
--       Reads under RLS: the product is visible to the caller (products RLS,
--       00152) AND (studio_id IS NULL or the caller is an active member).
--       No client role writes.
--   replace_product_image_vectors   service_role; the worker's one write per
--       product: upserts this model's picture rows and drops the product's
--       other 'product_image' rows (pictures removed, older model).
--   board_deck_import_match_image_knn   T1/T2 by look over this table, as the
--       importing user (board_deck_imports.created_by) sees it: the 00152
--       product rules (00677 _board_deck_import_visible_for) plus the row's
--       studio scope. Best picture per product; rank = cosine similarity.
--       Sibling of the 00679 fused twin; parity with the RLS read under the
--       importer's JWT is asserted by
--       supabase/tests/deck_import/product_image_vectors.test.sql.
--   board_deck_import_match_phash   T1 exact by pHash: Hamming distance on
--       the 64-bit hash, same visibility; closest picture per product.
--   board_deck_import_crop_signatures + store_board_deck_import_crop_signature
--       The resolver keeps each embedded crop's vector, sha256 and dHash for
--       the piece it holds the lease on (service-only table), so a later Keep
--       can teach it without re-embedding.
--   board_deck_import_items.evidence   {suppressed: [{product_id, phash, at}]}:
--       products the designer swapped away from. The resolver's look tiers
--       skip them when the piece is resolved again.
--   trg_board_deck_import_items_teach   BEFORE UPDATE OF state,
--       chosen_product_id. Keep (or swap onto) a product → the crop's
--       signature becomes a 'designer_confirmed' row. Swap away → the old
--       product is suppressed on the item; swap away or unkeep → the old
--       product's taught row for this crop goes, unless another kept piece
--       still confirms it. A trigger, not a _board_deck_import_choose edit:
--       00682 (which sorts after this file) redefines choose.
--   Backfill: re-enqueue embed_fused (00241 dedupe key) for products the
--       worker already fused from pictures and that have no picture rows.
--       Enqueue only; the worker fills the rows on its normal cadence.
--
-- Lineage: new objects only; no function is redefined. The items table gains
-- one column. Adds GRANT/REVOKE → seed/00-legacy-grants.sql regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. product_image_vectors ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.product_image_vectors (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  image_hash     text NOT NULL CHECK (length(image_hash) BETWEEN 1 AND 200),
  vector         vector(768) NOT NULL,
  phash          bigint,
  model_version  text NOT NULL CHECK (length(model_version) BETWEEN 1 AND 200),
  source         text NOT NULL CHECK (source IN ('product_image', 'designer_confirmed')),
  studio_id      uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_image_vectors_identity UNIQUE (product_id, image_hash, model_version),
  CONSTRAINT product_image_vectors_confirmed_studio CHECK (
    source = 'product_image' OR studio_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_product_image_vectors_hnsw
  ON public.product_image_vectors USING hnsw (vector vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_product_image_vectors_phash
  ON public.product_image_vectors (phash)
  WHERE phash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_image_vectors_studio
  ON public.product_image_vectors (studio_id)
  WHERE studio_id IS NOT NULL;

COMMENT ON TABLE public.product_image_vectors IS
  'One image-only vector per product picture (00681). product_image: the embed '
  'worker''s per-picture vectors; designer_confirmed: a deck crop a designer kept, '
  'visible only to the board''s studio. Readable where the product is visible and '
  'the row''s studio (if any) is the caller''s.';

ALTER TABLE public.product_image_vectors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_image_vectors_select ON public.product_image_vectors;
CREATE POLICY product_image_vectors_select ON public.product_image_vectors
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products AS product
      WHERE product.id = product_image_vectors.product_id
    )
    AND (
      studio_id IS NULL
      OR studio_id IN (
        SELECT membership.organization_id
        FROM public.organization_members AS membership
        WHERE membership.user_id = auth.uid()
          AND membership.status = 'active'
      )
    )
  );

REVOKE ALL ON TABLE public.product_image_vectors FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.product_image_vectors TO authenticated;
GRANT ALL ON TABLE public.product_image_vectors TO service_role;

-- ── 2. The worker's write ───────────────────────────────────────────────────

-- p_rows: [{image_hash, vector}] for this model, at most 16. The product's
-- 'product_image' rows not in p_rows (pictures removed, other models) go;
-- designer_confirmed rows are never touched here.
CREATE OR REPLACE FUNCTION public.replace_product_image_vectors(
  p_product_id uuid,
  p_model_version text,
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_rows jsonb := COALESCE(p_rows, '[]'::jsonb);
  v_model text := NULLIF(btrim(COALESCE(p_model_version, '')), '');
  v_written integer;
BEGIN
  IF p_product_id IS NULL OR v_model IS NULL THEN
    RAISE EXCEPTION 'product and model version are required' USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_typeof(v_rows) <> 'array' OR jsonb_array_length(v_rows) > 16 THEN
    RAISE EXCEPTION 'rows must be an array of at most 16' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_rows) AS row_value
    WHERE jsonb_typeof(row_value) <> 'object'
       OR COALESCE(row_value->>'image_hash', '') !~ '^[0-9a-f]{64}$'
       OR jsonb_typeof(row_value->'vector') IS DISTINCT FROM 'string'
  ) THEN
    RAISE EXCEPTION 'each row needs a hex sha-256 image_hash and a vector' USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.product_image_vectors AS existing
  WHERE existing.product_id = p_product_id
    AND existing.source = 'product_image'
    AND (
      existing.model_version <> v_model
      OR existing.image_hash NOT IN (
        SELECT row_value->>'image_hash' FROM jsonb_array_elements(v_rows) AS row_value
      )
    );

  INSERT INTO public.product_image_vectors (
    product_id, image_hash, vector, phash, model_version, source, studio_id, created_by
  )
  SELECT DISTINCT ON (row_value->>'image_hash')
         p_product_id, row_value->>'image_hash', (row_value->>'vector')::vector(768),
         NULL, v_model, 'product_image', NULL, NULL
  FROM jsonb_array_elements(v_rows) AS row_value
  ON CONFLICT ON CONSTRAINT product_image_vectors_identity DO UPDATE
    SET vector = EXCLUDED.vector,
        created_at = now()
    WHERE product_image_vectors.source = 'product_image';
  GET DIAGNOSTICS v_written = ROW_COUNT;
  RETURN v_written;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_product_image_vectors(uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_product_image_vectors(uuid, text, jsonb)
  TO service_role;

-- ── 3. T1/T2 by look over picture vectors, as the importer ──────────────────

-- Whether a picture row's studio scope lets this user see it (the policy's
-- second half, for a named user).
CREATE OR REPLACE FUNCTION public._board_deck_import_row_studio_visible(
  p_user uuid,
  p_studio uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_studio IS NULL
    OR (
      p_user IS NOT NULL
      AND p_studio IN (
        SELECT membership.organization_id
        FROM public.organization_members AS membership
        WHERE membership.user_id = p_user
          AND membership.status = 'active'
      )
    );
$$;

REVOKE ALL ON FUNCTION public._board_deck_import_row_studio_visible(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

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
      AND public._board_deck_import_visible_for(
        v_user, product.layer, product.owner_user_id, product.studio_id)
      AND public._board_deck_import_row_studio_visible(v_user, picture.studio_id)
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
  'Deck import T1/T2 (00681): kNN over product_image_vectors as the importing user '
  '(board_deck_imports.created_by) sees it — 00152 product rules plus the row''s '
  'studio scope. Best picture per product. Parity with the RLS read asserted by '
  'supabase/tests/deck_import/product_image_vectors.test.sql.';

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
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
  v_max integer := LEAST(GREATEST(COALESCE(p_max_distance, 6), 0), 16);
BEGIN
  SELECT deck_import.created_by INTO v_user
  FROM public.board_deck_imports AS deck_import
  WHERE deck_import.id = p_import_id;
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
      AND public._board_deck_import_visible_for(
        v_user, product.layer, product.owner_user_id, product.studio_id)
      AND public._board_deck_import_row_studio_visible(v_user, picture.studio_id)
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

REVOKE ALL ON FUNCTION public.board_deck_import_match_image_knn(uuid, vector, integer, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.board_deck_import_match_phash(uuid, bigint, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.board_deck_import_match_image_knn(uuid, vector, integer, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.board_deck_import_match_phash(uuid, bigint, integer, integer)
  TO service_role;

-- ── 4. Crop signatures (service only) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.board_deck_import_crop_signatures (
  item_id        uuid PRIMARY KEY REFERENCES public.board_deck_import_items(id) ON DELETE CASCADE,
  image_hash     text NOT NULL CHECK (image_hash ~ '^[0-9a-f]{64}$'),
  phash          bigint,
  vector         vector(768) NOT NULL,
  model_version  text NOT NULL CHECK (length(model_version) BETWEEN 1 AND 200),
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.board_deck_import_crop_signatures IS
  'The resolver''s embedding of a deck piece''s crop (00681): sha256 of the bytes, '
  '64-bit dHash, /embed/image vector. Service only; a Keep turns it into a '
  'designer_confirmed product_image_vectors row.';

ALTER TABLE public.board_deck_import_crop_signatures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.board_deck_import_crop_signatures FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.board_deck_import_crop_signatures TO service_role;

-- Only the run holding the piece's lease may write its signature.
CREATE OR REPLACE FUNCTION public.store_board_deck_import_crop_signature(
  p_item_id uuid,
  p_lease_owner text,
  p_image_hash text,
  p_phash bigint,
  p_vector vector(768),
  p_model_version text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NULLIF(btrim(COALESCE(p_lease_owner, '')), '') IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.board_deck_import_items AS item
    WHERE item.id = p_item_id
      AND item.lease_owner = p_lease_owner
      AND item.lease_until > now()
  ) THEN
    RAISE EXCEPTION 'deck import lease expired or not held' USING ERRCODE = 'lock_not_available';
  END IF;
  IF p_vector IS NULL THEN
    RAISE EXCEPTION 'a crop signature needs its vector' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.board_deck_import_crop_signatures (
    item_id, image_hash, phash, vector, model_version
  )
  VALUES (p_item_id, lower(p_image_hash), p_phash, p_vector, p_model_version)
  ON CONFLICT (item_id) DO UPDATE
    SET image_hash = EXCLUDED.image_hash,
        phash = EXCLUDED.phash,
        vector = EXCLUDED.vector,
        model_version = EXCLUDED.model_version,
        created_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.store_board_deck_import_crop_signature(uuid, text, text, bigint, vector, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_board_deck_import_crop_signature(uuid, text, text, bigint, vector, text)
  TO service_role;

-- ── 5. Suppression on the item ──────────────────────────────────────────────

ALTER TABLE public.board_deck_import_items
  ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(evidence) = 'object');

COMMENT ON COLUMN public.board_deck_import_items.evidence IS
  'Piece-level evidence (00681). suppressed: [{product_id, phash, at}] — products '
  'the designer swapped away from; the look tiers skip them on a re-run.';

-- ── 6. Keep teaches, swap suppresses ────────────────────────────────────────

-- The board's studio: the studio its job records, else the keeper's earliest
-- active design-studio membership. NULL → nothing is taught (a row without a
-- studio would be visible beyond it).
CREATE OR REPLACE FUNCTION public._board_deck_import_board_studio(
  p_import_id uuid,
  p_user uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    project.studio_id,
    (
      SELECT membership.organization_id
      FROM public.organization_members AS membership
      JOIN public.organizations AS organization ON organization.id = membership.organization_id
      WHERE membership.user_id = p_user
        AND membership.status = 'active'
        AND membership.role <> 'guest'
        AND organization.type = 'design_studio'
        AND organization.status = 'active'
      ORDER BY membership.joined_at NULLS LAST, membership.organization_id
      LIMIT 1
    )
  )
  FROM public.board_deck_imports AS deck_import
  JOIN public.proposal_boards AS board ON board.id = deck_import.board_id
  LEFT JOIN public.proposals AS proposal ON proposal.id = board.proposal_id
  LEFT JOIN public.projects AS project
    ON project.id = COALESCE(board.project_id, proposal.project_id)
  WHERE deck_import.id = p_import_id;
$$;

REVOKE ALL ON FUNCTION public._board_deck_import_board_studio(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public._board_deck_import_teach()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_signature public.board_deck_import_crop_signatures%ROWTYPE;
  v_studio uuid;
  v_hash text;
  v_was_kept boolean := OLD.state = 'kept' AND OLD.chosen_product_id IS NOT NULL;
  v_is_kept boolean := NEW.state = 'kept' AND NEW.chosen_product_id IS NOT NULL;
BEGIN
  IF NEW.state IS NOT DISTINCT FROM OLD.state
     AND NEW.chosen_product_id IS NOT DISTINCT FROM OLD.chosen_product_id THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_signature
  FROM public.board_deck_import_crop_signatures
  WHERE item_id = NEW.id;

  -- Swap away: the designer rejected the old product for this picture.
  IF v_was_kept AND v_is_kept AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(NEW.evidence->'suppressed') = 'array'
        THEN NEW.evidence->'suppressed' ELSE '[]'::jsonb END) AS entry
    WHERE entry->>'product_id' = OLD.chosen_product_id::text
  ) THEN
    NEW.evidence := NEW.evidence || jsonb_build_object('suppressed',
      CASE WHEN jsonb_typeof(NEW.evidence->'suppressed') = 'array'
        THEN NEW.evidence->'suppressed' ELSE '[]'::jsonb END
      || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
           'product_id', OLD.chosen_product_id,
           'phash', v_signature.phash,
           'at', now()))));
  END IF;

  IF v_signature.item_id IS NULL THEN
    RETURN NEW;
  END IF;
  v_studio := public._board_deck_import_board_studio(
    NEW.import_id, COALESCE(NEW.kept_by, OLD.kept_by, auth.uid()));
  IF v_studio IS NULL THEN
    RETURN NEW;
  END IF;
  v_hash := v_signature.image_hash || ':' || v_studio::text;

  -- Swap away or unkeep: the old product no longer has this crop's
  -- confirmation, unless another kept piece with the same crop still does.
  IF v_was_kept THEN
    DELETE FROM public.product_image_vectors AS taught
    WHERE taught.product_id = OLD.chosen_product_id
      AND taught.image_hash = v_hash
      AND taught.source = 'designer_confirmed'
      AND NOT EXISTS (
        SELECT 1
        FROM public.board_deck_import_items AS other
        JOIN public.board_deck_import_crop_signatures AS other_signature
          ON other_signature.item_id = other.id
        WHERE other.id <> NEW.id
          AND other.state = 'kept'
          AND other.chosen_product_id = OLD.chosen_product_id
          AND other_signature.image_hash = v_signature.image_hash
      );
  END IF;

  -- Keep (or swap onto): teach the chosen product this crop, for this studio.
  IF v_is_kept THEN
    INSERT INTO public.product_image_vectors (
      product_id, image_hash, vector, phash, model_version, source, studio_id, created_by
    )
    VALUES (
      NEW.chosen_product_id, v_hash, v_signature.vector, v_signature.phash,
      v_signature.model_version, 'designer_confirmed', v_studio,
      COALESCE(NEW.kept_by, auth.uid())
    )
    ON CONFLICT ON CONSTRAINT product_image_vectors_identity DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._board_deck_import_teach()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_board_deck_import_items_teach ON public.board_deck_import_items;
CREATE TRIGGER trg_board_deck_import_items_teach
  BEFORE UPDATE OF state, chosen_product_id ON public.board_deck_import_items
  FOR EACH ROW EXECUTE FUNCTION public._board_deck_import_teach();

-- ── 7. Backfill (enqueue only) ──────────────────────────────────────────────
-- Products the worker already fused from pictures have no picture rows yet:
-- re-run their embed_fused job (00241 key) so the worker keeps the vectors.
-- Products never fused, or whose job is parked as failed for a reason other
-- than this, are left alone. Locally a no-op at reset (seeds run later).
INSERT INTO public.aesthete_jobs (kind, product_id, dedupe_key)
SELECT 'embed_fused', product.id, product.id || ':embed_fused:r1'
FROM public.products AS product
WHERE product.aesthete_vector IS NOT NULL
  AND product.deleted_at IS NULL
  AND product.merged_into_id IS NULL
  AND cardinality(product.images) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.product_image_vectors AS picture
    WHERE picture.product_id = product.id AND picture.source = 'product_image'
  )
ON CONFLICT (dedupe_key) DO UPDATE
  SET status = 'pending', run_after = now(), attempts = 0,
      last_error = NULL, completed_at = NULL
  WHERE aesthete_jobs.status = 'done';
