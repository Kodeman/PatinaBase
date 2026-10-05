-- ═══════════════════════════════════════════════════════════════════════════
-- 00687 — Board deck import settle race (US-15, SQ-383; found by SQ-364 e2e)
--
-- Symptom: an import stays 'resolving' after every piece has settled. The
-- resolver records from concurrent lanes. _board_deck_import_settle's
-- NOT EXISTS-pending check runs under READ COMMITTED, so the last two
-- concurrent records each saw the other's piece still pending and neither
-- settled the import. Nothing swept it afterwards.
--
-- (a) Prevent it. Every path that writes a piece and then settles takes the
--     import row FOR UPDATE before it locks the piece. Writes within one
--     import serialize, and the second one's statements see the first's
--     committed piece. Lock order, everywhere: import row, then piece rows.
--       _board_deck_import_lock_item     00676 → 00687 (keep, swap via
--                                        _board_deck_import_choose;
--                                        reference; unkeep)
--       _board_deck_import_record        00678 → 00687
--       pair_board_deck_import_link      00677 → 00678 → 00687
--       record_board_web_match_result    00680 → 00687
--       claim_board_deck_import_items_for_import  00677 → 00678 → 00687
--     Already import-first, unchanged: register_board_deck_import (00679),
--     attach_board_deck_import_pins (00676),
--     materialize_board_deck_import_links (00677).
--     release_board_deck_import_items (00682) locks pieces only and never
--     waits on an import afterwards, so it cannot close a cycle.
--
-- (b) Repair. claim_board_deck_import_items (00678 → 00687) first settles up
--     to 50 'resolving' imports with no pending piece and no live lease. The
--     imports are taken FOR UPDATE SKIP LOCKED: one being written is left for
--     the next claim, and the claim never waits on an import while it holds a
--     piece. Its expired-lease sweep now also locks the import rows first
--     (SKIP LOCKED) and backs off only those imports' pieces, so its settle
--     no longer locks an import after a piece. The pick still locks pieces
--     only, with SKIP LOCKED, after every import lock it takes.
--
-- Bodies are the latest ones (named above) verbatim, plus the locks.
-- No GRANT/REVOKE change: CREATE OR REPLACE keeps the existing ACLs.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (a) Piece lock for designer decisions: import first ─────────────────────

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
  v_import_id uuid;
  v_board_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 00687: the import row first, then the piece.
  SELECT import_id INTO v_import_id
  FROM public.board_deck_import_items
  WHERE id = p_item_id;
  IF FOUND THEN
    SELECT board_id INTO v_board_id
    FROM public.board_deck_imports WHERE id = v_import_id
    FOR UPDATE;
    SELECT * INTO v_item
    FROM public.board_deck_import_items
    WHERE id = p_item_id
    FOR UPDATE;
  END IF;
  IF NOT FOUND OR NOT public.can_manage_board_deck_import(v_board_id) THEN
    RAISE EXCEPTION 'deck import piece unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN v_item;
END;
$$;

-- ── (a) Resolver writes: import first ───────────────────────────────────────

-- The 00678 record body. p_lease_owner NULL is the internal pairing path
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
  v_import_id uuid;
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

  -- 00687: the import row first, so records within one import serialize and
  -- the settle below sees every earlier record's committed piece.
  SELECT import_id INTO v_import_id
  FROM public.board_deck_import_items
  WHERE id = p_item_id;
  IF FOUND THEN
    PERFORM 1 FROM public.board_deck_imports WHERE id = v_import_id FOR UPDATE;
    SELECT * INTO v_item
    FROM public.board_deck_import_items
    WHERE id = p_item_id
    FOR UPDATE;
  END IF;
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
  v_import_id uuid;
BEGIN
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

-- The 00680 body. Appends web candidates to a found / not_found piece whose
-- candidates are still p_base_candidates; see 00680 for the full contract.
CREATE OR REPLACE FUNCTION public.record_board_web_match_result(
  p_item_id uuid,
  p_candidates jsonb,
  p_base_candidates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item public.board_deck_import_items%ROWTYPE;
  v_import_id uuid;
  v_base jsonb := COALESCE(p_base_candidates, '[]'::jsonb);
  v_base_len integer;
  v_prefix jsonb;
BEGIN
  IF jsonb_typeof(p_candidates) IS DISTINCT FROM 'array' OR jsonb_typeof(v_base) <> 'array' THEN
    RAISE EXCEPTION 'candidates must be arrays' USING ERRCODE = 'check_violation';
  END IF;
  v_base_len := jsonb_array_length(v_base);
  IF jsonb_array_length(p_candidates) <= v_base_len THEN
    RAISE EXCEPTION 'nothing to append' USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(jsonb_agg(entry.value ORDER BY entry.ord), '[]'::jsonb) INTO v_prefix
  FROM jsonb_array_elements(p_candidates) WITH ORDINALITY AS entry(value, ord)
  WHERE entry.ord <= v_base_len;
  IF v_prefix <> v_base OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_candidates) WITH ORDINALITY AS entry(value, ord)
    WHERE entry.ord > v_base_len AND entry.value->>'source' IS DISTINCT FROM 'web'
  ) THEN
    RAISE EXCEPTION 'only web candidates may be appended' USING ERRCODE = 'check_violation';
  END IF;

  -- 00687: the import row first, then the piece.
  SELECT import_id INTO v_import_id
  FROM public.board_deck_import_items
  WHERE id = p_item_id;
  IF FOUND THEN
    PERFORM 1 FROM public.board_deck_imports WHERE id = v_import_id FOR UPDATE;
    SELECT * INTO v_item
    FROM public.board_deck_import_items
    WHERE id = p_item_id
    FOR UPDATE;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deck import piece not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_item.state NOT IN ('found', 'not_found') OR v_item.candidates <> v_base THEN
    RETURN jsonb_build_object(
      'item_id', p_item_id, 'import_id', v_item.import_id,
      'state', v_item.state, 'applied', false
    );
  END IF;

  RETURN public._board_deck_import_record(
    p_item_id,
    'found',
    CASE WHEN v_base_len = 0 THEN 'web' ELSE COALESCE(v_item.found_by, 'web') END,
    p_candidates,
    NULL
  );
END;
$$;

-- ── (a) + (b) Claims ────────────────────────────────────────────────────────

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
  -- 00687 (b): an import left 'resolving' with nothing pending and no live
  -- lease is settled. An import being written right now is skipped; the
  -- next claim gets it.
  FOR v_import_id IN
    SELECT deck_import.id
    FROM public.board_deck_imports AS deck_import
    WHERE deck_import.status = 'resolving'
      AND NOT EXISTS (
        SELECT 1 FROM public.board_deck_import_items AS item
        WHERE item.import_id = deck_import.id
          AND (item.state = 'pending'
               OR (item.lease_until IS NOT NULL AND item.lease_until > now()))
      )
    ORDER BY deck_import.created_at, deck_import.id
    LIMIT 50
    FOR UPDATE OF deck_import SKIP LOCKED
  LOOP
    PERFORM public._board_deck_import_settle(v_import_id);
  END LOOP;

  -- F1: a piece whose run died is backed off, not handed out again first.
  -- 00687: its import rows are locked first (SKIP LOCKED), then its pieces.
  SELECT COALESCE(array_agg(locked.id), '{}'::uuid[])
  INTO v_expired_imports
  FROM (
    SELECT deck_import.id
    FROM public.board_deck_imports AS deck_import
    WHERE EXISTS (
      SELECT 1 FROM public.board_deck_import_items AS item
      WHERE item.import_id = deck_import.id
        AND item.state = 'pending'
        AND item.lease_until IS NOT NULL
        AND item.lease_until <= now()
    )
    FOR UPDATE OF deck_import SKIP LOCKED
  ) AS locked;

  UPDATE public.board_deck_import_items
  SET lease_owner = NULL,
      lease_until = NULL,
      state = CASE WHEN attempts >= c_max_attempts THEN 'not_found' ELSE state END,
      next_attempt_at = CASE
        WHEN attempts >= c_max_attempts THEN next_attempt_at
        ELSE now() + make_interval(mins => LEAST(power(2, attempts)::integer, 60))
      END
  WHERE import_id = ANY(v_expired_imports)
    AND state = 'pending'
    AND lease_until IS NOT NULL
    AND lease_until <= now();
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
  -- 00687: the import row first, then its pieces.
  PERFORM 1 FROM public.board_deck_imports WHERE id = p_import_id FOR UPDATE;

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
