-- ═══════════════════════════════════════════════════════════════════════════
-- 00676 — Bring in a Deck: board_deck_imports + board_deck_import_items (US-15 W2)
--
-- A designer drops a .pptx on a board. The browser parses it, lays every
-- slide out as a section, and materializes the pins itself (frozen decision
-- 2: the server never inserts or deletes proposal_board_items, because
-- apply_board_room_state deletes any item missing from a whole-state save).
-- These two tables hold the server side of that import: one row per deck
-- (or per single-pin "Find this piece" job, source_format = 'pin'), and one
-- row per placed picture, with the resolver's candidates and the designer's
-- decision.
--
-- Reads: studio co-members who can manage the board (owner-agnostic, the
-- can_manage_board_item_feedback shape from 00549 lifted to board grain).
-- Writes: only through the SECURITY DEFINER RPCs below. No INSERT, UPDATE or
-- DELETE grant names any client role.
--
-- RPCs
--   register_board_deck_import      designer; idempotent on (board, sha)
--   attach_board_deck_import_pins   designer; each pin must be on the board
--   claim_board_deck_import_items   service_role; SKIP LOCKED + lease
--   record_board_deck_import_resolution  service_role
--   keep_ / swap_ / reference_ / unkeep_board_deck_import_item
--                                   designer; each RETURNS a pin patch and
--                                   never writes proposal_board_items
--
-- Keep mints the product through commit_proposal_capture (00516, the only
-- body; grep confirms no later redefinition) AS THE CALLER — auth.uid() is
-- the request JWT's, unchanged by this function's SECURITY DEFINER. The
-- client_capture_id is uuidv5(<namespace below>, item_id || '|' || page URL):
-- a repeat keep of the same choice reuses the same capture and product, and a
-- swap to a different page mints its own capture instead of silently reusing
-- the first page's product (commit_proposal_capture never re-mints once a
-- capture holds a product). The vendor follows resolveVendor
-- (packages/supabase/src/lib/vendors.ts): website by domain, then exact
-- case-insensitive name, then a stub.
--
-- Links that no picture claimed (manifest deck_links[] and
-- slides[].unpaired_links[]) are kept on the import row (links, ≤500). A link
-- that resolves with no picture is a product item with no pin; Keep takes an
-- optional p_board_item_id to pair a picture, or returns a patch with
-- board_item_id NULL for a new pin the client creates.
--
-- Lineage: new objects only; no function is redefined.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Tables ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.board_deck_imports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id       uuid NOT NULL REFERENCES public.proposal_boards(id) ON DELETE CASCADE,
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_format  text NOT NULL DEFAULT 'deck'
                   CHECK (source_format IN ('deck', 'pin')),
  -- A 'pin' job ("Find this piece", W4a) has no file and is keyed by its pin.
  board_item_id  uuid REFERENCES public.proposal_board_items(id) ON DELETE CASCADE,
  file_name      text,
  file_sha256    text,
  slide_count    integer NOT NULL DEFAULT 0 CHECK (slide_count BETWEEN 0 AND 2000),
  options        jsonb NOT NULL DEFAULT '{}'::jsonb
                   CHECK (jsonb_typeof(options) = 'object'),
  -- Links read off the deck that no picture claimed:
  -- { deck_links: [link], slide_links: [{ slide_index, unpaired_links: [link] }] },
  -- link = { url, text_context, source }, at most 500 in all.
  links          jsonb NOT NULL DEFAULT '{}'::jsonb
                   CHECK (jsonb_typeof(links) = 'object'),
  status        text NOT NULL DEFAULT 'laying_out'
                   CHECK (status IN ('laying_out', 'resolving', 'ready', 'failed', 'abandoned')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  CONSTRAINT board_deck_imports_source_shape CHECK (
    (source_format = 'deck'
      AND file_sha256 ~ '^[0-9a-f]{64}$'
      AND file_name IS NOT NULL AND length(file_name) BETWEEN 1 AND 255
      AND board_item_id IS NULL)
    OR
    (source_format = 'pin'
      AND file_sha256 IS NULL AND file_name IS NULL
      AND board_item_id IS NOT NULL)
  ),
  -- Re-dropping the same deck on the same board resumes it.
  CONSTRAINT board_deck_imports_board_sha_key UNIQUE (board_id, file_sha256)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_board_deck_imports_pin
  ON public.board_deck_imports(board_item_id)
  WHERE source_format = 'pin';

COMMENT ON TABLE public.board_deck_imports IS
  'One deck brought onto a board (source_format deck, keyed by file sha-256) or one '
  'single-pin "Find this piece" job (source_format pin, keyed by board_item_id). The '
  'source deck itself is never stored (R-DI6). Writes only through the 00676 RPCs.';

CREATE TABLE IF NOT EXISTS public.board_deck_import_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id          uuid NOT NULL REFERENCES public.board_deck_imports(id) ON DELETE CASCADE,
  element_key        text NOT NULL CHECK (length(element_key) BETWEEN 1 AND 200),
  board_item_id      uuid REFERENCES public.proposal_board_items(id) ON DELETE SET NULL,
  slide_index        integer NOT NULL DEFAULT 0 CHECK (slide_index >= 0),
  slide_title        text CHECK (slide_title IS NULL OR length(slide_title) <= 500),
  role               text NOT NULL CHECK (role IN ('product', 'reference')),
  extracted          jsonb NOT NULL DEFAULT '{}'::jsonb
                       CHECK (jsonb_typeof(extracted) = 'object'),
  state              text NOT NULL DEFAULT 'pending'
                       CHECK (state IN ('pending', 'found', 'not_found', 'kept', 'reference', 'removed')),
  found_by           text CHECK (found_by IS NULL OR found_by IN ('link', 'words', 'look', 'web')),
  -- Contract shape: [{source, product_id?, extracted?, band, rank, evidence}], at most 5.
  -- Candidates live here, not in pin data, because of the 256KB pin data cap.
  candidates         jsonb NOT NULL DEFAULT '[]'::jsonb,
  chosen_product_id  uuid REFERENCES public.products(id) ON DELETE SET NULL,
  attempts           integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at    timestamptz,
  lease_owner        text,
  lease_until        timestamptz,
  kept_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kept_at            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT board_deck_import_items_element_key UNIQUE (import_id, element_key),
  CONSTRAINT board_deck_import_items_candidates_max5 CHECK (
    CASE WHEN jsonb_typeof(candidates) = 'array'
      THEN jsonb_array_length(candidates) <= 5
      ELSE false
    END
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_board_deck_import_items_pin
  ON public.board_deck_import_items(import_id, board_item_id)
  WHERE board_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_board_deck_import_items_board_item
  ON public.board_deck_import_items(board_item_id)
  WHERE board_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_board_deck_import_items_claimable
  ON public.board_deck_import_items(next_attempt_at NULLS FIRST)
  WHERE state = 'pending';

DROP TRIGGER IF EXISTS trg_board_deck_import_items_updated_at
  ON public.board_deck_import_items;
CREATE TRIGGER trg_board_deck_import_items_updated_at
  BEFORE UPDATE ON public.board_deck_import_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.board_deck_import_items IS
  'One placed picture from a brought-in deck: where its pin is, what the slide said '
  '(extracted), what the resolver found (candidates, at most 5) and what the designer '
  'decided (state, chosen_product_id). Every result stays unconfirmed until Keep.';

-- ── 2. Board authority + RLS ────────────────────────────────────────────────

-- The 00549 can_manage_board_item_feedback rule at board grain: a studio
-- co-member of the board owner's designer, whichever document owns the board.
CREATE OR REPLACE FUNCTION public.can_manage_board_deck_import(p_board_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_board_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.proposal_boards AS board
      LEFT JOIN public.proposals AS proposal ON proposal.id = board.proposal_id
      LEFT JOIN public.projects AS project ON project.id = board.project_id
      WHERE board.id = p_board_id
        AND public.is_design_studio_comember(
          COALESCE(proposal.designer_id, project.designer_id)
        )
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_board_deck_import(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_board_deck_import(uuid)
  TO authenticated;

ALTER TABLE public.board_deck_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_deck_import_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_deck_imports_manager_read ON public.board_deck_imports;
CREATE POLICY board_deck_imports_manager_read
  ON public.board_deck_imports FOR SELECT TO authenticated
  USING (public.can_manage_board_deck_import(board_id));

DROP POLICY IF EXISTS board_deck_import_items_manager_read ON public.board_deck_import_items;
CREATE POLICY board_deck_import_items_manager_read
  ON public.board_deck_import_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.board_deck_imports AS deck_import
      WHERE deck_import.id = board_deck_import_items.import_id
        AND public.can_manage_board_deck_import(deck_import.board_id)
    )
  );

REVOKE ALL ON TABLE public.board_deck_imports FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.board_deck_import_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.board_deck_imports TO authenticated, service_role;
GRANT SELECT ON TABLE public.board_deck_import_items TO authenticated, service_role;

-- ── 3. Internal helpers (owner-only) ────────────────────────────────────────

-- An import with nothing left to resolve is ready.
CREATE OR REPLACE FUNCTION public._board_deck_import_settle(p_import_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.board_deck_imports AS deck_import
  SET status = 'ready', finished_at = now()
  WHERE deck_import.id = p_import_id
    AND deck_import.status = 'resolving'
    AND NOT EXISTS (
      SELECT 1 FROM public.board_deck_import_items AS item
      WHERE item.import_id = p_import_id AND item.state = 'pending'
    );
$$;

-- The 00152 products SELECT policies, evaluated for the caller.
CREATE OR REPLACE FUNCTION public._board_deck_import_product_visible(p_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.products AS product
    WHERE product.id = p_product_id
      AND (
        product.layer = 'catalog'
        OR (product.layer = 'personal' AND product.owner_user_id = auth.uid())
        OR (
          product.layer = 'studio'
          AND product.studio_id IN (
            SELECT membership.organization_id
            FROM public.organization_members AS membership
            WHERE membership.user_id = auth.uid()
              AND membership.status = 'active'
          )
        )
      )
  );
$$;

-- SQL port of resolveVendor (packages/supabase/src/lib/vendors.ts):
-- 1. website ILIKE %domain% (domain = host, lowercased, leading www. dropped),
--    oldest first; 2. exact case-insensitive name; 3. insert a stub named
--    name → domain → 'Unknown vendor', website https://<domain>.
CREATE OR REPLACE FUNCTION public._board_deck_import_resolve_vendor(
  p_url text,
  p_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_domain text;
  v_name text := NULLIF(btrim(p_name), '');
  v_id uuid;
BEGIN
  v_domain := lower(substring(
    COALESCE(p_url, '')
    FROM '^[A-Za-z][A-Za-z0-9+.-]*://(?:[^/?#@]*@)?([^/?#:]+)'
  ));
  v_domain := NULLIF(regexp_replace(COALESCE(v_domain, ''), '^www\.', ''), '');

  IF v_domain IS NOT NULL THEN
    SELECT vendor.id INTO v_id
    FROM public.vendors AS vendor
    WHERE vendor.website ILIKE '%'
      || replace(replace(replace(v_domain, '\', '\\'), '%', '\%'), '_', '\_')
      || '%'
    ORDER BY vendor.created_at ASC NULLS LAST, vendor.id
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  IF v_name IS NOT NULL THEN
    SELECT vendor.id INTO v_id
    FROM public.vendors AS vendor
    WHERE lower(vendor.name) = lower(v_name)
    ORDER BY vendor.created_at ASC NULLS LAST, vendor.id
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  INSERT INTO public.vendors (name, website)
  VALUES (
    COALESCE(v_name, v_domain, 'Unknown vendor'),
    CASE WHEN v_domain IS NOT NULL THEN 'https://' || v_domain END
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Unkeep, swap and reference refuse once the pin has gone onward.
-- HINT carries the machine reason: 'promoted' or 'on_schedule'.
CREATE OR REPLACE FUNCTION public._board_deck_import_assert_pin_movable(p_board_item_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ffe_item_id uuid;
  v_data jsonb;
BEGIN
  IF p_board_item_id IS NULL THEN
    RETURN;
  END IF;
  SELECT item.project_ffe_item_id, item.data
  INTO v_ffe_item_id, v_data
  FROM public.proposal_board_items AS item
  WHERE item.id = p_board_item_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF v_ffe_item_id IS NOT NULL
     OR NULLIF(v_data->>'project_ffe_item_id', '') IS NOT NULL THEN
    RAISE EXCEPTION 'this piece is already promoted to the project'
      USING ERRCODE = 'check_violation', HINT = 'promoted';
  END IF;
  IF NULLIF(v_data->>'proposalItemId', '') IS NOT NULL THEN
    RAISE EXCEPTION 'this piece is already on the schedule'
      USING ERRCODE = 'check_violation', HINT = 'on_schedule';
  END IF;
END;
$$;

-- Lock an item and require board authority. Not-found and not-allowed share
-- one message so an item id never leaks across studios.
CREATE OR REPLACE FUNCTION public._board_deck_import_lock_item(p_item_id uuid)
RETURNS public.board_deck_import_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item public.board_deck_import_items%ROWTYPE;
  v_board_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_item
  FROM public.board_deck_import_items
  WHERE id = p_item_id
  FOR UPDATE;
  IF FOUND THEN
    SELECT board_id INTO v_board_id
    FROM public.board_deck_imports WHERE id = v_item.import_id;
  END IF;
  IF NOT FOUND OR NOT public.can_manage_board_deck_import(v_board_id) THEN
    RAISE EXCEPTION 'deck import piece unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN v_item;
END;
$$;

-- The pin a slide link points at while a piece waits to be confirmed.
CREATE OR REPLACE FUNCTION public._board_deck_import_slide_link(p_extracted jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN jsonb_typeof(p_extracted->'links') = 'array'
      AND (p_extracted->'links'->0->>'url') ~* '^https?://'
    THEN p_extracted->'links'->0->>'url'
  END;
$$;

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

    v_client_capture_id := extensions.uuid_generate_v5(
      c_capture_namespace, p_item_id::text || '|' || v_source_url
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

REVOKE ALL ON FUNCTION public._board_deck_import_settle(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._board_deck_import_product_visible(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._board_deck_import_resolve_vendor(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._board_deck_import_assert_pin_movable(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._board_deck_import_lock_item(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._board_deck_import_slide_link(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._board_deck_import_choose(uuid, integer, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ── 4. Register + attach (designer) ─────────────────────────────────────────

-- Unpaired links from the manifest, normalized and capped at 500 in all
-- (deck-level links first, then slides in order). A malformed link is
-- dropped rather than failing the deck.
CREATE OR REPLACE FUNCTION public._board_deck_import_manifest_links(p_manifest jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  WITH raw AS (
    SELECT -1 AS slide_index, 0 AS slide_ord, link.ord, link.value AS link
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_manifest->'deck_links') = 'array'
        THEN p_manifest->'deck_links' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS link(value, ord)
    UNION ALL
    SELECT CASE WHEN (slide.value->>'slide_index') ~ '^[0-9]{1,4}$'
             THEN (slide.value->>'slide_index')::integer
             ELSE (slide.ord - 1)::integer END,
           slide.ord, link.ord, link.value
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_manifest->'slides') = 'array'
        THEN p_manifest->'slides' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS slide(value, ord)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(slide.value) = 'object'
             AND jsonb_typeof(slide.value->'unpaired_links') = 'array'
        THEN slide.value->'unpaired_links' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS link(value, ord)
  ),
  kept AS (
    SELECT slide_index, slide_ord, ord,
           jsonb_strip_nulls(jsonb_build_object(
             'url', left(link->>'url', 2048),
             'text_context', left(link->>'text_context', 500),
             'source', CASE WHEN link->>'source' IN ('text', 'notes', 'legend', 'overlay', 'pasted')
                         THEN link->>'source' END
           )) AS link
    FROM raw
    WHERE jsonb_typeof(link) = 'object'
      AND (link->>'url') ~* '^https?://'
    ORDER BY slide_ord, ord
    LIMIT 500
  )
  SELECT jsonb_build_object(
    'deck_links', COALESCE((
      SELECT jsonb_agg(link ORDER BY ord) FROM kept WHERE slide_ord = 0
    ), '[]'::jsonb),
    'slide_links', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('slide_index', slide_index, 'unpaired_links', links)
                       ORDER BY slide_ord)
      FROM (
        SELECT slide_index, slide_ord, jsonb_agg(link ORDER BY ord) AS links
        FROM kept WHERE slide_ord > 0
        GROUP BY slide_index, slide_ord
      ) AS per_slide
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public._board_deck_import_manifest_links(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- p_manifest: { slide_count?, options?, items: [{ element_key, slide_index,
--   slide_title?, role: 'product'|'reference', extracted? }],
--   deck_links?: [link], slides?: [{ slide_index?, unpaired_links?: [link] }] }
-- A product item may carry no picture (a link that resolved with nothing to
-- pair): it simply never gets a pin attached, and Keep can attach one later.
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.can_manage_board_deck_import(p_board_id) THEN
    RAISE EXCEPTION 'board unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_sha !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'file_sha256 must be a hex sha-256' USING ERRCODE = 'check_violation';
  END IF;
  IF v_file_name IS NULL OR length(v_file_name) > 255 THEN
    RAISE EXCEPTION 'file_name must be 1 to 255 characters' USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_typeof(v_manifest) <> 'object' THEN
    RAISE EXCEPTION 'manifest must be an object' USING ERRCODE = 'check_violation';
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

-- p_pins: [{ element_key, board_item_id }]. Every pin must be on the import's board.
CREATE OR REPLACE FUNCTION public.attach_board_deck_import_pins(
  p_import_id uuid,
  p_pins jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_board_id uuid;
  v_pin jsonb;
  v_key text;
  v_board_item_id uuid;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT board_id INTO v_board_id
  FROM public.board_deck_imports
  WHERE id = p_import_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public.can_manage_board_deck_import(v_board_id) THEN
    RAISE EXCEPTION 'deck import unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(COALESCE(p_pins, 'null'::jsonb)) <> 'array'
     OR jsonb_array_length(p_pins) > 2000 THEN
    RAISE EXCEPTION 'pins must be an array of at most 2000' USING ERRCODE = 'check_violation';
  END IF;

  FOR v_pin IN SELECT value FROM jsonb_array_elements(p_pins) LOOP
    v_key := btrim(COALESCE(v_pin->>'element_key', ''));
    IF jsonb_typeof(v_pin) <> 'object' OR v_key = ''
       OR COALESCE(v_pin->>'board_item_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'invalid pin' USING ERRCODE = 'check_violation',
        DETAIL = left(v_pin::text, 200);
    END IF;
    v_board_item_id := (v_pin->>'board_item_id')::uuid;

    IF NOT EXISTS (
      SELECT 1 FROM public.proposal_board_items
      WHERE id = v_board_item_id AND board_id = v_board_id
    ) THEN
      RAISE EXCEPTION 'board item belongs to another board'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    UPDATE public.board_deck_import_items
    SET board_item_id = v_board_item_id
    WHERE import_id = p_import_id AND element_key = v_key;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'unknown element_key' USING ERRCODE = 'check_violation',
        DETAIL = left(v_key, 200);
    END IF;
    v_count := v_count + 1;
  END LOOP;

  -- Pins on the board means layout has landed: resolution can start.
  UPDATE public.board_deck_imports
  SET status = 'resolving'
  WHERE id = p_import_id AND status = 'laying_out';
  PERFORM public._board_deck_import_settle(p_import_id);

  RETURN jsonb_build_object(
    'import_id', p_import_id,
    'attached', v_count,
    'status', (SELECT status FROM public.board_deck_imports WHERE id = p_import_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_board_deck_import(uuid, text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_board_deck_import(uuid, text, text, jsonb)
  TO authenticated;
REVOKE ALL ON FUNCTION public.attach_board_deck_import_pins(uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_board_deck_import_pins(uuid, jsonb)
  TO authenticated;

-- ── 5. Claim + record (service_role resolver) ───────────────────────────────

-- Hands out up to p_limit (1..50) pending pieces under a 3-minute lease.
-- Stale leases expire first; a piece that has used 5 attempts settles as
-- not_found instead of going round again.
CREATE OR REPLACE FUNCTION public.claim_board_deck_import_items(p_limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_max_attempts constant integer := 5;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
  v_owner text := gen_random_uuid()::text;
  v_until timestamptz := now() + interval '3 minutes';
  v_import_id uuid;
  v_expired_imports uuid[];
  v_items jsonb;
BEGIN
  WITH expired AS (
    UPDATE public.board_deck_import_items
    SET lease_owner = NULL,
        lease_until = NULL,
        state = CASE WHEN attempts >= c_max_attempts THEN 'not_found' ELSE state END
    WHERE state = 'pending'
      AND lease_until IS NOT NULL
      AND lease_until <= now()
    RETURNING import_id
  )
  SELECT COALESCE(array_agg(DISTINCT import_id), '{}'::uuid[])
  INTO v_expired_imports
  FROM expired;
  FOREACH v_import_id IN ARRAY v_expired_imports LOOP
    PERFORM public._board_deck_import_settle(v_import_id);
  END LOOP;

  WITH picked AS (
    SELECT item.id
    FROM public.board_deck_import_items AS item
    JOIN public.board_deck_imports AS deck_import ON deck_import.id = item.import_id
    WHERE item.state = 'pending'
      AND deck_import.status = 'resolving'
      AND item.attempts < c_max_attempts
      AND (item.lease_until IS NULL OR item.lease_until <= now())
      AND (item.next_attempt_at IS NULL OR item.next_attempt_at <= now())
    ORDER BY item.next_attempt_at NULLS FIRST, deck_import.created_at, item.slide_index, item.element_key
    LIMIT v_limit
    FOR UPDATE OF item SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.board_deck_import_items AS item
    SET lease_owner = v_owner,
        lease_until = v_until,
        attempts = item.attempts + 1
    FROM picked
    WHERE item.id = picked.id
    RETURNING item.*
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'item_id', claimed.id,
      'import_id', claimed.import_id,
      'board_id', deck_import.board_id,
      'created_by', deck_import.created_by,
      'source_format', deck_import.source_format,
      'element_key', claimed.element_key,
      'board_item_id', claimed.board_item_id,
      'slide_index', claimed.slide_index,
      'slide_title', claimed.slide_title,
      'role', claimed.role,
      'extracted', claimed.extracted,
      'candidates', claimed.candidates,
      'attempts', claimed.attempts
    )
    ORDER BY deck_import.created_at, claimed.slide_index, claimed.element_key
  ), '[]'::jsonb)
  INTO v_items
  FROM claimed
  JOIN public.board_deck_imports AS deck_import ON deck_import.id = claimed.import_id;

  RETURN jsonb_build_object(
    'lease_owner', v_owner,
    'lease_until', v_until,
    'items', v_items
  );
END;
$$;

-- p_state: 'found' | 'not_found' | 'pending' (retry later with backoff).
-- A piece the designer already decided (kept, reference, removed) is left
-- alone: a late resolver result never overwrites her decision.
CREATE OR REPLACE FUNCTION public.record_board_deck_import_resolution(
  p_item_id uuid,
  p_state text,
  p_found_by text DEFAULT NULL,
  p_candidates jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_max_attempts constant integer := 5;
  v_candidates jsonb := COALESCE(p_candidates, '[]'::jsonb);
  v_candidate jsonb;
  v_item public.board_deck_import_items%ROWTYPE;
  v_state text := p_state;
BEGIN
  IF p_state IS NULL OR p_state NOT IN ('found', 'not_found', 'pending') THEN
    RAISE EXCEPTION 'state must be found, not_found or pending' USING ERRCODE = 'check_violation';
  END IF;
  IF p_found_by IS NOT NULL AND p_found_by NOT IN ('link', 'words', 'look', 'web') THEN
    RAISE EXCEPTION 'found_by must be link, words, look or web' USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_typeof(v_candidates) <> 'array' OR jsonb_array_length(v_candidates) > 5 THEN
    RAISE EXCEPTION 'candidates must be an array of at most 5' USING ERRCODE = 'check_violation';
  END IF;
  IF octet_length(v_candidates::text) > 65536 THEN
    RAISE EXCEPTION 'candidates are too large' USING ERRCODE = 'check_violation';
  END IF;
  FOR v_candidate IN SELECT value FROM jsonb_array_elements(v_candidates) LOOP
    IF jsonb_typeof(v_candidate) <> 'object'
       OR COALESCE(v_candidate->>'source', '') NOT IN ('link_existing', 'link', 'sku', 'words', 'look', 'web')
       OR COALESCE(v_candidate->>'band', '') NOT IN ('strong', 'likely', 'possible')
       OR COALESCE(v_candidate->>'rank', '') !~ '^[1-9][0-9]?$'
       OR (
         (COALESCE(v_candidate->>'product_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
         = COALESCE(jsonb_typeof(v_candidate->'extracted') = 'object', false)
       ) THEN
      RAISE EXCEPTION 'invalid candidate' USING ERRCODE = 'check_violation',
        DETAIL = left(v_candidate::text, 200);
    END IF;
  END LOOP;
  IF p_state = 'found' AND (p_found_by IS NULL OR jsonb_array_length(v_candidates) = 0) THEN
    RAISE EXCEPTION 'a found piece needs found_by and at least one candidate'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_item
  FROM public.board_deck_import_items
  WHERE id = p_item_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deck import piece not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_item.state NOT IN ('pending', 'found', 'not_found') THEN
    RETURN jsonb_build_object(
      'item_id', p_item_id, 'import_id', v_item.import_id,
      'state', v_item.state, 'applied', false
    );
  END IF;

  IF v_state = 'pending' AND v_item.attempts >= c_max_attempts THEN
    v_state := 'not_found';
  END IF;

  UPDATE public.board_deck_import_items
  SET state = v_state,
      found_by = CASE WHEN v_state = 'found' THEN p_found_by END,
      candidates = CASE WHEN v_state = 'found' THEN v_candidates ELSE '[]'::jsonb END,
      next_attempt_at = CASE
        WHEN v_state = 'pending'
          THEN now() + make_interval(mins => LEAST(power(2, v_item.attempts)::integer, 60))
      END,
      lease_owner = NULL,
      lease_until = NULL
  WHERE id = p_item_id;

  PERFORM public._board_deck_import_settle(v_item.import_id);

  RETURN jsonb_build_object(
    'item_id', p_item_id, 'import_id', v_item.import_id,
    'state', v_state, 'applied', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_board_deck_import_items(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_board_deck_import_items(integer)
  TO service_role;
REVOKE ALL ON FUNCTION public.record_board_deck_import_resolution(uuid, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_board_deck_import_resolution(uuid, text, text, jsonb)
  TO service_role;

-- ── 6. Keep / swap / reference / unkeep (designer; return pin patches) ──────

CREATE OR REPLACE FUNCTION public.keep_board_deck_import_item(
  p_item_id uuid,
  p_candidate_rank integer DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  -- Optional: the picture to pair with a piece that has none yet. NULL keeps
  -- it without a picture; the patch then has board_item_id NULL and the
  -- client creates a new product pin.
  p_board_item_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public._board_deck_import_choose(
    p_item_id, p_candidate_rank, p_product_id, 'keep', p_board_item_id
  );
$$;

CREATE OR REPLACE FUNCTION public.swap_board_deck_import_item(
  p_item_id uuid,
  p_candidate_rank integer DEFAULT NULL,
  p_product_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public._board_deck_import_choose(p_item_id, p_candidate_rank, p_product_id, 'swap');
$$;

-- "Keep as reference": the pin stays her picture, with no product behind it.
CREATE OR REPLACE FUNCTION public.reference_board_deck_import_item(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item public.board_deck_import_items%ROWTYPE;
BEGIN
  v_item := public._board_deck_import_lock_item(p_item_id);
  IF v_item.state = 'removed' THEN
    RAISE EXCEPTION 'this piece was removed from the board' USING ERRCODE = 'check_violation';
  END IF;
  IF v_item.state = 'kept' THEN
    PERFORM public._board_deck_import_assert_pin_movable(v_item.board_item_id);
  END IF;

  IF v_item.state <> 'reference' THEN
    UPDATE public.board_deck_import_items
    SET state = 'reference',
        chosen_product_id = NULL,
        kept_by = auth.uid(),
        kept_at = now(),
        lease_owner = NULL,
        lease_until = NULL
    WHERE id = p_item_id;
    PERFORM public._board_deck_import_settle(v_item.import_id);
  END IF;

  RETURN jsonb_build_object(
    'item_id', p_item_id,
    'board_item_id', v_item.board_item_id,
    'type', 'image',
    'product_id', NULL,
    'capture_id', NULL,
    'data', jsonb_build_object(
      'provenance', 'imported_deck',
      'name', NULL,
      'vendor_name', NULL,
      'price_cents', NULL,
      'source_url', public._board_deck_import_slide_link(v_item.extracted),
      'product_image_url', NULL,
      'deck_import', jsonb_build_object('state', 'reference', 'found_by', v_item.found_by)
    )
  );
END;
$$;

-- Undo a keep (or a keep-as-reference): the pin goes back to "to confirm".
-- Refuses once the pin is promoted or on the schedule (HINT carries why).
CREATE OR REPLACE FUNCTION public.unkeep_board_deck_import_item(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item public.board_deck_import_items%ROWTYPE;
  v_state text;
BEGIN
  v_item := public._board_deck_import_lock_item(p_item_id);
  IF v_item.state = 'removed' THEN
    RAISE EXCEPTION 'this piece was removed from the board' USING ERRCODE = 'check_violation';
  END IF;

  IF v_item.state IN ('kept', 'reference') THEN
    IF v_item.state = 'kept' THEN
      PERFORM public._board_deck_import_assert_pin_movable(v_item.board_item_id);
    END IF;
    v_state := CASE
      WHEN jsonb_array_length(v_item.candidates) > 0 THEN 'found'
      WHEN v_item.attempts > 0 THEN 'not_found'
      ELSE 'pending'
    END;
    UPDATE public.board_deck_import_items
    SET state = v_state,
        chosen_product_id = NULL,
        kept_by = NULL,
        kept_at = NULL
    WHERE id = p_item_id;
    IF v_state = 'pending' THEN
      UPDATE public.board_deck_imports
      SET status = 'resolving', finished_at = NULL
      WHERE id = v_item.import_id AND status = 'ready';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'item_id', p_item_id,
    'board_item_id', v_item.board_item_id,
    'type', 'capture',
    'product_id', NULL,
    'capture_id', NULL,
    'data', jsonb_build_object(
      'provenance', 'imported_deck',
      'name', NULL,
      'vendor_name', NULL,
      'price_cents', NULL,
      'source_url', public._board_deck_import_slide_link(v_item.extracted),
      'product_image_url', NULL,
      'deck_import', jsonb_build_object('state', 'to_confirm', 'found_by', v_item.found_by)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.keep_board_deck_import_item(uuid, integer, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.keep_board_deck_import_item(uuid, integer, uuid, uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public.swap_board_deck_import_item(uuid, integer, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.swap_board_deck_import_item(uuid, integer, uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public.reference_board_deck_import_item(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reference_board_deck_import_item(uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public.unkeep_board_deck_import_item(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unkeep_board_deck_import_item(uuid)
  TO authenticated;
