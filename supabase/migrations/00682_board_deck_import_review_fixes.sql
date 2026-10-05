-- ═══════════════════════════════════════════════════════════════════════════
-- 00682 — Board deck import review fixes (US-15, SQ-372; SQ-371 N2 N4 N5 N6)
--
-- N2  release_board_deck_import_items(lease_owner, item_ids) — NEW. The
--     resolver hands back pieces it claimed but never tried (its start budget
--     ran out, or their slide could not be adjudicated). Only rows still
--     leased to that owner are touched: the lease is cleared and the claim's
--     attempt is given back (attempts = greatest(attempts - 1, 0)).
--     next_attempt_at is left alone, so the piece is eligible on the next run
--     instead of being backed off by the claim sweep toward not_found.
-- N4  board_web_match_studio_key(import_id) — REDEFINED (00680, its only
--     body). Web match now bills the BOARD's studio, not the importer's
--     earliest one: the studio the board's job records (projects.studio_id,
--     through the board's project or its proposal's project), else the board
--     designer's active design studio (one the importer also belongs to first,
--     then the earliest joined), else the designer, else the 00677 key. The
--     deck link quota keeps the 00677 key (_board_deck_import_studio_key).
-- N5  board_web_match_vendor_websites(studio_id) — NEW. The shop filter's
--     vendor list: vendors linked to the studio through its products (the
--     00159 v_vendor_studio_stats link, products.studio_id) plus Patina
--     catalog vendors, with a website. One ordered jsonb array, so no
--     PostgREST row cap can drop rows silently.
-- N6  _board_deck_import_choose — REDEFINED. The pin row is locked FOR UPDATE
--     before the pin_taken check, so two keeps of link rows from different
--     imports onto one plain pin serialize and the second sees the first.
--     Lineage: 00676 → 00678 → 00682 (00678 body verbatim + the lock). The
--     item → pin lock order is the one commit_proposal_capture already takes.
--
-- Not here: SQ-371 N3 and N7 are ruled out of scope (story log US-15 #11).
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql at integration.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── N2: hand back untried pieces ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.release_board_deck_import_items(
  p_lease_owner text,
  p_item_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_released integer;
BEGIN
  IF NULLIF(btrim(COALESCE(p_lease_owner, '')), '') IS NULL THEN
    RAISE EXCEPTION 'deck import lease expired or not held' USING ERRCODE = 'lock_not_available';
  END IF;

  UPDATE public.board_deck_import_items
  SET lease_owner = NULL,
      lease_until = NULL,
      attempts = GREATEST(attempts - 1, 0)
  WHERE id = ANY(COALESCE(p_item_ids, '{}'::uuid[]))
    AND lease_owner = p_lease_owner
    AND lease_until > now();
  GET DIAGNOSTICS v_released = ROW_COUNT;
  RETURN v_released;
END;
$$;

REVOKE ALL ON FUNCTION public.release_board_deck_import_items(text, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_board_deck_import_items(text, uuid[])
  TO service_role;

-- ── N4: web match bills the board's studio ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.board_web_match_studio_key(p_import_id uuid)
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
      JOIN public.organizations AS organization
        ON organization.id = membership.organization_id
      WHERE membership.user_id = COALESCE(proposal.designer_id, project.designer_id)
        AND membership.status = 'active'
        AND membership.role <> 'guest'
        AND organization.type = 'design_studio'
        AND organization.status = 'active'
      ORDER BY
        EXISTS (
          SELECT 1
          FROM public.organization_members AS importer
          WHERE importer.organization_id = membership.organization_id
            AND importer.user_id = deck_import.created_by
            AND importer.status = 'active'
            AND importer.role <> 'guest'
        ) DESC,
        membership.joined_at NULLS LAST,
        membership.organization_id
      LIMIT 1
    ),
    COALESCE(proposal.designer_id, project.designer_id),
    public._board_deck_import_studio_key(p_import_id)
  )
  FROM public.board_deck_imports AS deck_import
  JOIN public.proposal_boards AS board ON board.id = deck_import.board_id
  LEFT JOIN public.proposals AS proposal ON proposal.id = board.proposal_id
  LEFT JOIN public.projects AS project
    ON project.id = COALESCE(board.project_id, proposal.project_id)
  WHERE deck_import.id = p_import_id;
$$;

REVOKE ALL ON FUNCTION public.board_web_match_studio_key(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.board_web_match_studio_key(uuid)
  TO service_role;

-- ── N5: the studio's vendors and catalog vendors, every row ─────────────────

CREATE OR REPLACE FUNCTION public.board_web_match_vendor_websites(p_studio_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('name', vendor.name, 'website', vendor.website)
      ORDER BY vendor.created_at ASC NULLS LAST, vendor.id
    ),
    '[]'::jsonb
  )
  FROM public.vendors AS vendor
  WHERE NULLIF(btrim(vendor.website), '') IS NOT NULL
    AND (
      vendor.is_patina_catalog
      OR EXISTS (
        SELECT 1
        FROM public.products AS product
        WHERE product.vendor_id = vendor.id
          AND product.studio_id = p_studio_id
      )
    );
$$;

REVOKE ALL ON FUNCTION public.board_web_match_vendor_websites(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.board_web_match_vendor_websites(uuid)
  TO service_role;

-- ── N6: pin_taken under a lock ──────────────────────────────────────────────

-- Keep and swap share one body. p_mode 'keep' is idempotent for the same
-- choice and refuses a different one on an already-kept piece; 'swap'
-- requires a kept piece and the movable-pin guard.
CREATE OR REPLACE FUNCTION public._board_deck_import_choose(
  p_item_id uuid,
  p_candidate_rank integer,
  p_product_id uuid,
  p_mode text,
  p_board_item_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Fixed namespace for deck-import capture ids (uuidv5). Never change it:
  -- it is what makes a repeated Keep land on the same capture and product.
  c_capture_namespace constant uuid := 'b0a4d1e5-6c2f-4f3a-9d8e-7a1c0de0c676';
  v_uid uuid := auth.uid();
  v_item public.board_deck_import_items%ROWTYPE;
  v_candidate jsonb;
  v_extracted jsonb;
  v_target uuid;
  v_capture_id uuid;
  v_client_capture_id uuid;
  v_source_url text;
  v_price text;
  v_vendor_id uuid;
  v_found_by text;
  v_commit jsonb;
  v_same boolean;
  v_import_id uuid;
  v_product record;
  v_picture public.board_deck_import_items%ROWTYPE;
  v_has_link_result boolean;
BEGIN
  IF (p_candidate_rank IS NULL) = (p_product_id IS NULL) THEN
    RAISE EXCEPTION 'name exactly one of a candidate rank or a product'
      USING ERRCODE = 'check_violation';
  END IF;

  v_item := public._board_deck_import_lock_item(p_item_id);
  v_import_id := v_item.import_id;

  IF v_item.state = 'removed' THEN
    RAISE EXCEPTION 'this piece was removed from the board' USING ERRCODE = 'check_violation';
  END IF;

  -- Fold, repeated: a merged link row's Keep is its picture's Keep.
  IF v_item.state = 'merged' THEN
    SELECT * INTO v_picture
    FROM public.board_deck_import_items
    WHERE id = v_item.merged_into_item_id;
    IF p_mode <> 'keep' OR v_picture.id IS NULL
       OR (p_board_item_id IS NOT NULL AND p_board_item_id IS DISTINCT FROM v_picture.board_item_id) THEN
      RAISE EXCEPTION 'this piece was folded into its picture'
        USING ERRCODE = 'check_violation', HINT = 'merged';
    END IF;
    RETURN public._board_deck_import_choose(
      v_picture.id, p_candidate_rank, p_product_id, 'keep', NULL);
  END IF;

  -- A piece found from a link with no picture of its own can take one at
  -- keep time: the chosen pin must be on this import's board, and a piece
  -- that already has a pin keeps it.
  IF p_board_item_id IS NOT NULL THEN
    IF v_item.board_item_id IS NOT NULL AND v_item.board_item_id <> p_board_item_id THEN
      RAISE EXCEPTION 'this piece already has its picture' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.proposal_board_items AS pin
      JOIN public.board_deck_imports AS deck_import ON deck_import.board_id = pin.board_id
      WHERE pin.id = p_board_item_id AND deck_import.id = v_import_id
    ) THEN
      RAISE EXCEPTION 'board item belongs to another board'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- F4: a newly attached pin must not have gone onward, nor be another
    -- import's piece's picture.
    IF v_item.board_item_id IS NULL THEN
      -- 00682 (N6): lock the pin first, so a concurrent keep onto it from
      -- another import waits here and then sees this one in the check below.
      PERFORM 1 FROM public.proposal_board_items WHERE id = p_board_item_id FOR UPDATE;
      PERFORM public._board_deck_import_assert_pin_movable(p_board_item_id);
      IF EXISTS (
        SELECT 1 FROM public.board_deck_import_items AS other
        WHERE other.board_item_id = p_board_item_id AND other.import_id <> v_import_id
      ) THEN
        RAISE EXCEPTION 'that picture already belongs to another piece'
          USING ERRCODE = 'check_violation', HINT = 'pin_taken';
      END IF;

      -- Fold: the pin is this import's own picture piece. The link's
      -- resolution moves onto the picture, the picture is kept, and the link
      -- row is retired as 'merged'. Locks: link (above), then picture — the
      -- order pair_board_deck_import_link uses.
      SELECT * INTO v_picture
      FROM public.board_deck_import_items
      WHERE import_id = v_import_id AND board_item_id = p_board_item_id AND id <> p_item_id
      FOR UPDATE;
      IF FOUND THEN
        IF v_item.element_key NOT LIKE 'link:%'
           OR v_item.state NOT IN ('pending', 'found', 'not_found')
           OR v_picture.role <> 'product'
           OR v_picture.state NOT IN ('pending', 'found', 'not_found') THEN
          RAISE EXCEPTION 'that picture already belongs to another piece'
            USING ERRCODE = 'check_violation', HINT = 'pin_taken';
        END IF;
        v_has_link_result := jsonb_array_length(v_item.candidates) > 0;
        UPDATE public.board_deck_import_items
        SET state = CASE WHEN v_has_link_result THEN 'found' ELSE state END,
            found_by = CASE WHEN v_has_link_result THEN 'link' ELSE found_by END,
            candidates = CASE WHEN v_has_link_result THEN v_item.candidates ELSE candidates END,
            extracted = extracted || jsonb_build_object('links',
              CASE WHEN jsonb_typeof(extracted->'links') = 'array'
                THEN extracted->'links' ELSE '[]'::jsonb END
              || CASE WHEN jsonb_typeof(v_item.extracted->'links') = 'array'
                THEN v_item.extracted->'links' ELSE '[]'::jsonb END),
            next_attempt_at = NULL,
            lease_owner = NULL,
            lease_until = NULL
        WHERE id = v_picture.id;
        UPDATE public.board_deck_import_items
        SET state = 'merged',
            merged_into_item_id = v_picture.id,
            next_attempt_at = NULL,
            lease_owner = NULL,
            lease_until = NULL
        WHERE id = p_item_id;
        RETURN public._board_deck_import_choose(
          v_picture.id, p_candidate_rank, p_product_id, p_mode, NULL);
      END IF;
    END IF;
    v_item.board_item_id := p_board_item_id;
  END IF;

  IF p_mode = 'swap' AND v_item.state <> 'kept' THEN
    RAISE EXCEPTION 'only a kept piece can be swapped' USING ERRCODE = 'check_violation';
  END IF;

  IF p_product_id IS NOT NULL THEN
    SELECT candidate INTO v_candidate
    FROM jsonb_array_elements(v_item.candidates) AS candidate
    WHERE candidate->>'product_id' = p_product_id::text
    LIMIT 1;
    v_target := p_product_id;
  ELSE
    SELECT candidate INTO v_candidate
    FROM jsonb_array_elements(v_item.candidates) AS candidate
    WHERE candidate->>'rank' = p_candidate_rank::text
    LIMIT 1;
    IF v_candidate IS NULL THEN
      RAISE EXCEPTION 'no candidate at that rank' USING ERRCODE = 'check_violation';
    END IF;
    v_target := NULLIF(v_candidate->>'product_id', '')::uuid;
  END IF;

  v_found_by := CASE v_candidate->>'source'
    WHEN 'link_existing' THEN 'link'
    WHEN 'link' THEN 'link'
    WHEN 'sku' THEN 'words'
    WHEN 'words' THEN 'words'
    WHEN 'look' THEN 'look'
    WHEN 'web' THEN 'web'
    ELSE v_item.found_by
  END;

  IF v_target IS NOT NULL THEN
    -- An existing product: reuse it, if the caller may see it.
    IF NOT public._board_deck_import_product_visible(v_target) THEN
      RAISE EXCEPTION 'product unavailable' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    -- A page the resolver read but no product yet: mint it as the caller.
    v_extracted := v_candidate->'extracted';
    IF jsonb_typeof(v_extracted) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'that candidate has neither a product nor a page'
        USING ERRCODE = 'check_violation';
    END IF;
    v_source_url := NULLIF(btrim(v_extracted->>'source_url'), '');
    IF v_source_url IS NULL OR v_source_url !~* '^https?://' THEN
      RAISE EXCEPTION 'that candidate has no page link to keep'
        USING ERRCODE = 'check_violation';
    END IF;

    -- F3: the keeper is part of the name, so each designer's Keep mints
    -- their own capture and personal product; a repeat by the same designer
    -- still lands on the same one.
    v_client_capture_id := extensions.uuid_generate_v5(
      c_capture_namespace, p_item_id::text || '|' || v_uid::text || '|' || v_source_url
    );

    -- A repeat keep reuses the vendor its first keep chose.
    SELECT product.vendor_id INTO v_vendor_id
    FROM public.proposal_captures AS capture
    JOIN public.products AS product ON product.id = capture.product_id
    WHERE capture.client_capture_id = v_client_capture_id;
    IF NOT FOUND THEN
      v_vendor_id := public._board_deck_import_resolve_vendor(
        v_source_url, v_extracted->>'brand'
      );
    END IF;

    -- R-DI4: a price read from the deck or the page is retail; trade stays empty.
    v_price := v_extracted->>'price_cents';
    IF v_price IS NOT NULL AND v_price !~ '^[0-9]{1,9}$' THEN
      v_price := NULL;
    END IF;

    v_commit := public.commit_proposal_capture(
      v_client_capture_id,
      jsonb_strip_nulls(jsonb_build_object(
        'name', NULLIF(btrim(v_extracted->>'name'), ''),
        'sourceUrl', v_source_url,
        'images', CASE WHEN jsonb_typeof(v_extracted->'images') = 'array'
                    THEN v_extracted->'images' END,
        'thumbnailUrl', CASE WHEN jsonb_typeof(v_extracted->'images') = 'array'
                          THEN v_extracted->'images'->>0 END,
        'priceRetailCents', v_price::integer,
        'vendorId', v_vendor_id,
        'captureSource', 'import',
        'captureProvenance', jsonb_build_object(
          'producer', 'board_deck_import',
          'import_id', v_import_id,
          'item_id', p_item_id,
          'found_by', v_found_by,
          'candidate_source', v_candidate->>'source',
          'band', v_candidate->>'band'
        ),
        'rawPayload', jsonb_build_object(
          'name', v_extracted->>'name',
          'brand', v_extracted->>'brand',
          'price_cents', v_price::integer,
          'source_url', v_source_url,
          'image_url', v_extracted->'images'->>0
        )
      ))
    );
    v_target := NULLIF(v_commit->>'product_id', '')::uuid;
    v_capture_id := NULLIF(v_commit->>'capture_id', '')::uuid;
    IF v_target IS NULL THEN
      RAISE EXCEPTION 'that page could not become a product'
        USING ERRCODE = 'check_violation';
    END IF;
    -- F3: never hand back a product the caller cannot see.
    IF NOT public._board_deck_import_product_visible(v_target) THEN
      RAISE EXCEPTION 'product unavailable' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  v_same := v_item.state = 'kept' AND v_item.chosen_product_id = v_target;
  IF v_item.state = 'kept' AND NOT v_same THEN
    IF p_mode = 'keep' THEN
      RAISE EXCEPTION 'this piece is already kept; swap it instead'
        USING ERRCODE = 'check_violation';
    END IF;
    PERFORM public._board_deck_import_assert_pin_movable(v_item.board_item_id);
  END IF;

  UPDATE public.board_deck_import_items
  SET state = 'kept',
      board_item_id = v_item.board_item_id,
      chosen_product_id = v_target,
      found_by = v_found_by,
      kept_by = CASE WHEN v_same THEN kept_by ELSE v_uid END,
      kept_at = CASE WHEN v_same THEN kept_at ELSE now() END,
      lease_owner = NULL,
      lease_until = NULL
  WHERE id = p_item_id;

  PERFORM public._board_deck_import_settle(v_import_id);

  SELECT product.name,
         product.price_retail,
         product.source_url,
         product.images[1] AS image_url,
         vendor.name AS vendor_name
  INTO v_product
  FROM public.products AS product
  LEFT JOIN public.vendors AS vendor ON vendor.id = product.vendor_id
  WHERE product.id = v_target;

  RETURN jsonb_build_object(
    'item_id', p_item_id,
    'board_item_id', v_item.board_item_id,
    'type', CASE WHEN v_capture_id IS NULL THEN 'product' ELSE 'capture' END,
    'product_id', v_target,
    'capture_id', v_capture_id,
    'data', jsonb_build_object(
      'name', v_product.name,
      'vendor_name', v_product.vendor_name,
      'price_cents', v_product.price_retail,
      'source_url', v_product.source_url,
      'product_image_url', v_product.image_url,
      'deck_import', jsonb_build_object('state', 'kept', 'found_by', v_found_by)
    )
  );
END;
$$;
