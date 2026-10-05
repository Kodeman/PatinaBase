-- ═══════════════════════════════════════════════════════════════════════════
-- 00685 — Bring in a Deck: second review fixes (US-15, SQ-377; SQ-375 F1–F3)
--
-- F1 _board_deck_import_normalize_url, _board_deck_import_pct_encode,
--    _board_deck_import_punycode — EXECUTE granted to anon, authenticated and
--    service_role. idx_products_deck_import_source_url (00683) evaluates the
--    normalizer, as the writing role, on every products INSERT and every
--    non-HOT UPDATE of a row with a source_url (an UPDATE of aesthete_vector
--    is never HOT: it has an HNSW index). 00677 left the normalizer to
--    postgres and service_role, and 00683 left its two helpers to postgres,
--    so every product write outside a postgres-owned definer failed with
--    42501. The three are pure IMMUTABLE string functions and read no table.
--    No other index, generated column or policy added in 00676–00684 calls a
--    function its writers cannot execute (the remaining new indexes are on
--    plain columns; the policies call can_manage_board_deck_import, granted to
--    authenticated).
-- F2 _board_deck_import_teach — REDEFINED (00681, its only body). The studio a
--    Keep teaches is the candidate scope's studio
--    (_board_deck_import_candidate_scope, 00683): the studio whose boards'
--    imports read the taught row back in board_deck_import_match_phash and
--    _match_image_knn (00684). 00681 fell back to the keeper's earliest
--    studio when the job had no studio_id, so a keeper in two studios taught
--    the wrong one. No scope studio → nothing is taught, as before.
-- F3 The same body's un-teach: the studio is the same scope studio (not the
--    keeper's), so a swap by another user removes the confirmation; the
--    "another kept piece still confirms it" check counts only pieces of the
--    same studio; and a transaction advisory lock on (studio, crop sha)
--    serializes concurrent keeps and unkeeps of the same crop, so two
--    same-crop unkeeps under READ COMMITTED cannot each see the other still
--    kept and both leave the row behind.
--
-- _board_deck_import_board_studio (00681) has no caller left; it stays
-- (no grants, definer-only).
--
-- Adds GRANTs → regenerate seed/00-legacy-grants.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── F1: the normalizer's index runs as the writer ───────────────────────────

GRANT EXECUTE ON FUNCTION public._board_deck_import_normalize_url(text)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._board_deck_import_pct_encode(text, text)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._board_deck_import_punycode(text)
  TO anon, authenticated, service_role;

-- ── F2 + F3: teach and un-teach in the candidate scope's studio ─────────────

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
  -- The studio the candidate tiers read for this import (00683/00684).
  SELECT scope.studio_id INTO v_studio
  FROM public._board_deck_import_candidate_scope(NEW.import_id) AS scope;
  IF v_studio IS NULL THEN
    RETURN NEW;
  END IF;
  v_hash := v_signature.image_hash || ':' || v_studio::text;

  -- One keep/unkeep of this crop in this studio at a time; each statement
  -- below then reads the others' committed state (READ COMMITTED).
  PERFORM pg_advisory_xact_lock(hashtextextended('board_deck_import_teach:' || v_hash, 0));

  -- Swap away or unkeep: the old product no longer has this crop's
  -- confirmation, unless another kept piece in this studio with the same
  -- crop still does.
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
          AND (SELECT scope.studio_id
               FROM public._board_deck_import_candidate_scope(other.import_id) AS scope) = v_studio
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
