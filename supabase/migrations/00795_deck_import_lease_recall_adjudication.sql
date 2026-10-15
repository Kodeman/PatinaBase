-- ═══════════════════════════════════════════════════════════════════════════
-- 00795 — Deck import lease consistency, HNSW recall, and adjudication backoff
-- F4: prevent a pin re-ask changing importer scope/options while an item is leased.
-- F7: increase HNSW search breadth before the studio/layer post-filter.
-- F8: back off failed adjudications, do not double-debit retries, and never
--     reclaim an ambiguous pending claim whose provider call may have succeeded.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._board_deck_import_guard_lease_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.options IS DISTINCT FROM OLD.options)
     AND EXISTS (
       SELECT 1 FROM public.board_deck_import_items AS item
       WHERE item.import_id = OLD.id AND item.lease_owner IS NOT NULL
         AND item.lease_until > now()
     ) THEN
    RAISE EXCEPTION 'deck import has a live item lease; retry the re-ask later'
      USING ERRCODE = 'lock_not_available';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._board_deck_import_guard_lease_scope()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS board_deck_import_guard_lease_scope ON public.board_deck_imports;
CREATE TRIGGER board_deck_import_guard_lease_scope
BEFORE UPDATE OF created_by, options ON public.board_deck_imports
FOR EACH ROW EXECUTE FUNCTION public._board_deck_import_guard_lease_scope();

-- Function-local GUC also works on pgvector versions without iterative scans.
-- A wider HNSW candidate search improves recall before studio/layer filtering.
-- Load pgvector so hnsw.ef_search is registered as a USERSET parameter.
SELECT public.vector_dims('[1,2]'::public.vector);
ALTER FUNCTION public.board_deck_import_match_image_knn(uuid, vector, integer, text)
  SET hnsw.ef_search = '400';

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
  c_pending_ttl constant interval := interval '15 minutes';
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
  IF v_entry->>'state' = 'pending'
     AND COALESCE((v_entry->>'at')::timestamptz, '-infinity'::timestamptz)
       <= now() - c_pending_ttl THEN
    UPDATE public.board_deck_import_link_usage
    SET adjudications = adjudications || jsonb_build_object(
          p_slide_index::text,
          jsonb_build_object('state', 'failed', 'at', now(), 'failures', c_max_failures,
                             'terminal', true, 'reason', 'stale_pending')),
        updated_at = now()
    WHERE import_id = p_import_id;
    RETURN jsonb_build_object('status', 'denied', 'reason', 'terminal_failure');
  END IF;

  -- A 00677 'failed' entry carries no count: it is one failure.
  v_failures := COALESCE(
    CASE WHEN (v_entry->>'failures') ~ '^[0-9]{1,4}$' THEN (v_entry->>'failures')::integer END,
    CASE WHEN v_entry->>'state' = 'failed' THEN 1 ELSE 0 END
  );
  IF v_entry IS NOT NULL THEN
    IF NOT (
      (v_entry->>'state' = 'failed' AND v_failures < c_max_failures
       AND COALESCE((v_entry->>'at')::timestamptz, '-infinity'::timestamptz)
         <= now() - (interval '1 minute' * power(2::double precision, GREATEST(v_failures - 1, 0))))
    ) THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
  ELSIF (SELECT count(*) FROM jsonb_object_keys(v_usage.adjudications)) >= c_max_per_import THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;

  -- Only the first attempt reserves a billable slot. Retrying a recorded
  -- failure must not debit the studio again.
  IF v_entry IS NULL THEN
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
  END IF;

  UPDATE public.board_deck_import_link_usage
  SET adjudications = adjudications || jsonb_build_object(
        p_slide_index::text,
        jsonb_build_object('state', 'pending', 'at', now(), 'failures', v_failures)),
      updated_at = now()
  WHERE import_id = p_import_id;
  RETURN jsonb_build_object('status', 'granted');
END;
$$;


REVOKE ALL ON FUNCTION public.claim_board_deck_import_adjudication(uuid, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_board_deck_import_adjudication(uuid, integer, text)
  TO service_role;
