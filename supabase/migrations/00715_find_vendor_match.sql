-- ═══════════════════════════════════════════════════════════════════════════
-- 00715 — find_vendor_match: the R-PB4 resolver, lookup only
-- ═══════════════════════════════════════════════════════════════════════════
-- US-16 Phase 1 (SQ-406, P1-6). R-PB4: a studio's inline new maker resolves an
-- existing shared vendors row FIRST, and when one matches the studio is told
-- "Hewn Woodworks is already in Patina. Use it." before anything is written.
--
-- resolve_or_create_vendor (00696) returns only an id, so a caller cannot tell
-- a match from a fresh insert. This adds the match half on its own:
--
--   find_vendor_match(p_name, p_website) → uuid | NULL
--     1. a vendor whose website host equals the given host (lowercased, www.
--        dropped, scheme optional), oldest first;
--     2. exact case-insensitive (trimmed) name, oldest first;
--     3. NULL. It never inserts.
--
-- The matching is copied VERBATIM from resolve_or_create_vendor in
-- 00696_studio_vendor_accounts.sql (§5). Change one, change both: the UI asks
-- this function first and calls resolve_or_create_vendor only on NULL, so the
-- two must agree on what counts as the same maker. resolve_or_create_vendor is
-- not redefined here.
--
-- Unlike the resolver, empty or invalid input is not an error: with no usable
-- name and no usable host there is nothing to match, so the answer is NULL.
--
-- SECURITY DEFINER with a pinned search_path, like the resolver, so the match
-- sees every vendors row regardless of the caller's read path. Granted to
-- authenticated only.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.find_vendor_match(p_name text, p_website text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_name   text := NULLIF(btrim(p_name), '');
  v_domain text := public._board_deck_import_url_host(p_website);
  v_id     uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'find_vendor_match: not authenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Verbatim from resolve_or_create_vendor (00696 §5): text in the website
  -- field that is not a host ("call Joe") is ignored.
  IF v_domain IS NOT NULL
     AND v_domain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' THEN
    v_domain := NULL;
  END IF;

  IF v_domain IS NOT NULL THEN
    SELECT vendor.id INTO v_id
    FROM public.vendors AS vendor
    WHERE public._board_deck_import_url_host(vendor.website) = v_domain
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

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.find_vendor_match(text, text) IS
  'R-PB4 (00715): the shared vendors row a new maker would resolve to, by website host then '
  'exact name, or NULL. Lookup only; the matching is resolve_or_create_vendor''s (00696), '
  'copied verbatim. The UI calls this first and resolve_or_create_vendor only on NULL.';

REVOKE ALL ON FUNCTION public.find_vendor_match(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_vendor_match(text, text) TO authenticated;
