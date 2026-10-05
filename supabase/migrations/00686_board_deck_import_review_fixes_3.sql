-- ═══════════════════════════════════════════════════════════════════════════
-- 00686 — Bring in a Deck: third review fixes (US-15, SQ-381; SQ-380 R1–R5)
--
-- R2 _board_deck_import_normalize_url — REDEFINED (00683, its latest body).
--    It never raises: an input over 2048 characters, or a host label over 63
--    characters (after NFKC), gives NULL (no key, so no T0a match). The
--    punycode helper — REDEFINED (00683) — keeps delta and q in bigint, so a
--    long non-ASCII label no longer overflows integer (22003).
--    links.ts normalizeProductUrl does not apply the two caps; such a link
--    only loses its T0a lookup. The shared url-vectors are unchanged.
-- R1 idx_products_deck_import_source_url — REBUILT on
--    md5(normalize(source_url)). The plain expression btree raised 54000 on
--    any product write whose key was over ~2.7 KB (the percent-encoding can
--    triple a 2048-character input). board_deck_import_match_links
--    (00683 body) — REDEFINED: it filters on the md5 of the key (served by
--    the index) and on the key itself (exact equality).
-- R3 the normalizer and its two helpers: EXECUTE revoked from anon (00685
--    granted it). products has no anon write policy and RLS WITH CHECK runs
--    before index insertion, so anon never evaluates the index.
--    authenticated and service_role keep EXECUTE.
-- R4 board_deck_import_items.taught_studio_id — NEW. The studio a Keep taught
--    (the candidate scope's studio at keep time), written by the teach trigger.
--    _board_deck_import_teach — REDEFINED (00685 body): un-teach deletes in the
--    recorded studio, never a recomputed one, so a later change to the
--    import's created_by, the project's studio or the importer's membership no
--    longer leaves the confirmation behind. The "another kept piece still
--    confirms it" check and the (studio, crop) advisory lock use the recorded
--    studio. No scope studio at keep time → nothing taught, NULL recorded.
-- R5 a degenerate dHash (popcount < 8 or > 56, which includes 0 and all ones:
--    a uniform or low-entropy crop) is not an identity. Teach stores NULL
--    phash for it, and board_deck_import_match_phash (00684 body) —
--    REDEFINED — never returns a row whose phash is degenerate.
--    crop_signature.ts returns phash null for such crops.
--
-- Adds REVOKEs → regenerate seed/00-legacy-grants.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── R1: drop the expression index before the normalizer changes ─────────────

DROP INDEX IF EXISTS public.idx_products_deck_import_source_url;

-- ── R2: the normalizer never raises ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._board_deck_import_punycode(p_label text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cps integer[];
  v_out text := '';
  v_n integer := 128;
  -- bigint: RFC 3492 §6.4 overflow handling. delta grows by up to
  -- (0x10FFFF - n) × (h + 1); bigint holds it for any text length.
  v_delta bigint := 0;
  v_bias integer := 72;
  v_h integer;
  v_b integer;
  v_m integer;
  v_q bigint;
  v_k integer;
  v_t integer;
  v_d integer;
  v_cp integer;
BEGIN
  SELECT array_agg(ascii(c.ch) ORDER BY c.ord) INTO v_cps
  FROM regexp_split_to_table(p_label, '') WITH ORDINALITY AS c(ch, ord);
  FOREACH v_cp IN ARRAY v_cps LOOP
    IF v_cp < 128 THEN
      v_out := v_out || chr(v_cp);
    END IF;
  END LOOP;
  v_b := length(v_out);
  v_h := v_b;
  IF v_b > 0 THEN
    v_out := v_out || '-';
  END IF;
  WHILE v_h < cardinality(v_cps) LOOP
    SELECT min(x) INTO v_m FROM unnest(v_cps) AS x WHERE x >= v_n;
    v_delta := v_delta + (v_m - v_n)::bigint * (v_h + 1);
    v_n := v_m;
    FOREACH v_cp IN ARRAY v_cps LOOP
      IF v_cp < v_n THEN
        v_delta := v_delta + 1;
      END IF;
      IF v_cp = v_n THEN
        v_q := v_delta;
        v_k := 36;
        LOOP
          v_t := CASE WHEN v_k <= v_bias THEN 1 WHEN v_k >= v_bias + 26 THEN 26 ELSE v_k - v_bias END;
          EXIT WHEN v_q < v_t;
          v_d := v_t + (v_q - v_t) % (36 - v_t);
          v_out := v_out || chr(CASE WHEN v_d < 26 THEN 97 + v_d ELSE 22 + v_d END);
          v_q := (v_q - v_t) / (36 - v_t);
          v_k := v_k + 36;
        END LOOP;
        v_out := v_out || chr((CASE WHEN v_q < 26 THEN 97 + v_q ELSE 22 + v_q END)::integer);
        -- bias adaptation (RFC 3492 §6.1), first time when h = b
        v_delta := CASE WHEN v_h = v_b THEN v_delta / 700 ELSE v_delta / 2 END;
        v_delta := v_delta + v_delta / (v_h + 1);
        v_k := 0;
        WHILE v_delta > 455 LOOP
          v_delta := v_delta / 35;
          v_k := v_k + 36;
        END LOOP;
        v_bias := v_k + (36 * v_delta) / (v_delta + 38);
        v_delta := 0;
        v_h := v_h + 1;
      END IF;
    END LOOP;
    v_delta := v_delta + 1;
    v_n := v_n + 1;
  END LOOP;
  RETURN 'xn--' || v_out;
END;
$$;

-- https + lowercase (punycode) host without www., no default port, no
-- fragment, no tracking params, no trailing slash (root stays "/"),
-- WHATWG percent-encoding. NULL for anything that is not http(s), for an
-- input over 2048 characters and for a host label over 63 characters.
CREATE OR REPLACE FUNCTION public._board_deck_import_normalize_url(p_url text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_m text[];
  v_scheme text;
  v_host text;
  v_label text;
  v_labels text[] := '{}';
  v_port text := '';
  v_path text;
  v_query text;
BEGIN
  IF length(p_url) > 2048 THEN
    RETURN NULL;
  END IF;
  v_m := regexp_match(
    btrim(COALESCE(p_url, ''), E' \t\n\r\f\v'),
    '^([Hh][Tt][Tt][Pp][Ss]?)://(?:[^/?#@]*@)?([^/?#:]+)(?::([^/?#]*))?([^?#]*)(?:\?([^#]*))?'
  );
  IF v_m IS NULL THEN
    RETURN NULL;
  END IF;
  v_scheme := lower(v_m[1]);

  FOREACH v_label IN ARRAY string_to_array(lower(normalize(v_m[2], NFKC)), '.') LOOP
    IF length(v_label) > 63 THEN
      RETURN NULL;
    END IF;
    v_labels := v_labels || CASE
      WHEN octet_length(v_label) <> length(v_label) THEN public._board_deck_import_punycode(v_label)
      ELSE v_label
    END;
  END LOOP;
  v_host := regexp_replace(array_to_string(v_labels, '.'), '^www\.', '');
  IF v_host = '' THEN
    RETURN NULL;
  END IF;

  IF COALESCE(v_m[3], '') <> '' THEN
    IF v_m[3] !~ '^[0-9]+$' OR v_m[3]::numeric > 65535 THEN
      RETURN NULL;
    END IF;
    -- The key is written as https, so :443 goes from http too (fixed point).
    IF v_m[3]::numeric <> 443 AND NOT (v_scheme = 'http' AND v_m[3]::numeric = 80) THEN
      v_port := ':' || v_m[3]::numeric::integer::text;
    END IF;
  END IF;

  v_path := public._board_deck_import_pct_encode(COALESCE(v_m[4], ''), '"<>`{}');
  v_path := CASE WHEN v_path IN ('', '/') THEN '/'
                 ELSE COALESCE(NULLIF(regexp_replace(v_path, '/+$', ''), ''), '/') END;

  SELECT string_agg(param, '&' ORDER BY ord) INTO v_query
  FROM unnest(string_to_array(public._board_deck_import_pct_encode(v_m[5], '"<>'''), '&'))
    WITH ORDINALITY AS q(param, ord)
  WHERE param <> ''
    AND split_part(param, '=', 1) !~* '^(utm_.*|ref|ref_|gclid|fbclid)$';

  RETURN 'https://' || v_host || v_port || v_path || COALESCE('?' || v_query, '');
END;
$$;

COMMENT ON FUNCTION public._board_deck_import_normalize_url(text) IS
  'Deck import URL key (00683, never raises 00686), byte-compatible with links.ts '
  'normalizeProductUrl on the lookup_indexes.test.sql vectors. Indexed (as md5) by '
  'idx_products_deck_import_source_url: a body change must REINDEX that index.';

-- ── R3: no anon EXECUTE ─────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public._board_deck_import_normalize_url(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public._board_deck_import_pct_encode(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public._board_deck_import_punycode(text) FROM anon;

-- ── R1: the T0a index on the key's md5 ──────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_products_deck_import_source_url
  ON public.products (md5(public._board_deck_import_normalize_url(source_url)))
  WHERE source_url IS NOT NULL AND deleted_at IS NULL AND merged_into_id IS NULL;

-- T0a (00683 body): the md5 predicate is the index's; the key predicate keeps
-- the match exact.
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
  v_studio uuid;
  v_urls text[];
  v_hashes text[];
  v_products jsonb;
  v_vendors jsonb;
BEGIN
  SELECT scope.user_id, scope.studio_id INTO v_user, v_studio
  FROM public._board_deck_import_candidate_scope(p_import_id) AS scope;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deck import not found' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT normalized), '{}'::text[]),
         COALESCE(array_agg(DISTINCT md5(normalized)), '{}'::text[])
  INTO v_urls, v_hashes
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
      AND md5(public._board_deck_import_normalize_url(product.source_url)) = ANY (v_hashes)
      AND public._board_deck_import_normalize_url(product.source_url) = ANY (v_urls)
      AND (
        product.layer = 'catalog'
        OR (product.layer = 'personal' AND product.owner_user_id = v_user)
        OR (product.layer = 'studio' AND product.studio_id = v_studio)
      )
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
      ON public._board_deck_import_url_host(vendor.website) = domains.domain
    WHERE domain IS NOT NULL
    ORDER BY domain, vendor.created_at ASC NULLS LAST, vendor.id
  ) AS named;

  RETURN jsonb_build_object('products', v_products, 'vendors', v_vendors);
END;
$$;

-- ── R5: a degenerate dHash is never an exact match ──────────────────────────

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
      -- a uniform or low-entropy picture's dHash (00686 R5)
      AND bit_count(picture.phash::bit(64)) BETWEEN 8 AND 56
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

-- ── R4: un-teach the studio that was taught ─────────────────────────────────

ALTER TABLE public.board_deck_import_items
  ADD COLUMN IF NOT EXISTS taught_studio_id uuid;

COMMENT ON COLUMN public.board_deck_import_items.taught_studio_id IS
  'The studio this kept piece''s crop was taught to (product_image_vectors '
  'designer_confirmed row, image_hash = crop sha || '':'' || studio). Written by '
  '_board_deck_import_teach; un-teach reads it (00686).';

-- Pieces kept before 00686: the studio their confirmation row was written for.
UPDATE public.board_deck_import_items AS item
SET taught_studio_id = taught.studio_id
FROM public.board_deck_import_crop_signatures AS signature,
     public.product_image_vectors AS taught
WHERE signature.item_id = item.id
  AND item.state = 'kept'
  AND item.chosen_product_id IS NOT NULL
  AND item.taught_studio_id IS NULL
  AND taught.product_id = item.chosen_product_id
  AND taught.source = 'designer_confirmed'
  AND taught.studio_id IS NOT NULL
  AND taught.image_hash = signature.image_hash || ':' || taught.studio_id::text;

CREATE OR REPLACE FUNCTION public._board_deck_import_teach()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_signature public.board_deck_import_crop_signatures%ROWTYPE;
  v_old_studio uuid := OLD.taught_studio_id;
  v_new_studio uuid;
  v_phash bigint;
  v_lock text;
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

  -- Whatever happens below, the row records only what this keep taught.
  NEW.taught_studio_id := NULL;

  IF v_signature.item_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Keep (or swap onto): the studio the candidate tiers read for this import
  -- (00683/00684), at keep time. No scope studio → nothing is taught.
  IF v_is_kept THEN
    SELECT scope.studio_id INTO v_new_studio
    FROM public._board_deck_import_candidate_scope(NEW.import_id) AS scope;
  END IF;

  -- One keep/unkeep of this crop in this studio at a time; each statement
  -- below then reads the others' committed state (READ COMMITTED). A swap
  -- across two studios takes both locks, in a fixed order.
  FOR v_lock IN
    SELECT DISTINCT studio::text
    FROM unnest(ARRAY[
      CASE WHEN v_was_kept THEN v_old_studio END,
      v_new_studio
    ]) AS studio
    WHERE studio IS NOT NULL
    ORDER BY studio::text
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'board_deck_import_teach:' || v_signature.image_hash || ':' || v_lock, 0));
  END LOOP;

  -- Swap away or unkeep: the old product no longer has this crop's
  -- confirmation in the studio it was taught to, unless another kept piece
  -- taught there with the same crop still confirms it.
  IF v_was_kept AND v_old_studio IS NOT NULL THEN
    DELETE FROM public.product_image_vectors AS taught
    WHERE taught.product_id = OLD.chosen_product_id
      AND taught.image_hash = v_signature.image_hash || ':' || v_old_studio::text
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
          AND other.taught_studio_id = v_old_studio
      );
  END IF;

  -- Keep (or swap onto): teach the chosen product this crop, for this studio.
  -- A degenerate dHash (uniform or low-entropy crop) is stored as NULL.
  IF v_is_kept AND v_new_studio IS NOT NULL THEN
    v_phash := CASE WHEN bit_count(v_signature.phash::bit(64)) BETWEEN 8 AND 56
                    THEN v_signature.phash END;
    INSERT INTO public.product_image_vectors (
      product_id, image_hash, vector, phash, model_version, source, studio_id, created_by
    )
    VALUES (
      NEW.chosen_product_id, v_signature.image_hash || ':' || v_new_studio::text,
      v_signature.vector, v_phash,
      v_signature.model_version, 'designer_confirmed', v_new_studio,
      COALESCE(NEW.kept_by, auth.uid())
    )
    ON CONFLICT ON CONSTRAINT product_image_vectors_identity DO NOTHING;
    NEW.taught_studio_id := v_new_studio;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._board_deck_import_teach()
  FROM PUBLIC, anon, authenticated, service_role;
