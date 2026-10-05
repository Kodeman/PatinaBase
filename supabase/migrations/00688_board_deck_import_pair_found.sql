-- ═══════════════════════════════════════════════════════════════════════════
-- 00688 — Board deck import: a link pairs onto a picture already found by
--         words or look (US-15, SQ-384; found by the SQ-364 e2e)
--
-- Symptom: a product link that sits only in the speaker notes (or bare in
-- slide text) became its own notes-only piece, competing with the slide's
-- picture. The picture had already been settled by its caption (words), and
-- the pairing RPCs only took a picture still 'pending' or 'not_found', so the
-- link could never join it. "Which picture?" on the notes-only row then
-- offered that picture and Keep refused it (pin_taken).
--
-- Now a picture is pairable while it is undecided:
--   'pending' / 'not_found', as before, or
--   'found' and still unkept: no chosen product, and found by words, look or
--   web (a picture already found by a link keeps that link).
-- Kept, reference, removed and merged pieces are never pairable: the pair
-- returns false and changes nothing.
--
-- The link outranks words without lowering anything: the picture's own
-- candidates stay, after the link's, deduplicated by product or page and
-- ordered by band, then by source (link_existing, sku, link, words, look,
-- web), at most five. found_by follows the top candidate. A pair with no
-- link candidate is refused, so a link that did not resolve never displaces
-- the words or look result.
--
-- board_deck_import_pairable_pictures also returns each picture's state, its
-- caption fields (the resolver's name match) and how many product pictures
-- its slide holds (the resolver's single-picture rule).
--
-- Lineage:
--   board_deck_import_pairable_pictures   00677 → 00688
--   pair_board_deck_import_link           00677 → 00678 → 00687 → 00688
-- 00687's lock order is kept: import row FOR UPDATE, then the link piece,
-- then the picture piece. Re-running a pair is a no-op: the link row is gone.
-- No GRANT/REVOKE change: CREATE OR REPLACE keeps the existing ACLs.
-- ═══════════════════════════════════════════════════════════════════════════

-- Pictures that a link could still be paired to: product pieces with a pin,
-- no link of their own, undecided (see the header), and not leased by
-- another run.
CREATE OR REPLACE FUNCTION public.board_deck_import_pairable_pictures(p_import_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'item_id', item.id,
    'slide_index', item.slide_index,
    'image_url', COALESCE(pin.image_url, pin.data->>'image_url'),
    'state', item.state,
    'caption', jsonb_strip_nulls(jsonb_build_object(
      'caption', item.extracted->'caption',
      'name', item.extracted->'name',
      'title', item.extracted->'title',
      'alt_text', item.extracted->'alt_text',
      'alt_auto', item.extracted->'alt_auto'
    )),
    'slide_pictures', (
      SELECT count(*)
      FROM public.board_deck_import_items AS other
      WHERE other.import_id = item.import_id
        AND other.slide_index = item.slide_index
        AND other.role = 'product'
        AND other.board_item_id IS NOT NULL
    )
  ) ORDER BY item.slide_index, item.element_key), '[]'::jsonb)
  FROM (
    SELECT item.*
    FROM public.board_deck_import_items AS item
    WHERE item.import_id = p_import_id
      AND item.role = 'product'
      AND item.board_item_id IS NOT NULL
      AND (
        item.state IN ('pending', 'not_found')
        OR (item.state = 'found' AND item.chosen_product_id IS NULL
            AND item.found_by IS DISTINCT FROM 'link')
      )
      AND (item.lease_until IS NULL OR item.lease_until <= now())
      AND public._board_deck_import_slide_link(item.extracted) IS NULL
    ORDER BY item.slide_index, item.element_key
    LIMIT 40
  ) AS item
  JOIN public.proposal_board_items AS pin ON pin.id = item.board_item_id
  WHERE COALESCE(pin.image_url, pin.data->>'image_url') IS NOT NULL;
$$;

-- The picture takes the link's candidates ahead of its own
-- (_board_deck_import_record validates them) and the synthetic link row is
-- deleted. False when either side is no longer eligible (decided, leased, or
-- already paired) or the link brings no candidate.
CREATE OR REPLACE FUNCTION public.pair_board_deck_import_link(
  p_link_item_id uuid,
  p_picture_item_id uuid,
  p_candidates jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link public.board_deck_import_items%ROWTYPE;
  v_picture public.board_deck_import_items%ROWTYPE;
  v_import_id uuid;
  v_merged jsonb;
  v_found_by text;
BEGIN
  IF jsonb_typeof(p_candidates) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'candidates must be an array' USING ERRCODE = 'check_violation';
  END IF;

  -- 00687: the link's import row first, then the two pieces.
  SELECT import_id INTO v_import_id
  FROM public.board_deck_import_items
  WHERE id = p_link_item_id;
  IF v_import_id IS NOT NULL THEN
    PERFORM 1 FROM public.board_deck_imports WHERE id = v_import_id FOR UPDATE;
  END IF;

  SELECT * INTO v_link FROM public.board_deck_import_items
  WHERE id = p_link_item_id FOR UPDATE;
  SELECT * INTO v_picture FROM public.board_deck_import_items
  WHERE id = p_picture_item_id FOR UPDATE;
  IF v_link.id IS NULL OR v_picture.id IS NULL
     OR v_link.import_id <> v_picture.import_id
     OR v_link.element_key NOT LIKE 'link:%'
     OR v_link.board_item_id IS NOT NULL
     OR v_link.state NOT IN ('pending', 'found', 'not_found')
     OR (v_link.lease_until IS NOT NULL AND v_link.lease_until > now())
     OR v_picture.board_item_id IS NULL
     OR v_picture.role <> 'product'
     -- 00688: an unkept 'found' picture (words, look or web) is pairable too.
     OR NOT (
       v_picture.state IN ('pending', 'not_found')
       OR (v_picture.state = 'found' AND v_picture.chosen_product_id IS NULL
           AND v_picture.found_by IS DISTINCT FROM 'link')
     )
     OR (v_picture.lease_until IS NOT NULL AND v_picture.lease_until > now())
     -- 00688: a link that did not resolve never displaces the picture's result.
     OR jsonb_array_length(p_candidates) = 0 THEN
    RETURN false;
  END IF;

  -- 00688: the link's candidates, then the picture's own; one per product or
  -- page (its best), by band then source, at most five, ranked 1..n.
  WITH entries AS (
    SELECT entry.value AS candidate, entry.ord
    FROM jsonb_array_elements(p_candidates) WITH ORDINALITY AS entry(value, ord)
    UNION ALL
    SELECT entry.value, 1000 + entry.ord
    FROM jsonb_array_elements(
      CASE WHEN v_picture.state = 'found' AND jsonb_typeof(v_picture.candidates) = 'array'
        THEN v_picture.candidates ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS entry(value, ord)
  ),
  ordered AS (
    SELECT candidate, ord,
      COALESCE(
        'p:' || NULLIF(candidate->>'product_id', ''),
        'u:' || NULLIF(candidate->'extracted'->>'source_url', ''),
        'o:' || ord::text
      ) AS dedupe_key,
      CASE candidate->>'band' WHEN 'strong' THEN 0 WHEN 'likely' THEN 1 ELSE 2 END AS band_ord,
      CASE candidate->>'source'
        WHEN 'link_existing' THEN 0 WHEN 'sku' THEN 1 WHEN 'link' THEN 2
        WHEN 'words' THEN 3 WHEN 'look' THEN 4 ELSE 5 END AS source_ord
    FROM entries
  ),
  best AS (
    SELECT DISTINCT ON (dedupe_key) candidate, ord, band_ord, source_ord
    FROM ordered
    ORDER BY dedupe_key, band_ord, source_ord, ord
  ),
  kept AS (
    SELECT candidate, row_number() OVER (ORDER BY band_ord, source_ord, ord) AS rank
    FROM best
    ORDER BY band_ord, source_ord, ord
    LIMIT 5
  )
  SELECT jsonb_agg(candidate || jsonb_build_object('rank', rank) ORDER BY rank)
  INTO v_merged
  FROM kept;

  v_found_by := CASE v_merged->0->>'source'
    WHEN 'link_existing' THEN 'link'
    WHEN 'link' THEN 'link'
    WHEN 'look' THEN 'look'
    WHEN 'web' THEN 'web'
    ELSE 'words'
  END;

  PERFORM public._board_deck_import_record(
    p_picture_item_id, 'found', v_found_by, v_merged, NULL);
  DELETE FROM public.board_deck_import_items WHERE id = p_link_item_id;
  PERFORM public._board_deck_import_settle(v_link.import_id);
  RETURN true;
END;
$$;
