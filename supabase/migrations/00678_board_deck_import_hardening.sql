-- ═══════════════════════════════════════════════════════════════════════════
-- 00678 — Bring in a Deck: resolver and Keep hardening (US-15, SQ-367 fixing
--         the SQ-366 review findings)
--
-- F1  An expired lease no longer re-heads the queue: the claim sweep that
--     frees it also backs the piece off (2^attempts min, ≤60), the same
--     backoff record_board_deck_import_resolution gives a 'pending' result.
--     A run that died mid-piece (timeout, crash) therefore cannot be handed
--     the same hostile piece first, forever.
-- F3  Keep of a page candidate mints the capture under a uuidv5 name that
--     includes the keeper (item | uid | url), so a second designer's Keep no
--     longer lands on the first designer's personal product; and Keep checks
--     the product it is about to return is visible to the caller.
-- F4  Keep that gives a link piece its picture (p_board_item_id) refuses a
--     pin that has gone onward (_board_deck_import_assert_pin_movable) or
--     that another import piece already holds (HINT 'pin_taken').
-- F5  Adjudication ledger: a 'failed' slide may be tried once more; a
--     'pending' slide older than the 3 min lease is reclaimable (the run that
--     claimed it died or hit a transient error and stored nothing).
-- F6  Per-studio, per-UTC-day Claude cap: board_deck_import_studio_link_days
--     gains adjudications_used; past 200 a claim is denied (reason
--     'studio_day_cap') and the slide resolves deterministically.
-- F7  Every resolver write takes the lease owner its claim returned and is
--     refused (lock_not_available) once that lease is gone:
--       record_board_deck_import_resolution  — the piece's own lease;
--       consume_board_deck_import_link_quota,
--       claim_/store_board_deck_import_adjudication — some piece of the
--         import still leased to that owner.
--     These four change signature (DROP + CREATE, new trailing p_lease_owner
--     text, no default) so an old caller fails loudly instead of writing
--     unchecked. pair_board_deck_import_link keeps its signature: it only
--     pairs a link row this run already recorded (lease-checked) onto a
--     picture nobody leases, and now also refuses a link row someone leases.
-- F8  claim_board_deck_import_items takes pieces round-robin across imports
--     (row_number per import), so one large deck cannot take a whole batch
--     while other imports wait.
-- F14 Vendors match on exact host (lowercased, www. dropped), not
--     ILIKE '%domain%' (h.com no longer matches rh.com); the stub vendor
--     insert is race-safe through ON CONFLICT on idx_vendors_website_lower.
-- F2  Placement of a deck-import Keep product with no trade price (the
--     product's capture_provenance.producer = 'board_deck_import', which is
--     what Keep writes) leaves trade_price_cents NULL instead of copying
--     retail into trade (R-DI4). Every other product keeps the old fallback.
--
-- Lineage (bodies copied verbatim from the grep|sort|tail -1 winner, delta
-- grafted):
--   claim_board_deck_import_items              00676 → 00678
--   claim_board_deck_import_items_for_import   00677 → 00678
--   record_board_deck_import_resolution        00676 → 00678 (body moved to
--                                              _board_deck_import_record)
--   pair_board_deck_import_link                00677 → 00678
--   consume_board_deck_import_link_quota       00677 → 00678
--   claim_board_deck_import_adjudication       00677 → 00678
--   store_board_deck_import_adjudication       00677 → 00678
--   board_deck_import_match_links              00677 → 00678
--   _board_deck_import_resolve_vendor          00676 → 00678
--   _board_deck_import_choose                  00676 → 00678
--   _place_product_in_project_v2_00438_impl    00435 → (00439 rename) →
--                                              00666 → 00678
--
-- Deploy order: this migration, then the board-deck-import-resolve function
-- (which sends p_lease_owner). Between the two, cron runs of the old function
-- fail their writes and the pieces back off; nothing is written unchecked.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── F1 + F8: claims ─────────────────────────────────────────────────────────

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
  -- F1: a piece whose run died is backed off, not handed out again first.
  WITH expired AS (
    UPDATE public.board_deck_import_items
    SET lease_owner = NULL,
        lease_until = NULL,
        state = CASE WHEN attempts >= c_max_attempts THEN 'not_found' ELSE state END,
        next_attempt_at = CASE
          WHEN attempts >= c_max_attempts THEN next_attempt_at
          ELSE now() + make_interval(mins => LEAST(power(2, attempts)::integer, 60))
        END
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

  -- F8: each import's eligible pieces are numbered (turn); the batch takes
  -- turn 1 of every import before turn 2 of any.
  WITH eligible AS MATERIALIZED (
    SELECT item.id,
           item.import_id,
           deck_import.created_at AS import_created_at,
           row_number() OVER (
             PARTITION BY item.import_id
             ORDER BY item.next_attempt_at NULLS FIRST, item.slide_index, item.element_key
           ) AS turn
    FROM public.board_deck_import_items AS item
    JOIN public.board_deck_imports AS deck_import ON deck_import.id = item.import_id
    WHERE item.state = 'pending'
      AND deck_import.status = 'resolving'
      AND item.attempts < c_max_attempts
      AND (item.lease_until IS NULL OR item.lease_until <= now())
      AND (item.next_attempt_at IS NULL OR item.next_attempt_at <= now())
  ),
  picked AS (
    SELECT item.id
    FROM public.board_deck_import_items AS item
    JOIN eligible ON eligible.id = item.id
    WHERE eligible.turn <= v_limit
      AND item.state = 'pending'
      AND item.attempts < c_max_attempts
      AND (item.lease_until IS NULL OR item.lease_until <= now())
    ORDER BY eligible.turn, eligible.import_created_at, eligible.import_id
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
  -- F1: as the global claim, an expired lease is backed off.
  UPDATE public.board_deck_import_items
  SET lease_owner = NULL,
      lease_until = NULL,
      state = CASE WHEN attempts >= c_max_attempts THEN 'not_found' ELSE state END,
      next_attempt_at = CASE
        WHEN attempts >= c_max_attempts THEN next_attempt_at
        ELSE now() + make_interval(mins => LEAST(power(2, attempts)::integer, 60))
      END
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

-- ── F7: lease-checked writes ────────────────────────────────────────────────

-- The 00676 record body. p_lease_owner NULL is the internal pairing path
-- (the picture is checked unleased by its caller); otherwise the piece must
-- still be leased to that owner.
CREATE OR REPLACE FUNCTION public._board_deck_import_record(
  p_item_id uuid,
  p_state text,
  p_found_by text,
  p_candidates jsonb,
  p_lease_owner text
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

  IF p_lease_owner IS NOT NULL AND (
    v_item.lease_owner IS DISTINCT FROM p_lease_owner
    OR v_item.lease_until IS NULL
    OR v_item.lease_until <= now()
  ) THEN
    RAISE EXCEPTION 'deck import lease expired or not held' USING ERRCODE = 'lock_not_available';
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

REVOKE ALL ON FUNCTION public._board_deck_import_record(uuid, text, text, jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.record_board_deck_import_resolution(uuid, text, text, jsonb);

-- p_state: 'found' | 'not_found' | 'pending' (retry later with backoff).
-- A piece the designer already decided (kept, reference, removed) is left
-- alone: a late resolver result never overwrites her decision. A result from
-- a run that no longer holds the piece's lease is refused.
CREATE OR REPLACE FUNCTION public.record_board_deck_import_resolution(
  p_item_id uuid,
  p_state text,
  p_found_by text,
  p_candidates jsonb,
  p_lease_owner text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NULLIF(btrim(COALESCE(p_lease_owner, '')), '') IS NULL THEN
    RAISE EXCEPTION 'deck import lease expired or not held' USING ERRCODE = 'lock_not_available';
  END IF;
  RETURN public._board_deck_import_record(p_item_id, p_state, p_found_by, p_candidates, p_lease_owner);
END;
$$;

REVOKE ALL ON FUNCTION public.record_board_deck_import_resolution(uuid, text, text, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_board_deck_import_resolution(uuid, text, text, jsonb, text)
  TO service_role;

-- The picture takes the link's candidates (_board_deck_import_record
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
     OR (v_link.lease_until IS NOT NULL AND v_link.lease_until > now())
     OR v_picture.board_item_id IS NULL
     OR v_picture.role <> 'product'
     OR v_picture.state NOT IN ('pending', 'not_found')
     OR (v_picture.lease_until IS NOT NULL AND v_picture.lease_until > now()) THEN
    RETURN false;
  END IF;

  PERFORM public._board_deck_import_record(
    p_picture_item_id, 'found', 'link', p_candidates, NULL);
  DELETE FROM public.board_deck_import_items WHERE id = p_link_item_id;
  PERFORM public._board_deck_import_settle(v_link.import_id);
  RETURN true;
END;
$$;

-- Import-grain writes (quota, adjudication): the caller must still lease at
-- least one piece of the import.
CREATE OR REPLACE FUNCTION public._board_deck_import_assert_lease(
  p_import_id uuid,
  p_lease_owner text
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NULLIF(btrim(COALESCE(p_lease_owner, '')), '') IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.board_deck_import_items AS item
    WHERE item.import_id = p_import_id
      AND item.lease_owner = p_lease_owner
      AND item.lease_until > now()
  ) THEN
    RAISE EXCEPTION 'deck import lease expired or not held' USING ERRCODE = 'lock_not_available';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._board_deck_import_assert_lease(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.consume_board_deck_import_link_quota(uuid, integer);

-- Grants up to p_n links: min(requested, import remaining, studio-day
-- remaining). granted = 0 is a denial; the caller resolves link-only.
CREATE OR REPLACE FUNCTION public.consume_board_deck_import_link_quota(
  p_import_id uuid,
  p_n integer,
  p_lease_owner text
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
  PERFORM public._board_deck_import_assert_lease(p_import_id, p_lease_owner);
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

REVOKE ALL ON FUNCTION public.consume_board_deck_import_link_quota(uuid, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_board_deck_import_link_quota(uuid, integer, text)
  TO service_role;

-- ── F5 + F6: adjudication ledger ────────────────────────────────────────────

ALTER TABLE public.board_deck_import_studio_link_days
  ADD COLUMN IF NOT EXISTS adjudications_used integer NOT NULL DEFAULT 0
    CHECK (adjudications_used >= 0);

COMMENT ON TABLE public.board_deck_import_studio_link_days IS
  'Per-studio, per-UTC-day deck link reads against the 1500-per-day quota (00677) and '
  'Claude slide adjudications against the 200-per-day cap (00678). Separate from the '
  'capture paste quota, which is unchanged.';

DROP FUNCTION IF EXISTS public.claim_board_deck_import_adjudication(uuid, integer);

-- cached: assignments stored. granted: call Claude, then store. denied: no
-- call (already tried, per-import cap of 20 slides, or the studio's 200 per
-- day). A 'failed' slide is granted once more; a 'pending' slide whose claim
-- is older than the 3 min lease is granted again (that run stored nothing).
CREATE OR REPLACE FUNCTION public.claim_board_deck_import_adjudication(
  p_import_id uuid,
  p_slide_index integer,
  p_lease_owner text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_max_per_import constant integer := 20;
  c_studio_day_limit constant integer := 200;
  c_max_failures constant integer := 2;
  c_pending_lease constant interval := interval '3 minutes';
  v_usage public.board_deck_import_link_usage%ROWTYPE;
  v_entry jsonb;
  v_failures integer;
  v_day date := (now() AT TIME ZONE 'UTC')::date;
  v_used integer;
BEGIN
  PERFORM public._board_deck_import_assert_lease(p_import_id, p_lease_owner);
  v_usage := public._board_deck_import_usage_row(p_import_id);
  v_entry := v_usage.adjudications->(p_slide_index::text);
  IF v_entry IS NOT NULL AND jsonb_typeof(v_entry->'assignments') = 'array' THEN
    RETURN jsonb_build_object('status', 'cached', 'assignments', v_entry->'assignments');
  END IF;

  -- A 00677 'failed' entry carries no count: it is one failure.
  v_failures := COALESCE(
    CASE WHEN (v_entry->>'failures') ~ '^[0-9]{1,4}$' THEN (v_entry->>'failures')::integer END,
    CASE WHEN v_entry->>'state' = 'failed' THEN 1 ELSE 0 END
  );
  IF v_entry IS NOT NULL THEN
    IF NOT (
      (v_entry->>'state' = 'failed' AND v_failures < c_max_failures)
      OR (
        v_entry->>'state' = 'pending'
        AND COALESCE((v_entry->>'at')::timestamptz, '-infinity'::timestamptz) <= now() - c_pending_lease
      )
    ) THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
  ELSIF (SELECT count(*) FROM jsonb_object_keys(v_usage.adjudications)) >= c_max_per_import THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;

  INSERT INTO public.board_deck_import_studio_link_days (studio_key, day)
  VALUES (v_usage.studio_key, v_day)
  ON CONFLICT (studio_key, day) DO NOTHING;
  SELECT adjudications_used INTO v_used
  FROM public.board_deck_import_studio_link_days
  WHERE studio_key = v_usage.studio_key AND day = v_day
  FOR UPDATE;
  IF v_used >= c_studio_day_limit THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'studio_day_cap');
  END IF;
  UPDATE public.board_deck_import_studio_link_days
  SET adjudications_used = adjudications_used + 1
  WHERE studio_key = v_usage.studio_key AND day = v_day;

  UPDATE public.board_deck_import_link_usage
  SET adjudications = adjudications || jsonb_build_object(
        p_slide_index::text,
        jsonb_build_object('state', 'pending', 'at', now(), 'failures', v_failures)),
      updated_at = now()
  WHERE import_id = p_import_id;
  RETURN jsonb_build_object('status', 'granted');
END;
$$;

DROP FUNCTION IF EXISTS public.store_board_deck_import_adjudication(uuid, integer, jsonb);

-- p_assignments NULL records a failed call; the claim allows one more try.
CREATE OR REPLACE FUNCTION public.store_board_deck_import_adjudication(
  p_import_id uuid,
  p_slide_index integer,
  p_assignments jsonb,
  p_lease_owner text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_usage public.board_deck_import_link_usage%ROWTYPE;
  v_entry jsonb;
  v_failures integer;
BEGIN
  IF p_assignments IS NOT NULL
     AND (jsonb_typeof(p_assignments) <> 'array' OR octet_length(p_assignments::text) > 32768) THEN
    RAISE EXCEPTION 'assignments must be a small array' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM public._board_deck_import_assert_lease(p_import_id, p_lease_owner);
  v_usage := public._board_deck_import_usage_row(p_import_id);
  v_entry := v_usage.adjudications->(p_slide_index::text);
  v_failures := COALESCE(
    CASE WHEN (v_entry->>'failures') ~ '^[0-9]{1,4}$' THEN (v_entry->>'failures')::integer END,
    0
  );
  UPDATE public.board_deck_import_link_usage
  SET adjudications = adjudications || jsonb_build_object(
        p_slide_index::text,
        CASE WHEN p_assignments IS NULL
          THEN jsonb_build_object('state', 'failed', 'at', now(), 'failures', v_failures + 1)
          ELSE jsonb_build_object('assignments', p_assignments, 'at', now()) END),
      updated_at = now()
  WHERE import_id = p_import_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_board_deck_import_adjudication(uuid, integer, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_board_deck_import_adjudication(uuid, integer, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_board_deck_import_adjudication(uuid, integer, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.store_board_deck_import_adjudication(uuid, integer, jsonb, text)
  TO service_role;

-- ── F14: vendors by exact host ──────────────────────────────────────────────

-- Host of a URL or bare website value: lowercased, leading www. dropped.
-- The scheme is optional because vendors.website is free text ('rh.com').
CREATE OR REPLACE FUNCTION public._board_deck_import_url_host(p_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(regexp_replace(
    lower(substring(
      btrim(COALESCE(p_url, ''))
      FROM '^(?:[A-Za-z][A-Za-z0-9+.-]*://)?(?:[^/?#@]*@)?([^/?#:]+)'
    )),
    '^www\.', ''
  ), '');
$$;

REVOKE ALL ON FUNCTION public._board_deck_import_url_host(text)
  FROM PUBLIC, anon, authenticated, service_role;

-- SQL port of resolveVendor (packages/supabase/src/lib/vendors.ts), host-exact:
-- 1. a vendor whose website host is the link host (lowercased, www. dropped),
--    oldest first; 2. exact case-insensitive name; 3. insert a stub named
--    name → domain → 'Unknown vendor', website https://<domain>, converging
--    with a concurrent insert of the same website.
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

  INSERT INTO public.vendors (name, website)
  VALUES (
    COALESCE(v_name, v_domain, 'Unknown vendor'),
    CASE WHEN v_domain IS NOT NULL THEN 'https://' || v_domain END
  )
  ON CONFLICT ((lower(website))) WHERE website IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    -- A concurrent Keep inserted the same stub first (idx_vendors_website_lower).
    SELECT vendor.id INTO v_id
    FROM public.vendors AS vendor
    WHERE lower(vendor.website) = lower('https://' || v_domain);
  END IF;
  RETURN v_id;
END;
$$;

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
      ON public._board_deck_import_url_host(vendor.website) = domains.domain
    WHERE domain IS NOT NULL
    ORDER BY domain, vendor.created_at ASC NULLS LAST, vendor.id
  ) AS named;

  RETURN jsonb_build_object('products', v_products, 'vendors', v_vendors);
END;
$$;

-- ── F3 + F4: Keep ───────────────────────────────────────────────────────────

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
    -- F4: a newly attached pin must not have gone onward, nor be another
    -- piece's picture.
    IF v_item.board_item_id IS NULL THEN
      PERFORM public._board_deck_import_assert_pin_movable(p_board_item_id);
      IF EXISTS (
        SELECT 1 FROM public.board_deck_import_items AS other
        WHERE other.board_item_id = p_board_item_id AND other.id <> p_item_id
      ) THEN
        RAISE EXCEPTION 'that picture already belongs to another piece'
          USING ERRCODE = 'check_violation', HINT = 'pin_taken';
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

-- ── F2: a deck-import Keep product carries no trade price into the line ─────

CREATE OR REPLACE FUNCTION public._place_product_in_project_v2_00438_impl(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project_id uuid := NULLIF(p_request->>'projectId', '')::uuid;
  v_product_id uuid := NULLIF(p_request->>'productId', '')::uuid;
  v_room_id uuid := NULLIF(p_request->>'roomId', '')::uuid;
  v_board_id uuid := NULLIF(p_request->>'boardId', '')::uuid;
  v_placeholder_id uuid := NULLIF(p_request->>'placeholderSelectionId', '')::uuid;
  v_reference_id uuid := NULLIF(p_request->>'selectionReferenceId', '')::uuid;
  v_thread_id uuid := NULLIF(p_request->>'selectionThreadId', '')::uuid;
  v_configuration_id uuid := NULLIF(p_request->>'configurationId', '')::uuid;
  v_assignment text := COALESCE(NULLIF(p_request->>'assignmentScope', ''), 'unassigned');
  v_disposition text := COALESCE(NULLIF(p_request->>'disposition', ''), 'candidate');
  v_duplicate text := COALESCE(NULLIF(p_request->>'duplicateMode', ''), 'reuse');
  v_key text := NULLIF(btrim(p_request->>'idempotencyKey'), '');
  v_hash text;
  v_existing_hash text;
  v_response jsonb;
  v_product public.products%ROWTYPE;
  v_item public.project_ffe_items%ROWTYPE;
  v_board public.proposal_boards%ROWTYPE;
  v_vendor_name text;
  v_placement_id uuid;
  v_inserted integer;
  v_outcome text;
  -- 00678 F2: a deck-import Keep product with only a retail price.
  v_retail_only boolean := false;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF p_request IS NULL OR jsonb_typeof(p_request) <> 'object' OR v_project_id IS NULL THEN
    RAISE EXCEPTION 'placement request must name a project' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM public._ffe_require_studio_project(v_project_id);
  IF v_key IS NULL OR char_length(v_key) > 200 THEN
    RAISE EXCEPTION 'idempotencyKey is required and must be at most 200 characters'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_assignment NOT IN ('room', 'throughout', 'unassigned')
     OR v_disposition NOT IN ('candidate', 'selected', 'alternate', 'not_selected')
     OR v_duplicate NOT IN ('reuse', 'create', 'hold')
  THEN RAISE EXCEPTION 'invalid placement routing choice' USING ERRCODE = 'check_violation'; END IF;
  IF (v_assignment = 'room') <> (v_room_id IS NOT NULL) THEN
    RAISE EXCEPTION 'room assignment requires exactly one project room'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_room_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_rooms room WHERE room.id = v_room_id AND room.project_id = v_project_id
  ) THEN RAISE EXCEPTION 'room does not belong to project' USING ERRCODE = 'integrity_constraint_violation'; END IF;

  v_hash := encode(extensions.digest(p_request::text, 'sha256'), 'hex');
  INSERT INTO public.project_ffe_command_idempotency(actor_id, idempotency_key, request_hash)
  VALUES (v_actor, v_key, v_hash) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    SELECT request_hash, response INTO v_existing_hash, v_response
    FROM public.project_ffe_command_idempotency
    WHERE actor_id = v_actor AND idempotency_key = v_key FOR UPDATE;
    IF v_existing_hash <> v_hash THEN
      RAISE EXCEPTION 'idempotency key was used for a different request'
        USING ERRCODE = 'unique_violation';
    END IF;
    IF v_response IS NULL THEN
      RAISE EXCEPTION 'idempotent command is still in progress'
        USING ERRCODE = 'serialization_failure';
    END IF;
    RETURN v_response;
  END IF;

  IF v_duplicate = 'hold' THEN
    v_response := jsonb_build_object('outcome', 'held', 'projectId', v_project_id);
    UPDATE public.project_ffe_command_idempotency SET response = v_response
    WHERE actor_id = v_actor AND idempotency_key = v_key;
    RETURN v_response;
  END IF;

  IF v_product_id IS NOT NULL THEN
    SELECT * INTO v_product FROM public.products WHERE id = v_product_id;
    IF NOT FOUND OR v_product.deleted_at IS NOT NULL OR v_product.merged_into_id IS NOT NULL OR NOT (
      v_product.layer = 'catalog'
      OR (v_product.layer = 'personal' AND v_product.owner_user_id = v_actor)
      OR (v_product.layer = 'studio' AND EXISTS (
        SELECT 1 FROM public.organization_members member
        WHERE member.organization_id = v_product.studio_id
          AND member.user_id = v_actor AND member.status = 'active'
      ))
    ) THEN RAISE EXCEPTION 'product not found or not accessible' USING ERRCODE = 'insufficient_privilege'; END IF;
    SELECT name INTO v_vendor_name FROM public.vendors WHERE id = v_product.vendor_id;
    -- R-DI4: a price read off a deck or its page is retail; it is not trade.
    v_retail_only := v_product.price_trade IS NULL
      AND COALESCE(v_product.capture_provenance->>'producer', '') = 'board_deck_import';
  END IF;

  IF v_reference_id IS NOT NULL THEN
    SELECT * INTO v_item FROM public.project_ffe_items
    WHERE id = v_reference_id AND project_id = v_project_id AND removed_at IS NULL FOR UPDATE;
    IF NOT FOUND OR (v_product_id IS NOT NULL AND v_item.product_id IS DISTINCT FROM v_product_id) THEN
      RAISE EXCEPTION 'selection reference does not match the project/product'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    v_outcome := 'reused';
  ELSIF v_placeholder_id IS NOT NULL THEN
    SELECT * INTO v_item FROM public.project_ffe_items
    WHERE id = v_placeholder_id AND project_id = v_project_id FOR UPDATE;
    IF NOT FOUND OR v_item.product_id IS NOT NULL OR v_product_id IS NULL THEN
      RAISE EXCEPTION 'placeholder is unavailable or already filled'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
    UPDATE public.project_ffe_items SET
      product_id = v_product.id,
      name = v_product.name,
      ffe_category = COALESCE(NULLIF(btrim(p_request->>'category'), ''), v_product.category, ffe_category),
      project_room_id = v_room_id,
      assignment_scope = v_assignment,
      design_disposition = v_disposition,
      vendor_id = v_product.vendor_id,
      vendor_name = v_vendor_name,
      trade_price_cents = CASE WHEN v_retail_only THEN NULL
        ELSE COALESCE(v_product.price_trade, v_product.price_retail, 0) END,
      unit_price_cents = COALESCE(v_product.price_retail, v_product.price_trade, 0),
      line_total_cents = quantity * COALESCE(v_product.price_retail, v_product.price_trade, 0),
      currency = 'USD',
      updated_at = now()
    WHERE id = v_item.id RETURNING * INTO v_item;
    v_outcome := 'filled';
  ELSE
    IF v_duplicate = 'reuse' AND v_product_id IS NOT NULL THEN
      SELECT * INTO v_item FROM public.project_ffe_items
      WHERE project_id = v_project_id AND product_id = v_product_id
        AND removed_at IS NULL AND design_disposition NOT IN ('not_selected', 'superseded')
        AND assignment_scope = v_assignment
        AND project_room_id IS NOT DISTINCT FROM v_room_id
      ORDER BY created_at, id LIMIT 1 FOR UPDATE;
    END IF;
    IF v_item.id IS NOT NULL THEN
      v_outcome := 'reused';
    ELSE
      PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
      INSERT INTO public.project_ffe_items (
        project_id, project_room_id, product_id, name, ffe_category,
        quantity, trade_price_cents, unit_price_cents, line_total_cents,
        vendor_id, vendor_name, added_via, sort_order, selection_thread_id,
        design_disposition, assignment_scope
      ) VALUES (
        v_project_id, v_room_id, v_product_id,
        COALESCE(v_product.name, NULLIF(btrim(p_request->>'name'), ''), 'Named need'),
        COALESCE(NULLIF(btrim(p_request->>'category'), ''), v_product.category),
        COALESCE(NULLIF(p_request->>'quantity', '')::integer, 1),
        CASE WHEN v_product_id IS NULL OR v_retail_only THEN NULL ELSE COALESCE(v_product.price_trade, v_product.price_retail, 0) END,
        CASE WHEN v_product_id IS NULL THEN 0 ELSE COALESCE(v_product.price_retail, v_product.price_trade, 0) END,
        CASE WHEN v_product_id IS NULL THEN 0 ELSE COALESCE(NULLIF(p_request->>'quantity', '')::integer, 1) * COALESCE(v_product.price_retail, v_product.price_trade, 0) END,
        v_product.vendor_id, v_vendor_name,
        COALESCE(NULLIF(p_request->>'source', ''), 'project-add'),
        COALESCE((SELECT max(sort_order) + 1 FROM public.project_ffe_items WHERE project_id = v_project_id), 0),
        v_thread_id, v_disposition, v_assignment
      ) RETURNING * INTO v_item;
      v_outcome := 'created';
    END IF;
  END IF;

  IF v_configuration_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.product_configurations configuration
      WHERE configuration.id = v_configuration_id
        AND configuration.product_id = v_item.product_id
        AND (configuration.project_id IS NULL OR configuration.project_id = v_project_id)
        AND configuration.is_valid
    ) THEN RAISE EXCEPTION 'configuration does not match the placed product/project' USING ERRCODE = 'integrity_constraint_violation'; END IF;
  END IF;
  INSERT INTO public.project_ffe_specs(ffe_item_id, routing_source, updated_by, configuration_id)
  VALUES (
    v_item.id,
    COALESCE(p_request->'sourceMetadata', '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object('captureId', p_request->>'captureId')),
    v_actor,
    v_configuration_id
  )
  ON CONFLICT (ffe_item_id) DO UPDATE SET
    routing_source = project_ffe_specs.routing_source || EXCLUDED.routing_source,
    updated_by = v_actor,
    configuration_id = COALESCE(EXCLUDED.configuration_id, project_ffe_specs.configuration_id);

  IF v_board_id IS NOT NULL THEN
    SELECT * INTO v_board FROM public.proposal_boards
    WHERE id = v_board_id AND project_id = v_project_id AND proposal_id IS NULL FOR UPDATE;
    IF NOT FOUND OR (v_board.project_room_id IS NOT NULL
       AND v_item.assignment_scope = 'room'
       AND v_board.project_room_id <> v_item.project_room_id)
    THEN RAISE EXCEPTION 'board is not compatible with the project assignment' USING ERRCODE = 'integrity_constraint_violation'; END IF;
    PERFORM set_config('app.board_state_rpc', 'on', true);
    INSERT INTO public.proposal_board_items (
      board_id, type, x, y, width, product_id, image_url, data, project_ffe_item_id
    ) VALUES (
      v_board_id, CASE WHEN v_item.product_id IS NULL THEN 'note' ELSE 'product' END,
      COALESCE(NULLIF(p_request#>>'{placement,x}', '')::numeric, 0),
      COALESCE(NULLIF(p_request#>>'{placement,y}', '')::numeric, 0),
      COALESCE(NULLIF(p_request#>>'{placement,width}', '')::numeric, 240),
      v_item.product_id, CASE WHEN v_product_id IS NULL THEN NULL ELSE v_product.images[1] END,
      jsonb_strip_nulls(jsonb_build_object('name', v_item.name, 'section_id', p_request#>>'{placement,sectionId}')),
      v_item.id
    ) RETURNING id INTO v_placement_id;
  END IF;

  v_response := jsonb_strip_nulls(jsonb_build_object(
    'outcome', v_outcome,
    'projectId', v_project_id,
    'selectionId', v_item.id,
    'threadId', v_item.selection_thread_id,
    'placementId', v_placement_id,
    'productId', v_item.product_id,
    'assignmentScope', v_item.assignment_scope,
    'roomId', v_item.project_room_id
  ));
  UPDATE public.project_ffe_command_idempotency SET response = v_response
  WHERE actor_id = v_actor AND idempotency_key = v_key;
  RETURN v_response;
END;
$$;
