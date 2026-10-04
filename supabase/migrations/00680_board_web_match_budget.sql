-- ═══════════════════════════════════════════════════════════════════════════
-- 00680 — Board web match budget (US-15 W4b, SQ-361)
--
-- "Search the web for this piece" sends a deck crop to Google Cloud Vision
-- Web Detection (board-web-match edge function). Every call is paid after the
-- account's first 1k a month, so each studio gets a monthly call cap:
--
--   board_web_match_settings  one row: the cap (default 500 calls per studio
--                             per UTC month) and the per-call cost in micros
--                             ($3.50 per 1k = 3500). Kody changes the cap with
--                             an UPDATE, no migration.
--   board_web_match_usage     per studio, per UTC month: calls granted and
--                             their cost in micros (the account-level free
--                             1k is not netted out; cost is recorded anyway).
--   consume_board_web_match_budget(studio_id, n)
--                             grants min(n, cap - used) calls and books them
--                             BEFORE the function calls Google. granted = 0 is
--                             a denial; resets_at is the next UTC month start.
--   board_web_match_studio_key(import_id)
--                             the studio a deck import bills to — the same
--                             00677 key the link quota uses (the importer's
--                             studio, else the importer, else the board).
--   record_board_web_match_result(item_id, candidates, base_candidates)
--                             appends web candidates to a settled piece through
--                             00678's _board_deck_import_record (unleased path);
--                             requires 00678 to be applied first.
--
-- RLS: studio members read their studio's usage rows; nobody writes the
-- ledger or the settings except through the service-role RPC.
-- Lineage: new objects only; no function is redefined.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Settings (one row) ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.board_web_match_settings (
  id                    boolean PRIMARY KEY DEFAULT true CHECK (id),
  monthly_call_cap      integer NOT NULL DEFAULT 500 CHECK (monthly_call_cap >= 0),
  cost_micros_per_call  integer NOT NULL DEFAULT 3500 CHECK (cost_micros_per_call >= 0),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.board_web_match_settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.board_web_match_settings IS
  'Single row (00680): the per-studio monthly web-match call cap and the per-call '
  'cost in micros ($3.50 per 1k Vision Web Detection calls). Change with an UPDATE.';

ALTER TABLE public.board_web_match_settings ENABLE ROW LEVEL SECURITY;
-- No policies: read only inside the service-role RPC.
REVOKE ALL ON TABLE public.board_web_match_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.board_web_match_settings TO service_role;

-- ── 2. Usage ledger ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.board_web_match_usage (
  studio_id    uuid NOT NULL,
  month        date NOT NULL CHECK (month = date_trunc('month', month)::date),
  calls        integer NOT NULL DEFAULT 0 CHECK (calls >= 0),
  cost_micros  bigint NOT NULL DEFAULT 0 CHECK (cost_micros >= 0),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (studio_id, month)
);

COMMENT ON TABLE public.board_web_match_usage IS
  'Per-studio, per-UTC-month web-match calls and their cost in micros (00680). '
  'studio_id is the 00677 studio key: an organization id, or the importer''s user '
  'id when she has no studio. Written only by consume_board_web_match_budget.';

ALTER TABLE public.board_web_match_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_web_match_usage_member_read ON public.board_web_match_usage;
CREATE POLICY board_web_match_usage_member_read
  ON public.board_web_match_usage FOR SELECT TO authenticated
  USING (
    studio_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.organization_members AS membership
      WHERE membership.organization_id = board_web_match_usage.studio_id
        AND membership.user_id = auth.uid()
        AND membership.status = 'active'
    )
  );

REVOKE ALL ON TABLE public.board_web_match_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.board_web_match_usage TO authenticated, service_role;

-- ── 3. The studio an import bills to ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.board_web_match_studio_key(p_import_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public._board_deck_import_studio_key(p_import_id);
$$;

REVOKE ALL ON FUNCTION public.board_web_match_studio_key(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.board_web_match_studio_key(uuid)
  TO service_role;

-- ── 4. Consume ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.consume_board_web_match_budget(
  p_studio_id uuid,
  p_n integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_month date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  v_cap integer;
  v_cost integer;
  v_calls integer;
  v_cost_micros bigint;
  v_granted integer;
BEGIN
  IF p_studio_id IS NULL THEN
    RAISE EXCEPTION 'studio_id is required' USING ERRCODE = 'check_violation';
  END IF;
  IF p_n IS NULL OR p_n < 1 OR p_n > 100 THEN
    RAISE EXCEPTION 'n must be 1 to 100' USING ERRCODE = 'check_violation';
  END IF;

  SELECT settings.monthly_call_cap, settings.cost_micros_per_call
  INTO v_cap, v_cost
  FROM public.board_web_match_settings AS settings
  WHERE settings.id;
  v_cap := COALESCE(v_cap, 500);
  v_cost := COALESCE(v_cost, 3500);

  INSERT INTO public.board_web_match_usage (studio_id, month)
  VALUES (p_studio_id, v_month)
  ON CONFLICT (studio_id, month) DO NOTHING;

  SELECT usage.calls, usage.cost_micros INTO v_calls, v_cost_micros
  FROM public.board_web_match_usage AS usage
  WHERE usage.studio_id = p_studio_id AND usage.month = v_month
  FOR UPDATE;

  v_granted := GREATEST(0, LEAST(p_n, v_cap - v_calls));

  IF v_granted > 0 THEN
    UPDATE public.board_web_match_usage
    SET calls = calls + v_granted,
        cost_micros = cost_micros + v_granted::bigint * v_cost,
        updated_at = now()
    WHERE studio_id = p_studio_id AND month = v_month;
  END IF;

  RETURN jsonb_build_object(
    'granted', v_granted,
    'requested', p_n,
    'calls', v_calls + v_granted,
    'cap', v_cap,
    'cost_micros', v_cost_micros + v_granted::bigint * v_cost,
    'resets_at', ((v_month + interval '1 month')::timestamp AT TIME ZONE 'UTC')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_board_web_match_budget(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_board_web_match_budget(uuid, integer)
  TO service_role;

-- ── 5. Record web results ───────────────────────────────────────────────────

-- A web search runs on a settled piece (found / not_found), which no resolver
-- run holds a lease on, so it cannot use the lease-checked
-- record_board_deck_import_resolution (00678). It appends instead, through the
-- same 00678 _board_deck_import_record validation, on three conditions:
--   • the piece is still found / not_found (her decisions are never touched);
--   • its candidates are still p_base_candidates (a concurrent search or a
--     resolver write wins; this one is dropped, applied = false);
--   • p_candidates is p_base_candidates followed only by source 'web' rows.
-- found_by: 'web' for a piece that had nothing; otherwise it keeps how it was
-- found (Keep takes found_by from the chosen candidate).
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

  SELECT * INTO v_item
  FROM public.board_deck_import_items
  WHERE id = p_item_id
  FOR UPDATE;
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

REVOKE ALL ON FUNCTION public.record_board_web_match_result(uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_board_web_match_result(uuid, jsonb, jsonb)
  TO service_role;
