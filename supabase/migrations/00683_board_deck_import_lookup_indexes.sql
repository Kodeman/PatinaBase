-- ═══════════════════════════════════════════════════════════════════════════
-- 00683 — Bring in a Deck: URL normalizer parity, a T0a index and candidates
--         scoped to the board's studio (US-15, SQ-369; SQ-366 F12 F13 F17)
--
-- F13 _board_deck_import_normalize_url — REDEFINED (00677, its only body).
--     It now produces what links.ts normalizeProductUrl (WHATWG URL) produces
--     for the cases the two disagreed on: a default port (:443, which is the
--     key's https default whatever the input scheme, and :80 on http; leading
--     zeros read as a number) is dropped, in both, so the key is a fixed
--     point (links.ts also drops :443 from http now); the path and
--     query are percent-encoded with the WHATWG path and special-query sets
--     (existing %XX escapes are kept as written); a non-ASCII host label is
--     NFKC-normalized, lowercased and written as punycode (xn--…). A port that
--     is not a number in 0..65535 returns NULL, as the URL parser rejects it.
--     The shared vector table is supabase/tests/deck_import/lookup_indexes.test.sql
--     (between the url-vectors markers); links_test.ts runs the same rows
--     through normalizeProductUrl. Still not mirrored (not in the vectors):
--     dot segments (/a/../b), backslashes, percent-escapes inside the host,
--     IPv6 literals and Unicode whitespace trimming.
--     materialize_board_deck_import_links keys link rows with this function
--     once per import, so an import keeps one key scheme throughout.
-- F12 idx_products_deck_import_source_url — NEW expression index on the
--     normalized source_url of live products, so T0a is an index lookup
--     instead of normalizing every products row. CREATE OR REPLACE of the
--     normalizer does NOT rebuild it: any later body change must REINDEX it.
--     The per-row SECURITY DEFINER visibility call is gone from T0a, T0c, T1,
--     T2 and the look gate (an inline predicate on precomputed scope instead).
--     T1 still reads every live named product: pg_trgm can only index
--     word_similarity with the indexed column as the second argument, and T1's
--     word_similarity(name, query) (a product name inside a longer caption)
--     has it first; dropping that branch would lose recall.
-- F17 _board_deck_import_candidate_scope(import_id) — NEW. The importer and
--     the one studio whose products they may be offered: the board's studio
--     (board_web_match_studio_key, 00682), and only when the importer is an
--     active member of it. Candidates are catalog products, the importer's
--     own personal products and that studio's products, never another studio
--     the importer also belongs to. Applied to
--       board_deck_import_match_links   00677 → 00678 → 00683
--       board_deck_import_match_sku     00677 → 00683
--       board_deck_import_search_words  00677 → 00683
--       board_deck_import_match_knn     00679 → 00683
--       board_deck_import_look_gate     00679 → 00683
--     Each body is its latest one verbatim apart from the visibility
--     predicate. match_knn stays row-for-row equal to aesthete_ask_knn under
--     the importer's JWT when the board's studio is the importer's only studio
--     (match_knn_parity.test.sql); for a member of two studios it is that
--     result minus the other studio's products.
--
-- Adds REVOKEs → regenerate seed/00-legacy-grants.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── F13: normalizer parity with links.ts ────────────────────────────────────

-- UTF-8 percent-encoding of every character outside printable ASCII
-- (U+0021..U+007E) and of each ASCII character listed in p_also.
CREATE OR REPLACE FUNCTION public._board_deck_import_pct_encode(p_text text, p_also text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(string_agg(
    CASE
      WHEN ascii(c.ch) BETWEEN 33 AND 126 AND strpos(p_also, c.ch) = 0 THEN c.ch
      ELSE regexp_replace(upper(encode(convert_to(c.ch, 'UTF8'), 'hex')), '(..)', '%\1', 'g')
    END,
    '' ORDER BY c.ord), '')
  FROM regexp_split_to_table(p_text, '') WITH ORDINALITY AS c(ch, ord);
$$;

-- RFC 3492 punycode of one host label, with the xn-- prefix.
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
  v_delta integer := 0;
  v_bias integer := 72;
  v_h integer;
  v_b integer;
  v_m integer;
  v_q integer;
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
    v_delta := v_delta + (v_m - v_n) * (v_h + 1);
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
        v_out := v_out || chr(CASE WHEN v_q < 26 THEN 97 + v_q ELSE 22 + v_q END);
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
-- WHATWG percent-encoding. NULL for anything that is not http(s).
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
  v_m := regexp_match(
    btrim(COALESCE(p_url, ''), E' \t\n\r\f\v'),
    '^([Hh][Tt][Tt][Pp][Ss]?)://(?:[^/?#@]*@)?([^/?#:]+)(?::([^/?#]*))?([^?#]*)(?:\?([^#]*))?'
  );
  IF v_m IS NULL THEN
    RETURN NULL;
  END IF;
  v_scheme := lower(v_m[1]);

  FOREACH v_label IN ARRAY string_to_array(lower(normalize(v_m[2], NFKC)), '.') LOOP
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
  'Deck import URL key (00683), byte-compatible with links.ts normalizeProductUrl on '
  'the lookup_indexes.test.sql vectors. Indexed by idx_products_deck_import_source_url: '
  'a body change must REINDEX that index.';

REVOKE ALL ON FUNCTION public._board_deck_import_pct_encode(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._board_deck_import_punycode(text)
  FROM PUBLIC, anon, authenticated, service_role;

-- ── F12: T0a by index ───────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_products_deck_import_source_url
  ON public.products (public._board_deck_import_normalize_url(source_url))
  WHERE source_url IS NOT NULL AND deleted_at IS NULL AND merged_into_id IS NULL;

-- ── F17: the board's studio, not every studio the importer belongs to ───────

CREATE OR REPLACE FUNCTION public._board_deck_import_candidate_scope(p_import_id uuid)
RETURNS TABLE (user_id uuid, studio_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT deck_import.created_by,
         (
           SELECT membership.organization_id
           FROM public.organization_members AS membership
           WHERE membership.user_id = deck_import.created_by
             AND membership.status = 'active'
             AND membership.organization_id = public.board_web_match_studio_key(deck_import.id)
           LIMIT 1
         )
  FROM public.board_deck_imports AS deck_import
  WHERE deck_import.id = p_import_id;
$$;

REVOKE ALL ON FUNCTION public._board_deck_import_candidate_scope(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- T0a: products whose normalized source_url is one of the links, the
-- importer's own library first; plus vendor names for the link domains.
-- The vendor lookup is step 1 of _board_deck_import_resolve_vendor (host
-- equality, oldest first) without its stub insert: reading a link must not
-- create vendors; the keep path still resolves/creates one.
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
  v_products jsonb;
  v_vendors jsonb;
BEGIN
  SELECT scope.user_id, scope.studio_id INTO v_user, v_studio
  FROM public._board_deck_import_candidate_scope(p_import_id) AS scope;
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
  v_studio uuid;
  v_sku text := lower(btrim(COALESCE(p_sku, '')));
  v_vendor text := lower(btrim(COALESCE(p_vendor, '')));
BEGIN
  SELECT scope.user_id, scope.studio_id INTO v_user, v_studio
  FROM public._board_deck_import_candidate_scope(p_import_id) AS scope;
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
        AND (
          product.layer = 'catalog'
          OR (product.layer = 'personal' AND product.owner_user_id = v_user)
          OR (product.layer = 'studio' AND product.studio_id = v_studio)
        )
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
  v_studio uuid;
  v_query text := lower(btrim(left(COALESCE(p_query, ''), 200)));
  v_vendor text := NULLIF(lower(btrim(COALESCE(p_vendor, ''))), '');
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 5), 1), 10);
BEGIN
  SELECT scope.user_id, scope.studio_id INTO v_user, v_studio
  FROM public._board_deck_import_candidate_scope(p_import_id) AS scope;
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
        AND (
          product.layer = 'catalog'
          OR (product.layer = 'personal' AND product.owner_user_id = v_user)
          OR (product.layer = 'studio' AND product.studio_id = v_studio)
        )
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

-- T2: the kNN twin of aesthete_ask_knn (00679), scoped to the board's studio.
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
    AND (
      product.layer = 'catalog'
      OR (product.layer = 'personal' AND product.owner_user_id = v_user)
      OR (product.layer = 'studio' AND product.studio_id = v_studio)
    )
  ORDER BY product.aesthete_vector <=> p_embedding, product.id
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.board_deck_import_match_knn(uuid, vector, integer, text) IS
  'Deck import T2 (00679, scoped 00683): kNN over products.aesthete_vector as the importing '
  'user (board_deck_imports.created_by) sees it under the 00152 rules, studio products '
  'limited to the board''s studio. Service-role twin of the INVOKER aesthete_ask_knn '
  '(00247); parity asserted by supabase/tests/deck_import/match_knn_parity.test.sql.';

CREATE OR REPLACE FUNCTION public.board_deck_import_look_gate(p_import_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_import public.board_deck_imports%ROWTYPE;
  v_studio uuid;
  v_count integer;
BEGIN
  SELECT * INTO v_import FROM public.board_deck_imports WHERE id = p_import_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deck import not found' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT scope.studio_id INTO v_studio
  FROM public._board_deck_import_candidate_scope(p_import_id) AS scope;
  SELECT count(*)::integer INTO v_count
  FROM (
    SELECT 1
    FROM public.products AS product
    WHERE product.aesthete_vector IS NOT NULL
      AND product.deleted_at IS NULL
      AND product.merged_into_id IS NULL
      AND (
        product.layer = 'catalog'
        OR (product.layer = 'personal' AND product.owner_user_id = v_import.created_by)
        OR (product.layer = 'studio' AND product.studio_id = v_studio)
      )
    LIMIT 1000
  ) AS visible;
  RETURN jsonb_build_object(
    'photo_match', COALESCE(v_import.options->'photo_match' = 'true'::jsonb, false),
    'visible_vectors', v_count
  );
END;
$$;
