-- ═══════════════════════════════════════════════════════════════════════════
-- 00752 — An allowance filled at or under its ceiling
--         (US-21 slice 4, W5; D10, ruling Q12; T-46, SQ-652)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRACT §2 "00752" (artifacts/pieces-building-room-2026-10-08/build/
-- CONTRACT.md); direction.md D10 and Q12.
--
-- CREATE OR REPLACE base: place_product_in_project_v2 00447:190 (the newest
-- body; nothing after 00447 redefines it). Full copy plus the change below.
-- Adds GRANT/REVOKE → regenerate supabase/seed/00-legacy-grants.sql (the W5
-- reset owner, T-49, does it; CONTRACT §4).
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- project_ffe_allowance_fills
--   Append-only. One row per allowance filled after the client signed: the
--   line, the frozen authorization row it is bound to, that row's ceiling
--   (client_line_total_cents), what the fill came to (quantity ×
--   unit_price_cents), the variance (ceiling − filled, 0 or more), who and
--   when.
--
-- place_product_in_project_v2 (rewritten, 00447:190)
--   Inside the fill guard (00447:256-269), an `allowance` placeholder bound to
--   a signed authorization (its source_authorization_item_id on an executed
--   document whose proposal is `executed`, the frozen row an allowance too)
--   may now be filled, when the request keeps it an allowance, it is on no
--   PO, and it sits on no draft or sent authorization.
--     • quantity × unit_price_cents at or under the frozen
--       client_line_total_cents: the fill lands, one allowance-fill row is
--       recorded, the line stays an allowance with its signed budget, and the
--       authorization is untouched (never voided, never re-signed).
--     • over it: refused, 'Over the allowance. This goes through Record a
--       change.' (23514), and nothing is written.
--   An idempotent replay of a fill returns the stored receipt and records no
--   second row. Fixed and tbd lines, and every other bound placeholder, are
--   refused exactly as before.
--
-- ── ACCESS ──────────────────────────────────────────────────────────────────
-- project_ffe_allowance_fills: SELECT TO authenticated when
-- can_buy_for_project (00702:60) holds for the line's project. No client
-- policy. INSERT, UPDATE and DELETE are revoked from every API role; the only
-- writer is place_product_in_project_v2 (SECURITY DEFINER).
-- place_product_in_project_v2 keeps its ACL: EXECUTE to authenticated only.
--
-- Idempotent: CREATE TABLE / INDEX IF NOT EXISTS, DROP POLICY IF EXISTS,
-- CREATE OR REPLACE FUNCTION.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. project_ffe_allowance_fills ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_ffe_allowance_fills (
  id                    uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  ffe_item_id           uuid        NOT NULL REFERENCES public.project_ffe_items(id) ON DELETE CASCADE,
  authorization_item_id uuid        NOT NULL REFERENCES public.furnishing_authorization_items(id) ON DELETE CASCADE,
  ceiling_cents         integer     NOT NULL CHECK (ceiling_cents > 0),
  filled_cents          integer     NOT NULL CHECK (filled_cents >= 0 AND filled_cents <= ceiling_cents),
  variance_cents        integer     NOT NULL,
  filled_by             uuid        NOT NULL REFERENCES public.profiles(id),
  filled_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_ffe_allowance_fills_variance_check
    CHECK (variance_cents = ceiling_cents - filled_cents)
);

CREATE INDEX IF NOT EXISTS idx_project_ffe_allowance_fills_item
  ON public.project_ffe_allowance_fills (ffe_item_id, filled_at);
CREATE INDEX IF NOT EXISTS idx_project_ffe_allowance_fills_authorization_item
  ON public.project_ffe_allowance_fills (authorization_item_id);

COMMENT ON TABLE public.project_ffe_allowance_fills IS
  'Append-only: an allowance filled after the client signed, at or under its ceiling (00752, D10, Q12). '
  'ceiling_cents is the frozen authorization row''s client_line_total_cents; filled_cents is the line''s '
  'quantity x unit_price_cents after the fill; variance_cents = ceiling - filled. '
  'Read: can_buy_for_project. Written only through place_product_in_project_v2.';

ALTER TABLE public.project_ffe_allowance_fills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_ffe_allowance_fills_studio_select ON public.project_ffe_allowance_fills;
CREATE POLICY project_ffe_allowance_fills_studio_select ON public.project_ffe_allowance_fills
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.project_ffe_items item
    WHERE item.id = project_ffe_allowance_fills.ffe_item_id
      AND public.can_buy_for_project(item.project_id)
  ));

REVOKE ALL ON TABLE public.project_ffe_allowance_fills FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.project_ffe_allowance_fills TO authenticated, service_role;

-- ─── 2. place_product_in_project_v2 (base 00447:190) ────────────────────────

CREATE OR REPLACE FUNCTION public.place_product_in_project_v2(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_request jsonb := p_request;
  v_item_type text := COALESCE(NULLIF(p_request->>'itemType', ''),
    CASE WHEN NULLIF(p_request->>'productId', '') IS NULL THEN 'tbd' ELSE 'fixed' END);
  v_role text := COALESCE(NULLIF(btrim(p_request->>'roleConfigurationIdentity'), ''),
    NULLIF(btrim(p_request->>'roleIdentity'), ''), 'default');
  v_reference_id uuid := CASE WHEN p_request->>'selectionReferenceId' ~* '^[0-9a-f-]{36}$'
    THEN (p_request->>'selectionReferenceId')::uuid END;
  v_placeholder_id uuid := CASE WHEN p_request->>'placeholderSelectionId' ~* '^[0-9a-f-]{36}$'
    THEN (p_request->>'placeholderSelectionId')::uuid END;
  v_configuration_id uuid := CASE WHEN p_request->>'configurationId' ~* '^[0-9a-f-]{36}$'
    THEN (p_request->>'configurationId')::uuid END;
  v_existing public.project_ffe_items%ROWTYPE;
  v_existing_configuration uuid;
  v_result jsonb;
  -- 00752 (D10): the signed allowance this fill resolves, if any.
  v_snapshot public.furnishing_authorization_items%ROWTYPE;
  v_allowance_fill boolean := false;
  v_filled public.project_ffe_items%ROWTYPE;
  v_filled_cents bigint;
BEGIN
  IF NULLIF(p_request->>'quantity', '') IS NOT NULL AND (
    p_request->>'quantity' !~ '^[1-9][0-9]{0,9}$'
    OR (p_request->>'quantity')::numeric > 2147483647
  ) THEN
    RAISE EXCEPTION 'quantity must be a positive 32-bit integer'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NULLIF(p_request->>'budgetMinCents', '') IS NOT NULL AND (
    p_request->>'budgetMinCents' !~ '^[0-9]{1,10}$'
    OR (p_request->>'budgetMinCents')::numeric > 2147483647
  ) OR NULLIF(p_request->>'budgetMaxCents', '') IS NOT NULL AND (
    p_request->>'budgetMaxCents' !~ '^[0-9]{1,10}$'
    OR (p_request->>'budgetMaxCents')::numeric > 2147483647
  ) THEN
    RAISE EXCEPTION 'allowance cents must be 32-bit nonnegative integers'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_item_type NOT IN ('fixed', 'allowance', 'tbd') THEN
    RAISE EXCEPTION 'itemType must be fixed, allowance, or tbd'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NULLIF(p_request->>'productId', '') IS NULL
     AND NULLIF(btrim(p_request->>'name'), '') IS NULL THEN
    RAISE EXCEPTION 'manual selections and placeholders require a name'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_item_type = 'allowance' AND COALESCE(p_request->>'budgetMaxCents', '') !~ '^[1-9][0-9]{0,9}$' THEN
    RAISE EXCEPTION 'allowance selections require a positive budgetMaxCents'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_reference_id IS NOT NULL OR v_placeholder_id IS NOT NULL THEN
    SELECT item.*
    INTO v_existing
    FROM public.project_ffe_items item
    WHERE item.id = COALESCE(v_reference_id, v_placeholder_id)
    FOR UPDATE OF item;
    SELECT configuration_id INTO v_existing_configuration
    FROM public.project_ffe_specs WHERE ffe_item_id = v_existing.id;
    IF NOT FOUND OR v_existing.role_identity IS DISTINCT FROM v_role
       OR (v_reference_id IS NOT NULL AND v_existing_configuration IS DISTINCT FROM v_configuration_id)
       OR (v_reference_id IS NOT NULL AND v_existing.item_type IS DISTINCT FROM v_item_type)
    THEN
      RAISE EXCEPTION 'selection reference does not match role, configuration, or item type'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    -- 00752 (D10, Q12): an allowance bound to a signed authorization may be
    -- filled. The frozen row is the line's own provenance (set at execution,
    -- immutable after), on an executed document whose proposal is executed.
    -- The request must keep the line an allowance; a PO or a live draft/sent
    -- authorization still refuses below.
    IF v_placeholder_id IS NOT NULL
       AND v_existing.item_type = 'allowance' AND v_item_type = 'allowance'
       AND v_existing.purchase_order_id IS NULL
       AND v_existing.source_authorization_item_id IS NOT NULL
    THEN
      SELECT line.* INTO v_snapshot
      FROM public.furnishing_authorization_items line
      JOIN public.project_commercial_documents document ON document.id = line.commercial_document_id
      JOIN public.proposals proposal ON proposal.id = document.proposal_id
      WHERE line.id = v_existing.source_authorization_item_id
        AND document.id = v_existing.source_commercial_document_id
        AND document.executed_at IS NOT NULL
        AND proposal.commercial_state = 'executed'
        AND line.item_type = 'allowance';
      v_allowance_fill := v_snapshot.id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.furnishing_authorization_items line
        JOIN public.project_commercial_documents document ON document.id = line.commercial_document_id
        JOIN public.proposals proposal ON proposal.id = document.proposal_id
        WHERE line.source_ffe_item_id = v_existing.id
          AND proposal.commercial_state IN ('draft', 'sent')
      );
    END IF;
    IF v_placeholder_id IS NOT NULL AND NOT v_allowance_fill AND (
      v_existing.purchase_order_id IS NOT NULL
      OR v_existing.source_commercial_document_id IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.furnishing_authorization_items line
        JOIN public.project_commercial_documents document ON document.id = line.commercial_document_id
        JOIN public.proposals proposal ON proposal.id = document.proposal_id
        WHERE line.source_ffe_item_id = v_existing.id
          AND proposal.commercial_state IN ('draft', 'sent', 'executed')
      )
    ) THEN
      RAISE EXCEPTION 'authorized or ordered placeholders cannot be filled in place'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_request := v_request || jsonb_build_object('roleIdentity', v_role);
  v_result := public._place_product_in_project_v2_00444_impl(v_request);

  -- 00752 (D10, Q12): the fill is measured against the signed ceiling. Over
  -- it, the whole fill rolls back. A replay (the line already held a product
  -- before this call) records nothing.
  IF v_allowance_fill AND v_result->>'outcome' = 'filled' AND v_existing.product_id IS NULL THEN
    SELECT * INTO v_filled FROM public.project_ffe_items
    WHERE id = (v_result->>'selectionId')::uuid;
    v_filled_cents := v_filled.quantity::bigint * COALESCE(v_filled.unit_price_cents, 0)::bigint;
    IF v_filled_cents > v_snapshot.client_line_total_cents THEN
      RAISE EXCEPTION 'Over the allowance. This goes through Record a change.'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.project_ffe_allowance_fills (
      ffe_item_id, authorization_item_id, ceiling_cents, filled_cents, variance_cents, filled_by
    ) VALUES (
      v_filled.id, v_snapshot.id, v_snapshot.client_line_total_cents,
      v_filled_cents::integer,
      (v_snapshot.client_line_total_cents - v_filled_cents)::integer,
      auth.uid()
    );
  END IF;

  IF v_result->>'outcome' IN ('created', 'filled') THEN
    PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
    -- 00752: a signed allowance keeps the budget the client signed.
    UPDATE public.project_ffe_items
    SET item_type = v_item_type,
        budget_min_cents = CASE WHEN v_allowance_fill THEN budget_min_cents
          WHEN v_item_type = 'allowance'
          THEN COALESCE(NULLIF(p_request->>'budgetMinCents', '')::integer, 0)
          ELSE budget_min_cents END,
        budget_max_cents = CASE WHEN v_allowance_fill THEN budget_max_cents
          WHEN v_item_type = 'allowance'
          THEN (p_request->>'budgetMaxCents')::integer
          ELSE budget_max_cents END,
        updated_at = now()
    WHERE id = (v_result->>'selectionId')::uuid;
  ELSE
    SELECT * INTO v_existing FROM public.project_ffe_items
    WHERE id = (v_result->>'selectionId')::uuid;
  END IF;
  RETURN (v_result - 'roleIdentity') || jsonb_build_object(
    'itemType', CASE WHEN v_result->>'outcome' = 'reused' THEN v_existing.item_type ELSE v_item_type END,
    'roleConfigurationIdentity', v_role
  );
END;
$$;

COMMENT ON FUNCTION public.place_product_in_project_v2(jsonb) IS
  'Places a product, need, or allowance on a project schedule (00447 base). 00752 (D10, Q12): an allowance '
  'placeholder bound to a signed authorization fills at or under its frozen ceiling and records '
  'project_ffe_allowance_fills; over it, refuses "Over the allowance. This goes through Record a change." '
  'Fixed lines and every other bound placeholder are refused as before.';

REVOKE ALL ON FUNCTION public.place_product_in_project_v2(jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.place_product_in_project_v2(jsonb) TO authenticated;
