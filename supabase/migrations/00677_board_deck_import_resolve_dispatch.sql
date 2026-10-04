-- ═══════════════════════════════════════════════════════════════════════════
-- 00677 — Bring in a Deck: resolver dispatch, link quota and visibility-safe
--         matching (US-15 W3, SQ-358)
--
-- The board-deck-import-resolve edge function resolves the pieces 00676
-- registered. This migration gives it:
--   • a link quota, separate from the paste quota (which is unchanged):
--     ≤300 links per import and ≤1500 per studio per UTC day
--     (consume_board_deck_import_link_quota);
--   • matching helpers that apply the 00152 products visibility rules for the
--     IMPORTING user (import.created_by), because the cron path runs as
--     service_role and must never see another studio's library:
--       board_deck_import_match_links    T0a: normalized source_url
--       board_deck_import_match_sku      T0c: vendor_sku + vendor name
--       board_deck_import_search_words   T1:  name words (the 00056
--         search_vector + pg_trgm, NOT the 00056 search_products RPC, which is
--         SECURITY DEFINER with no visibility filter);
--   • a per-import claim for the browser-triggered path;
--   • rows for links no picture claimed (materialize_…_links): each becomes a
--     pending product piece with no pin, element_key 'link:<md5(url)>', so it
--     flows through the same claim/record path and the import stays
--     'resolving' until it settles. An import that had already settled 'ready'
--     goes back to 'resolving' while those rows resolve;
--   • pairing such a link row to a picture by look (pair_…_link): the picture
--     takes the candidates and the synthetic link row is deleted;
--   • a per-slide adjudication ledger: at most one Claude call per slide and
--     at most 20 per import;
--   • job_runs begin/finish and the every-minute pg_cron dispatcher, shaped
--     like dispatch_board_asset_gc (00410). The dispatcher writes no job_runs
--     row and makes no request when nothing is claimable (billing guard).
--
-- "All pieces terminal → ready" is 00676's _board_deck_import_settle, which
-- record_board_deck_import_resolution already calls; pairing calls it too.
--
-- Lineage: new objects only. No 00676 function is redefined.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. URL normalization (byte-compatible with links.ts normalizeProductUrl) ─

CREATE OR REPLACE FUNCTION public._board_deck_import_normalize_url(p_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN parts.m IS NULL OR parts.m[1] IS NULL THEN NULL ELSE
    'https://'
    || regexp_replace(lower(parts.m[1]), '^www\.', '')
    || CASE WHEN COALESCE(parts.m[2], '') IN ('', '/') THEN '/'
            ELSE COALESCE(NULLIF(regexp_replace(parts.m[2], '/+$', ''), ''), '/') END
    || COALESCE('?' || (
      SELECT string_agg(param, '&' ORDER BY ord)
      FROM unnest(string_to_array(parts.m[3], '&')) WITH ORDINALITY AS q(param, ord)
      WHERE param <> ''
        AND split_part(param, '=', 1) !~* '^(utm_.*|ref|ref_|gclid|fbclid)$'
    ), '')
  END
  FROM (
    SELECT regexp_match(
      btrim(COALESCE(p_url, '')),
      '^[Hh][Tt][Tt][Pp][Ss]?://(?:[^/?#@]*@)?([^/?#]+)([^?#]*)(?:\?([^#]*))?'
    ) AS m
  ) AS parts;
$$;

REVOKE ALL ON FUNCTION public._board_deck_import_normalize_url(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._board_deck_import_normalize_url(text) TO service_role;

-- ── 2. Visibility as a named user (the 00152 SELECT policies) ───────────────

CREATE OR REPLACE FUNCTION public._board_deck_import_visible_for(
  p_user uuid,
  p_layer text,
  p_owner uuid,
  p_studio uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_layer = 'catalog'
    OR (p_layer = 'personal' AND p_user IS NOT NULL AND p_owner = p_user)
    OR (
      p_layer = 'studio' AND p_user IS NOT NULL
      AND p_studio IN (
        SELECT membership.organization_id
        FROM public.organization_members AS membership
        WHERE membership.user_id = p_user
          AND membership.status = 'active'
      )
    );
$$;

REVOKE ALL ON FUNCTION public._board_deck_import_visible_for(uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- The importer's studio for the daily quota: their oldest active
-- design-studio membership, else the importer, else the board.
CREATE OR REPLACE FUNCTION public._board_deck_import_studio_key(p_import_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (
      SELECT membership.organization_id
      FROM public.organization_members AS membership
      JOIN public.organizations AS organization
        ON organization.id = membership.organization_id
      WHERE membership.user_id = deck_import.created_by
        AND membership.status = 'active'
        AND membership.role <> 'guest'
        AND organization.type = 'design_studio'
        AND organization.status = 'active'
      ORDER BY membership.joined_at NULLS LAST, membership.organization_id
      LIMIT 1
    ),
    deck_import.created_by,
    deck_import.board_id
  )
  FROM public.board_deck_imports AS deck_import
  WHERE deck_import.id = p_import_id;
$$;

REVOKE ALL ON FUNCTION public._board_deck_import_studio_key(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ── 3. Usage ledgers ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.board_deck_import_link_usage (
  import_id              uuid PRIMARY KEY
                           REFERENCES public.board_deck_imports(id) ON DELETE CASCADE,
  studio_key             uuid NOT NULL,
  links_used             integer NOT NULL DEFAULT 0 CHECK (links_used >= 0),
  links_materialized_at  timestamptz,
  -- slide_index (text) → {assignments:[…]} | {state:'pending'|'failed', at}
  adjudications          jsonb NOT NULL DEFAULT '{}'::jsonb
                           CHECK (jsonb_typeof(adjudications) = 'object'),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.board_deck_import_studio_link_days (
  studio_key  uuid NOT NULL,
  day         date NOT NULL,
  links_used  integer NOT NULL DEFAULT 0 CHECK (links_used >= 0),
  PRIMARY KEY (studio_key, day)
);

COMMENT ON TABLE public.board_deck_import_link_usage IS
  'Per-import resolver ledger (00677): links read against the 300-per-import quota, '
  'when unpaired links became pieces, and the per-slide adjudication results. '
  'Service-role only; written through the 00677 RPCs.';
COMMENT ON TABLE public.board_deck_import_studio_link_days IS
  'Per-studio, per-UTC-day deck link reads against the 1500-per-day quota (00677). '
  'Separate from the capture paste quota, which is unchanged.';

ALTER TABLE public.board_deck_import_link_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_deck_import_studio_link_days ENABLE ROW LEVEL SECURITY;
-- No policies: no client role reads or writes these ledgers.
REVOKE ALL ON TABLE public.board_deck_import_link_usage FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.board_deck_import_studio_link_days FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.board_deck_import_link_usage TO service_role;
GRANT SELECT ON TABLE public.board_deck_import_studio_link_days TO service_role;

CREATE OR REPLACE FUNCTION public._board_deck_import_usage_row(p_import_id uuid)
RETURNS public.board_deck_import_link_usage
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.board_deck_import_link_usage%ROWTYPE;
  v_key uuid;
BEGIN
  v_key := public._board_deck_import_studio_key(p_import_id);
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'deck import not found' USING ERRCODE = 'no_data_found';
  END IF;
  INSERT INTO public.board_deck_import_link_usage (import_id, studio_key)
  VALUES (p_import_id, v_key)
  ON CONFLICT (import_id) DO NOTHING;
  SELECT * INTO v_row
  FROM public.board_deck_import_link_usage
  WHERE import_id = p_import_id
  FOR UPDATE;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public._board_deck_import_usage_row(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ── 4. Link quota ───────────────────────────────────────────────────────────

-- Grants up to p_n links: min(requested, import remaining, studio-day
-- remaining). granted = 0 is a denial; the caller resolves link-only.
CREATE OR REPLACE FUNCTION public.consume_board_deck_import_link_quota(
  p_import_id uuid,
  p_n integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_import_limit constant integer := 300;
  c_studio_limit constant integer := 1500;
  v_usage public.board_deck_import_link_usage%ROWTYPE;
  v_day date := (now() AT TIME ZONE 'UTC')::date;
  v_studio_used integer;
  v_granted integer;
BEGIN
  IF p_n IS NULL OR p_n < 1 OR p_n > 500 THEN
    RAISE EXCEPTION 'n must be 1 to 500' USING ERRCODE = 'check_violation';
  END IF;
  v_usage := public._board_deck_import_usage_row(p_import_id);

  INSERT INTO public.board_deck_import_studio_link_days (studio_key, day)
  VALUES (v_usage.studio_key, v_day)
  ON CONFLICT (studio_key, day) DO NOTHING;
  SELECT links_used INTO v_studio_used
  FROM public.board_deck_import_studio_link_days
  WHERE studio_key = v_usage.studio_key AND day = v_day
  FOR UPDATE;

  v_granted := GREATEST(0, LEAST(
    p_n,
    c_import_limit - v_usage.links_used,
    c_studio_limit - v_studio_used
  ));

  IF v_granted > 0 THEN
    UPDATE public.board_deck_import_link_usage
    SET links_used = links_used + v_granted, updated_at = now()
    WHERE import_id = p_import_id;
    UPDATE public.board_deck_import_studio_link_days
    SET links_used = links_used + v_granted
    WHERE studio_key = v_usage.studio_key AND day = v_day;
  END IF;

  RETURN jsonb_build_object(
    'granted', v_granted,
    'requested', p_n,
    'import_used', v_usage.links_used + v_granted,
    'import_limit', c_import_limit,
    'studio_used', v_studio_used + v_granted,
    'studio_limit', c_studio_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_board_deck_import_link_quota(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_board_deck_import_link_quota(uuid, integer)
  TO service_role;

-- ── 5. Matching as the importer (T0a, T0c, T1) ──────────────────────────────

-- T0a: products whose normalized source_url is one of the links, the
-- importer's own library first; plus vendor names for the link domains.
-- The vendor lookup is step 1 of 00676 _board_deck_import_resolve_vendor
-- (website ILIKE %domain%, oldest first) without its stub insert: reading a
-- link must not create vendors; the keep path still resolves/creates one.
CREATE OR REPLACE FUNCTION public.board_deck_import_match_links(
  p_import_id uuid,
  p_urls text[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid;
  v_urls text[];
  v_products jsonb;
  v_vendors jsonb;
BEGIN
  SELECT created_by INTO v_user FROM public.board_deck_imports WHERE id = p_import_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deck import not found' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT normalized), '{}'::text[]) INTO v_urls
  FROM (
    SELECT public._board_deck_import_normalize_url(url) AS normalized
    FROM unnest(COALESCE(p_urls, '{}'::text[])) AS url
    LIMIT 20
  ) AS given
  WHERE normalized IS NOT NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id', hit.id, 'url', hit.normalized)
                            ORDER BY hit.layer_rank, hit.created_at), '[]'::jsonb)
  INTO v_products
  FROM (
    SELECT product.id,
           public._board_deck_import_normalize_url(product.source_url) AS normalized,
           CASE product.layer WHEN 'personal' THEN 0 WHEN 'studio' THEN 1 ELSE 2 END AS layer_rank,
           product.created_at
    FROM public.products AS product
    WHERE product.source_url IS NOT NULL
      AND product.deleted_at IS NULL
      AND product.merged_into_id IS NULL
      AND public._board_deck_import_normalize_url(product.source_url) = ANY (v_urls)
      AND public._board_deck_import_visible_for(
        v_user, product.layer, product.owner_user_id, product.studio_id)
    ORDER BY layer_rank, product.created_at
    LIMIT 5
  ) AS hit;

  SELECT COALESCE(jsonb_object_agg(domain, vendor_name), '{}'::jsonb) INTO v_vendors
  FROM (
    SELECT DISTINCT ON (domain) domain, vendor.name AS vendor_name
    FROM (
      SELECT substring(url FROM '^https://([^/?#:]+)') AS domain FROM unnest(v_urls) AS url
    ) AS domains
    JOIN public.vendors AS vendor
      ON vendor.website ILIKE '%'
        || replace(replace(replace(domain, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    WHERE domain IS NOT NULL
    ORDER BY domain, vendor.created_at ASC NULLS LAST, vendor.id
  ) AS named;

  RETURN jsonb_build_object('products', v_products, 'vendors', v_vendors);
END;
$$;

-- T0c: exact SKU + exact (case-insensitive) vendor name.
CREATE OR REPLACE FUNCTION public.board_deck_import_match_sku(
  p_import_id uuid,
  p_sku text,
  p_vendor text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid;
  v_sku text := lower(btrim(COALESCE(p_sku, '')));
  v_vendor text := lower(btrim(COALESCE(p_vendor, '')));
BEGIN
  SELECT created_by INTO v_user FROM public.board_deck_imports WHERE id = p_import_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deck import not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_sku = '' OR v_vendor = '' THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('product_id', hit.id) ORDER BY hit.layer_rank, hit.created_at)
    FROM (
      SELECT product.id, product.created_at,
             CASE product.layer WHEN 'personal' THEN 0 WHEN 'studio' THEN 1 ELSE 2 END AS layer_rank
      FROM public.products AS product
      JOIN public.vendors AS vendor ON vendor.id = product.vendor_id
      WHERE lower(btrim(product.vendor_sku)) = v_sku
        AND lower(btrim(vendor.name)) = v_vendor
        AND product.deleted_at IS NULL
        AND product.merged_into_id IS NULL
        AND public._board_deck_import_visible_for(
          v_user, product.layer, product.owner_user_id, product.studio_id)
      ORDER BY layer_rank, product.created_at
      LIMIT 5
    ) AS hit
  ), '[]'::jsonb);
END;
$$;

-- T1: name words. score = the better of trigram similarity and the name's
-- word similarity inside the query, +0.1 when the vendor name matches.
CREATE OR REPLACE FUNCTION public.board_deck_import_search_words(
  p_import_id uuid,
  p_query text,
  p_vendor text DEFAULT NULL,
  p_limit integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_user uuid;
  v_query text := lower(btrim(left(COALESCE(p_query, ''), 200)));
  v_vendor text := NULLIF(lower(btrim(COALESCE(p_vendor, ''))), '');
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 5), 1), 10);
BEGIN
  SELECT created_by INTO v_user FROM public.board_deck_imports WHERE id = p_import_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deck import not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF length(v_query) < 3 THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('product_id', hit.id, 'score', round(hit.score::numeric, 3))
                     ORDER BY hit.score DESC, hit.id)
    FROM (
      SELECT product.id,
             LEAST(1.0, GREATEST(
               similarity(lower(product.name), v_query),
               word_similarity(lower(product.name), v_query)
             ) + CASE WHEN v_vendor IS NOT NULL AND lower(btrim(vendor.name)) = v_vendor
                      THEN 0.1 ELSE 0 END) AS score
      FROM public.products AS product
      LEFT JOIN public.vendors AS vendor ON vendor.id = product.vendor_id
      WHERE product.deleted_at IS NULL
        AND product.merged_into_id IS NULL
        AND product.name IS NOT NULL
        AND public._board_deck_import_visible_for(
          v_user, product.layer, product.owner_user_id, product.studio_id)
        AND (
          product.search_vector @@ plainto_tsquery('english', v_query)
          OR lower(product.name) % v_query
          OR word_similarity(lower(product.name), v_query) >= 0.3
        )
      ORDER BY score DESC, product.id
      LIMIT v_limit
    ) AS hit
    WHERE hit.score >= 0.3
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.board_deck_import_match_links(uuid, text[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.board_deck_import_match_sku(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.board_deck_import_search_words(uuid, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.board_deck_import_match_links(uuid, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.board_deck_import_match_sku(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.board_deck_import_search_words(uuid, text, text, integer)
  TO service_role;

-- ── 6. Per-import claim (browser-triggered path) ────────────────────────────

-- 00676 claim_board_deck_import_items scoped to one import: same lease,
-- attempt cap and ordering.
CREATE OR REPLACE FUNCTION public.claim_board_deck_import_items_for_import(
  p_import_id uuid,
  p_limit integer DEFAULT 8
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_max_attempts constant integer := 5;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 8), 1), 50);
  v_owner text := gen_random_uuid()::text;
  v_until timestamptz := now() + interval '3 minutes';
  v_items jsonb;
BEGIN
  UPDATE public.board_deck_import_items
  SET lease_owner = NULL,
      lease_until = NULL,
      state = CASE WHEN attempts >= c_max_attempts THEN 'not_found' ELSE state END
  WHERE import_id = p_import_id
    AND state = 'pending'
    AND lease_until IS NOT NULL
    AND lease_until <= now();
  PERFORM public._board_deck_import_settle(p_import_id);

  WITH picked AS (
    SELECT item.id
    FROM public.board_deck_import_items AS item
    JOIN public.board_deck_imports AS deck_import ON deck_import.id = item.import_id
    WHERE item.import_id = p_import_id
      AND item.state = 'pending'
      AND deck_import.status = 'resolving'
      AND item.attempts < c_max_attempts
      AND (item.lease_until IS NULL OR item.lease_until <= now())
      AND (item.next_attempt_at IS NULL OR item.next_attempt_at <= now())
    ORDER BY item.next_attempt_at NULLS FIRST, item.slide_index, item.element_key
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
    ORDER BY claimed.slide_index, claimed.element_key
  ), '[]'::jsonb)
  INTO v_items
  FROM claimed
  JOIN public.board_deck_imports AS deck_import ON deck_import.id = claimed.import_id;

  RETURN jsonb_build_object('lease_owner', v_owner, 'lease_until', v_until, 'items', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_board_deck_import_items_for_import(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_board_deck_import_items_for_import(uuid, integer)
  TO service_role;

-- ── 7. Links no picture claimed become pieces ───────────────────────────────

-- Once per import (after layout has landed): every unpaired link becomes a
-- pending product piece with no pin. Deduped by normalized URL; a slide's own
-- copy wins over the deck-level one. Returns the rows added.
CREATE OR REPLACE FUNCTION public.materialize_board_deck_import_links(p_import_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_import public.board_deck_imports%ROWTYPE;
  v_usage public.board_deck_import_link_usage%ROWTYPE;
  v_added integer := 0;
BEGIN
  SELECT * INTO v_import
  FROM public.board_deck_imports
  WHERE id = p_import_id
  FOR UPDATE;
  IF NOT FOUND OR v_import.status NOT IN ('resolving', 'ready') THEN
    RETURN 0;
  END IF;
  v_usage := public._board_deck_import_usage_row(p_import_id);
  IF v_usage.links_materialized_at IS NOT NULL THEN
    RETURN 0;
  END IF;

  WITH raw AS (
    SELECT 0 AS slide_index, true AS deck_level, 0 AS slide_ord, link.ord, link.value AS link
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_import.links->'deck_links') = 'array'
        THEN v_import.links->'deck_links' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS link(value, ord)
    UNION ALL
    SELECT GREATEST(COALESCE(
             CASE WHEN (slide.value->>'slide_index') ~ '^[0-9]{1,4}$'
               THEN (slide.value->>'slide_index')::integer END, 0), 0),
           false, slide.ord, link.ord, link.value
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_import.links->'slide_links') = 'array'
        THEN v_import.links->'slide_links' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS slide(value, ord)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(slide.value->'unpaired_links') = 'array'
        THEN slide.value->'unpaired_links' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS link(value, ord)
  ),
  keyed AS (
    SELECT DISTINCT ON (normalized)
           normalized, slide_index, deck_level, link
    FROM (
      SELECT public._board_deck_import_normalize_url(raw.link->>'url') AS normalized, raw.*
      FROM raw
      WHERE jsonb_typeof(raw.link) = 'object'
    ) AS candidates
    WHERE normalized IS NOT NULL
    ORDER BY normalized, deck_level, slide_ord, ord
  ),
  inserted AS (
    INSERT INTO public.board_deck_import_items (
      import_id, element_key, slide_index, role, extracted, state
    )
    SELECT p_import_id,
           'link:' || md5(keyed.normalized),
           keyed.slide_index,
           'product',
           jsonb_build_object(
             'links', jsonb_build_array(keyed.link || jsonb_build_object('on_picture', false)),
             'unpaired', true,
             'deck_level', keyed.deck_level
           ),
           'pending'
    FROM keyed
    ON CONFLICT (import_id, element_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_added FROM inserted;

  UPDATE public.board_deck_import_link_usage
  SET links_materialized_at = now(), updated_at = now()
  WHERE import_id = p_import_id;

  IF v_added > 0 AND v_import.status = 'ready' THEN
    UPDATE public.board_deck_imports
    SET status = 'resolving', finished_at = NULL
    WHERE id = p_import_id;
  END IF;
  RETURN v_added;
END;
$$;

REVOKE ALL ON FUNCTION public.materialize_board_deck_import_links(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_board_deck_import_links(uuid) TO service_role;

-- ── 8. Pairing a link to a picture by look ──────────────────────────────────

-- Pictures that a link could still be paired to: product pieces with a pin,
-- no link of their own, not found yet, and not leased by another run.
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
    'image_url', COALESCE(pin.image_url, pin.data->>'image_url')
  ) ORDER BY item.slide_index, item.element_key), '[]'::jsonb)
  FROM (
    SELECT item.*
    FROM public.board_deck_import_items AS item
    WHERE item.import_id = p_import_id
      AND item.role = 'product'
      AND item.board_item_id IS NOT NULL
      AND item.state IN ('pending', 'not_found')
      AND (item.lease_until IS NULL OR item.lease_until <= now())
      AND public._board_deck_import_slide_link(item.extracted) IS NULL
    ORDER BY item.slide_index, item.element_key
    LIMIT 40
  ) AS item
  JOIN public.proposal_board_items AS pin ON pin.id = item.board_item_id
  WHERE COALESCE(pin.image_url, pin.data->>'image_url') IS NOT NULL;
$$;

-- The picture takes the link's candidates (record_board_deck_import_resolution
-- validates them) and the synthetic link row is deleted. False when either
-- side is no longer eligible (decided, leased, or already paired).
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
BEGIN
  SELECT * INTO v_link FROM public.board_deck_import_items
  WHERE id = p_link_item_id FOR UPDATE;
  SELECT * INTO v_picture FROM public.board_deck_import_items
  WHERE id = p_picture_item_id FOR UPDATE;
  IF v_link.id IS NULL OR v_picture.id IS NULL
     OR v_link.import_id <> v_picture.import_id
     OR v_link.element_key NOT LIKE 'link:%'
     OR v_link.board_item_id IS NOT NULL
     OR v_link.state NOT IN ('pending', 'found', 'not_found')
     OR v_picture.board_item_id IS NULL
     OR v_picture.role <> 'product'
     OR v_picture.state NOT IN ('pending', 'not_found')
     OR (v_picture.lease_until IS NOT NULL AND v_picture.lease_until > now()) THEN
    RETURN false;
  END IF;

  PERFORM public.record_board_deck_import_resolution(
    p_picture_item_id, 'found', 'link', p_candidates);
  DELETE FROM public.board_deck_import_items WHERE id = p_link_item_id;
  PERFORM public._board_deck_import_settle(v_link.import_id);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.board_deck_import_pairable_pictures(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pair_board_deck_import_link(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.board_deck_import_pairable_pictures(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pair_board_deck_import_link(uuid, uuid, jsonb) TO service_role;

-- ── 9. Adjudication ledger (≤1 Claude call per slide, ≤20 per import) ───────

CREATE OR REPLACE FUNCTION public.claim_board_deck_import_adjudication(
  p_import_id uuid,
  p_slide_index integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_max_per_import constant integer := 20;
  v_usage public.board_deck_import_link_usage%ROWTYPE;
  v_entry jsonb;
BEGIN
  v_usage := public._board_deck_import_usage_row(p_import_id);
  v_entry := v_usage.adjudications->(p_slide_index::text);
  IF v_entry IS NOT NULL AND jsonb_typeof(v_entry->'assignments') = 'array' THEN
    RETURN jsonb_build_object('status', 'cached', 'assignments', v_entry->'assignments');
  END IF;
  IF v_entry IS NOT NULL
     OR (SELECT count(*) FROM jsonb_object_keys(v_usage.adjudications)) >= c_max_per_import THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  UPDATE public.board_deck_import_link_usage
  SET adjudications = adjudications || jsonb_build_object(
        p_slide_index::text, jsonb_build_object('state', 'pending', 'at', now())),
      updated_at = now()
  WHERE import_id = p_import_id;
  RETURN jsonb_build_object('status', 'granted');
END;
$$;

-- p_assignments NULL records a failed call: the slide is not tried again.
CREATE OR REPLACE FUNCTION public.store_board_deck_import_adjudication(
  p_import_id uuid,
  p_slide_index integer,
  p_assignments jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_assignments IS NOT NULL
     AND (jsonb_typeof(p_assignments) <> 'array' OR octet_length(p_assignments::text) > 32768) THEN
    RAISE EXCEPTION 'assignments must be a small array' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM public._board_deck_import_usage_row(p_import_id);
  UPDATE public.board_deck_import_link_usage
  SET adjudications = adjudications || jsonb_build_object(
        p_slide_index::text,
        CASE WHEN p_assignments IS NULL
          THEN jsonb_build_object('state', 'failed', 'at', now())
          ELSE jsonb_build_object('assignments', p_assignments, 'at', now()) END),
      updated_at = now()
  WHERE import_id = p_import_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_board_deck_import_adjudication(uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_board_deck_import_adjudication(uuid, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_board_deck_import_adjudication(uuid, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.store_board_deck_import_adjudication(uuid, integer, jsonb)
  TO service_role;

-- ── 10. job_runs: begin (browser path), finish, dispatch (cron path) ────────

CREATE OR REPLACE FUNCTION public.begin_board_deck_import_resolve_run(p_import_id uuid)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.job_runs (job_name, status, detail)
  VALUES (
    'board-deck-import-resolve',
    'running',
    jsonb_build_object('trigger', 'client', 'import_id', p_import_id)
  )
  RETURNING id;
$$;

CREATE OR REPLACE FUNCTION public.finish_board_deck_import_resolve_run(
  p_run_id bigint,
  p_status text,
  p_detail jsonb DEFAULT '{}'::jsonb,
  p_error text DEFAULT NULL,
  p_cost_usd numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_status NOT IN ('succeeded', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'invalid deck import resolve terminal status %', p_status
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.job_runs
  SET status = p_status,
      finished_at = now(),
      -- job_runs.cost_usd is numeric(8,2); the exact figure stays in detail.
      cost_usd = CASE WHEN p_cost_usd IS NULL THEN cost_usd ELSE round(p_cost_usd, 2) END,
      detail = detail || COALESCE(p_detail, '{}'::jsonb)
        || CASE WHEN p_cost_usd IS NULL THEN '{}'::jsonb
                ELSE jsonb_build_object('cost_usd_exact', p_cost_usd) END,
      error = CASE WHEN p_status = 'failed' THEN left(p_error, 500) ELSE NULL END
  WHERE id = p_run_id
    AND job_name = 'board-deck-import-resolve'
    AND status = 'running';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'running deck import resolve job % not found', p_run_id
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

-- Every minute: turn unpaired links into pieces, then — only when a piece is
-- claimable — open a job_runs row and invoke the edge function with its id.
CREATE OR REPLACE FUNCTION public.dispatch_board_deck_import_resolve()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_import_id uuid;
  v_run_id bigint;
  v_request_id bigint;
BEGIN
  FOR v_import_id IN
    SELECT deck_import.id
    FROM public.board_deck_imports AS deck_import
    LEFT JOIN public.board_deck_import_link_usage AS usage
      ON usage.import_id = deck_import.id
    WHERE deck_import.status IN ('resolving', 'ready')
      AND deck_import.created_at > now() - interval '7 days'
      AND usage.links_materialized_at IS NULL
      AND (
        jsonb_array_length(COALESCE(NULLIF(deck_import.links->'deck_links', 'null'::jsonb), '[]'::jsonb)) > 0
        OR jsonb_array_length(COALESCE(NULLIF(deck_import.links->'slide_links', 'null'::jsonb), '[]'::jsonb)) > 0
      )
    ORDER BY deck_import.created_at
    LIMIT 20
  LOOP
    PERFORM public.materialize_board_deck_import_links(v_import_id);
  END LOOP;

  -- A run that never reported back is closed so it does not pile up.
  UPDATE public.job_runs
  SET status = 'failed', finished_at = now(), error = 'no completion reported'
  WHERE job_name = 'board-deck-import-resolve'
    AND status = 'running'
    AND started_at < now() - interval '10 minutes';

  -- Billing guard: no claimable piece → no row, no request.
  IF NOT EXISTS (
    SELECT 1
    FROM public.board_deck_import_items AS item
    JOIN public.board_deck_imports AS deck_import ON deck_import.id = item.import_id
    WHERE item.state = 'pending'
      AND deck_import.status = 'resolving'
      AND item.attempts < 5
      AND (item.lease_until IS NULL OR item.lease_until <= now())
      AND (item.next_attempt_at IS NULL OR item.next_attempt_at <= now())
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.job_runs (job_name, status, detail)
  VALUES (
    'board-deck-import-resolve',
    'running',
    jsonb_build_object('trigger', 'cron', 'dispatch_state', 'starting')
  )
  RETURNING id INTO v_run_id;

  BEGIN
    SELECT public.invoke_edge_function(
      'board-deck-import-resolve',
      jsonb_build_object('job_run_id', v_run_id)
    )
    INTO v_request_id;

    IF v_request_id IS NULL THEN
      UPDATE public.job_runs
      SET status = 'failed',
          finished_at = now(),
          error = 'edge dispatch skipped: Supabase URL/service key unavailable',
          detail = detail || jsonb_build_object('dispatch_state', 'not_sent')
      WHERE id = v_run_id;
    ELSE
      UPDATE public.job_runs
      SET detail = detail || jsonb_build_object('dispatch_state', 'sent', 'request_id', v_request_id)
      WHERE id = v_run_id;
      -- The edge function owns the terminal update via
      -- finish_board_deck_import_resolve_run(). Enqueue success is not job success.
    END IF;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.job_runs
    SET status = 'failed',
        finished_at = now(),
        error = SQLERRM,
        detail = detail || jsonb_build_object('dispatch_state', 'error')
    WHERE id = v_run_id;
  END;

  RETURN v_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_board_deck_import_resolve_run(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_board_deck_import_resolve_run(bigint, text, jsonb, text, numeric)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dispatch_board_deck_import_resolve()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_board_deck_import_resolve_run(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_board_deck_import_resolve_run(bigint, text, jsonb, text, numeric)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_board_deck_import_resolve() TO service_role;

-- ── 11. Every-minute cron ───────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $cron$
DECLARE
  v_job_id bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR v_job_id IN
      SELECT jobid FROM cron.job WHERE jobname = 'board-deck-import-resolve'
    LOOP
      PERFORM cron.unschedule(v_job_id);
    END LOOP;

    PERFORM cron.schedule(
      'board-deck-import-resolve',
      '* * * * *',
      $command$SELECT public.dispatch_board_deck_import_resolve();$command$
    );
  END IF;
END
$cron$;
